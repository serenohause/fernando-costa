import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { projectKeys } from '@/features/projects/hooks'
import { buildSiteAddress, geocodeAddress, reverseGeocodePin, searchPlaces } from './geocoding'
import { buildMapPropertyFacets, enrichMapProperties } from './list'
import {
  mapPropertyInputSchema,
  movedPinPositionSchema,
  newPinLocationSchema,
} from './schemas'
import type {
  MapFacetSource,
  MapPinLocation,
  MapPinPosition,
  MapPropertyFilters,
  MapPropertyInput,
  MapPropertyRow,
  PlaceSearchResult,
  ProjectSiteLocation,
  ReverseGeocodedPin,
} from './types'

export const mapKeys = {
  all: ['map'] as const,
  list: (filters: MapPropertyFilters) => [...mapKeys.all, 'list', filters] as const,
  facets: () => [...mapKeys.all, 'facets'] as const,
  siteLocations: () => [...mapKeys.all, 'site-locations'] as const,
  places: (query: string) => [...mapKeys.all, 'places', query] as const,
}

/* `PropriedadeMapa.list()` é como o original carrega a tela — a lista inteira. O
   teto é folga para o mapa de um escritório. */
const LIST_LIMIT = 500

const MAP_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    O NOME DA CONSTRAINT ANTES DO CÓDIGO, porque `23514` cobre cinco regras
    diferentes nesta tabela e a frase genérica manda procurar no lugar errado.
  */
  map_properties_project_link_exclusive_check:
    'Escolha um projeto da lista OU digite um nome livre — não os dois.',
  map_properties_client_link_exclusive_check:
    'Escolha um cliente da lista OU digite um nome livre — não os dois.',
  map_properties_not_null_island_check:
    'Localização inválida. Reposicione o pin no mapa.',
  map_properties_lat_range_check: 'Localização inválida. Reposicione o pin no mapa.',
  map_properties_lng_range_check: 'Localização inválida. Reposicione o pin no mapa.',
  map_properties_areas_positive_check: 'As áreas informadas precisam ser maiores que zero.',

  /* As FK são COMPOSTAS com `tenant_id` (migration 0057): o projeto ou o cliente
     escolhido não existe mais, ou não é deste escritório. */
  map_properties_project_id_fkey:
    'O projeto escolhido não existe mais neste escritório.',
  map_properties_client_id_fkey: 'O cliente escolhido não existe mais neste escritório.',

  /* Os dois unique de tag. O schema já remove repetidas antes de gravar, então
     chegar aqui significa gravação vinda de outro caminho. */
  map_property_land_types_property_id_land_type_key:
    'Essa propriedade já tem esse tipo de terreno.',
  map_property_purposes_property_id_purpose_key:
    'Essa propriedade já tem essa finalidade.',

  '23502': 'Falta a coordenada do pino. Clique no mapa para marcar o ponto.',
  '23505': 'Já existe um registro com esses dados neste escritório.',
  '23503': 'O projeto ou o cliente escolhido não existe mais neste escritório.',
  '23514':
    'A propriedade está num estado que o sistema não aceita. Confira a localização, as áreas e o vínculo com projeto e cliente.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, MAP_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  UMA consulta traz o pino com tudo o que a tela desenha.

  Os quatro embeds substituem o que o original faz em memória: dois `lookup` por
  id construídos a partir de `Project.filter()` e `Client.list()`
  (MapaProjetos.jsx:257-272) e dois arrays que viraram tabela filha
  (migration 0057).

  O NOME DO RELACIONAMENTO É O DA CONSTRAINT, e aqui não é preferência: as FK
  deste módulo são compostas, e a de projeto alcança DUAS relações — a tabela
  `projects` e a view `project_progress`, que compartilham `(id, tenant_id)`.
  Sem a dica, o PostgREST não escolhe sozinho.

  `visible_in_list` vem junto de propósito — quem decide o que fazer com ele é
  `enrichMapProperties` (list.ts), e o motivo está lá.

  Leitura larga por decisão da policy `map_properties_select_active_collaborator`
  (migration 0058): qualquer colaborador ativo do escritório lê os pinos. Quem
  esconde o item Mapa da sidebar é a permissão de menu, não a RLS.
