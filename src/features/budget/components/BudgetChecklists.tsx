import { useMemo, useState } from 'react'
import {
  ChevronRight,
  ClipboardList,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { formatCurrencyBRL } from '@/lib/format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BUDGET_CHECKLIST_STATUS,
  BUDGET_PROJECT_PHASE,
  PROJECT_PHASE,
  labelOf,
  optionsOf,
} from '@/lib/enums'
import { useMenuPermissions } from '@/features/auth/hooks'
import { useClients } from '@/features/crm/hooks'
import { useProjects } from '@/features/projects/hooks'
import { useSuppliers } from '@/features/suppliers/hooks'
import { useCollaborators } from '@/features/team/hooks'
import {
  describeDatabaseError,
  useBudgetChecklists,
  useBudgetChecklistTotals,
  useCreateBudgetChecklist,
  useDeleteBudgetChecklist,
  useHasAnyBudgetChecklists,
} from '../hooks'
import BudgetChecklistDetail from './BudgetChecklistDetail'
import BudgetChecklistForm from './BudgetChecklistForm'
import { CHECKLIST_STATUS_BADGE } from './budget-styles'
import type {
  BudgetChecklistInput,
  BudgetChecklistRow,
  BudgetChecklistTotals,
  BudgetFilters,
} from '../types'

/*
  Porta de projeto-original/src/pages/OrcamentoCliente.jsx.

  O cabeçalho, os três filtros do topo, a grade de cartões, o menu de três
  pontos, a barra de progresso, o par de totais no rodapé do cartão, a linha de
  responsável, o formulário de criação e o diálogo de exclusão são os do
  original, na mesma ordem e com o mesmo microcopy. O DETALHE continua sendo a
  MESMA rota, trocada por estado (`selected`), como lá.

  AUTORIZAÇÃO — DIVERGÊNCIA CONSCIENTE, a mesma já registrada em Suppliers.tsx.

  O original calcula `canManage` no componente e ASSUME PERMISSÃO quando ela
  falta: sem colaborador correspondente, ou sem linha de permissão para o menu
  "Orçamento por Cliente", `setCanManage(true)` (OrcamentoCliente.jsx:42-45). O
  banco faz o contrário — `can_edit_menu('client_budget')` (migrations 0050 e
  0054) exige a linha gravada para quem não é Diretor. Seguir o original mostraria
  botão de criar, editar e excluir para quem o banco recusa, e o clique terminaria
  em erro. Então quem manda é o BANCO: `useMenuPermissions('client_budget')`.

  A leitura continua larga, como no original — qualquer colaborador ativo do
  escritório lê os checklists (`budget_checklists_select_active_collaborator`).

  OS TOTAIS DE CADA CARTÃO NÃO SÃO SOMADOS AQUI. Vêm da view
  `budget_checklist_totals` (migration 0051), inclusive o clipe de PDFs, que a
  0054 acrescentou a ela — no original os quatro são `reduce` no navegador sobre
  os itens embutidos na linha, e o número do cartão e o do rodapé do detalhe
  podem discordar.
*/

/* Enquanto a view não respondeu, e para o checklist sem item nenhum, tudo zero —
   que é o que ela devolve (`coalesce`, migration 0051). */
const ZERO_TOTALS: Omit<BudgetChecklistTotals, 'checklist_id' | 'tenant_id'> = {
  item_count: 0,
  completed_item_count: 0,
  progress_percent: 0,
  estimated_total: 0,
  approved_total: 0,
  commission_total: 0,
  commission_received_total: 0,
  attachment_count: 0,
}

