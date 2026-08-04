-- Modulo 8 (Fornecedores e Orcamento por Cliente) - RLS das cinco tabelas.
--
-- Matriz:
--   le:      qualquer colaborador active do escritorio, nas cinco tabelas
--   escreve: can_edit_menu('suppliers')     em suppliers e supplier_brands
--            can_edit_menu('client_budget') em budget_checklists,
--                                              budget_checklist_items e
--                                              budget_item_quotes
--
-- DE ONDE SAEM AS DUAS CHAVES DE MENU
--   Nao foram inventadas. Sao itens separados da sidebar do original
--   (src/Layout.jsx:343-344: 'Fornecedores' e 'Orcamento por Cliente'), estao em
--   docs/ENUM-MAP.md com os slugs suppliers e client_budget, nasceram na tabela
--   menus na migration 0004 (linhas 73-74) e ja sao concedidas pelo seed da
--   fundacao (supabase/seed/01-foundation.mjs:175 e :183). E sao exatamente as
--   duas que o original consulta a mao no frontend:
--   Fornecedores.jsx:60 (`p.menu === 'Fornecedores'`) e OrcamentoCliente.jsx:44
--   (`p.menu === 'Orcamento por Cliente'`).
--
-- POR QUE A LEITURA E LARGA
--   Mesmo recorte dos modulos 2 a 5 e 7. Quem nao deve abrir a tela ja e barrado
--   pelo menu (suppliers / client_budget com can_view), e duplicar esse recorte
--   na policy criaria um segundo lugar onde a mesma decisao pode divergir. Vale
--   registrar a consequencia, como o modulo 7 registrou: colaborador active com
--   token valido alcanca o cadastro de fornecedores inteiro e todos os orcamentos
--   de cliente pela Data API, mesmo sem o menu. E dado comercial sensivel -
--   percentual de comissao acordado com cada fornecedor e o que o escritorio ganha
--   por item orcado. Se o escritorio quiser apertar, o lugar e a policy de SELECT
--   deste arquivo, e o caminho e auth_collaborator_role(), que existe desde a
--   0007 exatamente para isso.
--
-- O ORIGINAL E MAIS FROUXO DO QUE ISTO, E NAO E POR ESCOLHA
--   Nas duas telas, quem NAO tem colaborador correspondente recebe canManage =
--   true (Fornecedores.jsx:58 e OrcamentoCliente.jsx:42: `if (!collab) {
--   setCanManage(true); return; }`), e quem tem colaborador mas nao tem linha de
--   permissao para aquele menu tambem (`!perm || perm.pode_editar === true`).
--   Ausencia de permissao virando permissao total nao e recurso: aqui, sem linha
--   de permissao, can_edit_menu devolve false e a escrita e negada.
--
-- Toda chamada de funcao vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS sem
-- GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela inteira
-- para a chave publicavel. anon NAO recebe nada - nenhuma tela deste modulo e
-- publica.
--
-- AS TRES TABELAS-FILHAS TEM POLICY PROPRIA, e nao herdam nada pela FK. Postgres
-- nao propaga RLS por referencia: uma tabela filha sem policy simplesmente nao
-- responde (ou responde tudo, se alguem der GRANT sem ligar a RLS). O tenant_id
-- proprio existe pelo mesmo motivo - e o que a policy compara, e e o que a FK
-- composta amarra a mae.

-- suppliers -----------------------------------------------------------------------

alter table public.suppliers enable row level security;

grant select, insert, update, delete on table public.suppliers to authenticated;

create policy suppliers_select_active_collaborator
  on public.suppliers
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy suppliers_select_active_collaborator on public.suppliers is
  'Leitura larga, como em clients (0017), contracts (0030), projects (0033) e o financeiro (0042): qualquer colaborador active do escritorio le o cadastro de fornecedores. Alem da tela Fornecedores, e daqui que sai o seletor de fornecedor do item de orcamento - policy mais apertada aqui esvaziaria o seletor de quem cuida do orcamento sem cuidar do cadastro. is_active_collaborator() mantem a regra transversal: colaborador em Ferias ou Afastado nao le nada.';

