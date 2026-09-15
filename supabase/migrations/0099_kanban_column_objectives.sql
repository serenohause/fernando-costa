-- Objetivos padrao de cada etapa do quadro, com secoes nomeadas.
--
-- O PEDIDO
--   "Ao criar ou editar coluna do kanban do fluxo de trabalho, permitir criacao
--   de objetivos padrao para cada coluna/etapa, incluindo subsecoes com nomes
--   diferentes."
--
-- O QUE HAVIA ANTES
--   Os objetivos que a tarefa ganha ao entrar numa etapa moravam no CODIGO
--   (`CHECKLIST_BY_PHASE`, src/features/projects/checklist-templates.ts), por
--   chave de etapa. Duas consequencias: o escritorio nao podia muda-los, e a
--   etapa criada em Configuracoes (0094) nunca ganhava objetivo nenhum, porque a
--   chave dela nao existia na constante.
--
-- O QUE MUDA
--   1. `kanban_column_objective_sections`: secoes com nome, por etapa.
--   2. `kanban_column_objectives`: o modelo, por etapa, com secao opcional.
--   3. O conteudo de `CHECKLIST_BY_PHASE` e copiado, titulo por titulo, para
--      TODO escritorio que ja existe, e o gatilho de escritorio novo passa a
--      semea-lo tambem. Nenhuma tarefa e tocada: o que muda e de onde a tela le
--      o modelo.
--   4. `task_checklist_items.section`: o NOME da secao, copiado no momento em
--      que o objetivo nasce na tarefa. Texto e nao chave estrangeira, pelo mesmo
--      motivo das colunas de historico do diario (0094): renomear ou apagar a
--      secao do modelo nao pode reescrever nem apagar o que ja foi entregue.
--   5. `replace_kanban_column_objectives`: grava o modelo inteiro de uma etapa
--      numa transacao so. A tela edita a lista toda de uma vez; sem a funcao
--      seriam varias escritas soltas, e uma falha no meio deixaria a etapa com
--      meio modelo.
--
-- O QUE DE PROPOSITO NAO MUDA
--   A regra de "quais objetivos faltam" continua comparando por TITULO, porque e
--   o que `task_checklist_items_task_id_title_key` cobra do banco. E a trava de
--   avanco continua sendo `is_required` do item da tarefa.

-- 1. Secoes --------------------------------------------------------------------

create table public.kanban_column_objective_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  column_id uuid not null,
  name text not null,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kanban_column_objective_sections_name_not_blank_check check (btrim(name) <> ''),
  constraint kanban_column_objective_sections_name_length_check check (length(name) <= 60),
  /* Duas secoes com o mesmo nome na mesma etapa virariam um cabecalho so no
     cartao, e ninguem saberia qual e qual. */
  constraint kanban_column_objective_sections_column_id_name_key unique (column_id, name),
  constraint kanban_column_objective_sections_id_tenant_id_key unique (id, tenant_id),
  /* Alvo da FK do objetivo: e ela que impede um objetivo de apontar para a
     secao de OUTRA etapa. */
  constraint kanban_column_objective_sections_id_column_id_tenant_id_key unique (id, column_id, tenant_id),
  constraint kanban_column_objective_sections_column_fkey
    foreign key (column_id, tenant_id) references public.kanban_columns (id, tenant_id) on delete cascade
);

create index kanban_column_objective_sections_tenant_id_column_id_idx
  on public.kanban_column_objective_sections (tenant_id, column_id);

create trigger kanban_column_objective_sections_set_updated_at
  before update on public.kanban_column_objective_sections
  for each row execute function public.set_updated_at();

comment on table public.kanban_column_objective_sections is
  'Secoes nomeadas dos objetivos padrao de uma etapa (0099). So organizam o modelo e o cartao; nao travam nada.';

-- 2. Objetivos padrao ----------------------------------------------------------

