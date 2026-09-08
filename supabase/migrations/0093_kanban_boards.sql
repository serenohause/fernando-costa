-- O quadro do Fluxo do Projeto deixa de ser desenhado no codigo.
--
-- O PEDIDO
--   Nome do quadro, nome das etapas, cor, ordem e quais etapas aparecem passam a
--   ser configuraveis pelo escritorio, sem deploy. Escopo decidido pelo usuario:
--   APENAS o Fluxo do Projeto. E, decisao dele tambem, o PERCENTUAL de progresso
--   de cada etapa vira campo da etapa em vez de numero cravado em codigo.
--
-- O QUE ESTA MIGRATION FAZ, E O QUE ELA DE PROPOSITO NAO FAZ
--   Ela cria a CONFIGURACAO do quadro sobre as etapas que ja existem, e passa
--   `project_progress` a ler dela. Ela NAO troca `tasks.phase` por uma FK — e e
--   essa fronteira que separa esta fatia da proxima.
--
--   Medido antes de decidir: `project_phase` e um enum COMPARTILHADO por quatro
--   colunas (`tasks.phase`, `projects.current_phase`,
--   `budget_checklists.project_phase`, `project_diary_entries.from_phase/to_phase`),
--   preso por seis checks, por esta view e por `calculateProjectPhase` no
--   frontend. Trocar a coluna de `tasks` e mexer nas tarefas reais do escritorio
--   e nos quatro usos ao mesmo tempo, com producao no ar.
--
--   Entao, a partir daqui: RENOMEAR, COR, ORDEM, MOSTRAR/ESCONDER e PERCENTUAL
--   funcionam. CRIAR e EXCLUIR etapa exigem aquela troca e ficam para a fatia
--   seguinte — com o caminho aberto por `kanban_columns.phase`, que e anulavel
--   justamente para a etapa que ainda nao tem valor no enum.
--
-- A COR E UM NOME, NAO UMA CLASSE — e isto nao e preferencia de estilo
--   O Tailwind monta o CSS varrendo o CODIGO. Uma classe que so existe numa
--   linha do banco nunca entra no arquivo final, e a cor simplesmente nao
--   aparece — sem erro nenhum, o que e a pior forma de quebrar. Por isso a
--   coluna guarda 'blue', 'violet', 'teal', e o mapa nome -> classes fica no
--   frontend, escrito por extenso, onde o Tailwind consegue ler.

create table public.kanban_boards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- A chave e do SISTEMA e nunca muda: e por ela que a tela pede "o quadro do
  -- Fluxo do Projeto". `name` e o que o escritorio renomeia.
  key text not null,
  name text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kanban_boards_id_tenant_id_key unique (id, tenant_id),
  constraint kanban_boards_tenant_id_key_key unique (tenant_id, key),
  constraint kanban_boards_key_format_check check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint kanban_boards_name_not_blank_check check (btrim(name) <> ''),
  constraint kanban_boards_name_length_check check (length(name) <= 60)
);

create trigger kanban_boards_set_updated_at
  before update on public.kanban_boards
  for each row execute function public.set_updated_at();

comment on table public.kanban_boards is
  'Um quadro configuravel por escritorio. `key` e do sistema (a tela pede o quadro por ela) e `name` e o que o escritorio renomeia. Hoje so o Fluxo do Projeto, por decisao de escopo do usuario; a tabela existe para o proximo quadro nao precisar de outra.';

