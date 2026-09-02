import { User } from 'lucide-react'
import { useAvatarUrl } from '../hooks'

/*
  A FOTO DE PERFIL, onde quer que ela apareça.

  O bucket é privado (migration 0088), então não há URL para colar num `src`:
  cada exibição pede uma URL assinada, que `useAvatarUrl` mantém em cache
  enquanto vale. Enquanto ela não chega — ou quando não há foto — aparece a
  inicial do nome, que é melhor que um quadrado vazio e melhor que um ícone
  genérico repetido em toda a tela.
*/
export default function AvatarPicture({
  avatarPath,
  name,
  size = 40,
  className,
}: {
  avatarPath: string | null | undefined
  name: string | null | undefined
  size?: number
  className?: string
}) {
  const { data: url } = useAvatarUrl(avatarPath)
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? null

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-elevated border border-border overflow-hidden shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt={name ? `Foto de ${name}` : 'Foto de perfil'}
          className="w-full h-full object-cover"
        />
      ) : initial ? (
        <span
          className="font-semibold text-muted-foreground"
          style={{ fontSize: Math.max(12, Math.round(size / 2.5)) }}
        >
          {initial}
        </span>
      ) : (
        <User className="text-muted-foreground" style={{ width: size / 2, height: size / 2 }} />
      )}
    </span>
  )
}
