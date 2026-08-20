// A tela tem que ser avisada ANTES da próxima pintura, não uma tarefa depois.
//
// COMO RODAR
//   npm run test:notify
//
// POR QUE ESTE ARQUIVO EXISTE
//   Guarda uma única linha de `src/lib/query-client.ts`:
//
//     notifyManager.setScheduler(queueMicrotask)
//
//   Sem ela, o React Query enfileira as notificações de cache com
//   `setTimeout(..., 0)` — macrotarefa — e o navegador pode pintar um quadro
//   entre a escrita no cache e o re-render que ela provoca. Esse quadro é o
//   defeito que o escritório reportou: o cartão do quadro do Pipeline piscando
//   na coluna de origem antes de aparecer no destino.
//
//   Apagar a linha não quebra nada que se note em teste ou em build. A tela
//   volta a piscar, e só. É exatamente o tipo de regressão que precisa de uma
//   asserção, porque nada mais a acusa.
//
// COMO A ORDEM É MEDIDA
//   Um `setTimeout(..., 0)` é agendado ANTES da escrita no cache. Microtarefa
//   drena no fim da tarefa atual, então a notificação tem que chegar primeiro
//   mesmo tendo sido agendada depois. Com o agendador padrão a notificação vira
//   um segundo `setTimeout`, entra atrás na fila, e a ordem se inverte — é essa
//   inversão que o teste acusa.
//
//   O OUVINTE PRECISA SER O MESMO QUE O REACT USA, e a primeira versão deste
//   arquivo errou justamente nisso. Assinar o QueryCache direto passa por
//   `notifyManager.batch`, que chama os ouvintes na hora, sem agendador nenhum —
//   o teste passava com a linha apagada, que é o mesmo que não existir. Quem o
//   agendador governa é o ouvinte do OBSERVER embrulhado em
//   `notifyManager.batchCalls`, que é literalmente como `useBaseQuery` assina o
//   re-render (useBaseQuery.js:60). É esse caminho que se mede aqui.

import { QueryObserver, notifyManager } from '@tanstack/react-query'
import { queryClient } from '../src/lib/query-client.ts'

let passed = 0
let failed = 0

function check(name, ok, detail) {
  if (ok) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name} — ${detail}`)
  }
}

console.log('\nAgendamento das notificações do cache\n')

const key = ['probe-notify']
queryClient.setQueryData(key, 0)

/* `enabled: false` porque não há `queryFn`: o que se mede é a notificação da
   escrita no cache, não uma busca. */
const observer = new QueryObserver(queryClient, { queryKey: key, enabled: false })

const order = []
const unsubscribe = observer.subscribe(
  notifyManager.batchCalls(() => order.push('notificacao')),
)

setTimeout(() => order.push('macrotarefa'), 0)
queryClient.setQueryData(key, 1)

await new Promise((resolve) => setTimeout(resolve, 50))
unsubscribe()

check(
  '1.1  a notificação do cache chega antes da próxima macrotarefa',
  order[0] === 'notificacao',
  `ordem observada: ${order.join(' → ') || '(nenhuma)'}. ` +
    'Isso significa que notifyManager.setScheduler(queueMicrotask) saiu de src/lib/query-client.ts.',
)

check('1.2  CONTROLE: a notificação de fato aconteceu', order.includes('notificacao'), 'nenhuma notificação chegou')

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
