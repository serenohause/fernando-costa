/*
  create-collaborator-login — cria o login de um colaborador com senha
  provisória, ou redefine a senha de quem já tem login.

  NÃO EXISTE NO ORIGINAL, e substitui o que lá era a coluna
  `Collaborator.senha_temporaria`: senha em texto puro na tabela, visível na
  listagem da Equipe. Aqui a senha vai para o Auth do Supabase, que guarda hash,
  e não encosta em `collaborators`. Quem a digita é o Diretor, uma vez; depois
  dela, só a própria pessoa.

  POR QUE EDGE FUNCTION, E NÃO O CLIENTE
  Criar usuário com senha é Admin API, que exige a chave de serviço. Chave de
  serviço no navegador é o fim de qualquer isolamento entre escritórios — ela
  passa por cima de toda RLS.

  A SENHA É PROVISÓRIA DE VERDADE: o usuário nasce com
  `user_metadata.senha_provisoria = true`, e a tela obriga a troca no primeiro
  acesso (ver src/features/auth). Enquanto não trocar, o sistema não abre.

  DUAS COISAS QUE ESTA FUNÇÃO NÃO FAZ, de propósito:
  - Não cria colaborador. A linha já existe quando se chega aqui; isto é só o
    login dela. Criar os dois no mesmo lugar duplicaria as regras do formulário.
  - Não dá permissão nenhuma. A matriz nasce toda em falso, como na aprovação de
    acesso (0013): ter login não é ver tela. Quem libera é o Diretor, na tela de
    Controle de Acesso.
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
import { requireDirectorOfTenant, requireUser, serviceClient } from '../_shared/supabase.ts'

const FN = 'create-collaborator-login'

/*
  O mínimo de 8 é o padrão do Supabase Auth. O máximo de 72 é limite do bcrypt:
  acima disso o resto é ignorado em silêncio, e uma senha que "funciona cortada"
  é pior que uma recusada.
*/
const bodySchema = z.object({
  collaboratorId: z.uuid(),
  password: z.string().min(8, 'mínimo de 8 caracteres').max(72),
})

const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  collaborator_not_found: {
    status: 404,
    code: 'collaborator_not_found',
    message: 'Colaborador não encontrado.',
  },
  not_authorized: {
    status: 403,
    code: 'forbidden',
    message: 'Apenas um Diretor ativo do escritório pode criar o login de um colaborador.',
  },
  collaborator_without_email: {
    status: 409,
    code: 'collaborator_without_email',
    message: 'Este colaborador não tem e-mail cadastrado, e o e-mail é o login.',
  },
  user_already_linked: {
    status: 409,
    code: 'user_already_linked',
    message: 'Este e-mail já é o login de outro colaborador do escritório.',
  },
  user_in_other_tenant: {
    status: 409,
    code: 'user_in_other_tenant',
    message: 'Este e-mail já tem login em outro escritório e não pode servir aos dois.',
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()
    const user = await requireUser(req, admin)

    const parsed = bodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      throw new HttpError(
        400,
        'invalid_body',
        'A senha provisória precisa ter de 8 a 72 caracteres.',
      )
    }
    const input = parsed.data

    /*
      O tenant sai do colaborador, nunca do corpo: é contra ele que a permissão
      de quem chama é conferida. Aceitar tenant_id do cliente seria deixar um
      Diretor de um escritório criar login no outro.
    */
    const { data: collaborator, error: readError } = await admin
      .from('collaborators')
      .select('id, tenant_id, email, name, user_id')
      .eq('id', input.collaboratorId)
      .maybeSingle()

    if (readError) {
      console.error(`[${FN}] falha ao ler colaborador:`, readError)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }
    if (!collaborator) {
      throw new HttpError(404, 'collaborator_not_found', 'Colaborador não encontrado.')
    }
    if (!collaborator.email) {
      throw new HttpError(
        409,
        'collaborator_without_email',
        'Este colaborador não tem e-mail cadastrado, e o e-mail é o login.',
      )
    }

    await requireDirectorOfTenant(admin, user.id, collaborator.tenant_id)

    const { data: existingId, error: lookupError } = await admin.rpc('find_auth_user_by_email', {
      p_email: collaborator.email,
    })

    if (lookupError) {
      console.error(`[${FN}] falha ao procurar login existente:`, lookupError)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }

    let authUserId = existingId as string | null
    /* Só o que ESTA requisição criou é desfeito em caso de erro adiante. */
    let createdHere = false

    if (authUserId) {
      const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
        password: input.password,
        user_metadata: { senha_provisoria: true },
      })
      if (updateError) {
        console.error(`[${FN}] falha ao redefinir a senha:`, updateError)
        throw new HttpError(500, 'internal_error', 'Não foi possível definir a senha.')
      }
    } else {
      /*
        `email_confirm: true` porque não há provedor de e-mail transacional neste
        projeto (docs/ARCHITECTURE.md): sem isso a conta nasceria esperando uma
        confirmação que nunca chega, e a pessoa não entraria nunca.
      */
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: collaborator.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { senha_provisoria: true },
      })
      if (createError || !created?.user) {
        console.error(`[${FN}] falha ao criar o login:`, createError)
        throw new HttpError(500, 'internal_error', 'Não foi possível criar o login.')
      }
      authUserId = created.user.id
      createdHere = true
    }

    const { data, error } = await admin.rpc('link_collaborator_login', {
      p_collaborator_id: collaborator.id,
      p_auth_user_id: authUserId,
      p_actor_user_id: user.id,
    })

    if (error) {
      /*
        A conta foi criada e o vínculo falhou: desfazer é obrigatório, senão
        sobra um login órfão que ninguém vê na tela e que bloqueia a próxima
        tentativa (o e-mail passa a "já existir"). Só se apaga o que ESTA
        requisição criou — conta que já existia antes não é nossa para apagar.
      */
      if (createdHere && authUserId) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(authUserId)
        if (rollbackError) {
          console.error(`[${FN}] login orfao em ${authUserId}:`, rollbackError)
        }
      }

      const mapped = RPC_ERRORS[error.message?.trim() ?? '']
      if (mapped) throw new HttpError(mapped.status, mapped.code, mapped.message)

      console.error(`[${FN}] rpc link_collaborator_login falhou:`, error)
      throw new HttpError(500, 'internal_error', 'Não foi possível concluir a operação.')
    }

    /*
      A senha NÃO volta na resposta, e isso é de propósito: quem a digitou é
      quem a leu. Devolvê-la aqui a colocaria no log do navegador, no cache da
      requisição e em qualquer print da tela de rede.
    */
    return jsonResponse(req, {
      status: createdHere ? 'created' : 'password_reset',
      ...(data as Record<string, unknown>),
      message: createdHere
        ? 'Login criado. A pessoa entra com o e-mail do cadastro e troca a senha no primeiro acesso.'
        : 'Senha redefinida. A pessoa troca a senha no próximo acesso.',
    })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
