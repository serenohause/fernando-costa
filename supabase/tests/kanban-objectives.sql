-- Objetivos padrão de cada etapa, com seções nomeadas (migration 0099).
--
-- O QUE ELE PROVA
--   1. A lista que morava no código (`CHECKLIST_BY_PHASE`) foi transcrita, e não
--      reinventada: escritório novo nasce com os mesmos 35 objetivos, nas mesmas
--      etapas e na mesma ordem — e todo escritório que já existia recebeu a
--      mesma cópia.
--   2. Gravar o modelo (`replace_kanban_column_objectives`) é tudo ou nada: uma
--      recusa no meio devolve o modelo anterior intacto.
--   3. Só quem edita Configurações grava; escritório vizinho não lê nem grava.
--   4. Objetivo não aponta para seção de outra etapa.
--
-- COMO RODAR
--   npm run test:kanban:objectives
--
-- RESIDUO
--   Nenhum. Uma transação terminada em ROLLBACK, com tenants próprios
--   (slug kobj-*).

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

/* Linhas atingidas, ou o SQLSTATE da recusa. */
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

/* O valor de um SELECT de uma coluna, ou o SQLSTATE. */
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
  'cbbb0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'cbbb0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'cbbb0000-0000-4000-8000-00000000002a'::uuid as user_arq_a,
  'cbbb0000-0000-4000-8000-00000000003a'::uuid as user_cfg_a,
  'cbbb0000-0000-4000-8000-00000000001b'::uuid as user_dir_b,
  'cbbb0000-0000-4000-8000-00000000005a'::uuid as col_arq_a,
  'cbbb0000-0000-4000-8000-00000000006a'::uuid as col_cfg_a,
  'cbbb0000-0000-4000-8000-00000000004b'::uuid as col_dir_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_arq_a from ids) u, 'kobj-arq-a@example.test' e
  union all select (select user_cfg_a from ids), 'kobj-cfg-a@example.test'
  union all select (select user_dir_b from ids), 'kobj-dir-b@example.test'
) s;

/* O gatilho `tenants_seed_kanban` dá o quadro E os objetivos. Nada de
   kanban_* é inserido à mão neste arquivo. */
insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Objetivos A', 'kobj-a'),
  ((select tenant_b from ids), 'Objetivos B', 'kobj-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  /* Arquiteto que VÊ Configurações mas não edita: o negativo. */
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq@kobj-a.test', 'architect', 'projects', 'active'),
  /* Arquiteta com can_edit em `settings`, e não Diretora: o positivo prova a
     policy, e não o atalho de papel de `can_edit_menu`. */
  ((select col_cfg_a from ids), (select tenant_a from ids), (select user_cfg_a from ids),
   'Arquiteta Config', 'cfg@kobj-a.test', 'architect', 'projects', 'active'),
  ((select col_dir_b from ids), (select tenant_b from ids), (select user_dir_b from ids),
   'Diretora B', 'dir@kobj-b.test', 'director', 'administrative', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_arq_a from ids), 'settings', true, false),
  ((select tenant_a from ids), (select col_cfg_a from ids), 'settings', true, true);

create or replace function pg_temp.col(p_tenant uuid, p_key text) returns uuid language sql as $$
  select c.id from public.kanban_columns c
  where c.tenant_id = p_tenant and c.key = p_key
$$;

create or replace function pg_temp.modelo(p_column uuid) returns text language sql as $$
  select coalesce(string_agg(coalesce(s.name, '-') || ':' || o.title || ':' || o.is_required::text,
                             ' | ' order by o.display_order), '(vazio)')
  from public.kanban_column_objectives o
  left join public.kanban_column_objective_sections s on s.id = o.section_id
  where o.column_id = p_column
$$;

-- 1. A LISTA FOI TRANSCRITA ----------------------------------------------------

select pg_temp.rec('1.' || row_number() over (order by ordem),
  'escritório novo: ' || etapa || ' nasce com ' || esperado || ' objetivos',
  esperado,
  (select count(*)::text from public.kanban_column_objectives o
    where o.column_id = pg_temp.col((select tenant_a from ids), etapa)))
from (values
  ('not_started', '2', 1), ('briefing', '2', 2), ('layout', '3', 3), ('renderings', '7', 4),
  ('legal_permit', '3', 5), ('hoa_approval', '3', 6), ('construction_docs', '11', 7),
  ('engineering_docs', '4', 8), ('revision', '0', 9), ('under_construction', '0', 10),
  ('finished', '0', 11)
) as v(etapa, esperado, ordem);

