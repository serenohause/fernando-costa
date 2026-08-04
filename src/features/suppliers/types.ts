import type { Tables } from '@/lib/database.types'
import type {
  CommissionPaymentTerm,
  PartnershipModel,
  PartnershipTier,
  SupplierCategory,
  SupplierStatus,
  SupplierTypology,
} from '@/lib/enums'

export type Supplier = Tables<'suppliers'>
export type SupplierBrand = Tables<'supplier_brands'>

/*
  A MARCA COMO A TELA A USA: só o rótulo, mais o id para a chave da lista.

  No original `marcas_representadas` é um array de texto dentro da linha do
  fornecedor (migration 0049). Aqui é `supplier_brands`, uma linha por marca, e a
  tela continua vendo uma lista de nomes — a listagem mostra as duas primeiras
  (Fornecedores.jsx:231) e o drawer mostra todas (FornecedorDrawer.jsx:71).
*/
export type BrandRef = { id: string; name: string }

/*
  O fornecedor como as duas telas o leem: a linha mais as marcas, numa consulta
  só. O nome do relacionamento é o da CONSTRAINT porque a FK é composta
  `(supplier_id, tenant_id)`.
*/
export type SupplierRow = Supplier & {
  brands: BrandRef[]
}

/*
  POR QUE NÃO `Tables<'supplier_commission_totals'>` DIRETO — mesma razão do
  módulo 7: o gerador marca toda coluna de view como anulável porque o Postgres
  não declara nulidade através de uma view, e esta devolve `coalesce(...)` em
  tudo (migration 0051). Uma linha por fornecedor, zero para quem nunca foi
  escolhido, nunca nulo.
*/
export type SupplierCommissionTotals = {
  supplier_id: string
  tenant_id: string
  /* Itens de orçamento em que este fornecedor foi o ESCOLHIDO. */
  chosen_item_count: number
  /* Comissão prevista somada, recebida ou não. */
  commission_total: number
  /* O "Total Comissão Recebida" do drawer (FornecedorDrawer.jsx:107), que no
     original é campo da entidade que tela nenhuma preenche. */
  commission_received_total: number
}

/*
  O que o formulário de fornecedor edita (FornecedorForm.jsx).

  FORA DAQUI:

  - `tenant_id` — vem do claim da sessão, escrito pelo hook.
  - `legacy_id` — só a importação preenche.
  - `total_comissao_recebida` — deixou de ser campo: é a view
    `supplier_commission_totals` (migration 0051). O formulário do original tem o
    campo no estado (FornecedorForm.jsx:28) e nenhum input para ele.

  `brands` NÃO é coluna: é a lista de `supplier_brands` que a gravação sincroniza
  junto, porque a tela edita as marcas dentro do mesmo formulário do fornecedor.

  `category` é `SupplierTypology`, e não `SupplierCategory`: os quatro valores que
  só valem para item de orçamento são barrados por
  `suppliers_category_domain_check` (migration 0049).

  QUATRO CAMPOS QUE A COLUNA TEM E O FORMULÁRIO DO ORIGINAL NÃO OFERECE —
  `standard_discount_percent`, `commission_payment_term`, `average_delivery_time`
  e `last_order_date` (migration 0049). Eles entram aqui como opcionais porque a
  listagem e o drawer os EXIBEM; dar-lhes um input é decisão do usuário, e até lá
  o formulário simplesmente não os manda.
*/
export type SupplierInput = {
  name: string
  category: SupplierTypology
  contact_whatsapp: string
  partnership_tier: PartnershipTier

  brands: string[]

  contact_name: string | null
  contact_email: string | null
  phone: string | null
  website: string | null

  address: string | null
  city: string | null
  state: string | null

  has_showroom: boolean
  serves_outside_fortaleza: boolean

  partnership_model: PartnershipModel | null
  commission_percent: number | null
  commission_payment_term: CommissionPaymentTerm | null
  standard_discount_percent: number | null
  average_delivery_time: string | null

  status: SupplierStatus
  notes: string | null
  last_order_date: string | null
}

/*
  Os três selects do topo da tela (Fornecedores.jsx:159-190). `'all'` é o
  "Todas tipologias" / "Todos níveis" / "Todos" de cada um.

  `category` aceita os 23 valores, e não só os 19 do cadastro: o filtro do
  original oferece quatro categorias que fornecedor nenhum pode ter (ver o
  comentário de `SUPPLIER_TYPOLOGY` em src/lib/enums.ts). Aceitá-las aqui deixa a
  tela reproduzir a lista do original sem mentir sobre o resultado — filtrar por
  uma delas devolve lista vazia, que é o que acontece hoje.

  A BUSCA POR TEXTO não está aqui: ela varre nome do fornecedor E nome de marca,
  e continua em memória, como no original — ver `filterSuppliersBySearch` em
  list.ts.
*/
export type SupplierFilters = {
  category: SupplierCategory | 'all'
  tier: PartnershipTier | 'all'
  status: SupplierStatus | 'all'
}
