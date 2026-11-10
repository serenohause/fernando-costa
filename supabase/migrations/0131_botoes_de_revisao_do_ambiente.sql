-- Botoes de sinalizacao de revisao por etapa, e a marca que eles deixam no
-- objetivo de ambiente da tarefa.
--
-- O PEDIDO
--   "No modulo de configuracoes de quadros, quando uma etapa tiver exibir
--   ambientes ativado, deve abrir logo abaixo do toggle uma opcao de criar
--   botoes de sinalizacao de revisao, que podem ser customizados (exemplo:
--   aprovado, reprovado, alterado) com cores customizadas. Esses botoes, quando
--   ativados para aquela etapa, devem aparecer no objetivo do cartao para serem
--   marcados por quem realiza a revisao, aparecendo apenas o botao que ficou
--   marcado."
--
-- AS DUAS DECISOES DO USUARIO, perguntadas antes de desenhar isto:
--
--   1. OS BOTOES SO VALEM PARA OBJETIVO DE AMBIENTE. Numa etapa com os dois, a
--      sala e o quarto ganham os botoes; "Enviar planta baixa" nao. E por isso
--      que a configuracao mora embaixo do toggle de ambientes, e nao ao lado do
--      modelo de objetivos.
--
--   2. A MARCA NAO MEXE NO CHECK DE CONCLUIDO. Sao dois gestos: a marca diz o
--      RESULTADO da revisao, e `is_required` + `is_completed` continuam sendo o
--      que trava o avanco de etapa. Consequencia pretendida: ambiente
--      obrigatorio marcado como "Reprovado" segue prendendo o cartao, porque
--      reprovar nao e concluir. Um interruptor "este botao conclui o objetivo"
--      foi oferecido e recusado - menos uma regra para o escritorio decorar.
--
-- POR QUE A MARCA E COPIA, E NAO CHAVE ESTRANGEIRA
--   Mesma razao que levou a 0099 a copiar o NOME da secao para o item da tarefa:
--   o modelo e editavel e o que ja foi entregue nao se reescreve. Renomear
--   "Alterado" para "Com alteracoes" nao muda a revisao de marco; apagar o botao
--   nao apaga a revisao de ninguem. O preco e conhecido e aceito: o cartao antigo
--   mostra o texto e a cor de quando foi marcado.
--
--   Isso tambem e o que permite DESLIGAR os ambientes de uma etapa sem destruir
--   historico - e por isso nao ha check amarrando a existencia de botao a
--   `kanban_columns.shows_project_rooms`. O toggle governa o que a TELA mostra;
--   o banco guarda o que foi configurado e o que foi marcado.
--
-- QUEM MARCA
--   Quem ja podia marcar o objetivo: a escrita em task_checklist_items continua
--   governada pelas policies de 0034 (menu do fluxo do projeto), e esta migration
--   nao acrescenta nem afrouxa regra nenhuma la. Quem configura os botoes e quem
--   edita Configuracoes, como no resto do quadro (0093, 0099).

-- 1. Os botoes de uma etapa ------------------------------------------------------

create table public.kanban_column_review_marks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  column_id uuid not null,

  label text not null,
  color text not null default 'slate',
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kanban_column_review_marks_id_tenant_id_key unique (id, tenant_id),

  /* Dois botoes com o mesmo rotulo na mesma etapa seriam dois botoes iguais na
     frente de quem revisa, e marca que nao da para distinguir depois. */
  constraint kanban_column_review_marks_column_id_label_key unique (column_id, label),

  constraint kanban_column_review_marks_label_not_blank_check check (btrim(label) <> ''),
  /* 40 caracteres e o que cabe num botao ao lado de um titulo de ambiente sem
     quebrar a linha do objetivo. O modelo de objetivo aceita 300 porque ele e
     uma frase; isto e um carimbo. */
  constraint kanban_column_review_marks_label_length_check check (length(label) <= 40),
  /* Mesma forma de kanban_columns.color (0093) e operational_tags.color (0097):
     nome de cor do tema, em minusculas, e nao hex. Hex em coluna de cor foi
     recusado naqueles dois pelo mesmo motivo - o tema claro e o escuro escolhem
     tons diferentes para o mesmo nome. */
  constraint kanban_column_review_marks_color_format_check check (color ~ '^[a-z]+$'),
  constraint kanban_column_review_marks_display_order_not_negative_check
    check (display_order >= 0),

  constraint kanban_column_review_marks_column_fkey
    foreign key (column_id, tenant_id)
    references public.kanban_columns (id, tenant_id) on delete cascade
);

create index kanban_column_review_marks_tenant_id_column_id_idx
  on public.kanban_column_review_marks (tenant_id, column_id, display_order);

create trigger kanban_column_review_marks_set_updated_at
  before update on public.kanban_column_review_marks
  for each row execute function public.set_updated_at();

