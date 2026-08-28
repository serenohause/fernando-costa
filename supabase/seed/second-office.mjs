// Segundo escritorio de teste — Atelie Mirante Arquitetura (Florianopolis/SC).
//
// POR QUE ISTO EXISTE
//   Os seeds 01 a 09 povoam UM escritorio. Com um so, multitenancy e uma
//   afirmacao: toda linha tem tenant_id, toda policy filtra por ele, e nada
//   disso e visivel — a tela mostra o mesmo com ou sem isolamento. Com dois
//   escritorios lado a lado, o isolamento passa a ser observavel: entra-se com
//   a Diretora de um, ve-se o nome dele no topo, e nao aparece nenhuma linha do
//   outro.
//
//   Este NAO e uma copia do primeiro com nomes trocados. Outro estado, outro
//   porte, outra praca: Florianopolis em vez de Goiania, litoral em vez de
//   cerrado, seis pessoas em vez de nove, e volume de negocio menor de
//   proposito. A cobertura de caso de borda (nome longo, documento nulo, item
//   cancelado, PDF sem objeto) ja e trabalho do primeiro escritorio e nao se
//   repete aqui — o que este seed cobre e "existem dois, e um nao ve o outro".
//
// COMO RODAR
//   npm run seed:second-office
//
//   Independente dos nove seeds do primeiro escritorio: cria tenant, equipe,
//   permissoes e dado de negocio dos nove modulos de uma vez. Rodar de novo
//   apaga este escritorio inteiro e recria do zero.
//
// SEGURANCA
//   - Escreve SOMENTE no tenant de slug SLUG. Aborta se existir no banco
//     qualquer tenant fora da lista de escritorios de teste — lista e trava em
//     supabase/seed/tenants.mjs, compartilhadas com os nove seeds.
//   - E-MAIL E GLOBAL NO AUTH DO SUPABASE. Os logins daqui usam outro dominio
//     (mirante-teste.com.br) e outros enderecos que os do primeiro escritorio,
//     senao o segundo createUser colide com o primeiro.
//   - As senhas sao sorteadas a cada execucao e gravadas em
//     supabase/seed/credenciais-mirante.local (ignorado pelo git por *.local).
//   - Estas contas sao de desenvolvimento. Precisam ser apagadas antes de o
//     sistema receber dado de producao.
//
// A CONFERENCIA DO FIM
//   Nada atravessa a fronteira. Ao terminar, o seed le de volta TODA linha que
//   gravou e aborta se alguma tiver tenant_id diferente do deste escritorio; e
//   compara a contagem de linhas dos OUTROS tenants antes e depois, abortando
//   se qualquer uma tiver mudado. Um seed que escreve com a service role key
//   ignora RLS: a fronteira aqui e conferida, nao presumida.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { TEST_TENANTS, assertOnlyTestTenants } from './tenants.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')

const SLUG = 'atelie-mirante-teste'
const { name: TENANT_NAME, emailDomain: EMAIL_DOMAIN } = TEST_TENANTS[SLUG]

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      /* O .env do ambiente ATIVO vence o shell — ver npm run env:prod|env:dev.
         O contrario deixava um SUPABASE_ACCESS_TOKEN exportado numa sessao
         antiga sobreviver a troca de ambiente, autenticando numa conta enquanto
         o resto apontava para o projeto da outra. */
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env opcional quando as variaveis vem do ambiente */
  }
  return env
}

const env = loadEnv()
const URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.')
  process.exit(1)
}

const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

function newPassword() {
  return `Mi${randomBytes(9).toString('base64url')}!3`
}

const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const hoursAgo = (n) => new Date(Date.now() - n * 3600000).toISOString()
const monthStart = (n) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}
const brl = (v) =>
  Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/*
  Uma linha por vez, sempre.

  Insert em lote pelo PostgREST monta UMA lista de colunas a partir da uniao das
  chaves de todas as linhas, e a linha que omite uma chave recebe NULL EXPLICITO
  em vez do default da coluna. Isso ja mordeu os seeds 3, 4 e 5. Aqui derrubaria
  os defaults de status, priority e visible_in_list, que varias linhas omitem de
  proposito.

  De quebra, cada id gravado entra no REGISTRO, que e o que a conferencia do fim
  le de volta para provar que nenhuma linha caiu no tenant errado.
*/
const written = new Map()

async function insertOne(table, row, select) {
  const clean = {}
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v
  const { data, error } = await db.from(table).insert(clean).select(select).single()
  if (error) fail(`inserir em ${table}: ${error.message}`)
  if (!written.has(table)) written.set(table, [])
  written.get(table).push(data.id)
  return data
}

// ── A equipe ────────────────────────────────────────────────────────────────
//
// Seis pessoas, uma por funcao do sistema, todas com login: o proposito deste
// escritorio e poder entrar como cada papel e ver o recorte de menu dele. Os
// casos de borda de pessoa (ferias, afastado, cadastrado sem primeiro acesso)
// ficam no primeiro escritorio, que existe para isso.
//
// Nomes de origem acoriana e alema, que e o que se ve na lista telefonica de
// Florianopolis — dado generico do tipo "Colaborador 1" esconde bug de
// ordenacao, de acento e de nome longo.
const TEAM = [
  {
    key: 'diretoria',
    name: 'Otávio Schmitt Nunes',
    role: 'director',
    area: 'commercial',
    weekly_hours: 44,
  },
  {
    key: 'coordenacao',
    name: 'Bruna Kowalski',
    role: 'coordinator',
    area: 'projects',
    weekly_hours: 44,
    coordinatorOf: 'diretoria',
  },
  {
    key: 'administrativo',
    name: 'Vinícius Duarte Espíndola',
    role: 'admin_staff',
    area: 'administrative',
    weekly_hours: 40,
  },
  {
    key: 'financeiro',
    name: 'Sabrina Locks',
    role: 'finance',
    area: 'finance',
    weekly_hours: 40,
  },
  {
    key: 'arquitetura',
    name: 'Letícia Amorim da Rosa',
    role: 'architect',
    area: 'projects',
    weekly_hours: 40,
    coordinatorOf: 'coordenacao',
  },
  {
    key: 'estagio',
    name: 'Caio Berthier',
    role: 'intern',
    area: 'projects',
    weekly_hours: 30,
    coordinatorOf: 'coordenacao',
  },
]

// Quais menus cada funcao enxerga neste escritorio. Mesmo recorte por funcao do
// primeiro escritorio (Layout.jsx do original, agora como dado): quem coordena
// nao ve financeiro, quem cuida do financeiro nao ve funil, e Arquiteto e
// Estagiario nao recebem menu nenhum — o original os manda direto para "Minhas
// Atividades", que e liberada por funcao e nunca por permissao.
const PERMISSIONS_BY_ROLE = {
  director: { view: 'all', edit: 'all' },
  coordinator: {
    view: ['dashboard_executive', 'crm', 'pipeline', 'projects', 'map', 'project_flow', 'activities', 'client_budget', 'suppliers'],
    edit: ['projects', 'project_flow', 'activities'],
  },
  finance: {
    view: ['dashboard_executive', 'receivables', 'payables', 'contracts', 'projects'],
    edit: ['receivables', 'payables'],
  },
  admin_staff: {
    view: ['dashboard_overview', 'crm', 'pipeline', 'contracts', 'projects', 'project_flow', 'activities', 'suppliers', 'client_budget', 'team'],
    edit: ['crm', 'pipeline', 'contracts', 'suppliers'],
  },
  architect: { view: [], edit: [] },
  intern: { view: [], edit: [] },
}

