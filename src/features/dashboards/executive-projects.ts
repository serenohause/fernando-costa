import { PROJECT_PHASE, labelOf, type ProjectPhase } from '@/lib/enums'
import { normalizeText } from '@/lib/format'
import type { ProjectProgress, ProjectRow } from '@/features/projects/types'
import { isProjectBlocked } from './list'
import type { ProjectProgressRow } from './types'

/*
  Os RECORTES DE PROJETO que só o Painel Executivo usa: os seis conjuntos que os
  cartões clicáveis e as barras do gráfico abrem em gaveta, mais a busca e a
  ordenação da gaveta de colaborador.

  POR QUE AQUI E NÃO EM list.ts: as contas dos três painéis moram lá, e é lá que
  elas continuam. O que está neste arquivo não é conta de cartão — é o
  SUBCONJUNTO que cada cartão já contado abre quando alguém clica nele, algo que
  só existe na tela e que o original resolve com um filtro solto dentro do
  `onClick` (DashboardExecutivo.jsx:598-680 e 1049-1079). Filtro dentro do JSX
  não é testável nem reusável; aqui cada um tem nome e uma linha do original ao
  lado. Mesmo precedente de pipeline/filters.ts e projects/project-phase.ts.

  NENHUMA DESTAS FUNÇÕES É A FONTE DE UM NÚMERO DE CARTÃO. Os números vêm de
  `operationalMetrics` e `progressMetrics` (list.ts), e "Em Risco" sai do conjunto
  de ids que o banco devolve (`useAtRiskProjectIds`) — o mesmo que abre a gaveta.
*/

/* "Aguardando Cliente" (DashboardExecutivo.jsx:621). */
export function awaitingClientProjects(projects: ProjectRow[]): ProjectRow[] {
  return projectsInPhase(projects, 'awaiting_client')
}

/* Uma barra do gráfico "Distribuição por Fase" (DashboardExecutivo.jsx:697). */
export function projectsInPhase(projects: ProjectRow[], phase: ProjectPhase): ProjectRow[] {
  return projects.filter((project) => project.current_phase === phase)
}

/*
  "Em Risco": projeto com ALGUMA tarefa atrasada — `isProjectAtRisk` de
  components/utils/flowProjectsQuery.jsx, o arquivo que o original declara como
  fonte única de verdade do Fluxo.

  A RÉGUA É `isTaskOverdue` (projects/list.ts), a mesma do crachá vermelho do
  kanban, com a leitura UTC que o módulo 5 já tem no ar — ou seja, em Goiânia a
  tarefa que vence hoje conta como atrasada desde as 21h de ontem. O comentário
  daquela função explica por que ela não foi corrigida, e este painel não corrige
  por conta própria: o cartão passaria a discordar do quadro.

  A LISTA E O CARTÃO SAEM DO MESMO LUGAR: o conjunto de ids vem do banco
  (`useAtRiskProjectIds`, com a régua acima traduzida para WHERE) e serve tanto
  para contar quanto para abrir a gaveta. Antes o cartão contava no banco e a
  gaveta peneirava as até 500 tarefas baixadas, o que fazia os dois discordarem
  passado esse teto.
*/
export function atRiskProjects(projects: ProjectRow[], atRiskIds: Set<string>): ProjectRow[] {
  return projects.filter((project) => atRiskIds.has(project.id))
}

/* "Bloqueados": checklist obrigatório incompleto, lido da view `project_progress`
   — ver `isProjectBlocked` em list.ts. */
export function blockedProjects(
  projects: ProjectRow[],
  progressByProject: Map<string, ProjectProgress>,
): ProjectRow[] {
  return projects.filter((project) => isProjectBlocked(progressByProject.get(project.id)))
}

/*
  "Projetos < 30%" e "Projetos > 80%" (DashboardExecutivo.jsx:1053 e 1069).

  SOBRE AS LINHAS JÁ CALCULADAS de `progressMetrics`, e não sobre a lista de
  projetos de novo: é o mesmo `progressPercent` que os dois cartões contam, então
  a gaveta nunca abre com um número diferente do que o cartão mostra.
*/
export function projectsBelow(rows: ProjectProgressRow[], percent: number): ProjectRow[] {
  return rows.filter((row) => row.progressPercent < percent).map((row) => row.project)
}

export function projectsAbove(rows: ProjectProgressRow[], percent: number): ProjectRow[] {
  return rows.filter((row) => row.progressPercent > percent).map((row) => row.project)
}

/* As cinco ordens da gaveta de colaborador (DashboardExecutivo.jsx:852-856). */
export type ProjectSortKey = 'name' | 'progress-asc' | 'progress-desc' | 'phase' | 'date'

/*
  A busca e a ordenação da gaveta "Projetos de <colaborador>"
  (DashboardExecutivo.jsx:863-886).

  A CAIXA DIZ "nome ou código" E AGORA PROCURA OS DOIS. No original ela promete
  código e filtra só por nome (linhas 840 e 869): digitar o número do contrato
  esvazia a gaveta, e a instrução escrita dentro do campo é falsa. O "código" que
  este schema tem para um projeto é o NÚMERO DO CONTRATO
  (`contract.contract_number`, embed que a lista de projetos já carrega — a
  coluna `contract_number` copiada em `projects` saiu na migration 0032), então é
  ele que entra na busca. Placeholder intacto; o que mudou foi ele passar a ser
  verdade.

  DUAS COISAS QUE VÊM DO ORIGINAL E FICAM:

  1. Sem termo, a ordem padrão é por NOME, e não a que a lista de fora usava.
  2. O progresso ordenado é o mesmo que a linha mostra.

  DUAS DIFERENÇAS DE IMPLEMENTAÇÃO, sem efeito de layout:

  - ACENTO É IGNORADO na busca, com `normalizeText` — no original é
    `toLowerCase().includes()`, que faz "Jose" não achar "José". É o mesmo
    tratamento que a busca do CRM, do financeiro, do mapa e de fornecedores já
    dão neste projeto; ter uma única tela achando menos que as outras seria a
    surpresa. Reportado ao usuário.
  - A ORDEM POR FASE COMPARA O RÓTULO EM PORTUGUÊS, não a chave do enum. No
    original a coluna guarda o próprio texto ("Aguardando Cliente", "Briefing"),
    e é ele que vai para o `localeCompare`; aqui a coluna guarda `awaiting_client`
    / `briefing`, cuja ordem alfabética é OUTRA. Comparar o rótulo é o que
    mantém a lista na ordem que a tela do cliente tem hoje.
*/
export function searchAndSortProjects(
  projects: ProjectRow[],
  search: string,
  sortBy: ProjectSortKey,
  progressByProject: Map<string, ProjectProgress>,
): ProjectRow[] {
  const needle = normalizeText(search)
  const filtered = needle
    ? projects.filter(
        (project) =>
          normalizeText(project.name).includes(needle) ||
          normalizeText(project.contract?.contract_number ?? '').includes(needle),
      )
    : projects

  const progressOf = (project: ProjectRow) =>
    progressByProject.get(project.id)?.progress_percent ?? 0

  return [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'progress-asc') return progressOf(a) - progressOf(b)
    if (sortBy === 'progress-desc') return progressOf(b) - progressOf(a)
    if (sortBy === 'phase') {
      return labelOf(PROJECT_PHASE, a.current_phase).localeCompare(
        labelOf(PROJECT_PHASE, b.current_phase),
      )
    }
    /* `date`: sem data vai para o fim, como no original (linhas 880-883). */
    if (!a.start_date && !b.start_date) return 0
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return a.start_date.localeCompare(b.start_date)
  })
}
