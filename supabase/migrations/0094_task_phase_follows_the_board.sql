-- A etapa da tarefa deixa de ser valor do sistema e vira registro do escritorio.
--
-- O PEDIDO
--   Criar etapa nova no Fluxo do Projeto, com nome escolhido pelo escritorio. A
--   0093 entregou renomear, cor, ordem, esconder e percentual; criar e excluir
--   ficaram de fora porque `tasks.phase` era o enum `project_phase` e nenhuma
--   etapa nova caberia nele.
--
-- POR QUE NAO RESERVAR VAGAS NO ENUM
--   A saida barata seria acrescentar `custom_1`..`custom_n` ao enum e deixar o
--   escritorio ocupar uma vaga por etapa. Ela nao serve aqui por uma razao de
--   arquitetura: VALOR DE ENUM E GLOBAL DO BANCO e o quadro e POR ESCRITORIO.
--   Dez escritorios esgotariam as vagas de todo mundo, e valor de enum nao se
--   apaga — a lista cresceria para sempre, com os erros de digitacao junto.
--   Alem disso o `key` apareceria cru ("custom_3") em todo lugar que ainda nao
--   consultasse o quadro.
--
-- O QUE ESTA MIGRATION FAZ
--   `tasks.phase` vira TEXTO com chave estrangeira para `kanban_columns`. A
--   etapa passa a ser uma linha do escritorio, criada e apagada como qualquer
--   outro cadastro, e a integridade que o enum dava passa a ser dada pela FK —
--   que e mais forte, porque tambem impede APAGAR uma etapa que ainda tem
--   tarefa dentro.
--
--   Cinco colunas irmas viram texto junto, e nao por simetria: elas guardam
--   fase ao lado de `tasks.phase` e ficariam impossibilitadas de registrar uma
--   etapa nova. `projects.current_phase` e calculada a partir das tarefas;
--   `project_diary_entries.from_phase/to_phase` registram o arraste do cartao;
--   `task_checklist_items.phase` e `project_checklist_items.phase` guardam a
--   etapa do item de checklist.
--
--   `budget_checklists.project_phase` CONTINUA ENUM, de proposito: o dominio
--   dela sao quatro valores fixos do orcamento (0049), nao tem relacao com o
--   quadro e ninguem a arrasta.
--
-- SEM FK NAS IRMAS, E ISSO E DELIBERADO
--   So `tasks.phase` ganha chave estrangeira. As outras cinco guardam HISTORICO
--   ou DERIVADO: uma entrada de diario que diz "saiu de Layout e foi para
--   Perspectivas" precisa continuar legivel depois de a etapa ser apagada. Com
--   FK, apagar uma etapa exigiria reescrever o passado — e passado reescrito e
--   pior que rotulo orfao, que a tela resolve exibindo a chave.

-- 1. O alvo da chave estrangeira ------------------------------------------------
--
--    A 0093 criou unique (board_id, key). A FK de `tasks` precisa casar por
--    (tenant_id, phase), porque tarefa nao guarda quadro — ela guarda etapa, e o
--    escritorio dela ja esta na propria linha.
--
--    CONSEQUENCIA PARA O FUTURO, escrita agora para nao ser descoberta depois:
--    dois quadros do mesmo escritorio nao poderao ter etapas de mesma chave. O
--    dia em que o segundo quadro chegar, ou as chaves se distinguem por quadro,
--    ou esta unicidade muda junto com a FK.

alter table public.kanban_columns
  add constraint kanban_columns_tenant_id_key_key unique (tenant_id, key);

-- 2. Sai tudo que depende do tipo -----------------------------------------------
--
--    A view precisa cair antes: o Postgres recusa mudar o tipo de uma coluna que
--    uma view enxerga. `drop view` leva o GRANT junto — a 0036 documenta o custo
--    de descobrir isso tarde —, e por isso ele e refeito no fim.

drop view if exists public.project_progress;

/*
  A funcao cai porque a ASSINATURA muda: `p_from_phase project_phase` vira text.
  Trocar tipo de parametro nao e `create or replace`, e sim outra funcao — sem o
  drop, o banco ficaria com as duas e a chamada do frontend passaria a depender
  de qual delas o Postgres escolhesse.
*/
drop function if exists public.record_project_diary_event(
  uuid, public.diary_system_event, text, text, text,
  public.project_phase, public.project_phase, public.operational_tag,
  uuid, date, time
);

