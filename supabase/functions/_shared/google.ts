/*
  Conversa com o Google: OAuth e Calendar. Tudo o que fala com google.com mora
  aqui, e nenhuma das funções abaixo toca no banco.

  O QUE NUNCA SAI DAQUI: `client_secret` e `refresh_token`. Eles entram como
  argumento, viajam no corpo de um POST para o Google e não aparecem em log,
  em resposta, nem em mensagem de erro — os erros são reescritos à mão antes de
  subir, porque a resposta de erro do Google repete o que foi enviado.
*/

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

/*
  ESCOPO MÍNIMO, e por enquanto só leitura.

  `calendar.readonly` já é escopo sensível para o Google. Pedir escrita agora,
  "para o futuro", tornaria a verificação do app mais pesada e daria à
  automação um poder que ela não usa. Quando um módulo for criar evento, o
  escopo entra aqui e o diretor reconecta uma vez.
*/
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ')

export type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function googleOAuthConfig(): GoogleOAuthConfig {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI ausentes no ambiente da função.',
    )
  }

  return { clientId, clientSecret, redirectUri }
}

/*
  `access_type=offline` + `prompt=consent` é o que faz o Google devolver
  refresh_token. Sem os dois, a segunda autorização da mesma conta volta SEM
  refresh_token — a conexão funcionaria por uma hora e morreria calada.
*/
export function authorizationUrl(config: GoogleOAuthConfig, state: string): string {
  const url = new URL(AUTH_ENDPOINT)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  return url.toString()
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  scope?: string
  expires_in?: number
}

async function postForm(endpoint: string, body: URLSearchParams, what: string): Promise<Response> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    /* O corpo do erro do Google repete parâmetros enviados. Só o status e o
       campo `error` (curto e sem segredo) vão para o log. */
    let code = 'sem detalhe'
    try {
      const parsed = await res.json()
      if (typeof parsed?.error === 'string') code = parsed.error
    } catch {
      /* resposta não-JSON: o status já diz o suficiente */
    }
    console.error(`[google] ${what} falhou: HTTP ${res.status} (${code})`)
    throw new Error(`google_${what}_failed`)
  }

  return res
}

export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await postForm(TOKEN_ENDPOINT, body, 'token_exchange')
  return (await res.json()) as TokenResponse
}

export async function accessTokenFromRefresh(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await postForm(TOKEN_ENDPOINT, body, 'token_refresh')
  const parsed = (await res.json()) as TokenResponse
  return parsed.access_token
}

/*
  Revogação é "melhor esforço" DE PROPÓSITO: se o Google recusar (token já
  revogado do lado de lá, rede fora), a desconexão local continua. O contrário
  — deixar a linha e o segredo no banco porque a revogação falhou — manteria uma
  credencial viva que o escritório acredita ter desligado.
*/
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    })
    return res.ok
  } catch (error) {
    console.error('[google] revogacao falhou:', error instanceof Error ? error.message : 'erro')
    return false
  }
}

export async function fetchAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    console.error(`[google] userinfo falhou: HTTP ${res.status}`)
    throw new Error('google_userinfo_failed')
  }
  const parsed = (await res.json()) as { email?: string }
  if (!parsed.email) throw new Error('google_userinfo_sem_email')
  return parsed.email
}

export type GoogleCalendar = {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const res = await fetch(`${CALENDAR_API}/users/me/calendarList?maxResults=250`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    console.error(`[google] calendarList falhou: HTTP ${res.status}`)
    throw new Error('google_calendar_list_failed')
  }
  const parsed = (await res.json()) as {
    items?: { id: string; summary?: string; primary?: boolean; accessRole?: string }[]
  }
  return (parsed.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? item.id,
    primary: item.primary === true,
    accessRole: item.accessRole ?? 'reader',
  }))
}

export type GoogleEvent = {
  id: string
  summary?: string
  location?: string
  description?: string
  htmlLink?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[]
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  timeZone: string,
  maxResults: number,
): Promise<GoogleEvent[]> {
  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('timeZone', timeZone)
  /* `singleEvents` expande a série repetida em ocorrências — sem ele, uma
     reunião semanal apareceria como UMA linha com regra de repetição, e o
     disparo do dia não teria o horário de hoje. */
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', String(maxResults))

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    console.error(`[google] events falhou: HTTP ${res.status}`)
    throw new Error('google_events_failed')
  }

  const parsed = (await res.json()) as { items?: GoogleEvent[] }
  /* Evento cancelado continua vindo na listagem, com status `cancelled`. */
  return (parsed.items ?? []).filter((item) => item.status !== 'cancelled')
}
