import { useState } from 'react'
import { BellOff, Check, Landmark, Link2Off, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  AMBIENTE_DESCRICAO,
  AMBIENTE_LABEL,
  type AsaasEnvironment,
  descreverErroDaConexaoAsaas,
  useAsaasConnection,
  useConnectAsaas,
  useDisconnectAsaas,
  useRenewAsaasWebhook,
} from '../conexao'
import AsaasConectarForm from './AsaasConectarForm'
import AsaasFaixa from './AsaasFaixa'

/*
  O BLOCO DA CONTA ASAAS EM CONFIGURAÇÕES, INTEGRAÇÕES.

  É irmão do bloco do Google Agenda e repete a anatomia dele: ladrilho de
  2,5rem, título, descrição, Badge de estado no canto direito, corpo e botões
  embaixo. O que muda é que lá a conexão é consentimento em outro site e aqui é
  uma chave colada, então o corpo do bloco carrega um formulário.

  TRÊS ESTADOS DE CONEXÃO, e o que os distingue nos dados:

    sem linha                       → não conectado, e o corpo é o formulário
    linha sem webhook_token_hash    → "Conectado pela metade", em âmbar
    linha com webhook_token_hash    → conectado

  `last_error` não nulo atravessa os dois últimos: a faixa vermelha aparece
  ANTES dos dados, porque aqui a falha pode ser dinheiro que entrou e não
  apareceu no sistema, e isso se lê primeiro. Quando "pela metade" e "com erro"
  acontecem juntos, as duas faixas aparecem, a vermelha na frente, pelo mesmo
  motivo.

  NÃO EXISTE "RECONECTAR" aqui, diferente do Google Agenda: reconectar é colar
  uma chave nova, ou seja, é o mesmo formulário do estado não conectado. Quem
  quer trocar a chave desconecta e conecta.
*/

/* "03/11/2026 às 10:42", como o protótipo escreve a data em todo o bloco. */
function formatarDataHora(value: string): string {
  const data = new Date(value)
  const dia = data.toLocaleDateString('pt-BR')
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}

