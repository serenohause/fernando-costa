-- Bonificacao: o contrato entregue sem cobranca passa a poder gerar parcela.
--
-- O PEDIDO
--   O escritorio aprovou o contrato 0730 com valor total R$ 0,00 e nao conseguiu
--   gerar parcelas. Pediu um "checkbox de bonificacao para quando for parcela
--   zerada" no dialogo Gerar Parcelas.
--
--   O relato veio como bug, e metade dele era: a tela dizia "avise o suporte"
--   em vez do motivo real (corrigido em codigo, ver tests/db-errors.mjs). A
--   outra metade nao era bug — o banco recusava de proposito, em DOIS lugares,
--   e esta migration abre a excecao onde ela faz sentido.
--
-- OS DOIS LUGARES QUE RECUSAVAM
--   1. `generate_contract_installments` levanta `total_value_not_positive`
--      quando o total nao e maior que zero (0044).
--   2. `accounts_receivable_value_positive_check` exige `value > 0`, com uma
--      unica excecao ate hoje: linha importada do base44 (0063).
--
--   Nenhum dos dois estava errado. "Parcela de zero real nao e cobranca e entra
--   na soma da carteira como se fosse" continua verdade — o que faltava era
--   dizer QUANDO o zero e deliberado.
--
-- POR QUE UMA COLUNA, E NAO SO UM PARAMETRO DA FUNCAO
--   Sem a coluna, a excecao teria de ser "zero e permitido quando o contrato vale
--   zero" — uma regra que o check nao consegue enxergar (ele nao alcanca o
--   contrato) e que abriria zero para qualquer linha ligada aquele contrato,
--   inclusive as digitadas a mao depois. A coluna faz a intencao viajar COM A
--   LINHA: esta parcela e zero porque alguem marcou bonificacao, e nao porque
--   alguem esqueceu de preencher o valor.
--
-- NUMERACAO
--   Esta e a 0095 e entra numa producao que ainda esta na 0092: as 0093 e 0094
--   (quadro configuravel) vivem so em dev ate o usuario pedir. A lacuna e
--   deliberada e some quando aquelas subirem. Esta migration nao depende de
--   nenhuma das duas — mexe em accounts_receivable e na funcao de parcelas.

-- 1. A coluna --------------------------------------------------------------------

alter table public.accounts_receivable
  add column is_complimentary boolean not null default false;

comment on column public.accounts_receivable.is_complimentary is
  'Bonificacao: servico entregue sem cobranca. E a unica forma de uma parcela NAO importada valer zero (ver accounts_receivable_value_positive_check). Marcada na geracao das parcelas, quando o contrato tem valor total zero. Nao e desconto: desconto muda o valor cobrado, bonificacao diz que nao ha cobranca.';

/*
  BONIFICACAO E EXATAMENTE ZERO, e nao "ate zero".

  Meia bonificacao e desconto, e desconto ja tem lugar: e o `total_value` do
  contrato, menor. Deixar `>= 0` aqui criaria duas formas de dizer a mesma coisa
  — uma parcela de R$ 500 marcada como bonificacao — e ninguem saberia qual das
  duas a carteira deve acreditar.
*/
alter table public.accounts_receivable
  add constraint accounts_receivable_complimentary_is_zero_check
  check (is_complimentary = false or value = 0);

comment on constraint accounts_receivable_complimentary_is_zero_check on public.accounts_receivable is
  'Parcela marcada como bonificacao vale exatamente zero. Bonificacao e ausencia de cobranca; valor menor com cobranca e DESCONTO, e desconto se faz no total_value do contrato. Sem este check haveria duas formas de representar o mesmo fato.';

-- 2. O zero deixa de ser exclusividade da importacao ------------------------------
--
--    A excecao da 0063 continua palavra por palavra: 4 parcelas do base44 foram
--    lancadas com valor zero e a linha importada carrega essa excecao para
--    sempre. O que entra e uma SEGUNDA excecao, igualmente estreita.

alter table public.accounts_receivable
  drop constraint accounts_receivable_value_positive_check;

alter table public.accounts_receivable
  add constraint accounts_receivable_value_positive_check
  check (
    value > 0
    or (legacy_id is not null and value >= 0)
    or (is_complimentary and value = 0)
  );

comment on constraint accounts_receivable_value_positive_check on public.accounts_receivable is
  'Dinheiro > 0, e nao >= 0: parcela de zero real nao e cobranca e entra na soma da carteira como se fosse. DUAS excecoes, ambas estreitas e ambas deliberadas: linha importada do base44 (0063), que aceita zero porque 4 parcelas de la vieram assim; e parcela de BONIFICACAO (0095), em que o zero e a propria informacao. Negativo nunca, em nenhum dos tres casos.';

