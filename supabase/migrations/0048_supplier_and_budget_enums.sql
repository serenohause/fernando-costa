-- Modulo 8 (Fornecedores e Orcamento por Cliente) - enums de Fornecedor e
-- ChecklistOrcamento.
--
-- Mesma estrutura da 0001, 0014, 0021, 0028, 0031 e 0040: o que e infraestrutura
-- do modulo (tipos) vem em migration propria, antes das tabelas, para que a
-- migration das tabelas seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secoes "Fornecedores"
-- e "Orcamento". Rotulo em portugues vive na UI (src/lib/enums.ts), nunca no
-- banco.
--
-- O QUE JA ESTAVA NO ENUM-MAP E FOI SEGUIDO SEM MUDANCA
--   partnership_model, commission_payment_term, partnership_tier,
--   supplier_status, budget_checklist_status e o de/para de
--   ChecklistOrcamento.fase_projeto (subconjunto de project_phase, com
--   'Pos-aprovacao' entrando no enum compartilhado).
--
-- O QUE FOI ACRESCENTADO AO ENUM-MAP NESTA MIGRATION
--   budget_item_status (status do item do checklist) - o de/para nao existia.
--   E a extensao de supplier_category, explicada abaixo.
--
-- SUPPLIER_CATEGORY: UM ENUM, DOIS USOS, TRES LISTAS NO ORIGINAL
--   O base44 tem DUAS listas fechadas para a mesma ideia ("de que material se
--   trata"), e elas nao batem:
--
--     Fornecedor.tipologia          19 valores (tem Madeira, Elevadores e
--                                   Bombas e Filtros de Piscina)
--     ChecklistOrcamento.itens[].categoria
--                                   20 valores (nao tem os tres acima; tem
--                                   Revestimento de Fachada, Revestimento de
--                                   Piscina, Impermeabilizacao e Gesso e Drywall)
--
--   E o formulario de item (ItemOrcamentoForm.jsx:11) oferece uma TERCEIRA
--   lista, com 23 valores - a uniao das duas. Ou seja, o proprio formulario
--   oferece quatro categorias que a entidade recusa.
--
--   Isso importa porque ItemOrcamentoForm.jsx:45 sugere fornecedor comparando
--   `f.tipologia === form.categoria`: as duas listas sao comparadas entre si o
--   tempo todo. Dois enums independentes fariam a comparacao atravessar dois
--   tipos que ninguem garante alinhados.
--
--   Aqui e UM tipo com os 23 valores, na ordem em que o formulario de item os
--   exibe, e suppliers.category recorta os 19 por check - o mesmo desenho de
--   project_phase (finished so no projeto, 0031), priority_level (urgent so em
--   atividade, 0031) e payment_method (cash so a receber, 0040).
--
--   Consequencia registrada, e NAO corrigida aqui: item de categoria
--   'Impermeabilizacao' nunca tera fornecedor sugerido, porque fornecedor nenhum
--   pode ter essa tipologia. E o comportamento do original.

create type public.supplier_category as enum (
  'ceramics_porcelain',
  'fixtures_sanitaryware',
  'natural_stone',
  'indoor_lighting',
  'outdoor_lighting',
  'frames_openings',
  -- Os quatro abaixo (aqui e mais adiante) so existem em item de orcamento:
  -- Fornecedor.tipologia nao os lista, e o check de suppliers.category os barra.
  'facade_cladding',
  'pool_cladding',
  'home_automation',
  'solar_energy',
  'paint_texture',
  'landscaping',
  'cabinetry',
  'wood',
  'structure_foundation',
  'waterproofing',
  'drywall_plaster',
  'electrical_plumbing',
  'hvac',
  'glass_mirrors',
  'elevators',
  'pool_equipment',
  'other'
);

comment on type public.supplier_category is
  'Categoria de material/servico. COMPARTILHADO por suppliers.category (tipologia do fornecedor) e budget_checklist_items.category (categoria do item de orcamento) - o original compara os dois campos entre si para sugerir fornecedor (ItemOrcamentoForm.jsx:45). Os 23 valores sao a uniao das duas listas do base44, na ordem do formulario de item; facade_cladding, pool_cladding, waterproofing e drywall_plaster NAO valem para fornecedor e sao barrados por check em suppliers. De/para completo em docs/ENUM-MAP.md.';

create type public.partnership_model as enum (
  'sales_commission',
  'price_discount',
  'commission_and_discount',
  'spec_exclusivity',
  'none'
);

comment on type public.partnership_model is
  'Modelo de parceria comercial com o fornecedor. De/para: sales_commission=Comissao sobre venda, price_discount=Desconto no preco, commission_and_discount=Comissao + Desconto, spec_exclusivity=Exclusividade de especificacao, none=Sem parceria formal. O valor none e "sem parceria formal" declarado, e nao ausencia de informacao - fornecedor sobre o qual nada foi acordado tem a coluna NULA.';

create type public.commission_payment_term as enum (
  'on_delivery',
  'net_30_after_delivery',
  'net_60_after_delivery',
  'after_client_payment',
  'to_be_agreed'
);

comment on type public.commission_payment_term is
  'Quando a comissao e paga ao escritorio. De/para: on_delivery=Na entrega do material, net_30_after_delivery=30 dias apos entrega, net_60_after_delivery=60 dias apos entrega, after_client_payment=Apos pagamento do cliente, to_be_agreed=A combinar.';

create type public.partnership_tier as enum (
  'strategic',
  'preferred',
  'registered',
  'under_evaluation'
);

comment on type public.partnership_tier is
  'Nivel de relacionamento do fornecedor com o escritorio. De/para: strategic=Estrategico, preferred=Preferencial, registered=Cadastrado, under_evaluation=Em avaliacao. Required no original, com default Cadastrado.';

create type public.supplier_status as enum (
  'active',
  'inactive',
  'negotiating'
);

comment on type public.supplier_status is
  'Situacao do fornecedor. De/para: active=Ativo, inactive=Inativo, negotiating=Em negociacao. O botao Inativar/Reativar do drawer (FornecedorDrawer.jsx:134) alterna entre active e inactive; negotiating so entra pelo formulario.';

create type public.budget_checklist_status as enum (
  'open',
  'in_progress',
  'awaiting_client',
  'completed',
  'cancelled'
);

comment on type public.budget_checklist_status is
  'Status geral do checklist de orcamento. De/para: open=Aberto, in_progress=Em andamento, awaiting_client=Aguardando cliente, completed=Concluido, cancelled=Cancelado. Required no original, com default Aberto.';

-- budget_item_status: NAO estava em docs/ENUM-MAP.md, e foi acrescentado la
-- junto com esta migration. Os seis valores sao os de
-- ChecklistOrcamento.itens[].status_item, e a tela os repete em
-- ItemOrcamentoForm.jsx:118 e no mapa de cores de ChecklistDetalhe.jsx:17.
create type public.budget_item_status as enum (
  'pending',
  'quoting',
  'quoted',
  'presented_to_client',
  'approved',
  'cancelled'
);

comment on type public.budget_item_status is
  'Status do item do checklist de orcamento. De/para: pending=Pendente, quoting=Em cotacao, quoted=Cotado, presented_to_client=Apresentado ao cliente, approved=Aprovado, cancelled=Cancelado. E ele, e nao o campo concluido da entidade, que a tela usa para medir progresso: approved e cancelled contam como finalizados (ChecklistDetalhe.jsx:50).';

-- fase_projeto do checklist: subconjunto de project_phase ------------------------
--
-- docs/ENUM-MAP.md, secao "Orcamento": ChecklistOrcamento.fase_projeto nao gera
-- enum proprio - e um subconjunto de project_phase (Perspectivas, Projeto
-- Executivo, Projetos Complementares, Pos-aprovacao). Dos quatro, so
-- 'Pos-aprovacao' nao existia no tipo criado pela 0031, porque nem projects nem
-- tasks o oferecem.
--
-- O valor entra AQUI, e nao na migration das tabelas, por causa da regra do
-- Postgres: um valor de enum acrescentado nao pode ser USADO na mesma transacao
-- em que foi criado. Separando em duas migrations, o check da 0049 nunca corre o
-- risco - e, por seguranca dupla, esse check compara ::text e nao o proprio
-- rotulo do enum.
alter type public.project_phase add value if not exists 'post_approval';

-- Reescreve o COMMENT da 0031 para incluir o valor novo. Migration nova, e nao
-- edicao da 0031: migration aplicada nao se edita (docs/ARCHITECTURE.md).
comment on type public.project_phase is
  'Fase do projeto. De/para: not_started=Nao iniciado, briefing=Briefing, layout=Layout, renderings=Perspectivas, revision=Revisao, legal_permit=Projeto Legal, hoa_approval=Aprovacao Condominio, construction_docs=Projeto Executivo, engineering_docs=Projetos Complementares, building_permit=Alvara de Construcao, awaiting_client=Aguardando Cliente, finished=Finalizado, post_approval=Pos-aprovacao. COMPARTILHADO por tres colunas, cada uma com o seu recorte, e cada recorte e um check na propria tabela: tasks.phase nao aceita finished (0032) nem post_approval (0049); projects.current_phase nao aceita post_approval (0049); budget_checklists.project_phase aceita SO renderings, construction_docs, engineering_docs e post_approval (0049). post_approval entrou na 0048 e existe apenas para o checklist de orcamento, como registra docs/ENUM-MAP.md.';
