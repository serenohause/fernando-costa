import type { Tables } from '@/lib/database.types'
import type {
  ContractType,
  GeocodeStatus,
  MapVisualStatus,
  ProjectStatus,
} from '@/lib/enums'

export type MapProperty = Tables<'map_properties'>
export type MapPropertyLandType = Tables<'map_property_land_types'>
export type MapPropertyPurpose = Tables<'map_property_purposes'>

/*
  AS TAGS COMO A TELA AS USA: o texto, mais o id para a chave da lista.

  No original `terreno_tipo` e `finalidade_projeto` são arrays de string dentro
  da linha da propriedade. Aqui são `map_property_land_types` e
  `map_property_purposes`, uma linha por tag (migration 0057), e a tela continua
  vendo duas listas de texto — os chips do formulário (ProjectForm.jsx:436 e
  :479), o bloco de loteamento do popup (MapaProjetos.jsx:1213) e as badges do
  resumo (PropertySummaryModal.jsx:70 e :87).
*/
export type LandTypeRef = { id: string; land_type: string }
export type PurposeRef = { id: string; purpose: string }

/*
  O projeto vinculado, como o pino o lê.

  `project_type` está aqui porque o resumo o exibe (PropertySummaryModal.jsx:47),
  e `visible_in_list` porque ele decide se o vínculo conta — ver
  `enrichMapProperties` em list.ts.
*/
export type LinkedProjectRef = {
  id: string
  name: string
  status: ProjectStatus
  project_type: ContractType
  visible_in_list: boolean
}

export type LinkedClientRef = { id: string; name: string }

/*
  A propriedade como a tela a lê: a linha, as duas listas de tag e os dois
  vínculos, numa consulta só. O nome do relacionamento é o da CONSTRAINT porque
  todas as FK deste módulo são compostas (`(project_id, tenant_id)` etc.) — e no
  caso de `projects` o apelido é obrigatório por outro motivo também: a mesma FK
  alcança a view `project_progress`.
*/
export type MapPropertyRow = MapProperty & {
  project: LinkedProjectRef | null
  client: LinkedClientRef | null
  land_types: LandTypeRef[]
  purposes: PurposeRef[]
}

/*
  O que o `enrichedProperties` do original acrescenta a cada linha
  (MapaProjetos.jsx:275-294), calculado em list.ts.

  Os nomes são os de lá, com uma exceção: `status` virou `statusLabel`, porque no
  original o campo guarda um TEXTO de exibição ("Em desenvolvimento") e aqui
  `status` já é o valor do enum do projeto. Dois nomes iguais para coisas
  diferentes é o tipo de confusão que a tela paga depois.
*/
export type EnrichedMapProperty = MapPropertyRow & {
  displayName: string
  clientName: string | null
  statusLabel: string
  cleanAddress: string
  linkedProject: LinkedProjectRef | null
}

/*
  O que o formulário de propriedade edita (ProjectForm.jsx com `isMapMode`).

  FORA DAQUI:

  - `tenant_id` — vem do claim da sessão, escrito pelo hook.
  - `legacy_id` — só a importação preenche.
  - `lat`/`lng` — não são campo de formulário: na criação vêm do clique no mapa
    (`MapPinLocation`) e na edição não são tocados. Mover o pino é outra
    gravação, com outro botão ("Ajustar Localização", MapaProjetos.jsx:1258).
  - `city`/`state` — vêm do reverse geocoding na criação e o formulário de
    edição NÃO os reenvia (MapaProjetos.jsx:752-764). Fica como no original.

  `land_types` e `purposes` NÃO são coluna: são as linhas das duas tabelas
  filhas, que a gravação sincroniza junto, porque a tela edita as tags dentro do
  mesmo formulário da propriedade — mesmo desenho de `brands` no módulo 8.
*/
export type MapPropertyInput = {
  project_id: string | null
  project_label: string | null
  client_id: string | null
  client_label: string | null

  address: string | null

  land_types: string[]
  purposes: string[]

  land_area_m2: number | null
  project_area_m2: number | null

  subdivision_name: string | null
  subdivision_block: string | null
  subdivision_lot: string | null

  visual_status: MapVisualStatus
}

/*
  O que o clique no mapa produz, antes de o formulário abrir: a coordenada e o
  que o reverse geocoding do Nominatim devolveu (MapaProjetos.jsx:496-502).
*/
export type MapPinLocation = {
  lat: number
  lng: number
  address: string | null
  city: string | null
  state: string | null
}

/* O arrasto do pino em "Ajustar Localização" (MapaProjetos.jsx:391). */
export type MapPinPosition = { lat: number; lng: number }

