import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MutateOptions, QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import type { NotificationRow } from './types'

/*
  O SINO DE NOTIFICAÇÕES — e o privilégio do banco é o que define este arquivo.

  `public.notifications` (migrations 0120 e 0121) é a tabela mais estreita do
  sistema do ponto de vista de quem está logado:

    SELECT   só as linhas em que a pessoa é `recipient_id`, no tenant do JWT.
             NÃO HÁ ATALHO DE DIRETOR — nesta tabela ele é deliberadamente
             ausente, porque ler o sino da equipe seria saber quem ainda não
             abriu o que, e isso é vigilância, não dado de escritório.
    UPDATE   só a COLUNA `read_at` (`grant update (read_at)`), e só nas próprias
             linhas.
    INSERT   não existe. Aviso nasce de gatilho (atribuição) e de varredura
             (atraso), as duas SECURITY DEFINER e fora do alcance de
             authenticated. Aviso que a tela pudesse inserir seria aviso
             falsificável: o painel mostra "Ana te atribuiu", e quem insere
             escolhe o nome que quiser.
    DELETE   não existe. Ninguém apaga o próprio histórico — "você foi avisado"
             é exatamente o que o aviso prova.

  Consequência direta para este arquivo, e é a lista inteira do que ele faz: ler
  a própria caixa, contar as não lidas e marcar como lido (uma, ou todas).
  Nenhum hook de criar, nenhum de apagar — e nenhuma tela deve oferecer os dois
  botões, porque o banco os recusaria.
*/

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
}

/*
  O painel É o histórico inteiro, porque não existe tela "Ver todas" — decisão
  do usuário ao aprovar o protótipo, e o rodapé que levava a ela foi retirado.
  Então o teto é mais alto do que o de uma lista paginada e mais baixo do que
  "tudo": aviso lido nunca sai da tabela, e a caixa de quem usa o sistema há
  dois anos cresce para sempre.

  500 é a mesma folga da fila de leads, e pelo mesmo critério: é o número que
  ninguém alcança lendo o painel de ponta a ponta. Quando passar daqui, o teto é
  o aviso de que o histórico precisa de tela própria — e aí o rodapé volta.
*/
const LIST_LIMIT = 500

const NOTIFICATION_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    42501 AQUI TEM UMA CAUSA SÓ, e ela não é a pessoa: é o `grant update
    (read_at)` da migration 0120 recusando uma escrita que tocou outra coluna.

    A frase diz isso em vez de "você não tem permissão" (o texto padrão para
    este código em src/lib/db-errors.ts), porque a pessoa TEM permissão sobre o
    próprio aviso — quem errou foi o código. A outra recusa possível, a da
    policy não alcançar a linha, não chega como erro: o UPDATE casa zero linhas
    e quem acusa é `assertRowAffected` logo abaixo.
  */
  '42501':
    'O sistema tentou mudar algo além do estado de leitura deste aviso. Recarregue a página e tente de novo.',
}

export function describeNotificationError(error: unknown): string {
  return describeError(error, NOTIFICATION_ERROR_MESSAGES)
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  O CONTADOR DO BADGE — consulta separada da lista, de propósito.

  O painel fica fechado a maior parte do tempo, e o número no canto do sino
  precisa existir mesmo assim. Derivar o contador da lista obrigaria a baixar as
  500 linhas em toda troca de tela para pintar um número; aqui `head: true`
  manda a contagem no cabeçalho e nenhuma linha desce.

  É também a consulta que o índice parcial
  `notifications_unread_idx ... where read_at is null` (migration 0120) existe
  para atender: ele indexa só o que entra na conta, e passado o uso a maior
  parte da tabela está lida.

  SEM FILTRO DE PESSOA NO CÓDIGO, e não é esquecimento: quem recorta é a policy
  `notifications_select_own_recipient`, que compara `recipient_id` com o claim
  do JWT. Repetir o filtro aqui seria reimplementar a autorização na tela, que é
  o que o CLAUDE.md proíbe — e um filtro escrito à mão que divergisse da policy
  mostraria um número que a lista não confirma.

  SEM `refetchInterval`, E ISSO FOI DECIDIDO, não esquecido.

  Hoje o sino muda no carregamento da página e depois das ações da própria
  pessoa. Quem receber uma tarefa com a aba aberta só vê no próximo
  carregamento, o que em uso normal acontece várias vezes ao dia.

  O usuário escolheu assim, entre três caminhos: consultar o contador a cada
  cinco minutos, deixar como está, ou ligar o Realtime da Supabase. Pesou que o
  projeto não tem UM polling e não usa Realtime em lugar nenhum, e que o sino
  fica montado no layout, ou seja a consulta valeria para toda pessoa logada o
  dia inteiro.

  Quem for acrescentar isso depois: o gesto menor é `refetchInterval` AQUI, no
  contador, e não na lista. A lista só é buscada com o painel aberto.
*/
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)

      if (error) throw error
      return count ?? 0
    },
  })
}

