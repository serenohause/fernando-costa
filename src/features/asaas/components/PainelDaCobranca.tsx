import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  BellOff,
  CircleAlert,
  IdCard,
  Info,
  Landmark,
  Loader,
  RefreshCw,
  Undo2,
  UserPen,
  Webhook,
  X,
} from 'lucide-react'
import StatusBadge from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { ReceivableRow } from '@/features/financial/types'
import { FINANCIAL_STATUS, labelOf, PAYMENT_METHOD } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import { createPageUrl } from '@/lib/page-url'
import {
  dataEHoraBR,
  pagoEm,
  primeiroNome,
  recusaDaEmissao,
  situacaoDaCobranca,
  taxaDoAsaas,
  useAsaasConnectionStatus,
  useCobrancasPorParcela,
  useGerarCobranca,
  useTelaLarga,
  type CobrancaDaParcela,
  type RecusaDaEmissao,
} from '../cobranca'
import { BadgeDaCobranca } from './CobrancaSituacao'
import FaixaDaCobranca from './FaixaDaCobranca'
import TiraDeCopiar from './TiraDeCopiar'

/*
  O PAINEL DA COBRANÇA DE UMA PARCELA (seções 9 a 16 do protótipo aprovado).

  Ele é a única porta da cobrança: a linha inteira da tabela o abre, e é dentro
  dele que se emite e se copia o link. "Gerar cobrança" solto na linha foi
  descartado no protótipo com o motivo escrito: gerar sem abrir o painel obriga a
  abrir o painel em seguida para copiar o link, que é o objetivo real.

  O QUE ESTA TELA NÃO FAZ, e diz que não faz: não cancela e não altera cobrança
  (a fase 1 não tem esse caminho no backend), e não busca o copia e cola do PIX
  de uma cobrança que nasceu sem ele (não existe como). Botão que não funciona é
  a pior coisa que este painel poderia ter.

  DE ONDE VEM O QUE APARECE: de UMA fonte, a linha de `asaas_charges` que
  `useCobrancasPorParcela` traz. A resposta da emissão não é desenhada: ela só
  diz se deu certo e se a cobrança já existia, e a invalidação dentro da mutation
  mantém o painel em "Emitindo" até o mapa ter a linha. Isso evita o painel
  montado com dois pedaços de origens diferentes, um dos quais sem `created_at`
  nem autor.

  TRÊS ESTADOS, COMO MANDA O CLAUDE.md: carregando (barra pulsando no lugar onde
  a tira vai aparecer), vazio (a parcela sem cobrança, que é a seção 9) e erro de
  leitura (faixa vermelha com "Tentar novamente"). O protótipo desenha o segundo;
  os outros dois usam as peças dele, porque lista e bloco que carregam dado
  precisam dos três.
*/

/* O <dt>/<dd> do Google Agenda conectado, que é o do protótipo: rótulo em caixa
   alta apagada, valor logo abaixo. */
function Dado({
  rotulo,
  children,
  className,
  largo = false,
}: {
  rotulo: string
  children: ReactNode
  className?: string
  /* No celular o resumo tem duas colunas e a situação ocupa as duas (seção 18). */
  largo?: boolean
}) {
  return (
    <div className={largo ? 'col-span-2 sm:col-span-1' : undefined}>
      <dt className="text-xs uppercase tracking-wider text-faint">{rotulo}</dt>
      <dd className={`mt-0.5 ${className ?? ''}`}>{children}</dd>
    </div>
  )
}

/* A situação em texto apagado, sem preenchimento: é o lugar do badge enquanto
   não há badge para mostrar (seções 9 e 10). */
function SituacaoApagada({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-[0.3125rem] text-[0.6875rem] font-normal text-faint">
      {children}
    </span>
  )
}

const SEPARADOR = <div className="h-px bg-border" />

