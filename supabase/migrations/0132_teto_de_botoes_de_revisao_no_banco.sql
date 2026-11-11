-- O teto de botoes de revisao passa a existir no BANCO, e nao so na tela.
--
-- DE ONDE VEIO
--   Auditoria de seguranca de 11/11/2026, antes do deploy da 0131. Achado baixo,
--   e o conserto cabe numa linha.
--
-- O QUE ESTAVA ABERTO
--   `MAX_REVIEW_MARKS` (src/features/kanban/review-marks.ts) recusa lista com
--   mais de oito botoes ANTES de chamar a funcao. Isso cobre a tela e nao cobre
--   a chamada direta: quem edita Configuracoes podia mandar o RPC com milhares
--   de rotulos distintos - o unique e por rotulo, e 40 caracteres dao combinacao
--   de sobra.
--
--   O ESTRAGO CAI NOS COLEGAS, e e por isso que isto nao ficou so como nota.
--   `useKanbanBoard` le os botoes de TODAS as etapas a cada abertura do Fluxo do
--   Projeto, para todo mundo do escritorio: uma lista inflada vira download e
--   menu infinito para quem nao fez nada. Quem abusa ja poderia apagar o quadro
--   inteiro, mas apagar o quadro aparece na hora; isto apodrece devagar.
--
-- POR QUE OITO, E POR QUE AQUI
--   Oito e o numero que a tela ja aplica, e ele e de tela mesmo: os botoes
--   aparecem num menu ao lado do titulo do ambiente. O banco nao precisa saber
--   DESENHAR para recusar o absurdo; precisa recusar o que a tela nunca
--   produziria. Repetir o numero nos dois lugares e o preco, e esta escrito dos
--   dois lados.
--
-- A FUNCAO E REESCRITA INTEIRA, e nao remendada: `create or replace` substitui o
-- corpo todo, e deixar a versao antiga como referencia num comentario seria
-- manter duas verdades. O resto do corpo e identico ao da 0131.

create or replace function public.replace_kanban_column_review_marks(p_column_id uuid, p_marks jsonb)
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

  /* O teto que a tela ja aplica, agora tambem aqui. Ver o cabecalho da 0132. */
  if jsonb_array_length(p_marks) > 8 then
    raise exception using errcode = '22023', message = 'limite_de_botoes_por_etapa';
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
  'Grava a lista inteira de botoes de revisao de uma etapa numa transacao (0131), com teto de oito botoes aplicado no banco desde a 0132. SECURITY INVOKER: as policies da tabela valem. Apagar e recriar NAO afeta marca nenhuma ja feita em tarefa, porque a marca e copia do rotulo e da cor. Devolve quantos botoes ficaram.';

revoke all on function public.replace_kanban_column_review_marks(uuid, jsonb) from public, anon;
grant execute on function public.replace_kanban_column_review_marks(uuid, jsonb) to authenticated;
