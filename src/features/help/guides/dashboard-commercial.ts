import { Briefcase } from 'lucide-react'
import type { Guide } from '../types'

export const dashboardCommercialGuide: Guide = {
  title: 'Painel Comercial',
  icon: Briefcase,
  menu: 'dashboard_commercial',
  page: 'DashboardComercial',
  purpose:
    'O desempenho comercial (na tela, Dashboard Comercial): a posição atual do funil e os ganhos e perdas do mês escolhido.',
  tasks: [
    {
      title: 'Escolher o mês',
      steps: [
        'Escolha o mês e o ano nos seletores do topo.',
        'O mês muda Performance de Fechamento (Ganhos), Negociações Perdidas e o Tempo Médio de Fechamento.',
        'Visão Geral do Funil, Funil Comercial (Ativas) e Negociações Paradas (+30 dias) mostram o funil de hoje e não dependem do mês.',
      ],
    },
    {
      title: 'Ler o funil de hoje',
      steps: [
        'Os cartões mostram Negociações Ativas, Valor Total em Negociação, Ticket Médio em Negociação e Negociações em Risco, que são as de prazo vencido.',
        'Negociações Ativas, Valor Total em Negociação e Negociações em Risco abrem a lista das negociações ao clicar.',
        'Os gráficos Negociações Ativas por Etapa e Valor Ativo por Etapa mostram quantas negociações ativas e quanto valor há em cada etapa.',
      ],
    },
    {
      title: 'Ver os ganhos e as perdas do mês',
      steps: [
        'Em Performance de Fechamento (Ganhos): Negociações Ganhas, Valor Ganho, Ticket Médio Ganho e Taxa de Conversão, que é ganhas sobre finalizadas.',
        'Em Negociações Perdidas: Quantidade Perdida, Valor Perdido e Taxa de Perda.',
        'Os cartões de quantidade e de valor abrem a lista ao clicar.',
      ],
    },
    {
      title: 'Achar os gargalos',
      steps: [
        'Negociações Paradas (+30 dias) lista as negociações sem movimentação há mais de 30 dias, com cliente, responsável e etapa.',
        'O nome do cliente abre a ficha dele no CRM, se você tem acesso ao CRM.',
      ],
    },
  ],
  links: [
    { key: 'pipeline', why: 'Onde as negociações andam no funil.' },
    { key: 'dashboard_overview', why: 'Os contratos fechados no mês, ao lado do financeiro.' },
  ],
}
