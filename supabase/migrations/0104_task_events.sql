-- O historico do cartao: tudo o que acontece na tarefa, com quem fez.
--
-- O PEDIDO
--   "O historico do card deve pegar conclusao de objetivos, data, criacao etc —
--   tudo que ocorrer naquele card, registrando o usuario."
--
-- O QUE HAVIA
--   A secao "Atividade" do cartao lia `project_diary_entries` e so encontrava
--   tres fatos: mudanca de etapa, troca de responsavel da tarefa e status
--   operacional. Objetivo concluido, prazo alterado, titulo reescrito e a
--   propria criacao da tarefa nao apareciam em lugar nenhum. E tarefa SEM
--   projeto nao registrava nada, porque o diario e do projeto.
--
-- POR QUE GATILHO, E NAO CHAMADA DA TELA
--   O diario e escrito pelo frontend a cada gesto; quem escrever por outro
--   caminho (script, correcao manual, outra tela no futuro) nao aparece no
--   historico. Gatilho registra a MUDANCA, venha de onde vier, e le o autor do
--   proprio JWT (`auth_collaborator_id`). Sem sessao — seed, correcao pelo
--   painel — o autor fica nulo e a tela mostra "Sistema", que e a verdade.
--
-- O NOME DO AUTOR E COPIADO (`actor_name`), como as colunas de historico do
--   diario (0094): desligar o colaborador nao pode reescrever o passado. O `id`
--   continua ali enquanto ele existir, para foto e link.
--
-- RUIDO: A SEMEADURA DE OBJETIVOS VIRA UM EVENTO SO.
--   Entrar numa etapa cria de uma vez todos os objetivos do modelo (onze, em
--   Projeto Executivo). Onze linhas no historico afogariam o resto, entao o
--   gatilho de INSERT e POR COMANDO: uma linha so ("11 objetivos da etapa
--   criados") quando vem em lote, e o evento normal quando alguem acrescenta um
--   objetivo pela tela.

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  task_id uuid not null,

  /* Quem fez. Nulo = sem sessao (seed, correcao no banco): a tela diz "Sistema". */
  actor_id uuid,
  actor_name text,

  kind text not null,
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint task_events_kind_check check (kind in (
    'task_created',
    'title_changed',
    'description_changed',
    'due_date_changed',
    'start_date_changed',
    'priority_changed',
    'status_changed',
    'phase_changed',
    'responsible_changed',
    'operational_tag_changed',
    'hours_changed',
    'objective_added',
    'objectives_seeded',
    'objective_renamed',
    'objective_removed',
    'objective_completed',
    'objective_reopened',
    'objective_due_changed',
    'objective_assignee_added',
    'objective_assignee_removed'
  )),
  constraint task_events_task_fkey
    foreign key (task_id, tenant_id) references public.tasks (id, tenant_id) on delete cascade,
  /*
    SET NULL COM LISTA DE COLUNAS: sem a lista, apagar o colaborador anularia
    tambem `tenant_id`, que e NOT NULL — o defeito documentado na 0073. O nome
    fica em `actor_name` e o historico continua legivel.
  */
  constraint task_events_actor_fkey
    foreign key (actor_id, tenant_id) references public.collaborators (id, tenant_id)
    on delete set null (actor_id)
);

create index task_events_tenant_id_task_id_created_at_idx
  on public.task_events (tenant_id, task_id, created_at desc);

comment on table public.task_events is
  'Historico do cartao do Fluxo do Projeto (0104): criacao, edicoes, objetivos concluidos, prazos e responsaveis, com o autor lido do JWT. Escrito so por gatilho; nenhuma tela insere aqui.';

alter table public.task_events enable row level security;

/* Le quem le a tarefa. NINGUEM escreve pela API: as linhas nascem dos gatilhos,
   que sao SECURITY DEFINER. Historico que a tela pode reescrever nao e
   historico. */
create policy task_events_select_active_collaborator
  on public.task_events for select
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

grant select on table public.task_events to authenticated;

-- O gravador ----------------------------------------------------------------

