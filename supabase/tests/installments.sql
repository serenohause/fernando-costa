-- Teste do modulo 7 - public.generate_contract_installments (migration 0044).
--
-- POR QUE ESTE ARQUIVO E O UNICO DO CORTE QUE VOLTOU AO TRATAMENTO COMPLETO
--   docs/ARCHITECTURE.md, secao "Quando o corte nao vale": qualquer coisa que
--   fuja do padrao volta a ter teste proprio robusto e injecao de defeito, e uma
--   das quatro entradas da lista e "calculo cujo erro so apareceria no dinheiro
--   de alguem". E este calculo. Os modulos 4 a 6 cortaram teste porque aplicavam
--   padrao ja provado; aqui nao ha padrao provado - ha uma divisao que o sistema
--   atual faz errado.
--
-- O QUE ELE AFIRMA
--   1. A soma das parcelas e EXATAMENTE o valor do contrato, inclusive nos tres
--      valores que nao dividem redondo (128.000/12, 470.000/6, 1.000/3).
--   2. O resto vai na PRIMEIRA parcela, e nao na ultima.
--   3. Gerar duas vezes nao duplica, e a segunda tentativa nao deixa residuo.
--   4. A bandeira do contrato e levantada, e cai junto quando a geracao falha.
--   5. As quatro periodicidades produzem os vencimentos certos.
--   6. Quem nao tem can_edit no menu receivables nao gera.
--
-- INJECAO DE DEFEITO - o que cada versao errada derrubou
--   Suite verde que nao acusa defeito injetado nao e suite. Este arquivo foi
--   rodado contra quatro versoes erradas, cada uma montada no PONTO DE INJECAO
--   marcado abaixo, dentro da propria transacao (create or replace function e
--   DDL, e DDL e transacional) e desfeita no ROLLBACK.
--
--     divisao simples (total/n em toda parcela, o defeito do original)
--       9 casos caem: 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 1.12, 1.13 e 2.5.
--       As tres somas erram - 128000.04, 469999.98 e 999.99.
--
--     resto na ULTIMA parcela em vez da primeira
--       5 casos caem: 1.4, 1.6, 1.9, 1.10 e 1.13. As SOMAS CONTINUAM EXATAS -
--       e por isso os casos que afirmam o valor da primeira parcela existem.
--
--     sem a unicidade (constraint removida, funcao intacta)
--       6 casos caem: 2.3, 2.4, 2.5, 2.6, 2.7 e 2.8. A segunda geracao passa e
--       o contrato fica com 24 parcelas somando R$ 256.000,00.
--
--     bandeira marcada fora da transacao (a funcao nao levanta
--     installments_generated; ficaria para uma segunda requisicao, como no
--     original)
--       1 caso cai: 2.1. E o unico observavel - dentro de uma funcao plpgsql
--       nao ha como escrever "commit no meio", entao a unica forma errada
--       expressavel e nao escrever a bandeira. O caso 2.8 cobre o outro lado
--       (falha no meio da geracao NAO deixa a bandeira levantada) e e o que cai
--       se alguem tirar o update de dentro do bloco protegido.
--
--   O caso 1.10 so passou a acusar depois da injecao: ele usava
--   `select distinct ... into`, que descarta a segunda linha em silencio.
--
-- COMO RODAR
--   npm run test:installments
--
-- COMO LER
--   observed = 'OK'              a chamada passou.
--   observed = 'ERR:<mensagem>'  a chamada foi recusada, com a mensagem estavel
--                                que a funcao levanta (P0001).
--   Nos casos de valor o observado e o NUMERO devolvido: uma funcao que calcule
--   errado devolve uma linha do mesmo jeito.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug installments-test-*).

begin;

-- Instrumentacao --------------------------------------------------------------

create temp table res (
  seq serial primary key, caso text, descricao text, expected text, observed text
) on commit drop;

create or replace function pg_temp.chk(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint; v_out text; v_state text;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_out := 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- Sonda de VALOR: soma, valor de parcela e sequencia de vencimento sao numeros.
-- Contagem de linhas nao distingue 128.000,00 de 128.000,04.
create or replace function pg_temp.val(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_state text;
begin
  begin
    execute p_sql into v_out;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v_out, '<null>'));
end;
$$;

