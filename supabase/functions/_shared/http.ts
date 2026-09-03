/*
  Respostas, CORS e erros das edge functions da fundação.

  Regra de ouro deste arquivo: o cliente nunca recebe detalhe interno do banco.
  Toda falha inesperada vira 500 com uma mensagem genérica e um `code` estável;
  o detalhe real vai só para o log do servidor. Erro do PostgREST costuma trazer
  nome de constraint, de coluna e trecho de SQL — informação que descreve o
  schema para quem estiver sondando a API de fora. E o `details` do Postgres
  traz a LINHA INTEIRA que falhou: em client_intakes isso é nome, CPF, telefone,
  e-mail, nascimento, dois endereços e o token vivo. Por isso o log de erro de
  banco deste projeto grava `code` e `message`, e nunca `details` nem `hint`.
*/

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'

/*
  CORS não é mais `*`.

  Com `*`, qualquer site aberto no navegador de qualquer visitante podia
  disparar as funções públicas em nome dele — e as duas funções públicas são a
  única superfície do sistema alcançável sem login. `*` não protegia nada e
  emprestava o navegador de terceiros para bater na porta.

  A origem permitida vem de APP_ALLOWED_ORIGINS (lista separada por vírgula,
  configurável por `supabase secrets set`), e o padrão é a origem de produção
  mais a de desenvolvimento. Origem desconhecida NÃO recebe o cabeçalho: a
  requisição até chega (CORS é regra de navegador, não de servidor), mas o
  navegador de quem foi enganado não entrega a resposta ao site que a pediu.

  `Vary: Origin` porque a resposta passa a depender do cabeçalho de origem —
  sem ele, um cache intermediário serviria a permissão de uma origem para outra.
*/
/*
  O DEFAULT PRECISA CONHECER O DOMINIO REAL DO ESCRITORIO, e essa linha e a
  correcao de um bug que chegou ao cliente final.

  `APP_ALLOWED_ORIGINS` nunca tinha sido definido em producao, entao a lista era
  esta — e ela so conhecia a URL da Vercel. Quando o escritorio passou a usar
  hausone.com.br, o formulario publico de briefing (a UNICA tela que o cliente
  do escritorio abre) parou com "Houve uma falha ao contatar o escritorio":
  sem o cabecalho de origem, o navegador descarta uma resposta que chegou
  inteira. As funcoes respondiam 200 o tempo todo.

  O segredo continua sendo o lugar de configurar isto por ambiente. O default e
  a rede de baixo: um ambiente esquecido cai em algo que funciona, em vez de
  cair numa lista que nao inclui a propria casa.
*/
const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.hausone.com.br',
  'https://hausone.com.br',
  'https://fernando-costa.vercel.app',
  'http://localhost:5173',
]

function allowedOrigins(): string[] {
  const configured = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')

  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }

  const origin = req.headers.get('Origin')
  if (origin !== null && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

export function preflightResponse(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) })
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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

export function errorResponse(req: Request, error: unknown, fnName: string): Response {
  if (error instanceof HttpError) {
    return jsonResponse(req, { error: { code: error.code, message: error.message } }, error.status)
  }

  console.error(`[${fnName}] erro nao tratado:`, error)
  return jsonResponse(
    req,
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

/*
  Teto de tamanho do corpo.

  64 KB é uma ordem de grandeza acima do maior corpo legítimo destas funções
  (o briefing inteiro, com todos os campos no limite do schema, não passa de
  ~2 KB). Sem teto, `await req.text()` materializava na memória do isolate o
  que viesse: medido, um corpo de 50 MB foi aceito e parseado.

  Duas barreiras, porque uma só não fecha:
  1. `Content-Length` acima do teto é recusado ANTES de ler qualquer byte.
  2. O header pode não vir (`Transfer-Encoding: chunked`), ou vir mentindo. Por
     isso a leitura também para sozinha ao passar do teto, e o resto do fluxo é
     descartado.
*/
const MAX_BODY_BYTES = 64 * 1024

const TOO_LARGE = new HttpError(
  413,
  'payload_too_large',
  'O conteúdo enviado é grande demais.',
)

export async function readJsonBody(req: Request): Promise<unknown> {
  const declared = req.headers.get('content-length')
  if (declared !== null) {
    const size = Number(declared)
    if (!Number.isFinite(size) || size > MAX_BODY_BYTES) {
      /* Fecha o fluxo antes de responder. Sem isto, quem está no meio de um
         envio de megabytes só descobre a recusa quando a conexão cai — e a
         plataforma traduz a conexão caída em 503, escondendo o 413. */
      await req.body?.cancel().catch(() => {})
      throw TOO_LARGE
    }
  }

  const raw = await readTextCapped(req)
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'invalid_body', 'Corpo da requisição não é um JSON válido.')
  }
}

async function readTextCapped(req: Request): Promise<string> {
  if (req.body === null) return ''

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel()
        throw TOO_LARGE
      }
      chunks.push(value)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* cancelado acima: o lock já foi liberado */
    }
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(merged)
}
