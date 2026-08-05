import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/lib/database.types'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { contractKeys } from '@/features/contracts/hooks'
import {
  financialCategoryInputSchema,
  payableInputSchema,
  receivableInputSchema,
} from './schemas'
import type {
  AccountPayable,
  DeleteRecurringOption,
  FinancialCategory,
  FinancialCategoryInput,
  FinancialStatusCounts,
  FinancialStatusFilter,
  FinancialSummary,
  GeneratedInstallments,
  MonthYear,
  PayableFilters,
  PayableInput,
  PayableRow,
  ReceivableFilters,
  ReceivableInput,
  ReceivableRow,
} from './types'

export const financialKeys = {
  all: ['financial'] as const,
  receivables: () => [...financialKeys.all, 'receivables'] as const,
  receivableList: (filters: ReceivableFilters) =>
    [...financialKeys.receivables(), filters] as const,
  payables: () => [...financialKeys.all, 'payables'] as const,
  payableList: (filters: PayableFilters) => [...financialKeys.payables(), filters] as const,
  /* DENTRO de `payables()`: a contagem do grupo muda a cada exclusão, e quem
     invalida a lista depois de apagar precisa derrubar o número junto. */
  recurrenceGroup: (parentId: string) =>
    [...financialKeys.payables(), 'recurrence-group', parentId] as const,
  categories: () => [...financialKeys.all, 'categories'] as const,
}

/* `AccountReceivable.list('-due_date')` é como o original carrega as telas — a
   lista inteira. Aqui já vem recortada por mês, então o teto é folga. */
const LIST_LIMIT = 500

const ACCOUNT_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    `accounts_receivable_contract_installment_key`. A parcela 3 de um contrato só
    existe uma vez. É a proteção que a migration 0041 escolheu no lugar da
    consulta prévia do original (Contracts.jsx:655), que não impede nada quando
    dois cliques passam pelo teste ao mesmo tempo.
  */
  '23505': 'Já existe uma parcela com esse número neste contrato.',
  '23503':
    'O cliente, o contrato ou o projeto informado não existe mais neste escritório.',
  '23502': 'Falta um campo obrigatório: descrição, valor e vencimento.',
  /*
    Os checks das migrations 0040 e 0041. Os schemas normalizam antes de gravar,
    então chegar aqui significa gravação vinda de outro caminho — a frase existe
    para não virar nome de constraint na tela.
  */
  '23514':
    'A conta está num estado que o sistema não aceita. Confira o valor, o status, a data de pagamento e o plano de recorrência.',
}

const CATEGORY_ERROR_MESSAGES: DatabaseErrorMessages = {
  /* `financial_categories_tenant_id_type_name_key`. */
  '23505': 'Já existe uma categoria com esse nome para esse tipo.',
  '23502': 'Falta um campo obrigatório: nome e tipo.',
  '23514': 'O nome da categoria não pode ficar em branco.',
}

/*
  DUAS funções, e não uma. `23505` significa coisas diferentes em cada tabela
  deste módulo — parcela duplicada num caso, nome de categoria repetido no outro
  — e uma frase que tentasse cobrir os dois não diria nada a ninguém.
*/
export function describeDatabaseError(error: unknown): string {
  return describeError(error, ACCOUNT_ERROR_MESSAGES)
}

