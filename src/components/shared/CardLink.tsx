import type { ReactNode } from 'react'

/*
  UM DADO DO CARTÃO QUE ABRE A TELA DELE.

  Existe por causa de uma armadilha que só aparece dentro de quadro arrastável:
  o cartão inteiro costuma ser a alça de arraste (`dragHandleProps` na Card), e
  um clique num texto dentro dele começa um arraste que termina em nada — o
  clique nunca chega ao handler. `stopPropagation` no CLIQUE resolve metade; a
  outra metade é o `mousedown`, que é onde o @hello-pangea/dnd decide que um
  arraste começou.

  Foi escrito uma vez no cartão do Pipeline e virou componente quando o pedido
  passou a valer para todos os quadros: repetir a dupla click+mousedown em cada
  lugar é repetir a chance de esquecer uma delas — e esquecer não quebra nada
  visível, só faz o link parar de responder.

  `enabled` false devolve o texto sem link, e é assim que a permissão de menu
  entra: quem não enxerga o CRM não ganha uma porta lateral para ele. O motivo
  é COERÊNCIA COM O MENU, não confidencialidade — não há guarda nas rotas, e as
  policies de leitura são largas de propósito. O que a permissão governa é para
  onde a tela CONVIDA a pessoa a ir.
*/
export default function CardLink({
  onClick,
  enabled = true,
  className,
  children,
}: {
  onClick: () => void
  enabled?: boolean
  className?: string
  children: ReactNode
}) {
  if (!enabled) {
    return <span className={className}>{children}</span>
  }

  return (
    <button
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`text-left underline-offset-2 hover:underline hover:text-foreground transition-colors ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
