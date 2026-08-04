import type { ProjectStatus } from '@/lib/enums'
import type { ProjectRow, TaskRow } from './types'

/*
  "Tarefa atrasada" — a mesma expressão em três lugares do original: o crachá
  vermelho do cartão do kanban (TaskKanban.jsx:213), o cálculo de "projeto em
  risco" do Painel Executivo (flowProjectsQuery.jsx:75-83) e o bloco de tarefas
  atrasadas daquele mesmo painel. Fica em UM lugar antes de o módulo 10 criar a
  quarta cópia.

  A COMPARAÇÃO É A LITERAL DO ORIGINAL, e é a exceção deste projeto: `due_date` é
  coluna `date`, `new Date("2026-08-04")` é meia-noite EM UTC, e em Goiânia isso
  faz a tarefa que vence hoje contar como atrasada desde as 21h de ontem. As
  outras portas do mesmo erro foram corrigidas (src/lib/format.ts,
  activities/list.ts, migration 0043) — esta NÃO, porque o crachá do kanban já
  está no ar com este comportamento desde o módulo 5. Corrigir aqui e não lá faria
  o painel dizer "3 projetos em risco" com o quadro mostrando 4 cartões vermelhos.
  Corrigir os dois é decisão do usuário, e está no relatório do módulo 10.
*/
export function isTaskOverdue(
  task: Pick<TaskRow, 'status' | 'due_date'>,
  now: Date = new Date(),
): boolean {
  return Boolean(task.status !== 'completed' && task.due_date && new Date(task.due_date) < now)
}

/*
  A ordenação e os filtros da lista de projetos, fora do componente.

  ORDEM (Projects.jsx:54-71): projeto arrastado tem `display_order` e vem
  primeiro, na ordem em que foi arrastado; o resto cai no critério seguinte, que
  é o NÚMERO DO CONTRATO em ordem decrescente — comparado pelos dígitos, porque
  "FC-2026-018" e "2024-001" não se comparam como texto. É o mesmo critério da
  lista de Contratos, e o original diz isso em comentário.

  DUAS TRADUÇÕES:

  1. No original o teste é `ordem_exibicao !== undefined`, porque o base44 não
     devolve o campo quando ele nunca foi gravado. Aqui a coluna existe e é nula
     até alguém arrastar (migration 0032), então o teste é por nulo. Mesmo
     desfecho em tela.
  2. `contract_number` era coluna COPIADA em `Project` e saiu do schema
     (migration 0032, item 3): número de contrato pertence ao contrato. O
     critério continua sendo o mesmo número, agora lido pelo embed de
     `contract_id` — que é o lado único da ligação (o contrato não guarda
     `project_id`).
*/
function orderNumber(project: ProjectRow): number {
  const digits = (project.contract?.contract_number || '0').replace(/\D/g, '')
  return Number.parseInt(digits, 10) || 0
}

export function sortProjects(projects: ProjectRow[]): ProjectRow[] {
  return [...projects].sort((a, b) => {
    if (a.display_order != null && b.display_order != null) {
      return a.display_order - b.display_order
    }
    if (a.display_order != null) return -1
    if (b.display_order != null) return 1
    return orderNumber(b) - orderNumber(a)
  })
}

export type ProjectStatusFilter = ProjectStatus | 'all'

/*
  Busca e filtro em memória, como no original (Projects.jsx:215-227): nome do
  projeto e nome do cliente. O nome do cliente vem do embed — `client_name` saiu
  do schema porque a lista quer o nome ATUAL do cadastro.
*/
export function filterProjects(
  projects: ProjectRow[],
  statusFilter: ProjectStatusFilter,
  searchTerm: string,
): ProjectRow[] {
  const filtered =
    statusFilter === 'all'
      ? projects
      : projects.filter((project) => project.status === statusFilter)

  const term = searchTerm.trim().toLowerCase()
  if (!term) return filtered

  return filtered.filter(
    (project) =>
      project.name?.toLowerCase().includes(term) ||
      project.client?.name?.toLowerCase().includes(term),
  )
}

/*
  A coluna "Prazos de Projeto" da lista (Projects.jsx:300-315 e 479-492): os
  cinco prazos por fase, em dias úteis, separados por bolinha, e um traço quando
  não há nenhum. Os rótulos abreviados são os do original, letra por letra.

  Os cinco campos usam a mesma grafia de `contracts` (migration 0032, item 6):
  é o mesmo dado copiado do contrato para o projeto, e nome diferente para o
  mesmo dado é convite a divergência.
*/
export function phaseDeadlineLabels(project: ProjectRow): string[] {
  const labels: string[] = []
  if (project.layout_study_days) labels.push(`Layout: ${project.layout_study_days}d`)
  if (project.renderings_days) labels.push(`Persp: ${project.renderings_days}d`)
  if (project.legal_permit_days) labels.push(`Legal: ${project.legal_permit_days}d`)
  if (project.construction_docs_days) labels.push(`Exec: ${project.construction_docs_days}d`)
  if (project.engineering_docs_days) labels.push(`Compl: ${project.engineering_docs_days}d`)
  return labels
}
