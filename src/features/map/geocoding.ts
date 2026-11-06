import { env } from '@/lib/env'
import { carregarGoogleMaps } from './components/google-maps-setup'
import { googleGeocodeResponseSchema } from './schemas'
import type { GeocodeResult, PlaceSearchResult, ReverseGeocodedPin } from './types'

/*
  Porta de projeto-original/src/components/utils/geocoding.jsx, com UMA TROCA DE
  PROVEDOR feita neste projeto e não no original.

  ANTES ERAM DOIS PROVEDORES:

    Google Geocoding API   endereço da OBRA, montado a partir dos campos de local
                           do CONTRATO. Resultado vai para as oito colunas
                           `site_*` de `projects`.
    Nominatim (OSM)        o PINO do mapa: reverse geocoding no clique e busca de
                           lugar na caixa "Buscar Localização".

  AGORA É UM SÓ: o Google, nas três chamadas. O motivo é o mapa — a tela passou
  de Leaflet para a Maps JavaScript API, e manter o endereço do pino vindo do
  OpenStreetMap deixaria duas bases geográficas discordando dentro da mesma tela
  (o pino no lugar que o Google desenha, o nome da rua que o OSM conhece). Em
  Eusébio e Aquiraz, onde está a maior parte dos lotes, essa diferença aparece:
  loteamento novo que o Google já tem e o OSM ainda não.

  O QUE ISSO CUSTA, porque não é de graça como o Nominatim era: Geocoding API a
  US$ 5,00 por mil chamadas, com os primeiros 10.000 por mês sem cobrança (a
  cota Essentials). As chamadas são uma por clique para marcar pino e uma por
  busca de lugar, com `debounce` de 300ms e cache do React Query por cima — em
  uso normal de escritório, dezenas por mês contra uma cota de dez mil.

  POR QUE GEOCODING E NÃO PLACES AUTOCOMPLETE: o Places devolve sugestão
  enquanto se digita, que é mais bonito, e cobra em dois passos (a sugestão e
  depois o Place Details para saber a coordenada), um deles no SKU mais caro, e
  exige token de sessão para não cobrar cada tecla como sessão nova. O Geocoding
  devolve coordenada E `viewport` numa chamada — e `viewport` é exatamente o
  enquadramento que esta tela já usava do Nominatim. Mesma caixa, mesma lista,
  uma API, uma cobrança.

  ────────────────────────────────────────────────────────────────────────────
  A CHAVE VAI PARA O BUNDLE DO NAVEGADOR. Isso não é descuido deste arquivo: é
  o que `VITE_` SIGNIFICA. O Vite substitui `import.meta.env.VITE_*` pelo valor
  literal em tempo de build, então a chave sai escrita dentro do JavaScript que
  qualquer pessoa baixa da Vercel e lê com dois cliques. Não há "esconder" chave
  em código client-side.

  A consequência é cota: sem restrição, qualquer um copia a chave e gasta o
  faturamento do escritório. O que torna isso aceitável é a restrição no console
  do Google Cloud, e ela é OBRIGATÓRIA:

    1. Restrição de aplicativo → "Websites", com os domínios da Vercel (e só
       eles).
    2. Restrição de API → "Maps JavaScript API" e "Geocoding API". Chave sem
       restrição de API abre também Directions, Places e o resto do catálogo
       cobrado.

  SEM A VARIÁVEL o app inteiro continua subindo: `geocodeAddress` devolve
  `{ success: false, error: 'API Key não configurada' }`, as duas funções do
  pino devolvem vazio, e a tela do mapa mostra a frase que diz o que falta em
  vez do mapa. Isso é deliberado — `src/lib/env.ts` declara a variável como
  opcional, e o porquê está lá.
  ────────────────────────────────────────────────────────────────────────────
*/

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

/* ── Google via REST: o endereço da obra ───────────────────────────────── */

/**
 * Porta de `geocodeAddress` (geocoding.jsx:5). Mesmo formato de retorno,
 * inclusive as frases de erro — elas aparecem no `console` do original e agora
 * podem chegar à tela.
 *
 * ESTA CONTINUA SENDO REST, e não o `Geocoder` da biblioteca JavaScript, porque
 * ela roda fora da tela do mapa: `useGeocodeProjectSite` é chamada do módulo de
 * projetos, onde o script do Google não está carregado. Baixar a API inteira
 * para uma chamada de endereço seria carga de mapa cobrada sem mapa nenhum na
 * tela.
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

/* ── Google via biblioteca JavaScript: o pino do mapa ──────────────────── */

