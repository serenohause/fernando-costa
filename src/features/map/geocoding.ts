import { env } from '@/lib/env'
import {
  googleGeocodeResponseSchema,
  nominatimReverseResponseSchema,
  nominatimSearchResponseSchema,
} from './schemas'
import type { GeocodeResult, PlaceSearchResult, ReverseGeocodedPin } from './types'

/*
  Porta de projeto-original/src/components/utils/geocoding.jsx, mais o SEGUNDO
  provedor de geocodificação que a tela do mapa usa direto.

  SÃO DOIS PROVEDORES, E ISSO É DO ORIGINAL — não é escolha deste port:

    Google Geocoding API   endereço da OBRA, montado a partir dos campos de local
                           do CONTRATO. Resultado vai para as oito colunas
                           `site_*` de `projects` (geocoding.jsx:98-110).
    Nominatim (OSM)        o PINO do mapa: reverse geocoding no clique
                           (MapaProjetos.jsx:479) e busca de lugar na caixa
                           "Buscar Localização" (:597).

  Nada concilia os dois resultados — ver o comentário de `ProjectSiteLocation` em
  types.ts e o COMMENT de `map_properties` na migration 0057.

  ────────────────────────────────────────────────────────────────────────────
  A CHAVE DO GOOGLE VAI PARA O BUNDLE DO NAVEGADOR. Isso não é descuido deste
  arquivo: é o que `VITE_` SIGNIFICA. O Vite substitui `import.meta.env.VITE_*`
  pelo valor literal em tempo de build, então a chave sai escrita dentro do
  JavaScript que qualquer pessoa baixa da Vercel e lê com dois cliques. Não há
  "esconder" chave em código client-side — o original é assim, e qualquer uso do
  Google Maps direto do navegador é assim.

  A consequência é cota: sem restrição, qualquer um copia a chave e gasta o
  faturamento do escritório. O que torna isso aceitável é a restrição no console
  do Google Cloud, e ela é OBRIGATÓRIA antes de a chave existir em produção:

    1. Restrição de aplicativo → "Referenciadores HTTP", com o domínio da
       Vercel (e só ele).
    2. Restrição de API → somente "Geocoding API". Chave sem restrição de API
       abre também Directions, Places e o resto do catálogo cobrado.

  A alternativa que tira a chave do navegador é mover a geocodificação para uma
  Edge Function (onde o segredo NÃO leva `VITE_`, como registra o .env). É uma
  mudança de arquitetura em relação ao original, e portanto decisão do usuário —
  não deste port.

  `VITE_GOOGLE_MAPS_API_KEY` NÃO EXISTE NO .env HOJE, e isso é esperado: sem ela
  `geocodeAddress` devolve `{ success: false, error: 'API Key não configurada' }`,
  exatamente como o original (geocoding.jsx:8-11), e o projeto fica com
  `site_geocode_status = 'failed'`. O pino do mapa continua funcionando, porque
  ele não passa por aqui.
  ────────────────────────────────────────────────────────────────────────────
*/

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

/*
  O mesmo cabeçalho que o original manda nas duas chamadas ao Nominatim
  (MapaProjetos.jsx:483 e :601). É o que faz o endereço voltar em português.

  A política de uso do Nominatim pede também identificação do aplicativo e no
  máximo uma consulta por segundo. O `User-Agent` não é definível a partir do
  navegador (o fetch o ignora por especificação), e o original não manda nenhuma
  outra identificação — fica como está, e a ressalva está no relatório.
*/
const NOMINATIM_HEADERS = {
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7,*;q=0.5',
}

/* ── Google: o endereço da obra ────────────────────────────────────────── */

