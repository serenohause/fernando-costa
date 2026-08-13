import type { Tables } from '@/lib/database.types'
import type {
  DiaryEntryStatus,
  DiaryManualEntryType,
  DiaryVisibility,
  ProjectIssueCategory,
  ProjectIssueStatus,
  ProjectPhase,
  SiteVisitStatus,
  SiteVisitType,
} from '@/lib/enums'

export type DiaryEntry = Tables<'project_diary_entries'>
export type DiaryFile = Tables<'project_diary_files'>
export type SiteVisit = Tables<'project_site_visits'>
export type ProjectIssue = Tables<'project_issues'>
export type ProjectIssueEvent = Tables<'project_issue_events'>

/* Um colaborador como as telas deste módulo o exibem: só o nome. Mesmo tipo dos
   módulos 5, 7 e 8. */
export type NamedRef = { id: string; name: string }

/*
  A entrada de diário como a linha do tempo a lê.

  `responsavel_name`, `criado_por_name` e `atualizado_por_name` do base44 NÃO
  viraram coluna (migration 0069): são desnormalização de uma plataforma sem
  join, e o diário quer o nome ATUAL da pessoa. Voltam como embed, pelo nome da
  CONSTRAINT — as FK são compostas `(coluna, tenant_id)`.

  `files` é `project_diary_files` filtrada por `entry_id`. No base44 é o array
  `anexos` dentro da própria linha, com `{ nome, url, tipo }` — e a `url` é
  pública e eterna. Aqui cada anexo é uma linha, e o que ela guarda é o CAMINHO
  do objeto no bucket privado (migration 0071).
*/
export type DiaryEntryRow = DiaryEntry & {
  responsible: NamedRef | null
  created_by: NamedRef | null
  files: DiaryFile[]
}

/*
  O que o formulário da linha do tempo edita (DiaryEntryForm.jsx).

  FORA DAQUI, e cada um por um motivo:

  - `is_automatic`, `entry_type = 'system'`, `event_key`, `system_event`,
    `from_phase`, `to_phase`, `operational_tag` — são do registro AUTOMÁTICO, e
    a policy de INSERT da migration 0070 recusa `is_automatic` verdadeiro. Nem
    Diretor forja evento de sistema pela API; quem os escreve é
    `record_project_diary_event` (fatia 3).
  - `project_id` — vem do cartão que abriu a gaveta, não do formulário.
  - `created_by_id` / `updated_by_id` — saem da sessão, dentro do hook.
  - `tenant_id` / `legacy_id` — claim do JWT e importação.

  `visibility` ENTRA, e é o defeito 6 do plano fechado: DiaryEntryForm.jsx:219
  coleta o campo e `ProjectTimelineEntry` não o declara, então hoje o relatório
  "para o cliente" filtra por uma propriedade que nunca chegou a ser gravada.
  Aqui existe coluna, e o formulário grava de verdade.
*/
export type DiaryEntryInput = {
  entry_type: DiaryManualEntryType
  title: string
  description: string | null
  responsible_id: string | null
  status: DiaryEntryStatus
  occurrence_date: string
  occurrence_time: string | null
  visibility: DiaryVisibility
}

/*
  Os dois controles do topo da aba Timeline (ProjectDiaryDrawer.jsx:263-273):
  a busca livre e o select de tipo. `'all'` é o "Todos" dele.
*/
export type DiaryFilters = {
  search: string
  type: DiaryManualEntryType | 'all'
}

/*
  UM DIA da linha do tempo — o que a faixa "05 DE AGOSTO DE 2025" agrupa.

  Quem monta isto é `groupDiaryEntriesByDay` (./timeline), e não o JSX: no
  original o agrupamento é um `useMemo` dentro do componente
  (ProjectDiaryDrawer.jsx:144-152), o que deixa a regra de "que dia é este
  registro" — com o `|| 'sem-data'` de fallback — presa à tela que a desenha.
*/
export type DiaryEntryDay = {
  /** `occurrence_date`, no formato do banco (`yyyy-MM-dd`). */
  date: string
  entries: DiaryEntryRow[]
}

/*
  O PROJETO COMO O CABEÇALHO DA GAVETA O EXIBE, e nada além disso.

  A gaveta é aberta pelo cartão do Fluxo do Projeto, que nem sempre tem o
  projeto inteiro em mãos: `useProjects()` só traz `visible_in_list`, e uma
  tarefa pode apontar para projeto fora dessa lista. O original trata o mesmo
  caso caindo para `{ id, name }` (TaskKanban.jsx:513-516) — por isso os quatro
  campos de contexto são anuláveis aqui.

  `client` e `responsible` são embed do projeto (`client_name` e
  `responsible_name` do base44, que não são coluna neste sistema).
*/
export type DiaryProject = {
  id: string
  name: string
  client: NamedRef | null
  responsible: NamedRef | null
  current_phase: ProjectPhase | null
  start_date: string | null
}

/*
  O par caminho+nome de um anexo, como os componentes o recebem.

  `path` é o CAMINHO do objeto dentro do bucket privado `project-diary-files`,
  nunca uma URL: no base44 o campo guarda uma URL pública do `base44.app`, que
  serve o arquivo para quem tiver o endereço — e o que este módulo põe atrás
  dela é foto de obra da residência de um cliente (migration 0071). Quem
  transforma caminho em endereço que abre é `useDiaryFileUrl`, e o endereço vale
  poucos minutos.
*/
export type DiaryFileRef = {
  path: string
  name: string
}

