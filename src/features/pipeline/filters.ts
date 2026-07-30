import type { NegotiationRow } from './types'

/*
  Busca e filtros do funil, fora do componente.

  A BUSCA é a do original (Negociacoes.jsx:321-330), campo por campo: nome da
  negociação, nome do cliente e nome do responsável, sem diferenciar maiúscula.
  Só a origem dos dois últimos muda — eram colunas desnormalizadas na linha,
  agora são embeds.

  OS FILTROS não têm original de comportamento: PipelineFilters.jsx desenha os
  cinco selects mas nunca é montado por nenhuma página, então o que cada opção
  faz com a lista nunca existiu. As regras abaixo são a leitura direta do rótulo
  de cada opção, e as faixas de valor não se sobrepõem (o limite superior de uma
  é exclusivo do inferior da seguinte) — ver a nota no cabeçalho de
  components/PipelineFilters.tsx.
*/

export type PipelineFilterState = {
  owner: string
  city: string
  service: string
  origin: string
  valueRange: string
}

export const EMPTY_FILTERS: PipelineFilterState = {
  owner: 'todos',
  city: 'todos',
  service: 'todos',
  origin: 'todos',
  valueRange: 'todos',
}

const VALUE_RANGES: Record<string, (value: number) => boolean> = {
  ate50k: (value) => value <= 50_000,
  '50a100k': (value) => value > 50_000 && value <= 100_000,
  '100a200k': (value) => value > 100_000 && value <= 200_000,
  acima200k: (value) => value > 200_000,
}

export function applySearch(rows: NegotiationRow[], term: string): NegotiationRow[] {
  const needle = term.trim().toLowerCase()
  if (!needle) return rows

  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) ||
      row.client?.name.toLowerCase().includes(needle) ||
      row.owner?.name.toLowerCase().includes(needle),
  )
}

export function applyFilters(
  rows: NegotiationRow[],
  filters: PipelineFilterState,
): NegotiationRow[] {
  return rows.filter((row) => {
    if (filters.owner !== 'todos' && row.commercial_owner_id !== filters.owner) return false
    if (filters.city !== 'todos' && row.client?.address_city !== filters.city) return false
    if (
      filters.service !== 'todos' &&
      !row.services.some((service) => service.service_type === filters.service)
    ) {
      return false
    }
    if (filters.origin !== 'todos' && row.origin !== filters.origin) return false

    if (filters.valueRange !== 'todos') {
      const matches = VALUE_RANGES[filters.valueRange]
      /*
        Negociação sem valor sai de QUALQUER faixa, inclusive "Até R$ 50mil":
        valor em branco não é R$ 0, é valor que ninguém estimou ainda — e o seed
        tem esse caso justamente porque é como a maioria dos leads entra.
      */
      if (!matches || row.estimated_value == null || !matches(row.estimated_value)) return false
    }

    return true
  })
}