/*
  Os tres checks caem porque comparam com literal do ENUM (`'finished'::project_phase`)
  ou fazem `(phase)::text` — expressoes que deixam de valer, ou de fazer sentido,
  quando a coluna ja e texto. Voltam logo abaixo, reescritos.
*/
alter table public.tasks drop constraint tasks_phase_not_finished_check;
alter table public.tasks drop constraint tasks_phase_no_post_approval_check;
alter table public.projects drop constraint projects_current_phase_domain_check;

-- 3. As seis colunas viram texto ------------------------------------------------
--
--    `using phase::text` preserva o valor exato: 'layout' continua 'layout'.
--    Nenhuma linha muda de conteudo, e e por isso que as chaves semeadas pela
--    0093 sao IDENTICAS aos valores do enum — aquela transcricao existia para
--    este momento.

alter table public.tasks
  alter column phase type text using phase::text;

alter table public.projects
  alter column current_phase type text using current_phase::text;

alter table public.task_checklist_items
  alter column phase type text using phase::text;

alter table public.project_checklist_items
  alter column phase type text using phase::text;

alter table public.project_diary_entries
  alter column from_phase type text using from_phase::text,
  alter column to_phase type text using to_phase::text;

-- 4. Os checks voltam, agora sobre texto ----------------------------------------

/*
  "Finalizado" NAO E FASE DE TAREFA, e continua nao sendo. A coluna existe no
  quadro e junta as tarefas CONCLUIDAS de todas as etapas (`tasksInColumn`,
  src/features/projects/flow.ts) — gravar `phase = 'finished'` numa tarefa a
  faria sumir da propria coluna dela sem estar concluida.

  A FK sozinha nao barraria isso: 'finished' e uma etapa legitima do quadro.
*/
alter table public.tasks
  add constraint tasks_phase_not_finished_check
  check (phase is null or phase <> 'finished');

/*
  `post_approval` nao ganha check de volta, e a ausencia e a diferenca desta
  migration. Ele existia porque o ENUM oferecia um valor que so o checklist de
  orcamento usava, e nada impedia uma tarefa de recebe-lo. Agora a FK so aceita
  etapa que exista no quadro do escritorio, e `post_approval` nao e uma —
  a 0093 deixou de fora de proposito. O check virou redundante, e check
  redundante e uma segunda regra para manter em sincronia com a primeira.

  `projects.current_phase` continua com o dele: ela NAO tem FK (ver o cabecalho),
  entao aqui o check ainda e a unica barreira.
*/
alter table public.projects
  add constraint projects_current_phase_domain_check
  check (current_phase is null or current_phase <> 'post_approval');

-- 5. A integridade que o enum dava, agora dada pela FK ---------------------------
--
--    E ela da MAIS do que o enum dava. O enum garantia "o valor existe na lista
--    do sistema"; a FK garante "a etapa existe NO QUADRO DESTE ESCRITORIO" — e,
--    no sentido inverso, impede apagar uma etapa que ainda tem tarefa dentro.
--
--    RESTRICT, e nao CASCADE nem SET NULL. Cascade apagaria tarefas reais ao
--    excluir uma etapa; set null deixaria a tarefa sem lugar no quadro, que e a
--    mesma coisa que sumir. Restringir e o que transforma "excluir etapa" no
--    gesto que o usuario pediu: a tela pergunta para onde mover antes.

alter table public.tasks
  add constraint tasks_phase_fkey
  foreign key (tenant_id, phase)
  references public.kanban_columns (tenant_id, key)
  on update cascade
  on delete restrict;

comment on constraint tasks_phase_fkey on public.tasks is
  'A etapa da tarefa e uma etapa do quadro DESTE escritorio. Substitui o enum project_phase (0094) e faz duas coisas que ele nao fazia: aceita etapa criada pelo escritorio, e impede excluir etapa que ainda tem tarefa dentro (restrict). Nao ha FK equivalente em projects.current_phase nem nas colunas de diario - elas guardam derivado e historico, que precisam sobreviver a exclusao da etapa.';

-- 6. A coluna `phase` do quadro sai de cena --------------------------------------
--
--    Ela era o vinculo entre a coluna do quadro e o valor do enum. Agora o
--    vinculo E a chave, e manter as duas seria manter duas respostas para a
--    mesma pergunta.

alter table public.kanban_columns drop column phase;

comment on table public.kanban_columns is
  'As colunas de um quadro, por escritorio: rotulo, cor, ordem, se aparece e o percentual de progresso que a etapa representa. `key` e estavel, e desde a 0094 e ela que tasks.phase referencia por chave estrangeira - renomear a etapa muda o `label` e nao toca no que esta gravado nas tarefas. Etapa criada pelo escritorio nasce com chave derivada do nome.';

