-- Modulo 8 (Fornecedores e Orcamento por Cliente) - suppliers, supplier_brands,
-- budget_checklists, budget_checklist_items e budget_item_quotes, de Fornecedor
-- (24 campos) e ChecklistOrcamento (16 campos, dois deles arrays aninhados).
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. OS TOTAIS NAO SAO COLUNAS. valor_total_estimado, valor_total_aprovado,
--      valor_total_comissao e curadoria_valor_total saem dos itens
--      (docs/SCHEMA-PLAN.md, modulo 8). No original sao campos soltos que a tela
--      recalcula e regrava a cada mexida em item (ChecklistDetalhe.jsx:65-75,
--      :83-86, :274-277) - e ela nem sempre regrava os tres: o botao "comissao
--      recebida" (:198) manda so valor_total_comissao, entao qualquer divergencia
--      dos outros dois fica gravada. Viram a view budget_checklist_totals (0051),
--      mesmo tratamento de project_progress (0034) e accounts_payable_status
--      (0043).
--
--   2. Os *_name saem e viram join, e NENHUM deles esta na lista de snapshots
--      intencionais de docs/SCHEMA-PLAN.md: client_name, project_name,
--      responsavel_orcamento_name, fornecedor_escolhido_nome,
--      responsavel_item_nome e o fornecedor_nome de cada cotacao. Desnormalizacao
--      pura do base44, que nao tem join - e aqui ela e pior que nos outros
--      modulos, porque o nome do fornecedor fica congelado DENTRO de um array
--      dentro de outro array, sem chance nenhuma de ser atualizado.
--
--   3. comissao_valor vira COLUNA GERADA. No original e a aplicacao que calcula
--      (ItemOrcamentoForm.jsx:79-83: valor_aprovado, ou valor_estimado, vezes o
--      percentual) e o valor so esta certo enquanto toda gravacao passar por
--      aquele formulario. Mudar o valor aprovado por qualquer outro caminho
--      deixa a comissao mentindo, e ela e somada no rodape e no relatorio. Mesmo
--      raciocinio de activities.total_minutes (0037) e dos campos de deduplicacao
--      do CRM (0015).
--
--   4. fornecedores_cotados[].escolhido NAO e portado. O formulario grava sempre
--      false (ItemOrcamentoForm.jsx:68) e nenhuma tela o le: quem decide qual
--      cotacao venceu e a comparacao fc.fornecedor_id ===
--      item.fornecedor_escolhido_id (ItemOrcamentoDrawer.jsx:146). Coluna que
--      nasce sempre falsa e que ja tem quem responda por ela e superficie sem
--      dono - mesmo criterio que deixou responsible_id fora do modulo 7 (0041).
--
--   5. itens[].concluido NAO e portado, pelo mesmo motivo: declarado com default
--      false, nenhuma tela le ou escreve, e o que a tela usa para dizer que um
--      item acabou e status_item in (Aprovado, Cancelado) (ChecklistDetalhe.jsx
--      :50 e OrcamentoCliente.jsx:194). Duas bandeiras para o mesmo fato e
--      convite a divergencia.
--
--   6. DOIS campos que a tela usa e a entidade NAO declara entram como coluna:
--      itens[].comissao_recebida (ChecklistDetalhe.jsx:55 e :195, soma "Comissao
--      Recebida" do rodape) e o par pdf_orcamento_url/pdf_orcamento_nome de cada
--      fornecedor cotado (ItemOrcamentoDrawer.jsx:46-48). Sao campos que o
--      base44 aceita por ser schemaless na pratica; aqui precisam existir ou a
--      tela perde funcionalidade que hoje esta no ar.
--
--   7. O upload vira CAMINHO de objeto em bucket PRIVADO, nao URL publica. Ver a
--      migration 0052 e o COMMENT das colunas *_file_path.
--
--   8. Os checks que o original nao tem: percentual fora de 0-100, valor
--      negativo, data de aprovacao em item que o cliente nao aprovou, conclusao
--      antes do inicio, arquivo com caminho e sem nome. Todos sao estados que o
--      base44 aceita hoje.
--
-- O QUE FICOU ESTRANHO NO ORIGINAL E NAO FOI CORRIGIDO AQUI (esta reportado ao
-- usuario, e a decisao e dele):
--
--   a. atende_fora_fortaleza e o default cidade=Fortaleza / estado=CE. O
--      escritorio e de Goiania (docs/ARCHITECTURE.md). O nome da coluna foi
--      mantido literal - ver o COMMENT de serves_outside_fortaleza.
--   b. itens[].valor_estimado e somado no rodape e exibido no drawer, mas o
--      formulario de item NAO TEM campo para ele (ItemOrcamentoForm.jsx). Hoje
--      so a importacao consegue preenche-lo.
--   c. A lista de tipologias do filtro da tela de Fornecedores
--      (Fornecedores.jsx:27) NAO e a lista da entidade: ela oferece quatro
--      categorias que fornecedor nenhum pode ter e esconde tres que existem.

-- suppliers ---------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os quatro campos que o original marca como required.
  name text not null,
  category public.supplier_category not null,
  contact_whatsapp text not null,
  partnership_tier public.partnership_tier not null default 'registered',

  contact_name text,
  contact_email extensions.citext,
  phone text,
  website text,

  address text,
  city text,
  state text,

  has_showroom boolean not null default false,
  serves_outside_fortaleza boolean not null default false,

  partnership_model public.partnership_model,
  commission_percent numeric(5, 2),
  commission_payment_term public.commission_payment_term,
  standard_discount_percent numeric(5, 2),
  average_delivery_time text,

  status public.supplier_status not null default 'active',
  notes text,
  last_order_date date,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint suppliers_id_tenant_id_key unique (id, tenant_id),
  constraint suppliers_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint suppliers_name_not_blank_check check (btrim(name) <> ''),
  constraint suppliers_contact_whatsapp_not_blank_check check (btrim(contact_whatsapp) <> ''),

  -- Os quatro valores que so existem em item de orcamento (ver 0048). Escrito
  -- como <> all(...) e nao com o enum literal por simetria com os outros dois
  -- checks de recorte deste modulo.
  constraint suppliers_category_domain_check
    check (category::text <> all (array['facade_cladding', 'pool_cladding',
                                        'waterproofing', 'drywall_plaster'])),

  constraint suppliers_commission_percent_range_check
    check (commission_percent is null
           or (commission_percent >= 0 and commission_percent <= 100)),
  constraint suppliers_standard_discount_percent_range_check
    check (standard_discount_percent is null
           or (standard_discount_percent >= 0 and standard_discount_percent <= 100))
);

