import { labelOf, MAP_VISUAL_STATUS, PROJECT_STATUS } from '@/lib/enums'
import { normalizeText } from '@/lib/format'
import type {
  EnrichedMapProperty,
  MapFacetOption,
  MapFacetSource,
  MapPropertyFacets,
  MapPropertyRow,
} from './types'

/*
  O que a tela do mapa calcula EM MEMÓRIA, sobre as linhas que os hooks já
  devolveram.

  Fica fora do componente pela regra do CLAUDE.md — lógica não mora no JSX — e
  fora de hooks.ts porque não toca no Supabase. Mesmo lugar que
  src/features/suppliers/list.ts ocupa no módulo 8.

  QUAIS FILTROS ROTARAM PARA O BANCO E QUAIS FICARAM AQUI está descrito em
  `MapPropertyFilters` (types.ts). Resumo: cliente, cidade e finalidade viraram
  WHERE; a busca por texto e o status continuam aqui, e os dois têm motivo
  próprio, explicado em cada função.
*/

/* ── Endereço guardado ─────────────────────────────────────────────────── */

const NOISE_PATTERNS = [
  /,?\s*Região Geográfica Imediata de [^,]+/gi,
  /,?\s*Região Geográfica Intermediária de [^,]+/gi,
  /,?\s*Região (Nordeste|Norte|Sul|Sudeste|Centro-Oeste)/gi,
  /,?\s*Mesorregião [^,]+/gi,
  /,?\s*Microrregião [^,]+/gi,
  /,?\s*\d{5}-\d{3}/g,
]

/*
  Porta de `cleanExistingAddress` (MapaProjetos.jsx:181).

  Reescreve para exibição o endereço JÁ GRAVADO, tirando as divisões
  territoriais do IBGE que o Nominatim devolve ("Região Geográfica Imediata
  de...") e o CEP, e quebrando o resto em duas linhas.

  É diferente de `formatCleanAddress` (geocoding.ts), que formata o endereço
  NOVO a partir dos campos estruturados da resposta. Os dois existem no original
  e produzem o mesmo formato por caminhos diferentes: este aqui é o que salva os
  pinos antigos, gravados antes de o outro existir. Nenhum dos dois altera o que
  está no banco.
*/
export function cleanStoredAddress(address: string | null | undefined): string {
  if (!address) return ''

  let cleaned = address
  for (const pattern of NOISE_PATTERNS) cleaned = cleaned.replace(pattern, '')

  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')

  const parts = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return ''

  /* Os três últimos elementos são tratados como país, estado e cidade — e é
     chute posicional, como no original. Endereço com menos partes perde a
     segunda linha, que é o que acontece lá também. */
  const country = parts[parts.length - 1]
  const state = parts.length > 2 ? parts[parts.length - 2] : null
  const city = parts.length > 3 ? parts[parts.length - 3] : null

  const line1 = parts.slice(0, Math.max(0, parts.length - 3)).join(', ')

  const locationParts: string[] = []
  if (city) locationParts.push(city)
  if (state) locationParts.push(state)

  const line2 = locationParts.join(' – ') + (country ? `, ${country}` : '')

  return [line1, line2].filter(Boolean).join('\n')
}

/* ── Status ────────────────────────────────────────────────────────────── */

/*
  O STATUS QUE O PINO MOSTRA: o do PROJETO quando há vínculo, o visual quando não
  há (MapaProjetos.jsx:287).

  DEVOLVE O RÓTULO, e não o valor do enum, porque no original os dois lados são a
  MESMA string em português e o filtro compara uma com a outra. Aqui são dois
  enums diferentes (`project_status` e `map_visual_status`), e voltar ao rótulo é
  o que reproduz o comportamento da tela sem inventar regra:

  - "Em desenvolvimento" de um projeto e de um pino solto colapsam numa opção só
    do filtro, com a contagem somada — como no original.
  - "Pausado" (visual) e "Suspenso" (projeto) continuam separados, porque são
    rótulos diferentes — como no original.

  Comparar os VALORES faria o oposto nos dois casos: `in_development` do projeto
  e do pino são o mesmo valor mas de tipos diferentes, e `paused`/`suspended`
  apareceriam como duas opções que a tela nunca teve... com os rótulos certos e a
  contagem errada.

  O TERCEIRO FALLBACK DO ORIGINAL NÃO EXISTE MAIS: lá a expressão termina em
  `|| 'Não vinculado'`, para o caso de `status_visual` vir vazio. `visual_status`
  é NOT NULL com default (migration 0057), então esse ramo é inalcançável — e
  escrevê-lo aqui seria código morto.

  PROJETO INVISÍVEL CONTA COMO SEM VÍNCULO, e isso é fidelidade a um efeito
  colateral do original: lá o `lookup` de projetos é montado só com os visíveis
  (MapaProjetos.jsx:158-160), então um pino preso a projeto oculto cai no rótulo
  livre e no status visual. Está reportado ao usuário como comportamento
  estranho, e não foi corrigido aqui.
*/
export function resolveLinkedProject(row: MapPropertyRow): MapPropertyRow['project'] {
  return row.project?.visible_in_list ? row.project : null
}