/*
  OS FILTROS DA TELA, separados por onde cada um roda.

  Estes três viram WHERE em `useMapProperties`:

  - `clientId` — igualdade em `client_id`, com índice
    `map_properties_tenant_id_client_id_idx`. É a "Busca por Cliente (CRM)"
    (MapaProjetos.jsx:298), que sempre escolhe UM cliente da lista de sugestões.
  - `city` — igualdade, com índice `map_properties_tenant_id_city_idx` (:306).
  - `purpose` — "Finalidade do Projeto" (:307). Deixou de ser `includes()` sobre
    um array e virou recorte na tabela filha, pelo índice
    `map_property_purposes_tenant_id_purpose_idx`.

  OS OUTROS DOIS CONTINUAM NO NAVEGADOR, em list.ts, e o motivo está lá: a busca
  por texto varre nome vindo de join E endereço, e o status é a mistura de dois
  enums diferentes resolvida depois do join. Ver `filterMapProperties`.

  NÃO EXISTE FILTRO POR TIPO DE TERRENO na tela do original, ao contrário do que
  se poderia supor pela simetria com finalidade: `terreno_tipo` só é lido para
  decidir se o bloco de loteamento aparece (MapaProjetos.jsx:1213 e
  PropertySummaryModal.jsx:98). Por isso `map_property_land_types` não tem
  recorte aqui.
*/
export type MapPropertyFilters = {
  clientId: string | null
  city: string | 'all'
  purpose: string | 'all'
}

/*
  As opções dos três selects, com a contagem entre parênteses que o original
  mostra (MapaProjetos.jsx:958, :982 e :1006).

  `value` é o que o select grava e também o que ele exibe — para cidade e
  finalidade é o próprio texto; para status é o RÓTULO já resolvido, e a razão
  está em `resolveStatusLabel` (list.ts).
*/
export type MapFacetOption = { value: string; count: number }

export type MapPropertyFacets = {
  cities: MapFacetOption[]
  statuses: MapFacetOption[]
  purposes: MapFacetOption[]
}

/*
  A linha reduzida que alimenta as contagens: só o que as três perguntas usam,
  sobre TODAS as propriedades. Ver `useMapPropertyFacetSource` (hooks.ts) para o
  porquê de ser uma consulta separada da lista.
*/
export type MapFacetSource = {
  id: string
  city: string | null
  visual_status: MapVisualStatus
  project: { id: string; status: ProjectStatus; visible_in_list: boolean } | null
  purposes: { purpose: string }[]
}

/*
  A GEOLOCALIZAÇÃO DA OBRA, que é o OUTRO lugar onde este sistema guarda "onde a
  obra fica" — e não é o que o mapa desenha.

  As oito colunas `site_*` de `projects` (migration 0057) vêm da Google Geocoding
  API sobre o endereço do CONTRATO; o pino de `map_properties` vem de um clique
  com reverse geocoding do Nominatim. Nada concilia os dois valores. A duplicação
  é herança do base44, está registrada em docs/SCHEMA-PLAN.md ("Decisão 1") e foi
  mantida de propósito — unificar mudaria o comportamento do original.

  No original, quem lê isto é uma linha de texto abaixo do endereço da obra em
  ProjectForm.jsx:666 ("Localização: -16.6, -49.2"). Mais ninguém.
*/
/*
  O RESULTADO DA GOOGLE GEOCODING API, reduzido ao que geocoding.jsx devolve
  (:26-38). O formato de sucesso/erro é o do original, inclusive `success` como
  discriminante — é assim que `updateProjectGeolocation` decide entre gravar
  `ok` e gravar `failed`.
*/
export type GeocodeResult =
  | {
      success: true
      lat: number
      lng: number
      place_id: string | null
      formatted_address: string | null
    }
  | { success: false; error: string }

/* O que o reverse geocoding do Nominatim entrega ao formulário de pino novo
   (MapaProjetos.jsx:491-502), já formatado. */
export type ReverseGeocodedPin = {
  /* Endereço de EXIBIÇÃO em duas linhas, com `\n` no meio — a tela o desenha com
     `whitespace-pre-line` (MapaProjetos.jsx:1202). */
  address: string
  city: string
  state: string
}

/*
  Um resultado da caixa "Buscar Localização" (MapaProjetos.jsx:597-607).

  `type` e `addressType` vêm crus do Nominatim e existem só para decidir o zoom
  (`zoomForPlace`); `boundingBox` é `[sul, norte, oeste, leste]`, a mesma ordem
  em que o original desempacota `result.boundingbox` (:643).
*/
export type PlaceSearchResult = {
  lat: number
  lng: number
  displayName: string
  type: string | null
  addressType: string | null
  boundingBox: [number, number, number, number] | null
}

export type ProjectSiteLocation = {
  id: string
  name: string
  site_address_text: string | null
  site_lat: number | null
  site_lng: number | null
  site_place_id: string | null
  site_geocode_status: GeocodeStatus
  site_geocode_updated_at: string | null
  site_pin_manual: boolean
  site_pin_updated_by: string | null
  site_pin_updated_at: string | null
}