create table public.kanban_columns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  board_id uuid not null,

  key text not null,
  label text not null,

  -- Nome de cor, jamais classe do Tailwind. Ver o cabecalho.
  color text not null default 'slate',

  display_order smallint not null,

  /*
    MOSTRAR OU NAO A COLUNA — e e assim que as cinco fases sem coluna continuam
    sem coluna. Hoje `revision`, `building_permit`, `awaiting_client`,
    `preliminary_study` e `preliminary_design` existem no enum, tem percentual na
    escala de progresso e NAO sao desenhadas no quadro (decisao registrada em
    TaskKanban.tsx e nas migrations 0079/0080). Elas entram aqui como linha
    inativa: a tela fica identica ao que esta no ar hoje, e pela primeira vez o
    escritorio pode reativa-las sem deploy.
  */
  is_active boolean not null default true,

  /*
    O PERCENTUAL DE PROGRESSO SAI DO CODIGO E VIRA CAMPO — decisao do usuario.

    Estava cravado no CASE de `project_progress` (0034/0035/0075/0079/0080), e
    era a razao pela qual mexer na escala exigia migration.

    NULO significa "nao entra na conta", e nao "vale zero". Esse significado ja
    era o da view desde a 0075: a fase sem percentual some do max() e o projeto
    vale a fase mais avancada entre as DEMAIS tarefas. `awaiting_client`,
    `preliminary_study` e `preliminary_design` sao nulas hoje, cada uma com o
    motivo escrito na sua migration — e continuam nulas aqui.
  */
  progress_percent smallint,

  /*
    O VALOR DO ENUM que esta coluna representa.

    E o vinculo que faz o quadro continuar funcionando sobre `tasks.phase` sem
    trocar a coluna de lugar. Anulavel porque a etapa criada pelo escritorio na
    proxima fatia nao tera valor no enum — hoje toda linha tem um.
  */
  phase public.project_phase,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kanban_columns_id_tenant_id_key unique (id, tenant_id),
  constraint kanban_columns_board_id_key_key unique (board_id, key),
  constraint kanban_columns_board_fkey
    foreign key (board_id, tenant_id) references public.kanban_boards (id, tenant_id) on delete cascade,
  constraint kanban_columns_key_format_check check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint kanban_columns_label_not_blank_check check (btrim(label) <> ''),
  constraint kanban_columns_label_length_check check (length(label) <= 40),
  constraint kanban_columns_color_format_check check (color ~ '^[a-z]+$'),
  constraint kanban_columns_progress_range_check
    check (progress_percent is null or (progress_percent between 0 and 100)),

  /*
    UMA FASE APARECE NO MAXIMO UMA VEZ POR QUADRO, e este unique e o que impede
    o defeito silencioso: com duas colunas apontando para `layout`, as mesmas
    tarefas seriam desenhadas nas duas, arrastar de uma para a outra nao mudaria
    fase nenhuma e o cartao voltaria sozinho no proximo carregamento. Alem
    disso, `project_progress` passaria a somar a mesma etapa duas vezes.
  */
  constraint kanban_columns_board_phase_key unique (board_id, phase)
);

create index kanban_columns_tenant_id_board_id_idx
  on public.kanban_columns (tenant_id, board_id, display_order);

/*
  O indice que a view usa. `project_progress` casa coluna por (board_id, phase)
  uma vez POR TAREFA do projeto; sem ele, o calculo de progresso de uma lista de
  projetos varre a tabela de colunas a cada tarefa.
*/
create index kanban_columns_board_id_phase_idx
  on public.kanban_columns (board_id, phase);

create trigger kanban_columns_set_updated_at
  before update on public.kanban_columns
  for each row execute function public.set_updated_at();

comment on table public.kanban_columns is
  'As colunas de um quadro, por escritorio: rotulo, cor, ordem, se aparece e o percentual de progresso que a etapa representa. `key` e estavel e `label` e editavel - renomear a etapa nao pode reescrever o que ja foi gravado nas tarefas. `phase` liga a coluna ao valor de project_phase; sera nulo na etapa criada pelo escritorio, na fatia que trocar tasks.phase por FK. Toda fase de tarefa tem linha aqui, inclusive as cinco que nao sao desenhadas (is_active = false) - e assim que a escala de project_progress continua completa.';
comment on column public.kanban_columns.progress_percent is
  'Quanto a etapa vale na escala de progresso do projeto. NULO e "nao entra na conta", nao "vale zero" - significado que a view ja dava desde a 0075. Lido por public.project_progress desde a 0093; antes disso era um CASE cravado la.';