comment on table public.suppliers is
  'Cadastro de fornecedores e parceiros do escritorio, de Fornecedor do base44. Alimenta duas coisas: a tela Fornecedores e o seletor de fornecedor dos itens de orcamento (modulo 8, mesmo modulo). NAO tem ligacao com accounts_payable.supplier_name (modulo 7), que continua texto livre de proposito - a maior parte das despesas do escritorio (folha, impostos, aluguel) nao tem fornecedor cadastrado. Se um dia a tela de pagamentos quiser escolher da lista, entra supplier_id ao lado do texto, e a decisao fica registrada la.';

comment on column public.suppliers.category is
  'Tipologia do fornecedor. Enum supplier_category, COMPARTILHADO com budget_checklist_items.category, com check barrando os quatro valores que so valem para item de orcamento (ver 0048). O compartilhamento existe porque o original compara os dois campos entre si para sugerir fornecedor por categoria (ItemOrcamentoForm.jsx:45).';

comment on column public.suppliers.contact_whatsapp is
  'WhatsApp do contato comercial, NOT NULL como no original (required na entidade e no formulario). E por ele que o drawer monta o link wa.me (FornecedorDrawer.jsx:38), e e a unica forma de contato obrigatoria - o escritorio negocia por WhatsApp.';

comment on column public.suppliers.city is
  'Cidade do showroom. SEM DEFAULT, ao contrario do original, que traz "Fortaleza" na entidade e no formulario (FornecedorForm.jsx:23). Nao e correcao silenciosa de dado: e a recusa de gravar Fortaleza em fornecedor de um escritorio de Goiania toda vez que alguem deixar o campo em branco. Se o usuario quiser um default de cidade, ele entra depois, com a cidade certa. A pre-selecao do formulario e decisao da UI e esta reportada.';

