import type { PayableRow } from './types'

/*
  O que a tela de Pagamentos calcula EM MEMÓRIA, sobre as linhas que o hook já
  devolveu. Mês, status, categoria e "só recorrentes" viram WHERE em
  `usePayables`; o que sobra é o que o original também resolve no navegador.

  Fica fora do componente pela regra do CLAUDE.md — lógica não mora no JSX — e
  fora de hooks.ts porque não toca no Supabase.
*/

/*
  `normalizeText` de projeto-original/src/components/utils/stringUtils.jsx,
  usada pela busca das duas telas do financeiro.

  ESTÁ COPIADA AQUI DE PROPÓSITO, e é dívida conhecida: a tela de Recebíveis
  precisa da mesma função e está sendo portada em paralelo. Um arquivo
  compartilhado escrito por dois lados ao mesmo tempo é conflito garantido —
  juntar as duas cópias em `src/lib/format.ts` é tarefa de quem orquestra,
  depois que as duas telas estiverem no lugar.
*/
export function normalizeText(value: string | null | undefined): string {
  if (!value) return ''

  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/*
  O campo "Busca" (AccountsPayable.jsx:463-478): procura no nome do projeto
  vinculado e no fornecedor, ignorando acento e caixa.

  O CORTE DE DOIS CARACTERES É DO ORIGINAL (linha 464) — com uma letra digitada
  a lista continua inteira, e só a partir da segunda o filtro passa a valer.

  `p.project_name` do original é o nome COPIADO na linha da despesa; aqui é o
  nome atual do cadastro, que chega pelo embed (migration 0041, item 1).
*/
export function filterPayablesBySearch(rows: PayableRow[], term: string): PayableRow[] {
  if (!term || term.length < 2) return rows

  const needle = normalizeText(term)

  return rows.filter(
    (row) =>
      normalizeText(row.project?.name).includes(needle) ||
      normalizeText(row.supplier_name).includes(needle),
  )
}

/*
  Os dois números que o diálogo de exclusão de recorrência mostra
  (AccountsPayable.jsx:418-435): quantas ocorrências futuras ainda não pagas
  seriam excluídas, e quantas já pagas seriam preservadas. O grupo é
  `recurrence_parent_id || id`, um nível só, como no original.

  DIVERGÊNCIA QUE NÃO FOI CORRIGIDA, E É VISÍVEL: no original a conta é feita
  sobre a lista INTEIRA de despesas, que lá desce toda para o navegador. Aqui a
  lista é de UM MÊS (o recorte virou WHERE na consulta), então os dois números
  descrevem só o mês aberto — uma recorrência de dois anos aparece como "1
  pagamento futuro". A EXCLUSÃO em si continua certa: quem apaga é
  `useDeleteRecurringPayables`, que roda no banco sobre o grupo todo. O que está
  errado é o aviso, não o efeito. Falta um hook que conte o grupo inteiro; está
  no relatório do módulo.
*/
export function recurringStats(rows: PayableRow[], account: PayableRow) {
  const parentId = account.recurrence_parent_id ?? account.id
  const group = rows.filter((row) => row.recurrence_parent_id === parentId || row.id === parentId)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const futureCount = group.filter((row) => {
    const [year, month, day] = row.due_date.split('-').map(Number)
    return new Date(year, month - 1, day) >= today && row.status !== 'paid'
  }).length

  const paidCount = group.filter((row) => row.status === 'paid').length

  return { futureCount, paidCount }
}
