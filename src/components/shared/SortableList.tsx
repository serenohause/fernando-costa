import { useId, type ReactNode } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical } from 'lucide-react'
import { moveItem } from '@/lib/reorder'

/*
  LISTA REORDENÁVEL POR ARRASTAR E SOLTAR — a das telas de Configurações.

  Substitui as setas de subir e descer, a pedido do usuário. Setas só trocam com o
  vizinho: levar o último item para o topo de uma lista de dez eram nove cliques.

  A MESMA BIBLIOTECA DO QUADRO do Fluxo do Projeto (@hello-pangea/dnd), e não uma
  segunda: o gesto de arrastar tem de se comportar igual nas duas telas, e são duas
  dependências a menos para manter alinhadas.

  ARRASTA-SE PELA ALÇA (⋮⋮), e não pela linha inteira. As linhas destas listas têm
  botões (editar, excluir) e interruptores; com a linha inteira como alça, um
  clique ligeiramente torto num interruptor viraria o começo de um arraste.

  TECLADO FUNCIONA sem nada a mais, porque a biblioteca já traz: foco na alça,
  espaço levanta, setas movem, espaço solta, Esc cancela. É o que substitui, para
  quem não usa mouse, as setas que saíram.

  A ORDEM NOVA É ENTREGUE PRONTA em `onReorder`; quem grava é o hook da lista, que
  já a mostra na hora (otimista) — sem isso o item voltaria ao lugar antigo e
  pularia de novo quando o banco respondesse.
*/
export default function SortableList<T extends { id: string }>({
  items,
  disabled = false,
  onReorder,
  className,
  itemClassName,
  renderItem,
  handleLabel = (item) => `Arrastar para reordenar ${item.id}`,
}: {
  items: T[]
  /* Sem permissão de edição a alça some e nada se arrasta. */
  disabled?: boolean
  onReorder: (ordered: T[]) => void
  className?: string
  itemClassName?: string
  renderItem: (item: T, handle: ReactNode) => ReactNode
  handleLabel?: (item: T) => string
}) {
  /* Um id por lista: duas listas na mesma tela não podem compartilhar o mesmo
     alvo de soltura. */
  const droppableId = useId()

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return
    onReorder(moveItem(items, result.source.index, result.destination.index))
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={droppableId} isDropDisabled={disabled}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={className}>
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={disabled}>
                {(dragProvided, snapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    /* O item levantado ganha fundo e sombra próprios: estas linhas
                       vivem dentro de um cartão com divisórias, e fora dele ficariam
                       transparentes sobre o que estiver por baixo. */
                    className={`${itemClassName ?? ''} ${
                      snapshot.isDragging ? 'bg-card shadow-lg ring-1 ring-border rounded-lg' : ''
                    }`}
                  >
                    {renderItem(
                      item,
                      disabled ? null : (
                        /* Um div, e não <button>: a biblioteca ignora arrastes que
                           começam em elemento interativo, e com <button> o teclado
                           nunca levantava o item. `dragHandleProps` já dá
                           role="button", tabIndex e a descrição para leitor de tela. */
                        <div
                          {...dragProvided.dragHandleProps}
                          aria-label={handleLabel(item)}
                          className="shrink-0 -ml-1 p-1 rounded text-faint hover:text-foreground cursor-grab active:cursor-grabbing focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                      ),
                    )}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