export function resolveStatusLabel(row: MapPropertyRow): string {
  const project = resolveLinkedProject(row)
  if (project) return labelOf(PROJECT_STATUS, project.status)
  return labelOf(MAP_VISUAL_STATUS, row.visual_status)
}

/* ── Enriquecimento ────────────────────────────────────────────────────── */

/*
  Porta de `enrichedProperties` (MapaProjetos.jsx:275-294). Os `lookup` por id do
  original viraram os embeds de `useMapProperties`; o que sobra é o mesmo
  cálculo.

  "Sem nome" e a ordem de precedência (`projeto vinculado → rótulo livre →
  'Sem nome'`) são microcopy do original e ficam literais.
*/
export function enrichMapProperties(rows: MapPropertyRow[]): EnrichedMapProperty[] {
  return rows.map((row) => {
    const linkedProject = resolveLinkedProject(row)

    return {
      ...row,
      linkedProject,
      displayName: linkedProject?.name || row.project_label || 'Sem nome',
      clientName: row.client?.name || row.client_label || null,
      statusLabel: resolveStatusLabel(row),
      cleanAddress: cleanStoredAddress(row.address),
    }
  })
}

/* ── Os dois filtros que continuam no navegador ────────────────────────── */

/*
  O campo "Nome do Projeto" (MapaProjetos.jsx:942) e o select "Status (do
  Projeto)" (:951).

  POR QUE NÃO VIRARAM WHERE:

  - A busca varre `displayName`, que pode vir do JOIN com `projects` ou da coluna
    `project_label` da própria linha, E o endereço. Em SQL seriam três colunas de
    duas tabelas num `or` com `ilike`, e a metade que vem do join só existe
    depois do enriquecimento — inclusive a regra de projeto invisível.
  - O status é a mistura de dois enums resolvida em RÓTULO (ver
    `resolveStatusLabel`). Não há coluna que o contenha.

  UMA DIFERENÇA EM RELAÇÃO AO ORIGINAL, e ela não muda o que a tela acha: acento
  é ignorado, com `normalizeText`, o mesmo tratamento que a busca do CRM, do
  financeiro e de fornecedores já dá. O original compara `toLowerCase()` puro,
  então "residencia" não acha "Residência" — isso é bug de busca, não layout.

  SEM corte mínimo de caracteres: o original filtra a partir da primeira letra.
*/
export function filterMapProperties(
  rows: EnrichedMapProperty[],
  options: { search: string; statusLabel: string | 'all' },
): EnrichedMapProperty[] {
  const needle = normalizeText(options.search.trim())

  return rows.filter((row) => {
    const matchesSearch =
      needle === '' ||
      normalizeText(row.displayName).includes(needle) ||
      normalizeText(row.address).includes(needle)

    const matchesStatus =
      options.statusLabel === 'all' || row.statusLabel === options.statusLabel

    return matchesSearch && matchesStatus
  })
}

/* ── As opções dos selects ─────────────────────────────────────────────── */

function countBy(values: string[]): MapFacetOption[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, 'pt-BR'))
}

/*
  Porta de `uniqueCities`, `uniqueStatuses` e `uniqueFinalidades`
  (MapaProjetos.jsx:314-332), com as contagens que aparecem entre parênteses em
  cada opção (:958, :982 e :1006).

  Contam sobre TODAS as propriedades, e não sobre o recorte — é o que o original
  faz, e é por isso que `useMapPropertyFacetSource` é uma consulta à parte.

  A ORDENAÇÃO é alfabética, como o `.sort()` do original, mas com
  `localeCompare('pt-BR')`: o `sort()` cru do JavaScript compara por código de
  caractere e joga "Águas Claras" depois de "Zezé". Diferença visível só em
  cidade com acento inicial, e a ordem certa é a que a tela pretendia.
*/
export function buildMapPropertyFacets(rows: MapFacetSource[]): MapPropertyFacets {
  const cities: string[] = []
  const statuses: string[] = []
  const purposes: string[] = []

  for (const row of rows) {
    if (row.city) cities.push(row.city)

    const project = row.project?.visible_in_list ? row.project : null
    statuses.push(
      project
        ? labelOf(PROJECT_STATUS, project.status)
        : labelOf(MAP_VISUAL_STATUS, row.visual_status),
    )

    for (const purpose of row.purposes) purposes.push(purpose.purpose)
  }

  return {
    cities: countBy(cities),
    statuses: countBy(statuses),
    purposes: countBy(purposes),
  }
}