/*
  UM `Geocoder` PARA A SESSÃO INTEIRA. Ele não guarda estado entre chamadas, e
  construir um por clique seria desperdício sem contrapartida.

  A promessa de carregamento é a mesma de `google-maps-setup.ts`, então chamar
  daqui não baixa um segundo script: se a tela do mapa já carregou, isto resolve
  na hora.
*/
let geocoder: google.maps.Geocoder | null = null

async function obterGeocoder(): Promise<google.maps.Geocoder | null> {
  const apiKey = env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  try {
    await carregarGoogleMaps(apiKey)
  } catch {
    return null
  }

  geocoder ??= new google.maps.Geocoder()
  return geocoder
}

/*
  A RECUSA DA CHAVE, que é diferente de "não achei nada".

  `REQUEST_DENIED` com a frase "The webpage is not allowed to use the geocoder"
  significa uma coisa só: a chave do navegador não tem a Geocoding API na lista
  de APIs permitidas, ou a API não está ativada no projeto do Google Cloud. O
  mapa continua desenhando normalmente, porque isso é outra API — e foi
  exatamente assim que este caso apareceu, com o mapa perfeito e a busca muda.

  Distinguir importa porque as duas respostas levam a ações opostas: lista vazia
  é "digite outra coisa", recusa é "abra o console do Google Cloud".
*/
function ehRecusaDaChave(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code: unknown }).code === 'REQUEST_DENIED'
  )
}

export const MENSAGEM_DE_RECUSA =
  'O Google recusou a busca de endereço. A chave do mapa precisa da Geocoding API ' +
  'liberada no console do Google Cloud; o mapa em si usa outra API e continua funcionando.'

/* O componente do endereço que o Google devolve, pelo primeiro tipo que casar. */
function componente(
  partes: google.maps.GeocoderAddressComponent[],
  ...tipos: string[]
): string {
  for (const tipo of tipos) {
    const achado = partes.find((parte) => parte.types.includes(tipo))
    if (achado) return achado.long_name
  }
  return ''
}

/*
  Porta de `formatCleanAddress` (MapaProjetos.jsx:433), lendo os componentes do
  Google em vez do bloco `address` do Nominatim.

  Devolve DUAS LINHAS separadas por `\n`: rua (com número) e bairro na primeira,
  "Cidade – Estado, País" na segunda. É texto de EXIBIÇÃO — a tela o desenha com
  `whitespace-pre-line` e é assim que ele vai para a coluna `address`.

  O travessão entre cidade e estado é `–` (en dash), como no original, e não
  hífen.

  A CORRESPONDÊNCIA DE CAMPOS, e ela não é óbvia no Brasil:

    road/street      → `route`
    house_number     → `street_number`
    neighbourhood    → `sublocality_level_1`, que é o que o Google usa para
                       bairro no Brasil; `neighborhood` vem como reserva.
    city             → `administrative_area_level_2` ANTES de `locality`. No
                       Brasil o município é o nível 2; `locality` às vezes traz
                       o distrito (em Eusébio, "Precabura" em vez de "Eusébio"),
                       e é o município que a coluna `city` filtra na tela.
    state            → `administrative_area_level_1` com `long_name`, ou seja
                       "Ceará" e não "CE" — igual ao que o Nominatim gravava,
                       para o filtro de cidade não se partir em dois.
*/
function formatarEndereco(partes: google.maps.GeocoderAddressComponent[]): string {
  const linha1: string[] = []

  const rua = componente(partes, 'route')
  const numero = componente(partes, 'street_number')
  if (rua) linha1.push(numero ? `${rua}, ${numero}` : rua)

  const bairro = componente(partes, 'sublocality_level_1', 'sublocality', 'neighborhood')
  if (bairro) linha1.push(bairro)

  const cidade = componente(partes, 'administrative_area_level_2', 'locality')
  const estado = componente(partes, 'administrative_area_level_1')
  const pais = componente(partes, 'country')

  const local: string[] = []
  if (cidade) local.push(cidade)
  if (estado) local.push(estado)

  const linha2 = local.join(' – ') + (pais ? `, ${pais}` : '')

  return [linha1.join(', '), linha2].filter(Boolean).join('\n')
}

