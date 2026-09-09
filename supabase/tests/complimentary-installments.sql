-- Bonificacao: a parcela de zero real que e deliberada, e so ela.
--
-- O QUE ELE PROVA
--   A migration 0095 abriu uma excecao numa regra de DINHEIRO — "parcela vale
--   mais que zero" —, e regra de dinheiro afrouxada por engano nao da erro: da
--   cobranca que some. Os casos abaixo cercam a excecao pelos dois lados.
--
--   O caso que mais importa e o 2.3: marcar bonificacao num contrato COM valor
--   tem de ser recusado. Se passasse, um clique errado no checkbox geraria as
--   parcelas todas valendo zero, com a bandeira installments_generated ligada
--   para nao deixar tentar de novo — a cobranca inteira do contrato apagada, em
--   silencio, por um checkbox.
--
-- COMO RODAR
--   npm run test:complimentary
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenant proprio (slug bonif-a).

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))
$$;

/* Chama a funcao COMO o usuario indicado e devolve o resumo, ou o SQLSTATE e a
   mensagem quando o banco recusa — nos erros P0001 a mensagem E o codigo. */
create or replace function pg_temp.gera(p_sub uuid, p_tenant uuid, p_contract uuid, p_bonif boolean)
returns text language plpgsql as $$
declare v jsonb; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    v := public.generate_contract_installments(p_contract, p_bonif);
    perform set_config('role', 'postgres', true);
    return 'OK:' || (v->>'installmentCount') || ':' || (v->>'complimentary');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return case when st = 'P0001' then msg else 'ERR:' || st end;
  end;
end; $$;

-- Fixtures -----------------------------------------------------------------------

create temp table ids on commit drop as select
  'd0000000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'd0000000-0000-4000-8000-00000000001a'::uuid as user_dir_a,
  'd0000000-0000-4000-8000-00000000002a'::uuid as col_dir_a,
  'd0000000-0000-4000-8000-00000000003a'::uuid as cliente_a,
  'd0000000-0000-4000-8000-00000000004a'::uuid as contrato_zero,
  'd0000000-0000-4000-8000-00000000005a'::uuid as contrato_pago,
  'd0000000-0000-4000-8000-00000000006a'::uuid as contrato_zero2;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ((select user_dir_a from ids), '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'bonif-dir@example.test', now(), now());

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Bonificação A', 'bonif-a');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_dir_a from ids), (select tenant_a from ids), (select user_dir_a from ids),
   'Diretora A', 'dir@bonif-a.test', 'director', 'administrative', 'active');

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cliente_a from ids), (select tenant_a from ids), 'Cliente Bonificado',
   '(62) 90000-0001', 'Goiânia', 'GO');

/* O contrato do relato: aprovado, valor zero, plano de uma parcela unica. */
insert into public.contracts
  (id, tenant_id, client_id, contract_number, contract_type, total_value, status,
   installment_count, first_due_date, installment_frequency)
values
  ((select contrato_zero from ids), (select tenant_a from ids), (select cliente_a from ids),
   'BON-0001', 'architecture', 0, 'approved', 1, current_date + 30, 'single'),
  ((select contrato_zero2 from ids), (select tenant_a from ids), (select cliente_a from ids),
   'BON-0003', 'architecture', 0, 'approved', 1, current_date + 30, 'single'),
  /* O contrato COM valor, que existe para o caso 2.3 e para os controles. */
  ((select contrato_pago from ids), (select tenant_a from ids), (select cliente_a from ids),
   'BON-0002', 'architecture', 84000, 'approved', 6, current_date + 30, 'monthly');

-- 1. O gesto que o escritorio pediu ------------------------------------------------

select pg_temp.rec('1.1', 'contrato de valor zero SEM bonificação continua recusado',
  'total_value_not_positive',
  pg_temp.gera((select user_dir_a from ids), (select tenant_a from ids),
               (select contrato_zero from ids), false));

select pg_temp.rec('1.2', 'com bonificação, gera', 'OK:1:true',
  pg_temp.gera((select user_dir_a from ids), (select tenant_a from ids),
               (select contrato_zero from ids), true));

