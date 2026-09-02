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

  ORDEM: projeto arrastado tem `display_order` e vem primeiro, na ordem em que
  foi arrastado; o resto vem do MAIS RECENTE PARA O MAIS ANTIGO.

  O CRITÉRIO DE DESEMPATE MUDOU, a pedido do usuário. O original (e esta lista,
  até aqui) ordenava pelo NÚMERO DO CONTRATO em ordem decrescente — critério que
  só funciona enquanto todo projeto tem contrato e a numeração cresce com o
  tempo. Projeto sem contrato caía com número 0, ou seja, no fim da lista: o
  projeto recém-criado, que é justamente o que se quer ver primeiro, era o
  último. Agora o critério é a data de criação.

  O ARRASTE CONTINUA VENCENDO, e é deliberado: `display_order` só existe onde
  alguém arrastou o projeto de propósito (migration 0032, a coluna é nula até
  lá), e desfazer em silêncio uma ordenação que alguém montou à mão seria pior
  do que a ordem padrão errada. Quem nunca arrastou vê a lista inteira por data.

  Uma tradução que continua valendo: no original o teste é
  `ordem_exibicao !== undefined`, porque o base44 não devolve o campo quando ele
  nunca foi gravado; aqui a coluna existe e é nula até alguém arrastar.
*/
export function sortProjects(projects: ProjectRow[]): ProjectRow[] {
  return [...projects].sort((a, b) => {
    if (a.display_order != null && b.display_order != null) {
      return a.display_order - b.display_order
    }
    if (a.display_order != null) return -1
    if (b.display_order != null) return 1
    /* Empate no instante de criação (importação em lote, por exemplo) fica
       decidido pelo id — arbitrário, mas ESTÁVEL: sem ele a lista trocaria de
       ordem sozinha a cada releitura. */
    const byCreation = b.created_at.localeCompare(a.created_at)
    return byCreation !== 0 ? byCreation : a.id.localeCompare(b.id)
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
