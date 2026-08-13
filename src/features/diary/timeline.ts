import { DIARY_ENTRY_TYPE } from '@/lib/enums'
import type { DiaryEntryDay, DiaryEntryRow, DiaryFilters } from './types'

/*
  A BUSCA E O AGRUPAMENTO POR DIA DA LINHA DO TEMPO, fora do componente.

  No original as duas coisas são `useMemo` dentro da gaveta
  (ProjectDiaryDrawer.jsx:135-152). O resultado em tela é o mesmo; o que muda é
  que a regra de "este registro é de que dia" e a de "esta busca casa" deixam de
  morar no JSX que as desenha — CLAUDE.md, e o mesmo motivo pelo qual
  `isTaskOverdue` saiu do TaskKanban no módulo 10: duas telas que precisem da
  mesma resposta não podem tê-la escrita duas vezes.

  Continua sendo trabalho de MEMÓRIA, e não do banco, de propósito: os dois
  dependem de estado da tela (o que foi digitado, o filtro escolhido), e uma
  consulta por tecla digitada seria uma requisição por tecla digitada. A
  consulta já chega recortada por projeto e com teto.
*/

/*
  O casamento da busca livre. Os quatro campos são os do original: título,
  descrição, nome do responsável e o TIPO — este último pelo rótulo em
  português, que é o texto que a pessoa vê e, portanto, o que ela digita.

  No original o teste é sobre `entry.entry_type`, que lá É o rótulo ("Reunião");
  aqui a coluna guarda `meeting`, então buscar pelo texto exige o mapa de
  rótulos. Sem isso, digitar "reunião" não acharia nenhuma reunião.
*/
function matchesSearch(entry: DiaryEntryRow, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (query === '') return true

  const fields = [
    entry.title,
    entry.description,
    entry.responsible?.name ?? null,
    DIARY_ENTRY_TYPE[entry.entry_type],
  ]

  return fields.some((field) => field?.toLowerCase().includes(query))
}

export function filterDiaryEntries(
  entries: DiaryEntryRow[],
  filters: DiaryFilters,
): DiaryEntryRow[] {
  return entries.filter((entry) => {
    if (filters.type !== 'all' && entry.entry_type !== filters.type) return false
    return matchesSearch(entry, filters.search)
  })
}

/*
  Um grupo por dia, do mais recente para o mais antigo.

  SEM O `|| 'sem-data'` DO ORIGINAL, e não é simplificação: lá a chave do grupo é
  `data_ocorrencia || created_date.split('T')[0] || 'sem-data'`, porque a
  entidade do base44 não exige a data. Aqui `occurrence_date` é NOT NULL
  (migration 0069) — registro sem data não existe, e um grupo chamado "sem-data"
  seria um estado impossível desenhado na tela.

  A ORDEM DENTRO DO DIA é a que a consulta entregou (ver `useProjectDiaryEntries`)
  e não é reordenada aqui: agrupar preserva a ordem de chegada.
*/
export function groupDiaryEntriesByDay(entries: DiaryEntryRow[]): DiaryEntryDay[] {
  const byDate = new Map<string, DiaryEntryRow[]>()

  for (const entry of entries) {
    const day = byDate.get(entry.occurrence_date)
    if (day) day.push(entry)
    else byDate.set(entry.occurrence_date, [entry])
  }

  return [...byDate.entries()]
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }))
    .sort((a, b) => b.date.localeCompare(a.date))
}
