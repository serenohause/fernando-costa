-- Corrige a descoberta do projeto em generate_contract_installments.
--
-- O QUE ESTAVA ERRADO
--   A 0044 resolvia "o contrato tem exatamente um projeto?" em uma passada:
--
--     select count(*), min(p.id) into v_project_count, v_project_id ...
--
--   min(uuid) NAO EXISTE no Postgres (uuid nao tem operador de ordem agregavel
--   por min/max). A funcao levantava
--   "function min(uuid) does not exist" em TODA chamada que chegasse ate ali,
--   ou seja, em toda geracao de parcela valida.
--
-- COMO APARECEU
--   supabase/tests/installments.sql, na primeira execucao: 31 dos 41 casos
--   caindo, e os que passavam eram todos os de NEGACAO - not_authorized,
--   contract_not_found, installment_plan_missing, installment_value_too_small -
--   porque esses erros sao levantados antes da consulta do projeto. Os quatro
--   casos de CONTROLE ("bandeira levantada", "12 parcelas", "soma exata") sao os
--   que acusaram.
--
--   Vale registrar: uma suite so de casos negativos teria passado 100% com a
--   funcao inteiramente quebrada. E a razao de todo caso de negacao deste
--   projeto ter um controle ao lado (mesma licao da migration 0036).
--
-- POR QUE MIGRATION NOVA
--   A 0044 ja estava aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md): o arquivo passaria a dizer uma coisa e o banco a ter
--   outra, e a proxima maquina a aplicar do zero pegaria um schema diferente do
--   que esta em producao.
--
-- O QUE MUDA
--   Apenas o trecho da descoberta do projeto: a contagem e a busca do id viram
--   duas consultas, e o id so e buscado quando a contagem e exatamente 1. Todo o
--   resto da funcao - divisao em centavos, resto na primeira parcela,
--   periodicidade, bandeira na mesma transacao, autorizacao por dentro - e
--   identico ao da 0044, e a funcao inteira e repetida aqui porque
--   `create or replace function` substitui o corpo todo.

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
