-- Modulo 8 - os PDFs de aprovacao do cliente, por item de orcamento.
--
-- O BURACO QUE ESTA MIGRATION FECHA
--   As migrations 0048-0052 portaram o modulo 8 lendo a entidade
--   projeto-original/base44/entities/ChecklistOrcamento.jsonc e as telas. A
--   entidade NAO declara itens[].pdfs_aprovacao - e o campo e funcionalidade
--   viva, escrita e lida em tres arquivos do original:
--
--     ItemOrcamentoDrawer.jsx:67-85 e :180-211  a secao "Aprovacao do Cliente"
--       anexa VARIOS PDFs, cada um com nome e data de upload, lista todos e
--       remove um a um (handleAddAprovacaoPdf empurra no array; a remocao filtra
--       por indice).
--     ChecklistDetalhe.jsx:212   a contagem de clipes do item soma os PDFs de
--       aprovacao com os das cotacoes.
--     OrcamentoCliente.jsx:200   a mesma soma, agora por checklist inteiro.
--
--   Ou seja: o base44 aceita campo nao declarado, e este e um deles - a mesma
--   familia de itens[].comissao_recebida e de fornecedores_cotados[].pdf_*, que
--   a 0049 ja trouxe pelo mesmo motivo (ponto 6 daquele cabecalho). Sem esta
--   tabela, a migracao entrega uma tela sem onde guardar a aprovacao do cliente
--   - o documento que diz que o cliente autorizou a compra.
--
-- POR QUE TABELA, E NAO COLUNA (nem jsonb)
--   pdfs_aprovacao e LISTA: cada elemento tem { url, nome, data_upload }, o
--   drawer permite N e a remocao e por elemento. Um par
--   approval_file_path/approval_file_name guardaria UM arquivo e perderia a
--   funcionalidade que hoje esta no ar. jsonb guardaria a lista, mas sem
--   tenant_id proprio, sem policy propria, sem check de caminho e sem indice -
--   e o modulo inteiro existe para desfazer exatamente esse desenho (arrays
--   aninhados do base44 viraram supplier_brands, budget_checklist_items e
--   budget_item_quotes).
--
-- O QUE MUDA EM RELACAO AO ORIGINAL
--   1. url vira CAMINHO de objeto no bucket privado budget-files (0052). O
--      original grava a URL publica devolvida pelo upload do base44 e a abre num
--      <a href> comum - e o PDF de aprovacao e, dos tres tipos de arquivo do
--      sistema, o mais sensivel: e a decisao de compra do cliente, com valores.
--      Ver o cabecalho da 0052.
--   2. A data de upload deixa de ser texto ISO cortado no navegador
--      (ItemOrcamentoDrawer.jsx:70) e vira date com default do banco.
--   3. Ganha unicidade de caminho: dois registros apontando para o mesmo objeto
--      fariam a remocao de um apagar o arquivo do outro.

create table public.budget_item_approval_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null,

  -- Caminho do objeto no bucket privado budget-files (0052), NAO uma URL.
  file_path text not null,
  file_name text not null,

  uploaded_on date not null default current_date,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_item_approval_files_id_tenant_id_key unique (id, tenant_id),
  constraint budget_item_approval_files_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint budget_item_approval_files_tenant_id_file_path_key unique (tenant_id, file_path),

  constraint budget_item_approval_files_file_path_not_blank_check
    check (btrim(file_path) <> ''),
  constraint budget_item_approval_files_file_name_not_blank_check
    check (btrim(file_name) <> '')
);

alter table public.budget_item_approval_files
  add constraint budget_item_approval_files_item_id_fkey
  foreign key (item_id, tenant_id)
  references public.budget_checklist_items (id, tenant_id)
  on delete cascade;

comment on table public.budget_item_approval_files is
  'PDFs de aprovacao do cliente para um item do checklist de orcamento, um por linha. Substitui itens[].pdfs_aprovacao, campo que a entidade ChecklistOrcamento do base44 NAO declara e que tres telas do original usam (ItemOrcamentoDrawer.jsx:67-85 e :180-211, ChecklistDetalhe.jsx:212, OrcamentoCliente.jsx:200). E LISTA, e nao par unico: a secao "Aprovacao do Cliente" do drawer anexa varios, mostra nome e data de cada um e remove um a um. ON DELETE CASCADE do item: o arquivo e parte do item, como a cotacao. NAO confundir com budget_checklist_items.budget_file_path, que e outro campo e nenhuma tela do original usa - ver o COMMENT dele.';

