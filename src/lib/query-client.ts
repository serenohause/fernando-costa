import { QueryClient, notifyManager } from '@tanstack/react-query'

/*
  AS ATUALIZAÇÕES DE CACHE PASSAM A CHEGAR NA TELA ANTES DA PRÓXIMA PINTURA.

  Por padrão o React Query enfileira as notificações com `setTimeout(..., 0)`
  (`notifyManager.defaultScheduler`). São poucos milissegundos, invisíveis na
  esmagadora maioria das telas — mas `setTimeout` é MACROTAREFA: o navegador
  tem permissão para pintar um quadro entre a escrita no cache e o re-render
  que ela provoca.

  Esse quadro é um bug visível, e o escritório o reportou: ao soltar um cartão
  no quadro do Pipeline, ele piscava na coluna de origem antes de aparecer no
  destino. O palpite otimista já era escrito no cache dentro do próprio gesto
  (ver `useMoveNegotiationStage`), mas a tela só era redesenhada uma tarefa
  depois — tarde demais, com um quadro já pintado no meio mostrando o estado
  velho. Nenhuma correção do lado do arrastar alcançava isso, porque a espera
  não estava lá.

  `queueMicrotask` é MICROTAREFA: drena no fim da tarefa atual, antes de
  qualquer pintura. O primeiro quadro desenhado depois do gesto já mostra o
  estado novo, e a animação de queda parte do lugar certo.

  É a mesma escolha de agendador que o React Query usou por padrão durante anos;
  a troca para `setTimeout` veio para deixar relógios falsos de teste
  funcionarem, o que não é o caso aqui. O efeito é adiantar notificações, nunca
  atrasá-las, e o agrupamento em lote continua o mesmo.
*/
notifyManager.setScheduler(queueMicrotask)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