-- Chama COMO OUTRA PESSOA e devolve a MENSAGEM do erro, nao o sqlstate: os seis
-- erros de negocio da funcao saem todos como P0001, e 'ERR:P0001' nao
-- distinguiria "ja gerou" de "nao autorizado" - dois desfechos com significado
-- oposto para quem clicou no botao.
create or replace function pg_temp.call_as(p_caso text, p_desc text, p_expected text,
                                           p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql;
    perform set_config('role', 'postgres', true);
    v_out := 'OK';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'postgres', true);
    v_out := 'ERR:' || v_msg;
  end;
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'c1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'c2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'c1000000-0000-4000-8000-000000000001'::uuid as u_recv,
  'c1000000-0000-4000-8000-000000000002'::uuid as u_none,
  'c1100000-0000-4000-8000-000000000001'::uuid as c_recv,
  'c1100000-0000-4000-8000-000000000002'::uuid as c_none,
  'c1200000-0000-4000-8000-000000000001'::uuid as ct_128k,
  'c1200000-0000-4000-8000-000000000002'::uuid as ct_470k,
  'c1200000-0000-4000-8000-000000000003'::uuid as ct_1000,
  'c1200000-0000-4000-8000-000000000004'::uuid as ct_round,
  'c1200000-0000-4000-8000-000000000005'::uuid as ct_eom,
  'c1200000-0000-4000-8000-000000000006'::uuid as ct_biweekly,
  'c1200000-0000-4000-8000-000000000007'::uuid as ct_weekly,
  'c1200000-0000-4000-8000-000000000008'::uuid as ct_single,
  'c1200000-0000-4000-8000-000000000009'::uuid as ct_noplan,
  'c1200000-0000-4000-8000-00000000000a'::uuid as ct_atomic,
  'c1200000-0000-4000-8000-00000000000b'::uuid as ct_tiny,
  'c2200000-0000-4000-8000-000000000001'::uuid as ct_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_recv from ids) u, 'installments-recv@example.test' e
  union all select (select u_none from ids), 'installments-none@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Installments Test A', 'installments-test-a'),
  ((select tenant_b from ids), 'Installments Test B', 'installments-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_recv from ids), 'member'),
  ((select tenant_a from ids), (select u_none from ids), 'member');

-- Nenhum dos dois e Diretor: o atalho da 0019 faria a secao 4 passar sem provar
-- que a funcao le a permissao de menu.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_recv from ids), (select tenant_a from ids), (select u_recv from ids),
   'Helena Marques', 'finance', 'installments-recv@example.test', 'active'),
  ((select c_none from ids), (select tenant_a from ids), (select u_none from ids),
   'Tiago Barbosa', 'architect', 'installments-none@example.test', 'active');

-- A linha de receivables existe para os DOIS, com can_edit diferente: sem a
-- linha do segundo, "nao gera" nao distinguiria permissao negada de permissao
-- ausente.
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_recv from ids), 'receivables', true, true),
  ((select tenant_a from ids), (select c_none from ids), 'receivables', true, false);

insert into public.contracts
  (id, tenant_id, contract_number, contract_type, total_value,
   installment_count, first_due_date, installment_frequency) values
  -- Os tres valores que NAO dividem redondo. O primeiro e o caso da doc.
  ((select ct_128k from ids), (select tenant_a from ids), 'INST-128K', 'architecture', 128000.00,
   12, '2026-09-10', 'monthly'),
  ((select ct_470k from ids), (select tenant_a from ids), 'INST-470K', 'architecture', 470000.00,
   6, '2026-09-10', 'monthly'),
  ((select ct_1000 from ids), (select tenant_a from ids), 'INST-1000', 'architecture', 1000.00,
   3, '2026-09-10', 'monthly'),
  -- O controle: valor que divide redondo. Sem ele, uma funcao que sempre
  -- acrescentasse alguma coisa a primeira parcela passaria em tudo acima.
  ((select ct_round from ids), (select tenant_a from ids), 'INST-ROUND', 'architecture', 120000.00,
   12, '2026-09-10', 'monthly'),
  -- Fim de mes: 31/01 + 1 mes = 28/02, como o addMonths do date-fns.
  ((select ct_eom from ids), (select tenant_a from ids), 'INST-EOM', 'architecture', 900.00,
   3, '2026-01-31', 'monthly'),
  ((select ct_biweekly from ids), (select tenant_a from ids), 'INST-BIWEEKLY', 'architecture', 400.00,
   4, '2026-03-10', 'biweekly'),
  ((select ct_weekly from ids), (select tenant_a from ids), 'INST-WEEKLY', 'architecture', 300.00,
   3, '2026-03-10', 'weekly'),
  ((select ct_single from ids), (select tenant_a from ids), 'INST-SINGLE', 'architecture', 300.00,
   3, '2026-03-10', 'single'),
  ((select ct_atomic from ids), (select tenant_a from ids), 'INST-ATOMIC', 'architecture', 128000.00,
   12, '2026-09-10', 'monthly'),
  -- Cinco centavos em doze parcelas: a base seria zero.
  ((select ct_tiny from ids), (select tenant_a from ids), 'INST-TINY', 'architecture', 0.05,
   12, '2026-09-10', 'monthly'),
  ((select ct_b from ids), (select tenant_b from ids), 'INST-B', 'architecture', 50000.00,
   4, '2026-09-10', 'monthly');