comment on table public.kanban_column_review_marks is
  'Botoes de sinalizacao de revisao de uma etapa (0131): aprovado, reprovado, alterado, o que o escritorio quiser. A TELA so os oferece nos objetivos de AMBIENTE (task_checklist_items.room_id nao nulo) e so enquanto kanban_columns.shows_project_rooms estiver ligado - decisao do usuario, e nao ha check cobrando isso, porque desligar o toggle nao pode destruir o que foi configurado nem o que foi marcado. Marcar NAO conclui o objetivo: a marca diz o resultado da revisao, e is_required/is_completed continuam sendo a trava de avanco de etapa.';

comment on column public.kanban_column_review_marks.label is
  'O texto do botao. E ele que e COPIADO para task_checklist_items.review_mark_label quando alguem marca - renomear aqui nao reescreve revisao ja feita.';

comment on column public.kanban_column_review_marks.color is
  'Nome de cor do tema (slate, emerald, rose...), nao hex, como em kanban_columns.color (0093). Tambem e copiado na marcacao.';

comment on constraint kanban_column_review_marks_column_id_label_key on public.kanban_column_review_marks is
  'Rotulo unico por etapa. Sem isto, dois botoes "Aprovado" na mesma etapa produziriam marcas indistinguiveis no cartao, e nao haveria como saber qual botao foi apertado.';

-- 2. A RLS dos botoes -------------------------------------------------------------
--
-- Mesma matriz das outras tabelas de configuracao do quadro (0093, 0099): le
-- qualquer colaborador ativo do escritorio - a tela de Fluxo do Projeto precisa
-- dos botoes para desenha-los -, escreve quem tem can_edit_menu('settings').
--
-- Os dois lados da tranca, escritos a mao: RLS sem GRANT da "permission denied
-- for table"; GRANT sem RLS entrega a tabela para a chave publicavel. anon nao
-- recebe nada.

alter table public.kanban_column_review_marks enable row level security;

grant select, insert, update, delete on table public.kanban_column_review_marks to authenticated;

create policy kanban_column_review_marks_select_active_collaborator
  on public.kanban_column_review_marks for select
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

comment on policy kanban_column_review_marks_select_active_collaborator on public.kanban_column_review_marks is
  'Leitura larga, como nas outras tabelas do quadro: quem abre o Fluxo do Projeto precisa dos botoes para marcar a revisao, e quem configura e outro recorte.';

create policy kanban_column_review_marks_insert_settings_editor
  on public.kanban_column_review_marks for insert
  to authenticated
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_review_marks_update_settings_editor
  on public.kanban_column_review_marks for update
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')))
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

create policy kanban_column_review_marks_delete_settings_editor
  on public.kanban_column_review_marks for delete
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('settings')));

comment on policy kanban_column_review_marks_delete_settings_editor on public.kanban_column_review_marks is
  'Apagar o botao da configuracao. NAO apaga marca nenhuma de tarefa: o que o cartao mostra e copia (review_mark_label), e esse e o desenho.';

-- 3. A marca no objetivo da tarefa ------------------------------------------------
--
-- Quatro colunas em task_checklist_items, e nao uma tabela filha: a marca e
-- NO MAXIMO UMA por objetivo ("aparecendo apenas o botao que ficou marcado"), e
-- tabela filha para um-para-no-maximo-um seria um join a mais em toda leitura do
-- cartao para guardar o mesmo dado.
--
-- A COR VEM JUNTO porque o rotulo sem a cor nao reproduz o botao que foi
-- apertado, e a cor e configuravel: ler a cor do cadastro na hora de desenhar
-- traria a cor de HOJE para uma marca de marco, ou cor nenhuma para um botao
-- apagado.

alter table public.task_checklist_items
  add column review_mark_label text,
  add column review_mark_color text,
  add column review_marked_by_id uuid,
  add column review_marked_at timestamptz;

alter table public.task_checklist_items
  add constraint task_checklist_items_review_mark_label_not_blank_check
  check (review_mark_label is null or btrim(review_mark_label) <> '');

alter table public.task_checklist_items
  add constraint task_checklist_items_review_mark_label_length_check
  check (review_mark_label is null or length(review_mark_label) <= 40);

alter table public.task_checklist_items
  add constraint task_checklist_items_review_mark_color_format_check
  check (review_mark_color is null or review_mark_color ~ '^[a-z]+$');

-- As tres colunas de apoio so existem com rotulo: cor sem rotulo nao desenha
-- nada, e "revisado por fulano" sem dizer o que ele decidiu e rastro de uma
-- decisao que nao esta registrada.
alter table public.task_checklist_items
  add constraint task_checklist_items_review_mark_needs_label_check
  check (
    review_mark_label is not null
    or (review_mark_color is null and review_marked_by_id is null and review_marked_at is null)
  );

