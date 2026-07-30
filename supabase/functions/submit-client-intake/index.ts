/*
  submit-client-intake — grava o briefing preenchido pelo cliente final.

  Par de open-client-intake, e vale o mesmo cabeçalho: sem sessão, token nunca
  comparado no navegador, e a escrita acontece dentro de
  public.submit_client_intake(uuid, jsonb) — `security definer`, com a linha
  travada por FOR UPDATE, revalidando status e validade DENTRO da transação do
  envio. Entre abrir o formulário e enviar podem passar horas, e no original quem
  confere as duas vezes é o próprio navegador (FormularioCliente.jsx:97-110).

  DUAS COISAS QUE O ORIGINAL FAZ E QUE NÃO SÃO PORTADAS:

  1. `Client.update(intake.cliente_crm_id, updateCRM)` — FormularioCliente.jsx:148.
     O envio sobrescrevia o cadastro do CRM com o que a pessoa digitou, sem
     sessão, sem histórico do que mudou e sem quem mudou. Decisão do usuário
     (docs/SCHEMA-PLAN.md, "O envio NÃO sobrescreve o cadastro do CRM"): o
     briefing fica guardado como foi preenchido, e a tela de Pipeline mostra o
     que difere para alguém da equipe aplicar campo a campo. Nada em `clients` é
     escrito por este caminho, e a função de banco tampouco toca aquela tabela.

  2. A validação de campo mínimo no cliente. Ela continua existindo na tela (é
     do original), mas quem decide é o banco: `submit_client_intake` levanta
     22023 quando falta nome ou os dois contatos. Erro em vez de recusa é
     deliberado — `false` é a recusa do TOKEN e precisa continuar significando
     só isso.

  MASS ASSIGNMENT: o corpo é repassado ao banco, e o banco lê chave por chave.
  Não existe caminho em que `status`, `token`, `tenant_id` ou `client_id` vindos
  daqui cheguem à tabela. Mesmo assim o schema abaixo recorta o payload — o que
  não está no formulário não viaja, e tamanho de campo é conferido antes de
  ocupar transação no banco.
*/

import { z } from 'npm:zod@4.4.3'
import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { serviceClient } from '../_shared/supabase.ts'

const FN = 'submit-client-intake'

const UUID_V4_ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (max: number) => z.string().trim().max(max).optional()

/* Campo vazio some do payload em vez de virar `''`, igual ao schema da tela
   (src/features/pipeline/schemas.ts): a função de banco já faz
   `nullif(btrim(...), '')`, e string vazia só produziria ida e volta para
   gravar nulo. Aqui isso também evita que um campo em branco seja recusado
   como "e-mail inválido" ou "data inválida". */
const blankToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/*
  Uma data que passa no formato ainda pode não existir. `9999-99-99` e
  `2025-02-30` casam com o regex, e o `::date` da função de banco levanta 22008
  — que, sem tratamento, virava 500 e apagava três passos de formulário
  preenchido. Quem decide se a data existe é o calendário, não o regex.
*/
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const probe = new Date(Date.UTC(2000, month - 1, day))
  probe.setUTCFullYear(year)

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

/*
  As chaves são exatamente as colunas de briefing de `client_intakes`, e o
  objeto é ESTRITO: chave desconhecida derruba a requisição em vez de ser
  descartada em silêncio. Payload com campo que este formulário não tem é
  cliente adulterado ou versão desencontrada — nos dois casos, recusar é mais
  informativo do que gravar metade.
*/
const briefingSchema = z
  .object({
    full_name: text(200),
    phone: text(50),
    /*
      Não basta `text(200)`. A coluna tem check de formato (migration 0023), e
      um "nao-e-email" chegava ao banco, levantava 23514 e voltava como 500 —
      formulário inteiro perdido por um campo. A regra aqui é a MESMA da tela
      (src/features/pipeline/schemas.ts, `z.email()`), e é mais estrita que a
      do banco: tudo que passa aqui passa lá.
    */
    email: z.preprocess(blankToUndefined, z.email().max(200).optional()),
    city: text(120),
    state: text(60),
    country: text(60),

    client_type: z.enum(['individual', 'company']).optional(),
    tax_id: text(30),
    birth_date: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(isRealDate)
        .optional(),
    ),

    address_zipcode: text(20),
    address_street: text(200),
    address_number: text(20),
    address_district: text(120),
    address_complement: text(120),
    address_city: text(120),
    address_state: text(60),

    site_zipcode: text(20),
    site_street: text(200),
    site_number: text(20),
    site_district: text(120),
    site_complement: text(120),
    site_city: text(120),
    site_state: text(60),
  })
  .strict()

/* Estrito também no nível de cima, e não só no briefing: a inconsistência não
   abria mass assignment (o banco lê chave por chave), mas deixava o envelope
   aceitar o que o formulário não manda. */
const bodySchema = z
  .object({
    token: z.string().trim().max(100),
    briefing: briefingSchema,
  })
  .strict()