comment on column public.accounts_receivable.value is
  'Valor da parcela em reais. numeric(14,2), nunca float: dinheiro somado em ponto flutuante desloca centavo no total da carteira. A soma das parcelas geradas de um contrato e EXATAMENTE contracts.total_value - a divisao acontece em centavos inteiros e o resto vai na primeira parcela (ver 0044). Zero so e aceito em linha importada do base44 (0063) ou em parcela de bonificacao (0095); negativo nunca.';

-- 3. A funcao ----------------------------------------------------------------------
--
--    DROP e nao `create or replace`: acrescentar parametro cria OUTRA funcao, e
--    as duas conviveriam — a chamada de um argumento so passaria a depender de
--    qual delas o Postgres escolhesse. Mesmo motivo do drop na 0094.

drop function if exists public.generate_contract_installments(uuid);

/*
  O CORPO ABAIXO E O DA FUNCAO QUE ESTA NO AR, com quatro mudancas cirurgicas e
  nada mais: o parametro, a regra de valor em duas metades, o status/descricao da
  linha de bonificacao e a guarda de parcela pequena demais, que deixa de valer
  quando o total e zero de proposito.

  Foi montado a partir de `pg_get_functiondef` do banco, e nao reescrito de
  memoria — o primeiro rascunho desta migration perdeu o `for update` que
  serializa duas chamadas simultaneas, trocou o quinzenal de 15 para 14 dias e
  desfez a correcao da 0045 na descoberta do projeto. Nenhuma das tres apareceria
  em teste de tela.
*/
create or replace function public.generate_contract_installments(
  p_contract_id uuid,
  /*
    Falso por padrao, e o padrao importa: bonificacao e sempre um gesto
    EXPLICITO de quem esta na tela, nunca o que acontece quando ninguem decidiu
    nada. A chamada antiga so deixou de existir junto com a funcao antiga (drop
    acima), mas a regra que ela aplicava continua sendo a deste ramo.
  */
  p_complimentary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
  v_contract public.contracts;
  v_project_id uuid;
  v_project_count integer;
  v_count smallint;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder_cents bigint;
  v_cents bigint;
  v_due date;
  v_first_value numeric(14, 2);
  v_status public.financial_status;
  i integer;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Autorizacao ANTES de qualquer leitura de contrato: quem nao pode gerar
  -- parcela tambem nao precisa descobrir, pela mensagem de erro, se um
  -- determinado id de contrato existe.
  if not public.can_edit_menu('receivables') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- tenant_id explicito porque SECURITY DEFINER nao passa pela RLS de contracts.
  -- FOR UPDATE serializa duas chamadas simultaneas para o mesmo contrato.
  select * into v_contract
  from public.contracts
  where id = p_contract_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;

  if v_contract.installment_count is null
     or v_contract.first_due_date is null
     or v_contract.installment_frequency is null then
    raise exception 'installment_plan_missing' using errcode = 'P0001';
  end if;

  /*
    AS DUAS METADES DA MESMA REGRA.

    Sem bonificacao, nada muda desde a 0044: o total tem de ser positivo.

    COM bonificacao, o total tem de ser exatamente zero — e esta segunda metade
    e a que impede o estrago maior. Marcar bonificacao num contrato de R$ 84.000
    geraria seis parcelas de zero e apagaria a cobranca inteira em silencio, com
    a bandeira installments_generated ligada para nao deixar tentar de novo. E um
    clique errado num checkbox.
  */
  if p_complimentary then
    if v_contract.total_value <> 0 then
      raise exception 'complimentary_requires_zero_total' using errcode = 'P0001';
    end if;
  elsif v_contract.total_value <= 0 then
    raise exception 'total_value_not_positive' using errcode = 'P0001';
  end if;

  v_count := v_contract.installment_count;

  -- total_value e numeric(14,2): a multiplicacao por 100 e exata, e o round so
  -- existe para tirar a escala. Nada aqui passa por ponto flutuante.
  v_total_cents := round(v_contract.total_value * 100)::bigint;
  v_base_cents := v_total_cents / v_count;
  v_remainder_cents := v_total_cents - (v_base_cents * v_count);

  -- Contrato pequeno demais para o parcelamento pedido: com base zero, as
  -- parcelas 2..n valeriam zero e cairiam no check value > 0 da 0041. Erro
  -- proprio, porque "23514" nao diz a ninguem o que fazer.
  -- NA BONIFICACAO A CONTA E ZERO DE PROPOSITO, entao esta guarda nao se aplica:
  -- ela existe para o contrato que TEM valor e nao cabe no numero de parcelas.
  if not p_complimentary and v_base_cents < 1 then
    raise exception 'installment_value_too_small' using errcode = 'P0001';
  end if;

  /*
    A PARCELA DE BONIFICACAO NASCE QUITADA, e esta e a decisao que mais afeta a
    tela financeira. Nao ha nada a receber: deixada em `forecast`, ela ficaria
    para sempre na lista de contas a receber e, passado o vencimento, no cartao
    de atraso — cobrando R$ 0,00 de alguem, todo mes. A data de pagamento e a de
    hoje porque e hoje que o escritorio esta declarando que nao vai cobrar.
  */
  v_status := case when p_complimentary then 'paid' else 'forecast' end;

  -- Projeto da parcela. No original vem de contract.project_id, que nao existe
  -- mais: a ligacao foi invertida no modulo 4 (projects e que aponta para
  -- contracts) e um contrato pode gerar mais de um projeto. Com exatamente um,
  -- o vinculo e obvio e a parcela o recebe; com zero ou mais de um nao ha
  -- escolha correta, e a coluna fica nula para a tela decidir.
  --
  -- DUAS consultas, e nao uma com min(p.id): min nao aceita uuid, e a versao da
  -- 0044 quebrava toda geracao valida por causa disso.
  select count(*) into v_project_count
  from public.projects p
  where p.contract_id = v_contract.id
    and p.tenant_id = v_contract.tenant_id;

  if v_project_count = 1 then
    select p.id into v_project_id
    from public.projects p
    where p.contract_id = v_contract.id
      and p.tenant_id = v_contract.tenant_id;
  else
    v_project_id := null;
  end if;

  -- O bloco protegido cobre OS DOIS efeitos - as parcelas e a bandeira. Se ele
  -- cobrisse so o INSERT, o rollback do handler desfaria as parcelas e deixaria
  -- a bandeira de pe, que e exatamente o estado que o original produz.
  begin
    for i in 1..v_count loop
      -- A periodicidade e a de Contracts.jsx:681-691. addMonths do date-fns e
      -- `date + interval 'n months'` do Postgres tratam fim de mes igual:
      -- 31/01 + 1 mes = 28/02.
      v_due := case v_contract.installment_frequency
                 when 'monthly'  then v_contract.first_due_date + make_interval(months => i - 1)
                 when 'biweekly' then v_contract.first_due_date + make_interval(days => (i - 1) * 15)
                 when 'weekly'   then v_contract.first_due_date + make_interval(days => (i - 1) * 7)
                 when 'single'   then v_contract.first_due_date
               end;

      v_cents := case when i = 1 then v_base_cents + v_remainder_cents else v_base_cents end;

      if i = 1 then
        v_first_value := v_cents::numeric / 100;
      end if;

      insert into public.accounts_receivable (
        tenant_id, client_id, contract_id, project_id,
        description, installment_number, installment_total,
        value, due_date, issue_date, status, payment_date, is_complimentary
      ) values (
        v_contract.tenant_id, v_contract.client_id, v_contract.id, v_project_id,
        -- A DESCRICAO DIZ O QUE A LINHA E, porque e ela que aparece na lista de
        -- recebiveis: "Parcela 1/1 - 0730" de R$ 0,00 nao explica nada.
        case when p_complimentary then 'Bonificação ' else 'Parcela ' end
          || i || '/' || v_count || ' - ' || v_contract.contract_number,
        i, v_count,
        v_cents::numeric / 100, v_due, current_date, v_status,
        case when p_complimentary then current_date end,
        p_complimentary
      );
    end loop;

    update public.contracts
    set installments_generated = true
    where id = v_contract.id;
  exception when unique_violation then
    -- A protecao contra duplicata, vinda do indice e nao de consulta previa.
    -- Tudo o que este bloco fez ate aqui - parcelas E bandeira - e desfeito.
    raise exception 'installments_already_generated' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'contractId', v_contract.id,
    'installmentCount', v_count,
    'totalValue', v_contract.total_value,
    'firstInstallmentValue', v_first_value,
    'otherInstallmentValue', (v_base_cents::numeric / 100),
    'projectId', v_project_id,
    'complimentary', p_complimentary
  );
end;
$BODY$;


comment on function public.generate_contract_installments(uuid, boolean) is
  'Gera as parcelas de um contrato numa transacao so, com a soma EXATAMENTE igual ao total (centavos inteiros, resto na primeira parcela) e a bandeira installments_generated no mesmo commit. SECURITY DEFINER que confere can_edit_menu(receivables) por dentro. p_complimentary (0095) e o gesto de BONIFICACAO: exige total exatamente zero, marca as linhas com is_complimentary e as cria ja quitadas, porque parcela de zero real deixada em aberto viraria cobranca eterna de R$ 0,00 na lista de atrasados.';

revoke all on function public.generate_contract_installments(uuid, boolean) from public, anon;
grant execute on function public.generate_contract_installments(uuid, boolean) to authenticated;
