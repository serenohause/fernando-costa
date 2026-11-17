import { createContext, useContext, type RefObject } from 'react'
import type { HelpAccess } from './types'

/*
  O estado da ajuda, compartilhado entre o "?" do cabeçalho (que inicia o tour
  da tela atual) e a Central (onde "Me mostrar na tela" navega e inicia o tour).
*/
export type HelpContextValue = {
  pageName: string
  access: HelpAccess
  read: ReadonlySet<string>
  setRead: (guideKey: string, value: boolean) => void
  /* O "?": tour da tela atual, ou o balão de tela sem tour. */
  startPageTour: () => void
  /* "Me mostrar na tela": abre a tela do guia e começa o tour quando ela carregar. */
  showOnScreen: (guideKey: string) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export const HelpContext = createContext<HelpContextValue | null>(null)

export function useHelp(): HelpContextValue {
  const value = useContext(HelpContext)
  if (!value) throw new Error('useHelp precisa estar dentro de <HelpProvider>.')
  return value
}
