import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHelp } from '@/features/help/help-context'

/*
  O "?" do cabeçalho global, logo depois do sino. Inicia o tour guiado da tela
  atual (prototypes/tour-guiado.html); tela sem tour mostra um balão curto aqui
  mesmo. Um botão só, que lê a rota, cobre todas as telas. Mesmo Button ghost
  icon do ThemeToggle. `data-tour="header-help"` é o último passo de todo tour.
*/
export default function HelpButton() {
  const help = useHelp()

  return (
    <Button
      ref={help.triggerRef}
      variant="ghost"
      size="icon"
      title="Tour guiado desta tela"
      aria-label="Tour guiado desta tela"
      data-tour="header-help"
      onClick={help.startPageTour}
      className="select-none"
    >
      <CircleHelp className="w-5 h-5 select-none" />
    </Button>
  )
}