export function describeCategoryError(error: unknown): string {
  return describeError(error, CATEGORY_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Datas ─────────────────────────────────────────────────────────────── */

/*
  `YYYY-MM-DD` no fuso LOCAL, como `getTodayISO`/`formatDateISO` do original
  (dateUtils.jsx). `toISOString().slice(0,10)` daria o dia errado em Goiânia
  depois das 21h — é o mesmo erro que a migration 0043 registra do lado do banco.
*/
function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/*
  O recorte de mês das duas telas: primeiro e último dia, pela data de
  VENCIMENTO (AccountsReceivable.jsx:140-153).

  A DIFERENÇA EM RELAÇÃO AO ORIGINAL É ONDE O FILTRO RODA. Lá a carteira inteira
  desce para o navegador e é peneirada em memória, a cada troca de mês; aqui é
  WHERE, e existe índice para ele desde a 0041
  (`accounts_receivable_tenant_id_due_date_idx`). O recorte é o mesmo, mês a mês,
  inclusive nas bordas.
*/
export function monthRange({ year, month }: MonthYear) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  return { from: toISODate(first), to: toISODate(last) }
}

export function monthYearOf(date: Date): MonthYear {
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function dateOfMonthYear({ year, month }: MonthYear): Date {
  return new Date(year, month, 1)
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  AS DUAS LISTAS LEEM DAS VIEWS, e não das tabelas.

  `accounts_receivable_status` / `accounts_payable_status` (migration 0043) são
  a linha mais `is_overdue` — e, no caso das despesas, mais `generated_count`.
  Assim o "Em atraso" que a lista mostra, o que o filtro usa, o que o cartão soma
  e o que o módulo 10 vai somar são literalmente o mesmo cálculo, feito por
  `public.is_financial_overdue`. No original essa mesma expressão está copiada em
  seis lugares.

  As views são SECURITY INVOKER: a RLS da tabela vale para quem consulta. Leitura
  larga por decisão das policies da 0042 — qualquer colaborador ativo do
  escritório lê a carteira; quem esconde Recebíveis e Pagamentos da sidebar é a
  permissão de menu, não a RLS.

  Os `*_name` do base44 saíram do schema (0041, item 1) e voltam como embed. O
  nome do relacionamento é o da CONSTRAINT porque as FK são compostas
  `(coluna, tenant_id)`.
*/
const RECEIVABLES_SELECT = `
  *,
  client:clients!accounts_receivable_client_id_fkey(id, name),
  contract:contracts!accounts_receivable_contract_id_fkey(id, contract_number),
  project:projects!accounts_receivable_project_id_fkey(id, name)
`

const PAYABLES_SELECT = `
  *,
  project:projects!accounts_payable_project_id_fkey(id, name)
`

export function useReceivables(filters: ReceivableFilters) {
  const { from, to } = monthRange(filters.period)

  return useQuery({
    queryKey: financialKeys.receivableList(filters),
    queryFn: async (): Promise<ReceivableRow[]> => {
      let query = supabase
        .from('accounts_receivable_status')
        .select(RECEIVABLES_SELECT)
        .gte('due_date', from)
        .lte('due_date', to)

      query = applyStatusFilter(query, filters.status)

      /* `sortedReceivables` do original (AccountsReceivable.jsx:219-226): mais
         recentes primeiro, por data de criação. */
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as ReceivableRow[]
    },
  })
}

export function usePayables(filters: PayableFilters) {
  const { from, to } = monthRange(filters.period)

  return useQuery({
    queryKey: financialKeys.payableList(filters),
    queryFn: async (): Promise<PayableRow[]> => {
      let query = supabase
        .from('accounts_payable_status')
        .select(PAYABLES_SELECT)
        .gte('due_date', from)
        .lte('due_date', to)

      /* O botão "Mostrar Recorrentes" (AccountsPayable.jsx:443-445): linha-MÃE
         ou ocorrência gerada. */
      if (filters.recurringOnly) {
        query = query.or('is_recurring.eq.true,recurrence_parent_id.not.is.null')
      }

      /*
        FILTRO QUE NÃO EXISTE NO ORIGINAL. Nenhuma das duas telas do base44
        recorta por categoria — a de pagamentos tem mês, texto, status e "só
        recorrentes". Ele existe aqui porque foi pedido para a camada de dados;
        `'all'` é o padrão e é o que reproduz a tela atual.
      */
      if (filters.category !== 'all') {
        query = query.eq('category', filters.category)
      }

      query = applyStatusFilter(query, filters.status)

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as PayableRow[]
    },
  })
}

/*
  Os quatro botões de status, traduzidos para WHERE. Os recortes do original
  (AccountsReceivable.jsx:173-191), com UMA correção:

  - `overdue`  → `is_overdue`, que é "não pago e vencido" (migration 0046).
  - `paid`     → `status = 'paid'`.
  - `pending`  → `status <> 'paid'`. O original testa
    `'Previsto' || 'Pendente'`, e 'Pendente' não é valor de status em lugar
    nenhum do base44 — é ramo morto.

  POR QUE `<> 'paid'` E NÃO `= 'forecast'`: com o teste do original, a parcela
  `renegotiated` que ainda NÃO VENCEU não aparecia em recorte nenhum — nem em
  "Previsto" (o status não é `forecast`), nem em "Recebido", nem em "Em atraso"
  (ainda não venceu). Só em "Todos". Dinheiro a receber invisível justamente na
  tela onde se cobra, e some também do cartão "Previsto", que soma as mesmas
  linhas.

  É a mesma escolha que a migration 0046 já fez do lado do banco, e pelo mesmo
  motivo: o predicado de dinheiro que não entrou é "diferente de pago", e assim
  status novo no enum já nasce contando.

  O QUE NÃO MUDOU, de propósito: parcela vencida e não paga continua contando NOS
  DOIS recortes, "Previsto" e "Em atraso", como no original — "Previsto" é o que
  há a receber, vencido ou não. Está no relatório.
*/
/*
  UMA função para as duas listas, e não a mesma cadeia de `if` copiada nas duas:
  o recorte é o mesmo, e a única coisa que muda entre recebíveis e pagamentos é
  a view consultada. As duas views têm as mesmas colunas `status` e `is_overdue`,
  e é só isso que este tipo exige de quem chama.
*/
type StatusFilterable<T> = {
  eq(column: 'status', value: 'paid'): T
  eq(column: 'is_overdue', value: boolean): T
  neq(column: 'status', value: 'paid'): T
}

function applyStatusFilter<T extends StatusFilterable<T>>(
  query: T,
  status: FinancialStatusFilter,
): T {
  if (status === 'overdue') return query.eq('is_overdue', true)
  if (status === 'paid') return query.eq('status', 'paid')
  if (status === 'pending') return query.neq('status', 'paid')
  return query
}

/*
  A ordem em que a tela de Pagamentos desenha as linhas
  (AccountsPayable.jsx:722-736): "Folha" no fim, o resto por data de criação
  decrescente. Não vira `.order()` porque o PostgREST não ordena por expressão, e
  é a ordem que o original mostra — a tela aplica isto sobre o que o hook devolve.
*/
export function sortPayables(rows: PayableRow[]): PayableRow[] {
  return [...rows].sort((a, b) => {
    const aPayroll = a.category === 'payroll'
    const bPayroll = b.category === 'payroll'
    if (aPayroll && !bPayroll) return 1
    if (!aPayroll && bPayroll) return -1
    return (b.created_at ?? '').localeCompare(a.created_at ?? '')
  })
}

/*
  "ESTE ESCRITÓRIO NÃO TEM NENHUMA CONTA" É OUTRA PERGUNTA, e as duas telas
  precisam dela.

  O original decide entre os dois vazios olhando a lista COMPLETA
  (AccountsReceivable.jsx:722): sem nenhuma conta cadastrada ele mostra o
  EmptyState com o botão "Adicionar Conta"; com contas, mas nenhuma no recorte
  atual, ele mostra a tabela com "Nenhuma conta encontrada com os filtros
  aplicados". São mensagens diferentes porque são situações diferentes — uma pede
  cadastro, a outra pede mudar o filtro.

  Como o recorte de mês passou a ser WHERE, a lista que a tela recebe não
  responde mais essa pergunta. Estas duas consultas respondem: `head: true`, ou
  seja, a contagem viaja no cabeçalho e nenhuma linha desce.
*/
function useHasAnyRows(
  table: 'accounts_receivable' | 'accounts_payable',
  key: readonly unknown[],
) {
  return useQuery({
    queryKey: [...key, 'any'],
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })

      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

export function useHasAnyReceivables() {
  return useHasAnyRows('accounts_receivable', financialKeys.receivables())
}

export function useHasAnyPayables() {
  return useHasAnyRows('accounts_payable', financialKeys.payables())
}

/*
  OS DOIS NÚMEROS DO DIÁLOGO DE EXCLUSÃO DE RECORRÊNCIA, contados sobre o GRUPO
  INTEIRO — e é uma correção em relação ao que estava aqui.

  O original conta em memória, sobre a lista completa de despesas, que lá desce
  toda para o navegador (AccountsPayable.jsx:418-435). Como o recorte de mês
  virou WHERE, a lista que a tela tem é de UM MÊS: a mesma conta em memória
  anunciava "1 pagamento futuro" para uma recorrência de dois anos, enquanto a
  exclusão — que roda no banco, sobre o grupo todo (`useDeleteRecurringPayables`)
  — apagava as vinte e quatro. Confirmação destrutiva que sub-relata o estrago é
  instrução falsa, então a contagem passou a ser consulta.

  `head: true` nas duas: a contagem viaja no cabeçalho e nenhuma linha desce.

  OS DOIS RECORTES SÃO OS DA EXCLUSÃO, e não "o grupo" genérico:

  - futuras = as OCORRÊNCIAS que `all_future` apaga (mesma recorrência, vencendo
    de hoje em diante, não pagas). A linha-MÃE fica de fora porque ela não é
    apagada, só encerrada — contá-la diria "será excluído" sobre uma linha que
    continua lá.
  - pagas = as do grupo inteiro, mãe inclusive, que é o que a exclusão preserva.
*/
export type RecurrenceGroupStats = { futureCount: number; paidCount: number }

export function useRecurrenceGroupStats(parentId: string | null | undefined) {
  return useQuery({
    queryKey: financialKeys.recurrenceGroup(parentId ?? ''),
    enabled: Boolean(parentId),
    queryFn: async (): Promise<RecurrenceGroupStats> => {
      if (!parentId) return { futureCount: 0, paidCount: 0 }
      const today = todayISO()

      const [future, paid] = await Promise.all([
        supabase
          .from('accounts_payable')
          .select('id', { count: 'exact', head: true })
          .eq('recurrence_parent_id', parentId)
          .gte('due_date', today)
          .neq('status', 'paid'),
        supabase
          .from('accounts_payable')
          .select('id', { count: 'exact', head: true })
          .or(`id.eq.${parentId},recurrence_parent_id.eq.${parentId}`)
          .eq('status', 'paid'),
      ])

      if (future.error) throw future.error
      if (paid.error) throw paid.error

      return { futureCount: future.count ?? 0, paidCount: paid.count ?? 0 }
    },
  })
}

/*
  Categorias financeiras. ATENÇÃO: nenhuma tela do original lê esta entidade
  (migration 0041) — não há de onde portar uma. A leitura existe porque a tabela
  existe; a tela que a consumir é decisão do usuário.
*/
export function useFinancialCategories() {
  return useQuery({
    queryKey: financialKeys.categories(),
    queryFn: async (): Promise<FinancialCategory[]> => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .order('type')
        .order('name')

      if (error) throw error
      return data ?? []
    },
  })
}

/* ── Agregados dos cartões do topo ─────────────────────────────────────── */

/*
  OS QUATRO CARTÕES — Total, Recebido/Pago, Previsto, Em atraso — como o original
  os calcula (AccountsReceivable.jsx:196-205 e AccountsPayable.jsx:504-513).

  POR QUE É FUNÇÃO PURA SOBRE AS LINHAS, E NÃO UMA CONSULTA DE AGREGAÇÃO.

  No original os cartões somam `filteredData` — exatamente as linhas que a tabela
  mostra, DEPOIS de todos os filtros, inclusive o de texto que roda em memória.
  Uma consulta separada de soma teria que repetir cada um desses filtros, e
  bastaria um deles divergir para os cartões pararem de descrever a tabela logo
  abaixo deles. Somando as mesmas linhas que a tela desenha, não há como divergir.

  CONSEQUÊNCIA QUE VEM DO ORIGINAL E FICA: escolher um status muda os cartões.
  Com "Pago" selecionado, "Total" passa a ser o total pago e "Previsto" vira zero,
  porque `filteredData` já está recortado. A tela chama esta função com a mesma
  lista que renderiza — se ela filtra texto em memória, filtra ANTES de chamar.

  Uma correção pequena em relação ao original: `overdue` sai de `is_overdue`, do
  banco, e não de `new Date(due_date) < new Date()`. As duas linhas do original
  que calculam atraso na soma (`stats`) e na contagem (`statusCounts`) usam
  critérios DIFERENTES entre si — uma compara com "agora", a outra com
  meia-noite — o que faz cartão e crachá discordarem por algumas horas por dia.
*/
type FinancialLike = { value: number; status: string; is_overdue: boolean }

function sum(rows: FinancialLike[]): number {
  return rows.reduce((total, row) => total + (row.value ?? 0), 0)
}

export function summarizeFinancial(rows: FinancialLike[]): FinancialSummary {
  return {
    total: sum(rows),
    paid: sum(rows.filter((row) => row.status === 'paid')),
    /* "Diferente de pago", e não "igual a previsto" — o mesmo recorte de
       `applyStatusFilter`, pelo mesmo motivo: parcela renegociada a vencer
       sumia do cartão. */
    pending: sum(rows.filter((row) => row.status !== 'paid')),
    overdue: sum(rows.filter((row) => row.is_overdue)),
  }
}

/* Os números entre parênteses nos botões de status
   (AccountsReceivable.jsx:207-217). Mesmos recortes de `applyStatusFilter`. */
export function countFinancialByStatus(rows: FinancialLike[]): FinancialStatusCounts {
  return {
    all: rows.length,
    overdue: rows.filter((row) => row.is_overdue).length,
    paid: rows.filter((row) => row.status === 'paid').length,
    pending: rows.filter((row) => row.status !== 'paid').length,
  }
}

/* ── Escrita: conta a receber ──────────────────────────────────────────── */

export function useCreateReceivable() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: ReceivableInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = receivableInputSchema.parse(input)

      const { data, error } = await supabase
        .from('accounts_receivable')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.receivables() })
    },
  })
}

