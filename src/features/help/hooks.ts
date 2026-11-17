import { useCallback, useMemo, useState } from 'react'
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
