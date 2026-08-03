import { addMonths, format, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/*
  Porta de projeto-original/src/components/financial/MonthYearFilter.jsx.

  As duas telas do financeiro carregam UM MÊS por vez, e é este controle que o
  escolhe: seta para trás, "agosto / 2026" no meio, seta para frente, e o botão
  "Hoje" que só aparece quando o mês selecionado não é o corrente. A moldura, os
  tamanhos (h-9 w-9, min-w-[36px], sm:min-w-[180px]), o `capitalize`, o
  `text-sm sm:text-base` e a largura cheia no celular são os do original,
  classe por classe.

  A API também é a do original — `Date` entra, `Date` sai —, e não `{year,
  month}`: é `selectedDate` que a página guarda em estado (`useState(new
  Date())`) e é `subMonths`/`addMonths` do date-fns que produz o próximo valor.
  Quem converte para o recorte que a consulta usa é `monthYearOf`, em hooks.ts.

  As cores vêm dos tokens: `bg-white` é `bg-card` (o cartão branco sobre a página
  slate-50 do original), `border-slate-200` é `border-border` e
  `text-slate-900` é `text-foreground`. Mesma cor no tema claro, e no escuro
  deixa de ser texto quase preto sobre fundo quase preto.
*/

export default function MonthYearFilter({
  selectedDate,
  onChange,
}: {
  selectedDate: Date
  onChange: (date: Date) => void
}) {
  const handlePrevMonth = () => {
    onChange(subMonths(selectedDate, 1))
  }

  const handleNextMonth = () => {
    onChange(addMonths(selectedDate, 1))
  }

  const handleToday = () => {
    onChange(new Date())
  }

  const isCurrentMonth = () => {
    const today = new Date()
    return (
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getFullYear() === today.getFullYear()
    )
  }

  return (
    <div className="flex items-center gap-2 bg-card rounded-xl border border-border p-2 w-full sm:w-auto">
      <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-9 w-9 min-w-[36px]">
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-2 flex-1 sm:min-w-[180px] justify-center">
        <span className="font-medium text-foreground capitalize text-sm sm:text-base">
          {format(selectedDate, 'MMMM / yyyy', { locale: ptBR })}
        </span>
      </div>

      <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-9 w-9 min-w-[36px]">
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isCurrentMonth() && (
        <Button variant="outline" size="sm" onClick={handleToday} className="ml-1 h-9 min-h-[36px]">
          Hoje
        </Button>
      )}
    </div>
  )
}
