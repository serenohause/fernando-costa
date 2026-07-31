-- Modulo 5 (Projetos) - projects, tasks e as quatro tabelas que substituem os
-- arrays de Project e Task. Project tem 45 campos, a maior entidade do sistema.
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. Os OITO campos obra_* NAO entram (docs/SCHEMA-PLAN.md, "Decisao 1").
--      obra_lat, obra_lng, obra_place_id, obra_geocode_status,
--      obra_geocode_updated_at, obra_pin_manual, obra_pin_updated_by e
--      obra_pin_updated_at vao para o modulo 9, junto com map_properties. Razao:
--      o original guarda "onde a obra fica" em DOIS lugares (o projeto e
--      PropriedadeMapa), e e o segundo que a tela de mapa consulta. Escolher
--      aqui entre numeric solto e geography(Point) do PostGIS significaria
--      refazer no modulo 9 ou conviver com dois formatos. Fica location, city,
--      state e o endereco em texto.
--
--   2. progresso_percentual, tarefas_total_obrigatorias e
--      tarefas_concluidas_obrigatorias NAO sao colunas (docs/SCHEMA-PLAN.md,
--      "Decisao 2"). Sao derivadas das tarefas, e no original quem as grava e o
--      frontend (components/utils/projectProgressCalculator.jsx). Coluna
--      derivada gravada pela aplicacao so esta certa enquanto TODA mudanca de
--      tarefa passar pelo mesmo caminho - importacao, correcao no painel ou tela
--      nova deixam o percentual mentindo, e nada acusa. Viram a view
--      public.project_progress, na migration 0034.
--
--   3. client_name, contract_number, commercial_responsible_name e
--      responsible_name saem e viram join. Desnormalizacao pura: a lista quer o
--      nome ATUAL, e no original ele congela na hora em que o projeto foi
--      criado. Diferente do snapshot INTENCIONAL de contracts, que existe para
--      registrar o que valia na assinatura.
--
--   4. responsible_id vira operational_responsible_id. O nome do original nao
--      diz qual dos dois responsaveis e: a entidade tem
--      commercial_responsible_id (quem vendeu, vindo do Pipeline) e
--      responsible_id (quem executa, definido no Fluxo de Projeto). Sao papeis
--      distintos e as duas telas os tratam como tais.
--
--   5. visivel_em_projetos e ordem_exibicao viram visible_in_list e
--      display_order - traducao, como o modulo 4 fez com os mesmos conceitos.
--
--   6. Os cinco prazo_* usam a MESMA grafia de contracts (0029):
--      layout_study_days, renderings_days, legal_permit_days,
--      construction_docs_days, engineering_docs_days. Sao o mesmo dado copiado do
--      contrato para o projeto no original, e nome diferente para o mesmo dado e
--      convite a divergencia.
--
--   7. Os arrays viram tabela filha: checklist_etapa ->
--      project_checklist_items, checklist_tarefa -> task_checklist_items,
--      terreno_tipo -> project_land_types, finalidade_projeto ->
--      project_purposes. Mesmo tratamento que a 0022 deu a
--      Negociacao.tipo_servico.
--
--   8. Os checks que o original nao tem, listados em docs/SCHEMA-PLAN.md, secao
--      "Modulo 5 - Regra de negocio para o teste proprio".

