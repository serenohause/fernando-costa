import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Image,
  Pencil,
  Plus,
  Search,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
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
import ErrorState from '@/components/shared/ErrorState'
import type { Collaborator } from '@/features/team/types'
import { formatDateBR } from '@/lib/format'
import {
  optionsOf,
  PROJECT_ISSUE_CATEGORY,
  PROJECT_ISSUE_EVENT_TYPE,
  PROJECT_ISSUE_STATUS,
} from '@/lib/enums'
import {
  describeDiaryError,
  useCreateProjectIssue,
  useResolveProjectIssue,
  useUpdateProjectIssue,
} from '../hooks'
import { filterProjectIssues, isIssueOverdue } from '../obra'
import DiaryPhoto from './DiaryPhoto'
import IssueForm, { type IssueSubmit } from './IssueForm'
import { ISSUE_STATUS_STYLE } from './diary-styles'
import type {
  DiaryFile,
  PhotoCaption,
  ProjectIssueFilters,
  ProjectIssueRow,
} from '../types'

/*
  Porta de nova-versao/src/components/diary/obra/PendenciasTab.jsx.

  O botão de largura cheia, os cinco chips de status, a busca com o select de
  categoria, o cartão de cada pendência com o número em fonte monoespaçada, os
  crachás, a borda vermelha do prazo vencido, a linha de responsável e datas, a
  fita de quatro miniaturas, a faixa verde da resolução e o histórico retrátil são
  os da versão nova, na mesma ordem e com o mesmo microcopy.

  ═══ O QUE MUDA EM RELAÇÃO À VERSÃO NOVA, E POR QUÊ ═══

  1. DEFEITO 11 DO PLANO: "Nova pendência" passa a exigir projeto em obra, como
     "Registrar visita à obra" já exigia. SÓ O BOTÃO DE CRIAR: o lápis e o botão
     de resolver continuam aparecendo com o projeto fora da obra, senão a
     pendência aberta durante a obra ficaria presa para sempre — e é justamente
     depois da obra que ela costuma ser resolvida.
  2. O NÚMERO VEM DO BANCO (defeito 8): `issue_number` é alocado por trigger sob
     advisory lock. Lá é `issues.length + 1` calculado sobre a lista em memória —
     duas abas abertas produzem duas pendências #3.
  3. O HISTÓRICO É TABELA (defeito 12): `project_issue_events`, escrita por
     trigger. Lá o array é lido do cache do navegador, recebe um item e é
     regravado inteiro; duas pessoas juntas perdem o registro uma da outra. Aqui
     a tela SÓ LÊ o histórico, e a frase em português de cada linha vem de
     `PROJECT_ISSUE_EVENT_TYPE`.
  4. TRÊS ESTADOS, e não dois — falha de leitura não pode parecer "nenhuma
     pendência registrada".
  5. A BUSCA, OS FILTROS e "prazo vencido" saíram do componente para `../obra`.
  6. AS FOTOS SÃO CAMINHO, NÃO URL (ver DiaryPhoto).
*/

