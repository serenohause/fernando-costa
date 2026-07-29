import { z } from 'zod'
import { Constants } from '@/lib/database.types'

/*
  O formulário do original valida só com `required` do HTML. Isso continua
  valendo na tela (a marcação é a mesma), e o schema abaixo é a segunda barreira,
  aplicada no hook antes de qualquer escrita: o que o navegador deixa passar
  (espaço em branco no nome, carga horária negativa, e-mail vazio numa coluna
  NOT NULL) não chega ao banco como erro de constraint.

  Os valores vêm de `Constants` dos tipos gerados — os mesmos enums do Postgres,
  sem lista paralela escrita à mão.
*/
export const collaboratorInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do colaborador.').max(120),
  role: z.enum(Constants.public.Enums.collaborator_role, {
    error: 'Selecione a função do colaborador.',
  }),
  area: z.enum(Constants.public.Enums.collaborator_area).nullable(),
  email: z.email('Informe um e-mail válido.').trim(),
  status: z.enum(Constants.public.Enums.collaborator_status),
  weekly_hours: z
    .number()
    .min(0, 'Carga horária não pode ser negativa.')
    .max(168, 'Carga horária semanal não passa de 168 horas.')
    .nullable(),
})

export type CollaboratorInputParsed = z.infer<typeof collaboratorInputSchema>

/*
  Corpo aceito por supabase/functions/approve-access-request. Nome, função,
  área e carga horária vêm do formulário; e-mail e tenant saem da própria
  solicitação, no servidor.
*/
export const approveAccessRequestSchema = z.object({
  requestId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(Constants.public.Enums.collaborator_role),
  area: z.enum(Constants.public.Enums.collaborator_area).nullable(),
  coordinatorId: z.uuid().nullable(),
  weeklyHours: z.number().min(0).max(168).nullable(),
})

export type ApproveAccessRequestInput = z.infer<typeof approveAccessRequestSchema>

export function firstIssueMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Dados inválidos.'
  }
  return null
}
