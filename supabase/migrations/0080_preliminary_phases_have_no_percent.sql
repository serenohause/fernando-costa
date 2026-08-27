-- As duas fases novas entram na escala de progresso SEM percentual proprio.
--
-- POR QUE NULO, E NAO UM NUMERO ENTRE OS VIZINHOS
--   A producao do escritorio nao da percentual a elas: `FASE_PERCENTUAIS`
--   (nova-versao/src/components/utils/projectProgressCalculator.jsx:2-16) lista
--   13 fases e nenhuma das duas esta la, entao o calculo de la simplesmente as
--   ignora (`percentage !== undefined`, linha 53).
--
--   Inventar um numero aqui seria a mesma coisa que a 0075 recusou a fazer com
--   `awaiting_client`, e com a mesma consequencia: o percentual de um projeto
--   passaria a sair de uma regra que ninguem escreveu, num numero que a diretoria
--   le como fato.
--
--   NULO tem significado definido nesta view desde a 0075: some do max(), e o
--   projeto fica valendo a fase mais avancada entre as DEMAIS tarefas. Projeto
--   cuja UNICA tarefa esta em estudo preliminar cai no coalesce e vale 0 — que e
--   o que a producao tambem mostra, porque la a fase nao pontua.
--
-- POR QUE `create or replace` E NAO `drop`
--   Recriar a view apaga o GRANT junto, e foi assim que a leitura de
--   project_progress quebrou na 0036. `create or replace` mantem privilegio e
--   dependencia.

create or replace view public.project_progress
with (security_invoker = true) as
select
  agg.project_id,
  agg.tenant_id,

  -- A REGRA NOVA, e ela cabe em duas linhas porque a escala ja foi calculada
  -- abaixo. 100 so com TODAS as tarefas concluidas (a diferenca para a 0034,
  -- onde bastava uma); fora isso, a fase alcancada.
  case
    when agg.tasks_total > 0 and agg.tasks_completed = agg.tasks_total then 100::smallint
    else agg.phase_percent
  end as progress_percent,

  agg.phase_percent,
  agg.tasks_total,
  agg.tasks_completed,
  agg.required_items_total,
  agg.required_items_completed
from (
  select
    p.id as project_id,
    p.tenant_id,

    -- A UNICA copia da escala de fases. 'awaiting_client' nao tem percentual
    -- proprio: vira NULL e some do max(), entao o projeto fica valendo a fase
    -- mais avancada entre as DEMAIS tarefas. 'under_construction' entrou na
    -- 0075 valendo 100, confirmado por FASE_PERCENTUAIS da nova-versao.
    -- Sem atalho de conclusao aqui: conclusao e assunto de progress_percent.
    coalesce(
      max(
        case t.phase
          when 'not_started' then 0
          when 'briefing' then 12
          -- Sem percentual proprio, como na producao. Ver o cabecalho.
          when 'preliminary_study' then null
          when 'layout' then 26
          when 'preliminary_design' then null
          when 'renderings' then 50
          when 'revision' then 55
          when 'legal_permit' then 70
          when 'hoa_approval' then 75
          when 'construction_docs' then 80
          when 'engineering_docs' then 90
          when 'building_permit' then 100
          when 'under_construction' then 100
          when 'finished' then 100
          when 'awaiting_client' then null
        end
      ),
      0
    )::smallint as phase_percent,

    -- Contagem DISTINTA, como na 0035: o join com task_checklist_items
    -- multiplica a linha da tarefa por item de checklist, e contar sem distinct
    -- daria peso maior a tarefa com checklist grande. Aqui o estrago seria
    -- pior que na 0035: com peso errado, "todas concluidas" nunca fecharia num
    -- projeto cuja tarefa pronta tem checklist.
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
  group by p.id, p.tenant_id
) agg;

-- O GRANT nao foi perdido (nao houve DROP), mas repetir e barato e a 0036
-- documenta o custo de descobrir tarde que ele sumiu. anon continua sem nada.
grant select on public.project_progress to authenticated;

comment on column public.project_progress.progress_percent is
  'Progresso exibido nas telas: 100 quando TODAS as tarefas do projeto estao concluidas, e o percentual da fase mais avancada entre as tarefas em qualquer outro caso. Segue a etapa - arrastar o cartao para a coluna seguinte muda o numero. NAO e o calculo da 0034: la QUALQUER UMA tarefa concluida ja levava o projeto a 100%, e e por isso que a exigencia aqui e TODAS. Projeto sem tarefa nenhuma da 0, e nao nulo. Ver o cabecalho da migration 0075.';

comment on column public.project_progress.phase_percent is
  'Fase mais avancada alcancada pelas tarefas, na escala do original, SEM o atalho de tarefa concluida - concluir tarefa nao move este numero. E a unica copia da escala: progress_percent e derivado dele (100 se todas as tarefas estiverem concluidas, senao este valor). Aguardando Cliente nao tem percentual proprio, vira nulo e e ignorada na comparacao; Em Obra vale 100 desde a 0075, confirmado por FASE_PERCENTUAIS de nova-versao/src/components/utils/projectProgressCalculator.jsx. Fase de project_phase que nao esteja listada no CASE cai em nulo e some do calculo SEM ERRO NENHUM: quem acrescentar valor ao enum passa por aqui.';

-- A 0061 registrou no COMMENT do TIPO que Em Obra "nao tem percentual proprio na
-- view project_progress". Deixou de ser verdade nesta migration, e comentario
-- errado no catalogo e pior que comentario nenhum - alguem le e acredita. O
-- texto vem da 0075, acrescido das duas fases da 0079.
comment on type public.project_phase is
  'Fase do projeto. De/para: not_started=Nao iniciado, briefing=Briefing, preliminary_study=Estudo preliminar, layout=Layout, preliminary_design=Anteprojeto, renderings=Perspectivas, revision=Revisao, legal_permit=Projeto Legal, hoa_approval=Aprovacao Condominio, construction_docs=Projeto Executivo, engineering_docs=Projetos Complementares, building_permit=Alvara de Construcao, under_construction=Em Obra, awaiting_client=Aguardando Cliente, finished=Finalizado, post_approval=Pos-aprovacao. COMPARTILHADO por tres colunas, cada uma com o seu recorte, e cada recorte e um check na propria tabela: tasks.phase nao aceita finished (0032) nem post_approval (0049); projects.current_phase nao aceita post_approval (0049); budget_checklists.project_phase aceita SO renderings, construction_docs, engineering_docs e post_approval (0049). post_approval entrou na 0048 e existe apenas para o checklist de orcamento. under_construction entrou na 0061, para as 14 tarefas que o escritorio marcou como "Em Obra" no base44: e fase de tarefa e de projeto, vale 100 na escala de project_progress desde a 0075 (a 0061 deixara o percentual em aberto) e exige coluna propria no kanban do frontend. preliminary_study e preliminary_design entraram na 0079, para as 21 tarefas que o escritorio marcou como "Estudo preliminar" e "Anteprojeto" no base44 e que a importacao vinha dobrando dentro de layout e renderings: NAO tem percentual na escala (a producao tambem nao lhes da um) e NAO tem coluna no kanban, entao as tarefas nelas nao aparecem no quadro - o mesmo que acontece na producao, por decisao do usuario.';