/*
  O PARCELAMENTO MANUAL DO FORMULÁRIO, EM UMA GRAVAÇÃO SÓ.

  O original manda as N parcelas num `bulkCreate` (AccountsReceivable.jsx:111).
  A tela daqui vinha chamando `useCreateReceivable` em sequência, uma requisição
  por parcela: falha no meio — no limite de tamanho, na RLS, na unicidade
  `(tenant_id, contract_id, installment_number)` — deixava as parcelas anteriores
  criadas e a pessoa com meio parcelamento gravado, sem nada para desfazer.

  UM `insert` COM O ARRAY é um único INSERT no Postgres, e portanto uma única
  transação: ou entram todas, ou não entra nenhuma. Não é RPC nova nem migration
  — é o mesmo recurso que a geração de ocorrências de despesa recorrente já usa
  (`useCreatePayable`).

  As parcelas DE CONTRATO continuam sendo `generate_contract_installments`
  (migration 0044): lá a soma precisa fechar com o valor assinado e a bandeira do
  contrato muda na mesma transação. Aqui os valores são digitados um a um na
  tela, e o total é o que a pessoa escreveu.
*/
export function useCreateReceivableInstallments() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (inputs: ReceivableInput[]) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const rows = inputs.map((input) => ({
        ...receivableInputSchema.parse(input),
        tenant_id: tenantId,
      }))

      const { data, error } = await supabase.from('accounts_receivable').insert(rows).select('id')

      if (error) throw error
      /* INSERT barrado pela policy levanta erro (42501), diferente de UPDATE e
         DELETE; a conferência existe para o caso de o retorno vir vazio por
         outro caminho e a tela anunciar parcelas que não existem. */
      assertRowAffected(
        data,
        'Nenhuma parcela foi criada. É preciso permissão de edição em Recebíveis.',
      )
      return data.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.receivables() })
    },
  })
}

