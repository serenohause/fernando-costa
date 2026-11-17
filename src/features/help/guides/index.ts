import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  Briefcase,
  ChartColumn,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  MapPin,
  PanelLeft,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  TrendingUp,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react'
import type { Guide, Trail } from '../types'
import { myActivitiesGuide } from './my-activities.ts'
import { pipelineGuide } from './pipeline.ts'
import { projectsGuide } from './projects.ts'

/*
  OS GUIAS, um por tela. A chave é o `menus.key` da tela (a mesma da matriz de
  permissões e de MENU_META), e só os guias sem menu têm chave própria
  (primeiros passos, Formulário de briefing, Permissões, Acessar como,
  Relatório de Produtividade, a própria Central).

  Texto copiado de prototypes/ajuda.html, aprovado. Guia completo nesta versão:
  Minhas Atividades, Pipeline e Projetos, cada um no seu arquivo. O resto é
  "em breve": só a frase de propósito.

  Ícones: os mesmos de MENU_META (navigation.ts) para quem tem menu.
*/
export const GUIDES: Record<string, Guide> = {
  /* ---------- 0 Primeiros passos ---------- */
  first_login: {
    title: 'Entrar e criar sua senha',
    icon: KeyRound,
    always: true,
    purpose:
      'No primeiro acesso o sistema pede para trocar a senha provisória, criada pelo Diretor, por uma senha sua de pelo menos 8 caracteres.',
  },
  profile: {
    title: 'Meu Perfil',
    icon: Settings2,
    always: true,
    page: 'Perfil',
    purpose:
      'Seus dados, sua foto e sua senha. Chega-se pelo seu nome, no rodapé da barra lateral.',
  },
  sidebar: {
    title: 'A barra lateral',
    icon: PanelLeft,
    always: true,
    purpose:
      'Mostra só as telas liberadas para você. Se falta alguma, quem libera é o Diretor, em Equipe.',
  },
  search: {
    title: 'Buscar',
    icon: Search,
    always: true,
    purpose: 'A lupa do cabeçalho procura clientes, projetos, contratos e tarefas de uma vez.',
  },
  notifications: {
    title: 'Notificações',
    icon: Bell,
    always: true,
    purpose: 'O sino avisa quando alguém te atribui uma tarefa ou quando um prazo seu vence.',
  },
  my_activities: myActivitiesGuide,

  /* ---------- 1 Captar ---------- */
  pipeline: pipelineGuide,
  intake_form: {
    title: 'Formulário de briefing',
    icon: ClipboardCheck,
    needsMenu: 'pipeline',
    purpose:
      'Link público, válido por 24 horas, que o cliente preenche sem login depois que a negociação é marcada como Ganha. A resposta chega em Briefings recebidos.',
  },

  /* ---------- 2 CRM ---------- */
  crm: {
    title: 'CRM',
    icon: Users,
    menu: 'crm',
    page: 'Clients',
    purpose: 'A base de leads e clientes do escritório: cadastro, titulares e contatos de cada um.',
  },

  /* ---------- 3 Orçamento e fornecedores ---------- */
  client_budget: {
    title: 'Orçamento por Cliente',
    icon: ClipboardList,
    menu: 'client_budget',
    page: 'OrcamentoCliente',
    purpose:
      'Checklist do que orçar para cada cliente, por fase do projeto, com responsável e status.',
  },
  suppliers: {
    title: 'Fornecedores',
    icon: Store,
    menu: 'suppliers',
    page: 'Fornecedores',
    purpose: 'Cadastro de fornecedores com tipologia, marca e nível de parceria.',
  },

  /* ---------- 4 Contratos ---------- */
  contracts: {
    title: 'Contratos & Propostas',
    icon: FileText,
    menu: 'contracts',
    page: 'Contracts',
    purpose:
      'Contratos e propostas comerciais por cliente e projeto. O contrato pode nascer do briefing conferido no Pipeline.',
  },

  /* ---------- 5 Projetos ---------- */
  projects: projectsGuide,
  project_flow: {
    title: 'Fluxo do Projeto',
    icon: CheckSquare,
    menu: 'project_flow',
    page: 'Tasks',
    purpose:
      'O quadro com os cartões de cada projeto por fase. É aqui que se define o responsável operacional.',
  },
  map: {
    title: 'Mapa de Projetos',
    icon: MapPin,
    menu: 'map',
    page: 'MapaProjetos',
    purpose: 'A localização de todos os projetos no mapa.',
  },

  /* ---------- 6 Atividades ---------- */
  activities: {
    title: 'Atividades',
    icon: Activity,
    menu: 'activities',
    page: 'Atividades',
    purpose:
      'O trabalho atribuído a cada pessoa, com prazo e prioridade, e os botões Começar agora e Concluir, que registram o tempo.',
  },
  /* Só a explicação, sem levar à tela: a rota não tem item na barra, como no
     original. Decisão pendente do usuário (protótipo, pergunta 6). */
  productivity: {
    title: 'Relatório de Produtividade',
    icon: ChartColumn,
    special: 'productivity',
    purpose:
      'Análise de desempenho e métricas de execução, por colaborador e por projeto. Não tem item na barra lateral.',
  },

  /* ---------- 7 Financeiro ---------- */
  receivables: {
    title: 'Recebíveis',
    icon: ArrowDownCircle,
    menu: 'receivables',
    page: 'AccountsReceivable',
    purpose:
      'As receitas do escritório: o que há a receber dos contratos e o que já foi recebido.',
  },
  payables: {
    title: 'Pagamentos',
    icon: ArrowUpCircle,
    menu: 'payables',
    page: 'AccountsPayable',
    purpose:
      'As despesas do escritório (na tela, Contas a Pagar): o que vence e o que já foi pago.',
  },

  /* ---------- 8 Painéis ---------- */
  dashboard_overview: {
    title: 'Visão Geral',
    icon: LayoutDashboard,
    menu: 'dashboard_overview',
    page: 'Dashboard',
    purpose: 'O resumo do escritório, com receita prevista e receita recebida.',
  },
  dashboard_executive: {
    title: 'Painel Executivo',
    icon: TrendingUp,
    menu: 'dashboard_executive',
    page: 'DashboardExecutivo',
    purpose: 'Projetos, prazos e produtividade, filtrados por período, projeto e colaborador.',
  },
  dashboard_commercial: {
    title: 'Painel Comercial',
    icon: Briefcase,
    menu: 'dashboard_commercial',
    page: 'DashboardComercial',
    purpose: 'O desempenho do funil comercial por mês e ano.',
  },

  /* ---------- 9 Administração ---------- */
  team: {
    title: 'Equipe',
    icon: UserCircle,
    menu: 'team',
    page: 'Collaborators',
    purpose: 'Cadastro da equipe: função, área e status de cada pessoa.',
  },
  permissions: {
    title: 'Permissões',
    icon: Lock,
    needsMenu: 'team',
    purpose:
      'A matriz por tela, com Ver e Editar para cada pessoa. Os perfis prontos (Comercial, Projetos, Financeiro, Diretor) preenchem tudo de uma vez.',
  },
  impersonate: {
    title: 'Acessar como',
    icon: UserCog,
    special: 'impersonate',
    purpose:
      'Só para o Diretor: entra no sistema como outra pessoa para ver o que ela vê. Cada acesso fica registrado.',
  },
  access_control: {
    title: 'Controle de Acesso',
    icon: ShieldCheck,
    menu: 'access_control',
    page: 'AprovacoesAcesso',
    purpose: 'Aprovações de Acesso: quem pediu para entrar no sistema e espera resposta.',
  },
  settings: {
    title: 'Configurações',
    icon: SlidersHorizontal,
    menu: 'settings',
    page: 'Settings',
    purpose:
      'As opções do escritório que antes só mudavam por código, como os tipos de serviço do Pipeline e as colunas do quadro.',
  },

  /* ---------- A própria Central (fora das trilhas) ---------- */
  help_center: {
    title: 'Central de ajuda',
    icon: LifeBuoy,
    always: true,
    page: 'Ajuda',
    purpose:
      'Os guias das telas que você usa, em trilhas na ordem do caminho do cliente. Marque como lido se quiser se orientar; nada aqui é obrigatório.',
  },
}