// ── Clientes ────────────────────────────────────────────────────────────────
// Cinco, e a carteira e outra: casa de praia, retrofit de apartamento no centro,
// pousada e uma incorporadora pequena. Enderecos reais de Florianopolis e da
// costa catarinense.
const CLIENTS = [
  {
    key: 'iracema',
    name: 'Iracema Duarte Búrigo',
    phone: '(48) 99614-2280',
    email: 'iracema.burigo@gmail.com',
    client_type: 'individual',
    lead_source: 'instagram',
    tax_id: '804.517.239-06',
    birth_date: '1979-07-24',
    address_zipcode: '88015-200',
    address_street: 'Rua Bocaiúva',
    address_number: '1420',
    address_complement: 'Apto 902',
    address_district: 'Centro',
    address_city: 'Florianópolis',
    address_state: 'SC',
    site_zipcode: '88061-500',
    site_street: 'Servidão dos Pescadores',
    site_number: 'Lote 22',
    site_district: 'Praia da Barra da Lagoa',
    site_city: 'Florianópolis',
    site_state: 'SC',
    notes: 'Casa de praia com restrição de gabarito da APA da Lagoa. Aprovação passa pelo IPUF.',
  },
  {
    key: 'heitor',
    name: 'Heitor Grams Wagner',
    phone: '(48) 98803-7712',
    email: 'heitor.wagner@outlook.com',
    client_type: 'individual',
    lead_source: 'referral',
    tax_id: '61930845027',
    address_zipcode: '88034-100',
    address_street: 'Rua Lauro Linhares',
    address_number: '589',
    address_district: 'Trindade',
    address_city: 'Florianópolis',
    address_state: 'SC',
    notes: 'Indicação da Iracema. Retrofit de apartamento dos anos 80, sem obra nova.',
  },
  {
    key: 'costao',
    name: 'Pousada Costão de Fora Ltda',
    phone: '(48) 3369-4415',
    email: 'reservas@costaodefora.com.br',
    client_type: 'company',
    lead_source: 'website',
    tax_id: '27.884.106/0001-59',
    address_zipcode: '88056-000',
    address_street: 'Rodovia Tertuliano Brito Xavier',
    address_number: '2100',
    address_district: 'Canasvieiras',
    address_city: 'Florianópolis',
    address_state: 'SC',
    site_district: 'Praia do Rosa',
    site_city: 'Imbituba',
    site_state: 'SC',
    notes: 'Ampliação de seis chalés. Obra só pode acontecer fora da temporada.',
  },
  {
    key: 'monsenhor',
    name: 'Incorporadora Monsenhor Sul S/A',
    phone: '(47) 3204-8890',
    email: 'projetos@monsenhorsul.com.br',
    client_type: 'company',
    lead_source: 'referral',
    tax_id: '33.045.712/0001-04',
    address_city: 'Balneário Camboriú',
    address_state: 'SC',
    site_city: 'Itapema',
    site_state: 'SC',
    notes: 'Edifício de quatro pavimentos. Decisão passa pelo conselho, prazo escorrega.',
  },
  {
    key: 'nayara',
    name: 'Nayara Philippi',
    phone: '(48) 99271-3345',
    client_type: 'individual',
    lead_source: 'other',
    address_city: 'São José',
    address_state: 'SC',
    notes: 'Contato de feira do setor. Só telefone anotado, sem documento nem e-mail.',
  },
]

// ── Negociacoes ─────────────────────────────────────────────────────────────
const NEGOTIATIONS = [
  {
    key: 'barra',
    name: 'Casa Barra da Lagoa — Iracema',
    client: 'iracema',
    owner: 'diretoria',
    funnel_stage: 'closing',
    status: 'won',
    estimated_value: 156000,
    close_probability: 100,
    origin: 'instagram',
    closed_at: dayOffset(-82),
    services: ['architecture', 'interiors'],
  },
  {
    key: 'chales',
    name: 'Ampliação de chalés — Costão de Fora',
    client: 'costao',
    owner: 'coordenacao',
    funnel_stage: 'closing',
    status: 'won',
    estimated_value: 224000,
    close_probability: 100,
    origin: 'website',
    closed_at: dayOffset(-40),
    services: ['architecture', 'structural', 'electrical'],
  },
  {
    key: 'retrofit',
    name: 'Retrofit Trindade — Heitor Wagner',
    client: 'heitor',
    owner: 'administrativo',
    funnel_stage: 'proposal_sent',
    status: 'active',
    estimated_value: 48000,
    close_probability: 55,
    origin: 'referral',
    referrer_name: 'Iracema Duarte Búrigo',
    expected_close_date: dayOffset(18),
    services: ['interiors'],
  },
  {
    key: 'itapema',
    name: 'Edifício Itapema — Monsenhor Sul',
    client: 'monsenhor',
    owner: 'diretoria',
    funnel_stage: 'qualified',
    status: 'active',
    estimated_value: 390000,
    close_probability: 30,
    origin: 'referral',
    expected_close_date: dayOffset(65),
    services: ['architecture', 'structural', 'plumbing', 'electrical'],
  },
]

// ── Contratos ───────────────────────────────────────────────────────────────
// Tres, com numeracao propria do escritorio (MIR-). O snapshot do cliente e
// congelado na assinatura, como manda a migration 0029.
const CONTRACTS = [
  {
    key: 'barra',
    client: 'iracema',
    negotiation: 'barra',
    contract_number: 'MIR-2026-007',
    contract_type: 'architecture_interiors',
    total_value: 156000,
    billing_type: 'monthly_installments',
    status: 'in_progress',
    signature_date: dayOffset(-80),
    start_date: dayOffset(-75),
    project_name: 'Casa Barra da Lagoa',
    origin: 'instagram',
    installment_count: 6,
    first_due_date: dayOffset(-70),
    installment_frequency: 'monthly',
    installments_generated: true,
    layout_study_days: 18,
    renderings_days: 22,
    legal_permit_days: 50,
    display_order: 1,
    notes: 'Gabarito limitado pela APA da Lagoa. Projeto legal entra no IPUF antes da prefeitura.',
  },
  {
    key: 'chales',
    client: 'costao',
    negotiation: 'chales',
    contract_number: 'MIR-2025-031',
    contract_type: 'architecture_engineering',
    total_value: 224000,
    billing_type: 'by_phase',
    status: 'in_progress',
    signature_date: dayOffset(-40),
    start_date: dayOffset(-35),
    project_name: 'Ampliação de chalés — Praia do Rosa',
    origin: 'website',
    installment_count: 4,
    first_due_date: dayOffset(-40),
    installment_frequency: 'monthly',
    installments_generated: true,
    layout_study_days: 25,
    renderings_days: 20,
    construction_docs_days: 55,
    engineering_docs_days: 45,
    display_order: 2,
  },
  {
    // A vista: os tres campos de parcelamento nulos, como o check da 0029 exige.
    key: 'retrofit',
    client: 'heitor',
    negotiation: 'retrofit',
    contract_number: 'MIR-2026-008',
    contract_type: 'architecture_interiors',
    total_value: 48000,
    billing_type: 'upfront',
    status: 'negotiating',
    project_name: 'Retrofit Trindade',
    origin: 'referral',
    referrer_name: 'Iracema Duarte Búrigo',
    display_order: 3,
    notes: 'Aguardando o cliente fechar a compra do apartamento vizinho antes de assinar.',
  },
]

