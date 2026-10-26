/*
  impersonate-collaborator — emite uma sessão de OUTRA pessoa para um Diretor.

  É a função mais perigosa do sistema, e vale dizer por quê antes de qualquer
  coisa: o que ela devolve é uma credencial de login completa do colaborador
  alvo. Quem tiver a resposta na mão entra na conta dele. Nada aqui vai para
  log, nem para a URL, nem para a mensagem de erro.

  SÓ NO AMBIENTE DE DESENVOLVIMENTO. Quatro fechaduras independentes, e a mais
  forte é a primeira porque é server-side:

    1. o segredo IMPERSONATION_ENABLED, conferido logo abaixo. Sem ele a função
       recusa, mesmo publicada por engano em outro projeto;
    2. a função só é publicada no projeto de dev;
    3. a migration 0109 (tabela e `start_impersonation`) só é aplicada em dev;
    4. o gatilho na tela depende de VITE_IMPERSONATION, que só existe no
       .env.dev.

  POR QUE SESSÃO DE VERDADE
  O frontend poderia fingir: trocar o colaborador em `useCurrentCollaborator` e
  desenhar os menus do alvo. Isso responderia "o que ele consegue clicar" e
  mentiria sobre "o que ele consegue ler" — `can_view_menu`/`can_edit_menu` têm
  atalho de Diretor e `auth_collaborator_id()` continuaria devolvendo o Diretor.
  Com sessão real quem responde é a RLS, uma vez só, para o sistema inteiro.

  A DIVISÃO DE TRABALHO, a mesma da 0013 e da 0108
  A AUTORIZAÇÃO E O REGISTRO são do banco (`start_impersonation`), que confere
  Diretor ativo, mesmo escritório, alvo ativo com login, e grava a trilha na
  mesma transação. Aqui ficam só as duas coisas que não existem em SQL: ler o
  JWT de quem chama e pedir o link à Admin API.

  O REGISTRO VEM ANTES DO TOKEN, e a ordem importa: depois de assumida a sessão,
  todo o resto do sistema grava a pessoa assumida como autora. A linha de
  auditoria é a única coisa que sabe quem estava de fato ao teclado.

  POR QUE MAGIC LINK, E NÃO TROCAR A SENHA
  `generateLink` devolve o hash do token sem enviar e-mail nenhum — o que
  importa porque este projeto não tem provedor de e-mail transacional. O token é
  de uso único e vida curta, e o navegador o troca por sessão com `verifyOtp`.
  A alternativa seria redefinir a senha do alvo, o que trancaria a pessoa para
  fora da própria conta.
*/

import { z } from 'npm:zod@4.6.7'
import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

const FN = 'impersonate-collaborator'

const bodySchema = z.object({
  collaboratorId: z.uuid(),
})

/*
  As mensagens que `start_impersonation` levanta (P0001), traduzidas. Cada uma
  diz o que aconteceu sem dizer nada sobre quem é o alvo: "não encontrado" e
  "de outro escritório" devolvem a MESMA mensagem de propósito, para a resposta
  não virar um oráculo que confirma a existência de cadastro alheio.
*/
const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  not_authorized: {
    status: 403,
    code: 'forbidden',
    message: 'Apenas um Diretor ativo do escritório pode acessar como outro colaborador.',
  },
  target_not_found: {
    status: 404,
    code: 'target_not_found',
    message: 'Colaborador não encontrado neste escritório.',
  },
  target_other_tenant: {
    status: 404,
    code: 'target_not_found',
    message: 'Colaborador não encontrado neste escritório.',
  },
  target_not_active: {
    status: 409,
    code: 'target_not_active',
    message: 'Este colaborador não está ativo. Só é possível acessar como quem está em atividade.',
  },
  target_without_login: {
    status: 409,
    code: 'target_without_login',
    message: 'Este colaborador não tem login no sistema, então não há sessão para assumir.',
  },
  target_without_email: {
    status: 409,
    code: 'target_without_email',
    message: 'Este colaborador não tem e-mail cadastrado, e o e-mail é o login.',
  },
  target_is_self: {
    status: 409,
    code: 'target_is_self',
    message: 'Você já está na sua própria conta.',
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    /*
      A PRIMEIRA FECHADURA, e a única que não depende de onde o código está.
      Conferida antes de ler o corpo, antes de olhar o JWT e antes de tocar no
      banco: em um projeto sem este segredo a função inteira não existe.
    */
    if (Deno.env.get('IMPERSONATION_ENABLED') !== 'true') {
      throw new HttpError(
        404,
        'not_available',
        'Acessar como colaborador não está disponível neste ambiente.',
      )
    }

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'Informe o colaborador a acessar.')
    }

    /*
      O ATOR VEM DO JWT, nunca do corpo. O corpo só diz QUEM se quer assumir; o
      escritório de quem pede é lido pelo banco a partir deste `user.id`, que a
      plataforma já validou. Aceitar o ator do corpo seria deixar qualquer um
      afirmar ser Diretor.
    */
    const { data, error } = await admin.rpc('start_impersonation', {
      p_actor_user_id: user.id,
      p_target_collaborator_id: parsed.data.collaboratorId,
    })

    if (error) {
      const mapped = RPC_ERRORS[error.message?.trim() ?? '']
      if (mapped) throw new HttpError(mapped.status, mapped.code, mapped.message)

      console.error(`[${FN}] rpc start_impersonation falhou:`, error)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }

    const target = data as {
      target_email: string
      target_name: string
      target_role: string
    }

    /*
      `generateLink` NÃO ENVIA e-mail: devolve o link e o hash do token para quem
      chamou. É o que torna isto possível num projeto sem provedor de e-mail, e
      é também por que a resposta precisa ser tratada como senha.
    */
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: target.target_email,
    })

    const tokenHash = link?.properties?.hashed_token

    if (linkError || !tokenHash) {
      /* A mensagem do GoTrue pode conter o e-mail; o log guarda só o código. */
      console.error(`[${FN}] falha ao emitir a sessao:`, linkError?.status ?? 'sem hashed_token')
      throw new HttpError(500, 'internal_error', 'Não foi possível abrir a sessão.')
    }

    /*
      O E-MAIL DO ALVO NÃO VOLTA. O navegador não precisa dele: `verifyOtp` com
      `token_hash` basta. Devolvê-lo seria espalhar dado pessoal por um caminho
      que não precisa dele.

      O nome e a função voltam porque é o que a faixa do topo mostra — e mostrar
      quem se está representando é a razão de a faixa existir.
    */
    return jsonResponse(req, {
      tokenHash,
      targetName: target.target_name,
      targetRole: target.target_role,
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
