import { z } from 'zod'
import { Constants } from '@/lib/database.types'

/*
  Segunda barreira antes de qualquer escrita em `negotiations`. A primeira
  continua sendo o `required` da marcação, como no original — mesma mecânica de
  src/features/crm/schemas.ts, e pelo mesmo motivo: o que o navegador deixa
  passar e o banco recusaria vira frase em português aqui, e não nome de
  constraint na tela.

  Três regras saem direto dos checks da migration 0022, e as três descrevem
  estados que o base44 ACEITA e nenhuma tela sabe exibir:

  1. `negotiations_loss_fields_require_lost_check` — motivo e observação de
     perda só existem com status `lost`. O original deixa gravar motivo de perda
     em negociação Ativa, e o card do funil exibe esse motivo.
  2. `negotiations_closed_at_requires_closed_status_check` — data de fechamento
     só em negociação encerrada.
  3. `negotiations_close_probability_range_check` — probabilidade entre 0 e 100.
     O original aceita qualquer número, inclusive negativo, e soma isso como
     percentual no painel.

  Nos três casos o schema limpa o campo em vez de recusar a gravação: quem
  desmarca "Perdida" no formulário não deveria levar erro por causa de um motivo
  de perda que ficou preenchido na tela. É o mesmo gesto que o original já faz
  com `nome_indicador` quando a origem deixa de ser Indicação
  (NegociacaoForm.jsx:101).
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

const isoDate = (message: string) =>
  nullIfBlank(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, message)
      .nullable(),
  )

const uuid = (message: string) => z.uuid(message)

export const negotiationInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome da negociação.').max(300),

    /*
      Nullable como a coluna: a oportunidade nasce antes de o lead virar cadastro
      no CRM (migration 0022). Quem exige cliente é a transição para "Ganha",
      que é regra de tela — Negociacoes.jsx:249, reproduzida no hook.
    */
    client_id: nullIfBlank(uuid('Cliente inválido.').nullable()),
    commercial_owner_id: uuid('Defina um responsável pela negociação.'),

    services: z.array(z.enum(Constants.public.Enums.service_type)),

    estimated_value: z
      .number()
      .min(0, 'O valor estimado não pode ser negativo.')
      .nullable(),
    close_probability: z
      .number()
      .int('A probabilidade é um número inteiro.')
      .min(0, 'A probabilidade vai de 0 a 100.')
      .max(100, 'A probabilidade vai de 0 a 100.')
      .nullable(),

    status: z.enum(Constants.public.Enums.negotiation_status),
    funnel_stage: z.enum(Constants.public.Enums.funnel_stage),
    origin: nullIfBlank(z.enum(Constants.public.Enums.lead_origin).nullable()),
    referrer_name: optionalText(200),

    funnel_entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de entrada no funil inválida.'),
    expected_close_date: isoDate('Previsão de fechamento inválida.'),
    closed_at: isoDate('Data de fechamento inválida.'),

    loss_reason: nullIfBlank(z.enum(Constants.public.Enums.loss_reason).nullable()),
    loss_notes: optionalText(5000),

    generates_contract: z.boolean(),
  })
  .transform((value) => ({
    ...value,
    /* Só Indicação carrega indicador — é o que o original faz ao gravar. */
    referrer_name: value.origin === 'referral' ? value.referrer_name : null,
    loss_reason: value.status === 'lost' ? value.loss_reason : null,
    loss_notes: value.status === 'lost' ? value.loss_notes : null,
    closed_at: value.status === 'active' ? null : value.closed_at,
  }))
  .refine((value) => value.origin !== 'referral' || Boolean(value.referrer_name), {
    message: 'Informe o nome do indicador.',
    path: ['referrer_name'],
  })

export type NegotiationInputParsed = z.infer<typeof negotiationInputSchema>

/* ── Formulário público de briefing ────────────────────────────────────── */

/*
  O MESMO recorte que `submit-client-intake` valida do lado do servidor, e a
  duplicação é deliberada: este schema serve para a tela poder dizer qual campo
  está errado antes de a pessoa esperar a viagem; o do servidor é o que
  autoriza. Compartilhar o arquivo entre Vite e Deno é possível, mas amarraria a
  validação da única superfície pública do sistema ao build do frontend.

  Campo vazio some do payload em vez de virar `''`: a função de banco já faz
  `nullif(btrim(...), '')` (migration 0025), e mandar string vazia só produziria
  ida e volta para gravar nulo.
*/
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed === '' ? undefined : trimmed
    },
    z.string().max(max).optional(),
  )

export const intakeBriefingSchema = z.object({
  full_name: optionalTrimmed(200),
  phone: optionalTrimmed(50),
  email: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed === '' ? undefined : trimmed
    },
    z.email('Informe um e-mail válido.').max(200).optional(),
  ),
  city: optionalTrimmed(120),
  state: optionalTrimmed(60),
  country: optionalTrimmed(60),

  client_type: nullIfBlankUndefined(z.enum(Constants.public.Enums.client_type).optional()),
  tax_id: optionalTrimmed(30),
  birth_date: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed === '' ? undefined : trimmed
    },
    /*
      `z.iso.date()` e não regex de formato.

      A regex `^\d{4}-\d{2}-\d{2}$` aceita 9999-99-99 e 2025-02-30: são quatro
      dígitos, hífen, dois, hífen, dois. O banco recusa as duas no cast para
      `date`, e o servidor hoje devolve 400 com o campo — ninguém perde o
      formulário. Mas deixar o navegador aceitar o que o servidor recusa
      significa que a pessoa só descobre o erro depois de enviar, três passos
      adiante, em vez de no campo em que digitou.
    */
    z.iso.date('Data de nascimento inválida.').optional(),
  ),

  address_zipcode: optionalTrimmed(20),
  address_street: optionalTrimmed(200),
  address_number: optionalTrimmed(20),
  address_district: optionalTrimmed(120),
  address_complement: optionalTrimmed(120),
  address_city: optionalTrimmed(120),
  address_state: optionalTrimmed(60),

  site_zipcode: optionalTrimmed(20),
  site_street: optionalTrimmed(200),
  site_number: optionalTrimmed(20),
  site_district: optionalTrimmed(120),
  site_complement: optionalTrimmed(120),
  site_city: optionalTrimmed(120),
  site_state: optionalTrimmed(60),
})

function nullIfBlankUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema)
}

/*
  O mínimo que o original exige antes de deixar enviar
  (FormularioCliente.jsx:196): nome, e ao menos um canal de contato. A regra
  também existe no banco, que levanta 22023 — aqui ela vive para a tela poder
  dizer o que falta sem uma viagem ao servidor.
*/
export const intakeSubmissionSchema = intakeBriefingSchema.refine(
  (value) => Boolean(value.full_name) && Boolean(value.phone ?? value.email),
  { message: 'Preencha pelo menos Nome e Telefone/WhatsApp ou E-mail.', path: ['full_name'] },
)