-- Contrato SEM plano de parcelamento: os tres campos nulos, que e o outro estado
-- permitido pelo check da 0029.
insert into public.contracts (id, tenant_id, contract_number, contract_type, total_value) values
  ((select ct_noplan from ids), (select tenant_a from ids), 'INST-NOPLAN', 'architecture', 90000.00);

-- Parcela 5 ja existente no contrato "atomico". E o que faz a geracao falhar NO
-- MEIO do laco, que e o unico jeito de observar se a transacao e mesmo uma so.
insert into public.accounts_receivable
  (tenant_id, contract_id, description, value, due_date, installment_number, installment_total) values
  ((select tenant_a from ids), (select ct_atomic from ids), 'Parcela lancada a mao',
   1.00, '2027-01-10', 5, 12);

-- ============================================================================
-- PONTO DE INJECAO DE DEFEITO
--
-- Os mutantes sao montados substituindo esta linha por um
-- `create or replace function public.generate_contract_installments...` com o
-- defeito. Como DDL e transacional e o arquivo termina em ROLLBACK, a funcao
-- boa volta sozinha no fim.
-- ============================================================================

-- 1. A soma fecha, e o resto vai na PRIMEIRA parcela ---------------------------

select pg_temp.val('1.0', 'CONTROLE: contrato nasce sem parcela nenhuma', '0', format($q$
  select count(*)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_128k from ids)));

select pg_temp.call_as('1.1', 'gera as 12 parcelas de R$ 128.000,00', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_128k from ids)));

select pg_temp.val('1.2', 'sao 12 parcelas', '12', format($q$
  select count(*)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_128k from ids)));

-- O CASO. A divisao simples do original (128000/12 em todas) soma 128000.04.
select pg_temp.val('1.3', 'a soma e EXATAMENTE 128000.00', '128000.00', format($q$
  select sum(value)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_128k from ids)));

-- 12.800.000 centavos / 12 = 1.066.666, resto 8 -> a primeira leva 1.066.674.
-- Este caso e o que separa "resto na primeira" de "resto na ultima".
select pg_temp.val('1.4', 'a PRIMEIRA parcela leva o resto: 10666.74', '10666.74', format($q$
  select value::text from public.accounts_receivable
   where contract_id = %L and installment_number = 1
$q$, (select ct_128k from ids)));

select pg_temp.val('1.5', 'a segunda parcela e a base: 10666.66', '10666.66', format($q$
  select value::text from public.accounts_receivable
   where contract_id = %L and installment_number = 2
$q$, (select ct_128k from ids)));

select pg_temp.val('1.6', 'a ULTIMA parcela tambem e a base: 10666.66', '10666.66', format($q$
  select value::text from public.accounts_receivable
   where contract_id = %L and installment_number = 12
$q$, (select ct_128k from ids)));

-- Segundo valor que nao divide redondo: 47.000.000 / 6 = 7.833.333, resto 2.
select pg_temp.call_as('1.7', 'gera as 6 parcelas de R$ 470.000,00', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_470k from ids)));

select pg_temp.val('1.8', 'a soma e EXATAMENTE 470000.00', '470000.00', format($q$
  select sum(value)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_470k from ids)));

