import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertCircle, Calendar, Image, Paperclip, Pencil, Plus, Search, Trash2, User } from 'lucide-react'
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
import ErrorState from '@/components/shared/ErrorState'
import type { Collaborator } from '@/features/team/types'
import {
  optionsOf,
  PROJECT_ISSUE_CATEGORY,
  SITE_VISIT_STATUS,
  SITE_VISIT_TYPE,
} from '@/lib/enums'
import {
  describeDiaryError,
  useCreateProjectIssue,
  useCreateSiteVisit,
  useDeleteSiteVisit,
  useUpdateSiteVisit,
} from '../hooks'
import { filterSiteVisits } from '../obra'
import DiaryPhoto from './DiaryPhoto'
import IssueForm, { type IssueSubmit } from './IssueForm'
import SiteVisitForm, { type SiteVisitSubmit } from './SiteVisitForm'
import { OBRA_INDICATOR, VISIT_ISSUE_CHIP, VISIT_STATUS_STYLE, VISIT_TYPE_BADGE } from './diary-styles'
import type {
  DiaryFile,
  PhotoCaption,
  ProjectIssueRow,
  SiteVisitFilters,
  SiteVisitRow,
} from '../types'

/*
  Porta de nova-versao/src/components/diary/obra/ObraTab.jsx.

  Os cinco indicadores, o botão de largura cheia, a barra de busca com os dois
  selects, o cartão de cada visita com os dois crachás, o resumo, as observações,
  a linha de data/responsável/contagens, a fita de miniaturas com o "+N", o bloco
  de pendências vinculadas e o link "Criar pendência desta visita" são os da
  versão nova, na mesma ordem e com o mesmo microcopy.

  ═══ O FLUXO-CHAVE, QUE É O MOTIVO DESTA ABA EXISTIR ═══

  Visita salva com status "Com pendências" ABRE O FORMULÁRIO DE PENDÊNCIA já
  vinculado a ela (ObraTab.jsx:76-80). É o gesto real de quem volta da obra: o
  que foi visto e o que precisa ser corrigido são a mesma ida. O vínculo entra em
  `project_issues.visit_id`, e é ele que alimenta o bloco "N pendência(s) desta
  visita" e o "Criar pendência desta visita", que faz o mesmo caminho depois.

  ═══ O QUE MUDA EM RELAÇÃO À VERSÃO NOVA, E POR QUÊ ═══

  1. QUEM PODE ESCREVER é `useCanWriteProjectDiary()`, que reproduz
     `is_project_diary_writer()` (migration 0070) — a mesma regra do banco. Chega
     por prop porque a gaveta inteira já a leu.
  2. DEFEITO 11 DO PLANO: "Registrar visita à obra" exige projeto em obra, e
     "Nova pendência" (aba vizinha) NÃO exigia. As duas passam a exigir — mas só
     o BOTÃO DE CRIAR. Editar e resolver pendência já aberta continuam liberados
     mesmo depois de o projeto sair da obra, senão a pendência fica presa para
     sempre.
  3. TRÊS ESTADOS, e não dois: a versão nova distingue carregando e vazio, e
     falha de leitura deixa a aba idêntica a "nenhuma visita registrada".
  4. A BUSCA E OS FILTROS saíram do componente para `../obra`.
  5. AS FOTOS SÃO CAMINHO, NÃO URL: o bucket é privado e o endereço é assinado na
     hora (ver DiaryPhoto).
  6. A EXCLUSÃO PERGUNTA NUM DIÁLOGO, e não no `window.confirm` do navegador
     (ObraTab.jsx:261) — é o mesmo AlertDialog que a aba Timeline já usa para
     excluir registro, e o resto do sistema para tudo que não tem volta.
  7. `visit.fotos.length` vira o recorte de `visit.files` por `file_kind`: as duas
     listas do base44 são uma tabela só (migration 0069).
*/

