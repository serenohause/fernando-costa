import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Repeat,
  Tag,
  Trash2,
  Users,
  X as XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useNavigation } from '@/components/shared/useNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useMenuPermissions } from '@/features/auth/hooks'
import { useProjects } from '@/features/projects/hooks'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import {
  EXPENSE_CATEGORY,
  FINANCIAL_STATUS,
  labelOf,
  type ExpenseCategory,
  type PayablePaymentMethod,
} from '@/lib/enums'
import {
  countFinancialByStatus,
  describeDatabaseError,
  monthYearOf,
  sortPayables,
  summarizeFinancial,
  useCreatePayable,
  useDeletePayable,
  useDeleteRecurringPayables,
  useHasAnyPayables,
  useMarkPayablePaid,
  usePayables,
  useSetRecurrenceStatus,
  useUpdatePayable,
} from '../hooks'
import { filterPayablesBySearch, recurringStats } from '../payables-list'
import { exportPayablesPDF } from '../payables-pdf'
import AccountPayableForm, { toFormValues, type PayableFormValues } from './AccountPayableForm'
import DeleteRecurringDialog from './DeleteRecurringDialog'
import MarkAsPaidDialog from './MarkAsPaidDialog'
import MonthYearFilter from './MonthYearFilter'
import type {
  DeleteRecurringOption,
  FinancialStatusFilter,
  PayableFilters,
  PayableInput,
  PayableRow,
} from '../types'

/*
  Porta de projeto-original/src/pages/AccountsPayable.jsx.

  O cabeçalho, o botão de exportar PDF alinhado à direita, os quatro cartões de
  totais, o seletor de mês, o campo "Busca", os quatro botões de status com a
  contagem entre parênteses, o botão "Mostrar Recorrentes", as sete colunas da
  tabela, o menu de três pontos de cada linha e os três diálogos são os do
  original, na mesma ordem.

  OS BOTÕES DE STATUS SÃO OS DA PÁGINA, e não `FinancialFilters.tsx`: aquele
  componente não é importado por nenhuma página do original — é código pronto e
  desligado, com outra paleta e outro raio de borda. O que está no ar é isto
  aqui.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0042):

  - Leitura é larga (`accounts_payable_select_active_collaborator`): qualquer
    colaborador ativo do escritório lê a carteira. Quem esconde Pagamentos da
    barra lateral é a permissão de menu, não a RLS.
  - Escrita é `can_edit_menu('payables')` — Diretor entra pelo atalho da 0019.
    Sem ela, a tela não desenha "Nova Conta" nem o menu de cada linha; exportar o
    PDF continua disponível, porque é leitura.

  O QUE O HOOK JÁ FAZ, E POR ISSO NÃO ESTÁ AQUI:

  - Mês, status, categoria e "só recorrentes" viram WHERE em `usePayables`. O
    original peneira a carteira inteira em memória a cada troca de filtro.
  - "Em atraso" vem de `is_overdue`, calculado pela view (migration 0043). O
    original repete a expressão em seis lugares, com dois critérios diferentes
    entre o cartão e o crachá.
  - `sortPayables` continua sendo aplicado AQUI: "Folha" no fim, o resto por
    criação decrescente. O PostgREST não ordena por expressão.

  O QUE NÃO FOI PORTADO, E POR QUÊ:

  1. A "correção automática de datas" (linhas 64-115): um efeito que, ao abrir a
     tela, varria a lista atrás de data com timestamp e REESCREVIA as linhas
     encontradas, avisando por toast. As colunas são `date` desde a migration
     0041 — não existe timestamp para aparar, e um UPDATE em massa disparado por
     abrir uma tela não é algo que se porta por precaução.
  2. `base44.auth.me()` para carimbar quem pagou (linhas 53-57 e 362-364). As
     três colunas de auditoria não existem no schema nem na entidade do base44 —
     ver `useMarkPayablePaid`.
  3. A consulta de `clients` (linhas 122-125), cujo resultado nenhuma linha desta
     página lê.

  DIVERGÊNCIA HERDADA, MANTIDA DE PROPÓSITO: os quatro cartões e as contagens dos
  botões somam a lista JÁ FILTRADA, inclusive pelo próprio filtro de status. Com
  "Pago" selecionado, "Previsto" e "Em atraso" mostram zero e "Todos" mostra a
  contagem dos pagos. É o que o original faz (linhas 504-525).
*/