select pg_temp.val('1.9', 'a primeira parcela leva o resto: 78333.35', '78333.35', format($q$
  select value::text from public.accounts_receivable
   where contract_id = %L and installment_number = 1
$q$, (select ct_470k from ids)));

-- string_agg(distinct ...), e nao `select distinct ... into`: com INTO, um
-- segundo valor distinto seria simplesmente descartado e o caso passaria a
-- afirmar "existe pelo menos uma parcela de 78333.33". Foi o que a injecao do
-- defeito "resto na ultima parcela" mostrou.
select pg_temp.val('1.10', 'as outras cinco sao TODAS 78333.33', '78333.33', format($q$
  select string_agg(distinct value::text, '|') from public.accounts_receivable
   where contract_id = %L and installment_number > 1
$q$, (select ct_470k from ids)));

-- Terceiro valor: 100.000 / 3 = 33.333, resto 1.
select pg_temp.call_as('1.11', 'gera as 3 parcelas de R$ 1.000,00', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_1000 from ids)));

select pg_temp.val('1.12', 'a soma e EXATAMENTE 1000.00', '1000.00', format($q$
  select sum(value)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_1000 from ids)));

select pg_temp.val('1.13', 'a primeira e 333.34 e as outras 333.33', '333.34|333.33|333.33', format($q$
  select string_agg(value::text, '|' order by installment_number)
    from public.accounts_receivable where contract_id = %L
$q$, (select ct_1000 from ids)));

-- CONTROLE: valor que divide redondo nao ganha resto nenhum. Sem ele, uma funcao
-- que sempre somasse um centavo a primeira parcela passaria em 1.4, 1.9 e 1.13.
select pg_temp.call_as('1.14', 'gera as 12 parcelas de R$ 120.000,00 (divide redondo)', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_round from ids)));

select pg_temp.val('1.15', 'CONTROLE: as 12 parcelas sao iguais a 10000.00', '10000.00', format($q$
  select string_agg(distinct value::text, '|') from public.accounts_receivable where contract_id = %L
$q$, (select ct_round from ids)));

select pg_temp.val('1.16', 'CONTROLE: a soma e 120000.00', '120000.00', format($q$
  select sum(value)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_round from ids)));

-- Contrato pequeno demais para o parcelamento: a base seria zero centavo, e as
-- parcelas 2..12 cairiam no check value > 0. A funcao recusa com erro proprio.
select pg_temp.call_as('1.17', 'cinco centavos em 12 parcelas e recusado com erro proprio',
  'ERR:installment_value_too_small',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_tiny from ids)));

-- 2. Bandeira e transacao ------------------------------------------------------

select pg_temp.val('2.1', 'a bandeira do contrato foi levantada na mesma transacao', 'true', format($q$
  select installments_generated::text from public.contracts where id = %L
$q$, (select ct_128k from ids)));

select pg_temp.val('2.2', 'CONTROLE: contrato ainda nao gerado tem a bandeira abaixada', 'false', format($q$
  select installments_generated::text from public.contracts where id = %L
$q$, (select ct_atomic from ids)));

-- A protecao e a unicidade (tenant_id, contract_id, installment_number), e nao a
-- consulta previa do original.
select pg_temp.call_as('2.3', 'gerar DE NOVO o mesmo contrato e recusado',
  'ERR:installments_already_generated',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_128k from ids)));

select pg_temp.val('2.4', 'continuam sendo 12 parcelas depois da segunda tentativa', '12', format($q$
  select count(*)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_128k from ids)));

select pg_temp.val('2.5', 'e a soma continua 128000.00', '128000.00', format($q$
  select sum(value)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_128k from ids)));

-- Falha NO MEIO do laco: a parcela 5 ja existe. E o unico jeito de observar se
-- as parcelas e a bandeira estao mesmo na mesma transacao.
select pg_temp.call_as('2.6', 'geracao que colide na parcela 5 e recusada',
  'ERR:installments_already_generated',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_atomic from ids)));

select pg_temp.val('2.7', 'as parcelas 1 a 4 NAO ficaram para tras', '1', format($q$
  select count(*)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_atomic from ids)));

