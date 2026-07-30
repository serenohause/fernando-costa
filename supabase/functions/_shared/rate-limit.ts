import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.111.0'
import { HttpError } from './http.ts'

/*
  Limite de requisições por origem, para as funções PÚBLICAS (sem JWT).

  ONDE O LIMITE MORA: no Postgres — tabela public.public_endpoint_hits, contada
  por public.hit_public_endpoint (migration 0027). NÃO mora mais neste arquivo.

  Por que mudou, e por que isso importa: até a 0027 o contador era um `Map` na
  memória do isolate. A plataforma entrega um isolate novo a cada requisição,
  então cada requisição encontrava o mapa vazio e o teto nunca era alcançado.
  Medido contra a função publicada: 40 requisições paralelas, 40x HTTP 200,
  nenhuma recusa. O limite tinha efeito ZERO — e as migrations 0025 e 0026
  justificavam decisões apoiadas nele ("anon não ganha EXECUTE porque a edge
  function barra", "distinguir expirado de já enviado é aceitável porque há
  limite de requisição na frente"). As decisões continuam de pé; o que faltava
  era a defesa que elas citavam existir de verdade.

  O que continua deste lado: extrair a identidade de quem chama e traduzir a
  recusa em HTTP 429. A contagem, que precisa ser vista por todos os isolates,
  é do banco.

  Falha do contador FECHA a porta, não abre. Se o Postgres não responde, as duas
  funções públicas não teriam o que fazer de qualquer forma — as duas terminam
  em chamada de banco. Deixar passar "porque o contador caiu" seria transformar
  indisponibilidade em via livre.
*/

function clientKey(req: Request): string {
  /*
    A plataforma preenche x-forwarded-for. Só o PRIMEIRO valor interessa: o
    resto da lista é escrito por quem chama e não vale nada como identidade.
  */
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('cf-connecting-ip') || 'desconhecido'
}

export async function enforceRateLimit(
  req: Request,
  admin: SupabaseClient,
  { limit, windowSeconds, scope }: { limit: number; windowSeconds: number; scope: string },
): Promise<void> {
  const { data, error } = await admin
    .rpc('hit_public_endpoint', {
      p_scope: scope,
      p_client_key: clientKey(req),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    .maybeSingle()

  if (error) {
    /* code e message, nunca details nem hint — ver o cabeçalho de http.ts. */
    console.error(`[${scope}] contador de requisicoes indisponivel: ${error.code} ${error.message}`)
    throw new HttpError(
      503,
      'unavailable',
      'Serviço indisponível no momento. Tente de novo em instantes.',
    )
  }

  const row = data as { allowed: boolean; hit_count: number } | null

  if (row === null || row.allowed !== true) {
    throw new HttpError(
      429,
      'rate_limited',
      'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
    )
  }
}