comment on column public.suppliers.serves_outside_fortaleza is
  'Atende projetos fora de Fortaleza. NOME MANTIDO LITERAL, e ele e estranho: o escritorio deste projeto e de Goiania (docs/ARCHITECTURE.md), e o campo so faz sentido para quem opera no Ceara. Renomear para algo como serves_other_cities mudaria o SIGNIFICADO do dado que sera importado (hoje ele responde "atende fora de Fortaleza", nao "atende fora da sede"), e essa e decisao do usuario, nao do schema. Fica reportado e inalterado.';

comment on column public.suppliers.commission_percent is
  'Percentual de comissao acordado. Copiado para o item de orcamento no momento em que o fornecedor e escolhido (ItemOrcamentoForm.jsx:55) - la e snapshot de negociacao, aqui e o acordo vigente; por isso os dois existem e podem divergir de propósito.';

comment on column public.suppliers.standard_discount_percent is
  'Desconto padrao negociado para clientes do escritorio. Exibido no drawer e na listagem, mas o formulario do original NAO tem campo para ele (FornecedorForm.jsx) - hoje so a importacao o preenche. Mesmo caso de commission_payment_term, average_delivery_time e last_order_date.';

comment on column public.suppliers.last_order_date is
  'Data do ultimo pedido. Exibida na secao Metricas do drawer e escrita por nenhuma tela do original. Coluna simples, e nao derivada: o sistema nao tem entidade de pedido de onde deriva-la.';

comment on column public.suppliers.legacy_id is
  'Id da linha de Fornecedor no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

-- Indices. A tela lista tudo e filtra por tipologia, nivel de parceria e status,
-- com busca livre por nome e marca (Fornecedores.jsx:120-130).
create index suppliers_tenant_id_name_idx on public.suppliers (tenant_id, name);
create index suppliers_tenant_id_category_idx on public.suppliers (tenant_id, category);
create index suppliers_tenant_id_status_idx on public.suppliers (tenant_id, status);
create index suppliers_tenant_id_partnership_tier_idx on public.suppliers (tenant_id, partnership_tier);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- supplier_brands ----------------------------------------------------------------
--
-- Substitui o array Fornecedor.marcas_representadas, como manda
-- docs/SCHEMA-PLAN.md (modulo 8). Mesmo tratamento que a 0022 deu a
-- Negociacao.tipo_servico e a 0032 aos quatro arrays de Project e Task.

create table public.supplier_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  supplier_id uuid not null,

  name text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint supplier_brands_id_tenant_id_key unique (id, tenant_id),
  constraint supplier_brands_supplier_id_name_key unique (supplier_id, name),

  constraint supplier_brands_name_not_blank_check check (btrim(name) <> '')
);

alter table public.supplier_brands
  add constraint supplier_brands_supplier_id_fkey
  foreign key (supplier_id, tenant_id)
  references public.suppliers (id, tenant_id)
  on delete cascade;

comment on table public.supplier_brands is
  'Marcas representadas por um fornecedor, uma por linha. Substitui o array Fornecedor.marcas_representadas. ON DELETE CASCADE de proposito: e parte do fornecedor, nao entidade propria. SEM legacy_id, como project_checklist_items (0032) e negotiation_services (0022) - no base44 estas marcas vivem dentro da linha de Fornecedor e nao tem id proprio; a chave natural (fornecedor + marca) e o que torna a reimportacao idempotente.';

comment on constraint supplier_brands_supplier_id_name_key on public.supplier_brands is
  'A mesma marca nao aparece duas vezes no mesmo fornecedor. O original nao impede: addMarca (FornecedorForm.jsx:42) empurra no array sem olhar o que ja esta la, e a busca por marca da tela passa a casar o mesmo fornecedor por duas razoes iguais.';

-- A busca da tela varre nome de fornecedor E marca (Fornecedores.jsx:124), e a
-- listagem mostra as duas primeiras marcas de cada linha - sempre por fornecedor.
create index supplier_brands_tenant_id_supplier_id_idx
  on public.supplier_brands (tenant_id, supplier_id);

create index supplier_brands_tenant_id_name_idx
  on public.supplier_brands (tenant_id, name);

create trigger supplier_brands_set_updated_at
  before update on public.supplier_brands
  for each row execute function public.set_updated_at();

-- budget_checklists ---------------------------------------------------------------

