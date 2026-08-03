-- Modulo 7 (Financeiro) - RLS de accounts_receivable, accounts_payable e
-- financial_categories.
--
-- Matriz de docs/SCHEMA-PLAN.md, secao "Modulo 7":
--   le:      qualquer colaborador active do escritorio, nas tres tabelas
--   escreve: can_edit_menu('receivables') em accounts_receivable
--            can_edit_menu('payables')    em accounts_payable
--            can_edit_menu('payables')    em financial_categories
--
-- POR QUE A LEITURA VOLTA A SER LARGA
--   O modulo 6 apertou a leitura (atividade descreve o desempenho de UMA
--   pessoa). Aqui volta ao padrao dos modulos 2 a 5, e a razao e que o recorte
--   de quem enxerga o financeiro ja existe e vive no MENU: quem nao tem
--   'receivables'/'payables' com can_view nao ve o item na sidebar, e
--   Arquiteto e Estagiario recebem view: [] no seed do modulo 1. Duplicar esse
--   recorte na policy nao acrescenta fronteira - acrescenta um segundo lugar
--   onde a mesma decisao pode divergir.
--
--   Isso e uma decisao com consequencia, e fica registrada: um colaborador
--   active que consiga um token valido alcanca a carteira inteira do escritorio
--   pela Data API, mesmo sem o menu. E o mesmo recorte aprovado para clients
--   (0017) e contracts (0030), onde o contrato ja carrega valor total, CPF e
--   endereco do cliente. Se o escritorio quiser financeiro so para Diretor,
--   Administrativo e Financeiro, o lugar e aqui, e o caminho e
--   auth_collaborator_role() - que existe desde a 0007 exatamente para isso.
--
-- POR QUE financial_categories USA O MENU 'payables'
--   Ela nao tem item proprio na sidebar (nao ha rota FinancialCategories no
--   original) e e cadastro de apoio das despesas. Amarrar a 'payables' e o que
--   mantem uma unica permissao decidindo sobre o mesmo assunto. O par
--   receivables/payables neste modulo tambem e o que impede a policy de uma
--   tabela passar lendo o menu da outra - ver os casos 1.x de
--   supabase/tests/financial-schema.sql.
--
-- Toda chamada de funcao vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS
-- sem GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela
-- inteira para a chave publicavel. anon NAO recebe nada - nenhuma tela deste
-- modulo e publica.

-- accounts_receivable ---------------------------------------------------------

alter table public.accounts_receivable enable row level security;

grant select, insert, update, delete on table public.accounts_receivable to authenticated;

create policy accounts_receivable_select_active_collaborator
  on public.accounts_receivable
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy accounts_receivable_select_active_collaborator on public.accounts_receivable is
  'Leitura larga, como em clients (0017), negotiations (0024), contracts (0030) e projects (0033): qualquer colaborador active do escritorio le a carteira. Quem NAO deveria abrir a tela ja e barrado pelo menu (receivables com can_view), e duplicar esse recorte aqui criaria um segundo lugar onde a mesma decisao pode divergir. is_active_collaborator() e o que mantem a regra transversal: colaborador em Ferias ou Afastado nao le nada.';

create policy accounts_receivable_insert_receivables_editor
  on public.accounts_receivable
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('receivables'))
  );

comment on policy accounts_receivable_insert_receivables_editor on public.accounts_receivable is
  'Escrita presa ao menu receivables - e NAO a payables, que e o outro menu deste mesmo modulo. WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita recebiveis no proprio escritorio criaria parcela dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST, escrita cruzada que a policy de SELECT nao pega porque SELECT nao roda no INSERT. A geracao em lote de parcelas NAO passa por aqui - generate_contract_installments (0044) e SECURITY DEFINER e confere can_edit_menu(receivables) por dentro, pelo mesmo motivo que approve_access_request (0013) confere.';

create policy accounts_receivable_update_receivables_editor
  on public.accounts_receivable
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('receivables'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('receivables'))
  );

comment on policy accounts_receivable_update_receivables_editor on public.accounts_receivable is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita recebiveis pegaria uma parcela do proprio escritorio e reescreveria tenant_id para outro, empurrando-a para fora do proprio alcance e para dentro do alcance de terceiros. E por aqui que passa "marcar como recebido" (status + payment_date, amarrados por check).';