*/
const MAP_PROPERTIES_SELECT = `
  *,
  project:projects!map_properties_project_id_fkey(id, name, status, project_type, visible_in_list),
  client:clients!map_properties_client_id_fkey(id, name),
  land_types:map_property_land_types!map_property_land_types_map_property_id_fkey(id, land_type),
  purposes:map_property_purposes!map_property_purposes_map_property_id_fkey(id, purpose)
`

/*
  O FILTRO DE FINALIDADE PRECISA DE UM SEGUNDO EMBED, e não do primeiro.

  Recortar direto em `purposes` com `!inner` filtraria as linhas certas E também
  a lista devolvida em cada linha — o pino com três finalidades voltaria com uma,
  e o resumo (PropertySummaryModal.jsx:87) passaria a mostrar só a que foi
  filtrada. Um embed serve para EXIBIR, o outro só para RECORTAR; os dois saem da
  mesma FK e o Postgres resolve pelo índice
  `map_property_purposes_tenant_id_purpose_idx`.
*/
const PURPOSE_MATCH_EMBED = `
  purpose_match:map_property_purposes!map_property_purposes_map_property_id_fkey!inner(map_property_id)
`

/*
  Devolve as linhas JÁ ENRIQUECIDAS (`displayName`, `clientName`, `statusLabel`,
  `cleanAddress`), que é como a tela as usa do começo ao fim — o
  `enrichedProperties` do original (MapaProjetos.jsx:275).

  Pelo `select` do React Query, e não por `useMemo` no componente: a função é
  pura e importada, então a derivação roda uma vez por resposta e não a cada
  render. Os dois filtros que sobraram para o navegador (`filterMapProperties`)
  dependem de estado da tela e continuam lá.
*/
export function useMapProperties(filters: MapPropertyFilters) {
  return useQuery({
    queryKey: mapKeys.list(filters),
    select: enrichMapProperties,
    queryFn: async (): Promise<MapPropertyRow[]> => {
      const needsPurpose = filters.purpose !== 'all'

      let query = supabase
        .from('map_properties')
        .select(needsPurpose ? `${MAP_PROPERTIES_SELECT}, ${PURPOSE_MATCH_EMBED}` : MAP_PROPERTIES_SELECT)

      if (filters.clientId) query = query.eq('client_id', filters.clientId)
      if (filters.city !== 'all') query = query.eq('city', filters.city)
      if (needsPurpose) query = query.eq('purpose_match.purpose', filters.purpose)

      /*
        A ordem é por criação, decrescente, como o índice
        `map_properties_tenant_id_created_at_idx` prevê. O original não ordena
        nada (desenha o que o `list()` devolver), e a ordem só se vê na lista
        lateral — no mapa, pino não tem ordem.
      */
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as MapPropertyRow[]
    },
  })
}

/*
  AS OPÇÕES DOS TRÊS SELECTS, sobre TODAS as propriedades — e por isso uma
  consulta própria.

  No original os dropdowns e as contagens são calculados sobre
  `enrichedProperties`, que é a lista completa (MapaProjetos.jsx:314-332): o
  contador ao lado de "Goiânia (7)" não muda quando outro filtro é aplicado.
  Como aqui a lista já desce recortada, ela não responde mais essa pergunta —
  quem responde é isto.

  Traz só as colunas que as três contagens usam. É a mesma quantidade de LINHAS
  da tabela, e não de dados: sem coordenada, sem endereço, sem loteamento.
*/
const MAP_FACETS_SELECT = `
  id,
  city,
  visual_status,
  project:projects!map_properties_project_id_fkey(id, status, visible_in_list),
  purposes:map_property_purposes!map_property_purposes_map_property_id_fkey(purpose)
`

export function useMapPropertyFacets() {
  return useQuery({
    queryKey: mapKeys.facets(),
    select: buildMapPropertyFacets,
    queryFn: async (): Promise<MapFacetSource[]> => {
      const { data, error } = await supabase
        .from('map_properties')
        .select(MAP_FACETS_SELECT)
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as MapFacetSource[]
    },
  })
}