comment on column public.kanban_columns.color is
  'NOME da cor (blue, violet, teal...), nunca uma classe do Tailwind: o Tailwind monta o CSS varrendo o CODIGO, e uma classe que so existe no banco nao entra no arquivo final - a cor sumiria sem erro nenhum. O mapa nome -> classes fica no frontend.';
comment on column public.kanban_columns.is_active is
  'Se a coluna e desenhada no quadro. False nas cinco fases que hoje existem no enum e nao tem coluna (revision, building_permit, awaiting_client, preliminary_study, preliminary_design): a tela fica igual ao que esta no ar, e o escritorio passa a poder reativa-las sem deploy.';

-- 2. Semeadura: exatamente o quadro que esta no ar hoje ------------------------
--
--    Os rotulos vem de PROJECT_PHASE (src/lib/enums.ts), as cores da constante
--    COLUMNS de TaskKanban.tsx, a ordem da ordem de declaracao do enum (que e a
--    ordem das colunas) e os percentuais do CASE da migration 0080 — um a um,
--    sem arredondar nem "corrigir" nenhum.
--
--    NADA MUDA NA TELA no dia em que esta migration entra. Ela transcreve o que
--    ja existia para um lugar onde o escritorio pode mexer. Se alguma linha
--    daqui divergir do codigo, isso e bug desta migration, nao melhoria.
--
--    `post_approval` NAO entra: `tasks_phase_no_post_approval_check` (0049) a
--    proibe em tarefa, ela existe so para o checklist de orcamento, e coluna de
--    quadro que nenhuma tarefa pode alcancar seria coluna morta.

/*
  "Finalizado" E A COLUNA ESTRANHA DO QUADRO, e vale registrar aqui porque a tela
  depende disso: ela NAO junta tarefas cuja fase e `finished` — o banco recusa
  esse valor em tarefa (`tasks_phase_not_finished_check`, 0032). Ela junta as
  tarefas CONCLUIDAS de todas as fases (`tasksInColumn`, src/features/projects/flow.ts).
  A linha existe com `phase = 'finished'` para o quadro ter a coluna e o rotulo;
  o join da view sobre ela nao casa tarefa nenhuma, e nao deve casar mesmo.
*/

insert into public.kanban_boards (tenant_id, key, name)
select t.id, 'project_flow', 'Fluxo do Projeto' from public.tenants t;

insert into public.kanban_columns
  (tenant_id, board_id, key, label, color, display_order, progress_percent, is_active, phase)
select b.tenant_id, b.id, s.key, s.label, s.cor, s.ordem, s.percentual, s.ativa,
       s.key::public.project_phase
from public.kanban_boards b
cross join (values
  ('not_started',        'Não iniciado',            'muted',     1::smallint,    0::smallint, true),
  ('briefing',           'Briefing',                'blue',      2,   12, true),
  ('preliminary_study',  'Estudo preliminar',       'slate',     3, null, false),
  ('layout',             'Layout',                  'violet',    4,   26, true),
  ('preliminary_design', 'Anteprojeto',             'slate',     5, null, false),
  ('renderings',         'Perspectivas',            'purple',    6,   50, true),
  ('revision',           'Revisão',                 'slate',     7,   55, false),
  ('legal_permit',       'Projeto Legal',           'cyan',      8,   70, true),
  ('hoa_approval',       'Aprovação Condomínio',    'orange',    9,   75, true),
  ('construction_docs',  'Projeto Executivo',       'indigo',   10,   80, true),
  ('engineering_docs',   'Projetos Complementares', 'pink',     11,   90, true),
  ('building_permit',    'Alvará de Construção',    'slate',    12,  100, false),
  ('under_construction', 'Em Obra',                 'teal',     13,  100, true),
  ('awaiting_client',    'Aguardando Cliente',      'slate',    14, null, false),
  ('finished',           'Finalizado',              'emerald',  15,  100, true)
) as s(key, label, cor, ordem, percentual, ativa)
where b.key = 'project_flow';