export default function ObraTab({
  project,
  visits,
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
  visits: SiteVisitRow[]
  issues: ProjectIssueRow[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
  collaborators: Collaborator[]
  canEdit: boolean
  isEmObra: boolean
  onPhotoClick: (photos: DiaryFile[], index: number, caption: PhotoCaption) => void
}) {
  const [visitFormOpen, setVisitFormOpen] = useState(false)
  const [editingVisit, setEditingVisit] = useState<SiteVisitRow | null>(null)
  const [issueFormOpen, setIssueFormOpen] = useState(false)
  const [pendingVisitId, setPendingVisitId] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; visit: SiteVisitRow | null }>({
    open: false,
    visit: null,
  })
  const [filters, setFilters] = useState<SiteVisitFilters>({
    search: '',
    type: 'all',
    status: 'all',
  })

  const createVisit = useCreateSiteVisit()
  const updateVisit = useUpdateSiteVisit()
  const deleteVisit = useDeleteSiteVisit()
  const createIssue = useCreateProjectIssue()

  const filteredVisits = useMemo(() => filterSiteVisits(visits, filters), [visits, filters])

  /* Os cinco indicadores (ObraTab.jsx:162-165). As fotos são as das VISITAS, como
     lá — a aba Fotos é que soma as das pendências também. */
  const photoCount = visits.reduce(
    (total, visit) => total + visit.files.filter((file) => file.file_kind === 'photo').length,
    0,
  )
  const openCount = issues.filter((issue) => issue.status === 'open').length
  const inProgressCount = issues.filter((issue) => issue.status === 'in_progress').length
  const resolvedCount = issues.filter((issue) => issue.status === 'resolved').length

  const closeVisitForm = () => {
    setVisitFormOpen(false)
    setEditingVisit(null)
  }

  const closeIssueForm = () => {
    setIssueFormOpen(false)
    setPendingVisitId(null)
  }

  const handleVisitSubmit = ({
    input,
    newPhotos,
    newAttachments,
    removedFileIds,
  }: SiteVisitSubmit) => {
    if (editingVisit) {
      updateVisit.mutate(
        {
          id: editingVisit.id,
          projectId: project.id,
          input,
          newPhotos,
          newAttachments,
          removedFileIds,
        },
        {
          onSuccess: (result) => {
            closeVisitForm()
            toast.success('Visita atualizada!')
            warnFailedEvent(result.event.outcome)
          },
          onError: (mutationError) =>
            toast.error('Erro ao atualizar: ' + describeDiaryError(mutationError)),
        },
      )
      return
    }

    createVisit.mutate(
      { projectId: project.id, input, photos: newPhotos, attachments: newAttachments },
      {
        onSuccess: (result) => {
          closeVisitForm()
          toast.success('Visita registrada!')
          warnFailedEvent(result.event.outcome)

          /* O FLUXO-CHAVE — ver o cabeçalho. */
          if (result.status === 'with_issues') {
            setPendingVisitId(result.id)
            setIssueFormOpen(true)
          }
        },
        onError: (mutationError) =>
          toast.error('Erro ao registrar: ' + describeDiaryError(mutationError)),
      },
    )
  }

  const handleIssueSubmit = ({ input, newPhotos, newAttachments, removedFileIds }: IssueSubmit) => {
    /* Pendência criada a partir da visita nunca tem arquivo já gravado para
       remover — o formulário abre vazio. O campo existe porque o tipo é
       compartilhado com a aba Pendências, que edita. */
    void removedFileIds

    createIssue.mutate(
      {
        projectId: project.id,
        visitId: pendingVisitId,
        input,
        photos: newPhotos,
        attachments: newAttachments,
      },
      {
        onSuccess: (result) => {
          closeIssueForm()
          toast.success('Pendência criada!')
          warnFailedEvent(result.event.outcome)
        },
        onError: (mutationError) =>
          toast.error('Erro ao criar pendência: ' + describeDiaryError(mutationError)),
      },
    )
  }

  const confirmDelete = () => {
    const target = deleteDialog.visit
    if (!target) return

    deleteVisit.mutate(target.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, visit: null })
        toast.success('Visita excluída!')
      },
      onError: (mutationError) =>
        toast.error('Erro ao excluir: ' + describeDiaryError(mutationError)),
    })
  }

  const formatDate = (value: string) => {
    try {
      return format(parseISO(value), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    } catch {
      return value
    }
  }

  return (
    <div className="space-y-4">
      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Visitas', value: visits.length, color: OBRA_INDICATOR.visits },
          { label: 'Pendências Abertas', value: openCount, color: OBRA_INDICATOR.open },
          { label: 'Em andamento', value: inProgressCount, color: OBRA_INDICATOR.inProgress },
          { label: 'Resolvidas', value: resolvedCount, color: OBRA_INDICATOR.resolved },
          { label: 'Total de fotos', value: photoCount, color: OBRA_INDICATOR.photos },
        ].map((indicator) => (
          <div key={indicator.label} className={`rounded-xl border p-3 text-center ${indicator.color}`}>
            <div className="text-xl font-bold">{indicator.value}</div>
            <div className="text-[10px] font-medium mt-0.5 leading-tight">{indicator.label}</div>
          </div>
        ))}
      </div>

      {/* Ação principal */}
      {canEdit && isEmObra && (
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          onClick={() => {
            setEditingVisit(null)
            setVisitFormOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          Registrar visita à obra
        </Button>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
          <Input
            placeholder="Buscar visitas..."
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
            setFilters((current) => ({ ...current, type: value as SiteVisitFilters['type'] }))
          }
        >
          <SelectTrigger className="w-full sm:w-40 h-8 text-sm bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {optionsOf(SITE_VISIT_TYPE).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, status: value as SiteVisitFilters['status'] }))
          }
        >
          <SelectTrigger className="w-full sm:w-44 h-8 text-sm bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {optionsOf(SITE_VISIT_STATUS).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de visitas */}
      {error ? (
        <ErrorState
          title="Não foi possível carregar as visitas"
          description="As visitas à obra deste projeto não puderam ser lidas agora."
          error={error}
          onRetry={onRetry}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((placeholder) => (
            <div key={placeholder} className="h-32 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <div className="text-3xl mb-2">🏗️</div>
          <p className="text-sm font-medium text-muted-foreground">Nenhuma visita registrada</p>
          <p className="text-xs text-faint mt-1">
            {isEmObra && canEdit
              ? 'Clique em "Registrar visita à obra" para começar.'
              : 'As visitas aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVisits.map((visit) => {
            const statusStyle = VISIT_STATUS_STYLE[visit.status]
            const photos = visit.files.filter((file) => file.file_kind === 'photo')
            const attachments = visit.files.filter((file) => file.file_kind === 'attachment')
            const visitIssues = issues.filter((issue) => issue.visit_id === visit.id)
            const caption: PhotoCaption = {
              title: visit.summary,
              subtitle: SITE_VISIT_TYPE[visit.visit_type],
            }

            return (
              <div
                key={visit.id}
                className="bg-card rounded-xl border border-border shadow-xs overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold ${VISIT_TYPE_BADGE[visit.visit_type]}`}
                      >
                        🏗️ {SITE_VISIT_TYPE[visit.visit_type]}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${statusStyle.badge}`}>
                        {statusStyle.dot} {SITE_VISIT_STATUS[visit.status]}
                      </Badge>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditingVisit(visit)
                            setVisitFormOpen(true)
                          }}
                          className="p-1 hover:bg-elevated rounded text-faint hover:text-soft transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteDialog({ open: true, visit })}
                          className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded text-faint hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-medium text-foreground mb-1">{visit.summary}</p>
                  {visit.notes && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{visit.notes}</p>
                  )}

                  <div className="flex items-center flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(visit.visit_date)}
                      {visit.visit_time ? ` às ${visit.visit_time.slice(0, 5)}` : ''}
                    </div>
                    {visit.responsible && (
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {visit.responsible.name}
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div className="flex items-center gap-1 text-faint">
                        <Image className="w-3 h-3" />
                        {photos.length} foto(s)
                      </div>
                    )}
                    {attachments.length > 0 && (
                      <div className="flex items-center gap-1 text-faint">
                        <Paperclip className="w-3 h-3" />
                        {attachments.length} arquivo(s)
                      </div>
                    )}
                  </div>

                  {/* Fotos thumbnail */}
                  {photos.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {photos.slice(0, 6).map((photo, index) => (
                        <button
                          key={photo.id}
                          onClick={() => onPhotoClick(photos, index, caption)}
                          className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity"
                        >
                          <DiaryPhoto file={photo} />
                        </button>
                      ))}
                      {photos.length > 6 && (
                        <button
                          onClick={() => onPhotoClick(photos, 0, caption)}
                          className="shrink-0 w-16 h-16 rounded-lg bg-muted border border-border flex items-center justify-center text-xs text-muted-foreground font-medium hover:bg-border transition-colors"
                        >
                          +{photos.length - 6}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pendências vinculadas */}
                  {visitIssues.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {visitIssues.length} pendência(s) desta
                        visita
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {visitIssues.map((issue) => (
                          <span
                            key={issue.id}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${VISIT_ISSUE_CHIP[issue.status]}`}
                          >
                            #{issue.issue_number} {PROJECT_ISSUE_CATEGORY[issue.category]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Criar pendência a partir da visita */}
                  {canEdit && isEmObra && visit.status === 'with_issues' && (
                    <button
                      onClick={() => {
                        setPendingVisitId(visit.id)
                        setIssueFormOpen(true)
                      }}
                      className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Criar pendência desta visita
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Forms */}
      <SiteVisitForm
        open={visitFormOpen}
        onClose={closeVisitForm}
        onSubmit={handleVisitSubmit}
        initialData={editingVisit}
        collaborators={collaborators}
        isLoading={createVisit.isPending || updateVisit.isPending}
      />
      <IssueForm
        open={issueFormOpen}
        onClose={closeIssueForm}
        onSubmit={handleIssueSubmit}
        initialData={null}
        collaborators={collaborators}
        isLoading={createIssue.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(value) => setDeleteDialog({ ...deleteDialog, open: value })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta visita?</AlertDialogTitle>
            <AlertDialogDescription>
              As fotos e os arquivos da visita são excluídos junto. As pendências que ela revelou
              continuam na aba Pendências, e o registro dela na Timeline também. Esta ação não pode
              ser desfeita.
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
    </div>
  )
}

/*
  O AVISO QUE O ORIGINAL NÃO TEM.

  Lá a gravação do evento automático falha em silêncio (`console.error` e segue,
  diaryAutoEvents.js:32-35), e o resultado é um diário com buracos que ninguém
  percebe — que é justamente o que este módulo existe para não ter. A visita e a
  pendência JÁ ESTÃO GRAVADAS quando isto acontece (o evento é o passo seguinte, e
  não dá para desfazer o que já foi), então o aviso é o que resta: dizer o que
  ficou de fora, em vez de deixar quem escreveu supor que entrou.
*/
function warnFailedEvent(outcome: 'recorded' | 'already_recorded' | 'failed') {
  if (outcome !== 'failed') return
  toast.warning('O registro foi salvo, mas o evento não entrou na Timeline do projeto.')
}