create table public.kanban_column_objectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  column_id uuid not null,
  /* Nulo e "sem secao": o objetivo solto, que o cartao mostra antes das secoes. */
  section_id uuid,
  title text not null,
  is_required boolean not null default true,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kanban_column_objectives_title_not_blank_check check (btrim(title) <> ''),
  constraint kanban_column_objectives_title_length_check check (length(title) <= 300),
  /*
    TITULO UNICO POR ETAPA, e nao por secao. A tarefa nao aceita dois itens com
    o mesmo titulo (`task_checklist_items_task_id_title_key`); um modelo que
    repetisse o titulo em duas secoes geraria um item so, e o segundo sumiria
    sem aviso.
  */
  constraint kanban_column_objectives_column_id_title_key unique (column_id, title),
  constraint kanban_column_objectives_column_fkey
    foreign key (column_id, tenant_id) references public.kanban_columns (id, tenant_id) on delete cascade,
  /* MATCH SIMPLE: com section_id nulo a FK nao e conferida, que e o "sem secao".
     Com secao, ela precisa ser da MESMA etapa e do mesmo escritorio. Apagar a
     secao apaga os objetivos dela: a tela avisa antes. */
  constraint kanban_column_objectives_section_fkey
    foreign key (section_id, column_id, tenant_id)
    references public.kanban_column_objective_sections (id, column_id, tenant_id) on delete cascade
);

create index kanban_column_objectives_tenant_id_column_id_idx
  on public.kanban_column_objectives (tenant_id, column_id);

create index kanban_column_objectives_section_id_idx
  on public.kanban_column_objectives (section_id)
  where section_id is not null;

create trigger kanban_column_objectives_set_updated_at
  before update on public.kanban_column_objectives
  for each row execute function public.set_updated_at();

comment on table public.kanban_column_objectives is
  'Objetivos que a tarefa ganha ao entrar na etapa (0099). Substitui a constante CHECKLIST_BY_PHASE do frontend. Editar o modelo nao altera item ja criado em tarefa: a tarefa recebe so os titulos que ainda nao tem.';

-- 3. O nome da secao no item da tarefa ----------------------------------------

alter table public.task_checklist_items
  add column section text;

alter table public.task_checklist_items
  add constraint task_checklist_items_section_not_blank_check
  check (section is null or (btrim(section) <> '' and length(section) <= 60));

comment on column public.task_checklist_items.section is
  'Nome da secao do modelo no momento em que o objetivo nasceu na tarefa (0099). Texto, e nao FK, para renomear ou apagar a secao do modelo nao reescrever o que ja foi entregue. Nulo e objetivo sem secao.';

-- 4. RLS -------------------------------------------------------------------------

alter table public.kanban_column_objective_sections enable row level security;
alter table public.kanban_column_objectives enable row level security;

/* Le quem le o quadro: o Fluxo do Projeto precisa do modelo para criar os
   objetivos da tarefa. Escreve so quem edita Configuracoes, como as etapas. */
create policy kanban_column_objective_sections_select_active_collaborator
  on public.kanban_column_objective_sections for select
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

create policy kanban_column_objective_sections_insert_settings_editor
  on public.kanban_column_objective_sections for insert
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_objective_sections_update_settings_editor
  on public.kanban_column_objective_sections for update
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')))
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_objective_sections_delete_settings_editor
  on public.kanban_column_objective_sections for delete
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_objectives_select_active_collaborator
  on public.kanban_column_objectives for select
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

create policy kanban_column_objectives_insert_settings_editor
  on public.kanban_column_objectives for insert
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_objectives_update_settings_editor
  on public.kanban_column_objectives for update
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')))
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_objectives_delete_settings_editor
  on public.kanban_column_objectives for delete
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

grant select, insert, update, delete on table public.kanban_column_objective_sections to authenticated;
grant select, insert, update, delete on table public.kanban_column_objectives to authenticated;

-- 5. O modelo de fabrica, numa copia so ----------------------------------------

