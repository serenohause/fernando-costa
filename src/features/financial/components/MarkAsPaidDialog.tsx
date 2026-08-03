import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, CheckCircle, CreditCard, DollarSign } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import { PAYABLE_PAYMENT_METHOD, labelOf, optionsOf, type PayablePaymentMethod } from '@/lib/enums'
import type { PayableRow } from '../types'

/*
  Porta de projeto-original/src/components/payables/MarkAsPaidDialog.jsx.

  O cartão cinza com descrição, fornecedor, valor e vencimento, o crachá azul de
  "apenas esta parcela", o select de forma de pagamento com a forma atual como
  placeholder, a linha da data do pagamento e o botão esmeralda são os do
  original.

  DUAS DATAS QUE O ORIGINAL MOSTRA ERRADAS, e que aqui saem certas — mesma
  decisão já registrada em src/lib/format.ts (módulo 2), e sinalizada no
  relatório deste módulo:

  1. `format(new Date(account.due_date), 'dd/MM/yyyy')` (linha 66). `due_date` é
     coluna `date` e chega como "2026-08-03"; `new Date` de string só-data é
     meia-noite EM UTC, e formatar isso em Goiânia mostra o DIA ANTERIOR ao
     vencimento gravado — dentro de um diálogo cuja função é confirmar pagamento.
  2. `format(today, "dd 'de' MMMM 'de' yyyy")` (linha 96), onde `today` é a
     STRING de hoje. Mesmo caminho, mesmo dia a menos.

  A auditoria de quem marcou como pago (`paid_by_user_id`, `paid_by_user_name`,
  `paid_at`, AccountsPayable.jsx:362-364) não é escrita: as três colunas não
  existem no schema, e nem na entidade do base44 — ver `useMarkPayablePaid`.
*/
export default function MarkAsPaidDialog({
  open,
  onClose,
  onConfirm,
  account,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (paymentMethod?: PayablePaymentMethod) => void
  account: PayableRow | null
  isLoading: boolean
}) {
  const [paymentMethod, setPaymentMethod] = useState<PayablePaymentMethod | ''>('')

  if (!account) return null

  const isRecurring = Boolean(account.recurrence_parent_id) || account.is_recurring

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Marcar como Pago
          </AlertDialogTitle>
          {/* `asChild`: o conteúdo é um bloco com divs, e a descrição do Radix é
              um <p>. Mesma marcação visível, DOM válido. */}
          <AlertDialogDescription asChild className="space-y-4 pt-4">
            <div>
              <div className="bg-elevated rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm font-medium text-foreground">{account.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{account.supplier_name}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Valor</p>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      {formatCurrencyBRL(account.value)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Vencimento</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDateBR(account.due_date)}
                    </p>
                  </div>
                </div>

                {isRecurring && (
                  <Badge
                    variant="outline"
                    className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                  >
                    Apenas esta parcela será marcada como paga
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-soft flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  Forma de Pagamento
                </label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PayablePaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        account.payment_method
                          ? /* A coluna é o enum inteiro; o recorte "sem espécie"
                               é do check do banco, que o TS não enxerga. */
                            labelOf(
                              PAYABLE_PAYMENT_METHOD,
                              account.payment_method as PayablePaymentMethod,
                            )
                          : 'Selecione a forma de pagamento'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(PAYABLE_PAYMENT_METHOD).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Data do pagamento:{' '}
                  {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>

              <p className="text-sm text-soft pt-2">Confirmar que este pagamento foi realizado?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(paymentMethod === '' ? undefined : paymentMethod)}
            disabled={isLoading}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isLoading ? 'Processando...' : 'Confirmar Pagamento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
