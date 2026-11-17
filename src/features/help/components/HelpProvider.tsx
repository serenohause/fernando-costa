import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Lock, X } from 'lucide-react'
import { createPageUrl } from '@/lib/page-url'
import { resolveTour, tourGuideKeyForPage } from '../access'
import { GUIDES } from '../guides/index.ts'
import { HelpContext, type HelpContextValue } from '../help-context'
import { useHelpAccess, useHelpRead, useWaitForScreen } from '../hooks'
import { findTourTarget, startNotice, startTour, stopTour, type TourIconSource } from '../tour'

/*
  O "?" INICIA O TOUR DA TELA ATUAL (prototypes/tour-guiado.html). Sem painel:
  o texto completo vive na Central de ajuda.

  - Tela com tour: os passos são filtrados AGORA, pelo que está no DOM e pelo
    acesso da pessoa (`resolveTour`), e só então o driver começa — o contador
    conta só o que ficou.
  - Tela sem tour: balão curto no próprio "?", com "Abrir Central de ajuda".
  - "Me mostrar na tela" (Central): navega, espera a tela carregar e começa.

  Em "Acessar como" o acesso é o da pessoa assumida (`useHelpAccess`), como a
  barra lateral: o tour dela é o que ela veria.
*/
export default function HelpProvider({
  pageName,
  children,
}: {
  pageName: string
  children: ReactNode
}) {
  const access = useHelpAccess()
  const { read, setRead } = useHelpRead()
  const navigate = useNavigate()
  const waitForScreen = useWaitForScreen()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const iconsRef = useRef<HTMLDivElement | null>(null)
  const [pendingPage, setPendingPage] = useState<string | null>(null)

  const icons = useCallback<TourIconSource>(
    () => ({
      x: iconsRef.current?.querySelector<SVGElement>('[data-tour-icon="x"]') ?? null,
      lock: iconsRef.current?.querySelector<SVGElement>('[data-tour-icon="lock"]') ?? null,
    }),
    [],
  )

  /* Ao fechar, o foco volta ao "?" (decisão 8). */
  const focusTrigger = useCallback(() => triggerRef.current?.focus(), [])

  const runTourFor = useCallback(
    (page: string) => {
      const key = tourGuideKeyForPage(page)
      if (!key) {
        startNotice({
          inCentral: page === 'Ajuda',
          icons,
          onOpenCentral: () => navigate(createPageUrl('Ajuda')),
          onClosed: focusTrigger,
        })
        return
      }
      const tour = resolveTour(access, GUIDES[key], (target) => findTourTarget(target) !== null)
      startTour({ steps: tour.steps, editOut: tour.editOut, icons, onClosed: focusTrigger })
    },
    [access, icons, navigate, focusTrigger],
  )

  /* O "?": se a tela ainda carrega dado, espera; senão começa na hora. */
  const cancelWait = useRef<(() => void) | null>(null)
  const startPageTour = useCallback(() => {
    cancelWait.current?.()
    cancelWait.current = waitForScreen(0, () => runTourFor(pageName))
  }, [waitForScreen, runTourFor, pageName])

  const showOnScreen = useCallback(
    (guideKey: string) => {
      const page = GUIDES[guideKey]?.page
      if (!page || !GUIDES[guideKey].tour) return
      setPendingPage(page)
      navigate(createPageUrl(page))
    },
    [navigate],
  )

  /* "Me mostrar na tela": a tela chegou, espera os dados e começa. */
  useEffect(() => {
    if (!pendingPage || pendingPage !== pageName) return
    return waitForScreen(400, () => {
      setPendingPage(null)
      runTourFor(pageName)
    })
  }, [pendingPage, pageName, waitForScreen, runTourFor])

  /* Trocou de tela (barra lateral, voltar do navegador): o tour não segue. */
  useEffect(() => {
    return () => {
      cancelWait.current?.()
      stopTour()
    }
  }, [pageName])

  const value = useMemo<HelpContextValue>(
    () => ({
      pageName,
      access,
      read,
      setRead,
      startPageTour,
      showOnScreen,
      triggerRef,
    }),
    [pageName, access, read, setRead, startPageTour, showOnScreen],
  )

  return (
    <HelpContext.Provider value={value}>
      {children}
      {/* Os ícones do balão: desenhados aqui, clonados pelo tour (tour.ts). */}
      <div ref={iconsRef} hidden aria-hidden="true">
        <X data-tour-icon="x" />
        <Lock data-tour-icon="lock" />
      </div>
    </HelpContext.Provider>
  )
}
