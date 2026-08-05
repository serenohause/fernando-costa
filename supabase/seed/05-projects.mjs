// Seed do modulo 5 (Projetos) — projetos, tarefas e checklists.
//
// COMO RODAR
//   npm run seed:projects
//   Depende dos seeds 1 a 4.
//
// SOBRE OS DADOS
//   O quadro do fluxo de projeto precisa de tarefa em varias fases para nascer
//   povoado. E o progresso precisa de projetos em estagios diferentes, senao a
//   view project_progress devolve o mesmo numero para todos e ninguem percebe
//   se ela quebrou.
//
// INSERCAO UMA A UMA, e nao em lote
//   O PostgREST, em insercao de varias linhas, monta uma lista unica de colunas
//   com a uniao das chaves e da NULO EXPLICITO para a linha que omite uma delas.
//   Ja mordeu os seeds dos modulos 3 e 4. Aqui os projetos tem formatos
//   legitimamente diferentes (uns com contrato, outros sem; uns com area, outros
//   nao), entao cada um vai no seu INSERT.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertOnlyTestTenants } from './tenants.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_TENANT_SLUG = 'fernando-costa-teste'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env opcional */
  }
  return env
}

const env = loadEnv()
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function insertOne(table, row, select) {
  const clean = {}
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v
  const { data, error } = await db.from(table).insert(clean).select(select).single()
  if (error) fail(`inserir em ${table}: ${error.message}`)
  return data
}

