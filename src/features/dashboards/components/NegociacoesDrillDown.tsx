import { useNavigate } from 'react-router'
import { Calendar, DollarSign, ExternalLink, User, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createPageUrl } from '@/lib/page-url'
import { FUNNEL_STAGE, NEGOTIATION_STATUS, labelOf, type NegotiationStatus } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import type { NegotiationRow } from '@/features/pipeline/types'

/*
  Porta de projeto-original/src/components/dashboard/NegociacoesDrillDown.jsx.

  A gaveta que os sete cartões clicáveis do Painel Comercial abrem: véu escuro
  com desfoque, painel colado à direita com no máximo `max-w-2xl`, cabeçalho
  grudento com título, subtítulo e botão de fechar, e um cartão por negociação.
  Geometria, espaçamento e microcopy são os do original, classe por classe.

  NÃO É O `Sheet` DO shadcn, e isso é deliberado: o Sheet deste projeto tem
  outro véu (`bg-black/80`), outra largura (`sm:max-w-sm`), padding próprio e
  animação de entrada. Trocar por ele mudaria o desenho da gaveta — é a mesma
  razão de o original ter escrito a gaveta à mão. Os `z-40`/`z-50` também são
  os do original, e continuam valendo aqui: a barra lateral do AppLayout está em
  `zIndex: 50` (o mesmo valor do Layout.jsx original), e a gaveta vem depois no
  DOM, então cobre a barra exatamente como lá.

  QUEM DECIDE O QUE ENTRA NA LISTA É QUEM CHAMA. Esta tela só desenha; o vazio
  aqui significa que o conjunto é vazio mesmo — a gaveta de "Negociações Ganhas",
  que no original abria sempre vazia por filtrar a lista errada, foi corrigida na
  origem (ver `commercialDrilldown` em features/dashboards/list.ts, caso
  'ganhas').

  A LINHA SÓ LEVA PARA A TELA DE NEGOCIAÇÕES, sem selecionar nada: o original
  recebe o id da negociação clicada e o descarta (linha 29-32), navegando para a
  lista inteira. Continua assim — a tela de destino é de outro módulo e não lê
  seleção nenhuma hoje; está no relatório. O parâmetro que ninguém usa é que não
  fica, porque o lint deste projeto não aceita argumento morto.
*/

const statusColors: Record<NegotiationStatus, string> = {
  active:
    'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  won: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  lost: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
}

export type NegociacoesDrillDownProps = {
  isOpen: boolean
  onClose: () => void
  negotiations: NegotiationRow[]
  title: string
  subtitle: string
}

export default function NegociacoesDrillDown({
  isOpen,
  onClose,
  negotiations,
  title,
  subtitle,
}: NegociacoesDrillDownProps) {
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleOpenNegotiation = () => {
    navigate(createPageUrl('Negociacoes'))
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-card shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          {negotiations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma negociação encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {negotiations.map((neg) => (
                <div
                  key={neg.id}
                  className="bg-elevated border border-border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group"
                  onClick={handleOpenNegotiation}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-foreground truncate">{neg.name}</h3>
                        {/* O `|| 'bg-slate-50'` do original é ramo morto: os três
                            status do enum estão todos no mapa. */}
                        <Badge variant="outline" className={statusColors[neg.status]}>
                          {labelOf(NEGOTIATION_STATUS, neg.status)}
                        </Badge>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-soft">
                          <User className="w-4 h-4 text-faint" />
                          {/* Nome ATUAL do cadastro, via embed — no original é a
                              cópia congelada `cliente_name`. */}
                          <span className="truncate">{neg.client?.name || 'Sem cliente'}</span>
                        </div>

                        {neg.owner?.name && (
                          <div className="flex items-center gap-2 text-sm text-soft">
                            <User className="w-4 h-4 text-faint" />
                            <span className="truncate">Responsável: {neg.owner.name}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-sm text-soft">
                          {/* `funnel_stage` é NOT NULL no schema, então o
                              'Sem etapa' do original é ramo morto. */}
                          <span className="px-2 py-0.5 bg-border text-soft rounded text-xs font-medium">
                            {labelOf(FUNNEL_STAGE, neg.funnel_stage)}
                          </span>
                        </div>

                        {/* `funnel_entry_date` é NOT NULL, então a condição
                            externa do original está sempre satisfeita. */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4 text-faint" />
                          {neg.closed_at ? (
                            <span>Fechado em {formatDateBR(neg.closed_at)}</span>
                          ) : (
                            <span>Criado em {formatDateBR(neg.funnel_entry_date)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-lg font-bold text-foreground mb-1">
                        <DollarSign className="w-4 h-4 text-soft" />
                        {formatCurrencyBRL(neg.estimated_value, { withCents: false })}
                      </div>
                      <ExternalLink className="w-4 h-4 text-faint group-hover:text-soft transition-colors ml-auto" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
