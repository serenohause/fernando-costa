import { useRef, useState, type ChangeEvent } from 'react'
import { ImageOff, ImagePlus, Loader2, Maximize2, Plus, Trash2 } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  describeDatabaseError,
  useDeleteMapPropertyPhoto,
  useMapPropertyPhotos,
  useUploadMapPropertyPhotos,
} from '../hooks'
import {
  ACCEPT_PHOTO_ATTRIBUTE,
  MAX_PHOTO_SIZE_MB,
  MAX_PHOTOS_PER_PROPERTY,
} from '../photos'
import PropertyPhotoLightbox from './PropertyPhotoLightbox'
import type { EnrichedMapProperty, MapPropertyPhoto } from '../types'

/*
  O CARROSSEL DE FOTOS NO TOPO DO BALÃO DO PINO.

  Feature NOVA, pedida pelo escritório: não existe no base44 e não há tela
  original para copiar. O que existe para seguir é a decisão deste projeto sobre
  arquivo (módulos 8 e 11) e as medidas do próprio balão.

  ═══ AS DECISÕES QUE ESTA TELA TOMA ═══

  1. A CONSULTA SÓ ACONTECE COM O BALÃO ABERTO. O componente só é montado dentro
     do InfoWindow, e `useMapPropertyPhotos` é `enabled` pelo id — abrir o mapa
     com 500 pinos não busca foto nenhuma.

  2. SEM FOTO E SEM PERMISSÃO DE EDIÇÃO, O BLOCO NÃO EXISTE. Quem só visualiza
     veria um retângulo vazio dizendo que não há nada, empurrando para baixo os
     quatro botões que ele de fato usa. O vazio só aparece para quem pode
     resolvê-lo, e aí ele É o botão de resolver.

  3. OS BOTÕES DE AÇÃO APARECEM NO HOVER, e também no foco do teclado
     (`focus-within`) e em tela sem ponteiro (`hover: none`). Hover sozinho
     esconderia a remoção de quem navega por teclado e de quem está no celular.

  4. REMOVER PEDE CONFIRMAÇÃO. É o mesmo diálogo que "Remover do Mapa" usa
     (AlertDialog), e pelo mesmo motivo: foto apagada não volta, e o botão fica
     a um pixel do de adicionar.

  5. O ENVIO É DA TELA, E NÃO DO FORMULÁRIO. A foto entra na propriedade que já
     existe, direto do balão — por isso não há "salvar": escolher o arquivo é o
     gesto inteiro.
*/
export default function PropertyPhotos({
  property,
  canEdit,
}: {
  property: EnrichedMapProperty
  canEdit: boolean
}) {
  const photosQuery = useMapPropertyPhotos(property.id)
  const upload = useUploadMapPropertyPhotos()
  const remove = useDeleteMapPropertyPhoto()

  const inputRef = useRef<HTMLInputElement>(null)
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<MapPropertyPhoto | null>(null)

  const photos = photosQuery.data ?? []
  /*
    O ÍNDICE É PODADO NA LEITURA, e não corrigido por efeito: remover a última
    foto deixa `index` apontando para fora da lista por um render, e um efeito
    que conserte depois mostra um quadro vazio nesse meio-tempo.
  */
  const safeIndex = photos.length === 0 ? 0 : Math.min(index, photos.length - 1)
  const current = photos[safeIndex]

  const escolherArquivos = () => inputRef.current?.click()

  const aoEscolher = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    /* Limpa o input ANTES de qualquer coisa: sem isso, escolher o mesmo arquivo
       de novo depois de um erro não dispara `change`. */
    event.target.value = ''
    if (files.length === 0) return

    upload.mutate(
      { propertyId: property.id, files },
      {
        onSuccess: () => {
          toast.success(files.length === 1 ? 'Foto adicionada' : `${files.length} fotos adicionadas`)
          /* A foto nova entra no fim da fita, e é para ela que o carrossel vai. */
          setIndex(photos.length)
        },
        onError: (error) => toast.error(describeDatabaseError(error)),
      },
    )
  }

  const confirmarRemocao = () => {
    if (!pendingRemoval) return
    const alvo = pendingRemoval
    setPendingRemoval(null)

    remove.mutate(
      { id: alvo.id, propertyId: property.id },
      {
        onSuccess: () => toast.success('Foto removida'),
        onError: (error) => toast.error(describeDatabaseError(error)),
      },
    )
  }

  const enviando = upload.isPending
  const removendo = remove.isPending

  /* Carregando: um retângulo do tamanho final, para o balão não pular quando a
     resposta chegar. */
  if (photosQuery.isLoading) {
    return <div className="mb-3 aspect-[16/10] w-full animate-pulse rounded-lg bg-muted" />
  }

  if (photos.length === 0) {
    if (!canEdit) return null

    return (
      <div className="mb-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_PHOTO_ATTRIBUTE}
          multiple
          className="hidden"
          onChange={aoEscolher}
        />
        <button
          type="button"
          onClick={escolherArquivos}
          disabled={enviando}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40 hover:text-foreground disabled:cursor-wait disabled:opacity-70"
        >
          {enviando ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm font-medium">Enviando...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm font-medium">Adicionar fotos</span>
              <span className="text-[11px]">JPG, PNG ou WebP, até {MAX_PHOTO_SIZE_MB}MB</span>
            </>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="mb-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_PHOTO_ATTRIBUTE}
        multiple
        className="hidden"
        onChange={aoEscolher}
      />

      <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-muted">
        {current?.url ? (
          <img
            src={current.url}
            alt={current.file_name}
            className="h-full w-full cursor-zoom-in object-cover"
            onClick={() => setLightboxOpen(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="text-[11px]">Foto indisponível agora</span>
          </div>
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              title="Foto anterior"
              onClick={() => setIndex(safeIndex === 0 ? photos.length - 1 : safeIndex - 1)}
              className="absolute top-1/2 left-1.5 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/70 [@media(hover:none)]:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Próxima foto"
              onClick={() => setIndex(safeIndex === photos.length - 1 ? 0 : safeIndex + 1)}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/70 [@media(hover:none)]:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {safeIndex + 1} / {photos.length}
        </span>

        {/*
          A BARRA DE AÇÕES FICA EMBAIXO, E ISSO NÃO É GOSTO.

          Os quatro botões de camada do mapa (Mapa, Satélite, Híbrido, Relevo)
          flutuam no topo da área do mapa, e o balão de um pino alto na tela
          abre bem embaixo deles. Com a barra no canto superior direito, ver em
          tela cheia e remover ficavam parcialmente cobertos — medido em
          1440x900, com o balão aberto. Embaixo não há nada do mapa para
          disputar espaço.

          Aparece no hover, no foco do teclado e em tela sem ponteiro.
        */}
        <div className="absolute right-2 bottom-2 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            type="button"
            title="Ver em tela cheia"
            onClick={() => setLightboxOpen(true)}
            className="rounded-md bg-black/55 p-1.5 text-white transition-colors hover:bg-black/75"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                title={`Adicionar mais fotos (máximo ${MAX_PHOTOS_PER_PROPERTY})`}
                onClick={escolherArquivos}
                disabled={enviando}
                className="rounded-md bg-black/55 p-1.5 text-white transition-colors hover:bg-black/75 disabled:cursor-wait disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Remover esta foto"
                onClick={() => current && setPendingRemoval(current)}
                disabled={removendo}
                className="rounded-md bg-black/55 p-1.5 text-white transition-colors hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {(enviando || removendo) && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-xs text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            {enviando ? 'Enviando...' : 'Removendo...'}
          </div>
        )}
      </div>

      {photos.length > 1 && (
        <div className="mt-1.5 flex justify-center gap-1">
          {photos.map((photo, posicao) => (
            <button
              key={photo.id}
              type="button"
              title={photo.file_name}
              onClick={() => setIndex(posicao)}
              className={`h-1.5 rounded-full transition-all ${
                posicao === safeIndex ? 'w-4 bg-foreground' : 'w-1.5 bg-border hover:bg-faint'
              }`}
            />
          ))}
        </div>
      )}

      {lightboxOpen && (
        <PropertyPhotoLightbox
          photos={photos}
          currentIndex={safeIndex}
          title={property.displayName}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setIndex}
        />
      )}

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta foto?</AlertDialogTitle>
            <AlertDialogDescription>
              A foto sai da propriedade e do armazenamento. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRemoval(null)}>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                red-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={confirmarRemocao}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remover foto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
