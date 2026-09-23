// A reordenação por arrastar das listas de Configurações.
//
// COMO RODAR
//   npm run test:reorder
//
// POR QUE EXISTE
//   Tipos de serviço, etapas do quadro e status operacional passaram de setas
//   (trocar com o vizinho) para arrastar e soltar em qualquer posição. As três
//   listas usam as mesmas duas funções: onde o item cai, e quais linhas precisam
//   ser regravadas. Errar a segunda regrava a lista inteira a cada gesto — ou,
//   pior, deixa de gravar uma linha e a ordem volta sozinha ao recarregar.

import { changedOrder, moveItem, withRenumberedOrder } from '../src/lib/reorder.ts'

let passed = 0
let failed = 0

function eq(name, esperado, observado) {
  const a = JSON.stringify(esperado)
  const b = JSON.stringify(observado)
  if (a === b) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}\n        esperado=${a}\n        observado=${b}`)
  }
}

const lista = (...ordens) => ordens.map((ordem, i) => ({ id: String.fromCharCode(97 + i), display_order: ordem }))

console.log('\nReordenação por arrastar\n')

eq('1.1  desce um item várias casas', ['b', 'c', 'a', 'd'], moveItem(['a', 'b', 'c', 'd'], 0, 2))
eq('1.2  sobe um item várias casas', ['d', 'a', 'b', 'c'], moveItem(['a', 'b', 'c', 'd'], 3, 0))
eq('1.3  soltar no mesmo lugar não muda nada', ['a', 'b', 'c'], moveItem(['a', 'b', 'c'], 1, 1))
eq('1.4  destino fora da lista não muda nada', ['a', 'b', 'c'], moveItem(['a', 'b', 'c'], 0, 9))

const original = ['a', 'b', 'c']
moveItem(original, 0, 2)
eq('1.5  não altera a lista recebida', ['a', 'b', 'c'], original)

/* O caso que importa para o banco: só o que mudou vai para a rede. */
const quatro = lista(1, 2, 3, 4)
eq(
  '2.1  arrastar o último para penúltimo regrava só dois',
  [{ id: 'c', display_order: 4 }, { id: 'd', display_order: 3 }],
  changedOrder(moveItem(quatro, 3, 2)).sort((x, y) => x.id.localeCompare(y.id)),
)

eq('2.2  sem mudança, nada a gravar', [], changedOrder(lista(1, 2, 3)))

/* Ordem antiga com buraco e empate (1, 1, 7): a primeira arrumação acerta tudo. */
eq(
  '2.3  buracos e empates antigos são corrigidos',
  [{ id: 'b', display_order: 2 }, { id: 'c', display_order: 3 }],
  changedOrder(lista(1, 1, 7)),
)

eq('2.4  ordem nula é tratada como mudança', [{ id: 'a', display_order: 1 }], changedOrder(lista(null)))

eq(
  '3.1  palpite otimista renumera de 1 a n na ordem nova',
  [1, 2, 3],
  withRenumberedOrder(moveItem(lista(1, 2, 3), 2, 0)).map((item) => item.display_order),
)

eq(
  '3.2  e mantém quem é quem',
  ['c', 'a', 'b'],
  withRenumberedOrder(moveItem(lista(1, 2, 3), 2, 0)).map((item) => item.id),
)

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
