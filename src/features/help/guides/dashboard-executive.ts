import { TrendingUp } from 'lucide-react'
import type { Guide } from '../types'

export const dashboardExecutiveGuide: Guide = {
  title: 'Painel Executivo',
  icon: TrendingUp,
  menu: 'dashboard_executive',
  page: 'DashboardExecutivo',
  purpose: 'Projetos, prazos e produtividade, filtrados por período, projeto e colaborador.',
  tasks: [
    {
      title: 'Usar os filtros do topo',
      steps: [
        'Escolha o período: Hoje, Esta semana, Este mês ou Todas.',
        'Escolha um projeto em Todos projetos e uma pessoa em Todos colaboradores. Esses dois valem para o painel inteiro.',
        'O período muda só os cartões Concluídas e Produtividade.',
      ],
    },
    {
      title: 'Ler os números de atividades',
      steps: [
        'O bloco Visão Geral mostra Em Andamento, Concluídas, Atrasadas e Produtividade (concluídas sobre previstas).',
        'Se você não vê as atividades de todos em Atividades, os cartões dizem Minhas atividades e contam só as suas.',
      ],
    },
    {
      title: 'Ver os projetos ativos',
      steps: [
        'Em Visão Geral de Projetos Ativos, os cartões Total Ativo, Aguardando Cliente, Em Risco e Bloqueados abrem a lista dos projetos ao clicar.',
        'Em Distribuição por Fase, clique numa barra para ver os projetos daquela fase.',
      ],
    },
    {
      title: 'Ver a carga de cada pessoa',
      steps: [
        'Em Capacidade do Time, Projetos por Colaborador mostra quantos projetos ativos cada Arquiteto, Estagiário ou Coordenador tem.',
        'Clique na pessoa para abrir a lista dos projetos dela. Busque em Buscar por nome ou código... e ordene pelo seletor ao lado.',
        'O selo Definir no Fluxo do Projeto, ou Reatribuir, marca projeto sem responsável. O responsável se define no card do Fluxo do Projeto.',
      ],
    },
    {
      title: 'Acompanhar o progresso',
      steps: [
        'Em Evolução dos Projetos, veja o Progresso Médio. Projetos < 30% e Projetos > 80% abrem a lista ao clicar.',
        'Projetos Ativos - Ordenados por Progresso mostra cada projeto com fase, responsável e percentual. A barra fica vermelha abaixo de 30% e verde acima de 80%.',
      ],
    },
  ],
  links: [
    { key: 'project_flow', why: 'Onde se define o responsável e se avança cada fase.' },
    { key: 'activities', why: 'As atividades contadas nos cartões do topo.' },
    { key: 'productivity', why: 'O detalhe das atividades concluídas, por pessoa e por projeto.' },
  ],
}
