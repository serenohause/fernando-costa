import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownCircle,
  Calendar,
  CheckCircle,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
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
import { useClients } from '@/features/crm/hooks'
import { useContracts } from '@/features/contracts/hooks'
import { useProjects } from '@/features/projects/hooks'
import { FINANCIAL_STATUS, labelOf } from '@/lib/enums'
import { formatCurrencyBRL, normalizeText } from '@/lib/format'
import {
  countFinancialByStatus,
  describeDatabaseError,
  monthYearOf,
  summarizeFinancial,
  useCreateReceivable,
  useDeleteReceivable,
  useHasAnyReceivables,
  useMarkReceivablePaid,
  useReceivables,
  useUpdateReceivable,
} from '../hooks'
import { exportReceivablesPDF } from '../receivable-pdf'
import MonthYearFilter from './MonthYearFilter'
import AccountReceivableForm, {
  toFormValues,
  type ReceivableFormValues,
  type ReceivableSubmit,
} from './AccountReceivableForm'
import type { FinancialStatusFilter, ReceivableInput, ReceivableRow } from '../types'

/*
  Porta de projeto-original/src/pages/AccountsReceivable.jsx.

  O cabeçalho, o botão "Exportar PDF" alinhado à direita, os quatro cartões de
  total, o seletor de mês, o campo de cliente, a fileira de botões de status, a
  tabela de seis colunas com o quadrado colorido na descrição, o menu de três
  pontos e o diálogo de exclusão são os do original, na mesma ordem e com o mesmo
  espaçamento.

  OS BOTÕES DE STATUS SÃO DESENHADOS AQUI, inline, e não pelo
  `components/FinancialFilters.tsx`: no original o componente
  `financial/FinancialFilters.jsx` existe e NENHUMA página o importa — as duas
  telas do financeiro desenham a própria fileira. O que está no ar é esta.

  DE ONDE VEM CADA NÚMERO — e é a diferença que mais importa em relação ao
  original:

  - O recorte de MÊS e o de STATUS viram WHERE (`useReceivables`), em vez de
    peneirar a carteira inteira em memória a cada troca de mês.
  - "Em atraso" é `is_overdue`, calculado pela view (migrations 0043/0046). O
    original calcula atraso em seis lugares, e dois deles discordam entre si: a
    soma do cartão compara com "agora" e a contagem do crachá compara com
    meia-noite, então cartão e botão mostram números diferentes por algumas horas
    por dia.
  - Os cartões somam a lista JÁ FILTRADA, inclusive pelo filtro de texto, como no
    original: com "Recebido" selecionado, "Total" passa a ser o total recebido e
    "Previsto" vira zero.

  O FILTRO DE CLIENTE CONTINUA EM MEMÓRIA, como no original: mínimo de dois
  caracteres, sem acento, sobre o nome do cliente e o do projeto. Ele roda ANTES
  de somar os cartões, porque é o que a tabela mostra.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0042):

  - Leitura é larga: qualquer colaborador ativo do escritório lê a carteira.
    Quem esconde "Recebíveis" da barra lateral é a permissão de menu.
  - Escrita é `can_edit` no menu `receivables` OU ser Diretor. Sem isso, some o
    botão de criar, some o menu de três pontos de cada linha, e o vazio deixa de
    oferecer cadastro. Quem autoriza de verdade continua sendo o banco: os hooks
    conferem se a linha foi mesmo afetada, porque UPDATE e DELETE barrados pela
    policy não levantam erro — só não alcançam a linha.
*/


/* O par de cores de cada botão quando ele está selecionado (linhas 680-719).
   Não selecionado, todos usam a mesma moldura clara. */
const ACTIVE_FILTER: Record<FinancialStatusFilter, string> = {
  all: 'bg-primary text-primary-foreground',
  overdue: 'bg-rose-600 text-white',
  pending: 'bg-blue-600 text-white',
  paid: 'bg-emerald-600 text-white',
}

const IDLE_FILTER = 'bg-card text-soft hover:bg-elevated border border-border'

