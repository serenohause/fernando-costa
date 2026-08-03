import { formatCurrencyBRL } from '@/lib/format'

/*
  A PRÉVIA DO PARCELAMENTO, com a MESMA aritmética de
  `public.generate_contract_installments` (migration 0044).

  DIVERGÊNCIA CONSCIENTE em relação ao original, e é a mesma classe de divergência
  do `formatDateBR` de src/lib/format.ts: dado errado na tela, não layout.

  O original calcula `total_value / numParcelas` e mostra o resultado no diálogo
  (Contracts.jsx:1058 e 1091). A função do banco NÃO grava esse número: ela
  divide em CENTAVOS INTEIROS e joga o resto na PRIMEIRA parcela, para a soma
  fechar exatamente com o valor do contrato — a divisão simples erra centavos
  (R$ 128.000,00 em 12 dá 10.666,67 x 12 = 128.000,04).

  O efeito, com os mesmos R$ 128.000,00 em 12 vezes: a tela do original promete
  doze parcelas de R$ 10.666,67 e o banco grava uma de R$ 10.666,74 e onze de
  R$ 10.666,66. Sete centavos de diferença na primeira cobrança, anunciados na
  tela um segundo antes de serem gravados diferentes. Por isso a prévia é a conta
  do banco, e não a do original, e por isso ela DIZ AS DUAS COISAS quando a
  primeira parcela difere das demais — mesma frase que o seed já imprime
  ("1ª de R$ X, demais de R$ Y", supabase/seed/07-financial.mjs:218).

  O que continua igual ao original: onde a prévia aparece, o texto em volta dela
  e a ordem das linhas do diálogo.
*/

export type InstallmentSplit = {
  count: number
  firstValue: number
  otherValue: number
  /* Sem resto na divisão, todas as parcelas valem o mesmo — é o caso em que a
     frase do original ("N parcelas de R$ X") descreve o que o banco grava. */
  isUniform: boolean
}

/*
  `null` só quando não há número de parcelas para dividir. Valor total zerado
  ou nulo devolve um plano de parcelas zeradas, como o original mostra — quem
  recusa gerar nesse caso é a função (`total_value_not_positive`), e a recusa
  chega como erro da chamada, não como prévia escondida.
*/
export function splitInstallments(
  totalValue: number | null | undefined,
  count: number | null | undefined,
): InstallmentSplit | null {
  if (count == null || !Number.isInteger(count) || count < 1) return null

  /* Espelho de `round(total_value * 100)::bigint` da 0044: a conta é em centavos
     inteiros do começo ao fim, e o resto vai na primeira parcela. */
  const totalCents = Math.round((totalValue ?? 0) * 100)
  const baseCents = Math.floor(totalCents / count)
  const remainderCents = totalCents - baseCents * count

  return {
    count,
    firstValue: (baseCents + remainderCents) / 100,
    otherValue: baseCents / 100,
    isUniform: remainderCents === 0,
  }
}

/* "R$ 10.666,66" ou "1ª de R$ 10.666,74, demais de R$ 10.666,66". */
export function describeInstallmentValue(split: InstallmentSplit | null): string {
  if (!split) return formatCurrencyBRL(0)
  if (split.isUniform) return formatCurrencyBRL(split.firstValue)
  return `1ª de ${formatCurrencyBRL(split.firstValue)}, demais de ${formatCurrencyBRL(
    split.otherValue,
  )}`
}

/* A linha da caixa esmeralda. Uniforme, é a frase do original
   ("12 parcelas de R$ X"); com resto, ela abre nas duas. */
export function describeInstallmentPlan(split: InstallmentSplit | null): string {
  if (!split) return ''
  if (split.isUniform) {
    return `${split.count} parcelas de ${formatCurrencyBRL(split.firstValue)}`
  }
  return `${split.count} parcelas: ${describeInstallmentValue(split)}`
}