export default function PainelDaCobranca({
  parcela,
  aberto,
  onFechar,
  podeEmitir,
}: {
  parcela: ReceivableRow
  aberto: boolean
  onFechar: () => void
  /* `can_edit` no menu `receivables`. Quem não pode editar não vê o item de
     menu nem o botão de gerar, e continua lendo a cobrança: a policy da 0126
     libera a leitura para quem vê o menu. */
  podeEmitir: boolean
}) {
  const cobrancasQuery = useCobrancasPorParcela()
  const gerar = useGerarCobranca()
  const telaLarga = useTelaLarga()

  /*
    O AVISO DE PAGAMENTO ESTÁ DE PÉ? Dois campos, por função (0129), porque a
    linha inteira de `asaas_connections` é leitura de quem vê Configurações e
    quem usa esta tela é o financeiro.

    `webhook_registered === false` é o único valor que muda a tela. Nulo (sem
    conexão) e `undefined` (carregando) não acusam nada: afirmar que o aviso
    está desligado enquanto a resposta não chegou colocaria uma tarja âmbar em
    toda abertura de painel, e tarja que aparece sempre deixa de ser lida.
  */
  const conexaoQuery = useAsaasConnectionStatus()
  const avisoDesligado = conexaoQuery.data?.webhook_registered === false

  /* A cobrança que ESTE painel acabou de emitir. Guardada só para a faixa da
     seção 13: o resto do painel desenha a partir do mapa. */
  const [jaExistia, setJaExistia] = useState(false)
  const [recusa, setRecusa] = useState<RecusaDaEmissao | null>(null)

  /*
    ABRIR DE NOVO É COMEÇAR DE NOVO. As duas marcas acima contam o que aconteceu
    NESTE uso do painel: a cobrança já existia, ou a emissão foi recusada. Sem
    este descarte, reabrir a mesma parcela (o painel é remontado só quando a
    parcela MUDA) mostraria a faixa "já tinha cobrança" de novo, ou a recusa de
    antes, para quem só queria copiar o link.
  */
  useEffect(() => {
    if (aberto) {
      setJaExistia(false)
      setRecusa(null)
    }
  }, [aberto])

  const cobranca = cobrancasQuery.data?.get(parcela.id)
  const cliente = parcela.client?.name ?? 'Sem cliente'

  const emitir = () => {
    setRecusa(null)
    gerar.mutate(parcela.id, {
      onSuccess: (resposta) => setJaExistia(resposta.alreadyExisted),
      onError: (erro) => setRecusa(recusaDaEmissao(erro)),
    })
  }

  const botaoFechar = (
    /* No celular o X do cabeçalho é a única saída, e a folha de baixo não tem
       rodapé (seção 18). */
    <Button variant="outline" className="hidden sm:inline-flex" onClick={onFechar}>
      Fechar
    </Button>
  )

  const rodapeSoFechar = (
    <div className="hidden flex-wrap justify-end gap-2 sm:flex">{botaoFechar}</div>
  )

  const resumo = (situacao: ReactNode) => (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <Dado rotulo="Valor" className="font-semibold tabular-nums">
        {formatCurrencyBRL(parcela.value)}
      </Dado>
      <Dado rotulo="Vencimento" className="tabular-nums">
        {formatDateBR(parcela.due_date)}
      </Dado>
      <Dado rotulo="Situação" largo>
        {situacao}
      </Dado>
    </dl>
  )

  const historico = (viva: CobrancaDaParcela) => (
    <>
      {SEPARADOR}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Dado rotulo="Emitida por" className="text-soft">
          {viva.created_by
            ? `${viva.created_by.name}, em ${dataEHoraBR(viva.created_at)}`
            : /* `on delete set null` na 0125: colaborador apagado deixa a
                 cobrança sem autor, e a tela não inventa um. */
              `Em ${dataEHoraBR(viva.created_at)}`}
        </Dado>
        <Dado rotulo="Identificação no Asaas" className="font-mono text-[0.8125rem] text-soft">
          {viva.asaas_payment_id}
        </Dado>
      </dl>
    </>
  )

  /*
    A TARJA QUE DESMENTE A PROMESSA DA TELA.

    Decisão do usuário em 03/11/2026. A letra miúda do painel dizia "quando o
    cliente pagar, o Asaas avisa e esta parcela vira paga sozinha", e isso é
    FALSO quando o aviso não está registrado: o cliente paga, ninguém aqui é
    avisado, e a parcela fica aberta até alguém baixar à mão. O protótipo
    aprovado desenhou esta tarja no capítulo 1, em Configurações, e não aqui,
    porque o capítulo 2 não desenha este estado.

    AS PALAVRAS SÃO AS DE LÁ, com uma oração a menos: a frase aprovada começa
    com "A cobrança pode ser emitida normalmente", que não cabe num painel que
    está mostrando uma cobrança já emitida. O resto é igual, inclusive o
    encaminhamento para a baixa manual, que é a única saída enquanto o aviso não
    voltar.

    SÓ EM COBRANÇA ABERTA. Em cobrança paga ou estornada o aviso já não tem o
    que fazer, e a tarja viraria ruído num painel que está contando outra
    história.
  */
  const tarjaDoAvisoDesligado = (
    <FaixaDaCobranca
      tom="warn"
      icone={BellOff}
      titulo="O aviso de pagamento não está registrado no Asaas"
      texto="Nenhuma parcela vai baixar sozinha: quando o cliente pagar, ninguém aqui será avisado. Até isto ser resolvido, a baixa é manual, pelo botão Marcar como Pago de cada parcela."
    />
  )

  const corpo = (): ReactNode => {
    /* 1. A RECUSA (seção 16), que troca o painel inteiro. */
    if (recusa !== null) {
      return (
        <>
          <FaixaDaCobranca
            tom={recusa.tom}
            icone={recusa.assunto === 'documento' ? IdCard : CircleAlert}
            titulo={recusa.titulo}
            texto={recusa.texto}
          />
          {recusa.rodape ? <p className="text-xs text-faint">{recusa.rodape}</p> : null}
          <div
            className={`flex-wrap justify-end gap-2 ${
              recusa.abrirFichaDoCliente && parcela.client ? 'flex' : 'hidden sm:flex'
            }`}
          >
            {botaoFechar}
            {recusa.abrirFichaDoCliente && parcela.client ? (
              /* O nome da pessoa vai DENTRO do rótulo: quem clicou está numa
                 lista de parcelas e não sabe de cor qual cliente é qual. */
              <Button asChild>
                <Link to={`${createPageUrl('ClientDetail')}?id=${parcela.client.id}`}>
                  <UserPen />
                  {primeiroNome(parcela.client.name)
                    ? `Abrir ficha de ${primeiroNome(parcela.client.name)}`
                    : 'Abrir ficha do cliente'}
                </Link>
              </Button>
            ) : null}
          </div>
        </>
      )
    }

    /* 2. ERRO DE LEITURA. A cobrança não foi lida, e dizer "sem cobrança" aqui
          seria afirmar o que não se sabe. */
    if (cobrancasQuery.isError) {
      return (
        <>
          <FaixaDaCobranca
            tom="error"
            icone={CircleAlert}
            titulo="Não foi possível ler a cobrança desta parcela"
            texto="A leitura falhou agora. Tente de novo; enquanto isso, nada nesta parcela foi alterado."
          />
          <div className="flex flex-wrap justify-end gap-2">
            {botaoFechar}
            <Button
              variant="outline"
              onClick={() => {
                void cobrancasQuery.refetch()
              }}
            >
              <RefreshCw />
              Tentar novamente
            </Button>
          </div>
        </>
      )
    }

    /* 3. CARREGANDO. A barra ocupa o lugar exato onde a tira de copiar vai
          aparecer, com a mesma altura: o painel não salta quando o dado chega. */
    if (cobrancasQuery.isLoading) {
      return (
        <>
          {resumo(<SituacaoApagada>Carregando</SituacaoApagada>)}
          <Skeleton className="h-[8.5rem] w-full" />
          {rodapeSoFechar}
        </>
      )
    }

    /* 4. EMITINDO (seção 10). A emissão fala com o Asaas mais de uma vez, então
          leva segundos: o botão não pode só ficar cinza. */
    if (gerar.isPending) {
      return (
        <>
          {resumo(<SituacaoApagada>Emitindo</SituacaoApagada>)}
          <Skeleton className="h-[8.5rem] w-full" />
          <p className="text-xs text-faint">
            Pode levar alguns segundos. Não feche esta janela e não clique de novo: a cobrança está
            sendo criada.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled>
              <Loader className="animate-spin" />
              Emitindo no Asaas...
            </Button>
          </div>
        </>
      )
    }

    /* 5. PARCELA SEM COBRANÇA (seção 9). */
    if (!cobranca) {
      return (
        <>
          {resumo(<SituacaoApagada>Sem cobrança emitida</SituacaoApagada>)}
          <FaixaDaCobranca
            tom="info"
            icone={Info}
            titulo="O cliente escolhe como pagar"
            texto="A cobrança gera uma página de pagamento no Asaas que aceita PIX, boleto e cartão. É o link dessa página que vai para o cliente."
          />
          <div className="flex flex-wrap justify-end gap-2">
            {botaoFechar}
            {podeEmitir ? (
              <Button onClick={emitir}>
                <Landmark />
                Gerar cobrança no Asaas
              </Button>
            ) : null}
          </div>
        </>
      )
    }

    const situacao = situacaoDaCobranca(cobranca)
    const badge = <BadgeDaCobranca cobranca={cobranca} />

    /* 6. A COBRANÇA QUE JÁ EXISTIA (seção 13). Faixa AZUL, de informação, e
          nunca vermelha nem âmbar: o resultado é exatamente o que a pessoa
          queria, ela tem o link. */
    if (jaExistia && situacao.desfecho === 'aberta') {
      return (
        <>
          <FaixaDaCobranca
            tom="info"
            icone={Info}
            titulo="Esta parcela já tinha cobrança"
            texto={`Nenhuma cobrança nova foi criada, e o cliente não foi cobrado duas vezes. É a cobrança de ${formatDateBR(
              cobranca.created_at,
            )}${
              cobranca.created_by ? `, emitida por ${cobranca.created_by.name}` : ''
            }, com o mesmo link abaixo.`}
          />
          {avisoDesligado && tarjaDoAvisoDesligado}
          {resumo(badge)}
          <TiraDeCopiar cobranca={cobranca} somenteOLink />
          {rodapeSoFechar}
        </>
      )
    }

    /* 7. COBRANÇA EM ABERTO (seções 11 e 12): a tira de copiar, que é o que a
          pessoa veio buscar. */
    if (situacao.desfecho === 'aberta') {
      return (
        <>
          {avisoDesligado && tarjaDoAvisoDesligado}
          {resumo(badge)}
          <TiraDeCopiar cobranca={cobranca} />
          {historico(cobranca)}
          {/*
            A PRIMEIRA FRASE SAI quando o aviso está desligado, em vez de
            conviver com a tarja: promessa e desmentido lado a lado na mesma tela
            fazem quem lê escolher em qual acreditar. A segunda frase continua
            verdadeira nos dois casos.

            E com a primeira fora, no celular (onde a segunda está escondida) não
            sobra texto nenhum, então o parágrafo inteiro não é montado: `<p>`
            vazio é só um espaço a mais embaixo da tira.
          */}
          {(!avisoDesligado || telaLarga) && (
            <p className="text-xs text-faint">
              {!avisoDesligado && (
                <>Quando o cliente pagar, o Asaas avisa e esta parcela vira paga sozinha. </>
              )}
              <span className="hidden sm:inline">
                Para cancelar ou alterar a cobrança, use o painel do Asaas: esta tela emite e
                acompanha, não altera.
              </span>
            </p>
          )}
          {rodapeSoFechar}
        </>
      )
    }

    /* 8. COBRANÇA ESTORNADA (seção 15). Único painel com DUAS situações lado a
          lado, da cobrança e da parcela, com os rótulos dizendo de quem é cada
          uma. Em qualquer outro estado isso seria ruído; aqui é o assunto. */
    if (situacao.desfecho === 'estornada') {
      return (
        <>
          <FaixaDaCobranca
            tom="error"
            icone={Undo2}
            titulo="O Asaas registrou um estorno desta cobrança"
            texto="A parcela continua marcada como paga aqui, e isso é intencional: devolver dinheiro é um lançamento do financeiro, não uma correção de tela. Se o valor saiu de verdade, registre a devolução em Contas a Pagar ou ajuste a parcela à mão."
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Dado rotulo="Situação da cobrança">{badge}</Dado>
            <Dado rotulo="Situação da parcela">
              <StatusBadge
                status={
                  parcela.is_overdue ? 'Em atraso' : labelOf(FINANCIAL_STATUS, parcela.status)
                }
              />
            </Dado>
            <Dado rotulo="Valor" className="tabular-nums" largo>
              {formatCurrencyBRL(cobranca.value)}
            </Dado>
          </dl>
          {historico(cobranca)}
          {rodapeSoFechar}
        </>
      )
    }

    /*
      9. COBRANÇA PAGA (seção 14), e o que só o Asaas sabe: forma de pagamento,
         valor líquido e taxa.

      A TIRA DE COPIAR SAI DA TELA: link de pagamento de cobrança paga é uma
      armadilha, alguém manda, o cliente abre, e a dúvida começa. O que fica é o
      histórico.

      A FAIXA SÓ APARECE QUANDO A PARCELA ESTÁ PAGA DE FATO. "A parcela baixou
      pelo aviso do Asaas" é uma afirmação sobre o recebível, e há um estado real
      em que ela seria falsa: `RECEIVED_IN_CASH` não está entre os eventos que
      baixam a parcela, então a cobrança pode estar recebida lá com a parcela
      aberta aqui.

      O MESMO BLOCO ATENDE O STATUS QUE O PROTÓTIPO NÃO NOMEIA (seção 7b: "palavra
      nova do provedor aparece crua, em cinza, e nunca como erro"). Sem faixa e
      sem a letra miúda, ele não afirma nada: mostra a palavra do Asaas, o que
      houver de data e de valor, e o histórico.
    */
    const pago = situacao.desfecho === 'paga'
    const dataDoPagamento = pagoEm(cobranca)
    const taxa = taxaDoAsaas(cobranca)

    return (
      <>
        {pago && parcela.status === 'paid' ? (
          <FaixaDaCobranca
            tom="done"
            icone={Webhook}
            titulo="Pago. A parcela baixou pelo aviso do Asaas"
            texto={`Em ${dataEHoraBR(
              cobranca.synced_at,
            )}. Ninguém marcou esta parcela à mão: o Asaas avisou e o sistema deu a baixa.`}
          />
        ) : null}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Dado rotulo="Situação" largo>
            {badge}
          </Dado>
          {dataDoPagamento ? (
            <Dado rotulo="Pago em" className="tabular-nums">
              {formatDateBR(dataDoPagamento)}
            </Dado>
          ) : null}
          {parcela.status === 'paid' ? (
            <Dado rotulo="Forma">
              {parcela.payment_method ? (
                /* O mapa dos SEIS valores do enum do banco, e não a lista de
                   cinco do formulário de recebível: a coluna é a do enum, e
                   `labelOf` precisa cobrir o domínio dela. O rótulo de cada um
                   dos cinco é o mesmo nos dois mapas. */
                labelOf(PAYMENT_METHOD, parcela.payment_method)
              ) : (
                /* Forma que não cabe no nosso cadastro (foi o caso do pagamento
                   em dinheiro) não vira palpite. */
                <span className="text-faint">Não informada pelo Asaas</span>
              )}
            </Dado>
          ) : null}
          <Dado rotulo="Valor cobrado" className="tabular-nums">
            {formatCurrencyBRL(cobranca.value)}
          </Dado>
          {/* Líquido e taxa aparecem porque esse é o número que o escritório vai
              conferir no extrato. Sem `net_value` as duas linhas somem: zero
              afirmaria que a cobrança foi de graça. */}
          {cobranca.net_value !== null ? (
            <Dado rotulo="Líquido na conta" className="font-semibold tabular-nums">
              {formatCurrencyBRL(cobranca.net_value)}
            </Dado>
          ) : null}
          {taxa !== null ? (
            <Dado rotulo="Taxa do Asaas" className="tabular-nums text-soft">
              {formatCurrencyBRL(taxa)}
            </Dado>
          ) : null}
        </dl>

        {historico(cobranca)}

        {pago ? (
          <p className="text-xs text-faint">
            O valor lançado no recebível é o cobrado, {formatCurrencyBRL(parcela.value)}. A taxa do
            Asaas não é descontada automaticamente nos Recebíveis: se o escritório quiser
            registrá-la como despesa, isso é um lançamento em Contas a Pagar.
          </p>
        ) : null}

        {rodapeSoFechar}
      </>
    )
  }

  const titulo = recusa !== null ? 'Cobrança não emitida' : 'Cobrança da parcela'

  const cabecalho = (Titulo: typeof DialogTitle, Descricao: typeof DialogDescription) => (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Titulo className="text-base font-semibold tracking-[-0.01em] sm:text-lg">{titulo}</Titulo>
        <Descricao className="mt-1 text-[0.8125rem] text-muted-foreground sm:text-sm">
          {recusa !== null ? (
            <>
              {parcela.description} · {formatCurrencyBRL(parcela.value)}
            </>
          ) : (
            <>
              {parcela.description}
              <span className="hidden sm:inline"> · </span>
              <br className="sm:hidden" />
              {cliente}
            </>
          )}
        </Descricao>
      </div>
      {/* O X sai durante a emissão: fechar no meio não cancela nada no Asaas, e
          deixar o botão ali sugere que cancela. */}
      {gerar.isPending ? null : (
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onFechar}>
          <X />
        </Button>
      )}
    </div>
  )

  const fecharPeloInvolucro = (proximo: boolean) => {
    /* Durante a emissão não se fecha: o protótipo tira a saída da tela de
       propósito, e Esc ou clique fora burlariam isso. */
    if (!proximo && !gerar.isPending) onFechar()
  }

  if (telaLarga) {
    return (
      <Dialog open={aberto} onOpenChange={fecharPeloInvolucro}>
        {/* O X padrão do diálogo sai: o cabeçalho desenha o seu, na posição do
            protótipo. `[&>button]:hidden` alcança só ele, que é o único botão
            filho direto do conteúdo. */}
        <DialogContent className="sm:max-w-[35rem] [&>button]:hidden">
          <div className="space-y-4">
            {cabecalho(DialogTitle, DialogDescription)}
            {corpo()}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={aberto} onOpenChange={fecharPeloInvolucro}>
      {/* A folha ocupa no máximo 88% da altura e rola POR DENTRO: a alça fica
          parada no topo e o corpo é que desliza, como no protótipo. */}
      <SheetContent
        side="bottom"
        hideClose
        className="flex max-h-[88dvh] flex-col gap-0 overflow-y-hidden rounded-t-xl p-0"
      >
        {/* A alça da folha, como no protótipo. */}
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
        <div className="space-y-4 overflow-y-auto p-4">
          {cabecalho(SheetTitle, SheetDescription)}
          {corpo()}
        </div>
      </SheetContent>
    </Sheet>
  )
}
