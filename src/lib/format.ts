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
