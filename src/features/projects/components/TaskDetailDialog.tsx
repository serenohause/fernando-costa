import { format, parseISO } from 'date-fns'
import { BookOpen, Calendar, CheckSquare, Clock, FolderOpen, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Collaborator } from '@/features/team/types'
import { COLLABORATOR_ROLE, TASK_TYPE, labelOf, type TaskType } from '@/lib/enums'
import type { TaskChecklistItem, TaskRow } from '../types'

/*
  O DETALHE DA TAREFA, aberto pelo clique no cartão do Fluxo do Projeto.

  Existe para o cartão poder ser pequeno — pedido do usuário: "o card na
  visualização do kanban o menos poluído possível". Tudo o que saiu do cartão
  (prioridade por extenso, etapa, horas, progresso do projeto, o checklist
  inteiro) mora aqui, junto com as ações que antes só existiam no menu ⋮.

  É APRESENTAÇÃO: o TaskKanban calcula rótulo, cor e oferta de status e entrega
  pronto. As regras de quadro continuam num lugar só (flow.ts, board.ts e o
  próprio TaskKanban) e este arquivo não ganha uma segunda cópia delas.

  SEM DropdownMenu AQUI DENTRO, e não é gosto: o conteúdo do dropdown abre em
  z-index 10000 e este diálogo fica em 50001, então o menu abriria POR BAIXO do
  modal, invisível. Responsável é um Select (99999) e status operacional são
  botões.
*/

export type TagOffer = { key: string; label: string; dotClass: string; activeClass: string }

