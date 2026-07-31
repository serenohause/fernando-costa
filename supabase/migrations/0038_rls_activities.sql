-- Modulo 6 (Atividades) - RLS de activities.
--
-- Matriz de docs/SCHEMA-PLAN.md, secao "Modulo 6 - Atividades", ponto 1:
--   le:      quem tem can_edit_menu('activities') le TODAS as atividades do
--            escritorio; quem NAO tem le apenas aquelas em que e o responsavel
--            (collaborator_id) ou o coordenador (coordinator_id)
--   escreve: colaborador active com can_edit no menu 'activities'
--
-- ESTE MODULO E O PRIMEIRO EM QUE A LEITURA NAO E LARGA
--
-- Em clients (0017), negotiations (0024), contracts (0030) e projects (0033) a
-- leitura e a mesma para todo colaborador active: cadastro compartilhado, que
-- alimenta seletor de tela em todo o sistema. Atividade nao e cadastro
-- compartilhado - ela descreve o que UMA pessoa esta fazendo e quanto tempo
-- levou, e e a base do relatorio de produtividade. Avaliacao de desempenho de
-- terceiro nao e dado de consulta geral do escritorio.
--
-- No original o recorte e cosmetico: MinhasAtividades.jsx:58 baixa TODAS as
-- atividades e filtra por a.colaborador_id === currentCollaborator.id no
-- navegador, e Atividades.jsx faz o mesmo com a "visao gerencial"
-- (:210-:230). Arquiteto e Estagiario sao mandados para a tela individual pelo
-- Layout.jsx, mas nada impede a chamada direta a entidade. Aqui o recorte passa
-- a ser regra do banco.
--
-- POR QUE O PREDICADO E ESTE, E NAO OUTRO
--
--   can_edit_menu('activities') ja embute o atalho de Diretor (migration 0019) e
--   ja exige colaborador active do tenant do JWT - por isso "Diretor ou quem tem
--   can_edit" cabe em uma chamada so. Coordenador e Administrativo recebem
--   activities/can_edit no seed do modulo 1, entao a visao gerencial do original
--   continua de pe para eles.
--
--   O ramo do responsavel compara com auth_collaborator_id(), que devolve null
--   para quem esta em Ferias/Afastado, nao e colaborador ou esta em outro
--   escritorio. Igualdade com null nao casa com linha alguma, entao a regra
--   transversal ("status <> active nao le nada") continua valendo pelos dois
--   lados do OR.
--
--   NAO ha helper novo. can_read_activity() so seria chamada aqui: os modulos 7
--   a 10 voltam a leitura larga, e helper de um usuario so espalha a regra em
--   dois arquivos sem tirar nenhuma duplicacao.
--
--   NAO ha join com collaborators para descobrir quem coordena quem. O
--   coordenador esta gravado na propria linha (coordinator_id, copiado na
--   atribuicao, como no original), entao o predicado se resolve sem tocar em
--   outra tabela - sem risco de recursao e sem consulta por linha lida.
--
-- Toda chamada de funcao vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha. As duas funcoes do OR sao avaliadas uma vez cada, e a comparacao
-- que sobra por linha e igualdade de uuid.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS
-- sem GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela
-- inteira para a chave publicavel. anon NAO recebe nada - nenhuma tela deste
-- modulo e publica.

alter table public.activities enable row level security;

grant select, insert, update, delete on table public.activities to authenticated;

create policy activities_select_own_or_activities_editor
  on public.activities
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
    and (
      (select public.can_edit_menu('activities'))
      or collaborator_id = (select public.auth_collaborator_id())
      or coordinator_id = (select public.auth_collaborator_id())
    )
  );

comment on policy activities_select_own_or_activities_editor on public.activities is
  'UNICO recorte de leitura por pessoa do sistema. Quem tem can_edit no menu activities - ou e Diretor, pelo atalho da 0019 - le todas as atividades do escritorio: e a visao gerencial de Atividades.jsx. Quem nao tem le SO as que sao dele (collaborator_id) ou de quem ele coordena (coordinator_id): e a tela Minhas Atividades, que no original e filtro de navegador e aqui e regra do banco. O CONTROLE importa tanto quanto a negacao - Arquiteto sem permissao de menu nenhuma PRECISA continuar lendo as proprias atividades, senao a tela dele nasce vazia e a policy apertada demais passa despercebida (casos 1.1 a 1.6 de supabase/tests/activities-schema.sql). is_active_collaborator() fecha os dois ramos: colaborador em Ferias ou Afastado nao le nem as proprias. ATIVIDADE EXCLUIDA CONTINUA LEGIVEL de proposito - deleted_at e filtro de consulta, nao de policy, porque quem administra precisa poder recuperar.';

create policy activities_insert_activities_editor
  on public.activities
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('activities'))
  );

comment on policy activities_insert_activities_editor on public.activities is
  'Escrita segue o padrao dos modulos anteriores: can_edit no menu activities. WITH CHECK amarra tenant_id ao claim do JWT - sem isso, quem edita atividades no proprio escritorio criaria atividade dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST, escrita cruzada que a policy de SELECT nao pega porque SELECT nao roda no INSERT. DIVERGENCIA A DECIDIR ANTES DA UI: em Atividades.jsx:603 o original deixa a pessoa mexer na PROPRIA atividade (canEdit = visaoGerencial || isCoordenador || row.colaborador_id === currentCollaborator?.id), e os botoes Comecar/Concluir vivem atras disso. Com esta policy, Arquiteto e Estagiario - que no seed do modulo 1 nao recebem menu nenhum - nao conseguem nem iniciar a propria atividade. O plano aprovado so redefiniu a LEITURA; mexer na escrita sem decisao do usuario seria corrigir o original em silencio.';

create policy activities_update_activities_editor
  on public.activities
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('activities'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('activities'))
  );

comment on policy activities_update_activities_editor on public.activities is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita atividades pegaria uma linha do proprio escritorio e reescreveria tenant_id para outro, empurrando-a para fora do proprio alcance e para dentro do alcance de terceiros. Cobre a EXCLUSAO LOGICA (deleted_at/deleted_by sao UPDATE, nao DELETE), os botoes Comecar e Concluir, e o arrastar de ReordenarAtividades.';

create policy activities_delete_activities_editor
  on public.activities
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('activities'))
  );

comment on policy activities_delete_activities_editor on public.activities is
  'DELETE de verdade, que a tela nao usa: excluir atividade no original e marcar atividade_excluida, e aqui e preencher deleted_at/deleted_by por UPDATE. A policy existe porque o padrao deste projeto exige os quatro comandos declarados - tabela com GRANT de DELETE e sem policy de DELETE e uma porta que ninguem lembra de conferir depois - e porque a limpeza definitiva, quando existir, precisa passar por alguem com permissao de editar o menu.';