/*
  Os dois totais do cartão, no formato do resto do sistema (`formatCurrencyBRL`).

  O original escreve `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
  (OrcamentoCliente.jsx:278 e :284): sem `maximumFractionDigits` o Intl usa até
  três casas, então 1234.5 vira "R$ 1.234,5" no cartão e "R$ 1.234,50" no rodapé
  do detalhe do MESMO checklist. O mesmo dinheiro escrito de duas formas na mesma
  tela é número errado, não escolha de estilo — e o rodapé é quem já está certo.

  DIVERGÊNCIA CONSCIENTE no valor ZERO, e ela continua: o original escreve
  `valor_total_estimado ? formatado : '-'`, e ali o campo é GRAVADO e pode não
  existir — daí o traço. Aqui o total vem da view e existe sempre, inclusive para
  o checklist sem item nenhum, onde é zero. Mostrar "R$ 0,00" é o mesmo número que
  o rodapé do detalhe mostra para o mesmo checklist; manter o traço faria a
  listagem dizer "não sei" sobre um valor que o banco sabe.
*/
function cardMoney(value: number): string {
  return formatCurrencyBRL(value)
}

export default function BudgetChecklists() {
  const [selected, setSelected] = useState<BudgetChecklistRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<BudgetChecklistRow | null>(null)
  const [filters, setFilters] = useState<BudgetFilters>({
    status: 'all',
    responsibleId: 'all',
    phase: 'all',
  })

  const { canEdit } = useMenuPermissions('client_budget')

  const checklistsQuery = useBudgetChecklists(filters)
  const hasAnyQuery = useHasAnyBudgetChecklists()
  const totalsQuery = useBudgetChecklistTotals()

  /* Os quatro cadastros que os formulários desta tela oferecem, como no original
     (OrcamentoCliente.jsx:56-74). `useClients('')` é a lista sem busca. */
  const projectsQuery = useProjects()
  const clientsQuery = useClients('')
  const collaboratorsQuery = useCollaborators()
  const suppliersQuery = useSuppliers({ category: 'all', tier: 'all', status: 'all' })

  const createMutation = useCreateBudgetChecklist()
  const deleteMutation = useDeleteBudgetChecklist()

  const checklists = useMemo(() => checklistsQuery.data ?? [], [checklistsQuery.data])
  const collaborators = useMemo(() => collaboratorsQuery.data ?? [], [collaboratorsQuery.data])

  /* A linha RECÉM-LIDA para o detalhe, e a cópia guardada quando o filtro do topo
     a tirou da lista — mesmo desenho de Suppliers.tsx. É o que mantém o select de
     status do cabeçalho do detalhe mostrando o que acabou de ser gravado. */
  const selectedChecklist = selected
    ? (checklists.find((checklist) => checklist.id === selected.id) ?? selected)
    : null

  const confirmDelete = () => {
    if (!deleting) return

    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.success('Checklist excluído')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  if (selectedChecklist) {
    return (
      <BudgetChecklistDetail
        checklist={selectedChecklist}
        onBack={() => setSelected(null)}
        suppliers={suppliersQuery.data ?? []}
        collaborators={collaborators}
        canEdit={canEdit}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Orçamento por Cliente</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Checklist de orçamento de materiais por projeto
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setFormOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Checklist
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/*
          `'all'` no lugar do `value={null}` do original: item de Select com valor
          vazio não é aceito pelo Radix. Mesma tradução já feita em Fornecedores e
          Atividades — o texto do item e o do placeholder continuam os do original.
        */}
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, status: value as BudgetFilters['status'] }))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status Geral" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {optionsOf(BUDGET_CHECKLIST_STATUS).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.responsibleId}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, responsibleId: value }))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {collaborators
              .filter((collaborator) => collaborator.status === 'active')
              .map((collaborator) => (
                <SelectItem key={collaborator.id} value={collaborator.id}>
                  {collaborator.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.phase}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, phase: value as BudgetFilters['phase'] }))
          }
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Fase do Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fases</SelectItem>
            {optionsOf(BUDGET_PROJECT_PHASE).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        Três estados explícitos. O original só distingue dois — carregando e lista
        — e falha de leitura nele deixa a tela igualzinha a "não há checklist
        nenhum".
      */}
      {checklistsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os checklists"
          description="A lista de checklists de orçamento não pôde ser lida agora."
          error={checklistsQuery.error}
          onRetry={() => {
            void checklistsQuery.refetch()
          }}
        />
      ) : checklistsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-48 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : checklists.length === 0 ? (
        /*
          A caixa do original, com o mesmo ícone e a mesma geometria. A segunda
          linha é que muda conforme `useHasAnyBudgetChecklists`: sem checklist
          nenhum não há filtro para ajustar, e a frase fica com a metade dela que
          se aplica.
        */
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <ClipboardList className="w-12 h-12 text-faint mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum checklist encontrado</p>
          <p className="text-faint text-sm mt-1">
            {hasAnyQuery.data === false
              ? 'Crie o primeiro checklist de orçamento'
              : 'Ajuste os filtros ou crie um novo checklist de orçamento'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {checklists.map((checklist) => {
            const totals = totalsQuery.data?.get(checklist.id) ?? ZERO_TOTALS

            return (
              <div
                key={checklist.id}
                className="bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-faint transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 cursor-pointer" onClick={() => setSelected(checklist)}>
                    <p className="font-semibold text-foreground leading-tight">
                      {checklist.client?.name || 'Cliente não definido'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {checklist.project?.name || 'Sem projeto vinculado'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {totals.attachment_count > 0 && (
                      <div
                        className="flex items-center gap-1 text-faint"
                        title={`${totals.attachment_count} PDF${
                          totals.attachment_count > 1 ? 's' : ''
                        } anexado${totals.attachment_count > 1 ? 's' : ''}`}
                      >
                        <Paperclip className="w-4 h-4" />
                        <span className="text-xs">{totals.attachment_count}</span>
                      </div>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-muted text-faint hover:text-soft transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelected(checklist)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Abrir / Editar
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                            onClick={() => setDeleting(checklist)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight
                      className="w-5 h-5 text-faint cursor-pointer"
                      onClick={() => setSelected(checklist)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {/* Sem o `&&` do original nos dois: `status` é NOT NULL com
                      default `open`, e a fase continua opcional. */}
                  <Badge className={`text-xs ${CHECKLIST_STATUS_BADGE[checklist.status]}`}>
                    {labelOf(BUDGET_CHECKLIST_STATUS, checklist.status)}
                  </Badge>
                  {checklist.project_phase && (
                    <Badge variant="outline" className="text-xs text-soft">
                      {labelOf(PROJECT_PHASE, checklist.project_phase)}
                    </Badge>
                  )}
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {totals.completed_item_count}/{totals.item_count} itens finalizados
                    </span>
                    <span>{totals.progress_percent}%</span>
                  </div>
                  <Progress value={totals.progress_percent} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-faint">Total Estimado</p>
                    <p className="font-semibold text-soft">{cardMoney(totals.estimated_total)}</p>
                  </div>
                  <div>
                    <p className="text-faint">Total Aprovado</p>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {cardMoney(totals.approved_total)}
                    </p>
                  </div>
                </div>

                {checklist.responsible?.name && (
                  <p className="text-xs text-faint mt-3 pt-3 border-t border-border">
                    Responsável: {checklist.responsible.name}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <BudgetChecklistForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(input: BudgetChecklistInput) =>
          createMutation.mutate(input, {
            onSuccess: () => {
              setFormOpen(false)
              toast.success('Checklist criado com sucesso')
            },
            onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
          })
        }
        isLoading={createMutation.isPending}
        projects={projectsQuery.data ?? []}
        clients={clientsQuery.data ?? []}
        collaborators={collaborators}
      />

      {/*
        O original fixa `zIndex: 2000` neste diálogo. Aqui a camada já vem
        resolvida (src/components/ui).

        O TEXTO DIZ O QUE A EXCLUSÃO LEVA JUNTO, o que o original não diz: os
        itens, as cotações dos fornecedores e os PDFs de aprovação somem por
        cascade (migrations 0049 e 0054), e os arquivos saem do Storage. Mesmo
        precedente aceito na tela de Fornecedores.
      */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir checklist</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o checklist de{' '}
              <strong>{deleting?.client?.name}</strong>? Todos os itens, as cotações dos
              fornecedores e os PDFs anexados a eles são excluídos junto. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                red-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
