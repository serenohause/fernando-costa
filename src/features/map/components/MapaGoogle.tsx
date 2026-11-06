import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import { AlertTriangle } from 'lucide-react'
import type { EnrichedMapProperty } from '../types'
import type { AlvoDeEnquadramento } from './MapaProjetos'
import {
  aoRecusarChave,
  carregarGoogleMaps,
  iconeDoPino,
  opcoesDoMapa,
  renderizadorDoAgrupamento,
  type MapType,
} from './google-maps-setup'
import PropertyPopup from './PropertyPopup'

/*
  O MAPA. Substitui o `MapContainer` do react-leaflet e o `MapController`
  portado do original, que não existem mais.

  POR QUE UM COMPONENTE IMPERATIVO, com `useRef` em tudo: a Maps JavaScript API
  não tem camada React mantida pelo Google. O `react-leaflet` existia e por isso
  a tela do Leaflet era declarativa. Aqui o mapa, os marcadores e o agrupamento
  são objetos com ciclo de vida próprio, criados uma vez e ATUALIZADOS por
  efeito — recriá-los a cada render seria, além de lento, dinheiro: o Google
  cobra por carga de mapa.

  O QUE AINDA É REACT, e é o que importa: o balão do pino. `PropertyPopup` é o
  mesmo componente da tela do Leaflet, com os mesmos botões e as mesmas
  permissões, desenhado dentro do `InfoWindow` por `createPortal`. Sem o portal
  seria preciso montar HTML em string e religar `onclick` à mão, e os quatro
  botões do balão deixariam de passar por `canEdit`.

  NENHUMA CHAMADA AO SUPABASE ACONTECE AQUI. Os dados chegam por prop, e toda
  ação sai por callback para a tela, que fala com os hooks. É a regra do
  CLAUDE.md, e ela não muda por o componente ser imperativo.
*/

type Props = {
  apiKey: string
  mapType: MapType
  /* O centro e o zoom pedidos pela tela. `zoom` nulo é o combinado herdado do
     `MapController`: enquadrar o conjunto em vez de aproximar um ponto. */
  center: [number, number]
  zoom: number | null
  /* O que enquadrar quando `zoom` é nulo: a caixa dos pinos da tela, uma caixa
     pronta (o lugar escolhido na busca), ou nada. */
  fitAlvo: AlvoDeEnquadramento
  properties: EnrichedMapProperty[]
  addingMode: boolean
  onMapClick: (lat: number, lng: number) => void
  tempNewPin: [number, number] | null
  searchMarker: { lat: number; lng: number; label: string } | null
  /* Quando há pino em ajuste, o mapa mostra SÓ ele, arrastável — como na tela do
     Leaflet, onde o `DraggableMarker` substituía a lista inteira. */
  editingPin: EnrichedMapProperty | null
  draggedPosition: [number, number] | null
  onPinDragEnd: (lat: number, lng: number) => void
  onSelectProperty: (property: EnrichedMapProperty) => void
  canEdit: boolean
  onViewSummary: (property: EnrichedMapProperty) => void
  onEditInfo: (property: EnrichedMapProperty) => void
  onEditPin: (property: EnrichedMapProperty) => void
  onRemove: (property: EnrichedMapProperty) => void
}

/* O teto de aproximação ao enquadrar um conjunto, igual ao `maxZoom: 15` que o
   `flyToBounds` do Leaflet recebia. O `fitBounds` do Google não tem essa opção,
   então o corte é feito depois, quando o mapa assenta. */
const ZOOM_MAXIMO_AO_ENQUADRAR = 15

/*
  A CAIXA A ENQUADRAR, a partir do alvo pedido.

  Devolve `null` quando não há o que enquadrar: alvo nulo, ou "propriedades" com
  a tela sem nenhum pino. Nesse caso o mapa fica onde está, que é melhor do que
  saltar para um lugar arbitrário.

  Vive fora do componente porque não toca em estado nem em ref: é conta.
*/
function montarCaixa(
  alvo: AlvoDeEnquadramento,
  properties: EnrichedMapProperty[],
): google.maps.LatLngBounds | null {
  if (alvo === null) return null

  if (alvo === 'propriedades') {
    if (properties.length === 0) return null
    const caixa = new google.maps.LatLngBounds()
    for (const property of properties) {
      caixa.extend({ lat: property.lat, lng: property.lng })
    }
    return caixa
  }

  const [sul, norte, oeste, leste] = alvo
  return new google.maps.LatLngBounds({ lat: sul, lng: oeste }, { lat: norte, lng: leste })
}