create policy accounts_receivable_delete_receivables_editor
  on public.accounts_receivable
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('receivables'))
  );

comment on policy accounts_receivable_delete_receivables_editor on public.accounts_receivable is
  'Exclusao de parcela e DELETE de verdade aqui, ao contrario de activities: o original apaga o recebivel junto com o contrato (Contracts.jsx, exclusao em cascata pela aplicacao) e a tela nao tem nocao de parcela excluida. Presa ao menu receivables.';

-- accounts_payable ------------------------------------------------------------

alter table public.accounts_payable enable row level security;

grant select, insert, update, delete on table public.accounts_payable to authenticated;

create policy accounts_payable_select_active_collaborator
  on public.accounts_payable
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy accounts_payable_select_active_collaborator on public.accounts_payable is
  'Mesmo recorte de accounts_receivable: leitura larga para colaborador active, com o filtro real de quem abre a tela vivendo no menu payables. Ver o cabecalho da migration 0042 para a consequencia registrada.';

create policy accounts_payable_insert_payables_editor
  on public.accounts_payable
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  );

comment on policy accounts_payable_insert_payables_editor on public.accounts_payable is
  'Escrita presa ao menu payables - e NAO a receivables. Cobre tanto a despesa avulsa quanto a geracao das ocorrencias de uma recorrencia, que e INSERT comum feito pela tela (nao ha funcao de banco para ela: ao contrario das parcelas de contrato, a recorrencia nao tem soma que precise fechar com um valor assinado).';

create policy accounts_payable_update_payables_editor
  on public.accounts_payable
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  );

comment on policy accounts_payable_update_payables_editor on public.accounts_payable is
  'USING e WITH CHECK pelo mesmo motivo de accounts_receivable. Cobre "marcar como pago", pausar/encerrar recorrencia (recurrence_status) e o "editar todos os futuros", que e um UPDATE por ocorrencia - e a FK composta de recurrence_parent_id e que garante que o grupo alcancado nunca sai do escritorio.';

create policy accounts_payable_delete_payables_editor
  on public.accounts_payable
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  );

comment on policy accounts_payable_delete_payables_editor on public.accounts_payable is
  'Exclusao de despesa, inclusive o "excluir este e todos os futuros" da recorrencia. Presa ao menu payables. Apagar a linha-mae com ocorrencias vivas falha na FK de proposito (sem ON DELETE): a tela precisa dizer o que fazer com os filhos, e ela ja oferece essa escolha.';

-- financial_categories --------------------------------------------------------

alter table public.financial_categories enable row level security;

grant select, insert, update, delete on table public.financial_categories to authenticated;

create policy financial_categories_select_active_collaborator
  on public.financial_categories
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy financial_categories_select_active_collaborator on public.financial_categories is
  'Cadastro de apoio: nome de categoria e centro de custo nao descrevem valor nem cliente, e o seletor que os consome vive dentro da tela de despesas. Leitura larga para colaborador active, como no resto do modulo.';

create policy financial_categories_insert_payables_editor
  on public.financial_categories
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  );

comment on policy financial_categories_insert_payables_editor on public.financial_categories is
  'Menu payables, e nao um menu proprio: financial_categories nao tem rota na sidebar do original e existe para categorizar despesa. Uma chave de menu nova para uma tela que nao existe seria permissao que ninguem concede e cadastro que ninguem consegue criar.';

create policy financial_categories_update_payables_editor
  on public.financial_categories
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  );

comment on policy financial_categories_update_payables_editor on public.financial_categories is
  'USING e WITH CHECK pelo mesmo motivo das outras duas tabelas do modulo: sem WITH CHECK, uma categoria do proprio escritorio poderia ser reescrita com tenant_id de outro.';

create policy financial_categories_delete_payables_editor
  on public.financial_categories
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('payables'))
  );

comment on policy financial_categories_delete_payables_editor on public.financial_categories is
  'Apagar categoria. Nao ha FK de accounts_payable para ca (a categoria da despesa e enum, gravado na propria linha), entao a exclusao nao orfana nada - o que tambem quer dizer que ela nao e barrada por nada, e a tela precisa avisar.';
