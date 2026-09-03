import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { brasilApiCnpjResponseSchema, clientInputSchema, viaCepResponseSchema } from './schemas'
import type {
  Client,
  ClientInput,
  ClientListRow,
  CompanyLookup,
  DuplicateField,
  ZipcodeAddress,
} from './types'
import type { ProjectStatus } from '@/lib/enums'

export const crmKeys = {
  all: ['crm'] as const,
  clients: (search: string) => [...crmKeys.all, 'clients', search] as const,
  client: (id: string | null | undefined) => [...crmKeys.all, 'client', id] as const,
  clientsByIds: (ids: string[]) => [...crmKeys.all, 'clients-by-ids', [...ids].sort()] as const,
  /* Dentro de `all`: o painel mostra projetos e faturamento, e mexer no cliente
     não muda nenhum dos dois — mas gravar um cliente novo a partir de um
     briefing muda, e uma invalidação só cobre as duas telas. */
  history: (id: string) => [...crmKeys.all, 'history', id] as const,
}

/* `Client.list('name', 500)` é como o original carrega a tela. */
const CLIENTS_LIST_LIMIT = 500

const CRM_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    A chave de deduplicação do CRM, na forma `cpf:<digitos>` ou
    `email:<normalizado>`. É índice único PARCIAL (0065), e por isso ficou fora
    do primeiro inventário de mensagens — foi o teste supabase/tests/
    error-messages.mjs que a encontrou depois de passar a enxergar índice.
  */
  clients_tenant_id_client_key_key:
    'Já existe um cliente com este CPF/CNPJ ou e-mail neste escritório. Abra o cadastro que já existe em vez de criar um segundo — se forem pessoas diferentes, confira o documento digitado.',
  /*
    APAGAR UM CLIENTE esbarra em oito vínculos, e nenhum deles tem cascade — de
    propósito: sumir com o cadastro não pode sumir com contrato, dinheiro ou
    histórico. Cada frase nomeia o que trava e a tela onde se resolve, porque
    "violates foreign key constraint" não diz nada a quem está tentando limpar
    uma duplicata.
  */
  contracts_client_id_fkey:
    'Este cliente tem contrato. Exclua ou transfira o contrato em Contratos & Propostas antes de excluir o cadastro.',
  projects_client_id_fkey:
    'Este cliente tem projeto. Exclua ou transfira o projeto em Projetos antes de excluir o cadastro.',
  negotiations_client_id_fkey:
    'Este cliente tem negociação no Pipeline. Exclua ou transfira a negociação antes de excluir o cadastro.',
  accounts_receivable_client_id_fkey:
    'Este cliente tem parcelas em Contas a Receber. Dinheiro a receber não é excluído junto — resolva as parcelas antes.',
  activities_client_id_fkey:
    'Este cliente tem atividades vinculadas. Exclua ou desvincule as atividades antes de excluir o cadastro.',
  budget_checklists_client_id_fkey:
    'Este cliente tem checklist em Orçamento por Cliente. Exclua o checklist antes de excluir o cadastro.',
  client_intakes_client_id_fkey:
    'Este cliente tem briefing recebido. O briefing é histórico do escritório e não é excluído junto.',
  /*
    Só chega aqui quando a consulta de quem já ocupa o valor não devolveu nada
    (linha de outro escritório é invisível para a RLS, ou corrida entre duas
    gravações). Com o cliente em mão, quem fala é DuplicateClientError.
  */
  /*
    POR NOME DE CONSTRAINT. `map_properties.client_id` não tem cascade (migration
    0057): apagar um cliente não pode apagar em silêncio o pino que a equipe
    posicionou no mapa. Sem esta frase, a recusa chegaria à tela como o `23503`
    genérico, que descreve o caso contrário.
  */
  map_properties_client_id_fkey:
    'Este cliente tem propriedade marcada no Mapa, e ela não é excluída junto. Remova ou desvincule a propriedade no Mapa antes de excluir o cliente.',

  /*
    Teto de 200 caracteres em "quem indicou" (migration 0082). O schema Zod
    recusa antes, e o campo tem `maxLength` — esta frase é a terceira barreira,
    para o caso de a gravação chegar por outro caminho. Sem ela o usuário veria
    o nome da constraint.
  */
  clients_referrer_name_length_check:
    'O nome de quem indicou é longo demais (máximo de 200 caracteres). Use só o nome da pessoa.',

  /*
    Os dois checks da 0087. O formulário não deixa chegar a nenhum deles — a
    lista de indicadores exclui o cadastro em edição, e o ponteiro só é gravado
    junto com o nome —, mas gravação por outro caminho veria o nome da
    constraint sem estas frases.
  */
  /*
    Tetos dos campos de empresa (0091). O schema Zod e o `maxLength` do campo
    recusam antes; estas frases são a terceira barreira, para uma gravação por
    outro caminho não mostrar o nome da constraint.
  */
  clients_company_legal_name_length_check:
    'A razão social é longa demais (máximo de 200 caracteres).',
  clients_company_trade_name_length_check:
    'O nome fantasia é longo demais (máximo de 200 caracteres).',
  clients_company_state_registration_length_check:
    'A inscrição estadual é longa demais (máximo de 30 caracteres).',
  clients_company_address_state_length_check:
    'A UF da sede tem duas letras (ex.: GO).',

  clients_referrer_not_self_check:
    'Um cliente não pode ser indicado por ele mesmo. Escolha outro cliente ou digite o nome de quem indicou.',
  clients_referrer_client_needs_name_check:
    'Escolha o cliente que indicou ou digite o nome — o registro da indicação precisa do nome.',

  clients_tenant_id_phone_digits_key:
    'Outro cliente deste escritório já usa este telefone. Abra o cadastro que já tem o número em vez de criar um segundo.',

  '23505': 'Já existe um cliente cadastrado com este CPF/CNPJ, e-mail ou telefone.',
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
const DUPLICATE_LABEL: Record<DuplicateField, string> = {
  tax_id: 'este CPF/CNPJ',
  email: 'este e-mail',
  phone: 'este telefone',
}

