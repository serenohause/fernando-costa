/*
  register-access-request — registra o pedido de acesso de quem já fez login
  mas ainda não é colaborador ativo. É o que a tela AcessoPendente precisa.

  Não existe no original. Substitui a função `registrarSolicitacao` que o
  Layout.jsx executava direto do cliente: lá o navegador listava TODAS as
  solicitações do escritório para procurar a sua, e gravava a linha por conta
  própria. Aqui nada disso é possível — access_requests tem RLS ligada e
  nenhuma policy de escrita (migration 0011), e tenant_email_domains não é nem
  legível pelo cliente (migration 0008).

  Por que precisa ser server-side: quem ainda não está em tenant_users não tem
  o claim app_metadata.tenant_id no JWT (migration 0006), e sem esse claim
  nenhuma policy consegue decidir a que escritório a linha pertence. Quem
  resolve o tenant é o domínio do e-mail, aqui dentro. O cliente nunca escolhe
  o tenant_id.
*/

import { z } from 'npm:zod@4.4.3'
import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

const FN = 'register-access-request'

/*
  O corpo é opcional e nunca decide nada sensível: tenant sai do domínio do
  e-mail e o e-mail sai do JWT. `name` é só a cortesia de exibir o nome que a
  pessoa digitou no cadastro, e `source` é telemetria.
*/
const bodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  source: z.enum(['login', 'signup', 'login_email', 'login_google']).optional(),
})

function fallbackName(user: { user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {}
  for (const key of ['full_name', 'name']) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 120)
  }
  return 'Usuário sem nome'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const email = user.email?.trim().toLowerCase()
    if (!email) {
      throw new HttpError(400, 'missing_email', 'A conta autenticada não tem e-mail.')
    }

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Dados inválidos na solicitação.')
    }
    const name = parsed.data.name ?? fallbackName(user)
    const source = parsed.data.source ?? 'login'

    // 1. Tenant pelo domínio do e-mail ---------------------------------------
    const domain = email.slice(email.lastIndexOf('@') + 1)
    const { data: domainRow, error: domainError } = await admin
      .from('tenant_email_domains')
      .select('tenant_id, tenants!inner(status)')
      .eq('domain', domain)
      .maybeSingle()

    if (domainError) {
      console.error(`[${FN}] falha ao resolver dominio:`, domainError)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }

    if (!domainRow) {
      throw new HttpError(
        403,
        'domain_not_allowed',
        `O domínio "${domain}" não está vinculado a nenhum escritório. Use o e-mail corporativo do escritório ou fale com quem cuida do sistema.`,
      )
    }

    const tenantStatus = (domainRow as unknown as { tenants: { status: string } }).tenants.status
    if (tenantStatus !== 'active') {
      throw new HttpError(403, 'tenant_suspended', 'O escritório deste domínio está suspenso.')
    }

    const tenantId = domainRow.tenant_id as string

    // 2. Colaborador já cadastrado esperando o primeiro login ----------------
    /*
      Caminho de quem o Diretor cadastrou antes de a pessoa entrar: a linha de
      collaborators já existe com user_id nulo (a coluna é nullable exatamente
      para isso, ver migration 0003). Aqui ela é vinculada, e nenhuma
      solicitação é criada — pedir aprovação de quem já foi aprovado seria
      recolocar a pessoa na fila.
    */
    const { data: collaborator, error: collaboratorError } = await admin
      .from('collaborators')
      .select('id, user_id, status')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .maybeSingle()

    if (collaboratorError) {
      console.error(`[${FN}] falha ao ler collaborators:`, collaboratorError)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }

    if (collaborator?.user_id && collaborator.user_id !== user.id) {
      throw new HttpError(
        409,
        'email_already_linked',
        'Este e-mail já está vinculado a outro login neste escritório.',
      )
    }

    if (collaborator && collaborator.user_id === null) {
      /*
        O `is('user_id', null)` no WHERE não é redundante com a leitura acima:
        é ele que torna o vínculo atômico. Duas requisições simultâneas do
        mesmo usuário só conseguem vencer uma vez.
      */
      const { data: linked, error: linkError } = await admin
        .from('collaborators')
        .update({ user_id: user.id })
        .eq('id', collaborator.id)
        .is('user_id', null)
        .select('id, status')
        .maybeSingle()

      if (linkError) {
        console.error(`[${FN}] falha ao vincular user_id:`, linkError)
        throw new HttpError(500, 'internal_error', 'Não foi possível vincular seu login ao cadastro.')
      }

      if (linked) {
        await ensureTenantMembership(admin, tenantId, user.id)
        return jsonResponse(req, {
          status: 'collaborator_linked',
          collaboratorStatus: linked.status,
          requiresReauth: true,
          message:
            'Seu cadastro já existia no escritório e foi vinculado a este login. Saia e entre novamente para carregar suas permissões.',
        })
      }
    }

    if (collaborator?.user_id === user.id) {
      await ensureTenantMembership(admin, tenantId, user.id)
      return jsonResponse(req, {
        status: 'collaborator_linked',
        collaboratorStatus: collaborator.status,
        requiresReauth: collaborator.status === 'active',
        message: 'Seu login já está vinculado ao cadastro deste escritório.',
      })
    }

    // 3. Solicitação de acesso ------------------------------------------------
    /*
      Existe índice único parcial `(tenant_id, email) where status = 'pending'`
      (migration 0005). O caminho normal é: tenta atualizar a pendente; se não
      houver nenhuma, insere. Se duas requisições simultâneas passarem pelo
      SELECT ao mesmo tempo, uma delas leva 23505 no INSERT — e aí a resposta
      certa não é erro, é atualizar a linha que a outra acabou de criar.

      O incremento de `attempts` é leitura-e-escrita, não `attempts + 1` no
      banco: o cliente PostgREST não expressa expressão de coluna em UPDATE. Em
      concorrência real duas tentativas podem gravar o mesmo número. É contador
      de telemetria, não controle de acesso — e ainda assim é bem mais firme do
      que o original, que decidia isso varrendo a lista inteira no navegador.
    */
    const bumped = await bumpPendingRequest(admin, tenantId, email)
    if (bumped) {
      return jsonResponse(req, {
        status: 'request_updated',
        attempts: bumped.attempts,
        message: 'Sua solicitação de acesso já está na fila, aguardando aprovação de um diretor.',
      })
    }

    const { data: created, error: insertError } = await admin
      .from('access_requests')
      .insert({
        tenant_id: tenantId,
        email,
        name,
        status: 'pending',
        last_attempt_at: new Date().toISOString(),
        attempts: 1,
        source,
      })
      .select('id, attempts')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const retried = await bumpPendingRequest(admin, tenantId, email)
        if (retried) {
          return jsonResponse(req, {
            status: 'request_updated',
            attempts: retried.attempts,
            message: 'Sua solicitação de acesso já está na fila, aguardando aprovação de um diretor.',
          })
        }
      }
      console.error(`[${FN}] falha ao criar solicitacao:`, insertError)
      throw new HttpError(500, 'internal_error', 'Não foi possível registrar sua solicitação.')
    }

    /*
      AQUI ENTRARIA O E-MAIL para os Diretores ativos do tenant, avisando que há
      uma solicitação nova na fila. O original faz isso em `notificarAdmins`
      (Layout.jsx) via base44.integrations.Core.SendEmail. Não há provedor de
      e-mail definido neste projeto (decisão registrada em
      docs/ARCHITECTURE.md), então nada é enviado e ninguém é notificado —
      alguém precisa abrir a tela de Controle de Acesso. Quando um provedor for
      escolhido (Resend ou SMTP do escritório), o envio entra neste ponto e a
      copy original das telas volta junto.
    */

    return jsonResponse(req, {
      status: 'request_created',
      requestId: created.id,
      attempts: created.attempts,
      message: 'Solicitação registrada. Um diretor do escritório precisa liberar seu acesso.',
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})