create table public.budget_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- required no original, e o formulario tambem exige.
  client_id uuid not null,
  status public.budget_checklist_status not null default 'open',

  -- required na entidade, NULLABLE aqui: ver o COMMENT da coluna.
  project_id uuid,

  responsible_id uuid,

  project_phase public.project_phase,

  notes text,
  start_date date,
  completion_date date,

  curation_percent numeric(5, 2),

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_checklists_id_tenant_id_key unique (id, tenant_id),
  constraint budget_checklists_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  -- Subconjunto de project_phase (docs/ENUM-MAP.md, secao Orcamento). Comparado
  -- como texto de proposito: post_approval nasceu na 0048 e valor de enum novo
  -- nao pode ser usado na mesma transacao em que foi criado - a forma ::text
  -- deixa este check imune a isso se um dia as duas migrations rodarem juntas.
  constraint budget_checklists_project_phase_domain_check
    check (project_phase is null
           or project_phase::text = any (array['renderings', 'construction_docs',
                                               'engineering_docs', 'post_approval'])),

  constraint budget_checklists_curation_percent_range_check
    check (curation_percent is null
           or (curation_percent >= 0 and curation_percent <= 100)),

  constraint budget_checklists_completion_not_before_start_check
    check (completion_date is null or start_date is null
           or completion_date >= start_date)
);

alter table public.budget_checklists
  add constraint budget_checklists_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

alter table public.budget_checklists
  add constraint budget_checklists_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id);

