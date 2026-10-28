import type { Database } from '@/lib/database.types'

/*
  Os tipos do sino. Uma linha de `public.notifications` (migrations 0120 e 0121)
  e nada além dela: a tabela já traz o título da tarefa, o nome do projeto e o
  nome de quem atribuiu COPIADOS para dentro da linha, justamente para o aviso
  continuar legível depois de a tarefa ser apagada. Ou seja, o painel não tem
  embed nenhum para montar, e é por isso que `NotificationRow` é a linha pura.
*/
export type NotificationKind = Database['public']['Enums']['notification_kind']

export type NotificationRow = Database['public']['Tables']['notifications']['Row']
