import { useEffect, useState, type FormEvent } from 'react'
import { Repeat } from 'lucide-react'
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
import type { ProjectRow } from '@/features/projects/types'
import {
  EXPENSE_CATEGORY,
  FINANCIAL_STATUS,
  PAYABLE_PAYMENT_METHOD,
  RECURRENCE_FREQUENCY_OPTION,
  optionsOf,
  type ExpenseCategory,
  type FinancialStatus,
  type PayablePaymentMethod,
  type RecurrenceFrequency,
  type RecurrenceStatus,
} from '@/lib/enums'
import { formatCompetenceMonth } from '../schemas'
import type { PayableInput, PayableRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/AccountPayableForm.jsx.

  A ordem dos campos, a grade de duas colunas de Fornecedor/Categoria, a de três
  de Valor/Vencimento/Competência, o bloco azul da recorrência com o aviso de
  lâmpada, a grade de três de Status/Data Pagamento/Forma de Pagamento, o bloco
  âmbar do "atualizar toda a série" e o texto dos botões são os do original.

  O QUE MUDA, E POR QUÊ:

  1. `project_name` sai do estado do formulário (`handleProjectChange`, linhas
     78-85). Era cópia do nome gravada junto do id; o nome vem do embed agora
     (migration 0041, item 1).
  2. O select de Status perde "Em atraso". Não é escolha desta tela: "Em atraso"
     nunca foi valor gravável (migration 0040) — é derivado de `is_overdue`, e
     no original escolhê-lo grava um status que a própria tela ignora ao desenhar
     a linha. Ver o comentário de FINANCIAL_STATUS em src/lib/enums.ts.
  3. Os selects gravam o valor do banco e exibem o rótulo de src/lib/enums.ts. A
     lista de frequência é a com o intervalo entre parênteses
     (RECURRENCE_FREQUENCY_OPTION), que é a deste select no original.
  4. `competence_month` continua sendo o campo de texto "MM/YYYY" do original; o
     de/para para a data do primeiro dia do mês é `parseCompetenceMonth` /
     `formatCompetenceMonth`, em schemas.ts (migration 0041, item 5).

  `updateAllRecurring` NÃO é reiniciado ao abrir o formulário, como no original
  (linha 43, sem efeito de reset): marcar a caixa numa ocorrência e depois abrir
  outra da mesma série a mostra ainda marcada. Fica registrado no relatório.
*/

export type PayableFormValues = {
  supplier_name: string
  category: ExpenseCategory | ''
  description: string
  project_id: string
  value: string
  due_date: string
  competence_month: string

  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | ''
  recurrence_start_date: string
  recurrence_end_date: string
  recurrence_count: string
  recurrence_status: RecurrenceStatus

  status: FinancialStatus
  payment_date: string
  payment_method: PayablePaymentMethod | ''

  /* Não é campo editável: decide se "é recorrente" fica travado e se a caixa de
     "atualizar toda a série" aparece — os dois usos que o original faz dele
     (linhas 232 e 358). */
  recurrence_parent_id: string | null
}

function emptyValues(): PayableFormValues {
  return {
    supplier_name: '',
    category: '',
    description: '',
    project_id: '',
    value: '',
    due_date: '',
    competence_month: '',
    is_recurring: false,
    recurrence_frequency: '',
    recurrence_start_date: '',
    recurrence_end_date: '',
    recurrence_count: '',
    /* "Ativa" pré-selecionado é o do original (linha 40). É valor inicial do
       FORMULÁRIO: a coluna não tem default, para que despesa avulsa não nasça
       com a situação de uma recorrência que não existe (migration 0041). */
    recurrence_status: 'active',
    status: 'forecast',
    payment_date: '',
    payment_method: '',
    recurrence_parent_id: null,
  }
}

const text = (value: string | null): string => value ?? ''

export function toFormValues(account: PayableRow): PayableFormValues {
  return {
    supplier_name: account.supplier_name,
    category: account.category,
    description: account.description,
    project_id: text(account.project_id),
    value: String(account.value),
    due_date: account.due_date,
    competence_month: formatCompetenceMonth(account.competence_month),
    is_recurring: account.is_recurring,
    recurrence_frequency: account.recurrence_frequency ?? '',
    recurrence_start_date: text(account.recurrence_start_date),
    recurrence_end_date: text(account.recurrence_end_date),
    recurrence_count: account.recurrence_count == null ? '' : String(account.recurrence_count),
    recurrence_status: account.recurrence_status ?? 'active',
    status: account.status,
    payment_date: text(account.payment_date),
    /* A coluna é o enum INTEIRO (`payment_method`); quem recorta "sem espécie"
       nesta tabela é `accounts_payable_payment_method_domain_check`, que o TS
       não enxerga. Ver PAYABLE_PAYMENT_METHOD em src/lib/enums.ts. */
    payment_method: (account.payment_method as PayablePaymentMethod | null) ?? '',
    recurrence_parent_id: account.recurrence_parent_id,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: PayableFormValues): PayableInput {
  return {
    supplier_name: values.supplier_name.trim(),
    description: values.description.trim(),
    /* O `required` da marcação já barra o vazio; o schema recusa de novo. */
    category: values.category as ExpenseCategory,
    value: Number(values.value),
    due_date: values.due_date,

    project_id: orNull(values.project_id),

    status: values.status,
    payment_date: orNull(values.payment_date),
    payment_method: values.payment_method === '' ? null : values.payment_method,

    competence_month: orNull(values.competence_month),

    is_recurring: values.is_recurring,
    recurrence_frequency: values.recurrence_frequency === '' ? null : values.recurrence_frequency,
    recurrence_start_date: orNull(values.recurrence_start_date),
    recurrence_end_date: orNull(values.recurrence_end_date),
    recurrence_count:
      values.recurrence_count.trim() === '' ? null : Number(values.recurrence_count),
    recurrence_status: values.recurrence_status,
  }
}

export default function AccountPayableForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  projects,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: PayableInput, updateAll: boolean) => void
  initialData: PayableFormValues | null
  isLoading: boolean
  projects: ProjectRow[]
}) {
  const [values, setValues] = useState<PayableFormValues>(() => initialData ?? emptyValues())
  const [updateAllRecurring, setUpdateAllRecurring] = useState(false)

  /* O original reinicia o formulário quando `initialData` ou `open` mudam. */
  useEffect(() => {
    setValues(initialData ?? emptyValues())
  }, [initialData, open])

  const set = <K extends keyof PayableFormValues>(key: K, value: PayableFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values), updateAllRecurring)
  }

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">Fornecedor *</Label>
              <Input
                id="supplier"
                value={values.supplier_name}
                onChange={(e) => set('supplier_name', e.target.value)}
                placeholder="Nome do fornecedor"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select
                value={values.category}
                onValueChange={(value) => set('category', value as ExpenseCategory)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(EXPENSE_CATEGORY).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição *</Label>
            <Input
              id="description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descrição da despesa"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Projeto (opcional)</Label>
            <Select value={values.project_id} onValueChange={(value) => set('project_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Vincular a projeto" />
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
            <div className="space-y-2">
              <Label htmlFor="value">Valor (R$) *</Label>
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
              <Label htmlFor="due_date">Vencimento *</Label>
              <Input
                id="due_date"
                type="date"
                value={values.due_date}
                onChange={(e) => set('due_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="competence_month">Competência</Label>
              <Input
                id="competence_month"
                value={values.competence_month}
                onChange={(e) => set('competence_month', e.target.value)}
                placeholder="MM/YYYY"
              />
            </div>
          </div>

          {/* Recorrência */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="is_recurring"
                checked={values.is_recurring}
                onCheckedChange={(checked) => set('is_recurring', checked === true)}
                disabled={Boolean(initialData?.recurrence_parent_id)}
              />
              <Label
                htmlFor="is_recurring"
                className="cursor-pointer font-medium flex items-center gap-2"
              >
                <Repeat className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Este pagamento é recorrente
              </Label>
            </div>

            {values.is_recurring && (
              <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frequência *</Label>
                    <Select
                      value={values.recurrence_frequency}
                      onValueChange={(value) =>
                        set('recurrence_frequency', value as RecurrenceFrequency)
                      }
                      required={values.is_recurring}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {optionsOf(RECURRENCE_FREQUENCY_OPTION).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recurrence_start_date">Data de Início *</Label>
                    <Input
                      id="recurrence_start_date"
                      type="date"
                      value={values.recurrence_start_date}
                      onChange={(e) => set('recurrence_start_date', e.target.value)}
                      required={values.is_recurring}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recurrence_end_date">Data de Término (opcional)</Label>
                    <Input
                      id="recurrence_end_date"
                      type="date"
                      value={values.recurrence_end_date}
                      onChange={(e) => set('recurrence_end_date', e.target.value)}
                      disabled={values.recurrence_count.trim() !== ''}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recurrence_count">Quantidade de Repetições (opcional)</Label>
                    <Input
                      id="recurrence_count"
                      type="number"
                      min="1"
                      value={values.recurrence_count}
                      onChange={(e) => set('recurrence_count', e.target.value)}
                      placeholder="Ex: 12 meses"
                      disabled={values.recurrence_end_date !== ''}
                    />
                  </div>
                </div>

                {/*
                  O aviso do original, palavra por palavra. O que ele NÃO diz —
                  e é o comportamento que está no ar — é que, sem término e sem
                  quantidade, uma recorrência mensal gera 119 lançamentos, o teto
                  de dez anos. Está no relatório do módulo.
                */}
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  💡 O sistema gerará automaticamente os lançamentos futuros com base na frequência
                  escolhida. Cada lançamento poderá ser editado ou pago independentemente.
                </p>
              </div>
            )}
          </div>

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
                onValueChange={(value) => set('payment_method', value as PayablePaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(PAYABLE_PAYMENT_METHOD).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {initialData?.recurrence_parent_id && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900">
                <Checkbox
                  id="update_all_recurring"
                  checked={updateAllRecurring}
                  onCheckedChange={(checked) => setUpdateAllRecurring(checked === true)}
                />
                <Label
                  htmlFor="update_all_recurring"
                  className="cursor-pointer text-sm text-amber-900 dark:text-amber-300"
                >
                  🔄 Atualizar também todos os pagamentos recorrentes futuros desta série
                </Label>
              </div>
            </div>
          )}

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
