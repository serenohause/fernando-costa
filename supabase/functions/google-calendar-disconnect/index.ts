/*
  google-calendar-disconnect — desliga a conexão, dos dois lados.

  A ordem importa: primeiro lê o refresh_token e o revoga no Google, depois
  apaga a linha e o segredo. Invertida, a revogação ficaria sem token para
  revogar e a credencial continuaria válida do lado do Google — o escritório
  veria "desconectado" na tela e o acesso seguiria de pé.

  A revogação é melhor esforço: se o Google recusar, a desconexão local
  acontece do mesmo jeito. O contrário seria manter no banco uma credencial que
  o escritório mandou apagar.
*/

import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'
import { revokeRefreshToken } from '../_shared/google.ts'

const FN = 'google-calendar-disconnect'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    /* Mesma regra de quem conecta, perguntada por user_id porque aqui não há
       JWT do lado do banco. */
    const { data: authorized, error: authError } = await admin
      .rpc('collaborator_can_edit_menu', { p_user_id: user.id, p_menu_key: 'settings' })
      .maybeSingle()

    if (authError) {
      console.error(`[${FN}] falha ao verificar permissao: ${authError.code} ${authError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível verificar a permissão.')
    }

    if (!authorized) {
      throw new HttpError(
        403,
        'forbidden',
        'É preciso permissão de edição em Configurações para desconectar o Google Agenda.',
      )
    }

    const tenantId = authorized.tenant_id

    const { data: token, error: tokenError } = await admin.rpc('google_calendar_refresh_token', {
      p_tenant_id: tenantId,
    })

    if (tokenError) {
      console.error(`[${FN}] falha ao ler segredo: ${tokenError.code} ${tokenError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível desconectar agora.')
    }

    const revoked = token ? await revokeRefreshToken(token) : false

    const { data: removed, error: removeError } = await admin.rpc('google_calendar_disconnect', {
      p_tenant_id: tenantId,
    })

    if (removeError) {
      console.error(`[${FN}] falha ao apagar conexao: ${removeError.code} ${removeError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível desconectar agora.')
    }

    return jsonResponse(req, { disconnected: removed === true, revokedAtGoogle: revoked })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