/*
  As cores de categoria (AccountsPayable.jsx:709-720), indexadas pelo valor do
  banco em vez do rótulo em português.

  "Escritório" (slate) e "Outros" (gray) são as duas neutras do original e
  chegam ao mesmo token: slate-50 e gray-50 diferem em menos de um por cento de
  luminância, e manter duas escalas cinza cravadas na classe é justamente o que
  o `@theme` existe para não ter.
*/
const CATEGORY_STYLES: Record<ExpenseCategory, string> = {
  payroll:
    'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  taxes:
    'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  office: 'bg-elevated text-soft border-border',
  software:
    'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900',
  marketing:
    'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900',
  travel:
    'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  contractors:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  materials:
    'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900',
  equipment:
    'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900',
  other: 'bg-elevated text-soft border-border',
}

const FILTER_BUTTON = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const FILTER_IDLE = 'bg-card text-soft hover:bg-elevated border border-border'

export default function AccountsPayable() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PayableRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; account: PayableRow | null }>({
    open: false,
    account: null,
  })
  const [deleteRecurringDialog, setDeleteRecurringDialog] = useState<{
    open: boolean
    account: PayableRow | null
  }>({ open: false, account: null })
  const [markAsPaidDialog, setMarkAsPaidDialog] = useState<{
    open: boolean
    account: PayableRow | null
  }>({ open: false, account: null })
  const [selectedMonthYear, setSelectedMonthYear] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState<FinancialStatusFilter>('all')
  const [showRecurringOnly, setShowRecurringOnly] = useState(false)
  const [clientFilter, setClientFilter] = useState('')

  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('payables')

  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])

  const filters = useMemo<PayableFilters>(
    () => ({
      period: monthYearOf(selectedMonthYear),
      status: statusFilter,
      /* O recorte por categoria existe na camada de dados e NÃO tem controle na
         tela: o original não filtra por categoria. Ver PayableFilters. */
      category: 'all',
      recurringOnly: showRecurringOnly,
    }),
    [selectedMonthYear, statusFilter, showRecurringOnly],
  )

  const payablesQuery = usePayables(filters)
  const hasAnyQuery = useHasAnyPayables()
  const projectsQuery = useProjects()

  const payables = useMemo(() => payablesQuery.data ?? [], [payablesQuery.data])

  /* A busca por texto é o único filtro que sobra em memória, como no original
     (linhas 463-478) — ela procura no nome do projeto e no fornecedor. */
  const visiblePayables = useMemo(
    () => sortPayables(filterPayablesBySearch(payables, clientFilter)),
    [payables, clientFilter],
  )

  const stats = useMemo(() => summarizeFinancial(visiblePayables), [visiblePayables])
  const statusCounts = useMemo(() => countFinancialByStatus(visiblePayables), [visiblePayables])

  const createMutation = useCreatePayable()
  const updateMutation = useUpdatePayable()
  const deleteMutation = useDeletePayable()
  const deleteRecurringMutation = useDeleteRecurringPayables()
  const markAsPaidMutation = useMarkPayablePaid()
  const recurrenceStatusMutation = useSetRecurrenceStatus()

  /* Referência estável de propósito: o formulário reinicia quando `initialData`
     muda, e recriar o objeto a cada render apagaria o que está sendo digitado. */
  const formInitialData = useMemo<PayableFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (input: PayableInput, updateAll: boolean) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input, current: editing, updateAll },
        {
          onSuccess: (result) => {
            closeForm()
            toast.success(
              result.updatedCount > 1
                ? `${result.updatedCount} pagamentos recorrentes atualizados!`
                : 'Conta atualizada com sucesso!',
            )
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(input, {
      onSuccess: () => {
        closeForm()
        toast.success(
          input.is_recurring
            ? 'Pagamento recorrente criado! Lançamentos futuros gerados automaticamente.'
            : 'Conta criada com sucesso!',
        )
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
    })
  }

  const handleEdit = (account: PayableRow) => {
    setEditing(account)
    setFormOpen(true)
  }

  /* Recorrente — a linha-mãe ou uma ocorrência dela — pergunta o que apagar. O
     resto vai direto para a confirmação simples (linhas 398-408). */
  const handleDelete = (account: PayableRow) => {
    if (account.is_recurring || account.recurrence_parent_id) {
      setDeleteRecurringDialog({ open: true, account })
      return
    }
    setDeleteDialog({ open: true, account })
  }

  const confirmDelete = () => {
    const target = deleteDialog.account
    if (!target) return

    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, account: null })
        toast.success('Conta excluída com sucesso!')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  const confirmDeleteRecurring = (option: DeleteRecurringOption) => {
    const target = deleteRecurringDialog.account
    if (!target) return

    deleteRecurringMutation.mutate(
      { account: target, option },
      {
        onSuccess: () => {
          setDeleteRecurringDialog({ open: false, account: null })
          toast.success(
            option === 'single'
              ? 'Lançamento excluído. Recorrência mantida.'
              : 'Recorrência encerrada e pagamentos futuros excluídos.',
          )
        },
        onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
      },
    )
  }

  const confirmMarkAsPaid = (paymentMethod?: PayablePaymentMethod) => {
    const target = markAsPaidDialog.account
    if (!target) return

    markAsPaidMutation.mutate(
      { account: target, paymentMethod },
      {
        onSuccess: () => {
          setMarkAsPaidDialog({ open: false, account: null })
          toast.success('Pagamento marcado como pago com sucesso!')
        },
        onError: (error) => toast.error('Erro ao marcar como pago: ' + describeDatabaseError(error)),
      },
    )
  }

  const changeRecurrence = (
    account: PayableRow,
    status: 'active' | 'paused' | 'ended',
    message: string,
  ) => {
    recurrenceStatusMutation.mutate(
      { id: account.id, status },
      {
        onSuccess: () => toast.success(message),
        onError: (error) => toast.error('Erro ao alterar recorrência: ' + describeDatabaseError(error)),
      },
    )
  }

  const handleExportPDF = () => {
    exportPayablesPDF({
      rows: visiblePayables,
      total: stats.total,
      statusFilter,
      period: selectedMonthYear,
    })
    toast.success('PDF exportado com sucesso')
  }

  const columns: Column<PayableRow>[] = [
    {
      header: 'Descrição',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              row.is_overdue
                ? 'bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-950/40 dark:to-rose-900/40'
                : row.is_recurring
                  ? 'bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40'
                  : 'bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-950/40 dark:to-amber-900/40'
            }`}
          >
            {row.is_overdue ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            ) : row.is_recurring ? (
              <Repeat className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <ArrowUpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">{row.description}</p>
              {row.is_recurring && (
                <Badge
                  variant="outline"
                  className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900 text-xs"
                >
                  <Repeat className="w-3 h-3 mr-1" />
                  Recorrente
                </Badge>
              )}
              {row.recurrence_parent_id && (
                <Badge variant="outline" className="bg-elevated text-soft border-border text-xs">
                  Gerado
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{row.supplier_name}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Categoria',
      cell: (row) => (
        <Badge variant="outline" className={CATEGORY_STYLES[row.category]}>
          <Tag className="w-3 h-3 mr-1" />
          {labelOf(EXPENSE_CATEGORY, row.category)}
        </Badge>
      ),
    },
    {
      header: 'Vencimento',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-faint" />
          <span className={row.is_overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
            {formatDateBR(row.due_date)}
          </span>
        </div>
      ),
    },
    {
      header: 'Pago Data',
      cell: (row) => {
        if (!row.payment_date || row.status !== 'paid') {
          return <span className="text-faint">-</span>
        }

        return (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {formatDateBR(row.payment_date)}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Valor',
      cell: (row) => (
        <span className="font-semibold text-foreground">{formatCurrencyBRL(row.value)}</span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => (
        <StatusBadge status={row.is_overdue ? 'Em atraso' : labelOf(FINANCIAL_STATUS, row.status)} />
      ),
    },
    {
      header: '',
      /* Quem não pode editar vê a lista sem os botões de ação: todos os itens
         deste menu são escrita. */
      cell: (row) =>
        canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Editar sempre primeiro */}
              <DropdownMenuItem onClick={() => handleEdit(row)}>
                <Pencil className="w-4 h-4 mr-2" />
                {row.recurrence_parent_id ? 'Editar este lançamento' : 'Editar'}
              </DropdownMenuItem>

              {/* Marcar como Pago - sempre mostrar se não estiver pago */}
              {row.status !== 'paid' && (
                <DropdownMenuItem onClick={() => setMarkAsPaidDialog({ open: true, account: row })}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Marcar como Pago
                </DropdownMenuItem>
              )}

              {/* Ações de recorrência */}
              {row.is_recurring && (
                <>
                  <DropdownMenuSeparator />
                  {row.recurrence_status === 'active' && (
                    <DropdownMenuItem
                      onClick={() => changeRecurrence(row, 'paused', 'Recorrência pausada')}
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pausar Recorrência
                    </DropdownMenuItem>
                  )}
                  {row.recurrence_status === 'paused' && (
                    <DropdownMenuItem
                      onClick={() => changeRecurrence(row, 'active', 'Recorrência reativada')}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Reativar Recorrência
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => changeRecurrence(row, 'ended', 'Recorrência encerrada')}
                    className="text-orange-600 dark:text-orange-400"
                  >
                    <XIcon className="w-4 h-4 mr-2" />
                    Encerrar Recorrência
                  </DropdownMenuItem>
                </>
              )}

              {/* Excluir sempre por último */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDelete(row)}
                className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {row.is_recurring ? 'Excluir Modelo' : 'Excluir'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ]

  const recurringTarget = deleteRecurringDialog.account
  const recurringCounts = recurringTarget
    ? recurringStats(payables, recurringTarget)
    : { futureCount: 0, paidCount: 0 }

  return (
    <div>
      <PageHeader
        title="Contas a Pagar"
        subtitle="Gerencie as despesas do escritório"
        actionLabel={canEdit ? 'Nova Conta' : undefined}
        onAction={
          canEdit
            ? () => {
                setEditing(null)
                setFormOpen(true)
              }
            : undefined
        }
      />

      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          onClick={handleExportPDF}
          disabled={visiblePayables.length === 0}
          className="gap-2"
        >
          {/* O ícone é o SVG solto do original (linhas 929-931), e não um Lucide
              parecido. */}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Exportar PDF
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-card border-0 shadow-xs">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-xl font-bold text-foreground">{formatCurrencyBRL(stats.total)}</p>
        </Card>
        <Card className="p-4 bg-card border-0 shadow-xs">
          <p className="text-sm text-muted-foreground">Pago</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrencyBRL(stats.paid)}
          </p>
        </Card>
        <Card className="p-4 bg-card border-0 shadow-xs">
          <p className="text-sm text-muted-foreground">Previsto</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {formatCurrencyBRL(stats.pending)}
          </p>
        </Card>
        <Card className="p-4 bg-card border-0 shadow-xs">
          <p className="text-sm text-muted-foreground">Em atraso</p>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
            {formatCurrencyBRL(stats.overdue)}
          </p>
        </Card>
      </div>

      {/* Filtro de Mês/Ano */}
      <div className="mb-6">
        <MonthYearFilter selectedDate={selectedMonthYear} onChange={setSelectedMonthYear} />
      </div>

      {/* Filtro de Busca */}
      <div className="mb-6">
        <label className="text-sm font-medium text-soft mb-2 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Busca
        </label>
        <input
          type="text"
          placeholder=""
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="w-full px-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      {/* Filtros de Status */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`${FILTER_BUTTON} ${
            statusFilter === 'all' ? 'bg-primary text-primary-foreground' : FILTER_IDLE
          }`}
        >
          Todos ({statusCounts.all})
        </button>
        <button
          onClick={() => setStatusFilter('overdue')}
          className={`${FILTER_BUTTON} ${
            statusFilter === 'overdue' ? 'bg-rose-600 text-white' : FILTER_IDLE
          }`}
        >
          Em atraso ({statusCounts.overdue})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`${FILTER_BUTTON} ${
            statusFilter === 'pending' ? 'bg-blue-600 text-white' : FILTER_IDLE
          }`}
        >
          Previsto ({statusCounts.pending})
        </button>
        <button
          onClick={() => setStatusFilter('paid')}
          className={`${FILTER_BUTTON} ${
            statusFilter === 'paid' ? 'bg-emerald-600 text-white' : FILTER_IDLE
          }`}
        >
          Pago ({statusCounts.paid})
        </button>
      </div>

      <div className="mb-6 flex justify-end">
        <Button
          variant={showRecurringOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowRecurringOnly(!showRecurringOnly)}
          className={showRecurringOnly ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
        >
          <Repeat className="w-4 h-4 mr-2" />
          {showRecurringOnly ? 'Mostrando Recorrentes' : 'Mostrar Recorrentes'}
        </Button>
      </div>

      {/*
        Três estados, e DOIS vazios diferentes — como no original (linhas
        1043-1058). "Nenhuma conta a pagar" é o escritório sem nenhuma despesa
        cadastrada, e pede cadastro; "Nenhuma conta encontrada com os filtros
        aplicados" é a mesma tabela sem linha no recorte atual, e pede mudar o
        filtro. Quem separa os dois é `useHasAnyPayables`, porque o recorte de mês
        deixou de morar no navegador.

        O que o original NÃO tem é o terceiro: lá, falha de leitura deixa a tela
        idêntica a "não há despesa nenhuma".
      */}
      {payablesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar as contas a pagar"
          description="A lista de despesas não pôde ser lida agora."
          error={payablesQuery.error}
          onRetry={() => {
            void payablesQuery.refetch()
          }}
        />
      ) : hasAnyQuery.data === false && !payablesQuery.isLoading ? (
        <EmptyState
          icon={ArrowUpCircle}
          title="Nenhuma conta a pagar"
          description="Adicione despesas para controlar os pagamentos."
          actionLabel={canEdit ? 'Adicionar Conta' : undefined}
          onAction={canEdit ? () => setFormOpen(true) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={visiblePayables}
          isLoading={payablesQuery.isLoading}
          emptyMessage="Nenhuma conta encontrada com os filtros aplicados"
        />
      )}

      <AccountPayableForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        projects={projectsQuery.data ?? []}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                rose-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {recurringTarget && (
        <DeleteRecurringDialog
          open={deleteRecurringDialog.open}
          onClose={() => setDeleteRecurringDialog({ open: false, account: null })}
          onConfirm={confirmDeleteRecurring}
          futureCount={recurringCounts.futureCount}
          paidCount={recurringCounts.paidCount}
        />
      )}

      {/* Modal Marcar como Pago */}
      <MarkAsPaidDialog
        open={markAsPaidDialog.open}
        onClose={() => setMarkAsPaidDialog({ open: false, account: null })}
        onConfirm={confirmMarkAsPaid}
        account={markAsPaidDialog.account}
        isLoading={markAsPaidMutation.isPending}
      />
    </div>
  )
}