// ── Projetos e tarefas ──────────────────────────────────────────────────────
const PROJECTS = [
  {
    key: 'barra',
    name: 'Casa Barra da Lagoa',
    project_type: 'architecture_interiors',
    client: 'iracema',
    contract: 'MIR-2026-007',
    location: 'Barra da Lagoa, Florianópolis',
    city: 'Florianópolis',
    state: 'SC',
    site_address_text: 'Servidão dos Pescadores, Lote 22, Barra da Lagoa, Florianópolis - SC',
    commercial: 'diretoria',
    operational: 'arquitetura',
    start_date: dayOffset(-75),
    status: 'in_development',
    current_phase: 'legal_permit',
    total_value: 156000,
    land_area_m2: 620,
    project_area_m2: 240,
    layout_study_days: 18,
    renderings_days: 22,
    display_order: 1,
    land_types: ['Loteamento aberto'],
    purposes: ['Moradia', 'Lazer'],
    tasks: [
      { title: 'Levantamento topográfico do lote', phase: 'briefing', status: 'completed', priority: 'high', who: 'arquitetura', days: -10, hours: [10, 12] },
      { title: 'Estudo de implantação com recuo da APA', phase: 'layout', status: 'completed', priority: 'high', who: 'arquitetura', days: -4, hours: [28, 31] },
      { title: 'Perspectivas da fachada leste', phase: 'renderings', status: 'in_progress', priority: 'medium', who: 'estagio', days: 12, hours: [24, 9] },
      { title: 'Projeto legal para o IPUF', phase: 'legal_permit', status: 'not_started', priority: 'high', who: 'coordenacao', days: 40, hours: [36, 0] },
    ],
  },
  {
    key: 'chales',
    name: 'Ampliação de chalés — Praia do Rosa',
    project_type: 'architecture_engineering',
    client: 'costao',
    contract: 'MIR-2025-031',
    location: 'Praia do Rosa, Imbituba',
    city: 'Imbituba',
    state: 'SC',
    site_address_text: 'Estrada Geral da Praia do Rosa, s/n, Imbituba - SC',
    commercial: 'coordenacao',
    operational: 'coordenacao',
    start_date: dayOffset(-35),
    status: 'in_approval',
    current_phase: 'construction_docs',
    total_value: 224000,
    land_area_m2: 3400,
    project_area_m2: 780,
    display_order: 2,
    land_types: ['Área rural'],
    purposes: ['Comercial', 'Hoteleiro'],
    tasks: [
      { title: 'Briefing com a sociedade da pousada', phase: 'briefing', status: 'completed', priority: 'high', who: 'coordenacao', days: -32, hours: [8, 7] },
      { title: 'Projeto executivo dos seis chalés', phase: 'construction_docs', status: 'in_progress', priority: 'high', who: 'coordenacao', days: 25, hours: [90, 34] },
      { title: 'Complementares — estrutura em madeira', phase: 'engineering_docs', status: 'not_started', priority: 'medium', who: 'arquitetura', days: 50, hours: [50, 0] },
    ],
  },
  {
    // Sem tarefa nenhuma: prospeccao que ainda nao virou contrato.
    key: 'itapema',
    name: 'Edifício Itapema — Monsenhor Sul',
    project_type: 'architecture',
    client: 'monsenhor',
    contract: null,
    location: 'Itapema, SC',
    city: 'Itapema',
    state: 'SC',
    commercial: 'diretoria',
    status: 'prospecting',
    current_phase: 'not_started',
    total_value: 390000,
    display_order: 3,
    notes: 'Aguardando o conselho da incorporadora aprovar o estudo de viabilidade.',
    land_types: ['Loteamento aberto'],
    purposes: ['Investimento'],
    tasks: [],
  },
]

// ── Atividades ──────────────────────────────────────────────────────────────
// A fila de cada pessoa e contigua a partir de 1 (a tela "Minhas Atividades"
// arrasta dentro dela); concluida sai da fila, com execution_order nulo.
const ACTIVITIES = [
  {
    description: 'Detalhar o deck de madeira da varanda',
    who: 'arquitetura',
    coordinator: 'coordenacao',
    project: 'barra',
    status: 'in_progress',
    priority: 'high',
    execution_order: 1,
    start_date: dayOffset(-1),
    end_date: dayOffset(4),
    started_at: hoursAgo(6),
    notes: 'Conferir a especificação de cumaru com o fornecedor antes de fechar a seção.',
  },
  {
    description: 'Revisar o memorial de acabamentos com a cliente',
    who: 'arquitetura',
    coordinator: 'coordenacao',
    project: 'barra',
    status: 'not_started',
    priority: 'medium',
    execution_order: 2,
    start_date: dayOffset(4),
    end_date: dayOffset(9),
  },
  // Atrasada: prazo no passado e ainda nao iniciada.
  {
    description: 'Protocolar consulta de viabilidade no IPUF',
    who: 'coordenacao',
    project: 'barra',
    status: 'not_started',
    priority: 'urgent',
    execution_order: 1,
    start_date: dayOffset(-12),
    end_date: dayOffset(-4),
    notes: 'Cliente cobrou na reunião de terça.',
  },
  {
    description: 'Compatibilizar estrutura de madeira dos chalés',
    who: 'coordenacao',
    project: 'chales',
    status: 'in_progress',
    priority: 'high',
    execution_order: 2,
    start_date: dayOffset(-3),
    end_date: dayOffset(6),
    started_at: hoursAgo(9),
  },
  // Concluida no prazo, com tempo real: sem uma assim a taxa de atraso da 100%.
  {
    description: 'Montar caderno de referências da pousada',
    who: 'estagio',
    coordinator: 'coordenacao',
    project: 'chales',
    status: 'completed',
    priority: 'medium',
    start_date: dayOffset(-8),
    end_date: dayOffset(1),
    started_at: hoursAgo(54),
    completed_at: hoursAgo(49),
    started_by: 'estagio',
    completed_by: 'estagio',
  },
]