/*
  A GEOLOCALIZAÇÃO DA OBRA dos projetos — as oito colunas `site_*` (migration
  0057).

  NÃO É O QUE O MAPA DESENHA, e este hook não alimenta a tela de mapa: quem
  desenha é `useMapProperties`. Existe porque a tela de projeto mostra a
  coordenada abaixo do endereço da obra (ProjectForm.jsx:666) e porque o ajuste
  de pino e a geocodificação precisam ler o estado atual antes de gravar.

  Devolve Map por id, como `useProjectProgress` (módulo 5): o cruzamento é por
  `project_id` na tela.

  Só projeto visível, como todas as leituras de projeto do sistema
  (`useProjects`, migration 0032 e o `visivel_em_projetos` das telas do
  original).
*/
const PROJECT_SITE_COLUMNS =
  'id, name, site_address_text, site_lat, site_lng, site_place_id, site_geocode_status, site_geocode_updated_at, site_pin_manual, site_pin_updated_by, site_pin_updated_at'

export function useProjectSiteLocations() {
  return useQuery({
    queryKey: mapKeys.siteLocations(),
    queryFn: async (): Promise<Map<string, ProjectSiteLocation>> => {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_SITE_COLUMNS)
        .eq('visible_in_list', true)
        .limit(LIST_LIMIT)

      if (error) throw error

      const byProject = new Map<string, ProjectSiteLocation>()
      for (const row of data ?? []) byProject.set(row.id, row)
      return byProject
    },
  })
}

/* ── Geocodificação (rede, não banco) ──────────────────────────────────── */

/*
  Os dois provedores externos ficam em hook pela mesma regra do CLAUDE.md que
  tira o Supabase do componente, e com o mesmo desenho de `useLookupZipcode`
  (módulo 2): o `fetch` mora em geocoding.ts, a resposta passa por Zod, e o
  componente só recebe o que já foi conferido.
*/

/* O clique no mapa em modo "Nova Propriedade" (MapaProjetos.jsx:469). Devolve
   null quando o Nominatim não responde — e a tela abre o formulário só com a
   coordenada, como no original (:511). */
export function useReverseGeocodePin() {
  return useMutation({
    mutationFn: async (position: MapPinPosition): Promise<ReverseGeocodedPin | null> =>
      reverseGeocodePin(position.lat, position.lng),
  })
}

/*
  A caixa "Buscar Localização" (MapaProjetos.jsx:565).

  Query e não mutation: a mesma busca repetida devolve o mesmo resultado, e o
  cache poupa o Nominatim — cuja política de uso pede no máximo uma consulta por
  segundo. O DEBOUNCE de 300ms continua no componente, como no original: ele é
  sobre a digitação, não sobre a consulta.
*/
export function useSearchPlaces(query: string) {
  const term = query.trim()

  return useQuery({
    queryKey: mapKeys.places(term),
    enabled: term.length >= 3,
    queryFn: async (): Promise<PlaceSearchResult[]> => searchPlaces(term),
  })
}

/* ── Escrita: o pino ───────────────────────────────────────────────────── */

/*
  Sincroniza as tags de uma propriedade com o que o formulário deixou na lista.

  No original os dois campos são arrays dentro da própria linha, reescritos
  inteiros a cada gravação. Aqui são linhas: só o que mudou é tocado, o unique
  `(map_property_id, tag)` impede repetição, e remover uma tag é um DELETE — que
  exige a mesma permissão de editar a propriedade (`can_edit_menu('map')`,
  migration 0058).

  Mesmo desenho de `syncBrands` (módulo 8) e `syncServices` (módulo 3), e pelo
  mesmo motivo: apagar tudo e reinserir trocaria o id de tags que ninguém tocou.

  DUAS FUNÇÕES E NÃO UMA GENÉRICA: a diferença entre elas é o nome da tabela e o
  da coluna, e os dois são literais que o tipo gerado do Supabase precisa
  conhecer em tempo de compilação. Uma função parametrizada trocaria a conferência
  de tipo do cliente por um `as` — o que é caro justamente aqui, onde a coluna
  errada gravaria finalidade dentro de tipo de terreno.
*/
function partitionTags(existing: { id: string; value: string }[], desired: string[]) {
  const wanted = new Set(desired)
  const present = new Set(existing.map((row) => row.value))

  return {
    toRemove: existing.filter((row) => !wanted.has(row.value)).map((row) => row.id),
    toAdd: desired.filter((tag) => !present.has(tag)),
  }
}

