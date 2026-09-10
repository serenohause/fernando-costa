-- Quais tags operacionais cada etapa oferece deixa de ser lista no codigo.
--
-- O PEDIDO
--   No quadro configuravel, poder escolher se a etapa permite ou nao status
--   operacional.
--
-- O QUE ERA
--   Duas listas escritas a mao em src/features/projects/flow.ts, portadas da
--   versao nova do base44 (`COLUNAS_COM_TAGS` e `COLUNAS_SO_REVISAO`):
--   "Layout" e "Perspectivas" ofereciam as duas tags, "Projeto Legal" e
--   "Projeto Executivo" ofereciam so "Em Revisao", e o submenu nao aparecia nas
--   demais. Etapa criada pelo escritorio (0094) nao aparecia em lista nenhuma,
--   entao nascia sem status operacional e sem como ganhar um.
--
-- DUAS COLUNAS, E NAO UMA
--   "Permite status operacional" sim/nao nao representa o que existe hoje: o
--   recorte tem QUATRO estados, e um deles e "so Em Revisao". Uma marca por tag
--   preserva os quatro e ainda abre o que faltava — "so Aguardando Cliente" —,
--   sem inventar um valor que precise ser interpretado.
--
-- ISTO CONTINUA SENDO OFERTA DE TELA, E NAO REGRA DE DOMINIO
--   A 0074 decidiu que `tasks.operational_tag` aceita qualquer tag em qualquer
--   fase, e essa decisao NAO muda aqui. Estas colunas dizem o que o MENU do
--   cartao mostra; nao viram check, e nao devem virar. Um cartao que ja tem tag
--   e arrastado para uma etapa que nao a oferece continua sendo um gesto valido
--   — a tag e limpa no mesmo UPDATE da mudanca de etapa, que e o desenho da
--   fatia do status operacional.
--
--   Virar check faria um arraste legitimo virar erro de banco no dia em que a
--   configuracao da tela e o check discordassem, e a configuracao agora muda sem
--   deploy: o risco de discordarem so aumentou.

alter table public.kanban_columns
  add column allows_in_review boolean not null default false,
  add column allows_awaiting_client boolean not null default false;

comment on column public.kanban_columns.allows_in_review is
  'Se o menu do cartao oferece a tag "Em Revisao" nesta etapa. OFERTA DE TELA, nao regra: tasks.operational_tag aceita qualquer tag em qualquer etapa (0074) e isto nao vira check - ver o cabecalho da 0096.';
comment on column public.kanban_columns.allows_awaiting_client is
  'Se o menu do cartao oferece a tag "Aguardando Cliente" nesta etapa. Mesma natureza de allows_in_review: o que o menu mostra, e nada alem disso.';

-- Semeadura: exatamente o recorte que esta no ar hoje ----------------------------
--
--   Transcrito de COLUMNS_WITH_BOTH_TAGS e COLUMNS_REVIEW_ONLY (flow.ts). Nada
--   muda na tela no dia em que esta migration entra; o que muda e que a partir
--   daqui o escritorio pode mexer.

update public.kanban_columns
set allows_in_review = true,
    allows_awaiting_client = true
where key in ('layout', 'renderings');

update public.kanban_columns
set allows_in_review = true
where key in ('legal_permit', 'construction_docs');

-- Escritorio novo nasce com o mesmo recorte ---------------------------------------
--
--   O gatilho e a segunda copia da lista de etapas padrao, e e por isso que o
--   caso 6.3 de supabase/tests/kanban-schema.sql compara escritorio novo com
--   antigo: para que uma seja corrigida sem a outra ficar para tras.

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
    (tenant_id, board_id, key, label, color, display_order, progress_percent, is_active,
     allows_in_review, allows_awaiting_client)
  select new.id, v_board_id, s.key, s.label, s.cor, s.ordem, s.percentual, s.ativa,
         s.revisao, s.aguardando
  from (values
    ('not_started',        'Não iniciado',            'muted',     1::smallint,    0::smallint, true,  false, false),
    ('briefing',           'Briefing',                'blue',      2,   12, true,  false, false),
    ('preliminary_study',  'Estudo preliminar',       'slate',     3, null, false, false, false),
    ('layout',             'Layout',                  'violet',    4,   26, true,  true,  true),
    ('preliminary_design', 'Anteprojeto',             'slate',     5, null, false, false, false),
    ('renderings',         'Perspectivas',            'purple',    6,   50, true,  true,  true),
    ('revision',           'Revisão',                 'slate',     7,   55, false, false, false),
    ('legal_permit',       'Projeto Legal',           'cyan',      8,   70, true,  true,  false),
    ('hoa_approval',       'Aprovação Condomínio',    'orange',    9,   75, true,  false, false),
    ('construction_docs',  'Projeto Executivo',       'indigo',   10,   80, true,  true,  false),
    ('engineering_docs',   'Projetos Complementares', 'pink',     11,   90, true,  false, false),
    ('building_permit',    'Alvará de Construção',    'slate',    12,  100, false, false, false),
    ('under_construction', 'Em Obra',                 'teal',     13,  100, true,  false, false),
    ('awaiting_client',    'Aguardando Cliente',      'slate',    14, null, false, false, false),
    ('finished',           'Finalizado',              'emerald',  15,  100, true,  false, false)
  ) as s(key, label, cor, ordem, percentual, ativa, revisao, aguardando);

  return new;
end;
$BODY$;

comment on function public.seed_default_kanban is
  'Da ao escritorio recem-criado o quadro do Fluxo do Projeto com as quinze etapas padrao (dez desenhadas, cinco inativas), incluindo quais tags operacionais cada uma oferece (0096). Sem isto o quadro dele abriria sem coluna nenhuma e project_progress daria 0 em todo projeto, porque a escala de percentual mora em kanban_columns desde a 0093.';
