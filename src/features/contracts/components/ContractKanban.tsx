import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Calendar, FileText, User } from 'lucide-react'
import CardLink from '@/components/shared/CardLink'
import ClientLink from '@/features/crm/components/ClientLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CONTRACT_STATUS, CONTRACT_TYPE, labelOf, type ContractStatus } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import type { ContractRow } from '../types'

/*
  O QUADRO DE CONTRATOS, por status.

  Aba nova ao lado das que já existiam, e não substituição: o pedido do usuário
  foi "add uma aba com kanban e mantém as outras como está". As listas continuam
  fazendo o que o quadro não faz — ordenar por arraste (`display_order`) e
  mostrar as colunas de valor e parcelamento lado a lado.

  A SINCRONIA ENTRE AS ABAS NÃO PRECISOU SER CONSTRUÍDA, e vale registrar por
  quê: todas leem `useContracts()`, uma consulta só. Mover um cartão aqui grava e
  invalida essa consulta; a lista da aba vizinha relê e mostra o novo status.
  Guardar o estado em cada aba é que teria criado duas verdades.

  AS COLUNAS SÃO OS CINCO STATUS, inclusive "Rescindido" — que não tem aba
  própria. Nas listas ele só aparece em "Todos", e um contrato rescindido some da
  vista de quem filtra; aqui ele tem lugar, e é possível arrastar para fora dele.
*/
const COLUMNS: { id: ContractStatus; color: string; border: string }[] = [
  {
    id: 'negotiating',
    color: 'from-muted to-border',
    border: 'border-border',
  },
  {
    id: 'approved',
    color: 'from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40',
    border: 'border-blue-200 dark:border-blue-900',
  },
  {
    id: 'in_progress',
    color: 'from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/40',
    border: 'border-amber-200 dark:border-amber-900',
  },
  {
    id: 'completed',
    color: 'from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/40',
    border: 'border-emerald-200 dark:border-emerald-900',
  },
  {
    id: 'terminated',
    color: 'from-rose-50 to-rose-100 dark:from-rose-950/40 dark:to-rose-900/40',
    border: 'border-rose-200 dark:border-rose-900',
  },
]

/* A mesma altura do quadro do Pipeline: as duas telas são o mesmo gesto e ficar
   com alturas diferentes faz a troca de módulo parecer troca de sistema. */
const COLUMN_HEIGHT = 'calc(100vh - 380px)'

export default function ContractKanban({
  contracts,
  onStatusChange,
  onOpen,
  canEdit,
}: {
  contracts: ContractRow[]
  /* Quem decide o que fazer com a mudança é a tela: soltar em "Aprovado" abre
     confirmação, porque aquele gesto cria projeto e cartão no Fluxo. O quadro
     não conhece essa regra — ele relata o gesto. */
  onStatusChange: (contract: ContractRow, status: ContractStatus) => void
  onOpen: (contract: ContractRow) => void
  canEdit: boolean
}) {

  const byStatus = (status: ContractStatus) => contracts.filter((c) => c.status === status)

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.droppableId === result.source.droppableId) return

    const contract = contracts.find((c) => c.id === result.draggableId)
    if (!contract) return

    onStatusChange(contract, result.destination.droppableId as ContractStatus)
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => {
          const columnContracts = byStatus(column.id)
          const total = columnContracts.reduce((sum, c) => sum + Number(c.total_value ?? 0), 0)

          return (
            <div
              key={column.id}
              className={`flex flex-col min-w-[300px] w-[300px] shrink-0 bg-card rounded-xl border ${column.border} shadow-xs`}
              style={{ height: COLUMN_HEIGHT }}
            >
              <div
                className={`bg-gradient-to-br ${column.color} px-4 py-3 border-b ${column.border} rounded-t-xl shrink-0`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">
                    {labelOf(CONTRACT_STATUS, column.id)}
                  </h3>
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {columnContracts.length}
                  </Badge>
                </div>
                {/* O somatório da coluna: é a pergunta que a diretoria faz
                    olhando um quadro de contratos, e a lista já a responde por
                    outro caminho. */}
                <p className="text-xs text-soft mt-1">{formatCurrencyBRL(total)}</p>
              </div>

              <Droppable droppableId={column.id} isDropDisabled={!canEdit}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 overflow-y-auto p-2 rounded-b-xl transition-colors ${
                      snapshot.isDraggingOver ? 'bg-elevated' : ''
                    }`}
                  >
                    <div className="space-y-2.5">
                      {columnContracts.map((contract, index) => (
                        <Draggable
                          key={contract.id}
                          draggableId={contract.id}
                          index={index}
                          isDragDisabled={!canEdit}
                        >
                          {(dragProvided, dragSnapshot) => (
                            <Card
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => onOpen(contract)}
                              className={`${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} bg-card border border-border transition-shadow ${
                                dragSnapshot.isDragging
                                  ? 'shadow-2xl ring-2 ring-faint'
                                  : 'hover:shadow-md hover:border-faint'
                              }`}
                            >
                              <CardContent className="p-4 space-y-2.5">
                                <div className="flex items-start gap-2">
                                  <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-faint" />
                                  {/* O cartão inteiro já abre o contrato; o
                                      número vira link para o gesto ficar
                                      visível, e não só descoberto por
                                      tentativa. */}
                                  <CardLink
                                    onClick={() => onOpen(contract)}
                                    className="font-bold text-foreground text-sm line-clamp-2"
                                  >
                                    {contract.contract_number}
                                  </CardLink>
                                </div>

                                {contract.client && (
                                  <div className="flex items-center gap-2 text-xs text-soft">
                                    <User className="h-3.5 w-3.5 shrink-0 text-faint" />
                                    {/* O NOME DO CLIENTE ABRE O CADASTRO DELE,
                                        e não o contrato — é o mesmo gesto do
                                        quadro do Pipeline. Sem permissão de ver
                                        o CRM não vira link: o motivo é
                                        coerência com o menu, não
                                        confidencialidade. */}
                                    <ClientLink
                                      clientId={contract.client.id}
                                      name={contract.client.name}
                                      className="font-medium line-clamp-1"
                                    />
                                  </div>
                                )}

                                {contract.project_name && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {contract.project_name}
                                  </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-1">
                                  <span className="text-sm font-bold text-foreground">
                                    {formatCurrencyBRL(contract.total_value)}
                                  </span>
                                  <Badge variant="outline" className="text-xs bg-elevated">
                                    {labelOf(CONTRACT_TYPE, contract.contract_type)}
                                  </Badge>
                                </div>

                                {contract.signature_date && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {formatDateBR(contract.signature_date)}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                    </div>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
