import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { clientInputSchema, viaCepResponseSchema } from './schemas'
import type { Client, ClientInput, ClientListRow, DuplicateField, ZipcodeAddress } from './types'

export const crmKeys = {
  all: ['crm'] as const,
  clients: (search: string) => [...crmKeys.all, 'clients', search] as const,
  client: (id: string | undefined) => [...crmKeys.all, 'client', id] as const,
}

/* `Client.list('name', 500)` é como o original carrega a tela. */
const CLIENTS_LIST_LIMIT = 500

const CRM_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    Só chega aqui quando a consulta de quem já ocupa o valor não devolveu nada
    (linha de outro escritório é invisível para a RLS, ou corrida entre duas
    gravações). Com o cliente em mão, quem fala é DuplicateClientError.
  */
  '23505': 'Já existe um cliente cadastrado com este CPF/CNPJ ou e-mail.',
  '23502': 'Falta um campo obrigatório: nome, telefone, cidade, estado ou país.',
  '23514': 'Algum campo está fora do formato aceito. Confira o e-mail e os campos obrigatórios.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, CRM_ERROR_MESSAGES)
}

/*
  DECISÃO DO USUÁRIO, e é o ponto principal desta tela: não basta recusar a
  duplicata — a tela mostra QUEM já ocupa o documento, com link para abrir.

  O motivo está em docs/SCHEMA-PLAN.md: o erro quase nunca significa "quis criar
  duplicata". Significa "procurei e não achei" — porque o CPF foi digitado com
  outra pontuação, ou porque o cliente está gravado com outro nome. Devolver só
  "CPF já cadastrado" deixa a pessoa exatamente onde ela já estava: sem achar o
  cliente. Por isso o erro carrega a linha existente, e não só a frase.
*/
export class DuplicateClientError extends Error {
  field: DuplicateField
  existing: Client | null

  constructor(field: DuplicateField, existing: Client | null) {
    const what = field === 'tax_id' ? 'este CPF/CNPJ' : 'este e-mail'
    super(
      existing
        ? `Já existe um cliente cadastrado com ${what}: ${existing.name}.`
        : `Já existe um cliente cadastrado com ${what}.`,
    )
    this.name = 'DuplicateClientError'
    this.field = field
    this.existing = existing
  }
}

