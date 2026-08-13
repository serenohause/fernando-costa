import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  HardHat,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import ErrorState from '@/components/shared/ErrorState'
import { useCollaborators } from '@/features/team/hooks'
import { formatDateBR } from '@/lib/format'
import {
  DIARY_ENTRY_STATUS,
  DIARY_ENTRY_TYPE,
  MANUAL_DIARY_ENTRY_TYPES,
  PROJECT_PHASE,
  labelOf,
} from '@/lib/enums'
import {
  describeDiaryError,
  useCanWriteProjectDiary,
  useCreateDiaryEntry,
  useDeleteDiaryEntry,
  useProjectDiaryEntries,
  useUpdateDiaryEntry,
} from '../hooks'
import { filterDiaryEntries, groupDiaryEntriesByDay } from '../timeline'
import DiaryAttachmentLink from './DiaryAttachmentLink'
import DiaryEntryForm, { type DiaryEntrySubmit } from './DiaryEntryForm'
import { ENTRY_RAIL, ENTRY_STATUS_BADGE, ENTRY_TYPE_STYLE } from './diary-styles'
import type { DiaryEntryRow, DiaryFilters, DiaryProject } from '../types'

/*
  Porta de nova-versao/src/components/diary/ProjectDiaryDrawer.jsx — o cabeçalho
  (linhas 181-244) e a aba Timeline (linhas 260-393).

  O cabeçalho com o quadrado do ícone, o supratítulo "DIÁRIO DO PROJETO", o nome
  do projeto, a grade de dois campos de contexto, a faixa de abas, a barra de
  busca com o select de tipo e o botão "Adicionar", a contagem de registros, as
  faixas de data, o trilho vertical com o ponto colorido, o cartão de cada
  registro com crachá, hora, título, descrição retrátil em 120 caracteres,
  responsável, situação, clipe e a lista de anexos são os da versão nova, na
  mesma ordem e com o mesmo microcopy.

  ═══ O QUE ESTA FATIA NÃO TRAZ, E ONDE ISSO APARECE ═══

  A gaveta da versão nova tem CINCO abas — Resumo, Timeline, Obra, Pendências e
  Fotos — e abre em Resumo. Esta é a fatia 1 do módulo 11, que entrega a camada
  de dados e a linha do tempo; Obra, Pendências e Fotos são a fatia 2, e Resumo
  e Relatório são a fatia 4 (plano do módulo). Então a faixa de abas existe com
  UMA aba, e as outras quatro entram nela conforme cada fatia chega. É recorte de
  entrega combinado, não simplificação de layout.

  ═══ O QUE MUDA EM RELAÇÃO À VERSÃO NOVA, E POR QUÊ ═══

  1. QUEM PODE ESCREVER. `canEdit()` de lá é
     `role === 'admin' || 'Diretor' || 'Coordenador'` lido do usuário e do
     colaborador que a tela recebe por prop. Aqui é `useCanWriteProjectDiary()`,
     que reproduz `is_project_diary_writer()` (migration 0070) — Diretor ou
     Coordenador, `active`. É a MESMA regra do banco; se a tela usasse outra,
     ela prometeria um botão que a RLS recusa. O `admin` daquela expressão é
     papel de plataforma do base44, cujo equivalente aqui é o `service_role`.
  2. TRÊS ESTADOS, e não dois. A versão nova distingue carregando e vazio, e
     falha de leitura deixa a gaveta idêntica a "não há registro nenhum". A aba
     ganha estado de erro com o motivo e o botão de tentar de novo.
  3. A BUSCA E O AGRUPAMENTO POR DIA saíram do componente para `../timeline`.
     Mesmo resultado; a regra deixa de morar no JSX que a desenha.
  4. OS ANEXOS SÃO CAMINHO, NÃO URL. Lá o clipe é `<a href={anexo.url}>` com uma
     URL pública e eterna do `base44.app`. Aqui o endereço é assinado na hora
     (ver DiaryAttachmentLink).
  5. O X DO CABEÇALHO é o único: `hideClose` desliga o X padrão do Sheet, que
     cairia sobreposto a ele.
  6. `entry.anexos.length` vira `entry.files.length` — os anexos são linhas de
     `project_diary_files`, e não um array dentro do registro.

  ═══ O QUE JÁ ERA REGRA DE TELA E AGORA É REGRA DE BANCO ═══

  Registro AUTOMÁTICO não mostra lápis nem lixeira. Na versão nova isso é só o
  `!entry.is_automatico` do JSX (linha 328); desde a migration 0070 o WITH CHECK
  da policy de UPDATE recusa `is_automatic`, então a tela e o banco dizem a
  mesma coisa. A exclusão continua permitida ao banco de propósito (uma escrita
  errada de evento de sistema precisa poder sair), e continua escondida na tela,
  como lá.
*/

/* As abas da gaveta. A versão nova tem cinco; ver o cabeçalho. */
const TABS = [{ id: 'timeline' as const, label: 'Timeline', icon: BookOpen }]

