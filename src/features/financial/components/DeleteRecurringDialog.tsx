import { useState } from 'react'
import { AlertTriangle, Calendar, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { DeleteRecurringOption } from '../types'

/*
  Porta de projeto-original/src/components/payables/DeleteRecurringDialog.jsx.

  As duas opções em cartão com borda de 2px, a moldura escura na escolhida, o
  vermelho na segunda, o aviso âmbar com a contagem de futuros, o aviso azul dos
  já pagos e a cor do botão de confirmar mudando conforme a opção são os do
  original.

  `futureCount` e `paidCount` chegam prontos de quem abre o diálogo, e agora
  contam a SÉRIE INTEIRA (`useRecurrenceGroupStats`), não o mês carregado — ver o
  comentário do hook. Antes o aviso dizia "1 pagamento futuro" para uma
  recorrência de dois anos, enquanto a exclusão apagava as vinte e quatro.

  `isLoading` também é correção: no original o botão de confirmar não desabilita
  enquanto a exclusão está no ar (ele não é `AlertDialogAction`, então o diálogo
  segue aberto), e o segundo clique dispara a exclusão de novo.
*/
export default function DeleteRecurringDialog({
  open,
  onClose,
  onConfirm,
  futureCount,
  paidCount,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (option: DeleteRecurringOption) => void
  futureCount: number
  paidCount: number
  isLoading: boolean
}) {
  const [deleteOption, setDeleteOption] = useState<DeleteRecurringOption>('single')

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-lg">
            <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            Excluir Pagamento Recorrente
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Este é um pagamento vinculado a uma recorrência. Escolha como deseja proceder:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup
            value={deleteOption}
            onValueChange={(value) => setDeleteOption(value as DeleteRecurringOption)}
          >
            {/* Opção 1 - Excluir apenas este */}
            <div
              className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                deleteOption === 'single'
                  ? 'border-primary bg-elevated'
                  : 'border-border hover:border-faint'
              }`}
              onClick={() => setDeleteOption('single')}
            >
              <RadioGroupItem value="single" id="single" className="mt-1" />
              <div className="flex-1">
                <Label
                  htmlFor="single"
                  className="cursor-pointer font-semibold text-foreground flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir somente este pagamento
                </Label>
                <p className="text-sm text-soft mt-1">
                  Este lançamento será excluído, mas a recorrência continuará ativa. Lançamentos
                  futuros não serão afetados.
                </p>
              </div>
            </div>

            {/* Opção 2 - Excluir este e futuros */}
            <div
              className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                deleteOption === 'all_future'
                  ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40'
                  : 'border-border hover:border-faint'
              }`}
              onClick={() => setDeleteOption('all_future')}
            >
              <RadioGroupItem value="all_future" id="all_future" className="mt-1" />
              <div className="flex-1">
                <Label
                  htmlFor="all_future"
                  className="cursor-pointer font-semibold text-foreground flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Excluir este pagamento e todos os pagamentos futuros
                </Label>
                <p className="text-sm text-soft mt-1">
                  Esta ação encerrará a recorrência e excluirá todos os pagamentos futuros ainda não
                  vencidos.
                </p>
                {futureCount > 0 && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    {futureCount} pagamento(s) futuro(s) será(ão) excluído(s)
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>

          {/* Aviso sobre pagamentos já realizados */}
          {paidCount > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                <strong>ℹ️ Importante:</strong> {paidCount} pagamento(s) já realizado(s) será(ão)
                preservado(s) para fins de histórico financeiro.
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          {/* O texto é o do original; `disabled` é que passou a existir, para o
              segundo clique não disparar uma segunda exclusão. */}
          <Button
            onClick={() => onConfirm(deleteOption)}
            disabled={isLoading}
            className={
              deleteOption === 'all_future'
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }
          >
            Confirmar Exclusão
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