alter table public.budget_checklists
  add constraint budget_checklists_responsible_id_fkey
  foreign key (responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.budget_checklists is
  'Checklist de orcamento de materiais de um cliente/projeto, de ChecklistOrcamento do base44. A linha e so o cabecalho: os itens estao em budget_checklist_items e as cotacoes em budget_item_quotes, porque no original as duas coisas sao arrays aninhados dentro desta mesma linha. Os quatro totais NAO estao aqui - sao a view budget_checklist_totals (0051).';

comment on column public.budget_checklists.project_id is
  'Projeto ao qual o orcamento pertence. A entidade do base44 o marca como required, mas o formulario oferece "Nenhum" (ChecklistForm.jsx:75) e a listagem exibe "Sem projeto vinculado" (OrcamentoCliente.jsx:215) - ou seja, o required nunca valeu na pratica. NULLABLE aqui, seguindo o que as telas fazem e nao o que a entidade declara: cliente pode pedir orcamento de material antes de haver projeto aberto. FK composta com tenant_id porque a RLS filtra o que se le, nao o que se aponta.';

comment on column public.budget_checklists.client_id is
  'Cliente do orcamento, NOT NULL - required na entidade e no formulario. Substitui o par client_id + client_name do original: o nome sai de join com clients, e nao e snapshot (docs/SCHEMA-PLAN.md, "Snapshots intencionais", nao lista nada deste modulo).';

comment on column public.budget_checklists.responsible_id is
  'Coordenador responsavel pelo orcamento. Substitui responsavel_orcamento_id + responsavel_orcamento_name. FK composta para collaborators.';

comment on column public.budget_checklists.project_phase is
  'Fase do projeto em que o orcamento foi solicitado. Enum project_phase (0031) recortado por check aos quatro valores que o original oferece, com post_approval acrescentado ao tipo na 0048. NAO e o mesmo dado que projects.current_phase: descreve quando o orcamento foi pedido, e nao onde o projeto esta agora.';

comment on column public.budget_checklists.completion_date is
  'Data de conclusao do checklist. Declarada na entidade e escrita por nenhuma tela do original - fica para a UI nova decidir se preenche ao mudar o status para completed. O unico check e coerencia com start_date; amarra-la ao status completed seria inventar regra que o original nao tem e travar importacao de linha antiga.';

comment on column public.budget_checklists.curation_percent is
  'Percentual de curadoria cobrado do cliente neste projeto. O VALOR de curadoria (curadoria_valor_total no original) NAO e coluna: sai da view budget_checklist_totals (0051), aplicado sobre o total aprovado. No original ele e campo solto que nenhuma tela calcula nem preenche - existe na entidade e nasce sempre nulo.';

comment on column public.budget_checklists.legacy_id is
  'Id da linha de ChecklistOrcamento no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

-- Indices. A listagem carrega tudo ordenado por criacao decrescente
-- (OrcamentoCliente.jsx:53) e filtra por status, responsavel e fase (:101-108).
create index budget_checklists_tenant_id_created_at_idx
  on public.budget_checklists (tenant_id, created_at desc);

create index budget_checklists_tenant_id_status_idx
  on public.budget_checklists (tenant_id, status);

create index budget_checklists_tenant_id_client_id_idx
  on public.budget_checklists (tenant_id, client_id);

create index budget_checklists_tenant_id_project_id_idx
  on public.budget_checklists (tenant_id, project_id)
  where project_id is not null;

create index budget_checklists_tenant_id_responsible_id_idx
  on public.budget_checklists (tenant_id, responsible_id)
  where responsible_id is not null;

create trigger budget_checklists_set_updated_at
  before update on public.budget_checklists
  for each row execute function public.set_updated_at();

-- budget_checklist_items -----------------------------------------------------------
--
-- Substitui o array ChecklistOrcamento.itens.

create table public.budget_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  checklist_id uuid not null,

  name text not null,
  description text,

  category public.supplier_category,

  responsible_id uuid,
  due_date date,

  status public.budget_item_status not null default 'pending',
  priority public.priority_level not null default 'medium',

  estimated_value numeric(14, 2),
  approved_value numeric(14, 2),

  chosen_supplier_id uuid,
  commission_percent numeric(5, 2),

  -- DERIVADA. Ver o ponto 3 do cabecalho e o COMMENT da coluna.
  commission_value numeric(14, 2) generated always as (
    case
      when commission_percent is null then null
      else round(coalesce(approved_value, estimated_value) * commission_percent / 100, 2)
    end
  ) stored,

  commission_received boolean not null default false,

  client_approved boolean not null default false,
  approval_date date,

  is_required boolean not null default true,

  -- Caminho do objeto no bucket privado budget-files (0052), NAO uma URL.
  budget_file_path text,
  budget_file_name text,

  notes text,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_checklist_items_id_tenant_id_key unique (id, tenant_id),
  constraint budget_checklist_items_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint budget_checklist_items_name_not_blank_check check (btrim(name) <> ''),

  constraint budget_checklist_items_estimated_value_not_negative_check
    check (estimated_value is null or estimated_value >= 0),
  constraint budget_checklist_items_approved_value_not_negative_check
    check (approved_value is null or approved_value >= 0),
  constraint budget_checklist_items_commission_percent_range_check
    check (commission_percent is null
           or (commission_percent >= 0 and commission_percent <= 100)),

  -- Data de aprovacao sem aprovacao e um item que consta como aprovado no
  -- relatorio por periodo e nao aprovado na tela. O original aceita os dois
  -- soltos - mesma familia do check de payment_date do modulo 7 (0041), so que
  -- em um sentido: aqui a aprovacao SEM data continua valida, porque o original
  -- marca aprovado_cliente e nunca preenche data_aprovacao.
  constraint budget_checklist_items_approval_date_requires_approval_check
    check (approval_date is null or client_approved),

  -- Arquivo tem caminho e nome, ou nao tem nada. Caminho sem nome deixa a tela
  -- com um anexo que ela nao sabe rotular; nome sem caminho e um anexo que nao
  -- abre.
  constraint budget_checklist_items_file_pair_check
    check ((budget_file_path is null) = (budget_file_name is null))
);

alter table public.budget_checklist_items
  add constraint budget_checklist_items_checklist_id_fkey
  foreign key (checklist_id, tenant_id)
  references public.budget_checklists (id, tenant_id)
  on delete cascade;

