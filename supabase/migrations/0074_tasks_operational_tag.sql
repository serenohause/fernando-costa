-- Modulo 11, fatia 3 - a tarefa ganha o STATUS OPERACIONAL.
--
-- O QUE E
--   Uma tag na tarefa, "Em Revisao" ou "Aguardando Cliente", que o cartao do
--   kanban desenha como cracha e que SUPRIME a data de vencimento e a borda de
--   atraso (TaskKanban.jsx:468-473 da nova-versao: hasPrazoOculto vem de
--   tag_operacional, e showDueDate/showOverdueBorder saem dele). A tag "pausa" o
--   prazo visualmente. Nao e status e nao e fase: e a terceira coisa, a tarefa
--   parada esperando alguem.
--
-- POR QUE AGORA, E O QUE ESTAVA FALTANDO
--   13 tarefas reais do escritorio foram RECUSADAS na importacao por nao haver
--   esta coluna - 7 "Em Revisao" e 6 "Aguardando Cliente", em Layout,
--   Perspectivas, Projeto Legal e Projeto Executivo. Esta registrado na secao
--   8.1 do docs/IMPORT-PLAN.md ("Task.tag_operacional - campo que existe no dado
--   e em lugar nenhum mais"): o campo nao esta declarado no Task.jsonc do
--   projeto-original nem aparece em nenhum arquivo dele. Alguem criou o campo
--   direto no base44 e a aplicacao antiga nunca o leu; a nova-versao leu, e
--   Task.jsonc de la finalmente o declara com os dois valores.
--
--   O que ele revela sobre a operacao esta na mesma secao 8.1 e vale repetir: os
--   dois valores da tag sao exatamente os dois estados que aparecem em
--   Task.status como valor FORA do enum ("Em revisao" em 1 linha, "Em espera
--   cliente" em 1). O escritorio precisava de "parada esperando alguem" e
--   resolveu isso duas vezes, de dois jeitos, sem que nenhum dos dois estivesse
--   no schema. Aqui vira coluna propria - e nao valor novo em work_status, que
--   e enum compartilhado com activities e com project_checklist_items e onde
--   "Em Revisao" significaria coisa diferente em cada tabela.
--
-- O TIPO JA EXISTE
--   public.operational_tag nasceu na migration 0068, com os dois valores, e ja e
--   usado por project_diary_entries.operational_tag (0069) - o diario guardando
--   QUAL tag foi ligada ou desligada em coluna, e nao dentro do texto do titulo.
--   Um tipo so para as duas pontas: a tarefa que carrega a tag e o evento que
--   registra a mudanca dela. Mesmo desenho de priority_level e work_status
--   (0031), que nascem no modulo 5 e sao compartilhados com o 6.
--
-- ============================================================================
-- SEM CHECK DE "SO NESTAS FASES", E ISSO E DECISAO, NAO ESQUECIMENTO
-- ============================================================================
--   O menu de contexto do cartao na nova-versao oferece a tag so em algumas
--   colunas: COLUNAS_COM_TAGS = ['Layout', 'Perspectivas'] tem as duas, e
--   COLUNAS_SO_REVISAO = ['Projeto Legal', 'Projeto Executivo'] tem so
--   "Em Revisao" (TaskKanban.jsx:42-44). Daria para escrever isso como check.
--
--   NAO SE ESCREVE, de proposito. Esse recorte e OFERTA DE TELA, nao regra de
--   dominio: e a lista de onde o menu mostra a opcao, mantida a mao em duas
--   constantes de um componente. Virar check faria um arraste legitimo virar
--   ERRO DE BANCO no dia em que tela e check discordassem - e eles vao
--   discordar, porque um vive em src/ e o outro so muda por migration. Pior:
--   quem arrasta um cartao com tag para uma coluna fora do recorte esta fazendo
--   exatamente o gesto que a fatia 3 desenha (a tag e limpa no MESMO UPDATE da
--   mudanca de fase), e um check ali transformaria a limpeza em falha.
--
--   E o check nao pegaria nada hoje: as 13 tags reais caem TODAS dentro do
--   recorte. Ou seja, ele passaria com nota cheia agora e a unica coisa que
--   poderia fazer no futuro e quebrar.
--
--   Mesma decisao ja registrada no comment do tipo em 0068. Esta escrita aqui
--   tambem, e no COMMENT da coluna, porque ausencia de restricao e o tipo de
--   coisa que a proxima pessoa le como falta de cuidado e "conserta".
--
-- E ANULAVEL PORQUE A AUSENCIA DE TAG E O CASO NORMAL
--   Tarefa sem tag e a esmagadora maioria: 13 tags em 130 tarefas do export.
--   Nulo aqui significa "nao esta parada esperando ninguem", que e o estado
--   default de qualquer tarefa - e nao um valor desconhecido. Nao ha valor
--   sentinela ('none', 'nenhuma') no enum pelo mesmo motivo: o cracha nao
--   desenha nada quando nao ha tag, e um valor que existe so para significar
--   "vazio" apareceria em toda consulta que agrupa por tag.
--
-- POR QUE MIGRATION NOVA
--   A 0032, que criou tasks, ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md).

alter table public.tasks
  add column operational_tag public.operational_tag;

comment on column public.tasks.operational_tag is
  'Status operacional da tarefa: in_review=Em Revisao, awaiting_client=Aguardando Cliente. NAO e status nem fase - e a terceira coisa, "parada esperando alguem", e por isso o cracha SUPRIME a data de vencimento e a borda de atraso no cartao (TaskKanban.jsx:468-473 da nova-versao). Nulo e o caso normal (13 tags em 130 tarefas do export) e significa "nao esta parada", nao "desconhecido". SEM CHECK DE FASE, DE PROPOSITO: o menu do cartao so oferece a tag em Layout e Perspectivas (as duas) e em Projeto Legal e Projeto Executivo (so Em Revisao), mas esse recorte e oferta de tela, mantido a mao em duas constantes de componente - nao regra de dominio. Virar check faria um arraste legitimo virar erro de banco no dia em que tela e check discordassem, e as 13 tags reais ja caem todas dentro do recorte, entao ele nao pegaria nada hoje. A ausencia de restricao aqui e decisao registrada (migrations 0068 e 0074), nao esquecimento.';

-- O indice: quem tem tag, por escritorio -------------------------------------
--
-- PARCIAL porque a coluna e quase toda nula, e nulo nao interessa a nenhuma
-- consulta: ninguem pergunta "quais tarefas NAO estao paradas" - isso e a lista
-- inteira. O que se pergunta e "quais estao Em Revisao" e "quantas Aguardando
-- Cliente", que sao os dois indicadores do resumo do diario e o filtro do
-- kanban. Mesma forma do tasks_tenant_id_due_date_idx (0032), que e parcial por
-- razao irma: tarefa concluida nunca esta atrasada e sai da conta.
--
-- Comeca por tenant_id como todo indice deste projeto (CLAUDE.md): a RLS filtra
-- por escritorio em TODA consulta, e indice que nao comeca pelo tenant deixa o
-- planejador varrer linha de escritorio alheio antes de descartar.

create index tasks_tenant_id_operational_tag_idx
  on public.tasks (tenant_id, operational_tag)
  where operational_tag is not null;

comment on index public.tasks_tenant_id_operational_tag_idx is
  'As tarefas COM status operacional, por escritorio. Parcial porque a coluna e quase toda nula e nulo nao responde pergunta nenhuma: a consulta real e "o que esta Em Revisao" e "o que esta Aguardando Cliente", nunca "o que nao tem tag" (isso e a lista inteira). Comeca por tenant_id como todo indice deste projeto, para que a RLS descarte escritorio alheio pelo indice e nao depois de ler a linha.';
