-- Ambientes do projeto (sala, quarto, cozinha...) e o quadro que os mostra.
--
-- O PEDIDO
--   "No modulo Projetos, permitir adicionar ambientes a cada projeto, e vincular
--   isso ao kanban do fluxo de projeto; em configuracoes deve haver um toggle que
--   diz se aquela coluna exibe ou nao os ambientes do projeto. Inclusive devem
--   ser adicionados como objetivos a serem marcados, quando mostrados no kanban."
--
-- O QUE MUDA
--   1. `project_rooms`: os ambientes de cada projeto, com nome e ordem.
--   2. `kanban_columns.shows_project_rooms`: o toggle da etapa. Nasce FALSO em
--      todas as etapas, de todos os escritorios: nada muda no quadro ate alguem
--      ligar.
--   3. `task_checklist_items.room_id`: o objetivo que representa um ambiente.
--
-- A UNICIDADE DO TITULO PASSA A SER PARCIAL, e e a unica mudanca em regra antiga.
--   `task_checklist_items_task_id_title_key` (unique (task_id, title)) existia
--   para o mesmo objetivo padrao nao entrar duas vezes na tarefa. Ambiente e
--   diferente: "Sala" precisa ser marcada em CADA etapa que mostra ambientes, e a
--   tarefa que passa por duas dessas etapas teria dois itens "Sala". Entao:
--   - objetivo comum (room_id nulo): continua unico por titulo na tarefa, com o
--     MESMO nome de restricao, e a frase da tela continua valendo;
--   - objetivo de ambiente: unico por (tarefa, etapa, ambiente).
--
-- O QUE ACONTECE COM O QUE JA EXISTE
--   Nada e semeado. Nenhuma tarefa ganha item nesta migration: os objetivos de
--   ambiente nascem pela tela, quando a etapa estiver ligada e o projeto tiver
--   ambientes.

-- 1. Ambientes -------------------------------------------------------------------

create table public.project_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  name text not null,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_rooms_name_not_blank_check check (btrim(name) <> ''),
  constraint project_rooms_name_length_check check (length(name) <= 60),
  /* Dois "Quarto" no mesmo projeto virariam dois objetivos iguais no cartao, e
     ninguem saberia qual marcou. A tela sugere "Quarto 1" e "Quarto 2". */
  constraint project_rooms_project_id_name_key unique (project_id, name),
  constraint project_rooms_id_tenant_id_key unique (id, tenant_id),
  constraint project_rooms_project_fkey
    foreign key (project_id, tenant_id) references public.projects (id, tenant_id) on delete cascade
);

create index project_rooms_tenant_id_project_id_idx
  on public.project_rooms (tenant_id, project_id);

create trigger project_rooms_set_updated_at
  before update on public.project_rooms
  for each row execute function public.set_updated_at();

comment on table public.project_rooms is
  'Ambientes de um projeto (sala, quarto, cozinha...) (0100). Viram objetivos da tarefa nas etapas com kanban_columns.shows_project_rooms ligado.';

alter table public.project_rooms enable row level security;

/* A mesma regra de `projects` (0033): le quem e colaborador ativo, porque o
   Fluxo do Projeto precisa dos ambientes; escreve quem edita Projetos. */
create policy project_rooms_select_active_collaborator
  on public.project_rooms for select
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

create policy project_rooms_insert_projects_editor
  on public.project_rooms for insert
  to authenticated
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('projects')));

create policy project_rooms_update_projects_editor
  on public.project_rooms for update
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('projects')))
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('projects')));

create policy project_rooms_delete_projects_editor
  on public.project_rooms for delete
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('projects')));

grant select, insert, update, delete on table public.project_rooms to authenticated;

-- 2. O toggle da etapa -----------------------------------------------------------

alter table public.kanban_columns
  add column shows_project_rooms boolean not null default false;

comment on column public.kanban_columns.shows_project_rooms is
  'A etapa mostra os ambientes do projeto (0100): a tarefa nela ganha um objetivo por ambiente, na secao "Ambientes". Falso por padrao.';

-- 3. O objetivo que e um ambiente -----------------------------------------------

alter table public.task_checklist_items
  add column room_id uuid;

/* CASCADE: tirar o ambiente do projeto tira os objetivos dele das tarefas.
   Deixar o item orfao faria "Sala" continuar travando o avanco de um projeto
   que nao tem mais sala. */
alter table public.task_checklist_items
  add constraint task_checklist_items_room_fkey
  foreign key (room_id, tenant_id) references public.project_rooms (id, tenant_id) on delete cascade;

/* Sem etapa, o objetivo de ambiente nao teria a que etapa pertencer, e a
   unicidade por (tarefa, etapa, ambiente) deixaria de valer (nulo nao colide). */
alter table public.task_checklist_items
  add constraint task_checklist_items_room_requires_phase_check
  check (room_id is null or phase is not null);

alter table public.task_checklist_items
  drop constraint task_checklist_items_task_id_title_key;

/* MESMO NOME da restricao antiga, de proposito: a frase da tela
   (TASKS_ERROR_MESSAGES) continua casando. */
create unique index task_checklist_items_task_id_title_key
  on public.task_checklist_items (task_id, title)
  where room_id is null;

create unique index task_checklist_items_task_id_phase_room_id_key
  on public.task_checklist_items (task_id, phase, room_id)
  where room_id is not null;

comment on column public.task_checklist_items.room_id is
  'O ambiente do projeto que este objetivo representa, quando representa (0100). O titulo e o nome do ambiente, mantido em dia por project_rooms_sync_checklist_title.';

/*
  O AMBIENTE PRECISA SER DO PROJETO DA TAREFA. A FK so garante que ele e do mesmo
  escritorio; "Sala" do projeto A no cartao do projeto B e a confusao que ela nao
  pega.

  SECURITY DEFINER porque a conferencia le `tasks` e `project_rooms`, e quem
  insere o item pode enxergar as duas por RLS mas nao e isso que deve decidir se
  a regra vale. So consulta existencia; nao devolve dado.
*/
create function public.check_checklist_room_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  if new.room_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.project_rooms r
    join public.tasks t on t.project_id = r.project_id and t.tenant_id = r.tenant_id
    where r.id = new.room_id and t.id = new.task_id
  ) then
    raise exception using errcode = '23514', message = 'ambiente_de_outro_projeto';
  end if;

  return new;
end;
$BODY$;

create trigger task_checklist_items_check_room_project
  before insert or update of room_id, task_id on public.task_checklist_items
  for each row execute function public.check_checklist_room_project();

/*
  RENOMEAR O AMBIENTE RENOMEIA OS OBJETIVOS DELE.

  SECURITY DEFINER e o ponto: quem renomeia o ambiente edita Projetos, e pode nao
  editar o Fluxo do Projeto. Como invoker, o UPDATE nos itens passaria pela RLS
  de `task_checklist_items`, atingiria zero linhas SEM erro, e o cartao ficaria
  com o nome velho. A escrita e restrita aos itens daquele ambiente e so copia o
  nome.
*/
create function public.sync_room_name_to_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  if new.name is distinct from old.name then
    update public.task_checklist_items
       set title = new.name
     where room_id = new.id;
  end if;
  return new;
end;
$BODY$;

create trigger project_rooms_sync_checklist_title
  after update of name on public.project_rooms
  for each row execute function public.sync_room_name_to_checklist();

revoke all on function public.check_checklist_room_project() from public, anon, authenticated;
revoke all on function public.sync_room_name_to_checklist() from public, anon, authenticated;
