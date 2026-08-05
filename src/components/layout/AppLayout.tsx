import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  CheckSquare,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingPage from '@/components/shared/LoadingPage'
import PullToRefresh from '@/components/shared/PullToRefresh'
import RouteTransition from '@/components/shared/RouteTransition'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { useBreadcrumb, type BreadcrumbItem } from '@/components/shared/useBreadcrumb'
import { useNavigation } from '@/components/shared/useNavigation'
import TabNavigationWrapper, {
  useTabNavigation,
} from '@/components/navigation/TabNavigationWrapper'
import QuickActions from '@/components/header/QuickActions'
import AcessoIndisponivel from '@/features/auth/components/AcessoIndisponivel'
import AcessoPendente from '@/features/auth/components/AcessoPendente'
import TenantName from '@/features/auth/components/TenantName'
import { MAIN_MENU_PAGES, redirectTargetFor } from '@/features/auth/access'
import {
  useAppNavigation,
  useCurrentCollaborator,
  useCurrentTenant,
  useSession,
  useSignOut,
} from '@/features/auth/hooks'
import { COLLABORATOR_AREA, labelOf } from '@/lib/enums'
import { createPageUrl } from '@/lib/page-url'

/* O original é servido em /<NomePagina>, com "Dashboard" como página inicial. */
function usePageName() {
  const location = useLocation()
  const segment = location.pathname.replace(/^\//, '').split('/')[0]
  return segment === '' ? 'Dashboard' : segment
}

function TabNavigationContent({
  children,
  breadcrumbItems,
  currentPageName,
}: {
  children: ReactNode
  breadcrumbItems: BreadcrumbItem[]
  currentPageName: string
}) {
  const { scrollContainerRef } = useTabNavigation()
  const queryClient = useQueryClient()

  return (
    <main
      ref={scrollContainerRef}
      className="p-3 sm:p-4 lg:p-8 pb-24 md:pb-8 overscroll-none overflow-y-auto overflow-x-hidden"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <PullToRefresh
        onRefresh={async () => {
          await queryClient.invalidateQueries()
        }}
      >
        <Breadcrumb items={breadcrumbItems} />
        <ErrorBoundary key={currentPageName}>
          <AnimatePresence mode="wait">
            <RouteTransition key={currentPageName}>{children}</RouteTransition>
          </AnimatePresence>
        </ErrorBoundary>
      </PullToRefresh>
    </main>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const currentPageName = usePageName()
  const { saveLastMenu, getLastMenu } = useNavigation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Determine current tab for bottom navigation
  const getCurrentTab = () => {
    const tabPages: Record<string, string> = {
      Dashboard: 'Dashboard',
      Clients: 'Clients',
      ClientDetail: 'Clients',
      Tasks: 'Tasks',
      Projects: 'Projects',
      ProjectDetail: 'Projects',
    }
    return tabPages[currentPageName] || 'Dashboard'
  }

  const currentTab = getCurrentTab()
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [hasRedirectedToLastMenu, setHasRedirectedToLastMenu] = useState(false)

  const sessionQuery = useSession()
  const collaboratorQuery = useCurrentCollaborator()
  const currentUser = sessionQuery.data?.user ?? null
  const currentCollaborator = collaboratorQuery.data ?? null
  const navigationQuery = useAppNavigation()
  const navigation = navigationQuery.items
  const signOut = useSignOut()
  const tenantName = useCurrentTenant().data?.name ?? null

  const isDirector = currentCollaborator?.role === 'director'
  const loadingPermissions = collaboratorQuery.isLoading || navigationQuery.isLoading

  // Redirecionar usuários com função Arquiteto ou Estagiário para MinhasAtividades
  useEffect(() => {
    if (!currentCollaborator) return

    const target = redirectTargetFor(currentCollaborator.role, currentPageName)
    if (target) {
      navigate(createPageUrl(target), { replace: true })
    }
  }, [currentCollaborator, currentPageName, navigate])

  // Salvar último menu visitado
  useEffect(() => {
    if (MAIN_MENU_PAGES.includes(currentPageName)) {
      saveLastMenu(currentPageName)
    }
  }, [currentPageName, saveLastMenu])

  // Restaurar último menu no login
  useEffect(() => {
    if (!currentUser || !currentCollaborator || loadingPermissions || hasRedirectedToLastMenu) {
      return
    }

    // Não redirecionar se já está em uma página válida
    if (currentPageName !== 'Dashboard' && currentPageName !== 'Welcome') {
      setHasRedirectedToLastMenu(true)
      return
    }

    const ultimoMenu = getLastMenu()

    // Se for Arquiteto ou Estagiário, vai para MinhasAtividades
    if (currentCollaborator.role === 'architect' || currentCollaborator.role === 'intern') {
      setHasRedirectedToLastMenu(true)
      return // Já tem lógica de redirecionamento acima
    }

    // Se for Coordenador, vai para DashboardExecutivo
    if (currentCollaborator.role === 'coordinator') {
      setHasRedirectedToLastMenu(true)
      return // Já tem lógica de redirecionamento acima
    }

    // Se tiver último menu salvo, redirecionar
    if (ultimoMenu && ultimoMenu !== currentPageName) {
      // Verificar se tem permissão para o último menu
      const hasPermission =
        isDirector ||
        navigationQuery.permissionCount === 0 ||
        navigation.some(
          (item) =>
            item.page === ultimoMenu || item.subItems?.some((sub) => sub.page === ultimoMenu),
        )

      if (hasPermission) {
        navigate(createPageUrl(ultimoMenu), { replace: true })
      }
    }

    setHasRedirectedToLastMenu(true)
  }, [
    currentUser,
    currentCollaborator,
    loadingPermissions,
    hasRedirectedToLastMenu,
    getLastMenu,
    navigate,
    currentPageName,
    isDirector,
    navigation,
    navigationQuery.permissionCount,
  ])

  /*
    O título da aba também dizia "Fernando Costa", escrito no index.html. Num
    sistema multitenant isso é o nome do escritório errado na aba de todo mundo
    que não seja o primeiro, então o index.html ficou só com "Backoffice" (que é
    verdade para qualquer escritório e aparece antes de existir sessão) e o nome
    entra aqui, quando o tenant chega. A limpeza devolve o título neutro ao sair
    do shell — quem desloga vai para o login, que não é de escritório nenhum.
  */
  useEffect(() => {
    const baseTitle = 'Backoffice'
    document.title = tenantName ? `${baseTitle} ${tenantName}` : baseTitle
    return () => {
      document.title = baseTitle
    }
  }, [tenantName])

  const handleLogout = () => {
    signOut.mutate()
  }

  // Gerar breadcrumbs
  const breadcrumbItems = useBreadcrumb(currentPageName)

  // Loading state - mostrar skeleton enquanto carrega
  if (sessionQuery.isLoading || (currentUser && loadingPermissions)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="animate-pulse">
          <div className="h-16 bg-card border-b border-border" />
          <div className="p-8">
            <LoadingPage />
          </div>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (collaboratorQuery.isError || navigationQuery.isError) {
    return (
      <AcessoIndisponivel
        error={collaboratorQuery.error ?? navigationQuery.error}
        onRetry={() => {
          void collaboratorQuery.refetch()
        }}
      />
    )
  }

  // Verificar se usuário tem acesso ao sistema
  // Renderizar tela de acesso pendente se não for colaborador ativo
  if (!currentCollaborator || currentCollaborator.status !== 'active') {
    return <AcessoPendente userEmail={currentUser.email} />
  }

  return (
    /*
      `bg-background` resolve os dois temas sozinho porque `--background` é
      slate-50 no claro (o valor do shell no original) e o degrau mais baixo no
      escuro — ver o comentário no src/index.css. Cartão sempre um degrau acima
      da página; a hierarquia nunca inverte.
    */
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-xs lg:hidden"
            style={{ zIndex: 49 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
        fixed top-0 left-0 h-full w-72 bg-sidebar border-r border-sidebar-border
        transform transition-transform duration-300 ease-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
        style={{ zIndex: 50 }}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border">
            {/*
              O nome sai do tenant (`TenantName`), e não mais da string
              "FERNANDO COSTA" que estava aqui. Tipografia intocada: font-light,
              text-lg, tracking-[0.15em], leading-tight e o "BACKOFFICE"
              embaixo são os do original.

              `uppercase` é NOVO e não muda um pixel do que se vê: a caixa alta
              era literal na string, e o banco guarda "Fernando Costa". Fazendo
              pelo CSS, o dado continua sendo o nome que a pessoa cadastrou.

              `truncate` + `min-w-0` é o transbordo, que o original nunca
              precisou tratar porque o nome cabia. Sem eles, um nome comprido
              quebra em duas linhas dentro de um cabeçalho de altura fixa (h-16)
              e empurra o "BACKOFFICE" para fora.
            */}
            <div className="text-center w-full min-w-0 py-2">
              <h1 className="font-light text-foreground text-lg tracking-[0.15em] leading-tight uppercase truncate">
                <TenantName />
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-[0.3em] mt-1">BACKOFFICE</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 hover:bg-sidebar-accent rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigationQuery.isEmpty && (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Nenhum menu liberado para o seu acesso.
              </p>
            )}
            {navigation.map((item) => {
              if (item.subItems) {
                // Menu com subitens
                const isExpanded = expandedMenus.includes(item.key)
                const hasActiveSubItem = item.subItems.some((sub) => currentPageName === sub.page)
                return (
                  <div key={item.key} className="space-y-1">
                    <motion.button
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setExpandedMenus((prev) =>
                          prev.includes(item.key)
                            ? prev.filter((m) => m !== item.key)
                            : [...prev, item.key],
                        )
                      }}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                        transition-all duration-200 group select-none
                        ${
                          hasActiveSubItem
                            ? 'text-sidebar-accent-foreground bg-sidebar-accent'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }
                      `}
                    >
                      <item.icon
                        className={`w-5 h-5 transition-all select-none ${hasActiveSubItem ? 'text-sidebar-foreground' : 'text-faint group-hover:text-sidebar-foreground group-hover:scale-110'}`}
                      />
                      {item.name}
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-auto"
                      >
                        <ChevronRight className="w-4 h-4 text-faint" />
                      </motion.div>
                    </motion.button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="ml-4 space-y-1 overflow-hidden"
                        >
                          {item.subItems.map((subItem) => {
                            const isActive = currentPageName === subItem.page
                            return (
                              <motion.div
                                key={subItem.page}
                                whileHover={{ x: 4 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <Link
                                  to={createPageUrl(subItem.page)}
                                  onClick={() => setSidebarOpen(false)}
                                  className={`
                                    flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium
                                    transition-all duration-200 group select-none
                                    ${
                                      isActive
                                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-slate-900/20'
                                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                    }
                                  `}
                                >
                                  <subItem.icon
                                    className={`w-4 h-4 transition-all select-none ${isActive ? 'text-sidebar-primary-foreground' : 'text-faint group-hover:text-sidebar-foreground group-hover:scale-110'}`}
                                  />
                                  {subItem.name}
                                  {isActive && (
                                    <motion.div
                                      initial={{ scale: 0, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      className="ml-auto"
                                    >
                                      <ChevronRight className="w-4 h-4" />
                                    </motion.div>
                                  )}
                                </Link>
                              </motion.div>
                            )
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              }

              // Menu sem subitens
              const isActive = currentPageName === item.page
              return (
                <motion.div key={item.page} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    to={createPageUrl(item.page!)}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                      transition-all duration-200 group select-none
                      ${
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-slate-900/20'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }
                    `}
                  >
                    <item.icon
                      className={`w-5 h-5 transition-all select-none ${isActive ? 'text-sidebar-primary-foreground' : 'text-faint group-hover:text-sidebar-foreground group-hover:scale-110'}`}
                    />
                    {item.name}
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="ml-auto"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </motion.div>
                    )}
                  </Link>
                </motion.div>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-sidebar-border">
            {currentCollaborator && (
              <div className="mb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Usuário</p>
                <p className="text-sm font-medium text-foreground">{currentCollaborator.name}</p>
                <p className="text-xs text-muted-foreground">
                  {currentCollaborator.area
                    ? labelOf(COLLABORATOR_AREA, currentCollaborator.area)
                    : 'Sem área'}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    'Deseja solicitar a exclusão de sua conta? Esta ação será revisada por um administrador.',
                  )
                ) {
                  /*
                    No original isso dispara um e-mail pela integração do
                    base44. Não há canal equivalente ainda — ver relatório do
                    módulo. Até existir, a solicitação não sai daqui.
                  */
                  toast.error('Erro ao enviar solicitação. Tente novamente.')
                }
              }}
              className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent mb-2 select-none"
            >
              <Trash2 className="w-4 h-4 mr-2 select-none" />
              Excluir Conta
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent select-none"
            >
              <LogOut className="w-4 h-4 mr-2 select-none" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <header
          className="h-16 bg-card border-b border-border sticky top-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', zIndex: 'var(--z-header)' }}
        >
          <div className="h-full flex items-center justify-between px-4 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-accent rounded-lg transition-colors select-none"
            >
              <Menu className="w-5 h-5 text-soft select-none" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <QuickActions currentCollaborator={currentCollaborator} />
            </div>
          </div>
        </header>

        {/* Page content */}
        {/* IMPORTANT: TabNavigationWrapper must NOT create a new stacking context.
            Modals, dropdowns, and overlays depend on escaping this container via portals. */}
        <TabNavigationWrapper currentTab={currentTab}>
          <TabNavigationContent
            breadcrumbItems={breadcrumbItems}
            currentPageName={currentPageName}
          >
            <Outlet />
          </TabNavigationContent>
        </TabNavigationWrapper>

        {/* Mobile Bottom Navigation */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border select-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 'var(--z-header)' }}
        >
          <div className="flex items-center justify-around h-16">
            <Link
              to={createPageUrl('Dashboard')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                currentPageName === 'Dashboard'
                  ? 'text-foreground'
                  : 'text-faint'
              }`}
            >
              <LayoutDashboard className="w-6 h-6 mb-1 select-none" />
              <span className="text-xs select-none">Início</span>
            </Link>
            <Link
              to={createPageUrl('Clients')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                currentPageName === 'Clients'
                  ? 'text-foreground'
                  : 'text-faint'
              }`}
            >
              <Users className="w-6 h-6 mb-1 select-none" />
              <span className="text-xs select-none">CRM</span>
            </Link>
            <Link
              to={createPageUrl('Tasks')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                currentPageName === 'Tasks'
                  ? 'text-foreground'
                  : 'text-faint'
              }`}
            >
              <CheckSquare className="w-6 h-6 mb-1 select-none" />
              <span className="text-xs select-none">Tarefas</span>
            </Link>
            <Link
              to={createPageUrl('Projects')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                currentPageName === 'Projects'
                  ? 'text-foreground'
                  : 'text-faint'
              }`}
            >
              <FolderKanban className="w-6 h-6 mb-1 select-none" />
              <span className="text-xs select-none">Projetos</span>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  )
}
