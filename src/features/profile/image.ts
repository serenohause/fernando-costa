/*
  A MATEMÁTICA DO RECORTE DA FOTO DE PERFIL, separada da tela.

  Fica fora do componente por um motivo prático: erro aqui não quebra nada
  visível de imediato — a foto sai deslocada, ou com uma faixa vazia na borda, e
  isso passa por "ficou torto" em vez de "tem bug". Sendo função pura, dá para
  afirmar em teste (tests/avatar-crop.mjs).

  O MODELO
    A imagem é desenhada centralizada numa janela QUADRADA de `viewport` pixels.
    `scale` multiplica o tamanho natural; `offsetX`/`offsetY` deslocam o centro
    da imagem dentro da janela, em pixels de tela.

    A regra que governa tudo: a janela nunca pode mostrar vazio. Daí
    `minScale` (a menor escala que cobre a janela) e `clampOffset` (o quanto dá
    para arrastar antes de aparecer buraco).
*/

export type CropState = {
  scale: number
  offsetX: number
  offsetY: number
}

export type ImageSize = {
  naturalWidth: number
  naturalHeight: number
}

/* A menor escala que ainda cobre a janela inteira: é o "encaixe" de onde o
   recorte parte, e o piso do zoom. */
export function minScale(image: ImageSize, viewport: number): number {
  const { naturalWidth, naturalHeight } = image
  if (naturalWidth <= 0 || naturalHeight <= 0) return 1
  return Math.max(viewport / naturalWidth, viewport / naturalHeight)
}

/*
  O quanto a imagem pode deslizar em cada eixo antes de descobrir a janela.
  Zero quando aquele lado tem exatamente o tamanho da janela — o caso da foto
  quadrada, que só se move depois de ampliada.
*/
export function maxOffset(image: ImageSize, viewport: number, scale: number) {
  return {
    x: Math.max(0, (image.naturalWidth * scale - viewport) / 2),
    y: Math.max(0, (image.naturalHeight * scale - viewport) / 2),
  }
}

export function clampOffset(
  image: ImageSize,
  viewport: number,
  state: CropState,
): CropState {
  const limit = maxOffset(image, viewport, state.scale)
  return {
    scale: state.scale,
    offsetX: Math.min(limit.x, Math.max(-limit.x, state.offsetX)),
    offsetY: Math.min(limit.y, Math.max(-limit.y, state.offsetY)),
  }
}

/*
  O retângulo da IMAGEM ORIGINAL que a janela está mostrando — o que vai para o
  canvas de saída.

  `size` é o lado do quadrado em pixels da imagem, e não da tela: é ele que
  define quanta resolução real o recorte tem. Uma foto de 4000px recortada numa
  janela de 280px continua entregando um quadrado de 4000/scale pixels, e é por
  isso que a saída pode ser nítida mesmo com a janela pequena.
*/
export function cropRect(image: ImageSize, viewport: number, state: CropState) {
  const safe = clampOffset(image, viewport, state)
  const size = viewport / safe.scale

  const centerX = image.naturalWidth / 2 - safe.offsetX / safe.scale
  const centerY = image.naturalHeight / 2 - safe.offsetY / safe.scale

  /*
    O arredondamento para dentro da imagem existe para o caso do float: com
    `scale` exatamente no mínimo, `sx` sai como -0.0000001 e o `drawImage`
    devolve uma coluna transparente na borda esquerda. Um pixel, e visível.
  */
  const sx = Math.min(Math.max(0, centerX - size / 2), Math.max(0, image.naturalWidth - size))
  const sy = Math.min(Math.max(0, centerY - size / 2), Math.max(0, image.naturalHeight - size))

  return { sx, sy, size }
}

/*
  ── Do recorte ao arquivo ────────────────────────────────────────────────────

  A COMPRESSÃO ACONTECE AQUI, NO NAVEGADOR, e é o que permite aceitar a foto que
  a pessoa tem — a de 8 MB que saiu do celular — sem que o bucket precise
  aceitar 8 MB. O que sobe é sempre o recorte já reduzido: um quadrado de 512px,
  que fica na casa das dezenas de KB.

  Sem isso, "aceitar imagens maiores" significaria afrouxar o limite do bucket,
  e aí o sistema passaria a guardar de verdade os 8 MB de cada pessoa.
*/

export const AVATAR_OUTPUT_SIZE = 512

/* Folgado para um quadrado de 512px, e MUITO abaixo do teto de 2 MB do bucket:
   o alvo aqui é a experiência (foto que carrega rápido em toda tela do sistema),
   não o limite. */
const TARGET_BYTES = 300 * 1024

/* Abaixo disto a foto começa a ficar visivelmente suja; se nem assim couber, o
   caminho é reduzir o tamanho, não continuar espremendo a qualidade. */
const MIN_QUALITY = 0.5

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      /* O objeto de URL é liberado assim que a imagem está decodificada: sem
         isto, cada foto escolhida deixa um blob preso na memória da aba até a
         página ser recarregada. */
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('nao_foi_possivel_ler_a_imagem'))
    }

    image.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/*
  WebP quando o navegador sabe produzir, JPEG quando não. A diferença não é
  estética: para a mesma qualidade aparente, o WebP costuma sair com metade do
  peso — e o bucket aceita os dois (migration 0088).

  A detecção é pelo que o canvas DEVOLVE, e não pelo que ele aceita: um
  navegador sem WebP ignora o tipo pedido e devolve PNG em silêncio, que é o
  pior dos mundos (arquivo grande, sem aviso).
*/
function preferredType(): 'image/webp' | 'image/jpeg' {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  return probe.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg'
}

export async function renderCropToBlob(
  image: HTMLImageElement,
  viewport: number,
  state: CropState,
): Promise<{ blob: Blob; extension: 'webp' | 'jpg' }> {
  const rect = cropRect(
    { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
    viewport,
    state,
  )

  const type = preferredType()
  const extension = type === 'image/webp' ? 'webp' : 'jpg'

  /*
    Dois laços, e a ordem importa: primeiro espreme a QUALIDADE, e só depois
    reduz o TAMANHO. Reduzir o tamanho primeiro jogaria fora resolução que a
    qualidade sozinha resolveria — e resolução perdida não volta.
  */
  for (const size of [AVATAR_OUTPUT_SIZE, 384, 256]) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas_indisponivel')

    /* Fundo branco por causa do JPEG: ele não tem transparência, e um PNG com
       fundo transparente vira um retângulo PRETO sem esta linha. */
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, size, size)

    for (let quality = 0.92; quality >= MIN_QUALITY; quality -= 0.14) {
      const blob = await toBlob(canvas, type, quality)
      if (blob && blob.size <= TARGET_BYTES) {
        return { blob, extension }
      }
    }
  }

  /*
    Último recurso: 256px na qualidade mínima. Se nem isso couber, alguma coisa
    está muito errada — melhor devolver o arquivo e deixar o bucket recusar com
    o motivo dele do que travar a tela num laço.
  */
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas_indisponivel')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 256, 256)
  context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, 256, 256)

  const blob = await toBlob(canvas, type, MIN_QUALITY)
  if (!blob) throw new Error('nao_foi_possivel_gerar_a_imagem')
  return { blob, extension }
}
