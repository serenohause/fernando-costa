/*
  A MATEMÁTICA DE REORDENAR UMA LISTA, sem banco e sem tela.

  Mora aqui, e não dentro de cada hook, porque três listas de Configurações
  reordenam do mesmo jeito (tipos de serviço, etapas do quadro, status
  operacional) e as três precisam concordar em duas coisas: onde o item cai ao
  ser solto, e quais linhas precisam ser regravadas.
*/

/* Tira o item de `from` e o põe em `to`, devolvendo uma lista nova. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copia = [...list]
  if (from < 0 || from >= copia.length || to < 0 || to >= copia.length || from === to) {
    return copia
  }
  const [movido] = copia.splice(from, 1)
  copia.splice(to, 0, movido)
  return copia
}

/*
  A ORDEM É REESCRITA INTEIRA (1..n) e só as linhas que MUDARAM são gravadas.

  Renumerar tudo, e não só trocar duas posições, é o que permite arrastar um item
  várias casas de uma vez — e também apaga empates e buracos deixados por edições
  antigas (duas linhas com a mesma ordem, ou 1, 2, 7). Gravar só o que mudou é o
  que mantém isso barato: arrastar o último para penúltimo regrava duas linhas,
  não a lista inteira.
*/
export function changedOrder<T extends { id: string; display_order: number | null }>(
  ordered: readonly T[],
): { id: string; display_order: number }[] {
  return ordered
    .map((item, index) => ({ id: item.id, display_order: index + 1, antes: item.display_order }))
    .filter((item) => item.antes !== item.display_order)
    .map(({ id, display_order }) => ({ id, display_order }))
}

/* A lista como fica depois de gravada — o palpite otimista que a tela mostra. */
export function withRenumberedOrder<T extends { display_order: number | null }>(
  ordered: readonly T[],
): T[] {
  return ordered.map((item, index) => ({ ...item, display_order: index + 1 }))
}
