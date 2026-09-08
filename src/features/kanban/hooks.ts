import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import type { KanbanBoard, KanbanColumnRow } from './types'

/*
  O QUADRO CONFIGURÁVEL, lido por duas telas com papéis opostos: o Fluxo do
  Projeto DESENHA o que está aqui, e Configurações EDITA.

  Ficam no mesmo módulo, e não um hook em cada feature, por causa do cache: com
  duas chaves de consulta sobre a mesma tabela, renomear uma etapa em
  Configurações deixaria o quadro exibindo o nome antigo até alguém recarregar a
  página. Uma chave só, invalidada por quem escreve.
*/

export const kanbanKeys = {
  all: ['kanban'] as const,
  board: (key: string) => [...kanbanKeys.all, key] as const,
}

const KANBAN_ERROR_MESSAGES: DatabaseErrorMessages = {
  kanban_columns_label_not_blank_check: 'Dê um nome à etapa.',
  kanban_columns_label_length_check: 'O nome da etapa é longo demais (máximo de 40 caracteres).',
  kanban_columns_progress_range_check: 'O percentual da etapa precisa estar entre 0 e 100.',
  kanban_boards_name_not_blank_check: 'Dê um nome ao quadro.',
  kanban_boards_name_length_check: 'O nome do quadro é longo demais (máximo de 60 caracteres).',
  /*
    A cor não é digitada — sai de uma lista fechada na tela. A frase existe para
    quem chega pela API: o check recusa classe do Tailwind justamente porque
    classe vinda do banco não entra no CSS e a cor sumiria sem erro nenhum.
  */
  kanban_columns_color_format_check:
    'Escolha uma cor da paleta. Nome de classe de estilo não é aceito aqui.',
  '42501': 'Sem permissão de edição em Configurações.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, KANBAN_ERROR_MESSAGES)
}

/*
  Traz o quadro e TODAS as etapas dele, inclusive as inativas: Configurações
  precisa mostrar o que está escondido para poder reexibir, e o Fluxo do Projeto
  filtra por `is_active` na hora de desenhar. Quinze linhas — dois recortes
  seriam duas listas capazes de discordar na tela, como já se decidiu em
  `useServiceTypes`.
*/
export function useKanbanBoard(boardKey: string) {
  return useQuery({
    queryKey: kanbanKeys.board(boardKey),
    queryFn: async (): Promise<KanbanBoard | null> => {
      const { data: board, error: boardError } = await supabase
        .from('kanban_boards')
        .select('*')
        .eq('key', boardKey)
        .maybeSingle()

      if (boardError) throw boardError
      if (!board) return null

      const { data: columns, error: columnsError } = await supabase
        .from('kanban_columns')
        .select('*')
        .eq('board_id', board.id)
        .order('display_order', { ascending: true })

      if (columnsError) throw columnsError
      return { ...board, columns: columns ?? [] }
    },
    /*
      A configuração do quadro muda algumas vezes por ano, e é lida a cada
      abertura do Fluxo do Projeto. Cinco minutos evita uma consulta por
      navegação sem deixar o quadro exibir nome velho por muito tempo — e quem
      edita invalida na hora.
    */
    staleTime: 5 * 60_000,
  })
}

/*
  QUANTAS TAREFAS ABERTAS EM CADA ETAPA — e isto existe por causa de um gesto
  perigoso: esconder uma etapa que tem trabalho dentro faz as tarefas dela
  SUMIREM do quadro sem aviso. Elas não são apagadas, mas quem as procura não as
  encontra mais, e nada na tela explica para onde foram.

  Com a contagem ao lado, Configurações consegue avisar antes. Só as ABERTAS
  contam: tarefa concluída já é desenhada na coluna "Finalizado", qualquer que
  seja a etapa dela (`tasksInColumn`, src/features/projects/flow.ts), então
  esconder a etapa não a tira da vista.
*/
export function useOpenTaskCountByPhase() {
  return useQuery({
    queryKey: [...kanbanKeys.all, 'open-task-count'] as const,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('phase')
        .neq('status', 'completed')

      if (error) throw error

      const contagem: Record<string, number> = {}
      for (const row of data ?? []) {
        if (!row.phase) continue
        contagem[row.phase] = (contagem[row.phase] ?? 0) + 1
      }
      return contagem
    },
    staleTime: 60_000,
  })
}

export function useUpdateKanbanColumn(boardKey: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...columns
    }: {
      id: string
      label?: string
      color?: string
      is_active?: boolean
      progress_percent?: number | null
    }) => {
      const { data, error } = await supabase
        .from('kanban_columns')
        .update(columns)
        .eq('id', id)
        .select('id')

      if (error) throw error
      /*
        `kanban_columns_update_settings_editor` filtra por USING: sem can_edit no
        menu `settings` nenhuma linha é alcançada e o PostgREST devolve zero
        linhas SEM erro. Sem esta conferência a tela diria "salvo" e o quadro
        continuaria como estava.
      */
      assertRowAffected(
        data,
        'A etapa não foi alterada. É preciso permissão de edição em Configurações.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.board(boardKey) })
      /* O progresso de cada projeto sai da escala que acabou de mudar
         (`project_progress` lê `kanban_columns` desde a migration 0093): sem
         isto, a barra do projeto continuaria no número antigo. */
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useRenameKanbanBoard(boardKey: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('kanban_boards')
        .update({ name: name.trim() })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O quadro não foi renomeado. É preciso permissão de edição em Configurações.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.board(boardKey) })
    },
  })
}

/*
  REORDENAR É UMA ESCRITA POR LINHA, e o motivo de não ser uma só está no banco:
  não há policy de INSERT em `kanban_columns` nesta fatia, então `upsert` — que
  o PostgREST manda como INSERT ... ON CONFLICT — seria recusado com 42501 mesmo
  para quem tem permissão de sobra. São quinze linhas, e só as que realmente
  mudaram de posição são enviadas.

  A ORDEM É REESCRITA INTEIRA (1..n) em vez de trocar duas posições: a lista
  chega já na ordem desejada, e renumerar tudo impede que empates e buracos
  deixados por edições anteriores decidam o desenho do quadro.
*/
export function useReorderKanbanColumns(boardKey: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ordered: KanbanColumnRow[]) => {
      const mudaram = ordered
        .map((column, index) => ({ id: column.id, display_order: index + 1 }))
        .filter((novo, index) => ordered[index].display_order !== novo.display_order)

      if (mudaram.length === 0) return 0

      for (const { id, display_order } of mudaram) {
        const { data, error } = await supabase
          .from('kanban_columns')
          .update({ display_order })
          .eq('id', id)
          .select('id')

        if (error) throw error
        /*
          A primeira linha recusada interrompe o resto, e a ordem fica pela
          metade. É pior deixar seguir: as demais escritas também falhariam, e a
          tela diria "reordenado" sobre um quadro que não mudou. Quem chega aqui
          sem permissão é barrado na primeira, antes de qualquer estrago.
        */
        assertRowAffected(
          data,
          'A ordem não foi salva. É preciso permissão de edição em Configurações.',
        )
      }

      return mudaram.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.board(boardKey) })
    },
  })
}

export { WriteError }
