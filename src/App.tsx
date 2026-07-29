import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/query-client'
import { AppRoutes } from '@/routes'

/*
  `attribute` e `storageKey` reproduzem o ThemeToggle do original: classe
  `dark` no <html> e preferência gravada em `localStorage.theme`.

  Claro por padrão, e o sistema operacional não manda. Antes era
  defaultTheme="system" com enableSystem, então quem tivesse o SO no escuro
  abria o app no escuro sem nunca ter pedido. O tema é escolha de quem usa,
  feita no botão, e fica guardada no navegador — não é preferência herdada
  da máquina.
*/
export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      storageKey="theme"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