// ── Financeiro ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Honorários de projeto', type: 'revenue', cost_center: 'architecture' },
  { name: 'Projetos de interiores', type: 'revenue', cost_center: 'interiors' },
  { name: 'Folha e encargos', type: 'expense', cost_center: 'administrative' },
  { name: 'Terceirizados de projeto', type: 'expense', cost_center: 'architecture' },
]

const PAYABLES = [
  {
    supplier_name: 'Autodesk',
    description: 'Assinatura AutoCAD + Revit (2 licenças)',
    category: 'software',
    value: 1560,
    due_date: monthStart(0),
    status: 'forecast',
    competence_month: monthStart(0),
  },
  {
    supplier_name: 'Calculista Ivo Reitz',
    description: 'Cálculo estrutural em madeira — chalés',
    category: 'contractors',
    value: 9400,
    due_date: dayOffset(-6),
    status: 'forecast',
    competence_month: monthStart(0),
    project: 'chales',
  },
  {
    supplier_name: 'Prefeitura de Florianópolis',
    description: 'Taxa de consulta de viabilidade',
    category: 'taxes',
    value: 412.7,
    due_date: dayOffset(9),
    status: 'forecast',
    competence_month: monthStart(0),
    project: 'barra',
  },
  {
    supplier_name: 'Contabilidade Ilha',
    description: 'Honorários contábeis do mês',
    category: 'office',
    value: 980,
    due_date: dayOffset(-2),
    status: 'paid',
    payment_date: dayOffset(-2),
    payment_method: 'pix',
    competence_month: monthStart(0),
  },
]

// ── Fornecedores ────────────────────────────────────────────────────────────
// Praca catarinense: madeira, esquadria de alta performance para maresia,
// pedra e iluminacao. Nenhum e o mesmo do primeiro escritorio.
const SUPPLIERS = [
  {
    key: 'madeireira',
    name: 'Madeireira Ilha Sul',
    category: 'wood',
    contact_whatsapp: '(48) 99118-4420',
    contact_name: 'Rogério Manske',
    contact_email: 'comercial@ilhasulmadeiras.com.br',
    city: 'São José',
    state: 'SC',
    partnership_tier: 'strategic',
    partnership_model: 'commission_and_discount',
    commission_percent: 6,
    commission_payment_term: 'after_client_payment',
    standard_discount_percent: 12,
    has_showroom: true,
    status: 'active',
    notes: 'Cumaru e garapeira com certificação. Prazo bom fora da temporada.',
    brands: ['Ilha Sul Decks', 'Timber SC'],
  },
  {
    key: 'esquadrias',
    name: 'Esquadrias Maresia Engenharia',
    category: 'frames_openings',
    contact_whatsapp: '(48) 98442-0071',
    contact_name: 'Daniela Espezim',
    city: 'Florianópolis',
    state: 'SC',
    partnership_tier: 'preferred',
    partnership_model: 'sales_commission',
    commission_percent: 4.5,
    commission_payment_term: 'net_30_after_delivery',
    has_showroom: true,
    status: 'active',
    notes: 'Perfis com vedação para orla. Único da praça que atende a Praia do Rosa.',
    brands: ['Alcoa', 'Sasazaki'],
  },
  {
    key: 'pedras',
    name: 'Marmoraria Ponta das Canas',
    category: 'natural_stone',
    contact_whatsapp: '(48) 99630-8827',
    city: 'Florianópolis',
    state: 'SC',
    partnership_tier: 'registered',
    partnership_model: 'price_discount',
    standard_discount_percent: 8,
    status: 'active',
    brands: ['Quartzo Nacional'],
  },
  {
    key: 'iluminacao',
    name: 'Luz do Sul Iluminação',
    category: 'indoor_lighting',
    contact_whatsapp: '(47) 99205-1163',
    contact_name: 'Fábio Kretzer',
    city: 'Balneário Camboriú',
    state: 'SC',
    partnership_tier: 'under_evaluation',
    partnership_model: 'none',
    status: 'negotiating',
    notes: 'Em avaliação. Ainda não atendeu nenhum projeto do escritório.',
    brands: [],
  },
]

// ── Checklists de orcamento ─────────────────────────────────────────────────
const CHECKLISTS = [
  {
    key: 'barra',
    client: 'iracema',
    project: 'barra',
    responsible: 'arquitetura',
    status: 'in_progress',
    project_phase: 'construction_docs',
    start_date: dayOffset(-10),
    curation_percent: 8,
    notes: 'Prioridade nos itens de fachada: prazo de esquadria na temporada é o gargalo.',
    items: [
      {
        name: 'Deck de cumaru da varanda (48 m²)',
        category: 'wood',
        status: 'approved',
        priority: 'high',
        estimated_value: 21600,
        approved_value: 19800,
        chosen: 'madeireira',
        commission_percent: 6,
        commission_received: false,
        client_approved: true,
        approval_date: dayOffset(-4),
        due_date: dayOffset(6),
        quotes: [
          { supplier: 'madeireira', value: 19800, notes: 'Com instalação e tratamento.' },
        ],
      },
      {
        name: 'Esquadrias de alumínio com vedação para orla',
        category: 'frames_openings',
        status: 'quoted',
        priority: 'high',
        estimated_value: 74000,
        chosen: 'esquadrias',
        commission_percent: 4.5,
        due_date: dayOffset(14),
        quotes: [{ supplier: 'esquadrias', value: 71500, notes: 'Prazo de 45 dias fora da temporada.' }],
      },
      {
        name: 'Bancada de quartzo da cozinha',
        category: 'natural_stone',
        status: 'quoting',
        priority: 'medium',
        estimated_value: 9200,
        due_date: dayOffset(20),
        quotes: [{ supplier: 'pedras', value: 8700, notes: 'Sem instalação inclusa.' }],
      },
      {
        name: 'Iluminação embutida das áreas sociais',
        category: 'indoor_lighting',
        status: 'pending',
        priority: 'low',
        estimated_value: 6400,
        is_required: false,
        due_date: dayOffset(35),
        quotes: [],
      },
    ],
  },
  {
    key: 'chales',
    client: 'costao',
    project: 'chales',
    responsible: 'coordenacao',
    status: 'open',
    project_phase: 'renderings',
    start_date: dayOffset(-5),
    items: [
      {
        name: 'Estrutura em madeira laminada dos chalés',
        category: 'wood',
        status: 'quoting',
        priority: 'high',
        estimated_value: 128000,
        due_date: dayOffset(28),
        quotes: [{ supplier: 'madeireira', value: 124000, notes: 'Entrega parcelada em duas etapas.' }],
      },
      {
        name: 'Impermeabilização das varandas',
        // Categoria que fornecedor nenhum pode ter (check da 0049): so vale
        // para item de orcamento, e por isso nasce sem fornecedor escolhido.
        category: 'waterproofing',
        status: 'pending',
        priority: 'medium',
        estimated_value: 15400,
        due_date: dayOffset(45),
        quotes: [],
      },
    ],
  },
]

