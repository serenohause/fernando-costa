-- Obra por projeto e diferenças dispensadas do briefing (migration 0101).
--
-- O QUE ELE PROVA
--   1. O contrato copia a obra do briefing ENVIADO da própria negociação, inteira
--      — e não a obra do cadastro do cliente, que guarda uma só.
--   2. Dois projetos do mesmo cliente, com obras diferentes, geram contratos com
--      obras diferentes: o caso de produção ("um fica puxando o outro").
--   3. Sem briefing enviado, ou com briefing sem obra, vale o cadastro, como antes.
--   4. `dismissed_fields` só aceita colunas do cadastro.
--
-- COMO RODAR
--   npm run test:briefing-site
--
-- RESIDUO
--   Nenhum. Transação terminada em ROLLBACK (slug bsite-*).

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
  'cddd0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'cddd0000-0000-4000-8000-00000000001a'::uuid as user_pipe,
  'cddd0000-0000-4000-8000-00000000002a'::uuid as col_pipe,
  'cddd0000-0000-4000-8000-0000000000c1'::uuid as cliente,
  'cddd0000-0000-4000-8000-0000000000e1'::uuid as neg_grecia,
  'cddd0000-0000-4000-8000-0000000000e2'::uuid as neg_noruega,
  'cddd0000-0000-4000-8000-0000000000e3'::uuid as neg_sem_briefing,
  'cddd0000-0000-4000-8000-0000000000e4'::uuid as neg_briefing_sem_obra,
  'cddd0000-0000-4000-8000-0000000000f1'::uuid as intake_grecia;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ((select user_pipe from ids), '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'bsite-pipe@example.test', now(), now());

insert into public.tenants (id, name, slug) values ((select tenant_a from ids), 'Briefing Obra A', 'bsite-a');

insert into public.tenant_users (tenant_id, user_id, role)
values ((select tenant_a from ids), (select user_pipe from ids), 'member');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_pipe from ids), (select tenant_a from ids), (select user_pipe from ids),
   'Comercial A', 'admin_staff', 'bsite-pipe@example.test', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_pipe from ids), 'pipeline', true, true);

/* O cadastro tem a obra da NORUEGA — a do último briefing aplicado. */
insert into public.clients (id, tenant_id, name, phone, birth_date, address_city, address_state,
                            site_zipcode, site_street, site_number, site_complement, site_city, site_state) values
  ((select cliente from ids), (select tenant_a from ids), 'Cliente Duas Obras', '(85) 90000-0000', '1990-05-10', 'Fortaleza', 'CE',
   '60000-000', 'Alameda Noruega', '11', 'Quadra K1', 'Fortaleza', 'CE');

insert into public.negotiations
  (id, tenant_id, name, client_id, commercial_owner_id, estimated_value, status, funnel_stage, generates_contract) values
  ((select neg_grecia from ids), (select tenant_a from ids), 'Obra Grecia', (select cliente from ids), (select col_pipe from ids), 1000, 'active', 'closing', true),
  ((select neg_noruega from ids), (select tenant_a from ids), 'Obra Noruega', (select cliente from ids), (select col_pipe from ids), 1000, 'active', 'closing', true),
  ((select neg_sem_briefing from ids), (select tenant_a from ids), 'Sem Briefing', (select cliente from ids), (select col_pipe from ids), 1000, 'active', 'closing', true),
  ((select neg_briefing_sem_obra from ids), (select tenant_a from ids), 'Briefing Sem Obra', (select cliente from ids), (select col_pipe from ids), 1000, 'active', 'closing', true);

insert into public.client_intakes
  (id, tenant_id, client_id, negotiation_id, status, submitted_at, full_name, birth_date,
   site_zipcode, site_street, site_number, site_complement, site_district, site_city, site_state) values
  ((select intake_grecia from ids), (select tenant_a from ids), (select cliente from ids), (select neg_grecia from ids),
   'submitted', now(), 'Cliente Duas Obras', '2026-05-10',
   '60111-111', 'Alameda Grecia', null, 'Quadra N1 - Lotes 08 e 09', 'Alphaville', 'Eusebio', 'CE');

/* Briefing ANTIGO da mesma negociação, com outra obra: vale o mais recente. */
insert into public.client_intakes
  (tenant_id, client_id, negotiation_id, status, submitted_at, site_street, site_city, site_state) values
  ((select tenant_a from ids), (select cliente from ids), (select neg_grecia from ids),
   'submitted', now() - interval '10 days', 'Rua Antiga', 'Outra Cidade', 'SP');

/* Briefing NÃO enviado, com obra: não conta. */
insert into public.client_intakes
  (tenant_id, client_id, negotiation_id, status, site_street, site_city, site_state) values
  ((select tenant_a from ids), (select cliente from ids), (select neg_sem_briefing from ids),
   'active', 'Rua Rascunho', 'Rascunho', 'RJ');

insert into public.client_intakes
  (tenant_id, client_id, negotiation_id, status, submitted_at, full_name) values
  ((select tenant_a from ids), (select cliente from ids), (select neg_noruega from ids), 'submitted', now(), 'Cliente Duas Obras'),
  ((select tenant_a from ids), (select cliente from ids), (select neg_briefing_sem_obra from ids), 'submitted', now(), 'Cliente Duas Obras');

