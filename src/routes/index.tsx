import { Route, Routes, useLocation } from 'react-router'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/features/auth/components/Login'
import Collaborators from '@/features/team/components/Collaborators'
import AprovacoesAcesso from '@/features/team/components/AprovacoesAcesso'
import Clients from '@/features/crm/components/Clients'
import ClientDetail from '@/features/crm/components/ClientDetail'
import Negociacoes from '@/features/pipeline/components/Negociacoes'
import FormularioCliente from '@/features/pipeline/components/FormularioCliente'

/*
  O shell já está de pé; as telas de conteúdo entram módulo a módulo, na ordem
  de docs/ARCHITECTURE.md. Até lá toda rota de página cai no placeholder, e o
  AppLayout continua sendo quem resolve menu, permissão e redirecionamento.

  Os caminhos são os do original (`/<NomeDaPagina>`, ver src/lib/page-url.ts):
  é o que `menus` + MENU_META apontam na sidebar e o que está gravado no
  `ultimo_menu` do localStorage.
*/
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/*
        ROTA PÚBLICA, e a única do sistema: fora do AppLayout, sem sessão, sem
        sidebar. É o formulário de briefing que o cliente final do escritório
        preenche pelo link com validade de 24h — no original ela é registrada com
        `requiresAuth: false`. Fica ANTES do <Route element={<AppLayout />}>
        porque o layout redireciona para /login quem não tem sessão, e quem abre
        este link nunca terá uma.
      */}
      <Route path="/FormularioCliente" element={<FormularioCliente />} />
      <Route element={<AppLayout />}>
        <Route path="/Clients" element={<Clients />} />
        {/* Detalhe por query string (`?id=`), como no original — ver ClientDetail.jsx:19. */}
        <Route path="/ClientDetail" element={<ClientDetail />} />
        <Route path="/Negociacoes" element={<Negociacoes />} />
        <Route path="/Collaborators" element={<Collaborators />} />
        <Route path="/AprovacoesAcesso" element={<AprovacoesAcesso />} />
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
