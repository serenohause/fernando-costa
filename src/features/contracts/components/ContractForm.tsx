import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { fetchClient, useLookupZipcode } from '@/features/crm/hooks'
import type { ClientListRow } from '@/features/crm/types'
import {
  BILLING_TYPE,
  CONTRACT_TYPE,
  INSTALLMENT_FREQUENCY,
  optionsOf,
  type BillingType,
  type ContractStatus,
  type ContractType,
  type InstallmentFrequency,
} from '@/lib/enums'
import { snapshotOfClient } from '../snapshot'
import type { ContractInput, ContractRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/ContractForm.jsx.

  As três seções numeradas (cinza, azul, esmeralda), a caixa de observações, a
  ordem dos campos, os rótulos com asterisco, os placeholders, as grades de 2, 3
  e 5 colunas e o texto dos botões são os do original. O `SelectMobile` de lá é
  re-export do Select padrão (o próprio arquivo diz isso), então
  `@/components/ui/select` é o mesmo componente.

  O QUE MUDA, E POR QUÊ:

  1. Escolher o cliente num contrato NOVO copia o cadastro atual para os campos
     das seções 2 e 3. É a cópia congelada do módulo (ver snapshot.ts). Ao EDITAR
     um contrato, nada é copiado: o que está gravado é o que constou do contrato.

  2. `client_name` e `project_id` saíram do estado do formulário. As duas eram
     desnormalização gravada na linha; a primeira virou join, a segunda inverteu
     de lado (`projects` é que aponta para o contrato, MÓDULO 5). `project_name`
     FICA e continua sendo texto digitado, como no original.

  3. Os selects passam a gravar o valor do banco e exibir o rótulo de
     src/lib/enums.ts. O rótulo do TIPO de contrato é o de docs/ENUM-MAP.md
     ("Arquitetura"), e não o do select do original ("Projeto de Arquitetura") —
     o enum é compartilhado com `projects.project_type`, onde o mesmo valor
     aparecia com o rótulo curto.

  4. `signature_date`, `start_date`, `status` e `negotiation_id` continuam no
     estado e continuam SEM campo na tela, exatamente como no original (elas
     estão no `useState` dele e nenhuma delas é renderizada). Ficam aqui para
     que salvar um contrato não apague o que já estava gravado.
*/

export type ContractFormValues = {
  contract_number: string
  contract_type: ContractType | ''
  project_name: string
  client_id: string
  total_value: string
  billing_type: BillingType | ''

  installment_count: string
  first_due_date: string
  installment_frequency: InstallmentFrequency | ''

  layout_study_days: string
  renderings_days: string
  legal_permit_days: string
  construction_docs_days: string
  engineering_docs_days: string

  client_legal_name: string
  client_tax_id: string
  client_birth_date: string
  client_email: string
  client_address_zipcode: string
  client_address_city: string
  client_address_state: string
  client_address_street: string
  client_address_number: string
  client_address_complement: string

  site_zipcode: string
  site_city: string
  site_state: string
  site_street: string
  site_number: string
  site_complement: string

  notes: string

  /* Sem campo na tela, como no original — ver o item 4 do comentário acima. */
  status: ContractStatus
  signature_date: string
  start_date: string
  negotiation_id: string
}

function emptyValues(): ContractFormValues {
  return {
    contract_number: '',
    contract_type: '',
    project_name: '',
    client_id: '',
    total_value: '',
    billing_type: '',

    installment_count: '',
    first_due_date: '',
    /* "Mensal" pré-selecionado é o do original (linha 36). Sem quantidade nem
       data de vencimento ele é limpo na gravação — o banco exige os três campos
       ou nenhum (migration 0029). */
    installment_frequency: 'monthly',

    layout_study_days: '',
    renderings_days: '',
    legal_permit_days: '',
    construction_docs_days: '',
    engineering_docs_days: '',

    client_legal_name: '',
    client_tax_id: '',
    client_birth_date: '',
    client_email: '',
    client_address_zipcode: '',
    client_address_city: '',
    client_address_state: '',
    client_address_street: '',
    client_address_number: '',
    client_address_complement: '',

    site_zipcode: '',
    site_city: '',
    site_state: '',
    site_street: '',
    site_number: '',
    site_complement: '',

    notes: '',

    status: 'negotiating',
    signature_date: '',
    start_date: '',
    negotiation_id: '',
  }
}

const text = (value: string | null): string => value ?? ''
const numberText = (value: number | null): string => (value == null ? '' : String(value))

export function toFormValues(contract: ContractRow): ContractFormValues {
  return {
    contract_number: contract.contract_number,
    contract_type: contract.contract_type,
    project_name: text(contract.project_name),
    client_id: text(contract.client_id),
    total_value: String(contract.total_value),
    billing_type: contract.billing_type ?? '',

    installment_count: numberText(contract.installment_count),
    first_due_date: text(contract.first_due_date),
    installment_frequency: contract.installment_frequency ?? '',

    layout_study_days: numberText(contract.layout_study_days),
    renderings_days: numberText(contract.renderings_days),
    legal_permit_days: numberText(contract.legal_permit_days),
    construction_docs_days: numberText(contract.construction_docs_days),
    engineering_docs_days: numberText(contract.engineering_docs_days),

    client_legal_name: text(contract.client_legal_name),
    client_tax_id: text(contract.client_tax_id),
    client_birth_date: text(contract.client_birth_date),
    client_email: text(contract.client_email),
    client_address_zipcode: text(contract.client_address_zipcode),
    client_address_city: text(contract.client_address_city),
    client_address_state: text(contract.client_address_state),
    client_address_street: text(contract.client_address_street),
    client_address_number: text(contract.client_address_number),
    client_address_complement: text(contract.client_address_complement),

    site_zipcode: text(contract.site_zipcode),
    site_city: text(contract.site_city),
    site_state: text(contract.site_state),
    site_street: text(contract.site_street),
    site_number: text(contract.site_number),
    site_complement: text(contract.site_complement),

    notes: text(contract.notes),

    status: contract.status,
    signature_date: text(contract.signature_date),
    start_date: text(contract.start_date),
    negotiation_id: text(contract.negotiation_id),
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

function toInput(values: ContractFormValues): ContractInput {
  return {
    contract_number: values.contract_number.trim(),
    /* O `required` da marcação já barra o vazio; o schema recusa de novo. */
    contract_type: values.contract_type as ContractType,
    total_value: toNumberOrNull(values.total_value) ?? 0,
    client_id: orNull(values.client_id),
    negotiation_id: orNull(values.negotiation_id),
    project_name: orNull(values.project_name),
    billing_type: values.billing_type === '' ? null : values.billing_type,
    status: values.status,
    signature_date: orNull(values.signature_date),
    start_date: orNull(values.start_date),
    notes: orNull(values.notes),

    installment_count: toNumberOrNull(values.installment_count),
    first_due_date: orNull(values.first_due_date),
    installment_frequency: values.installment_frequency === '' ? null : values.installment_frequency,

    layout_study_days: toNumberOrNull(values.layout_study_days),
    renderings_days: toNumberOrNull(values.renderings_days),
    legal_permit_days: toNumberOrNull(values.legal_permit_days),
    construction_docs_days: toNumberOrNull(values.construction_docs_days),
    engineering_docs_days: toNumberOrNull(values.engineering_docs_days),

    client_legal_name: orNull(values.client_legal_name),
    client_tax_id: orNull(values.client_tax_id),
    client_birth_date: orNull(values.client_birth_date),
    client_email: orNull(values.client_email),
    client_address_zipcode: orNull(values.client_address_zipcode),
    client_address_street: orNull(values.client_address_street),
    client_address_number: orNull(values.client_address_number),
    client_address_complement: orNull(values.client_address_complement),
    client_address_city: orNull(values.client_address_city),
    client_address_state: orNull(values.client_address_state),

    site_zipcode: orNull(values.site_zipcode),
    site_street: orNull(values.site_street),
    site_number: orNull(values.site_number),
    site_complement: orNull(values.site_complement),
    site_city: orNull(values.site_city),
    site_state: orNull(values.site_state),
  }
}

/* Os três blocos coloridos do original, com o degrau escuro acrescentado: um
   fundo 50 no tema escuro vira faixa quase branca sob texto claro. */
const SECTION_STYLES = {
  neutral: 'bg-elevated rounded-xl p-5 border border-border',
  blue: 'bg-blue-50 dark:bg-blue-950/40 rounded-xl p-5 border border-blue-200 dark:border-blue-900',
  emerald:
    'bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-5 border border-emerald-200 dark:border-emerald-900',
}

const STEP_STYLES = {
  neutral: 'bg-primary text-primary-foreground',
  blue: 'bg-blue-600 text-white',
  emerald: 'bg-emerald-600 text-white',
}

function SectionTitle({
  step,
  tone,
  children,
}: {
  step: string
  tone: keyof typeof STEP_STYLES
  children: string
}) {
  return (
    <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
      <span
        className={`w-6 h-6 rounded-full ${STEP_STYLES[tone]} text-xs flex items-center justify-center`}
      >
        {step}
      </span>
      {children}
    </h3>
  )
}

export default function ContractForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  clients,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: ContractInput) => void
  initialData?: ContractFormValues | null
  isLoading?: boolean
  clients: ClientListRow[]
}) {
  const [formData, setFormData] = useState<ContractFormValues>(initialData ?? emptyValues())

  useEffect(() => {
    setFormData(initialData ?? emptyValues())
  }, [initialData, open])

  const isEditing = Boolean(initialData)
  const lookupZipcode = useLookupZipcode()

  /*
    A cópia congelada, e a razão de ela acontecer SÓ na criação está em
    snapshot.ts. A listagem do CRM lê apenas as colunas que exibe, então o
    cadastro completo é buscado no clique — mesma coisa que a tela de CRM faz
    para abrir o formulário de edição.
  */
  const handleClientChange = async (clientId: string) => {
    setFormData((previous) => ({ ...previous, client_id: clientId }))
    if (isEditing || !clientId) return

    try {
      const client = await fetchClient(clientId)
      setFormData((previous) => ({ ...previous, ...toSnapshotValues(client) }))
    } catch {
      toast.error('Não foi possível copiar os dados do cliente. Preencha os campos à mão.')
    }
  }

  const handleZipcodeChange = async (
    zipcode: string,
    scope: 'client_address' | 'site',
  ): Promise<void> => {
    setFormData((previous) => ({
      ...previous,
      [scope === 'site' ? 'site_zipcode' : 'client_address_zipcode']: zipcode,
    }))

    if (zipcode.replace(/\D/g, '').length !== 8) return

    const address = await lookupZipcode.mutateAsync(zipcode)
    if (!address) return

    setFormData((previous) =>
      scope === 'site'
        ? {
            ...previous,
            site_city: address.city,
            site_state: address.state,
            site_street: address.street,
          }
        : {
            ...previous,
            client_address_city: address.city,
            client_address_state: address.state,
            client_address_street: address.street,
          },
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(toInput(formData))
  }

  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Contrato' : 'Novo Contrato'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* SEÇÃO 1: DADOS DO CONTRATO */}
          <div className={SECTION_STYLES.neutral}>
            <SectionTitle step="1" tone="neutral">
              Dados do Contrato
            </SectionTitle>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contract_number">Número do Contrato *</Label>
                <Input
                  id="contract_number"
                  value={formData.contract_number}
                  onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                  placeholder="Ex: 2024-001"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Contrato *</Label>
                <Select
                  value={formData.contract_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, contract_type: value as ContractType })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(CONTRACT_TYPE).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="project_name">Projeto</Label>
                <Input
                  id="project_name"
                  value={formData.project_name}
                  onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                  placeholder="Nome do projeto"
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="total_value">Valor Total (R$) *</Label>
                <Input
                  id="total_value"
                  type="number"
                  step="0.01"
                  value={formData.total_value}
                  onChange={(e) => setFormData({ ...formData, total_value: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Forma de Cobrança</Label>
                <Select
                  value={formData.billing_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, billing_type: value as BillingType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(BILLING_TYPE).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-4 mt-4">
              <h4 className="text-sm font-semibold text-soft mb-3">Configuração de Parcelamento</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="installment_count">Número de Parcelas</Label>
                  <Input
                    id="installment_count"
                    type="number"
                    min="1"
                    max="24"
                    value={formData.installment_count}
                    onChange={(e) =>
                      setFormData({ ...formData, installment_count: e.target.value })
                    }
                    placeholder="Ex: 4"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="first_due_date">Data 1º Vencimento</Label>
                  <Input
                    id="first_due_date"
                    type="date"
                    value={formData.first_due_date}
                    onChange={(e) => setFormData({ ...formData, first_due_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Periodicidade</Label>
                  <Select
                    value={formData.installment_frequency}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        installment_frequency: value as InstallmentFrequency,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsOf(INSTALLMENT_FREQUENCY).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Estes campos são necessários para gerar as parcelas automaticamente
              </p>
            </div>

            <div className="pt-4 mt-4">
              <h4 className="text-sm font-semibold text-soft mb-3">Prazos de Projeto</h4>
              <div className="grid grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="layout_study_days" className="text-xs">
                    Estudo de Layout
                  </Label>
                  <Input
                    id="layout_study_days"
                    type="number"
                    min="0"
                    value={formData.layout_study_days}
                    onChange={(e) =>
                      setFormData({ ...formData, layout_study_days: e.target.value })
                    }
                    placeholder="Dias úteis"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="renderings_days" className="text-xs">
                    Perspectivas
                  </Label>
                  <Input
                    id="renderings_days"
                    type="number"
                    min="0"
                    value={formData.renderings_days}
                    onChange={(e) => setFormData({ ...formData, renderings_days: e.target.value })}
                    placeholder="Dias úteis"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="legal_permit_days" className="text-xs">
                    Projeto Legal
                  </Label>
                  <Input
                    id="legal_permit_days"
                    type="number"
                    min="0"
                    value={formData.legal_permit_days}
                    onChange={(e) =>
                      setFormData({ ...formData, legal_permit_days: e.target.value })
                    }
                    placeholder="Dias úteis"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="construction_docs_days" className="text-xs">
                    Projeto Executivo
                  </Label>
                  <Input
                    id="construction_docs_days"
                    type="number"
                    min="0"
                    value={formData.construction_docs_days}
                    onChange={(e) =>
                      setFormData({ ...formData, construction_docs_days: e.target.value })
                    }
                    placeholder="Dias úteis"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="engineering_docs_days" className="text-xs">
                    Complementares
                  </Label>
                  <Input
                    id="engineering_docs_days"
                    type="number"
                    min="0"
                    value={formData.engineering_docs_days}
                    onChange={(e) =>
                      setFormData({ ...formData, engineering_docs_days: e.target.value })
                    }
                    placeholder="Dias úteis"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: DADOS DO CLIENTE */}
          <div className={SECTION_STYLES.blue}>
            <SectionTitle step="2" tone="blue">
              Dados do Cliente
            </SectionTitle>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="client_legal_name">Nome Completo / Razão Social</Label>
                <Input
                  id="client_legal_name"
                  value={formData.client_legal_name}
                  onChange={(e) => setFormData({ ...formData, client_legal_name: e.target.value })}
                  placeholder="Nome completo ou razão social"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_tax_id">CPF / CNPJ</Label>
                <Input
                  id="client_tax_id"
                  value={formData.client_tax_id}
                  onChange={(e) => setFormData({ ...formData, client_tax_id: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="client_birth_date">Data de Nascimento</Label>
                <Input
                  id="client_birth_date"
                  type="date"
                  value={formData.client_birth_date}
                  onChange={(e) => setFormData({ ...formData, client_birth_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_email">E-mail</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="client_address_zipcode">CEP</Label>
                <Input
                  id="client_address_zipcode"
                  value={formData.client_address_zipcode}
                  onChange={(e) => void handleZipcodeChange(e.target.value, 'client_address')}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_address_city">Cidade</Label>
                <Input
                  id="client_address_city"
                  value={formData.client_address_city}
                  onChange={(e) =>
                    setFormData({ ...formData, client_address_city: e.target.value })
                  }
                  placeholder="Cidade"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_address_state">Estado</Label>
                <Input
                  id="client_address_state"
                  value={formData.client_address_state}
                  onChange={(e) =>
                    setFormData({ ...formData, client_address_state: e.target.value })
                  }
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="client_address_street">Endereço</Label>
                <Input
                  id="client_address_street"
                  value={formData.client_address_street}
                  onChange={(e) =>
                    setFormData({ ...formData, client_address_street: e.target.value })
                  }
                  placeholder="Rua, Avenida, etc."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_address_number">Número</Label>
                <Input
                  id="client_address_number"
                  value={formData.client_address_number}
                  onChange={(e) =>
                    setFormData({ ...formData, client_address_number: e.target.value })
                  }
                  placeholder="Nº"
                />
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <Label htmlFor="client_address_complement">Complemento</Label>
              <Input
                id="client_address_complement"
                value={formData.client_address_complement}
                onChange={(e) =>
                  setFormData({ ...formData, client_address_complement: e.target.value })
                }
                placeholder="Apartamento, Bloco, etc."
              />
            </div>
          </div>

          {/* SEÇÃO 3: ENDEREÇO DA OBRA */}
          <div className={SECTION_STYLES.emerald}>
            <SectionTitle step="3" tone="emerald">
              Endereço da Obra
            </SectionTitle>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="site_zipcode">CEP</Label>
                <Input
                  id="site_zipcode"
                  value={formData.site_zipcode}
                  onChange={(e) => void handleZipcodeChange(e.target.value, 'site')}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="site_city">Cidade</Label>
                <Input
                  id="site_city"
                  value={formData.site_city}
                  onChange={(e) => setFormData({ ...formData, site_city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="site_state">Estado</Label>
                <Input
                  id="site_state"
                  value={formData.site_state}
                  onChange={(e) => setFormData({ ...formData, site_state: e.target.value })}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="site_street">Endereço</Label>
                <Input
                  id="site_street"
                  value={formData.site_street}
                  onChange={(e) => setFormData({ ...formData, site_street: e.target.value })}
                  placeholder="Rua, Avenida, etc."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="site_number">Número</Label>
                <Input
                  id="site_number"
                  value={formData.site_number}
                  onChange={(e) => setFormData({ ...formData, site_number: e.target.value })}
                  placeholder="Nº"
                />
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <Label htmlFor="site_complement">Complemento</Label>
              <Input
                id="site_complement"
                value={formData.site_complement}
                onChange={(e) => setFormData({ ...formData, site_complement: e.target.value })}
                placeholder="Apartamento, Bloco, etc."
              />
            </div>
          </div>

          {/* OBSERVAÇÕES */}
          <div className={SECTION_STYLES.neutral}>
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-semibold text-foreground">
                Observações
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observações sobre o contrato"
                rows={4}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Contrato'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* O snapshot vem como colunas do banco (nulável); o formulário guarda texto. */
function toSnapshotValues(
  client: Parameters<typeof snapshotOfClient>[0],
): Partial<ContractFormValues> {
  const snapshot = snapshotOfClient(client)
  return {
    client_legal_name: text(snapshot.client_legal_name),
    client_tax_id: text(snapshot.client_tax_id),
    client_birth_date: text(snapshot.client_birth_date),
    client_email: text(snapshot.client_email),
    client_address_zipcode: text(snapshot.client_address_zipcode),
    client_address_city: text(snapshot.client_address_city),
    client_address_state: text(snapshot.client_address_state),
    client_address_street: text(snapshot.client_address_street),
    client_address_number: text(snapshot.client_address_number),
    client_address_complement: text(snapshot.client_address_complement),
    site_zipcode: text(snapshot.site_zipcode),
    site_city: text(snapshot.site_city),
    site_state: text(snapshot.site_state),
    site_street: text(snapshot.site_street),
    site_number: text(snapshot.site_number),
    site_complement: text(snapshot.site_complement),
  }
}
