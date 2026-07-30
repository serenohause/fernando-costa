/*
  `formatCurrency` do original, que aparece copiado em quatro arquivos do
  pipeline (Negociacoes.jsx, NegociacaoKanban.jsx, PipelineHeader.jsx,
  NegociacaoDashboard.jsx) em duas versões: com centavos nas tabelas e sem
  centavos nos cartões de total. As duas ficam, porque as duas estão na tela do
  original — o que não fica é a quarta cópia da mesma função.

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
