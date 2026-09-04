import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, Search } from 'lucide-react'
import { useAppNavigation } from '@/features/auth/hooks'
import { createPageUrl } from '@/lib/page-url'
import { MIN_TERM, useDebounced, useGlobalSearch } from '../hooks'
import { SEARCH_KIND_META, searchHitParam, type SearchHit } from '../types'

/*
  A BUSCA DO CABEÇALHO.

  O que havia aqui era uma casca: o diálogo abria com um `input` sem estado, sem
  consulta e sem resultado — e o ORIGINAL é igual (QuickActions.jsx:250-258 do
  base44, onde o campo também não faz nada). Então não é conserto de
  comportamento; é a primeira vez que a busca existe.

  TECLADO, e não só clique: quem usa busca digita e aperta Enter. Setas movem,
  Enter abre, Esc fecha. Sem isso a pessoa é obrigada a tirar a mão do teclado
  no meio do gesto.
*/
export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounced(term)
  const navigate = useNavigate()

  const { data, isFetching, isError } = useGlobalSearch(debounced)
  const navigation = useAppNavigation()

  const listRef = useRef<HTMLDivElement>(null)

  /*
    OS MENUS QUE A PESSOA ENXERGA governam para onde a busca oferece caminho.
    A RLS já impediu que ela leia o que não pode — isto é sobre coerência de
    navegação: se o escritório tirou Fornecedores da barra lateral dela,
    oferecer uma porta lateral aqui contradiz aquela decisão. Mesmo critério do
    `ClientLink`.
  */
  const menusVisiveis = useMemo(() => {
    const chaves = new Set<string>()
    for (const item of navigation.items) {
      chaves.add(item.key)
      for (const sub of item.subItems ?? []) chaves.add(sub.key)
    }
    return chaves
  }, [navigation.items])

  const hits = useMemo(
    () => (data ?? []).filter((hit) => menusVisiveis.has(SEARCH_KIND_META[hit.kind].menu)),
    [data, menusVisiveis],
  )

  /* Agrupado por tipo, na ordem que o banco definiu — a lista responde "achei
     isto em Clientes, isto em Projetos", e não uma pilha sem seções. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, SearchHit[]>()
    for (const hit of hits) {
      const atual = mapa.get(hit.kind) ?? []
      atual.push(hit)
      mapa.set(hit.kind, atual)
    }
    return [...mapa.entries()].sort((a, b) => a[1][0].order - b[1][0].order)
  }, [hits])

  /* A lista achatada é a que o teclado percorre: as setas atravessam os grupos
     como se fossem uma coisa só, que é como se lê uma lista de resultados. */
  const planos = useMemo(() => grupos.flatMap(([, itens]) => itens), [grupos])

  useEffect(() => {
    setActive(0)
  }, [debounced])

  const abrir = (hit: SearchHit) => {
    const meta = SEARCH_KIND_META[hit.kind]
    navigate(createPageUrl(meta.page) + searchHitParam(hit))
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (planos.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % planos.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + planos.length) % planos.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      abrir(planos[active])
    }
  }

  /* Mantém o item ativo à vista quando as setas passam do fim da janela. */
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const curto = debounced.trim().length < MIN_TERM
  let indice = -1

  return (
    <div
      className="fixed inset-0 bg-black/20 z-50 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-6 pb-4 border-b border-border">
          <Search className="w-5 h-5 text-faint shrink-0" />
          <input
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, projetos, contratos, tarefas..."
            /*
              Sem `bg-transparent`/`text-foreground` o input cai no estilo do
              navegador (fundo `field`, texto `fieldtext`): caixa branca com
              texto preto dentro do diálogo escuro.
            */
            className="flex-1 outline-hidden text-lg bg-transparent text-foreground placeholder:text-faint"
            autoFocus
          />
          {isFetching && <Loader2 className="w-4 h-4 text-faint animate-spin shrink-0" />}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {curto ? (
            <p className="text-sm text-muted-foreground p-6">
              Digite ao menos {MIN_TERM} letras para buscar em todo o sistema.
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive p-6">
              A busca falhou. Verifique sua conexão e tente de novo.
            </p>
          ) : hits.length === 0 && !isFetching ? (
            /* ESTADO VAZIO COM O TERMO DENTRO: "nenhum resultado" sozinho deixa
               a dúvida de se a busca chegou a rodar. */
            <div className="p-6">
              <p className="text-sm font-medium text-foreground">
                Nenhum resultado para “{debounced.trim()}”.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Tente parte do nome, o número do contrato ou o telefone do cliente.
              </p>
            </div>
          ) : (
            grupos.map(([kind, itens]) => (
              <div key={kind} className="py-2">
                <p className="px-6 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {SEARCH_KIND_META[kind as SearchHit['kind']].plural}
                </p>
                {itens.map((hit) => {
                  indice += 1
                  const meuIndice = indice
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      type="button"
                      data-index={meuIndice}
                      onMouseEnter={() => setActive(meuIndice)}
                      onClick={() => abrir(hit)}
                      className={`w-full text-left px-6 py-2.5 transition-colors ${
                        meuIndice === active ? 'bg-elevated' : 'hover:bg-elevated'
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground truncate">{hit.title}</p>
                      {(hit.subtitle || hit.detail) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[hit.subtitle, hit.detail].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {!curto && hits.length > 0 && (
          <div className="px-6 py-2 border-t border-border text-xs text-faint">
            ↑↓ para navegar · Enter para abrir · Esc para fechar
          </div>
        )}
      </div>
    </div>
  )
}
