import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { FolderKanban, GripVertical, MapPin, MoreVertical, Pencil, Search, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import ClientLink from '@/features/crm/components/ClientLink'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useNavigation } from '@/components/shared/useNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useMenuPermissions } from '@/features/auth/hooks'
import { useClients } from '@/features/crm/hooks'
import { useCollaborators } from '@/features/team/hooks'
import { PROJECT_STATUS, PROJECT_TYPE, labelOf, type ContractType } from '@/lib/enums'
import { filterProjects, phaseDeadlineLabels, sortProjects, type ProjectStatusFilter } from '../list'
import {
  describeDatabaseError,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useReorderProjects,
  useUpdateProject,
} from '../hooks'
import ProjectForm, { toFormValues, type ProjectFormValues } from './ProjectForm'
import type { ProjectInput, ProjectRow } from '../types'

/*
  Porta de projeto-original/src/pages/Projects.jsx.

  O cabeçalho, a busca, as quatro abas de status, a lista de linhas arrastáveis
  com a alça, o quadrado azul com o ícone de pasta, o layout empilhado no celular
  e a grade de sete colunas no desktop, o menu de três pontos e o diálogo de
  exclusão são os do original, na mesma ordem.

  O array `columns` do original (linhas 258-345) NÃO foi portado: ele monta uma
  tabela que a página nunca renderiza — sobrou de uma versão anterior da tela,
  igualzinho ao que aconteceu em Contracts.jsx. O que está no ar é a lista de
  cartões, e é ela que está aqui.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0033):

  - Leitura é larga (`projects_select_active_collaborator`): qualquer colaborador
    ativo do escritório lê. O original também não fecha esta página.
  - Escrita é `can_edit` no menu `projects` OU ser Diretor — `can_edit_menu()`,
    migration 0019. Menu DIFERENTE do da tela de Fluxo do Projeto
    (`project_flow`), porque são dois itens separados na sidebar do original, com
    permissão independente.

  O QUE NÃO FOI PORTADO, E POR QUÊ:

  - A criação automática de uma tarefa ao criar/tornar visível um projeto
    (linhas 90-114 e 159-185). O gatilho exige `visivel_em_projetos === true`, e
    este formulário não escreve essa coluna nem no original — quem a levanta é a
    aprovação do contrato. Ver o comentário de `useCreateProject`.
  - A reescrita de `project_name` em contratos e tarefas quando o nome do projeto
    muda (linhas 123-147): as duas cópias deixaram de existir no schema.
  - `PROGRESSO` não aparece nesta tela nem no original — quem o mostra é o
    cartão do Fluxo do Projeto, e ele vem da view `project_progress`.
*/

/*
  As cores do tipo de projeto (Projects.jsx:250-256).

  O mapa do original é indexado por 'Arquitetura', 'Interiores', 'Obra',
  'Consultoria' e 'Mentoria' — e `Project.project_type` só produz quatro valores,
  dos quais UM está no mapa. Os outros três caem no `bg-slate-50` do fallback, e
  é isso que está no ar. Aqui o mapa é indexado pelo valor do banco: as quatro
  entradas alcançáveis, com o mesmo desfecho em tela que o original.
*/
const TYPE_STYLES: Record<ContractType, string> = {
  architecture:
    'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  architecture_engineering: 'bg-elevated text-soft border-border',
  architecture_interiors: 'bg-elevated text-soft border-border',
  full: 'bg-elevated text-soft border-border',
}

