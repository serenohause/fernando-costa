import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/*
  O original faz na mão o que o next-themes já faz: lê `localStorage.theme`,
  cai na preferência do sistema quando não há nada gravado e alterna a classe
  `dark` no <html>. Mesma chave de storage, mesmo atributo, mesmo ícone.
*/
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} className="select-none">
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5 select-none" />
      ) : (
        <Moon className="w-5 h-5 select-none" />
      )}
    </Button>
  )
}
