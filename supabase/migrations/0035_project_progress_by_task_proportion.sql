-- O progresso do projeto passa a ser a proporcao de tarefas concluidas.
--
-- O QUE ESTAVA ERRADO, E POR QUE FOI PORTADO ASSIM
--   A 0034 reproduziu literalmente o calculo de
--   projeto-original/src/components/utils/projectProgressCalculator.jsx: um
--   MAX sobre as tarefas, em que tarefa concluida vale 100. O efeito e que UMA
--   tarefa concluida leva o projeto inteiro a 100%, mesmo com as outras nove no
--   comeco.
--
--   Portar literal foi o certo: e numero visivel, mudar por conta propria
--   alteraria o percentual de todo projeto meio andado sem ninguem pedir. O
--   usuario decidiu corrigir.
--
-- O QUE MUDA
--   `progress_percent` passa a ser tarefas concluidas sobre o total de tarefas.
--   Nove por fazer e uma pronta viram 10%, e nao 100%.
--
--   A escala por fase NAO se perde: vira `phase_percent`, coluna propria. Ela
--   carrega informacao que a proporcao nao carrega — um projeto cuja tarefa mais
--   avancada esta em Projeto Executivo esta adiantado no funil de entrega, ainda
--   que poucas tarefas estejam fechadas. Os paineis do modulo 10 escolhem qual
--   das duas usar, e as duas ficam declaradas em vez de uma esconder a outra.
--
--   `phase_percent` mantem a escala do original, mas SEM o atalho de tarefa
--   concluida: ela descreve a fase alcancada, e conclusao de tarefa e o que
--   `progress_percent` mede. Era a mistura dos dois sinais numa conta so que
--   produzia o 100% precoce.
--
-- CONTAGEM DISTINTA, e nao count(*)
--   O join com task_checklist_items multiplica a linha da tarefa por item de
--   checklist. Contar tarefa sem `distinct` daria peso maior a tarefa com mais
--   itens — o projeto ficaria mais "concluido" por ter checklist grande numa
--   tarefa pronta. Erro que so aparece quando alguem preenche checklist, ou
--   seja, tarde.

-- DROP antes do CREATE, e nao `create or replace`.
--
-- `create or replace view` so aceita acrescentar coluna NO FIM, e recusa
-- renomear ou reordenar as existentes: aqui `phase_percent` entra entre
-- `progress_percent` e `required_items_total`, e o Postgres le isso como
-- "renomear required_items_total para phase_percent" (SQLSTATE 42P16).
--
-- Derrubar e recriar e seguro porque nada depende desta view ainda — o modulo
-- 10 (paineis), que vai ler dela, nem comecou. Se um dia houver dependente,
-- este DROP falha em cascata e o alerta e legitimo.
drop view if exists public.project_progress;

create view public.project_progress
with (security_invoker = true) as
select
  p.id as project_id,
  p.tenant_id,

  -- Proporcao de tarefas concluidas. Projeto sem tarefa nenhuma da 0, e nao
  -- nulo: painel que soma nulo produz buraco em vez de zero.
  case
    when count(distinct t.id) = 0 then 0
    else round(
      100.0 * count(distinct t.id) filter (where t.status = 'completed')
            / count(distinct t.id)
    )
  end::smallint as progress_percent,

  -- Fase alcancada, na escala do original, SEM o atalho de tarefa concluida.
  -- 'awaiting_client' continua sem percentual proprio e e ignorada na
  -- comparacao, como no original: esperar o cliente nao avanca nem retrocede.
  coalesce(
    max(
      case t.phase
        when 'not_started' then 0
        when 'briefing' then 12
        when 'layout' then 26
        when 'renderings' then 50
        when 'revision' then 55
        when 'legal_permit' then 70
        when 'hoa_approval' then 75
        when 'construction_docs' then 80
        when 'engineering_docs' then 90
        when 'building_permit' then 100
        when 'finished' then 100
        when 'awaiting_client' then null
      end
    ),
    0
  )::smallint as phase_percent,

  count(distinct t.id)::int as tasks_total,
  count(distinct t.id) filter (where t.status = 'completed')::int as tasks_completed,

  count(ci.id) filter (where ci.is_required)::int as required_items_total,
  count(ci.id) filter (where ci.is_required and ci.is_completed)::int as required_items_completed
from public.projects p
left join public.tasks t
  on t.project_id = p.id
 and t.tenant_id = p.tenant_id
left join public.task_checklist_items ci
  on ci.task_id = t.id
 and ci.tenant_id = t.tenant_id
group by p.id, p.tenant_id;

comment on view public.project_progress is
  'Progresso do projeto, calculado a partir das tarefas. Substitui as colunas progresso_percentual, tarefas_total_obrigatorias e tarefas_concluidas_obrigatorias de Project, que no base44 o frontend grava de volta a cada mudanca de tarefa - coluna derivada escrita pela aplicacao so esta certa enquanto toda mudanca passar pelo mesmo caminho. SECURITY INVOKER: as policies da 0033 valem para quem consulta; sem isso a view rodaria como o dono e devolveria projeto de outro escritorio. Devolve uma linha por projeto, inclusive projeto sem tarefa nenhuma.';

comment on column public.project_progress.progress_percent is
  'Tarefas concluidas sobre o total de tarefas. DIVERGE do original de proposito, por decisao do usuario: la o calculo e um MAX em que tarefa concluida vale 100, entao UMA tarefa pronta levava o projeto inteiro a 100%. Ver o cabecalho da migration 0035.';

comment on column public.project_progress.phase_percent is
  'Fase mais avancada alcancada pelas tarefas, na escala do original. Sem o atalho de tarefa concluida - era a mistura desse atalho com a escala de fase que produzia o 100% precoce. Existe separada de progress_percent porque carrega informacao diferente: um projeto cuja tarefa mais avancada esta em Projeto Executivo esta adiantado na entrega ainda que poucas tarefas estejam fechadas.';

comment on column public.project_progress.tasks_total is
  'Contagem DISTINTA de propósito: o join com task_checklist_items multiplica a linha da tarefa por item de checklist, e contar sem distinct daria peso maior a tarefa com checklist grande.';
