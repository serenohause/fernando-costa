import { Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { intakeLinkFor } from '../hooks'
import type { ClientIntake } from '../types'

/*
  Porta de projeto-original/src/components/negociacoes/IntakeLinkButton.jsx.

  O botão é o mesmo (ghost, ícone de elo, toast "Link copiado!"), e o traço
  quando não há briefing também. Duas coisas mudam, e as duas por causa do
  schema:

  1. O COMPONENTE NÃO BUSCA MAIS NADA. O original chama `ClientIntake.list()`
     dentro de um `useEffect`, POR CÉLULA renderizada, para achar um briefing —
     a lista completa de briefings do escritório, uma vez por linha da tabela.
     Aqui o briefing chega por prop, de uma consulta só (useClientIntakes).

  2. `intake.link_publico` NÃO EXISTE. O original grava a URL absoluta dentro da
     linha, montada com `window.location.origin` no momento em que a negociação
     virou Ganha — URL de ambiente congelada em dado, que quebra quando o domínio
     muda. O link é montado agora, a partir do token.
*/
export default function IntakeLinkButton({ intake }: { intake: ClientIntake | null }) {
  if (!intake) return <span className="text-faint">-</span>

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={(event) => {
        event.stopPropagation()
        const link = intakeLinkFor(intake.token)
        void navigator.clipboard.writeText(link)
        toast.success('Link copiado!')
      }}
    >
      <LinkIcon className="h-4 w-4" />
    </Button>
  )
}