create policy suppliers_insert_suppliers_editor
  on public.suppliers
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  );

comment on policy suppliers_insert_suppliers_editor on public.suppliers is
  'Escrita presa ao menu suppliers - e NAO a client_budget, que e o outro menu deste mesmo modulo. WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita fornecedores no proprio escritorio criaria cadastro dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST, escrita cruzada que a policy de SELECT nao pega porque SELECT nao roda no INSERT.';

create policy suppliers_update_suppliers_editor
  on public.suppliers
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  );

comment on policy suppliers_update_suppliers_editor on public.suppliers is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita fornecedores pegaria um cadastro do proprio escritorio e reescreveria tenant_id para outro. E por aqui que passa o botao Inativar/Reativar do drawer (FornecedorDrawer.jsx:134).';

create policy suppliers_delete_suppliers_editor
  on public.suppliers
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  );

comment on policy suppliers_delete_suppliers_editor on public.suppliers is
  'Exclusao de fornecedor, presa ao menu suppliers. Apagar fornecedor que ja cotou item de orcamento falha na FK de budget_item_quotes (sem cascade, de proposito): a tela precisa dizer isso e oferecer Inativar, que e o caminho certo para fornecedor com historico. As marcas somem junto, por cascade - elas sao parte do cadastro.';

-- supplier_brands -------------------------------------------------------------------

alter table public.supplier_brands enable row level security;

grant select, insert, update, delete on table public.supplier_brands to authenticated;

create policy supplier_brands_select_active_collaborator
  on public.supplier_brands
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy supplier_brands_select_active_collaborator on public.supplier_brands is
  'Policy PROPRIA, e nao heranca da mae: Postgres nao propaga RLS por FK. A busca da tela de fornecedores casa por marca (Fornecedores.jsx:124), entao quem le o fornecedor precisa ler as marcas dele. Mesmo recorte de suppliers.';

create policy supplier_brands_insert_suppliers_editor
  on public.supplier_brands
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  );

comment on policy supplier_brands_insert_suppliers_editor on public.supplier_brands is
  'Mesmo menu da mae (suppliers): marca so e criada de dentro do formulario de fornecedor. O tenant_id conferido e o DESTA linha - a FK composta e que garante que ele bate com o do fornecedor apontado.';

create policy supplier_brands_update_suppliers_editor
  on public.supplier_brands
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  );

comment on policy supplier_brands_update_suppliers_editor on public.supplier_brands is
  'USING e WITH CHECK pelo mesmo motivo de suppliers. Na pratica o formulario do original remove e recria marcas em vez de edita-las (FornecedorForm.jsx:49), mas policy que falta e policy que nega para sempre - e o A4 da suite de padrao cobra os quatro comandos.';

create policy supplier_brands_delete_suppliers_editor
  on public.supplier_brands
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('suppliers'))
  );

comment on policy supplier_brands_delete_suppliers_editor on public.supplier_brands is
  'Remover uma marca do fornecedor. Presa ao menu suppliers. A remocao em cascata que vem de apagar o fornecedor NAO passa por aqui - cascade roda como a operacao da mae, e quem a autoriza e a policy de DELETE de suppliers.';

-- budget_checklists -------------------------------------------------------------------

alter table public.budget_checklists enable row level security;

grant select, insert, update, delete on table public.budget_checklists to authenticated;

create policy budget_checklists_select_active_collaborator
  on public.budget_checklists
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy budget_checklists_select_active_collaborator on public.budget_checklists is
  'Leitura larga para colaborador active, como no resto do modulo. O recorte de quem enxerga orcamento de cliente vive no menu client_budget - ver o cabecalho da 0050 para a consequencia registrada.';

create policy budget_checklists_insert_budget_editor
  on public.budget_checklists
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_checklists_insert_budget_editor on public.budget_checklists is
  'Escrita presa ao menu client_budget - e NAO a suppliers. E a mesma chave que o original consulta no frontend (OrcamentoCliente.jsx:44), agora como autoridade e nao como enfeite: la, permissao ausente virava canManage = true.';