export function useUpdateReceivable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ReceivableInput }) => {
      const parsed = receivableInputSchema.parse(input)

      const { data, error } = await supabase
        .from('accounts_receivable')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      /*
        Escrita negada pela RLS em UPDATE não vira erro: a linha só não é
        alcançada e o PostgREST devolve zero linhas. Sem esta conferência a tela
        diria "atualizada com sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhuma conta foi alterada. É preciso permissão de edição em Recebíveis.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.receivables() })
    },
  })
}

export function useDeleteReceivable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('accounts_receivable')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma conta foi excluída. É preciso permissão de edição em Recebíveis.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.receivables() })
    },
  })
}

/*
  "Marcar como Pago" do menu de cada linha (AccountsReceivable.jsx:95-102): status
  e data do dia, na MESMA escrita.

  No original são um `update` só também, mas o banco agora cobra os dois juntos
  (`accounts_receivable_payment_date_matches_status_check`) — o que impede o
  estado que o original produz quando alguém muda só o status pelo formulário:
  parcela "Paga" sem data, que some de todo relatório por período.
*/
export function useMarkReceivablePaid() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('accounts_receivable')
        .update({ status: 'paid', payment_date: todayISO() })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A conta não foi marcada como paga. É preciso permissão de edição em Recebíveis.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.receivables() })
    },
  })
}