-- projects ---------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os dois campos que o original marca como required.
  name text not null,
  project_type public.contract_type not null,

  -- Nullable como no original: o projeto pode nascer antes de o cliente virar
  -- cadastro, e Projects.jsx trata explicitamente o projeto sem client_id.
  client_id uuid,

  -- A ligacao contrato <-> projeto vive AQUI, e so aqui: contracts NAO tem
  -- project_id (ver o comentario 2 da migration 0029). No original os dois lados
  -- sao gravados a mao, em chamadas separadas, e podem discordar.
  contract_id uuid,

  location text,
  city text,
  state text,
  site_address_text text,

  commercial_responsible_id uuid,
  operational_responsible_id uuid,

  start_date date,
  status public.project_status not null default 'under_contract',
  current_phase public.project_phase not null default 'not_started',

  -- Prazos por fase, em dias uteis, copiados do contrato quando o projeto nasce.
  -- Mesma grafia de contracts (0029).
  layout_study_days smallint,
  renderings_days smallint,
  legal_permit_days smallint,
  construction_docs_days smallint,
  engineering_docs_days smallint,

  total_value numeric(14, 2),

  visible_in_list boolean not null default false,
  display_order smallint,

  notes text,

  land_area_m2 numeric(12, 2),
  project_area_m2 numeric(12, 2),
  subdivision_name text,
  subdivision_block text,
  subdivision_lot text,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo das FK compostas de tasks, project_checklist_items,
  -- project_land_types e project_purposes (aqui), de activities (modulo 6) e de
  -- map_properties (modulo 9).
  constraint projects_id_tenant_id_key unique (id, tenant_id),
  constraint projects_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint projects_name_not_blank_check check (btrim(name) <> ''),

  constraint projects_total_value_not_negative_check
    check (total_value is null or total_value >= 0),

  constraint projects_areas_positive_check
    check (
      (land_area_m2 is null or land_area_m2 > 0)
      and (project_area_m2 is null or project_area_m2 > 0)
    ),

  constraint projects_phase_days_positive_check
    check (
      (layout_study_days is null or layout_study_days > 0)
      and (renderings_days is null or renderings_days > 0)
      and (legal_permit_days is null or legal_permit_days > 0)
      and (construction_docs_days is null or construction_docs_days > 0)
      and (engineering_docs_days is null or engineering_docs_days > 0)
    )
);

-- FK compostas. Referencia por id sozinho deixaria um projeto apontar para
-- cliente, contrato ou colaborador de OUTRO escritorio: a RLS filtra o que se
-- le, nao o que se aponta. Sem ON DELETE nos quatro casos - apagar o que tem
-- projeto vinculado falha de proposito, forcando decisao explicita em vez de
-- orfanar a linha em silencio (mesmo desenho das FK das migrations 0022 e 0029).
alter table public.projects
  add constraint projects_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

alter table public.projects
  add constraint projects_contract_id_fkey
  foreign key (contract_id, tenant_id)
  references public.contracts (id, tenant_id);