// ── Propriedades do mapa ────────────────────────────────────────────────────
// Coordenadas reais da costa catarinense — o mapa do primeiro escritorio esta
// todo em Goias, e o segundo precisa cair em outro pedaco do Brasil para que a
// troca de escritorio seja visivel no enquadramento do mapa.
const PROPERTIES = [
  {
    key: 'barra',
    lat: -27.57384,
    lng: -48.42711,
    project: 'barra',
    client: 'iracema',
    address: 'Servidão dos Pescadores, 22, Barra da Lagoa\nFlorianópolis – Santa Catarina, Brasil',
    city: 'Florianópolis',
    state: 'Santa Catarina',
    land_area_m2: 620,
    project_area_m2: 240,
    land_types: ['Loteamento aberto'],
    purposes: ['Moradia', 'Lazer'],
  },
  {
    key: 'rosa',
    lat: -28.13092,
    lng: -48.65418,
    project: 'chales',
    client: 'costao',
    address: 'Estrada Geral da Praia do Rosa, s/n\nImbituba – Santa Catarina, Brasil',
    city: 'Imbituba',
    state: 'Santa Catarina',
    land_area_m2: 3400,
    project_area_m2: 780,
    land_types: ['Área rural'],
    purposes: ['Comercial', 'Hoteleiro'],
  },
  {
    key: 'itapema',
    lat: -27.09051,
    lng: -48.61227,
    project: 'itapema',
    client: 'monsenhor',
    address: 'Avenida Nereu Ramos, quadra 4, Meia Praia\nItapema – Santa Catarina, Brasil',
    city: 'Itapema',
    state: 'Santa Catarina',
    land_area_m2: 900,
    land_types: ['Loteamento aberto'],
    purposes: ['Investimento'],
  },
  {
    // Pino sem projeto: rotulo livre nos dois lados, que e a ALTERNATIVA ao
    // vinculo (o check da 0057 recusa os dois lados do mesmo par preenchidos).
    key: 'prospeccao',
    lat: -27.6386,
    lng: -48.67932,
    project_label: 'Terreno em prospecção — Ribeirão da Ilha',
    client_label: 'Contato do Ribeirão (sem cadastro)',
    address: 'Rodovia Baldicero Filomeno, Ribeirão da Ilha\nFlorianópolis – Santa Catarina, Brasil',
    city: 'Florianópolis',
    state: 'Santa Catarina',
    visual_status: 'not_started',
    land_types: ['Loteamento aberto'],
    purposes: ['Investimento'],
  },
]

// ── Geolocalizacao da obra (projects.site_*) ────────────────────────────────
const SITE_GEOCODES = [
  {
    project: 'barra',
    site_lat: -27.57402,
    site_lng: -48.42688,
    site_geocode_status: 'ok',
    site_geocode_updated_at: hoursAgo(30),
    site_place_id: 'seed-mirante-barra-da-lagoa',
  },
  {
    project: 'chales',
    site_geocode_status: 'failed',
    site_geocode_updated_at: hoursAgo(26),
  },
]

