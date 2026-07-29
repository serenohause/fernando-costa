import { useNavigate } from 'react-router'
import { createPageUrl } from '@/lib/page-url'

// Mapeamento de páginas para suas listagens principais
const pageToListingMap: Record<string, string> = {
  // Projetos
  ProjectDetail: 'Projects',
  ProjectEdit: 'Projects',
  ProjectNew: 'Projects',

  // Tarefas
  TaskDetail: 'Tasks',
  TaskEdit: 'Tasks',
  TaskNew: 'Tasks',

  // Atividades
  AtividadeDetail: 'Atividades',
  AtividadeEdit: 'Atividades',
  AtividadeNew: 'Atividades',

  // CRM
  ClientDetail: 'Clients',
  ClientEdit: 'Clients',
  ClientNew: 'Clients',

  // Pipeline
  NegociacaoDetail: 'Negociacoes',
  NegociacaoEdit: 'Negociacoes',
  NegociacaoNew: 'Negociacoes',

  // Contratos
  ContractDetail: 'Contracts',
  ContractEdit: 'Contracts',
  ContractNew: 'Contracts',

  // Financeiro
  ReceivableDetail: 'AccountsReceivable',
  ReceivableEdit: 'AccountsReceivable',
  ReceivableNew: 'AccountsReceivable',
  PayableDetail: 'AccountsPayable',
  PayableEdit: 'AccountsPayable',
  PayableNew: 'AccountsPayable',

  // Colaboradores
  CollaboratorDetail: 'Collaborators',
  CollaboratorEdit: 'Collaborators',
  CollaboratorNew: 'Collaborators',
}

export function useNavigation() {
  const navigate = useNavigate()

  const goBack = (currentPage: string, fallbackPage?: string) => {
    try {
      // Prioridade 1: usar fallbackPage se fornecido
      if (fallbackPage) {
        navigate(createPageUrl(fallbackPage), { replace: false })
        return
      }

      // Prioridade 2: buscar rota_origem do sessionStorage
      const rotaOrigem = sessionStorage.getItem('rota_origem')
      if (rotaOrigem && rotaOrigem !== window.location.pathname) {
        sessionStorage.removeItem('rota_origem')
        navigate(rotaOrigem, { replace: false })
        return
      }

      // Prioridade 3: usar mapeamento de página para listagem
      const listingPage = pageToListingMap[currentPage]
      if (listingPage) {
        navigate(createPageUrl(listingPage), { replace: false })
        return
      }

      // Prioridade 4: ir para Dashboard como fallback seguro
      navigate(createPageUrl('Dashboard'), { replace: false })
    } catch (error) {
      console.error('Erro ao voltar:', error)
      // Fallback final: ir para Dashboard
      navigate(createPageUrl('Dashboard'), { replace: true })
    }
  }

  const navigateTo = (page: string, saveAsOrigin = false) => {
    try {
      if (saveAsOrigin) {
        sessionStorage.setItem('rota_origem', window.location.pathname)
      }
      navigate(createPageUrl(page), { replace: false })
    } catch (error) {
      console.error('Erro ao navegar:', error)
      navigate(createPageUrl('Dashboard'), { replace: true })
    }
  }

  const saveOrigin = () => {
    try {
      sessionStorage.setItem('rota_origem', window.location.pathname)
    } catch (error) {
      console.error('Erro ao salvar origem:', error)
    }
  }

  const saveLastMenu = (menuName: string) => {
    try {
      localStorage.setItem('ultimo_menu', menuName)
    } catch (error) {
      console.error('Erro ao salvar último menu:', error)
    }
  }

  const getLastMenu = () => {
    try {
      return localStorage.getItem('ultimo_menu')
    } catch (error) {
      console.error('Erro ao recuperar último menu:', error)
      return null
    }
  }

  return {
    goBack,
    navigateTo,
    saveOrigin,
    saveLastMenu,
    getLastMenu,
  }
}
