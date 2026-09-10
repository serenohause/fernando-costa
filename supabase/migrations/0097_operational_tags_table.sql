-- O status operacional deixa de ser valor do sistema e vira cadastro do escritorio.
--
-- O PEDIDO
--   "O status operacional deve ser configuravel tambem: poder escolher o nome de
--   cada status e uma cor para cada um."
--
-- O QUE ISTO OBRIGA A DESFAZER, e vale dizer de frente
--   A migration 0096 (de ontem) deu a cada etapa dois booleanos —
--   `allows_in_review` e `allows_awaiting_client`. Eles NOMEIAM tags fixas, e
--   por isso nao sobrevivem a uma lista de tags que o escritorio cria. Viram uma
--   tabela de ligacao aqui, com o mesmo conteudo: a etapa continua oferecendo
--   exatamente as tags que oferecia.
--
--   Nao e retrabalho evitavel — a 0096 respondeu ao pedido daquele momento —, mas
--   e retrabalho, e fica registrado: quando o valor vira cadastro, todo booleano
--   que carrega o NOME de um valor vira tabela.
--
-- O MESMO CAMINHO DA 0094
--   `tasks.operational_tag` vira texto com chave estrangeira para
--   `operational_tags`, e `project_diary_entries.operational_tag` vira texto SEM
--   chave — pela mesma razao de la: a entrada de diario que registra "tag Em
--   Revisao ligada" precisa continuar legivel depois de a tag ser apagada. FK no
--   historico obrigaria a reescrever o passado.
--
-- O ENUM `operational_tag` CONTINUA EXISTINDO, sem uso nenhum. Apagar tipo e
-- irreversivel e o de/para da importacao ainda o reconhece.

-- 1. A tabela de status ------------------------------------------------------------

create table public.operational_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Chave ESTAVEL: e ela que fica gravada na tarefa e no historico do diario.
  -- Renomear o status muda o `label` e nao toca no que ja foi gravado.
  key text not null,
  label text not null,

  /*
    NOME de cor, jamais classe do Tailwind — mesma decisao da 0093, e pelo mesmo
    motivo: o Tailwind monta o CSS varrendo o CODIGO, e uma classe que so existe
    numa linha do banco nunca entra no arquivo final. A cor sumiria sem erro
    nenhum, que e a pior forma de quebrar.
  */
  color text not null default 'slate',

  display_order smallint not null,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operational_tags_id_tenant_id_key unique (id, tenant_id),
  constraint operational_tags_tenant_id_key_key unique (tenant_id, key),
  constraint operational_tags_key_format_check check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint operational_tags_label_not_blank_check check (btrim(label) <> ''),
  constraint operational_tags_label_length_check check (length(label) <= 40),
  constraint operational_tags_color_format_check check (color ~ '^[a-z]+$')
);

create index operational_tags_tenant_id_display_order_idx
  on public.operational_tags (tenant_id, display_order);

create trigger operational_tags_set_updated_at
  before update on public.operational_tags
  for each row execute function public.set_updated_at();

comment on table public.operational_tags is
  'Os status operacionais do escritorio: nome, cor, ordem e se esta em uso. Ate a 0097 eram os dois valores do enum operational_tag, com rotulo e cor cravados no codigo. `key` e estavel e e o que fica gravado em tasks.operational_tag; `label` e o que a tela mostra.';
comment on column public.operational_tags.color is
  'NOME da cor (amber, cyan, rose...), nunca classe do Tailwind: classe que so existe no banco nao entra no CSS gerado e a cor some sem erro. O mapa nome -> classes fica no frontend.';

-- Semeadura: os dois status que existem hoje, com rotulo e cor do codigo -----------
--
--   Rotulos de OPERATIONAL_TAG (src/lib/enums.ts) e cores de
--   OPERATIONAL_TAG_STYLES (TaskKanban.tsx). Nada muda na tela.

insert into public.operational_tags (tenant_id, key, label, color, display_order)
select t.id, v.key, v.label, v.cor, v.ordem
from public.tenants t
cross join (values
  ('in_review',       'Em Revisão',         'amber', 1::smallint),
  ('awaiting_client', 'Aguardando Cliente', 'cyan',  2)
) as v(key, label, cor, ordem);

-- 2. Quais status cada etapa oferece ------------------------------------------------
--
--    Substitui os dois booleanos da 0096. Tabela de ligacao porque a relacao
--    virou muitos-para-muitos de verdade: N etapas x M status, os dois lados
--    criados pelo escritorio.

create table public.kanban_column_operational_tags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  column_id uuid not null,
  tag_id uuid not null,

  created_at timestamptz not null default now(),

  constraint kanban_column_operational_tags_pkey primary key (column_id, tag_id),
  constraint kanban_column_operational_tags_column_fkey
    foreign key (column_id, tenant_id) references public.kanban_columns (id, tenant_id) on delete cascade,
  /*
    CASCADE tambem do lado do status, e a diferenca com `tasks` e o ponto:
    apagar um status tira a OFERTA dele das etapas (nada se perde), mas nao pode
    apagar a marca de uma tarefa — para isso existe o RESTRICT em tasks, logo
    abaixo, que obriga a tela a tirar a marca antes.
  */
  constraint kanban_column_operational_tags_tag_fkey
    foreign key (tag_id, tenant_id) references public.operational_tags (id, tenant_id) on delete cascade
);