select pg_temp.rec('1.3', 'a parcela vale zero e está marcada', '0.00 / true',
  (select r.value::text || ' / ' || r.is_complimentary::text
   from public.accounts_receivable r
   where r.contract_id = (select contrato_zero from ids)));

/*
  NASCE QUITADA, e este caso e a razao de a decisao existir: deixada em
  `forecast`, a parcela ficaria para sempre na lista de contas a receber e, depois
  do vencimento, no cartao de atraso — cobrando R$ 0,00 todo mes.
*/
select pg_temp.rec('1.4', 'a parcela de bonificação nasce quitada', 'paid / hoje',
  (select r.status::text || ' / ' || case when r.payment_date = current_date then 'hoje' else coalesce(r.payment_date::text, '(nulo)') end
   from public.accounts_receivable r
   where r.contract_id = (select contrato_zero from ids)));

/* A descricao e o que a lista de recebiveis mostra: "Parcela 1/1" de R$ 0,00 nao
   explicaria nada a quem abrir a tela daqui a seis meses. */
select pg_temp.rec('1.5', 'a descrição diz que é bonificação', 'true',
  (select (r.description like 'Bonificação%')::text
   from public.accounts_receivable r
   where r.contract_id = (select contrato_zero from ids)));

select pg_temp.rec('1.6', 'e o contrato fica marcado como gerado', 'true',
  (select installments_generated::text from public.contracts
    where id = (select contrato_zero from ids)));

-- 2. Os limites da excecao ---------------------------------------------------------

select pg_temp.rec('2.1', 'CONTROLE: contrato com valor gera normalmente', 'OK:6:false',
  pg_temp.gera((select user_dir_a from ids), (select tenant_a from ids),
               (select contrato_pago from ids), false));

select pg_temp.rec('2.2', 'CONTROLE: e as parcelas dele não são bonificação', '0',
  (select count(*)::text from public.accounts_receivable
    where contract_id = (select contrato_pago from ids) and is_complimentary));

/*
  O CASO QUE MAIS IMPORTA. Um clique errado no checkbox, num contrato de
  R$ 84.000, geraria seis parcelas de zero e ligaria installments_generated —
  apagando a cobranca inteira sem erro nenhum e sem deixar tentar de novo.
*/
select pg_temp.rec('2.3', 'bonificação em contrato COM valor é recusada',
  'complimentary_requires_zero_total',
  pg_temp.gera((select user_dir_a from ids), (select tenant_a from ids),
               (select contrato_pago from ids), true));

select pg_temp.rec('2.4', 'e a recusa não deixa parcela nenhuma para trás', '6',
  (select count(*)::text from public.accounts_receivable
    where contract_id = (select contrato_pago from ids)));

/* Gerar duas vezes continua barrado, bonificação inclusive. */
select pg_temp.rec('2.5', 'bonificação não gera duas vezes', 'installments_already_generated',
  pg_temp.gera((select user_dir_a from ids), (select tenant_a from ids),
               (select contrato_zero from ids), true));

-- 3. A restricao de dinheiro, direto na tabela -------------------------------------
--
--    A funcao e um caminho; a tela de recebiveis e outro. O check e o que vale
--    para os dois, e por isso estes casos rodam por fora da funcao.

select pg_temp.rec('3.1', 'parcela zerada SEM a marca continua recusada', 'ERR:23514',
  (select case when x is null then 'sem erro' else x end from (
    select null::text as x
  ) t) );

do $$
declare st text;
begin
  begin
    insert into public.accounts_receivable (tenant_id, description, value, due_date)
    values ((select tenant_a from ids), 'Zero sem marca', 0, current_date);
    update res set observed = 'sem erro' where caso = '3.1';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    update res set observed = 'ERR:' || st where caso = '3.1';
  end;
end $$;

select pg_temp.rec('3.2', 'bonificação com valor MAIOR que zero é recusada', 'pendente', 'pendente');

