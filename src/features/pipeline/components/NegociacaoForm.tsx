import { useEffect, useRef, useState, type FormEvent } from 'react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
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

  1. AS RECUSAS APARECEM NO CAMPO, não em `alert()` nem em toast. O original
     para a gravação com `alert` do navegador em três pontos (linhas 74, 80, 86).
     A primeira porta trocou `alert` por `toast.error` com o mesmo texto; o
     usuário pediu que a recusa fosse para o formulário, e ela foi: o campo é
     marcado, a frase fica embaixo dele e a tela rola até lá. O texto deixou de
     ser o do original — "⚠️ Defina um responsável..." virou "Escolha um
     responsável pela negociação para continuar", porque ao lado do campo o aviso
     não precisa mais dizer de que campo está falando.

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

/* Só uma recusa existe por vez: a validação para na primeira. */
type InvalidField = 'owner' | 'referrer' | null

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
    /* Vazio, e não os 50 do original: o campo saiu da tela (ver o comentário no
       lugar onde ele ficava), então 50 seria número que ninguém escolheu. */
    close_probability: '',
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

/*
  `commercial_owner_id` e `funnel_entry_date` deixaram de ser NOT NULL na migration
  0064 e chegam nulos em 15 e em 1 negociação do base44, respectivamente. Os dois
  viram campo EM BRANCO aqui — o mesmo que `client_id` já faz — e não um valor de
  enfeite: preencher o responsável com alguém escolhido por nós apontaria o
  vínculo para quem pode não ter tocado a negociação, e preencher a data com hoje
  gravaria "entrou no funil hoje" numa oportunidade de meses atrás, que é
  exatamente o que a data de entrada mede. Quem preenche é a pessoa, se preencher.

  Os dois campos continuam obrigatórios para GRAVAR, como já eram; o aviso abaixo
  de cada um explica por que o campo apareceu vazio numa negociação que já existe.
*/
export function toFormValues(negotiation: NegotiationRow): NegotiationFormValues {
  return {
    name: negotiation.name,
    client_id: negotiation.client_id ?? '',
    commercial_owner_id: negotiation.commercial_owner_id ?? '',
    services: negotiation.services.map((service) => service.service_type),
    estimated_value: negotiation.estimated_value == null ? '' : String(negotiation.estimated_value),
    close_probability:
      negotiation.close_probability == null ? '' : String(negotiation.close_probability),
    status: negotiation.status,
    funnel_stage: negotiation.funnel_stage,
    origin: negotiation.origin ?? '',
    referrer_name: negotiation.referrer_name ?? '',
    funnel_entry_date: negotiation.funnel_entry_date ?? '',
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
    setInvalidField(null)
  }, [initialData, open])

  const isEditing = Boolean(initialData)
  const showLossFields = formData.status === 'lost'

  /*
    A RECUSA APARECE NO CAMPO, e não num toast.

    O original avisa com `alert()` (linhas 80 e 86) e a porta virou `toast.error`.
    Os dois têm o mesmo defeito: a mensagem nasce longe do campo que a causou,
    some sozinha, e o formulário fica rolado em outro ponto — a pessoa lê "defina
    um responsável" sem ver qual campo é. Aqui a recusa marca o campo, escreve a
    frase embaixo dele e rola até ele.

    UM campo por vez, e não um mapa de erros: a validação abaixo para na primeira
    recusa, então guardar mais de um seria guardar estado que não pode existir.
  */
  const [invalidField, setInvalidField] = useState<InvalidField>(null)
  const ownerFieldRef = useRef<HTMLDivElement>(null)
  const referrerFieldRef = useRef<HTMLDivElement>(null)

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

    /* O campo fica no meio de um diálogo rolável: sem o scroll, a marcação
       vermelha acontece fora da área visível e o botão parece não fazer nada. */
    const recusar = (field: InvalidField, ref: React.RefObject<HTMLDivElement | null>) => {
      setInvalidField(field)
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    if (!formData.commercial_owner_id) {
      recusar('owner', ownerFieldRef)
      return
    }

    if (formData.origin === 'referral' && !formData.referrer_name.trim()) {
      recusar('referrer', referrerFieldRef)
      return
    }

    onSubmit(toInput(formData))
  }

  const clientOptions = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((client) => ({ value: client.id, label: client.name }))

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
            <Label htmlFor="negotiation_client">Cliente</Label>
            {/*
              Campo COM BUSCA, e não o Select comum dos outros campos: aqui a
              lista é o escritório inteiro (141 clientes hoje), e achar um deles
              rolando alfabeticamente é o gesto errado. Os selects de status,
              etapa e origem continuam Select — têm punhados de opções fixas.
            */}
            <SearchableSelect
              id="negotiation_client"
              options={clientOptions}
              value={formData.client_id}
              onValueChange={handleClientChange}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente pelo nome..."
              emptyMessage="Nenhum cliente com esse nome."
            />
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

          {/*
            "Probabilidade de Fechamento" saiu da tela por pedido do usuário. O
            CAMPO some; a COLUNA fica, e o valor gravado continua passando por
            `toFormValues` e `toInput` sem ser tocado — 124 negociações reais têm
            probabilidade preenchida e 20 delas com valor escolhido a mão. Zerar
            no salvamento apagaria esse dado na primeira edição de cada uma.

            Negociação nova nasce com a probabilidade NULA, e não com os 50 que o
            original preenchia: 50 era o valor que a pessoa via e podia mudar.
            Sem o campo, gravar 50 seria inventar um número que ninguém escolheu
            e mostrá-lo como "50% prob." no cartão do funil.
          */}
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

              <div className="space-y-2" ref={ownerFieldRef}>
                <Label htmlFor="commercial_owner">Responsável pela Negociação *</Label>
                <Select
                  value={formData.commercial_owner_id}
                  onValueChange={(value) => {
                    setInvalidField(null)
                    setFormData({ ...formData, commercial_owner_id: value })
                  }}
                >
                  <SelectTrigger
                    id="commercial_owner"
                    aria-invalid={invalidField === 'owner'}
                    aria-describedby={invalidField === 'owner' ? 'commercial_owner_error' : undefined}
                    className={
                      invalidField === 'owner' ? 'border-rose-500 focus:ring-rose-500' : undefined
                    }
                  >
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
                {invalidField === 'owner' && (
                  <p
                    id="commercial_owner_error"
                    role="alert"
                    className="text-xs text-rose-600 dark:text-rose-400"
                  >
                    Escolha um responsável pela negociação para continuar.
                  </p>
                )}
                {/* Aviso diferente da recusa: aqui o cadastro perdeu o responsável
                    (colaborador desligado), e a pessoa precisa saber POR QUE o
                    campo está vazio numa negociação que já existia. */}
                {isEditing && !formData.commercial_owner_id && invalidField !== 'owner' && (
                  <p className="text-xs text-muted-foreground">
                    O responsável desta negociação não está mais cadastrado. Escolha um para
                    salvar.
                  </p>
                )}
              </div>
            </div>

            {formData.origin === 'referral' && (
              <div
                ref={referrerFieldRef}
                className="space-y-2 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg"
              >
                <Label htmlFor="referrer_name">Nome do Indicador *</Label>
                {/*
                  `required` sai daqui. Ele fazia o navegador barrar antes da
                  conferência abaixo, com um balão nativo que não segue nem a cor
                  nem a tipografia do resto do formulário — e deixava a validação
                  do código inalcançável, um caminho morto que ninguém percebia.
                  A recusa passa a ser a mesma do campo de responsável.
                */}
                <Input
                  id="referrer_name"
                  value={formData.referrer_name}
                  onChange={(e) => {
                    setInvalidField(null)
                    setFormData({ ...formData, referrer_name: e.target.value })
                  }}
                  placeholder="Digite o nome de quem indicou..."
                  aria-invalid={invalidField === 'referrer'}
                  aria-describedby={invalidField === 'referrer' ? 'referrer_name_error' : undefined}
                  className={`bg-card ${
                    invalidField === 'referrer' ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                />
                {invalidField === 'referrer' ? (
                  <p
                    id="referrer_name_error"
                    role="alert"
                    className="text-xs text-rose-600 dark:text-rose-400"
                  >
                    Informe o nome de quem indicou para continuar.
                  </p>
                ) : (
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Obrigatório quando origem for Indicação
                  </p>
                )}
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
              {isEditing && !formData.funnel_entry_date && (
                <p className="text-xs text-muted-foreground">
                  A data de entrada no funil não foi registrada. Informe uma para salvar.
                </p>
              )}
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
