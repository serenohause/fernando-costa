import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/query-client'
import { AppRoutes } from '@/routes'

/*
  `attribute` e `storageKey` reproduzem o ThemeToggle do original: classe
  `dark` no <html> e preferência gravada em `localStorage.theme`, caindo na
  preferência do sistema quando não há nada gravado.
*/
export default function App() {
  return (
    <ThemeProvider attribute="class" storageKey="theme" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