/*
  Traduz 23505 no cliente que ocupa o valor.

  Qual coluna consultar sai da própria definição de `client_key` (migration
  0015): documento tem precedência. Havendo documento, os DOIS índices únicos
  batem em `tax_id_digits`, então é por ele que se procura; sem documento, o que
  colidiu foi `client_key` na forma `email:<normalizado>`.

  A busca é por coluna indexada e não por `search_text`: aqui não é busca livre,
  é procurar um valor exato. Falha nesta consulta não vira erro novo — o usuário
  já está vendo uma recusa, e trocá-la por outra mensagem só perderia informação.
*/
async function findConflictingClient(
  parsed: { tax_id: string | null; email: string | null },
  excludeId?: string,
): Promise<DuplicateClientError> {
  const digits = parsed.tax_id?.replace(/\D/g, '') ?? ''
  const field: DuplicateField = digits ? 'tax_id' : 'email'

  let query = supabase.from('clients').select('*')
  if (digits) {
    query = query.eq('tax_id_digits', digits)
  } else if (parsed.email) {
    query = query.eq('email_normalized', parsed.email)
  } else {
    return new DuplicateClientError(field, null)
  }
  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query.limit(1).maybeSingle()
  return new DuplicateClientError(field, data ?? null)
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  Busca livre em UM `ilike` sobre `search_text` (migrations 0015 e 0016), que já
  cobre nome, e-mail, telefone, documento em dígitos e cidade. O original monta
  cinco comparações em memória, e uma delas nunca funcionou (`client.city`, campo
  que não existe na entidade). Repetir o predicado em cada tela, cada uma de uma
  forma, é o caminho garantido para perder o índice de trigrama.

  Leitura larga por decisão da policy `clients_select_active_collaborator`:
  qualquer colaborador ativo do escritório lê. A lista não é escondida de ninguém
  — quem esconde o menu CRM de quem não deve vê-lo é a permissão de menu.

  `search_text` grava o documento nas DUAS formas, como digitado e só dígitos
  (migration 0020), além de nome, e-mail, telefone e cidade. Então tanto
  "81624739025" quanto "816.247.390-25" encontram o cliente, e o telefone
  formatado continua encontrando. Os dois gestos são comuns e legítimos:
  digitar só números, e colar o documento de uma planilha.
*/

/*
  Colunas explícitas, e não `select('*')`.

  A tabela exibe oito campos. `select('*')` mandava também CPF, data de
  nascimento, os dois endereços completos, observações e as quatro colunas
  derivadas de deduplicação — de TODOS os clientes, para qualquer colaborador
  ativo. A leitura larga é o recorte aprovado e a policy autoriza, então isso
  não atravessa autorização nenhuma. Mas o redirecionamento de rota que manda
  Arquiteto para fora do CRM é cosmético: a API não redireciona ninguém, e um
  único GET entregava o cadastro inteiro de todo mundo a quem a tela nem deixa
  entrar.

  `search_text`, `client_key`, `tax_id_digits` e `email_normalized` não têm
  motivo para chegar ao navegador em nenhuma tela — existem para o banco
  comparar e indexar. `select('*')` continua no detalhe, onde o cadastro
  inteiro é justamente o que se está olhando.
*/
const CLIENTS_LIST_COLUMNS =
  'id, name, client_type, email, phone, address_city, address_state, address_country, lead_source'

export function useClients(search: string) {
  const term = search.trim()

  return useQuery({
    queryKey: crmKeys.clients(term),
    /* Mantém a tabela anterior na tela enquanto a busca nova não volta. */
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ClientListRow[]> => {
      let query = supabase
        .from('clients')
        .select(CLIENTS_LIST_COLUMNS)
        .order('name', { ascending: true })
        .limit(CLIENTS_LIST_LIMIT)

      if (term) query = query.ilike('search_text', `%${escapeLikePattern(term)}%`)

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

/*
  Curinga digitado é texto que a pessoa quer encontrar, não instrução de busca.

  `%`, `_` e `\` são os curingas do LIKE do Postgres. `*` entra na lista porque
  o PostgREST traduz `*` em `%` nos operadores `like`/`ilike` antes de chegar ao
  banco — sem ele na lista, digitar "*" listava o escritório inteiro, medido.
  É custo e confusão, não falha de confidencialidade: o filtro de escritório
  vive na policy, não no padrão, e nenhum termo escapa dele.
*/
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_*]/g, (character) => `\\${character}`)
}

/*
  O original lê a lista inteira e faz `find` no cliente para achar um id
  (ClientDetail.jsx:25). Aqui é consulta por chave primária: mesmo resultado, sem
  trazer 500 linhas para exibir uma.
*/
/*
  Carrega o cadastro inteiro de um cliente, sob demanda.

  Existe porque a LISTAGEM lê só as oito colunas que exibe (ver
  CLIENTS_LIST_COLUMNS). Editar a partir da lista precisa do resto — endereços,
  documento, observações — e buscar isso no clique é melhor que mandar o
  cadastro completo de 500 clientes para toda pessoa que abre a tela. Um pedido
  a mais, no momento em que ele é de fato necessário.
*/
export async function fetchClient(id: string): Promise<Client> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: crmKeys.client(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<Client | null> => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

export function useCreateClient() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: ClientInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = clientInputSchema.parse(input)

      const { data, error } = await supabase
        .from('clients')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('*')
        .single()

      if (error) {
        if (isUniqueViolation(error)) throw await findConflictingClient(parsed)
        throw error
      }
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all })
    },
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ClientInput }) => {
      const parsed = clientInputSchema.parse(input)

      const { data, error } = await supabase.from('clients').update(parsed).eq('id', id).select('*')

      if (error) {
        /* Editar para um documento que já é de outro cliente cai no mesmo 23505. */
        if (isUniqueViolation(error)) throw await findConflictingClient(parsed, id)
        throw error
      }
      /*
        `clients_update_crm_editor` filtra por USING: sem can_edit no menu `crm`
        (nem ser Diretor), nenhuma linha é alcançada e o PostgREST devolve zero
        linhas, sem erro. Sem esta conferência a tela diria "atualizado com
        sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhum cliente foi alterado. É preciso permissão de edição no CRM.',
      )
      return data![0]
    },
    /* `crmKeys.all` é prefixo de listagem E de detalhe: uma invalidação cobre as duas. */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all })
    },
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('clients').delete().eq('id', id).select('id')
      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum cliente foi excluído. É preciso permissão de edição no CRM.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all })
    },
  })
}

/* ── CEP ───────────────────────────────────────────────────────────────── */

/*
  Consulta de CEP do ClientForm.jsx original (ViaCEP, no `onBlur` do campo).

  Está aqui, e não no componente, pela regra do CLAUDE.md: acesso a dado sai de
  hook. E a resposta passa por Zod antes de encostar no formulário — é entrada
  externa, e o original a espalha direto no estado sem conferir nada.

  Falha de rede, CEP inexistente e resposta fora do formato devolvem null e o
  formulário não muda, como no original (que só escreve no console).
*/
export function useLookupZipcode() {
  return useMutation({
    mutationFn: async (zipcode: string): Promise<ZipcodeAddress | null> => {
      const digits = zipcode.replace(/\D/g, '')
      if (digits.length !== 8) return null

      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
        if (!response.ok) return null

        const parsed = viaCepResponseSchema.safeParse(await response.json())
        if (!parsed.success || parsed.data.erro) return null

        return {
          street: parsed.data.logradouro ?? '',
          district: parsed.data.bairro ?? '',
          city: parsed.data.localidade ?? '',
          state: parsed.data.uf ?? '',
        }
      } catch {
        return null
      }
    },
  })
}