alter table public.projects
  add constraint projects_commercial_responsible_id_fkey
  foreign key (commercial_responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.projects
  add constraint projects_operational_responsible_id_fkey
  foreign key (operational_responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.projects is
  'Projeto em execucao, de Project do base44. GEOLOCALIZACAO DA OBRA NAO ESTA AQUI: os oito campos obra_* (lat, lng, place_id, geocode_status, geocode_updated_at, pin_manual, pin_updated_by, pin_updated_at) ficaram para o MODULO 9, junto com map_properties, para a representacao geografica (PostGIS ou nao) ser escolhida uma vez so - ate la a tela de projeto nao ajusta pino. PROGRESSO TAMBEM NAO ESTA AQUI: progresso_percentual, tarefas_total_obrigatorias e tarefas_concluidas_obrigatorias sao derivados das tarefas e vivem na view public.project_progress.';

comment on column public.projects.name is
  'Nome do projeto. Quando o projeto nasce da aprovacao de um contrato, o valor vem de contracts.project_name (Contracts.jsx:161), que e texto digitado no formulario do contrato antes de o projeto existir.';

comment on column public.projects.project_type is
  'Escopo do projeto. Usa public.contract_type, criado na 0028: no base44 sao duas listas com rotulo diferente para o mesmo conceito ("Projeto de Arquitetura" em Contract, "Arquitetura" em Project), e docs/ENUM-MAP.md as unifica.';

comment on column public.projects.contract_id is
  'Contrato que originou o projeto. LADO UNICO da ligacao: contracts nao tem project_id, de proposito (ver migration 0029). Nullable porque projeto de prospeccao existe antes do contrato. FK composta com tenant_id porque a RLS nao impede gravar referencia para o contrato de outro escritorio.';

comment on column public.projects.commercial_responsible_id is
  'Quem vendeu - responsavel pela negociacao, vindo do Pipeline (Diretor/Admin/Comercial no original). Colaborador, e nao usuario: quem nunca fez login tambem responde por projeto.';

comment on column public.projects.operational_responsible_id is
  'Quem executa - responsavel operacional, definido no Fluxo de Projeto (Arquiteto/Estagiario/Coordenador no original, onde a coluna se chama so responsible_id). Distinto de commercial_responsible_id de proposito: sao dois papeis, duas telas e duas pessoas na maior parte dos casos.';

comment on column public.projects.site_address_text is
  'Endereco da obra em texto livre, normalizado (obra_endereco_texto no original). E a ENTRADA da geocodificacao, nao o resultado dela: as coordenadas e o status de geocoding sao do modulo 9. Fica aqui porque o formulario de projeto ja escreve o campo hoje e ele nao depende de nenhuma decisao de representacao geografica.';

comment on column public.projects.status is
  'Situacao comercial do projeto. Default under_contract, como na entidade do base44 - o "Prospeccao" que aparece pre-selecionado e valor inicial do FORMULARIO (ProjectForm.jsx:55), nao default do dado, e projeto criado pela aprovacao de contrato nasce em contrato.';

comment on column public.projects.current_phase is
  'Fase atual do projeto. No original e mantida pelo frontend a partir das tarefas (components/utils/projectPhaseCalculator.jsx) E arrastada a mao no kanban de projetos - por isso continua sendo coluna gravada, e nao derivada como o progresso: nem toda mudanca vem das tarefas. Unico lugar do sistema onde project_phase aceita finished.';

comment on column public.projects.total_value is
  'Valor contratado, copiado do contrato quando o projeto nasce. numeric, nunca float. Nao e o mesmo dado de contracts.total_value: um contrato pode gerar mais de um projeto, e a soma dos projetos nao precisa fechar com o contrato.';

comment on column public.projects.visible_in_list is
  'Projeto aparece na lista de Projetos e no Fluxo (visivel_em_projetos no original). Default false: projeto nasce invisivel e so aparece quando o contrato e aprovado (Contracts.jsx:118). E a regra oficial de visibilidade do fluxo, e os paineis do modulo 10 dependem dela para bater com a tela (flowProjectsQuery.jsx).';

comment on column public.projects.display_order is
  'Ordem manual da lista, definida arrastando a linha (Projects.jsx:59). Nullable de proposito: projeto nunca arrastado nao tem ordem, e a lista cai no criterio seguinte.';

comment on column public.projects.legacy_id is
  'Id da linha de Project no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint projects_areas_positive_check on public.projects is
  'Area zero ou negativa nao descreve terreno nem projeto nenhum, e entraria em qualquer media de m2 do painel. Nulo continua valido: area desconhecida e o caso comum na prospeccao.';

comment on constraint projects_phase_days_positive_check on public.projects is
  'Mesmo check de contracts (0029): prazo de fase e contado em dias uteis, e zero ou negativo viraria data de entrega igual ou anterior ao inicio no cronograma.';

create index projects_tenant_id_created_at_idx
  on public.projects (tenant_id, created_at desc);

-- Kanban de projetos, que agrupa por fase.
create index projects_tenant_id_current_phase_idx
  on public.projects (tenant_id, current_phase);

-- Lista de Projetos e Fluxo: so o que esta visivel, na ordem arrastada. Parcial
-- porque projeto invisivel e a maioria enquanto o contrato nao e aprovado.
create index projects_tenant_id_display_order_idx
  on public.projects (tenant_id, display_order)
  where visible_in_list;

create index projects_tenant_id_client_id_idx
  on public.projects (tenant_id, client_id);

-- Projetos gerados por um contrato. Parcial: projeto de prospeccao nao tem
-- contrato.
create index projects_tenant_id_contract_id_idx
  on public.projects (tenant_id, contract_id)
  where contract_id is not null;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- tasks ------------------------------------------------------------------------
--
-- Os cards do Fluxo do Projeto. Menu proprio ('project_flow'), separado de
-- 'projects': sao dois itens distintos na sidebar do original, com permissao
-- independente.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Unico campo que o original marca como required.
  title text not null,

  -- Nullable como no original, que so declara title. Tasks.jsx confere
  -- task.project_id antes de recalcular a fase do projeto, ou seja, tarefa sem
  -- projeto e caso previsto la.
  project_id uuid,

  phase public.project_phase not null default 'not_started',
  responsible_id uuid,
  priority public.priority_level not null default 'medium',
  status public.work_status not null default 'not_started',

  start_date date,
  due_date date,
  completion_date date,

  estimated_hours numeric(6, 2),
  spent_hours numeric(6, 2),

  description text,
  task_type public.task_type,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_id_tenant_id_key unique (id, tenant_id),
  constraint tasks_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint tasks_title_not_blank_check check (btrim(title) <> ''),

  -- O recorte do enum compartilhado: tarefa nunca esta em finished.
  constraint tasks_phase_not_finished_check check (phase <> 'finished'),

  -- Mesmo recorte, do outro enum compartilhado: urgent so existe em Atividade.
  constraint tasks_priority_not_urgent_check check (priority <> 'urgent'),

  -- Os dois sentidos na mesma igualdade: concluida exige data, e data exige
  -- concluida.
  constraint tasks_completion_date_matches_status_check
    check ((status = 'completed') = (completion_date is not null)),

  constraint tasks_hours_not_negative_check
    check (
      (estimated_hours is null or estimated_hours >= 0)
      and (spent_hours is null or spent_hours >= 0)
    ),

  constraint tasks_due_date_not_before_start_check
    check (due_date is null or start_date is null or due_date >= start_date)
);

alter table public.tasks
  add constraint tasks_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

alter table public.tasks
  add constraint tasks_responsible_id_fkey
  foreign key (responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.tasks is
  'Tarefa/card do Fluxo do Projeto, de Task do base44. ON DELETE CASCADE para projects: no original, Projects.jsx apaga as tarefas do projeto numa segunda chamada depois de apagar o projeto, e uma falha no meio deixa tarefa apontando para projeto que nao existe mais. Alimenta a view public.project_progress.';

comment on column public.tasks.project_id is
  'Projeto da tarefa. Nullable como no original (a entidade so exige title, e Tasks.jsx trata tarefa sem projeto). FK composta com tenant_id: a RLS nao impede gravar referencia para projeto de outro escritorio.';

comment on column public.tasks.phase is
  'Etapa da tarefa, e coluna do kanban do Fluxo. Usa o mesmo enum de projects.current_phase, sem o valor finished - no original a lista de Task.phase simplesmente nao o traz, e a coluna "Finalizado" do kanban de tarefas e status = Concluida disfarcado de fase (TaskKanban.jsx:229).';

comment on column public.tasks.priority is
  'Prioridade da tarefa. Default medium, como no formulario e na entidade. Nunca urgent: esse valor existe so em Atividade (modulo 6), e o enum e compartilhado.';

comment on column public.tasks.completion_date is
  'Data em que a tarefa foi concluida. Amarrada a status por check nos dois sentidos. No original os dois sao escritos juntos (Tasks.jsx:157) e nada garante que continuem juntos: qualquer outra escrita deixa data de conclusao em tarefa em andamento, ou tarefa concluida sem data - e o relatorio de produtividade do modulo 6 conta por essa data.';

comment on column public.tasks.spent_hours is
  'Horas efetivamente gastas. Alimenta o RelatorioProdutividade do modulo 6, que cruza com collaborators.weekly_hours. numeric(6,2): 9999.99 horas em uma tarefa e folga de sobra.';

comment on constraint tasks_phase_not_finished_check on public.tasks is
  'O enum project_phase e compartilhado com projects.current_phase, que tem finished; tasks nao. Sem este check o valor entraria em tarefa, e a fase que nao existe no kanban esconderia a tarefa de todas as colunas - ela sumiria da tela sem ter sido apagada.';

comment on constraint tasks_completion_date_matches_status_check on public.tasks is
  'Os dois sentidos da mesma regra: tarefa concluida sem data nao entra em nenhum relatorio por periodo, e data de conclusao em tarefa em andamento a faz aparecer como entregue. A igualdade entre os dois booleanos cobre os dois casos com uma expressao.';

comment on constraint tasks_due_date_not_before_start_check on public.tasks is
  'Prazo anterior ao inicio nasce atrasado no dia em que e criado. Exigido apenas quando as DUAS datas existem: tarefa sem data e caso comum no original, que nao exige nenhuma das duas.';

create index tasks_tenant_id_created_at_idx
  on public.tasks (tenant_id, created_at desc);

-- O kanban do Fluxo carrega as tarefas de um projeto e agrupa por fase.
create index tasks_tenant_id_project_id_phase_idx
  on public.tasks (tenant_id, project_id, phase);

-- "Minhas tarefas" e a carga por responsavel.
create index tasks_tenant_id_responsible_id_idx
  on public.tasks (tenant_id, responsible_id);

-- Tarefa atrasada: o que a tela marca em vermelho. Parcial porque tarefa
-- concluida nunca esta atrasada e sai da conta.
create index tasks_tenant_id_due_date_idx
  on public.tasks (tenant_id, due_date)
  where status <> 'completed';

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- project_checklist_items -------------------------------------------------------
--
-- Substitui Project.checklist_etapa (array de objeto). O kanban de projetos
-- acrescenta os itens da etapa quando o card e arrastado (ProjectKanban.jsx:95).

create table public.project_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,

  title text not null,
  phase public.project_phase,
  is_completed boolean not null default false,
  completed_at timestamptz,
  display_order smallint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_checklist_items_id_tenant_id_key unique (id, tenant_id),
  constraint project_checklist_items_project_id_title_key unique (project_id, title),

  constraint project_checklist_items_title_not_blank_check check (btrim(title) <> ''),

  constraint project_checklist_items_completed_at_requires_completed_check
    check (completed_at is null or is_completed)
);

alter table public.project_checklist_items
  add constraint project_checklist_items_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

comment on table public.project_checklist_items is
  'Itens do checklist de etapa do projeto, um por linha. Substitui o array Project.checklist_etapa. ON DELETE CASCADE de proposito: e parte do projeto, nao entidade propria. Sem legacy_id, como negotiation_services (0022) - no base44 estes itens vivem dentro da linha de Project e nao tem id proprio; a chave natural (projeto + titulo) e o que torna a reimportacao idempotente.';

comment on constraint project_checklist_items_project_id_title_key on public.project_checklist_items is
  'O mesmo item nao aparece duas vezes no mesmo projeto. E exatamente a regra que o original aplica a mao ao arrastar o card (ProjectKanban.jsx:99 filtra pelos titulos que ja existem), e sem ela arrastar de ida e volta duplica o checklist inteiro.';

comment on column public.project_checklist_items.display_order is
  'Ordem do item na lista. No original a ordem e a POSICAO NO ARRAY, e a tela alterna o item por indice - posicao de array nao sobrevive a virar tabela, entao a ordem vira coluna explicita.';

create index project_checklist_items_tenant_id_project_id_idx
  on public.project_checklist_items (tenant_id, project_id, display_order);

create trigger project_checklist_items_set_updated_at
  before update on public.project_checklist_items
  for each row execute function public.set_updated_at();

-- task_checklist_items ----------------------------------------------------------
--
-- Substitui Task.checklist_tarefa (array de objeto). Diferente do checklist do
-- projeto, este tem itens OBRIGATORIOS: o kanban do Fluxo recusa avancar a
-- tarefa de etapa enquanto houver obrigatorio pendente (TaskKanban.jsx:212), e e
-- a contagem deles que a view project_progress devolve.

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  task_id uuid not null,

  title text not null,
  phase public.project_phase,
  is_required boolean not null default false,
  is_completed boolean not null default false,
  completed_at timestamptz,
  display_order smallint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint task_checklist_items_id_tenant_id_key unique (id, tenant_id),
  constraint task_checklist_items_task_id_title_key unique (task_id, title),

  constraint task_checklist_items_title_not_blank_check check (btrim(title) <> ''),

  constraint task_checklist_items_completed_at_requires_completed_check
    check (completed_at is null or is_completed),

  constraint task_checklist_items_required_completed_needs_date_check
    check (not (is_required and is_completed) or completed_at is not null)
);