export default function PendenciasTab({
  project,
  issues,
  isLoading,
  error,
  onRetry,
  collaborators,
  canEdit,
  isEmObra,
  onPhotoClick,
}: {
  project: { id: string; name: string }
  issues: ProjectIssueRow[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
  collaborators: Collaborator[]
  canEdit: boolean
  isEmObra: boolean
  onPhotoClick: (photos: DiaryFile[], index: number, caption: PhotoCaption) => void
}) {
  const [issueFormOpen, setIssueFormOpen] = useState(false)
  const [editingIssue, setEditingIssue] = useState<ProjectIssueRow | null>(null)
  const [filters, setFilters] = useState<ProjectIssueFilters>({
    search: '',
    status: 'all',
    category: 'all',
  })
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({})

  const createIssue = useCreateProjectIssue()
  const updateIssue = useUpdateProjectIssue()
  const resolveIssue = useResolveProjectIssue()

  const filteredIssues = useMemo(() => filterProjectIssues(issues, filters), [issues, filters])

  const closeForm = () => {
    setIssueFormOpen(false)
    setEditingIssue(null)
  }

  const handleSubmit = ({ input, newPhotos, newAttachments, removedFileIds }: IssueSubmit) => {
    if (editingIssue) {
      updateIssue.mutate(
        { issue: editingIssue, input, newPhotos, newAttachments, removedFileIds },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Pendência atualizada!')
          },
          onError: (mutationError) =>
            toast.error('Erro ao atualizar: ' + describeDiaryError(mutationError)),
        },
      )
      return
    }

    createIssue.mutate(
      {
        projectId: project.id,
        /* Pendência criada por esta aba não nasce de visita nenhuma — é o caso
           comum fora da obra (COMMENT de `project_issues.visit_id`). O vínculo
           existe quando o formulário é aberto pela aba Obra. */
        visitId: null,
        input,
        photos: newPhotos,
        attachments: newAttachments,
      },
      {
        onSuccess: (result) => {
          closeForm()
          toast.success('Pendência criada!')
          if (result.event.outcome === 'failed') {
            toast.warning('A pendência foi salva, mas o evento não entrou na Timeline do projeto.')
          }
        },
        onError: (mutationError) =>
          toast.error('Erro ao criar: ' + describeDiaryError(mutationError)),
      },
    )
  }

  const handleResolve = (issue: ProjectIssueRow) => {
    resolveIssue.mutate(
      { issue, projectId: project.id },
      {
        onSuccess: (result) => {
          toast.success('Pendência resolvida!')
          if (result.event.outcome === 'failed') {
            toast.warning(
              'A pendência foi resolvida, mas o evento não entrou na Timeline do projeto.',
            )
          }
        },
        onError: (mutationError) =>
          toast.error('Erro ao resolver: ' + describeDiaryError(mutationError)),
      },
    )
  }

  const toggleExpand = (id: string) =>
    setExpandedIssues((current) => ({ ...current, [id]: !current[id] }))

  return (
    <div className="space-y-4">
      {/* Botão principal */}
      {canEdit && isEmObra && (
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          onClick={() => {
            setEditingIssue(null)
            setIssueFormOpen(true)
          }}
        >
          <Plus className="w-4 h-4" /> Nova pendência
        </Button>
      )}

      {/* Filtros rápidos por status */}
      <div className="flex gap-1.5 flex-wrap">
        {[{ value: 'all' as const, label: 'Todos' }, ...optionsOf(PROJECT_ISSUE_STATUS)].map(
          (option) => (
            <button
              key={option.value}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  status: option.value as ProjectIssueFilters['status'],
                }))
              }
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filters.status === option.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-soft border-border hover:bg-elevated'
              }`}
            >
              {option.label}
            </button>
          ),
        )}
      </div>

      {/* Filtros avançados */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
          <Input
            placeholder="Buscar pendências..."
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            className="pl-8 h-8 text-sm bg-card"
          />
        </div>
        <Select
          value={filters.category}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              category: value as ProjectIssueFilters['category'],
            }))
          }
        >
          <SelectTrigger className="w-full sm:w-40 h-8 text-sm bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {optionsOf(PROJECT_ISSUE_CATEGORY).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de pendências */}
      {error ? (
        <ErrorState
          title="Não foi possível carregar as pendências"
          description="As pendências de obra deste projeto não puderam ser lidas agora."
          error={error}
          onRetry={onRetry}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((placeholder) => (
            <div key={placeholder} className="h-28 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm font-medium text-muted-foreground">
            {filters.status !== 'all'
              ? `Nenhuma pendência "${PROJECT_ISSUE_STATUS[filters.status]}"`
              : 'Nenhuma pendência registrada'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => {
            const statusStyle = ISSUE_STATUS_STYLE[issue.status]
            const isExpanded = expandedIssues[issue.id]
            const overdue = isIssueOverdue(issue)
            const photos = issue.files.filter((file) => file.file_kind === 'photo')
            const caption: PhotoCaption = {
              title: `Pendência #${issue.issue_number}`,
              subtitle: null,
            }

            return (
              <div
                key={issue.id}
                className={`bg-card rounded-xl border shadow-xs overflow-hidden ${
                  overdue ? 'border-rose-300 dark:border-rose-800' : 'border-border'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-faint font-mono">
                        #{issue.issue_number}
                      </span>
                      <Badge variant="outline" className={`text-xs ${statusStyle.badge}`}>
                        {statusStyle.dot} {PROJECT_ISSUE_STATUS[issue.status]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-xs bg-elevated text-soft border-border"
                      >
                        {PROJECT_ISSUE_CATEGORY[issue.category]}
                      </Badge>
                      {overdue && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900"
                        >
                          ⚠️ Prazo vencido
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && issue.status !== 'resolved' && issue.status !== 'cancelled' && (
                        <button
                          onClick={() => handleResolve(issue)}
                          title="Marcar como resolvida"
                          disabled={resolveIssue.isPending}
                          className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded text-faint hover:text-emerald-600 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditingIssue(issue)
                            setIssueFormOpen(true)
                          }}
                          className="p-1 hover:bg-elevated rounded text-faint hover:text-soft transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-medium text-foreground mb-2">{issue.description}</p>

                  <div className="flex items-center flex-wrap gap-3 text-xs text-muted-foreground">
                    {issue.responsible && (
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {issue.responsible.name}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Identificada: {formatDateBR(issue.identified_date)}
                    </div>
                    {issue.due_date && (
                      <div
                        className={`flex items-center gap-1 ${
                          overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        Prazo: {formatDateBR(issue.due_date)}
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div className="flex items-center gap-1 text-faint">
                        <Image className="w-3 h-3" />
                        {photos.length} foto(s)
                      </div>
                    )}
                  </div>

                  {/* Fotos thumbnail */}
                  {photos.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {photos.slice(0, 4).map((photo, index) => (
                        <button
                          key={photo.id}
                          onClick={() => onPhotoClick(photos, index, caption)}
                          className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity"
                        >
                          <DiaryPhoto file={photo} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Resolução info */}
                  {issue.status === 'resolved' && issue.resolved_by && (
                    <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
                      ✅ Resolvida por <strong>{issue.resolved_by.name}</strong>
                      {issue.resolved_at &&
                        ` em ${format(parseISO(issue.resolved_at), "dd/MM/yyyy 'às' HH:mm")}`}
                    </div>
                  )}

                  {/* Histórico expandível */}
                  {issue.events.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        onClick={() => toggleExpand(issue.id)}
                        className="flex items-center gap-1 text-xs text-faint hover:text-soft transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        Histórico ({issue.events.length})
                      </button>
                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-border">
                          {issue.events.map((event) => (
                            <div key={event.id} className="text-xs text-muted-foreground">
                              <span className="font-medium text-soft">
                                {format(parseISO(event.occurred_at), 'yyyy-MM-dd HH:mm')}
                              </span>{' '}
                              — {event.description ?? PROJECT_ISSUE_EVENT_TYPE[event.event_type]}
                              {event.author && (
                                <span className="text-faint"> ({event.author.name})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <IssueForm
        open={issueFormOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={editingIssue}
        collaborators={collaborators}
        isLoading={createIssue.isPending || updateIssue.isPending}
      />
    </div>
  )
}
