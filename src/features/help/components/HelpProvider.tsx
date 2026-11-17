import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { guideKeyForPage } from '../access'
import { HelpContext, type HelpContextValue } from '../help-context'
import { useHelpAccess, useHelpRead } from '../hooks'
import HelpPanel from './HelpPanel'

/*
  O PAINEL SEGUE A TELA: aberto, ele passa a mostrar o guia da tela nova a cada
  navegação. O "Abrir guia" da Central abre um guia escolhido, que vale só
  enquanto a pessoa continuar na mesma tela.
*/
export default function HelpProvider({
  pageName,
  pageTitle,
  children,
}: {
  pageName: string
  pageTitle: string
  children: ReactNode
}) {
  const access = useHelpAccess()
  const { read, setRead } = useHelpRead()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [opened, setOpened] = useState<{ page: string; key: string | null } | null>(null)

  let current = opened
  if (opened && opened.page !== pageName) {
    current = { page: pageName, key: guideKeyForPage(pageName) }
    setOpened(current)
  }

  const openHelp = useCallback(
    (guideKey?: string) => {
      setOpened({ page: pageName, key: guideKey ?? guideKeyForPage(pageName) })
    },
    [pageName],
  )
  const closeHelp = useCallback(() => setOpened(null), [])
  const toggleHelp = useCallback(() => {
    setOpened((prev) => (prev ? null : { page: pageName, key: guideKeyForPage(pageName) }))
  }, [pageName])

  const value = useMemo<HelpContextValue>(
    () => ({
      isOpen: current !== null,
      guideKey: current?.key ?? null,
      pageName,
      pageTitle,
      access,
      read,
      setRead,
      openHelp,
      closeHelp,
      toggleHelp,
      triggerRef,
    }),
    [current, pageName, pageTitle, access, read, setRead, openHelp, closeHelp, toggleHelp],
  )

  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpPanel />
    </HelpContext.Provider>
  )
}
