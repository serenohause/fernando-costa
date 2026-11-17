import { createContext, useContext, type RefObject } from 'react'
import type { HelpAccess } from './types'

/*
  O estado do painel de ajuda, compartilhado entre o "?" do cabeçalho, o painel
  e a Central (o "Abrir guia" de cada cartão abre o mesmo painel).
*/
export type HelpContextValue = {
  isOpen: boolean
  /* O guia que o painel mostra agora, já resolvido para a tela atual. */
  guideKey: string | null
  pageName: string
  /* Nome da tela atual na trilha de navegação, para tela sem guia. */
  pageTitle: string
  access: HelpAccess
  read: ReadonlySet<string>
  setRead: (guideKey: string, value: boolean) => void
  openHelp: (guideKey?: string) => void
  closeHelp: () => void
  toggleHelp: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export const HELP_PANEL_ID = 'help-panel'

export const HelpContext = createContext<HelpContextValue | null>(null)

export function useHelp(): HelpContextValue {
  const value = useContext(HelpContext)
  if (!value) throw new Error('useHelp precisa estar dentro de <HelpProvider>.')
  return value
}
