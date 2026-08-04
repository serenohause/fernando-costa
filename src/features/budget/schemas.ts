import { z } from 'zod'
import { Constants } from '@/lib/database.types'
import type { BudgetProjectPhase } from '@/lib/enums'

/*
  Segunda barreira antes de qualquer escrita em `budget_checklists`,
  `budget_checklist_items` e `budget_item_quotes`. A primeira continua sendo o
  `required` da marcação, como no original.

  As regras saem dos checks da migration 0049, e TODAS descrevem estados que o
  base44 aceita hoje:

  1. `budget_checklists_project_phase_domain_check` — a fase do checklist é um
     subconjunto de `project_phase`.
  2. `budget_checklists_curation_percent_range_check` e
     `budget_checklist_items_commission_percent_range_check` — percentual fora de
     0 a 100. Os `<input type="number">` do original não têm `min` nem `max`.
  3. `budget_checklists_completion_not_before_start_check` — conclusão antes do
     início.
  4. `budget_checklist_items_*_value_not_negative_check` e
     `budget_item_quotes_value_not_negative_check` — valor negativo.
  5. `budget_checklist_items_approval_date_requires_approval_check` — data de
     aprovação em item que a tela mostra como não aprovado. Um sentido só: item
     aprovado SEM data continua válido, porque é o que o original grava.
  6. `budget_checklist_items_name_not_blank_check` — nome só com espaço passa
     pelo `required` do navegador.

  E uma regra que é do banco sem ser check:
  `budget_item_quotes_item_id_supplier_id_key`. Um fornecedor cota um item uma
  vez — ver `quotes` abaixo.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

/* `z.iso.date()` e não regex: a regex `^\d{4}-\d{2}-\d{2}$` aceita 2025-02-30,
   que o banco recusa no cast para `date`. Mesma decisão dos módulos 3 a 7. */
const isoDate = (message: string) => nullIfBlank(z.iso.date(message).nullable())

/*
  DINHEIRO: `number`, como no módulo 7 — a coluna é `numeric(14,2)` e o PostgREST
  devolve numeric como número de JSON.

  DUAS DIFERENÇAS EM RELAÇÃO AO FINANCEIRO, e as duas são do domínio:

  - `>= 0`, e não `> 0`. O check é `>= 0`, e o motivo está no COMMENT de
    `budget_item_quotes.value`: cotação de cortesia com valor zero é informação
    legítima, diferente de parcela de zero real.
  - Nulo é aceito e é o padrão. Item sem valor aprovado ainda não foi decidido;
    cotação sem valor ainda não tem preço (o campo não é obrigatório no
    formulário do original, ItemOrcamentoForm.jsx:216).

  As duas casas decimais são cobradas pelo mesmo motivo do módulo 7:
  `numeric(14,2)` arredonda o que passar disso EM SILÊNCIO.
*/
const MAX_MONEY = 999_999_999_999.99

const money = (message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value ?? null
      const trimmed = value.trim()
      return trimmed === '' ? null : Number(trimmed)
    },
    z
      .number(message)
      .min(0, 'O valor não pode ser negativo.')
      .max(MAX_MONEY, 'Valor acima do que o sistema aceita.')
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
        message: 'O valor tem no máximo duas casas decimais (centavos).',
      })
      .nullable(),
  )

const percent = (message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value ?? null
      const trimmed = value.trim()
      return trimmed === '' ? null : Number(trimmed)
    },
    z
      .number(message)
      .min(0, 'O percentual não pode ser negativo.')
      .max(100, 'O percentual não pode passar de 100.')
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
        message: 'O percentual tem no máximo duas casas decimais.',
      })
      .nullable(),
  )

/*
  O domínio de fase do checklist, tirado do próprio `Constants` para não haver
  duas verdades sobre quais valores existem — mesmo desenho de TASK_PHASE_VALUES
  (módulo 5). São as quatro fases que o original oferece, e `post_approval`
  existe no enum compartilhado só por causa desta coluna (migration 0048).
*/
const BUDGET_PHASES = ['renderings', 'construction_docs', 'engineering_docs', 'post_approval']

export const BUDGET_PROJECT_PHASE_VALUES = Constants.public.Enums.project_phase.filter(
  (phase): phase is BudgetProjectPhase => BUDGET_PHASES.includes(phase),
)

/* ── Checklist ─────────────────────────────────────────────────────────── */

