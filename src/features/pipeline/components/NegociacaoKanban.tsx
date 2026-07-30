import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Calendar, DollarSign, Edit, MoreVertical, Trash2, TrendingUp, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FUNNEL_STAGE, SERVICE_TYPE, labelOf, type FunnelStage } from '@/lib/enums'
import { formatDateBR } from '@/lib/format'
import { formatCurrencyBRL } from '../format'
import type { NegotiationRow } from '../types'

/*
  Porta de projeto-original/src/components/negociacoes/NegociacaoKanban.jsx.

  A biblioteca de arrastar é a mesma (`@hello-pangea/dnd`), as cinco colunas são
  as mesmas na mesma ordem, a largura fixa de 300px, a altura
  `calc(100vh - 280px)`, o `space-y-2.5` entre cartões e a borda esquerda rosa do
  cartão vencido são os do original.

  DUAS TRADUÇÕES OBRIGATÓRIAS, e nenhuma delas é escolha de layout:

  1. O `droppableId` do original é o RÓTULO em português ("Lead recebido"), que
     lá é também o valor gravado. Aqui o valor do banco é `lead_received` e o
     rótulo vive em src/lib/enums.ts. O id da coluna passa a ser o valor; o
     título continua sendo exatamente o mesmo texto na tela.
  2. `cliente_name`, `responsavel_comercial_name` e o array `tipo_servico` viram
     os embeds `client`, `owner` e `services` — as desnormalizações não existem
     mais no schema (migration 0022).

  As cores das colunas são as do original (`from-slate-50 to-slate-100`,
  `from-blue-50 ...`) com variante escura acrescentada: no escuro, um degradê de
  tons 50/100 vira faixa branca sob texto claro.
*/

type Column = {
  id: FunnelStage
  color: string
  borderColor: string
}

const COLUMNS: Column[] = [
  {
    id: 'lead_received',
    /* O cinza do original é o próprio degrau neutro do tema: `muted`/`border`
       são exatamente slate-100 e slate-200 no claro e acompanham o escuro. */
    color: 'from-muted to-border',
    borderColor: 'border-border',
  },
  {
    id: 'qualified',
    color: 'from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40',
    borderColor: 'border-blue-200 dark:border-blue-900',
  },
  {
    id: 'proposal_sent',
    color: 'from-violet-50 to-violet-100 dark:from-violet-950/40 dark:to-violet-900/40',
    borderColor: 'border-violet-200 dark:border-violet-900',
  },
  {
    id: 'negotiating',
    color: 'from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/40',
    borderColor: 'border-amber-200 dark:border-amber-900',
  },
  {
    id: 'closing',
    color: 'from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/40',
    borderColor: 'border-emerald-200 dark:border-emerald-900',
  },
]

const COLUMN_HEIGHT = 'calc(100vh - 280px)'

export default function NegociacaoKanban({
  negotiations,
  onStageChange,
  onEdit,
  onDelete,
  canEdit,
}: {
  negotiations: NegotiationRow[]
  onStageChange: (id: string, stage: FunnelStage) => void
  onEdit: (negotiation: NegotiationRow) => void
  onDelete: (negotiation: NegotiationRow) => void
  /*
    Não existe no original, onde qualquer pessoa que abre a tela arrasta. Aqui a
    escrita é `can_edit_menu('pipeline')` e o banco recusa de qualquer forma —
    um cartão que se move e volta sozinho é pior do que um cartão que não se
    move.
  */
  canEdit: boolean
}) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.droppableId === result.source.droppableId) return

    onStageChange(result.draggableId, result.destination.droppableId as FunnelStage)
  }

  const byStage = (stage: FunnelStage) => negotiations.filter((n) => n.funnel_stage === stage)

  const isOverdue = (negotiation: NegotiationRow) =>
    Boolean(
      negotiation.expected_close_date &&
        new Date(negotiation.expected_close_date) < new Date() &&
        negotiation.status === 'active',
    )

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
        {COLUMNS.map((column) => (
          <div
            key={column.id}
            className={`flex flex-col min-w-[300px] w-[300px] shrink-0 bg-card rounded-xl border ${column.borderColor} shadow-xs`}
            style={{ height: COLUMN_HEIGHT }}
          >
            {/* Header */}
            <div
              className={`bg-gradient-to-br ${column.color} px-4 py-3 border-b ${column.borderColor} rounded-t-xl shrink-0`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">
                  {labelOf(FUNNEL_STAGE, column.id)}
                </h3>
                <Badge variant="secondary" className="text-xs font-semibold">
                  {byStage(column.id).length}
                </Badge>
              </div>
            </div>

            {/* Droppable area */}
            <Droppable droppableId={column.id} isDropDisabled={!canEdit}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 p-3 overflow-y-auto transition-colors ${
                    snapshot.isDraggingOver ? 'bg-elevated' : ''
                  }`}
                  style={{ minHeight: '80px' }}
                >
                  <div className="space-y-2.5">
                    {byStage(column.id).map((negotiation, index) => (
                      <Draggable
                        key={negotiation.id}
                        draggableId={negotiation.id}
                        index={index}
                        isDragDisabled={!canEdit}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <Card
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={`${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} bg-card border border-border transition-shadow ${
                              dragSnapshot.isDragging
                                ? 'shadow-2xl ring-2 ring-faint'
                                : 'hover:shadow-md hover:border-faint'
                            } ${isOverdue(negotiation) ? 'border-l-4 border-l-rose-500' : ''}`}
                          >
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start justify-between">
                                <h4 className="font-bold text-foreground text-sm line-clamp-2 flex-1 pr-2">
                                  {negotiation.name}
                                </h4>
                                {canEdit && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 -mt-1 shrink-0"
                                      >
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => onEdit(negotiation)}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Editar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => onDelete(negotiation)}
                                        className="text-rose-600 dark:text-rose-400"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>

                              {negotiation.client && (
                                <div className="flex items-center gap-2 text-xs text-soft">
                                  <User className="h-3.5 w-3.5 text-faint" />
                                  <span className="font-medium">{negotiation.client.name}</span>
                                </div>
                              )}

                              <div className="space-y-2.5">
                                {negotiation.services.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {negotiation.services.map((service) => (
                                      <Badge
                                        key={service.service_type}
                                        variant="outline"
                                        className="text-xs bg-elevated"
                                      >
                                        {labelOf(SERVICE_TYPE, service.service_type)}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {Boolean(negotiation.close_probability) && (
                                  <div className="flex items-center gap-1.5 text-xs text-soft">
                                    <TrendingUp className="h-3.5 w-3.5 text-faint" />
                                    <span className="font-medium">
                                      {negotiation.close_probability}% prob.
                                    </span>
                                  </div>
                                )}

                                {Boolean(negotiation.estimated_value) && (
                                  <div className="flex items-center gap-1.5 text-base font-bold text-foreground pt-1">
                                    <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    {formatCurrencyBRL(negotiation.estimated_value)}
                                  </div>
                                )}

                                <div className="pt-2 border-t border-border space-y-1.5">
                                  {negotiation.expected_close_date && (
                                    <div
                                      className={`flex items-center gap-1.5 text-xs ${
                                        isOverdue(negotiation)
                                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                          : 'text-muted-foreground'
                                      }`}
                                    >
                                      <Calendar className="h-3.5 w-3.5" />
                                      <span>
                                        Prev: {formatDateBR(negotiation.expected_close_date)}
                                      </span>
                                    </div>
                                  )}

                                  {negotiation.owner && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-faint" />
                                      {negotiation.owner.name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  )
}
