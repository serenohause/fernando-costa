import { z } from 'zod'
import { Constants } from '@/lib/database.types'
import type { PayablePaymentMethod, ReceivablePaymentMethod } from '@/lib/enums'

/*
  Segunda barreira antes de qualquer escrita em `accounts_receivable`,
  `accounts_payable` e `financial_categories`. A primeira continua sendo o
  `required` da marcação, como no original — mesma mecânica de
  src/features/contracts/schemas.ts e src/features/projects/schemas.ts, e pelo
  mesmo motivo: o que o navegador deixa passar e o banco recusaria vira frase em
  português aqui, e não nome de constraint na tela.

  As regras saem dos checks das migrations 0040 e 0041, e TODAS descrevem estados
  que o base44 aceita hoje:

  1. `*_value_positive_check` — parcela de zero real, que não é cobrança e entra
     na soma da carteira como se fosse.
  2. `*_payment_date_matches_status_check` — os dois sentidos. Conta "Paga" sem
     data fica fora de todo relatório por período; conta "Prevista" com data de
     pagamento aparece recebida para quem lê a data e prevista para quem lê o
     status. O original grava as duas metades em chamadas independentes.
  3. `accounts_receivable_installment_pair_check` / `_range_check` — número e
     total de parcela andam juntos, e 3/12 nunca é maior que 12/12.
  4. `*_payment_method_domain_check` — espécie só a receber, débito automático só
     a pagar. Resolvido pelo domínio do enum de cada formulário.
  5. `accounts_payable_competence_month_is_first_day_check` — competência é um
     MÊS. Guardar 15/03 e 01/03 como competências diferentes rebentaria o
     agrupamento do relatório mensal.
  6. `accounts_payable_recurrence_plan_check` — recorrência declarada precisa
     dizer com que frequência e a partir de quando. O original cai em dois
     palpites silenciosos (usa `due_date` quando falta a data de início,
     AccountsPayable.jsx:152, e trata frequência desconhecida como mensal, :171),
     que geram lançamento financeiro em data que ninguém pediu.
  7. `accounts_payable_recurrence_end_not_before_start_check` e
     `_recurrence_count_positive_check`.
  8. `*_not_blank_check` — descrição só com espaço passa pelo `required` do
     navegador.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

/*
  `z.iso.date()` e não regex de formato: a regex `^\d{4}-\d{2}-\d{2}$` aceita
  2025-02-30, que o banco recusa no cast para `date`. Mesma decisão dos módulos
  3, 4, 5 e 6.
*/
const isoDate = (message: string) => nullIfBlank(z.iso.date(message).nullable())

const requiredIsoDate = (message: string) => z.iso.date(message)

/*
  DINHEIRO: `number`, e não string ou centavos inteiros.

  A coluna é `numeric(14,2)` (migration 0041) e o PostgREST devolve numeric como
  número de JSON — é assim que `contracts.total_value` já viaja neste projeto
  desde o módulo 4, e trocar a representação só neste módulo faria a mesma quantia
  ter dois formatos dependendo de qual tela a leu. O que o banco NÃO tolera em
  ponto flutuante é a SOMA (por isso a divisão de parcelas acontece em centavos
  inteiros, dentro do Postgres, migration 0044); transportar um valor de duas
  casas não tem esse problema.

  Duas regras que o original não tem:

  - `> 0`, e não `>= 0`: é o check do banco.
  - NO MÁXIMO DOIS DECIMAIS. `numeric(14,2)` arredonda o que passar disso EM
    SILÊNCIO — 10,005 vira 10,01 e ninguém é avisado de que o valor gravado não é
    o digitado. O `step="0.01"` do original é validação de navegador, que não
    roda quando o valor chega por colagem ou por programa. Recusar é decisão
    deste módulo, e está registrada no relatório.

  O teto é o da coluna: 12 dígitos inteiros.
*/
const MAX_MONEY = 999_999_999_999.99

function money(label: string) {
  return z
    .number(`Informe o valor ${label}.`)
    .positive('O valor precisa ser maior que zero.')
    .max(MAX_MONEY, 'Valor acima do que o sistema aceita.')
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: 'O valor tem no máximo duas casas decimais (centavos).',
    })
}

const smallint = (message: string) =>
  z.number().int(message).min(1, message).max(32767, message).nullable()

/* ── Competência: MM/YYYY na tela, primeiro dia do mês no banco ─────────── */

