import { useEffect, useRef, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import {
  BookOpen,
  Calendar,
  Check,
  Clock,
  FolderOpen,
  Plus,
  SlidersHorizontal,
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
import AvatarPicture from '@/features/profile/components/AvatarPicture'
import type { Collaborator } from '@/features/team/types'
import { COLLABORATOR_ROLE, labelOf } from '@/lib/enums'
import {
  describeTaskError,
  useAddChecklistItem,
  useDeleteChecklistItem,
  useTaskEvents,
  useToggleChecklistItemAssignee,
  useUpdateChecklistItem,
  useUpdateTaskFields,
  type TaskEventRow,
} from '../hooks'
import { groupChecklistBySection } from '../checklist-templates'
import { initialsOf } from '../initials'
import { describeTaskEvent, type TaskEventDetails } from '../task-events'
import type { TaskChecklistItem, TaskRow } from '../types'

/*
  O CARTÃO ABERTO — no formato do Trello, a pedido do usuário: "não é um modal de
  editar tarefas que eu quero, é um modal estilo Trello, com os objetivos da
  tarefa e mais detalhes".

  A diferença para um formulário é o que manda na tela. Aqui o conteúdo é o
  assunto: título grande, descrição, os OBJETIVOS (o checklist) e a ATIVIDADE; os
  dados de controle (responsável, status, prazo, prioridade) são linhas numa
  coluna lateral de detalhes, com as ações discretas no pé dela. E nada "abre edição" — cada coisa se
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
  const toggleAssignee = useToggleChecklistItemAssignee()

  /* Prazo do objetivo (migration 0098). Nulo remove. */
  const salvarItem = (item: TaskChecklistItem, patch: { due_date?: string | null }) =>
    updateItem(
      { id: item.id, patch },
      {
        onError: (error) =>
          toast.error('Não foi possível alterar o objetivo: ' + describeTaskError(error)),
      },
    )
  const activityQuery = useTaskEvents(task.id)

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

  const pickerItem =
    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-elevated'

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/*
        GRANDE NO DESKTOP, e com as duas colunas rolando cada uma por si: a lista de
        objetivos e a atividade crescem, e os detalhes da lateral não podem sumir
        rolando junto. No celular o cartão inteiro rola como uma coluna só.

        Sem foco automático: o Radix focaria o primeiro botão (o título), que
        abriria com contorno de seleção e reagiria ao Enter que abriu o cartão.
      */}
      <DialogContent
        className="sm:max-w-5xl p-0 sm:p-0 gap-0 flex flex-col overflow-y-auto md:overflow-hidden md:h-[min(88dvh,54rem)] focus:outline-hidden"
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
        <header className="shrink-0 px-6 md:px-8 pt-6 pb-5 pr-14 border-b border-border">
          <DialogDescription asChild>
            <p className="mb-2 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-medium text-soft">
                {phaseLabel}
              </span>
              {task.project && (
                <span className="flex items-center gap-1 min-w-0">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  {canViewProjects ? (
                    <button
                      type="button"
                      onClick={onOpenProject}
                      className="truncate hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {task.project.name}
                    </button>
                  ) : (
                    <span className="truncate">{task.project.name}</span>
                  )}
                </span>
              )}
            </p>
          </DialogDescription>
          {/*
            O título do diálogo para leitor de tela fica à parte, escondido: o
            título visível é um botão que vira campo, e `asChild` sobre ele
            perderia o `id` que liga o diálogo ao seu nome.
          */}
          <DialogTitle className="sr-only">{task.title}</DialogTitle>
          <InlineTitle value={task.title} canEdit={canEdit} onSave={(title) => salvar({ title })} />
        </header>

        <div className="flex flex-col md:flex-1 md:min-h-0 md:grid md:grid-cols-[minmax(0,1fr)_19rem]">
          {/* ── Conteúdo ────────────────────────────────────────────────── */}
          <div className="min-w-0 md:overflow-y-auto px-6 md:px-8 py-6 space-y-8">
            <Section title="Descrição">
              <InlineDescription
                value={task.description}
                canEdit={canEdit}
                onSave={(description) => salvar({ description })}
              />
            </Section>

            <Section
              title="Objetivos"
              aside={
                checklist.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <Progress
                      value={percent}
                      className={`h-1 w-20 ${percent === 100 ? '[&>div]:bg-emerald-500' : ''}`}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {done}/{checklist.length}
                    </span>
                  </span>
                ) : null
              }
            >
              {/* Agrupado pela seção que o objetivo tinha no modelo quando nasceu
                  na tarefa (0099). Tarefa sem seção nenhuma é um grupo só, sem
                  cabeçalho — o cartão de antes. */}
              <div className="space-y-4">
                {groupChecklistBySection(checklist).map((grupo) => (
                  <div key={grupo.name ?? 'sem-secao'}>
                    {grupo.name !== null && (
                      <div className="flex items-center gap-2 mb-1">
                        <p className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                          {grupo.name}
                        </p>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {grupo.items.filter((item) => item.is_completed).length}/{grupo.items.length}
                        </span>
                      </div>
                    )}
                    <div className="space-y-0.5 -mx-2">
                      {grupo.items.map((item) => (
                  <ObjectiveRow
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    responsibles={responsibles}
                    onToggle={() => onToggleChecklistItem(item)}
                    onToggleAssignee={(collaboratorId, assign) =>
                      toggleAssignee(
                        { item, collaboratorId, assign },
                        {
                          onError: (error) =>
                            toast.error(
                              'Não foi possível alterar o responsável: ' + describeTaskError(error),
                            ),
                        },
                      )
                    }
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
                  </div>
                ))}
              </div>

              {/* A palavra "obrigatório" em cada linha virava ruído — quase todo
                  objetivo padrão é. Fica um asterisco e esta legenda. */}
              {checklist.some((item) => item.is_required) && (
                <p className="mt-2 text-xs text-faint">* obrigatório para avançar de etapa</p>
              )}

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
                  <button
                    type="button"
                    onClick={abrirAdicionar}
                    className="mt-1 -mx-2 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-elevated"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar objetivo
                  </button>
                ))}
            </Section>

            <div className="border-t border-border pt-8">
              <Section title="Atividade">
                <ActivityFeed
                  isLoading={activityQuery.isLoading}
                  isError={activityQuery.isError}
                  entries={activityQuery.data ?? []}
                />
              </Section>
            </div>
          </div>

          {/*
            ── Detalhes ──────────────────────────────────────────────────────
            UM LUGAR SÓ PARA CADA DADO. Antes o responsável, o status e o prazo
            apareciam duas vezes: como chips no topo e como botões "Adicionar ao
            cartão" na lateral. Agora cada um é uma linha, e é a própria linha que
            se clica para trocar.
          */}
          {/* No celular os detalhes vêm antes da lista: depois de quinze objetivos
              ninguém rolaria até eles. */}
          <aside className="order-first md:order-none border-b md:border-b-0 md:border-l border-border bg-elevated/40 md:overflow-y-auto px-6 py-5 md:py-6 flex flex-col gap-6">
            <div className="space-y-3">
              <DetailRow label="Responsável" canEdit={canEdit} value={
                task.responsible ? (
                  <span className="flex items-center gap-2 min-w-0">
                    <Avatar name={task.responsible.name} avatarPath={task.responsible.avatar_path} size="sm" />
                    <span className="truncate">{task.responsible.name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sem responsável</span>
                )
              }>
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
                        className={pickerItem}
                      >
                        <Avatar name={collaborator.name} avatarPath={collaborator.avatar_path} />
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
              </DetailRow>

              {/* Status só existe onde a ETAPA oferece — a mesma oferta do ⋮. Um
                  status já marcado continua visível mesmo que a etapa deixe de
                  oferecê-lo. */}
              {(tagOptions.length > 0 || tag) && (
                <DetailRow label="Status" canEdit={canEdit && tagOptions.length > 0} value={
                  tag ? (
                    <Badge variant="outline" className={`${tag.badgeClass} font-medium`}>
                      <tag.Icon className="w-3 h-3 mr-1" />
                      {tag.label}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Nenhum</span>
                  )
                }>
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
                            className={pickerItem}
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
                </DetailRow>
              )}

              <DetailRow label="Prazo" canEdit={canEdit} value={
                task.due_date ? (
                  <span
                    className={`flex flex-wrap items-center gap-x-1.5 ${
                      isOverdue && !tag ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                    {isOverdue && !tag && <span className="text-xs font-normal">· atrasada</span>}
                    {/* A tag pausa o prazo no quadro; aqui a data aparece, mas diz por quê não conta. */}
                    {tag && <span className="text-xs text-muted-foreground">· pausado</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sem prazo</span>
                )
              }>
                {(fechar) => (
                  <DuePicker
                    value={task.due_date}
                    onSave={(due) => {
                      salvar({ due_date: due }, due ? 'Prazo atualizado' : 'Prazo removido')
                      fechar()
                    }}
                  />
                )}
              </DetailRow>

              {/* Prioridade se muda em "Todos os campos": é planejamento, não o dia
                  a dia do cartão. */}
              <DetailRow label="Prioridade" canEdit={false} value={
                <Badge variant="outline" className={priorityClass}>
                  {priorityLabel}
                </Badge>
              } />

              {progress != null && (
                <DetailRow label="Projeto" canEdit={false} value={
                  <span className="flex items-center gap-2 w-full">
                    <Progress value={progress} className="h-1 flex-1" />
                    <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
                  </span>
                } />
              )}
            </div>

            <div className="md:mt-auto pt-4 border-t border-border space-y-0.5">
              {task.project_id && (
                <ActionButton icon={BookOpen} label="Diário do Projeto" onClick={onOpenDiary} />
              )}
              {canEdit && (
                <ActionButton icon={SlidersHorizontal} label="Todos os campos" onClick={onEdit} />
              )}
              {canDelete && (
                <ActionButton icon={Trash2} label="Excluir tarefa" onClick={onDelete} destructive />
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Peças ────────────────────────────────────────────────────────────── */

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/*
  UMA LINHA DE DETALHE: rótulo pequeno em cima, valor embaixo — lado a lado não
  cabia nome, status e prazo "pausado" numa lateral estreita. Quem pode editar
  clica no valor e escolhe num Popover; quem só lê vê o mesmo valor, parado.
*/
function DetailRow({
  label,
  value,
  canEdit,
  children,
}: {
  label: string
  value: ReactNode
  canEdit: boolean
  children?: (fechar: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const conteudo = (
    <>
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      <span className="flex min-w-0 min-h-6 items-center text-sm text-foreground">{value}</span>
    </>
  )

  if (!canEdit || !children) {
    return <div className="px-2 py-1 -mx-2">{conteudo}</div>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Alterar ${label.toLowerCase()}`}
          className="w-[calc(100%+1rem)] block px-2 py-1 -mx-2 rounded-md text-left hover:bg-muted data-[state=open]:bg-muted focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
        >
          {conteudo}
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

function ActionButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 -mx-2 py-1.5 rounded-md text-sm text-left hover:bg-muted ${
        destructive
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

/* A foto do colaborador quando ele tem uma; as iniciais quando não. */
function Avatar({
  name,
  avatarPath,
  size = 'md',
}: {
  name: string
  avatarPath: string | null | undefined
  size?: 'sm' | 'md'
}) {
  return (
    <span title={name} className="inline-flex shrink-0">
      <AvatarPicture
        avatarPath={avatarPath}
        name={name}
        size={size === 'sm' ? 24 : 28}
        initials={initialsOf(name)}
        initialClassName="text-soft"
      />
    </span>
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
    return <h2 className="text-2xl font-semibold text-foreground leading-snug wrap-break-word">{value}</h2>
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
        className="text-2xl font-semibold leading-snug resize-none -mx-2 px-2"
      />
    )
  }

  return (
    <h2>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-2xl font-semibold text-foreground leading-snug wrap-break-word rounded -mx-1 px-1 hover:bg-elevated"
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
  - COM responsáveis ou prazo, o botão dá lugar ao valor — os avatares e a data —
    e é o próprio valor que se clica para trocar ou remover.

  VÁRIOS RESPONSÁVEIS POR OBJETIVO (migration 0103), como os membros de um item
  do Trello: o menu marca e desmarca nomes e NÃO fecha a cada clique, porque
  escolher duas pessoas são dois cliques.

  O PRAZO DO OBJETIVO É SÓ DELE: vermelho quando venceu e o objetivo não foi
  cumprido, verde quando foi cumprido, neutro no resto. A tarefa não fica
  atrasada por causa dele (ver a migration 0098).
*/
function ObjectiveRow({
  item,
  canEdit,
  responsibles,
  onToggle,
  onToggleAssignee,
  onDue,
  onRemove,
}: {
  item: TaskChecklistItem
  canEdit: boolean
  responsibles: Collaborator[]
  onToggle: () => void
  onToggleAssignee: (collaboratorId: string, assign: boolean) => void
  onDue: (due: string | null) => void
  onRemove: () => void
}) {
  const assignedIds = (item.assignees ?? []).map((assignee) => assignee.collaborator_id)
  /* Quem está na lista de responsáveis do escritório aparece com nome e foto; o
     que sobra é gente desligada ou fora da lista — o objetivo continua com dono,
     e a tela diz isso com um ícone em vez de sumir com ele. */
  const assignados = assignedIds.flatMap((id) => {
    const encontrado = responsibles.find((collaborator) => collaborator.id === id)
    return encontrado ? [encontrado] : []
  })
  const desconhecidos = assignedIds.length - assignados.length
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
          <span className="ml-1 text-muted-foreground" title="Obrigatório para avançar de etapa">
            *<span className="sr-only"> obrigatório</span>
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

        {/* ── Responsáveis ── */}
        {(assignedIds.length > 0 || canEdit) && (
          <ObjectivePopover
            label="Responsáveis pelo objetivo"
            disabled={!canEdit}
            trigger={
              assignedIds.length > 0 ? (
                /* Pilha de avatares: três e o resto vira "+N", para a linha do
                   objetivo não virar uma fileira de fotos. */
                <span className="flex items-center -space-x-1.5">
                  {assignados.slice(0, 3).map((collaborator) => (
                    <Avatar
                      key={collaborator.id}
                      name={collaborator.name}
                      avatarPath={collaborator.avatar_path}
                      size="sm"
                    />
                  ))}
                  {desconhecidos > 0 && (
                    <span
                      className="w-6 h-6 rounded-full bg-elevated border border-border flex items-center justify-center text-muted-foreground"
                      title="Colaborador inativo"
                    >
                      <User className="w-3 h-3" />
                    </span>
                  )}
                  {assignados.length > 3 && (
                    <span className="w-6 h-6 rounded-full bg-elevated border border-border text-[10px] font-semibold text-soft flex items-center justify-center">
                      +{assignados.length - 3}
                    </span>
                  )}
                </span>
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
            {() => (
              <div className="max-h-64 overflow-y-auto -m-1">
                {responsibles.map((collaborator) => {
                  const marcado = assignedIds.includes(collaborator.id)
                  return (
                    <button
                      key={collaborator.id}
                      type="button"
                      /* O menu fica aberto: marcar duas pessoas são dois cliques. */
                      onClick={() => onToggleAssignee(collaborator.id, !marcado)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-elevated"
                    >
                      <Avatar name={collaborator.name} avatarPath={collaborator.avatar_path} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-foreground">{collaborator.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                        </span>
                      </span>
                      {marcado && <Check className="w-4 h-4 text-foreground" />}
                    </button>
                  )
                })}
                {assignedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      for (const id of assignedIds) onToggleAssignee(id, false)
                    }}
                    className="w-full mt-1 pt-2 border-t border-border px-2 py-1.5 rounded text-left text-sm text-muted-foreground hover:text-foreground hover:bg-elevated"
                  >
                    Remover todos
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
  O FEED DE ATIVIDADE: o histórico do cartão, escrito pelo banco a cada mudança
  (migration 0104) — criação, edições, objetivos concluídos e reabertos, prazos e
  responsáveis, com quem fez.

  A FRASE É MONTADA AQUI (`describeTaskEvent`), e não gravada: o banco guarda o
  fato, e o texto pode melhorar sem reescrever o passado.
*/
function ActivityFeed({
  isLoading,
  isError,
  entries,
}: {
  isLoading: boolean
  isError: boolean
  entries: TaskEventRow[]
}) {
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
        Nenhuma atividade ainda. O que acontecer neste cartão aparece aqui.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        /* Sem autor é escrita sem sessão — semeadura, correção no banco. Dizer
           "Sistema" é mais honesto que deixar a linha sem dono. */
        const nome = entry.actor?.name ?? entry.actor_name ?? 'Sistema'
        return (
          <li key={entry.id} className="flex items-start gap-3">
            {entry.actor ? (
              <Avatar name={entry.actor.name} avatarPath={entry.actor.avatar_path} />
            ) : (
              <span className="w-7 h-7 rounded-full bg-elevated border border-border shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-semibold">{nome} </span>
                {describeTaskEvent(entry.kind, (entry.details ?? null) as TaskEventDetails | null)}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(entry.created_at), "dd/MM/yyyy 'às' HH:mm")}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
