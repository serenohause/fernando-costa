/*
  google-calendar-callback — o retorno do Google, e a única função deste módulo
  que roda SEM sessão.

  Ela não roda sem sessão por escolha: o Google redireciona o NAVEGADOR para cá,
  e um redirect não carrega o JWT do usuário. Quem faz o papel da sessão é o
  `state`, emitido por google-calendar-start e consumido aqui uma única vez.
  Sem ele, qualquer pessoa poderia chamar esta URL com um `code` da própria
  conta Google e ligar a agenda DELA ao escritório.

  Responde com REDIRECT, não com JSON: quem está esperando é uma aba do
  navegador, e o destino é a tela de Configurações com o desfecho na URL.
*/

import { serviceClient } from '../_shared/supabase.ts'
import {
  exchangeCodeForTokens,
  fetchAccountEmail,
  googleOAuthConfig,
  GOOGLE_SCOPES,
} from '../_shared/google.ts'

const FN = 'google-calendar-callback'

function appBaseUrl(): string {
  return Deno.env.get('APP_BASE_URL') ?? 'https://fernando-costa.vercel.app'
}

/*
  O desfecho vai como código curto na URL, e a tela é que escreve a frase. Nada
  do erro do Google chega ao navegador: a mensagem dele descreve o pedido que
  fizemos, parâmetros incluídos.
*/
function backToSettings(outcome: string): Response {
  const url = new URL('/Settings', appBaseUrl())
  url.searchParams.set('integration', 'google_calendar')
  url.searchParams.set('outcome', outcome)
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const denied = url.searchParams.get('error')

    /* O diretor clicou em "Cancelar" na tela do Google. Não é falha. */
    if (denied) return backToSettings('cancelled')
    if (!code || !state) return backToSettings('invalid_response')

    const admin = serviceClient()

    const { data: consumed, error: stateError } = await admin
      .rpc('google_oauth_state_consume', { p_state_hash: await sha256Hex(state) })
      .maybeSingle()

    if (stateError) {
      console.error(`[${FN}] falha ao consumir state: ${stateError.code} ${stateError.message}`)
      return backToSettings('failed')
    }

    /* State desconhecido, vencido ou já usado: os três param aqui, e a tela diz
       a mesma coisa para os três — "comece de novo". Distinguir daria a quem
       sonda um oráculo sobre states válidos. */
    if (!consumed) return backToSettings('expired_state')

    const config = googleOAuthConfig()
    const tokens = await exchangeCodeForTokens(config, code)

    if (!tokens.refresh_token) {
      /* Acontece quando o consentimento vem sem `prompt=consent` — a URL que
         montamos sempre leva, então isto é sinal de fluxo iniciado por fora. */
      console.error(`[${FN}] Google devolveu resposta sem refresh_token`)
      return backToSettings('no_refresh_token')
    }

    const email = await fetchAccountEmail(tokens.access_token)

    const { error: connectError } = await admin.rpc('google_calendar_connect', {
      p_tenant_id: consumed.tenant_id,
      p_collaborator_id: consumed.collaborator_id,
      p_email: email,
      p_refresh_token: tokens.refresh_token,
      p_scopes: tokens.scope ?? GOOGLE_SCOPES,
    })

    if (connectError) {
      console.error(`[${FN}] falha ao gravar conexao: ${connectError.code} ${connectError.message}`)
      return backToSettings('failed')
    }

    return backToSettings('connected')
  } catch (error) {
    /* Nem aqui o erro vira JSON: quem espera é uma aba de navegador, e um
       corpo JSON no lugar de um redirect deixaria o diretor numa página em
       branco sem saber o que fazer. */
    console.error(`[${FN}] erro nao tratado:`, error)
    return backToSettings('failed')
  }
})
