import { Route, Routes, useLocation } from 'react-router'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/features/auth/components/Login'

/*
  O shell já está de pé; as telas de conteúdo entram módulo a módulo, na ordem
  de docs/ARCHITECTURE.md. Até lá toda rota de página cai no placeholder, e o
  AppLayout continua sendo quem resolve menu, permissão e redirecionamento.
*/
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="*" element={<PagePlaceholder />} />
      </Route>
    </Routes>
  )
}

function PagePlaceholder() {
  const location = useLocation()
  const pageName = location.pathname.replace(/^\//, '').split('/')[0] || 'Dashboard'

  return (
    <div className="flex min-h-100 items-center justify-center">
      <p className="text-sm text-muted-foreground">Tela “{pageName}” entra no módulo dela.</p>
    </div>
  )
}
