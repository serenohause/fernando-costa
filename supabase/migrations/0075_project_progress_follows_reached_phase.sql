-- O progresso do projeto volta a seguir a ETAPA alcancada - sem o defeito da 0034.
--
-- O SINTOMA RELATADO
--   "Mover cartao no quadro nao muda o numero." E verdade, e era o desenho:
--   desde a 0035 `progress_percent` e a proporcao de tarefas concluidas, e
--   proporcao nao muda quando a tarefa troca de coluna. Todas as telas que
--   exibem progresso leem essa coluna (Fluxo do Projeto e Painel Executivo).
--
-- A HISTORIA, EM TRES MIGRATIONS
--   0034  Portou o calculo do base44 ao pe da letra: escala fixa por fase, pela
--         tarefa mais avancada, e - dentro do mesmo laco - QUALQUER tarefa
--         concluida valendo 100. UMA tarefa pronta levava o projeto inteiro a
--         100%. Portar literal foi o certo; o defeito ficou sinalizado.
--   0035  Decisao do usuario: corrigir o 100% precoce. `progress_percent` virou
--         tarefas concluidas / total, e a escala por fase foi preservada ao lado
--         em `phase_percent`. O 100% precoce morreu - e o sinal de etapa saiu da
--         tela junto, porque nenhuma tela passou a ler `phase_percent`.
--   0061  Criou a fase 'under_construction' (Em Obra) para as 14 tarefas reais
--         do escritorio, e deixou o percentual dela EM ABERTO de proposito:
--         "inventar um percentual para uma fase que o original nunca teve
--         mudaria o numero exibido de 14 projetos com base em palpite". Ficou
--         esperando confirmacao. Esta migration e a confirmacao.
--
-- O QUE MUDA, E POR QUE NAO E UM RETROCESSO PARA A 0034
--   `progress_percent` passa a ser:
--     - 100 quando TODAS as tarefas do projeto estiverem concluidas;
--     - caso contrario, o percentual da fase mais avancada entre as tarefas.
--
--   A diferenca para a 0034 e uma palavra, e ela e a razao de a mudanca nao
--   desfazer a correcao do usuario: la bastava UMA tarefa concluida para o
--   projeto ir a 100%; aqui exige TODAS. Um projeto com nove tarefas por fazer e
--   uma pronta continua NAO valendo 100 - ele vale a fase em que as nove estao.
--   O caso 8.2c do teste existe exatamente para o defeito da 0034 nao voltar
--   pela porta dos fundos.
--
--   E o cartao volta a mexer o numero: arrastar a tarefa mais avancada para a
--   coluna seguinte muda a fase maxima, e a fase maxima e o valor exibido.
--
-- 'under_construction' VALE 100, E ISSO DEIXOU DE SER PALPITE
--   nova-versao/src/components/utils/projectProgressCalculator.jsx declara
--   'Em Obra': 100 na tabela FASE_PERCENTUAIS, ao lado de 'Alvara de
--   Construcao' e 'Finalizado'. E a confirmacao que a 0061 esperava para fechar
--   o ponto que ela deixou em aberto. Sem ela, 15 projetos do escritorio caiam
--   em 0% pela fase - 14 por Em Obra, e nenhum deles esta parado no comeco.
--
-- 'awaiting_client' CONTINUA SEM PERCENTUAL PROPRIO
--   Segue nula e ignorada na comparacao, como no original e como na 0035:
--   esperar o cliente nao avanca nem retrocede o projeto. Um projeto com uma
--   tarefa em Aguardando Cliente e outra em Layout vale o Layout.
--
-- `phase_percent` MANTEM A REGRA, E PASSA A SER A UNICA COPIA DA ESCALA
--   A regra dela nao muda: escala pura, SEM o atalho de conclusao. Ela continua
--   sendo o sinal separado de "onde a entrega chegou", e concluir tarefa
--   continua nao movendo esse numero (caso 8.2e: todas concluidas dao
--   progress_percent 100 e phase_percent 70).
--
--   O que ela ganha e a fase que faltava na escala: 'under_construction'. Isso
--   era o item 3 do diagnostico - a fase caia em nulo e virava 0 - e nao daria
--   para corrigir so de um lado: `progress_percent` agora e DERIVADO de
--   `phase_percent` (subconsulta `agg`, e nao um segundo CASE copiado). Uma
--   escala so, num lugar so. Se fossem duas copias, a proxima fase acrescentada
--   ao enum entraria em uma e nao na outra - que e, palavra por palavra, o bug
--   que esta migration esta consertando.
--
--   Nenhuma tela le `phase_percent` hoje (src/features/projects/hooks.ts a traz
--   no select e nenhum componente a exibe), entao a correcao da escala nao muda
--   numero exibido por si - ela chega na tela pelo `progress_percent`.
--
-- O CASE CONTINUA SEM ELSE, E ISSO E UMA ARMADILHA CONHECIDA
--   Valor de enum que o CASE nao lista cai em NULL e some do max() sem erro
--   nenhum - foi assim que 'under_construction' virou 0% durante 14 migrations.
--   Nao ha ELSE que conserte isso (0 tambem seria um numero inventado): quem
--   acrescentar valor a project_phase precisa passar por aqui. O caso 9.10 do
--   teste e o que cobra.
--
-- PROJETO SEM TAREFA CONTINUA 0, E NAO NULO
--   Painel que soma nulo produz buraco em vez de zero. E por isso o ramo do
--   "todas concluidas" exige `tasks_total > 0`: sem essa guarda, zero de zero
--   tarefas concluidas satisfaz "todas concluidas" e o projeto vazio iria a
--   100%.
--
-- CREATE OR REPLACE, E NAO DROP + CREATE
--   `drop view` LEVA O GRANT JUNTO. Foi o que aconteceu entre a 0035 e a 0036
--   neste projeto: a view ficou sem `grant select to authenticated`, e o caso de
--   negacao "colaborador de A nao ve projeto de B" passou por ENGANO, porque
--   recebeu ERR:42501 em vez de zero linhas. Quem acusou foi o controle positivo
--   ao lado.
--
--   Aqui o DROP nao e necessario: nome, ordem e tipo das seis colunas ficam
--   identicos (o que `create or replace view` recusa e renomear, reordenar ou
--   remover coluna - so a EXPRESSAO de progress_percent muda). O GRANT da 0036 e
--   a opcao security_invoker seguem intactos, e nenhuma mudanca de frontend e
--   necessaria: src/features/projects/hooks.ts pede as mesmas seis colunas.

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
          when 'layout' then 26
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
-- texto e o mesmo da 0061 com essa unica clausula corrigida.
comment on type public.project_phase is
  'Fase do projeto. De/para: not_started=Nao iniciado, briefing=Briefing, layout=Layout, renderings=Perspectivas, revision=Revisao, legal_permit=Projeto Legal, hoa_approval=Aprovacao Condominio, construction_docs=Projeto Executivo, engineering_docs=Projetos Complementares, building_permit=Alvara de Construcao, under_construction=Em Obra, awaiting_client=Aguardando Cliente, finished=Finalizado, post_approval=Pos-aprovacao. COMPARTILHADO por tres colunas, cada uma com o seu recorte, e cada recorte e um check na propria tabela: tasks.phase nao aceita finished (0032) nem post_approval (0049); projects.current_phase nao aceita post_approval (0049); budget_checklists.project_phase aceita SO renderings, construction_docs, engineering_docs e post_approval (0049). post_approval entrou na 0048 e existe apenas para o checklist de orcamento. under_construction entrou na 0061, para as 14 tarefas que o escritorio marcou como "Em Obra" no base44: e fase de tarefa e de projeto, vale 100 na escala de project_progress desde a 0075 (a 0061 deixara o percentual em aberto) e exige coluna propria no kanban do frontend.';
