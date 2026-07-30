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
  corsHeaders,
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { serviceClient } from '../_shared/supabase.ts'

const FN = 'submit-client-intake'

const UUID_V4_ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (max: number) => z.string().trim().max(max).optional()

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
    email: text(200),
    city: text(120),
    state: text(60),
    country: text(60),

    client_type: z.enum(['individual', 'company']).optional(),
    tax_id: text(30),
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),

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

const bodySchema = z.object({
  token: z.string().trim().max(100),
  briefing: briefingSchema,
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    assertPost(req)
    enforceRateLimit(req, { limit: 10, windowMs: 60_000, scope: FN })

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Confira os dados preenchidos e tente de novo.')
    }

    /* Formato inválido é indistinguível de token inexistente, como na abertura. */
    if (!UUID_V4_ISH.test(parsed.data.token)) {
      throw new HttpError(409, 'link_unavailable', LINK_UNAVAILABLE)
    }

    const admin = serviceClient()
    const { data, error } = await admin.rpc('submit_client_intake', {
      p_token: parsed.data.token,
      p_payload: parsed.data.briefing,
    })

    if (error) {
      /*
        22023 é o campo mínimo do original (nome, e telefone OU e-mail). É o
        único erro do banco que vira mensagem própria: a tela precisa poder dizer
        o que falta, e isso não é recusa de link.
      */
      if (error.code === '22023') {
        throw new HttpError(
          400,
          'missing_fields',
          'Preencha pelo menos Nome e Telefone/WhatsApp ou E-mail.',
        )
      }
      console.error(`[${FN}] falha ao gravar briefing:`, error)
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

    return jsonResponse({ status: 'submitted' })
  } catch (error) {
    return errorResponse(error, FN)
  }
})

const LINK_UNAVAILABLE =
  'Este link não está mais disponível. Solicite um novo link ao escritório.'