async function bumpPendingRequest(
  admin: ReturnType<typeof serviceClient>,
  tenantId: string,
  email: string,
): Promise<{ attempts: number } | null> {
  const { data: pending, error } = await admin
    .from('access_requests')
    .select('id, attempts')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (error) {
    console.error(`[${FN}] falha ao ler solicitacao pendente:`, error)
    throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
  }
  if (!pending) return null

  const { data: updated, error: updateError } = await admin
    .from('access_requests')
    .update({ attempts: (pending.attempts ?? 1) + 1, last_attempt_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('attempts')
    .maybeSingle()

  if (updateError) {
    console.error(`[${FN}] falha ao atualizar solicitacao pendente:`, updateError)
    throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
  }

  return updated ?? { attempts: (pending.attempts ?? 1) + 1 }
}

/*
  Sem linha em tenant_users o próximo JWT sai sem app_metadata.tenant_id
  (migration 0006) e a RLS não devolve nada — o colaborador vinculado veria uma
  tela vazia em vez do sistema. O vínculo de plataforma nasce como `member`;
  `owner` é decisão de plataforma, feita à mão.
*/
async function ensureTenantMembership(
  admin: ReturnType<typeof serviceClient>,
  tenantId: string,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from('tenant_users')
    .upsert({ tenant_id: tenantId, user_id: userId, role: 'member' }, { onConflict: 'tenant_id,user_id', ignoreDuplicates: true })

  if (error) {
    console.error(`[${FN}] falha ao criar vinculo em tenant_users:`, error)
    throw new HttpError(500, 'internal_error', 'Não foi possível concluir o vínculo com o escritório.')
  }
}