export default function MapaGoogle({
  apiKey,
  mapType,
  center,
  zoom,
  fitAlvo,
  properties,
  addingMode,
  onMapClick,
  tempNewPin,
  searchMarker,
  editingPin,
  draggedPosition,
  onPinDragEnd,
  onSelectProperty,
  canEdit,
  onViewSummary,
  onEditInfo,
  onEditPin,
  onRemove,
}: Props) {
  const divDoMapa = useRef<HTMLDivElement | null>(null)
  const mapa = useRef<google.maps.Map | null>(null)
  const agrupador = useRef<MarkerClusterer | null>(null)
  const pinosDaLista = useRef<google.maps.Marker[]>([])
  const pinoNovo = useRef<google.maps.Marker | null>(null)
  const pinoDeBusca = useRef<google.maps.Marker | null>(null)
  const pinoArrastavel = useRef<google.maps.Marker | null>(null)

  const balao = useRef<google.maps.InfoWindow | null>(null)
  /* O destino do portal. Criado fora do React porque é o `InfoWindow` quem o
     insere e remove do documento. */
  const divDoBalao = useRef<HTMLDivElement | null>(null)
  const pinoDoBalao = useRef<google.maps.Marker | null>(null)

  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [propriedadeAberta, setPropriedadeAberta] = useState<EnrichedMapProperty | null>(null)

  /*
    OS CALLBACKS MORAM EM REF porque quem os chama é um ouvinte do Google,
    registrado uma vez. Lido direto da prop, o ouvinte guardaria a primeira
    versão da função para sempre — e `addingMode` dentro dela ficaria congelado
    em `false`, que é o bug clássico desta mistura.
  */
  const cliqueNoMapa = useRef(onMapClick)
  cliqueNoMapa.current = onMapClick
  const modoDeMarcacao = useRef(addingMode)
  modoDeMarcacao.current = addingMode
  const arrastouPino = useRef(onPinDragEnd)
  arrastouPino.current = onPinDragEnd
  const selecionou = useRef(onSelectProperty)
  selecionou.current = onSelectProperty

  function fecharBalao() {
    balao.current?.close()
    pinoDoBalao.current = null
    setPropriedadeAberta(null)
  }

  /* ── Carregar a API e montar o mapa, uma vez ─────────────────────────── */

  useEffect(() => {
    let vivo = true

    const soltarAviso = aoRecusarChave(() => {
      if (vivo) {
        setErro(
          'O Google recusou a chave do mapa. Confira no console do Google Cloud: ' +
            'a Maps JavaScript API precisa estar liberada, o endereço deste site precisa ' +
            'estar na lista de sites autorizados e o faturamento precisa estar ativo.',
        )
      }
    })

    carregarGoogleMaps(apiKey)
      .then(() => {
        if (!vivo || !divDoMapa.current) return

        mapa.current = new google.maps.Map(divDoMapa.current, opcoesDoMapa(mapType))

        divDoBalao.current = document.createElement('div')
        balao.current = new google.maps.InfoWindow({ maxWidth: 350 })
        balao.current.addListener('closeclick', () => {
          pinoDoBalao.current = null
          setPropriedadeAberta(null)
        })

        mapa.current.addListener('click', (evento: google.maps.MapMouseEvent) => {
          if (!modoDeMarcacao.current || !evento.latLng) return
          cliqueNoMapa.current(evento.latLng.lat(), evento.latLng.lng())
        })

        setPronto(true)
      })
      .catch((falha: unknown) => {
        if (!vivo) return
        setErro(
          falha instanceof Error ? falha.message : 'Não foi possível carregar o Google Maps',
        )
      })

    return () => {
      vivo = false
      soltarAviso()
    }
    /* `mapType` entra só na criação; a troca de camada tem o efeito dela
       abaixo, e refazer o mapa a cada clique de botão seria carga cobrada. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  /* ── Camada ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!pronto) return
    mapa.current?.setMapTypeId(mapType)
  }, [mapType, pronto])

  /* ── O cursor de cruz do modo de marcação ───────────────────────────── */

  /*
    ISTO FUNCIONA, e na tela do Leaflet não funcionava: lá o `style` do
    `MapContainer` era congelado na montagem, então o `cursor: crosshair` do
    original nunca aparecia. O Google tem opção própria para isso.
  */
  useEffect(() => {
    if (!pronto) return
    mapa.current?.setOptions({ draggableCursor: addingMode ? 'crosshair' : null })
  }, [addingMode, pronto])

  /* ── Os pinos das propriedades, agrupados ───────────────────────────── */

  useEffect(() => {
    if (!pronto || !mapa.current) return

    /* Rebuild fecha o balão: o marcador que o ancorava deixa de existir. */
    fecharBalao()

    agrupador.current?.clearMarkers()
    for (const pino of pinosDaLista.current) pino.setMap(null)
    pinosDaLista.current = []

    /* Em ajuste de localização o mapa mostra só o pino arrastável, como na tela
       do Leaflet. */
    if (editingPin) {
      agrupador.current?.clearMarkers()
      return
    }

    pinosDaLista.current = properties.map((property) => {
      const pino = new google.maps.Marker({
        position: { lat: property.lat, lng: property.lng },
        icon: iconeDoPino(),
        title: property.displayName,
      })
      pino.addListener('click', () => {
        selecionou.current(property)
        pinoDoBalao.current = pino
        setPropriedadeAberta(property)
      })
      return pino
    })

    agrupador.current ??= new MarkerClusterer({
      map: mapa.current,
      renderer: renderizadorDoAgrupamento,
    })
    agrupador.current.addMarkers(pinosDaLista.current)
  }, [properties, editingPin, pronto])

  /* ── O balão: abrir depois de o portal ter desenhado o conteúdo ──────── */

  /*
    A ORDEM IMPORTA. Abrir o `InfoWindow` antes de o React escrever dentro do
    `div` o dimensionaria vazio, e o balão apareceria do tamanho de um ponto. Por
    isso o `open` fica num efeito: ele roda depois do commit que o portal
    produziu, com o conteúdo já no DOM.
  */
  useEffect(() => {
    if (!propriedadeAberta || !balao.current || !mapa.current || !divDoBalao.current) return
    if (!pinoDoBalao.current) return

    balao.current.setContent(divDoBalao.current)
    balao.current.open({ map: mapa.current, anchor: pinoDoBalao.current })
  }, [propriedadeAberta])

  /* ── Pino novo, pino do resultado da busca, pino em ajuste ──────────── */

  useEffect(() => {
    if (!pronto || !mapa.current) return

    pinoNovo.current?.setMap(null)
    pinoNovo.current = null

    if (tempNewPin) {
      pinoNovo.current = new google.maps.Marker({
        position: { lat: tempNewPin[0], lng: tempNewPin[1] },
        map: mapa.current,
        icon: iconeDoPino(),
        zIndex: 1500,
        title: 'Nova propriedade',
      })
    }
  }, [tempNewPin, pronto])

  useEffect(() => {
    if (!pronto || !mapa.current) return

    pinoDeBusca.current?.setMap(null)
    pinoDeBusca.current = null

    if (searchMarker) {
      pinoDeBusca.current = new google.maps.Marker({
        position: { lat: searchMarker.lat, lng: searchMarker.lng },
        map: mapa.current,
        icon: iconeDoPino(true),
        zIndex: 2000,
        title: searchMarker.label,
      })
    }
  }, [searchMarker, pronto])

  useEffect(() => {
    if (!pronto || !mapa.current) return

    if (!editingPin) {
      pinoArrastavel.current?.setMap(null)
      pinoArrastavel.current = null
      return
    }

    const posicao = draggedPosition ?? [editingPin.lat, editingPin.lng]

    /* O marcador existente só MUDA DE LUGAR: recriá-lo a cada arrasto faria o
       pino piscar no fim de cada gesto. */
    if (pinoArrastavel.current) {
      pinoArrastavel.current.setPosition({ lat: posicao[0], lng: posicao[1] })
      return
    }

    pinoArrastavel.current = new google.maps.Marker({
      position: { lat: posicao[0], lng: posicao[1] },
      map: mapa.current,
      icon: iconeDoPino(),
      draggable: true,
      zIndex: 2500,
    })

    /* Só no fim do arrasto, como o `DraggableMarker` do original. */
    pinoArrastavel.current.addListener('dragend', (evento: google.maps.MapMouseEvent) => {
      if (evento.latLng) arrastouPino.current(evento.latLng.lat(), evento.latLng.lng())
    })
  }, [editingPin, draggedPosition, pronto])

  /* ── Movimentar a câmera ────────────────────────────────────────────── */

  /*
    O par de refs guarda o último centro/zoom aplicado para não refazer o
    movimento quando o React renderiza de novo com os mesmos valores. É o guarda
    do `MapController` do original, e continua necessário.

    O QUE NÃO FOI PORTADO: a duração calculada do `flyTo` do Leaflet (entre 900ms
    e 1800ms conforme distância e salto de zoom). A Maps JavaScript API não
    aceita duração de animação — `panTo` anima o que é perto e salta o que é
    longe, e isso é o que há. Nenhum comportamento se perde; a transição é a do
    Google.
  */
  const ultimoCentro = useRef<string | null>(null)
  const ultimoZoom = useRef<number | null>(null)

  useEffect(() => {
    if (!pronto || !mapa.current) return

    const assinatura = JSON.stringify(center)
    if (ultimoCentro.current === assinatura && ultimoZoom.current === zoom) return

    if (zoom !== null) {
      mapa.current.panTo({ lat: center[0], lng: center[1] })
      mapa.current.setZoom(zoom)
      ultimoCentro.current = assinatura
      ultimoZoom.current = zoom
      return
    }

    const caixa = montarCaixa(fitAlvo, properties)
    if (caixa) {
      mapa.current.fitBounds(caixa, 50)

      /*
        O TETO DE ZOOM VALE SÓ PARA OS PINOS. Um único pino enquadrado levaria o
        mapa ao zoom máximo, e o `fitBounds` não aceita teto como opção, então
        ele é aplicado quando o mapa assenta.

        A caixa de um lugar ESCOLHIDO NA BUSCA não passa por isso: ela é o
        `viewport` que o próprio Google calculou para aquele lugar, e cortá-la em
        15 deixaria "Times Square" na mesma altura de "Nova York".
      */
      if (fitAlvo === 'propriedades') {
        const mapaAtual = mapa.current
        google.maps.event.addListenerOnce(mapaAtual, 'idle', () => {
          const atual = mapaAtual.getZoom()
          if (atual !== undefined && atual > ZOOM_MAXIMO_AO_ENQUADRAR) {
            mapaAtual.setZoom(ZOOM_MAXIMO_AO_ENQUADRAR)
          }
        })
      }

      ultimoCentro.current = assinatura
      ultimoZoom.current = null
    }
  }, [center, zoom, fitAlvo, properties, pronto])

  /* ── A tela ─────────────────────────────────────────────────────────── */

  return (
    <>
      <div ref={divDoMapa} style={{ width: '100%', height: '100%' }} />

      {erro && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/95 p-6">
          <div className="max-w-md text-center">
            <AlertTriangle className="w-10 h-10 text-faint mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">O mapa não carregou</p>
            <p className="text-faint text-sm mt-2">{erro}</p>
          </div>
        </div>
      )}

      {propriedadeAberta &&
        divDoBalao.current &&
        createPortal(
          <PropertyPopup
            property={propriedadeAberta}
            canEdit={canEdit}
            /* Cada ação fecha o balão antes de avisar a tela: no Leaflet isso era
               `mapRef.current?.closePopup()` em três handlers de lá, e sem isso o
               balão fica por cima do diálogo que acabou de abrir. */
            onViewSummary={(property) => {
              fecharBalao()
              onViewSummary(property)
            }}
            onEditInfo={(property) => {
              fecharBalao()
              onEditInfo(property)
            }}
            onEditPin={(property) => {
              fecharBalao()
              onEditPin(property)
            }}
            onRemove={(property) => {
              fecharBalao()
              onRemove(property)
            }}
          />,
          divDoBalao.current,
        )}
    </>
  )
}
