import { useEffect, useRef, useState } from 'react'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  clampOffset,
  loadImageFromFile,
  minScale,
  renderCropToBlob,
  type CropState,
} from '../image'

/*
  RECORTAR E POSICIONAR A FOTO ANTES DE ENVIAR.

  A janela é quadrada e a máscara é redonda, porque redondo é como a foto
  aparece no resto do sistema — recortar num quadrado e descobrir depois que as
  orelhas foram cortadas pelo círculo é o erro clássico desta tela.

  O QUE É GESTO E O QUE É CONTA: arrastar e o zoom vivem aqui; os limites (até
  onde dá para arrastar, qual a menor escala que ainda cobre a janela, qual
  retângulo da imagem original corresponde ao que se vê) estão em `../image` e
  têm teste próprio. Foi de propósito: a conta erra em silêncio, o gesto não.

  SEM BIBLIOTECA DE CROP. Seriam uma dependência nova e um segundo jeito de
  desenhar caixa e botão dentro do sistema, para um arraste e um slider.
*/

const VIEWPORT = 280
const MAX_ZOOM_FACTOR = 4

export default function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
  isSaving,
}: {
  /* Nulo fecha o diálogo. É o arquivo cru escolhido no seletor — o recorte e a
     compressão acontecem aqui dentro. */
  file: File | null
  onCancel: () => void
  onConfirm: (blob: Blob, extension: 'webp' | 'jpg') => void
  isSaving: boolean
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [state, setState] = useState<CropState>({ scale: 1, offsetX: 0, offsetY: 0 })
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)

  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    if (!file) {
      setImage(null)
      setError(null)
      return
    }

    let cancelled = false
    setPreparing(true)
    setError(null)

    loadImageFromFile(file)
      .then((loaded) => {
        if (cancelled) return
        const base = minScale(
          { naturalWidth: loaded.naturalWidth, naturalHeight: loaded.naturalHeight },
          VIEWPORT,
        )
        setImage(loaded)
        /* Começa no encaixe: a foto inteira cabendo na janela pelo lado menor,
           centralizada. É o estado do qual a pessoa ajusta. */
        setState({ scale: base, offsetX: 0, offsetY: 0 })
      })
      .catch(() => {
        if (!cancelled) {
          setError('Não foi possível abrir esta imagem. Tente outro arquivo.')
        }
      })
      .finally(() => {
        if (!cancelled) setPreparing(false)
      })

    return () => {
      cancelled = true
    }
  }, [file])

  const size = image
    ? { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
    : null

  const base = size ? minScale(size, VIEWPORT) : 1
  const maxScale = base * MAX_ZOOM_FACTOR

  const applyState = (next: CropState) => {
    if (!size) return
    setState(clampOffset(size, VIEWPORT, next))
  }

  const handleZoom = (scale: number) => {
    const clamped = Math.min(maxScale, Math.max(base, scale))
    applyState({ ...state, scale: clamped })
  }

  const handleConfirm = async () => {
    if (!image) return
    try {
      const { blob, extension } = await renderCropToBlob(image, VIEWPORT, state)
      onConfirm(blob, extension)
    } catch {
      setError('Não foi possível preparar a imagem. Tente outro arquivo.')
    }
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
          <DialogDescription>
            Arraste para posicionar e use o zoom. O que estiver dentro do círculo é o que fica.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : preparing || !image ? (
          <div
            className="mx-auto rounded-full bg-muted animate-pulse"
            style={{ width: VIEWPORT, height: VIEWPORT }}
          />
        ) : (
          <div className="space-y-4">
            {/*
              `touch-none` porque sem ele o navegador rola a página em vez de
              deixar o dedo arrastar a foto — no celular o recorte ficaria
              impossível de ajustar.
            */}
            <div
              className="relative mx-auto overflow-hidden rounded-full border border-border bg-muted cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ width: VIEWPORT, height: VIEWPORT }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  offsetX: state.offsetX,
                  offsetY: state.offsetY,
                }
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current
                if (!drag) return
                applyState({
                  scale: state.scale,
                  offsetX: drag.offsetX + (event.clientX - drag.x),
                  offsetY: drag.offsetY + (event.clientY - drag.y),
                })
              }}
              onPointerUp={() => {
                dragRef.current = null
              }}
              onPointerCancel={() => {
                dragRef.current = null
              }}
              onWheel={(event) => {
                /* Passo proporcional à escala atual: um passo fixo é lento
                   demais no começo e violento demais no fim do zoom. */
                handleZoom(state.scale * (event.deltaY < 0 ? 1.08 : 1 / 1.08))
              }}
            >
              <img
                src={image.src}
                alt="Pré-visualização da foto"
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
                style={{
                  width: image.naturalWidth * state.scale,
                  height: image.naturalHeight * state.scale,
                  transform: `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px))`,
                }}
              />
            </div>

            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="range"
                aria-label="Zoom da foto"
                min={base}
                max={maxScale}
                step={(maxScale - base) / 100 || 0.01}
                value={state.scale}
                onChange={(event) => handleZoom(Number(event.target.value))}
                className="flex-1 accent-primary"
              />
              <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>

            <p className="text-xs text-faint text-center">
              A foto é reduzida e comprimida no seu navegador antes de subir.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!image || isSaving || Boolean(error)}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isSaving ? 'Enviando...' : 'Usar esta foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
