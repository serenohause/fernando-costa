-- Ambientes do projeto e os objetivos de ambiente no quadro (migration 0100).
--
-- O QUE ELE PROVA
--   1. Ambiente se grava com a permissão de Projetos, e escritório vizinho não
--      lê nem grava.
--   2. A unicidade do título virou parcial SEM afrouxar o que existia: objetivo
--      comum continua único por título; o de ambiente pode repetir em etapas
--      diferentes, mas não na mesma.
--   3. Ambiente de outro projeto não entra no cartão.
--   4. Renomear o ambiente renomeia os objetivos — mesmo quando quem renomeia
--      não edita o Fluxo do Projeto — e excluir o ambiente tira os objetivos.
--   5. O toggle nasce desligado.
--
-- COMO RODAR
--   npm run test:rooms
--
-- RESIDUO
--   Nenhum. Uma transação terminada em ROLLBACK (slug rooms-*).

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
  'cccc0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'cccc0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'cccc0000-0000-4000-8000-00000000001a'::uuid as user_arq_a,
  'cccc0000-0000-4000-8000-00000000002a'::uuid as user_proj_a,
  'cccc0000-0000-4000-8000-00000000001b'::uuid as user_dir_b,
  'cccc0000-0000-4000-8000-00000000003a'::uuid as col_arq_a,
  'cccc0000-0000-4000-8000-00000000004a'::uuid as col_proj_a,
  'cccc0000-0000-4000-8000-00000000003b'::uuid as col_dir_b,
  'cccc0000-0000-4000-8000-0000000000a1'::uuid as projeto_1,
  'cccc0000-0000-4000-8000-0000000000a2'::uuid as projeto_2,
  'cccc0000-0000-4000-8000-0000000000b1'::uuid as tarefa_1,
  'cccc0000-0000-4000-8000-0000000000c1'::uuid as sala_1,
  'cccc0000-0000-4000-8000-0000000000c2'::uuid as sala_2;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_arq_a from ids) u, 'rooms-arq-a@example.test' e
  union all select (select user_proj_a from ids), 'rooms-proj-a@example.test'
  union all select (select user_dir_b from ids), 'rooms-dir-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Ambientes A', 'rooms-a'),
  ((select tenant_b from ids), 'Ambientes B', 'rooms-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  /* Edita o Fluxo, só VÊ Projetos: o negativo da escrita de ambiente. */
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq@rooms-a.test', 'architect', 'projects', 'active'),
  /* Edita Projetos e NÃO edita o Fluxo: prova que renomear o ambiente chega aos
     objetivos mesmo sem permissão sobre eles. */
  ((select col_proj_a from ids), (select tenant_a from ids), (select user_proj_a from ids),
   'Projetista A', 'proj@rooms-a.test', 'architect', 'projects', 'active'),
  ((select col_dir_b from ids), (select tenant_b from ids), (select user_dir_b from ids),
   'Diretora B', 'dir@rooms-b.test', 'director', 'administrative', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_arq_a from ids), 'projects', true, false),
  ((select tenant_a from ids), (select col_arq_a from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select col_proj_a from ids), 'projects', true, true),
  ((select tenant_a from ids), (select col_proj_a from ids), 'project_flow', true, false);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select projeto_1 from ids), (select tenant_a from ids), 'Projeto Um', 'architecture'),
  ((select projeto_2 from ids), (select tenant_a from ids), 'Projeto Dois', 'architecture');

insert into public.tasks (id, tenant_id, project_id, title, phase, status) values
  ((select tarefa_1 from ids), (select tenant_a from ids), (select projeto_1 from ids),
   'Tarefa Um', 'layout', 'in_progress');

create or replace function pg_temp.sala(p_id uuid, p_projeto uuid, p_nome text) returns text language sql as $$
  select format('insert into public.project_rooms (id, tenant_id, project_id, name) values (%L, %L, %L, %L)',
    p_id, (select tenant_a from ids), p_projeto, p_nome)
$$;

create or replace function pg_temp.item(p_titulo text, p_fase text, p_sala uuid) returns text language sql as $$
  select format('insert into public.task_checklist_items (tenant_id, task_id, title, phase, room_id) values (%L, %L, %L, %L, %L)',
    (select tenant_a from ids), (select tarefa_1 from ids), p_titulo, p_fase, p_sala)
$$;

-- 1. QUEM GRAVA AMBIENTE -------------------------------------------------------

select pg_temp.rec('1.1', 'quem edita Projetos cria ambiente', '1',
  pg_temp.exec_as((select user_proj_a from ids), (select tenant_a from ids),
    pg_temp.sala((select sala_1 from ids), (select projeto_1 from ids), 'Sala')));

select pg_temp.rec('1.2', 'quem só vê Projetos não cria', 'ERR:42501',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids),
    pg_temp.sala(gen_random_uuid(), (select projeto_1 from ids), 'Cozinha')));

select pg_temp.rec('1.3', 'CONTROLE: quem só vê Projetos LÊ os ambientes (o quadro precisa)', '1',
  pg_temp.valor_as((select user_arq_a from ids), (select tenant_a from ids),
    'select count(*) from public.project_rooms'));

select pg_temp.rec('1.4', 'outro escritório não lê os ambientes de A', '0',
  pg_temp.valor_as((select user_dir_b from ids), (select tenant_b from ids),
    'select count(*) from public.project_rooms'));