/*
  DUAS ETAPAS NAO SE APAGAM, e a razao e estrutural, nao politica.

  `not_started` e `finished` sao o que `calculateProjectPhase`
  (src/features/projects/project-phase.ts) devolve nos dois extremos: projeto sem
  tarefa nenhuma esta em "Nao iniciado", e projeto com tudo concluido esta em
  "Finalizado". Sao os unicos dois valores que o sistema GRAVA por conta propria
  em `projects.current_phase`. Sem a linha correspondente no quadro, esses
  projetos ficariam exibindo a chave crua, e a coluna "Finalizado" — que e onde
  toda tarefa concluida aparece — deixaria de existir.

  ESCONDER as duas continua permitido: e reversivel, e a decisao e do escritorio.
  Apagar nao e.
*/
create or replace function public.protect_structural_kanban_columns()
returns trigger
language plpgsql
as $BODY$
begin
  if old.key in ('not_started', 'finished') then
    raise exception 'etapa estrutural nao pode ser excluida' using errcode = 'P0001';
  end if;
  return old;
end;
$BODY$;

create trigger kanban_columns_protect_structural
  before delete on public.kanban_columns
  for each row execute function public.protect_structural_kanban_columns();

comment on function public.protect_structural_kanban_columns is
  'Recusa excluir as etapas "Nao iniciado" e "Finalizado": sao os dois valores que calculateProjectPhase grava sozinho em projects.current_phase, e sem elas o projeto sem tarefas e o projeto concluido ficariam sem etapa no quadro. Esconder continua permitido - e reversivel.';

-- 7. Criar e excluir etapa passam a existir --------------------------------------
--
--    A 0093 nao criou estas policies de proposito, e disse por que: sem esta
--    migration, uma etapa criada nao poderia receber tarefa nenhuma. Agora pode.

create policy kanban_columns_insert_settings_editor
  on public.kanban_columns for insert
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

create policy kanban_columns_delete_settings_editor
  on public.kanban_columns for delete
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

comment on policy kanban_columns_delete_settings_editor on public.kanban_columns is
  'Excluir etapa. Quem impede que isso esconda trabalho nao e esta policy: e a FK tasks_phase_fkey (restrict), que recusa enquanto houver tarefa na etapa, e o gatilho que protege "Nao iniciado" e "Finalizado". A tela pergunta para onde mover antes de tentar.';

grant insert, delete on table public.kanban_columns to authenticated;

-- 8. A view volta, casando por chave ---------------------------------------------
--
--    Unica diferenca para a 0093: o join era `kc.phase = t.phase` e agora e
--    `kc.key = t.phase`. Todo o resto e a 0080 preservada — as colunas
--    devolvidas, o `distinct` das contagens, a regra de 100% so com TODAS as
--    tarefas concluidas, o coalesce final.

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

    /* Etapa com percentual NULO some do max() e o projeto vale a etapa mais
       avancada entre as DEMAIS tarefas — significado que a 0075 deu ao nulo. */
    coalesce(max(kc.progress_percent), 0)::smallint as phase_percent,

    -- Contagem DISTINTA, como na 0035: o join com task_checklist_items
    -- multiplica a linha da tarefa por item de checklist. O join com
    -- kanban_columns nao multiplica: unique (tenant_id, key) garante no maximo
    -- uma etapa por chave em cada escritorio.
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
  left join public.kanban_columns kc
    on kc.tenant_id = p.tenant_id
   and kc.key = t.phase
  group by p.id, p.tenant_id
) agg;

grant select on public.project_progress to authenticated;

comment on view public.project_progress is
  'Progresso do projeto, com o percentual de cada etapa vindo de kanban_columns (0093) e o casamento feito por chave desde a 0094, quando tasks.phase deixou de ser enum. Tarefa concluida leva o projeto a 100% somente quando TODAS estao concluidas (0075); etapa com percentual NULO fica fora do calculo.';

comment on column public.project_progress.phase_percent is
  'Etapa mais avancada alcancada pelas tarefas, SEM o atalho de tarefa concluida. A escala vem de kanban_columns.progress_percent, editavel em Configuracoes > Quadros. Etapa com percentual nulo some do calculo; tarefa numa etapa que nao existe mais no quadro tambem - e ai o rotulo cru aparece na tela, que e o sinal de que alguem apagou uma etapa com historico.';

-- 9. A funcao do diario volta, recebendo texto -----------------------------------