/*
  Reverse geocoding do clique no mapa (MapaProjetos.jsx:477-502).

  Falha de rede, chave sem a Geocoding API liberada ou ponto sem endereço
  conhecido devolvem `null`, e a tela abre o formulário só com a coordenada,
  como no original (:511-517). `ZERO_RESULTS` no meio do mar é exatamente esse
  caso, e não é erro.
*/
export async function reverseGeocodePin(
  lat: number,
  lng: number,
): Promise<ReverseGeocodedPin | null> {
  const g = await obterGeocoder()
  if (!g) return null

  try {
    const { results } = await g.geocode({ location: { lat, lng }, language: 'pt-BR' })
    const primeiro = results[0]
    if (!primeiro) return null

    const partes = primeiro.address_components

    const endereco = formatarEndereco(partes)
    const cidade = componente(partes, 'administrative_area_level_2', 'locality')
    const estado = componente(partes, 'administrative_area_level_1')

    /*
      NADA APROVEITÁVEL VALE `null`, e não três campos vazios.

      O Google quase sempre responde alguma coisa: no meio do oceano ele devolve
      um resultado de código Plus, sem rua, sem bairro, sem município. Montado em
      cima disso, o objeto sairia com três strings vazias, e a tela abriria o
      formulário do pino novo calada, como se o endereço tivesse sido encontrado.

      Com `null` ela mostra "Não foi possível obter o endereço desta
      localização" e abre o formulário só com a coordenada, que é o
      comportamento do original quando o reverse geocoding não achava nada.
    */
    if (endereco === '' && cidade === '' && estado === '') return null

    return { address: endereco, city: cidade, state: estado }
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

  `region: 'BR'` desempata nome repetido a favor do Brasil, que é onde está todo
  lote deste escritório. Não é restrição: "Torre Eiffel" continua achando Paris.

  O DEBOUNCE DE 300ms NÃO ESTÁ AQUI: no original ele mora no componente
  (:618-632), e aqui mora no mesmo lugar, porque é sobre o que o usuário digitou
  e não sobre a consulta. Com Google cobrando por chamada, ele deixou de ser
  gentileza com servidor de terceiro e passou a ser dinheiro: sem a pausa,
  "Eusébio" dispara sete chamadas em vez de uma.
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
          types: ['coordinates'],
          boundingBox: null,
        },
      ]
    }
  }

  const g = await obterGeocoder()
  if (!g) return []

  try {
    const { results } = await g.geocode({
      address: query,
      region: 'BR',
      language: 'pt-BR',
    })

    return results.map((resultado): PlaceSearchResult => {
      const local = resultado.geometry.location

      /*
        `viewport` É O QUE O NOMINATIM CHAMAVA DE `boundingbox`, e o Google o
        devolve em quase todo resultado: a janela que mostra o lugar inteiro. A
        tela usa isso para enquadrar em vez de adivinhar zoom, e é por ele que
        `zoomForPlace` quase nunca chega a ser chamada.
      */
      const janela = resultado.geometry.viewport
      const boundingBox = janela
        ? ([
            janela.getSouthWest().lat(),
            janela.getNorthEast().lat(),
            janela.getSouthWest().lng(),
            janela.getNorthEast().lng(),
          ] as [number, number, number, number])
        : null

      return {
        lat: local.lat(),
        lng: local.lng(),
        displayName: resultado.formatted_address,
        type: resultado.types[0] ?? null,
        types: resultado.types,
        boundingBox,
      }
    })
  } catch (erro) {
    /* A recusa SOBE, para a tela poder dizer o que conferir. O React Query não
       repete esta consulta (`retry: false` no hook): recusa de chave não melhora
       na terceira tentativa. */
    if (ehRecusaDaChave(erro)) throw new Error(MENSAGEM_DE_RECUSA)

    /* `ZERO_RESULTS` chega aqui como exceção. Lista vazia é a resposta certa:
       a tela não abre o painel de sugestões quando não há nada. */
    return []
  }
}

/*
  O zoom que a tela dá ao escolher um resultado SEM `viewport`
  (MapaProjetos.jsx:651-671), na mesma escada de decisão do original — com a
  taxonomia do Google no lugar da do Nominatim.

  Mora aqui, e não no componente, porque é leitura da taxonomia de quem produziu
  `types`. Quem tem `boundingBox` não passa por aqui: a tela enquadra a janela.
*/
export function zoomForPlace(result: PlaceSearchResult): number {
  const tipos = result.types

  if (tipos.includes('coordinates')) return 18
  if (
    tipos.includes('street_address') ||
    tipos.includes('premise') ||
    tipos.includes('subpremise') ||
    tipos.includes('point_of_interest') ||
    tipos.includes('establishment')
  ) {
    return 18
  }
  if (tipos.includes('route') || tipos.includes('intersection')) return 17
  if (
    tipos.includes('neighborhood') ||
    tipos.includes('sublocality') ||
    tipos.includes('sublocality_level_1')
  ) {
    return 15
  }
  if (tipos.includes('locality') || tipos.includes('administrative_area_level_2')) return 12
  if (tipos.includes('administrative_area_level_1')) return 8
  if (tipos.includes('country')) return 5
  if (tipos.includes('postal_code')) return 16

  return 16
}
