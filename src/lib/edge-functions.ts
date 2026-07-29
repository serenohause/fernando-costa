import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/*
  As edge functions da fundação respondem sempre no mesmo contrato
  (supabase/functions/_shared/http.ts):

    sucesso → { status: '...', ...dados }
    falha   → { error: { code, message } }  com HTTP 4xx/5xx

  `functions.invoke` do supabase-js não lê o corpo quando o status não é 2xx:
  devolve um FunctionsHttpError com a Response crua em `context`. Sem abrir esse
  corpo, a tela perderia justamente a mensagem que o servidor escreveu à mão
  para ser exibida — e mostraria "Edge Function returned a non-2xx status code".
*/
export class EdgeFunctionError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.code = code
    this.status = status
  }
}

type ErrorPayload = { error?: { code?: string; message?: string } }

export async function invokeEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as ErrorPayload | null
      if (payload?.error?.message) {
        throw new EdgeFunctionError(
          payload.error.message,
          payload.error.code ?? 'unknown',
          error.context.status,
        )
      }
      throw new EdgeFunctionError(
        'Não foi possível concluir a operação. Tente novamente.',
        'unknown',
        error.context.status,
      )
    }
    throw error
  }

  return data as T
}
