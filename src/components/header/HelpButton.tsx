import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HELP_PANEL_ID, useHelp } from '@/features/help/help-context'

/*
  O "?" do cabeçalho global, logo depois do sino. Um botão só, que lê a rota,
  cobre todas as telas — metade delas não usa PageHeader. Mesmo Button ghost
  icon do ThemeToggle.
*/
export default function HelpButton() {
  const help = useHelp()

  return (
    <Button
      ref={help.triggerRef}
      variant="ghost"
      size="icon"
      title="Ajuda desta tela"
      aria-label="Ajuda desta tela"
      aria-controls={HELP_PANEL_ID}
      aria-expanded={help.isOpen}
      onClick={help.toggleHelp}
      className="select-none aria-expanded:bg-accent aria-expanded:text-accent-foreground"
    >
      <CircleHelp className="w-5 h-5 select-none" />
    </Button>
  )
}