create policy budget_checklists_update_budget_editor
  on public.budget_checklists
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_checklists_update_budget_editor on public.budget_checklists is
  'USING e WITH CHECK pelo mesmo motivo das outras tabelas. E por aqui que passa a troca de status geral no cabecalho do detalhe (ChecklistDetalhe.jsx:116). Os totais NAO passam por aqui: eles nao sao colunas (view budget_checklist_totals, 0051).';

create policy budget_checklists_delete_budget_editor
  on public.budget_checklists
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_checklists_delete_budget_editor on public.budget_checklists is
  'Exclusao do checklist inteiro, presa ao menu client_budget. Leva itens e cotacoes por cascade, que e o que o original faz ao apagar a linha unica do documento - a diferenca e que aqui isso e uma transacao do banco, e nao uma requisicao que pode falhar no meio. Os ARQUIVOS no bucket nao somem junto: storage nao tem FK. Ver o cabecalho da 0052.';

-- budget_checklist_items -----------------------------------------------------------------

alter table public.budget_checklist_items enable row level security;

grant select, insert, update, delete on table public.budget_checklist_items to authenticated;

create policy budget_checklist_items_select_active_collaborator
  on public.budget_checklist_items
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy budget_checklist_items_select_active_collaborator on public.budget_checklist_items is
  'Policy PROPRIA, e nao heranca da mae. Mesmo recorte de budget_checklists: e daqui que sai tudo o que a view budget_checklist_totals soma, e a view e SECURITY INVOKER - quem nao le o item nao ve o valor dele no total.';

create policy budget_checklist_items_insert_budget_editor
  on public.budget_checklist_items
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_checklist_items_insert_budget_editor on public.budget_checklist_items is
  'Menu client_budget. No original, adicionar item e um UPDATE do documento inteiro (ChecklistDetalhe.jsx:69) - aqui e INSERT nesta tabela, e a permissao conferida e a mesma.';

create policy budget_checklist_items_update_budget_editor
  on public.budget_checklist_items
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_checklist_items_update_budget_editor on public.budget_checklist_items is
  'Cobre marcar comissao como recebida (ChecklistDetalhe.jsx:195), anexar/remover o PDF do item e mudar status. commission_value NAO e escrito por ninguem: e coluna gerada, e o banco recusa quem tentar.';

create policy budget_checklist_items_delete_budget_editor
  on public.budget_checklist_items
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_checklist_items_delete_budget_editor on public.budget_checklist_items is
  'Remover item do checklist, presa ao menu client_budget. Leva as cotacoes do item por cascade.';

-- budget_item_quotes ----------------------------------------------------------------------

alter table public.budget_item_quotes enable row level security;

grant select, insert, update, delete on table public.budget_item_quotes to authenticated;

create policy budget_item_quotes_select_active_collaborator
  on public.budget_item_quotes
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy budget_item_quotes_select_active_collaborator on public.budget_item_quotes is
  'Policy PROPRIA, e nao heranca de duas maes (o item e o fornecedor). Mesmo recorte do resto do modulo. E a tabela que guarda quanto cada fornecedor cobrou pelo mesmo material - a comparacao de precos do escritorio.';

create policy budget_item_quotes_insert_budget_editor
  on public.budget_item_quotes
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_item_quotes_insert_budget_editor on public.budget_item_quotes is
  'Menu client_budget, e NAO suppliers: quem cadastra fornecedor nao necessariamente pode mexer no orcamento de um cliente. A cotacao aponta para um fornecedor, mas ela e parte do orcamento.';

create policy budget_item_quotes_update_budget_editor
  on public.budget_item_quotes
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_item_quotes_update_budget_editor on public.budget_item_quotes is
  'E por aqui que passa anexar e remover o PDF do orcamento do fornecedor (ItemOrcamentoDrawer.jsx:42-64), que e o unico upload do sistema que as telas do original realmente usam.';

create policy budget_item_quotes_delete_budget_editor
  on public.budget_item_quotes
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_item_quotes_delete_budget_editor on public.budget_item_quotes is
  'Remover uma cotacao do item, presa ao menu client_budget. O arquivo no bucket nao some junto - ver o cabecalho da 0052.';
