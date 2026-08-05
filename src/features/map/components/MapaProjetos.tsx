import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L, { type LatLng, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
/* `Map` do Lucide colide com o `Map` do JavaScript, que este arquivo não usa mas
   o TypeScript enxerga. O ícone é o mesmo do original (MapaProjetos.jsx:12). */
import { Edit3, Map as MapIcon, MapPin, Satellite, Save, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import LoadingPage from '@/components/shared/LoadingPage'
import PageHeader from '@/components/shared/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMenuPermissions } from '@/features/auth/hooks'
import { useClients } from '@/features/crm/hooks'
import type { ClientListRow } from '@/features/crm/types'
import { useProjects } from '@/features/projects/hooks'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { zoomForPlace } from '../geocoding'
import {
  describeDatabaseError,
  useCreateMapProperty,
  useDeleteMapProperty,
  useMapProperties,
  useMapPropertyFacets,
  useMoveMapPropertyPin,
  useReverseGeocodePin,
  useSearchPlaces,
  useUpdateMapProperty,
} from '../hooks'
import { filterMapProperties } from '../list'
import { movedPinPositionSchema, newPinLocationSchema } from '../schemas'
import type {
  EnrichedMapProperty,
  MapPinLocation,
  MapPropertyFilters,
  MapPropertyInput,
  PlaceSearchResult,
} from '../types'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_LAYERS, searchResultIcon, type MapType } from './leaflet-setup'
import { DraggableMarker, MapController } from './MapController'
import MapPropertyForm, {
  toCreateValues,
  toEditValues,
  type MapPropertyFormValues,
} from './MapPropertyForm'
import PropertyPopup from './PropertyPopup'
import PropertySummaryModal from './PropertySummaryModal'

/*
  Porta de projeto-original/src/pages/MapaProjetos.jsx.

  O cabeçalho, o botão de marcar propriedade, a coluna de 30% com a caixa azul de
  busca de localização, o cartão de filtros, o cartão do cliente escolhido, a
  lista lateral, o mapa de 70% com os dois botões de camada, a barra de ajuste de
  pino, o balão do pino e os quatro modais são os do original, na mesma ordem e
  com o mesmo microcopy.

  ────────────────────────────────────────────────────────────────────────────
  AUTORIZAÇÃO — DIVERGÊNCIA CONSCIENTE, a mesma já feita em Fornecedores.

  Esta tela do original não conhece permissão: qualquer pessoa que a abra vê os
  botões de criar, editar, mover e remover pino. O banco discorda —
  `can_edit_menu('map')` (migration 0058) exige a linha gravada para quem não é
  Diretor, e UPDATE/DELETE negados pela RLS não levantam erro, simplesmente não
  alcançam a linha (é o que `assertRowAffected` converte em frase).

  Seguir o original aqui mostraria botão que termina em erro. Então quem manda é
  o BANCO: `useMenuPermissions('map')` esconde a escrita. A LEITURA continua
  larga, como lá — qualquer colaborador ativo do escritório vê os pinos
  (`map_properties_select_active_collaborator`).
  ────────────────────────────────────────────────────────────────────────────

  DEFEITOS DO ORIGINAL CORRIGIDOS, cada um comentado no ponto em que acontece.

  A regra que valia até aqui era reproduzir o defeito junto com o resto; ela
  mudou: aparência, microcopy e layout continuam fiéis, mas comportamento que
  perde dado, impede entrada, impede ação ou diz coisa falsa é corrigido.

  1. Área em m² não aceitava decimal e transformava "0" em "não informado"
     (MapPropertyForm.tsx, `parseArea`).
  2. Editar o endereço ao CRIAR um pino não tinha efeito (hooks.ts,
     `useCreateMapProperty`).
  3. A lista de resultados da busca de localização reabria sozinha depois da
     escolha (`handleSelectGeoResult`, abaixo).
  4. Salvar "Editar Informações" mostrava DOIS toasts de sucesso
     (`handleUpdatePropertyInfo`, abaixo).
  5. O botão da camada ativa ficava com texto branco sobre fundo branco (os dois
     botões de camada, abaixo).
  6. A validação de coordenada recusava latitude OU longitude igual a zero, e com
     isso um pino legítimo em Macapá (schemas.ts, `withPinRules`).
  7. Pino preso a projeto que não está visível virava "Sem nome" (list.ts,
     `enrichMapProperties`).
  8. `visual_status` era gravado mesmo em pino vinculado a projeto, onde a
     leitura o ignora (hooks.ts, `visualStatusColumn`).

  NÃO PORTADO: `showOnlyNoLocation` (:126), estado declarado e nunca usado —
  virar um filtro de verdade seria feature nova, não migração. `replaceModal`
  (:425) e `ADDRESS_CHANGE` também não existem aqui, pelo mesmo motivo: ninguém
  os chama.

  NÃO EXISTE FILTRO POR TIPO DE TERRENO. Os cinco filtros são cliente, nome,
  status, cidade e finalidade; `terreno_tipo` só decide se o bloco de loteamento
  aparece.
*/

/*
  O gerente de modal do original (:143-145), com o dado de cada um junto.

  Lá são duas variáveis soltas (`activeModal` e `modalData`) e `modalData` guarda
  ora a coordenada de um pino novo, ora a propriedade inteira. Aqui é uma união:
  o mesmo comportamento, com o compilador conferindo que a tela não leia
  `property` quando o que está aberto é a criação.
*/
type MapModal =
  | { type: 'CREATE'; location: MapPinLocation }
  | { type: 'EDIT'; property: EnrichedMapProperty }
  | { type: 'SUMMARY'; property: EnrichedMapProperty }
  | { type: 'DELETE'; property: EnrichedMapProperty }

export default function MapaProjetos() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [purposeFilter, setPurposeFilter] = useState('all')

  /* Busca por cliente (CRM) */
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [selectedClient, setSelectedClient] = useState<ClientListRow | null>(null)
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)

  const [selectedProperty, setSelectedProperty] = useState<EnrichedMapProperty | null>(null)
  const [editingPin, setEditingPin] = useState<EnrichedMapProperty | null>(null)
  const [tempMarkerPosition, setTempMarkerPosition] = useState<[number, number] | null>(null)
  const [addingMode, setAddingMode] = useState(false)
  const [tempNewPin, setTempNewPin] = useState<[number, number] | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState<number | null>(DEFAULT_ZOOM)
  const [mapType, setMapType] = useState<MapType>('standard')
  const [isButtonDisabled, setIsButtonDisabled] = useState(false)
  const [shouldFitBounds, setShouldFitBounds] = useState(false)

  const [modal, setModal] = useState<MapModal | null>(null)

  /* Busca geolocalização */
  const [geoSearchTerm, setGeoSearchTerm] = useState('')
  const [showGeoResults, setShowGeoResults] = useState(false)
  const [searchMarker, setSearchMarker] = useState<{
    lat: number
    lng: number
    label: string
  } | null>(null)

  const mapRef = useRef<LeafletMap | null>(null)

  const { canEdit } = useMenuPermissions('map')

  /*
    Cliente, cidade e finalidade viram WHERE (types.ts, `MapPropertyFilters`); o
    nome e o status continuam sendo peneirados no navegador, por
    `filterMapProperties`.
  */
  const filters = useMemo<MapPropertyFilters>(
    () => ({
      clientId: selectedClient?.id ?? null,
      city: cityFilter,
      purpose: purposeFilter,
    }),
    [selectedClient, cityFilter, purposeFilter],
  )

  const propertiesQuery = useMapProperties(filters)
  const facetsQuery = useMapPropertyFacets()
  const projectsQuery = useProjects()
  const clientsQuery = useClients('')

  const createMutation = useCreateMapProperty()
  const updateMutation = useUpdateMapProperty()
  const movePinMutation = useMoveMapPropertyPin()
  const deleteMutation = useDeleteMapProperty()
  const reverseGeocode = useReverseGeocodePin()

  const properties = useMemo(() => propertiesQuery.data ?? [], [propertiesQuery.data])
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data])

  /*
    O MEMO NÃO É OTIMIZAÇÃO — é o que impede um laço de renderização.

    No original `filteredProperties` é recalculado a cada render e entra como
    dependência do efeito de auto-zoom (:364). O efeito chama
    `setMapCenter([lat, lng])`, um array NOVO a cada vez, que muda o estado, que
    renderiza de novo, que refaz o filtro, que dispara o efeito... enquanto
    houver qualquer filtro ativo. Com a lista memoizada e o centro comparado por
    valor (`applyView`, abaixo), o comportamento visível é o mesmo e o laço não
    existe.
  */
  const filteredProperties = useMemo(
    () => filterMapProperties(properties, { search: searchTerm, statusLabel: statusFilter }),
    [properties, searchTerm, statusFilter],
  )

  const facets = facetsQuery.data

  /* As contagens dos selects vêm de TODAS as propriedades, e não do recorte —
     como no original. Se não há nenhuma, também não há nada para a lista
     mostrar. */
  const hasAnyProperty = (facets?.statuses.length ?? 0) > 0

  const applyView = useCallback(
    (center: [number, number], zoom: number | null, fitBounds: boolean) => {
      setMapCenter((current) =>
        current[0] === center[0] && current[1] === center[1] ? current : center,
      )
      setMapZoom(zoom)
      setShouldFitBounds(fitBounds)
    },
    [],
  )

  /* Auto-zoom quando os filtros mudam (:335-364), com a mesma ordem de decisão:
     um resultado aproxima, vários enquadram o conjunto. */
  useEffect(() => {
    if (filteredProperties.length === 0) return

    if (selectedClient || cityFilter !== 'all' || purposeFilter !== 'all') {
      if (filteredProperties.length === 1) {
        const property = filteredProperties[0]
        applyView([property.lat, property.lng], 16, false)
      } else {
        const bounds = L.latLngBounds(
          filteredProperties.map((property) => [property.lat, property.lng] as [number, number]),
        )
        const center = bounds.getCenter()
        applyView([center.lat, center.lng], null, true)
      }
    } else if (searchTerm) {
      if (filteredProperties.length === 1) {
        const property = filteredProperties[0]
        applyView([property.lat, property.lng], 18, false)
        setSelectedProperty(property)
      } else {
        const bounds = L.latLngBounds(
          filteredProperties.map((property) => [property.lat, property.lng] as [number, number]),
        )
        const center = bounds.getCenter()
        applyView([center.lat, center.lng], null, true)
      }
    }
  }, [searchTerm, selectedClient, cityFilter, purposeFilter, filteredProperties, applyView])

  /* ── Pino: ajustar localização ─────────────────────────────────────────── */

  const handleEditPin = (property: EnrichedMapProperty) => {
    setEditingPin(property)
    setTempMarkerPosition([property.lat, property.lng])
    setSelectedProperty(null)
  }

  const handleMarkerDragEnd = useCallback((latlng: LatLng) => {
    setTempMarkerPosition([latlng.lat, latlng.lng])
  }, [])

  const handleSavePin = () => {
    if (!editingPin || !tempMarkerPosition) return

    /*
      A REGRA AGORA É A DO BANCO: cai só o par (0,0). O original recusa latitude
      OU longitude igual a zero (:386), e latitude zero é a linha do Equador, que
      corta o Amapá — um pino em Macapá era recusado. Está em
      `movedPinPositionSchema`, com a mesma frase de erro do original.
    */
    const parsed = movedPinPositionSchema.safeParse({
      lat: tempMarkerPosition[0],
      lng: tempMarkerPosition[1],
    })

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Localização inválida. Reposicione o pin.')
      return
    }

    movePinMutation.mutate(
      { id: editingPin.id, position: parsed.data },
      {
        onSuccess: () => {
          toast.success('Propriedade atualizada')
          setEditingPin(null)
          setTempMarkerPosition(null)
        },
        onError: (error) => toast.error(describeDatabaseError(error)),
      },
    )
  }

  const handleCancelEdit = () => {
    setEditingPin(null)
    setTempMarkerPosition(null)
  }

  const handleCenterOnProperty = (property: EnrichedMapProperty) => {
    if (property.lat && property.lng) {
      applyView([property.lat, property.lng], 18, false)
      setSelectedProperty(property)
    }
  }

  /* ── Pino novo ─────────────────────────────────────────────────────────── */

  const closeModal = () => setModal(null)

  const handleMapClick = useCallback(
    async (latlng: LatLng) => {
      if (!addingMode) return

      const { lat, lng } = latlng
      setTempNewPin([lat, lng])

      /* Reverse geocoding pelo Nominatim; falhar não impede marcar o pino — o
         formulário abre só com a coordenada, como no original (:511-517). */
      try {
        const address = await reverseGeocode.mutateAsync({ lat, lng })

        if (!address) {
          toast.error('Não foi possível obter o endereço desta localização')
        }

        setModal({
          type: 'CREATE',
          location: {
            lat,
            lng,
            address: address?.address ?? null,
            city: address?.city ?? null,
            state: address?.state ?? null,
          },
        })
      } catch {
        toast.error('Não foi possível obter o endereço desta localização')
        setModal({ type: 'CREATE', location: { lat, lng, address: null, city: null, state: null } })
      }

      setAddingMode(false)
    },
    [addingMode, reverseGeocode],
  )

  const handleCancelNewProperty = () => {
    closeModal()
    setTempNewPin(null)
    setAddingMode(false)
  }

  const handlePropertyCreated = (input: MapPropertyInput) => {
    if (modal?.type !== 'CREATE') return

    /* Mesma regra de cima, com a segunda frase do original (:533). */
    const parsed = newPinLocationSchema.safeParse(modal.location)
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? 'Localização inválida. Clique novamente no mapa.',
      )
      return
    }

    /*
      MODO NÃO-INTRUSIVO, palavras do original (:537): grava só o pino. Não cria
      projeto, não altera projeto, não altera cliente.
    */
    createMutation.mutate(
      { location: modal.location, input },
      {
        onSuccess: () => {
          toast.success('Propriedade criada no mapa')
          setEditingPin(null)
          setTempMarkerPosition(null)
          closeModal()
          setTempNewPin(null)
        },
        /* O original só escreve 'Erro ao criar a propriedade' e manda o motivo
           para o console. A frase do banco entra depois dos dois pontos: é ela
           que distingue "sem permissão" de "esse projeto não existe mais". */
        onError: (error) => toast.error('Erro ao criar a propriedade: ' + describeDatabaseError(error)),
      },
    )
  }

  /* ── Pino existente: informações, resumo, remoção ──────────────────────── */

  const handleEditPropertyInfo = (property: EnrichedMapProperty) => {
    mapRef.current?.closePopup()
    setSelectedProperty(null)
    /* Busca a propriedade recém-lida pelo id, para não editar uma cópia velha
       (:740). */
    const full = properties.find((item) => item.id === property.id) ?? property
    setModal({ type: 'EDIT', property: full })
  }

  const handleUpdatePropertyInfo = (input: MapPropertyInput) => {
    if (modal?.type !== 'EDIT') return

    updateMutation.mutate(
      { id: modal.property.id, input },
      {
        onSuccess: () => {
          /*
            UM TOAST SÓ. O original mostra DOIS empilhados para a mesma gravação:
            "Propriedade atualizada", do `onSuccess` da mutation compartilhada
            com o ajuste de pino (:240), e "Informações atualizadas", do fim
            deste handler (:769). Fica o segundo, que é o que descreve esta ação
            — o primeiro continua sendo o do "Ajustar Localização"
            (`handleSavePin`), que é de quem ele é. Nenhuma frase nova.
          */
          setEditingPin(null)
          setTempMarkerPosition(null)
          closeModal()
          setSelectedProperty(null)
          toast.success('Informações atualizadas')
        },
        onError: (error) =>
          toast.error('Erro ao atualizar informações: ' + describeDatabaseError(error)),
      },
    )
  }

  const handleViewPropertySummary = (property: EnrichedMapProperty) => {
    mapRef.current?.closePopup()
    const full = properties.find((item) => item.id === property.id) ?? property
    setModal({ type: 'SUMMARY', property: full })
  }

  /* Fecha o balão do Leaflet antes de abrir a confirmação — sem isso o balão
     fica por cima do diálogo (:723-729). */
  const handleRemovePinClick = (property: EnrichedMapProperty) => {
    mapRef.current?.closePopup()
    setModal({ type: 'DELETE', property })
  }

  const handleConfirmRemovePin = () => {
    if (modal?.type !== 'DELETE') return

    deleteMutation.mutate(modal.property.id, {
      onSuccess: () => {
        toast.success('Propriedade removida do mapa')
        closeModal()
        setSelectedProperty(null)
      },
      /* O original não trata falha nenhuma aqui. Sem permissão de edição a
         exclusão não alcança a linha, e é `assertRowAffected` quem transforma
         isso em frase. */
      onError: (error) => toast.error('Erro ao remover: ' + describeDatabaseError(error)),
    })
  }

  /* ── Busca de localização (Nominatim) ──────────────────────────────────── */

  /*
    O DEBOUNCE DE 300ms É O DO ORIGINAL (:623), e ele é obrigatório: a política de
    uso do Nominatim pede no máximo uma consulta por segundo. O cache do React
    Query poupa a repetição por cima disso.
  */
  const debouncedGeoTerm = useDebouncedValue(geoSearchTerm, 300)
  const placesQuery = useSearchPlaces(debouncedGeoTerm)
  const geoResults = useMemo(() => placesQuery.data ?? [], [placesQuery.data])

  /*
    O NOME DO LUGAR JÁ ESCOLHIDO, guardado para não reabrir a lista por causa
    dele. Ref e não estado: nada na tela depende deste valor, e ele é lido dentro
    do efeito abaixo, que roda depois do debounce.
  */
  const chosenPlaceLabel = useRef<string | null>(null)

  /*
    Abrir a lista quando o resultado chega é o que `handleGeoSearch` faz (:592 e
    :608). No original isso também a REABRE ~300ms depois de a pessoa escolher um
    lugar: escolher grava o nome do resultado no campo (:681), o campo dispara
    outra busca, e a lista volta por cima do mapa sem ninguém ter pedido — e sem
    clique-fora, só o X a fecha.

    CORRIGIDO com uma condição: o resultado que chega para o termo que a própria
    escolha escreveu não abre a lista. Qualquer outra digitação abre, como antes,
    e clicar no campo de novo também (`onFocus`, abaixo) — nada foi tirado.
  */
  useEffect(() => {
    if (debouncedGeoTerm.trim().length < 3) {
      setShowGeoResults(false)
      return
    }
    if (debouncedGeoTerm === chosenPlaceLabel.current) return
    if (placesQuery.data) setShowGeoResults(true)
  }, [debouncedGeoTerm, placesQuery.data])

  const handleSelectGeoResult = (result: PlaceSearchResult) => {
    chosenPlaceLabel.current = result.displayName

    setSearchMarker({ lat: result.lat, lng: result.lng, label: result.displayName })

    if (result.boundingBox) {
      const [south, north, west, east] = result.boundingBox
      const bounds = L.latLngBounds([
        [south, west],
        [north, east],
      ])
      const center = bounds.getCenter()
      /* `zoom` nulo é o combinado com o MapController para enquadrar bounds. */
      applyView([center.lat, center.lng], null, true)
    } else {
      applyView([result.lat, result.lng], zoomForPlace(result), false)
    }

    setShowGeoResults(false)
    setGeoSearchTerm(result.displayName)

    toast.success('Localização encontrada')
  }

  const handleClearGeoSearch = () => {
    setGeoSearchTerm('')
    setShowGeoResults(false)
    setSearchMarker(null)
    chosenPlaceLabel.current = null
  }

  /* ── Busca por cliente (CRM) ───────────────────────────────────────────── */

  const clientSuggestions = useMemo(() => {
    if (clientSearchTerm.length < 2) return []

    const term = clientSearchTerm.toLowerCase()
    return clients.filter((client) => client.name.toLowerCase().includes(term)).slice(0, 5)
  }, [clientSearchTerm, clients])

  const handleSelectClient = (client: ClientListRow) => {
    setSelectedClient(client)
    setClientSearchTerm(client.name)
    setShowClientSuggestions(false)

    /* A contagem é sobre a lista que está em mãos, como no original (:708) — a
       consulta com o filtro novo ainda nem saiu. */
    const clientProperties = properties.filter((property) => property.client_id === client.id)

    if (clientProperties.length > 0) {
      toast.success(`${clientProperties.length} propriedade(s) encontrada(s)`)
    } else {
      toast.info('Este cliente não possui propriedades no mapa')
    }
  }

  const handleClearClient = () => {
    setSelectedClient(null)
    setClientSearchTerm('')
    setShowClientSuggestions(false)
  }

  /* ── Formulários ───────────────────────────────────────────────────────── */

  const createFormValues = useMemo<MapPropertyFormValues | null>(
    () => (modal?.type === 'CREATE' ? toCreateValues(modal.location) : null),
    [modal],
  )

  const editFormValues = useMemo<MapPropertyFormValues | null>(
    () => (modal?.type === 'EDIT' ? toEditValues(modal.property) : null),
    [modal],
  )

  /* ── Os três estados ───────────────────────────────────────────────────── */

  if (propertiesQuery.isLoading || projectsQuery.isLoading) {
    return <LoadingPage />
  }

  if (propertiesQuery.isError) {
    /* O original não distingue falha de leitura de "não há pino nenhum": os dois
       desenham o mapa vazio. */
    return (
      <div className="h-[calc(100vh-8rem)]">
        <PageHeader
          title="Mapa de Projetos"
          subtitle="Visualize a localização de todos os projetos no mapa"
        />
        <ErrorState
          title="Não foi possível carregar o mapa"
          description="As propriedades do mapa não puderam ser lidas agora."
          error={propertiesQuery.error}
          onRetry={() => {
            void propertiesQuery.refetch()
          }}
        />
      </div>
    )
  }

  const tileLayer = TILE_LAYERS[mapType]

  return (
    <div className="h-[calc(100vh-8rem)]">
      <PageHeader
        title="Mapa de Projetos"
        subtitle="Visualize a localização de todos os projetos no mapa"
      />

      {canEdit && (
        <div className="flex gap-3 mb-4">
          <Button
            onClick={() => {
              if (modal) {
                closeModal()
              }
              setIsButtonDisabled(true)
              setAddingMode(!addingMode)
              setTimeout(() => setIsButtonDisabled(false), 500)
            }}
            disabled={isButtonDisabled}
            variant={addingMode ? 'default' : 'outline'}
            className={addingMode ? 'bg-primary' : ''}
          >
            <MapPin className="w-4 h-4 mr-2" />
            {addingMode ? 'Clique no mapa para marcar' : '+ Nova Propriedade no Mapa'}
          </Button>
          {addingMode && (
            <Button variant="outline" onClick={() => setAddingMode(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-6 h-full mt-6">
        {/* Lista lateral - 30% */}
        <div className="w-[30%] flex flex-col gap-4 overflow-hidden">
          {/* Busca Geográfica (destaque) */}
          <Card className="p-4 bg-gradient-to-br from-blue-50 dark:from-blue-950/40 to-card border-2 border-blue-200 dark:border-blue-900">
            <div className="relative">
              <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Buscar Localização
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                🌍 Encontre qualquer lugar no mundo: ruas, estabelecimentos, cidades, bairros,
                países, hotéis, pontos de referência
              </p>
              <div className="relative">
                <Input
                  placeholder="Ex: Torre Eiffel, Times Square, Copacabana, Shibuya..."
                  value={geoSearchTerm}
                  onChange={(e) => setGeoSearchTerm(e.target.value)}
                  onFocus={() => geoResults.length > 0 && setShowGeoResults(true)}
                  className="pr-8 border-blue-300 dark:border-blue-800 focus:border-blue-500 focus:ring-blue-500"
                />
                {geoSearchTerm && (
                  <button
                    onClick={handleClearGeoSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-soft"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showGeoResults && geoResults.length > 0 && (
                <div className="absolute z-1001 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-auto">
                  {geoResults.map((result, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectGeoResult(result)}
                      className="w-full text-left px-4 py-3 hover:bg-elevated border-b border-border last:border-b-0"
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-faint mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {result.displayName}
                          </p>
                          {result.type && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {result.type === 'coordinates' ? 'Coordenadas' : result.type}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {placesQuery.isFetching && (
                <p className="text-xs text-muted-foreground mt-1">Buscando...</p>
              )}
            </div>
          </Card>

          {/* Filtros */}
          <Card className="p-4 space-y-4">
            {/* Busca por Cliente (CRM) */}
            <div className="relative">
              <label className="text-sm font-medium text-soft mb-2 block">
                <Search className="w-4 h-4 inline mr-2" />
                Buscar por Cliente
              </label>
              <div className="relative">
                <Input
                  placeholder="Digite o nome do cliente..."
                  value={clientSearchTerm}
                  onChange={(e) => {
                    setClientSearchTerm(e.target.value)
                    setShowClientSuggestions(true)
                  }}
                  onFocus={() => clientSuggestions.length > 0 && setShowClientSuggestions(true)}
                  className={
                    selectedClient
                      ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40'
                      : ''
                  }
                />
                {clientSearchTerm && (
                  <button
                    onClick={handleClearClient}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-soft"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showClientSuggestions && clientSuggestions.length > 0 && (
                <div className="absolute z-1001 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                  {clientSuggestions.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleSelectClient(client)}
                      className="w-full text-left px-4 py-2 hover:bg-elevated border-b border-border last:border-b-0"
                    >
                      <p className="text-sm font-medium text-foreground">{client.name}</p>
                      {(client.address_city || client.email) && (
                        <p className="text-xs text-muted-foreground">
                          {client.address_city && client.address_state
                            ? `${client.address_city}/${client.address_state}`
                            : ''}
                          {client.email && ` • ${client.email}`}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Busca por nome de projeto */}
            <div>
              <label className="text-sm font-medium text-soft mb-2 block">Nome do Projeto</label>
              <Input
                placeholder="Filtrar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-soft mb-2 block">Status (do Projeto)</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(facets?.statuses ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value} ({option.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-soft mb-2 block">
                Cidade (pins geocodificados)
              </label>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(facets?.cities ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value} ({option.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-soft mb-2 block">
                Finalidade do Projeto
              </label>
              <Select value={purposeFilter} onValueChange={setPurposeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(facets?.purposes ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value} ({option.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Card rápido do cliente selecionado */}
          {selectedClient && filteredProperties.length > 0 && (
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{selectedClient.name}</h3>
                  <p className="text-xs text-soft mt-1">
                    {selectedClient.address_city &&
                      selectedClient.address_state &&
                      `${selectedClient.address_city}, ${selectedClient.address_state}`}
                  </p>
                </div>
                <button
                  onClick={handleClearClient}
                  className="p-1 hover:bg-card/50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-soft" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-soft">
                <MapPin className="w-4 h-4" />
                <span className="font-medium">{filteredProperties.length}</span>
                <span>propriedade{filteredProperties.length !== 1 ? 's' : ''} no mapa</span>
              </div>
            </Card>
          )}

          {/* Lista de propriedades */}
          <Card className="flex-1 overflow-auto p-4">
            <h3 className="font-semibold mb-4 text-foreground">
              {selectedClient
                ? `Propriedades de ${selectedClient.name}`
                : `${filteredProperties.length} propriedades no mapa`}
            </h3>

            {/*
              O TERCEIRO ESTADO, que o original não tem: lá a lista vazia é só um
              espaço em branco abaixo do título. A caixa é a mesma de
              Fornecedores, e a segunda linha muda conforme exista ou não pino
              cadastrado.
            */}
            {filteredProperties.length === 0 ? (
              <div className="text-center py-10">
                <MapPin className="w-10 h-10 text-faint mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Nenhuma propriedade encontrada</p>
                <p className="text-faint text-sm mt-1">
                  {hasAnyProperty
                    ? 'Ajuste os filtros ou marque uma nova propriedade no mapa'
                    : 'Marque uma nova propriedade no mapa'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProperties.map((property) => (
                  <button
                    key={property.id}
                    onClick={() => handleCenterOnProperty(property)}
                    className={`w-full text-left p-3 rounded-lg border transition-all hover:border-muted-foreground hover:shadow-sm ${
                      selectedProperty?.id === property.id
                        ? 'border-primary bg-elevated'
                        : 'border-border'
                    }`}
                  >
                    <div className="font-medium text-sm text-foreground">{property.displayName}</div>
                    {property.clientName && (
                      <div className="text-xs text-muted-foreground mt-1">{property.clientName}</div>
                    )}
                    <div className="text-xs text-faint mt-1">{property.city}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Mapa - 70% */}
        {/* overflow-hidden must NOT be used here — it would clip the dialog/modal z-index stacking */}
        <Card className="flex-1 relative" style={{ overflow: 'visible' }}>
          {/* Controles do mapa */}
          <div className="absolute top-4 right-4 z-1000 flex gap-2">
            {/*
              O ORIGINAL PÕE `bg-white` NOS DOIS BOTÕES (:1080 e :1089),
              inclusive por cima da variante `default` do botão ATIVO, que tem
              texto branco: o rótulo da camada selecionada some no fundo branco.
              CORRIGIDO tirando o fundo do botão ativo — ele fica com as cores da
              própria variante `default`. O botão inativo não mudou em nada:
              continua `outline` com fundo de cartão e a mesma sombra.
            */}
            <Button
              size="sm"
              variant={mapType === 'standard' ? 'default' : 'outline'}
              onClick={() => setMapType('standard')}
              className={mapType === 'standard' ? 'shadow-lg' : 'bg-card shadow-lg'}
            >
              <MapIcon className="w-4 h-4 mr-1" />
              Padrão
            </Button>
            <Button
              size="sm"
              variant={mapType === 'satellite' ? 'default' : 'outline'}
              onClick={() => setMapType('satellite')}
              className={mapType === 'satellite' ? 'shadow-lg' : 'bg-card shadow-lg'}
            >
              <Satellite className="w-4 h-4 mr-1" />
              Satélite
            </Button>
          </div>

          {editingPin && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-1000 bg-card px-4 py-3 rounded-lg shadow-lg border border-border flex items-center gap-3">
              <Edit3 className="w-4 h-4 text-soft" />
              <span className="text-sm font-medium">Arraste o pin para ajustar a localização</span>
              <div className="flex gap-2 ml-4">
                <Button size="sm" onClick={handleSavePin} disabled={movePinMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" />
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit' }}>
            <MapContainer
              ref={mapRef}
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              /*
                `style` é congelado na montagem pelo MapContainer (v4 e v5 guardam
                className/id/style num `useState`), então o cursor de cruz do
                original nunca chega a aparecer. Fica como está.
              */
              style={{
                width: '100%',
                height: '100%',
                cursor: addingMode ? 'crosshair' : 'default',
              }}
              zoomControl={true}
            >
              <TileLayer attribution={tileLayer.attribution} url={tileLayer.url} />

              <MapController
                center={mapCenter}
                zoom={mapZoom}
                properties={filteredProperties}
                onMapClick={addingMode ? handleMapClick : null}
                shouldFitBounds={shouldFitBounds}
              />

              {tempNewPin && (
                <Marker position={tempNewPin}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">Nova propriedade</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {searchMarker && (
                <Marker position={[searchMarker.lat, searchMarker.lng]} icon={searchResultIcon}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">Resultado da busca</p>
                      <p className="text-xs text-soft mt-1">{searchMarker.label}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {editingPin ? (
                <DraggableMarker
                  position={tempMarkerPosition ?? [editingPin.lat, editingPin.lng]}
                  onDragEnd={handleMarkerDragEnd}
                />
              ) : (
                filteredProperties.map((property) => (
                  <Marker
                    key={property.id}
                    position={[property.lat, property.lng]}
                    eventHandlers={{
                      click: () => {
                        setSelectedProperty(property)
                      },
                    }}
                  >
                    <Popup maxWidth={350}>
                      <PropertyPopup
                        property={property}
                        canEdit={canEdit}
                        onViewSummary={handleViewPropertySummary}
                        onEditInfo={handleEditPropertyInfo}
                        onEditPin={handleEditPin}
                        onRemove={handleRemovePinClick}
                      />
                    </Popup>
                  </Marker>
                ))
              )}
            </MapContainer>
          </div>
          {/* end map overflow wrapper */}
        </Card>
      </div>

      {/* Modal para vincular propriedade */}
      <MapPropertyForm
        open={modal?.type === 'CREATE'}
        onClose={handleCancelNewProperty}
        onSubmit={handlePropertyCreated}
        initialData={createFormValues}
        isLoading={createMutation.isPending}
        clients={clients}
        projects={projects}
        isEditing={false}
      />

      {/* Modal para editar informações da propriedade */}
      <MapPropertyForm
        open={modal?.type === 'EDIT'}
        onClose={closeModal}
        onSubmit={handleUpdatePropertyInfo}
        initialData={editFormValues}
        isLoading={updateMutation.isPending}
        clients={clients}
        projects={projects}
        isEditing={true}
      />

      {/* Modal de visualização de resumo */}
      <PropertySummaryModal
        open={modal?.type === 'SUMMARY'}
        onClose={closeModal}
        property={modal?.type === 'SUMMARY' ? modal.property : null}
      />

      {/* Modal para confirmar remoção de propriedade */}
      <AlertDialog
        open={modal?.type === 'DELETE'}
        onOpenChange={(open) => !open && closeModal()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover propriedade do mapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover esta propriedade do mapa.
              {modal?.type === 'DELETE' && modal.property.linkedProject && (
                <strong className="block mt-2">
                  O projeto vinculado continuará existindo normalmente.
                </strong>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeModal}>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                red-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={handleConfirmRemovePin}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remover do Mapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
