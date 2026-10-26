/*
  capture-lead — grava o e-mail deixado na landing page do produto.

  A TERCEIRA PORTA PÚBLICA DO SISTEMA, e o mesmo desenho das duas primeiras
  (open-client-intake e submit-client-intake, módulo 3): quem envia não tem
  login e nunca terá. O que muda é que aqui não existe nem token — a página é
  aberta, qualquer pessoa pode chegar nela. Então o que segura esta porta é:

    1. o limite de requisições por origem, contado no BANCO
       (public.hit_public_endpoint, migration 0027) e não na memória do isolate,
       que é novo a cada requisição e por isso nunca chegava a contar nada;
    2. não haver EXECUTE para anon em public.capture_product_lead — a escrita
       acontece com service_role, daqui de dentro, e a tabela tem RLS ligada sem
       policy de INSERT alguma (migration 0112);
    3. o corpo recortado pelo schema abaixo, com teto de 64 KB vindo de
       readJsonBody.

  O QUE O CORPO NÃO DECIDE
    `source` não vem da requisição: é constante aqui. Se um dia existir uma
    segunda página de captura, ela entra como valor novo NESTE arquivo, e não
    como campo que o navegador escolhe — origem de lead que o cliente escreve
    não serve para medir nada. `placement` vem do corpo, mas de uma lista
    fechada: erro de digitação no HTML é recusado em vez de criar em silêncio
    um bloco novo e dividir a contagem de conversão em duas.

    status, submission_count, contacted_at e notes não têm caminho de entrada —
    public.capture_product_lead recebe parâmetro nomeado, não jsonb.

  A RESPOSTA É SEMPRE A MESMA PARA E-MAIL NOVO E JÁ CADASTRADO
    Decisão da migration 0112, e ela depende deste lado também: devolver a
    diferença transformaria uma página aberta em verificador de quais e-mails já
    se cadastraram. Quem precisa saber que houve reenvio lê submission_count na
    tela, com sessão.
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

const FN = 'capture-lead'

/* Única origem hoje. Ver o cabeçalho: isto é constante, não campo do corpo. */
const SOURCE = 'lp-hausone'

/* Os dois formulários da página. Lista fechada de propósito. */
const PLACEMENTS = ['hero', 'cta-final'] as const

const blankToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const BodySchema = z.object({
  /*
    z.email() é mais estrita que o check da tabela, e é de propósito: um
    "nao-e-email" que chegasse ao banco levantaria 23514 e voltaria como erro de
    servidor para quem só digitou errado. Os limites repetem os da coluna
    (migration 0112) para que campo grande demais seja recusado antes de ocupar
    transação no banco.
  */
  email: z.email().max(254),
  name: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  office_name: z.preprocess(blankToUndefined, z.string().trim().max(160).optional()),
  phone: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
  placement: z.preprocess(blankToUndefined, z.enum(PLACEMENTS).optional()),

  /*
    ARMADILHA DE ROBÔ. Um campo escondido que pessoa nenhuma vê e que
    preenchedor automático de formulário preenche. Vindo com conteúdo, a
    requisição recebe a MESMA resposta de sucesso e nada é gravado: dizer "você
    é um robô" ensina o robô a contornar.

    Não é a defesa principal — essa é o limite de requisições. É o que evita a
    fila encher de lixo em operação normal, sem pôr captcha na frente de quem
    está comprando.
  */
  site: z.preprocess(blankToUndefined, z.string().max(200).optional()),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()

    /* Antes de qualquer trabalho: o teto é por função, e não compartilhado com
       as portas do módulo 3 — varredura aqui não pode calar o formulário de
       briefing de quem já estava preenchendo. */
    await enforceRateLimit(req, admin, { limit: 10, windowSeconds: 60, scope: FN })

    const parsed = BodySchema.safeParse(await readJsonBody(req))

    if (!parsed.success) {
      const campo = parsed.error.issues[0]?.path?.[0]
      throw new HttpError(
        400,
        'invalid_field',
        campo === 'email'
          ? 'Informe um e-mail válido.'
          : 'Um dos campos preenchidos não foi aceito.',
      )
    }

    if (parsed.data.site !== undefined) {
      console.warn(`[${FN}] armadilha de robo preenchida; nada gravado`)
      return jsonResponse(req, { status: 'captured' })
    }

    const { error } = await admin.rpc('capture_product_lead', {
      p_email: parsed.data.email,
      p_name: parsed.data.name ?? null,
      p_office_name: parsed.data.office_name ?? null,
      p_phone: parsed.data.phone ?? null,
      p_source: SOURCE,
      p_placement: parsed.data.placement ?? null,
    })

    if (error) {
      /*
        22023 e 23514 são alcançáveis a partir do que a pessoa digita, e viram
        400 com mensagem de campo. O schema acima já barra os dois antes da
        viagem; este mapa é a segunda barreira, para o dia em que o banco ganhar
        um check que o schema não conhece.
      */
      if (error.code === '22023' || error.code === '23514') {
        throw new HttpError(400, 'invalid_field', 'Informe um e-mail válido.')
      }

      /* Só `code` e `message`. Nunca `details` nem `hint`: o `details` do
         Postgres traz a LINHA INTEIRA que falhou, e aqui a linha é o e-mail, o
         nome e o telefone de quem acabou de se interessar pelo sistema. */
      console.error(`[${FN}] falha ao gravar lead: ${error.code} ${error.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível enviar seu e-mail agora.')
    }

    return jsonResponse(req, { status: 'captured' })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
