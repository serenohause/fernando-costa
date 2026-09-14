/*
  As iniciais de uma pessoa, para o avatar redondo do cartão e do detalhe da
  tarefa. Primeira letra do primeiro e do último nome: "Camila Nogueira" → "CN".

  Duas letras bastam para distinguir quem é quem numa equipe do tamanho de um
  escritório, e o nome inteiro sempre acompanha no `title` ou ao lado.
*/
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((parte, i, partes) => (i === 0 || i === partes.length - 1 ? parte[0] : ''))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