/*
  A LISTA DE CHECKLIST_BY_PHASE, titulo por titulo e na mesma ordem. Mora numa
  funcao, e nao repetida em dois INSERTs, porque tem dois leitores: a copia para
  os escritorios que ja existem (secao 6) e o gatilho de escritorio novo
  (secao 7). Duas copias seriam duas chances de divergir.

  Todos obrigatorios: `optional` era array vazio nas oito etapas do original.
*/
create function public.default_kanban_objectives()
returns table (column_key text, title text, display_order integer)
language sql
immutable
set search_path = ''
as $BODY$
  select v.column_key, v.title, v.display_order
  from (values
    ('not_started', 'Criar grupo de Whatsapp com os clientes', 1),
    ('not_started', 'Marcar data de briefing de projetos', 2),
    ('briefing', 'Solicitar topografia, documentos e informações do terreno', 1),
    ('briefing', 'Enviar data de apresentação de Layout', 2),
    ('layout', 'Realizar estudo do terreno', 1),
    ('layout', 'Elaborar estudo de layout', 2),
    ('layout', 'Realizar humanização e apresentação de layout', 3),
    ('renderings', 'Iniciar modelagem 3D', 1),
    ('renderings', 'Modelagem final com humanização e acabamentos', 2),
    ('renderings', 'Renderização', 3),
    ('renderings', 'Pós produção e humanização', 4),
    ('renderings', 'Vídeo tour virtual', 5),
    ('renderings', 'Criar branding, conceito e nome do projeto', 6),
    ('renderings', 'Montar apresentação completa', 7),
    ('legal_permit', 'Elaborar plantas técnicas', 1),
    ('legal_permit', 'Elaborar cortes técnicos', 2),
    ('legal_permit', 'Elaborar memoriais e padrões de condomínios', 3),
    ('hoa_approval', 'Elaborar plantas técnicas', 1),
    ('hoa_approval', 'Elaborar cortes técnicos', 2),
    ('hoa_approval', 'Elaborar memoriais e padrões de condomínios', 3),
    ('construction_docs', 'Emitir RRT de projeto', 1),
    ('construction_docs', 'Acrescentar detalhes construtivos ampliados', 2),
    ('construction_docs', 'Elaborar detalhes isométricos', 3),
    ('construction_docs', 'Detalhamento de esquadrias', 4),
    ('construction_docs', 'Detalhamento de piscina', 5),
    ('construction_docs', 'Detalhamento de escada', 6),
    ('construction_docs', 'Projeto de iluminação externa', 7),
    ('construction_docs', 'Projeto de paginação de piso externo e interno', 8),
    ('construction_docs', 'Projeto de paginação de forro externo e interno', 9),
    ('construction_docs', 'Detalhamento básico de bancadas', 10),
    ('construction_docs', 'Elaborar memorial descritivo', 11),
    ('engineering_docs', 'Enviar para elaboração de Projeto Estrutural', 1),
    ('engineering_docs', 'Enviar para elaboração de Projetos de Instalações', 2),
    ('engineering_docs', 'Compatibilização de Projetos', 3),
    ('engineering_docs', 'Enviar para orçamentos', 4)
  ) as v (column_key, title, display_order)
$BODY$;

comment on function public.default_kanban_objectives is
  'Objetivos padrao de fabrica por chave de etapa: a constante CHECKLIST_BY_PHASE do frontend, transcrita (0099). Lida pela copia inicial e por seed_default_kanban.';

revoke all on function public.default_kanban_objectives() from public, anon, authenticated;

-- 6. Copia para os escritorios que ja existem ----------------------------------

insert into public.kanban_column_objectives (tenant_id, column_id, title, is_required, display_order)
select c.tenant_id, c.id, d.title, true, d.display_order
from public.default_kanban_objectives() d
join public.kanban_columns c on c.key = d.column_key
join public.kanban_boards b on b.id = c.board_id and b.key = 'project_flow';

-- 7. Escritorio novo ----------------------------------------------------------
--
-- Reconstruida a partir de pg_get_functiondef do banco, e nao da memoria: o
-- corpo abaixo e o da 0097 com um INSERT a mais no fim.

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

  -- Os objetivos padrao de fabrica (0099).
  insert into public.kanban_column_objectives (tenant_id, column_id, title, is_required, display_order)
  select new.id, c.id, d.title, true, d.display_order
  from public.default_kanban_objectives() d
  join public.kanban_columns c
    on c.tenant_id = new.id and c.board_id = v_board_id and c.key = d.column_key;

  return new;
