import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  COLLABORATOR_ROLE,
  FUNNEL_STAGE,
  LEAD_ORIGIN,
  LOSS_REASON,
  NEGOTIATION_STATUS,
  SERVICE_TYPE,
  labelOf,
  optionsOf,
  type FunnelStage,
  type LeadOrigin,
  type LossReason,
  type NegotiationStatus,
  type ServiceType,
} from '@/lib/enums'
import type { Collaborator } from '@/features/team/types'
import type { ClientListRow } from '@/features/crm/types'
import type { NegotiationInput, NegotiationRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/NegociacaoForm.jsx.

  A ordem dos campos, os rótulos com asterisco, os placeholders, a caixa de
  checkboxes de serviço, a caixa azul do indicador, os campos de perda que só
  aparecem com status "Perdida" e o texto dos botões são os do original. O
  `SelectMobile` de lá é re-export do Select padrão (o próprio arquivo diz isso),
  então `@/components/ui/select` é o mesmo componente.

  O QUE MUDA, E POR QUÊ:

  1. `alert()` vira `toast.error()` com o MESMO texto. Três validações do
     original param a gravação com `alert` do navegador (linhas 74, 80, 86);
     `sonner` já é o canal de aviso deste projeto e nenhuma outra tela usa
     `alert`. As frases, inclusive os emojis "⚠️", são as de lá.

  2. `nome_negociacao` DEIXA DE SER DERIVADO DO CLIENTE. No original o nome da
     negociação nunca é digitado: é `formData.cliente_name || 'Negociação sem
     cliente'` (linha 95), então duas oportunidades do mesmo cliente ficam com o
     nome idêntico e o card do funil não as distingue. Aqui há campo "Nome da
     Negociação", com o nome do cliente pré-preenchido ao selecioná-lo — o gesto
     do original continua funcionando sem digitar nada, e quem quiser diferenciar
     consegue. ISTO É DIVERGÊNCIA E PRECISA DE DECISÃO DO USUÁRIO.

  3. `cliente_id` DEIXA DE SER OBRIGATÓRIO. O original bloqueia a gravação sem
     cliente (linha 73) — e ao mesmo tempo tem o texto "Negociação sem cliente"
     preparado para o caso, e a coluna `client_id` nasceu nullable de propósito
     (migration 0022: "a oportunidade nasce antes de o lead virar cadastro no
     CRM"). Quem exige cliente é a transição para "Ganha", e essa continua
     exigindo. TAMBÉM É DIVERGÊNCIA E PRECISA DE DECISÃO.

  4. Os selects de status, etapa, origem e motivo passam a gravar o valor do
     banco e exibir o rótulo de src/lib/enums.ts. Nada muda na tela.

  5. Não há mais campo escondido para `cliente_name`, `cliente_cidade`,
     `cliente_estado` nem `responsavel_comercial_name`: as desnormalizações
     saíram do schema (migration 0022) e viraram join.
*/

export type NegotiationFormValues = {
  name: string
  client_id: string
  commercial_owner_id: string
  services: ServiceType[]
  estimated_value: string
  close_probability: string
  status: NegotiationStatus
  funnel_stage: FunnelStage
  origin: LeadOrigin | ''
  referrer_name: string
  funnel_entry_date: string
  expected_close_date: string
  closed_at: string
  loss_reason: LossReason | ''
  loss_notes: string
  generates_contract: boolean
}

const today = () => new Date().toISOString().split('T')[0]

function emptyValues(): NegotiationFormValues {
  return {
    name: '',
    client_id: '',
    commercial_owner_id: '',
    services: [],
    estimated_value: '',
    /* O formulário do original começa em 50. */
    close_probability: '50',
    status: 'active',
    funnel_stage: 'lead_received',
    origin: '',
    referrer_name: '',
    funnel_entry_date: today(),
    expected_close_date: '',
    closed_at: '',
    loss_reason: '',
    loss_notes: '',
    generates_contract: true,
  }
}

export function toFormValues(negotiation: NegotiationRow): NegotiationFormValues {
  return {
    name: negotiation.name,
    client_id: negotiation.client_id ?? '',
    commercial_owner_id: negotiation.commercial_owner_id,
    services: negotiation.services.map((service) => service.service_type),
    estimated_value: negotiation.estimated_value == null ? '' : String(negotiation.estimated_value),
    close_probability:
      negotiation.close_probability == null ? '' : String(negotiation.close_probability),
    status: negotiation.status,
    funnel_stage: negotiation.funnel_stage,
    origin: negotiation.origin ?? '',
    referrer_name: negotiation.referrer_name ?? '',
    funnel_entry_date: negotiation.funnel_entry_date,
    expected_close_date: negotiation.expected_close_date ?? '',
    closed_at: negotiation.closed_at ?? '',
    loss_reason: negotiation.loss_reason ?? '',
    loss_notes: negotiation.loss_notes ?? '',
    generates_contract: negotiation.generates_contract,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function toInput(values: NegotiationFormValues): NegotiationInput {
  return {
    name: values.name.trim(),
    client_id: orNull(values.client_id),
    commercial_owner_id: values.commercial_owner_id,
    services: values.services,
    estimated_value: toNumberOrNull(values.estimated_value),
    close_probability: toNumberOrNull(values.close_probability),
    status: values.status,
    funnel_stage: values.funnel_stage,
    origin: values.origin === '' ? null : values.origin,
    referrer_name: orNull(values.referrer_name),
    funnel_entry_date: values.funnel_entry_date,
    expected_close_date: orNull(values.expected_close_date),
    closed_at: orNull(values.closed_at),
    loss_reason: values.loss_reason === '' ? null : values.loss_reason,
    loss_notes: orNull(values.loss_notes),
    generates_contract: values.generates_contract,
  }
}

export default function NegociacaoForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  clients,
  collaborators,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: NegotiationInput) => void
  initialData?: NegotiationFormValues | null
  isLoading?: boolean
  clients: ClientListRow[]
  collaborators: Collaborator[]
}) {
  const [formData, setFormData] = useState<NegotiationFormValues>(initialData ?? emptyValues())

  useEffect(() => {
    setFormData(initialData ?? emptyValues())
  }, [initialData, open])

  const isEditing = Boolean(initialData)
  const showLossFields = formData.status === 'lost'

  const handleClientChange = (clientId: string) => {
    const selected = clients.find((client) => client.id === clientId)
    setFormData((previous) => ({
      ...previous,
      client_id: clientId,
      /*
        Pré-preenche o nome com o do cliente — que é o que o original grava
        sozinho em `nome_negociacao`. Só quando o campo ainda está em branco:
        trocar o cliente não apaga um nome que a pessoa digitou.
      */
      name: previous.name.trim() === '' ? (selected?.name ?? '') : previous.name,
    }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!formData.commercial_owner_id) {
      toast.error('⚠️ Defina um responsável pela negociação para continuar.')
      return
    }

    if (formData.origin === 'referral' && !formData.referrer_name.trim()) {
      toast.error('⚠️ Informe o nome do indicador.')
      return
    }

    onSubmit(toInput(formData))
  }

  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))

  /*
    Mesmo recorte do original (linhas 300-303): colaborador ativo que seja da
    área Comercial, ou Diretor, ou Administrativo.
  */
  const eligibleOwners = collaborators
    .filter(
      (collaborator) =>
        collaborator.status === 'active' &&
        (collaborator.area === 'commercial' ||
          collaborator.role === 'director' ||
          collaborator.role === 'admin_staff'),
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Negociação' : 'Nova Negociação'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="negotiation_name">Nome da Negociação *</Label>
            <Input
              id="negotiation_name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Residência Alto de Pinheiros"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={formData.client_id} onValueChange={handleClientChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {sortedClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!formData.client_id && (
              <p className="text-xs text-muted-foreground">
                O cliente pode ser vinculado depois — mas é obrigatório para marcar a negociação
                como Ganha.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipos de Serviço *</Label>
            <div className="space-y-2 p-4 border border-border rounded-lg bg-elevated">
              {optionsOf(SERVICE_TYPE).map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={option.value}
                    checked={formData.services.includes(option.value)}
                    onCheckedChange={(checked) => {
                      setFormData((previous) => ({
                        ...previous,
                        services: checked
                          ? [...previous.services, option.value]
                          : previous.services.filter((service) => service !== option.value),
                      }))
                    }}
                  />
                  <Label htmlFor={option.value} className="cursor-pointer font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimated_value">Valor Estimado (R$)</Label>
              <Input
                id="estimated_value"
                type="number"
                step="0.01"
                min="0"
                value={formData.estimated_value}
                onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="close_probability">Probabilidade de Fechamento (%)</Label>
              <Input
                id="close_probability"
                type="number"
                min="0"
                max="100"
                value={formData.close_probability}
                onChange={(e) => setFormData({ ...formData, close_probability: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status da Negociação</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => {
                  const status = value as NegotiationStatus
                  setFormData((previous) => ({
                    ...previous,
                    status,
                    /* Data de fechamento preenchida sozinha ao encerrar, como no
                       original (linhas 222-225). */
                    closed_at:
                      status !== 'active' && !previous.closed_at ? today() : previous.closed_at,
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(NEGOTIATION_STATUS).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Etapa do Funil</Label>
              <Select
                value={formData.funnel_stage}
                onValueChange={(value) =>
                  setFormData({ ...formData, funnel_stage: value as FunnelStage })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(FUNNEL_STAGE).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origem do Lead</Label>
                <Select
                  value={formData.origin}
                  onValueChange={(value) => {
                    const origin = value as LeadOrigin
                    setFormData((previous) => ({
                      ...previous,
                      origin,
                      /* Limpa o indicador quando a origem deixa de ser Indicação,
                         como no original (linha 271). */
                      referrer_name: origin === 'referral' ? previous.referrer_name : '',
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(LEAD_ORIGIN).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Responsável pela Negociação *</Label>
                <Select
                  value={formData.commercial_owner_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, commercial_owner_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOwners.map((collaborator) => (
                      <SelectItem key={collaborator.id} value={collaborator.id}>
                        {collaborator.name} - {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.origin === 'referral' && (
              <div className="space-y-2 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg">
                <Label htmlFor="referrer_name">Nome do Indicador *</Label>
                <Input
                  id="referrer_name"
                  value={formData.referrer_name}
                  onChange={(e) => setFormData({ ...formData, referrer_name: e.target.value })}
                  placeholder="Digite o nome de quem indicou..."
                  required
                  className="bg-card"
                />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Obrigatório quando origem for Indicação
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="funnel_entry_date">Data Entrada Funil</Label>
              <Input
                id="funnel_entry_date"
                type="date"
                value={formData.funnel_entry_date}
                onChange={(e) => setFormData({ ...formData, funnel_entry_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_close_date">Previsão Fechamento</Label>
              <Input
                id="expected_close_date"
                type="date"
                value={formData.expected_close_date}
                onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
              />
            </div>
          </div>

          {showLossFields && (
            <>
              <div className="space-y-2">
                <Label>Motivo da Perda</Label>
                <Select
                  value={formData.loss_reason}
                  onValueChange={(value) =>
                    setFormData({ ...formData, loss_reason: value as LossReason })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(LOSS_REASON).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loss_notes">Observações da Perda</Label>
                <Textarea
                  id="loss_notes"
                  value={formData.loss_notes}
                  onChange={(e) => setFormData({ ...formData, loss_notes: e.target.value })}
                  rows={3}
                  placeholder="Detalhes sobre a perda..."
                />
              </div>
            </>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="generates_contract"
              checked={formData.generates_contract}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, generates_contract: checked === true })
              }
            />
            <Label htmlFor="generates_contract" className="cursor-pointer">
              Gerar contrato automaticamente ao marcar como Ganha
            </Label>
          </div>
          {/*
            O contrato ainda não é gerado por ninguém: `contracts` entra no
            MÓDULO 4. A preferência já é gravada em `generates_contract`, que é
            o que o original lê no `onSuccess` da mutation para criar o Contract.
          */}
          {formData.generates_contract && (
            <Badge variant="outline" className="bg-elevated text-soft border-border">
              A geração de contrato entra com o módulo de Contratos
            </Badge>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Negociação'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