/* ── Escrita: conta a pagar ────────────────────────────────────────────── */

/*
  Criar despesa, e — quando ela é recorrente — gerar as ocorrências na sequência,
  como o original faz (AccountsPayable.jsx:127-147).

  POR QUE ISTO NÃO É UMA FUNÇÃO DE BANCO, ao contrário das parcelas de contrato:
  a recorrência não tem soma que precise fechar com um valor assinado. Cada
  ocorrência vale o mesmo que a mãe, e a policy de INSERT da 0042 já registra que
  a geração é INSERT comum feito pela tela.

  DOIS PALPITES DO ORIGINAL QUE O BANCO AGORA IMPEDE, e por isso saíram daqui:
  quando faltava a data de início ele usava `due_date` (linha 152), e quando a
  frequência não batia com o mapa ele assumia mensal (linha 171). Os dois geram
  lançamento financeiro em data que ninguém pediu — `recurrence_plan_check` cobra
  frequência e início, e o schema recusa antes.
*/
const RECURRENCE_MONTHS: Record<string, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
}

/*
  O TETO DE 120 É DO ORIGINAL (AccountsPayable.jsx:171), e o comportamento dele
  também: sem `recurrence_count` e sem data de término, uma recorrência mensal
  gera 119 ocorrências — dez anos de lançamentos. Fica como está, e fica
  registrado: o formulário oferece os dois limites como opcionais, então é um
  estado alcançável hoje, no sistema em produção.
*/
const MAX_OCCURRENCES = 120

