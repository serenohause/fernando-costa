-- Modulo 4 (Contratos) - RLS de contracts.
--
-- Matriz de docs/SCHEMA-PLAN.md, secao "Modulo 4 - Contratos":
--   le: qualquer colaborador active do tenant
--   escreve: colaborador active com can_edit no menu 'contracts'
--
-- Mesma forma da 0017 (clients) e da 0024 (negotiations), trocando a chave do
-- menu. O helper public.can_edit_menu(text) existe justamente para isso: a regra
-- de escrita de todos os modulos de negocio mora em um lugar so, e a chave e
-- parametro. A chave 'contracts' ja existe em public.menus desde a 0004
-- (rotulo "Contratos & Propostas"), e can_edit_menu levanta 22023 para chave
-- inexistente - erro de digitacao aqui nao vira "ninguem escreve, nunca".
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS
-- sem GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela
-- inteira para a chave publicavel. anon NAO recebe nada - nenhuma tela de
-- contratos e publica, e o contrato carrega documento e endereco do cliente.
--
-- Toda chamada de helper vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha - a tela carrega a lista inteira de contratos de uma vez.

alter table public.contracts enable row level security;

grant select, insert, update, delete on table public.contracts to authenticated;

create policy contracts_select_active_collaborator
  on public.contracts
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy contracts_select_active_collaborator on public.contracts is
  'Leitura larga, como em clients (0017) e negotiations (0024): qualquer colaborador active do escritorio, sem exigir can_view no menu contracts. O contrato alimenta o painel executivo, o funil (que mostra o numero do contrato gerado), os projetos do modulo 5 e os recebiveis do modulo 7 - apertar aqui por can_view quebraria tela que o original nunca fechou. Quem esconde o item "Contratos & Propostas" da sidebar e a permissao de menu, nao a RLS. Colaborador em Ferias ou Afastado e usuario logado sem colaborador nao leem nada.';

create policy contracts_insert_contracts_editor
  on public.contracts
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('contracts'))
  );

comment on policy contracts_insert_contracts_editor on public.contracts is
  'WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita contratos no proprio escritorio criaria contrato dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST - escrita cruzada que a policy de SELECT nao pega, porque SELECT nao roda no INSERT. Vale tambem para o contrato que nasce de uma negociacao ganha: no original isso e uma chamada de create como qualquer outra, feita pelo navegador.';

create policy contracts_update_contracts_editor
  on public.contracts
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('contracts'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('contracts'))
  );

comment on policy contracts_update_contracts_editor on public.contracts is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita contratos pegaria um contrato do proprio escritorio e reescreveria tenant_id para outro, empurrando a linha para fora do proprio alcance e para dentro do alcance de terceiros. Cobre tambem a aprovacao do contrato e o arrastar da lista (display_order), que sao UPDATE.';

create policy contracts_delete_contracts_editor
  on public.contracts
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('contracts'))
  );

comment on policy contracts_delete_contracts_editor on public.contracts is
  'Apagar contrato exige a mesma permissao de editar, como no original. Contrato com projeto (modulo 5) ou recebivel (modulo 7) vinculado sera barrado pela FK daquelas tabelas - restricao de integridade, e nao policy, e o lugar dessa regra.';
