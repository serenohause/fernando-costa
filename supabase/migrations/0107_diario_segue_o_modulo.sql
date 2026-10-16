-- Quem escreve no Diario do Projeto passa a ser quem edita o modulo onde ele
-- aparece, e nao mais um papel fixo.
--
-- O PEDIDO
--   "No menu de obras, todos os usuarios podem ter acesso ao diario do projeto,
--   desde que tenham acesso ao modulo que aparece isso."
--
-- COMO ERA
--   `is_project_diary_writer()` (0070) era `auth_collaborator_role() in
--   ('director', 'coordinator')` — porte literal do `canEdit()` do base44, que
--   decide por cargo. A matriz de permissao do escritorio nao era consultada:
--   Arquiteto com can_edit em `project_flow` movia o cartao e nao conseguia
--   escrever no diario DAQUELE cartao, e Coordenador sem nenhuma permissao de
--   menu escrevia mesmo assim.
--
-- COMO FICA
--   `can_edit_menu('project_flow')`, que e a chave do menu de onde o diario e
--   aberto (o item "Diario do Projeto" do cartao do Fluxo do Projeto). Diretor
--   continua passando pelo atalho que a propria can_edit_menu tem, e quem esta
--   afastado continua de fora, porque `auth_collaborator_id()` exige status
--   `active` — as duas garantias mudam de lugar, nao deixam de existir.
--
-- O QUE NAO MUDA
--   A LEITURA. Ela ja era de qualquer colaborador ativo
--   (`*_select_active_collaborator`), e continua: quem consulta a obra nao
--   precisa de permissao de escrita para ver o que foi registrado.
--
-- ALCANCE
--   Trocar o corpo da funcao alcanca de uma vez as seis policies que a chamam
--   (project_diary_entries, project_diary_files, project_issues,
--   project_issue_events, project_site_visits e o bucket de anexos em
--   storage.objects). Nenhuma policy e reescrita aqui, de proposito: a regra
--   mora num lugar so.
--
-- EFEITO NO DADO REAL
--   Medido antes de aplicar: 9 arquitetos ativos passam a escrever (os mesmos
--   que ja editam o Fluxo do Projeto) e nenhum colaborador perde acesso, porque
--   todo coordenador ativo ja tem can_edit no modulo.

create or replace function public.is_project_diary_writer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $BODY$
  select public.can_edit_menu('project_flow')
$BODY$;

comment on function public.is_project_diary_writer is
  'Quem escreve no Diario do Projeto: quem edita o menu project_flow, que e de onde o diario e aberto (0107). Antes era papel fixo (Diretor ou Coordenador, 0070).';