function occurrenceRows(parent: AccountPayable): TablesInsert<'accounts_payable'>[] {
  const frequency = parent.recurrence_frequency
  const startDate = parent.recurrence_start_date
  if (!frequency || !startDate) return []

  const monthsToAdd = RECURRENCE_MONTHS[frequency]
  const [year, month, day] = startDate.split('-').map(Number)
  let current = new Date(year, month - 1, day)

  const endDate = parent.recurrence_end_date
  const count = parent.recurrence_count
  const maxIterations = count ?? MAX_OCCURRENCES

  const rows: TablesInsert<'accounts_payable'>[] = []
  for (let iteration = 1; iteration < maxIterations; iteration += 1) {
    current = addMonths(current, monthsToAdd)
    const due = toISODate(current)

    if (endDate && due > endDate) break

    rows.push({
      tenant_id: parent.tenant_id,
      supplier_name: parent.supplier_name,
      project_id: parent.project_id,
      category: parent.category,
      description: parent.description,
      value: parent.value,
      due_date: due,
      status: 'forecast',
      payment_method: parent.payment_method,
      /* Competência é o MÊS da ocorrência, presa ao dia 1 (migration 0041). No
         original é o texto `format(currentDate, 'MM/yyyy')`. */
      competence_month: `${due.slice(0, 7)}-01`,
      recurrence_parent_id: parent.id,
      /* Ocorrência não é mãe: `accounts_payable_occurrence_is_not_recurring_check`.
         O original grava o mesmo `is_recurring: false` (linha 205). */
      is_recurring: false,
    })
  }

  return rows
}

export function useCreatePayable() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: PayableInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = payableInputSchema.parse(input)

      const { data: parent, error } = await supabase
        .from('accounts_payable')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('*')
        .single()

      if (error) throw error
      if (!parent.is_recurring) return { id: parent.id, generated: 0 }

      const rows = occurrenceRows(parent)
      if (rows.length === 0) return { id: parent.id, generated: 0 }

      const { error: occurrenceError } = await supabase.from('accounts_payable').insert(rows)
      /*
        A mãe já existe neste ponto. Se as ocorrências falharem, o erro sobe — e
        a tela precisa dizer isso, porque o original engole a falha do
        `bulkCreate` no meio da mutation e mostra "criado com sucesso" para uma
        recorrência que não gerou nada.
      */
      if (occurrenceError) throw occurrenceError

      return { id: parent.id, generated: rows.length }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payables() })
    },
  })
}

/*
  Editar despesa. `updateAll` é o "Atualizar também todos os pagamentos
  recorrentes futuros desta série" do formulário (AccountPayableForm.jsx:358-371).

  O recorte dos futuros é o do original (AccountsPayable.jsx:237-242): mesma
  recorrência, vencimento de hoje em diante, e ainda não pagos. As colunas
  regravadas nos irmãos são as que o original regrava, MENOS `responsible_id` e
  `responsible_name`, que não existem no schema (migration 0041, item 7).

  O vencimento NÃO é propagado, como no original: cada ocorrência tem a sua data.
*/
export function useUpdatePayable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      input,
      current,
      updateAll = false,
    }: {
      id: string
      input: PayableInput
      current: AccountPayable
      updateAll?: boolean
    }) => {
      const parsed = payableInputSchema.parse(input)

      const { data, error } = await supabase
        .from('accounts_payable')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma conta foi alterada. É preciso permissão de edição em Pagamentos.',
      )

      if (!updateAll || !current.recurrence_parent_id) return { id, updatedCount: 1 }

      /*
        UMA requisição para os irmãos, e não uma por linha como no original
        (`Promise.all` de N updates, linha 245): aqui todas recebem os MESMOS
        valores, então um único UPDATE com `in`/`gte`/`neq` faz o serviço. A FK
        composta de `recurrence_parent_id` é o que garante que o grupo alcançado
        nunca sai do escritório.
      */
      const { data: siblings, error: siblingsError } = await supabase
        .from('accounts_payable')
        .update({
          supplier_name: parsed.supplier_name,
          category: parsed.category,
          description: parsed.description,
          value: parsed.value,
          payment_method: parsed.payment_method,
          project_id: parsed.project_id,
        })
        .eq('recurrence_parent_id', current.recurrence_parent_id)
        .neq('id', id)
        .gte('due_date', todayISO())
        .neq('status', 'paid')
        .select('id')

      if (siblingsError) throw siblingsError
      return { id, updatedCount: (siblings?.length ?? 0) + 1 }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payables() })
    },
  })
}

/*
  Excluir despesa avulsa, ou a ocorrência escolhida
  (AccountsPayable.jsx:279-292).

  Apagar a linha-MÃE de uma recorrência com ocorrências vivas falha na FK, de
  propósito (migration 0041): a tela precisa dizer o que fazer com os filhos, e
  ela já oferece essa escolha — ver `useDeleteRecurringPayables`.
*/
export function useDeletePayable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('accounts_payable')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma conta foi excluída. É preciso permissão de edição em Pagamentos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payables() })
    },
  })
}

