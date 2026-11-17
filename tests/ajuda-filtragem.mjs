// Quem vê qual guia, na Central de ajuda, e quais passos do tour guiado do "?"
// ficam para cada pessoa.
//
// COMO RODAR
//   npm run test:ajuda
//
// POR QUE ESTE ARQUIVO EXISTE
//   A ajuda não tem regra própria de acesso: ela lê o resultado de
//   `buildNavigation` (a barra lateral) e a regra de edição de
//   `useMenuPermissions`. Se uma das duas mudar e a ajuda não acompanhar, o guia
//   ensina a usar botão que a pessoa não tem — ou esconde a tela que ela tem.
//   Os três perfis abaixo são os do protótipo aprovado (prototypes/ajuda.html):
//   Arquiteto + "Perfil Projetos", Financeiro + "Perfil Financeiro" e Diretor,
//   com as permissões tiradas de PRESETS (permissions-matrix.ts).

import { buildNavigation } from '../src/features/auth/navigation.ts'
import { PRESETS } from '../src/features/team/permissions-matrix.ts'
import {
  buildHelpAccess,
  buildTrails,
  guideAccessKind,
  guideKeyForPage,
  guideVisible,
  linkView,
  resolveTour,
  stepBlockedBy,
  tourGuideKeyForPage,
  visibleTasks,
} from '../src/features/help/access.ts'
import { GUIDES } from '../src/features/help/guides/index.ts'

/* `menus` como a migration 0004 (+ 0084 para `settings`) grava. */
const MENUS = [
  ['dashboard_overview', 'Visão Geral', 10, null],
  ['dashboard_executive', 'Painel Executivo', 20, null],
  ['dashboard_commercial', 'Painel Comercial', 30, null],
  ['crm', 'CRM', 40, null],
  ['pipeline', 'Pipeline', 50, null],
  ['contracts', 'Contratos & Propostas', 60, null],
  ['projects', 'Projetos', 70, null],
  ['map', 'Mapa de Projetos', 80, null],
  ['project_flow', 'Fluxo do Projeto', 90, null],
  ['activities', 'Atividades', 100, null],
  ['suppliers', 'Fornecedores', 110, null],
  ['client_budget', 'Orçamento por Cliente', 120, null],
  ['financial', 'Financeiro', 130, null],
  ['receivables', 'Recebíveis', 140, 'financial'],
  ['payables', 'Pagamentos', 150, 'financial'],
  ['team_group', 'Equipe', 160, null],
  ['team', 'Equipe', 170, 'team_group'],
  ['access_control', 'Controle de Acesso', 180, 'team_group'],
  ['settings', 'Configurações', 900, null],
].map(([key, label_pt, sort_order, parent_key]) => ({ key, label_pt, sort_order, parent_key }))

function acesso(role, preset) {
  const permissions = (PRESETS[preset] ?? []).map((p) => ({
    menu_key: p.menuKey,
    can_view: p.can_view,
    can_edit: p.can_edit,
  }))
  const items = buildNavigation({ menus: MENUS, permissions, role })
  return buildHelpAccess({ items, permissions, role, menus: MENUS })
}

