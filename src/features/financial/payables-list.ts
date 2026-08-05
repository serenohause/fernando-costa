import { normalizeText } from '@/lib/format'
import type { PayableRow } from './types'

/*
  O que a tela de Pagamentos calcula EM MEMÓRIA, sobre as linhas que o hook já
  devolveu. Mês, status, categoria e "só recorrentes" viram WHERE em
  `usePayables`; o que sobra é o que o original também resolve no navegador.

  Fica fora do componente pela regra do CLAUDE.md — lógica não mora no JSX — e
  fora de hooks.ts porque não toca no Supabase.
*/


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
  A CONTAGEM DO GRUPO DE UMA RECORRÊNCIA SAIU DAQUI, e o motivo fica registrado.

  Ela existia como cópia do original (AccountsPayable.jsx:418-435), que conta em
  memória sobre a lista INTEIRA de despesas — lá a carteira toda desce para o
  navegador. Aqui a lista é de UM MÊS (o recorte virou WHERE na consulta), então
  a mesma conta descrevia só o mês aberto: uma recorrência de dois anos aparecia
  como "1 pagamento futuro" no diálogo que a apaga inteira. Agora quem conta é
  `useRecurrenceGroupStats` (hooks.ts), no banco, sobre o grupo todo.
*/