/*
  As duas opções do DeleteRecurringDialog (AccountsPayable.jsx:294-350).

  `single` apaga só a linha escolhida e a recorrência continua.

  `all_future` apaga, do grupo inteiro, o que vence de hoje em diante e não está
  pago, e encerra a recorrência na linha-mãe. O grupo é resolvido com
  `recurrence_parent_id || id`, um único nível — que é o que o original assume
  (linha 419) e o que
  `accounts_payable_occurrence_is_not_recurring_check` garante no banco.

  ORDEM IMPORTA: as ocorrências saem ANTES da mãe, senão a FK recusa. O original
  apaga tudo em `Promise.all`, sem ordem definida, e depende de a mãe raramente
  estar no conjunto.
*/
export function useDeleteRecurringPayables() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      account,
      option,
    }: {
      account: AccountPayable
      option: DeleteRecurringOption
    }) => {
      if (option === 'single') {
        const { data, error } = await supabase
          .from('accounts_payable')
          .delete()
          .eq('id', account.id)
          .select('id')

        if (error) throw error
        assertRowAffected(
          data,
          'Nenhuma conta foi excluída. É preciso permissão de edição em Pagamentos.',
        )
        return { deleted: 1 }
      }

      const parentId = account.recurrence_parent_id ?? account.id
      const today = todayISO()

      const { data: children, error: childrenError } = await supabase
        .from('accounts_payable')
        .delete()
        .eq('recurrence_parent_id', parentId)
        .gte('due_date', today)
        .neq('status', 'paid')
        .select('id')

      if (childrenError) throw childrenError

      /*
        A mãe só é encerrada; ela não é apagada mesmo quando o vencimento dela
        também é futuro. É o que o original faz (linha 328-333) — encerrar
        preserva o histórico das ocorrências já pagas, que apontam para ela.
      */
      const { data: parent, error: parentError } = await supabase
        .from('accounts_payable')
        .update({ recurrence_status: 'ended' })
        .eq('id', parentId)
        .eq('is_recurring', true)
        .select('id')

      if (parentError) throw parentError

      assertRowAffected(
        [...(children ?? []), ...(parent ?? [])],
        'Nada foi excluído. É preciso permissão de edição em Pagamentos.',
      )
      return { deleted: children?.length ?? 0 }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payables() })
    },
  })
}

/*
  "Marcar como Pago" da tela de Pagamentos, que passa por um diálogo pedindo a
  forma de pagamento (MarkAsPaidDialog.jsx). Quando ninguém escolhe, o original
  mantém a forma que já estava na linha (linha 360).

  AS TRÊS COLUNAS DE AUDITORIA DO ORIGINAL — `paid_by_user_id`,
  `paid_by_user_name`, `paid_at` (linhas 362-364) — NÃO EXISTEM no schema: elas
  não estão declaradas na entidade `AccountPayable` do base44, ou seja, o
  original grava campos que a própria entidade não tem. Quem quiser auditoria de
  pagamento precisa de colunas de verdade, e isso é migration nova.
*/
export function useMarkPayablePaid() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      account,
      paymentMethod,
    }: {
      account: AccountPayable
      paymentMethod?: AccountPayable['payment_method']
    }) => {
      const { data, error } = await supabase
        .from('accounts_payable')
        .update({
          status: 'paid',
          payment_date: todayISO(),
          payment_method: paymentMethod ?? account.payment_method,
        })
        .eq('id', account.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A conta não foi marcada como paga. É preciso permissão de edição em Pagamentos.',
      )
      return account.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payables() })
    },
  })
}

/*
  DESFAZER O PAGAMENTO — não existe no original, em nenhuma das duas telas.

  Foi pedido para a camada de dados, e é o gesto simétrico do "Marcar como Pago":
  status volta a `forecast` e a data sai junto, porque o check
  `*_payment_date_matches_status_check` cobra os dois lados. Desfazer só o status
  deixaria data de pagamento em conta prevista, que é um dos estados que o base44
  aceita e a migration 0041 recusa.

  NENHUMA TELA DEVE GANHAR ESSE BOTÃO SEM DECISÃO DO USUÁRIO: no sistema atual,
  marcar como pago é irreversível pela interface, e acrescentar o caminho de
  volta muda o que a equipe pode fazer com um lançamento já conciliado.

  `table` é a metade que muda entre as duas telas; o resto é idêntico.
*/
function useUndoPayment(table: 'accounts_receivable' | 'accounts_payable', menu: string) {
  const queryClient = useQueryClient()
  const scope =
    table === 'accounts_receivable' ? financialKeys.receivables() : financialKeys.payables()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from(table)
        .update({ status: 'forecast', payment_date: null })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        `O pagamento não foi desfeito. É preciso permissão de edição em ${menu}.`,
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scope })
    },
  })
}

export function useUndoReceivablePayment() {
  return useUndoPayment('accounts_receivable', 'Recebíveis')
}

export function useUndoPayablePayment() {
  return useUndoPayment('accounts_payable', 'Pagamentos')
}

