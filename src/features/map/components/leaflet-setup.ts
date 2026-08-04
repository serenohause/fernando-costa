import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import markerIconRed from '@/assets/marker-icon-2x-red.png'

/*
  O ajuste de ícone padrão do Leaflet (MapaProjetos.jsx:21-27) e as duas camadas
  de tile da tela.

  Mora fora do componente porque é efeito de módulo: o `mergeOptions` reescreve o
  protótipo de `L.Icon.Default` uma vez, para o app inteiro.

  UMA MUDANÇA EM RELAÇÃO AO ORIGINAL, e ela não é visual: lá as três imagens do
  pino vêm de um CDN (cdnjs, Leaflet 1.7.1); aqui vêm do pacote `leaflet` que já
  está instalado, resolvidas pelo Vite. É o MESMO arquivo — o `marker-icon.png`
  não mudou entre 1.7 e 1.9 — sem depender de rede de terceiro para desenhar o
  pino. O ícone VERMELHO do resultado de busca continua vindo da URL do original,
  porque não existe cópia dele no pacote.

  O bloco de z-index que faz o mapa conviver com diálogo está em src/index.css,
  portado de projeto-original/src/globals.css:151-185.
*/

/* O Leaflet monta a URL do ícone a partir do caminho do CSS quando esta função
   existe; apagá-la é o que faz `mergeOptions` valer (MapaProjetos.jsx:22). */
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

/*
  O pino vermelho do resultado da caixa "Buscar Localização"
  (MapaProjetos.jsx:1147-1154), com as mesmas medidas.

  A IMAGEM VEM DE DENTRO, e no original vinha de raw.githubusercontent.com — um
  repositório pessoal de terceiro, no branch master. Trazer para cá não muda um
  pixel e tira três coisas do caminho: rede corporativa que bloqueia GitHub
  deixaria o pino sem imagem; a origem do escritório era enviada ao GitHub a cada
  carregamento; e o conteúdo podia mudar sem ninguém aqui saber. Os outros três
  ícones do Leaflet já vinham do pacote local — este era o único de fora.
*/
export const searchResultIcon = L.icon({
  iconUrl: markerIconRed,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

/* Brasília e o zoom que mostra o país inteiro (MapaProjetos.jsx:29-30). */
export const DEFAULT_CENTER: [number, number] = [-15.7801, -47.9292]
export const DEFAULT_ZOOM = 5

export type MapType = 'standard' | 'satellite'

/* Nenhuma das duas exige chave de API (MapaProjetos.jsx:786-792). */
export const TILE_LAYERS: Record<MapType, { url: string; attribution: string }> = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
}
