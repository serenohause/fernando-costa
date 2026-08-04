import type { Tables } from '@/lib/database.types'
import type {
  BudgetChecklistStatus,
  BudgetItemStatus,
  BudgetProjectPhase,
  PriorityLevel,
  SupplierCategory,
} from '@/lib/enums'

export type BudgetChecklist = Tables<'budget_checklists'>
export type BudgetChecklistItem = Tables<'budget_checklist_items'>
export type BudgetItemQuote = Tables<'budget_item_quotes'>

/* Cliente, projeto, responsável e fornecedor como as telas os exibem: só o
   rótulo. Mesmo tipo do módulo 7. */
export type NamedRef = { id: string; name: string }

/*
  OS QUATRO TOTAIS NÃO SÃO COLUNAS — são a view `budget_checklist_totals`
  (migration 0051). No original são campos soltos que a tela recalcula e regrava
  a cada mexida em item, e ela nem sempre regrava todos: o botão "comissão
  recebida" manda só `valor_total_comissao`, então qualquer divergência dos
  outros fica gravada.

  POR QUE NÃO `Tables<'budget_checklist_totals'>` DIRETO: o gerador marca toda
  coluna de view como anulável porque o Postgres não declara nulidade através de
  uma view. Esta devolve `coalesce(...)` em tudo e UMA linha por checklist,
  inclusive para checklist sem item nenhum — tudo zero, nunca nulo.
*/
export type BudgetChecklistTotals = {
  checklist_id: string
  tenant_id: string
  item_count: number
  /* Finalizado é `status in (approved, cancelled)`, como no original
     (ChecklistDetalhe.jsx:50) — e não o campo `concluido`, que não foi portado. */
  completed_item_count: number
  progress_percent: number
  estimated_total: number
  approved_total: number
  commission_total: number
  commission_received_total: number
  /* Total aprovado × `curation_percent`. A fórmula é DECISÃO da migration 0051 —
     no original o campo existe e nenhuma tela o calcula — e está reportada. */
  curation_total: number
}

/*
  O checklist como a listagem o lê.

  Os três `*_name` do base44 (client_name, project_name,
  responsavel_orcamento_name) saíram do schema (migration 0049, item 2) e voltam
  como embed: a lista quer o nome ATUAL do cadastro. O nome do relacionamento é o
  da CONSTRAINT porque as FK são compostas `(coluna, tenant_id)`.

  `project` e `responsible` vêm anuláveis porque as colunas são: o original
  desenha os dois casos ("Sem projeto vinculado", OrcamentoCliente.jsx:215).
  `client` é NOT NULL no banco, mas o embed é tipado como anulável pelo PostgREST
  — a tela do original já tem o texto "Cliente não definido" para esse caso.
*/
export type BudgetChecklistRow = BudgetChecklist & {
  client: NamedRef | null
  project: NamedRef | null
  responsible: NamedRef | null
}

/*
  A cotação de um fornecedor para um item (`itens[].fornecedores_cotados` do
  original, um array dentro de outro array).

  `escolhido` NÃO existe: quem responde qual cotação venceu é
  `budget_checklist_items.chosen_supplier_id` (migration 0049, item 4) — a tela
  compara os dois ids, como o original já faz (ItemOrcamentoDrawer.jsx:146).
*/
export type BudgetItemQuoteRow = BudgetItemQuote & {
  supplier: NamedRef | null
}

export type BudgetChecklistItemRow = BudgetChecklistItem & {
  responsible: NamedRef | null
  supplier: NamedRef | null
  quotes: BudgetItemQuoteRow[]
}