create function public.record_task_event(p_tenant_id uuid, p_task_id uuid, p_kind text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_actor uuid;
  v_name text;
begin
  /*
    O AUTOR SO VALE SE FOR DO MESMO ESCRITORIO DA TAREFA — e isso nao e zelo, e
    o que impede o historico de derrubar a gravacao. `auth_collaborator_id()` le
    o JWT da sessao; sessao de outro escritorio (ou claim remanescente) daria uma
    chave estrangeira invalida em task_events e o UPDATE da tarefa inteiro
    falharia por causa do registro. Sem dono conhecido, o evento entra sem autor.
  */
  /*
    TAREFA QUE JA FOI EMBORA NAO GANHA EVENTO — e isto tambem nao e zelo.
    Apagar a tarefa apaga os objetivos por cascade, e o gatilho do objetivo
    tentaria registrar "objetivo removido" apontando para a tarefa que acabou de
    sumir: chave estrangeira invalida, e a EXCLUSAO DA TAREFA falharia por causa
    do historico. O evento da exclusao nao faz falta: o historico vai junto com a
    tarefa.
  */
  if not exists (
    select 1 from public.tasks t where t.id = p_task_id and t.tenant_id = p_tenant_id
  ) then
    return;
  end if;

  select c.id, c.name into v_actor, v_name
  from public.collaborators c
  where c.id = public.auth_collaborator_id() and c.tenant_id = p_tenant_id;

  insert into public.task_events (tenant_id, task_id, actor_id, actor_name, kind, details)
  values (p_tenant_id, p_task_id, v_actor, v_name, p_kind, coalesce(p_details, '{}'::jsonb));
end;
$BODY$;

comment on function public.record_task_event is
  'Grava uma linha no historico do cartao com o autor do JWT (0104). Chamada so pelos gatilhos.';

revoke all on function public.record_task_event(uuid, uuid, text, jsonb) from public, anon, authenticated;

/* O rotulo da etapa e do status no MOMENTO do evento: os dois sao cadastro
   editavel (0094, 0097), e o historico nao pode mudar de texto depois. */
create function public.phase_label_now(p_tenant_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $BODY$
  select coalesce((select c.label from public.kanban_columns c
                    where c.tenant_id = p_tenant_id and c.key = p_key), p_key)
$BODY$;

create function public.operational_tag_label_now(p_tenant_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $BODY$
  select coalesce((select t.label from public.operational_tags t
                    where t.tenant_id = p_tenant_id and t.key = p_key), p_key)
$BODY$;

revoke all on function public.phase_label_now(uuid, text) from public, anon, authenticated;
revoke all on function public.operational_tag_label_now(uuid, text) from public, anon, authenticated;

-- A tarefa --------------------------------------------------------------------

create function public.track_task_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  if tg_op = 'INSERT' then
    perform public.record_task_event(new.tenant_id, new.id, 'task_created',
      jsonb_build_object('title', new.title));
    return new;
  end if;

  if new.title is distinct from old.title then
    perform public.record_task_event(new.tenant_id, new.id, 'title_changed',
      jsonb_build_object('from', old.title, 'to', new.title));
  end if;

  if new.description is distinct from old.description then
    perform public.record_task_event(new.tenant_id, new.id, 'description_changed', '{}'::jsonb);
  end if;

  if new.due_date is distinct from old.due_date then
    perform public.record_task_event(new.tenant_id, new.id, 'due_date_changed',
      jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;

  if new.start_date is distinct from old.start_date then
    perform public.record_task_event(new.tenant_id, new.id, 'start_date_changed',
      jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;

  if new.priority is distinct from old.priority then
    perform public.record_task_event(new.tenant_id, new.id, 'priority_changed',
      jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;

  if new.status is distinct from old.status then
    perform public.record_task_event(new.tenant_id, new.id, 'status_changed',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if new.phase is distinct from old.phase then
    perform public.record_task_event(new.tenant_id, new.id, 'phase_changed',
      jsonb_build_object(
        'from', public.phase_label_now(new.tenant_id, old.phase),
        'to', public.phase_label_now(new.tenant_id, new.phase)));
  end if;

  if new.responsible_id is distinct from old.responsible_id then
    perform public.record_task_event(new.tenant_id, new.id, 'responsible_changed',
      jsonb_build_object(
        'from', (select c.name from public.collaborators c where c.id = old.responsible_id),
        'to', (select c.name from public.collaborators c where c.id = new.responsible_id)));
  end if;

  if new.operational_tag is distinct from old.operational_tag then
    perform public.record_task_event(new.tenant_id, new.id, 'operational_tag_changed',
      jsonb_build_object(
        'from', case when old.operational_tag is null then null
                     else public.operational_tag_label_now(new.tenant_id, old.operational_tag) end,
        'to', case when new.operational_tag is null then null
                   else public.operational_tag_label_now(new.tenant_id, new.operational_tag) end));
  end if;

  if new.estimated_hours is distinct from old.estimated_hours then
    perform public.record_task_event(new.tenant_id, new.id, 'hours_changed',
      jsonb_build_object('from', old.estimated_hours, 'to', new.estimated_hours));
  end if;

  return new;
end;
$BODY$;

create trigger tasks_track_changes
  after insert or update on public.tasks
  for each row execute function public.track_task_changes();

-- Os objetivos ------------------------------------------------------------------

/* POR COMANDO, para a semeadura da etapa virar uma linha so. */
create function public.track_checklist_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  r record;
begin
  for r in
    select tenant_id, task_id, count(*) as quantos, min(title) as um_titulo
    from novos
    group by tenant_id, task_id
  loop
    if r.quantos = 1 then
      perform public.record_task_event(r.tenant_id, r.task_id, 'objective_added',
        jsonb_build_object('title', r.um_titulo));
    else
      perform public.record_task_event(r.tenant_id, r.task_id, 'objectives_seeded',
        jsonb_build_object('count', r.quantos));
    end if;
  end loop;

  return null;
end;
$BODY$;

create trigger task_checklist_items_track_inserts
  after insert on public.task_checklist_items
  referencing new table as novos
  for each statement execute function public.track_checklist_inserts();

create function public.track_checklist_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  if tg_op = 'DELETE' then
    perform public.record_task_event(old.tenant_id, old.task_id, 'objective_removed',
      jsonb_build_object('title', old.title));
    return old;
  end if;

  if new.is_completed is distinct from old.is_completed then
    perform public.record_task_event(new.tenant_id, new.task_id,
      case when new.is_completed then 'objective_completed' else 'objective_reopened' end,
      jsonb_build_object('title', new.title));
  end if;

  /* Renomear vem do modelo (ambiente renomeado, 0100) ou da propria tela. */
  if new.title is distinct from old.title then
    perform public.record_task_event(new.tenant_id, new.task_id, 'objective_renamed',
      jsonb_build_object('from', old.title, 'to', new.title));
  end if;

  if new.due_date is distinct from old.due_date then
    perform public.record_task_event(new.tenant_id, new.task_id, 'objective_due_changed',
      jsonb_build_object('title', new.title, 'from', old.due_date, 'to', new.due_date));
  end if;

  return new;
end;
$BODY$;

create trigger task_checklist_items_track_changes
  after update or delete on public.task_checklist_items
  for each row execute function public.track_checklist_changes();

-- Os responsaveis do objetivo (0103) ---------------------------------------------

create function public.track_checklist_assignees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_item record;
  v_nome text;
begin
  if tg_op = 'INSERT' then
    select i.task_id, i.title into v_item from public.task_checklist_items i where i.id = new.item_id;
    select c.name into v_nome from public.collaborators c where c.id = new.collaborator_id;
    perform public.record_task_event(new.tenant_id, v_item.task_id, 'objective_assignee_added',
      jsonb_build_object('title', v_item.title, 'person', v_nome));
    return new;
  end if;

  /* No DELETE o objetivo pode ja ter ido embora junto (cascade): sem tarefa para
     apontar, nao ha o que registrar — o evento do objetivo removido ja conta a
     historia. */
  select i.task_id, i.title into v_item from public.task_checklist_items i where i.id = old.item_id;
  if v_item.task_id is null then
    return old;
  end if;

  select c.name into v_nome from public.collaborators c where c.id = old.collaborator_id;
  perform public.record_task_event(old.tenant_id, v_item.task_id, 'objective_assignee_removed',
    jsonb_build_object('title', v_item.title, 'person', v_nome));
  return old;
end;
$BODY$;

create trigger task_checklist_item_assignees_track
  after insert or delete on public.task_checklist_item_assignees
  for each row execute function public.track_checklist_assignees();

revoke all on function public.track_task_changes() from public, anon, authenticated;
revoke all on function public.track_checklist_inserts() from public, anon, authenticated;
revoke all on function public.track_checklist_changes() from public, anon, authenticated;
revoke all on function public.track_checklist_assignees() from public, anon, authenticated;