select pg_temp.val('2.8', 'e a bandeira NAO foi levantada', 'false', format($q$
  select installments_generated::text from public.contracts where id = %L
$q$, (select ct_atomic from ids)));

-- 3. As quatro periodicidades ---------------------------------------------------

select pg_temp.call_as('3.0', 'gera o contrato mensal que comeca em 31/01', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_eom from ids)));

-- addMonths do date-fns e `date + interval 'n months'` do Postgres tratam fim de
-- mes igual: 31/01 -> 28/02 -> 31/03. Uma implementacao por "+30 dias" daria
-- 02/03 e 01/04.
select pg_temp.val('3.1', 'mensal a partir de 31/01: 31/01, 28/02, 31/03',
  '2026-01-31|2026-02-28|2026-03-31', format($q$
  select string_agg(due_date::text, '|' order by installment_number)
    from public.accounts_receivable where contract_id = %L
$q$, (select ct_eom from ids)));

select pg_temp.call_as('3.2', 'gera o contrato quinzenal', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_biweekly from ids)));

select pg_temp.val('3.3', 'quinzenal: de 15 em 15 dias a partir de 10/03',
  '2026-03-10|2026-03-25|2026-04-09|2026-04-24', format($q$
  select string_agg(due_date::text, '|' order by installment_number)
    from public.accounts_receivable where contract_id = %L
$q$, (select ct_biweekly from ids)));

select pg_temp.call_as('3.4', 'gera o contrato semanal', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_weekly from ids)));

select pg_temp.val('3.5', 'semanal: de 7 em 7 dias a partir de 10/03',
  '2026-03-10|2026-03-17|2026-03-24', format($q$
  select string_agg(due_date::text, '|' order by installment_number)
    from public.accounts_receivable where contract_id = %L
$q$, (select ct_weekly from ids)));

select pg_temp.call_as('3.6', 'gera o contrato de periodicidade unica', 'OK',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_single from ids)));

-- "Unica" com mais de uma parcela e o que o original produz: o else de
-- Contracts.jsx:691 usa a mesma data para todas.
select pg_temp.val('3.7', 'unica: as tres vencem no mesmo dia',
  '2026-03-10|2026-03-10|2026-03-10', format($q$
  select string_agg(due_date::text, '|' order by installment_number)
    from public.accounts_receivable where contract_id = %L
$q$, (select ct_single from ids)));

-- 4. Autorizacao conferida POR DENTRO --------------------------------------------
--
-- SECURITY DEFINER passa por cima da RLS: sem estes casos, qualquer colaborador
-- active de qualquer escritorio geraria parcela em qualquer contrato.

select pg_temp.call_as('4.1', 'colaborador SEM can_edit em receivables nao gera',
  'ERR:not_authorized',
  (select u_none from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_noplan from ids)));

-- Contrato do OUTRO escritorio, chamado por quem tem permissao no seu. A funcao
-- busca o contrato com tenant_id = auth_tenant_id(), entao ele nem existe daqui.
select pg_temp.call_as('4.2', 'contrato de outro escritorio nao e alcancado',
  'ERR:contract_not_found',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_b from ids)));

select pg_temp.val('4.3', 'CONTROLE: e o contrato de la continua sem parcela', '0', format($q$
  select count(*)::text from public.accounts_receivable where contract_id = %L
$q$, (select ct_b from ids)));

select pg_temp.call_as('4.4', 'contrato sem plano de parcelamento nao gera',
  'ERR:installment_plan_missing',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  select public.generate_contract_installments(%L)
$q$, (select ct_noplan from ids)));

-- 5. O que a parcela gerada carrega ------------------------------------------------

select pg_temp.val('5.1', 'a descricao segue a do original: Parcela i/n - numero do contrato',
  'Parcela 3/12 - INST-128K', format($q$
  select description from public.accounts_receivable
   where contract_id = %L and installment_number = 3
$q$, (select ct_128k from ids)));

select pg_temp.val('5.2', 'toda parcela nasce prevista', 'forecast', format($q$
  select string_agg(distinct status::text, '|') from public.accounts_receivable where contract_id = %L
$q$, (select ct_128k from ids)));

select pg_temp.val('5.3', 'e sem data de pagamento', '0', format($q$
  select count(*)::text from public.accounts_receivable
   where contract_id = %L and payment_date is not null
$q$, (select ct_128k from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