/*
  O que o formulário de checklist edita (ChecklistForm.jsx).

  FORA DAQUI: `tenant_id` (vem do claim da sessão) e `legacy_id` (só a
  importação). Os quatro totais também — são a view.

  `project_id` é ANULÁVEL, seguindo o que as telas fazem e não o que a entidade
  declara: o formulário oferece "Nenhum" e a listagem desenha "Sem projeto
  vinculado" (migration 0049).

  DOIS CAMPOS QUE A COLUNA TEM E O FORMULÁRIO DO ORIGINAL NÃO OFERECE:
  `completion_date` e `notes`. Entram como opcionais porque existem no schema;
  dar-lhes um campo é decisão do usuário. O único vínculo que o banco cobra é
  `completion_date >= start_date`.
*/
export type BudgetChecklistInput = {
  client_id: string
  project_id: string | null
  responsible_id: string | null

  status: BudgetChecklistStatus
  /* Subconjunto de `project_phase`: só as quatro fases que o original oferece
     (`budget_checklists_project_phase_domain_check`). */
  project_phase: BudgetProjectPhase | null

  curation_percent: number | null

  start_date: string | null
  completion_date: string | null
  notes: string | null
}

/*
  UMA COTAÇÃO COMO O FORMULÁRIO DE ITEM A EDITA (ItemOrcamentoForm.jsx:206-218):
  fornecedor, valor e observação. O PDF NÃO está aqui — ele é anexado depois, no
  drawer, e tem hook próprio; reescrever a cotação por este caminho preserva o
  arquivo já anexado.
*/
export type BudgetItemQuoteInput = {
  supplier_id: string
  value: number | null
  notes: string | null
}

/*
  O que o formulário de item edita (ItemOrcamentoForm.jsx).

  FORA DAQUI, e cada um por um motivo:

  - `commission_value` — é COLUNA GERADA pelo banco (migration 0049, item 3).
    Mandá-la na gravação devolve 428C9, que `describeDatabaseError` já traduz
    como erro do sistema. No original a conta é feita no formulário e gravada.
  - `commission_received` — quem a escreve é o botão do rodapé
    (ChecklistDetalhe.jsx:195), não o formulário. Hook próprio.
  - `budget_file_path` / `budget_file_name` — quem os escreve é o upload.
  - `concluido` e `fornecedores_cotados[].escolhido` — não foram portados
    (migration 0049, itens 4 e 5).

  `estimated_value` ENTRA, e é o campo que o formulário do original NÃO TEM
  (migration 0049, nota b): ele é somado no rodapé e exibido no drawer, mas hoje
  só a importação consegue preenchê-lo. Está no tipo porque a coluna existe; dar
  um input a ele é decisão do usuário.

  `quotes` não é coluna: é a lista de `budget_item_quotes` que a gravação
  sincroniza junto, porque a tela edita as duas coisas no mesmo formulário.
*/
export type BudgetChecklistItemInput = {
  name: string
  description: string | null
  category: SupplierCategory | null

  responsible_id: string | null
  due_date: string | null

  status: BudgetItemStatus
  /* Os QUATRO valores, `urgent` inclusive — diferente de tarefa. */
  priority: PriorityLevel

  estimated_value: number | null
  approved_value: number | null

  chosen_supplier_id: string | null
  commission_percent: number | null

  client_approved: boolean
  /* `budget_checklist_items_approval_date_requires_approval_check`: data de
     aprovação exige aprovação do cliente. Um sentido só. */
  approval_date: string | null

  is_required: boolean
  notes: string | null

  quotes: BudgetItemQuoteInput[]
}

/*
  Os três selects do topo da listagem (OrcamentoCliente.jsx:146-175). `'all'` é o
  "Todos status" / "Todos" / "Todas as fases" de cada um.
*/
export type BudgetFilters = {
  status: BudgetChecklistStatus | 'all'
  responsibleId: string | 'all'
  phase: BudgetProjectPhase | 'all'
}

/*
  AS DUAS COLUNAS DE ARQUIVO DE CADA TABELA, como um par — o banco cobra que
  caminho e nome andem juntos (`*_file_pair_check`).

  `path` é o CAMINHO do objeto dentro do bucket privado `budget-files`, nunca uma
  URL: assinatura expira, e link morto gravado no banco é pior que nenhum link
  (migration 0052). Para ABRIR o arquivo, a tela pede uma URL assinada na hora —
  `useBudgetFileUrl`.
*/
export type BudgetFileRef = {
  path: string
  name: string
}

/* Onde o PDF é anexado. São os dois únicos lugares do sistema com upload. */
export type BudgetFileTarget = 'item' | 'quote'
