-- Modulo 3 (Pipeline) - RLS de negotiations e das duas tabelas filhas.
--
-- Matriz de docs/SCHEMA-PLAN.md, secao "Modulo 3 - Pipeline":
--   le: qualquer colaborador active do tenant
--   escreve: colaborador active com can_edit no menu 'pipeline'
--
-- Mesma forma da 0017 (clients), trocando a chave do menu. O helper
-- public.can_edit_menu(text) existe justamente para isso: a regra de escrita de
-- todos os modulos de negocio mora em um lugar so, e a chave e parametro.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS
-- sem GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela
-- inteira para a chave publicavel. anon NAO recebe nada em nenhuma das tres -
-- nenhuma tela de pipeline e publica. (A superficie publica por token do modulo,
-- client_intakes, e outra tabela e tem migration propria, a 0025 - e la anon
-- tambem nao recebe nada.)
--
-- As tres tabelas repetem o mesmo par de predicados em vez de compartilharem uma
-- funcao: policy e o lugar onde ler o predicado inteiro na hora da auditoria
-- vale mais do que economizar linha. O que NAO se repete e a regra de negocio -
-- essa esta dentro de can_edit_menu.
--
-- Por que as filhas nao verificam a negociacao-mae: a FK composta
-- (negotiation_id, tenant_id) ja garante que a linha filha esta no mesmo
-- escritorio da mae, entao filtrar por tenant_id aqui e equivalente a filtrar
-- pela mae, e custa um predicado em vez de um join por linha avaliada.
--
-- Toda chamada de helper vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha - o kanban carrega o funil inteiro de uma vez.

-- 1. negotiations --------------------------------------------------------------

alter table public.negotiations enable row level security;

grant select, insert, update, delete on table public.negotiations to authenticated;

create policy negotiations_select_active_collaborator
  on public.negotiations
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy negotiations_select_active_collaborator on public.negotiations is
  'Leitura larga, como em clients (0017): qualquer colaborador active do escritorio, sem exigir can_view no menu pipeline. O funil alimenta o painel comercial, o historico do cliente no CRM e a origem dos contratos (modulo 4) - apertar aqui por can_view quebraria tela que o original nunca fechou. Quem esconde o item Pipeline da sidebar e a permissao de menu, nao a RLS. Colaborador em Ferias ou Afastado e usuario logado sem colaborador nao leem nada.';

create policy negotiations_insert_pipeline_editor
  on public.negotiations
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy negotiations_insert_pipeline_editor on public.negotiations is
  'WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita pipeline no proprio escritorio criaria negociacao dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST - escrita cruzada que a policy de SELECT nao pega, porque SELECT nao roda no INSERT.';

create policy negotiations_update_pipeline_editor
  on public.negotiations
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy negotiations_update_pipeline_editor on public.negotiations is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita pipeline pegaria uma negociacao do proprio escritorio e reescreveria tenant_id para outro, empurrando a linha para fora do proprio alcance e para dentro do alcance de terceiros. Cobre tambem o arrastar do kanban, que e um UPDATE de funnel_stage.';

create policy negotiations_delete_pipeline_editor
  on public.negotiations
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy negotiations_delete_pipeline_editor on public.negotiations is
  'Apagar negociacao exige a mesma permissao de editar, como no original, onde a exclusao em massa de negociacoes perdidas (Negociacoes.jsx) vive atras do mesmo canEdit. Negociacao com contrato ou projeto vinculado (modulos 4 e 5) sera barrada pela FK daquelas tabelas - restricao de integridade, e nao policy, e o lugar dessa regra.';

-- 2. negotiation_services ------------------------------------------------------

alter table public.negotiation_services enable row level security;

grant select, insert, update, delete on table public.negotiation_services to authenticated;

create policy negotiation_services_select_active_collaborator
  on public.negotiation_services
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy negotiation_services_select_active_collaborator on public.negotiation_services is
  'Mesmo recorte da negociacao-mae: quem le a negociacao le os servicos dela. Um recorte mais estreito aqui produziria card de funil sem os tipos de servico, sem erro nenhum na tela.';

create policy negotiation_services_insert_pipeline_editor
  on public.negotiation_services
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

create policy negotiation_services_update_pipeline_editor
  on public.negotiation_services
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

create policy negotiation_services_delete_pipeline_editor
  on public.negotiation_services
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy negotiation_services_delete_pipeline_editor on public.negotiation_services is
  'Desmarcar um servico da negociacao e um DELETE nesta tabela, entao exige a mesma permissao de editar a negociacao. O DELETE em cascata vindo de negotiations nao passa por policy - cascata de FK roda como o sistema, e quem autorizou foi a policy de DELETE da mae.';

-- 3. negotiation_owner_history -------------------------------------------------

alter table public.negotiation_owner_history enable row level security;

grant select, insert, update, delete on table public.negotiation_owner_history to authenticated;

create policy negotiation_owner_history_select_active_collaborator
  on public.negotiation_owner_history
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

create policy negotiation_owner_history_insert_pipeline_editor
  on public.negotiation_owner_history
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

create policy negotiation_owner_history_update_pipeline_editor
  on public.negotiation_owner_history
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

create policy negotiation_owner_history_delete_pipeline_editor
  on public.negotiation_owner_history
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy negotiation_owner_history_update_pipeline_editor on public.negotiation_owner_history is
  'HISTORICO COM UPDATE E DELETE ABERTOS A QUEM EDITA O PIPELINE, e isso e uma escolha, nao um descuido: quem pode trocar o responsavel pode corrigir o registro da troca. Registro de historico a prova de edicao exigiria escrita so por trigger (INSERT sem policy para authenticated), e isso vira decisao do usuario no dia em que este historico for usado como prova de comissao - hoje ele alimenta a timeline da negociacao. Ate la, os quatro comandos seguem a mesma regra do resto do modulo, que e o que os invariantes do padrao cobram.';
