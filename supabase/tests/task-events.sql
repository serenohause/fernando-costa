-- O histórico do cartão, escrito por gatilho (migration 0104).
--
-- O QUE ELE PROVA
--   1. Toda mudança da tarefa vira evento: criação, título, prazo, etapa,
--      responsável e status — com o rótulo de etapa e de status do MOMENTO.
--   2. Objetivo entra, sai, conclui e reabre no histórico; a semeadura da etapa
--      (vários de uma vez) vira UM evento, e não um por objetivo.
--   3. O autor sai do JWT, e o nome fica copiado.
--   4. Ninguém escreve no histórico pela API: só SELECT, e só do próprio
--      escritório.
--
-- COMO RODAR
--   npm run test:task-events-sql
--
-- RESIDUO
--   Nenhum. Transação terminada em ROLLBACK (slug tevt-*).

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

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'daaa0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'daaa0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'daaa0000-0000-4000-8000-00000000001a'::uuid as user_flow,
  'daaa0000-0000-4000-8000-00000000001b'::uuid as user_b,
  'daaa0000-0000-4000-8000-00000000002a'::uuid as col_flow,
  'daaa0000-0000-4000-8000-00000000003a'::uuid as col_outro,
  'daaa0000-0000-4000-8000-00000000002b'::uuid as col_b,
  'daaa0000-0000-4000-8000-0000000000e1'::uuid as projeto,
  'daaa0000-0000-4000-8000-0000000000f1'::uuid as tarefa,
  'daaa0000-0000-4000-8000-0000000000f2'::uuid as objetivo;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_flow from ids) u, 'tevt-flow@example.test' e
  union all select (select user_b from ids), 'tevt-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Eventos A', 'tevt-a'),
  ((select tenant_b from ids), 'Eventos B', 'tevt-b');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_flow from ids), (select tenant_a from ids), (select user_flow from ids),
   'Helena Autora', 'coordinator', 'tevt-flow@example.test', 'active'),
  ((select col_outro from ids), (select tenant_a from ids), null,
   'Camila Executora', 'architect', 'tevt-outro@example.test', 'active'),
  ((select col_b from ids), (select tenant_b from ids), (select user_b from ids),
   'Diretora B', 'director', 'tevt-b@example.test', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_flow from ids), 'project_flow', true, true);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select projeto from ids), (select tenant_a from ids), 'Projeto Eventos', 'architecture');

create or replace function pg_temp.evento(p_kind text) returns text language sql as $$
  select coalesce((select e.details::text from public.task_events e
     where e.task_id = (select tarefa from ids) and e.kind = p_kind
     order by e.created_at desc limit 1), '(nenhum)')
$$;

create or replace function pg_temp.autor(p_kind text) returns text language sql as $$
  select coalesce((select coalesce(e.actor_name, '(sem autor)') from public.task_events e
     where e.task_id = (select tarefa from ids) and e.kind = p_kind
     order by e.created_at desc limit 1), '(nenhum)')
$$;

create or replace function pg_temp.quantos(p_kind text) returns text language sql as $$
  select count(*)::text from public.task_events e
   where e.task_id = (select tarefa from ids) and e.kind = p_kind
$$;

-- 1. A TAREFA --------------------------------------------------------------------

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$insert into public.tasks (id, tenant_id, project_id, title, phase, status)
     values (%L, %L, %L, 'Tarefa Histórico', 'layout', 'in_progress')$q$,
  (select tarefa from ids), (select tenant_a from ids), (select projeto from ids)));

select pg_temp.rec('1.1', 'criar a tarefa vira evento', '{"title": "Tarefa Histórico"}',
  pg_temp.evento('task_created'));

select pg_temp.rec('1.2', 'e o autor é quem tinha a sessão', 'Helena Autora',
  pg_temp.autor('task_created'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$update public.tasks set title = 'Tarefa Renomeada', due_date = '2026-10-15',
       responsible_id = %L, operational_tag = 'in_review', phase = 'renderings'
     where id = %L$q$, (select col_outro from ids), (select tarefa from ids)));

select pg_temp.rec('1.3', 'renomear vira evento com o antes e o depois',
  '{"to": "Tarefa Renomeada", "from": "Tarefa Histórico"}', pg_temp.evento('title_changed'));

select pg_temp.rec('1.4', 'prazo posto vira evento', '{"to": "2026-10-15", "from": null}',
  pg_temp.evento('due_date_changed'));

select pg_temp.rec('1.5', 'responsável vira evento com o nome', '{"to": "Camila Executora", "from": null}',
  pg_temp.evento('responsible_changed'));

select pg_temp.rec('1.6', 'etapa guarda o RÓTULO do momento, não a chave',
  '{"to": "Perspectivas", "from": "Layout"}', pg_temp.evento('phase_changed'));

select pg_temp.rec('1.7', 'status operacional guarda o rótulo', '{"to": "Em Revisão", "from": null}',
  pg_temp.evento('operational_tag_changed'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
  format($q$update public.tasks set title = 'Tarefa Renomeada' where id = %L$q$, (select tarefa from ids)));

select pg_temp.rec('1.8', 'gravar sem mudar nada não gera evento', '1', pg_temp.quantos('title_changed'));

-- 2. OS OBJETIVOS ------------------------------------------------------------------

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$insert into public.task_checklist_items (id, tenant_id, task_id, title, phase)
     values (%L, %L, %L, 'Objetivo Um', 'renderings')$q$,
  (select objetivo from ids), (select tenant_a from ids), (select tarefa from ids)));

