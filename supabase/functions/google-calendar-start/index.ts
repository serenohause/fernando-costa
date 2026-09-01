/*
  google-calendar-start — abre o consentimento do Google.

  Devolve a URL para onde o navegador do diretor deve ir. Ela não é montada no
  frontend de propósito: o `state` precisa nascer no servidor e ser guardado
  antes de a viagem começar, senão o callback não tem como saber se o retorno
  veio de quem partiu.

  A autorização não é decidida aqui: `google_oauth_state_issue` confere
  can_edit em `settings` dentro do banco e levanta 42501 para quem não pode.
*/

import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'
import { authorizationUrl, googleOAuthConfig } from '../_shared/google.ts'

const FN = 'google-calendar-start'

/*
  O state viaja na URL; o banco guarda o SHA-256 dele. Quem lesse a tabela
  ficaria com o hash, que não serve para completar fluxo nenhum.
*/
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)
    const config = googleOAuthConfig()

    const state = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '')
    const stateHash = await sha256Hex(state)

    const { error } = await admin.rpc('google_oauth_state_issue', {
      p_user_id: user.id,
      p_state_hash: stateHash,
    })

    if (error) {
      if (error.code === '42501') {
        throw new HttpError(
          403,
          'forbidden',
          'É preciso permissão de edição em Configurações para conectar o Google Agenda.',
        )
      }
      console.error(`[${FN}] falha ao emitir state: ${error.code} ${error.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível iniciar a conexão agora.')
    }

    return jsonResponse(req, { authUrl: authorizationUrl(config, state) })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