-- 3. Escritorio novo nasce com o quadro ---------------------------------------
--
--    Sem isto o quadro do escritorio novo abriria VAZIO: a tela nao teria coluna
--    nenhuma para desenhar, e `project_progress` daria 0 para todo projeto dele.
--    Mesma forma do gatilho de service_types (0084).

create or replace function public.seed_default_kanban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_board_id uuid;
begin
  insert into public.kanban_boards (tenant_id, key, name)
  values (new.id, 'project_flow', 'Fluxo do Projeto')
  on conflict (tenant_id, key) do nothing
  returning id into v_board_id;

  if v_board_id is null then
    return new;
  end if;

  insert into public.kanban_columns
    (tenant_id, board_id, key, label, color, display_order, progress_percent, is_active, phase)
  select new.id, v_board_id, s.key, s.label, s.cor, s.ordem, s.percentual, s.ativa,
         s.key::public.project_phase
  from (values
    ('not_started',        'Não iniciado',            'muted',     1::smallint,    0::smallint, true),
    ('briefing',           'Briefing',                'blue',      2,   12, true),
    ('preliminary_study',  'Estudo preliminar',       'slate',     3, null, false),
    ('layout',             'Layout',                  'violet',    4,   26, true),
    ('preliminary_design', 'Anteprojeto',             'slate',     5, null, false),
    ('renderings',         'Perspectivas',            'purple',    6,   50, true),
    ('revision',           'Revisão',                 'slate',     7,   55, false),
    ('legal_permit',       'Projeto Legal',           'cyan',      8,   70, true),
    ('hoa_approval',       'Aprovação Condomínio',    'orange',    9,   75, true),
    ('construction_docs',  'Projeto Executivo',       'indigo',   10,   80, true),
    ('engineering_docs',   'Projetos Complementares', 'pink',     11,   90, true),
    ('building_permit',    'Alvará de Construção',    'slate',    12,  100, false),
    ('under_construction', 'Em Obra',                 'teal',     13,  100, true),
    ('awaiting_client',    'Aguardando Cliente',      'slate',    14, null, false),
    ('finished',           'Finalizado',              'emerald',  15,  100, true)
  ) as s(key, label, cor, ordem, percentual, ativa);

  return new;
end;
$BODY$;

comment on function public.seed_default_kanban is
  'Da ao escritorio recem-criado o quadro do Fluxo do Projeto com as quinze etapas padrao (dez desenhadas, cinco inativas). Sem isto o quadro dele abriria sem coluna nenhuma e project_progress daria 0 em todo projeto, porque a escala de percentual passou a morar em kanban_columns na 0093.';

create trigger tenants_seed_kanban
  after insert on public.tenants
  for each row execute function public.seed_default_kanban();

-- 4. RLS ------------------------------------------------------------------------

alter table public.kanban_boards enable row level security;
alter table public.kanban_columns enable row level security;

/*
  LEITURA LARGA, e ela e MAIS necessaria do que parece: quem abre o Fluxo do
  Projeto precisa das colunas para a tela existir, e `project_progress` e
  `security invoker` — ou seja, o SELECT dela sobre kanban_columns roda como
  quem pergunta. Se a policy de leitura fosse estreita, o progresso de projeto
  cairia para 0 para quem ficasse de fora, SEM ERRO. `is_active_collaborator()`
  e o mesmo portao que ja governa ler projeto e tarefa, entao ninguem que hoje
  ve progresso passa a nao ver.
*/
create policy kanban_boards_select_active_collaborator
  on public.kanban_boards for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

create policy kanban_boards_update_settings_editor
  on public.kanban_boards for update
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

create policy kanban_columns_select_active_collaborator
  on public.kanban_columns for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

create policy kanban_columns_update_settings_editor
  on public.kanban_columns for update
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