comment on column public.budget_item_approval_files.file_path is
  'CAMINHO do PDF dentro do bucket privado budget-files, no formato <tenant_id>/<checklist_id>/<uuid>.pdf. NAO e uma URL, e em especial NAO e uma URL assinada: a assinatura expira (uma hora, por padrao) e a coluna passaria a apontar para um endereco morto sem que nada acusasse. A tela pede uma URL assinada na hora de abrir, a partir daqui. Corresponde a pdfs_aprovacao[].url do original, que la e URL PUBLICA e permanente - endereco que abre o documento de aprovacao de compra de um cliente para quem quer que o tenha.';

comment on column public.budget_item_approval_files.file_name is
  'Nome do arquivo como o usuario o enviou, para a tela ter o que exibir (pdfs_aprovacao[].nome, mostrado em ItemOrcamentoDrawer.jsx:188). NOT NULL, ao contrario do par opcional de budget_checklist_items e budget_item_quotes: la a linha existe sem arquivo e as duas colunas nascem nulas juntas, aqui a linha SO existe porque ha um arquivo. Por isso nao ha *_file_pair_check nesta tabela - o par e obrigatorio, e nao condicional. O nome real do objeto no bucket e um uuid, de proposito: nome escolhido por quem envia nao entra em caminho de storage.';

comment on column public.budget_item_approval_files.uploaded_on is
  'Data em que o PDF foi anexado (pdfs_aprovacao[].data_upload), exibida abaixo do nome do arquivo no drawer. Coluna PROPRIA, e nao derivada de created_at: o dado importado do base44 traz a data original do anexo, e a linha nasce no banco no dia da importacao - as duas datas vao divergir de proposito para tudo que veio de la. DATE e nao timestamptz porque e isso que o original guarda e exibe (new Date().toISOString().slice(0, 10), ItemOrcamentoDrawer.jsx:70).';

comment on column public.budget_item_approval_files.legacy_id is
  'A URL de origem no base44 (pdfs_aprovacao[].url), preenchida so pela importacao. Foge do padrao dos outros legacy_id, que guardam id de linha, e o motivo e que ESTE elemento nao tem id: e um objeto solto dentro de um array dentro de outro array, e a url do upload e a unica identidade estavel que ele tem la - e o que torna a reimportacao idempotente, junto com o unique (tenant_id, legacy_id). NAO E POR ONDE A TELA ABRE O ARQUIVO: quem abre e file_path, assinado na hora. Este endereco deixa de existir quando o base44 for desligado, e a coluna vira registro de procedencia.';

comment on constraint budget_item_approval_files_tenant_id_file_path_key on public.budget_item_approval_files is
  'Um objeto do bucket pertence a UMA linha. Sem isto, duas linhas poderiam apontar para o mesmo arquivo e remover uma apagaria o PDF que a outra ainda exibe - o botao de remover apaga a linha E o objeto. O original nao tem como impedir: cada upload gera uma url nova, mas nada la barra a mesma url repetida no array.';

-- Indice. A tela sempre carrega os PDFs de aprovacao dos itens de um checklist,
-- e a contagem de clipes (view abaixo) agrupa por item.
create index budget_item_approval_files_tenant_id_item_id_idx
  on public.budget_item_approval_files (tenant_id, item_id);

create trigger budget_item_approval_files_set_updated_at
  before update on public.budget_item_approval_files
  for each row execute function public.set_updated_at();

-- RLS: mesma matriz das outras tabelas do modulo (0050) --------------------------
--
-- Policy PROPRIA, e nao heranca pela FK: Postgres nao propaga RLS por
-- referencia. Le quem e colaborador active do escritorio; escreve quem tem
-- can_edit_menu('client_budget') - a MESMA chave de budget_checklist_items, de
-- quem esta tabela e filha. Nao e 'suppliers': o arquivo e parte do orcamento do
-- cliente, nao do cadastro de fornecedores.
--
-- Toda chamada de funcao vai dentro de (select ...) para o planejador trata-la
-- como InitPlan e avalia-la uma vez por comando, e nao uma vez por linha.
--
-- Os dois lados da tranca, como a 0007 deixou registrado: RLS sem GRANT da
-- "permission denied for table"; GRANT sem RLS entrega a tabela inteira para a
-- chave publicavel. anon NAO recebe nada.

