-- Botoes de sinalizacao de revisao da etapa, e a marca no ambiente da tarefa
-- (migration 0131).
--
-- O QUE ELE PROVA
--   1. Gravar a lista (`replace_kanban_column_review_marks`) e tudo ou nada, e
--      so quem edita Configuracoes grava.
--   2. Escritorio vizinho nao le nem grava os botoes de ninguem.
--   3. A MARCA SOBREVIVE AO BOTAO. E o ponto central do desenho: rotulo e cor
--      sao copiados para a tarefa, entao renomear ou apagar o botao nao reescreve
--      nem apaga revisao ja feita. Um teste que nao afirme isso deixa a proxima
--      pessoa "consertar" a copia trocando-a por chave estrangeira.
--   4. Marcar NAO conclui o objetivo, e a constraint que impede marca pela
--      metade (cor, autor ou instante sem rotulo) esta de pe.
--   5. Rotulo repetido na mesma etapa e recusado.
--
-- COMO RODAR
--   npm run test:kanban:revisao
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenants proprios
--   (slug krev-*).

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
  'cccc0000-0000-4000-8000-00000000002a'::uuid as user_arq_a,
  'cccc0000-0000-4000-8000-00000000003a'::uuid as user_cfg_a,
  'cccc0000-0000-4000-8000-00000000001b'::uuid as user_dir_b,
  'cccc0000-0000-4000-8000-00000000005a'::uuid as col_arq_a,
  'cccc0000-0000-4000-8000-00000000006a'::uuid as col_cfg_a,
  'cccc0000-0000-4000-8000-00000000004b'::uuid as col_dir_b,
  'cccc0000-0000-4000-8000-00000000007a'::uuid as projeto_a,
  'cccc0000-0000-4000-8000-00000000008a'::uuid as tarefa_a,
  'cccc0000-0000-4000-8000-00000000009a'::uuid as ambiente_a,
  'cccc0000-0000-4000-8000-0000000000aa'::uuid as item_a;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_arq_a from ids) u, 'krev-arq-a@example.test' e
  union all select (select user_cfg_a from ids), 'krev-cfg-a@example.test'
  union all select (select user_dir_b from ids), 'krev-dir-b@example.test'
) s;

/* O gatilho `tenants_seed_kanban` da o quadro inteiro. Nada de kanban_* e
   inserido a mao aqui. */
insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Revisao A', 'krev-a'),
  ((select tenant_b from ids), 'Revisao B', 'krev-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  /* Arquiteto que VE Configuracoes e nao edita: o negativo. Ele TAMBEM edita o
     fluxo do projeto, porque e ele quem marca a revisao - as duas permissoes sao
     recortes diferentes, e este arquivo prova isso. */
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq@krev-a.test', 'architect', 'projects', 'active'),
  ((select col_cfg_a from ids), (select tenant_a from ids), (select user_cfg_a from ids),
   'Arquiteta Config', 'cfg@krev-a.test', 'architect', 'projects', 'active'),
  ((select col_dir_b from ids), (select tenant_b from ids), (select user_dir_b from ids),
   'Diretora B', 'dir@krev-b.test', 'director', 'administrative', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_arq_a from ids), 'settings', true, false),
  ((select tenant_a from ids), (select col_arq_a from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select col_cfg_a from ids), 'settings', true, true);

create or replace function pg_temp.col(p_tenant uuid, p_key text) returns uuid language sql as $$
  select c.id from public.kanban_columns c
  where c.tenant_id = p_tenant and c.key = p_key
$$;

create or replace function pg_temp.botoes(p_column uuid) returns text language sql as $$
  select coalesce(string_agg(m.label || ':' || m.color, ' | ' order by m.display_order), '(vazio)')
  from public.kanban_column_review_marks m
  where m.column_id = p_column
$$;

/* Uma tarefa com um objetivo de AMBIENTE, que e onde a marca mora. */
insert into public.projects (id, tenant_id, name, project_type) values
  ((select projeto_a from ids), (select tenant_a from ids), 'Casa da revisao', 'architecture');

insert into public.project_rooms (id, tenant_id, project_id, name, display_order) values
  ((select ambiente_a from ids), (select tenant_a from ids), (select projeto_a from ids), 'Sala', 1);

insert into public.tasks (id, tenant_id, project_id, title, phase) values
  ((select tarefa_a from ids), (select tenant_a from ids), (select projeto_a from ids),
   'Revisar ambientes', 'preliminary_study');

/* `phase` vem junto porque `task_checklist_items_room_requires_phase_check`
   (0100) cobra: objetivo de ambiente pertence a uma etapa, e e ela que diz
   quais botoes de revisao valem ali. */
insert into public.task_checklist_items (id, tenant_id, task_id, title, is_required, room_id, section, phase) values
  ((select item_a from ids), (select tenant_a from ids), (select tarefa_a from ids),
   'Sala', true, (select ambiente_a from ids), 'Ambientes', 'preliminary_study');

-- 1. GRAVAR A LISTA --------------------------------------------------------------

