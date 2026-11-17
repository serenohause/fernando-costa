import { LifeBuoy } from 'lucide-react'
import type { Guide, Trail } from '../types'
import { accessControlGuide } from './access-control.ts'
import { activitiesGuide } from './activities.ts'
import { clientBudgetGuide } from './client-budget.ts'
import { contractsGuide } from './contracts.ts'
import { crmGuide } from './crm.ts'
import { dashboardCommercialGuide } from './dashboard-commercial.ts'
import { dashboardExecutiveGuide } from './dashboard-executive.ts'
import { dashboardOverviewGuide } from './dashboard-overview.ts'
import { firstLoginGuide } from './first-login.ts'
import { impersonateGuide } from './impersonate.ts'
import { intakeFormGuide } from './intake-form.ts'
import { mapGuide } from './map.ts'
import { myActivitiesGuide } from './my-activities.ts'
import { notificationsGuide } from './notifications.ts'
import { payablesGuide } from './payables.ts'
import { permissionsGuide } from './permissions.ts'
import { pipelineGuide } from './pipeline.ts'
import { productivityGuide } from './productivity.ts'
import { profileGuide } from './profile.ts'
import { projectFlowGuide } from './project-flow.ts'
import { projectsGuide } from './projects.ts'
import { receivablesGuide } from './receivables.ts'
import { searchGuide } from './search.ts'
import { settingsGuide } from './settings.ts'
import { sidebarGuide } from './sidebar.ts'
import { suppliersGuide } from './suppliers.ts'
import { teamGuide } from './team.ts'

/*
  OS GUIAS, um por tela, cada um no seu arquivo. A chave é o `menus.key` da
  tela (a mesma da matriz de permissões e de MENU_META), e só os guias sem menu
  têm chave própria (primeiros passos, Formulário de briefing, Permissões,
  Acessar como, Relatório de Produtividade, a própria Central).

  Ícones: os mesmos de MENU_META (navigation.ts) para quem tem menu.
*/
export const GUIDES: Record<string, Guide> = {
  first_login: firstLoginGuide,
  profile: profileGuide,
  sidebar: sidebarGuide,
  search: searchGuide,
  notifications: notificationsGuide,
  my_activities: myActivitiesGuide,
  pipeline: pipelineGuide,
  intake_form: intakeFormGuide,
  crm: crmGuide,
  client_budget: clientBudgetGuide,
  suppliers: suppliersGuide,
  contracts: contractsGuide,
  projects: projectsGuide,
  project_flow: projectFlowGuide,
  map: mapGuide,
  activities: activitiesGuide,
  productivity: productivityGuide,
  receivables: receivablesGuide,
  payables: payablesGuide,
  dashboard_overview: dashboardOverviewGuide,
  dashboard_executive: dashboardExecutiveGuide,
  dashboard_commercial: dashboardCommercialGuide,
  team: teamGuide,
  permissions: permissionsGuide,
  impersonate: impersonateGuide,
  access_control: accessControlGuide,
  settings: settingsGuide,

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