/*
  A ponte da divergência registrada na migration 0041 (item 5). O campo do
  original é um `<input>` de texto com placeholder "MM/YYYY"
  (AccountPayableForm.jsx:218) e continua sendo — o que muda é que o valor
  gravado é uma data, porque texto "MM/YYYY" ordena errado em qualquer lugar que
  ordene texto ("01/2027" antes de "02/2026") e o relatório mensal é justamente o
  que esta tela produz.

  As duas funções são o de/para, e ficam aqui porque é aqui que a conversão
  acontece antes de gravar.
*/
const COMPETENCE_TEXT = /^(\d{2})\/(\d{4})$/

export function parseCompetenceMonth(value: string): string | null {
  const match = COMPETENCE_TEXT.exec(value.trim())
  if (!match) return null
  const month = Number(match[1])
  if (month < 1 || month > 12) return null
  return `${match[2]}-${match[1]}-01`
}

export function formatCompetenceMonth(value: string | null | undefined): string {
  if (!value) return ''
  const [year, month] = value.split('-')
  if (!year || !month) return ''
  return `${month}/${year}`
}

/*
  Aceita as duas grafias e normaliza para o primeiro dia do mês: "08/2026" (o que
  a tela digita) e "2026-08-01" (o que o banco devolve ao reabrir o formulário).
  Dia diferente de 1 é aparado para o primeiro do mês em vez de recusado — é
  competência, não vencimento, e o check do banco só aceita o dia 1.
*/
const competenceMonth = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    if (trimmed === '') return null
    const fromText = parseCompetenceMonth(trimmed)
    if (fromText) return fromText
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed.slice(0, 7)}-01`
    return trimmed
  },
  z.iso.date('Competência inválida. Use MM/AAAA.').nullable(),
)

/* ── Conta a receber ───────────────────────────────────────────────────── */

/*
  O domínio de forma de pagamento de CADA tela, tirado do próprio `Constants`
  para não haver duas verdades sobre quais valores existem — mesmo desenho de
  TASK_PHASE_VALUES no módulo 5.
*/
export const RECEIVABLE_PAYMENT_METHOD_VALUES =
  Constants.public.Enums.payment_method.filter(
    (method): method is ReceivablePaymentMethod => method !== 'direct_debit',
  )

export const PAYABLE_PAYMENT_METHOD_VALUES = Constants.public.Enums.payment_method.filter(
  (method): method is PayablePaymentMethod => method !== 'cash',
)

/*
  Os dois sentidos de `*_payment_date_matches_status_check`, escritos por extenso
  nos dois schemas em vez de num ajudante genérico: a frase é o produto aqui, e
  os dois campos se chamam "Data Pagamento" nos dois formulários do original.
*/
const PAID_WITHOUT_DATE = 'Conta marcada como paga precisa da data do pagamento.'
const DATE_WITHOUT_PAID = 'Só conta paga tem data de pagamento. Mude o status ou apague a data.'

export const receivableInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Informe a descrição.').max(300),
    value: money('do recebível'),
    due_date: requiredIsoDate('Informe a data de vencimento.'),

    /* Os três anuláveis como as colunas: recebível avulso (reembolso, venda de
       projeto pronto) não tem contrato nem projeto, e pode nem ter cliente do
       CRM. */
    client_id: nullIfBlank(z.uuid('Cliente inválido.').nullable()),
    contract_id: nullIfBlank(z.uuid('Contrato inválido.').nullable()),
    project_id: nullIfBlank(z.uuid('Projeto inválido.').nullable()),

    installment_number: smallint('O número da parcela é um inteiro a partir de 1.'),
    installment_total: smallint('O total de parcelas é um inteiro a partir de 1.'),

    issue_date: isoDate('Data de emissão inválida.'),

    status: z.enum(Constants.public.Enums.financial_status),
    payment_date: isoDate('Data de recebimento inválida.'),
    payment_method: nullIfBlank(z.enum(RECEIVABLE_PAYMENT_METHOD_VALUES).nullable()),
  })
  .refine((value) => value.status !== 'paid' || value.payment_date != null, {
    message: PAID_WITHOUT_DATE,
    path: ['payment_date'],
  })
  .refine((value) => value.payment_date == null || value.status === 'paid', {
    message: DATE_WITHOUT_PAID,
    path: ['payment_date'],
  })
  .refine(
    (value) => (value.installment_number == null) === (value.installment_total == null),
    {
      message: 'Preencha o número e o total de parcelas — ou deixe os dois em branco.',
      path: ['installment_number'],
    },
  )
  .refine(
    (value) =>
      value.installment_number == null ||
      value.installment_total == null ||
      value.installment_number <= value.installment_total,
    {
      message: 'O número da parcela não pode ser maior que o total.',
      path: ['installment_number'],
    },
  )

/* ── Conta a pagar ─────────────────────────────────────────────────────── */

export const payableInputSchema = z
  .object({
    /* Texto livre, como no original: o rótulo do campo é "Fornecedor /
       Destinatário" e a tabela de fornecedores só nasce no módulo 8. */
    supplier_name: z.string().trim().min(1, 'Informe o fornecedor.').max(300),
    description: z.string().trim().min(1, 'Informe a descrição.').max(300),
    category: z.enum(Constants.public.Enums.expense_category, {
      error: 'Selecione a categoria da despesa.',
    }),
    value: money('da despesa'),
    due_date: requiredIsoDate('Informe a data de vencimento.'),

    project_id: nullIfBlank(z.uuid('Projeto inválido.').nullable()),

    status: z.enum(Constants.public.Enums.financial_status),
    payment_date: isoDate('Data de pagamento inválida.'),
    payment_method: nullIfBlank(z.enum(PAYABLE_PAYMENT_METHOD_VALUES).nullable()),

    competence_month: competenceMonth,

    is_recurring: z.boolean(),
    recurrence_frequency: nullIfBlank(
      z.enum(Constants.public.Enums.recurrence_frequency).nullable(),
    ),
    recurrence_start_date: isoDate('Data de início da recorrência inválida.'),
    recurrence_end_date: isoDate('Data de término da recorrência inválida.'),
    recurrence_count: smallint('A quantidade de repetições é um inteiro a partir de 1.'),
    recurrence_status: nullIfBlank(
      z.enum(Constants.public.Enums.recurrence_status).nullable(),
    ),
  })
  .refine((value) => value.status !== 'paid' || value.payment_date != null, {
    message: PAID_WITHOUT_DATE,
    path: ['payment_date'],
  })
  .refine((value) => value.payment_date == null || value.status === 'paid', {
    message: DATE_WITHOUT_PAID,
    path: ['payment_date'],
  })
  .refine((value) => !value.is_recurring || value.recurrence_frequency != null, {
    message: 'Escolha a frequência da recorrência.',
    path: ['recurrence_frequency'],
  })
  .refine((value) => !value.is_recurring || value.recurrence_start_date != null, {
    message: 'Informe a data de início da recorrência.',
    path: ['recurrence_start_date'],
  })
  .refine(
    (value) =>
      value.recurrence_end_date == null ||
      value.recurrence_start_date == null ||
      value.recurrence_end_date >= value.recurrence_start_date,
    {
      message: 'O término da recorrência não pode ser anterior ao início.',
      path: ['recurrence_end_date'],
    },
  )
  /*
    Despesa que não é recorrente não carrega plano de recorrência. É o que o
    formulário do original faz com `delete` antes de enviar (linhas 100-106), e
    aqui é obrigatório por outro motivo também: `recurrence_status` não tem
    default no banco (migration 0041), de propósito — com default, toda despesa
    avulsa nasceria com situação de uma recorrência que não existe.

    No sentido inverso, recorrência declarada sem situação nasce `active`, que é
    o valor inicial do formulário do original (linha 40).

    O `transform` vem DEPOIS dos refines: assim a mensagem de "escolha a
    frequência" ainda enxerga o que a pessoa preencheu, em vez de reclamar de um
    campo que a normalização acabou de zerar.
  */
  .transform((value) => {
    if (!value.is_recurring) {
      return {
        ...value,
        recurrence_frequency: null,
        recurrence_start_date: null,
        recurrence_end_date: null,
        recurrence_count: null,
        recurrence_status: null,
      }
    }
    return { ...value, recurrence_status: value.recurrence_status ?? 'active' }
  })

/* ── Categoria financeira ──────────────────────────────────────────────── */

/*
  `financial_categories_tenant_id_type_name_key`: único por (escritório, tipo).
  Duas categorias "Marketing" de despesa deixam o seletor ambíguo e o agrupamento
  do relatório dobrado — receita e despesa PODEM repetir o nome ("Comissão"
  existe dos dois lados).
*/
export const financialCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da categoria.').max(120),
  type: z.enum(Constants.public.Enums.financial_category_type, {
    error: 'Escolha se a categoria é de receita ou de despesa.',
  }),
  /* Anulável como no original (só nome e tipo são obrigatórios): categoria
     transversal, como "Impostos", não pertence a um centro de custo só. */
  cost_center: nullIfBlank(z.enum(Constants.public.Enums.cost_center).nullable()),
})

export type ReceivableInputParsed = z.infer<typeof receivableInputSchema>
export type PayableInputParsed = z.infer<typeof payableInputSchema>
export type FinancialCategoryInputParsed = z.infer<typeof financialCategoryInputSchema>
