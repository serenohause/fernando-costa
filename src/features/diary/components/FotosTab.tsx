import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Image } from 'lucide-react'
import ErrorState from '@/components/shared/ErrorState'
import { buildPhotoGroups } from '../obra'
import DiaryPhoto from './DiaryPhoto'
import type { DiaryFile, PhotoCaption, ProjectIssueRow, SiteVisitRow } from '../types'

/*
  Porta de nova-versao/src/components/diary/obra/FotosTab.jsx.

  A contagem no topo, a faixa de data com o rótulo do registro e o responsável no
  meio, a grade de três (quatro no desktop) e o quadrado com canto arredondado são
  os da versão nova, com o mesmo microcopy.

  ═══ O QUE MUDA, E POR QUÊ ═══

  1. AS FOTOS SÃO UMA CONSULTA SÓ. Lá esta aba refaz as duas consultas que as abas
     Obra e Pendências já fizeram (FotosTab.jsx:9-19) e junta os dois arrays em
     memória. Aqui as fotos das duas mães são linhas da MESMA tabela
     (`project_diary_files`, arco exclusivo, migration 0069) e chegam junto com
     cada registro — a gaveta lê uma vez e as três abas usam.
  2. O AGRUPAMENTO saiu do componente para `../obra`.
  3. TRÊS ESTADOS, e não dois: falha de leitura não pode parecer "nenhuma foto
     registrada".
  4. CADA FOTO É UM CAMINHO, e o endereço é assinado na hora (ver DiaryPhoto) — o
     bucket é privado, e o que está atrás dele é foto da obra da residência de um
     cliente.
*/

export default function FotosTab({
  visits,
  issues,
  isLoading,
  error,
  onRetry,
  onPhotoClick,
}: {
  visits: SiteVisitRow[]
  issues: ProjectIssueRow[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
  onPhotoClick: (photos: DiaryFile[], index: number, caption: PhotoCaption) => void
}) {
  const groups = useMemo(() => buildPhotoGroups(visits, issues), [visits, issues])

  const formatGroupDate = (value: string) => {
    try {
      return format(parseISO(value), "dd 'de' MMM 'de' yyyy", { locale: ptBR }).toUpperCase()
    } catch {
      return value
    }
  }

  if (error) {
    return (
      <ErrorState
        title="Não foi possível carregar as fotos"
        description="As fotos das visitas e das pendências deste projeto não puderam ser lidas agora."
        error={error}
        onRetry={onRetry}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map((placeholder) => (
          <div key={placeholder} className="aspect-square bg-muted rounded-lg" />
        ))}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <Image className="w-10 h-10 text-border mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Nenhuma foto registrada</p>
        <p className="text-xs text-faint mt-1">
          As fotos das visitas e pendências aparecerão aqui.
        </p>
      </div>
    )
  }

  const photoCount = groups.reduce((total, group) => total + group.photos.length, 0)

  return (
    <div className="space-y-6">
      <p className="text-xs text-faint font-medium">
        {photoCount} foto(s) em {groups.length} registro(s)
      </p>

      {groups.map((group) => (
        <div key={group.id}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border" />
            <div className="text-center">
              <p className="text-[10px] font-bold tracking-widest text-faint">
                {formatGroupDate(group.date)}
              </p>
              <p className="text-xs font-medium text-soft">{group.label}</p>
              {group.responsible && (
                <p className="text-[10px] text-faint">{group.responsible}</p>
              )}
            </div>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {group.photos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => onPhotoClick(group.photos, index, group.caption)}
                className="aspect-square rounded-xl overflow-hidden border border-border hover:opacity-90 hover:shadow-md transition-all"
              >
                <DiaryPhoto file={photo} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
