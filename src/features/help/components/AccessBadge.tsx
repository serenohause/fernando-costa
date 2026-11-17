import { Eye, Pencil, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AccessKind } from '../types'

/*
  "SEU ACESSO", o elemento de assinatura do protótipo: diz por que um passo
  sumiu. Mesmo Badge outline de NegociacaoForm.tsx (bg-elevated text-soft).
*/
const LABEL = {
  role: { icon: User, text: 'Liberada pela sua função' },
  edit: { icon: Pencil, text: 'Ver e editar' },
  view: { icon: Eye, text: 'Só ver' },
} as const

export default function AccessBadge({
  kind,
  withPrefix = false,
}: {
  kind: AccessKind
  /* No painel a etiqueta ganha "Seu acesso:" para leitor de tela. */
  withPrefix?: boolean
}) {
  if (kind === 'none') return null
  const { icon: Icon, text } = LABEL[kind]
  return (
    <Badge
      variant="outline"
      className="gap-1 whitespace-nowrap bg-elevated text-soft border-border"
    >
      {withPrefix && <span className="sr-only">Seu acesso: </span>}
      <Icon className="w-3 h-3 shrink-0" />
      {text}
    </Badge>
  )
}
