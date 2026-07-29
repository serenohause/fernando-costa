/*
  reject-access-request — recusa uma solicitação de acesso.

  No original isso não é edge function: a página AprovacoesAcesso escreve
  `status: 'Recusada'` direto na entidade, com `aprovado_por_id` e
  `aprovado_por_nome` vindos do cliente. Aqui access_requests tem RLS ligada e
  nenhuma policy de escrita (migration 0011), então a recusa precisa passar por
  service_role — e, passando, a assinatura da decisão deixa de ser um campo que
  o cliente escolhe e passa a ser derivada do JWT.

  Não usa função do Postgres porque não há nada para tornar atômico: é um único
  UPDATE. O `eq('status', 'pending')` no WHERE é o que impede duas recusas
  simultâneas, ou uma recusa em cima de uma aprovação já gravada — sem ele
  haveria janela entre a leitura e a escrita.
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

const FN = 'reject-access-request'

const bodySchema = z.object({
  requestId: z.uuid(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Dados inválidos para recusar a solicitação.')
    }

    const { data: request, error: requestError } = await admin
      .from('access_requests')
      .select('id, tenant_id, status')
      .eq('id', parsed.data.requestId)
      .maybeSingle()

    if (requestError) {
      console.error(`[${FN}] falha ao ler solicitacao:`, requestError)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }
    if (!request) {
      throw new HttpError(404, 'request_not_found', 'Solicitação não encontrada.')
    }

    const approver = await requireDirectorOfTenant(admin, user.id, request.tenant_id)

    if (request.status !== 'pending') {
      throw new HttpError(409, 'request_not_pending', 'Esta solicitação já foi decidida.')
    }

    const { data: updated, error: updateError } = await admin
      .from('access_requests')
      .update({
        status: 'rejected',
        decided_by: approver.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error(`[${FN}] falha ao recusar solicitacao:`, updateError)
      throw new HttpError(500, 'internal_error', 'Não foi possível recusar a solicitação.')
    }

    if (!updated) {
      throw new HttpError(409, 'request_not_pending', 'Esta solicitação já foi decidida.')
    }

    /*
      AQUI ENTRARIA O E-MAIL avisando o solicitante de que o pedido foi
      recusado. O original envia neste ponto (AprovacoesAcesso.jsx, mutation
      `recusarMutation`), via base44.integrations.Core.SendEmail. Não há
      provedor de e-mail definido neste projeto (decisão registrada em
      docs/ARCHITECTURE.md), então nada é enviado.
    */

    return jsonResponse({
      status: 'rejected',
      requestId: updated.id,
      decidedBy: approver.id,
      message: 'Solicitação recusada.',
    })
  } catch (error) {
    return errorResponse(error, FN)
  }
})