alter table public.budget_item_approval_files enable row level security;

grant select, insert, update, delete on table public.budget_item_approval_files to authenticated;

create policy budget_item_approval_files_select_active_collaborator
  on public.budget_item_approval_files
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy budget_item_approval_files_select_active_collaborator on public.budget_item_approval_files is
  'Leitura larga para colaborador active, como no resto do modulo 8. Ler a LINHA nao entrega o arquivo: quem autoriza a assinatura da URL e a policy do bucket (budget_files_select_active_collaborator, 0052), e ela aplica o mesmo recorte - as duas precisam concordar, e concordam de proposito.';

create policy budget_item_approval_files_insert_budget_editor
  on public.budget_item_approval_files
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_item_approval_files_insert_budget_editor on public.budget_item_approval_files is
  'Anexar um PDF de aprovacao, preso ao menu client_budget. WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita orcamento no proprio escritorio penduraria um anexo dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST. A FK composta com o item fecha o outro lado - o anexo nao alcanca item de fora.';

create policy budget_item_approval_files_update_budget_editor
  on public.budget_item_approval_files
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

comment on policy budget_item_approval_files_update_budget_editor on public.budget_item_approval_files is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. No original nao ha edicao de PDF anexado - so anexar e remover -, mas policy que falta e policy que nega para sempre, e o A4 da suite de padrao cobra os quatro comandos.';

create policy budget_item_approval_files_delete_budget_editor
  on public.budget_item_approval_files
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_item_approval_files_delete_budget_editor on public.budget_item_approval_files is
  'Remover um PDF de aprovacao (o botao de lixeira de cada linha da lista, ItemOrcamentoDrawer.jsx:200-207), preso ao menu client_budget. O objeto no bucket NAO some junto, aqui nem no cascade que vem de apagar o item ou o checklist: storage nao tem FK. Quem apaga a linha precisa apagar o objeto - ver o cabecalho da 0052.';

-- O QUE FICA DE budget_file_path / budget_file_name ------------------------------
--
-- As duas colunas de budget_checklist_items FICAM, e nao sao o que esta tabela
-- resolve. A 0049 as documenta como itens[].arquivo_orcamento_url, campo
-- DECLARADO na entidade do base44 e que nenhuma tela do original le ou escreve.
--
-- Por que nao sao apagadas agora:
--   a. Campo declarado na entidade pode ter valor no dado real, e a importacao
--      roda no fim do projeto, contra uma exportacao que ninguem viu ainda
--      (docs/SCHEMA-PLAN.md). Apagar a coluna antes disso e escolher perder o
--      dado sem nunca te-lo olhado - e o caminho de volta e outra migration MAIS
--      uma reimportacao.
--   b. Elas nao atrapalham: nascem nulas, nao entram em nenhuma soma e nao
--      entram na contagem de clipes das views abaixo (a do original tambem nao
--      as conta).
--
-- O que muda e o COMMENT: ele passa a dizer, sem rodeio, que nenhuma tela
-- DEVERIA usa-las, para ninguem concluir que sao o lugar dos PDFs de aprovacao.
-- Ja ha codigo tratando-as como anexo unico do item - ver o relatorio do modulo.

comment on column public.budget_checklist_items.budget_file_path is
  'CAMINHO do PDF de itens[].arquivo_orcamento_url dentro do bucket privado budget-files, no formato <tenant_id>/<checklist_id>/<uuid>.pdf. NAO e uma URL (guardar URL assinada cria link morto quando a assinatura expira; guardar URL publica e o problema que a 0052 existe para resolver).

ATENCAO, E ESTA E A PARTE QUE IMPORTA: esta coluna e ESPACO DE POUSO DA IMPORTACAO, e nao superficie de tela. arquivo_orcamento_url e declarado na entidade ChecklistOrcamento do base44 e NENHUMA tela do original le ou escreve - nem o formulario de item, nem o drawer, nem o detalhe do checklist. Ela existe aqui porque campo declarado pode ter valor no dado real que sera importado, e nao porque a tela nova deva preenche-la.