/**
 * Porta de `geocodeAddress` (geocoding.jsx:5). Mesmo formato de retorno,
 * inclusive as frases de erro — elas aparecem no `console` do original e agora
 * podem chegar à tela.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  /* Por `src/lib/env.ts`, e não por `import.meta.env` cru: é lá que este projeto
     declara e valida o ambiente. A variável é opcional — ver o comentário de lá. */
  const apiKey = env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return { success: false, error: 'API Key não configurada' }
  }

  if (!address || address.trim() === '') {
    return { success: false, error: 'Endereço vazio' }
  }

  try {
    const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url)

    const parsed = googleGeocodeResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { success: false, error: 'Geocoding falhou: resposta inesperada' }
    }

    const result = parsed.data.results[0]
    if (parsed.data.status !== 'OK' || !result) {
      return { success: false, error: `Geocoding falhou: ${parsed.data.status}` }
    }

    return {
      success: true,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      place_id: result.place_id ?? null,
      formatted_address: result.formatted_address ?? null,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao geocodificar endereço',
    }
  }
}

/*
  Porta de `buildObraAddress` (geocoding.jsx:51): o endereço da obra é montado a
  partir dos campos de local do CONTRATO, e não do projeto.

  Os nomes das colunas mudaram na migration 0030 (`local_endereco` →
  `site_street` e companhia); a ORDEM das partes é a mesma, e ela importa —
  é o texto inteiro que vai para a API.
*/
export type ContractSiteAddressFields = {
  site_street: string | null
  site_number: string | null
  site_complement: string | null
  site_city: string | null
  site_state: string | null
  site_zipcode: string | null
}