async function syncLandTypes(
  propertyId: string,
  tenantId: string,
  desired: string[],
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('map_property_land_types')
    .select('id, land_type')
    .eq('map_property_id', propertyId)

  if (readError) throw readError

  const { toRemove, toAdd } = partitionTags(
    (data ?? []).map((row) => ({ id: row.id, value: row.land_type })),
    desired,
  )

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('map_property_land_types')
      .delete()
      .in('id', toRemove)
    if (error) throw error
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('map_property_land_types').insert(
      toAdd.map((land_type) => ({
        tenant_id: tenantId,
        map_property_id: propertyId,
        land_type,
      })),
    )
    if (error) throw error
  }
}

async function syncPurposes(
  propertyId: string,
  tenantId: string,
  desired: string[],
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('map_property_purposes')
    .select('id, purpose')
    .eq('map_property_id', propertyId)

  if (readError) throw readError

  const { toRemove, toAdd } = partitionTags(
    (data ?? []).map((row) => ({ id: row.id, value: row.purpose })),
    desired,
  )

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('map_property_purposes')
      .delete()
      .in('id', toRemove)
    if (error) throw error
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('map_property_purposes').insert(
      toAdd.map((purpose) => ({
        tenant_id: tenantId,
        map_property_id: propertyId,
        purpose,
      })),
    )
    if (error) throw error
  }
}

/*
  Criar o pino (MapaProjetos.jsx:527), no MODO NÃO-INTRUSIVO que o próprio
  original descreve: "apenas criar registro de pin. Sem criar projeto, sem
  alterar projeto, sem alterar cliente" (:537). Vincular um pino a um projeto
  grava `project_id` aqui e não encosta em `projects`.

  AS COLUNAS SÃO LISTADAS UMA A UMA, e não espalhadas do formulário, por causa de
  três campos que NÃO vêm dele:

  - `lat`/`lng`, `city` e `state` vêm do clique e do reverse geocoding
    (`MapPinLocation`), não do formulário.
  - `address` TAMBÉM vem do clique, e aqui está uma divergência do original que
    ESTÁ SENDO REPRODUZIDA, não corrigida: o formulário de criação mostra o
    endereço detectado num input editável (ProjectForm.jsx:421-425), e a
    gravação usa `modalData.address` — o valor de ANTES da edição
    (MapaProjetos.jsx:546). Editar o endereço ao criar um pino não tem efeito
    nenhum no original. Na EDIÇÃO o mesmo campo funciona (:762). Está reportado
    ao usuário; corrigir sozinho seria mudar o comportamento da tela.
*/
export function useCreateMapProperty() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async ({
      location,
      input,
    }: {
      location: MapPinLocation
      input: MapPropertyInput
    }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const pin = newPinLocationSchema.parse(location)
      const parsed = mapPropertyInputSchema.parse(input)

      const { data, error } = await supabase
        .from('map_properties')
        .insert({
          tenant_id: tenantId,
          lat: pin.lat,
          lng: pin.lng,

          project_id: parsed.project_id,
          project_label: parsed.project_label,
          client_id: parsed.client_id,
          client_label: parsed.client_label,

          address: pin.address,
          city: pin.city,
          state: pin.state,

          land_area_m2: parsed.land_area_m2,
          project_area_m2: parsed.project_area_m2,

          subdivision_name: parsed.subdivision_name,
          subdivision_block: parsed.subdivision_block,
          subdivision_lot: parsed.subdivision_lot,

          visual_status: parsed.visual_status,
        })
        .select('id')
        .single()

      if (error) throw error

      await syncLandTypes(data.id, tenantId, parsed.land_types)
      await syncPurposes(data.id, tenantId, parsed.purposes)
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.all })
    },
  })
}

