import { driver, type Config, type Driver, type PopoverDOM } from 'driver.js'
import type { TourStep } from './types'

/*
  O TOUR GUIADO, sobre driver.js 1.10.2 (prototypes/tour-guiado.html).

  Tudo aqui é DOM, fora do React: o driver desenha o overlay e o balão direto no
  <body>. O React só decide QUAIS passos entram (`resolveTour`, em access.ts) e
  QUANDO começar (HelpProvider). O visual do balão vem do bloco "BALÃO DO TOUR"
  do index.css, que sobrescreve o CSS do pacote com os tokens do tema.
*/

/* O elemento do passo: o primeiro `[data-tour]` que está NA TELA. Projects.tsx
   desenha o cliente e o menu duas vezes (celular empilhado e grade do desktop),
   e um deles fica `display: none`. */
export function findTourTarget(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  for (const node of nodes) if (isShown(node)) return node
  return null
}

function isShown(node: HTMLElement): boolean {
  const r = node.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'
}

/* < 40rem, o `sm` do Tailwind: o balão vira faixa (decisão 4). */
const isPhoneWidth = () => window.innerWidth < 640

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const isDark = () => document.documentElement.classList.contains('dark')

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el)
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el
    }
    el = el.parentElement
  }
  return null
}

/*
  ROLAGEM: o driver só rola quando o alvo sai da JANELA, e a página rola dentro
  do <main> do AppLayout. Aqui garantimos o alvo inteiro dentro da área que
  rola, com folga para a faixa no celular.
*/
function ensureVisible(node: Element | undefined) {
  if (!(node instanceof HTMLElement)) return
  const content = scrollParent(node)
  if (!content) return
  const c = content.getBoundingClientRect()
  const r = node.getBoundingClientRect()
  const reserve = isPhoneWidth() ? 160 : 24
  if (r.top < c.top + 8 || r.bottom > c.bottom - reserve) {
    const target =
      content.scrollTop + (r.top - c.top) - Math.max(16, (c.height - reserve - r.height) / 2)
    content.scrollTo({ top: Math.max(0, target), behavior: 'auto' })
  }
}

let active: Driver | null = null

/* Celular: faixa embaixo da tela; sobe para o topo se o alvo cair embaixo. */
function placeStrip() {
  if (!active) return
  const pop = document.querySelector<HTMLElement>('.driver-popover.tour-pop')
  const node = active.getActiveElement()
  if (!pop) return
  const phone = isPhoneWidth()
  pop.classList.toggle('is-strip', phone)
  if (!phone || !node) return
  const left = 8
  const right = window.innerWidth - 8
  const topEdge = 8
  const bottomEdge = window.innerHeight - 8
  const h = pop.offsetHeight
  const r = node.getBoundingClientRect()
  let top = bottomEdge - h
  if (r.bottom + 6 > top) {
    const above = topEdge
    top = r.top - 6 >= above + h ? above : r.top - 6 - h > 0 ? r.top - 6 - h : above
  }
  pop.style.setProperty('--strip-left', `${left}px`)
  pop.style.setProperty('--strip-width', `${right - left}px`)
  pop.style.setProperty('--strip-top', `${top}px`)
}

const onStripMove = () => placeStrip()

function attachStrip() {
  window.addEventListener('resize', onStripMove)
  window.addEventListener('scroll', onStripMove, { passive: true, capture: true })
}

function detachStrip() {
  window.removeEventListener('resize', onStripMove)
  window.removeEventListener('scroll', onStripMove, { capture: true })
}

/*
  Os ícones do balão são os do lucide-react, desenhados escondidos pelo
  HelpProvider (`TourIcons`) e clonados aqui: o driver monta o balão com
  innerHTML, fora da árvore do React.
*/
export type TourIconSource = () => { x: SVGElement | null; lock: SVGElement | null }

function closeIcon(popover: PopoverDOM, icons: TourIconSource) {
  const x = icons().x
  if (!x) return
  popover.closeButton.replaceChildren(x.cloneNode(true))
}

