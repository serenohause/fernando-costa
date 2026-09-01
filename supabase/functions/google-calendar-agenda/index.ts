/*
  google-calendar-agenda — a agenda do dia, para a automação do WhatsApp.

  É a porta que o n8n chama. Ela não usa sessão de usuário: autentica por uma
  CHAVE DE INTEGRAÇÃO deste sistema (gerada em Configurações), nunca por
  credencial do Google. A automação, portanto, nunca vê o refresh_token, não
  lida com token expirando de hora em hora e não conhece o formato da API do
  Google — se um dia a integração mudar de provedor, o n8n não muda.

  A chave é comparada por SHA-256 dentro do banco (`resolve_integration_api_key`)
  e é ela que diz de QUAL escritório é a agenda pedida. Nenhum parâmetro da
  requisição escolhe tenant: quem escolhe é a chave.
*/

import {
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
} from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { accessTokenFromRefresh, googleOAuthConfig, listEvents } from '../_shared/google.ts'

const FN = 'google-calendar-agenda'

/* Goiânia. O escritório é um só, e o fuso é o do escritório — não o do
   servidor, que roda em UTC e mostraria o dia errado depois das 21h. */
const TIME_ZONE = 'America/Sao_Paulo'

const MAX_EVENTS = 50

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function todayAt(timeZone: string): string {
  /* `en-CA` porque o formato dele é YYYY-MM-DD. */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/*
  O deslocamento do fuso NAQUELE dia, e não um "-03:00" fixo: o Brasil já teve
  horário de verão e pode ter de novo. Fixar o deslocamento faria a agenda
  deslizar uma hora no dia em que voltasse.
*/
function offsetFor(date: string, timeZone: string): string {
  const reference = new Date(`${date}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(reference)
    .find((part) => part.type === 'timeZoneName')?.value

  /* "GMT-03:00" → "-03:00"; "GMT" (fuso sem deslocamento) → "+00:00". */
  const match = parts?.match(/GMT([+-]\d{2}:\d{2})/)
  return match ? match[1] : '+00:00'
}

function timeOf(iso: string | undefined, timeZone: string): string | null {
  if (!iso) return null
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new HttpError(405, 'method_not_allowed', 'Método não suportado.')
    }

    const admin = serviceClient()

    /*
      O teto vem antes de tocar no banco com a chave. A chave tem 256 bits e não
      se adivinha, mas o limite fecha a porta para quem resolver bater nela em
      volume — e a automação legítima chama isto uma vez por dia.
    */
    await enforceRateLimit(req, admin, { limit: 60, windowSeconds: 60, scope: FN })

    const presented =
      req.headers.get('X-Integration-Key') ??
      req.headers.get('x-integration-key') ??
      ''

    if (presented.trim() === '') {
      throw new HttpError(401, 'missing_key', 'Chave de integração ausente.')
    }

    const { data: tenantId, error: keyError } = await admin.rpc('resolve_integration_api_key', {
      p_key: presented,
      p_scope: 'calendar_agenda',
    })

    if (keyError) {
      console.error(`[${FN}] falha ao resolver chave: ${keyError.code} ${keyError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível atender agora.')
    }

    /* Chave desconhecida e chave revogada respondem igual: quem apresenta uma
       chave inválida não ganha a informação de que ela já existiu. */
    if (!tenantId) {
      throw new HttpError(401, 'invalid_key', 'Chave de integração inválida.')
    }

    const url = new URL(req.url)
    const requested = url.searchParams.get('date')
    if (requested !== null && !DATE_ONLY.test(requested)) {
      throw new HttpError(400, 'invalid_date', 'Data inválida. Use o formato AAAA-MM-DD.')
    }
    const date = requested ?? todayAt(TIME_ZONE)

    const { data: connection, error: connectionError } = await admin
      .from('google_calendar_connections')
      .select('calendar_id, calendar_label, google_account_email')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (connectionError) {
      console.error(`[${FN}] falha ao ler conexao: ${connectionError.code} ${connectionError.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível atender agora.')
    }

    if (!connection) {
      throw new HttpError(
        409,
        'not_connected',
        'Nenhuma conta Google conectada neste escritório. Conecte em Configurações → Integrações.',
      )
    }

    const { data: refreshToken, error: tokenError } = await admin.rpc(
      'google_calendar_refresh_token',
      { p_tenant_id: tenantId },
    )

    if (tokenError || !refreshToken) {
      console.error(`[${FN}] segredo indisponivel: ${tokenError?.code ?? 'sem linha'}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível atender agora.')
    }

    const offset = offsetFor(date, TIME_ZONE)
    const timeMin = `${date}T00:00:00${offset}`
    const timeMax = `${date}T23:59:59${offset}`

    let events
    try {
      const config = googleOAuthConfig()
      const accessToken = await accessTokenFromRefresh(config, refreshToken)
      events = await listEvents(
        accessToken,
        connection.calendar_id,
        timeMin,
        timeMax,
        TIME_ZONE,
        MAX_EVENTS,
      )
    } catch (googleError) {
      /*
        O ERRO É CARIMBADO NA CONEXÃO, e é isto que faz "o WhatsApp parou de
        chegar" ter por onde começar: a tela de Configurações mostra a data e o
        motivo da última falha, em vez de só deixar de funcionar.

        Causa mais comum: o diretor revogou o acesso na conta Google dele, e o
        refresh_token morreu. Nada aqui conserta isso — mas a tela passa a
        dizer o que aconteceu.
      */
      const detail = googleError instanceof Error ? googleError.message : 'erro desconhecido'
      await admin.rpc('google_calendar_record_result', {
        p_tenant_id: tenantId,
        p_error: detail,
      })
      console.error(`[${FN}] Google recusou: ${detail}`)
      throw new HttpError(
        502,
        'google_unavailable',
        'O Google não respondeu à leitura da agenda. Verifique a conexão em Configurações.',
      )
    }

    await admin.rpc('google_calendar_record_result', { p_tenant_id: tenantId, p_error: null })

    const items = events.map((event) => {
      const startIso = event.start?.dateTime ?? null
      const endIso = event.end?.dateTime ?? null
      const allDay = startIso === null

      return {
        id: event.id,
        titulo: event.summary?.trim() || '(sem título)',
        diaInteiro: allDay,
        /* `hora` existe para a mensagem do WhatsApp não precisar formatar data:
           é o horário já no fuso do escritório, pronto para concatenar. */
        hora: allDay ? null : timeOf(startIso ?? undefined, TIME_ZONE),
        horaFim: allDay ? null : timeOf(endIso ?? undefined, TIME_ZONE),
        inicio: startIso ?? event.start?.date ?? null,
        fim: endIso ?? event.end?.date ?? null,
        local: event.location?.trim() || null,
        descricao: event.description?.trim() || null,
        link: event.htmlLink ?? null,
        participantes: (event.attendees ?? [])
          .map((person) => person.displayName?.trim() || person.email || null)
          .filter((person): person is string => person !== null),
      }
    })

    /*
      A MENSAGEM PRONTA É CONVENIÊNCIA, NÃO CONTRATO. O n8n pode usá-la como
      está ou montar a dele a partir de `eventos` — os dois caminhos existem de
      propósito, porque o formato do texto é decisão de quem cuida do WhatsApp,
      e mudar texto não deveria exigir deploy deste sistema.
    */
    const linhas = items.map((item) =>
      item.diaInteiro
        ? `• ${item.titulo}${item.local ? ` — ${item.local}` : ''}`
        : `• ${item.hora} — ${item.titulo}${item.local ? ` (${item.local})` : ''}`,
    )

    const mensagem =
      items.length === 0
        ? `Agenda de ${date.split('-').reverse().join('/')}: nenhum compromisso.`
        : `Agenda de ${date.split('-').reverse().join('/')}:\n${linhas.join('\n')}`

    return jsonResponse(req, {
      data: date,
      fusoHorario: TIME_ZONE,
      agenda: {
        id: connection.calendar_id,
        nome: connection.calendar_label ?? connection.calendar_id,
        conta: connection.google_account_email,
      },
      totalEventos: items.length,
      /* Verdadeiro quando a agenda tem mais eventos do que o teto de leitura —
         a automação sabe que a lista está cortada em vez de anunciar um dia
         mais vazio do que ele é. */
      truncado: items.length >= MAX_EVENTS,
      eventos: items,
      mensagem,
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
