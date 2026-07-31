import { z } from 'zod'
import { Constants } from '@/lib/database.types'

/*
  Segunda barreira antes de qualquer escrita em `activities`. A primeira continua
  sendo o `required` da marcação, como no original — mesma mecânica de
  src/features/projects/schemas.ts, e pelo mesmo motivo: o que o navegador deixa
  passar e o banco recusaria vira frase em português aqui, e não nome de
  constraint na tela.

  As regras saem dos checks da migration 0037, e todas descrevem estados que o
  base44 ACEITA:

  1. `activities_description_not_blank_check` — descrição só com espaço passa
     pelo `required` do navegador.
  2. `activities_end_date_not_before_start_date_check` — prazo de término
     anterior ao de início, que nasce atrasado no dia em que é criado.
  3. Os quatro campos obrigatórios do original (descrição, responsável, prazo de
     início e prazo de término) continuam obrigatórios.

  O que NÃO está aqui é o par `status`/`completed_at`
  (`activities_completed_at_matches_status_check`): ele não é validação de campo
  digitado, é acoplamento entre duas colunas que a tela grava juntas — vive em
  execution.ts, que é quem monta o patch.
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
  3 a 5.
*/
export const activityInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Informe a descrição da atividade.').max(1000),

    /* Not null na tabela, e `required` no select do original. Não é só uma FK: é
       ele que decide quem enxerga a linha (policy da migration 0038). */
    collaborator_id: z.uuid('Selecione o responsável pela atividade.'),

    coordinator_id: nullIfBlank(z.uuid('Coordenador inválido.').nullable()),
    project_id: nullIfBlank(z.uuid('Projeto inválido.').nullable()),
    client_id: nullIfBlank(z.uuid('Cliente inválido.').nullable()),

    start_date: z.iso.date('Data de início inválida.'),
    end_date: z.iso.date('Data de término inválida.'),

    status: z.enum(Constants.public.Enums.work_status),
    /* `urgent` entra aqui: ele existe em Atividade e é barrado em tarefa por
       `tasks_priority_not_urgent_check` (módulo 5). */
    priority: z.enum(Constants.public.Enums.priority_level),

    notes: optionalText(5000),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: 'O prazo de término não pode ser anterior ao de início.',
    path: ['end_date'],
  })

export type ActivityInputParsed = z.infer<typeof activityInputSchema>
