import { useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Download, ImageOff, X } from 'lucide-react'
import { useDiaryFileUrl } from '../hooks'
import DiaryPhoto from './DiaryPhoto'
import type { DiaryFile, PhotoCaption } from '../types'

/*
  Porta de nova-versao/src/components/diary/obra/PhotoLightbox.jsx.

  O fundo preto a 95%, o cabeçalho com o resumo, o tipo e o contador "3 / 7", o
  botão de baixar e o de fechar, as setas laterais que só existem quando há para
  onde ir, a foto centralizada em 70% da altura, o nome do arquivo embaixo e a
  fita de miniaturas com a borda branca na atual são os da versão nova, com a
  mesma geometria.

  O TECLADO É O MESMO: Esc fecha, ← e → andam. E o clique no fundo fecha, com
  `stopPropagation` em tudo que é conteúdo — igual a lá.

  ═══ O QUE MUDA, E POR QUÊ ═══

  1. O ENDEREÇO DA FOTO É ASSINADO NA HORA (`useDiaryFileUrl`), e não uma URL
     pública e eterna gravada no documento. Consequência: baixar PODE não estar
     disponível por um instante, e por isso o botão de baixar só aparece com o
     endereço em mãos — botão que não faz nada é pior que botão ausente.
  2. TEM ESTADO DE FOTO INDISPONÍVEL, que lá não existe porque lá o link nunca
     falha. Aqui ele pode: objeto removido do bucket, sessão sem permissão de
     leitura, rede fora. Aqui a explicação cabe, então ela é escrita.
  3. `photo.nome` vira `file_name`, e `photo.url` vira o caminho assinado — a
     linha do banco guarda o CAMINHO (migration 0071).

  O `zIndex: 9999` inline é o do original, e é o que põe o lightbox acima da
  gaveta do Radix (que usa z-50).
*/

export default function PhotoLightbox({
  photos,
  currentIndex,
  caption,
  onClose,
  onNavigate,
}: {
  photos: DiaryFile[]
  currentIndex: number
  caption: PhotoCaption | null
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

  const photo = photos[currentIndex]
  const urlQuery = useDiaryFileUrl(photo?.file_path)

  if (!photo) return null

  return (
    <div
      className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-white">
          {caption?.title && <p className="text-sm font-medium">{caption.title}</p>}
          {caption?.subtitle && <p className="text-xs text-slate-400">{caption.subtitle}</p>}
          <p className="text-xs text-slate-500 mt-0.5">
            {currentIndex + 1} / {photos.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {urlQuery.data && (
            <a
              href={urlQuery.data}
              download={photo.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              onClick={(event) => event.stopPropagation()}
            >
              <Download className="w-4 h-4 text-white" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Nav buttons */}
      {currentIndex > 0 && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            handlePrev()
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            handleNext()
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Foto */}
      <div
        className="max-w-4xl max-h-[70vh] w-full px-16"
        onClick={(event) => event.stopPropagation()}
      >
        {urlQuery.data ? (
          <img
            src={urlQuery.data}
            alt={photo.file_name}
            className="w-full h-full object-contain rounded-lg"
            style={{ maxHeight: '70vh' }}
          />
        ) : (
          <div
            className="w-full flex flex-col items-center justify-center gap-3 rounded-lg border border-white/10"
            style={{ height: '70vh' }}
          >
            <ImageOff className="w-8 h-8 text-slate-500" />
            <p className="text-sm text-slate-400">
              {urlQuery.isFetching
                ? 'Abrindo a foto...'
                : 'Não foi possível abrir esta foto agora.'}
            </p>
            {!urlQuery.isFetching && (
              <button
                onClick={() => void urlQuery.refetch()}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white transition-colors"
              >
                Tentar de novo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-0 left-0 right-0 px-4 py-4 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs text-slate-400 truncate">{photo.file_name}</p>
        {photos.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3 overflow-x-auto">
            {photos.map((thumbnail, index) => (
              <button
                key={thumbnail.id}
                onClick={() => onNavigate(index)}
                className={`shrink-0 w-10 h-10 rounded overflow-hidden border-2 transition-all ${
                  index === currentIndex
                    ? 'border-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-75'
                }`}
              >
                <DiaryPhoto file={thumbnail} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
