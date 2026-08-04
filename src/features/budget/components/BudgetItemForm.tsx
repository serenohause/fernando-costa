import { useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
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
import {
  BUDGET_ITEM_PRIORITY,
  BUDGET_ITEM_STATUS,
  SUPPLIER_CATEGORY,
  optionsOf,
  type BudgetItemStatus,
  type PriorityLevel,
  type SupplierCategory,
} from '@/lib/enums'
import { suggestSuppliersForCategory } from '@/features/suppliers/list'
import type { SupplierRow } from '@/features/suppliers/types'
import type { Collaborator } from '@/features/team/types'
import type { BudgetChecklistItemInput, BudgetChecklistItemRow } from '../types'

/*
  Porta de projeto-original/src/components/orcamento/ItemOrcamentoForm.jsx.

  A ordem dos campos, os rótulos com asterisco, a grade de duas colunas, os dois
  blocos separados por linha (Fornecedor Escolhido, Fornecedores Cotados), a
  linha de três colunas para acrescentar cotação, os placeholders e o texto dos
  botões são os do original.

  O QUE MUDA, E POR QUÊ:

  1. A LISTA DE CATEGORIAS é `SUPPLIER_CATEGORY` (src/lib/enums.ts): os mesmos 23
     rótulos do original, na mesma ordem — o select grava o valor do banco e
     mostra o rótulo. Status e prioridade idem (`BUDGET_ITEM_STATUS`,
     `BUDGET_ITEM_PRIORITY`).
  2. `comissao_valor` NÃO é calculada aqui. No original o formulário multiplica
     valor por percentual e grava o resultado; aqui a coluna é GERADA pelo banco
     (migration 0049) e mandá-la na gravação seria erro de sistema.
  3. A COTAÇÃO REPETIDA DO MESMO FORNECEDOR não vira uma segunda linha. O banco
     tem unique `(item, fornecedor)` e o schema de gravação mantém a ÚLTIMA
     cotação de cada fornecedor — no original a lista aceita duas, e a segunda
     apaga a primeira em silêncio (e o drawer marca as duas como "Escolhido").
     Aqui adicionar de novo o mesmo fornecedor ATUALIZA o valor da linha que já
     está lá, preserva a observação dela e diz o que aconteceu.
  4. `estimated_value` continua SEM campo, como no original — o valor é somado no
     rodapé do checklist e exibido no drawer, e hoje só a importação consegue
     preenchê-lo (defeito registrado na migration 0049, nota b, e reportado). Ele
     viaja pelo formulário intacto, para que editar um item não apague o que
     estiver lá.
  5. `client_approved`, `approval_date` e `is_required` também viajam sem input,
     como no original — que os declara no estado inicial e nunca os oferece.
*/

/* O original usa a string '__none__' como valor da opção "Nenhum" porque
   `SelectItem` não aceita valor vazio. Mesma tradução de AtividadeForm. */
const NONE = '__none__'

export type BudgetItemQuoteFormValue = {
  supplier_id: string
  /* O nome vem junto, como no original: a cotação continua legível mesmo quando
     o fornecedor sai da lista de sugestões da categoria escolhida. */
  supplier_name: string
  value: string
  /* Sem input, como no original: a observação da cotação é exibida no drawer e
     preservada na edição. */
  notes: string | null
}

export type BudgetItemFormValues = {
  name: string
  description: string
  category: SupplierCategory | ''

  responsible_id: string
  due_date: string

  status: BudgetItemStatus
  priority: PriorityLevel

  approved_value: string

  chosen_supplier_id: string
  commission_percent: string

  notes: string
  quotes: BudgetItemQuoteFormValue[]

  /* Sem input na tela — carregados do item e devolvidos como vieram. */
  estimated_value: number | null
  client_approved: boolean
  approval_date: string | null
  is_required: boolean
}

function emptyValues(): BudgetItemFormValues {
  return {
    name: '',
    description: '',
    category: '',

    responsible_id: '',
    due_date: '',

    /* "Pendente" e "Média" pré-selecionados são os do original
       (ItemOrcamentoForm.jsx:24). */
    status: 'pending',
    priority: 'medium',

    approved_value: '',

    chosen_supplier_id: '',
    commission_percent: '',

    notes: '',
    quotes: [],

    estimated_value: null,
    client_approved: false,
    approval_date: null,
    /* `obrigatorio: true` do original (ItemOrcamentoForm.jsx:28). */
    is_required: true,
  }
}

const text = (value: string | null): string => value ?? ''
const numberText = (value: number | null): string => (value == null ? '' : String(value))

export function toFormValues(item: BudgetChecklistItemRow): BudgetItemFormValues {
  return {
    name: item.name,
    description: text(item.description),
    category: item.category ?? '',

    responsible_id: item.responsible_id ?? '',
    due_date: text(item.due_date),

    status: item.status,
    priority: item.priority,

    approved_value: numberText(item.approved_value),

    chosen_supplier_id: item.chosen_supplier_id ?? '',
    commission_percent: numberText(item.commission_percent),

    notes: text(item.notes),
    quotes: item.quotes.map((quote) => ({
      supplier_id: quote.supplier_id,
      supplier_name: quote.supplier?.name ?? '',
      value: numberText(quote.value),
      notes: quote.notes,
    })),

    estimated_value: item.estimated_value,
    client_approved: item.client_approved,
    approval_date: item.approval_date,
    is_required: item.is_required,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/* `form.campo ? Number(form.campo) : null` do original: vazio vira NULO, e não
   zero. O schema é quem recusa texto que não é número, com frase em português. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

function selectedId(value: string): string | null {
  return value === '' || value === NONE ? null : value
}

function toInput(values: BudgetItemFormValues): BudgetChecklistItemInput {
  return {
    name: values.name.trim(),
    description: orNull(values.description),
    category: values.category === '' ? null : values.category,

    responsible_id: selectedId(values.responsible_id),
    due_date: orNull(values.due_date),

    status: values.status,
    priority: values.priority,

    estimated_value: values.estimated_value,
    approved_value: numberOrNull(values.approved_value),

    chosen_supplier_id: selectedId(values.chosen_supplier_id),
    commission_percent: numberOrNull(values.commission_percent),

    client_approved: values.client_approved,
    approval_date: values.approval_date,

    is_required: values.is_required,
    notes: orNull(values.notes),

    quotes: values.quotes.map((quote) => ({
      supplier_id: quote.supplier_id,
      value: numberOrNull(quote.value),
      notes: quote.notes,
    })),
  }
}

/*
  `R$ ${Number(v).toLocaleString('pt-BR')}` do original (ItemOrcamentoForm.jsx:201),
  sem `minimumFractionDigits` — 1234.5 vira "R$ 1.234,5" aqui e "R$ 1.234,50" em
  todo o resto do sistema. É o formato que esta lista mostra hoje; a divergência
  em relação a `formatCurrencyBRL` está reportada.
*/
function quoteValueLabel(value: string): string {
  return `R$ ${Number(value).toLocaleString('pt-BR')}`
}

const emptyQuote: BudgetItemQuoteFormValue = {
  supplier_id: '',
  supplier_name: '',
  value: '',
  notes: null,
}

export default function BudgetItemForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  suppliers,
  collaborators,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: BudgetChecklistItemInput) => void
  /** `toFormValues(item)` para editar, `null` para adicionar. */
  initialData: BudgetItemFormValues | null
  isLoading: boolean
  suppliers: SupplierRow[]
  collaborators: Collaborator[]
}) {
  const [values, setValues] = useState<BudgetItemFormValues>(() => initialData ?? emptyValues())
  const [draftQuote, setDraftQuote] = useState<BudgetItemQuoteFormValue>(emptyQuote)

  /* O original reinicia o formulário quando `initialData` ou `open` mudam. */
  useEffect(() => {
    setValues(initialData ?? emptyValues())
    setDraftQuote(emptyQuote)
  }, [initialData, open])

  const set = <K extends keyof BudgetItemFormValues>(key: K, value: BudgetItemFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  /* Sugestão por categoria, com a regra do original inteira — inclusive o
     "sem ninguém na categoria, mostra todo mundo" (src/features/suppliers/list.ts). */
  const suggestedSuppliers = suggestSuppliersForCategory(suppliers, values.category || null)

  const handleChosenSupplier = (supplierId: string) => {
    const supplier = suppliers.find((candidate) => candidate.id === supplierId)
    setValues((current) => ({
      ...current,
      chosen_supplier_id: supplierId,
      /* `f?.percentual_comissao || prev.comissao_percentual` do original: o
         fornecedor sem percentual (ou com zero) não apaga o que foi digitado. */
      commission_percent: supplier?.commission_percent
        ? String(supplier.commission_percent)
        : current.commission_percent,
    }))
  }

  const addQuote = () => {
    if (!draftQuote.supplier_id) return

    const existing = values.quotes.findIndex(
      (quote) => quote.supplier_id === draftQuote.supplier_id,
    )

    if (existing === -1) {
      setValues((current) => ({ ...current, quotes: [...current.quotes, draftQuote] }))
    } else {
      setValues((current) => ({
        ...current,
        quotes: current.quotes.map((quote, index) =>
          index === existing ? { ...quote, value: draftQuote.value } : quote,
        ),
      }))
      toast.info('Esse fornecedor já estava na lista. O valor da cotação foi atualizado.')
    }

    setDraftQuote(emptyQuote)
  }

  const removeQuote = (index: number) =>
    setValues((current) => ({
      ...current,
      quotes: current.quotes.filter((_, position) => position !== index),
    }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values))
  }

  const activeCollaborators = collaborators.filter(
    (collaborator) => collaborator.status === 'active',
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Item' : 'Adicionar Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="item-name">Nome do Item *</Label>
              <Input
                id="item-name"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="ex: Porcelanato sala de estar"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria *</Label>
              <Select
                value={values.category}
                onValueChange={(value) => set('category', value as SupplierCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(SUPPLIER_CATEGORY).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => set('status', value as BudgetItemStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(BUDGET_ITEM_STATUS).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="item-description">Descrição</Label>
            <Textarea
              id="item-description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Ambiente, metragem, especificação..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Responsável pelo Item</Label>
              <Select
                value={values.responsible_id}
                onValueChange={(value) => set('responsible_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {activeCollaborators.map((collaborator) => (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-due-date">Prazo</Label>
              <Input
                id="item-due-date"
                type="date"
                value={values.due_date}
                onChange={(e) => set('due_date', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select
                value={values.priority}
                onValueChange={(value) => set('priority', value as PriorityLevel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(BUDGET_ITEM_PRIORITY).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-approved-value">Valor Aprovado (R$)</Label>
              <Input
                id="item-approved-value"
                type="number"
                value={values.approved_value}
                onChange={(e) => set('approved_value', e.target.value)}
              />
            </div>
          </div>

          {/* Fornecedor Escolhido */}
          <div className="border-t pt-4 space-y-1">
            <Label>
              Fornecedor Escolhido
              {values.category && (
                <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                  (sugestões para: {SUPPLIER_CATEGORY[values.category]})
                </span>
              )}
            </Label>
            <Select value={values.chosen_supplier_id} onValueChange={handleChosenSupplier}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {suggestedSuppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name} — {SUPPLIER_CATEGORY[supplier.category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* A grade de duas colunas com um campo só é a do original
              (ItemOrcamentoForm.jsx:186-192): a metade da direita fica vazia. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="item-commission">% Comissão</Label>
              <Input
                id="item-commission"
                type="number"
                value={values.commission_percent}
                onChange={(e) => set('commission_percent', e.target.value)}
              />
            </div>
          </div>

          {/* Fornecedores cotados */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-soft mb-3">Fornecedores Cotados</p>
            <div className="space-y-2 mb-3">
              {values.quotes.map((quote, index) => (
                <div
                  key={quote.supplier_id}
                  className="flex items-center gap-2 bg-elevated rounded-lg px-3 py-2 text-sm"
                >
                  <span className="flex-1">{quote.supplier_name}</span>
                  {quote.value && (
                    <span className="text-soft">{quoteValueLabel(quote.value)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeQuote(index)}
                    className="text-faint hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={draftQuote.supplier_id}
                onValueChange={(value) => {
                  const supplier = suppliers.find((candidate) => candidate.id === value)
                  setDraftQuote((current) => ({
                    ...current,
                    supplier_id: value,
                    supplier_name: supplier?.name ?? '',
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {suggestedSuppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Valor"
                value={draftQuote.value}
                onChange={(e) => setDraftQuote((current) => ({ ...current, value: e.target.value }))}
              />
              <Button type="button" variant="outline" onClick={addQuote}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="item-notes">Observações</Label>
            <Textarea
              id="item-notes"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {/* O texto é fixo, como no original — `isLoading` só impede o
                segundo clique enquanto a gravação está no ar. */}
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {initialData ? 'Salvar Alterações' : 'Adicionar Item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