/*
  A caixa inteira, lidas e não lidas juntas, do aviso mais novo para o mais
  velho.

  LIDAS FICAM NA LISTA — decisão do usuário sobre o protótipo. Elas não somem
  nem vão para outra aba: mudam de peso e de cor, o que é como o app já separa
  texto principal de texto de apoio. A ordem é a do índice
  `(tenant_id, recipient_id, created_at desc)`, e é ela que o agrupamento por
  dia pressupõe (ver agrupar.ts).

  `enabled` existe para o painel: a lista só é buscada quando alguém abre o
  sino. Fechado, o que roda é o contador acima — que é uma contagem, não 500
  linhas.
*/
export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        /*
          O DESEMPATE POR `id` NÃO É ENFEITE — sem ele a lista se reorganiza
          sozinha, e isso foi medido em dev.

          A varredura de atraso grava o lote inteiro num único INSERT, então
          dezenas de avisos saem com o MESMO `created_at` (um só `now()`,
          migration 0120). Ordenar só por ele deixa a ordem dentro do lote a
          cargo do plano de execução, que muda a cada releitura: marcar um aviso
          como lido invalida a consulta, o refetch volta com os mesmos avisos em
          outra ordem, e a linha que a pessoa acabou de ler pula de lugar
          debaixo do dedo.

          É o oposto do que o protótipo aprovado promete ("a linha não muda de
          altura nem de fundo, então marcar como lida não reorganiza a lista").
          `id` é único, então o par (created_at, id) é uma ordem total: o mesmo
          conjunto de avisos sai sempre na mesma sequência.
        */
        .order('id', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return data ?? []
    },
    enabled,
  })
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