async function main() {
  console.log(`\nSeed do segundo escritório de teste — ${URL}\n`)

  // 1. Trava de segurança ------------------------------------------------------
  // Aborta se houver no banco tenant fora da lista de escritórios de teste. A
  // lista, e o que acontece quando o escritório real nascer, estão em
  // supabase/seed/tenants.mjs.
  const allTenants = await assertOnlyTestTenants(db)

  /*
    2. Fotografia dos OUTROS escritórios, para a conferência do fim.

    Contagem de linhas por tabela de cada tenant que não é este. Se qualquer
    número mudar até o fim da execução, alguma linha deste seed caiu do outro
    lado da fronteira — e é melhor descobrir aqui do que numa tela que mostra o
    cliente do vizinho.
  */
  const others = allTenants.filter((t) => t.slug !== SLUG)
  const before = await countByTenant(others)

  // 3. Limpeza — incondicional, de propósito -----------------------------------
  //
  // Não `if (previous)`. Uma rodada que morre no meio deixa o banco num estado
  // que uma checagem condicional lê como "vazio", e a rodada seguinte grava
  // duplicado ou esbarra no unique. Seed tem que ser re-executável a partir de
  // qualquer meio-caminho.
  //
  // O tenant cascateia tudo que tem tenant_id. Os usuários de auth.users não
  // cascateiam: saem um a um, e por isso são lidos ANTES do delete.
  const previous = allTenants.find((t) => t.slug === SLUG)
  const { data: oldUsers } = previous
    ? await db.from('collaborators').select('user_id').eq('tenant_id', previous.id).not('user_id', 'is', null)
    : { data: [] }

  if (previous) {
    console.log('  Limpando execução anterior...')
    const { error } = await db.from('tenants').delete().eq('id', previous.id)
    if (error) fail(`apagar o escritório anterior: ${error.message}`)
  }
  for (const row of oldUsers ?? []) {
    await db.auth.admin.deleteUser(row.user_id)
  }

  /*
    Usuário de auth órfão de rodada antiga.

    O delete acima só alcança quem ainda tinha colaborador. Uma rodada que morreu
    entre createUser e o insert do colaborador deixa o e-mail ocupado no Auth, e
    o createUser desta rodada falharia com "already registered" — sem nada no
    banco explicando por quê. Varre por e-mail do domínio deste escritório.
  */
  const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  for (const user of authList?.users ?? []) {
    if (user.email?.endsWith(`@${EMAIL_DOMAIN}`)) {
      await db.auth.admin.deleteUser(user.id)
    }
  }

  // 4. Escritório --------------------------------------------------------------
  const tenant = await insertOne('tenants', { name: TENANT_NAME, slug: SLUG }, 'id, name, slug')
  console.log(`  Escritório criado: ${tenant.name} (${tenant.slug})`)

  await insertOne('tenant_email_domains', { tenant_id: tenant.id, domain: EMAIL_DOMAIN }, 'id')

  // 5. Equipe, logins e vínculos ----------------------------------------------
  const credentials = []
  const person = {}

  for (const p of TEAM) {
    const email = `${p.key}@${EMAIL_DOMAIN}`
    const password = newPassword()

    const { data: created, error: userError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.name },
    })
    if (userError) fail(`criar usuário ${email}: ${userError.message}`)
    credentials.push({ name: p.name, role: p.role, email, password })

    person[p.key] = await insertOne(
      'collaborators',
      {
        tenant_id: tenant.id,
        user_id: created.user.id,
        name: p.name,
        role: p.role,
        area: p.area,
        email,
        status: 'active',
        weekly_hours: p.weekly_hours,
      },
      'id, name, role',
    )

    const { error: linkError } = await db.from('tenant_users').insert({
      tenant_id: tenant.id,
      user_id: created.user.id,
      role: p.role === 'director' ? 'owner' : 'member',
    })
    if (linkError) fail(`vincular ${p.name} ao escritório: ${linkError.message}`)
  }

  // Coordenação só depois de todos existirem: a FK é auto-referente.
  for (const p of TEAM) {
    if (!p.coordinatorOf) continue
    const { error } = await db
      .from('collaborators')
      .update({ coordinator_id: person[p.coordinatorOf].id })
      .eq('id', person[p.key].id)
      .eq('tenant_id', tenant.id)
    if (error) fail(`definir coordenador de ${p.name}: ${error.message}`)
  }
  console.log(`  ${TEAM.length} colaboradores criados, todos com login`)

  // 6. Permissões --------------------------------------------------------------
  const { data: menus, error: menusError } = await db.from('menus').select('key, parent_key')
  if (menusError) fail(`ler menus: ${menusError.message}`)

  const groupKeys = new Set(menus.map((m) => m.parent_key).filter(Boolean))
  const leafKeys = menus.filter((m) => !groupKeys.has(m.key)).map((m) => m.key)

  const permissionRows = []
  for (const p of TEAM) {
    const rule = PERMISSIONS_BY_ROLE[p.role]
    for (const key of leafKeys) {
      const canView = rule.view === 'all' || rule.view.includes(key)
      const canEdit = rule.edit === 'all' || rule.edit.includes(key)
      permissionRows.push({
        tenant_id: tenant.id,
        collaborator_id: person[p.key].id,
        menu_key: key,
        can_view: canView,
        // O banco recusa can_edit sem can_view.
        can_edit: canEdit && canView,
      })
    }
  }
  // Lote, e não uma linha por vez: todas as linhas têm exatamente as mesmas
  // chaves, então não há coluna omitida para o PostgREST transformar em NULL.
  // Fica fora do registro de insertOne porque a tabela não tem `id` — a chave é
  // (collaborator_id, menu_key), e a conferência do fim a trata à parte.
  const { error: permError } = await db.from('collaborator_permissions').insert(permissionRows)
  if (permError) fail(`gravar permissões: ${permError.message}`)
  console.log(`  ${permissionRows.length} permissões gravadas (${leafKeys.length} menus x ${TEAM.length} pessoas)`)

  // 7. Clientes ----------------------------------------------------------------
  const client = {}
  for (const { key, ...row } of CLIENTS) {
    client[key] = await insertOne('clients', { tenant_id: tenant.id, ...row }, 'id, name')
  }
  console.log(`  ${CLIENTS.length} clientes`)

  // 8. Negociações e serviços --------------------------------------------------
  const negotiation = {}
  let serviceCount = 0
  for (const n of NEGOTIATIONS) {
    negotiation[n.key] = await insertOne(
      'negotiations',
      {
        tenant_id: tenant.id,
        name: n.name,
        client_id: client[n.client].id,
        commercial_owner_id: person[n.owner].id,
        estimated_value: n.estimated_value,
        close_probability: n.close_probability,
        status: n.status,
        funnel_stage: n.funnel_stage,
        origin: n.origin,
        referrer_name: n.referrer_name,
        expected_close_date: n.expected_close_date,
        closed_at: n.closed_at,
      },
      'id, name',
    )
    for (const service_type of n.services) {
      await insertOne(
        'negotiation_services',
        { tenant_id: tenant.id, negotiation_id: negotiation[n.key].id, service_type },
        'id',
      )
      serviceCount++
    }
  }
  console.log(`  ${NEGOTIATIONS.length} negociações e ${serviceCount} serviços`)

  // 9. Contratos ---------------------------------------------------------------
  const contract = {}
  for (const c of CONTRACTS) {
    const { key, client: clientKey, negotiation: negKey, ...row } = c
    const source = client[clientKey]
    contract[c.contract_number] = await insertOne(
      'contracts',
      {
        tenant_id: tenant.id,
        ...row,
        client_id: source.id,
        negotiation_id: negKey ? negotiation[negKey].id : undefined,
        // Snapshot do cadastro na assinatura — congelamento, não espelho.
        client_legal_name: source.name,
        ...snapshotOf(CLIENTS.find((x) => x.key === clientKey)),
      },
      'id, contract_number, total_value, installment_count',
    )
    void key
  }
  console.log(`  ${CONTRACTS.length} contratos`)

  // 10. Projetos, tarefas e tags -----------------------------------------------
  const project = {}
  let taskCount = 0
  let tagCount = 0
  for (const p of PROJECTS) {
    project[p.key] = await insertOne(
      'projects',
      {
        tenant_id: tenant.id,
        name: p.name,
        project_type: p.project_type,
        client_id: client[p.client].id,
        contract_id: p.contract ? contract[p.contract].id : undefined,
        location: p.location,
        city: p.city,
        state: p.state,
        site_address_text: p.site_address_text,
        commercial_responsible_id: person[p.commercial]?.id,
        operational_responsible_id: p.operational ? person[p.operational].id : undefined,
        start_date: p.start_date,
        status: p.status,
        current_phase: p.current_phase,
        total_value: p.total_value,
        land_area_m2: p.land_area_m2,
        project_area_m2: p.project_area_m2,
        layout_study_days: p.layout_study_days,
        renderings_days: p.renderings_days,
        display_order: p.display_order,
        notes: p.notes,
        // A coluna nasce false (0032) e as duas telas filtram por ela: sem isto
        // o projeto existe no banco e não aparece em tela nenhuma.
        visible_in_list: true,
      },
      'id, name, client_id',
    )

    for (const land_type of p.land_types ?? []) {
      await insertOne('project_land_types', { tenant_id: tenant.id, project_id: project[p.key].id, land_type }, 'id')
      tagCount++
    }
    for (const purpose of p.purposes ?? []) {
      await insertOne('project_purposes', { tenant_id: tenant.id, project_id: project[p.key].id, purpose }, 'id')
      tagCount++
    }

    for (const t of p.tasks) {
      await insertOne(
        'tasks',
        {
          tenant_id: tenant.id,
          project_id: project[p.key].id,
          title: t.title,
          phase: t.phase,
          status: t.status,
          priority: t.priority,
          task_type: 'technical',
          responsible_id: person[t.who].id,
          start_date: dayOffset(t.days - 12),
          due_date: dayOffset(t.days),
          completion_date: t.status === 'completed' ? dayOffset(t.days) : undefined,
          estimated_hours: t.hours[0],
          spent_hours: t.hours[1],
        },
        'id',
      )
      taskCount++
    }
  }
  console.log(`  ${PROJECTS.length} projetos, ${taskCount} tarefas e ${tagCount} tags`)

  // 11. Atividades -------------------------------------------------------------
  for (const a of ACTIVITIES) {
    const projectRow = a.project ? project[a.project] : null
    await insertOne(
      'activities',
      {
        tenant_id: tenant.id,
        description: a.description,
        collaborator_id: person[a.who].id,
        coordinator_id: a.coordinator ? person[a.coordinator].id : undefined,
        project_id: projectRow?.id,
        client_id: projectRow?.client_id,
        status: a.status,
        priority: a.priority,
        execution_order: a.execution_order,
        start_date: a.start_date,
        end_date: a.end_date,
        started_at: a.started_at,
        completed_at: a.completed_at,
        started_by: a.started_by ? person[a.started_by].id : undefined,
        completed_by: a.completed_by ? person[a.completed_by].id : undefined,
        notes: a.notes,
      },
      'id',
    )
  }
  console.log(`  ${ACTIVITIES.length} atividades`)

  // 12. Financeiro -------------------------------------------------------------
  for (const c of CATEGORIES) {
    await insertOne('financial_categories', { tenant_id: tenant.id, ...c }, 'id')
  }

  /*
    Parcelas a receber, gravadas linha a linha.

    A soma das parcelas de um contrato é EXATAMENTE o valor dele — é o invariante
    que a migration 0044 mantém na geração de verdade, e o seed do módulo 7
    confere. Os dois planos deste escritório dividem redondo (156.000 em 6 e
    224.000 em 4), e mesmo assim a soma é conferida abaixo: um valor trocado numa
    parcela viraria conciliação bancária furada meses depois, longe da causa.
  */
  const RECEIVABLE_PLANS = [
    { number: 'MIR-2026-007', project: 'barra', client: 'iracema', count: 6, firstDue: -70, step: 30 },
    { number: 'MIR-2025-031', project: 'chales', client: 'costao', count: 4, firstDue: -40, step: 30 },
  ]

  let receivableCount = 0
  for (const plan of RECEIVABLE_PLANS) {
    const c = contract[plan.number]
    const cents = Math.round(Number(c.total_value) * 100)
    const base = Math.floor(cents / plan.count)
    // O resto vai na primeira parcela, como faz a 0044.
    const values = Array.from({ length: plan.count }, (_, i) =>
      i === 0 ? (base + (cents - base * plan.count)) / 100 : base / 100,
    )

    /*
      Quem já venceu está pago, MENOS a última vencida.

      Essa última é a parcela em atraso, e ela precisa existir: "Em atraso" não é
      valor de enum neste banco (convenção da migration 0001) — é
      `status = 'forecast' and due_date < current_date`, calculado na leitura pela
      view accounts_receivable_status. Sem uma linha nesse estado, a tela e o
      painel mostram inadimplência zero e ninguém vê se a conta funciona.
    */
    const dueOffsets = values.map((_, i) => plan.firstDue + i * plan.step)
    const lastOverdue = dueOffsets.reduce((last, d, i) => (d < 0 ? i : last), -1)

    for (const [i, value] of values.entries()) {
      const due = dueOffsets[i]
      const paid = due < 0 && i !== lastOverdue
      await insertOne(
        'accounts_receivable',
        {
          tenant_id: tenant.id,
          contract_id: c.id,
          client_id: client[plan.client].id,
          project_id: project[plan.project].id,
          description: `${c.contract_number} — parcela ${i + 1}/${plan.count}`,
          value,
          due_date: dayOffset(due),
          issue_date: dayOffset(plan.firstDue - 5),
          installment_number: i + 1,
          installment_total: plan.count,
          status: paid ? 'paid' : 'forecast',
          payment_date: paid ? dayOffset(due + 1) : undefined,
          payment_method: paid ? (i === 0 ? 'pix' : 'boleto') : undefined,
        },
        'id',
      )
      receivableCount++
    }

    const soma = values.reduce((s, v) => s + v, 0)
    if (Math.abs(soma - Number(c.total_value)) > 0.001) {
      fail(
        `as parcelas de ${c.contract_number} somam R$ ${brl(soma)} e o contrato é ` +
          `R$ ${brl(c.total_value)}.`,
      )
    }
  }

  for (const p of PAYABLES) {
    const { project: projectKey, ...row } = p
    await insertOne(
      'accounts_payable',
      { tenant_id: tenant.id, ...row, project_id: projectKey ? project[projectKey].id : undefined },
      'id',
    )
  }
  console.log(
    `  ${CATEGORIES.length} categorias, ${receivableCount} recebíveis e ${PAYABLES.length} pagamentos`,
  )

  // 13. Fornecedores e marcas --------------------------------------------------
  const supplier = {}
  let brandCount = 0
  for (const { key, brands, ...row } of SUPPLIERS) {
    supplier[key] = await insertOne('suppliers', { tenant_id: tenant.id, ...row }, 'id, name')
    for (const name of brands) {
      await insertOne('supplier_brands', { tenant_id: tenant.id, supplier_id: supplier[key].id, name }, 'id')
      brandCount++
    }
  }

  // 14. Checklists de orçamento ------------------------------------------------
  let itemCount = 0
  let quoteCount = 0
  for (const c of CHECKLISTS) {
    const created = await insertOne(
      'budget_checklists',
      {
        tenant_id: tenant.id,
        client_id: client[c.client].id,
        project_id: project[c.project].id,
        responsible_id: person[c.responsible].id,
        status: c.status,
        project_phase: c.project_phase,
        start_date: c.start_date,
        curation_percent: c.curation_percent,
        notes: c.notes,
      },
      'id',
    )

    for (const i of c.items) {
      const { chosen, quotes, ...row } = i
      const item = await insertOne(
        'budget_checklist_items',
        {
          tenant_id: tenant.id,
          checklist_id: created.id,
          ...row,
          chosen_supplier_id: chosen ? supplier[chosen].id : undefined,
        },
        'id, name',
      )
      itemCount++

      for (const q of quotes) {
        await insertOne(
          'budget_item_quotes',
          { tenant_id: tenant.id, item_id: item.id, supplier_id: supplier[q.supplier].id, value: q.value, notes: q.notes },
          'id',
        )
        quoteCount++
      }
    }
  }
  console.log(
    `  ${SUPPLIERS.length} fornecedores, ${brandCount} marcas, ${CHECKLISTS.length} checklists, ` +
      `${itemCount} itens e ${quoteCount} cotações`,
  )

  // 15. Mapa -------------------------------------------------------------------
  let mapTagCount = 0
  for (const p of PROPERTIES) {
    const { key, project: projectKey, client: clientKey, land_types, purposes, ...row } = p
    void key
    const created = await insertOne(
      'map_properties',
      {
        tenant_id: tenant.id,
        ...row,
        project_id: projectKey ? project[projectKey].id : undefined,
        client_id: clientKey ? client[clientKey].id : undefined,
      },
      'id',
    )
    for (const land_type of land_types ?? []) {
      await insertOne('map_property_land_types', { tenant_id: tenant.id, map_property_id: created.id, land_type }, 'id')
      mapTagCount++
    }
    for (const purpose of purposes ?? []) {
      await insertOne('map_property_purposes', { tenant_id: tenant.id, map_property_id: created.id, purpose }, 'id')
      mapTagCount++
    }
  }

  for (const g of SITE_GEOCODES) {
    const { project: projectKey, ...columns } = g
    const { error } = await db
      .from('projects')
      .update(columns)
      .eq('id', project[projectKey].id)
      .eq('tenant_id', tenant.id)
    if (error) fail(`geolocalizar "${project[projectKey].name}": ${error.message}`)
  }
  console.log(`  ${PROPERTIES.length} propriedades no mapa e ${mapTagCount} tags`)

  // 16. Conferência da fronteira -----------------------------------------------
  await assertNothingCrossedTheBorder(tenant, others, before)

  // 17. Credenciais ------------------------------------------------------------
  const file = resolve(HERE, 'credenciais-mirante.local')
  const content =
    `Contas de teste — escritório "${SLUG}"\n` +
    `${TENANT_NAME}\n` +
    `Gerado em ${new Date().toISOString()}\n` +
    `Projeto: ${URL}\n\n` +
    `Arquivo ignorado pelo git (*.local). Contas de desenvolvimento:\n` +
    `apagar antes de o sistema receber dado de produção.\n\n` +
    `E-mail é global no Auth: estes endereços não podem colidir com os do\n` +
    `primeiro escritório (supabase/seed/credenciais.local), por isso o domínio\n` +
    `é outro.\n\n` +
    credentials
      .map((c) => `${c.name}\n  função: ${c.role}   status: active\n  email:  ${c.email}\n  senha:  ${c.password}\n`)
      .join('\n')
  writeFileSync(file, content, { mode: 0o600 })

  console.log(`\n  Credenciais em supabase/seed/credenciais-mirante.local\n`)
  for (const c of credentials) {
    console.log(`    ${c.email.padEnd(38)} ${c.role}`)
  }
  console.log('')
}

