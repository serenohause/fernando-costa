-- O que precisa ser verdade ANTES de a migration 0094 tocar em produção.
--
-- POR QUE ESTE ARQUIVO EXISTE
--   A 0094 troca o tipo de seis colunas e cria uma chave estrangeira sobre dados
--   que já existem. Diferente das outras migrations do projeto, ela não pode ser
--   "tentada": `alter column type` reescreve a tabela, e a Management API não
--   desfaz nada sozinha se algo falhar no meio.
--
--   A única coisa que pode fazê-la falhar é DADO — uma tarefa cuja fase não
--   tenha etapa correspondente no quadro do escritório dela. Nesse caso o
--   `add constraint ... foreign key` é recusado e a migration para no meio, com
--   as colunas já convertidas e sem a integridade nova. Este arquivo responde
--   essa pergunta ANTES, em consulta que não escreve nada.
--
-- COMO RODAR (com o ambiente de produção ativo)
--   npm run env:prod
--   supabase/tests/run-sql.sh supabase/tests/kanban-preflight.sql
--
--   TODOS OS CASOS PRECISAM PASSAR. Qualquer FAIL significa que a 0093 não
--   chegou àquele escritório, ou que existe tarefa numa fase sem etapa — e a
--   0094 falharia no meio.
--
-- RESIDUO
--   Nenhum. Só leitura, sem transação de escrita.

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

-- 1. A 0093 chegou inteira ------------------------------------------------------
--
--    A 0094 constrói sobre ela. Se algum escritório não tiver quadro, ou tiver
--    quadro incompleto, a chave estrangeira não acha destino para as tarefas.

select pg_temp.rec('1.1', 'todo escritório tem o quadro do Fluxo do Projeto', '(nenhum sem quadro)',
  coalesce((
    select string_agg(t.slug, ', ')
    from public.tenants t
    where not exists (
      select 1 from public.kanban_boards b
      where b.tenant_id = t.id and b.key = 'project_flow')
  ), '(nenhum sem quadro)'));

select pg_temp.rec('1.2', 'todo quadro tem as 15 etapas semeadas', '(nenhum incompleto)',
  coalesce((
    select string_agg(t.slug || ': ' || cnt::text, ', ')
    from public.tenants t
    join lateral (
      select count(*) as cnt
      from public.kanban_columns c
      join public.kanban_boards b on b.id = c.board_id
      where c.tenant_id = t.id and b.key = 'project_flow'
    ) s on true
    where s.cnt <> 15
  ), '(nenhum incompleto)'));

-- 2. A CHAVE ESTRANGEIRA VAI PASSAR ---------------------------------------------
--
--    É o caso que decide se a migration pode rodar. A pergunta é feita
--    exatamente como o Postgres a fará: existe etapa com esta chave NESTE
--    escritório?

select pg_temp.rec('2.1', 'toda tarefa tem etapa correspondente no quadro do escritório dela',
  '(nenhuma órfã)',
  coalesce((
    select string_agg(distinct t.phase::text || ' (' || tn.slug || ')', ', ')
    from public.tasks t
    join public.tenants tn on tn.id = t.tenant_id
    where t.phase is not null
      and not exists (
        select 1 from public.kanban_columns c
        where c.tenant_id = t.tenant_id and c.key = t.phase::text)
  ), '(nenhuma órfã)'));

/*
  A chave estrangeira aceita nulo (MATCH SIMPLE), então tarefa sem fase não
  impede nada. O caso é informativo: um número alto aqui é sinal de importação
  incompleta, e vale saber antes.
*/
select pg_temp.rec('2.2', 'quantas tarefas estão sem fase (informativo, não bloqueia)', '(informativo)',
  (select count(*)::text from public.tasks where phase is null));

-- 3. As duas etapas estruturais existem -----------------------------------------
--
--    O gatilho da 0094 protege 'not_started' e 'finished' contra exclusão, e
--    `calculateProjectPhase` grava esses dois valores sozinho. Se faltarem, o
--    projeto sem tarefas e o projeto concluído ficariam apontando para etapa
--    inexistente.

select pg_temp.rec('3.1', 'todo quadro tem "Não iniciado" e "Finalizado"', '(nenhum faltando)',
  coalesce((
    select string_agg(t.slug, ', ')
    from public.tenants t
    where (
      select count(*) from public.kanban_columns c
      join public.kanban_boards b on b.id = c.board_id
      where c.tenant_id = t.id and b.key = 'project_flow'
        and c.key in ('not_started', 'finished')
    ) <> 2
  ), '(nenhum faltando)'));

-- 4. O que a migration vai reescrever -------------------------------------------
--
--    `alter column type` reescreve a tabela inteira e pega lock exclusivo nela.
--    Os números abaixo dizem por quanto tempo o sistema fica indisponível para
--    escrita — com estas ordens de grandeza, é instantâneo; se um dia passarem
--    de centenas de milhares, a conversa muda.

select pg_temp.rec('4.1', 'linhas a reescrever (tasks / projects / itens de checklist / diário)',
  '(informativo)',
  (select count(*) from public.tasks)::text || ' / ' ||
  (select count(*) from public.projects)::text || ' / ' ||
  ((select count(*) from public.task_checklist_items) +
   (select count(*) from public.project_checklist_items))::text || ' / ' ||
  (select count(*) from public.project_diary_entries)::text);

-- 5. A migration ainda não foi aplicada -----------------------------------------
--
--    Rodar duas vezes falharia no `add constraint` já existente. O caso separa
--    "ainda não apliquei" de "já apliquei e esqueci".

select pg_temp.rec('5.1', 'tasks.phase ainda é o enum (a 0094 ainda não rodou aqui)', 'USER-DEFINED',
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'phase'));

select case when observed = expected or expected = '(informativo)' then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;
