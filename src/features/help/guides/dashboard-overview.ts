import { LayoutDashboard } from 'lucide-react'
import type { Guide } from '../types'

export const dashboardOverviewGuide: Guide = {
  title: 'Visão Geral',
  icon: LayoutDashboard,
  menu: 'dashboard_overview',
  page: 'Dashboard',
  purpose: 'O resumo do escritório, com receita prevista e receita recebida.',
  tasks: [
    {
      title: 'Escolher o mês',
      steps: [
        'Na tela, o título é Dashboard Geral. O seletor de mês fica ao lado do título.',
        'O mês muda os quatro cartões do topo e o bloco Performance Comercial.',
        'Contas em Atraso, Projetos por Etapa e Próximas Entregas - 15 dias não dependem do mês.',
      ],
    },
    {
      title: 'Ler o resumo financeiro',
      steps: [
        'Receita Prevista soma tudo o que vence no mês em Recebíveis, recebido ou não.',
        'Receita Recebida soma só o que já foi recebido. Despesas Pagas soma o que vence no mês em Pagamentos e já foi pago.',
        'Resultado é a Receita Recebida menos as Despesas Pagas.',
        'Em Performance Comercial, Contratos Fechados (Mês) e Valor Fechado (Mês) contam os contratos aprovados com assinatura no mês.',
      ],
    },
    {
      title: 'Ver o que está atrasado',
      steps: [
        'O número ao lado de Contas em Atraso conta todas as parcelas a receber vencidas e não pagas.',
        'A lista mostra três delas, com vencimento e valor.',
        'O nome do cliente abre a ficha dele no CRM, se você tem acesso ao CRM.',
      ],
    },
    {
      title: 'Acompanhar projetos e entregas',
      steps: [
        'Projetos por Etapa divide os projetos em Não iniciado, Em andamento e Finalizado. Cada projeto conta em um só.',
        'Próximas Entregas - 15 dias lista as tarefas do Fluxo do Projeto, ainda não concluídas, com prazo nos próximos 15 dias. O número ao lado conta todas; a lista mostra três.',
        'Os dias restantes ficam em vermelho quando faltam 3 dias ou menos.',
      ],
    },
  ],
  links: [
    { key: 'receivables', why: 'De onde vêm a receita prevista, a recebida e as contas em atraso.' },
    { key: 'payables', why: 'De onde vêm as despesas pagas.' },
    { key: 'contracts', why: 'Os contratos fechados no mês.' },
    { key: 'project_flow', why: 'As tarefas das próximas entregas.' },
  ],
}
