-- Modulo 7 (Financeiro) - geracao das parcelas do contrato, em uma transacao.
--
-- Porta generateInstallments de projeto-original/src/pages/Contracts.jsx:651-715,
-- e corrige os TRES defeitos daquele codigo. Cada um esta explicado abaixo,
-- junto com o caso de teste que cai se a correcao for desfeita
-- (supabase/tests/installments.sql).
--
-- DEFEITO 1 - A SOMA DAS PARCELAS NAO E O VALOR DO CONTRATO
--   Contracts.jsx:679: `const installmentValue = contract.total_value / numParcelas`
--   e o mesmo numero em todas as parcelas.
--
--     R$ 128.000,00 em 12  ->  10.666,67 x 12  =  128.000,04  (+4 centavos)
--     R$ 470.000,00 em  6  ->  78.333,33 x  6  =  469.999,98  (-2 centavos)
--
--   Sao centavos, e e o tipo de diferenca que aparece na conciliacao bancaria e
--   ninguem sabe de onde veio - a carteira nao fecha com o contrato assinado.
--
--   Aqui a divisao acontece em CENTAVOS INTEIROS e o resto vai na PRIMEIRA
--   parcela. Primeira e nao ultima porque a ultima costuma ser a que o cliente
--   confere contra o contrato, e porque cobrar o resto no comeco e o que
--   qualquer sistema de cobranca faz.
--
--     12.800.000 centavos / 12 = 1.066.666, resto 8
--     parcela 1  = 1.066.674 = R$ 10.666,74
--     parcelas 2..12 = 1.066.666 = R$ 10.666,66
--     soma = 12.800.000 centavos = R$ 128.000,00, exato
--
--   ATENCAO A QUEM COMPARAR COM A DOC: docs/SCHEMA-PLAN.md descreve o algoritmo
--   certo ("dividir em centavos inteiros e jogar o resto na primeira") mas ilustra
--   com numeros que nao fecham - "uma parcela de 10.666,71 e onze de 10.666,67"
--   soma R$ 128.000,08. Os numeros corretos para esse algoritmo sao os de cima. O
--   que vale, e o que o teste afirma, e a soma exata.
--
-- DEFEITO 2 - A BANDEIRA E A CRIACAO SAO DUAS REQUISICOES
--   Contracts.jsx:709-710: `bulkCreate(installments)` e depois
--   `Contract.update({ installments_generated: true })`. Falha entre as duas
--   deixa parcelas criadas com a bandeira apagada, e o proximo clique cria tudo
--   de novo. Aqui as duas coisas sao a mesma transacao, porque sao a mesma
--   funcao.
--
-- DEFEITO 3 - A PROTECAO E UMA CONSULTA PREVIA
--   Contracts.jsx:655 lista os recebiveis do contrato antes de gravar. Consultar
--   e-depois-gravar nao impede nada: dois cliques rapidos, ou duas abas, passam
--   os dois pelo teste e gravam os dois. A protecao real e a unicidade
--   (tenant_id, contract_id, installment_number) da 0041 - o segundo INSERT
--   recebe 23505 do indice, e a funcao o traduz para
--   installments_already_generated. Nao ha consulta previa aqui, de proposito.
--
-- POR QUE SECURITY DEFINER, E POR QUE A AUTORIZACAO E CONFERIDA POR DENTRO
--   A funcao precisa levantar contracts.installments_generated, e quem gera
--   parcela tem o menu 'receivables' e nao necessariamente 'contracts' - pela
--   policy da 0030 o UPDATE seria recusado. SECURITY DEFINER resolve isso e, ao
--   resolver, passa por cima de TODA a RLS: por isso a autorizacao e conferida
--   aqui dentro (can_edit_menu('receivables')) e o contrato e buscado com
--   tenant_id = auth_tenant_id() explicito. Uma funcao SECURITY DEFINER que
--   confia em quem a chama e uma escalacao de privilegio esperando um bug do
--   lado de fora - mesmo desenho de approve_access_request (0013).
--
--   FOR UPDATE no contrato serializa duas chamadas simultaneas, como na 0013.
--   Ele NAO e a protecao contra duplicata (a unicidade e), e por isso a funcao
--   nao le installments_generated para decidir: bandeira e informacao de tela,
--   nao trava.
--
-- O QUE A FUNCAO NAO FAZ, e e decisao registrada
--   Nao aceita quantidade/data/periodicidade por parametro. O plano de
--   parcelamento vem do contrato, onde a 0029 ja garante que os tres campos
--   estao preenchidos ou nenhum esta. No original o dialogo permite gerar com
--   uma data que nunca chega a ser gravada no contrato, e o contrato passa a
--   descrever um parcelamento diferente do que foi emitido. A tela do modulo 7
--   grava o plano no contrato e depois chama esta funcao.

create or replace function public.generate_contract_installments(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  if v_contract.total_value <= 0 then
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
  if v_base_cents < 1 then
    raise exception 'installment_value_too_small' using errcode = 'P0001';
  end if;

  -- Projeto da parcela. No original vem de contract.project_id, que nao existe
  -- mais: a ligacao foi invertida no modulo 4 (projects e que aponta para
  -- contracts) e um contrato pode gerar mais de um projeto. Com exatamente um,
  -- o vinculo e obvio e a parcela o recebe; com zero ou mais de um nao ha
  -- escolha correta, e a coluna fica nula para a tela decidir.
  select count(*), min(p.id) into v_project_count, v_project_id
  from public.projects p
  where p.contract_id = v_contract.id
    and p.tenant_id = v_contract.tenant_id;

  if v_project_count <> 1 then
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
        value, due_date, issue_date, status
      ) values (
        v_contract.tenant_id, v_contract.client_id, v_contract.id, v_project_id,
        'Parcela ' || i || '/' || v_count || ' - ' || v_contract.contract_number,
        i, v_count,
        v_cents::numeric / 100, v_due, current_date, 'forecast'
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
    'projectId', v_project_id
  );
end;
$$;

comment on function public.generate_contract_installments(uuid) is
  'Gera as parcelas a receber de um contrato, em UMA transacao: divide o valor total em centavos inteiros com o resto na PRIMEIRA parcela (a soma e exatamente contracts.total_value, o que a divisao simples de Contracts.jsx:679 nao consegue), calcula os vencimentos pela periodicidade do contrato (monthly/biweekly/weekly/single, regra de Contracts.jsx:681-691) e levanta contracts.installments_generated. Duplicidade e barrada pela unicidade (tenant_id, contract_id, installment_number) da 0041, e nao por consulta previa - a segunda chamada recebe installments_already_generated e nao grava nada. SECURITY DEFINER porque precisa escrever em contracts, cujo menu e outro; por isso confere can_edit_menu(receivables) e o tenant do JWT POR DENTRO, como approve_access_request (0013). Erros de negocio saem como P0001 com mensagem estavel: not_authorized, contract_not_found, installment_plan_missing, total_value_not_positive, installment_value_too_small, installments_already_generated.';

-- anon NAO executa: nenhuma tela publica gera parcela. service_role tambem nao
-- ganha nada de util aqui - a funcao le o tenant do JWT, e chamada sem sessao
-- autenticada morre em not_authorized. Fica de fora para nao sugerir um caminho
-- de servidor que nao existe.
revoke all on function public.generate_contract_installments(uuid) from public, anon;
grant execute on function public.generate_contract_installments(uuid) to authenticated;