-- Quem marcou aponta para COLABORADOR, como todo rastro de trabalho neste
-- projeto, e com FK composta: sem o tenant_id, a marca de um escritorio poderia
-- apontar para a pessoa de outro, porque a RLS filtra o que se le e nao o que se
-- aponta. Nullable porque a marca vale por si - perder a revisao porque a sessao
-- nao resolveu o colaborador seria perder o dado por causa do rastro.
alter table public.task_checklist_items
  add constraint task_checklist_items_review_marked_by_id_fkey
  foreign key (review_marked_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on column public.task_checklist_items.review_mark_label is
  'O botao de revisao que ficou marcado neste objetivo (0131), COPIADO de kanban_column_review_marks.label no momento da marcacao. Copia e nao FK, pela mesma razao que a coluna section e texto (0099): o modelo e editavel e o que ja foi revisado nao se reescreve. Nulo e "ainda nao revisado", e e o estado em que a tela mostra todos os botoes da etapa. A tela so oferece os botoes em objetivo de AMBIENTE (room_id nao nulo) de etapa com os ambientes ligados; o banco nao cobra isso, para que desligar o toggle nao apague revisao.';

comment on column public.task_checklist_items.review_mark_color is
  'A cor do botao marcado, copiada junto com o rotulo. Existe para que o cartao reproduza o botao que foi apertado mesmo depois de a cor mudar no cadastro ou de o botao ser apagado.';

comment on column public.task_checklist_items.review_marked_by_id is
  'Colaborador que marcou a revisao. Nullable de proposito - ver o cabecalho da 0131.';

comment on column public.task_checklist_items.review_marked_at is
  'Quando a revisao foi marcada. Par de review_mark_label: sem ele, "Reprovado" nao diz se foi ontem ou ha um ano.';

comment on constraint task_checklist_items_review_mark_needs_label_check on public.task_checklist_items is
  'Cor, autor e instante so existem com rotulo. Desmarcar a revisao zera os quatro campos de uma vez, e esta constraint e o que impede o estado pela metade - cor orfa que a tela desenharia como botao sem texto, ou autor de uma decisao que nao esta gravada.';

-- O indice serve a uma pergunta que a tela ja faz: "quais ambientes desta tarefa
-- ja foram revisados". Parcial porque a esmagadora maioria dos itens nunca tera
-- marca nenhuma.
create index task_checklist_items_review_mark_idx
  on public.task_checklist_items (tenant_id, task_id)
  where review_mark_label is not null;

-- 4. Gravar a lista de botoes de uma vez -------------------------------------------
--
-- Mesma forma de replace_kanban_column_objectives (0099), e pelo mesmo motivo: a
-- tela edita a lista inteira num dialogo so. Sem a funcao seriam varias escritas
-- soltas, e uma falha no meio deixaria a etapa com meia configuracao - metade dos
-- botoes novos e metade dos antigos.
--
-- SECURITY INVOKER: quem chama passa pelas policies da tabela. A checagem de
-- permissao no comeco nao substitui a RLS; ela evita que quem nao edita
-- Configuracoes mande uma lista vazia, veja DELETE de zero linhas e receba
-- "salvo" sobre uma configuracao que nao mudou.

create function public.replace_kanban_column_review_marks(p_column_id uuid, p_marks jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
  v_mark jsonb;
  v_order integer := 0;
begin
  if not (select public.can_edit_menu('settings')) then
    raise exception using errcode = '42501', message = 'sem_permissao_configuracoes';
  end if;

  /* A etapa e procurada sob RLS, entao a de outro escritorio simplesmente nao
     existe para quem chama. */
  select c.tenant_id into v_tenant_id
  from public.kanban_columns c
  where c.id = p_column_id;

  if v_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'etapa_nao_encontrada';
  end if;

  if p_marks is null or jsonb_typeof(p_marks) <> 'array' then
    raise exception using errcode = '22023', message = 'lista_de_botoes_invalida';
  end if;

  delete from public.kanban_column_review_marks where column_id = p_column_id;

  for v_mark in select value from jsonb_array_elements(p_marks) loop
    v_order := v_order + 1;
    insert into public.kanban_column_review_marks (tenant_id, column_id, label, color, display_order)
    values (
      v_tenant_id,
      p_column_id,
      btrim(coalesce(v_mark ->> 'label', '')),
      coalesce(nullif(btrim(coalesce(v_mark ->> 'color', '')), ''), 'slate'),
      v_order
    );
  end loop;

  return v_order;
end;
$BODY$;

comment on function public.replace_kanban_column_review_marks is
  'Grava a lista inteira de botoes de revisao de uma etapa numa transacao (0131). SECURITY INVOKER: as policies da tabela valem. Apagar e recriar NAO afeta marca nenhuma ja feita em tarefa, porque a marca e copia do rotulo e da cor. Devolve quantos botoes ficaram.';

revoke all on function public.replace_kanban_column_review_marks(uuid, jsonb) from public, anon;
grant execute on function public.replace_kanban_column_review_marks(uuid, jsonb) to authenticated;