/*
  Pausar, reativar e encerrar a recorrência (AccountsPayable.jsx:527-549). Um
  UPDATE de uma coluna só, na linha-MÃE.

  Pausar não apaga as ocorrências já geradas; encerrar é o estado final que a
  exclusão em lote também deixa.
*/
export function useSetRecurrenceStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: NonNullable<AccountPayable['recurrence_status']>
    }) => {
      const { data, error } = await supabase
        .from('accounts_payable')
        .update({ recurrence_status: status })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A recorrência não foi alterada. É preciso permissão de edição em Pagamentos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payables() })
    },
  })
}

/* ── Escrita: categorias financeiras ───────────────────────────────────── */

export function useCreateFinancialCategory() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: FinancialCategoryInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = financialCategoryInputSchema.parse(input)

      const { data, error } = await supabase
        .from('financial_categories')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.categories() })
    },
  })
}

export function useUpdateFinancialCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: FinancialCategoryInput }) => {
      const parsed = financialCategoryInputSchema.parse(input)

      const { data, error } = await supabase
        .from('financial_categories')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      /* A escrita de categoria é presa ao menu `payables` (migration 0042): ela
         não tem item próprio na sidebar e é cadastro de apoio das despesas. */
      assertRowAffected(
        data,
        'Nenhuma categoria foi alterada. É preciso permissão de edição em Pagamentos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.categories() })
    },
  })
}

/*
  Apagar categoria. Não há FK de `accounts_payable` para cá — a categoria da
  despesa é enum, gravado na própria linha — então a exclusão não órfã nada, o
  que também quer dizer que ela não é barrada por nada. A migration 0042 registra
  que a tela precisa avisar.
*/
export function useDeleteFinancialCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('financial_categories')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma categoria foi excluída. É preciso permissão de edição em Pagamentos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.categories() })
    },
  })
}

/* ── Geração das parcelas do contrato ──────────────────────────────────── */

/*
  Os erros de negócio de `public.generate_contract_installments` (migration
  0044). Todos saem como P0001 com mensagem ESTÁVEL — a função foi escrita assim
  justamente para que a tradução vivesse aqui e não dependesse do texto do
  Postgres.

  `not_authorized` é o caso que precisa aparecer: a função é SECURITY DEFINER e
  confere `can_edit_menu('receivables')` POR DENTRO, então a recusa chega como
  erro da chamada, e não como zero linhas afetadas. Engolir isso deixaria a tela
  dizendo que gerou parcelas para quem não pode gerar nenhuma.
*/
const INSTALLMENT_ERRORS: Record<string, string> = {
  not_authorized:
    'Você não tem permissão para gerar as parcelas deste contrato. É preciso permissão de edição em Recebíveis.',
  contract_not_found: 'Contrato não encontrado neste escritório.',
  installment_plan_missing:
    'O contrato não tem plano de parcelamento. Preencha número de parcelas, primeiro vencimento e periodicidade no contrato.',
  total_value_not_positive: 'O valor total do contrato precisa ser maior que zero.',
  installment_value_too_small:
    'O valor do contrato é pequeno demais para esse número de parcelas.',
  installments_already_generated:
    'As parcelas deste contrato já foram geradas. Nenhuma parcela nova foi criada.',
}

/*
  "Gerar Parcelas" do menu de cada contrato (Contracts.jsx:651-717), agora em UMA
  transação no banco.

  O QUE A FUNÇÃO CORRIGE, e por isso a tela não faz mais nada disso:

  1. A soma das parcelas passa a ser EXATAMENTE o valor do contrato — a divisão
     acontece em centavos inteiros, com o resto na primeira parcela. A divisão
     simples do original erra centavos, e a diferença aparece na conciliação
     bancária meses depois.
  2. As parcelas e a bandeira `installments_generated` são a mesma transação. No
     original são duas requisições, e uma falha no meio deixa parcelas criadas
     com a bandeira apagada — o próximo clique cria tudo de novo.
  3. A proteção contra duplicata é a unicidade `(tenant_id, contract_id,
     installment_number)`, e não a consulta prévia do original, que dois cliques
     rápidos atravessam.

  Invalida também a lista de CONTRATOS: a bandeira que a linha mostra
  ("Geradas / Pendente") muda dentro desta mesma transação.
*/
export function useGenerateContractInstallments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (contractId: string): Promise<GeneratedInstallments> => {
      const { data, error } = await supabase.rpc('generate_contract_installments', {
        p_contract_id: contractId,
      })

      if (error) {
        const known = INSTALLMENT_ERRORS[error.message]
        if (known) throw new WriteError(known)
        throw error
      }

      return data as unknown as GeneratedInstallments
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.receivables() })
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })
}