/*
  Recusa de campo diz QUAL campo. Três passos preenchidos não podem voltar como
  "confira os dados" — a pessoa não tem como adivinhar onde olhar. Os rótulos
  são os do formulário do original (FormularioCliente.tsx).
*/
const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome completo',
  phone: 'Telefone/WhatsApp',
  email: 'E-mail',
  city: 'Cidade',
  state: 'Estado',
  country: 'País',
  client_type: 'Tipo de cliente',
  tax_id: 'CPF/CNPJ',
  birth_date: 'Data de nascimento',
  address_zipcode: 'CEP',
  address_street: 'Endereço',
  address_number: 'Número',
  address_district: 'Bairro',
  address_complement: 'Complemento',
  address_city: 'Cidade',
  address_state: 'Estado',
  site_zipcode: 'CEP da obra',
  site_street: 'Endereço da obra',
  site_number: 'Número da obra',
  site_district: 'Bairro da obra',
  site_complement: 'Complemento da obra',
  site_city: 'Cidade da obra',
  site_state: 'Estado da obra',
}

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Informe um e-mail válido.',
  birth_date: 'Data de nascimento inválida.',
}

function invalidBodyError(issues: readonly { path: PropertyKey[] }[]): HttpError {
  const issue = issues.find((i) => i.path[0] === 'briefing' && typeof i.path[1] === 'string')
  const field = issue === undefined ? undefined : String(issue.path[1])

  if (field !== undefined && FIELD_MESSAGES[field] !== undefined) {
    return new HttpError(400, 'invalid_field', FIELD_MESSAGES[field])
  }

  if (field !== undefined && FIELD_LABELS[field] !== undefined) {
    return new HttpError(400, 'invalid_field', `Confira o campo "${FIELD_LABELS[field]}".`)
  }

  return new HttpError(400, 'invalid_body', 'Confira os dados preenchidos e tente de novo.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    /* Antes de ler o corpo: quem estourou o teto não ocupa nem memória de
       parse. O contador é do banco desde a migration 0027 — o teto por isolate
       nunca chegava a contar nada. */
    const admin = serviceClient()
    await enforceRateLimit(req, admin, { limit: 10, windowSeconds: 60, scope: FN })

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw invalidBodyError(parsed.error.issues)
    }

    /* Formato inválido é indistinguível de token inexistente, como na abertura. */
    if (!UUID_V4_ISH.test(parsed.data.token)) {
      throw new HttpError(409, 'link_unavailable', LINK_UNAVAILABLE)
    }

    const { data, error } = await admin.rpc('submit_client_intake', {
      p_token: parsed.data.token,
      p_payload: parsed.data.briefing,
    })

    if (error) {
      /*
        QUEM PREENCHEU TRÊS PASSOS NÃO PODE PERDER TUDO POR CAUSA DE UM CAMPO.
        Recusa de campo é 400 com mensagem de campo; 500 é só para o que
        ninguém previu. Os quatro códigos abaixo são todos alcançáveis a partir
        do que o visitante digita:

          22023  campo mínimo do original (nome, e telefone OU e-mail)
          23514  check da coluna — hoje só o formato de e-mail (migration 0023)
          22007  data que o Postgres não consegue interpretar
          22008  data que existe no formato e não no calendário

        O schema acima já barra e-mail e data errados antes da viagem; este
        mapa é a segunda barreira, para o dia em que o banco ganhar um check
        que o schema não conhece.
      */
      if (error.code === '22023') {
        throw new HttpError(
          400,
          'missing_fields',
          'Preencha pelo menos Nome e Telefone/WhatsApp ou E-mail.',
        )
      }

      if (error.code === '23514') {
        const isEmail = (error.message ?? '').includes('client_intakes_email_format_check')
        throw new HttpError(
          400,
          'invalid_field',
          isEmail
            ? 'Informe um e-mail válido.'
            : 'Um dos campos preenchidos não foi aceito. Confira os dados e tente de novo.',
        )
      }

      if (error.code === '22007' || error.code === '22008') {
        throw new HttpError(400, 'invalid_field', 'Data de nascimento inválida.')
      }

      /*
        Só `code` e `message`. NUNCA `details` nem `hint`: o `details` do
        Postgres traz a LINHA INTEIRA que falhou — nome, CPF, telefone, e-mail,
        nascimento, dois endereços e o token vivo. Logar o PostgrestError
        inteiro escrevia o briefing de uma pessoa no log da plataforma, e o
        token junto.
      */
      console.error(`[${FN}] falha ao gravar briefing: ${error.code} ${error.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível enviar seus dados agora.')
    }

    /*
      `false` é a recusa do token: inexistente, expirado ou já enviado. A tela
      reage recarregando a abertura, que dirá qual dos três é — e mostrará a
      mesma tela que o original mostra para cada caso.
    */
    if (data !== true) {
      throw new HttpError(409, 'link_unavailable', LINK_UNAVAILABLE)
    }

    return jsonResponse(req, { status: 'submitted' })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

const LINK_UNAVAILABLE =
  'Este link não está mais disponível. Solicite um novo link ao escritório.'