select pg_temp.rec('1.5', 'outro escritório não grava ambiente em A', 'ERR:42501',
  pg_temp.exec_as((select user_dir_b from ids), (select tenant_b from ids),
    pg_temp.sala(gen_random_uuid(), (select projeto_1 from ids), 'Invasor')));

select pg_temp.rec('1.6', 'nome repetido no mesmo projeto é recusado', 'ERR:23505',
  pg_temp.exec_as((select user_proj_a from ids), (select tenant_a from ids),
    pg_temp.sala(gen_random_uuid(), (select projeto_1 from ids), 'Sala')));

select pg_temp.rec('1.7', 'mesmo nome em outro projeto é aceito', '1',
  pg_temp.exec_as((select user_proj_a from ids), (select tenant_a from ids),
    pg_temp.sala((select sala_2 from ids), (select projeto_2 from ids), 'Sala')));

select pg_temp.rec('1.8', 'nome em branco é recusado', 'ERR:23514',
  pg_temp.exec_as((select user_proj_a from ids), (select tenant_a from ids),
    pg_temp.sala(gen_random_uuid(), (select projeto_1 from ids), '   ')));

-- 2. OBJETIVOS DE AMBIENTE -------------------------------------------------------

select pg_temp.rec('2.1', 'objetivo de ambiente entra na etapa', '1',
  pg_temp.exec_pg(pg_temp.item('Sala', 'layout', (select sala_1 from ids))));

select pg_temp.rec('2.2', 'o mesmo ambiente na mesma etapa é recusado', 'ERR:23505',
  pg_temp.exec_pg(pg_temp.item('Sala', 'layout', (select sala_1 from ids))));

select pg_temp.rec('2.3', 'o mesmo ambiente em OUTRA etapa é aceito', '1',
  pg_temp.exec_pg(pg_temp.item('Sala', 'renderings', (select sala_1 from ids))));

select pg_temp.rec('2.4', 'objetivo comum com o título de um ambiente é aceito', '1',
  pg_temp.exec_pg(pg_temp.item('Sala', 'layout', null)));

select pg_temp.rec('2.5', 'objetivo comum repetido CONTINUA recusado', 'ERR:23505',
  pg_temp.exec_pg(pg_temp.item('Sala', 'briefing', null)));

select pg_temp.rec('2.6', 'e com o mesmo nome de restrição de antes', 'task_checklist_items_task_id_title_key',
  (select indexrelid::regclass::text from pg_index
    where indrelid = 'public.task_checklist_items'::regclass
      and indexrelid::regclass::text = 'task_checklist_items_task_id_title_key'));

select pg_temp.rec('2.7', 'ambiente de outro projeto não entra no cartão', 'ERR:23514',
  pg_temp.exec_pg(pg_temp.item('Sala do outro', 'briefing', (select sala_2 from ids))));

select pg_temp.rec('2.8', 'objetivo de ambiente sem etapa é recusado', 'ERR:23514',
  pg_temp.exec_pg(pg_temp.item('Sala', null, (select sala_1 from ids))));

-- 3. RENOMEAR E EXCLUIR ----------------------------------------------------------

select pg_temp.rec('3.1', 'quem edita Projetos (e não o Fluxo) renomeia o ambiente', '1',
  pg_temp.exec_as((select user_proj_a from ids), (select tenant_a from ids),
    format('update public.project_rooms set name = %L where id = %L', 'Sala de estar', (select sala_1 from ids))));

select pg_temp.rec('3.2', 'e os dois objetivos do ambiente passam a ter o nome novo', '2',
  (select count(*)::text from public.task_checklist_items
    where room_id = (select sala_1 from ids) and title = 'Sala de estar'));

select pg_temp.rec('3.3', 'o objetivo comum "Sala" não é tocado', '1',
  (select count(*)::text from public.task_checklist_items
    where task_id = (select tarefa_1 from ids) and room_id is null and title = 'Sala'));

select pg_temp.rec('3.4', 'quem edita Projetos exclui o ambiente', '1',
  pg_temp.exec_as((select user_proj_a from ids), (select tenant_a from ids),
    format('delete from public.project_rooms where id = %L', (select sala_1 from ids))));

select pg_temp.rec('3.5', 'e os objetivos dele saem das tarefas', '0',
  (select count(*)::text from public.task_checklist_items where title = 'Sala de estar'
     and task_id = (select tarefa_1 from ids)));

select pg_temp.rec('3.6', 'CONTROLE: o objetivo comum continua', '1',
  (select count(*)::text from public.task_checklist_items
    where task_id = (select tarefa_1 from ids) and title = 'Sala'));

-- 4. TOGGLE E ACESSO -------------------------------------------------------------

select pg_temp.rec('4.1', 'toggle nasce desligado em todas as etapas', '0',
  (select count(*)::text from public.kanban_columns
    where tenant_id = (select tenant_a from ids) and shows_project_rooms));

select pg_temp.rec('4.2', 'escritórios que já existiam também ficaram desligados', '0',
  (select count(*)::text from public.kanban_columns where shows_project_rooms));

select pg_temp.rec('4.3', 'RLS ligada em project_rooms', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.project_rooms'::regclass));

select pg_temp.rec('4.4', 'anon não lê ambientes', 'false',
  has_table_privilege('anon', 'public.project_rooms', 'select')::text);

select pg_temp.rec('4.5', 'authenticated não chama as funções dos gatilhos', 'false',
  (has_function_privilege('authenticated', 'public.sync_room_name_to_checklist()', 'execute')
   or has_function_privilege('authenticated', 'public.check_checklist_room_project()', 'execute'))::text);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