alter table public.budget_checklist_items
  add constraint budget_checklist_items_responsible_id_fkey
  foreign key (responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.budget_checklist_items
  add constraint budget_checklist_items_chosen_supplier_id_fkey
  foreign key (chosen_supplier_id, tenant_id)
  references public.suppliers (id, tenant_id);

comment on table public.budget_checklist_items is
  'Item do checklist de orcamento (um material ou servico a orcar), um por linha. Substitui o array ChecklistOrcamento.itens. ON DELETE CASCADE do checklist: no original os itens sao parte do documento e somem com ele. TEM legacy_id, ao contrario das outras tabelas-filhas do projeto, porque no base44 cada item ja carrega um id proprio (itens[].item_id, gerado no navegador por ChecklistDetalhe.jsx:12) e e por ele que a importacao vai reconstruir as cotacoes aninhadas.';

comment on column public.budget_checklist_items.category is
  'Categoria do material/servico. Enum supplier_category, compartilhado com suppliers.category (ver 0048): e a comparacao entre os dois que sugere fornecedor para o item. NULLABLE apesar de o formulario marcar o campo com asterisco - a tela agrupa por `item.categoria || "Outros"` (ChecklistDetalhe.jsx:42), ou seja, o proprio original conta com item sem categoria.';

comment on column public.budget_checklist_items.estimated_value is
  'Valor estimado do item. ATENCAO: no original ele e somado no rodape (ChecklistDetalhe.jsx:52), exibido no drawer e na lista, e o formulario de item NAO TEM campo para preenche-lo (ItemOrcamentoForm.jsx: ha input para valor_aprovado, nao para valor_estimado). Ou seja, "Total Estimado" hoje so pode vir da importacao. A coluna entra como esta; a decisao de dar um campo a ela na UI e do usuario.';

comment on column public.budget_checklist_items.commission_value is
  'Valor da comissao prevista, CALCULADO PELO BANCO: o valor aprovado (ou, na falta dele, o estimado) vezes o percentual, arredondado a centavo. Coluna gerada, nao gravavel. No original a conta e feita no formulario (ItemOrcamentoForm.jsx:79-83) e gravada como campo solto - alterar o valor aprovado por qualquer outro caminho deixa a comissao mentindo, e ela e somada no rodape do checklist e no total do fornecedor. Nula quando nao ha percentual acordado, e nao zero: "nao ha comissao combinada" e diferente de "a comissao e zero".';

comment on column public.budget_checklist_items.commission_received is
  'A comissao deste item ja foi recebida pelo escritorio. NAO e declarado na entidade do base44, mas a tela grava e soma (ChecklistDetalhe.jsx:195 alterna, :55 soma o rodape "Comissao Recebida"). Sem esta coluna, a funcionalidade que hoje esta no ar se perde.';

comment on column public.budget_checklist_items.chosen_supplier_id is
  'Fornecedor aprovado pelo cliente para este item. Substitui fornecedor_escolhido_id + fornecedor_escolhido_nome. E TAMBEM quem responde qual cotacao venceu: budget_item_quotes nao tem bandeira propria, porque a do original nunca e escrita (ver ponto 4 do cabecalho). FK composta para suppliers.';

comment on column public.budget_checklist_items.commission_percent is
  'Percentual de comissao deste item. Nasce copiado de suppliers.commission_percent quando o fornecedor e escolhido (ItemOrcamentoForm.jsx:55) e depois vive sozinho: e o que foi combinado NESTE orcamento, e nao o acordo vigente com o fornecedor.';

comment on column public.budget_checklist_items.is_required is
  'Item obrigatorio para a obra (itens[].obrigatorio, default true na entidade). Nenhuma tela do original le ou escreve - entra porque tem significado de negocio proprio e porque project_checklist_items (0032) ja carrega a mesma ideia. Diferente de itens[].concluido, que NAO foi portado por ser bandeira duplicada de status.';

comment on column public.budget_checklist_items.budget_file_path is
  'CAMINHO do PDF de orcamento deste item dentro do bucket privado budget-files, no formato <tenant_id>/<checklist_id>/<uuid>.pdf. NAO e uma URL. Guardar URL assinada no banco cria link morto: a assinatura expira (uma hora, por padrao) e a coluna passa a apontar para um endereco que devolve erro, sem que nada acuse. Guardar URL PUBLICA seria pior - ver o cabecalho da 0052. A tela pede uma URL assinada na hora de abrir o arquivo, a partir deste caminho. Corresponde a itens[].arquivo_orcamento_url do original, que e declarado na entidade e nenhuma tela usa: o upload que existe de fato e por fornecedor cotado (budget_item_quotes.quote_file_path).';

comment on column public.budget_checklist_items.legacy_id is
  'itens[].item_id da linha de ChecklistOrcamento no base44 (uuid gerado no navegador), preenchido so pela importacao. E a chave por onde as cotacoes aninhadas serao religadas ao item certo.';

comment on constraint budget_checklist_items_approval_date_requires_approval_check on public.budget_checklist_items is
  'Data de aprovacao exige aprovacao do cliente. Um sentido so, de proposito: o original marca aprovado_cliente e nunca preenche data_aprovacao, entao exigir a data quebraria o caminho que ja existe. O que se impede e o inverso - item com data de aprovacao que a tela mostra como nao aprovado.';

-- Indices. A tela carrega os itens de UM checklist e os agrupa por categoria; os
-- outros dois recortes que existem sao por fornecedor escolhido (total de
-- comissao do fornecedor, view da 0051) e por responsavel.
create index budget_checklist_items_tenant_id_checklist_id_idx
  on public.budget_checklist_items (tenant_id, checklist_id);

create index budget_checklist_items_tenant_id_status_idx
  on public.budget_checklist_items (tenant_id, status);

create index budget_checklist_items_tenant_id_chosen_supplier_id_idx
  on public.budget_checklist_items (tenant_id, chosen_supplier_id)
  where chosen_supplier_id is not null;

create index budget_checklist_items_tenant_id_responsible_id_idx
  on public.budget_checklist_items (tenant_id, responsible_id)
  where responsible_id is not null;

create trigger budget_checklist_items_set_updated_at
  before update on public.budget_checklist_items
  for each row execute function public.set_updated_at();

-- budget_item_quotes ---------------------------------------------------------------
--
-- A tabela que o plano do modulo 8 nao nomeia: ela e consequencia de achatar o
-- documento. No original, fornecedores_cotados e um array DENTRO de cada item,
-- que por sua vez esta dentro do array de itens do checklist - dois niveis de
-- aninhamento numa linha so.
--
-- O que a leitura de ItemOrcamentoForm.jsx e ItemOrcamentoDrawer.jsx mostra que
-- uma cotacao e, na pratica: um fornecedor, um valor, uma observacao e um PDF
-- (com nome de arquivo). "escolhido" nao entra - ver o ponto 4 do cabecalho.

create table public.budget_item_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null,

  supplier_id uuid not null,

  value numeric(14, 2),
  notes text,

  -- Caminho do objeto no bucket privado budget-files (0052), NAO uma URL.
  quote_file_path text,
  quote_file_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_item_quotes_id_tenant_id_key unique (id, tenant_id),
  constraint budget_item_quotes_item_id_supplier_id_key unique (item_id, supplier_id),

  constraint budget_item_quotes_value_not_negative_check
    check (value is null or value >= 0),

  constraint budget_item_quotes_file_pair_check
    check ((quote_file_path is null) = (quote_file_name is null))
);

