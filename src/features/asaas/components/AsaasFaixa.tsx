import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
  A FAIXA DO BLOCO DO ASAAS, nas duas famílias que o protótipo desenhou.

  A geometria é literal da faixa de `last_error` do Google Agenda em
  IntegrationsSection.tsx: flex items-start gap-2 p-3 rounded-lg, ícone de 1rem
  alinhado à primeira linha, bg-destructive/10 com borda bg-destructive/30.

  `error` é vermelho porque pode ser dinheiro que entrou e não apareceu aqui.
  `warn` é âmbar, a família que o StatusBadge usa para "espera", porque o aviso
  de pagamento não registrado NÃO é falha: a cobrança sai, só a baixa
  automática não pode ser confiada. Vermelho ali seria exagero e verde seria
  mentira.

  TRÊS CAMADAS DE TEXTO, nesta ordem: quando aconteceu, o que isso significa
  para o escritório, e só então o texto cru do erro em largura fixa. O recado
  do meio é o que a faixa do Google Agenda não tem e esta precisa ter, porque
  "falhou" sozinho não diz que uma parcela pode estar paga sem aparecer.
*/
const TONS = {
  error: {
    caixa: 'bg-destructive/10 border-destructive/30',
    tinta: 'text-destructive',
  },
  warn: {
    caixa: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
    tinta: 'text-amber-700 dark:text-amber-400',
  },
} as const

export default function AsaasFaixa({
  tone,
  icon: Icon,
  title,
  text,
  code,
}: {
  tone: keyof typeof TONS
  icon: LucideIcon
  title: string
  text: string
  code?: string
}) {
  const { caixa, tinta } = TONS[tone]

  return (
    <div className={cn('flex items-start gap-2 p-3 rounded-lg border text-sm', caixa)}>
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', tinta)} />
      <div>
        <p className={cn('font-medium', tinta)}>{title}</p>
        <p className="text-muted-foreground mt-0.5">{text}</p>
        {code && (
          <p className="text-muted-foreground mt-0.5 font-mono text-xs break-words">{code}</p>
        )}
      </div>
    </div>
  )
}