/*
  "Editar Informações" (MapaProjetos.jsx:744).

  NÃO TOCA em `lat`, `lng`, `city` nem `state`: a lista de campos é a do original
  (:752-764), e lá `city`/`state` ficam congelados no que o reverse geocoding
  gravou na criação. Mover o pino é `useMoveMapPropertyPin`.
*/
export function useUpdateMapProperty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: MapPropertyInput }) => {
      const parsed = mapPropertyInputSchema.parse(input)
      const { land_types, purposes, ...columns } = parsed

      const { data, error } = await supabase
        .from('map_properties')
        .update(columns)
        .eq('id', id)
        .select('id, tenant_id')

      if (error) throw error
      /*
        Escrita negada pela RLS em UPDATE não vira erro: a linha só não é
        alcançada e o PostgREST devolve zero linhas. Sem esta conferência a tela
        diria "Informações atualizadas" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhuma propriedade foi alterada. É preciso permissão de edição em Mapa de Projetos.',
      )

      /* O `tenant_id` das tags sai da LINHA alcançada, e não do claim da sessão:
         é o mesmo que a FK composta vai cobrar. */
      await syncLandTypes(id, data[0].tenant_id, land_types)
      await syncPurposes(id, data[0].tenant_id, purposes)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.all })
    },
  })
}

/*
  "Ajustar Localização": arrastar o pino e salvar (MapaProjetos.jsx:380-398).

  DUAS COLUNAS, e não a linha inteira — é exatamente o que o original manda
  (:393-396), e é o que evita que salvar uma posição reescreva vínculo, tags e
  áreas com a cópia que o navegador tinha em mãos.

  Este é o pino de `map_properties`. O pino da OBRA (`projects.site_lat`) é outro
  dado, com outro provedor e outra mutation — `useAdjustProjectSitePin`.
*/
export function useMoveMapPropertyPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, position }: { id: string; position: MapPinPosition }) => {
      const { lat, lng } = movedPinPositionSchema.parse(position)

      const { data, error } = await supabase
        .from('map_properties')
        .update({ lat, lng })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A localização não foi alterada. É preciso permissão de edição em Mapa de Projetos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.all })
    },
  })
}

/*
  "Remover do Mapa" (MapaProjetos.jsx:1267).

  As tags somem junto, por cascade — elas são parte do pino. O projeto e o
  cliente vinculados NÃO somem, que é o que o próprio diálogo do original promete
  ("O projeto vinculado continuará existindo normalmente", :1328).
*/
export function useDeleteMapProperty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('map_properties')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma propriedade foi removida. É preciso permissão de edição em Mapa de Projetos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.all })
    },
  })
}

/* ── Escrita: a geolocalização da obra ─────────────────────────────────── */

