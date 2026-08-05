/*
  Iniciais do escritório para o monograma da tela de entrada — o "FC" que antes
  estava escrito à mão em Home.jsx.

  A REGRA: primeira letra das duas primeiras palavras significativas do nome, em
  caixa alta e sem acento. Significativa exclui conectivo (de, da, do, das, dos,
  e, di, du, del, la, las, los, y), que não identifica ninguém e roubaria a vaga
  da palavra seguinte: "Escritório de Arquitetura" rende EA, não ED.

  DUAS LETRAS É TETO, NÃO META. O quadrado tem lado fixo (w-32 h-32) e a letra é
  text-5xl: duas cabem com folga, três já encostam nas bordas e um nome de cinco
  palavras estouraria o quadrado. Nome de uma palavra só rende uma letra — é o
  que o nome tem, e completar com a segunda letra do meio da palavra daria
  resultado que ninguém consegue prever de cabeça.

  ACENTO SAI POR NORMALIZAÇÃO, e não é preciosismo tipográfico: o mesmo nome
  pode chegar do banco com "Á" pré-composto (U+00C1) ou decomposto ("A" + acento
  combinante). Sem normalizar, a primeira posição da string é a letra num caso e
  a letra sem o acento no outro — mesmo nome, monograma diferente. NFD + remoção
  das marcas resolve os dois para "A".

  Nome que só tem conectivo ou pontuação cai no fallback (usa as palavras como
  vieram); nome vazio devolve string vazia, e quem chama não desenha nada — não
  existe inicial padrão para inventar.
*/

const MAX_INITIALS = 2

const CONNECTORS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'di',
  'du',
  'del',
  'la',
  'las',
  'los',
  'y',
])

export function tenantInitials(name: string | null | undefined): string {
  if (!name) return ''

  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

  const meaningful = words.filter((word) => !CONNECTORS.has(word.toLowerCase()))
  const chosen = (meaningful.length > 0 ? meaningful : words).slice(0, MAX_INITIALS)

  return chosen.map((word) => [...word][0]!.toUpperCase()).join('')
}
