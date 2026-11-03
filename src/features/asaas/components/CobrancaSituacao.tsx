import { Badge } from '@/components/ui/badge'
import {
  situacaoDaCobranca,
  type CobrancaDaParcela,
  type FamiliaDaSituacao,
} from '../cobranca'

/*
  A SITUAÇÃO DA COBRANÇA, nos dois lugares em que ela aparece: o badge do painel
  (seção 7b do protótipo) e a segunda linha da coluna Status da tabela (seção 7,
  encurtada na seção 18).

  AS QUATRO FAMÍLIAS SÃO AS DO StatusBadge, classe por classe. O protótipo diz
  que no React isto "vira `<StatusBadge status="..." />` com quatro rótulos novos
  no mapa de statusStyles" — e seria o certo, só que
  `src/components/shared/StatusBadge.tsx` está fora dos arquivos que esta
  entrega pode tocar. Então o badge daqui é o mesmo `<Badge variant="outline">`
  com as mesmas classes de família que `STATE_STYLES` escreve, para a tela ser
  idêntica. Quando os sete rótulos entrarem no mapa de lá, este componente passa
  a ser uma chamada ao StatusBadge e nada muda em tela. Está no relatório.
*/
const FAMILIA_DO_BADGE: Record<FamiliaDaSituacao, string> = {
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  emerald:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  neutral: 'bg-elevated text-soft border-border',
}

/* A segunda linha NÃO TEM PREENCHIMENTO, e isso é a decisão da seção 7: em cima,
   com preenchimento, o estado da PARCELA, que é o número que o financeiro
   fecha; embaixo, só ícone e tinta, o estado da COBRANÇA, que é apoio. */
const FAMILIA_DA_LINHA: Record<FamiliaDaSituacao, string> = {
  blue: 'text-blue-700 dark:text-blue-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  rose: 'text-rose-700 dark:text-rose-400',
  neutral: 'text-faint',
}

export function BadgeDaCobranca({ cobranca }: { cobranca: CobrancaDaParcela }) {
  const situacao = situacaoDaCobranca(cobranca)

  return (
    <Badge variant="outline" className={`${FAMILIA_DO_BADGE[situacao.familia]} font-medium`}>
      {situacao.rotulo}
    </Badge>
  )
}

/*
  A SEGUNDA LINHA DA COLUNA STATUS.

  `cobranca` ausente é a parcela sem cobrança emitida, e a ausência é dita em
  texto apagado, não com um botão: quem clica na linha chega ao painel que emite.

  O TEXTO ENCURTA NO CELULAR em vez de quebrar em duas linhas, e a cor e o ícone
  seguem iguais (seção 18). O corte é o `sm` do Tailwind, que é o que o resto do
  app usa: o protótipo mostra os dois extremos (desktop e 360px) e não nomeia o
  ponto de virada.
*/
export function LinhaDaCobranca({ cobranca }: { cobranca: CobrancaDaParcela | undefined }) {
  if (!cobranca) {
    return (
      <span className="mt-1.5 flex items-center gap-[0.3125rem] whitespace-nowrap text-[0.6875rem] font-normal text-faint">
        <span className="sm:hidden">Sem cobrança</span>
        <span className="hidden sm:inline">Sem cobrança emitida</span>
      </span>
    )
  }

  const situacao = situacaoDaCobranca(cobranca)
  const Icone = situacao.icone

  return (
    <span
      className={`mt-1.5 flex items-center gap-[0.3125rem] whitespace-nowrap text-[0.6875rem] font-medium ${
        FAMILIA_DA_LINHA[situacao.familia]
      }`}
    >
      {Icone ? <Icone className="size-[0.8125rem] shrink-0" /> : null}
      {situacao.linha === situacao.linhaCurta ? (
        situacao.linha
      ) : (
        <>
          <span className="sm:hidden">{situacao.linhaCurta}</span>
          <span className="hidden sm:inline">{situacao.linha}</span>
        </>
      )}
    </span>
  )
}