alter table public.task_checklist_items
  add constraint task_checklist_items_task_id_fkey
  foreign key (task_id, tenant_id)
  references public.tasks (id, tenant_id)
  on delete cascade;

comment on table public.task_checklist_items is
  'Itens do checklist de uma tarefa, um por linha. Substitui o array Task.checklist_tarefa. ON DELETE CASCADE de proposito: e parte da tarefa. Sem legacy_id, pela mesma razao de project_checklist_items.';

comment on column public.task_checklist_items.is_required is
  'Item obrigatorio da etapa (obrigatorio no original). E o que trava o avanco da tarefa no kanban enquanto estiver pendente, e o que a view project_progress conta como total/concluidos obrigatorios.';

comment on constraint task_checklist_items_task_id_title_key on public.task_checklist_items is
  'O mesmo item nao aparece duas vezes na mesma tarefa. E a regra que o original aplica a mao (TaskKanban.jsx:243 filtra pelos titulos existentes, sem olhar a etapa) e da qual ele depende para nao duplicar o checklist a cada leitura do kanban - a tela reescreve o array sempre que encontra item faltando.';

comment on constraint task_checklist_items_required_completed_needs_date_check on public.task_checklist_items is
  'Item obrigatorio concluido e o que libera a tarefa a avancar de etapa. Sem data de conclusao nao ha como auditar quando a trava caiu, nem reconstruir o historico de uma entrega contestada. Item opcional concluido continua podendo ficar sem data: la a data nunca decidiu nada.';

