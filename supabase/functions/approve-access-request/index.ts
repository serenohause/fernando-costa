/*
  approve-access-request — porta de base44/functions/aprovarColaborador.

  O que mudou em relação ao original, e por quê:

  - A autorização deixa de aceitar o `admin` da plataforma base44 (que não tem
    equivalente aqui) e passa a exigir Diretor ativo do MESMO tenant da
    solicitação. O original compara `collaborator.email === user.email` sobre a
    lista inteira de colaboradores; aqui é uma leitura indexada por
    (tenant_id, user_id), e o vínculo é `user_id`, não string de e-mail.
  - Os campos que decidiam quem aprovou (`aprovadoPorId`, `aprovadoPorNome`)
    saem do corpo da requisição. Vinham do cliente no original, ou seja, dava
    para assinar a aprovação com o nome de outra pessoa. Agora `decided_by` é
    derivado do JWT, no servidor.
  - `solicitacaoEmail` e `solicitacaoNome` também saem do corpo: o e-mail que
    identifica o colaborador é o gravado na solicitação, lido pelo id.
  - Os três efeitos (colaborador, permissões, decisão) viram uma transação
    única, na função public.approve_access_request (migration 0013).
*/

import { z } from 'npm:zod@4.4.3'
import {
  assertPost,
  corsHeaders,
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { requireDirectorOfTenant, requireUser, serviceClient } from '../_shared/supabase.ts'

const FN = 'approve-access-request'

const COLLABORATOR_ROLES = [
  'director',
  'coordinator',
  'admin_staff',
  'finance',
  'architect',
  'intern',
] as const

const COLLABORATOR_AREAS = [
  'commercial',
  'projects',
  'operations',
  'administrative',
  'finance',
] as const

const bodySchema = z.object({
  requestId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(COLLABORATOR_ROLES),
  area: z.enum(COLLABORATOR_AREAS).nullish(),
  coordinatorId: z.uuid().nullish(),
  weeklyHours: z.number().min(0).max(168).nullish(),
})

/*
  Erros de negócio da função do Postgres chegam como P0001 com uma mensagem
  estável. Só esses são traduzidos; qualquer outro código vira 500 genérico,
  para não devolver nome de constraint ou trecho de SQL ao cliente.
*/
const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  request_not_found: {
    status: 404,
    code: 'request_not_found',
    message: 'Solicitação não encontrada.',
  },
  request_not_pending: {
    status: 409,
    code: 'request_not_pending',
    message: 'Esta solicitação já foi decidida.',
  },
  not_authorized: {
    status: 403,
    code: 'forbidden',
    message: 'Apenas um Diretor ativo do escritório pode aprovar solicitações de acesso.',
  },
  user_already_linked: {
    status: 409,
    code: 'user_already_linked',
    message: 'O login deste e-mail já está vinculado a outro colaborador do escritório.',
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Dados inválidos para aprovar a solicitação.')
    }
    const input = parsed.data

    /*
      O tenant vem da solicitação, nunca do corpo: é ele que define contra qual
      escritório a permissão de quem chama será conferida. Aceitar tenant_id do
      cliente seria deixar um Diretor de um escritório aprovar no outro.
    */
    const { data: request, error: requestError } = await admin
      .from('access_requests')
      .select('id, tenant_id, status')
      .eq('id', input.requestId)
      .maybeSingle()

    if (requestError) {
      console.error(`[${FN}] falha ao ler solicitacao:`, requestError)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }
    if (!request) {
      throw new HttpError(404, 'request_not_found', 'Solicitação não encontrada.')
    }

    await requireDirectorOfTenant(admin, user.id, request.tenant_id)

    const { data, error } = await admin.rpc('approve_access_request', {
      p_request_id: input.requestId,
      p_approver_user_id: user.id,
      p_name: input.name,
      p_role: input.role,
      p_area: input.area ?? null,
      p_coordinator_id: input.coordinatorId ?? null,
      p_weekly_hours: input.weeklyHours ?? null,
    })

    if (error) {
      const mapped = RPC_ERRORS[error.message?.trim() ?? '']
      if (mapped) throw new HttpError(mapped.status, mapped.code, mapped.message)

      console.error(`[${FN}] rpc approve_access_request falhou:`, error)
      throw new HttpError(500, 'internal_error', 'Não foi possível aprovar a solicitação.')
    }

    /*
      AQUI ENTRARIA O E-MAIL avisando o solicitante de que o acesso foi
      aprovado. O original envia neste ponto, via
      base44.integrations.Core.SendEmail. Não há provedor de e-mail definido
      neste projeto (decisão registrada em docs/ARCHITECTURE.md): ninguém é
      avisado, a pessoa descobre ao entrar de novo. Quando um provedor for
      escolhido (Resend ou SMTP do escritório), o envio entra neste ponto.
    */

    return jsonResponse({
      status: 'approved',
      ...(data as Record<string, unknown>),
      message: 'Solicitação aprovada. As permissões nascem todas em falso e precisam ser liberadas na tela de Controle de Acesso.',
    })
  } catch (error) {
    return errorResponse(error, FN)
  }
})
