import { format, parseISO } from 'date-fns'

/*
  DIVERGÊNCIA CONSCIENTE, registrada no relatório do módulo 2.

  O original formata data de nascimento com
  `new Date(client.birth_date).toLocaleDateString('pt-BR')`
  (ClientDetail.jsx:141). `birth_date` é coluna `date`, e chega como
  "1985-04-12": `new Date` interpreta string só-data como MEIA-NOITE EM UTC, e
  `toLocaleDateString` a converte para o fuso do navegador. Em qualquer fuso
  negativo — Goiânia inclusive — a tela mostra o DIA ANTERIOR ao gravado.

  `parseISO` do date-fns lê string só-data como meia-noite LOCAL, então a data
  exibida é a gravada. O formato de saída é o mesmo (dd/MM/yyyy), o layout é o
  mesmo; o que muda é o valor deixar de estar um dia atrás.

  Não é ajuste de layout, é dado errado na tela — por isso foi corrigido em vez
  de reproduzido, e sinalizado ao usuário.
*/
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return format(parseISO(value), 'dd/MM/yyyy')
  } catch {
    return value
  }
}

/*
  `formatCurrency` do original, que aparece copiado em quatro arquivos do
  pipeline (Negociacoes.jsx, NegociacaoKanban.jsx, PipelineHeader.jsx,
  NegociacaoDashboard.jsx) em duas versões: com centavos nas tabelas e sem
  centavos nos cartões de total. As duas ficam, porque as duas estão na tela do
  original — o que não fica é a quinta cópia da mesma função.

  Nasceu em src/features/pipeline/format.ts, no módulo 3. Subiu para cá quando o
  módulo 4 precisou dela: Contracts.jsx formata valor de contrato com
  `toLocaleString('pt-BR', { minimumFractionDigits: 2 })`, que é a mesma saída
  desta função. Formatador de moeda não pertence a um domínio — pertence à
  camada que todos os domínios compartilham, ao lado de formatDateBR.

  `value || 0` do original vira `?? 0`: valor estimado nulo e valor zero são a
  mesma saída aqui ("R$ 0,00"), mas `||` também engoliria um zero legítimo em
  qualquer outro uso.
*/
export function formatCurrencyBRL(
  value: number | null | undefined,
  { withCents = true }: { withCents?: boolean } = {},
): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    ...(withCents ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  }).format(value ?? 0)
}

/*
  `normalizeText` de projeto-original/src/components/utils/stringUtils.js —
  a busca por texto das duas telas do financeiro.

  Mora aqui, e não em cada tela, porque as duas peneiram a mesma coisa: acento
  fora, caixa baixa, ponta aparada. Duas cópias divergindo significaria a busca
  de Recebíveis achar um nome que a de Pagamentos não acha, sem nada na tela
  explicando a diferença.

  Nasceu duplicada de propósito — as duas telas foram portadas ao mesmo tempo, e
  arquivo compartilhado escrito por dois lados de uma vez é conflito garantido.
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