async function main() {
  console.log(`\nSeed do módulo 5 (Projetos) — ${env.VITE_SUPABASE_URL}\n`)

  // Trava de seguranca: aborta se houver no banco tenant fora da lista de
  // escritorios de teste. A lista, e o que acontece quando o escritorio real
  // nascer, estao em supabase/seed/tenants.mjs.
  await assertOnlyTestTenants(db)

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()
  if (!tenant) fail('escritório de teste não existe. Rode: npm run seed')

  const { data: clients } = await db.from('clients').select('id, name').eq('tenant_id', tenant.id)
  const { data: contracts } = await db
    .from('contracts')
    .select('id, contract_number, project_name')
    .eq('tenant_id', tenant.id)
  const { data: team } = await db
    .from('collaborators')
    .select('id, name, role')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')

  if (!clients?.length || !contracts?.length) {
    fail('faltam clientes ou contratos. Rode: npm run seed:crm e npm run seed:contracts')
  }

  const client = (s) => clients.find((c) => c.name.startsWith(s))
  const contract = (n) => contracts.find((c) => c.contract_number === n)
  const byRole = (r) => team.find((c) => c.role === r)
  const diretora = byRole('director')
  const arquiteta = byRole('architect')
  const coordenador = byRole('coordinator')
  const estagiario = byRole('intern')

  // Limpeza. projects cascateia tarefas, checklists e tags.
  const { count: previous } = await db
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  if (previous) {
    console.log(`  Apagando ${previous} projetos da execução anterior...`)
    await db.from('projects').delete().eq('tenant_id', tenant.id)
  }

  /*
    Quatro projetos em estágios diferentes. O que cada um exercita:

    1. Em desenvolvimento, tarefas espalhadas por várias fases, nenhuma
       concluída — progresso 0%, fase 70. É o caso que prova que os dois
       números da view são independentes.
    2. Em aprovação, metade das tarefas concluídas — progresso 50%.
    3. Concluído, todas concluídas — 100% pelos dois caminhos.
    4. Prospecção, sem tarefa nenhuma — progresso 0 e não nulo, que é o caso
       de borda da view.
  */
  /*
    `visible_in_list: true` em todos, e é obrigatório.

    A coluna nasce `false` (migration 0032) e as duas telas do original filtram
    por ela — `Projects.jsx:56` e `Tasks.jsx:82`. No uso real quem a levanta é a
    aprovação do contrato, que cria o projeto (módulo 4, adiado). Sem isso o seed
    grava quatro projetos que existem no banco e não aparecem em tela nenhuma —
    e o sintoma é "a tela está vazia", longe da causa.
  */
  const PROJECTS = [
    {
      key: 'alphaville',
      name: 'Interiores Alphaville — Beatriz',
      project_type: 'architecture_interiors',
      client_id: client('Beatriz')?.id,
      contract_id: contract('FC-2026-018')?.id,
      location: 'Alphaville Flamboyant, Goiânia',
      city: 'Goiânia',
      state: 'GO',
      site_address_text: 'Alameda Ipê Roxo, Quadra 12, Lote 7, Alphaville Flamboyant, Goiânia - GO',
      commercial_responsible_id: diretora?.id,
      operational_responsible_id: arquiteta?.id,
      start_date: daysFromNow(-7),
      status: 'in_development',
      current_phase: 'legal_permit',
      total_value: 95000,
      land_area_m2: 450,
      project_area_m2: 320,
      layout_study_days: 15,
      renderings_days: 20,
      display_order: 1,
      visible_in_list: true,
      land_types: ['Loteamento fechado'],
      purposes: ['Moradia'],
      tasks: [
        { title: 'Levantamento do imóvel', phase: 'briefing', status: 'completed', priority: 'high', responsible: arquiteta, days: -5, hours: [8, 9] },
        { title: 'Estudo de layout dos ambientes', phase: 'layout', status: 'in_progress', priority: 'high', responsible: arquiteta, days: 5, hours: [24, 10] },
        { title: 'Perspectivas da sala e cozinha', phase: 'renderings', status: 'not_started', priority: 'medium', responsible: estagiario, days: 20, hours: [32, 0] },
        { title: 'Aprovação na comissão do condomínio', phase: 'hoa_approval', status: 'not_started', priority: 'medium', responsible: coordenador, days: 35, hours: [6, 0] },
        { title: 'Projeto legal para prefeitura', phase: 'legal_permit', status: 'not_started', priority: 'low', responsible: arquiteta, days: 45, hours: [40, 0] },
      ],
    },
    {
      key: 'araguaia',
      name: 'Sede administrativa — Vale do Araguaia',
      project_type: 'architecture_engineering',
      client_id: client('Agropecuária')?.id,
      contract_id: contract('FC-2026-019')?.id,
      location: 'Aragarças, GO',
      city: 'Aragarças',
      state: 'GO',
      commercial_responsible_id: diretora?.id,
      operational_responsible_id: coordenador?.id,
      start_date: daysFromNow(5),
      status: 'in_approval',
      current_phase: 'construction_docs',
      total_value: 470000,
      land_area_m2: 5200,
      project_area_m2: 1450,
      display_order: 2,
      visible_in_list: true,
      land_types: ['Área rural'],
      purposes: ['Comercial'],
      tasks: [
        { title: 'Briefing com os dois sócios', phase: 'briefing', status: 'completed', priority: 'high', responsible: diretora, days: -20, hours: [6, 7] },
        { title: 'Estudo preliminar da sede', phase: 'layout', status: 'completed', priority: 'high', responsible: coordenador, days: -10, hours: [40, 44] },
        { title: 'Projeto executivo', phase: 'construction_docs', status: 'in_progress', priority: 'high', responsible: coordenador, days: 30, hours: [80, 22] },
        { title: 'Complementares — estrutura e elétrica', phase: 'engineering_docs', status: 'not_started', priority: 'medium', responsible: arquiteta, days: 55, hours: [60, 0] },
      ],
    },
    {
      key: 'caldas',
      name: 'Casa de campo Caldas Novas',
      project_type: 'architecture',
      client_id: client('Joaquim')?.id,
      contract_id: contract('FC-2025-104')?.id,
      location: 'Caldas Novas, GO',
      city: 'Caldas Novas',
      state: 'GO',
      commercial_responsible_id: diretora?.id,
      operational_responsible_id: arquiteta?.id,
      start_date: daysFromNow(-375),
      status: 'completed',
      current_phase: 'finished',
      total_value: 128000,
      display_order: 3,
      visible_in_list: true,
      land_types: ['Loteamento aberto'],
      purposes: ['Moradia', 'Lazer'],
      tasks: [
        { title: 'Briefing e levantamento', phase: 'briefing', status: 'completed', priority: 'high', responsible: arquiteta, days: -370, hours: [8, 8] },
        { title: 'Projeto executivo', phase: 'construction_docs', status: 'completed', priority: 'high', responsible: arquiteta, days: -300, hours: [70, 68] },
        { title: 'Alvará de construção', phase: 'building_permit', status: 'completed', priority: 'medium', responsible: coordenador, days: -260, hours: [12, 15] },
      ],
    },
    {
      // Sem tarefa nenhuma: o caso de borda da view, que precisa dar 0 e não nulo.
      key: 'pinheiros',
      name: 'Residência Alto de Pinheiros',
      project_type: 'architecture',
      client_id: client('Mariana')?.id,
      location: 'Jardins Milano, Goiânia',
      city: 'Goiânia',
      state: 'GO',
      commercial_responsible_id: diretora?.id,
      status: 'prospecting',
      current_phase: 'not_started',
      total_value: 185000,
      display_order: 4,
      visible_in_list: true,
      notes: 'Aguardando aprovação da comissão do condomínio antes de iniciar.',
      land_types: ['Loteamento fechado'],
      purposes: ['Moradia'],
      tasks: [],
    },
  ]

  let totalTasks = 0
  let totalChecklist = 0

  for (const p of PROJECTS) {
    const { tasks, land_types, purposes, key, ...projectRow } = p
    void key
    const project = await insertOne(
      'projects',
      { ...projectRow, tenant_id: tenant.id },
      'id, name, status, current_phase',
    )

    for (const lt of land_types ?? []) {
      await insertOne('project_land_types', { tenant_id: tenant.id, project_id: project.id, land_type: lt }, 'id')
    }
    for (const pu of purposes ?? []) {
      await insertOne('project_purposes', { tenant_id: tenant.id, project_id: project.id, purpose: pu }, 'id')
    }

    for (const t of tasks) {
      const task = await insertOne(
        'tasks',
        {
          tenant_id: tenant.id,
          project_id: project.id,
          title: t.title,
          phase: t.phase,
          status: t.status,
          priority: t.priority,
          task_type: 'technical',
          responsible_id: t.responsible?.id,
          start_date: daysFromNow(t.days - 10),
          due_date: daysFromNow(t.days),
          completion_date: t.status === 'completed' ? daysFromNow(t.days) : undefined,
          estimated_hours: t.hours[0],
          spent_hours: t.hours[1],
        },
        'id',
      )
      totalTasks++

      /*
        Checklist só na tarefa em andamento de cada projeto. É onde ele importa:
        item obrigatório pendente numa tarefa em andamento é o que a view conta,
        e é o que a tela precisa saber desenhar.
      */
      if (t.status === 'in_progress') {
        const items = [
          { title: 'Medição no local conferida', is_required: true, is_completed: true },
          { title: 'Programa de necessidades aprovado pelo cliente', is_required: true, is_completed: false },
          { title: 'Referências visuais anexadas', is_required: false, is_completed: false },
        ]
        for (const [i, item] of items.entries()) {
          await insertOne(
            'task_checklist_items',
            {
              tenant_id: tenant.id,
              task_id: task.id,
              title: item.title,
              phase: t.phase,
              is_required: item.is_required,
              is_completed: item.is_completed,
              completed_at: item.is_completed ? new Date().toISOString() : undefined,
              display_order: i + 1,
            },
            'id',
          )
          totalChecklist++
        }
      }
    }
  }

  const { data: progress } = await db
    .from('project_progress')
    .select('project_id, progress_percent, phase_percent, tasks_total, tasks_completed')
    .eq('tenant_id', tenant.id)

  const { data: named } = await db.from('projects').select('id, name').eq('tenant_id', tenant.id)
  const nameOf = (id) => named.find((n) => n.id === id)?.name ?? id

  console.log(`  ${PROJECTS.length} projetos, ${totalTasks} tarefas, ${totalChecklist} itens de checklist`)
  console.log('')
  console.log('  Progresso calculado pela view (proporção | fase):')
  for (const row of progress.sort((a, b) => nameOf(a.project_id).localeCompare(nameOf(b.project_id)))) {
    console.log(
      `    ${nameOf(row.project_id).slice(0, 40).padEnd(42)}` +
        `${String(row.progress_percent).padStart(3)}% | ${String(row.phase_percent).padStart(3)}%` +
        `   (${row.tasks_completed}/${row.tasks_total} tarefas)`,
    )
  }
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
