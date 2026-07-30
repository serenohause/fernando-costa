/*
  open-client-intake — resolve o token do formulário público de briefing.

  ESTA É A ÚNICA SUPERFÍCIE DO SISTEMA CHAMADA SEM SESSÃO. O que ela substitui
  está em projeto-original/src/pages/FormularioCliente.jsx, linhas 55-56:

      const intakes = await base44.entities.ClientIntake.list();
      const foundIntake = intakes.find(i => i.token === token);

  Isto é: a página pública baixava a lista INTEIRA de briefings para o navegador
  e comparava o token lá. `ClientIntake` carrega nome, WhatsApp, e-mail,
  CPF/CNPJ, nascimento e dois endereços completos — e a listagem acontecia ANTES
  de qualquer validação, então nem token válido era necessário. Não é decisão de
  layout, e por isso não entra na regra de fidelidade (docs/SCHEMA-PLAN.md, "O
  que o original faz, e por que não pode ser portado").

  AQUI O TOKEN NUNCA É COMPARADO NO NAVEGADOR. Esta função é o único caminho, e
  ela não faz a comparação por conta própria: repassa para
  public.open_client_intake(uuid), que é `security definer`, resolve dentro de
  uma transação com a linha travada e devolve UMA linha com três campos —
  desfecho, nome do cliente e fim da validade. Nenhum id interno, nenhum
  tenant_id, nenhum campo do briefing já preenchido têm caminho de saída: isso
  está na ASSINATURA da função de banco, checável no catálogo, e não na
  disciplina de quem escreve o mapeamento de JSON aqui.

  A função de banco não tem EXECUTE para anon nem para authenticated (migrations
  0025 e 0026) — só service_role. É por isso que esta função existe: sem ela, a
  alternativa seria dar EXECUTE a anon e deixar qualquer navegador varrer tokens
  contra /rest/v1/rpc sem nada no meio.

  O QUE FICA DESTE LADO, e é o motivo de a função não ser um proxy vazio:
  aplicar o limite de requisições (contado em public.hit_public_endpoint desde a
  migration 0027 — o contador é do banco, a decisão de responder 429 é daqui), o
  teto de tamanho do corpo, a origem permitida e a resposta HTTP.
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
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { serviceClient } from '../_shared/supabase.ts'

const FN = 'open-client-intake'

/*
  `.strict()` no objeto de nível superior, igual ao briefing de
  submit-client-intake: chave desconhecida derruba a requisição em vez de ser
  descartada em silêncio. Não é o que impede mass assignment (isso é o banco,
  migration 0025) — é consistência: as duas funções recusam payload que não é
  o desta versão do formulário.
*/
const bodySchema = z
  .object({
    token: z.string().trim().max(100),
  })
  .strict()

/*
  Contrato com a tela, e é o mesmo enum de public.client_intake_outcome
  (migration 0026). Cada valor corresponde a uma tela do original:

    not_found         → "Link Inválido ou Expirado"
    expired           → "Link Expirado"
    already_submitted → "Dados Enviados com Sucesso"
    active            → o formulário

  `not_found` cobre token inexistente E token com formato inválido, os dois
  indistinguíveis de propósito — é a única indistinguibilidade que sobrou depois
  da revisão da 0026, e a única que protege alguma coisa.
*/
type Outcome = 'active' | 'expired' | 'already_submitted' | 'not_found'

const NOT_FOUND = { status: 'resolved', outcome: 'not_found', clientName: null, expiresAt: null }

const UUID_V4_ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    /*
      O contador vem antes de qualquer trabalho — inclusive antes de ler o
      corpo. Quem estourou o teto não ocupa nem memória de parse.
    */
    const admin = serviceClient()
    await enforceRateLimit(req, admin, { limit: 20, windowSeconds: 60, scope: FN })

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Requisição inválida.')
    }

    /*
      Token fora do formato de uuid nem chega ao banco: a função de banco recebe
      `uuid` e um texto qualquer viraria erro 22P02, que a tela leria como
      "sistema com problema" em vez de "link inválido". Do ponto de vista de quem
      abriu a URL errada, os dois casos são a mesma coisa, e é assim que a
      resposta os trata.
    */
    if (!UUID_V4_ISH.test(parsed.data.token)) {
      return jsonResponse(req, NOT_FOUND)
    }

    const { data, error } = await admin
      .rpc('open_client_intake', { p_token: parsed.data.token })
      .maybeSingle()

    if (error) {
      /* code e message, nunca details nem hint: o `details` do Postgres traz a
         linha inteira, que aqui é o briefing de uma pessoa. */
      console.error(`[${FN}] falha ao resolver token: ${error.code} ${error.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível abrir o formulário agora.')
    }

    /*
      A função de banco devolve sempre uma linha. Zero linhas seria contrato
      quebrado, e a resposta certa nesse caso é a recusa genérica — nunca deixar
      a tela decidir o que fazer com ausência de dado.
    */
    if (!data) return jsonResponse(req, NOT_FOUND)

    const row = data as { outcome: Outcome; client_name: string | null; expires_at: string | null }

    /*
      O nome do cliente só sai no desfecho que a tela usa: `active`, que o
      exibe no título do formulário (FormularioCliente.tsx). As telas de
      `expired` e `already_submitted` são texto fixo — não mostram nome nenhum,
      nem no original. Devolver o nome ali era dar o nome do cliente a quem
      apresenta um token que não abre mais nada.
    */
    const isActive = row.outcome === 'active'

    return jsonResponse(req, {
      status: 'resolved',
      outcome: row.outcome,
      clientName: isActive ? row.client_name : null,
      expiresAt: isActive ? row.expires_at : null,
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