export default function Projects() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; project: ProjectRow | null }>({
    open: false,
    project: null,
  })
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('projects')

  /*
    `?focus=<id>` — quem chega do quadro do Fluxo clicando no nome do projeto.
    Não existe tela de detalhe de projeto; o que dá para fazer, e é o que o
    parâmetro faz, é rolar até o cartão e destacá-lo por alguns segundos.

    O parâmetro NÃO vira filtro de busca: mexer no filtro mudaria a lista
    inteira e a ordem por arraste, e quem veio ver um projeto ficaria sem os
    outros — um efeito colateral bem maior do que o pedido.
  */
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])


  const projectsQuery = useProjects()
  const clientsQuery = useClients('')
  const collaboratorsQuery = useCollaborators()

  const projects = useMemo(() => sortProjects(projectsQuery.data ?? []), [projectsQuery.data])
  const filteredProjects = useMemo(
    () => filterProjects(projects, statusFilter, searchTerm),
    [projects, statusFilter, searchTerm],
  )

  useEffect(() => {
    if (!focusId) return

    setHighlighted(focusId)
    /* O cartão só existe depois que a lista carrega; o `focusRef` é atribuído
       na renderização em que ele aparece, e este efeito roda de novo quando
       isso acontece porque a lista filtrada está nas dependências. */
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    /* O parâmetro sai da URL: sem isso, um F5 (ou voltar para esta aba) faria a
       tela rolar de novo para um projeto que a pessoa já deixou para trás. */
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })

    const timer = window.setTimeout(() => setHighlighted(null), 4000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, filteredProjects.length])

  const createMutation = useCreateProject()
  const updateMutation = useUpdateProject()
  const deleteMutation = useDeleteProject()
  const reorderProjects = useReorderProjects()

  /* Referência estável de propósito: ProjectForm reinicia o formulário quando
     `initialData` muda, como no original. Recriar o objeto a cada render apagaria
     o que está sendo digitado assim que qualquer query se atualizasse. */
  const formInitialData = useMemo<ProjectFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (data: ProjectInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input: data },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Projeto atualizado com sucesso!')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        closeForm()
        toast.success('Projeto criado com sucesso!')
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
    })
  }

  const confirmDelete = () => {
    const target = deleteDialog.project
    if (!target) return

    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, project: null })
        toast.success('Projeto excluído com sucesso!')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  /*
    A ordem gravada é a da lista COMPLETA, não a da filtrada — mesma decisão já
    tomada na lista de Contratos. No original o índice sai de `filteredProjects`
    (linha 232): arrastar com um filtro de status ativo reescreve a ordem de todo
    mundo usando a posição dentro do filtro, e os projetos que o filtro escondeu
    recebem índices repetidos.
  */
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return

    const movedId = filteredProjects[result.source.index].id
    const targetId = filteredProjects[result.destination.index].id

    const reordered = [...projects]
    const from = reordered.findIndex((project) => project.id === movedId)
    const to = reordered.findIndex((project) => project.id === targetId)
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    reorderProjects(
      reordered.map((project) => ({ id: project.id, display_order: project.display_order })),
      {
        onSuccess: () => toast.success('Ordem atualizada!'),
        onError: (error) => toast.error('Erro ao atualizar ordem: ' + describeDatabaseError(error)),
      },
    )
  }

  const hasProjects = projects.length > 0

  const rowMenu = (project: ProjectRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setEditing(project)
            setFormOpen(true)
          }}
        >
          <Pencil className="w-4 h-4 mr-2" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setDeleteDialog({ open: true, project })}
          className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const deadlines = (project: ProjectRow) => {
    const labels = phaseDeadlineLabels(project)
    return labels.length > 0 ? (
      <div className="text-xs text-soft">{labels.join(' • ')}</div>
    ) : (
      <span className="text-faint">-</span>
    )
  }

  const place = (project: ProjectRow) =>
    project.city || project.state ? (
      <div className="flex items-center gap-2 text-sm text-soft">
        <MapPin className="w-4 h-4 text-faint" />
        {project.city && project.state
          ? `${project.city} / ${project.state}`
          : project.city || project.state}
      </div>
    ) : (
      <span className="text-faint">-</span>
    )

  return (
    <div>
      <PageHeader
        title="Projetos"
        subtitle="Gerencie os projetos do escritório"
        actionLabel={canEdit ? 'Novo Projeto' : undefined}
        onAction={
          canEdit
            ? () => {
                setEditing(null)
                setFormOpen(true)
              }
            : undefined
        }
      />

      {hasProjects && (
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
            <Input
              type="text"
              placeholder="Buscar por nome do projeto ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-card"
            />
          </div>

          {/*
            As quatro abas do original, com os mesmos rótulos — inclusive o fato
            de não haver aba para "Prospecção", "Em contrato" e "Suspenso". Esses
            projetos continuam aparecendo em "Todos".
          */}
          <Tabs
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as ProjectStatusFilter)}
          >
            <TabsList className="bg-card border w-full sm:w-auto overflow-x-auto flex-nowrap">
              <TabsTrigger value="all" className="whitespace-nowrap">
                Todos
              </TabsTrigger>
              <TabsTrigger value="in_development" className="whitespace-nowrap text-xs sm:text-sm">
                {PROJECT_STATUS.in_development}
              </TabsTrigger>
              <TabsTrigger value="in_approval" className="whitespace-nowrap text-xs sm:text-sm">
                {PROJECT_STATUS.in_approval}
              </TabsTrigger>
              <TabsTrigger value="completed" className="whitespace-nowrap">
                Concluídos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/*
        Três estados explícitos. O original só distingue dois — lista vazia e
        lista cheia — e falha de leitura nele deixa a tela igualzinha a "não há
        projeto nenhum".
      */}
      {projectsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os projetos"
          description="A lista de projetos não pôde ser lida agora."
          error={projectsQuery.error}
          onRetry={() => {
            void projectsQuery.refetch()
          }}
        />
      ) : projectsQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <Card key={index} className="border-0 shadow-xs">
              <div className="p-4">
                <Skeleton className="h-12 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : !hasProjects ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum projeto cadastrado"
          description="Crie projetos para organizar contratos, tarefas e acompanhar o progresso."
          actionLabel={canEdit ? 'Criar Projeto' : undefined}
          onAction={canEdit ? () => setFormOpen(true) : undefined}
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="projects" isDropDisabled={!canEdit}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {filteredProjects.map((project, index) => (
                  <Draggable
                    key={project.id}
                    draggableId={project.id}
                    index={index}
                    isDragDisabled={!canEdit}
                  >
                    {(dragProvided, dragSnapshot) => (
                      <Card
                        ref={(node) => {
                          dragProvided.innerRef(node)
                          if (project.id === focusId) focusRef.current = node
                        }}
                        {...dragProvided.draggableProps}
                        className={`border-0 shadow-xs transition-shadow ${
                          dragSnapshot.isDragging ? 'shadow-lg' : ''
                        } ${
                          highlighted === project.id
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                            : ''
                        }`}
                      >
                        <div className="p-4 flex items-center gap-4">
                          <div
                            {...dragProvided.dragHandleProps}
                            className={canEdit ? 'cursor-grab active:cursor-grabbing' : ''}
                          >
                            <GripVertical className="w-5 h-5 text-faint" />
                          </div>

                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40 flex items-center justify-center shrink-0">
                            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Mobile: empilhado */}
                            <div className="flex items-start justify-between gap-2 md:hidden">
                              <div>
                                <p className="font-medium text-foreground">{project.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  <ClientLink
                                    clientId={project.client?.id}
                                    name={project.client?.name}
                                  />
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <Badge
                                    variant="outline"
                                    className={TYPE_STYLES[project.project_type]}
                                  >
                                    {labelOf(PROJECT_TYPE, project.project_type)}
                                  </Badge>
                                  <StatusBadge status={labelOf(PROJECT_STATUS, project.status)} />
                                </div>
                              </div>
                              {canEdit && rowMenu(project)}
                            </div>

                            {/* Desktop: grade */}
                            <div className="hidden md:grid md:grid-cols-7 gap-4 items-center">
                              <div className="md:col-span-2">
                                <p className="font-medium text-foreground">{project.name}</p>
                                {/* Nome ATUAL do cadastro, via join: no original ele
                                    congela no momento em que o projeto nasceu. */}
                                <p className="text-sm text-muted-foreground">
                                  <ClientLink
                                    clientId={project.client?.id}
                                    name={project.client?.name}
                                  />
                                </p>
                              </div>

                              <div>
                                <Badge
                                  variant="outline"
                                  className={TYPE_STYLES[project.project_type]}
                                >
                                  {labelOf(PROJECT_TYPE, project.project_type)}
                                </Badge>
                              </div>

                              <div>{place(project)}</div>

                              <div>
                                {project.commercial_responsible ? (
                                  <div className="flex items-center gap-2 text-sm text-soft">
                                    <User className="w-4 h-4 text-faint" />
                                    {project.commercial_responsible.name}
                                  </div>
                                ) : (
                                  <span className="text-faint">-</span>
                                )}
                              </div>

                              <div>{deadlines(project)}</div>

                              <div className="flex items-center justify-end gap-3">
                                <StatusBadge status={labelOf(PROJECT_STATUS, project.status)} />
                                {/* Quem não pode editar vê a lista sem os botões de ação. */}
                                {canEdit && rowMenu(project)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <ProjectForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clients={clientsQuery.data ?? []}
        collaborators={collaboratorsQuery.data ?? []}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteDialog.project?.name}? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                rose-600 é escuro o bastante para texto branco nos dois. */}
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