export const budgetChecklistInputSchema = z
  .object({
    /* NOT NULL no banco, `required` no formulário do original. */
    client_id: z.uuid('Selecione o cliente do orçamento.'),

    /* Anuláveis como as colunas: o formulário oferece "Nenhum" nos dois
       (ChecklistForm.jsx:75 e :94). */
    project_id: nullIfBlank(z.uuid('Projeto inválido.').nullable()),
    responsible_id: nullIfBlank(z.uuid('Responsável inválido.').nullable()),

    status: z.enum(Constants.public.Enums.budget_checklist_status),
    project_phase: nullIfBlank(z.enum(BUDGET_PROJECT_PHASE_VALUES).nullable()),

    curation_percent: percent('Informe o percentual de curadoria.'),

    start_date: isoDate('Data de início inválida.'),
    completion_date: isoDate('Data de conclusão inválida.'),
    notes: optionalText(5000),
  })
  .refine(
    (value) =>
      value.completion_date == null ||
      value.start_date == null ||
      value.completion_date >= value.start_date,
    {
      message: 'A conclusão não pode ser anterior ao início.',
      path: ['completion_date'],
    },
  )

/* ── Item do checklist ─────────────────────────────────────────────────── */

/*
  AS COTAÇÕES, normalizadas antes de gravar.

  UM FORNECEDOR COTA UM ITEM UMA VEZ (`budget_item_quotes_item_id_supplier_id_key`).
  O original não impede duas cotações do mesmo fornecedor no mesmo item, e quando
  isso acontece o drawer marca as DUAS como "Escolhido", porque ele decide
  comparando `fc.fornecedor_id` com `item.fornecedor_escolhido_id`, sem desempate
  (ItemOrcamentoDrawer.jsx:146).

  A repetida some AQUI, e fica a ÚLTIMA: no formulário, adicionar de novo o mesmo
  fornecedor é o gesto de corrigir o valor que foi digitado errado. Deixar passar
  faria a gravação inteira falhar em 23505 por causa de um clique repetido.
*/
const quotes = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return []
    const bySupplier = new Map<string, unknown>()
    for (const quote of value) {
      const supplierId = (quote as { supplier_id?: unknown })?.supplier_id
      if (typeof supplierId !== 'string' || supplierId === '') continue
      bySupplier.set(supplierId, quote)
    }
    return [...bySupplier.values()]
  },
  z.array(
    z.object({
      /* NOT NULL: o original sai fora sem fornecedor escolhido
         (ItemOrcamentoForm.jsx:65). */
      supplier_id: z.uuid('Escolha o fornecedor da cotação.'),
      value: money('Valor da cotação inválido.'),
      notes: optionalText(2000),
    }),
  ),
)

export const budgetChecklistItemInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome do item.').max(300),
    description: optionalText(2000),

    /* ANULÁVEL apesar do asterisco no formulário do original: a tela agrupa por
       `item.categoria || 'Outros'` (ChecklistDetalhe.jsx:42), ou seja, ela já
       conta com item sem categoria. Os 23 valores valem aqui — inclusive os
       quatro que fornecedor nenhum pode ter. */
    category: nullIfBlank(z.enum(Constants.public.Enums.supplier_category).nullable()),

    responsible_id: nullIfBlank(z.uuid('Responsável inválido.').nullable()),
    due_date: isoDate('Prazo inválido.'),

    status: z.enum(Constants.public.Enums.budget_item_status),
    /* Os QUATRO valores de `priority_level`, `urgent` inclusive — diferente de
       tarefa, onde `tasks_priority_not_urgent_check` recorta. */
    priority: z.enum(Constants.public.Enums.priority_level),

    estimated_value: money('Valor estimado inválido.'),
    approved_value: money('Valor aprovado inválido.'),

    chosen_supplier_id: nullIfBlank(z.uuid('Fornecedor inválido.').nullable()),
    commission_percent: percent('Informe o percentual de comissão.'),

    client_approved: z.boolean(),
    approval_date: isoDate('Data de aprovação inválida.'),

    is_required: z.boolean(),
    notes: optionalText(5000),

    quotes,
  })
  .refine((value) => value.approval_date == null || value.client_approved, {
    message: 'Só item aprovado pelo cliente tem data de aprovação.',
    path: ['approval_date'],
  })

/* ── Cotação avulsa ────────────────────────────────────────────────────── */

/*
  A cotação editada FORA do formulário de item — o drawer mexe em uma cotação de
  cada vez para anexar o PDF, e a UI nova pode querer corrigir só o valor sem
  reabrir o item inteiro. Mesmo formato do que vai dentro de `quotes`.
*/
export const budgetItemQuoteInputSchema = z.object({
  supplier_id: z.uuid('Escolha o fornecedor da cotação.'),
  value: money('Valor da cotação inválido.'),
  notes: optionalText(2000),
})

export type BudgetChecklistInputParsed = z.infer<typeof budgetChecklistInputSchema>
export type BudgetChecklistItemInputParsed = z.infer<typeof budgetChecklistItemInputSchema>
export type BudgetItemQuoteInputParsed = z.infer<typeof budgetItemQuoteInputSchema>
