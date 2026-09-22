-- Pessoas do cadastro do cliente e quem preencheu o briefing (migration 0102).
--
-- O QUE ELE PROVA
--   1. Quem edita o CRM grava as pessoas do cadastro; quem edita só o Pipeline
--      lê e não grava; escritório vizinho não vê nem grava.
--   2. A mesma pessoa não entra duas vezes no mesmo cliente (o botão "Salvar
--      como segundo titular" pode ser clicado de novo).
--   3. Apagar o cliente leva as pessoas dele junto.
--   4. `submit_client_intake` grava quem preencheu, e só valores conhecidos.
--
-- COMO RODAR
--   npm run test:client-people
--
-- RESIDUO
--   Nenhum. Transação terminada em ROLLBACK (slug cpeople-*).

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

create or replace function pg_temp.exec_as(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return n::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.valor_as(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '(nulo)');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.exec_pg(p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    return n::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    return 'ERR:' || st;
  end;
end; $$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'ceee0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'ceee0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'ceee0000-0000-4000-8000-00000000001a'::uuid as user_crm,
  'ceee0000-0000-4000-8000-00000000002a'::uuid as user_pipe,
  'ceee0000-0000-4000-8000-00000000001b'::uuid as user_b,
  'ceee0000-0000-4000-8000-00000000003a'::uuid as col_crm,
  'ceee0000-0000-4000-8000-00000000004a'::uuid as col_pipe,
  'ceee0000-0000-4000-8000-00000000003b'::uuid as col_b,
  'ceee0000-0000-4000-8000-0000000000c1'::uuid as cliente,
  'ceee0000-0000-4000-8000-0000000000c2'::uuid as cliente_apagavel,
  'ceee0000-0000-4000-8000-0000000000f1'::uuid as intake,
  'ceee0000-0000-4000-8000-0000000000f9'::uuid as token;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_crm from ids) u, 'cpeople-crm@example.test' e
  union all select (select user_pipe from ids), 'cpeople-pipe@example.test'
  union all select (select user_b from ids), 'cpeople-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'People A', 'cpeople-a'),
  ((select tenant_b from ids), 'People B', 'cpeople-b');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_crm from ids), (select tenant_a from ids), (select user_crm from ids),
   'Editora CRM', 'admin_staff', 'cpeople-crm@example.test', 'active'),
  ((select col_pipe from ids), (select tenant_a from ids), (select user_pipe from ids),
   'Editor Pipeline', 'architect', 'cpeople-pipe@example.test', 'active'),
  ((select col_b from ids), (select tenant_b from ids), (select user_b from ids),
   'Diretora B', 'director', 'cpeople-b@example.test', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_crm from ids), 'crm', true, true),
  /* Edita o Pipeline e só VÊ o CRM: é quem confere o briefing sem poder mexer
     no cadastro. */
  ((select tenant_a from ids), (select col_pipe from ids), 'pipeline', true, true),
  ((select tenant_a from ids), (select col_pipe from ids), 'crm', true, false);

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cliente from ids), (select tenant_a from ids), 'Fernando Titular', '(85) 90000-1111', 'Fortaleza', 'CE'),
  ((select cliente_apagavel from ids), (select tenant_a from ids), 'Cliente Apagavel', '(85) 90000-2222', 'Fortaleza', 'CE');

insert into public.client_intakes (id, tenant_id, client_id, token, status, expires_at) values
  ((select intake from ids), (select tenant_a from ids), (select cliente from ids),
   (select token from ids), 'active', now() + interval '24 hours');

create or replace function pg_temp.pessoa(p_cliente uuid, p_nome text, p_rel text) returns text language sql as $$
  select format('insert into public.client_people (tenant_id, client_id, name, relationship) values (%L, %L, %L, %L)',
    (select tenant_a from ids), p_cliente, p_nome, p_rel)
$$;

-- 1. QUEM GRAVA -------------------------------------------------------------------

select pg_temp.rec('1.1', 'quem edita o CRM grava a pessoa', '1',
  pg_temp.exec_as((select user_crm from ids), (select tenant_a from ids),
    pg_temp.pessoa((select cliente from ids), 'Nicolle Conjuge', 'spouse')));

select pg_temp.rec('1.2', 'quem só vê o CRM (e edita o Pipeline) não grava', 'ERR:42501',
  pg_temp.exec_as((select user_pipe from ids), (select tenant_a from ids),
    pg_temp.pessoa((select cliente from ids), 'Invasora', 'spouse')));

select pg_temp.rec('1.3', 'CONTROLE: mas lê, porque a conferência do briefing mostra', '1',
  pg_temp.valor_as((select user_pipe from ids), (select tenant_a from ids),
    'select count(*) from public.client_people'));

