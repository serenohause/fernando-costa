import { z } from 'zod'
import { Constants } from '@/lib/database.types'
import type { TaskPhase, TaskPriority } from '@/lib/enums'

/*
  Segunda barreira antes de qualquer escrita em `projects` e `tasks`. A primeira
  continua sendo o `required` da marcação, como no original — mesma mecânica de
  src/features/contracts/schemas.ts, e pelo mesmo motivo: o que o navegador
  deixa passar e o banco recusaria vira frase em português aqui, e não nome de
  constraint na tela.

  As regras saem dos checks da migration 0032, e todas descrevem estados que o
  base44 ACEITA:

  1. `tasks_due_date_not_before_start_check` — prazo anterior ao início, que
     nasce atrasado no dia em que é criado.
  2. `tasks_hours_not_negative_check` — horas estimadas negativas.
  3. `tasks_phase_not_finished_check` — `finished` é valor de
     `projects.current_phase`, nunca de tarefa. A coluna "Finalizado" do kanban
     é `status = completed` disfarçado de fase (TaskKanban.jsx:229), e é assim
     que ela é tratada aqui.
  4. `tasks_priority_not_urgent_check` — `urgent` só existe em Atividade
     (módulo 6).
  5. `projects_name_not_blank_check` / `tasks_title_not_blank_check` — nome só
     com espaço passa pelo `required` do navegador.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

/*
  `z.iso.date()` e não regex de formato: a regex `^\d{4}-\d{2}-\d{2}$` aceita
  2025-02-30, que o banco recusa no cast para `date`. Mesma decisão dos módulos
  3 e 4.
*/
const isoDate = (message: string) => nullIfBlank(z.iso.date(message).nullable())

/* ── Projeto ───────────────────────────────────────────────────────────── */

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do projeto.').max(300),

  /*
    `contract_type`, e não um enum próprio: no base44 são duas listas com rótulo
    diferente para o mesmo conceito ("Projeto de Arquitetura" em Contract,
    "Arquitetura" em Project) e a migration 0031 as unificou num tipo só. Quem
    mostra o rótulo curto desta tela é PROJECT_TYPE.
  */
  project_type: z.enum(Constants.public.Enums.contract_type, {
    error: 'Selecione o tipo de projeto.',
  }),

  /* Nullable como a coluna: Projects.jsx trata explicitamente o projeto sem
     cliente ("Sem cliente" na lista). */
  client_id: nullIfBlank(z.uuid('Cliente inválido.').nullable()),
  commercial_responsible_id: nullIfBlank(z.uuid('Responsável inválido.').nullable()),

  city: optionalText(120),
  state: optionalText(60),
  site_address_text: optionalText(300),
  start_date: isoDate('Data de início inválida.'),
  status: z.enum(Constants.public.Enums.project_status),
  notes: optionalText(5000),
})

/* ── Tarefa ────────────────────────────────────────────────────────────── */

/* O recorte do enum compartilhado, do lado do cliente. A lista sai do próprio
   Constants para não haver duas verdades sobre quais fases existem. */
export const TASK_PHASE_VALUES = Constants.public.Enums.project_phase.filter(
  (phase): phase is TaskPhase => phase !== 'finished',
)

export const TASK_PRIORITY_VALUES = Constants.public.Enums.priority_level.filter(
  (priority): priority is TaskPriority => priority !== 'urgent',
)

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe o título da tarefa.').max(300),

    /* Nullable como no original, que só declara `title` como obrigatório —
       Tasks.jsx confere `task.project_id` antes de recalcular a fase, ou seja,
       tarefa sem projeto é caso previsto lá. */
    project_id: nullIfBlank(z.uuid('Projeto inválido.').nullable()),
    responsible_id: nullIfBlank(z.uuid('Responsável inválido.').nullable()),

    task_type: nullIfBlank(z.enum(Constants.public.Enums.task_type).nullable()),
    priority: z.enum(TASK_PRIORITY_VALUES),
    phase: z.enum(TASK_PHASE_VALUES, {
      error: 'Tarefa não pode estar na fase Finalizado — essa fase é do projeto.',
    }),
    status: z.enum(Constants.public.Enums.work_status),

    start_date: isoDate('Data de início inválida.'),
    due_date: isoDate('Data de prazo inválida.'),

    estimated_hours: z
      .number()
      .min(0, 'As horas estimadas não podem ser negativas.')
      .max(9999.99, 'Horas estimadas fora da faixa aceita.')
      .nullable(),

    description: optionalText(5000),
  })
  .refine(
    (value) => value.due_date == null || value.start_date == null || value.due_date >= value.start_date,
    {
      message: 'O prazo não pode ser anterior ao início.',
      path: ['due_date'],
    },
  )

export type ProjectInputParsed = z.infer<typeof projectInputSchema>
export type TaskInputParsed = z.infer<typeof taskInputSchema>