/* ── Aba Obra: a visita ────────────────────────────────────────────────── */

/*
  A VISITA COMO A ABA OBRA A LÊ.

  `responsavel_name` do base44 não virou coluna (migration 0069) e volta como
  embed, pelo nome da CONSTRAINT — as FK são compostas `(coluna, tenant_id)`.
  `criado_por_name` não é lido por tela nenhuma do original e fica fora do
  select, como já ficou em `DiaryEntryRow`.

  `files` É UMA LISTA SÓ, e no base44 são DUAS (`fotos` e `arquivos`). O que as
  separava era o nome do array; aqui é `file_kind` (migration 0068), e quem
  recorta é a tela: a fita de miniaturas mostra `photo`, a contagem de clipes
  mostra `attachment`.
*/
export type SiteVisitRow = SiteVisit & {
  responsible: NamedRef | null
  files: DiaryFile[]
}

/*
  O que o formulário de visita edita (SiteVisitForm.jsx).

  FORA DAQUI: `project_id` (vem do cartão que abriu a gaveta), `created_by_id`
  (sai da sessão, dentro do hook), `diary_entry_id` (é o vínculo com a entrada
  automática que a visita gera, escrito pelo hook — defeito 7 do plano) e
  `tenant_id`/`legacy_id`.
*/
export type SiteVisitInput = {
  visit_date: string
  visit_time: string | null
  visit_type: SiteVisitType
  responsible_id: string | null
  summary: string
  notes: string | null
  status: SiteVisitStatus
}

/*
  Os três controles do topo da aba Obra (ObraTab.jsx:202-225): a busca livre e os
  dois selects. `'all'` é o "Todos os tipos" / "Todos os status" deles.
*/
export type SiteVisitFilters = {
  search: string
  type: SiteVisitType | 'all'
  status: SiteVisitStatus | 'all'
}

/* ── Aba Pendências ────────────────────────────────────────────────────── */

/*
  UMA LINHA DO HISTÓRICO da pendência, com quem a provocou.

  No base44 isto é um item do array `historico` dentro da própria pendência, e a
  atualização o regrava inteiro a partir do cache do navegador (defeito 12 do
  plano). Aqui cada linha é uma linha de `project_issue_events`, escrita por
  trigger — a tela só LÊ.
*/
export type ProjectIssueEventRow = ProjectIssueEvent & {
  author: NamedRef | null
}

/*
  A PENDÊNCIA COMO A ABA A LÊ.

  `resolvida_por_name` também não virou coluna e volta como embed. `events` é o
  array `historico`, e `files` são os arrays `fotos` e `arquivos` — ver
  `SiteVisitRow`.
*/
export type ProjectIssueRow = ProjectIssue & {
  responsible: NamedRef | null
  resolved_by: NamedRef | null
  files: DiaryFile[]
  events: ProjectIssueEventRow[]
}

/*
  O que o formulário de pendência edita (IssueForm.jsx).

  `issue_number` NÃO ENTRA, e é o defeito 8 do plano fechado: no original o
  número é `issues.length + 1` calculado sobre a lista que o navegador tem em
  memória. Aqui quem o aloca é o trigger `project_issues_assign_number`, sob
  advisory lock por projeto (migration 0069).

  `resolved_at` e `resolved_by_id` também não: eles são consequência do status, e
  o check `(status = 'resolved') = (resolved_at is not null)` amarra os dois. Quem
  os resolve é o hook, num lugar só.

  `visit_id` fica fora do formulário e entra pelo hook: ele vem da visita que
  abriu o formulário, e não de um campo — é o `visitId` que IssueForm.jsx:113
  costura no envio.
*/
export type ProjectIssueInput = {
  description: string
  category: ProjectIssueCategory
  responsible_id: string | null
  identified_date: string
  due_date: string | null
  status: ProjectIssueStatus
  notes: string | null
}

/*
  Os três controles da aba Pendências: os chips de status
  (PendenciasTab.jsx:139), o select de categoria e a busca livre.
*/
export type ProjectIssueFilters = {
  search: string
  status: ProjectIssueStatus | 'all'
  category: ProjectIssueCategory | 'all'
}

/* ── Fotos ─────────────────────────────────────────────────────────────── */

/*
  UM GRUPO DA GALERIA (FotosTab.jsx:27-54): as fotos de UM registro — uma visita
  ou uma pendência — com a faixa de data, o rótulo e o responsável que a aba
  desenha acima delas.

  `caption` é o `visitInfo` que o lightbox recebe: a linha de cima do cabeçalho
  (o resumo da visita, ou "Pendência #3") e a de baixo (o tipo da visita).
*/
export type DiaryPhotoGroup = {
  id: string
  label: string
  date: string
  responsible: string | null
  photos: DiaryFile[]
  caption: PhotoCaption
}

export type PhotoCaption = {
  title: string | null
  subtitle: string | null
}

/* O que o lightbox precisa saber: as fotos, onde ele está e de onde elas vêm. */
export type PhotoLightboxState = {
  photos: DiaryFile[]
  index: number | null
  caption: PhotoCaption | null
}