let passed = 0
let failed = 0
function eq(name, esperado, observado) {
  const e = JSON.stringify(esperado)
  const o = JSON.stringify(observado)
  if (e === o) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}\n        esperado=${e}\n        observado=${o}`)
  }
}

const trilhas = (a) => buildTrails(a).trails.map((t) => t.n)
const guias = (a) => buildTrails(a).trails.flatMap((t) => t.visible)
const tarefas = (a, k) => visibleTasks(a, GUIDES[k]).tasks.map((t) => t.title)

/* ------------------------------------------------------------------ */
console.log('\nArquiteto + Perfil Projetos\n')
const arq = acesso('architect', 'Perfil Projetos')
eq('A1  trilhas: primeiros passos, CRM, orçamento, projetos', [0, 2, 3, 5], trilhas(arq))
eq('A2  seis trilhas ficam de fora', 6, buildTrails(arq).hiddenTrails)
eq('A3  doze guias na trilha', 12, guias(arq).length)
eq('A4  Minhas Atividades entra (função)', true, guideVisible(arq, 'my_activities'))
eq('A5  Atividades NÃO entra (hideForRoles)', false, guideVisible(arq, 'activities'))
eq('A6  Relatório de Produtividade não entra', false, guideVisible(arq, 'productivity'))
eq('A7  Pipeline não entra', false, guideVisible(arq, 'pipeline'))
eq('A8  todo guia visível na trilha é completo', buildTrails(arq).trails.flatMap((t) => t.visible), buildTrails(arq).trails.flatMap((t) => t.full))
eq('A9  etiqueta de Minhas Atividades', 'role', guideAccessKind(arq, GUIDES.my_activities))
eq('A10 etiqueta de Projetos', 'edit', guideAccessKind(arq, GUIDES.projects))
eq('A11 etiqueta do CRM', 'view', guideAccessKind(arq, GUIDES.crm))
eq('A12 etiqueta de Fornecedores', 'view', guideAccessKind(arq, GUIDES.suppliers))
eq('A13 Projetos: todas as cinco tarefas', 5, tarefas(arq, 'projects').length)
eq('A14 Projetos: nenhuma escondida', 0, visibleTasks(arq, GUIDES.projects).hidden)
eq('A15 link para Atividades fica, pelo botão', { kind: 'plain', why: 'Onde se começa e conclui a atividade. (pelo botão Ver Todas as Atividades)' },
  (({ kind, why }) => ({ kind, why }))(linkView(arq, GUIDES.my_activities.links[1])))
eq('A16 link para Fluxo do Projeto navega', 'go', linkView(arq, GUIDES.my_activities.links[0]).kind)
eq('A17 link para Contratos fora do acesso', { kind: 'off', why: 'O contrato ligado ao projeto. Fora do seu acesso.' },
  (({ kind, why }) => ({ kind, why }))(linkView(arq, GUIDES.projects.links[3])))
eq('A18 link para Notificações é só texto', 'plain', linkView(arq, GUIDES.my_activities.links[2]).kind)

/* ------------------------------------------------------------------ */
console.log('\nFinanceiro + Perfil Financeiro\n')
const fin = acesso('finance', 'Perfil Financeiro')
/* Atividades entra: `activities` é liberada por função (ROLE_ONLY_KEYS) e a
   função Financeiro não está em `hideForRoles` — está na barra dele. */
eq('F1  trilhas: primeiros passos, orçamento, contratos, atividades, financeiro, painéis', [0, 3, 4, 6, 7, 8], trilhas(fin))
eq('F2  quatro trilhas ficam de fora', 4, buildTrails(fin).hiddenTrails)
eq('F2b Atividades sem o Relatório (sem edição em Atividades)', ['activities'], buildTrails(fin).trails.find((t) => t.n === 6).visible)
eq('F3  todo guia visível na trilha é completo', buildTrails(fin).trails.flatMap((t) => t.visible), buildTrails(fin).trails.flatMap((t) => t.full))
eq('F4  Minhas Atividades não entra', false, guideVisible(fin, 'my_activities'))
eq('F5  primeiros passos sem Minhas Atividades', ['first_login', 'profile', 'sidebar', 'search', 'notifications'], buildTrails(fin).trails[0].visible)
eq('F6  Painéis: só o Executivo', ['dashboard_executive'], buildTrails(fin).trails.find((t) => t.n === 8).visible)
eq('F7  etiqueta do Painel Executivo', 'view', guideAccessKind(fin, GUIDES.dashboard_executive))
eq('F8  etiqueta de Recebíveis', 'edit', guideAccessKind(fin, GUIDES.receivables))
eq('F9  Equipe não entra (sem linha de permissão)', false, guideVisible(fin, 'team'))

/* ------------------------------------------------------------------ */
console.log('\nDiretor + Perfil Diretor\n')
const dir = acesso('director', 'Perfil Diretor')
eq('D1  as dez trilhas', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], trilhas(dir))
eq('D2  nenhuma de fora', 0, buildTrails(dir).hiddenTrails)
eq('D3  vinte e seis guias', 26, guias(dir).length)
eq('D4  Minhas Atividades não entra (onlyForRoles)', false, guideVisible(dir, 'my_activities'))
eq('D5  Acessar como entra', true, guideVisible(dir, 'impersonate'))
eq('D6  Relatório de Produtividade entra', true, guideVisible(dir, 'productivity'))
eq('D7  Configurações entra sem linha de permissão', true, guideVisible(dir, 'settings'))
eq('D8  Diretor edita tudo', 'edit', guideAccessKind(dir, GUIDES.settings))
eq('D9  Pipeline: as cinco tarefas', 5, tarefas(dir, 'pipeline').length)
eq('D10 nenhum passo com cadeado', [null, null, null],
  GUIDES.pipeline.tasks[4].steps.map((s) => stepBlockedBy(dir, s)))
eq('D11 Leads fora de qualquer trilha', false, guias(dir).includes('leads'))
eq('D12 Central fora das trilhas', false, guias(dir).includes('help_center'))

/* ------------------------------------------------------------------ */
console.log('\nSó ver (Perfil Comercial vê Projetos sem editar)\n')
const com = acesso('commercial', 'Perfil Comercial')
eq('C1  Projetos: só as tarefas sem botão escondido', ['Encontrar um projeto', 'Abrir o cliente do projeto'], tarefas(com, 'projects'))
eq('C2  três tarefas ficam de fora', 3, visibleTasks(com, GUIDES.projects).hidden)
eq('C3  etiqueta de Projetos', 'view', guideAccessKind(com, GUIDES.projects))
eq('C4  Pipeline com edição: nenhum passo com cadeado', [null, null, null],
  GUIDES.pipeline.tasks[4].steps.map((s) => stepBlockedBy(com, s)))

/* Pipeline só ver, CRM só ver: o passo de Aplicar e o de Gerar contrato
   aparecem com cadeado, e as três tarefas de edição saem. */
const soVer = buildHelpAccess({
  items: buildNavigation({
    menus: MENUS,
    permissions: [
      { menu_key: 'pipeline', can_view: true, can_edit: false },
      { menu_key: 'crm', can_view: true, can_edit: false },
    ],
    role: 'commercial',
  }),
  permissions: [
    { menu_key: 'pipeline', can_view: true, can_edit: false },
    { menu_key: 'crm', can_view: true, can_edit: false },
  ],
  role: 'commercial',
  menus: MENUS,
})
eq('C5  Pipeline só ver: duas tarefas', ['Ler o funil', 'Conferir o briefing que o cliente mandou'], tarefas(soVer, 'pipeline'))
eq('C6  passos com cadeado', [null, 'crm', 'pipeline'], GUIDES.pipeline.tasks[4].steps.map((s) => stepBlockedBy(soVer, s)))

/* ------------------------------------------------------------------ */
console.log('\nGuia da tela atual\n')
eq('P1  /Negociacoes', 'pipeline', guideKeyForPage('Negociacoes'))
eq('P2  /MinhasAtividades', 'my_activities', guideKeyForPage('MinhasAtividades'))
eq('P3  /Ajuda', 'help_center', guideKeyForPage('Ajuda'))
eq('P4  /Perfil', 'profile', guideKeyForPage('Perfil'))
eq('P5  tela sem guia', null, guideKeyForPage('ClientDetail'))

/* ------------------------------------------------------------------ */
/* TOUR GUIADO (prototypes/tour-guiado.html). `resolveTour` recebe quem está na
   tela como função, no lugar do DOM: aqui a tela é um conjunto de `data-tour`.
   Passo `edit` sai para quem só vê MESMO com o elemento na tela; passo cujo
   elemento não está na tela sai sempre. O contador conta só o que fica. */
console.log('\nTour guiado\n')
const tela = (...alvos) => {
  const set = new Set(alvos)
  return (target) => set.has(target)
}
const titulos = (r) => r.steps.map((s) => s.title)
const PROJ_EDITA = tela('projects-new', 'projects-search', 'projects-tabs', 'projects-grip', 'projects-client', 'projects-menu', 'header-help')
/* Quem só vê: Projects.tsx esconde Novo Projeto e o menu; a alça continua. */
const PROJ_SO_VE = tela('projects-search', 'projects-tabs', 'projects-grip', 'projects-client', 'header-help')

eq('T1  tela do tour pela rota', ['projects', 'pipeline', 'my_activities', null, null],
  ['Projects', 'Negociacoes', 'MinhasAtividades', 'Clients', 'Ajuda'].map(tourGuideKeyForPage))
eq('T2  todo tour termina no "?" do cabeçalho', [true, true, true],
  ['projects', 'pipeline', 'my_activities'].map((k) => {
    const r = resolveTour(dir, GUIDES[k], () => true)
    return r.steps.at(-1).target === 'header-help'
  }))
eq('T3  data-tour no formato <tela>-<peça>', true,
  Object.values(GUIDES).flatMap((g) => g.tour ?? []).every((s) => /^[a-z]+(-[a-z]+)+$/.test(s.target)))
eq('T4  data-tour sem repetição dentro do tour', [true, true, true],
  ['projects', 'pipeline', 'my_activities'].map((k) => {
    const alvos = GUIDES[k].tour.map((s) => s.target)
    return new Set(alvos).size === alvos.length
  }))

const tDir = resolveTour(dir, GUIDES.projects, PROJ_EDITA)
eq('T5  Diretor, Projetos: os sete passos', 7, tDir.steps.length)
eq('T6  Diretor, Projetos: nenhum de edição fora', 0, tDir.editOut)
eq('T7  Arquiteto (Perfil Projetos edita): os sete', 7, resolveTour(arq, GUIDES.projects, PROJ_EDITA).steps.length)

const tCom = resolveTour(com, GUIDES.projects, PROJ_SO_VE)
eq('T8  só ver, Projetos: de 7 vão a 4', ['Encontrar um projeto', 'Filtrar por status', 'Abrir o cliente', 'Ver de novo'], titulos(tCom))
eq('T9  só ver, Projetos: três de edição fora (o 1º balão avisa)', 3, tCom.editOut)
eq('T10 só ver: a alça na tela não segura o passo de arrastar', 'edit',
  tCom.all.find((s) => s.step.target === 'projects-grip').status)
eq('T11 só ver: passo de edição sai mesmo com o elemento na tela', 4,
  resolveTour(com, GUIDES.projects, PROJ_EDITA).steps.length)
eq('T12 quem edita, elemento fora da tela: pula sem contar como edição',
  { n: 6, editOut: 0, status: 'absent' },
  (() => {
    const r = resolveTour(dir, GUIDES.projects, tela('projects-search', 'projects-tabs', 'projects-grip', 'projects-client', 'projects-menu', 'header-help'))
    return { n: r.steps.length, editOut: r.editOut, status: r.all[0].status }
  })())

/* Pipeline: o aviso âmbar só existe com negociação parada. */
const PIPE = ['pipeline-new', 'pipeline-intake', 'pipeline-briefings', 'pipeline-search', 'pipeline-tabs', 'pipeline-tab-active', 'pipeline-card', 'pipeline-card-menu', 'header-help']
const tPipe = resolveTour(dir, GUIDES.pipeline, tela(...PIPE))
eq('T13 Diretor, Pipeline sem negociação parada: 9 de 10', 9, tPipe.steps.length)
eq('T14 o passo do aviso âmbar pulou por ausência', 'absent',
  tPipe.all.find((s) => s.step.target === 'pipeline-stalled').status)
const tPipeVe = resolveTour(soVer, GUIDES.pipeline, tela(...PIPE.filter((t) => t !== 'pipeline-new' && t !== 'pipeline-card-menu')))
eq('T15 Pipeline só ver: o que fica', ['Briefing a conferir', 'Briefings recebidos', 'Buscar', 'Funil e listas', 'Ver de novo'], titulos(tPipeVe))
eq('T16 Pipeline só ver: quatro de edição fora', 4, tPipeVe.editOut)

/* Minhas Atividades é liberada pela função: o tour é igual para todos. */
const MINHAS = ['my-late', 'my-stats', 'my-all', 'my-project', 'my-late-row', 'header-help']
eq('T17 Minhas Atividades: seis passos, nada de edição', { n: 6, editOut: 0 },
  (({ steps, editOut }) => ({ n: steps.length, editOut }))(resolveTour(arq, GUIDES.my_activities, tela(...MINHAS))))
eq('T18 sem atraso, faixa e linha rosada pulam', ['Seus números', 'Começar e concluir', 'Seus projetos', 'Ver de novo'],
  titulos(resolveTour(arq, GUIDES.my_activities, tela('my-stats', 'my-all', 'my-project', 'header-help'))))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
