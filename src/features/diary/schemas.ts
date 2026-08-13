import { z } from 'zod'
import { Constants } from '@/lib/database.types'
import { MANUAL_DIARY_ENTRY_TYPES } from '@/lib/enums'

/*
  Segunda barreira antes de qualquer escrita em `project_diary_entries`. A
  primeira continua sendo o `required` da marcação, como no original — mesma
  mecânica de src/features/projects/schemas.ts, e pelo mesmo motivo: o que o
  navegador deixa passar e o banco recusaria vira frase em português aqui, e não
  nome de constraint na tela.

  AS TRÊS FRASES OBRIGATÓRIAS SÃO AS DO ORIGINAL, palavra por palavra —
  DiaryEntryForm.jsx:116-118 as mostra em toast antes de submeter ("Selecione o
  tipo do registro.", "Informe o título.", "Informe a data."). Aqui elas chegam
  pelo mesmo caminho de erro das outras telas (`describeDatabaseError` traduz
  ZodError antes de olhar para o banco), então o texto é o mesmo e o lugar em
  que aparece também.

  O QUE ESTE SCHEMA NÃO ACEITA, E ISSO É REGRA DE BANCO TAMBÉM:

  - tipo `system` — `MANUAL_DIARY_ENTRY_TYPES` o exclui, e o check
    `project_diary_entries_system_type_matches_automatic_check` (migration 0069)
    amarra tipo Sistema a `is_automatic`, que a policy de INSERT da 0070 recusa.
    Registro de sistema entra só por `record_project_diary_event`.
  - título em branco — `project_diary_entries_title_not_blank_check`. `required`
    do navegador deixa passar um título só com espaço.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

/*
  `z.iso.date()` e não regex de formato: a regex `^\d{4}-\d{2}-\d{2}$` aceita
  2025-02-30, que o banco recusa no cast para `date`. Mesma decisão dos módulos
  3, 4 e 5.
*/
const occurrenceDate = z.iso.date('Informe a data.')

/*
  `<input type="time">` devolve `HH:MM` (e `HH:MM:SS` quando tem passo em
  segundos). `z.iso.time()` exigiria os segundos, o que recusaria o valor que o
  próprio campo produz — então a regra é escrita aqui, com as duas formas.
  Nulo é o normal: a hora é opcional no original e a coluna é anulável.
*/
const occurrenceTime = nullIfBlank(
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora inválida.')
    .nullable(),
)

export const diaryEntryInputSchema = z.object({
  entry_type: z.enum(MANUAL_DIARY_ENTRY_TYPES, { error: 'Selecione o tipo do registro.' }),

  title: z.string().trim().min(1, 'Informe o título.').max(300),

  description: nullIfBlank(z.string().max(5000).nullable()),

  responsible_id: nullIfBlank(z.uuid('Responsável inválido.').nullable()),

  status: z.enum(Constants.public.Enums.diary_entry_status),

  occurrence_date: occurrenceDate,
  occurrence_time: occurrenceTime,

  visibility: z.enum(Constants.public.Enums.diary_visibility),
})

export type DiaryEntryInputParsed = z.infer<typeof diaryEntryInputSchema>
