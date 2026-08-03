import { useEffect, useState, type FormEvent } from 'react'
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
import type { ClientListRow } from '@/features/crm/types'
import type { ContractRow } from '@/features/contracts/types'
import type { ProjectRow } from '@/features/projects/types'
import { formatCurrencyBRL } from '@/lib/format'
import {
  FINANCIAL_STATUS,
  RECEIVABLE_PAYMENT_METHOD,
  optionsOf,
  type FinancialStatus,
  type ReceivablePaymentMethod,
} from '@/lib/enums'
import type { ReceivableInput, ReceivableRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/AccountReceivableForm.jsx.

  A ordem dos campos, a grade (2 colunas para Cliente/Contrato, 3 para
  Descrição+Parcela, 3 para Valor/Vencimento/Emissão, 3 para Status/Data
  Pagamento/Forma), o bloco cinza de parcelamento que só aparece na CRIAÇÃO, os
  placeholders ("Ex: 30% - Anteprojeto", "0,00"), o rodapé com Cancelar +
  "Criar Conta"/"Salvar Alterações" e a largura `max-w-2xl` são os do original.

  QUATRO DIVERGÊNCIAS, TODAS HERDADAS DE DECISÃO JÁ REGISTRADA — nenhuma delas é
  escolha de layout desta tela:

  1. "Nº Parcela" ERA UM CAMPO SÓ, de texto, com placeholder "1/4"
     (linha 237-244). A migration 0041 (item 2) trocou o texto "1/12" por dois
     smallint, porque texto não ordena ("10/12" antes de "2/12"), não soma, e é
     sobre ele que a unicidade contra parcela duplicada se apoia. Aqui são dois
     campos numéricos lado a lado, dentro da MESMA célula da grade de três
     colunas em que o campo único vivia — a geometria externa da linha não muda,
     e a barra entre eles preserva a leitura "1/4" do original.

  2. O SELECT DE STATUS PERDE "Em atraso". Ele é a quarta opção no original
     (linha 367) e nunca foi valor gravável: "Em atraso" é derivado
     (`is_overdue`, migrations 0040/0046) e a própria tela do original o ignora ao
     desenhar a linha. Decisão registrada em src/lib/enums.ts.

  3. A CASCATA DO CONTRATO NÃO PREENCHE MAIS O PROJETO. No original, escolher um
     contrato copiava `contract.project_id` e `contract.project_name`
     (linhas 111-112); `contracts` não tem `project_id` no schema novo — a
     ligação existe só do lado do projeto (módulo 5, item D). O contrato continua
     preenchendo o CLIENTE, que é o que ele tem.

  4. `client_name` / `contract_number` / `project_name` saem do estado do
     formulário: eram cópia do nome gravada ao lado do id (migration 0041,
     item 1) e agora vêm do join.
*/

export type ReceivableFormValues = {
  client_id: string
  contract_id: string
  project_id: string
  description: string
  installment_number: string
  installment_total: string
  value: string
  due_date: string
  issue_date: string
  status: FinancialStatus
  payment_date: string
  payment_method: ReceivablePaymentMethod | ''
}

/*
  O parcelamento do original devolve N contas de uma vez (`bulkCreate`, linha
  111 da página); a criação avulsa devolve uma. As duas formas continuam
  existindo, e quem escolhe é o mesmo botão de enviar.
*/
export type ReceivableSubmit =
  | { kind: 'single'; input: ReceivableInput }
  | { kind: 'installments'; inputs: ReceivableInput[] }

type InstallmentsConfig = {
  enabled: boolean
  quantity: number
  individualValues: number[]
}

const EMPTY_INSTALLMENTS: InstallmentsConfig = {
  enabled: false,
  quantity: 1,
  individualValues: [],
}

function emptyValues(): ReceivableFormValues {
  return {
    client_id: '',
    contract_id: '',
    project_id: '',
    description: '',
    installment_number: '',
    installment_total: '',
    value: '',
    due_date: '',
    issue_date: '',
    /* "Previsto" pré-selecionado é o do original (linha 33). */
    status: 'forecast',
    payment_date: '',
    payment_method: '',
  }
}

const text = (value: string | null): string => value ?? ''
const numberText = (value: number | null): string => (value == null ? '' : String(value))

export function toFormValues(account: ReceivableRow): ReceivableFormValues {
  return {
    client_id: text(account.client_id),
    contract_id: text(account.contract_id),
    project_id: text(account.project_id),
    description: account.description,
    installment_number: numberText(account.installment_number),
    installment_total: numberText(account.installment_total),
    value: String(account.value),
    /* O original passa por `formatDateISO` para garantir YYYY-MM-DD nos inputs
       `type="date"` (linhas 49-51); as três colunas já são `date` no Postgres e
       chegam nesse formato. */
    due_date: text(account.due_date),
    issue_date: text(account.issue_date),
    status: account.status,
    payment_date: text(account.payment_date),
    payment_method:
      account.payment_method == null || account.payment_method === 'direct_debit'
        ? ''
        : account.payment_method,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toSmallint(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

function toInput(values: ReceivableFormValues): ReceivableInput {
  return {
    description: values.description.trim(),
    value: Number(values.value),
    due_date: values.due_date,
    client_id: orNull(values.client_id),
    contract_id: orNull(values.contract_id),
    project_id: orNull(values.project_id),
    installment_number: toSmallint(values.installment_number),
    installment_total: toSmallint(values.installment_total),
    issue_date: orNull(values.issue_date),
    status: values.status,
    payment_date: orNull(values.payment_date),
    payment_method: values.payment_method === '' ? null : values.payment_method,
  }
}

/*
  A DIVISÃO DAS PARCELAS, EM CENTAVOS INTEIROS, COM O RESTO NA PRIMEIRA.

  O original divide em ponto flutuante (`totalValue / quantity`, linha 79) e
  grava o que sair: R$ 1.000,00 em 3 vezes vira 333,33333333333337 três vezes,
  que `numeric(14,2)` arredonda EM SILÊNCIO — e a soma das parcelas passa a ser
  R$ 999,99. Duas coisas mudaram desde então: `receivableInputSchema` recusa mais
  de duas casas decimais, então a divisão do original nem chegaria ao banco; e a
  migration 0044 já resolveu o mesmo problema do lado das parcelas de contrato,
  em centavos inteiros e com o resto na primeira parcela. É a mesma regra aqui,
  para o mesmo dinheiro não ser dividido de dois jeitos no mesmo sistema.

  Os valores continuam EDITÁVEIS um a um, como no original.
*/
function splitInCents(total: number, quantity: number): number[] {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / quantity)
  const remainder = cents - base * quantity
  return Array.from({ length: quantity }, (_, index) =>
    index === 0 ? (base + remainder) / 100 : base / 100,
  )
}

/*
  O vencimento de cada parcela: o mês do vencimento base, avançado de um em um
  (linhas 132-133). O `setMonth` do original transborda — 31/01 mais um mês vira
  03/03 — e isso É o que está no ar, então `new Date(ano, mês + i, dia)` mantém o
  mesmo transbordo. O que muda é o fuso: o original constrói a data em UTC e a
  serializa com `toISOString()`; aqui é local dos dois lados, como todo o resto
  do módulo (ver `toISODate` em hooks.ts).
*/
function installmentDueDate(baseDate: string, offset: number): string {
  const [year, month, day] = baseDate.split('-').map(Number)
  const date = new Date(year, month - 1 + offset, day)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function AccountReceivableForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  clients,
  projects,
  contracts,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (submit: ReceivableSubmit) => void
  initialData: ReceivableFormValues | null
  isLoading: boolean
  clients: ClientListRow[]
  projects: ProjectRow[]
  contracts: ContractRow[]
}) {
  const [values, setValues] = useState<ReceivableFormValues>(() => initialData ?? emptyValues())
  const [installments, setInstallments] = useState<InstallmentsConfig>(EMPTY_INSTALLMENTS)

  /* O original reinicia formulário e parcelamento quando `initialData` ou `open`
     mudam (linhas 44-73). */
  useEffect(() => {
    setValues(initialData ?? emptyValues())
    setInstallments(EMPTY_INSTALLMENTS)
  }, [initialData, open])

  const set = <K extends keyof ReceivableFormValues>(key: K, value: ReceivableFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  /* Recalcular os valores individuais quando a quantidade ou o valor total mudam
     (linhas 76-83). */
  useEffect(() => {
    if (!installments.enabled || installments.quantity <= 1) return
    const total = Number(values.value) || 0
    setInstallments((current) => ({
      ...current,
      individualValues: splitInCents(total, current.quantity),
    }))
  }, [installments.enabled, installments.quantity, values.value])

  const handleClientChange = (clientId: string) => {
    setValues((current) => ({ ...current, client_id: clientId }))
  }

  const handleProjectChange = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    setValues((current) => ({
      ...current,
      project_id: projectId,
      client_id: project?.client_id || current.client_id,
    }))
  }

  const handleContractChange = (contractId: string) => {
    const contract = contracts.find((item) => item.id === contractId)
    setValues((current) => ({
      ...current,
      contract_id: contractId,
      client_id: contract?.client_id || current.client_id,
    }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (installments.enabled && installments.quantity > 1) {
      const base = toInput(values)
      const quantity = installments.quantity

      onSubmit({
        kind: 'installments',
        inputs: Array.from({ length: quantity }, (_, index) => ({
          ...base,
          value: Number(installments.individualValues[index]) || 0,
          /* O texto "1/12" do original vira o par de smallint. */
          installment_number: index + 1,
          installment_total: quantity,
          due_date: installmentDueDate(base.due_date, index),
          description: `${base.description} - Parcela ${index + 1}/${quantity}`,
        })),
      })
      return
    }

    onSubmit({ kind: 'single', input: toInput(values) })
  }

  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))
  const installmentsTotal = installments.individualValues.reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={values.client_id} onValueChange={handleClientChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
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

            <div className="space-y-2">
              <Label>Contrato</Label>
              <Select value={values.contract_id} onValueChange={handleContractChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {/* Sem ordenação, como no original: os contratos vêm na ordem
                      em que a lista chega. */}
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.contract_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Projeto</Label>
            <Select value={values.project_id} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {sortedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="description">Descrição *</Label>
              <Input
                id="description"
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Ex: 30% - Anteprojeto"
                required
              />
            </div>

            {/* O campo único "1/4" do original, agora com as duas metades que a
                migration 0041 separou — na mesma célula da grade. */}
            <div className="space-y-2">
              <Label htmlFor="installment_number">Nº Parcela</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="installment_number"
                  type="number"
                  min="1"
                  value={values.installment_number}
                  onChange={(e) => set('installment_number', e.target.value)}
                  placeholder="1"
                />
                <span className="text-muted-foreground">/</span>
                <Input
                  id="installment_total"
                  type="number"
                  min="1"
                  value={values.installment_total}
                  onChange={(e) => set('installment_total', e.target.value)}
                  placeholder="4"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="value">Valor Total (R$) *</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                value={values.value}
                onChange={(e) => set('value', e.target.value)}
                placeholder="0,00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">
                Vencimento {installments.enabled && installments.quantity > 1 ? '(1ª parcela)' : ''}{' '}
                *
              </Label>
              <Input
                id="due_date"
                type="date"
                value={values.due_date}
                onChange={(e) => set('due_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="issue_date">Emissão</Label>
              <Input
                id="issue_date"
                type="date"
                value={values.issue_date}
                onChange={(e) => set('issue_date', e.target.value)}
              />
            </div>
          </div>

          {/* Parcelamento — só na criação, como no original. */}
          {!initialData && (
            <div className="space-y-4 p-4 bg-elevated rounded-lg">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enable_installments"
                  checked={installments.enabled}
                  onChange={(e) =>
                    setInstallments((current) => ({
                      ...current,
                      enabled: e.target.checked,
                      quantity: e.target.checked ? 2 : 1,
                    }))
                  }
                  className="w-4 h-4 text-primary border-border rounded focus:ring-ring"
                />
                <Label htmlFor="enable_installments" className="font-medium cursor-pointer">
                  Parcelar recebimento
                </Label>
              </div>

              {installments.enabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="installments_quantity">Quantidade de Parcelas</Label>
                    <Input
                      id="installments_quantity"
                      type="number"
                      min="2"
                      max="60"
                      value={installments.quantity}
                      onChange={(e) =>
                        setInstallments((current) => ({
                          ...current,
                          quantity: Number(e.target.value) || 2,
                        }))
                      }
                    />
                  </div>

                  {installments.quantity > 1 && installments.individualValues.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Valores Individuais (R$)</Label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                        {installments.individualValues.map((value, index) => (
                          <div key={index} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Parcela {index + 1}
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={value}
                              onChange={(e) =>
                                setInstallments((current) => {
                                  const next = [...current.individualValues]
                                  next[index] = Number(e.target.value) || 0
                                  return { ...current, individualValues: next }
                                })
                              }
                              className="h-9 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-border">
                        <span className="text-sm text-soft">Total das parcelas:</span>
                        <span className="text-sm font-semibold">
                          {formatCurrencyBRL(installmentsTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => set('status', value as FinancialStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(FINANCIAL_STATUS).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">Data Pagamento</Label>
              <Input
                id="payment_date"
                type="date"
                value={values.payment_date}
                onChange={(e) => set('payment_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select
                value={values.payment_method}
                onValueChange={(value) =>
                  set('payment_method', value as ReceivablePaymentMethod)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(RECEIVABLE_PAYMENT_METHOD).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Conta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