alter table public.budget_item_quotes
  add constraint budget_item_quotes_item_id_fkey
  foreign key (item_id, tenant_id)
  references public.budget_checklist_items (id, tenant_id)
  on delete cascade;

-- SEM on delete: apagar um fornecedor que ja cotou item de cliente falha de
-- proposito, como em contracts/accounts_receivable (0041). A tela de Fornecedores
-- oferece "Excluir" (Fornecedores.jsx:294) e, no original, essa exclusao deixa o
-- nome do fornecedor congelado dentro do array e o id apontando para o nada.
-- Aqui ela e barrada, e a tela precisa dizer por que - e ja existe o caminho
-- certo para o caso, que e o botao Inativar ao lado.
alter table public.budget_item_quotes
  add constraint budget_item_quotes_supplier_id_fkey
  foreign key (supplier_id, tenant_id)
  references public.suppliers (id, tenant_id);

comment on table public.budget_item_quotes is
  'Cotacao de um fornecedor para um item do checklist de orcamento. Substitui o array itens[].fornecedores_cotados, que no original e um array DENTRO de outro array. ON DELETE CASCADE do item (a cotacao e parte dele) e SEM cascade do fornecedor (apagar fornecedor cotado precisa ser decisao explicita). SEM legacy_id, como supplier_brands: no base44 a cotacao nao tem id proprio, e a chave natural (item + fornecedor) e o que torna a reimportacao idempotente.';

comment on column public.budget_item_quotes.supplier_id is
  'Fornecedor que cotou. NOT NULL: o original exige escolher da lista para adicionar a cotacao (ItemOrcamentoForm.jsx:65 sai fora sem fornecedor_id). Substitui o par fornecedor_id + fornecedor_nome - e o nome congelado dentro de um array aninhado e a copia mais dificil de manter do sistema inteiro.';