function baseConfig(): Config {
  const motion = !reducedMotion()
  return {
    animate: motion,
    smoothScroll: motion,
    /* `bg-black` do Tailwind; 50% no claro, 70% no escuro (decisão 5). */
    overlayColor: 'rgb(0, 0, 0)',
    overlayOpacity: isDark() ? 0.7 : 0.5,
    stagePadding: 6,
    stageRadius: 8,
    popoverOffset: 8,
    popoverClass: 'tour-pop',
    allowClose: true,
    overlayClickBehavior: 'close',
    disableActiveInteraction: true,
    allowKeyboardControl: true,
    closeBtnLabel: 'Fechar tour',
    nextBtnText: 'Próximo',
    prevBtnText: 'Anterior',
    doneBtnText: 'Concluir',
  }
}

function accessLine(editOut: number): string {
  if (!editOut) return ''
  const passos = editOut === 1 ? 'passo de edição ficou' : 'passos de edição ficaram'
  return `<span class="tour-access"><span>Seu acesso aqui é só ver: ${editOut} ${passos} de fora.</span></span>`
}

export function stopTour() {
  active?.destroy()
}

export function startTour({
  steps,
  editOut,
  icons,
  onClosed,
}: {
  steps: TourStep[]
  editOut: number
  icons: TourIconSource
  onClosed: () => void
}) {
  stopTour()
  const nodes = steps.map((s) => findTourTarget(s.target))
  const line = accessLine(editOut)
  const tour = driver({
    ...baseConfig(),
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    steps: steps.map((s, i) => ({
      element: nodes[i] ?? undefined,
      popover: { title: s.title, description: escapeHtml(s.body) + (i === 0 ? line : '') },
      onHighlightStarted: (node) => ensureVisible(node),
    })),
    onPopoverRender: (popover) => {
      closeIcon(popover, icons)
      const lock = icons().lock
      const slot = popover.description.querySelector('.tour-access')
      if (lock && slot) slot.prepend(lock.cloneNode(true))
      popover.wrapper.setAttribute('aria-roledescription', 'tour')
      requestAnimationFrame(placeStrip)
    },
    onHighlighted: () => requestAnimationFrame(placeStrip),
    onDestroyed: () => {
      if (active === tour) active = null
      detachStrip()
      onClosed()
    },
  })
  active = tour
  attachStrip()
  tour.drive()
}

/* Tela sem tour: balão curto no "?", sem escurecer, sem navegar (decisão 1). */
export function startNotice({
  inCentral,
  icons,
  onOpenCentral,
  onClosed,
}: {
  inCentral: boolean
  icons: TourIconSource
  onOpenCentral: () => void
  onClosed: () => void
}) {
  stopTour()
  const anchor = findTourTarget('header-help')
  const tour = driver({
    ...baseConfig(),
    overlayOpacity: 0,
    stagePadding: 2,
    stageRadius: 6,
    showProgress: false,
    showButtons: inCentral ? ['close'] : ['next', 'close'],
    nextBtnText: 'Abrir Central de ajuda',
    doneBtnText: 'Abrir Central de ajuda',
    steps: [
      {
        element: anchor ?? undefined,
        popover: inCentral
          ? {
              title: 'Você está na Central',
              description:
                'Cada guia pronto tem o botão Me mostrar na tela, que abre a tela e começa o tour.',
            }
          : {
              title: 'Esta tela ainda não tem tour',
              description: 'O que ela faz está na Central de ajuda.',
            },
      },
    ],
    onPopoverRender: (popover) => {
      closeIcon(popover, icons)
      popover.wrapper.classList.add('is-notice')
      if (inCentral) popover.wrapper.classList.add('no-action')
      requestAnimationFrame(placeStrip)
    },
    onDoneClick: () => {
      tour.destroy()
      onOpenCentral()
    },
    onDestroyed: () => {
      if (active === tour) active = null
      detachStrip()
      onClosed()
    },
  })
  active = tour
  attachStrip()
  tour.drive()
}