Os dois uploads que o original de fato usa sao OUTROS: o PDF por fornecedor cotado (budget_item_quotes.quote_file_path) e a LISTA de PDFs de aprovacao do cliente (budget_item_approval_files, 0054). Anexo de aprovacao NAO vai aqui - aqui cabe um arquivo so, sem nome de exibicao proprio nem data, e a tela mostra varios, cada um com nome e data. Se a UI nova quiser um anexo unico por item alem desses dois, isso e feature nova e decisao do usuario, nao fidelidade ao original.';

comment on column public.budget_checklist_items.budget_file_name is
  'Nome de exibicao do arquivo de budget_file_path, gravado junto com ele (o *_file_pair_check cobra os dois ou nenhum). Mesma ressalva da coluna irma: espaco de pouso da importacao de itens[].arquivo_orcamento_url, que nenhuma tela do original usa.';

-- A CONTAGEM DE CLIPES -----------------------------------------------------------
--
-- A tela conta anexos em TRES lugares, com a mesma formula escrita tres vezes:
--
--   ItemOrcamentoDrawer.jsx:84    por item, no cabecalho do drawer
--   ChecklistDetalhe.jsx:212      por item, na linha da lista
--   OrcamentoCliente.jsx:200      por checklist, no cartao da listagem
--
-- A formula e sempre a mesma: cotacoes COM pdf + PDFs de aprovacao. Sao dois
-- niveis (item e checklist), e por isso duas superficies:
--
--   budget_item_attachments   uma linha por item      (drawer e lista do detalhe)
--   budget_checklist_totals   ganha attachment_count  (cartao da listagem)
--
-- POR QUE O TOTAL DO CHECKLIST ENTRA NA VIEW QUE JA EXISTE, E NAO NUMA NOVA
--   O cartao de OrcamentoCliente.jsx que mostra o clipe e o MESMO que mostra
--   progresso e totais, e esses ja saem de budget_checklist_totals. View separada
--   seria uma segunda requisicao para um numero exibido ao lado dos outros - e,
--   pior, um segundo lugar de onde a mesma listagem le, que e como dois numeros
--   da mesma tela comecam a divergir.
--
-- POR QUE O NIVEL DE ITEM E VIEW PROPRIA, E NAO COLUNA DERIVADA NO ITEM
--   Mesmo criterio de todo o resto do projeto: contagem que a aplicacao grava so
--   esta certa enquanto toda escrita passar pelo mesmo caminho (0015, 0034, 0037,
--   0043, 0051). Aqui seria pior que nos outros casos, porque a contagem muda por
--   escrita em OUTRA tabela (a cotacao, o anexo) e nao na linha do item.
--
-- O ANEXO PROPRIO DO ITEM (budget_file_path) NAO ENTRA NA CONTA, de proposito: o
-- original nao o conta, porque nenhuma tela dele o preenche. Conta-lo faria o
-- clipe da tela nova mostrar um numero diferente do que o escritorio ve hoje, por
-- causa de um campo que so a importacao preenche.
--
-- SECURITY INVOKER nas duas: as policies valem para quem consulta. Sem isso a
-- view rodaria como o dono (postgres, que nao sofre RLS) e contaria anexo de
-- todos os escritorios.

create view public.budget_item_attachments
with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.checklist_id,

  -- Cotacao SEM arquivo nao conta: no original o filtro e
  -- `.filter(fc => fc.pdf_orcamento_url)`, e cotacao sem PDF e o estado normal
  -- de quem ainda vai receber o orcamento do fornecedor.
  coalesce(q.file_count, 0)::int as quote_file_count,
  coalesce(a.file_count, 0)::int as approval_file_count,
  (coalesce(q.file_count, 0) + coalesce(a.file_count, 0))::int as attachment_count

from public.budget_checklist_items i

-- Os dois lados vem PRE-AGREGADOS por item, e nao por join direto nas tabelas:
-- item com 2 cotacoes e 3 aprovacoes produziria 6 linhas num join cru, e a
-- contagem viraria o produto e nao a soma.
left join (
  select item_id, tenant_id, count(*) as file_count
  from public.budget_item_quotes
  where quote_file_path is not null
  group by item_id, tenant_id
) q on q.item_id = i.id and q.tenant_id = i.tenant_id

