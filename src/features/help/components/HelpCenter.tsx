import { BookOpen, Info } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { buildTrails, guideAccessKind, isFullGuide } from '../access'
import { GUIDES } from '../guides/index.ts'
import { useHelp } from '../help-context'
import AccessBadge from './AccessBadge'
import ReadCheckbox from './ReadCheckbox'

/*
  CENTRAL DE AJUDA (`/Ajuda`), fora de `menus`, como `/Perfil`: todo mundo tem,
  e não há permissão a consultar. A trilha é montada pelo acesso da pessoa —
  trilha sem nenhuma tela dela não aparece, e uma linha no rodapé diz quantas
  ficaram de fora.

  Sem estado de carregando/erro próprio: o acesso vem do que o AppLayout já
  carregou, e ele só desenha a página depois disso (ou mostra a tela de erro
  dele). E nunca fica vazia: "Primeiros passos" vale para todo mundo.
*/
export default function HelpCenter() {
  const help = useHelp()
  const { trails, hiddenTrails } = buildTrails(help.access)

  const fullGuides = trails.flatMap((t) => t.full)
  const readCount = fullGuides.filter((k) => help.read.has(k)).length
  const allGuides = trails.reduce((sum, t) => sum + t.visible.length, 0)
  const pct = fullGuides.length ? Math.round((readCount / fullGuides.length) * 100) : 0

  return (
    <div>
      <PageHeader
        title="Central de ajuda"
        subtitle="Os guias das telas que você usa, na ordem do caminho do cliente. Leia quando quiser: nada aqui é obrigatório."
      />

      <Card className="border-0 shadow-xs p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Sua trilha
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Montada pelo seu acesso: {trails.length} trilhas, {allGuides} guias. Marcar como lido
            é só para você se orientar.
          </p>
        </div>
        <div className="min-w-56">
          <Progress value={pct} aria-label="Guias lidos" />
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {readCount} de {fullGuides.length} guias prontos lidos
          </p>
        </div>
      </Card>

      {trails.map((trail) => {
        const read = trail.full.filter((k) => help.read.has(k)).length
        const headingId = `trail-${trail.n}`
        return (
          <section
            key={trail.n}
            aria-labelledby={headingId}
            className="rounded-xl bg-card text-card-foreground shadow-xs p-6 mt-6"
          >
            <div className="flex items-start gap-4 mb-4">
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-2xl bg-muted text-soft flex items-center justify-center font-semibold tabular-nums shrink-0"
              >
                {trail.n}
              </span>
              <div className="flex-1 min-w-0">
                <h2 id={headingId} className="text-lg font-semibold text-foreground">
                  {trail.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{trail.desc}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums pt-1">
                {trail.full.length ? `${read} de ${trail.full.length} lidos` : 'em breve'}
              </span>
            </div>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {trail.visible.map((key) => (
                <GuideCard key={key} guideKey={key} />
              ))}
            </div>
          </section>
        )
      })}

      {hiddenTrails > 0 && (
        <p className="mt-6 text-[0.8125rem] text-muted-foreground flex gap-2 items-start">
          <Info className="w-4 h-4 mt-0.5 text-faint shrink-0" />
          <span>
            {hiddenTrails} {hiddenTrails === 1 ? 'trilha não aparece' : 'trilhas não aparecem'}{' '}
            porque {hiddenTrails === 1 ? 'depende' : 'dependem'} de telas que você não tem. Elas
            entram aqui quando o Diretor liberar o menu, em Equipe.
          </span>
        </p>
      )}
    </div>
  )
}

function GuideCard({ guideKey }: { guideKey: string }) {
  const help = useHelp()
  const guide = GUIDES[guideKey]
  const isRead = help.read.has(guideKey)
  const Icon = guide.icon

  return (
    <article className="p-4 rounded-lg border border-border bg-elevated flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-soft shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <h3
          className={`flex-1 min-w-0 text-sm font-medium ${isRead ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {guide.title}
        </h3>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground flex-1">{guide.purpose}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
        {isFullGuide(guide) ? (
          <>
            <Button variant="outline" size="sm" onClick={() => help.openHelp(guideKey)}>
              <BookOpen />
              Abrir guia
            </Button>
            <ReadCheckbox
              checked={isRead}
              onChange={(value) => help.setRead(guideKey, value)}
              label="Lido"
            />
          </>
        ) : (
          <>
            <Badge variant="outline" className="whitespace-nowrap bg-elevated text-soft border-border">
              Guia em breve
            </Badge>
            <AccessBadge kind={guideAccessKind(help.access, guide)} />
          </>
        )}
      </div>
    </article>
  )
}