select pg_temp.rec('1.4', 'escritório vizinho não lê', '0',
  pg_temp.valor_as((select user_b from ids), (select tenant_b from ids),
    'select count(*) from public.client_people'));

select pg_temp.rec('1.5', 'escritório vizinho não grava no cliente de A', 'ERR:42501',
  pg_temp.exec_as((select user_b from ids), (select tenant_b from ids),
    pg_temp.pessoa((select cliente from ids), 'Invasor B', 'spouse')));

select pg_temp.rec('1.6', 'quem edita o CRM apaga', '1',
  pg_temp.exec_as((select user_crm from ids), (select tenant_a from ids),
    format($q$delete from public.client_people where client_id = %L and name = %L$q$,
      (select cliente from ids), 'Nicolle Conjuge')));

-- 2. INTEGRIDADE -------------------------------------------------------------------

select pg_temp.rec('2.1', 'CONTROLE: a pessoa volta para os casos seguintes', '1',
  pg_temp.exec_as((select user_crm from ids), (select tenant_a from ids),
    pg_temp.pessoa((select cliente from ids), 'Nicolle Conjuge', 'spouse')));

select pg_temp.rec('2.2', 'o mesmo nome no mesmo cliente não entra duas vezes', 'ERR:23505',
  pg_temp.exec_as((select user_crm from ids), (select tenant_a from ids),
    pg_temp.pessoa((select cliente from ids), ' nicolle conjuge ', 'co_owner')));

select pg_temp.rec('2.3', 'o mesmo nome em OUTRO cliente entra', '1',
  pg_temp.exec_as((select user_crm from ids), (select tenant_a from ids),
    pg_temp.pessoa((select cliente_apagavel from ids), 'Nicolle Conjuge', 'spouse')));

select pg_temp.rec('2.4', 'relação fora da lista é recusada', 'ERR:23514',
  pg_temp.exec_pg(pg_temp.pessoa((select cliente from ids), 'Outra Pessoa', 'esposa')));

select pg_temp.rec('2.5', 'nome em branco é recusado', 'ERR:23514',
  pg_temp.exec_pg(pg_temp.pessoa((select cliente from ids), '   ', 'spouse')));

select pg_temp.rec('2.6', 'e-mail sem formato é recusado', 'ERR:23514',
  pg_temp.exec_pg(format($q$insert into public.client_people (tenant_id, client_id, name, email) values (%L, %L, %L, %L)$q$,
    (select tenant_a from ids), (select cliente from ids), 'Com Email Errado', 'nao-e-email')));

select pg_temp.exec_pg(format($q$update public.client_people set tax_id = %L where client_id = %L and name = %L$q$,
  '123.456.789-00', (select cliente from ids), 'Nicolle Conjuge'));

select pg_temp.rec('2.7', 'CPF vira dígitos para a busca', '12345678900',
  (select tax_id_digits from public.client_people
    where client_id = (select cliente from ids) and name = 'Nicolle Conjuge'));

select pg_temp.exec_pg(format('delete from public.clients where id = %L', (select cliente_apagavel from ids)));

select pg_temp.rec('2.8', 'apagar o cliente leva as pessoas dele', '0',
  (select count(*)::text from public.client_people where client_id = (select cliente_apagavel from ids)));

-- 3. QUEM PREENCHEU O BRIEFING ------------------------------------------------------

select public.submit_client_intake((select token from ids), jsonb_build_object(
  'full_name', 'Nicolle Conjuge', 'phone', '(85) 90000-3333',
  'filled_by_relationship', 'spouse', 'filled_by_name', 'Nicolle Conjuge')) as enviou;

select pg_temp.rec('3.1', 'o formulário público grava quem preencheu', 'spouse|Nicolle Conjuge',
  (select coalesce(filled_by_relationship, '(nulo)') || '|' || coalesce(filled_by_name, '(nulo)')
     from public.client_intakes where id = (select intake from ids)));

select pg_temp.rec('3.2', 'valor fora da lista é recusado', 'ERR:23514',
  pg_temp.exec_pg(format($q$update public.client_intakes set filled_by_relationship = 'esposa' where id = %L$q$,
    (select intake from ids))));

select pg_temp.rec('3.3', 'briefing antigo continua sem a resposta, e isso é válido', '1',
  pg_temp.exec_pg(format($q$update public.client_intakes set filled_by_relationship = null, filled_by_name = null where id = %L$q$,
    (select intake from ids))));

select pg_temp.rec('3.4', 'anon não alcança as pessoas do cadastro', 'false',
  has_table_privilege('anon', 'public.client_people', 'select')::text);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