update public.client_intakes set site_street = 'Alameda Noruega', site_number = '11', site_complement = 'Quadra K1 - Lote 11',
       site_city = 'Eusebio', site_state = 'CE'
 where negotiation_id = (select neg_noruega from ids);

create or replace function pg_temp.ganha(p_neg uuid) returns text language sql as $$
  select pg_temp.valor_as((select user_pipe from ids), (select tenant_a from ids),
    format('select public.mark_negotiation_won(%L)::text', p_neg))
$$;

create or replace function pg_temp.obra(p_neg uuid) returns text language sql as $$
  select concat_ws(' | ', site_street, site_number, site_complement, site_city, site_state, site_zipcode)
  from public.contracts where negotiation_id = p_neg
$$;

create temp table retornos on commit drop as
select 'grecia' k, pg_temp.ganha((select neg_grecia from ids))::jsonb v
union all select 'noruega', pg_temp.ganha((select neg_noruega from ids))::jsonb
union all select 'sem_briefing', pg_temp.ganha((select neg_sem_briefing from ids))::jsonb
union all select 'briefing_sem_obra', pg_temp.ganha((select neg_briefing_sem_obra from ids))::jsonb;

-- 1. OBRA DO BRIEFING DA NEGOCIAÇÃO ---------------------------------------------

select pg_temp.rec('1.1', 'contrato criado', 'created',
  (select v->>'outcome' from retornos where k = 'grecia'));

select pg_temp.rec('1.2', 'obra do briefing MAIS RECENTE enviado, inteira (sem número vira vazio, não o 11 do cadastro)',
  'Alameda Grecia | Quadra N1 - Lotes 08 e 09 | Eusebio | CE | 60111-111',
  pg_temp.obra((select neg_grecia from ids)));

select pg_temp.rec('1.3', 'retorno avisa que a obra veio do briefing', 'true',
  (select v->>'siteFromBriefing' from retornos where k = 'grecia'));

select pg_temp.rec('1.4', 'o cadastro do cliente não é tocado', 'Alameda Noruega',
  (select site_street from public.clients where id = (select cliente from ids)));

-- 2. DOIS PROJETOS, DUAS OBRAS ---------------------------------------------------

select pg_temp.rec('2.1', 'segundo projeto do mesmo cliente fica com a obra dele',
  'Alameda Noruega | 11 | Quadra K1 - Lote 11 | Eusebio | CE',
  pg_temp.obra((select neg_noruega from ids)));

select pg_temp.rec('2.2', 'e o primeiro continua com a dele', 'Alameda Grecia',
  (select site_street from public.contracts where negotiation_id = (select neg_grecia from ids)));

-- 3. RESERVA: O CADASTRO ---------------------------------------------------------

select pg_temp.rec('3.1', 'sem briefing enviado, obra do cadastro (rascunho não conta)',
  'Alameda Noruega | 11 | Quadra K1 | Fortaleza | CE | 60000-000',
  pg_temp.obra((select neg_sem_briefing from ids)));

select pg_temp.rec('3.2', 'e o retorno diz que não veio do briefing', 'false',
  (select v->>'siteFromBriefing' from retornos where k = 'sem_briefing'));

select pg_temp.rec('3.3', 'briefing enviado sem nenhum campo de obra, obra do cadastro',
  'Alameda Noruega | 11 | Quadra K1 | Fortaleza | CE | 60000-000',
  pg_temp.obra((select neg_briefing_sem_obra from ids)));

select pg_temp.rec('3.4', 'dados do cliente continuam vindo do cadastro (nascimento 1990, não o 2026 do briefing)', '1990-05-10',
  (select client_birth_date::text from public.contracts where negotiation_id = (select neg_grecia from ids)));

-- 4. DIFERENÇAS DISPENSADAS ------------------------------------------------------

select pg_temp.rec('4.1', 'briefing nasce sem nada dispensado', '{}',
  (select dismissed_fields::text from public.client_intakes where id = (select intake_grecia from ids)));

select pg_temp.rec('4.2', 'quem edita o Pipeline dispensa uma coluna do cadastro', '{birth_date}',
  pg_temp.valor_as((select user_pipe from ids), (select tenant_a from ids),
    format($q$with u as (update public.client_intakes set dismissed_fields = array['birth_date'] where id = %L returning dismissed_fields)
             select dismissed_fields::text from u$q$, (select intake_grecia from ids))));

select pg_temp.rec('4.3', 'nome fora das colunas do cadastro é recusado', 'ERR:23514',
  pg_temp.exec_pg(format($q$update public.client_intakes set dismissed_fields = array['birth_date', 'tenant_id'] where id = %L$q$,
    (select intake_grecia from ids))));

select pg_temp.rec('4.4', 'endereço da obra também pode ser dispensado (é coluna do cadastro)', '1',
  pg_temp.exec_pg(format($q$update public.client_intakes set dismissed_fields = array['site_street'] where id = %L$q$,
    (select intake_grecia from ids))));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
