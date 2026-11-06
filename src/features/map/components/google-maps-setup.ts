import markerIconBlue from '@/assets/marker-icon-2x-blue.png'
import markerIconRed from '@/assets/marker-icon-2x-red.png'
import type { Renderer } from '@googlemaps/markerclusterer'

/*
  O carregamento da Maps JavaScript API e as constantes do mapa. Substitui
  leaflet-setup.ts, que fazia o mesmo papel para o Leaflet.

  POR QUE UM CARREGADOR ESCRITO À MÃO, e não `@googlemaps/js-api-loader`: o que
  precisa acontecer aqui é uma tag `<script>`, uma promessa e um callback. O
  pacote oficial faz isso mais algumas coisas que este projeto não usa (troca de
  chave em tempo de execução, retry com backoff). Trinta linhas lidas valem mais
  que uma dependência a mais na árvore.

  A CHAVE VAI PARA O BUNDLE DO NAVEGADOR, e isso é o que `VITE_` significa — o
  porquê inteiro está no cabeçalho de geocoding.ts. O que torna isso aceitável é
  a restrição por referenciador HTTP no console do Google Cloud, e ela não é
  opcional: sem ela qualquer um copia a chave do JavaScript publicado e gasta o
  faturamento.

  TRÊS APIs PRECISAM ESTAR LIBERADAS NA CHAVE, e a tela diz coisas diferentes
  quando falta alguma:

    Maps JavaScript API   o mapa não desenha, e `gm_authFailure` dispara.
    Geocoding API         o mapa desenha; a busca de lugar e o endereço do
                          clique voltam vazios (REQUEST_DENIED).

  Nenhuma outra. Places, Directions e o resto do catálogo cobrado ficam fora de
  propósito: esta tela não os chama.
*/

const URL_DA_API = 'https://maps.googleapis.com/maps/api/js'

/*
  `quarterly` CONGELA A VERSÃO POR UM TRIMESTRE. Sem o parâmetro, o Google serve
  a versão `weekly`, que muda toda semana sem aviso — e o que quebra numa
  semana dessas quebra em produção, não aqui. O canal trimestral dá a janela para
  ver o problema antes.
*/
const VERSAO = 'quarterly'

/* O nome tem de ser alcançável a partir de `window`, porque é o Google quem
   chama: a URL leva `callback=<este nome>`. */
const NOME_DO_CALLBACK = '__hausoneGoogleMapsPronto'

type JanelaComCallback = typeof window & {
  [NOME_DO_CALLBACK]?: () => void
  gm_authFailure?: () => void
}

/*
  UMA PROMESSA PARA O APP INTEIRO. A tela monta e desmonta; o script, uma vez
  carregado, fica. Guardar a promessa no módulo é o que impede duas tags
  `<script>` para a mesma API — o que o Google responde com um aviso no console e
  um mapa que às vezes não desenha.
*/
let carregando: Promise<void> | null = null

export function carregarGoogleMaps(apiKey: string): Promise<void> {
  if (carregando) return carregando

  carregando = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Maps só carrega no navegador'))
      return
    }

    const janela = window as JanelaComCallback

    /* Já carregado por outra montagem desta mesma sessão. */
    if (janela.google?.maps) {
      resolve()
      return
    }

    janela[NOME_DO_CALLBACK] = () => {
      delete janela[NOME_DO_CALLBACK]
      resolve()
    }

    const parametros = new URLSearchParams({
      key: apiKey,
      v: VERSAO,
      callback: NOME_DO_CALLBACK,
      loading: 'async',
      language: 'pt-BR',
      region: 'BR',
    })

    const script = document.createElement('script')
    script.src = `${URL_DA_API}?${parametros.toString()}`
    script.async = true
    script.onerror = () => {
      /* A promessa guardada é zerada para que uma nova tentativa seja possível —
         falha aqui é quase sempre rede, e rede volta. */
      carregando = null
      delete janela[NOME_DO_CALLBACK]
      reject(new Error('Não foi possível carregar o Google Maps'))
    }

    document.head.appendChild(script)
  })

  return carregando
}

/*
  `gm_authFailure` é o único aviso que o Google dá quando a CHAVE é recusada:
  faturamento desligado, referenciador fora da lista, API não liberada. Ele
  dispara DEPOIS do carregamento, então não é erro de promessa — a promessa já
  resolveu e o mapa desenhou cinza com uma faixa "somente para fins de
  desenvolvimento".

  A tela registra um ouvinte para trocar o mapa cinza por uma frase que diz o que
  conferir.
*/
export function aoRecusarChave(aviso: () => void): () => void {
  const janela = window as JanelaComCallback
  janela.gm_authFailure = aviso
  return () => {
    if (janela.gm_authFailure === aviso) delete janela.gm_authFailure
  }
}