create index task_checklist_items_tenant_id_task_id_idx
  on public.task_checklist_items (tenant_id, task_id, display_order);

-- A contagem de obrigatorios que a view project_progress faz.
create index task_checklist_items_tenant_id_required_idx
  on public.task_checklist_items (tenant_id, task_id)
  where is_required;

create trigger task_checklist_items_set_updated_at
  before update on public.task_checklist_items
  for each row execute function public.set_updated_at();

-- project_land_types ------------------------------------------------------------
--
-- Substitui Project.terreno_tipo (array de texto). Tag livre: o formulario
-- sugere tres valores ("Loteamento fechado", "Terreno", "Comercial") e aceita
-- qualquer outro digitado (ProjectForm.jsx:272). Por isso texto, e nao enum -
-- enum aqui obrigaria migration a cada categoria nova inventada na tela.

create table public.project_land_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  land_type text not null,
  created_at timestamptz not null default now(),

  constraint project_land_types_id_tenant_id_key unique (id, tenant_id),
  constraint project_land_types_project_id_land_type_key unique (project_id, land_type),
  constraint project_land_types_land_type_not_blank_check check (btrim(land_type) <> '')
);

alter table public.project_land_types
  add constraint project_land_types_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

comment on table public.project_land_types is
  'Tipo de terreno do projeto, uma tag por linha. Substitui o array Project.terreno_tipo. Texto livre de proposito, como no original. ON DELETE CASCADE: e parte do projeto. O unique (id, tenant_id) existe porque toda tabela de negocio deste projeto o tem (invariante A7 de supabase/tests/pattern-invariants.sql).';

