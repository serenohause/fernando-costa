import { useEffect, useRef, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Activity,
  AlignLeft,
  BookOpen,
  Calendar,
  Check,
  CheckSquare,
  ClipboardList,
  Clock,
  FolderOpen,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash2,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { useTaskActivity } from '@/features/diary/hooks'
import type { Collaborator } from '@/features/team/types'
import { COLLABORATOR_ROLE, labelOf } from '@/lib/enums'
import {
  describeTaskError,
  useAddChecklistItem,
  useDeleteChecklistItem,
  useUpdateChecklistItem,
  useUpdateTaskFields,
} from '../hooks'
import { initialsOf } from '../initials'
import type { TaskChecklistItem, TaskRow } from '../types'

/*
  O CARTÃO ABERTO — no formato do Trello, a pedido do usuário: "não é um modal de
  editar tarefas que eu quero, é um modal estilo Trello, com os objetivos da
  tarefa e mais detalhes".

  A diferença para um formulário é o que manda na tela. Aqui o conteúdo é o
  assunto: título grande, descrição, os OBJETIVOS (o checklist) e a ATIVIDADE; os
  dados de controle (responsável, etiquetas, prazo) são chips no topo; e as
  ações moram numa coluna lateral estreita. E nada "abre edição" — cada coisa se
  muda no lugar: clica no título e escreve, clica na descrição e escreve, marca e
  adiciona objetivo ali mesmo.

  AS REGRAS DE QUADRO NÃO MORAM AQUI. Rótulo de etapa, cor de status, quais status
  a etapa oferece e o que é atraso vêm prontos do TaskKanban. Este arquivo decide
  só o desenho, e os gestos novos (título, descrição, prazo e objetivos) passam
  pelos hooks de `../hooks`.

  SEM DropdownMenu AQUI DENTRO: ele abre em z-index 10000 e o diálogo fica em
  50001, então abriria por baixo, invisível. As listas da coluna lateral são
  Popover (99999).
*/

export type TagOffer = { key: string; label: string; dotClass: string; activeClass: string }

type Props = {
  /* A tarefa vem do array vivo do quadro: o toggle do checklist e a edição no
     lugar são otimistas, e uma cópia congelada no clique mostraria o antes. */
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
}

export default function TaskDetailDialog(props: Props) {
  /* O cartão é um componente à parte para os hooks dele rodarem sempre com uma
     tarefa de verdade — com a tarefa nula não há o que consultar. */
  if (!props.task) return <Dialog open={false} onOpenChange={props.onOpenChange} />
  return <OpenCard {...props} task={props.task} />
}

function OpenCard({
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
}: Props & { task: TaskRow }) {
  const updateFields = useUpdateTaskFields()
  const addItem = useAddChecklistItem()
  const deleteItem = useDeleteChecklistItem()
  const updateItem = useUpdateChecklistItem()

  /* Responsável e prazo de um objetivo (migration 0098). Nulo remove. */
  const salvarItem = (
    item: TaskChecklistItem,
    patch: { assignee_id?: string | null; due_date?: string | null },
  ) =>
    updateItem(
      { id: item.id, patch },
      {
        onError: (error) =>
          toast.error('Não foi possível alterar o objetivo: ' + describeTaskError(error)),
      },
    )
  const activityQuery = useTaskActivity(task.project_id, task.id)

  const [adding, setAdding] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  const done = checklist.filter((item) => item.is_completed).length
  const percent = checklist.length === 0 ? 0 : Math.round((done / checklist.length) * 100)

  const salvar = (patch: Parameters<typeof updateFields>[0]['patch'], sucesso?: string) =>
    updateFields(
      { id: task.id, patch },
      {
        onSuccess: () => sucesso && toast.success(sucesso),
        onError: (error) => toast.error('Não foi possível salvar: ' + describeTaskError(error)),
      },
    )

  const abrirAdicionar = () => {
    setAdding(true)
    /* Espera o input existir antes de focar. */
    setTimeout(() => addInputRef.current?.focus(), 0)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* Sem foco automático: o Radix focaria o primeiro botão (o título), que
          abriria com contorno de seleção e reagiria ao Enter que abriu o cartão. */}
      <DialogContent
        className="sm:max-w-3xl p-0 gap-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        /*
          ESC DENTRO DE UM CAMPO EM EDIÇÃO FECHA SÓ O CAMPO. O Radix escuta o Esc
          no `document`, então o `stopPropagation` do onKeyDown do React não o
          segura — o teste pegou: apertar Esc no "adicionar objetivo" fechava o
          cartão inteiro e jogava fora o que estava sendo escrito. Os campos de
          edição no lugar levam `data-inline-edit`, e o Esc nascido neles é
          deixado para o próprio campo tratar.
        */
        onEscapeKeyDown={(event) => {
          const alvo = event.target as HTMLElement | null
          if (alvo?.closest('[data-inline-edit]')) event.preventDefault()
        }}
      >
        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex gap-3 px-6 pt-6 pb-4 pr-12">
          <ClipboardList className="w-5 h-5 mt-1 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            {/*
              O título do diálogo para leitor de tela fica à parte, escondido: o
              título visível é um botão que vira campo, e `asChild` sobre ele
              perderia o `id` que liga o diálogo ao seu nome.
            */}
            <DialogTitle className="sr-only">{task.title}</DialogTitle>
            <InlineTitle
              value={task.title}
              canEdit={canEdit}
              onSave={(title) => salvar({ title })}
            />
            <DialogDescription asChild>
              <p className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  na etapa <span className="font-medium text-foreground">{phaseLabel}</span>
                </span>
                {task.project && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="flex items-center gap-1 min-w-0">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      {canViewProjects ? (
                        <button
                          type="button"
                          onClick={onOpenProject}
                          className="truncate text-foreground underline-offset-2 hover:underline"
                        >
                          {task.project.name}
                        </button>
                      ) : (
                        <span className="truncate">{task.project.name}</span>
                      )}
                    </span>
                  </>
                )}
              </p>
            </DialogDescription>
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_12rem] gap-6 px-6 pb-6">
          {/* ── Conteúdo ────────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-7">
            {/* Chips de controle, como os "Membros / Etiquetas / Datas" do Trello. */}
            <div className="flex flex-wrap gap-x-6 gap-y-4 pl-8">
              <MetaBlock label="Responsável">
                {task.responsible ? (
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <Avatar name={task.responsible.name} />
                    {task.responsible.name}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Sem responsável</span>
                )}
              </MetaBlock>

              <MetaBlock label="Etiquetas">
                <span className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={priorityClass}>
                    {priorityLabel}
                  </Badge>
                  {tag && (
                    <Badge variant="outline" className={`${tag.badgeClass} font-medium`}>
                      <tag.Icon className="w-3 h-3 mr-1" />
                      {tag.label}
                    </Badge>
                  )}
                </span>
              </MetaBlock>

              <MetaBlock label="Prazo">
                {task.due_date ? (
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm px-2 py-0.5 rounded-md ${
                      isOverdue && !tag
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-medium'
                        : 'bg-elevated text-foreground'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                    {isOverdue && !tag && <span className="text-xs">· atrasada</span>}
                    {/* A tag pausa o prazo no quadro; aqui a data aparece, mas diz por quê não conta. */}
                    {tag && <span className="text-xs text-muted-foreground">· pausado</span>}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Sem prazo</span>
                )}
              </MetaBlock>

              {progress != null && (
                <MetaBlock label="Progresso do projeto">
                  <span className="flex items-center gap-2 w-36">
                    <Progress value={progress} className="h-1.5" />
                    <span className="text-sm font-medium text-foreground tabular-nums">{progress}%</span>
                  </span>
                </MetaBlock>
              )}
            </div>

            {/* ── Descrição ─────────────────────────────────────────────── */}
            <Section icon={AlignLeft} title="Descrição">
              <InlineDescription
                value={task.description}
                canEdit={canEdit}
                onSave={(description) => salvar({ description })}
              />
            </Section>

            {/* ── Objetivos ─────────────────────────────────────────────── */}
            <Section
              icon={CheckSquare}
              title="Objetivos"
              aside={
                checklist.length > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {done} de {checklist.length}
                  </span>
                ) : null
              }
            >
              {checklist.length > 0 && (
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-muted-foreground w-9 tabular-nums">{percent}%</span>
                  <Progress
                    value={percent}
                    className={`h-2 ${percent === 100 ? '[&>div]:bg-emerald-500' : ''}`}
                  />
                </div>
              )}

              <div className="space-y-0.5 -mx-2">
                {checklist.map((item) => (
                  <ObjectiveRow
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    responsibles={responsibles}
                    onToggle={() => onToggleChecklistItem(item)}
                    onAssign={(assigneeId) => salvarItem(item, { assignee_id: assigneeId })}
                    onDue={(due) => salvarItem(item, { due_date: due })}
                    onRemove={() =>
                      deleteItem(
                        { id: item.id, isRequired: item.is_required },
                        {
                          onError: (error) =>
                            toast.error('Não foi possível remover: ' + describeTaskError(error)),
                        },
                      )
                    }
                  />
                ))}
              </div>

              {checklist.length === 0 && !adding && (
                <p className="text-sm text-muted-foreground">Nenhum objetivo nesta etapa ainda.</p>
              )}

              {canEdit &&
                (adding ? (
                  <form
                    className="mt-2 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const input = addInputRef.current
                      if (!input || !input.value.trim()) return
                      const titulo = input.value
                      addItem.mutate(
                        {
                          taskId: task.id,
                          phase: task.phase,
                          title: titulo,
                          displayOrder:
                            checklist.reduce((maior, item) => Math.max(maior, item.display_order ?? 0), 0) + 1,
                        },
                        {
                          /* Como no Trello: o campo fica aberto e vazio para o
                             próximo objetivo. */
                          onSuccess: () => {
                            input.value = ''
                            input.focus()
                          },
                          onError: (error) =>
                            toast.error('Não foi possível adicionar: ' + describeTaskError(error)),
                        },
                      )
                    }}
                  >
                    <Input
                      ref={addInputRef}
                      data-inline-edit
                      placeholder="Descreva o objetivo"
                      maxLength={300}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          /* Esc fecha só o campo, e não o cartão inteiro. */
                          event.stopPropagation()
                          setAdding(false)
                        }
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Button type="submit" size="sm" disabled={addItem.isPending}>
                        Adicionar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button variant="secondary" size="sm" className="mt-2" onClick={abrirAdicionar}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Adicionar um objetivo
                  </Button>
                ))}
            </Section>

            {/* ── Atividade ─────────────────────────────────────────────── */}
            <Section icon={Activity} title="Atividade">
              <ActivityFeed
                hasProject={Boolean(task.project_id)}
                isLoading={activityQuery.isLoading}
                isError={activityQuery.isError}
                entries={activityQuery.data ?? []}
              />
            </Section>
          </div>

          {/* ── Coluna lateral ──────────────────────────────────────────── */}
          <aside className="space-y-5">
            {canEdit && (
              <SideGroup title="Adicionar ao cartão">
                <PickerPopover icon={User} label="Responsável">
                  {(fechar) => (
                    <div className="max-h-64 overflow-y-auto -m-1">
                      {responsibles.map((collaborator) => (
                        <button
                          key={collaborator.id}
                          type="button"
                          onClick={() => {
                            onChangeResponsible(collaborator.id)
                            fechar()
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-elevated"
                        >
                          <Avatar name={collaborator.name} />
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-foreground">{collaborator.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                            </span>
                          </span>
                          {task.responsible_id === collaborator.id && (
                            <Check className="w-4 h-4 text-foreground" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </PickerPopover>

                {/* Status só existe onde a ETAPA oferece — a mesma oferta do ⋮. */}
                {tagOptions.length > 0 && (
                  <PickerPopover icon={Tag} label="Status">
                    {(fechar) => (
                      <div className="-m-1">
                        {[{ key: null as string | null, label: 'Sem status', dotClass: 'bg-transparent border border-border', activeClass: '' }, ...tagOptions].map(
                          (option) => (
                            <button
                              key={option.key ?? 'nenhum'}
                              type="button"
                              onClick={() => {
                                onSetOperationalTag(option.key)
                                fechar()
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-elevated"
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${option.dotClass}`} />
                              <span className="flex-1 text-foreground">{option.label}</span>
                              {task.operational_tag === option.key && (
                                <Check className="w-4 h-4 text-foreground" />
                              )}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </PickerPopover>
                )}

                <PickerPopover icon={Calendar} label="Prazo">
                  {(fechar) => (
                    <DuePicker
                      value={task.due_date}
                      onSave={(due) => {
                        salvar({ due_date: due }, due ? 'Prazo atualizado' : 'Prazo removido')
                        fechar()
                      }}
                    />
                  )}
                </PickerPopover>

                <SideButton icon={CheckSquare} label="Objetivo" onClick={abrirAdicionar} />
              </SideGroup>
            )}

            <SideGroup title="Ações">
              {task.project_id && (
                <SideButton icon={BookOpen} label="Diário do Projeto" onClick={onOpenDiary} />
              )}
              {/* Tipo, prioridade, datas e horas continuam no formulário completo:
                  são dados de planejamento, não o dia a dia do cartão. */}
              {canEdit && (
                <SideButton icon={SlidersHorizontal} label="Todos os campos" onClick={onEdit} />
              )}
              {canDelete && (
                <SideButton icon={Trash2} label="Excluir" onClick={onDelete} destructive />
              )}
            </SideGroup>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Peças ────────────────────────────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: LucideIcon
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold text-foreground flex-1">{title}</h3>
        {aside}
      </div>
      {/* O recuo alinha o conteúdo com o título da seção, e não com o ícone. */}
      <div className="pl-8">{children}</div>
    </section>
  )
}

function MetaBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      {children}
    </div>
  )
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`${
        size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]'
      } rounded-full bg-elevated border border-border font-semibold text-soft flex items-center justify-center shrink-0`}
      title={name}
    >
      {initialsOf(name)}
    </span>
  )
}

function SideGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function SideButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  destructive?: boolean
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      className={`w-full justify-start ${destructive ? 'text-rose-600 dark:text-rose-400' : ''}`}
    >
      <Icon className="w-4 h-4 mr-2" />
      {label}
    </Button>
  )
}

function PickerPopover({
  icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: (fechar: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <SideButton icon={icon} label={label} />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="text-xs font-medium text-muted-foreground px-1 pb-2 mb-1 border-b border-border text-center">
          {label}
        </p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

/*
  O TÍTULO EDITÁVEL NO LUGAR. Clica e vira campo; Enter ou sair do campo grava,
  Esc desfaz. Título vazio não grava — volta ao que era, em vez de mandar ao
  banco uma recusa que o próprio campo já sabe que viria.
*/
function InlineTitle({
  value,
  canEdit,
  onSave,
}: {
  value: string
  canEdit: boolean
  onSave: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const concluir = () => {
    setEditing(false)
    const novo = draft.trim()
    if (!novo || novo === value) {
      setDraft(value)
      return
    }
    onSave(novo)
  }

  if (!canEdit) {
    return <h2 className="text-xl font-semibold text-foreground leading-snug wrap-break-word">{value}</h2>
  }

  if (editing) {
    return (
      <Textarea
        autoFocus
        data-inline-edit
        value={draft}
        rows={2}
        maxLength={300}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={concluir}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            concluir()
          }
          if (event.key === 'Escape') {
            event.stopPropagation()
            setDraft(value)
            setEditing(false)
          }
        }}
        className="text-xl font-semibold leading-snug resize-none -mx-2 px-2"
      />
    )
  }

  return (
    <h2>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-xl font-semibold text-foreground leading-snug wrap-break-word rounded -mx-1 px-1 hover:bg-elevated"
      >
        {value}
      </button>
    </h2>
  )
}

/*
  A DESCRIÇÃO EDITÁVEL NO LUGAR — com botão de salvar, e não gravação ao sair do
  campo: descrição é texto longo, e sair sem querer (um clique fora) perderia um
  parágrafo ou gravaria um rascunho.
*/
function InlineDescription({
  value,
  canEdit,
  onSave,
}: {
  value: string | null
  canEdit: boolean
  onSave: (description: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea
          autoFocus
          data-inline-edit
          rows={5}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setEditing(false)
            }
          }}
          placeholder="Adicione uma descrição mais detalhada…"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              onSave(draft.trim() ? draft : null)
              setEditing(false)
            }}
          >
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  if (value) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left text-sm text-soft whitespace-pre-line rounded-md -mx-2 px-2 py-1 hover:bg-elevated"
      >
        {value}
      </button>
    ) : (
      <p className="text-sm text-soft whitespace-pre-line">{value}</p>
    )
  }

  return canEdit ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full text-left text-sm text-muted-foreground bg-elevated hover:bg-muted rounded-md px-3 py-3 transition-colors"
    >
      Adicione uma descrição mais detalhada…
    </button>
  ) : (
    <p className="text-sm text-muted-foreground">Sem descrição.</p>
  )
}

/*
  UM OBJETIVO, com os botões de responsável e prazo ao lado — o item do checklist
  do Trello.

  DINÂMICO nos dois sentidos pedidos:
  - SEM responsável ou prazo, os botões (pessoa e relógio) só aparecem ao passar o
    mouse, para a lista não virar uma fileira de ícones vazios. No celular não há
    "passar o mouse", então lá eles ficam sempre visíveis.
  - COM responsável ou prazo, o botão dá lugar ao valor — o avatar e a data — e é
    o próprio valor que se clica para trocar ou remover.

  O PRAZO DO OBJETIVO É SÓ DELE: vermelho quando venceu e o objetivo não foi
  cumprido, verde quando foi cumprido, neutro no resto. A tarefa não fica
  atrasada por causa dele (ver a migration 0098).
*/
function ObjectiveRow({
  item,
  canEdit,
  responsibles,
  onToggle,
  onAssign,
  onDue,
  onRemove,
}: {
  item: TaskChecklistItem
  canEdit: boolean
  responsibles: Collaborator[]
  onToggle: () => void
  onAssign: (assigneeId: string | null) => void
  onDue: (due: string | null) => void
  onRemove: () => void
}) {
  const assignee = item.assignee_id
    ? (responsibles.find((collaborator) => collaborator.id === item.assignee_id) ?? null)
    : null
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const vencido = Boolean(item.due_date && item.due_date < hoje && !item.is_completed)

  /* Botão vazio: some até o hover no desktop, fica visível no celular e enquanto
     o popover dele estiver aberto. */
  const vazio =
    'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100'

  return (
    <div className="group flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-elevated">
      <Checkbox
        checked={item.is_completed}
        disabled={!canEdit}
        onCheckedChange={onToggle}
        className="mt-0.5"
        aria-label={`Marcar ${item.title}`}
      />
      <span
        className={`text-sm flex-1 min-w-0 ${
          item.is_completed ? 'line-through text-faint' : 'text-foreground'
        }`}
      >
        {item.title}
        {/* Obrigatório é o que trava o avanço de etapa — vale saber qual é antes
            de arrastar o cartão. */}
        {item.is_required && (
          <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            obrigatório
          </span>
        )}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        {/* ── Prazo ── */}
        {(item.due_date || canEdit) && (
          <ObjectivePopover
            label="Prazo do objetivo"
            disabled={!canEdit}
            trigger={
              item.due_date ? (
                <span
                  className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded tabular-nums ${
                    item.is_completed
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      : vencido
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-medium'
                        : 'bg-elevated text-soft border border-border'
                  }`}
                  title={vencido ? 'Prazo do objetivo vencido' : 'Prazo do objetivo'}
                >
                  <Clock className="w-3 h-3" />
                  {format(parseISO(item.due_date), 'dd/MM')}
                </span>
              ) : (
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted ${vazio}`}
                  title="Definir prazo"
                >
                  <Clock className="w-3.5 h-3.5" />
                </span>
              )
            }
          >
            {(fechar) => (
              <DuePicker
                value={item.due_date}
                onSave={(due) => {
                  onDue(due)
                  fechar()
                }}
              />
            )}
          </ObjectivePopover>
        )}

        {/* ── Responsável ── */}
        {(item.assignee_id || canEdit) && (
          <ObjectivePopover
            label="Responsável pelo objetivo"
            disabled={!canEdit}
            trigger={
              item.assignee_id ? (
                assignee ? (
                  <Avatar name={assignee.name} size="sm" />
                ) : (
                  /* Colaborador fora da lista de responsáveis (desativado, por
                     exemplo): o objetivo continua com dono, só não há nome ativo
                     para mostrar. */
                  <span
                    className="w-6 h-6 rounded-full bg-elevated border border-border flex items-center justify-center text-muted-foreground"
                    title="Colaborador inativo"
                  >
                    <User className="w-3 h-3" />
                  </span>
                )
              ) : (
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted ${vazio}`}
                  title="Atribuir responsável"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </span>
              )
            }
          >
            {(fechar) => (
              <div className="max-h-64 overflow-y-auto -m-1">
                {responsibles.map((collaborator) => (
                  <button
                    key={collaborator.id}
                    type="button"
                    onClick={() => {
                      onAssign(collaborator.id)
                      fechar()
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-elevated"
                  >
                    <Avatar name={collaborator.name} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-foreground">{collaborator.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                      </span>
                    </span>
                    {item.assignee_id === collaborator.id && (
                      <Check className="w-4 h-4 text-foreground" />
                    )}
                  </button>
                ))}
                {item.assignee_id && (
                  <button
                    type="button"
                    onClick={() => {
                      onAssign(null)
                      fechar()
                    }}
                    className="w-full mt-1 pt-2 border-t border-border px-2 py-1.5 rounded text-left text-sm text-muted-foreground hover:text-foreground hover:bg-elevated"
                  >
                    Remover responsável
                  </button>
                )}
              </div>
            )}
          </ObjectivePopover>
        )}

        {/* Obrigatório não tem "x": removê-lo seria pular a trava sem cumprir
            nada. O hook recusa também, mas a tela não oferece. */}
        {canEdit && !item.is_required && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover ${item.title}`}
            className={`flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted ${vazio}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ObjectivePopover({
  label,
  trigger,
  disabled,
  children,
}: {
  label: string
  trigger: ReactNode
  disabled: boolean
  children: (fechar: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)

  /* Quem só lê vê o avatar e a data, mas não abre nada. */
  if (disabled) return <>{trigger}</>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="rounded focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="text-xs font-medium text-muted-foreground px-1 pb-2 mb-1 border-b border-border text-center">
          {label}
        </p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

function DuePicker({
  value,
  onSave,
}: {
  value: string | null
  onSave: (due: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  return (
    <div className="space-y-2 p-1">
      <Input type="date" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!draft} onClick={() => onSave(draft)}>
          Salvar
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onSave(null)}>
            Remover
          </Button>
        )}
      </div>
    </div>
  )
}

/*
  O FEED DE ATIVIDADE: os eventos que o sistema já grava no Diário do Projeto
  para esta tarefa — mudança de etapa, troca de responsável, status ligado e
  desligado (ver `useTaskActivity`).
*/
function ActivityFeed({
  hasProject,
  isLoading,
  isError,
  entries,
}: {
  hasProject: boolean
  isLoading: boolean
  isError: boolean
  entries: {
    id: string
    title: string
    created_at: string
    created_by: { id: string; name: string } | null
  }[]
}) {
  /* Os eventos são gravados no diário DO PROJETO; tarefa solta não tem onde. */
  if (!hasProject) {
    return (
      <p className="text-sm text-muted-foreground">
        Tarefa sem projeto não registra atividade.
      </p>
    )
  }
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((index) => (
          <div key={index} className="h-9 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    )
  }
  if (isError) {
    return <p className="text-sm text-destructive">Não foi possível carregar a atividade agora.</p>
  }
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma atividade ainda. Mudanças de etapa, responsável e status aparecem aqui.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3">
          {entry.created_by ? (
            <Avatar name={entry.created_by.name} />
          ) : (
            <span className="w-7 h-7 rounded-full bg-elevated border border-border shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-foreground">
              {entry.created_by && <span className="font-semibold">{entry.created_by.name} </span>}
              {entry.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(entry.created_at), "dd/MM/yyyy 'às' HH:mm")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