create or replace function public.record_project_diary_event(
  p_project_id uuid,
  p_system_event public.diary_system_event,
  p_title text,
  p_description text default null,
  p_event_key text default null,
  p_from_phase text default null,
  p_to_phase text default null,
  p_operational_tag public.operational_tag default null,
  p_responsible_id uuid default null,
  p_occurrence_date date default null,
  p_occurrence_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
  v_collaborator_id uuid;
  v_entry_id uuid;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- A permissao do FLUXO, e nao a do diario. Conferida ANTES de qualquer leitura
  -- de projeto: quem nao pode mexer no fluxo tambem nao precisa descobrir, pela
  -- mensagem de erro, se um determinado id de projeto existe.
  if not public.can_edit_menu('project_flow') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_system_event is null then
    raise exception 'system_event_required' using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'title_required' using errcode = 'P0001';
  end if;

  -- tenant_id explicito porque SECURITY DEFINER nao passa pela RLS de projects.
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.tenant_id = v_tenant_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;

  v_collaborator_id := public.auth_collaborator_id();

  -- A deduplicacao vem do INDICE, e nao de uma consulta previa. Consultar e
  -- depois gravar nao impede nada: dois cliques rapidos, ou duas abas, passam os
  -- dois pelo teste e gravam os dois - foi exatamente o que a "idempotencia" do
  -- original fez (diaryAutoEvents.js:13). Chave nula nunca conflita, e e assim
  -- que o evento sem fato repetivel entra sempre.
  insert into public.project_diary_entries (
    tenant_id, project_id, entry_type, title, description,
    occurrence_date, occurrence_time, status, visibility,
    is_automatic, event_key, system_event,
    from_phase, to_phase, operational_tag,
    responsible_id, created_by_id
  ) values (
    v_tenant_id, p_project_id, 'system', p_title, p_description,
    coalesce(p_occurrence_date, current_date), p_occurrence_time,
    'completed', 'internal',
    true, p_event_key, p_system_event,
    p_from_phase, p_to_phase, p_operational_tag,
    p_responsible_id, v_collaborator_id
  )
  on conflict on constraint project_diary_entries_tenant_id_event_key_key
    do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select e.id into v_entry_id
    from public.project_diary_entries e
    where e.tenant_id = v_tenant_id
      and e.event_key = p_event_key;

    return jsonb_build_object(
      'outcome', 'already_recorded',
      'entryId', v_entry_id,
      'projectId', p_project_id,
      'systemEvent', p_system_event::text
    );
  end if;

  return jsonb_build_object(
    'outcome', 'recorded',
    'entryId', v_entry_id,
    'projectId', p_project_id,
    'systemEvent', p_system_event::text
  );
end;
$BODY$;

comment on function public.record_project_diary_event is
  'Grava o evento automatico do Diario do Projeto (arraste de cartao, troca de responsavel, tag). SECURITY DEFINER que confere can_edit_menu(project_flow) por dentro, e nao a permissao do diario - sem isso o arraste do Arquiteto deixaria de registrar em silencio (ver 0070). As fases passaram a ser TEXTO na 0094, quando a etapa deixou de ser valor do enum e virou registro do escritorio; a entrada guarda o texto e nao tem FK, para o historico continuar legivel depois de a etapa ser apagada.';

revoke all on function public.record_project_diary_event(
  uuid, public.diary_system_event, text, text, text, text, text,
  public.operational_tag, uuid, date, time
) from public, anon;
grant execute on function public.record_project_diary_event(
  uuid, public.diary_system_event, text, text, text, text, text,
  public.operational_tag, uuid, date, time
) to authenticated;

-- 10. O gatilho do escritorio novo, sem a coluna que saiu ------------------------

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
    (tenant_id, board_id, key, label, color, display_order, progress_percent, is_active)
  select new.id, v_board_id, s.key, s.label, s.cor, s.ordem, s.percentual, s.ativa
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

/*
  O ENUM `project_phase` CONTINUA EXISTINDO, e nao e sobra: `budget_checklists.project_phase`
  ainda o usa. Apagar tipo e irreversivel, e o de/para da importacao do base44
  ainda o reconhece. O que mudou e que ele deixou de ser a lista de etapas do
  quadro — virou o dominio de uma coluna do modulo de orcamento, e so.
*/
comment on type public.project_phase is
  'Fase usada por budget_checklists.project_phase, que aceita SO renderings, construction_docs, engineering_docs e post_approval (0049). DEIXOU DE SER A LISTA DE ETAPAS DO QUADRO na migration 0094: tasks.phase, projects.current_phase, os dois lados de project_diary_entries e as duas colunas de checklist viraram texto, e a etapa passou a ser uma linha de kanban_columns, criada pelo proprio escritorio. Os valores continuam aqui porque apagar valor de enum e irreversivel e o de/para da importacao ainda os reconhece.';
