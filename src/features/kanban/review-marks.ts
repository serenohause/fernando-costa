/*
  OS BOTÕES DE SINALIZAÇÃO DE REVISÃO DE UMA ETAPA, sem banco e sem tela
  (migration 0131).

  Uma linha por botão no banco, uma lista ordenada aqui. É a mesma forma que
  `replace_kanban_column_review_marks` recebe, então a tela lê e grava sem
  tradução no meio — mesmo desenho de `objectives.ts`.

  O QUE ESTES BOTÕES SÃO: o resultado de uma revisão, marcado no objetivo de
  AMBIENTE do cartão (sala, quarto, cozinha). Aprovado, reprovado, alterado, o
  que o escritório escrever. Só aparecem na etapa que mostra os ambientes.

  O QUE ELES NÃO SÃO: conclusão. Marcar não conclui o objetivo, e isso foi
  decidido com o usuário — `is_required` + `is_completed` continuam sendo a trava
  de avanço de etapa, então ambiente obrigatório marcado como "Reprovado" segue
  prendendo o cartão.
*/

export type ReviewMarkTemplate = { label: string; color: string }

/*
  QUANTOS BOTÕES CABEM. Oito é teto de tela, não regra de negócio: eles ficam
  lado a lado na linha de um objetivo, e a nona opção empurraria a lista para
  fora do cartão. O banco não cobra isto (ver o cabeçalho da 0131), e quem
  gravar por fora passa.
*/
export const MAX_REVIEW_MARKS = 8

/** O limite de `kanban_column_review_marks_label_length_check`. */
export const MAX_REVIEW_MARK_LABEL = 40

type ReviewMarkRow = {
  column_id: string
  label: string
  color: string
  display_order: number
}

/* Os botões de cada etapa, na ordem configurada. */
export function groupReviewMarksByColumn(
  rows: ReviewMarkRow[],
): Map<string, ReviewMarkTemplate[]> {
  const porColuna = new Map<string, ReviewMarkTemplate[]>()
  for (const row of [...rows].sort((a, b) => a.display_order - b.display_order)) {
    const atual = porColuna.get(row.column_id) ?? []
    atual.push({ label: row.label, color: row.color })
    porColuna.set(row.column_id, atual)
  }
  return porColuna
}

/* Sem espaço sobrando, e sem botão vazio na lista. */
export function normalizeReviewMarks(marks: ReviewMarkTemplate[]): ReviewMarkTemplate[] {
  return marks
    .map((mark) => ({ label: mark.label.trim(), color: mark.color }))
    .filter((mark) => mark.label !== '')
}

/*
  `null` quando a lista serve; a frase da recusa quando não.

  A COMPARAÇÃO DE REPETIDO IGNORA MAIÚSCULA, e o banco não: lá o unique é
  exato, então "Aprovado" e "aprovado" entrariam os dois. Entrariam como dois
  botões que ninguém distingue no cartão, e a marca gravada não diria qual foi
  apertado. Recusar aqui é a diferença entre um aviso e uma configuração que não
  tem conserto depois de usada.
*/
export function reviewMarksError(marks: ReviewMarkTemplate[]): string | null {
  const normalizados = normalizeReviewMarks(marks)

  if (marks.length !== normalizados.length) {
    return 'Dê um nome a cada botão, ou remova o botão sem nome.'
  }

  if (normalizados.length > MAX_REVIEW_MARKS) {
    return `No máximo ${MAX_REVIEW_MARKS} botões por etapa.`
  }

  const comprido = normalizados.find((mark) => mark.label.length > MAX_REVIEW_MARK_LABEL)
  if (comprido) {
    return `“${comprido.label}” é longo demais. O limite é ${MAX_REVIEW_MARK_LABEL} caracteres.`
  }

  const vistos = new Set<string>()
  for (const mark of normalizados) {
    const chave = mark.label.toLocaleLowerCase('pt-BR')
    if (vistos.has(chave)) {
      return `Há dois botões chamados “${mark.label}”. Use nomes diferentes.`
    }
    vistos.add(chave)
  }

  return null
}

/* Mudou ou não mudou: é o que decide se a gravação dos botões vai ao banco. */
export function sameReviewMarks(a: ReviewMarkTemplate[], b: ReviewMarkTemplate[]): boolean {
  return JSON.stringify(normalizeReviewMarks(a)) === JSON.stringify(normalizeReviewMarks(b))
}