export default function AsaasConexaoCard({ canEdit }: { canEdit: boolean }) {
  const connectionQuery = useAsaasConnection()
  const connectMutation = useConnectAsaas()
  const renewMutation = useRenewAsaasWebhook()
  const disconnectMutation = useDisconnectAsaas()

  const [disconnecting, setDisconnecting] = useState(false)

  const connection = connectionQuery.data ?? null

  const handleConnect = (input: { apiKey: string; environment: AsaasEnvironment }) => {
    connectMutation.mutate(input, {
      onSuccess: (result) => {
        toast.success(`Conta Asaas conectada em ${AMBIENTE_LABEL[result.environment]}.`)
      },
      /*
        A mensagem do servidor é mostrada como ela vem. A recusa mais comum é
        `asaas_invalid_api_key`, e o texto dela já manda conferir o ambiente; na
        de `asaas_webhook_failed` a chave FOI guardada, e aí o cartão recarrega
        sozinho e passa a mostrar "Conectado pela metade".
      */
      onError: (error) => toast.error(descreverErroDaConexaoAsaas(error)),
    })
  }

  const handleRenew = () => {
    renewMutation.mutate(undefined, {
      onSuccess: () => toast.success('Aviso de pagamento registrado no Asaas.'),
      onError: (error) => toast.error(descreverErroDaConexaoAsaas(error)),
    })
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: (result) => {
        setDisconnecting(false)
        /*
          `webhookRemoved: false` é a única notícia de que sobrou um webhook na
          conta Asaas: a linha que guardaria o erro acabou de ser apagada, então
          não há `last_error` para ler depois. Mesmo par de frases do
          desconectar do Google Agenda, que também avisa quando o lado de lá não
          pôde ser limpo.
        */
        toast.success(
          result.webhookRemoved
            ? 'Conta Asaas desconectada e aviso de pagamento removido no Asaas.'
            : 'Conta Asaas desconectada. Confira os webhooks na conta Asaas.',
        )
      },
      onError: (error) => toast.error(descreverErroDaConexaoAsaas(error)),
    })
  }

  /*
    NO CARREGAMENTO E NA FALHA DE LEITURA O BADGE NÃO APARECE, porque o estado é
    justamente o que não se sabe ainda.
  */
  const mostrarBadge = !connectionQuery.isLoading && !connectionQuery.isError

  return (
    <section className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Asaas</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Emite a cobrança de uma parcela e baixa o recebível quando o cliente paga.
            </p>
          </div>
        </div>

        {mostrarBadge &&
          (connection === null ? (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              Não conectado
            </Badge>
          ) : connection.webhook_registered ? (
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1"
            >
              <Check className="w-3 h-3" />
              Conectado
            </Badge>
          ) : (
            /*
              O BADGE MUDA DE FAMÍLIA, de esmeralda para âmbar, e troca de
              palavra. Verde aqui seria mentira, e vermelho também, porque
              emitir cobrança continua funcionando. Âmbar é o "espera" que o
              StatusBadge já usa.
            */
            <Badge
              variant="outline"
              className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900 font-medium"
            >
              Conectado pela metade
            </Badge>
          ))}
      </div>

      {connectionQuery.isError ? (
        /* Falha de leitura não pode parecer "não conectado": uma convida a colar
           a chave de novo, a outra pede uma recarga. */
        <div className="mt-4">
          <ErrorState
            title="Não foi possível carregar a integração"
            description="O estado da conexão com o Asaas não pôde ser lido agora."
            error={connectionQuery.error}
            onRetry={() => {
              void connectionQuery.refetch()
            }}
          />
        </div>
      ) : connectionQuery.isLoading ? (
        <div className="mt-4 h-20 bg-muted rounded-lg animate-pulse" />
      ) : connection === null ? (
        <AsaasConectarForm
          canEdit={canEdit}
          onConnect={handleConnect}
          isPending={connectMutation.isPending}
        />
      ) : (
        <div className="mt-4 space-y-4">
          {/*
            A FAIXA SOME SOZINHA: o backend limpa `last_error` na próxima chamada
            bem-sucedida. Não existe botão de dispensar, porque dispensar um
            alerta desses é esconder dinheiro perdido de vista.
          */}
          {connection.last_error && (
            <AsaasFaixa
              tone="error"
              icon={TriangleAlert}
              title={
                /* `asaas_record_result` grava a data junto com o erro, então a
                   data só falta se alguém escrever a coluna por outro caminho.
                   Nesse caso a frase perde o "em", e não ganha um texto falso. */
                connection.last_error_at
                  ? `A última chamada ao Asaas falhou em ${formatarDataHora(connection.last_error_at)}`
                  : 'A última chamada ao Asaas falhou'
              }
              text="Se foi um aviso de pagamento, a parcela dele não baixou. Confira no painel do Asaas quais cobranças foram pagas e compare com os Recebíveis."
              code={connection.last_error}
            />
          )}

          {!connection.webhook_registered && (
            <AsaasFaixa
              tone="warn"
              icon={BellOff}
              title="O aviso de pagamento não está registrado no Asaas"
              text="A cobrança pode ser emitida normalmente, mas nenhuma parcela vai baixar sozinha: quando o cliente pagar, ninguém aqui será avisado. Até isto ser resolvido, a baixa é manual, pelo botão Marcar como Pago de cada parcela."
            />
          )}

          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-faint text-xs uppercase tracking-wider">Ambiente</dt>
              <dd className="text-foreground mt-0.5">
                {AMBIENTE_DESCRICAO[connection.environment]}
              </dd>
            </div>
            <div>
              {/*
                A leitura positiva do mesmo dado que, sem o aviso registrado,
                vira alerta. Fica à vista nos dois casos porque é dele que
                depende a parcela baixar sozinha.
              */}
              <dt className="text-faint text-xs uppercase tracking-wider">Aviso de pagamento</dt>
              {connection.webhook_registered ? (
                <dd className="text-foreground mt-0.5">Registrado no Asaas</dd>
              ) : (
                <dd className="mt-0.5 font-medium text-amber-700 dark:text-amber-400">
                  Não registrado
                </dd>
              )}
            </div>
            <div>
              <dt className="text-faint text-xs uppercase tracking-wider">Conectado por</dt>
              <dd className="text-soft mt-0.5">
                {connection.connected_by_name
                  ? `${connection.connected_by_name}, em ${formatarDataHora(connection.connected_at)}`
                  : formatarDataHora(connection.connected_at)}
              </dd>
            </div>
            <div>
              <dt className="text-faint text-xs uppercase tracking-wider">
                Última chamada bem-sucedida
              </dt>
              <dd className="text-soft mt-0.5 tabular-nums">
                {connection.last_success_at
                  ? formatarDataHora(connection.last_success_at)
                  : 'Nunca'}
              </dd>
            </div>
          </dl>

          {/*
            A CHAVE NÃO APARECE EM LUGAR NENHUM, nem com botão de revelar. É
            diferente da chave de automação, que está mais abaixo nesta mesma
            tela: aquela é nossa e pode ser mostrada de novo; esta dá acesso ao
            caixa do escritório e foi para o cofre sem volta.
          */}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {/* O único botão de ação primária em todo o bloco, e é deliberado:
                  é o estado em que existe algo a consertar. */}
              {!connection.webhook_registered && (
                <Button onClick={handleRenew} disabled={renewMutation.isPending}>
                  <RefreshCw className="w-4 h-4" />
                  Registrar o aviso de novo
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDisconnecting(true)}
              >
                <Link2Off className="w-4 h-4" />
                Desconectar
              </Button>
            </div>
          )}
        </div>
      )}

      {/*
        A CONFIRMAÇÃO EXISTE porque desconectar derruba o registro do aviso no
        Asaas, e cobrança emitida antes continua viva lá. A segunda frase é a que
        importa e não está no diálogo do Google Agenda: cobrança viva sem aviso é
        dinheiro que entra sem ninguém saber.
      */}
      <AlertDialog open={disconnecting} onOpenChange={setDisconnecting}>
        <AlertDialogContent className="sm:max-w-[30rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a conta Asaas?</AlertDialogTitle>
            <AlertDialogDescription>
              O aviso de pagamento é removido no Asaas. As cobranças já emitidas continuam valendo
              lá e o cliente ainda consegue pagar pelo link, mas a parcela não vai mais baixar
              sozinha aqui. Para voltar a cobrar, é preciso colar a chave de API outra vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