left join (
  select item_id, tenant_id, count(*) as file_count
  from public.budget_item_approval_files
  group by item_id, tenant_id
) a on a.item_id = i.id and a.tenant_id = i.tenant_id;

comment on view public.budget_item_attachments is
  'Quantos PDFs cada item de orcamento tem: os das cotacoes (so as que tem arquivo) mais os de aprovacao do cliente. E o numero do clipe que o original calcula no navegador em ItemOrcamentoDrawer.jsx:84 e ChecklistDetalhe.jsx:212 - a mesma formula escrita duas vezes la, uma vez aqui. Uma linha por item, sempre, inclusive para item sem anexo nenhum: zero, nunca nulo. NAO conta budget_checklist_items.budget_file_path, como o original tambem nao conta. SECURITY INVOKER.';

comment on column public.budget_item_attachments.quote_file_count is
  'Cotacoes deste item que TEM PDF anexado. Cotacao sem arquivo nao entra - e o mesmo filtro do original (`fc.pdf_orcamento_url`), e nao um detalhe: cotacao registrada antes de o fornecedor mandar o orcamento e o caminho normal da tela.';

comment on column public.budget_item_attachments.approval_file_count is
  'PDFs de aprovacao do cliente deste item (budget_item_approval_files). No original e o comprimento do array itens[].pdfs_aprovacao.';

-- budget_checklist_totals ganha attachment_count ---------------------------------
--
-- CREATE OR REPLACE, e nao DROP + CREATE: `drop view` LEVA O GRANT JUNTO, e foi
-- exatamente isso que aconteceu com project_progress entre a 0035 e a 0036 - a
-- view existia e ninguem podia ler. Replace preserva o privilegio; a coluna nova
-- entra no FIM da lista, que e a unica alteracao que o Postgres aceita sem drop.
-- O resto da definicao e identico ao da 0051, palavra por palavra.
--
-- O join novo e com budget_item_attachments, que ja vem com UMA linha por item -
-- por isso ele nao multiplica linha e nao estraga as somas de valor ao lado.

create or replace view public.budget_checklist_totals
with (security_invoker = true) as
select
  c.id as checklist_id,
  c.tenant_id,

  coalesce(count(i.id), 0)::int as item_count,

  coalesce(count(i.id) filter (where i.status in ('approved', 'cancelled')), 0)::int
    as completed_item_count,

  case
    when count(i.id) = 0 then 0
    else round(
      count(i.id) filter (where i.status in ('approved', 'cancelled')) * 100.0
      / count(i.id)
    )::int
  end as progress_percent,

  coalesce(sum(i.estimated_value), 0)::numeric(14, 2) as estimated_total,
  coalesce(sum(i.approved_value), 0)::numeric(14, 2) as approved_total,
  coalesce(sum(i.commission_value), 0)::numeric(14, 2) as commission_total,
  coalesce(sum(i.commission_value) filter (where i.commission_received), 0)::numeric(14, 2)
    as commission_received_total,

  round(
    coalesce(sum(i.approved_value), 0) * coalesce(c.curation_percent, 0) / 100, 2
  )::numeric(14, 2) as curation_total,

  coalesce(sum(f.attachment_count), 0)::int as attachment_count

from public.budget_checklists c
left join public.budget_checklist_items i
  on i.checklist_id = c.id and i.tenant_id = c.tenant_id
left join public.budget_item_attachments f
  on f.item_id = i.id and f.tenant_id = i.tenant_id
group by c.id, c.tenant_id, c.curation_percent;

comment on column public.budget_checklist_totals.attachment_count is
  'Total de PDFs do checklist: as cotacoes com arquivo mais os PDFs de aprovacao, somados sobre todos os itens. E o numero do clipe do cartao da listagem, que o original calcula no navegador com um reduce (OrcamentoCliente.jsx:200). Zero para checklist sem item, e nao nulo. NAO conta budget_checklist_items.budget_file_path - ver o cabecalho da 0054.';

-- anon NAO recebe nada: nenhuma tela deste modulo e publica. O grant de
-- budget_checklist_totals sobreviveu ao replace, e e reconcedido aqui de
-- proposito - custa nada e nao depende de ninguem lembrar da regra do drop.
grant select on public.budget_item_attachments to authenticated;
grant select on public.budget_checklist_totals to authenticated;