/* Brasília e o zoom que mostra o país inteiro, como na tela do Leaflet
   (MapaProjetos.jsx:29-30). O auto-zoom dos filtros aproxima a partir daqui. */
export const DEFAULT_CENTER: [number, number] = [-15.7801, -47.9292]
export const DEFAULT_ZOOM = 5

/*
  AS QUATRO CAMADAS DO PROTÓTIPO. A tela do Leaflet tinha duas (OpenStreetMap e
  imagem de satélite da Esri); o Google serve quatro, e as duas novas são as que
  servem para olhar lote: `hybrid` é a foto com nome de rua por cima, `terrain` é
  o relevo.

  TROCAR DE CAMADA NÃO É CARGA NOVA DE MAPA, e isso é dinheiro: a cobrança do
  Google é por carga, e `setMapTypeId` no mesmo objeto não gera carga. Recriar o
  mapa a cada clique multiplicaria a conta por quatro.
*/
export type MapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain'

/*
  O PINO É O MESMO ARQUIVO DA TELA DO LEAFLET, nas mesmas medidas (25x41, âncora
  no bico). O protótipo buscava as duas imagens de CDN; aqui vêm de
  `src/assets`, resolvidas pelo Vite — o azul foi copiado do pacote `leaflet`
  antes de ele sair do projeto.

  `scaledSize` e `anchor` precisam do `google.maps` já carregado, então são
  função e não constante: chamar antes do script terminar estouraria em
  `google is not defined`.
*/
export function iconeDoPino(vermelho = false): google.maps.Icon {
  return {
    url: vermelho ? markerIconRed : markerIconBlue,
    scaledSize: new google.maps.Size(25, 41),
    anchor: new google.maps.Point(12, 41),
  }
}

/*
  A BOLHA DO AGRUPAMENTO, portada do protótipo sem mudar um número: três
  tamanhos por faixa de contagem, círculo cheio com borda branca, contagem no
  meio.

  MARCADOR CLÁSSICO COM SVG, e não `AdvancedMarkerElement`, de propósito: o
  marcador avançado só desenha quando o mapa tem um Map ID criado no console do
  Google. `google.maps.Marker` está marcado como obsoleto desde fevereiro de 2024
  e continua funcionando — o Google se comprometeu a mantê-lo. Criar um Map ID é
  de graça e trocaria isto por três linhas; é decisão em aberto, não dívida
  escondida.

  As duas cores são conversão dos tokens `--primary` e `--primary-foreground` do
  tema claro. Hex e não token porque o SVG é gerado em JavaScript e vira
  `data:` URI — não há CSS no caminho.
*/
const AZUL_ESCURO = '#0f172a'
const QUASE_BRANCO = '#f8fafc'

export const renderizadorDoAgrupamento: Renderer = {
  render: ({ count, position }) => {
    const lado = count < 10 ? 32 : count < 50 ? 40 : 48
    const corpo = Math.round(lado * 0.36)

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}">`,
      `<circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2 - 2}"`,
      ` fill="${AZUL_ESCURO}" stroke="#ffffff" stroke-width="2"/>`,
      '</svg>',
    ].join('')

    return new google.maps.Marker({
      position,
      /* Acima de qualquer pino solto, e quanto maior a bolha, mais acima. */
      zIndex: 1000 + count,
      icon: {
        url: `data:image/svg+xml;base64,${btoa(svg)}`,
        scaledSize: new google.maps.Size(lado, lado),
        anchor: new google.maps.Point(lado / 2, lado / 2),
      },
      label: {
        text: String(count),
        color: QUASE_BRANCO,
        fontSize: `${corpo}px`,
        fontWeight: '600',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
    })
  },
}

/*
  As opções do mapa, iguais às do protótipo: os controles próprios do Google
  saem, porque a tela já tem os botões dela no canto, e dois jogos de controle na
  mesma moldura é ruído. Zoom por rolagem e por gesto continua.
*/
export function opcoesDoMapa(mapType: MapType): google.maps.MapOptions {
  return {
    center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
    zoom: DEFAULT_ZOOM,
    mapTypeId: mapType,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
  }
}
