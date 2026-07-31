import { z } from 'zod'
import { Constants } from '@/lib/database.types'

/*
  Segunda barreira antes de qualquer escrita em `contracts`. A primeira continua
  sendo o `required` da marcação, como no original — mesma mecânica de
  src/features/crm/schemas.ts e src/features/pipeline/schemas.ts, e pelo mesmo
  motivo: o que o navegador deixa passar e o banco recusaria vira frase em
  português aqui, e não nome de constraint na tela.

  As regras saem dos checks da migration 0029, e todas descrevem estados que o
  base44 ACEITA:

  1. `contracts_total_value_not_negative_check` — valor total negativo.
  2. `contracts_installment_plan_all_or_none_check` — parcelamento pela metade.
     Quantidade sem data não tem por onde começar; data sem quantidade não tem
     onde parar. O módulo 7 geraria parcela errada a partir disso.
  3. `contracts_installment_count_positive_check` — zero parcelas.
  4. `contracts_start_date_not_before_signature_check` — vigência começando
     antes da assinatura.
  5. `contracts_phase_days_positive_check` — prazo de fase zerado, que no
     cronograma do módulo 5 vira entrega no mesmo dia do início.

  Diferença de tratamento entre 2 e o resto: o parcelamento em branco é LIMPO
  (os três viram nulo), porque "Mensal" é o valor inicial do formulário no
  original e ninguém que não parcela deveria levar erro por causa dele. Meio
  preenchido, aí sim, é recusado — é ambíguo, e adivinhar o que falta seria
  inventar plano de pagamento.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

/*
  `z.iso.date()` e não regex de formato: a regex `^\d{4}-\d{2}-\d{2}$` aceita
  2025-02-30, que o banco recusa no cast para `date`. Mesma decisão já tomada no
  formulário público do módulo 3.
*/
const isoDate = (message: string) => nullIfBlank(z.iso.date(message).nullable())

const phaseDays = (label: string) =>
  z
    .number()
    .int(`O prazo de ${label} é um número inteiro de dias úteis.`)
    .positive(`O prazo de ${label} precisa ser maior que zero.`)
    .max(32767)
    .nullable()

export const contractInputSchema = z
  .object({
    contract_number: z
      .string()
      .trim()
      .min(1, 'Informe o número do contrato.')
      .max(100),
    contract_type: z.enum(Constants.public.Enums.contract_type, {
      error: 'Selecione o tipo de contrato.',
    }),
    total_value: z
      .number('Informe o valor total do contrato.')
      .min(0, 'O valor total não pode ser negativo.'),

    /* Nullable como a coluna: Contracts.jsx:353 trata explicitamente o contrato
       sem cliente e o vincula depois. */
    client_id: nullIfBlank(z.uuid('Cliente inválido.').nullable()),
    negotiation_id: nullIfBlank(z.uuid('Negociação inválida.').nullable()),

    project_name: optionalText(300),
    billing_type: nullIfBlank(z.enum(Constants.public.Enums.billing_type).nullable()),
    status: z.enum(Constants.public.Enums.contract_status),
    signature_date: isoDate('Data de assinatura inválida.'),
    start_date: isoDate('Data de início inválida.'),
    notes: optionalText(5000),

    installment_count: z
      .number()
      .int('O número de parcelas é um número inteiro.')
      .min(1, 'O número de parcelas começa em 1.')
      .max(32767)
      .nullable(),
    first_due_date: isoDate('Data do primeiro vencimento inválida.'),
    installment_frequency: nullIfBlank(
      z.enum(Constants.public.Enums.installment_frequency).nullable(),
    ),

    layout_study_days: phaseDays('Estudo de Layout'),
    renderings_days: phaseDays('Perspectivas'),
    legal_permit_days: phaseDays('Projeto Legal'),
    construction_docs_days: phaseDays('Projeto Executivo'),
    engineering_docs_days: phaseDays('Complementares'),

    client_legal_name: optionalText(300),
    client_tax_id: optionalText(30),
    client_birth_date: isoDate('Data de nascimento inválida.'),
    client_email: optionalText(200),
    client_address_zipcode: optionalText(20),
    client_address_street: optionalText(200),
    client_address_number: optionalText(20),
    client_address_complement: optionalText(120),
    client_address_city: optionalText(120),
    client_address_state: optionalText(60),

    site_zipcode: optionalText(20),
    site_street: optionalText(200),
    site_number: optionalText(20),
    site_complement: optionalText(120),
    site_city: optionalText(120),
    site_state: optionalText(60),
  })
  .transform((value) => {
    /*
      Parcelamento vazio é parcelamento inexistente. A periodicidade sozinha é o
      caso comum: "Mensal" já vem escolhido no formulário do original
      (ContractForm.jsx:36) e sobra na tela de quem não parcela — gravá-la
      sozinha violaria o check de tudo-ou-nada.
    */
    const hasPlan = value.installment_count != null || value.first_due_date != null
    if (hasPlan) return value

    return {
      ...value,
      installment_count: null,
      first_due_date: null,
      installment_frequency: null,
    }
  })
  .refine(
    (value) => (value.installment_count == null) === (value.first_due_date == null),
    {
      message:
        'Preencha número de parcelas, data do primeiro vencimento e periodicidade — ou deixe os três em branco.',
      path: ['installment_count'],
    },
  )
  .refine(
    (value) =>
      value.installment_count == null || value.installment_frequency != null,
    {
      message: 'Escolha a periodicidade das parcelas.',
      path: ['installment_frequency'],
    },
  )
  .refine(
    (value) =>
      value.start_date == null ||
      value.signature_date == null ||
      value.start_date >= value.signature_date,
    {
      message: 'A vigência não pode começar antes da data de assinatura.',
      path: ['start_date'],
    },
  )

export type ContractInputParsed = z.infer<typeof contractInputSchema>