create index kanban_column_operational_tags_tenant_id_tag_id_idx
  on public.kanban_column_operational_tags (tenant_id, tag_id);

comment on table public.kanban_column_operational_tags is
  'Quais status operacionais o menu do cartao oferece em cada etapa. Substitui os booleanos allows_in_review/allows_awaiting_client da 0096, que nomeavam tags fixas e nao sobreviveriam a uma lista que o escritorio cria. CONTINUA SENDO OFERTA DE TELA: tasks.operational_tag aceita qualquer status em qualquer etapa (0074), e isto nao vira check.';

/* O conteudo dos dois booleanos, linha por linha. Nada muda no menu do cartao. */
insert into public.kanban_column_operational_tags (tenant_id, column_id, tag_id)
select c.tenant_id, c.id, t.id
from public.kanban_columns c
join public.operational_tags t
  on t.tenant_id = c.tenant_id and t.key = 'in_review'
where c.allows_in_review;

insert into public.kanban_column_operational_tags (tenant_id, column_id, tag_id)
select c.tenant_id, c.id, t.id
from public.kanban_columns c
join public.operational_tags t
  on t.tenant_id = c.tenant_id and t.key = 'awaiting_client'
where c.allows_awaiting_client;

alter table public.kanban_columns
  drop column allows_in_review,
  drop column allows_awaiting_client;

-- 3. A marca da tarefa passa a apontar para o cadastro -------------------------------

/*
  A funcao cai porque a ASSINATURA muda: `p_operational_tag operational_tag` vira
  text. Trocar tipo de parametro nao e `create or replace` — sem o drop o banco
  ficaria com as duas e a chamada passaria a depender de qual o Postgres
  escolhesse. Mesmo motivo da 0094.
*/
drop function if exists public.record_project_diary_event(
  uuid, public.diary_system_event, text, text, text, text, text,
  public.operational_tag, uuid, date, time
);

/*
  Os dois checks de `project_diary_entries` NAO caem: eles so testam se a coluna
  e nula, sem literal do enum, entao a troca de tipo os preserva. O indice
  parcial de `tasks` tambem sobrevive - o Postgres o reconstroi junto.
*/
alter table public.tasks
  alter column operational_tag type text using operational_tag::text;

alter table public.project_diary_entries
  alter column operational_tag type text using operational_tag::text;

/*
  RESTRICT, e nao CASCADE: apagar um status com tarefa marcada apagaria a marca
  de trabalho real sem ninguem ver. Restringir e o que faz a tela ter de tirar a
  marca antes — o mesmo desenho de `tasks_phase_fkey` (0094).
*/
alter table public.tasks
  add constraint tasks_operational_tag_fkey
  foreign key (tenant_id, operational_tag)
  references public.operational_tags (tenant_id, key)
  on update cascade
  on delete restrict;

comment on constraint tasks_operational_tag_fkey on public.tasks is
  'O status da tarefa e um status DESTE escritorio. Substitui o enum operational_tag (0097) e impede excluir status que ainda esta marcado em alguma tarefa (restrict). project_diary_entries.operational_tag NAO tem FK equivalente: guarda historico, que precisa continuar legivel depois de o status ser apagado.';

comment on column public.tasks.operational_tag is
  'Status operacional da tarefa, ou nulo - e a ausencia e o caso normal (0074). Desde a 0097 e a chave de uma linha de operational_tags, e nao mais um valor do enum. A tarefa aceita QUALQUER status em QUALQUER etapa: o recorte por etapa (kanban_column_operational_tags) e oferta de menu, nao regra de dominio.';

comment on type public.operational_tag is
  'DEIXOU DE SER USADO na migration 0097, quando o status operacional virou cadastro do escritorio (tabela operational_tags). Os valores continuam aqui porque apagar valor de enum e irreversivel e o de/para da importacao do base44 ainda os reconhece.';

-- 4. A funcao do diario volta, recebendo texto ---------------------------------------