comment on constraint project_land_types_project_id_land_type_key on public.project_land_types is
  'A mesma tag nao aparece duas vezes no mesmo projeto. Array nao impede a repeticao (o botao de alternar do original evita, mas so o botao), e tag repetida dobraria o projeto em qualquer contagem por tipo de terreno - inclusive nos filtros do mapa, no modulo 9.';

create index project_land_types_tenant_id_land_type_idx
  on public.project_land_types (tenant_id, land_type, project_id);

-- project_purposes --------------------------------------------------------------
--
-- Substitui Project.finalidade_projeto (array de texto). Mesma forma de
-- project_land_types: o formulario sugere quatro valores ("Moradia",
-- "Investimento", "Comercial", "Hoteleiro") e aceita qualquer outro.

create table public.project_purposes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  purpose text not null,
  created_at timestamptz not null default now(),

  constraint project_purposes_id_tenant_id_key unique (id, tenant_id),
  constraint project_purposes_project_id_purpose_key unique (project_id, purpose),
  constraint project_purposes_purpose_not_blank_check check (btrim(purpose) <> '')
);

alter table public.project_purposes
  add constraint project_purposes_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

comment on table public.project_purposes is
  'Finalidade do projeto, uma tag por linha. Substitui o array Project.finalidade_projeto. Texto livre de proposito, como no original. ON DELETE CASCADE: e parte do projeto.';

create index project_purposes_tenant_id_purpose_idx
  on public.project_purposes (tenant_id, purpose, project_id);

-- RLS AINDA NAO EXISTE NESTAS SEIS TABELAS.
--
-- Esta migration nao cria policy nem GRANT. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, elas nascem sem privilegio algum para anon e
-- authenticated, ou seja, invisiveis pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela ficar exposta.
-- Precisa dos dois. A 0033 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades por tabela.
--
-- Recorte esperado (docs/SCHEMA-PLAN.md, modulo 5): colaborador active do tenant
-- le; escrita para quem tem can_edit no menu 'projects' (projects, checklist do
-- projeto e as duas tabelas de tag) ou no menu 'project_flow' (tasks e o
-- checklist da tarefa).
