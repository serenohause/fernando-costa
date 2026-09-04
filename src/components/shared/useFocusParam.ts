import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

/*
  `?focus=<id>` — chegar numa lista já apontando para um registro.

  Nasceu na lista de Projetos, para quem clicava no nome do projeto no quadro do
  Fluxo. A busca global precisou do mesmo gesto em mais cinco telas, e cinco
  cópias da mesma lógica é onde uma delas fica para trás.

  O QUE ELE FAZ, E O QUE DELIBERADAMENTE NÃO FAZ:

  - rola até o registro e o destaca por alguns segundos;
  - NÃO mexe em filtro nem em busca da tela. Preencher o campo de busca com o
    termo mudaria a lista inteira e a ordem por arraste, e quem veio ver um
    registro ficaria sem os outros;
  - tira o parâmetro da URL depois de usar. Sem isso, um F5 (ou voltar para a
    aba) rolaria de novo até um registro que a pessoa já deixou para trás.

  O destaque some sozinho: ele é um "olhe aqui", não um estado da tela.
*/

const DESTAQUE_MS = 4000

export function useFocusParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')

  const [highlighted, setHighlighted] = useState<string | null>(null)
  const alvo = useRef<HTMLElement | null>(null)

  /*
    A callback ref é aplicada em TODOS os itens da lista, e só guarda o que
    interessa. O `id` do item chega por closure, então a tela não precisa saber
    quando o elemento aparece — o elemento se registra ao ser montado, que é
    exatamente quando a lista terminou de carregar.
  */
  const registerFocusRef = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node && id === focusId) alvo.current = node
    },
    [focusId],
  )

  useEffect(() => {
    if (!focusId) return

    setHighlighted(focusId)

    /* Um quadro depois: o elemento pode ter acabado de ser montado nesta mesma
       renderização, e `scrollIntoView` num nó que ainda não tem posição não
       rola nada. */
    const raf = window.requestAnimationFrame(() => {
      alvo.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    const proximos = new URLSearchParams(searchParams)
    proximos.delete('focus')
    setSearchParams(proximos, { replace: true })

    const timer = window.setTimeout(() => setHighlighted(null), DESTAQUE_MS)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  /* A classe do destaque num lugar só: as seis telas que usam isto não podem
     divergir no que "destacado" quer dizer. */
  const focusClassName = (id: string) =>
    highlighted === id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''

  return { focusId, highlighted, registerFocusRef, focusClassName }
}