export function buildSiteAddress(contract: ContractSiteAddressFields): string {
  return [
    contract.site_street,
    contract.site_number,
    contract.site_complement,
    contract.site_city,
    contract.site_state,
    contract.site_zipcode,
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ')
}

/* ── Nominatim: o pino do mapa ─────────────────────────────────────────── */

type NominatimAddress = Record<string, string | null | undefined>

/*
  Porta de `formatCleanAddress` (MapaProjetos.jsx:433).

  Devolve DUAS LINHAS separadas por `\n`: rua (com número) e bairro na primeira,
  "Cidade – Estado, País" na segunda. É texto de EXIBIÇÃO — a tela o desenha com
  `whitespace-pre-line` (:1202) e é assim que ele vai para a coluna `address`.

  O travessão entre cidade e estado é `–` (en dash), como no original, e não
  hífen.
*/
function formatCleanAddress(address: NominatimAddress | null | undefined): string {
  if (!address) return ''

  const parts: string[] = []

  const street = address.road || address.street || address.route
  const number = address.house_number
  if (street) parts.push(number ? `${street}, ${number}` : street)

  const neighborhood = address.neighbourhood || address.suburb || address.sublocality
  if (neighborhood) parts.push(neighborhood)

  const line1 = parts.join(', ')

  const city =
    address.city || address.town || address.municipality || address.village || address.locality
  const state = address.state || address.region || address.administrative_area_level_1
  const country = address.country

  const locationParts: string[] = []
  if (city) locationParts.push(city)
  if (state) locationParts.push(state)

  const line2 = locationParts.join(' – ') + (country ? `, ${country}` : '')

  return [line1, line2].filter(Boolean).join('\n')
}

/*
  Reverse geocoding do clique no mapa (MapaProjetos.jsx:477-502).

  A extração de cidade e estado é a do original, e repare que ela NÃO é a mesma
  cadeia de `||` usada na segunda linha do endereço: aqui `locality` não entra na
  cidade e `administrative_area_level_1` não entra no estado (:493-494). Ficou
  como está — são dois trechos independentes lá, e igualá-los mudaria o que vai
  para a coluna `city`, que é o filtro da tela.

  Falha de rede ou resposta fora do formato devolvem `null`, e a tela abre o
  formulário só com a coordenada, como no original (:511-517).
*/
export async function reverseGeocodePin(
  lat: number,
  lng: number,
): Promise<ReverseGeocodedPin | null> {
  try {
    const url = `${NOMINATIM_REVERSE_URL}?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
    const response = await fetch(url, { headers: NOMINATIM_HEADERS })

    const parsed = nominatimReverseResponseSchema.safeParse(await response.json())
    if (!parsed.success) return null

    const address = parsed.data.address ?? null

    return {
      address: formatCleanAddress(address),
      city: address?.city || address?.town || address?.municipality || address?.village || '',
      state: address?.state || address?.region || '',
    }
  } catch {
    return null
  }
}

/*
  Coordenada digitada na caixa de busca: "-3.7327, -38.5270" ou
  "-3.7327 -38.5270" (MapaProjetos.jsx:576).
*/
const COORDINATE_PATTERN = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/

/*
  A busca da caixa "Buscar Localização" (MapaProjetos.jsx:565-615).

  DUAS COISAS DO ORIGINAL QUE FICAM:

  - Menos de 3 caracteres não busca nada.
  - Coordenada digitada NÃO vai para a rede: vira um resultado sintético, com
    `type: 'coordinates'`, que a tela mostra como "Coordenadas: -3.732700,
    -38.527000". A faixa é validada antes (:583) — e é a mesma faixa do check do
    banco, sem a recusa de zero que a GRAVAÇÃO do pino faz.

  O DEBOUNCE DE 300ms NÃO ESTÁ AQUI: no original ele mora no componente
  (:618-632), e aqui mora no mesmo lugar, porque é sobre o que o usuário digitou
  e não sobre a consulta.
*/
export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  if (!query || query.trim().length < 3) return []

  const coordinates = COORDINATE_PATTERN.exec(query)
  if (coordinates) {
    const lat = Number.parseFloat(coordinates[1])
    const lng = Number.parseFloat(coordinates[2])

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return [
        {
          lat,
          lng,
          displayName: `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          type: 'coordinates',
          addressType: null,
          boundingBox: null,
        },
      ]
    }
  }

  try {
    const url = `${NOMINATIM_SEARCH_URL}?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1`
    const response = await fetch(url, { headers: NOMINATIM_HEADERS })

    const parsed = nominatimSearchResponseSchema.safeParse(await response.json())
    if (!parsed.success) return []

    return parsed.data.flatMap((result): PlaceSearchResult[] => {
      const lat = Number.parseFloat(result.lat)
      const lng = Number.parseFloat(result.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

      const box = result.boundingbox?.map(Number.parseFloat)
      const boundingBox =
        box && box.length === 4 && box.every(Number.isFinite)
          ? ([box[0], box[1], box[2], box[3]] as [number, number, number, number])
          : null

      return [
        {
          lat,
          lng,
          displayName: result.display_name,
          type: result.type ?? result.class ?? null,
          addressType: result.addresstype ?? null,
          boundingBox,
        },
      ]
    })
  } catch {
    return []
  }
}

/*
  O zoom que a tela dá ao escolher um resultado sem `boundingBox`
  (MapaProjetos.jsx:651-671), na mesma ordem de decisão do original.

  Mora aqui, e não no componente, porque é uma leitura da taxonomia do Nominatim
  — a mesma fonte que produziu `type` e `addressType`. Quem tem `boundingBox`
  não passa por aqui: o original usa `flyToBounds` nesse caso (:642-649).
*/
export function zoomForPlace(result: PlaceSearchResult): number {
  const { type, addressType } = result

  if (type === 'coordinates') return 18
  if (
    addressType === 'road' ||
    addressType === 'house' ||
    addressType === 'building' ||
    type === 'building'
  ) {
    return 18
  }
  if (
    addressType === 'neighbourhood' ||
    addressType === 'suburb' ||
    type === 'residential'
  ) {
    return 15
  }
  if (
    addressType === 'city' ||
    addressType === 'town' ||
    addressType === 'village' ||
    type === 'administrative'
  ) {
    return 12
  }
  if (addressType === 'state' || addressType === 'region') return 8
  if (addressType === 'country') return 5
  if (type === 'amenity' || type === 'tourism' || type === 'shop' || type === 'leisure') {
    return 17
  }

  return 16
}