/*
  Snapshot do cadastro do cliente no contrato — congelamento, não espelho. As
  colunas de contracts não têm o bloco de bairro (migration 0029), por isso
  address_district e site_district ficam de fora.
*/
function snapshotOf(c) {
  return {
    client_tax_id: c.tax_id,
    client_email: c.email,
    client_birth_date: c.birth_date,
    client_address_zipcode: c.address_zipcode,
    client_address_street: c.address_street,
    client_address_number: c.address_number,
    client_address_complement: c.address_complement,
    client_address_city: c.address_city,
    client_address_state: c.address_state,
    site_zipcode: c.site_zipcode,
    site_street: c.site_street,
    site_number: c.site_number,
    site_city: c.site_city,
    site_state: c.site_state,
  }
}

// Tabelas com tenant_id que este seed escreve, na ordem em que a conferência as
// percorre. A fotografia do antes e a do depois usam esta mesma lista.
const TENANT_TABLES = [
  'tenant_email_domains',
  'tenant_users',
  'collaborators',
  'collaborator_permissions',
  'clients',
  'negotiations',
  'negotiation_services',
  'contracts',
  'projects',
  'project_land_types',
  'project_purposes',
  'tasks',
  'activities',
  'financial_categories',
  'accounts_receivable',
  'accounts_payable',
  'suppliers',
  'supplier_brands',
  'budget_checklists',
  'budget_checklist_items',
  'budget_item_quotes',
  'map_properties',
  'map_property_land_types',
  'map_property_purposes',
]

