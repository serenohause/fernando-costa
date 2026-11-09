import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, ImageOff, X } from 'lucide-react'
import type { MapPropertyPhoto } from '../types'

/*
  A FOTO DA PROPRIEDADE EM TELA CHEIA.

  Mesma geometria do lightbox do Diário do Projeto (PhotoLightbox.tsx): fundo
  preto a 95%, cabeçalho com o nome da propriedade e o contador "3 / 7", botão
  de baixar e de fechar, setas que só existem quando há para onde ir, a foto
  centralizada e a fita de miniaturas com a borda branca na atual. Esc fecha,
  ← e → andam, clique no fundo fecha.

  ⚠ O QUE É DIFERENTE AQUI, E É O MOTIVO DE ESTE ARQUIVO EXISTIR: ele é montado
  de DENTRO do balão do Google Maps, que é um nó com `transform` próprio. Um
  elemento `position: fixed` dentro de um ancestral transformado passa a ser
  posicionado em relação a ESSE ancestral, e não à janela — o lightbox ficaria
  preso dentro de um balão de 300 pixels. Por isso ele vai para `document.body`
  por portal, e por isso não dá para reusar o do módulo 11 como está.

  O ENDEREÇO JÁ VEM ASSINADO (`photo.url`), e pode ser nulo: objeto removido do
  bucket, sessão sem permissão, rede fora. Aqui cabe explicar por escrito, e por
  isso o quadro de indisponível tem frase — na miniatura do carrossel não cabe.
*/
export default function PropertyPhotoLightbox({
  photos,
  currentIndex,
  title,
  onClose,
  onNavigate,
}: {
  photos: MapPropertyPhoto[]
  currentIndex: number
  title: string
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1)
  }, [currentIndex, onNavigate])

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
  }, [currentIndex, photos.length, onNavigate])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') handlePrev()
      if (event.key === 'ArrowRight') handleNext()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, handlePrev, handleNext])

  /* A PÁGINA ATRÁS NÃO ROLA enquanto a foto está aberta: o mapa reage à roda do
     mouse, e rolar sobre o lightbox daria zoom no mapa embaixo. */
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  const photo = photos[currentIndex]
  if (!photo) return null

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm"
      style={{ zIndex: 9999 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${title}`}
    >
      <div
        className="absolute top-0 right-0 left-0 flex items-start justify-between px-4 py-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-white">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {currentIndex + 1} / {photos.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {photo.url && (
            <a
              href={photo.url}
              download={photo.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/20"
              title="Baixar esta foto"
              onClick={(event) => event.stopPropagation()}
            >
              <Download className="h-4 w-4 text-white" />
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/20"
            title="Fechar"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      {currentIndex > 0 && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            handlePrev()
          }}
          className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
          title="Foto anterior"
        >
          <ChevronLeft className="h-6 w-6 text-white" />
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            handleNext()
          }}
          className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
          title="Próxima foto"
        >
          <ChevronRight className="h-6 w-6 text-white" />
        </button>
      )}

      <div
        className="max-h-[75vh] w-full max-w-5xl px-16"
        onClick={(event) => event.stopPropagation()}
      >
        {photo.url ? (
          <img
            src={photo.url}
            alt={photo.file_name}
            className="h-full w-full rounded-lg object-contain shadow-2xl"
            style={{ maxHeight: '75vh' }}
          />
        ) : (
          <div
            className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-white/10"
            style={{ height: '75vh' }}
          >
            <ImageOff className="h-8 w-8 text-slate-500" />
            <p className="text-sm text-slate-400">Não foi possível abrir esta foto agora.</p>
          </div>
        )}
      </div>

      <div
        className="absolute right-0 bottom-0 left-0 px-4 py-4 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="truncate text-xs text-slate-400">{photo.file_name}</p>
        {photos.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5 overflow-x-auto">
            {photos.map((thumbnail, index) => (
              <button
                key={thumbnail.id}
                onClick={() => onNavigate(index)}
                className={`h-10 w-10 shrink-0 overflow-hidden rounded border-2 transition-all ${
                  index === currentIndex
                    ? 'border-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-75'
                }`}
                title={thumbnail.file_name}
              >
                {thumbnail.url ? (
                  <img
                    src={thumbnail.url}
                    alt={thumbnail.file_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-white/10">
                    <ImageOff className="h-3 w-3 text-slate-400" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