comment on column public.budget_item_quotes.value is
  'Valor cotado. NULLABLE porque o formulario permite adicionar a cotacao antes de ter o preco (o campo de valor nao e obrigatorio, ItemOrcamentoForm.jsx:216). >= 0, e nao > 0: cotacao de cortesia com valor zero e informacao legitima, diferente de parcela de zero real (modulo 7).';

comment on column public.budget_item_quotes.quote_file_path is
  'CAMINHO do PDF do orcamento deste fornecedor dentro do bucket privado budget-files, no formato <tenant_id>/<checklist_id>/<uuid>.pdf. NAO e uma URL - o mesmo raciocinio do COMMENT de budget_checklist_items.budget_file_path. Corresponde a fornecedores_cotados[].pdf_orcamento_url, que a tela grava (ItemOrcamentoDrawer.jsx:46) mas a entidade do base44 nao declara. E ESTE o upload que o sistema realmente usa.';

comment on column public.budget_item_quotes.quote_file_name is
  'Nome do arquivo como o usuario o enviou, para a tela ter o que exibir (fornecedores_cotados[].pdf_orcamento_nome). O nome real do objeto no bucket e um uuid, de proposito: nome de arquivo escolhido por quem envia nao entra em caminho de storage.';

comment on constraint budget_item_quotes_item_id_supplier_id_key on public.budget_item_quotes is
  'Um fornecedor cota um item uma vez. O original nao impede duas cotacoes do mesmo fornecedor no mesmo item, e quando isso acontece o drawer marca as DUAS como "Escolhido" - ele decide comparando fc.fornecedor_id com item.fornecedor_escolhido_id (ItemOrcamentoDrawer.jsx:146), sem desempate. Cotacao revisada substitui a anterior, e nao convive com ela.';

create index budget_item_quotes_tenant_id_item_id_idx
  on public.budget_item_quotes (tenant_id, item_id);

create index budget_item_quotes_tenant_id_supplier_id_idx
  on public.budget_item_quotes (tenant_id, supplier_id);

create trigger budget_item_quotes_set_updated_at
  before update on public.budget_item_quotes
  for each row execute function public.set_updated_at();

-- O RECORTE DE post_approval NAS TABELAS DOS MODULOS 5 E 6 ------------------------
--
-- project_phase ganhou um valor na 0048, e enum compartilhado sem check e enum
-- que vaza: sem os dois checks abaixo, projects.current_phase e tasks.phase
-- passariam a aceitar 'post_approval', que nenhuma das duas telas oferece e que o
-- calculo de progresso (project_progress, 0034/0035) nao sabe pontuar.
--
-- Mesmo desenho do check que ja impede tasks.phase = 'finished' (0032). Comparado
-- como texto pelo motivo explicado no check de budget_checklists acima.

alter table public.projects
  add constraint projects_current_phase_domain_check
  check (current_phase is null or current_phase::text <> 'post_approval');

alter table public.tasks
  add constraint tasks_phase_no_post_approval_check
  check (phase is null or phase::text <> 'post_approval');

comment on constraint projects_current_phase_domain_check on public.projects is
  'post_approval entrou em project_phase na 0048 para o checklist de orcamento e nao vale para projeto: nao esta no kanban do original nem tem percentual na view project_progress. Enum compartilhado sem check e enum que vaza.';

comment on constraint tasks_phase_no_post_approval_check on public.tasks is
  'O segundo recorte de tasks.phase, ao lado do que barra finished (0032). Mesmo motivo: post_approval so existe para budget_checklists.';

-- RLS AINDA NAO EXISTE NESTAS CINCO TABELAS.
--
-- Esta migration nao cria policy nem GRANT. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, elas nascem sem privilegio algum para anon e
-- authenticated, ou seja, invisiveis pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela ficar exposta.
-- Precisa dos dois. A 0050 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades, por tabela.
--
-- Recorte esperado: colaborador active do tenant le; escrita por
-- can_edit_menu('suppliers') em suppliers e supplier_brands, e
-- can_edit_menu('client_budget') nas tres tabelas do orcamento. As duas chaves
-- sao itens separados da sidebar do original (Layout.jsx:343-344) e existem em
-- menus desde a 0004.
