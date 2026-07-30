import { HttpError } from './http.ts'

/*
  Limite de requisições por origem, para as funções PÚBLICAS (sem JWT).

  Por que ele existe, e por que ele mora aqui e não no banco: a migration 0025
  registra a divisão de trabalho do formulário público. O banco resolve o token
  de forma atômica e recorta a resposta; a edge function é quem cuida do limite
  de requisições, do registro de abuso e da resposta HTTP. Sem esta parte,
  `open-client-intake` seria um oráculo consultável na velocidade da rede — e a
  própria migration 0026 aceita distinguir "expirado" de "já enviado" APOIADA
  nisto: o token é uuid v4 e há limite de requisição na frente.

  LIMITE CONHECIDO, e é honesto registrá-lo: o contador vive na memória do
  isolate. A plataforma roda vários isolates e os recicla, então o teto real é
  por isolate, não global, e reinicia quando o isolate morre. Isso NÃO detém um
  atacante distribuído — detém a varredura trivial de um cliente só, que é o
  cenário plausível. Um limite de verdade (contador compartilhado, por token e
  por IP) é decisão de infraestrutura, não de código de função, e fica
  registrado como pendência no relatório do módulo 3.
*/

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/* Teto do mapa: sem isto, uma varredura com IP forjado faria a memória crescer
   sem limite — o próprio mecanismo de defesa viraria o problema. */
const MAX_BUCKETS = 10_000

function clientKey(req: Request): string {
  /*
    A plataforma preenche x-forwarded-for. Só o PRIMEIRO valor interessa: o
    resto da lista é escrito por quem chama e não vale nada como identidade.
  */
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('cf-connecting-ip') || 'desconhecido'
}

export function enforceRateLimit(
  req: Request,
  { limit, windowMs, scope }: { limit: number; windowMs: number; scope: string },
): void {
  const key = `${scope}:${clientKey(req)}`
  const now = Date.now()

  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) purgeExpired(now)
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  current.count += 1
  if (current.count > limit) {
    throw new HttpError(
      429,
      'rate_limited',
      'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
    )
  }
}

function purgeExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  /* Se nada expirou, o mapa está cheio de janelas vivas: zera e recomeça, que é
     preferível a crescer sem teto. */
  if (buckets.size >= MAX_BUCKETS) buckets.clear()
}