export default function AccountsReceivable() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ReceivableRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    account: ReceivableRow | null
  }>({ open: false, account: null })
  const [selectedMonthYear, setSelectedMonthYear] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState<FinancialStatusFilter>('all')
  const [clientFilter, setClientFilter] = useState('')

  const { canEdit } = useMenuPermissions('receivables')

  const period = useMemo(() => monthYearOf(selectedMonthYear), [selectedMonthYear])
  const receivablesQuery = useReceivables({ period, status: statusFilter })
  const hasAnyQuery = useHasAnyReceivables()

  const clientsQuery = useClients('')
  const projectsQuery = useProjects()
  const contractsQuery = useContracts()

  const createMutation = useCreateReceivable()
  const updateMutation = useUpdateReceivable()
  const deleteMutation = useDeleteReceivable()
  const markPaidMutation = useMarkReceivablePaid()

  /*
    A ordem da lista já vem do hook (mais recentes primeiro, por data de criação
    — `sortedReceivables`, linhas 219-226). O que sobra para a tela é o filtro de
    texto, que não tem como virar WHERE sem mandar o termo digitado na query
    string.
  */
  const visibleRows = useMemo(() => {
    const rows = receivablesQuery.data ?? []
    if (clientFilter.length < 2) return rows

    const term = normalizeText(clientFilter)
    return rows.filter(
      (row) =>
        normalizeText(row.client?.name).includes(term) ||
        normalizeText(row.project?.name).includes(term),
    )
  }, [receivablesQuery.data, clientFilter])

  const stats = useMemo(() => summarizeFinancial(visibleRows), [visibleRows])
  const statusCounts = useMemo(() => countFinancialByStatus(visibleRows), [visibleRows])

  const formInitialData = useMemo<ReceivableFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (submit: ReceivableSubmit) => {
    if (editing) {
      /* Editar nunca parcela: o bloco de parcelamento só aparece na criação. */
      if (submit.kind !== 'single') return

      updateMutation.mutate(
        { id: editing.id, input: submit.input },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Conta atualizada com sucesso!')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    if (submit.kind === 'single') {
      createMutation.mutate(submit.input, {
        onSuccess: () => {
          closeForm()
          toast.success('Conta criada com sucesso!')
        },
        onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
      })
      return
    }

    void createInstallments(submit.inputs)
  }

  /*
    O parcelamento do original é um `bulkCreate` (linha 111) — uma chamada só.
    Aqui são N gravações em sequência, porque a camada de dados deste módulo não
    oferece criação em lote de recebível: o que ela tem é
    `generate_contract_installments`, que é a geração das parcelas DE UM CONTRATO
    e cobra o plano de parcelamento dele.

    CONSEQUÊNCIA QUE FICA REGISTRADA: falha no meio deixa as parcelas anteriores
    criadas. A mensagem diz quantas entraram, em vez de anunciar sucesso sobre um
    lote que não fechou — que é o que o original faz ao engolir o erro do
    `bulkCreate` num `catch` genérico.
  */
  const createInstallments = async (inputs: ReceivableInput[]) => {
    let created = 0
    try {
      for (const input of inputs) {
        await createMutation.mutateAsync(input)
        created += 1
      }
      closeForm()
      toast.success(`${inputs.length} parcelas criadas com sucesso!`)
    } catch (error) {
      toast.error(
        created === 0
          ? 'Erro ao criar parcelas: ' + describeDatabaseError(error)
          : `Apenas ${created} de ${inputs.length} parcelas foram criadas: ` +
              describeDatabaseError(error),
      )
    }
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

  const markAsPaid = (account: ReceivableRow) => {
    markPaidMutation.mutate(account.id, {
      onSuccess: () => toast.success('Marcado como pago!'),
      onError: (error) => toast.error('Erro ao marcar como pago: ' + describeDatabaseError(error)),
    })
  }

  const handleExportPDF = () => {
    exportReceivablesPDF({
      rows: visibleRows,
      period,
      statusFilter,
      summary: stats,
      counts: statusCounts,
    })
    toast.success('PDF exportado com sucesso')
  }

  const columns: Column<ReceivableRow>[] = [
    {
      header: 'Descrição',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              row.is_overdue
                ? 'bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-950/40 dark:to-rose-900/40'
                : 'bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-950/40 dark:to-emerald-900/40'
            }`}
          >
            {row.is_overdue ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            ) : (
              <ArrowDownCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div>
            <p className="font-medium text-foreground">{row.description}</p>
            {/* Nome ATUAL do cadastro, via join: no original ele é copiado no
                momento em que a parcela nasce e envelhece sozinho. */}
            <p className="text-sm text-muted-foreground">{row.client?.name ?? 'Sem cliente'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Projeto',
      cell: (row) => row.project?.name ?? <span className="text-faint">-</span>,
    },
    {
      header: 'Vencimento',
      cell: (row) => {
        /* Data sem conversão de fuso, como no original: a coluna é `date` e a
           string chega YYYY-MM-DD. */
        const [year, month, day] = (row.due_date || '').split('-')
        const formatted = year && month && day ? `${day}/${month}/${year}` : row.due_date

        return (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-faint" />
            <span className={row.is_overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
              {formatted}
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
      cell: (row) =>
        /* Quem não pode editar vê a tabela sem os botões de ação. */
        canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.status !== 'paid' && (
                <DropdownMenuItem onClick={() => markAsPaid(row)}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Marcar como Pago
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setEditing(row)
                  setFormOpen(true)
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialog({ open: true, account: row })}
                className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ]

  const hasAny = hasAnyQuery.data ?? false

  return (
    <div>
      <PageHeader
        title="Recebíveis"
        subtitle="Gerencie suas receitas e recebimentos"
        actionLabel={canEdit ? 'Novo Recebível' : undefined}
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
          disabled={visibleRows.length === 0}
          className="gap-2"
        >
          {/* SVG do original, e não um ícone do Lucide: é o único lugar da tela
              onde ele desenha o ícone à mão. */}
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
          <p className="text-sm text-muted-foreground">Recebido</p>
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

      {/* Filtro de Cliente */}
      <div className="mb-6">
        {/* `block` e `flex` juntos vêm do original — o `flex` vence, e é assim
            que o rótulo está no ar. */}
        <label
          htmlFor="client_filter"
          className="block text-sm font-medium text-soft mb-2 flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          Cliente
        </label>
        <input
          id="client_filter"
          type="text"
          placeholder="Filtrar por cliente..."
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="w-full px-4 py-2 bg-card text-foreground border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      {/* Filtros de Status */}
      <div className="mb-6 flex flex-wrap gap-2 overflow-x-auto">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'all' ? ACTIVE_FILTER.all : IDLE_FILTER
          }`}
        >
          Todos ({statusCounts.all})
        </button>
        <button
          onClick={() => setStatusFilter('overdue')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'overdue' ? ACTIVE_FILTER.overdue : IDLE_FILTER
          }`}
        >
          Em atraso ({statusCounts.overdue})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'pending' ? ACTIVE_FILTER.pending : IDLE_FILTER
          }`}
        >
          Previsto ({statusCounts.pending})
        </button>
        <button
          onClick={() => setStatusFilter('paid')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'paid' ? ACTIVE_FILTER.paid : IDLE_FILTER
          }`}
        >
          Recebido ({statusCounts.paid})
        </button>
      </div>

      {/*
        Três estados explícitos, e DOIS vazios diferentes.

        O original distingue os dois vazios olhando a lista completa (linha 722):
        escritório sem nenhuma conta pede cadastro; escritório com contas, mas
        nenhuma no recorte atual, pede outro filtro. Como o mês virou WHERE, quem
        responde a primeira pergunta é `useHasAnyReceivables`.

        Falha de leitura, que no original ficava igualzinha a "não há conta
        nenhuma", ganha tela própria.
      */}
      {receivablesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os recebíveis"
          description="A lista de contas a receber não pôde ser lida agora."
          error={receivablesQuery.error}
          onRetry={() => {
            void receivablesQuery.refetch()
          }}
        />
      ) : !hasAny && !receivablesQuery.isLoading && !hasAnyQuery.isLoading ? (
        <EmptyState
          icon={ArrowDownCircle}
          title="Nenhuma conta a receber"
          description="Adicione contas para controlar os recebimentos."
          actionLabel={canEdit ? 'Adicionar Conta' : undefined}
          onAction={canEdit ? () => setFormOpen(true) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={visibleRows}
          isLoading={receivablesQuery.isLoading}
          emptyMessage="Nenhuma conta encontrada com os filtros aplicados"
        />
      )}

      <AccountReceivableForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clients={clientsQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        contracts={contractsQuery.data ?? []}
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
    </div>
  )
}
