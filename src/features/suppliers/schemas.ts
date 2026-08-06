import { z } from 'zod'
import { Constants } from '@/lib/database.types'
import type { SupplierTypology } from '@/lib/enums'

/*
  Segunda barreira antes de qualquer escrita em `suppliers` e `supplier_brands`.
  A primeira continua sendo o `required` da marcação, como no original — mesma
  mecânica dos módulos 2 a 7, e pelo mesmo motivo: o que o navegador deixa passar
  e o banco recusaria vira frase em português aqui, e não nome de constraint na
  tela.

  As regras saem dos checks da migration 0049, e todas descrevem estados que o
  base44 aceita hoje:

  1. `suppliers_name_not_blank_check` / `_contact_whatsapp_not_blank_check` —
     nome ou WhatsApp só com espaço passam pelo `required` do navegador.
  2. `suppliers_category_domain_check` — as quatro categorias que só valem para
     item de orçamento. O formulário do original não as oferece; o FILTRO da tela
     oferece (Fornecedores.jsx:27), e é por isso que o recorte precisa existir
     também aqui.
  3. `suppliers_commission_percent_range_check` /
     `_standard_discount_percent_range_check` — percentual fora de 0 a 100. O
     `<input type="number">` do original não tem `min` nem `max`.

  E uma regra que é do BANCO sem ser check: `supplier_brands_supplier_id_name_key`.
  A mesma marca não entra duas vezes no mesmo fornecedor — ver `brands` abaixo.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

const isoDate = (message: string) => nullIfBlank(z.iso.date(message).nullable())

/*
  PERCENTUAL: `numeric(5,2)`, de 0 a 100, no máximo duas casas.

  O texto do input vira número aqui e não no componente — o original faz
  `Number(form.percentual_comissao)` no submit (FornecedorForm.jsx:55), e string
  vazia precisa virar NULO e não zero: "não há comissão combinada" é diferente de
  "a comissão é zero", e é essa diferença que a coluna gerada
  `budget_checklist_items.commission_value` respeita.

  As duas casas são cobradas pelo mesmo motivo do módulo 7: `numeric(5,2)`
  arredonda o que passar disso EM SILÊNCIO.
*/
const percent = (message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value ?? null
      const trimmed = value.trim()
      return trimmed === '' ? null : Number(trimmed)
    },
    z
      .number(message)
      .min(0, 'O percentual não pode ser negativo.')
      .max(100, 'O percentual não pode passar de 100.')
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
        message: 'O percentual tem no máximo duas casas decimais.',
      })
      .nullable(),
  )

/*
  O domínio de tipologia do FORNECEDOR, tirado do próprio `Constants` para não
  haver duas verdades sobre quais valores existem — mesmo desenho de
  TASK_PHASE_VALUES (módulo 5) e dos dois domínios de forma de pagamento
  (módulo 7).
*/
export const SUPPLIER_TYPOLOGY_VALUES = Constants.public.Enums.supplier_category.filter(
  (category): category is SupplierTypology =>
    category !== 'facade_cladding' &&
    category !== 'pool_cladding' &&
    category !== 'waterproofing' &&
    category !== 'drywall_plaster',
)

/*
  AS MARCAS, normalizadas antes de gravar.

  Três coisas acontecem aqui, e as três são consequência de `marcas_representadas`
  ter deixado de ser array dentro da linha:

  1. Espaço nas pontas sai, e marca em branco some. `addMarca` do original já
     apara (FornecedorForm.jsx:43), mas nada impede que a importação traga " ".
  2. REPETIDA SOME. `addMarca` empurra no array sem olhar o que já está lá, e a
     busca da tela passa a casar o mesmo fornecedor duas vezes pela mesma razão;
     aqui a repetição bateria em `supplier_brands_supplier_id_name_key` e faria a
     gravação inteira falhar por causa de um clique duplo. Some antes.
  3. A comparação é EXATA, como a do banco: "Deca" e "deca" continuam sendo duas
     marcas. Achatar caixa aqui esconderia o dado que o usuário digitou e ainda
     assim não impediria nada no banco, que compara texto e não texto normalizado.
*/
const brands = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const unique: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') continue
      const name = item.trim()
      if (name === '' || seen.has(name)) continue
      seen.add(name)
      unique.push(name)
    }
    return unique
  },
  z.array(z.string().max(120, 'Nome de marca longo demais.')),
)

export const supplierInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do fornecedor.').max(300),

  category: z.enum(SUPPLIER_TYPOLOGY_VALUES, {
    error: 'Selecione a tipologia do fornecedor.',
  }),

  /* NOT NULL no banco e `required` no formulário: é por ele que o drawer monta o
     link do WhatsApp, e é a única forma de contato obrigatória. */
  contact_whatsapp: z.string().trim().min(1, 'Informe o WhatsApp do contato.').max(60),

  partnership_tier: z.enum(Constants.public.Enums.partnership_tier),

  brands,

  contact_name: optionalText(200),
  contact_email: nullIfBlank(z.email('Informe um e-mail válido.').max(200).nullable()),
  phone: optionalText(60),
  /* Texto livre, e não `z.url()`: o rótulo do campo é "Site / Instagram"
     (FornecedorForm.jsx:122) e o escritório digita "@marca" ali. */
  website: optionalText(300),

  address: optionalText(300),
  /* SEM o default "Fortaleza"/"CE" do original — a decisão é da migration 0049,
     e está reportada: o escritório é de Goiânia. */
  city: optionalText(120),
  state: optionalText(60),

  has_showroom: z.boolean(),
  serves_outside_fortaleza: z.boolean(),

  partnership_model: nullIfBlank(
    z.enum(Constants.public.Enums.partnership_model).nullable(),
  ),
  commission_percent: percent('Informe o percentual de comissão.'),
  commission_payment_term: nullIfBlank(
    z.enum(Constants.public.Enums.commission_payment_term).nullable(),
  ),
  standard_discount_percent: percent('Informe o percentual de desconto.'),
  average_delivery_time: optionalText(120),

  status: z.enum(Constants.public.Enums.supplier_status),
  notes: optionalText(5000),
  last_order_date: isoDate('Data do último pedido inválida.'),
})

export type SupplierInputParsed = z.infer<typeof supplierInputSchema>

/*
  O MESMO ESQUEMA, com o domínio de tipologia dos 23 valores — e SÓ na EDIÇÃO.

  A migration 0063 reescreveu `suppliers_category_domain_check` como
  `category não é uma das quatro OU legacy_id não é nulo`: a exceção acompanha a
  LINHA, não a operação. Um fornecedor importado do base44 pode manter
  `facade_cladding` num UPDATE, e há um cadastrado assim ("Revestimento de
  Fachada", tipologia real do escritório).

  Se a edição validasse pelos 19, salvar qualquer outro campo daquele fornecedor —
  um telefone, uma marca — falharia com "Selecione a tipologia do fornecedor",
  ainda que a tipologia não tivesse sido tocada; e a única saída pela tela seria
  trocá-la por outra, apagando o fato.

  A CRIAÇÃO CONTINUA NOS 19, sem exceção, porque linha nova não tem `legacy_id` e
  o banco a recusaria com 23514. Quem monta a lista do select é
  `typologyOptionsFor` (SupplierForm.tsx), e ela só acrescenta a tipologia de fora
  do cadastro quando ela JÁ É a do fornecedor aberto — nunca como opção nova.
*/
export const supplierUpdateSchema = supplierInputSchema.extend({
  category: z.enum(Constants.public.Enums.supplier_category, {
    error: 'Selecione a tipologia do fornecedor.',
  }),
})
