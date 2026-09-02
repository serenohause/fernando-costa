import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  KeyRound,
  Link2,
  Link2Off,
  Eye,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeDatabaseError } from '../hooks'
import {
  agendaEndpointUrl,
  useCreateIntegrationApiKey,
  useDisconnectGoogleCalendar,
  useGoogleCalendarConnection,
  useGoogleCalendarOptions,
  useIntegrationApiKeys,
  useRevealIntegrationApiKey,
  useRevokeIntegrationApiKey,
  useSelectGoogleCalendar,
  useStartGoogleConnection,
} from '../integrations'
import type { IntegrationApiKeyRow } from '../types'

/*
  O DESFECHO DO CONSENTIMENTO VOLTA PELA URL, porque quem volta do Google é uma
  aba de navegador e não uma chamada de API. A Edge Function de callback
  redireciona para /Settings?integration=google_calendar&outcome=<código>, e
  aqui o código vira frase. Os códigos são os da função — mudar um lado sem o
  outro deixa o diretor sem explicação depois de autorizar.
*/
const OUTCOME_MESSAGE: Record<string, { kind: 'success' | 'error'; text: string }> = {
  connected: { kind: 'success', text: 'Google Agenda conectado.' },
  cancelled: { kind: 'error', text: 'Conexão cancelada na tela do Google.' },
  expired_state: {
    kind: 'error',
    text: 'A autorização demorou demais ou já foi usada. Clique em Conectar de novo.',
  },
  no_refresh_token: {
    kind: 'error',
    text: 'O Google não devolveu a permissão de acesso contínuo. Tente conectar novamente.',
  },
  invalid_response: { kind: 'error', text: 'Resposta inesperada do Google.' },
  failed: { kind: 'error', text: 'Não foi possível concluir a conexão com o Google.' },
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function IntegrationsSection({ canEdit }: { canEdit: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()

  const connectionQuery = useGoogleCalendarConnection()
  const keysQuery = useIntegrationApiKeys()
  const startMutation = useStartGoogleConnection()
  const disconnectMutation = useDisconnectGoogleCalendar()
  const selectCalendarMutation = useSelectGoogleCalendar()
  const createKeyMutation = useCreateIntegrationApiKey()
  const revokeKeyMutation = useRevokeIntegrationApiKey()
  const revealKeyMutation = useRevealIntegrationApiKey()

  const connection = connectionQuery.data ?? null
  const [pickerOpen, setPickerOpen] = useState(false)
  const calendarsQuery = useGoogleCalendarOptions(pickerOpen && connection !== null)

  const [disconnecting, setDisconnecting] = useState(false)
  const [revoking, setRevoking] = useState<IntegrationApiKeyRow | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyName, setKeyName] = useState('n8n — agenda diária')
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /* A mensagem é consumida uma vez e o parâmetro sai da URL: sem isso, um F5
     repetiria "Google Agenda conectado" para sempre. */
  useEffect(() => {
    if (searchParams.get('integration') !== 'google_calendar') return

    const outcome = searchParams.get('outcome') ?? 'failed'
    const message = OUTCOME_MESSAGE[outcome] ?? OUTCOME_MESSAGE.failed
    if (message.kind === 'success') toast.success(message.text)
    else toast.error(message.text)

    const next = new URLSearchParams(searchParams)
    next.delete('integration')
    next.delete('outcome')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleConnect = () => {
    startMutation.mutate(undefined, {
      /* Navegação de página inteira, e não uma aba nova: o Google recusa o
         consentimento dentro de iframe, e uma aba nova esbarra no bloqueio de
         pop-up de alguns navegadores. */
      onSuccess: (authUrl) => {
        window.location.assign(authUrl)
      },
      onError: (error) => toast.error('Erro ao conectar: ' + describeDatabaseError(error)),
    })
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: (result) => {
        setDisconnecting(false)
        toast.success(
          result.revokedAtGoogle
            ? 'Google Agenda desconectado e acesso revogado no Google.'
            : 'Google Agenda desconectado. Confira as permissões na conta Google.',
        )
      },
      onError: (error) => toast.error('Erro ao desconectar: ' + describeDatabaseError(error)),
    })
  }

  const handleCreateKey = () => {
    createKeyMutation.mutate(keyName.trim(), {
      onSuccess: (result) => {
        setKeyDialogOpen(false)
        setFreshKey(result.apiKey)
        setCopied(false)
      },
      onError: (error) => toast.error('Erro ao gerar chave: ' + describeDatabaseError(error)),
    })
  }

  const copyFreshKey = async () => {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(freshKey)
      setCopied(true)
    } catch {
      /* Navegador sem permissão de área de transferência: o valor está na tela
         e continua selecionável à mão. */
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  const handleReveal = (key: IntegrationApiKeyRow) => {
    revealKeyMutation.mutate(key.id, {
      onSuccess: (value) => {
        if (value === null) {
          /* Chave anterior à 0086: só o hash foi guardado, e não há valor para
             mostrar. Dizer isso é melhor do que abrir um diálogo vazio. */
          toast.error('Esta chave é antiga e o valor dela não foi guardado. Gere uma nova.')
          return
        }
        setFreshKey(value)
        setCopied(false)
      },
      onError: (error) => toast.error('Erro ao revelar: ' + describeDatabaseError(error)),
    })
  }

  const activeKeys = (keysQuery.data ?? []).filter((key) => key.revoked_at === null)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Conexões com serviços externos e as chaves que as automações usam.
        </p>
      </div>

      {/* ── Google Agenda ───────────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-elevated flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Google Agenda</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Permite que a automação leia os compromissos do dia.
              </p>
            </div>
          </div>

          {connection ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              Conectado
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              Não conectado
            </Badge>
          )}
        </div>

        {connectionQuery.isError ? (
          <div className="mt-4">
            <ErrorState
              title="Não foi possível carregar a integração"
              description="O estado da conexão com o Google não pôde ser lido agora."
              error={connectionQuery.error}
              onRetry={() => {
                void connectionQuery.refetch()
              }}
            />
          </div>
        ) : connectionQuery.isLoading ? (
          <div className="mt-4 h-20 bg-muted rounded-lg animate-pulse" />
        ) : connection ? (
          <div className="mt-4 space-y-4">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-faint text-xs uppercase tracking-wider">Conta</dt>
                <dd className="text-foreground mt-0.5">{connection.google_account_email}</dd>
              </div>
              <div>
                <dt className="text-faint text-xs uppercase tracking-wider">Agenda lida</dt>
                <dd className="text-foreground mt-0.5">
                  {connection.calendar_label ?? connection.calendar_id}
                  {connection.calendar_id === 'primary' && (
                    <span className="block text-xs text-amber-600 mt-1">
                      É a agenda pessoal da conta. Escolha a agenda do escritório para compromisso
                      particular não ir para o WhatsApp.
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-faint text-xs uppercase tracking-wider">Conectado em</dt>
                <dd className="text-soft mt-0.5">{formatDateTime(connection.connected_at)}</dd>
              </div>
              <div>
                <dt className="text-faint text-xs uppercase tracking-wider">Última leitura</dt>
                <dd className="text-soft mt-0.5">{formatDateTime(connection.last_success_at)}</dd>
              </div>
            </dl>

            {/*
              O ÚLTIMO ERRO FICA À VISTA. É o que transforma "o WhatsApp parou de
              chegar" em algo diagnosticável — a causa mais comum é o acesso ter
              sido revogado na conta Google, e sem isto ninguém descobriria.
            */}
            {connection.last_error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="text-destructive font-medium">
                    Última leitura falhou em {formatDateTime(connection.last_error_at)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                    {connection.last_error}
                  </p>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setPickerOpen(true)}>
                  <Calendar className="w-4 h-4 mr-2" />
                  Escolher agenda
                </Button>
                <Button variant="outline" onClick={handleConnect} disabled={startMutation.isPending}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reconectar
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDisconnecting(true)}
                >
                  <Link2Off className="w-4 h-4 mr-2" />
                  Desconectar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              A conexão é feita uma vez, pela conta Google do escritório. Depois disso a automação
              lê a agenda sem precisar de senha.
            </p>
            {canEdit ? (
              <Button className="mt-3" onClick={handleConnect} disabled={startMutation.isPending}>
                <Link2 className="w-4 h-4 mr-2" />
                {startMutation.isPending ? 'Abrindo o Google...' : 'Conectar Google Agenda'}
              </Button>
            ) : (
              <p className="text-sm text-faint mt-3">
                Peça a um Diretor para conectar a conta do escritório.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Chaves de automação ─────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-elevated flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Chaves de automação</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                O que a automação apresenta para ler a agenda. Não é a senha do Google.
              </p>
            </div>
          </div>

          {/*
            O BOTÃO SÓ APARECE QUANDO NÃO HÁ CHAVE ATIVA.

            No caminho normal a chave nasce junto com a conexão do Google
            (migration 0086) e oferecer "gerar" ao lado dela convida a criar uma
            segunda que ninguém pediu — e chave viva a mais é superfície a mais.

            Ele não sumiu de vez porque isso abriria um buraco: quem revogasse
            ficaria sem chave E sem como criar outra, já que a emissão
            automática só acontece ao conectar, e a conexão já existe.
          */}
          {canEdit && activeKeys.length === 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setKeyName('Automação — agenda do dia')
                setKeyDialogOpen(true)
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Gerar chave
            </Button>
          )}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs text-faint uppercase tracking-wider">Endereço que a automação chama</p>
          <code className="block text-xs font-mono text-soft mt-1 break-all">
            GET {agendaEndpointUrl()}
          </code>
          <p className="text-xs text-faint mt-2">
            Cabeçalho <code className="font-mono">X-Integration-Key</code> com a chave gerada aqui.
          </p>
        </div>

        {keysQuery.isError ? (
          <div className="mt-4">
            <ErrorState
              title="Não foi possível carregar as chaves"
              description="A lista de chaves de automação não pôde ser lida agora."
              error={keysQuery.error}
              onRetry={() => {
                void keysQuery.refetch()
              }}
            />
          </div>
        ) : keysQuery.isLoading ? (
          <div className="mt-4 h-14 bg-muted rounded-lg animate-pulse" />
        ) : activeKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-4">
            Nenhuma chave ativa. Ela nasce junto com a conexão do Google
            {canEdit ? ' — ou gere uma agora.' : '.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border border border-border rounded-lg">
            {activeKeys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm">{key.name}</p>
                  <p className="text-xs text-faint mt-0.5 font-mono">
                    {key.key_prefix}… · criada em {formatDateTime(key.created_at)} · último uso:{' '}
                    {formatDateTime(key.last_used_at)}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReveal(key)}
                      disabled={revealKeyMutation.isPending}
                    >
                      <Eye className="w-4 h-4 mr-1.5" />
                      Ver chave
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRevoking(key)}
                    >
                      Revogar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Escolha da agenda */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Qual agenda a automação lê?</DialogTitle>
            <DialogDescription>
              A lista vem da conta conectada. Prefira uma agenda do escritório — a principal é a
              agenda pessoal da conta.
            </DialogDescription>
          </DialogHeader>

          {calendarsQuery.isError ? (
            <p className="text-sm text-destructive">
              Não foi possível consultar as agendas no Google agora.
            </p>
          ) : calendarsQuery.isLoading ? (
            <div className="h-10 bg-muted rounded-lg animate-pulse" />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="calendar-choice">Agenda</Label>
              <Select
                value={connection?.calendar_id ?? undefined}
                onValueChange={(value) => {
                  const chosen = (calendarsQuery.data ?? []).find((item) => item.id === value)
                  if (!chosen) return
                  selectCalendarMutation.mutate(
                    { id: chosen.id, label: chosen.summary },
                    {
                      onSuccess: () => {
                        setPickerOpen(false)
                        toast.success('Agenda atualizada')
                      },
                      onError: (error) =>
                        toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
                    },
                  )
                }}
              >
                <SelectTrigger id="calendar-choice">
                  <SelectValue placeholder="Escolha uma agenda" />
                </SelectTrigger>
                <SelectContent>
                  {(calendarsQuery.data ?? []).map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {calendar.summary}
                      {calendar.primary ? ' (principal / pessoal)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Gerar chave */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Gerar chave de automação</DialogTitle>
            <DialogDescription>
              Dê um nome que diga o que ela alimenta. A chave aparece uma única vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="key-name">Nome</Label>
            <Input
              id="key-name"
              value={keyName}
              maxLength={80}
              onChange={(event) => setKeyName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={createKeyMutation.isPending || keyName.trim() === ''}
            >
              {createKeyMutation.isPending ? 'Gerando...' : 'Gerar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        A CHAVE, À VISTA. Desde a 0086 ela fica guardada cifrada e pode ser
        revelada de novo por quem edita Configurações — o mesmo diálogo serve
        para a chave recém-criada e para o "Ver chave".
      */}
      <Dialog
        open={freshKey !== null}
        onOpenChange={(open) => {
          if (!open) setFreshKey(null)
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Chave de automação</DialogTitle>
            <DialogDescription>
              É o valor que vai no cabeçalho <code className="font-mono">X-Integration-Key</code>.
              Quem edita Configurações pode ver de novo aqui quando precisar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-elevated border border-border rounded-lg p-3 break-all">
              {freshKey}
            </code>
            <Button variant="outline" size="icon" onClick={copyFreshKey} aria-label="Copiar chave">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setFreshKey(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disconnecting} onOpenChange={setDisconnecting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Google Agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              A automação para de receber a agenda até alguém conectar de novo. O acesso também é
              revogado na conta Google.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Toda automação que usa esta chave para de funcionar na hora, e o valor dela é
              apagado. Não dá para desfazer: depois disso é preciso gerar uma chave nova e
              configurá-la na automação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!revoking) return
                revokeKeyMutation.mutate(revoking.id, {
                  onSuccess: () => {
                    setRevoking(null)
                    toast.success('Chave revogada')
                  },
                  onError: (error) =>
                    toast.error('Erro ao revogar: ' + describeDatabaseError(error)),
                })
              }}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