do $$
declare st text;
begin
  begin
    insert into public.accounts_receivable (tenant_id, description, value, due_date, is_complimentary)
    values ((select tenant_a from ids), 'Bonificação de 500', 500, current_date, true);
    update res set expected = 'ERR:23514', observed = 'sem erro' where caso = '3.2';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    update res set expected = 'ERR:23514', observed = 'ERR:' || st where caso = '3.2';
  end;
end $$;

select pg_temp.rec('3.3', 'valor negativo é recusado mesmo com a marca', 'pendente', 'pendente');

do $$
declare st text;
begin
  begin
    insert into public.accounts_receivable (tenant_id, description, value, due_date, is_complimentary)
    values ((select tenant_a from ids), 'Bonificação negativa', -1, current_date, true);
    update res set expected = 'ERR:23514', observed = 'sem erro' where caso = '3.3';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    update res set expected = 'ERR:23514', observed = 'ERR:' || st where caso = '3.3';
  end;
end $$;

/* CONTROLE do controle: a linha zerada COM a marca entra. Sem este caso, os tres
   acima passariam com a tabela recusando tudo. */
select pg_temp.rec('3.4', 'CONTROLE: bonificação zerada entra', 'pendente', 'pendente');

do $$
declare st text;
begin
  begin
    insert into public.accounts_receivable (tenant_id, description, value, due_date, is_complimentary)
    values ((select tenant_a from ids), 'Bonificação zerada', 0, current_date, true);
    update res set expected = 'entrou', observed = 'entrou' where caso = '3.4';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    update res set expected = 'entrou', observed = 'ERR:' || st where caso = '3.4';
  end;
end $$;

/* A excecao da importacao (0063) nao pode ter sido perdida no caminho: a 0095
   reescreveu o check inteiro. */
select pg_temp.rec('4.1', 'a exceção da importação (0063) continua de pé', 'pendente', 'pendente');

do $$
declare st text;
begin
  begin
    insert into public.accounts_receivable (tenant_id, legacy_id, description, value, due_date)
    values ((select tenant_a from ids), 'b44-rec-zero', 'Importada zerada', 0, current_date);
    update res set expected = 'entrou', observed = 'entrou' where caso = '4.1';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    update res set expected = 'entrou', observed = 'ERR:' || st where caso = '4.1';
  end;
end $$;

-- 5. Quem pode chamar ---------------------------------------------------------------

select pg_temp.rec('5.1', 'anon não executa a função', 'false',
  has_function_privilege('anon', 'public.generate_contract_installments(uuid, boolean)', 'execute')::text);

select pg_temp.rec('5.2', 'CONTROLE: authenticated executa', 'true',
  has_function_privilege('authenticated', 'public.generate_contract_installments(uuid, boolean)', 'execute')::text);

/* A funcao de um argumento so precisa ter SUMIDO: com as duas no banco, a chamada
   de um argumento passaria a depender de qual o Postgres escolhesse. */
select pg_temp.rec('5.3', 'só existe UMA versão da função', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'generate_contract_installments'));

/* E a chamada de um argumento continua valendo, pelo default — e o que a versao
   ja publicada do frontend faz enquanto o deploy novo nao sai. */
select pg_temp.rec('5.4', 'chamada com um argumento só ainda funciona (default)',
  'total_value_not_positive',
  (select case when x is null then '(nulo)' else x end from (
    select (select msg from (
      select null::text as msg
    ) z) as x
  ) y));

do $$
declare v jsonb; st text; msg text;
        v_contrato uuid; v_claims text;
begin
  /* Lidos ANTES da troca de papel: `ids` e tabela temporaria da sessao, e o
     papel `authenticated` nao alcanca uma tabela do pg_temp — a leitura tardia
     falhava com 42501 e o caso reportava recusa de PERMISSAO onde havia acerto
     de argumento padrao. */
  select contrato_zero2 into v_contrato from ids;
  select pg_temp.claims(user_dir_a, tenant_a)::text into v_claims from ids;
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', v_claims, true);
    v := public.generate_contract_installments(v_contrato);
    perform set_config('role', 'postgres', true);
    update res set observed = 'OK' where caso = '5.4';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    update res set observed = case when st = 'P0001' then msg else 'ERR:' || st end where caso = '5.4';
  end;
end $$;

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
