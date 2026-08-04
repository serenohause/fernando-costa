import { useMemo, useState } from 'react'
import { ArrowLeft, BadgeDollarSign, Package, Paperclip, Plus } from 'lucide-react'
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
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrencyBRL } from '@/lib/format'
import {
  BUDGET_CHECKLIST_STATUS,
  BUDGET_ITEM_STATUS,
  PROJECT_PHASE,
  SUPPLIER_CATEGORY,
  labelOf,
  optionsOf,
  type BudgetChecklistStatus,
  type SupplierCategory,
} from '@/lib/enums'
import type { SupplierRow } from '@/features/suppliers/types'
import type { Collaborator } from '@/features/team/types'
import {
  describeDatabaseError,
  useBudgetChecklistItems,
  useBudgetChecklistTotals,
  useBudgetItemAttachments,
  useCreateBudgetChecklistItem,
  useDeleteBudgetChecklistItem,
  useSetBudgetChecklistStatus,
  useSetItemCommissionReceived,
  useUpdateBudgetChecklistItem,
} from '../hooks'
import BudgetItemDrawer from './BudgetItemDrawer'
import BudgetItemForm, { toFormValues, type BudgetItemFormValues } from './BudgetItemForm'
import { ITEM_STATUS_BADGE } from './budget-styles'
import type {
  BudgetChecklistItemInput,
  BudgetChecklistItemRow,
  BudgetChecklistRow,
  BudgetChecklistTotals,
} from '../types'

/*
  Porta de projeto-original/src/components/orcamento/ChecklistDetalhe.jsx.

  O cabeçalho com botão de voltar, o cartão de progresso, a lista agrupada por
  categoria com uma caixa por grupo, a linha de cada item com crachá de status,
  valor, percentual de comissão, botão de comissão e clipe, o rodapé fixo com
  seis totais e o espaçador de 80px abaixo dele são os do original, na mesma
  ordem e com o mesmo microcopy.

  O QUE MUDA, E POR QUÊ:

  1. OS ITENS SÃO TABELA, não um array dentro da linha do checklist. Vêm por
     `useBudgetChecklistItems` (migrations 0049 e 0054), e cada gravação é uma
     escrita própria — no original toda mexida em item regrava o DOCUMENTO
     INTEIRO do checklist, o que sobrescreve alteração feita por outra pessoa no
     meio.
  2. OS SEIS TOTAIS E O PROGRESSO VÊM DA VIEW `budget_checklist_totals`
     (migration 0051), não de `reduce` no navegador. É a mesma conta que alimenta
     o cartão da listagem — no original os campos são gravados e o botão de
     comissão regrava só um deles, e é assim que eles divergem entre si. O clipe
     de cada item vem de `budget_item_attachments` (migration 0054), pelo mesmo
     motivo.
  3. EXCLUIR ITEM PEDE CONFIRMAÇÃO. No original o botão de lixeira do drawer
     apaga na hora, sem diálogo, e leva junto as cotações e os PDFs anexados —
     que é o que o texto do diálogo agora diz. Mesmo precedente já aceito na tela
     de Fornecedores.
  4. `canEdit` no lugar de `canManage` — a regra é a do BANCO
     (`can_edit_menu('client_budget')`, migrações 0050 e 0054). Ver o comentário
     de autorização em BudgetChecklists.tsx. Isso alcança também o botão
     "Adicionar primeiro item" do estado vazio, que no original aparece para quem
     só lê (ChecklistDetalhe.jsx:150) e termina em erro ao gravar.
  5. Os itens ganham os três estados (carregando, vazio, erro). No original eles
     já vinham dentro do checklist, e falha de leitura não tinha como aparecer.
*/