/*
  A ORDEM DAS TRILHAS É O CAMINHO DO CLIENTE, de 0 Primeiros passos a 9
  Administração. "Leads" (`/Leads`) fica fora de Captar: é a fila da landing
  page, da equipe do produto, fora do AppLayout e sem menu de escritório.
*/
export const TRAILS: Trail[] = [
  {
    n: 0,
    title: 'Primeiros passos',
    desc: 'Entrar, achar as telas e acompanhar o que é seu.',
    guides: ['first_login', 'profile', 'sidebar', 'search', 'notifications', 'my_activities'],
  },
  {
    n: 1,
    title: 'Captar',
    desc: 'Do primeiro contato à oportunidade ganha.',
    guides: ['pipeline', 'intake_form'],
  },
  { n: 2, title: 'CRM', desc: 'O cadastro de quem é cliente.', guides: ['crm'] },
  {
    n: 3,
    title: 'Orçamento e fornecedores',
    desc: 'O que orçar para o cliente, e com quem.',
    guides: ['client_budget', 'suppliers'],
  },
  { n: 4, title: 'Contratos', desc: 'Do briefing conferido ao contrato.', guides: ['contracts'] },
  {
    n: 5,
    title: 'Projetos',
    desc: 'O projeto em execução, fase a fase.',
    guides: ['projects', 'project_flow', 'map'],
  },
  {
    n: 6,
    title: 'Atividades',
    desc: 'O trabalho de cada pessoa e o tempo gasto.',
    guides: ['activities', 'productivity'],
  },
  {
    n: 7,
    title: 'Financeiro',
    desc: 'O que entra e o que sai.',
    guides: ['receivables', 'payables'],
  },
  {
    n: 8,
    title: 'Painéis',
    desc: 'Os números do escritório.',
    guides: ['dashboard_overview', 'dashboard_executive', 'dashboard_commercial'],
  },
  {
    n: 9,
    title: 'Administração',
    desc: 'Equipe, acessos e configurações.',
    guides: ['team', 'permissions', 'impersonate', 'access_control', 'settings'],
  },
]
