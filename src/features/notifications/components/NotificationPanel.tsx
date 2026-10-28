import type { ElementType } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import ErrorState from '@/components/shared/ErrorState'
import {
  agruparPorDia,
  contagemDeAvisos,
  rotuloDaContagem,
} from '../agrupar'
import {
  describeNotificationError,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks'
import NotificationItem from './NotificationItem'

/*
  O PAINEL DO SINO — cabeçalho, faixas de dia e lista, porte literal de
  prototypes/notificacoes-sino.html.

  O MESMO CONTEÚDO NOS DOIS TAMANHOS. No desktop ele mora num Popover de 24rem;
  no celular, numa folha que sobe do rodapé, porque 24rem não cabe em 360px.
  Quem escolhe entre os dois é NotificationBell.tsx; aqui a única diferença é o
  `compacto`, que é o que o protótipo desenha de diferente na folha.

  SEM RODAPÉ "VER TODAS AS NOTIFICAÇÕES" — decisão do usuário ao aprovar: não
  existe tela de histórico agora, e rodapé que promete uma tela inexistente é o
  defeito que o botão "Excluir conta" do original já tinha (ver AppLayout.tsx).
  A consequência é que O PAINEL É O HISTÓRICO: ele lista tudo, com rolagem, e o
  teto de leitura está documentado em hooks.ts.
*/

export default function NotificationPanel({
  aberto,
  compacto,
  onFechar,
  tituloAs,
}: {
  /*
    `aberto` liga a consulta da lista. Fechado, o que roda é só a contagem de
    não lidas — e não as 500 linhas.
  */
  aberto: boolean
  compacto?: boolean
  onFechar: () => void
  /*
    O título como elemento injetável existe por causa do Radix: a folha é um
    Dialog, e Dialog sem Title acusa no console e fica sem nome para o leitor de
    tela. Na folha isto recebe `SheetTitle`; no Popover fica o `h2` do
    protótipo. Mesma tipografia nos dois.
  */
  tituloAs?: ElementType
}) {
  const avisosQuery = useNotifications(aberto)
  const marcarLido = useMarkNotificationRead()
  const marcarTodas = useMarkAllNotificationsRead()

  const avisos = avisosQuery.data ?? []
  const naoLidas = avisos.filter((aviso) => aviso.read_at === null).length
  const grupos = agruparPorDia(avisos)
  const contagem = rotuloDaContagem(naoLidas, avisos.length)

  const Titulo = tituloAs ?? 'h2'

  /* Erro de escrita vai para o toast com a frase do banco traduzida, como as
     escritas do cartão da tarefa fazem (Tasks.tsx:302). O palpite otimista já
     voltou atrás sozinho quando isto roda. */
  const avisarFalha = (error: unknown) =>
    toast.error('Erro ao marcar como lida: ' + describeNotificationError(error))

  return (
    <>
      <div className="flex items-center gap-2 py-3 pl-4 pr-3 border-b border-border">
        <Titulo className="flex-1 min-w-0 text-sm font-semibold tracking-[-0.01em] m-0">
          Notificações{' '}
          {contagem && <span className="font-normal text-muted-foreground">{contagem}</span>}
        </Titulo>

        {/*
          "MARCAR TODAS" DESABILITA, NÃO ESCONDE: o lugar do botão não muda
          quando a caixa fica em dia. No celular sobra o ícone com rótulo
          acessível — a mesma ação, porque o texto longo não cabe ao lado do
          título em 360px — e a folha ganha fechar explícito, porque toque fora
          de área é gesto que não se descobre.
        */}
        {compacto ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Marcar todas como lidas"
              disabled={naoLidas === 0}
              onClick={() => marcarTodas(undefined, { onError: avisarFalha })}
            >
              <CheckCheck className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onFechar}>
              <X className="w-5 h-5" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-soft [&_svg]:size-3.5"
            disabled={naoLidas === 0}
            onClick={() => marcarTodas(undefined, { onError: avisarFalha })}
          >
            <CheckCheck />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {/*
        A lista rola por dentro. No desktop o teto é 24rem (o do protótipo); na
        folha ele sai e quem manda é a altura da folha — `min-h-0` é o que faz o
        filho de flex rolar em vez de esticar o container.
      */}
      <div
        className={
          compacto
            ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain'
            : 'max-h-96 overflow-y-auto overscroll-contain'
        }
      >
        {/* Os três estados, como toda listagem do projeto. */}
        {avisosQuery.isError ? (
          <ErrorState
            title="Não foi possível carregar"
            description="Seus avisos não puderam ser lidos agora."
            error={avisosQuery.error}
            onRetry={() => {
              void avisosQuery.refetch()
            }}
          />
        ) : avisosQuery.isLoading ? (
          /* Mesmo placeholder pulsante da fila de leads (Leads.tsx:224-228), na
             altura da linha deste painel. */
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : avisos.length === 0 ? (
          /*
            O VAZIO DE QUEM NUNCA RECEBEU NADA, e é o único vazio alcançável.

            O protótipo desenha DOIS: este e o "Nenhum aviso novo / você está em
            dia", com a porta para o histórico. O segundo foi desenhado para a
            variante em que o painel ESCONDE as lidas — e as duas decisões do
            usuário fecharam essa porta: o painel mostra lidas e não lidas
            juntas, e não existe tela de histórico. Com lidas na lista, lista
            vazia só acontece para quem nunca recebeu aviso nenhum, e aí "você
            está em dia" seria mentira.

            O QUE SOBREVIVEU do segundo cartão é o complemento do título, "·
            tudo lido", que é alcançável e está em `rotuloDaContagem`.

            DECIDIDO: o usuário escolheu que o segundo cartão sai de vez, em vez
            de o painel voltar a esconder as lidas. O protótipo o mantém riscado,
            para quem ler depois saber que a hipótese foi recusada e não que
            faltou implementar.
          */
          <div className="py-10 px-6 text-center">
            <div
              aria-hidden="true"
              className="w-12 h-12 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center"
            >
              <Bell className="w-6 h-6 text-faint" />
            </div>
            <p className="text-[0.9375rem] font-semibold mb-1.5">Nada por aqui</p>
            <p className="text-[0.8125rem] text-muted-foreground mx-auto max-w-[18rem]">
              Quando alguém te atribuir uma tarefa, ou um prazo seu vencer, o aviso aparece nesta
              lista.
            </p>
          </div>
        ) : (
          grupos.map((grupo, indiceDoGrupo) => (
            <div key={grupo.chave}>
              {/*
                A FAIXA DE DIA — o elemento de assinatura do painel. Grudada no
                topo enquanto a lista rola, e acima da camada do lado direito da
                linha (`z-[1]`), senão o visto de uma linha passa por cima da
                faixa durante a rolagem.
              */}
              <div
                className={`sticky top-0 z-[2] flex items-center justify-between gap-2 py-1.5 bg-elevated border-b border-border text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-muted-foreground ${
                  compacto ? 'pl-3.5 pr-4' : 'px-4'
                }`}
              >
                <span>{grupo.rotulo}</span>
                <span className="tracking-[0.02em] tabular-nums text-faint">
                  {contagemDeAvisos(grupo.avisos.length)}
                </span>
              </div>

              {grupo.avisos.map((aviso, indice) => (
                <NotificationItem
                  key={aviso.id}
                  aviso={aviso}
                  compacto={compacto}
                  /*
                    `last:border-b-0` não serve aqui: cada dia é um bloco, e a
                    regra do CSS apagaria a borda da última linha DE CADA dia,
                    deixando um buraco na linha divisória logo acima da faixa do
                    dia seguinte. Só a última linha do painel perde a borda, que
                    é o que o protótipo faz.
                  */
                  ultimo={
                    indiceDoGrupo === grupos.length - 1 && indice === grupo.avisos.length - 1
                  }
                  onMarcarLido={(id) => marcarLido({ id }, { onError: avisarFalha })}
                  onNavegar={onFechar}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </>
  )
}
