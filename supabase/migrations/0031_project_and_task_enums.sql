-- Modulo 5 (Projetos) - enums de Project e Task.
--
-- Mesma estrutura da 0001, da 0014, da 0021 e da 0028: o que e infraestrutura do
-- modulo (tipos) vem em migration propria, antes das tabelas, para que a
-- migration das tabelas seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secoes Projetos e
-- "Tarefas e atividades". Rotulo em portugues vive na UI (src/lib/enums.ts),
-- nunca no banco.
--
-- NAO entra aqui geocode_status. Os oito campos obra_* de Project foram adiados
-- para o modulo 9 (docs/SCHEMA-PLAN.md, "Decisao 1"), junto com map_properties, e
-- o enum deles nasce la - criar o tipo agora seria deixar tipo sem coluna.
--
-- project_type NAO ganha tipo novo: reusa public.contract_type, criado na 0028,
-- como registra docs/ENUM-MAP.md ("compartilhado com projects.project_type").

create type public.project_status as enum (
  'prospecting',
  'under_contract',
  'in_development',
  'in_approval',
  'completed',
  'suspended'
);

-- Um enum, dois usos. projects.current_phase aceita os doze valores; tasks.phase
-- aceita onze - 'finished' e barrado por check na propria tabela (migration
-- 0032). A ordem dos valores e a das colunas do kanban do original
-- (ProjectKanban.jsx / TaskKanban.jsx), e nao a ordem de percentual: o valor
-- 'awaiting_client' nao tem percentual proprio (ver a view project_progress).
create type public.project_phase as enum (
  'not_started',
  'briefing',
  'layout',
  'renderings',
  'revision',
  'legal_permit',
  'hoa_approval',
  'construction_docs',
  'engineering_docs',
  'building_permit',
  'awaiting_client',
  'finished'
);

-- Quatro valores, como registra docs/ENUM-MAP.md: 'urgent' so existe em Atividade
-- (modulo 6). tasks.priority barra 'urgent' por check, pelo mesmo motivo de
-- 'finished' em tasks.phase - um tipo so, e a tabela recorta.
create type public.priority_level as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

create type public.work_status as enum (
  'not_started',
  'in_progress',
  'completed'
);

create type public.task_type as enum (
  'technical',
  'meeting',
  'review',
  'administrative'
);

comment on type public.project_status is
  'Situacao do projeto. De/para: prospecting=Prospeccao, under_contract=Em contrato, in_development=Em desenvolvimento, in_approval=Em aprovacao, completed=Concluido, suspended=Suspenso. Nao confundir com current_phase: status descreve a relacao comercial com o cliente, fase descreve onde o desenho esta.';

comment on type public.project_phase is
  'Fase do projeto. De/para: not_started=Nao iniciado, briefing=Briefing, layout=Layout, renderings=Perspectivas, revision=Revisao, legal_permit=Projeto Legal, hoa_approval=Aprovacao Condominio, construction_docs=Projeto Executivo, engineering_docs=Projetos Complementares, building_permit=Alvara de Construcao, awaiting_client=Aguardando Cliente, finished=Finalizado. COMPARTILHADO por projects.current_phase e tasks.phase; finished so vale para o projeto (no original Task.phase simplesmente nao lista o valor, e a coluna "Finalizado" do kanban de tarefas e status Concluida disfarcado de fase).';

comment on type public.priority_level is
  'Prioridade. De/para: low=Baixa, medium=Media, high=Alta, urgent=Urgente. COMPARTILHADO por tasks.priority (modulo 5) e activities.priority (modulo 6); urgent so existe em Atividade no original, e tasks o barra por check.';

comment on type public.work_status is
  'Andamento de tarefa e de atividade. De/para: not_started=Nao iniciada, in_progress=Em andamento, completed=Concluida. COMPARTILHADO por tasks (modulo 5) e activities (modulo 6). O original usa "Nao iniciado" para tarefa e "Nao iniciada" para atividade - a mesma coisa escrita de dois jeitos, e a UI passa a usar uma forma so.';

comment on type public.task_type is
  'Natureza da tarefa. De/para: technical=Tecnica, meeting=Reuniao, review=Revisao, administrative=Administrativo. Sem default e nullable na tabela, como no original: TaskForm nao preenche o campo sozinho.';
