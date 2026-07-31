-- Modulo 5 (Projetos) - view public.project_progress.
--
-- POR QUE VIEW, E NAO COLUNA (docs/SCHEMA-PLAN.md, "Decisao 2")
--   No base44, progresso_percentual, tarefas_total_obrigatorias e
--   tarefas_concluidas_obrigatorias sao colunas de Project que o FRONTEND
--   calcula e grava de volta (components/utils/projectProgressCalculator.jsx,
--   chamado por Tasks.jsx a cada mudanca de tarefa). Coluna derivada gravada
--   pela aplicacao so esta certa enquanto TODA mudanca de tarefa passar pelo
--   mesmo caminho: uma importacao, uma correcao no painel ou uma tela nova
--   deixam o percentual mentindo, e nada acusa. Aqui o valor e calculado na
--   leitura, e nao ha o que desincronizar.
--
-- SECURITY INVOKER, E NAO O PADRAO
--   View criada sem esta opcao roda com os privilegios e as policies do DONO
--   (postgres), e nao de quem consulta: ela leria projects e tasks de TODOS os
--   escritorios e devolveria o progresso do projeto alheio para qualquer
--   colaborador autenticado - um furo de isolamento por uma porta que a RLS das
--   tabelas nao vigia. Com security_invoker = true (Postgres 15+, e este banco
--   e 17), as policies da 0033 valem dentro da view: quem nao le a linha nao a
--   soma. O teste 8.3 de supabase/tests/projects-schema.sql afirma isso.
--
-- O CALCULO E O DO ORIGINAL, INCLUSIVE ONDE ELE SURPREENDE
--   1. Percentual fixo por fase, pela tarefa MAIS AVANCADA do projeto (a tabela
--      FASE_PERCENTUAIS do calculador).
--   2. 'Aguardando Cliente' nao tem percentual proprio: no original o valor e
--      null e a fase e ignorada na comparacao, entao o percentual fica sendo o
--      da fase mais avancada entre as demais tarefas.
--   3. QUALQUER tarefa concluida leva o projeto a 100%, mesmo que as outras
--      estejam no comeco (projectProgressCalculator.jsx:59-61: dentro do laco,
--      `if (task.status === 'Concluída') maxProgress = 100`). Isso esta
--      reproduzido de proposito - fidelidade ao original vale tambem para o
--      calculo - e ESTA SINALIZADO ao usuario como candidato a correcao. Mudar
--      a regra aqui mudaria numero de painel sem ninguem ter pedido.
--   4. Projeto sem tarefa nenhuma devolve 0, e nao nulo: o original devolve
--      zero explicito, e nulo obrigaria toda tela e todo painel a tratar o caso.
--
-- A contagem de obrigatorios vem de task_checklist_items das tarefas do projeto,
-- como no original (que percorre task.checklist_tarefa somando obrigatorio ===
-- true e obrigatorio && concluido).

create view public.project_progress
with (security_invoker = true) as
select
  p.id as project_id,
  p.tenant_id,
  coalesce(
    max(
      case
        when t.status = 'completed' then 100
        else
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
      end
    ),
    0
  )::smallint as progress_percent,
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

-- anon NAO recebe nada: o progresso descreve projeto de cliente, e nenhuma tela
-- deste modulo e publica.
grant select on public.project_progress to authenticated;

comment on view public.project_progress is
  'Progresso do projeto, calculado a partir das tarefas. Substitui as colunas progresso_percentual, tarefas_total_obrigatorias e tarefas_concluidas_obrigatorias de Project, que no base44 o frontend grava de volta a cada mudanca de tarefa. SECURITY INVOKER: as policies da 0033 valem para quem consulta - sem isso a view rodaria como o dono e devolveria projeto de outro escritorio. Devolve uma linha por projeto, inclusive projeto sem tarefa nenhuma (progress_percent = 0). O modulo 10 (paineis) le daqui, nunca de coluna.';

comment on column public.project_progress.progress_percent is
  'Percentual fixo por fase, pela tarefa mais avancada do projeto - a tabela FASE_PERCENTUAIS de components/utils/projectProgressCalculator.jsx. ATENCAO, COMPORTAMENTO HERDADO DO ORIGINAL: qualquer UMA tarefa concluida ja leva o projeto a 100%, mesmo com as demais no comeco. Esta reproduzido de proposito, e sinalizado ao usuario como candidato a correcao; nao mude sem decisao dele, porque muda numero de painel.';

comment on column public.project_progress.required_items_total is
  'Total de itens OBRIGATORIOS no checklist das tarefas do projeto. E o denominador do "projeto bloqueado" do original (flowProjectsQuery.jsx: total > 0 e concluidos < total).';

comment on column public.project_progress.required_items_completed is
  'Itens obrigatorios ja concluidos. Ver required_items_total.';
