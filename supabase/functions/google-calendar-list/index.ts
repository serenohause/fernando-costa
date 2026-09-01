/*
  google-calendar-list — as agendas que a conta conectada enxerga.

  Existe para a tela poder pedir QUAL agenda é lida, em vez de assumir a
  `primary`. A primary é a agenda pessoal do dono da conta: aniversário,
  médico, viagem de família. Mandar isso para um grupo de WhatsApp do
  escritório seria um vazamento criado por padrão.

  Não devolve evento nenhum — só id, nome e se é a principal.
*/

import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'
import { accessTokenFromRefresh, googleOAuthConfig, listCalendars } from '../_shared/google.ts'

const FN = 'google-calendar-list'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const { data: authorized, error: authError } = await admin
      .rpc('collaborator_can_edit_menu', { p_user_id: user.id, p_menu_key: 'settings' })
      .maybeSingle()

    if (authError) {
      console.error(`[${FN}] falha ao verificar permissao: ${authError.code} ${authError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível verificar a permissão.')
    }
    if (!authorized) {
      throw new HttpError(403, 'forbidden', 'É preciso permissão de edição em Configurações.')
    }

    const { data: token, error: tokenError } = await admin.rpc('google_calendar_refresh_token', {
      p_tenant_id: authorized.tenant_id,
    })

    if (tokenError) {
      console.error(`[${FN}] falha ao ler segredo: ${tokenError.code} ${tokenError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível consultar as agendas.')
    }
    if (!token) {
      throw new HttpError(409, 'not_connected', 'Nenhuma conta Google conectada.')
    }

    const config = googleOAuthConfig()
    const accessToken = await accessTokenFromRefresh(config, token)
    const calendars = await listCalendars(accessToken)

    /* Agenda que a conta só enxerga como convidado não serve para o disparo
       diário — a lista continua trazendo, e a tela mostra o papel. */
    return jsonResponse(req, { calendars })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
