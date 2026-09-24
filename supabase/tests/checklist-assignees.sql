-- Vários responsáveis por objetivo da tarefa (migration 0103).
--
-- O QUE ELE PROVA
--   1. Quem edita o Fluxo do Projeto liga e desliga responsáveis; quem só lê,
--      não. Escritório vizinho não vê nem grava.
--   2. A mesma pessoa não entra duas vezes no mesmo objetivo, e duas pessoas
--      cabem no mesmo objetivo — que é o pedido.
--   3. Apagar o objetivo, a tarefa ou o colaborador leva os vínculos junto, e
--      apagar o colaborador NÃO é bloqueado por eles.
--   4. Não há caminho de UPDATE: trocar é tirar um e pôr outro.
--
-- COMO RODAR
--   npm run test:checklist-assignees
--
-- RESIDUO
--   Nenhum. Transação terminada em ROLLBACK (slug cassign-*).

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_sub::text, 'role', 'authenticated',
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
  'cfff0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'cfff0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'cfff0000-0000-4000-8000-00000000001a'::uuid as user_flow,
  'cfff0000-0000-4000-8000-00000000002a'::uuid as user_leitor,
  'cfff0000-0000-4000-8000-00000000001b'::uuid as user_b,
  'cfff0000-0000-4000-8000-00000000003a'::uuid as col_flow,
  'cfff0000-0000-4000-8000-00000000004a'::uuid as col_leitor,
  'cfff0000-0000-4000-8000-00000000005a'::uuid as col_extra,
  'cfff0000-0000-4000-8000-00000000003b'::uuid as col_b,
  'cfff0000-0000-4000-8000-0000000000e1'::uuid as projeto,
  'cfff0000-0000-4000-8000-0000000000a1'::uuid as tarefa,
  'cfff0000-0000-4000-8000-0000000000b1'::uuid as objetivo,
  'cfff0000-0000-4000-8000-0000000000b2'::uuid as objetivo_dois;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_flow from ids) u, 'cassign-flow@example.test' e
  union all select (select user_leitor from ids), 'cassign-leitor@example.test'
  union all select (select user_b from ids), 'cassign-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Assignees A', 'cassign-a'),
  ((select tenant_b from ids), 'Assignees B', 'cassign-b');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_flow from ids), (select tenant_a from ids), (select user_flow from ids),
   'Coordenadora A', 'coordinator', 'cassign-flow@example.test', 'active'),
  ((select col_leitor from ids), (select tenant_a from ids), (select user_leitor from ids),
   'Leitor A', 'architect', 'cassign-leitor@example.test', 'active'),
  ((select col_extra from ids), (select tenant_a from ids), null,
   'Arquiteta Extra', 'architect', 'cassign-extra@example.test', 'active'),
  ((select col_b from ids), (select tenant_b from ids), (select user_b from ids),
   'Diretora B', 'director', 'cassign-b@example.test', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_flow from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select col_leitor from ids), 'project_flow', true, false);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select projeto from ids), (select tenant_a from ids), 'Projeto Assignees', 'architecture');

insert into public.tasks (id, tenant_id, project_id, title, phase, status) values
  ((select tarefa from ids), (select tenant_a from ids), (select projeto from ids),
   'Tarefa Assignees', 'layout', 'in_progress');

insert into public.task_checklist_items (id, tenant_id, task_id, title, phase) values
  ((select objetivo from ids), (select tenant_a from ids), (select tarefa from ids), 'Objetivo A', 'layout'),
  ((select objetivo_dois from ids), (select tenant_a from ids), (select tarefa from ids), 'Objetivo B', 'layout');

create or replace function pg_temp.vincula(p_item uuid, p_col uuid) returns text language sql as $$
  select format('insert into public.task_checklist_item_assignees (tenant_id, item_id, collaborator_id) values (%L, %L, %L)',
    (select tenant_a from ids), p_item, p_col)
$$;

-- 1. QUEM LIGA E DESLIGA ---------------------------------------------------------

select pg_temp.rec('1.1', 'quem edita o Fluxo do Projeto põe o primeiro responsável', '1',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    pg_temp.vincula((select objetivo from ids), (select col_flow from ids))));

