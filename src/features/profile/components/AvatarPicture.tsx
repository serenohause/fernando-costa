import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { useAvatarUrl } from '../hooks'

/*
  A FOTO DE PERFIL, onde quer que ela apareça.

  O bucket é privado (migration 0088), então não há URL para colar num `src`:
  cada exibição pede uma URL assinada, que `useAvatarUrl` mantém em cache
  enquanto vale.

  SÃO DUAS ESPERAS, E ELAS SE SOMAM — é o que fazia a foto demorar "vários
  segundos" mostrando texto:

    1. a URL assinada, que é uma ida ao Storage;
    2. os bytes da imagem, depois que a URL chega.

  A segunda espera é a que aparecia feia: com a `<img>` já no DOM e sem bytes, o
  navegador pinta o `alt` como TEXTO. "Foto de Fernando Costa" escrito dentro do
  círculo, até a imagem chegar.

  O conserto não é tirar o `alt` — ele é o que um leitor de tela anuncia, e
  quem não enxerga a foto depende dele. É manter o placeholder por cima até o
  `onLoad`, com a imagem em `opacity-0` embaixo: o alt continua no DOM para
  quem precisa dele e não é desenhado para quem não precisa.
*/
export default function AvatarPicture({
  avatarPath,
  name,
  size = 40,
  className,
  shapeClassName = 'rounded-full bg-elevated border border-border',
  initialClassName = 'text-muted-foreground',
}: {
  avatarPath: string | null | undefined
  name: string | null | undefined
  size?: number
  className?: string
  /*
    A FORMA E O FUNDO SÃO DE QUEM CHAMA, porque cada tela já tinha o seu antes
    deste componente existir: a barra lateral usa círculo neutro, a Equipe usa
    quadrado arredondado violeta com a inicial. Trocar o visual delas para
    caber num componente comum seria mexer em layout que ninguém pediu — o que
    o componente traz é a foto e a espera, não uma aparência nova.
  */
  shapeClassName?: string
  initialClassName?: string
}) {
  const { data: url, isPending } = useAvatarUrl(avatarPath)
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? null

  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  /* URL nova é imagem nova: sem este reset, trocar a foto mostraria a nova já
     "carregada" — e o placeholder nunca apareceria no lugar certo. */
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [url])

  /*
    PULSA SÓ QUANDO HÁ FOTO PARA ESPERAR. Sem `avatarPath`, não há espera
    nenhuma: a inicial é o estado final, e piscar antes dela sugeriria um
    carregamento que não vai acontecer.
  */
  const esperando = Boolean(avatarPath) && !failed && (isPending || !url || !loaded)

  /*
    Quem anuncia para o leitor de tela é a `<img>`, pelo `alt` — quando ela
    existe. Quando não existe (sem foto, ou falha ao carregar), o papel passa
    para o próprio contêiner: sem isto, quem navega por leitor de tela
    encontraria um elemento mudo no lugar da pessoa. A inicial e o ícone ficam
    `aria-hidden` nos dois casos, porque "F" não é informação para quem ouve.
  */
  const imagemVisivel = Boolean(url) && !failed

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 ${shapeClassName} ${className ?? ''}`}
      style={{ width: size, height: size }}
      role={imagemVisivel ? undefined : 'img'}
      aria-label={imagemVisivel ? undefined : name ? `Foto de ${name}` : 'Sem foto de perfil'}
    >
      {imagemVisivel && (
        <img
          src={url}
          alt={name ? `Foto de ${name}` : 'Foto de perfil'}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          /* Assinatura vencida, objeto apagado por fora, rede caída: qualquer um
             deles cai aqui, e o certo é voltar para a inicial em vez de deixar o
             círculo vazio para sempre. */
          onError={() => setFailed(true)}
        />
      )}

      {esperando ? (
        <span className="absolute inset-0 bg-muted animate-pulse" aria-hidden="true" />
      ) : (
        !loaded &&
        (initial ? (
          <span
            className={`font-semibold ${initialClassName}`}
            style={{ fontSize: Math.max(12, Math.round(size / 2.5)) }}
            aria-hidden="true"
          >
            {initial}
          </span>
        ) : (
          <User
            className={initialClassName}
            style={{ width: size / 2, height: size / 2 }}
            aria-hidden="true"
          />
        ))
      )}
    </span>
  )
}