type TabId = (typeof TABS)[number]['id']

export default function ProjectDiaryDrawer({
  open,
  onClose,
  project,
  underConstruction = false,
}: {
  open: boolean
  onClose: () => void
  project: DiaryProject | null
  /*
    A tarefa que abriu a gaveta está em "Em Obra". É o `_isEmObra` que
    TaskKanban.jsx:513 pendura no projeto antes de abrir o diário — a obra pode
    estar acontecendo numa tarefa antes de a FASE do projeto acompanhar.
  */
  underConstruction?: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabId>('timeline')
  const [formOpen, setFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DiaryEntryRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; entry: DiaryEntryRow | null }>({
    open: false,
    entry: null,
  })
  const [filters, setFilters] = useState<DiaryFilters>({ search: '', type: 'all' })
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({})

  const canEdit = useCanWriteProjectDiary()

  const entriesQuery = useProjectDiaryEntries(project?.id, open)
  const collaboratorsQuery = useCollaborators()

  const createMutation = useCreateDiaryEntry()
  const updateMutation = useUpdateDiaryEntry()
  const deleteMutation = useDeleteDiaryEntry()

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data])

  const groupedEntries = useMemo(
    () => groupDiaryEntriesByDay(filterDiaryEntries(entries, filters)),
    [entries, filters],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditingEntry(null)
  }

  const handleSubmit = ({ input, newFiles, removedFileIds }: DiaryEntrySubmit) => {
    if (editingEntry) {
      updateMutation.mutate(
        { id: editingEntry.id, input, newFiles, removedFileIds },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Registro atualizado!')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDiaryError(error)),
        },
      )
      return
    }

    if (!project) return

    createMutation.mutate(
      { projectId: project.id, input, files: newFiles },
      {
        onSuccess: () => {
          closeForm()
          toast.success('Registro adicionado!')
        },
        onError: (error) => toast.error('Erro ao adicionar: ' + describeDiaryError(error)),
      },
    )
  }

  const confirmDelete = () => {
    const target = deleteDialog.entry
    if (!target) return

    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, entry: null })
        toast.success('Registro excluído!')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDiaryError(error)),
    })
  }

  const toggleExpand = (id: string) =>
    setExpandedEntries((current) => ({ ...current, [id]: !current[id] }))

  if (!project) return null

  /* A obra é do projeto ou da tarefa que abriu a gaveta — ver `underConstruction`. */
  const isEmObra = project.current_phase === 'under_construction' || underConstruction

  const formatDateHeader = (date: string) => {
    try {
      return format(parseISO(date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase()
    } catch {
      return date
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!value) onClose()
        }}
      >
        <SheetContent
          side="right"
          hideClose
          className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border bg-card shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${isEmObra ? 'bg-orange-500' : 'bg-primary'}`}
                >
                  {isEmObra ? (
                    <HardHat className="w-4 h-4 text-white" />
                  ) : (
                    <BookOpen className="w-4 h-4 text-primary-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                    Diário do Projeto
                  </p>
                  <SheetTitle className="text-lg font-semibold text-foreground leading-tight">
                    {project.name}
                  </SheetTitle>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-elevated rounded-lg transition-colors mt-0.5"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Meta */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {project.client && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3 h-3 shrink-0" />
                  <span className="truncate">{project.client.name}</span>
                </div>
              )}
              {project.responsible && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3 h-3 shrink-0" />
                  <span className="truncate">{project.responsible.name}</span>
                </div>
              )}
              {project.current_phase && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${
                      isEmObra
                        ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900'
                        : 'bg-elevated text-soft border-border'
                    }`}
                  >
                    {isEmObra && '🏗️ '}
                    {labelOf(PROJECT_PHASE, project.current_phase)}
                  </Badge>
                </div>
              )}
              {project.start_date && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>Início: {formatDateBR(project.start_date)}</span>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-1 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-elevated'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeTab === 'timeline' && (
              <>
                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
                    <Input
                      placeholder="Buscar no histórico..."
                      value={filters.search}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, search: event.target.value }))
                      }
                      className="pl-8 h-8 text-sm bg-card"
                    />
                  </div>
                  <Select
                    value={filters.type}
                    onValueChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        type: value as DiaryFilters['type'],
                      }))
                    }
                  >
                    <SelectTrigger className="w-full sm:w-44 h-8 text-sm bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* "Todos" e os nove tipos manuais, como o ALL_TYPES da
                          versão nova: filtrar por tipo nunca seleciona evento de
                          sistema, e "Todos" continua mostrando tudo. */}
                      <SelectItem value="all">Todos</SelectItem>
                      {MANUAL_DIARY_ENTRY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DIARY_ENTRY_TYPE[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canEdit && (
                    <Button
                      size="sm"
                      className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 shrink-0"
                      onClick={() => {
                        setEditingEntry(null)
                        setFormOpen(true)
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </Button>
                  )}
                </div>

                <div className="text-xs text-faint font-medium mb-4">
                  {entries.length} {entries.length === 1 ? 'registro' : 'registros'} no histórico
                </div>

                {entriesQuery.isError ? (
                  <ErrorState
                    title="Não foi possível carregar o diário"
                    description="Os registros deste projeto não puderam ser lidos agora."
                    error={entriesQuery.error}
                    onRetry={() => void entriesQuery.refetch()}
                  />
                ) : entriesQuery.isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((placeholder) => (
                      <div key={placeholder} className="animate-pulse">
                        <div className="h-4 w-32 bg-border rounded mb-3" />
                        <div className="h-24 bg-muted rounded-xl" />
                      </div>
                    ))}
                  </div>
                ) : groupedEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <BookOpen className="w-8 h-8 text-border mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Nenhum registro encontrado
                    </p>
                    <p className="text-xs text-faint mt-1">
                      {filters.search || filters.type !== 'all'
                        ? 'Tente ajustar os filtros.'
                        : 'Adicione o primeiro registro do projeto.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedEntries.map((day) => (
                      <div key={day.date}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[10px] font-semibold tracking-widest text-faint shrink-0">
                            {formatDateHeader(day.date)}
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="space-y-3">
                          {day.entries.map((entry) => {
                            const style = ENTRY_TYPE_STYLE[entry.entry_type]
                            const isExpanded = expandedEntries[entry.id]
                            const hasLongDesc =
                              entry.description != null && entry.description.length > 120

                            return (
                              <div
                                key={entry.id}
                                className={`relative pl-4 border-l-2 ${
                                  entry.is_automatic ? ENTRY_RAIL.automatic : ENTRY_RAIL.manual
                                }`}
                              >
                                <div
                                  className={`absolute -left-[5px] top-3 w-2 h-2 rounded-full ${style.dot}`}
                                />
                                <div className="bg-card rounded-xl border border-border p-4 shadow-xs hover:shadow-md transition-shadow">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] font-semibold tracking-wide py-0 ${style.badge}`}
                                      >
                                        {entry.is_automatic
                                          ? '⚙ SISTEMA'
                                          : DIARY_ENTRY_TYPE[entry.entry_type].toUpperCase()}
                                      </Badge>
                                      {entry.occurrence_time && (
                                        <span className="text-xs text-faint">
                                          {entry.occurrence_time.slice(0, 5)}
                                        </span>
                                      )}
                                    </div>
                                    {!entry.is_automatic && canEdit && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => {
                                            setEditingEntry(entry)
                                            setFormOpen(true)
                                          }}
                                          className="p-1 hover:bg-elevated rounded text-faint hover:text-soft transition-colors"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => setDeleteDialog({ open: true, entry })}
                                          className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded text-faint hover:text-rose-500 transition-colors"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="text-sm font-semibold text-foreground mb-1">
                                    {entry.title}
                                  </h4>
                                  {entry.description && (
                                    <div>
                                      <p
                                        className={`text-xs text-soft leading-relaxed whitespace-pre-line ${
                                          !isExpanded && hasLongDesc ? 'line-clamp-2' : ''
                                        }`}
                                      >
                                        {entry.description}
                                      </p>
                                      {hasLongDesc && (
                                        <button
                                          onClick={() => toggleExpand(entry.id)}
                                          className="flex items-center gap-1 text-xs text-faint hover:text-soft mt-1 transition-colors"
                                        >
                                          {isExpanded ? (
                                            <>
                                              <ChevronUp className="w-3 h-3" />
                                              Ver menos
                                            </>
                                          ) : (
                                            <>
                                              <ChevronDown className="w-3 h-3" />
                                              Ver mais
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex items-center flex-wrap gap-2 mt-3">
                                    {entry.responsible && (
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />
                                        <span>{entry.responsible.name}</span>
                                      </div>
                                    )}
                                    {!entry.is_automatic && (
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] py-0 ${
                                          ENTRY_STATUS_BADGE[entry.status]
                                        }`}
                                      >
                                        {labelOf(DIARY_ENTRY_STATUS, entry.status)}
                                      </Badge>
                                    )}
                                    {entry.files.length > 0 && (
                                      <div className="flex items-center gap-1 text-xs text-faint">
                                        <Paperclip className="w-3 h-3" />
                                        {entry.files.length}{' '}
                                        {entry.files.length === 1 ? 'arquivo' : 'arquivos'}
                                      </div>
                                    )}
                                    {entry.created_by && !entry.is_automatic && (
                                      <span className="text-[10px] text-faint ml-auto">
                                        por {entry.created_by.name}
                                      </span>
                                    )}
                                  </div>
                                  {entry.files.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {entry.files.map((file) => (
                                        <DiaryAttachmentLink key={file.id} file={file} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Entry Form (Timeline) */}
      <DiaryEntryForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={editingEntry}
        collaborators={collaboratorsQuery.data ?? []}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(value) => setDeleteDialog({ ...deleteDialog, open: value })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteDialog.entry?.title}"? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