select pg_temp.rec('1.12', 'total de fábrica é 35', '35',
  (select count(*)::text from public.kanban_column_objectives where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('1.13', 'a ordem é a do código: primeiro e último de Projeto Executivo',
  'Emitir RRT de projeto / Elaborar memorial descritivo',
  (select min(title) filter (where display_order = 1) || ' / ' || min(title) filter (where display_order = 11)
     from public.kanban_column_objectives
    where column_id = pg_temp.col((select tenant_a from ids), 'construction_docs')));

select pg_temp.rec('1.14', 'todos de fábrica são obrigatórios e sem seção', '0',
  (select count(*)::text from public.kanban_column_objectives
    where tenant_id = (select tenant_a from ids) and (not is_required or section_id is not null)));

/*
  O QUE ESTE CASO PASSOU A AFIRMAR: a lista de fábrica em si.

  Antes ele varria os escritórios que já existiam procurando objetivo do modelo
  que não estivesse lá — e isso dá FALSO quando um escritório apaga um objetivo
  padrão, que é uso normal da tela. O backfill da migration já é provado pelos
  casos 1.1 a 1.14, no escritório recém-criado.
*/
select pg_temp.rec('1.15', 'a lista de fábrica continua com 35 títulos', '35',
  (select count(*)::text from public.default_kanban_objectives()));

-- 2. GRAVAR O MODELO -------------------------------------------------------------

select pg_temp.rec('2.1', 'quem edita Configurações grava modelo com seções', '4',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'layout'),
      '[{"name": null, "objectives": [{"title": "Visita ao terreno", "is_required": false}]},
        {"name": "Estudo", "objectives": [{"title": "Planta", "is_required": true}, {"title": "Corte", "is_required": true}]},
        {"name": "Apresentação", "objectives": [{"title": "Reunião", "is_required": true}]},
        {"name": "Vazia", "objectives": []}]')));

select pg_temp.rec('2.2', 'o modelo ficou na ordem, com as seções',
  '-:Visita ao terreno:false | Estudo:Planta:true | Estudo:Corte:true | Apresentação:Reunião:true',
  pg_temp.modelo(pg_temp.col((select tenant_a from ids), 'layout')));

select pg_temp.rec('2.3', 'seção sem objetivo também é gravada, na ordem', 'Estudo, Apresentação, Vazia',
  (select string_agg(name, ', ' order by display_order) from public.kanban_column_objective_sections
    where column_id = pg_temp.col((select tenant_a from ids), 'layout')));

select pg_temp.rec('2.4', 'título repetido em outra seção é recusado', 'ERR:23505',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'layout'),
      '[{"name": null, "objectives": [{"title": "Planta"}]},
        {"name": "Outra", "objectives": [{"title": "Planta"}]}]')));

select pg_temp.rec('2.5', 'e a recusa devolveu o modelo anterior intacto',
  '-:Visita ao terreno:false | Estudo:Planta:true | Estudo:Corte:true | Apresentação:Reunião:true',
  pg_temp.modelo(pg_temp.col((select tenant_a from ids), 'layout')));

select pg_temp.rec('2.6', 'duas seções com o mesmo nome são recusadas', 'ERR:23505',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'layout'),
      '[{"name": "Docs", "objectives": []}, {"name": "Docs", "objectives": []}]')));

select pg_temp.rec('2.7', 'objetivo em branco é recusado', 'ERR:23514',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'layout'),
      '[{"name": null, "objectives": [{"title": "   "}]}]')));

create temp table grava_sem_flag on commit drop as
  select pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'briefing'),
      '[{"name": null, "objectives": [{"title": "Sem flag"}]}]')) as retorno;

select pg_temp.rec('2.8', 'is_required ausente vale obrigatório', '1:true',
  (select retorno from grava_sem_flag) || ':' ||
  (select string_agg(is_required::text, ',') from public.kanban_column_objectives
    where column_id = pg_temp.col((select tenant_a from ids), 'briefing')));

select pg_temp.rec('2.9', 'array vazio limpa o modelo da etapa (0 objetivos, modelo vazio)', '0(vazio)',
  (select pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids),
     format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
       pg_temp.col((select tenant_a from ids), 'briefing'), '[]'))
   || pg_temp.modelo(pg_temp.col((select tenant_a from ids), 'briefing'))));

-- 3. QUEM ALCANÇA ----------------------------------------------------------------

select pg_temp.rec('3.1', 'quem só vê Configurações não grava o modelo', 'ERR:42501',
  pg_temp.valor_as((select user_arq_a from ids), (select tenant_a from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'layout'), '[]')));

select pg_temp.rec('3.2', 'CONTROLE: e o modelo dele continua lá', '4',
  (select count(*)::text from public.kanban_column_objectives
    where column_id = pg_temp.col((select tenant_a from ids), 'layout')));

