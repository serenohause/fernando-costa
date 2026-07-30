import { useEffect, useState } from 'react'
import { ArrowRight, Check, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { useClient } from '@/features/crm/hooks'
import { useMenuPermissions } from '@/features/auth/hooks'
import { formatDateBR } from '@/lib/format'
import { buildBriefingDiff } from '../briefing-diff'
import { describeDatabaseError, useApplyBriefingField } from '../hooks'
import type { ClientIntake } from '../types'

/*
  TELA NOVA — não existe no original.

  Ela ocupa o lugar do `Client.update(intake.cliente_crm_id, updateCRM)` que o
  formulário público executava ao ser enviado (FormularioCliente.jsx:148): lá o
  briefing sobrescrevia o cadastro do CRM sozinho, sem sessão, sem histórico e
  sem autor. Decisão do usuário: o dado continua chegando, a substituição
  automática deixa de existir, e alguém da equipe decide o que aplicar.

  Como não há original para copiar, a linguagem visual é a das telas que existem:
  o Dialog do ClientForm, o EmptyState e o ErrorState compartilhados, e o par
  emerald/rose que o resto do módulo já usa para "aplicado" e "problema".

  AUTORIZAÇÃO — e aqui há uma sutileza que a tela precisa dizer em voz alta: o
  botão "Aplicar" escreve em `clients`, não em `client_intakes`. Quem autoriza é
  `clients_update_crm_editor` (migration 0017), ou seja, `can_edit` no menu
  **crm** — não no `pipeline`, que é a página onde este diálogo mora. Quem edita
  o Pipeline e não edita o CRM consegue LER a conferência e não consegue aplicar,
  e a tela diz isso em vez de deixar o banco recusar em silêncio.
*/
export default function BriefingReview({
  open,
  onClose,
  intakes,
}: {
  open: boolean
  onClose: () => void
  /* Só os briefings já enviados — os outros não têm o que comparar. */
  intakes: ClientIntake[]
}) {
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setSelectedId((previous) =>
      intakes.some((intake) => intake.id === previous) ? previous : (intakes[0]?.id ?? ''),
    )
  }, [open, intakes])

  const selected = intakes.find((intake) => intake.id === selectedId) ?? null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Briefings recebidos</DialogTitle>
          <DialogDescription>
            O cliente preencheu o formulário. Nada foi gravado no cadastro: confira campo a campo e
            aplique o que estiver certo.
          </DialogDescription>
        </DialogHeader>

        {intakes.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nenhum briefing enviado"
            description="Quando um cliente preencher o formulário, ele aparece aqui para conferência."
          />
        ) : (
          <div className="space-y-6 mt-2">
            {intakes.length > 1 && (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o briefing" />
                </SelectTrigger>
                <SelectContent>
                  {intakes.map((intake) => (
                    <SelectItem key={intake.id} value={intake.id}>
                      {intake.full_name ?? 'Sem nome informado'}
                      {intake.submitted_at ? ` — ${formatDateBR(intake.submitted_at.slice(0, 10))}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selected && <BriefingComparison intake={selected} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BriefingComparison({ intake }: { intake: ClientIntake }) {
  const clientQuery = useClient(intake.client_id)
  const applyMutation = useApplyBriefingField()
  const { canEdit: canEditCrm } = useMenuPermissions('crm')

  /* Campos já aplicados nesta sessão do diálogo. A comparação some sozinha
     quando o cadastro é relido, mas o retorno da consulta demora — sem isto a
     linha fica na tela com o botão parecendo não ter feito nada. */
  const [applied, setApplied] = useState<string[]>([])

  if (clientQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (clientQuery.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o cadastro"
        description="Sem o cadastro atual não há com o que comparar o briefing."
        error={clientQuery.error}
        onRetry={() => {
          void clientQuery.refetch()
        }}
      />
    )
  }

  const client = clientQuery.data
  if (!client) {
    return (
      <ErrorState
        title="Cadastro não encontrado"
        description="O cliente deste briefing não está mais visível para o seu acesso."
      />
    )
  }

  const diffs = buildBriefingDiff(intake, client).filter((diff) => !applied.includes(diff.field))

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-elevated p-4">
        <p className="text-xs text-muted-foreground">Cadastro no CRM</p>
        <p className="font-semibold text-foreground">{client.name}</p>
        {intake.submitted_at && (
          <p className="text-xs text-muted-foreground mt-1">
            Briefing enviado em {formatDateBR(intake.submitted_at.slice(0, 10))}
          </p>
        )}
      </div>

      {!canEditCrm && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Você pode conferir o briefing, mas aplicar um campo altera o cadastro do cliente — e isso
          exige permissão de edição no CRM.
        </p>
      )}

      {diffs.length === 0 ? (
        <EmptyState
          icon={Check}
          title="Nada a aplicar"
          description="O que o cliente preencheu já é o que está no cadastro."
        />
      ) : (
        <div className="space-y-2">
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className="rounded-lg border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-soft uppercase tracking-wider mb-1">
                  {diff.label}
                </p>
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-muted-foreground line-clamp-1">{diff.currentText}</span>
                  <ArrowRight className="w-4 h-4 shrink-0 text-faint" />
                  <span className="text-foreground font-medium line-clamp-1">
                    {diff.briefingText}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!canEditCrm || applyMutation.isPending}
                onClick={() => {
                  applyMutation.mutate(
                    { clientId: client.id, column: diff.column, value: diff.value },
                    {
                      onSuccess: () => {
                        setApplied((previous) => [...previous, diff.field])
                        toast.success(`${diff.label} aplicado ao cadastro.`)
                      },
                      onError: (error) => {
                        toast.error('Não foi possível aplicar: ' + describeDatabaseError(error))
                      },
                    },
                  )
                }}
              >
                Aplicar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
