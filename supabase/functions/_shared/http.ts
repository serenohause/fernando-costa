/*
  Respostas, CORS e erros das edge functions da fundação.

  Regra de ouro deste arquivo: o cliente nunca recebe detalhe interno do banco.
  Toda falha inesperada vira 500 com uma mensagem genérica e um `code` estável;
  o detalhe real vai só para o log do servidor. Erro do PostgREST costuma trazer
  nome de constraint, de coluna e trecho de SQL — informação que descreve o
  schema para quem estiver sondando a API de fora.
*/

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': ALLOWED_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/*
  `code` é o contrato com a UI (estável, em inglês, sem acento); `message` é o
  texto que a tela pode exibir direto. Os dois são escritos à mão aqui — nunca
  derivados da mensagem do Postgres.
*/
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function errorResponse(error: unknown, fnName: string): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status)
  }

  console.error(`[${fnName}] erro nao tratado:`, error)
  return jsonResponse(
    {
      error: {
        code: 'internal_error',
        message: 'Não foi possível concluir a operação. Tente novamente.',
      },
    },
    500,
  )
}

export function assertPost(req: Request): void {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'Método não suportado.')
  }
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const raw = await req.text()
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'invalid_body', 'Corpo da requisição não é um JSON válido.')
  }
}