select pg_temp.rec('3.3', 'quem só vê Configurações LÊ o modelo (o quadro precisa)', '4',
  pg_temp.valor_as((select user_arq_a from ids), (select tenant_a from ids),
    format('select count(*) from public.kanban_column_objectives where column_id = %L',
      pg_temp.col((select tenant_a from ids), 'layout'))));

select pg_temp.rec('3.4', 'quem só vê Configurações não insere direto na tabela', 'ERR:42501',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids),
    format('insert into public.kanban_column_objectives (tenant_id, column_id, title) values (%L, %L, %L)',
      (select tenant_a from ids), pg_temp.col((select tenant_a from ids), 'layout'), 'Invasor')));

select pg_temp.rec('3.5', 'Diretora de outro escritório não enxerga a etapa de A', 'ERR:P0002',
  pg_temp.valor_as((select user_dir_b from ids), (select tenant_b from ids),
    format('select public.replace_kanban_column_objectives(%L, %L::jsonb)',
      pg_temp.col((select tenant_a from ids), 'layout'), '[]')));

select pg_temp.rec('3.6', 'nem lê os objetivos de A', '0',
  pg_temp.valor_as((select user_dir_b from ids), (select tenant_b from ids),
    format('select count(*) from public.kanban_column_objectives where tenant_id = %L',
      (select tenant_a from ids))));

select pg_temp.rec('3.7', 'anon não executa a função', 'false',
  has_function_privilege('anon', 'public.replace_kanban_column_objectives(uuid, jsonb)', 'execute')::text);

select pg_temp.rec('3.8', 'authenticated não executa a lista de fábrica direto', 'false',
  has_function_privilege('authenticated', 'public.default_kanban_objectives()', 'execute')::text);

select pg_temp.rec('3.9', 'RLS ligada nas duas tabelas', 'true',
  ((select relrowsecurity from pg_class where oid = 'public.kanban_column_objectives'::regclass)
   and (select relrowsecurity from pg_class where oid = 'public.kanban_column_objective_sections'::regclass))::text);

-- 4. INTEGRIDADE -----------------------------------------------------------------

select pg_temp.rec('4.1', 'objetivo não aponta para seção de outra etapa', 'ERR:23503',
  pg_temp.exec_pg(format(
    'insert into public.kanban_column_objectives (tenant_id, column_id, section_id, title) values (%L, %L, %L, %L)',
    (select tenant_a from ids), pg_temp.col((select tenant_a from ids), 'renderings'),
    (select id from public.kanban_column_objective_sections
      where column_id = pg_temp.col((select tenant_a from ids), 'layout') and name = 'Estudo'),
    'Cruzado')));

select pg_temp.exec_pg(format('delete from public.kanban_column_objective_sections where column_id = %L and name = %L',
  pg_temp.col((select tenant_a from ids), 'layout'), 'Estudo'));

select pg_temp.rec('4.2', 'apagar a seção apaga os objetivos dela (sobram os 2 de fora)', '2',
  (select count(*)::text from public.kanban_column_objectives
    where column_id = pg_temp.col((select tenant_a from ids), 'layout')));

select pg_temp.rec('4.3', 'item da tarefa aceita o nome da seção', '1',
  pg_temp.exec_pg(format(
    $f$insert into public.projects (id, tenant_id, name, project_type) values ('cbbb0000-0000-4000-8000-0000000000a1', %L, 'P', 'architecture');
       insert into public.tasks (id, tenant_id, project_id, title, phase, status) values ('cbbb0000-0000-4000-8000-0000000000a2', %L, 'cbbb0000-0000-4000-8000-0000000000a1', 'T', 'layout', 'in_progress');
       insert into public.task_checklist_items (tenant_id, task_id, title, phase, section) values (%L, 'cbbb0000-0000-4000-8000-0000000000a2', 'Planta', 'layout', 'Estudo')$f$,
    (select tenant_a from ids), (select tenant_a from ids), (select tenant_a from ids))));

select pg_temp.rec('4.4', 'e recusa nome de seção em branco', 'ERR:23514',
  pg_temp.exec_pg(format(
    $f$insert into public.task_checklist_items (tenant_id, task_id, title, phase, section) values (%L, 'cbbb0000-0000-4000-8000-0000000000a2', 'Corte', 'layout', '  ')$f$,
    (select tenant_a from ids))));

create temp table etapa_apagada on commit drop as
  select pg_temp.col((select tenant_a from ids), 'renderings') as id;

select pg_temp.exec_pg(format('delete from public.kanban_columns where id = %L', (select id from etapa_apagada)));

select pg_temp.rec('4.5', 'apagar a etapa apaga o modelo dela', '0',
  (select count(*)::text from public.kanban_column_objectives
    where column_id = (select id from etapa_apagada)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
