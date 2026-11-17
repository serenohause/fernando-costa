import { useRef, type RefObject } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  LifeBuoy,
  Lock,
  MousePointerClick,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { createPageUrl } from '@/lib/page-url'
import {
  guideAccessKind,
  isFullGuide,
  linkView,
  menuLabel,
  stepBlockedBy,
  stepText,
  visibleTasks,
} from '../access'
import { GUIDES } from '../guides/index.ts'
import { HELP_PANEL_ID, useHelp } from '../help-context'
import type { Guide } from '../types'
import AccessBadge from './AccessBadge'
import ReadCheckbox from './ReadCheckbox'

/*
  O PAINEL "?" — Sheet à direita, NÃO MODAL (prototypes/ajuda.html).

  `modal={false}` é o que tira o overlay e o foco preso: a tela por trás segue
  clicável. Clique fora NÃO fecha (`onInteractOutside` cancelado): a pessoa
  navega pela barra com o painel aberto e ele passa a mostrar o guia da tela
  nova. Fecha no X ou no Esc.

  Largura: `w-full sm:max-w-sm` — tela cheia no celular, como toda gaveta
  lateral do app (SupplierDrawer.tsx), 24rem no desktop. Cabeçalho com o X na
  linha do título, como ProjectDiaryDrawer.tsx.
*/
export default function HelpPanel() {
  const help = useHelp()
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  const guide: Guide | null = help.guideKey
    ? (GUIDES[help.guideKey] ?? null)
    : {
        /* Tela sem guia mapeado: guia vazio com o nome da tela. */
        title: help.pageTitle,
        icon: BookOpen,
        purpose: 'Guia desta tela ainda não escrito.',
      }

  return (
    <Sheet
      open={help.isOpen}
      modal={false}
      onOpenChange={(value) => {
        if (!value) help.closeHelp()
      }}
    >
      {guide && (
        <SheetContent
          id={HELP_PANEL_ID}
          side="right"
          hideClose
          role="complementary"
          aria-describedby={undefined}
          className="w-full sm:max-w-sm p-0 gap-0 flex flex-col"
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            titleRef.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            help.triggerRef.current?.focus()
          }}
        >
          <PanelBody guide={guide} guideKey={help.guideKey} titleRef={titleRef} />
        </SheetContent>
      )}
    </Sheet>
  )
}

function PanelBody({
  guide,
  guideKey,
  titleRef,
}: {
  guide: Guide
  guideKey: string | null
  titleRef: RefObject<HTMLHeadingElement | null>
}) {
  const help = useHelp()
  const { access } = help
  const full = isFullGuide(guide)
  const accessKind = guideAccessKind(access, guide)
  const isHelpCenter = guideKey === 'help_center'

  return (
    <>
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
              Guia da tela
            </p>
            <SheetTitle
              ref={titleRef}
              tabIndex={-1}
              className="text-lg font-semibold text-foreground leading-tight focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            >
              {guide.title}
            </SheetTitle>
          </div>
          <button
            type="button"
            onClick={help.closeHelp}
            aria-label="Fechar guia"
            className="p-1.5 hover:bg-elevated rounded-lg transition-colors mt-0.5"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm text-soft mt-3">{guide.purpose}</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <AccessBadge kind={accessKind} withPrefix />
          {full && (
            <>
              <Button variant="outline" size="sm" disabled title="Tour guiado: extra futuro">
                <MousePointerClick />
                Me mostrar na tela
              </Button>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                em breve
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5">
        {full ? (
          <FullGuideBody guide={guide} />
        ) : (
          <div className="py-8 px-2 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
              {isHelpCenter ? (
                <LifeBuoy className="w-6 h-6 text-faint" />
              ) : (
                <BookOpen className="w-6 h-6 text-faint" />
              )}
            </div>
            <h3 className="text-[0.9375rem] font-semibold text-foreground mb-2">
              {isHelpCenter ? 'Você está na Central' : 'Guia completo em breve'}
            </h3>
            <p className="text-[0.8125rem] text-muted-foreground max-w-md mx-auto">
              {isHelpCenter
                ? 'Abra qualquer guia pelo cartão dele; o painel fica aqui ao lado.'
                : 'Por enquanto, a frase acima. Os outros guias prontos estão na Central de ajuda.'}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3 shrink-0">
        {full && guideKey ? (
          <ReadCheckbox
            checked={help.read.has(guideKey)}
            onChange={(value) => help.setRead(guideKey, value)}
            label="Marcar como lido"
          />
        ) : (
          <span />
        )}
        {help.pageName !== 'Ajuda' && (
          <Button asChild variant="ghost" size="sm" className="text-soft">
            <Link to={createPageUrl('Ajuda')}>
              Central de ajuda
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </>
  )
}

function FullGuideBody({ guide }: { guide: Guide }) {
  const { access } = useHelp()
  const { tasks, hidden } = visibleTasks(access, guide)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Como fazer
        </p>
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.title} className="rounded-lg border border-border bg-elevated p-4">
              <p className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                {task.title}
              </p>
              <ol className="mt-2 pl-5 list-decimal space-y-1 text-sm text-soft marker:text-faint marker:tabular-nums">
                {task.steps.map((step) => {
                  const blockedBy = stepBlockedBy(access, step)
                  return (
                    <li key={stepText(step)}>
                      {stepText(step)}
                      {blockedBy && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-1 whitespace-nowrap">
                          <Lock className="w-3 h-3 shrink-0" />
                          precisa de edição em {menuLabel(access, blockedBy)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
              {task.note && <p className="mt-2 text-xs text-muted-foreground">{task.note}</p>}
            </div>
          ))}
        </div>
        {hidden > 0 && (
          <p className="mt-3 flex gap-2 items-start bg-muted rounded-lg p-3 text-xs text-soft">
            <Lock className="w-3.5 h-3.5 mt-0.5 text-faint shrink-0" />
            <span>
              {hidden} {hidden === 1 ? 'tarefa desta tela pede' : 'tarefas desta tela pedem'}{' '}
              permissão de edição, e o seu acesso aqui é só ver. Quem libera é o Diretor, em
              Equipe, na matriz de Permissões.
            </span>
          </p>
        )}
      </div>

      {guide.links && guide.links.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Ligação com outros módulos
          </p>
          <ul className="list-none m-0 p-0">
            {guide.links.map((link) => {
              const view = linkView(access, link)
              if (!view) return null
              const Icon = view.guide.icon
              const rowClass =
                'flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-md w-[calc(100%+1rem)] text-left text-sm'
              const text = (
                <span className="flex-1 min-w-0">
                  <span
                    className={`block ${view.kind === 'off' ? 'font-normal text-muted-foreground' : 'font-medium text-foreground'}`}
                  >
                    {view.guide.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{view.why}</span>
                </span>
              )
              return (
                <li key={link.key}>
                  {view.kind === 'go' ? (
                    <Link
                      to={createPageUrl(view.page)}
                      className={`${rowClass} hover:bg-muted`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 text-faint shrink-0" />
                      {text}
                      <ChevronRight className="w-4 h-4 mt-0.5 text-faint shrink-0" />
                    </Link>
                  ) : (
                    <div className={rowClass}>
                      <Icon className="w-4 h-4 mt-0.5 text-faint shrink-0" />
                      {text}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