select pg_temp.rec('1.2', 'E O SEGUNDO NO MESMO OBJETIVO — o pedido', '1',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    pg_temp.vincula((select objetivo from ids), (select col_extra from ids))));

select pg_temp.rec('1.3', 'a mesma pessoa duas vezes é recusada', 'ERR:23505',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    pg_temp.vincula((select objetivo from ids), (select col_flow from ids))));

select pg_temp.rec('1.4', 'quem só lê o Fluxo não vincula', 'ERR:42501',
  pg_temp.exec_as((select user_leitor from ids), (select tenant_a from ids),
    pg_temp.vincula((select objetivo_dois from ids), (select col_leitor from ids))));

select pg_temp.rec('1.5', 'CONTROLE: mas lê os vínculos (o cartão mostra)', '2',
  pg_temp.valor_as((select user_leitor from ids), (select tenant_a from ids),
    'select count(*) from public.task_checklist_item_assignees'));

select pg_temp.rec('1.6', 'escritório vizinho não lê', '0',
  pg_temp.valor_as((select user_b from ids), (select tenant_b from ids),
    'select count(*) from public.task_checklist_item_assignees'));

select pg_temp.rec('1.7', 'escritório vizinho não grava no objetivo de A', 'ERR:42501',
  pg_temp.exec_as((select user_b from ids), (select tenant_b from ids),
    pg_temp.vincula((select objetivo from ids), (select col_b from ids))));

select pg_temp.rec('1.8', 'colaborador de outro escritório não entra no objetivo', 'ERR:23503',
  pg_temp.exec_pg(pg_temp.vincula((select objetivo from ids), (select col_b from ids))));

select pg_temp.rec('1.9', 'quem edita o Fluxo desliga um responsável', '1',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    format('delete from public.task_checklist_item_assignees where item_id = %L and collaborator_id = %L',
      (select objetivo from ids), (select col_extra from ids))));

select pg_temp.rec('1.10', 'não há caminho de UPDATE: a policy não existe', 'ERR:42501',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    format('update public.task_checklist_item_assignees set collaborator_id = %L where item_id = %L',
      (select col_extra from ids), (select objetivo from ids))));

-- 2. O QUE CAI JUNTO ---------------------------------------------------------------

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
  pg_temp.vincula((select objetivo_dois from ids), (select col_extra from ids)));

select pg_temp.rec('2.1', 'CONTROLE: dois objetivos com responsável', '2',
  (select count(*)::text from public.task_checklist_item_assignees where tenant_id = (select tenant_a from ids)));

select pg_temp.exec_pg(format('delete from public.task_checklist_items where id = %L', (select objetivo_dois from ids)));

select pg_temp.rec('2.2', 'apagar o objetivo leva os responsáveis dele', '0',
  (select count(*)::text from public.task_checklist_item_assignees
    where item_id = (select objetivo_dois from ids)));

select pg_temp.exec_pg(format('delete from public.collaborators where id = %L', (select col_flow from ids)));

select pg_temp.rec('2.3', 'desligar o colaborador não é bloqueado, e tira o nome dos objetivos', '0',
  (select count(*)::text from public.task_checklist_item_assignees
    where collaborator_id = (select col_flow from ids)));

select pg_temp.exec_pg(format('delete from public.tasks where id = %L', (select tarefa from ids)));

select pg_temp.rec('2.4', 'apagar a tarefa leva tudo', '0',
  (select count(*)::text from public.task_checklist_item_assignees where tenant_id = (select tenant_a from ids)));

-- 3. A COLUNA ANTIGA SAIU ----------------------------------------------------------

select pg_temp.rec('3.1', 'task_checklist_items.assignee_id não existe mais', '0',
  (select count(*)::text from information_schema.columns
    where table_name = 'task_checklist_items' and column_name = 'assignee_id'));

select pg_temp.rec('3.2', 'anon não alcança os vínculos', 'false',
  has_table_privilege('anon', 'public.task_checklist_item_assignees', 'select')::text);

select pg_temp.rec('3.3', 'RLS ligada', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.task_checklist_item_assignees'::regclass));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
