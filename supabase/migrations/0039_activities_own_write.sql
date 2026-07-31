-- Quem e responsavel pela atividade pode mexer nela, mesmo sem permissao no menu.
--
-- POR QUE
--   Decisao do usuario, e restaura o original. Em
--   projeto-original/src/pages/Atividades.jsx:603:
--
--     canEdit = visaoGerencial || isCoordenador || row.colaborador_id === currentCollaborator?.id
--
--   e os botoes Comecar e Concluir vivem atras disso.
--
--   A 0038 redefiniu so a LEITURA (recorte por pessoa) e deixou a escrita no
--   padrao dos modulos anteriores: can_edit_menu('activities'). O efeito e que
--   Arquiteto e Estagiario - que no seed do modulo 1 nao recebem menu nenhum -
--   LIAM as proprias atividades e nao conseguiam inicia-las nem conclui-las. A
--   tela "Minhas Atividades" nasceria somente de leitura justamente para quem
--   ela existe.
--
-- O QUE MUDA, E O QUE NAO MUDA
--   UPDATE passa a aceitar tambem quem e o responsavel ou o coordenador da
--   linha. Ou seja, o mesmo recorte que ja vale para LER.
--
--   INSERT e DELETE continuam exigindo can_edit_menu('activities'):
--   - criar atividade e atribuicao de trabalho, e atribuir trabalho a si mesmo
--     sem que ninguem coordene nao e o que a tela do original faz;
--   - apagar remove da auditoria de quem fez o que, e a exclusao aqui e logica
--     justamente para preservar isso.
--
--   Ninguem passa a mexer em atividade alheia: o predicado e a linha, nao o
--   menu. E o WITH CHECK continua amarrando tenant_id ao claim do JWT nos dois
--   lados, entao a linha resultante tambem precisa continuar sendo do mesmo
--   escritorio e do mesmo responsavel.
--
-- O QUE ESTE DESENHO NAO IMPEDE, e fica registrado
--   Quem e responsavel pode mudar QUALQUER coluna da propria atividade, e nao
--   so o status - inclusive prazo, descricao e o proprio responsavel. Restringir
--   por coluna exigiria regra por coluna, que e mais superficie para manter. O
--   original tambem nao restringe. Se um dia o escritorio quiser "so o status",
--   o lugar e aqui.

drop policy if exists activities_update_activities_editor on public.activities;

create policy activities_update_activities_own_or_editor
  on public.activities
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
    and (
      (select public.can_edit_menu('activities'))
      or collaborator_id = (select public.auth_collaborator_id())
      or coordinator_id = (select public.auth_collaborator_id())
    )
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
    and (
      (select public.can_edit_menu('activities'))
      or collaborator_id = (select public.auth_collaborator_id())
      or coordinator_id = (select public.auth_collaborator_id())
    )
  );

comment on policy activities_update_activities_own_or_editor on public.activities is
  'Mesmo recorte da leitura: quem tem can_edit no menu activities OU e o responsavel OU e o coordenador do responsavel. Restaura Atividades.jsx:603 do original, onde os botoes Comecar e Concluir vivem atras de "a atividade e sua". Sem isso, Arquiteto e Estagiario - que no seed nao recebem menu nenhum - liam as proprias atividades e nao conseguiam inicia-las. INSERT e DELETE continuam exigindo o menu: criar e atribuir trabalho, e apagar remove da auditoria. O WITH CHECK repete o predicado do USING porque sem ele a linha RESULTANTE nao e verificada - alguem poderia reatribuir a propria atividade para outra pessoa e perde-la de vista, ou move-la para outro escritorio.';