export default function TaskDetailDialog({
  task,
  onOpenChange,
  phaseLabel,
  priorityLabel,
  priorityClass,
  progress,
  checklist,
  tag,
  tagOptions,
  responsibles,
  isOverdue,
  canEdit,
  canDelete,
  canViewProjects,
  onEdit,
  onDelete,
  onToggleChecklistItem,
  onChangeResponsible,
  onSetOperationalTag,
  onOpenDiary,
  onOpenProject,
}: {
  /* Nulo fecha o diálogo. A tarefa vem do array vivo do quadro, e não de uma
     cópia guardada no clique: marcar um item atualiza o cache na hora (o toggle
     é otimista), e uma cópia congelada mostraria o item desmarcado. */
  task: TaskRow | null
  onOpenChange: (open: boolean) => void
  phaseLabel: string
  priorityLabel: string
  priorityClass: string
  progress: number | null
  checklist: TaskChecklistItem[]
  tag: { label: string; badgeClass: string; Icon: LucideIcon } | null
  tagOptions: TagOffer[]
  responsibles: Collaborator[]
  isOverdue: boolean
  canEdit: boolean
  canDelete: boolean
  canViewProjects: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleChecklistItem: (item: TaskChecklistItem) => void
  onChangeResponsible: (collaboratorId: string) => void
  onSetOperationalTag: (tag: string | null) => void
  onOpenDiary: () => void
  onOpenProject: () => void
}) {
  if (!task) {
    return <Dialog open={false} onOpenChange={onOpenChange} />
  }

  const done = checklist.filter((item) => item.is_completed).length
  const dueText = task.due_date ? format(parseISO(task.due_date), 'dd/MM/yyyy') : '—'
  const startText = task.start_date ? format(parseISO(task.start_date), 'dd/MM/yyyy') : '—'

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/*
        SEM FOCO AUTOMÁTICO no primeiro elemento. O Radix foca o primeiro item
        clicável ao abrir, e aqui ele é o link do projeto — que abria com o
        contorno de foco desenhado em volta, parecendo selecionado. O foco vai
        para o próprio diálogo; Tab continua levando aos controles, e Esc fecha.
      */}
      <DialogContent
        className="sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-lg leading-snug">{task.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-1.5 text-sm">
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              {task.project ? (
                canViewProjects ? (
                  <button
                    type="button"
                    onClick={onOpenProject}
                    className="truncate text-foreground underline-offset-2 hover:underline"
                  >
                    {task.project.name}
                  </button>
                ) : (
                  <span className="truncate">{task.project.name}</span>
                )
              ) : (
                <span>Sem projeto</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="bg-elevated text-soft border-border">
            {phaseLabel}
          </Badge>
          <Badge variant="outline" className={priorityClass}>
            {priorityLabel}
          </Badge>
          {task.task_type && (
            <Badge variant="outline" className="bg-elevated text-soft border-border">
              {labelOf(TASK_TYPE, task.task_type as TaskType)}
            </Badge>
          )}
          {tag && (
            <Badge variant="outline" className={`${tag.badgeClass} font-medium`}>
              <tag.Icon className="w-3 h-3 mr-1" />
              {tag.label}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-muted-foreground mb-1">Responsável</p>
            {canEdit ? (
              <Select
                value={task.responsible_id ?? undefined}
                onValueChange={(value) => onChangeResponsible(value)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  {responsibles.map((collaborator) => (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name} — {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-foreground">{task.responsible?.name ?? '—'}</p>
            )}
          </div>

          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-muted-foreground mb-1">Progresso do projeto</p>
            {progress == null ? (
              <p className="text-foreground">—</p>
            ) : (
              <div className="flex items-center gap-3 h-9">
                <Progress value={progress} className="h-1.5" />
                <span className="text-foreground font-medium tabular-nums">{progress}%</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Prazo</p>
            <p
              className={`flex items-center gap-1.5 ${
                isOverdue && !tag ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-foreground'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {dueText}
            </p>
            {/* A tag pausa o prazo no cartão (ver TaskKanban). Aqui a data
                continua visível — é o detalhe —, mas diz por que não conta. */}
            {tag && task.due_date && (
              <p className="text-xs text-muted-foreground mt-0.5">Pausado pelo status operacional</p>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Início</p>
            <p className="flex items-center gap-1.5 text-foreground">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {startText}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Horas</p>
            <p className="flex items-center gap-1.5 text-foreground">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {task.spent_hours ?? 0}h
              {task.estimated_hours != null && (
                <span className="text-muted-foreground">de {task.estimated_hours}h estimadas</span>
              )}
            </p>
          </div>
        </div>

        {task.description && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Descrição</p>
            <p className="text-sm text-soft whitespace-pre-line">{task.description}</p>
          </div>
        )}

        {/*
          STATUS OPERACIONAL: só as tags que a ETAPA desta tarefa oferece
          (configuração do quadro), e só para quem edita — a mesma oferta do
          submenu do cartão, calculada pelo TaskKanban.
        */}
        {canEdit && tagOptions.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Status operacional</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSetOperationalTag(null)}
                aria-pressed={!task.operational_tag}
                className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                  !task.operational_tag
                    ? 'bg-elevated border-foreground/30 font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Sem status
              </button>
              {tagOptions.map((option) => {
                const ativo = task.operational_tag === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onSetOperationalTag(option.key)}
                    aria-pressed={ativo}
                    className={`px-3 py-1 rounded-full border text-xs flex items-center gap-1.5 transition-colors ${
                      ativo
                        ? `${option.activeClass} border-foreground/30 text-foreground`
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${option.dotClass}`} />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" />
              Checklist da etapa
            </p>
            {checklist.length > 0 && (
              <span className="text-xs font-medium text-soft tabular-nums">
                {done}/{checklist.length}
              </span>
            )}
          </div>

          {checklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta etapa não tem itens de checklist.</p>
          ) : (
            <>
              <Progress value={(done / checklist.length) * 100} className="h-1.5 mb-3" />
              <div className="space-y-1 max-h-64 overflow-y-auto -mx-1.5">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 px-1.5 py-1.5 rounded ${
                      canEdit ? 'cursor-pointer hover:bg-elevated' : ''
                    }`}
                  >
                    <Checkbox
                      checked={item.is_completed}
                      disabled={!canEdit}
                      onCheckedChange={() => onToggleChecklistItem(item)}
                      className="mt-0.5"
                    />
                    <span
                      className={`text-sm flex-1 ${
                        item.is_completed ? 'line-through text-faint' : 'text-soft'
                      }`}
                    >
                      {item.title}
                      {/* Obrigatório é o que trava o avanço de etapa
                          (moveTaskToPhase) — vale saber qual é antes de arrastar. */}
                      {item.is_required && !item.is_completed && (
                        <span className="ml-1.5 text-xs text-rose-600 dark:text-rose-400">
                          obrigatório
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {task.project_id ? (
            <Button variant="outline" onClick={onOpenDiary}>
              <BookOpen className="w-4 h-4 mr-2" />
              Diário do Projeto
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2 justify-end">
            {canDelete && (
              <Button
                variant="ghost"
                onClick={onDelete}
                className="text-rose-600 dark:text-rose-400 hover:text-rose-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            )}
            {canEdit && (
              <Button onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
