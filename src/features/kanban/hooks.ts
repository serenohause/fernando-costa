import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { phaseKeyFrom, phaseLabelIn } from './board'
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
  kanban_columns_tenant_id_key_key:
    'Já existe uma etapa com esse nome neste escritório. Se ela foi ocultada, mostre-a em vez de criar outra.',
  kanban_columns_board_id_key_key:
    'Já existe uma etapa com esse nome neste quadro. Se ela foi ocultada, mostre-a em vez de criar outra.',
  tasks_phase_fkey:
    'Esta etapa ainda tem tarefas dentro. Escolha para onde movê-las antes de excluir.',
  '23503': 'Esta etapa ainda tem tarefas dentro. Escolha para onde movê-las antes de excluir.',
  etapa_estrutural_nao_pode_ser_excluida:
    '“Não iniciado” e “Finalizado” não podem ser excluídas: são as etapas que o sistema usa para projeto sem tarefas e para projeto concluído. Oculte em vez de excluir.',
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
  precisa mostrar o que está oculto para poder reexibir, e o Fluxo do Projeto
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
  perigoso: ocultar uma etapa que tem trabalho dentro faz as tarefas dela
  SUMIREM do quadro sem aviso. Elas não são apagadas, mas quem as procura não as
  encontra mais, e nada na tela explica para onde foram.

  Com a contagem ao lado, Configurações consegue avisar antes. Só as ABERTAS
  contam: tarefa concluída já é desenhada na coluna "Finalizado", qualquer que
  seja a etapa dela (`tasksInColumn`, src/features/projects/flow.ts), então
  ocultar a etapa não a tira da vista.
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

/*
  O ROTULO DE UMA ETAPA, para quem só precisa exibir.

  Existe porque desde a migration 0094 a etapa pode ter um nome que o escritório
  inventou, e `labelOf(PROJECT_PHASE, ...)` só conhece as quinze embutidas — ele
  cairia no `?? value` e mostraria a chave crua ("aprovacao_cliente") no painel,
  no diário e na lista de atividades.

  Devolve uma FUNÇÃO, e não um mapa, para o degrau de fallback ficar num lugar
  só: quadro, depois rótulo embutido, depois a própria chave (ver `phaseLabelIn`).
  Enquanto a consulta não chega, o fallback embutido já responde certo para as
  quinze de sempre — a tela não pisca com traço no lugar do nome.
*/
export function usePhaseLabel() {
  const { data } = useKanbanBoard('project_flow')
  const columns = data?.columns ?? []
  return (phase: string | null | undefined) => phaseLabelIn(columns, phase)
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
      allows_in_review?: boolean
      allows_awaiting_client?: boolean
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

/*
  CRIAR ETAPA. Existe a partir da migration 0094 — antes dela, uma etapa nova não
  teria como receber tarefa nenhuma, porque `tasks.phase` era o enum.

  A CHAVE SAI DO NOME (`phaseKeyFrom`), como em `serviceKeyFrom` (0084): pedir
  nome E chave ao escritório seria pedir que ele entendesse a diferença entre o
  que aparece na tela e o que fica gravado na tarefa. Colisão não é resolvida
  aqui — `unique (tenant_id, key)` recusa e a mensagem diz o que fazer; inventar
  `layout_2` criaria em silêncio uma segunda etapa com o mesmo nome visível.

  ENTRA NO FIM DA LISTA, e não no meio: ordem é decisão de quem configura, e o
  lugar previsível para um item novo é o fim. Reordenar é um gesto à parte.
*/
export function useCreateKanbanColumn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      boardId: string
      tenantId: string
      label: string
      color: string
      progressPercent: number | null
      allowsInReview: boolean
      allowsAwaitingClient: boolean
      lastOrder: number
    }) => {
      const label = input.label.trim()
      const key = phaseKeyFrom(label)
      if (!key) {
        throw new WriteError('O nome da etapa precisa ter ao menos uma letra ou número.')
      }

      const { data, error } = await supabase
        .from('kanban_columns')
        .insert({
          tenant_id: input.tenantId,
          board_id: input.boardId,
          key,
          label,
          color: input.color,
          display_order: input.lastOrder + 1,
          progress_percent: input.progressPercent,
          is_active: true,
          allows_in_review: input.allowsInReview,
          allows_awaiting_client: input.allowsAwaitingClient,
        })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

/*
  EXCLUIR ETAPA, movendo antes o que está dentro dela.

  Duas coisas do banco governam este gesto, e nenhuma delas está aqui:
  `tasks_phase_fkey` é `on delete restrict` — o banco RECUSA apagar etapa com
  tarefa dentro —, e um gatilho protege "Não iniciado" e "Finalizado", que são
  os dois valores que o sistema grava sozinho em `projects.current_phase`.

  Então a ordem importa: mover primeiro, apagar depois. Se o UPDATE das tarefas
  falhar, o DELETE nem é tentado — e a etapa continua lá, com o trabalho dentro,
  que é o estado seguro.

  QUEM MOVE PRECISA DE OUTRA PERMISSÃO: escrever em `tasks` é
  `can_edit_menu('project_flow')`, e configurar o quadro é
  `can_edit_menu('settings')`. Não são o mesmo recorte. Sem a primeira, o UPDATE
  alcança zero linhas SEM ERRO e o DELETE cairia na chave estrangeira com uma
  mensagem que não explica nada — por isso a conferência explícita abaixo.
*/
export function useDeleteKanbanColumn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      column,
      moveToKey,
      openTaskCount,
    }: {
      column: KanbanColumnRow
      moveToKey: string | null
      openTaskCount: number
    }) => {
      if (openTaskCount > 0) {
        if (!moveToKey) {
          throw new WriteError('Escolha para qual etapa as tarefas devem ir.')
        }

        const { data: movidas, error: moveError } = await supabase
          .from('tasks')
          .update({ phase: moveToKey })
          .eq('phase', column.key)
          .select('id')

        if (moveError) throw moveError
        assertRowAffected(
          movidas,
          'As tarefas não foram movidas, então a etapa não foi excluída. Mover tarefa exige permissão de edição em Fluxo do Projeto.',
        )
      }

      const { data, error } = await supabase
        .from('kanban_columns')
        .delete()
        .eq('id', column.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A etapa não foi excluída. É preciso permissão de edição em Configurações.',
      )
      return column.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.all })
      /* As tarefas mudaram de etapa e o progresso sai da escala: as duas telas
         precisam relê-las sem recarregar a página. */
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