select pg_temp.rec('1.1', 'quem edita Configuracoes grava os tres botoes', '3',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '[
      {"label":"Aprovado","color":"emerald"},
      {"label":"Reprovado","color":"rose"},
      {"label":"Alterado","color":"amber"}]'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('1.2', 'os tres ficaram na ordem pedida',
  'Aprovado:emerald | Reprovado:rose | Alterado:amber',
  pg_temp.botoes(pg_temp.col((select tenant_a from ids), 'preliminary_study')));

/* Quem so VE Configuracoes nao grava. A funcao recusa antes de apagar nada, e e
   por isso que o caso seguinte confere a lista: recusa que apaga e pior do que
   recusa. */
select pg_temp.rec('1.3', 'quem so VE Configuracoes nao grava', 'ERR:42501',
  pg_temp.valor_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '[{"label":"Invadido","color":"rose"}]'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('1.4', 'CONTROLE: a lista continua intacta depois da recusa',
  'Aprovado:emerald | Reprovado:rose | Alterado:amber',
  pg_temp.botoes(pg_temp.col((select tenant_a from ids), 'preliminary_study')));

select pg_temp.rec('1.5', 'lista vazia apaga todos os botoes da etapa', '0',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '[]'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'layout'))));

select pg_temp.rec('1.6', 'argumento que nao e lista e recusado', 'ERR:22023',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '{"label":"Nao e lista"}'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('1.7', 'rotulo repetido na mesma etapa e recusado', 'ERR:23505',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '[
      {"label":"Aprovado","color":"emerald"},
      {"label":"Aprovado","color":"rose"}]'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('1.8', 'CONTROLE: a recusa de repetido nao deixou meia lista',
  'Aprovado:emerald | Reprovado:rose | Alterado:amber',
  pg_temp.botoes(pg_temp.col((select tenant_a from ids), 'preliminary_study')));

-- 2. QUEM ALCANCA ----------------------------------------------------------------

select pg_temp.rec('2.1', 'CONTROLE: colaborador do escritorio LE os botoes', '3',
  pg_temp.valor_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    select count(*)::text from public.kanban_column_review_marks where column_id = %L
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('2.2', 'escritorio vizinho NAO le os botoes de A', '0',
  pg_temp.valor_as((select user_dir_b from ids), (select tenant_b from ids), format($q$
    select count(*)::text from public.kanban_column_review_marks where column_id = %L
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('2.3', 'Diretora do vizinho nao grava na etapa de A', 'ERR:P0002',
  pg_temp.valor_as((select user_dir_b from ids), (select tenant_b from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '[{"label":"Invadido","color":"rose"}]'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

/* 42501 e nao "zero linhas": anon nao tem GRANT nenhum nesta tabela, entao a
   recusa vem do privilegio, antes de a RLS opinar. Sao as duas metades da
   tranca que a 0007 registrou, e a de cima basta. */
select pg_temp.rec('2.4', 'anon nao alcanca a tabela de botoes', 'ERR:42501', (
  select pg_temp.exec_pg($q$
    set local role anon;
    select 1 from public.kanban_column_review_marks
  $q$)));

-- 3. A MARCA NO AMBIENTE DA TAREFA -------------------------------------------------

select pg_temp.rec('3.1', 'quem edita o Fluxo do Projeto marca a revisao', '1',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    update public.task_checklist_items
       set review_mark_label = 'Aprovado',
           review_mark_color = 'emerald',
           review_marked_by_id = %L,
           review_marked_at = now()
     where id = %L
  $q$, (select col_arq_a from ids), (select item_a from ids))));

select pg_temp.rec('3.2', 'MARCAR NAO CONCLUI o objetivo', 'false',
  (select is_completed::text from public.task_checklist_items where id = (select item_a from ids)));

/* O ponto central do desenho da 0131. Se um dia alguem trocar a copia por chave
   estrangeira, e este caso que cai. */
select pg_temp.rec('3.3', 'apagar os botoes da etapa NAO apaga a marca', '0',
  pg_temp.valor_as((select user_cfg_a from ids), (select tenant_a from ids), format($q$
    select public.replace_kanban_column_review_marks(%L, '[]'::jsonb)
  $q$, pg_temp.col((select tenant_a from ids), 'preliminary_study'))));

select pg_temp.rec('3.4', 'CONTROLE: a marca continua la, com rotulo e cor', 'Aprovado:emerald',
  (select review_mark_label || ':' || review_mark_color
     from public.task_checklist_items where id = (select item_a from ids)));

select pg_temp.rec('3.5', 'desmarcar zera os quatro campos de uma vez', '1',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    update public.task_checklist_items
       set review_mark_label = null, review_mark_color = null,
           review_marked_by_id = null, review_marked_at = null
     where id = %L
  $q$, (select item_a from ids))));

select pg_temp.rec('3.6', 'cor sem rotulo e recusada pelo banco', 'ERR:23514',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    update public.task_checklist_items set review_mark_color = 'rose' where id = %L
  $q$, (select item_a from ids))));

select pg_temp.rec('3.7', 'autor sem rotulo e recusado pelo banco', 'ERR:23514',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    update public.task_checklist_items set review_marked_by_id = %L where id = %L
  $q$, (select col_arq_a from ids), (select item_a from ids))));

select pg_temp.rec('3.8', 'rotulo em branco e recusado pelo banco', 'ERR:23514',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids), format($q$
    update public.task_checklist_items set review_mark_label = '   ' where id = %L
  $q$, (select item_a from ids))));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
