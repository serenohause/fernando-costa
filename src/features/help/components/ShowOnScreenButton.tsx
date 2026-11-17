import { MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GUIDES } from '../guides/index.ts'
import { useHelp } from '../help-context'

/* "Me mostrar na tela": só existe para guia com tour. Navega e começa o tour. */
export default function ShowOnScreenButton({ guideKey }: { guideKey: string }) {
  const help = useHelp()
  if (!GUIDES[guideKey]?.tour) return null
  return (
    <Button variant="outline" size="sm" onClick={() => help.showOnScreen(guideKey)}>
      <MousePointerClick />
      Me mostrar na tela
    </Button>
  )
}
