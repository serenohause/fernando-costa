import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.111.0'
import { HttpError } from './http.ts'

/*
  Cliente service_role. Nasce dentro da função e nunca sai dela: a chave não vai
  para resposta, para log, nem para mensagem de erro. É o único caminho para
  escrever em access_requests e tenant_email_domains — as duas têm RLS ligada
  sem nenhuma policy de escrita (migrations 0008 e 0011), de propósito.
*/
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente da função.')
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/*
  Identifica quem está chamando pelo JWT da própria requisição, validando o
  token contra o GoTrue — nunca decodificando o payload por conta própria, que
  aceitaria um token forjado. Nada do corpo da requisição participa disso.

  A plataforma já rejeita chamada sem JWT quando verify_jwt está ligado no
  config.toml; esta checagem é a segunda barreira, e é a que vale se alguém um
  dia desligar aquela opção.
*/
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (token === '') {
    throw new HttpError(401, 'unauthenticated', 'É necessário estar autenticado.')
  }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) {
    throw new HttpError(401, 'unauthenticated', 'Sessão inválida ou expirada.')
  }

  return data.user
}

/*
  Autorização lida do banco, sempre. O corpo da requisição não decide nada:
  quem manda é a linha de collaborators do usuário do JWT, no tenant da própria
  solicitação.

  Só Diretor (`director`) gerencia equipe e aprova acesso. O original bloqueia
  a página Collaborators com "Apenas Admin e Diretor podem gerenciar
  colaboradores" e o `admin` de lá é papel da plataforma base44, que não tem
  equivalente aqui — sobra o Diretor.
*/
export async function requireDirectorOfTenant(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from('collaborators')
    .select('id, name, role, status')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    console.error('[authz] falha ao ler collaborators:', error)
    throw new HttpError(500, 'internal_error', 'Não foi possível verificar a permissão.')
  }

  if (!data || data.status !== 'active' || data.role !== 'director') {
    throw new HttpError(403, 'forbidden', 'Apenas um Diretor ativo do escritório pode decidir sobre solicitações de acesso.')
  }

  return { id: data.id, name: data.name }
}