/*
  Enquanto a view não respondeu, os totais são zero — que é também o que ela
  devolve para checklist SEM ITEM NENHUM (`coalesce` em tudo, migration 0051).
*/
const ZERO_TOTALS: Omit<BudgetChecklistTotals, 'checklist_id' | 'tenant_id'> = {
  item_count: 0,
  completed_item_count: 0,
  progress_percent: 0,
  estimated_total: 0,
  approved_total: 0,
  commission_total: 0,
  commission_received_total: 0,
  curation_total: 0,
  attachment_count: 0,
}

/* `formatBRL` do original (ChecklistDetalhe.jsx:26-29): duas casas decimais, e
   zero continua aparecendo como "R$ 0,00". */
const money = (value: number) => formatCurrencyBRL(value)

/*
  O agrupamento de ChecklistDetalhe.jsx:39-47, com o mesmo efeito do
  `item.categoria || 'Outros'`: item SEM categoria cai no mesmo grupo do item
  cuja categoria é "Outros". A ordem dos grupos é a de primeira aparição, como o
  objeto do original.
*/
function groupByCategory(
  items: BudgetChecklistItemRow[],
): [SupplierCategory, BudgetChecklistItemRow[]][] {
  const groups = new Map<SupplierCategory, BudgetChecklistItemRow[]>()

  for (const item of items) {
    const category = item.category ?? 'other'
    const group = groups.get(category)
    if (group) group.push(item)
    else groups.set(category, [item])
  }

  return [...groups.entries()]
}