/*
  O PALPITE OTIMISTA DAS DUAS MARCAÇÕES, num lugar só.

  Gêmeo do `optimisticTaskWrite` de src/features/projects/hooks.ts, e existe
  pelo mesmo motivo: marcar como lido é um gesto de um clique, e esperar a ida e
  volta do banco para mudar o peso do texto faz a lista parecer travada. A
  diferença é que aqui o palpite precisa tocar DUAS caixas de cache — a lista e
  o contador —, e é essa a razão de a função morar aqui em vez de ser copiada
  nas duas mutations.

  O QUE ELE GARANTE: se o banco recusar, as duas voltam juntas. Palpite que
  volta pela metade (lista velha com contador novo) é pior do que não ter
  palpite, porque mostra um estado que nunca existiu.

  Cancelar o que está em voo é o mesmo cuidado do original: um refetch já
  disparado pousaria DEPOIS e reescreveria o cache com o estado de antes. Sem
  `await`, porque esperar aqui devolveria o atraso que o palpite elimina.
*/
function optimisticReadWrite<TData, TVariables>(
  queryClient: QueryClient,
  mutation: {
    mutate: (variables: TVariables, options?: MutateOptions<TData, Error, TVariables>) => void
  },
  patch: (avisos: NotificationRow[], variables: TVariables) => NotificationRow[],
) {
  return (variables: TVariables, options?: MutateOptions<TData, Error, TVariables>) => {
    void queryClient.cancelQueries({ queryKey: notificationKeys.all })

    const listaAnterior = queryClient.getQueryData<NotificationRow[]>(notificationKeys.list())
    const contadorAnterior = queryClient.getQueryData<number>(notificationKeys.unread())

    /*
      O CONTADOR É RECONTADO A PARTIR DA LISTA, e não decrementado de um em um.

      Decrementar daria o mesmo resultado no caso simples e o resultado errado
      no caso real: dois cliques rápidos no mesmo visto descontariam duas vezes
      a mesma linha, e o badge mostraria menos do que existe. Recontar o palpite
      da lista deixa o número e as linhas dizerem sempre a mesma coisa.

      Só vale quando a lista está em cache — ou seja, com o painel aberto, que é
      o único lugar de onde esses gestos partem.
    */
    if (listaAnterior) {
      const lista = patch(listaAnterior, variables)
      queryClient.setQueryData<NotificationRow[]>(notificationKeys.list(), lista)
      queryClient.setQueryData<number>(
        notificationKeys.unread(),
        lista.filter((aviso) => aviso.read_at === null).length,
      )
    }

    mutation.mutate(variables, {
      ...options,
      onError: (error, failed, onMutateResult, context) => {
        if (listaAnterior) queryClient.setQueryData(notificationKeys.list(), listaAnterior)
        if (contadorAnterior !== undefined) {
          queryClient.setQueryData(notificationKeys.unread(), contadorAnterior)
        }
        options?.onError?.(error, failed, onMutateResult, context)
      },
    })
  }
}

/*
  Marcar UM aviso como lido — o visto na própria linha.

  `read_at` é a única coluna que o privilégio permite escrever, e a hora é a de
  agora: não há campo na tela para ela, e não deveria haver.

  `.select('id')` no fim e `assertRowAffected` depois: UPDATE que a policy não
  alcança NÃO levanta erro, só não casa linha nenhuma. Sem esta conferência o
  palpite otimista ficaria na tela como se tivesse dado certo, e o aviso voltaria
  a aparecer não lido no próximo carregamento, sem nada explicando o porquê.

  `onSettled` e não `onSuccess`: o cache está carregando um palpite, e a tela
  tem que terminar no que o banco tem nos DOIS desfechos.
*/
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(data, 'Este aviso não pôde ser marcado como lido.')
      return id
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })

  return optimisticReadWrite(queryClient, mutation, (avisos, { id }: { id: string }) =>
    avisos.map((aviso) =>
      aviso.id === id && aviso.read_at === null
        ? { ...aviso, read_at: new Date().toISOString() }
        : aviso,
    ),
  )
}

/*
  Marcar TODAS como lidas — o botão do cabeçalho do painel.

  UM ÚNICO UPDATE, e não um por linha: `.is('read_at', null)` é o filtro, e a
  policy restringe o alcance às linhas da própria pessoa. Um laço de N
  requisições faria N viagens para um gesto só e deixaria a caixa pela metade se
  a terceira falhasse.

  O FILTRO DE "NÃO LIDA" NÃO É OTIMIZAÇÃO: sem ele, o UPDATE reescreveria
  `read_at` das já lidas, trocando a hora em que a pessoa realmente leu cada uma
  pela hora do clique no botão. O dado é pequeno, mas é o único registro de
  quando o aviso foi visto.

  Sem `assertRowAffected`: zero linhas afetadas é desfecho legítimo aqui — duas
  abas abertas, e a outra marcou primeiro. O botão só existe quando há não
  lidas, e o `onSettled` traz o estado real do banco de qualquer jeito.
*/
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)

      if (error) throw error
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })

  return optimisticReadWrite(queryClient, mutation, (avisos) =>
    avisos.map((aviso) =>
      aviso.read_at === null ? { ...aviso, read_at: new Date().toISOString() } : aviso,
    ),
  )
}