select pg_temp.rec('2.1', 'objetivo avulso vira evento próprio', '{"title": "Objetivo Um"}',
  pg_temp.evento('objective_added'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$insert into public.task_checklist_items (tenant_id, task_id, title, phase)
     values (%L, %L, 'Semeado A', 'renderings'), (%L, %L, 'Semeado B', 'renderings'), (%L, %L, 'Semeado C', 'renderings')$q$,
  (select tenant_a from ids), (select tarefa from ids),
  (select tenant_a from ids), (select tarefa from ids),
  (select tenant_a from ids), (select tarefa from ids)));

select pg_temp.rec('2.2', 'a semeadura da etapa vira UM evento com a contagem', '{"count": 3}',
  pg_temp.evento('objectives_seeded'));

select pg_temp.rec('2.3', 'e não gera um "objetivo adicionado" por linha', '1',
  pg_temp.quantos('objective_added'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$update public.task_checklist_items set is_completed = true where id = %L$q$, (select objetivo from ids)));

select pg_temp.rec('2.4', 'concluir objetivo vira evento', '{"title": "Objetivo Um"}',
  pg_temp.evento('objective_completed'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$update public.task_checklist_items set is_completed = false, due_date = '2026-11-01' where id = %L$q$,
  (select objetivo from ids)));

select pg_temp.rec('2.5', 'reabrir também', '{"title": "Objetivo Um"}',
  pg_temp.evento('objective_reopened'));

select pg_temp.rec('2.6', 'prazo do objetivo também', '{"to": "2026-11-01", "from": null, "title": "Objetivo Um"}',
  pg_temp.evento('objective_due_changed'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$insert into public.task_checklist_item_assignees (tenant_id, item_id, collaborator_id) values (%L, %L, %L)$q$,
  (select tenant_a from ids), (select objetivo from ids), (select col_outro from ids)));

select pg_temp.rec('2.7', 'responsável do objetivo entra no histórico com o nome',
  '{"title": "Objetivo Um", "person": "Camila Executora"}', pg_temp.evento('objective_assignee_added'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$delete from public.task_checklist_item_assignees where item_id = %L and collaborator_id = %L$q$,
  (select objetivo from ids), (select col_outro from ids)));

select pg_temp.rec('2.8', 'e a retirada também', '{"title": "Objetivo Um", "person": "Camila Executora"}',
  pg_temp.evento('objective_assignee_removed'));

select pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
  $q$delete from public.task_checklist_items where id = %L$q$, (select objetivo from ids)));

select pg_temp.rec('2.9', 'remover objetivo vira evento', '{"title": "Objetivo Um"}',
  pg_temp.evento('objective_removed'));

-- 3. QUEM ALCANÇA -------------------------------------------------------------------

select pg_temp.rec('3.1', 'o escritório lê o próprio histórico', 'true',
  (pg_temp.valor_as((select user_flow from ids), (select tenant_a from ids),
    format('select count(*) from public.task_events where task_id = %L', (select tarefa from ids)))::int > 8)::text);

select pg_temp.rec('3.2', 'escritório vizinho não lê', '0',
  pg_temp.valor_as((select user_b from ids), (select tenant_b from ids),
    'select count(*) from public.task_events'));

select pg_temp.rec('3.3', 'ninguém escreve no histórico pela API', 'ERR:42501',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids), format(
    $q$insert into public.task_events (tenant_id, task_id, kind) values (%L, %L, 'task_created')$q$,
    (select tenant_a from ids), (select tarefa from ids))));

select pg_temp.rec('3.4', 'nem reescreve o passado', 'ERR:42501',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    format('update public.task_events set kind = %L where task_id = %L', 'task_created', (select tarefa from ids))));

select pg_temp.rec('3.5', 'nem apaga', 'ERR:42501',
  pg_temp.exec_as((select user_flow from ids), (select tenant_a from ids),
    format('delete from public.task_events where task_id = %L', (select tarefa from ids))));

select pg_temp.rec('3.6', 'anon não alcança', 'false',
  has_table_privilege('anon', 'public.task_events', 'select')::text);

/* Sem JWT: é o seed, ou uma correção feita direto no banco. O evento existe e
   fica sem autor — a tela mostra "Sistema". */
/* Limpa a sessão que ficou dos casos anteriores: aqui a escrita é sem JWT. */
select set_config('request.jwt.claims', '', true);

update public.tasks set start_date = '2026-09-01' where id = (select tarefa from ids);

select pg_temp.rec('3.7', 'escrita sem sessão fica sem autor, e não sem evento', '(sem autor)',
  pg_temp.autor('start_date_changed'));

-- 4. O QUE CAI JUNTO -------------------------------------------------------------------

delete from public.tasks where id = (select tarefa from ids);

select pg_temp.rec('4.1', 'apagar a tarefa leva o histórico dela', '0',
  (select count(*)::text from public.task_events where task_id = (select tarefa from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