export default function BudgetChecklistDetail({
  checklist,
  onBack,
  suppliers,
  collaborators,
  canEdit,
}: {
  checklist: BudgetChecklistRow
  onBack: () => void
  suppliers: SupplierRow[]
  collaborators: Collaborator[]
  /** `useMenuPermissions('client_budget').canEdit`. */
  canEdit: boolean
}) {
  const [selectedItem, setSelectedItem] = useState<BudgetChecklistItemRow | null>(null)
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetChecklistItemRow | null>(null)
  const [deletingItem, setDeletingItem] = useState<BudgetChecklistItemRow | null>(null)

  const itemsQuery = useBudgetChecklistItems(checklist.id)
  const attachmentsQuery = useBudgetItemAttachments(checklist.id)
  const totalsQuery = useBudgetChecklistTotals()

  const statusMutation = useSetBudgetChecklistStatus()
  const createItemMutation = useCreateBudgetChecklistItem()
  const updateItemMutation = useUpdateBudgetChecklistItem()
  const deleteItemMutation = useDeleteBudgetChecklistItem()
  const commissionMutation = useSetItemCommissionReceived()

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const grouped = useMemo(() => groupByCategory(items), [items])

  const totals = totalsQuery.data?.get(checklist.id) ?? ZERO_TOTALS

  /* A linha RECÉM-LIDA para o drawer, como Suppliers.tsx faz: o drawer anexa e
     remove PDF por conta própria, e o que ele mostra tem que ser o que a
     consulta acabou de trazer, não a cópia guardada no clique. */
  const drawerItem = selectedItem
    ? (items.find((item) => item.id === selectedItem.id) ?? selectedItem)
    : null

  /* Referência estável: BudgetItemForm reinicia o formulário quando
     `initialData` muda. */
  const formInitialData = useMemo<BudgetItemFormValues | null>(
    () => (editingItem ? toFormValues(editingItem) : null),
    [editingItem],
  )

  const closeItemForm = () => {
    setAddItemOpen(false)
    setEditingItem(null)
  }

  const handleSaveItem = (input: BudgetChecklistItemInput) => {
    if (editingItem) {
      updateItemMutation.mutate(
        { id: editingItem.id, input },
        {
          onSuccess: () => {
            closeItemForm()
            toast.success('Item atualizado')
          },
          onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createItemMutation.mutate(
      { checklistId: checklist.id, input },
      {
        onSuccess: () => {
          closeItemForm()
          toast.success('Item adicionado')
        },
        onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
      },
    )
  }

  const confirmDeleteItem = () => {
    if (!deletingItem) return

    deleteItemMutation.mutate(deletingItem.id, {
      onSuccess: () => {
        setDeletingItem(null)
        setItemDrawerOpen(false)
        setSelectedItem(null)
        toast.success('Item removido')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  const handleToggleCommission = (item: BudgetChecklistItemRow) => {
    commissionMutation.mutate(
      { id: item.id, received: !item.commission_received },
      {
        onSuccess: () =>
          toast.success(
            item.commission_received ? 'Comissão desmarcada' : 'Comissão marcada como recebida',
          ),
        onError: (error) =>
          toast.error('Erro ao alterar a comissão. ' + describeDatabaseError(error)),
      },
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-1">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">{checklist.client?.name}</h1>
          {/*
            O RÓTULO sai de `PROJECT_PHASE`, e não de `BUDGET_PROJECT_PHASE`: a
            COLUNA é o enum inteiro de doze fases (o recorte de quatro é check do
            banco, migration 0049), então só o mapa completo cobre o tipo. Os
            quatro rótulos que interessam são idênticos nos dois mapas; quem usa
            o mapa de quatro é o SELECT, que oferece opção.
          */}
          <p className="text-muted-foreground text-sm mt-0.5">
            {checklist.project?.name || 'Sem projeto'} ·{' '}
            {checklist.project_phase
              ? labelOf(PROJECT_PHASE, checklist.project_phase)
              : 'Fase não definida'}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {/*
              AZUL PARA TODOS OS STATUS, defeito do original incluído e reportado
              (ChecklistDetalhe.jsx:104): o cartão da listagem pinta cada status
              de uma cor, e este crachá ignora o mapa. Sem o `&&` do original: a
              coluna é NOT NULL com default `open`.
            */}
            <Badge className="text-xs bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
              {labelOf(BUDGET_CHECKLIST_STATUS, checklist.status)}
            </Badge>
            {checklist.responsible?.name && (
              <span className="text-xs text-muted-foreground">
                Responsável: {checklist.responsible.name}
              </span>
            )}
            {checklist.curation_percent ? (
              <span className="text-xs text-muted-foreground">
                Curadoria: {checklist.curation_percent}%
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Select
              value={checklist.status}
              onValueChange={(value) =>
                statusMutation.mutate(
                  { id: checklist.id, status: value as BudgetChecklistStatus },
                  {
                    onError: (error) =>
                      toast.error('Erro ao alterar status: ' + describeDatabaseError(error)),
                  },
                )
              }
            >
              <SelectTrigger className="w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(BUDGET_CHECKLIST_STATUS).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canEdit && (
            <Button
              onClick={() => {
                setEditingItem(null)
                setAddItemOpen(true)
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Item
            </Button>
          )}
        </div>
      </div>

      {/* Progresso */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-soft">
            {totals.completed_item_count} de {totals.item_count} itens finalizados
          </span>
          <span className="font-semibold text-foreground">{totals.progress_percent}%</span>
        </div>
        <Progress value={totals.progress_percent} className="h-2.5" />
      </div>

      {/* Lista agrupada — três estados, ver o cabeçalho deste arquivo */}
      {itemsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os itens"
          description="Os itens deste checklist não puderam ser lidos agora."
          error={itemsQuery.error}
          onRetry={() => {
            void itemsQuery.refetch()
          }}
        />
      ) : itemsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Package className="w-12 h-12 text-faint mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum item adicionado</p>
          {canEdit && (
            <Button onClick={() => setAddItemOpen(true)} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" /> Adicionar primeiro item
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, groupItems]) => (
            <div key={category} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="bg-elevated px-4 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold text-soft">{SUPPLIER_CATEGORY[category]}</h3>
              </div>
              <div className="divide-y divide-border">
                {groupItems.map((item) => {
                  const attachmentCount =
                    attachmentsQuery.data?.get(item.id)?.attachment_count ?? 0

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedItem(item)
                        setItemDrawerOpen(true)
                      }}
                      className="px-4 py-3 hover:bg-elevated cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate">
                              {item.name}
                            </p>
                            {/* Sem o `|| 'Pendente'` do original: a coluna é NOT
                                NULL com default `pending`. */}
                            <Badge
                              className={`text-xs shrink-0 ${ITEM_STATUS_BADGE[item.status]}`}
                            >
                              {labelOf(BUDGET_ITEM_STATUS, item.status)}
                            </Badge>
                          </div>
                          {item.description && (
                            <p className="text-xs text-faint mt-0.5 truncate">{item.description}</p>
                          )}
                          {item.supplier?.name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Fornecedor: {item.supplier.name}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          {/* A cascata do original: aprovado ganha do estimado, e
                              valor zero não aparece nem num nem noutro. */}
                          {item.approved_value ? (
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                              {money(item.approved_value)}
                            </p>
                          ) : item.estimated_value ? (
                            <p className="text-sm text-soft">{money(item.estimated_value)}</p>
                          ) : null}
                          {item.commission_percent ? (
                            <p className="text-xs text-faint">{item.commission_percent}% comissão</p>
                          ) : null}
                          {/* Botão comissão recebida */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleCommission(item)
                            }}
                            disabled={!canEdit}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors disabled:cursor-not-allowed ${
                              item.commission_received
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                                : 'bg-elevated text-faint border-border hover:border-emerald-300 dark:hover:border-emerald-800 hover:text-emerald-600 dark:hover:text-emerald-400'
                            }`}
                            title={
                              item.commission_received
                                ? 'Comissão recebida'
                                : 'Marcar comissão como recebida'
                            }
                          >
                            <BadgeDollarSign className="w-3 h-3" />
                            {item.commission_received ? 'Comissão recebida' : 'Comissão pendente'}
                          </button>
                          {attachmentCount > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-faint">
                              <Paperclip className="w-3 h-3" />
                              {attachmentCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rodapé resumo */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-72 bg-card border-t border-border px-6 py-4 z-10">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-6xl mx-auto">
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-faint text-xs">Total de itens</p>
              <p className="font-semibold text-foreground">{totals.item_count}</p>
            </div>
            <div>
              <p className="text-faint text-xs">Concluídos</p>
              <p className="font-semibold text-foreground">{totals.completed_item_count}</p>
            </div>
            <div>
              <p className="text-faint text-xs">Total Estimado</p>
              <p className="font-semibold text-foreground">{money(totals.estimated_total)}</p>
            </div>
            <div>
              <p className="text-faint text-xs">Total Aprovado</p>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                {money(totals.approved_total)}
              </p>
            </div>
            <div>
              <p className="text-faint text-xs">Comissão Prevista</p>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                {money(totals.commission_total)}
              </p>
            </div>
            <div>
              <p className="text-faint text-xs">Comissão Recebida</p>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                {money(totals.commission_received_total)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Espaço para o rodapé */}
      <div className="h-20" />

      <BudgetItemDrawer
        open={itemDrawerOpen}
        onClose={() => {
          setItemDrawerOpen(false)
          setSelectedItem(null)
        }}
        item={drawerItem}
        onEdit={(item) => {
          setEditingItem(item)
          setAddItemOpen(true)
          setItemDrawerOpen(false)
        }}
        onDelete={(item) => setDeletingItem(item)}
        canEdit={canEdit}
      />

      <BudgetItemForm
        open={addItemOpen}
        onClose={closeItemForm}
        onSubmit={handleSaveItem}
        initialData={formInitialData}
        isLoading={createItemMutation.isPending || updateItemMutation.isPending}
        suppliers={suppliers}
        collaborators={collaborators}
      />

      {/*
        O original apaga o item direto do botão de lixeira do drawer, sem
        confirmar. O texto diz o que a exclusão leva junto — a cascata de
        `budget_item_quotes` e `budget_item_approval_files` (migrations 0049 e
        0054), mais os PDFs no Storage.
      */}
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o item <strong>{deletingItem?.name}</strong>? As
              cotações dos fornecedores e os PDFs anexados a ele são excluídos junto. Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
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
