import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTabNavigation } from '@/components/navigation/TabNavigationWrapper'
import { createPageUrl } from '@/lib/page-url'
import {
  guideAccessKind,
  linkView,
  menuLabel,
  stepBlockedBy,
  stepText,
  visibleTasks,
} from '../access'
import { GUIDES } from '../guides/index.ts'
import { useHelp } from '../help-context'
import AccessBadge from './AccessBadge'
import ReadCheckbox from './ReadCheckbox'
import ShowOnScreenButton from './ShowOnScreenButton'

/*
  A PÁGINA DO GUIA, dentro da Central (`/Ajuda?guia=<chave>`). O texto completo
  que morava no painel lateral, com os mesmos blocos: Como fazer, Ligação com
  outros módulos, Marcar como lido (prototypes/tour-guiado.html, decisão 10).
*/
export default function GuidePage({ guideKey }: { guideKey: string }) {
  const help = useHelp()
  const { access } = help
  const guide = GUIDES[guideKey]
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const { scrollContainerRef } = useTabNavigation()
  const { tasks, hidden } = visibleTasks(access, guide)

  /* "Ler guia" abre a página do topo e leva o foco ao título. */
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [guideKey, scrollContainerRef])

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="text-soft">
          <Link to={createPageUrl('Ajuda')}>
            <ArrowLeft />
            Central de ajuda
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-bold text-foreground tracking-tight focus-visible:outline-hidden"
          >
            {guide.title}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-[40rem]">{guide.purpose}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <AccessBadge kind={guideAccessKind(access, guide)} withPrefix />
          </div>
        </div>
        <div className="shrink-0">
          <ShowOnScreenButton guideKey={guideKey} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 grid-cols-1 lg:grid-cols-[2fr_1fr] lg:items-start">
        <section
          aria-labelledby="guide-howto"
          className="rounded-xl bg-card text-card-foreground shadow-xs p-6"
        >
          <p
            id="guide-howto"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3"
          >
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
        </section>

        <section
          aria-labelledby="guide-links"
          className="rounded-xl bg-card text-card-foreground shadow-xs p-6"
        >
          <p
            id="guide-links"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3"
          >
            Ligação com outros módulos
          </p>
          <ul className="list-none m-0 p-0">
            {(guide.links ?? []).map((link) => {
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
                    <Link to={createPageUrl(view.page)} className={`${rowClass} hover:bg-muted`}>
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
        </section>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <ReadCheckbox
          checked={help.read.has(guideKey)}
          onChange={(value) => help.setRead(guideKey, value)}
          label="Marcar como lido"
        />
      </div>
    </div>
  )
}
