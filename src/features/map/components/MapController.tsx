import { useEffect, useRef } from 'react'
import L, { type LatLng, type Marker as LeafletMarker } from 'leaflet'
import { Marker, useMap, useMapEvents } from 'react-leaflet'

/*
  Os dois componentes internos do mapa (MapaProjetos.jsx:33-119). Nenhum dos dois
  desenha marcação própria: eles falam com a instância do Leaflet.

  `MapRefSetter` (:90) NÃO foi portado. Ele existia para expor o mapa num ref, e
  o `MapContainer` do react-leaflet 5 já encaminha `ref` para a instância — a
  página usa o `ref` direto. Mesmo resultado, um componente a menos.
*/

/*
  Porta de `MapController` (MapaProjetos.jsx:33).

  Quem manda o mapa se mover: `flyTo` quando há zoom definido, `flyToBounds`
  quando o pedido é enquadrar o conjunto (`zoom === null`). A duração é calculada
  a partir da distância e do salto de zoom, entre 900ms e 1800ms, e os números
  são os do original.

  O par de refs guarda o último centro/zoom aplicado para não refazer a animação
  quando o React renderiza de novo com os mesmos valores — é o guarda do
  original, e ele continua necessário aqui.
*/
export function MapController({
  center,
  zoom,
  properties,
  onMapClick,
  shouldFitBounds,
}: {
  center: [number, number] | null
  zoom: number | null
  properties: { lat: number; lng: number }[]
  onMapClick: ((latlng: LatLng) => void) | null
  shouldFitBounds: boolean
}) {
  const map = useMap()
  const lastCenterRef = useRef<string | null>(null)
  const lastZoomRef = useRef<number | null>(null)

  useEffect(() => {
    if (!center) return

    const centerStr = JSON.stringify(center)
    const hasChanged = lastCenterRef.current !== centerStr || lastZoomRef.current !== zoom

    if (!hasChanged) return

    if (zoom !== null && zoom !== undefined) {
      const currentCenter = map.getCenter()
      const currentZoom = map.getZoom()
      const distance = currentCenter.distanceTo(center) / 1000
      const zoomDelta = Math.abs(currentZoom - zoom)

      const duration =
        Math.min(Math.max(900 + distance * 8 + zoomDelta * 120, 900), 1800) / 1000

      map.flyTo(center, zoom, {
        duration,
        easeLinearity: 0.25,
      })

      lastCenterRef.current = centerStr
      lastZoomRef.current = zoom
    } else if (shouldFitBounds && properties.length > 0) {
      const bounds = L.latLngBounds(
        properties.map((property) => [property.lat, property.lng] as [number, number]),
      )
      map.flyToBounds(bounds, {
        padding: [50, 50],
        maxZoom: 15,
        duration: 1.2,
        easeLinearity: 0.25,
      })
      lastCenterRef.current = centerStr
      lastZoomRef.current = null
    }
  }, [center, zoom, properties, map, shouldFitBounds])

  useMapEvents({
    click: (event) => {
      if (onMapClick) {
        onMapClick(event.latlng)
      }
    },
  })

  return null
}

/* Porta de `DraggableMarker` (MapaProjetos.jsx:99): o pino de "Ajustar
   Localização", que só avisa a posição no fim do arrasto. */
export function DraggableMarker({
  position,
  onDragEnd,
}: {
  position: [number, number]
  onDragEnd: (latlng: LatLng) => void
}) {
  const markerRef = useRef<LeafletMarker | null>(null)

  return (
    <Marker
      draggable
      eventHandlers={{
        dragend() {
          const marker = markerRef.current
          if (marker) {
            onDragEnd(marker.getLatLng())
          }
        },
      }}
      position={position}
      ref={markerRef}
    />
  )
}
