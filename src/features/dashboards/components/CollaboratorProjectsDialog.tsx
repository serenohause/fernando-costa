import { useState } from 'react'
import { ArrowUpDown, ExternalLink, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { COLLABORATOR_ROLE, PROJECT_PHASE, labelOf } from '@/lib/enums'
import { formatDateBR } from '@/lib/format'
import { createPageUrl } from '@/lib/page-url'
import type { ProjectProgress } from '@/features/projects/types'
import { searchAndSortProjects, type ProjectSortKey } from '../executive-projects'
import type { CollaboratorLoad, ProjectResponsible } from '../types'

/*
  Porta da gaveta "Projetos de <colaborador>" (DashboardExecutivo.jsx:815-967),
  que abre ao clicar numa linha de "Projetos por Colaborador".

  A BUSCA E A ORDENAÇÃO MORAM NESTA JANELA, e o estado delas volta ao padrão
  quando ela fecha — como no original, que zera `searchProject` e `sortBy` no
  `onOpenChange`. Quem peneira e ordena é `searchAndSortProjects`
  (features/dashboards/executive-projects.ts), onde as três ressalvas do original
  estão escritas.

  O BALDE "SEM RESPONSÁVEL" TAMBÉM ABRE AQUI: ele é uma linha como as outras, com
  `role` nulo, e cada projeto dele cai no ramo "Reatribuir".
*/

export default function CollaboratorProjectsDialog({
  load,
  progressByProject,
  responsibleByProject,
  onClose,
}: {
  load: CollaboratorLoad | null
  progressByProject: Map<string, ProjectProgress>
  responsibleByProject: Map<string, ProjectResponsible>
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<ProjectSortKey>('name')

  const projects = searchAndSortProjects(load?.projects ?? [], search, sortBy, progressByProject)

  return (
    <Dialog
      open={Boolean(load)}
      onOpenChange={() => {
        onClose()
        setSearch('')
        setSortBy('name')
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Projetos de {load?.name}
            {load?.role && (
              <Badge
                variant="outline"
                className="bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900"
              >
                {labelOf(COLLABORATOR_ROLE, load.role)}
              </Badge>
            )}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {load?.projectCount} {load?.projectCount === 1 ? 'projeto ativo' : 'projetos ativos'}
          </p>
        </DialogHeader>

        {/* Busca e Ordenação */}
        <div className="flex gap-3 py-4 border-b border-border">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            {/* O placeholder é o do original e agora é verdade: a busca olha o
                nome E o número do contrato, que é o "código" que este schema tem
                para um projeto. Antes ela só olhava o nome, e digitar o código
                esvaziava a gaveta — ver `searchAndSortProjects`. */}
            <Input
              placeholder="Buscar por nome ou código..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ProjectSortKey)}>
            <SelectTrigger className="w-48">
              <ArrowUpDown className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome (A-Z)</SelectItem>
              <SelectItem value="progress-asc">Progresso (menor)</SelectItem>
              <SelectItem value="progress-desc">Progresso (maior)</SelectItem>
              <SelectItem value="phase">Fase</SelectItem>
              <SelectItem value="date">Data de início</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lista de Projetos Filtrada e Ordenada */}
        <div className="space-y-3 overflow-y-auto flex-1 pr-2">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum projeto encontrado
            </p>
          ) : (
            projects.map((project) => {
              /* O responsável do CARD do Fluxo, não o do cadastro do projeto. */
              const responsible = responsibleByProject.get(project.id)
              const needsReassignment = !responsible?.id
              const progressPercent = progressByProject.get(project.id)?.progress_percent ?? 0

              return (
                <div
                  key={project.id}
                  className={`p-4 rounded-lg border transition-all group ${
                    needsReassignment
                      ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 hover:border-rose-400 dark:hover:border-rose-700'
                      : 'bg-elevated border-border hover:border-violet-300 dark:hover:border-violet-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground text-sm truncate">
                          {project.name}
                        </h4>
                        {needsReassignment && (
                          <Badge
                            variant="outline"
                            className="bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900 text-xs"
                          >
                            Reatribuir
                          </Badge>
                        )}
                        {/*
                          O `?projeto=<id>` SAIU DO ENDEREÇO. No original o link
                          é `Tasks?projeto=<id>` e o Fluxo do Projeto (Tasks.jsx)
                          nunca lê esse parâmetro — a aba nova abre o quadro
                          inteiro, e o endereço promete um filtro que não existe.
                          Ler o parâmetro seria mexer na tela de Tarefas, que não
                          é deste módulo; então o link para de prometer e leva
                          para onde sempre levou. Está no relatório: fazer o
                          Fluxo aceitar o parâmetro é a outra metade, e é decisão
                          do usuário.
                        */}
                        <a
                          href={createPageUrl('Tasks')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button size="icon" variant="ghost" className="h-6 w-6">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      </div>
                      {project.client && (
                        <p className="text-xs text-muted-foreground mt-0.5">{project.client.name}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs bg-card shrink-0">
                      {progressPercent}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                    >
                      📍 {labelOf(PROJECT_PHASE, project.current_phase)}
                    </Badge>
                    {project.start_date && (
                      <span className="text-xs text-muted-foreground">
                        📅 {formatDateBR(project.start_date)}
                      </span>
                    )}
                  </div>
                  {needsReassignment && (
                    <div className="mt-2 p-2 bg-card rounded border border-rose-200 dark:border-rose-900">
                      <p className="text-xs text-rose-700 dark:text-rose-400">
                        ⚠️ Defina um Arquiteto, Estagiário ou Coordenador no card do Fluxo de Projeto
                      </p>
                    </div>
                  )}
                  <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        needsReassignment ? 'bg-rose-500' : 'bg-violet-500'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
