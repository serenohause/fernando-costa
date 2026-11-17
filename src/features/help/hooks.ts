import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useAppNavigation,
  useCollaboratorPermissions,
  useCurrentCollaborator,
  useMenus,
  useSession,
} from '@/features/auth/hooks'
import { useAcessarComoAtivo } from '@/features/impersonation/hooks'
import { buildHelpAccess } from './access'
import { GUIDES } from './guides/index.ts'
import { loadRead, readStorageKey, saveRead } from './read-storage'
import type { HelpAccess } from './types'

/*
  O ACESSO DA PESSOA, para a ajuda. Nenhuma query nova: as três chaves abaixo
  são as mesmas que o AppLayout já usa para montar a barra lateral (menus,
  permissões do colaborador, colaborador), então o React Query devolve o cache.

  Em "Acessar como" a sessão é a da pessoa assumida, e por isso o guia mostra
  o acesso DELA — é exatamente o que a barra lateral já faz.
*/
export function useHelpAccess(): HelpAccess {
  const collaborator = useCurrentCollaborator().data ?? null
  const isActive = collaborator?.status === 'active'
  const navigation = useAppNavigation()
  const permissions = useCollaboratorPermissions(isActive ? collaborator!.id : undefined).data
  const menus = useMenus(isActive).data

  return useMemo(
    () =>
      buildHelpAccess({
        items: navigation.items,
        permissions: permissions ?? [],
        role: isActive ? (collaborator?.role ?? null) : null,
        menus: menus ?? [],
      }),
    [navigation.items, permissions, isActive, collaborator?.role, menus],
  )
}

const KNOWN_GUIDES: ReadonlySet<string> = new Set(Object.keys(GUIDES))

/*
  O "LIDO", por escritório e pessoa.

  EM SESSÃO ASSUMIDA ("Acessar como") O LIDO FICA SÓ NA MEMÓRIA: não lê e não
  grava storage nenhum. O navegador é do Diretor, e a sessão é de outra pessoa:
  gravar com a chave dela faria o "lido" aparecer como se ela tivesse lido, e
  gravar com a do Diretor misturaria o que ele marcou vendo a ajuda de outra
  pessoa. Ao voltar, a página recarrega e esse estado some, como deve.
*/
export function useHelpRead() {
  const userId = useSession().data?.user?.id
  const tenantId = useCurrentCollaborator().data?.tenant_id
  const acessarComo = useAcessarComoAtivo()

  const storageKey = !acessarComo && userId && tenantId ? readStorageKey(tenantId, userId) : null

  const [store, setStore] = useState(() => ({
    key: storageKey,
    read: loadRead(storageKey, KNOWN_GUIDES),
  }))

  /* Chave mudou (sessão chegou, trocou de pessoa): recarrega daquela chave. */
  let current = store
  if (store.key !== storageKey) {
    current = { key: storageKey, read: loadRead(storageKey, KNOWN_GUIDES) }
    setStore(current)
  }

  const setRead = useCallback(
    (guideKey: string, value: boolean) => {
      setStore((prev) => {
        const read = new Set(prev.read)
        if (value) read.add(guideKey)
        else read.delete(guideKey)
        saveRead(prev.key, read)
        return { key: prev.key, read }
      })
    },
    [],
  )

  return { read: current.read as ReadonlySet<string>, setRead }
}

/*
  ESPERAR A TELA CARREGAR antes de começar um tour. "Me mostrar na tela" navega
  e o tour não pode nascer sobre o esqueleto de carregando: os passos são
  filtrados pelo que está no DOM, e na tela vazia de loading quase tudo pularia.

  "Carregada" = nenhuma query SEM DADO buscando agora, por três leituras
  seguidas (100 ms entre elas), e passado `minDelay` — a entrada da rota
  (RouteTransition, 0,2 s) e a do PageHeader (0,3 s) ainda mexem nos elementos.
  Releitura de fundo de query que já tem dado não segura nada. Dez segundos é o
  teto: rede lenta não deixa o tour preso para sempre.

  Devolve a função que cancela a espera.
*/
export function useWaitForScreen() {
  const queryClient = useQueryClient()

  return useCallback(
    (minDelay: number, onReady: () => void): (() => void) => {
      const startedAt = performance.now()
      let calm = 0
      let timer: number | undefined
      let cancelled = false

      const loading = () =>
        queryClient.isFetching({ predicate: (query) => query.state.data === undefined })

      const tick = () => {
        if (cancelled) return
        calm = loading() === 0 ? calm + 1 : 0
        const elapsed = performance.now() - startedAt
        if ((calm >= 3 && elapsed >= minDelay) || elapsed > 10_000) {
          onReady()
          return
        }
        timer = window.setTimeout(tick, 100)
      }

      if (minDelay === 0 && loading() === 0) onReady()
      else tick()

      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    },
    [queryClient],
  )
}