create or replace function public.record_project_diary_event(
  p_project_id uuid,
  p_system_event public.diary_system_event,
  p_title text,
  p_description text default null,
  p_event_key text default null,
  p_from_phase text default null,
  p_to_phase text default null,
  p_operational_tag text default null,
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
  'Grava o evento automatico do Diario do Projeto (arraste de cartao, troca de responsavel, status operacional). SECURITY DEFINER que confere can_edit_menu(project_flow) por dentro, e nao a permissao do diario - sem isso o arraste do Arquiteto deixaria de registrar em silencio (ver 0070). Fases viraram TEXTO na 0094 e o status operacional na 0097, quando os dois deixaram de ser valores do sistema e viraram cadastro do escritorio; a entrada guarda o texto e nao tem FK, para o historico continuar legivel depois de a etapa ou o status serem apagados.';

revoke all on function public.record_project_diary_event(
  uuid, public.diary_system_event, text, text, text, text, text,
  text, uuid, date, time
) from public, anon;
grant execute on function public.record_project_diary_event(
  uuid, public.diary_system_event, text, text, text, text, text,
  text, uuid, date, time
) to authenticated;

-- 5. RLS -----------------------------------------------------------------------------
--
--    LEITURA LARGA: quem abre o Fluxo do Projeto precisa dos status para desenhar
--    o cracha do cartao, e nome de status nao e segredo.
--
--    ESCRITA PRESA AO MENU `settings`, como os tipos de servico (0084) e o quadro
--    (0093): configurar status e configurar o sistema, nao trabalhar nele.

alter table public.operational_tags enable row level security;
alter table public.kanban_column_operational_tags enable row level security;

create policy operational_tags_select_active_collaborator
  on public.operational_tags for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

create policy operational_tags_insert_settings_editor
  on public.operational_tags for insert
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

create policy operational_tags_update_settings_editor
  on public.operational_tags for update
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

create policy operational_tags_delete_settings_editor
  on public.operational_tags for delete
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

comment on policy operational_tags_delete_settings_editor on public.operational_tags is
  'Excluir status. Quem impede que isso apague trabalho nao e esta policy: e a FK tasks_operational_tag_fkey (restrict), que recusa enquanto houver tarefa marcada. A oferta nas etapas cai junto, por cascade, e isso e o desejado - nada se perde.';

create policy kanban_column_operational_tags_select_active_collaborator
  on public.kanban_column_operational_tags for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

create policy kanban_column_operational_tags_insert_settings_editor
  on public.kanban_column_operational_tags for insert
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

/*
  Sem policy de UPDATE, e a ausencia e deliberada: a linha e so um par de chaves
  e nao tem nada que se possa alterar. Trocar a oferta e apagar um par e criar
  outro, que e o que a tela faz.
*/
create policy kanban_column_operational_tags_delete_settings_editor
  on public.kanban_column_operational_tags for delete
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

grant select, insert, update, delete on table public.operational_tags to authenticated;
grant select, insert, delete on table public.kanban_column_operational_tags to authenticated;

-- 6. O escritorio novo nasce com tudo, numa funcao so ---------------------------------
--
--   POR QUE UMA FUNCAO E NAO DUAS. As tags precisam existir ANTES das ligacoes, e
--   as colunas tambem. Com dois gatilhos em `tenants`, a ordem entre eles seria a
--   ordem ALFABETICA dos nomes — `tenants_seed_kanban` antes de
--   `tenants_seed_operational_tags` —, e o dia em que alguem renomeasse um deles
--   o escritorio novo nasceria sem as ligacoes, sem erro nenhum. Ordem que
--   importa se escreve, nao se torce para acontecer.
--
--   ESTA FUNCAO TAMBEM CONSERTA UM DEFEITO QUE ESTA MIGRATION CRIOU: a versao
--   anterior dela ainda inseria `allows_in_review` e `allows_awaiting_client`,
--   colunas que a secao 2 acabara de derrubar. Escritorio novo falhava na
--   criacao, e isso so apareceria no dia em que alguem criasse um. Quem pegou foi
--   supabase/tests/kanban-schema.sql, no caso do escritorio novo.

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

  -- Os dois status de fabrica, com o rotulo e a cor que estavam no codigo.
  insert into public.operational_tags (tenant_id, key, label, color, display_order)
  values
    (new.id, 'in_review',       'Em Revisão',         'amber', 1),
    (new.id, 'awaiting_client', 'Aguardando Cliente', 'cyan',  2)
  on conflict (tenant_id, key) do nothing;

  -- E o recorte por etapa, o mesmo que a secao 2 transcreveu para quem ja
  -- existia: Layout e Perspectivas oferecem os dois, Projeto Legal e Projeto
  -- Executivo so "Em Revisao".
  insert into public.kanban_column_operational_tags (tenant_id, column_id, tag_id)
  select new.id, c.id, t.id
  from public.kanban_columns c
  join public.operational_tags t on t.tenant_id = new.id
  where c.tenant_id = new.id
    and (
      (c.key in ('layout', 'renderings'))
      or (c.key in ('legal_permit', 'construction_docs') and t.key = 'in_review')
    );

  return new;
end;
$BODY$;

comment on function public.seed_default_kanban is
  'Da ao escritorio recem-criado o quadro do Fluxo do Projeto (quinze etapas, dez desenhadas), os dois status operacionais de fabrica e o recorte de qual etapa oferece qual status. TUDO numa funcao so de proposito: as ligacoes dependem de tags e colunas ja existirem, e com dois gatilhos essa ordem seria a ordem alfabetica dos nomes deles - ordem que importa se escreve, nao se torce para acontecer.';