end;
$BODY$;

comment on function public.seed_default_kanban is
  'Da ao escritorio recem-criado o quadro do Fluxo do Projeto (quinze etapas, dez desenhadas), os dois status operacionais de fabrica, o recorte de qual etapa oferece qual status e os objetivos padrao de cada etapa (0099). TUDO numa funcao so de proposito: as ligacoes dependem de tags e colunas ja existirem, e com varios gatilhos essa ordem seria a ordem alfabetica dos nomes deles.';

-- 8. Gravar o modelo de uma etapa ---------------------------------------------

/*
  TROCA O MODELO INTEIRO DA ETAPA, numa transacao.

  p_sections e um array, na ordem da tela:
    [ { "name": null,        "objectives": [ { "title": "...", "is_required": true } ] },
      { "name": "Documentos", "objectives": [ ... ] } ]
  Nome nulo ou em branco e o grupo "sem secao". A ordem dos objetivos e
  corrida pela etapa inteira, e nao reinicia por secao: e ela que vira
  `display_order` no item da tarefa, e o cartao ordena por ela.

  SECURITY INVOKER: quem chama passa pelas policies das duas tabelas. A
  checagem de permissao no comeco nao substitui a RLS, evita outra coisa: sem
  ela, quem nao edita Configuracoes e manda um array vazio veria DELETE de zero
  linhas e retorno 0, ou seja "salvo" sobre um modelo que nao mudou.

  A etapa e procurada tambem sob RLS, entao a de outro escritorio simplesmente
  nao existe para quem chama.
*/
create function public.replace_kanban_column_objectives(p_column_id uuid, p_sections jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
  v_section jsonb;
  v_objective jsonb;
  v_section_id uuid;
  v_section_order integer := 0;
  v_objective_order integer := 0;
begin
  if not (select public.can_edit_menu('settings')) then
    raise exception using errcode = '42501', message = 'sem_permissao_configuracoes';
  end if;

  select c.tenant_id into v_tenant_id
  from public.kanban_columns c
  where c.id = p_column_id;

  if v_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'etapa_nao_encontrada';
  end if;

  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception using errcode = '22023', message = 'modelo_de_objetivos_invalido';
  end if;

  delete from public.kanban_column_objectives where column_id = p_column_id;
  delete from public.kanban_column_objective_sections where column_id = p_column_id;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    v_section_id := null;

    if nullif(btrim(coalesce(v_section ->> 'name', '')), '') is not null then
      v_section_order := v_section_order + 1;
      insert into public.kanban_column_objective_sections (tenant_id, column_id, name, display_order)
      values (v_tenant_id, p_column_id, btrim(v_section ->> 'name'), v_section_order)
      returning id into v_section_id;
    end if;

    for v_objective in
      select value from jsonb_array_elements(coalesce(v_section -> 'objectives', '[]'::jsonb))
    loop
      v_objective_order := v_objective_order + 1;
      insert into public.kanban_column_objectives
        (tenant_id, column_id, section_id, title, is_required, display_order)
      values (
        v_tenant_id,
        p_column_id,
        v_section_id,
        btrim(coalesce(v_objective ->> 'title', '')),
        coalesce((v_objective ->> 'is_required')::boolean, true),
        v_objective_order
      );
    end loop;
  end loop;

  return v_objective_order;
end;
$BODY$;

comment on function public.replace_kanban_column_objectives is
  'Grava o modelo de objetivos de uma etapa (secoes e objetivos) de uma vez, numa transacao (0099). SECURITY INVOKER: as policies das duas tabelas valem. Devolve quantos objetivos ficaram.';

revoke all on function public.replace_kanban_column_objectives(uuid, jsonb) from public, anon;
grant execute on function public.replace_kanban_column_objectives(uuid, jsonb) to authenticated;
