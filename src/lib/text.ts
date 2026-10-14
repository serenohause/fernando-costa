/*
  TEXTO PARA COMPARAR, não para exibir.

  O escritório tem "Junior Sintonia" e "Júnior Sintonia" cadastrados — duas
  empresas, dois CNPJ. Quem procurava por um nunca via o outro, porque a busca
  compara o que está escrito, e acento é diferença de escrita.

  Aqui o termo digitado perde acento e maiúsculas; do lado do banco, as colunas
  `clients.search_plain` e `client_people.name_plain` guardam o mesmo tratamento
  (migration 0105). Os dois lados precisam usar a MESMA regra, senão a busca
  passa a não achar o que existe.
*/
export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