async function countByTenant(tenants) {
  const snapshot = {}
  for (const t of tenants) {
    snapshot[t.id] = {}
    for (const table of TENANT_TABLES) {
      // select('*') e não select('id'): collaborator_permissions e tenant_users
      // não têm coluna id (a chave é composta) e derrubariam a contagem.
      const { count, error } = await db
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', t.id)
      if (error) fail(`contar ${table} do escritório ${t.slug}: ${error.message}`)
      snapshot[t.id][table] = count ?? 0
    }
  }
  return snapshot
}

/*
  A única verificação deste seed, e ela é barata.

  Duas perguntas, porque uma só não cobre a fronteira inteira:

  1. Toda linha que este seed gravou está no tenant deste escritório? Lê de volta
     por id o que o registro de insertOne guardou e compara o tenant_id. Pega o
     erro de escrever no escritório errado.

  2. As outras tabelas dos outros escritórios continuam do mesmo tamanho? Compara
     com a fotografia tirada antes da primeira escrita. Pega o oposto — linha
     acrescentada ou apagada do lado de lá, que a pergunta 1 não veria porque o
     id nem passaria pelo registro.

  Escrita com a service role key ignora RLS. Aqui a fronteira é conferida, não
  presumida.
*/
async function assertNothingCrossedTheBorder(tenant, others, before) {
  let checked = 0
  for (const [table, ids] of written) {
    if (table === 'tenants') continue
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200)
      const { data, error } = await db.from(table).select('id, tenant_id').in('id', slice)
      if (error) fail(`conferir ${table}: ${error.message}`)
      if (data.length !== slice.length) {
        fail(`conferir ${table}: gravei ${slice.length} linhas e li ${data.length} de volta.`)
      }
      for (const row of data) {
        if (row.tenant_id !== tenant.id) {
          fail(
            `linha trocada de escritório: ${table} id=${row.id} tem tenant_id=${row.tenant_id},\n` +
              `  e deveria ter ${tenant.id} (${tenant.slug}).`,
          )
        }
        checked++
      }
    }
  }

  /*
    As duas tabelas de chave composta, que o registro por id não alcança:
    collaborator_permissions e tenant_users. Aqui a pergunta é feita pelo outro
    lado — toda linha ligada a alguém deste escritório tem que estar neste
    escritório.
  */
  const collaboratorIds = written.get('collaborators') ?? []
  for (const [table, column] of [['collaborator_permissions', 'collaborator_id']]) {
    const { data, error } = await db.from(table).select(`${column}, tenant_id`).in(column, collaboratorIds)
    if (error) fail(`conferir ${table}: ${error.message}`)
    for (const row of data) {
      if (row.tenant_id !== tenant.id) {
        fail(`linha trocada de escritório: ${table} ${column}=${row[column]} tem tenant_id=${row.tenant_id}.`)
      }
      checked++
    }
  }

  const { data: links, error: linksError } = await db
    .from('tenant_users')
    .select('user_id, tenant_id')
    .eq('tenant_id', tenant.id)
  if (linksError) fail(`conferir tenant_users: ${linksError.message}`)
  if (links.length !== TEAM.length) {
    fail(`tenant_users: gravei ${TEAM.length} vínculos e li ${links.length} de volta.`)
  }
  checked += links.length

  const after = await countByTenant(others)
  for (const t of others) {
    for (const table of TENANT_TABLES) {
      if (before[t.id][table] !== after[t.id][table]) {
        fail(
          `este seed mexeu no escritório "${t.slug}": ${table} tinha ` +
            `${before[t.id][table]} linhas e agora tem ${after[t.id][table]}.`,
        )
      }
    }
  }

  console.log(
    `\n  OK: as ${checked} linhas gravadas estão todas em ${tenant.slug}, e ` +
      `${others.length === 0 ? 'não há outro escritório no banco' : `o(s) ${others.length} outro(s) escritório(s) ficaram intocados`}.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
