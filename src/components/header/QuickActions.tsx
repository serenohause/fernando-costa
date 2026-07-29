import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Activity,
  Columns,
  CheckSquare,
  Filter,
  FolderKanban,
  Handshake,
  Plus,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { createPageUrl } from '@/lib/page-url'
import { INDIVIDUAL_CONTRIBUTOR_ROLES } from '@/lib/enums'
import type { Collaborator } from '@/features/auth/types'

type QuickActionsProps = {
  currentCollaborator: Collaborator | null
  /*
    No original o contador de atividades atrasadas vem de uma consulta à
    entidade Atividade. A tabela `activities` só entra no módulo 6; até lá o
    badge fica em zero e não é renderizado.
  */
  overdueActivitiesCount?: number
}

export default function QuickActions({
  currentCollaborator,
  overdueActivitiesCount = 0,
}: QuickActionsProps) {
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)

  const atrasadas = overdueActivitiesCount
  const isAdmin = currentCollaborator?.role === 'director'
  const isIndividualContributor =
    currentCollaborator != null && INDIVIDUAL_CONTRIBUTOR_ROLES.includes(currentCollaborator.role)

  const getProfileShortcut = () => {
    if (!currentCollaborator) return null

    const role = currentCollaborator.role

    if (role === 'architect' || role === 'intern') {
      return (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(createPageUrl('MinhasAtividades'))}
                  className="relative"
                >
                  <CheckSquare className="w-5 h-5" />
                  {atrasadas > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-rose-500 text-white text-xs">
                      {atrasadas}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Minhas Atividades</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(createPageUrl('Tasks'))}
                >
                  <Columns className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fluxo do Projeto</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )
    }

    if (role === 'coordinator') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('Tasks'))}>
                <Columns className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Fluxo do Projeto</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    if (role === 'director') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl('DashboardExecutivo'))}
              >
                <TrendingUp className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Painel Executivo</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    if (currentCollaborator.area === 'commercial') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl('Negociacoes'))}
              >
                <Filter className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Pipeline</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return null
  }

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)}>
              <Search className="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Buscar</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {getProfileShortcut()}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Plus className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {!isIndividualContributor && (
                  <>
                    <DropdownMenuItem onClick={() => navigate(createPageUrl('Clients'))}>
                      <Users className="w-4 h-4 mr-2" />
                      Novo Lead
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(createPageUrl('Negociacoes'))}>
                      <Handshake className="w-4 h-4 mr-2" />
                      Nova Oportunidade
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate(createPageUrl('Atividades'))}>
                  <Activity className="w-4 h-4 mr-2" />
                  Nova Atividade
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Projects'))}>
                    <FolderKanban className="w-4 h-4 mr-2" />
                    Novo Projeto
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipTrigger>
          <TooltipContent>
            <p>Criar</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {searchOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-50 flex items-start justify-center pt-20"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar projetos, atividades, clientes..."
                className="flex-1 outline-hidden text-lg"
                autoFocus
              />
            </div>
            <p className="text-sm text-slate-500">Digite para buscar em todo o sistema</p>
          </div>
        </div>
      )}
    </div>
  )
}
