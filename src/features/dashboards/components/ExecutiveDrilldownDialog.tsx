import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PROJECT_PHASE, labelOf } from '@/lib/enums'
import { formatDateBR } from '@/lib/format'
import type { ProjectProgress, ProjectRow } from '@/features/projects/types'
import type { ProjectResponsible } from '../types'

/*
  Porta da "gaveta de drill-down geral" (DashboardExecutivo.jsx:970-1027): a
  mesma janela para os seis cartões clicáveis e para as barras do gráfico. Só o
  título e a lista mudam.

  A LISTA VEM CONGELADA no estado de quem abriu, como no original: clicou,
  guardou o subconjunto, a janela mostra aquilo. Se o painel recarregar por trás,
  a gaveta continua com a lista do momento do clique.

  DE ONDE VÊM OS NÚMEROS QUE ERAM COLUNA: `progresso_percentual`,
  `tarefas_total_obrigatorias` e `tarefas_concluidas_obrigatorias` não existem
  neste schema — quem conta é a view `project_progress` (migrations 0034/0035).
  E `client_name` era cópia congelada na linha do projeto; aqui é o nome ATUAL do
  cadastro, via embed.
*/

export type ExecutiveDrilldown = { title: string; projects: ProjectRow[] }

export default function ExecutiveDrilldownDialog({
  data,
  progressByProject,
  responsibleByProject,
  onClose,
}: {
  data: ExecutiveDrilldown | null
  progressByProject: Map<string, ProjectProgress>
  responsibleByProject: Map<string, ProjectResponsible>
  onClose: () => void
}) {
  const projects = data?.projects ?? []

  return (
    <Dialog open={Boolean(data)} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.title}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
          </p>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum projeto encontrado
            </p>
          ) : (
            projects.map((project) => {
              const progress = progressByProject.get(project.id)
              const progressPercent = progress?.progress_percent ?? 0
              const requiredTotal = progress?.required_items_total ?? 0
              const requiredDone = progress?.required_items_completed ?? 0
              const responsible = responsibleByProject.get(project.id)

              return (
                <div
                  key={project.id}
                  className="p-4 bg-elevated rounded-lg border border-border hover:border-blue-300 dark:hover:border-blue-800 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground text-sm truncate">
                        {project.name}
                      </h4>
                      {project.client && (
                        <p className="text-xs text-muted-foreground mt-0.5">{project.client.name}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs bg-card shrink-0">
                      {progressPercent}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    {/* O `|| 'Não iniciado'` do original é ramo morto aqui:
                        `current_phase` é NOT NULL no schema. */}
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                    >
                      📍 {labelOf(PROJECT_PHASE, project.current_phase)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      👤 {responsible?.name ?? 'Sem responsável definido no Fluxo do Projeto'}
                    </span>
                    {project.start_date && (
                      <span className="text-xs text-muted-foreground">
                        📅 {formatDateBR(project.start_date)}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {requiredTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ✓ {requiredDone} de {requiredTotal} itens obrigatórios
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