export class DuplicateClientError extends Error {
  field: DuplicateField
  existing: Client | null

  constructor(field: DuplicateField, existing: Client | null) {
    const what = DUPLICATE_LABEL[field]
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

  QUAL CAMPO COLIDIU VEM DO NOME DA RESTRIÇÃO, e não de um palpite. Enquanto as
  chaves eram documento e e-mail, dava para deduzir pela precedência do
  `client_key` (documento manda; sem documento, sobrou o e-mail). O telefone
  (migration 0076) quebra essa dedução: um cliente COM CPF pode colidir por
  telefone, e o palpite antigo diria "CPF já cadastrado" — mandando a pessoa
  conferir um campo que está certo, enquanto o que colidiu fica invisível.

  O banco já diz qual foi: o nome do índice está na mensagem do 23505, e o
  trigger `clients_reject_key_collision` levanta o erro com esse mesmo nome de
  propósito, justamente para a tela não precisar adivinhar.

  A busca é por coluna indexada e não por `search_text`: aqui não é busca livre,
  é procurar um valor exato. Falha nesta consulta não vira erro novo — o usuário
  já está vendo uma recusa, e trocá-la por outra mensagem só perderia informação.
*/

/*
  O ESPELHO EM TYPESCRIPT DA COLUNA GERADA `phone_digits` (migration 0076).

  É uma segunda cópia da regra, e ela é deliberada: o banco calcula a coluna para
  GRAVAR, e a tela precisa da mesma conta para PROCURAR quem já ocupa o número.
  Não há como consultar a coluna sem reproduzir a normalização deste lado.

  Se as duas discordarem, o sintoma é discreto: o banco recusa a gravação e a tela
  não acha o cadastro existente — a pessoa vê "já existe" sem o link para abrir,
  que é justamente o que a mensagem foi desenhada para evitar. Por isso a regra
  está escrita aqui do mesmo jeito que na migration: o DDI sai só com 12 ou 13
  dígitos, porque com 11 o `55` é o DDD de Santa Maria/RS.
*/
function normalizePhoneForLookup(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits.slice(2)
  }
  return digits
}

const CONSTRAINT_FIELD: Record<string, DuplicateField> = {
  clients_tenant_id_tax_id_digits_key: 'tax_id',
  clients_tenant_id_client_key_key: 'tax_id',
  clients_tenant_id_email_normalized_key: 'email',
  clients_tenant_id_phone_digits_key: 'phone',
}

function collidedField(
  error: unknown,
  parsed: { tax_id: string | null; email: string | null },
): DuplicateField {
  const message = (error as { message?: string } | null)?.message ?? ''
  for (const [constraint, field] of Object.entries(CONSTRAINT_FIELD)) {
    if (message.includes(constraint)) {
      /*
        `client_key` é documento OU e-mail, na precedência da migration 0015 — o
        nome sozinho não distingue os dois, então aqui a dedução antiga continua
        valendo, e só aqui.
      */
      return constraint === 'clients_tenant_id_client_key_key'
        ? (parsed.tax_id?.replace(/\D/g, '') ? 'tax_id' : 'email')
        : field
    }
  }

  /* Restrição não reconhecida: cai na precedência antiga em vez de escolher um
     campo ao acaso. */
  return parsed.tax_id?.replace(/\D/g, '') ? 'tax_id' : 'email'
}

async function findConflictingClient(
  error: unknown,
  parsed: { tax_id: string | null; email: string | null; phone: string },
  excludeId?: string,
): Promise<DuplicateClientError> {
  const field = collidedField(error, parsed)

  let query = supabase.from('clients').select('*')
  if (field === 'tax_id') {
    const digits = parsed.tax_id?.replace(/\D/g, '') ?? ''
    if (!digits) return new DuplicateClientError(field, null)
    query = query.eq('tax_id_digits', digits)
  } else if (field === 'email') {
    if (!parsed.email) return new DuplicateClientError(field, null)
    query = query.eq('email_normalized', parsed.email)
  } else {
    const digits = normalizePhoneForLookup(parsed.phone)
    if (!digits) return new DuplicateClientError(field, null)
    query = query.eq('phone_digits', digits)
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

/* `null` além de `undefined` desde a migration 0064: `client_intakes.client_id`
   virou anulável, e quem chama passa a coluna direto. O `enabled` já trata os
   dois — a consulta simplesmente não sai. */
export function useClient(id: string | null | undefined) {
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

/*
  Os cadastros COMPLETOS de uma lista curta de ids.

  Existe porque `useClients` devolve `ClientListRow`, que é um `Pick` de oito
  colunas — o que a listagem desenha. Comparar um briefing contra ele apontaria
  divergência em CPF, nascimento e endereço só porque essas colunas não foram
  carregadas: o aviso do Pipeline diria "há o que aplicar" sobre campo nenhum.

  O recorte é por id e não por busca: quem chama tem em mãos os poucos clientes
  que mandaram briefing, e trazer a carteira inteira em `select *` para conferir
  três linhas seria pagar caro pela mesma resposta.
*/
export function useClientsByIds(ids: string[]) {
  const unicos = [...new Set(ids)].filter(Boolean)

  return useQuery({
    queryKey: crmKeys.clientsByIds(unicos),
    enabled: unicos.length > 0,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').in('id', unicos)
      if (error) throw error
      return data ?? []
    },
  })
}

/*
  O HISTÓRICO DO CLIENTE: os projetos dele e o que já foi faturado.

  Porta de projeto-original/src/components/clients/ClientHistory.jsx, que ficou
  de fora do módulo 2 com o motivo escrito em ClientDetail.tsx: as duas tabelas
  ainda não existiam. Elas subiram nos módulos 5 e 7 e ninguém voltou aqui.

  DUAS CONSULTAS RECORTADAS, e não duas listagens inteiras. O original baixa
  `Project.list()` e `AccountReceivable.list()` — o escritório todo — e filtra no
  navegador (linhas 11-19). São 74 projetos e 325 parcelas hoje, trazidos para
  mostrar os de UM cliente.

  A REGRA DE QUAIS PARCELAS CONTAM É A DO ORIGINAL, incluindo a parte estranha
  (24-34): entram as do cliente, e as que apontam para um projeto dele SEM
  cliente próprio. Parcela num projeto deste cliente mas registrada no nome de
  OUTRO cliente fica de fora — é o que `!r.client_id` faz lá, e mexer nisso
  mudaria o faturamento que o escritório enxerga hoje.

  Leitura larga por policy (`projects_select_active_collaborator` e a irmã de
  accounts_receivable): qualquer colaborador ativo do escritório lê as duas.
  Nenhuma porta de menu no meio — então este painel não corre o risco de mostrar
  "R$ 0 faturado" por falta de permissão, que seria mentira com cara de fato.
*/
export type ClientProjectHistory = {
  id: string
  name: string
  status: ProjectStatus
  city: string | null
  state: string | null
  revenue: number
  lastActivity: string
}

export type ClientHistory = {
  projects: ClientProjectHistory[]
  totalProjects: number
  totalRevenue: number
  /*
    O que está no total e NÃO aparece na coluna da tabela: parcela paga do
    cliente que não aponta para projeto nenhum.

    O original não expõe isso, e o resultado é um painel onde o total diz R$ 60
    mil sobre uma tabela cuja coluna soma R$ 55 mil — medido no dado real. Os
    dois números estão certos; o que falta é a frase que explica a diferença,
    sem a qual ela é lida como erro de conta.
  */
  unassignedRevenue: number
  averageTicket: number
  relationship: 'new' | 'active' | 'recurring' | 'inactive'
}

type HistoryReceivable = {
  id: string
  value: number
  status: string
  payment_date: string | null
  created_at: string
  client_id: string | null
  project_id: string | null
}

/*
  O ESTADO DO RELACIONAMENTO, na regra do original (43-80): sem projeto é Novo;
  dois ou mais é Recorrente; com um só, Ativo quando o projeto está em
  desenvolvimento ou em aprovação, e Inativo quando o último pagamento passou de
  180 dias. Sem pagamento nenhum, o original usa 999 dias — ou seja, Inativo.
*/
function relationshipOf(
  projects: { status: ProjectStatus }[],
  paid: HistoryReceivable[],
): ClientHistory['relationship'] {
  if (projects.length === 0) return 'new'
  if (projects.length >= 2) return 'recurring'

  if (projects.some((p) => p.status === 'in_development' || p.status === 'in_approval')) {
    return 'active'
  }

  const lastPayment = paid.reduce((latest, receivable) => {
    const when = new Date(receivable.payment_date ?? receivable.created_at).getTime()
    return when > latest ? when : latest
  }, 0)

  if (lastPayment === 0) return 'inactive'

  const days = (Date.now() - lastPayment) / (1000 * 60 * 60 * 24)
  return days > 180 ? 'inactive' : 'active'
}

export function useClientHistory(clientId: string | null | undefined) {
  return useQuery({
    queryKey: crmKeys.history(clientId ?? ''),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientHistory> => {
      const { data: projectRows, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, status, city, state, created_at, updated_at')
        .eq('client_id', clientId!)

      if (projectsError) throw projectsError
      const projects = projectRows ?? []
      const projectIds = projects.map((project) => project.id)

      /*
        `or` numa consulta só, e não duas: são as MESMAS linhas que alimentam o
        faturamento total e o de cada projeto, e buscá-las em dois momentos
        deixaria as duas contas discordarem quando alguém dá baixa no meio.
      */
      const filtro = [`client_id.eq.${clientId}`]
      if (projectIds.length > 0) filtro.push(`project_id.in.(${projectIds.join(',')})`)

      const { data: receivableRows, error: receivablesError } = await supabase
        .from('accounts_receivable')
        .select('id, value, status, payment_date, created_at, client_id, project_id')
        .or(filtro.join(','))

      if (receivablesError) throw receivablesError

      const receivables = (receivableRows ?? []).filter(
        (receivable) =>
          receivable.client_id === clientId ||
          (receivable.project_id !== null && receivable.client_id === null),
      ) as HistoryReceivable[]

      const paid = receivables.filter((receivable) => receivable.status === 'paid')
      const totalRevenue = paid.reduce((sum, receivable) => sum + Number(receivable.value ?? 0), 0)

      const withRevenue: ClientProjectHistory[] = projects
        .map((project) => {
          const paidHere = paid.filter((receivable) => receivable.project_id === project.id)

          /* Sem pagamento no projeto, a "última atividade" é a última mexida
             nele — é o que o original faz com updated_date (102). */
          const lastActivity = paidHere.reduce(
            (latest, receivable) => {
              const when = receivable.payment_date ?? receivable.created_at
              return when > latest ? when : latest
            },
            project.updated_at ?? project.created_at,
          )

          return {
            id: project.id,
            name: project.name,
            status: project.status,
            city: project.city,
            state: project.state,
            revenue: paidHere.reduce((sum, receivable) => sum + Number(receivable.value ?? 0), 0),
            lastActivity,
          }
        })
        .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))

      const assigned = withRevenue.reduce((sum, project) => sum + project.revenue, 0)

      return {
        projects: withRevenue,
        totalProjects: projects.length,
        totalRevenue,
        unassignedRevenue: totalRevenue - assigned,
        /* Divisão por projeto, como no original (41). Sem projeto, zero — e não
           uma divisão por zero virando NaN na tela. */
        averageTicket: projects.length > 0 ? totalRevenue / projects.length : 0,
        relationship: relationshipOf(projects, paid),
      }
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
        if (isUniqueViolation(error)) throw await findConflictingClient(error, parsed)
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
        if (isUniqueViolation(error)) throw await findConflictingClient(error, parsed, id)
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
  CONSULTA DE CNPJ — pedido do usuário, e não existe no original.

  BrasilAPI (`brasilapi.com.br/api/cnpj/v1/<cnpj>`): pública, sem chave, sem
  limite declarado para uso desta ordem, e com CORS liberado — o que importa
  porque quem chama é o navegador de quem cadastra, não um servidor nosso.
  Testada com um CNPJ real do escritório antes de entrar.

  Mesma disciplina do ViaCEP logo abaixo: a resposta passa por Zod antes de
  encostar no formulário. É entrada externa, e a tela vai escrever o que vier
  dela dentro de um cadastro de cliente.

  O QUE ELA NÃO FAZ: gravar. A consulta devolve valores para o formulário, e
  quem grava é quem clicar em salvar. Preencher e salvar sozinho transformaria
  um erro de digitação de CNPJ numa troca silenciosa de razão social.

  Falha de rede, CNPJ inexistente e resposta fora do formato devolvem null, e o
  formulário não muda — a tela avisa.
*/
export function useLookupCnpj() {
  return useMutation({
    mutationFn: async (cnpj: string): Promise<CompanyLookup | null> => {
      const digits = cnpj.replace(/\D/g, '')
      if (digits.length !== 14) return null

      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
        if (!response.ok) return null

        const parsed = brasilApiCnpjResponseSchema.safeParse(await response.json())
        if (!parsed.success) return null

        const d = parsed.data
        return {
          legalName: d.razao_social ?? '',
          tradeName: d.nome_fantasia ?? '',
          /* A API devolve o CEP sem pontuação; a máscara da tela formata. */
          zipcode: d.cep ?? '',
          street: d.logradouro ?? '',
          number: d.numero ?? '',
          complement: d.complemento ?? '',
          district: d.bairro ?? '',
          city: d.municipio ?? '',
          state: d.uf ?? '',
          status: d.descricao_situacao_cadastral ?? '',
          mainActivity: d.cnae_fiscal_descricao ?? '',
        }
      } catch {
        return null
      }
    },
  })
}

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