/*
  NAO HA POLICY DE INSERT NEM DE DELETE EM NENHUMA DAS DUAS, e a ausencia e
  deliberada — nao esquecimento como o grant faltante da 0084.

  Quadro nasce com o escritorio (gatilho acima) e nao se apaga: apagar deixaria
  as tarefas sem lugar nenhum.

  Coluna: nesta fatia nao existe coluna que se possa criar. Uma linha com `phase`
  nulo seria uma coluna que nenhuma tarefa pode alcancar, porque `tasks.phase`
  ainda e o enum — coluna decorativa, sempre vazia, que o escritorio criaria e
  nao entenderia por que nao funciona. E apagar uma linha existente tiraria a
  fase da escala de progresso em silencio. As duas coisas chegam na fatia que
  trocar `tasks.phase` por FK, junto com o "para onde mover as tarefas?" que o
  usuario ja decidiu pedir na tela.
*/

grant select, update on table public.kanban_boards to authenticated;
grant select, update on table public.kanban_columns to authenticated;

-- 5. O progresso passa a ler a configuracao ------------------------------------
--
--    Unica mudanca na view: o CASE de quinze linhas vira `max(kc.progress_percent)`.
--    Todo o resto — as colunas devolvidas, o `distinct` das contagens, a regra
--    de 100% so com TODAS as tarefas concluidas, o coalesce final — e a 0080
--    intacta. Os percentuais foram transcritos um a um na semeadura acima, entao
--    o numero que cada projeto exibe hoje e o mesmo depois desta migration.
--
--    O QUE DEIXA DE SER VERDADE: o COMMENT da 0080 dizia que "fase de
--    project_phase que nao esteja listada no CASE cai em nulo e some do calculo
--    SEM ERRO NENHUM: quem acrescentar valor ao enum passa por aqui". Continua
--    valendo, so que o lugar por onde passar deixou de ser esta view e virou uma
--    linha de kanban_columns — inclusive no gatilho de escritorio novo.
--
--    `create or replace` e nao `drop`: recriar a view apaga o GRANT junto, e foi
--    assim que a leitura de project_progress quebrou na 0036.

create or replace view public.project_progress
with (security_invoker = true) as
select
  agg.project_id,
  agg.tenant_id,

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

    /*
      A escala agora vem da configuracao do escritorio. Etapa com percentual
      NULO some do max() e o projeto vale a fase mais avancada entre as DEMAIS
      tarefas — mesmo significado que a 0075 deu ao nulo, agora editavel.
      Sem atalho de conclusao aqui: conclusao e assunto de progress_percent.
    */
    coalesce(max(kc.progress_percent), 0)::smallint as phase_percent,

    -- Contagem DISTINTA, como na 0035: o join com task_checklist_items
    -- multiplica a linha da tarefa por item de checklist, e contar sem distinct
    -- daria peso maior a tarefa com checklist grande. O join novo com
    -- kanban_columns NAO multiplica nada: unique (board_id, phase) garante no
    -- maximo uma coluna por fase, e unique (tenant_id, key) no maximo um quadro
    -- project_flow por escritorio.
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
  left join public.kanban_boards kb
    on kb.tenant_id = p.tenant_id
   and kb.key = 'project_flow'
  left join public.kanban_columns kc
    on kc.board_id = kb.id
   and kc.phase = t.phase
  group by p.id, p.tenant_id
) agg;

-- Repetido de proposito: a 0036 documenta o custo de descobrir tarde que ele
-- sumiu. Nao houve DROP aqui, entao ele nao se perdeu — repetir e barato.
grant select on public.project_progress to authenticated;

comment on column public.project_progress.phase_percent is
  'Fase mais avancada alcancada pelas tarefas, SEM o atalho de tarefa concluida - concluir tarefa nao move este numero. Desde a 0093 a escala vem de kanban_columns.progress_percent, editavel pelo escritorio em Configuracoes; antes era um CASE cravado nesta view. Etapa com percentual NULO some do calculo sem erro nenhum, e fase sem linha em kanban_columns tambem - quem acrescentar valor ao enum project_phase passa a precisar de uma linha la (e no gatilho seed_default_kanban), nao mais de uma linha aqui.';