/*
  Porta de `updateProjectGeolocation` (geocoding.jsx:67).

  A PARTE QUE FALA COM O BANCO MORA AQUI, e não em geocoding.ts, pela regra do
  CLAUDE.md: a função do original faz `Project.filter`, decide e faz
  `Project.update`; aqui a decisão e as duas idas ao banco viram mutation, e
  geocoding.ts fica com o que é só rede e texto.

  No original quem chama isto é a tela de CONTRATOS, ao aprovar um contrato que
  gerou projeto (Contracts.jsx:205 e :594) — não o mapa. Vive na feature de mapa
  porque o dado que ela grava é geolocalização, e é aqui que a geolocalização
  deste sistema está descrita inteira.

  O `site_pin_manual` É CONFERIDO, e no original essa conferência é código morto:
  o campo nunca vira `true` lá (as três escritas o põem em `false` —
  ProjectForm.jsx:63 e :127, geocoding.jsx:109). Ela deixa de ser morta se
  `useAdjustProjectSitePin` for usada; ver o aviso lá embaixo.

  Devolve o mesmo formato do original — `{ success }` e não exceção — porque a
  tela de contratos ignora a falha de propósito: contrato aprovado não deixa de
  ser aprovado porque o endereço não geocodificou.
*/
export function useGeocodeProjectSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      contractId,
      forceRecalculate = false,
    }: {
      contractId: string
      forceRecalculate?: boolean
    }): Promise<{ success: boolean; error?: string }> => {
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('id, site_street, site_number, site_complement, site_city, site_state, site_zipcode')
        .eq('id', contractId)
        .maybeSingle()

      if (contractError) throw contractError
      if (!contract) return { success: false, error: 'Contrato não encontrado' }

      /*
        O ORIGINAL VAI NA DIREÇÃO CONTRÁRIA: lá `contract.project_id` aponta para
        o projeto (geocoding.jsx:68). Aqui a FK é `projects.contract_id`
        (migration 0032, "lado único da ligação") — mesma relação, do outro lado.

        `limit(1)` porque a coluna NÃO é única: o fluxo cria um projeto por
        contrato, mas nada no schema impede dois. O mais antigo é o que nasceu
        com o contrato. O original não passa por isso — ele já chega com o id.
      */
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, site_pin_manual')
        .eq('contract_id', contract.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (projectError) throw projectError
      if (!project) return { success: false, error: 'Projeto não vinculado' }

      if (project.site_pin_manual && !forceRecalculate) {
        return { success: false, error: 'Pin manual - recalculo não permitido' }
      }

      const siteAddress = buildSiteAddress(contract)
      if (!siteAddress) return { success: false, error: 'Endereço vazio' }

      const result = await geocodeAddress(siteAddress)
      const geocodedAt = new Date().toISOString()

      const { data, error } = await supabase
        .from('projects')
        .update(
          result.success
            ? {
                site_address_text: siteAddress,
                site_lat: result.lat,
                site_lng: result.lng,
                site_place_id: result.place_id,
                site_geocode_status: 'ok' as const,
                site_geocode_updated_at: geocodedAt,
                /* Só no recálculo forçado, como no original (geocoding.jsx:109). */
                ...(forceRecalculate ? { site_pin_manual: false } : {}),
              }
            : {
                site_address_text: siteAddress,
                site_geocode_status: 'failed' as const,
                site_geocode_updated_at: geocodedAt,
              },
        )
        .eq('id', project.id)
        .select('id')

      if (error) throw error
      /*
        Gravar geolocalização de obra passa pela policy de `projects` (menu
        `projects`, migration 0033), e NÃO pela do mapa: quem só tem `map` move
        pino do mapa e não escreve isto. É a consequência que a 0058 registra.
      */
      assertRowAffected(
        data,
        'A localização da obra não foi gravada. É preciso permissão de edição em Projetos.',
      )

      return result.success ? { success: true } : { success: false, error: result.error }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.siteLocations() })
      /* A gravação é em `projects`: quem lê a tela de Projetos precisa saber. */
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/*
  ⚠ ESTA MUTATION NÃO TEM CORRESPONDENTE NO ORIGINAL. Está aqui porque a
  instrução deste módulo a pediu junto da leitura dos oito campos `site_*`, e a
  divergência está reportada ao usuário — não decida por ela sem ler isto:

  1. NENHUMA tela do original escreve `obra_pin_manual`, `obra_pin_updated_by` ou
     `obra_pin_updated_at`. As colunas existem na entidade e ninguém as preenche
     (migration 0057, pontos (a) e (b)). Ajustar o pino da obra é uma tela que o
     original NÃO tem — o que ele tem é o ajuste do pino do MAPA, que é outro
     dado e já é `useMoveMapPropertyPin`.

  2. Ao gravar `site_pin_manual = true`, esta mutation LIGA uma proteção que hoje
     nunca liga: `useGeocodeProjectSite` passa a recusar recalcular o endereço
     daquele projeto até que alguém peça recálculo forçado. É o comportamento que
     a coluna descreve e para o qual ela foi criada — e é uma mudança real em
     relação ao original, onde o recálculo sempre acontece.

  3. `site_pin_updated_by` guarda o COLABORADOR, não o usuário do Auth: a FK é
     composta para `collaborators` (migration 0057), pelo mesmo critério de
     `projects.operational_responsible_id`.

  Enquanto nenhuma tela a chamar, nada disso acontece. Se a decisão for não ter
  ajuste manual de pino de obra, o certo é APAGAR esta função — coluna sem quem
  escreva é herança documentada; função sem quem chame é código morto.
*/
export function useAdjustProjectSitePin() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      projectId,
      position,
    }: {
      projectId: string
      position: MapPinPosition
    }) => {
      if (!collaborator) throw new WriteError('Colaborador não identificado na sua sessão.')

      const { lat, lng } = movedPinPositionSchema.parse(position)

      const { data, error } = await supabase
        .from('projects')
        .update({
          site_lat: lat,
          site_lng: lng,
          site_pin_manual: true,
          site_pin_updated_by: collaborator.id,
          site_pin_updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A localização da obra não foi alterada. É preciso permissão de edição em Projetos.',
      )
      return projectId
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.siteLocations() })
      /* A gravação é em `projects`: quem lê a tela de Projetos precisa saber. */
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
