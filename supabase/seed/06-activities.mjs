// Seed do modulo 6 (Atividades).
//
// COMO RODAR
//   npm run seed:activities
//   Depende dos seeds 1 a 5.
//
// SOBRE OS DADOS
//   Tres telas precisam de dado diferente:
//   - a gerencial quer atividade de gente variada, em todos os status
//   - "Minhas Atividades" quer fila ordenada de UMA pessoa
//   - o relatorio de produtividade quer tempo executado de verdade, senao todo
//     mundo aparece com zero e ninguem ve se a conta funciona
//
//   Casos de borda deliberados: atividade atrasada, atividade sem projeto nem
//   cliente, atividade excluida (que nao deve aparecer em lista nenhuma), e
//   atividade urgente.
//
// INSERCAO UMA A UMA
//   Mesma razao dos seeds 3, 4 e 5: em lote, o PostgREST transforma coluna
//   omitida em nulo explicito quando outra linha a informa.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const hoursAgo = (n) => new Date(Date.now() - n * 3600_000).toISOString()

async function insertOne(table, row, select) {
  const clean = {}
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v
  const { data, error } = await db.from(table).insert(clean).select(select).single()
  if (error) fail(`inserir em ${table}: ${error.message}`)
  return data
}

async function main() {
  console.log(`\nSeed do módulo 6 (Atividades) — ${env.VITE_SUPABASE_URL}\n`)

  const { data: foreign } = await db
    .from('tenants')
    .select('slug')
    .neq('slug', TEST_TENANT_SLUG)
    .limit(1)
  if (foreign?.length) fail(`existe tenant que não é o de teste: ${foreign[0].slug}`)

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()
  if (!tenant) fail('escritório de teste não existe. Rode: npm run seed')

  const { data: team } = await db
    .from('collaborators')
    .select('id, name, role, coordinator_id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
  const { data: projects } = await db
    .from('projects')
    .select('id, name, client_id')
    .eq('tenant_id', tenant.id)

  const byRole = (r) => team.find((c) => c.role === r)
  const arquiteta = byRole('architect')
  const coordenador = byRole('coordinator')
  const estagiario = byRole('intern')
  const diretora = byRole('director')
  if (!arquiteta || !coordenador) fail('faltam colaboradores. Rode: npm run seed')

  const project = (s) => projects?.find((p) => p.name.startsWith(s))

  const { count: previous } = await db
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  if (previous) {
    console.log(`  Apagando ${previous} atividades da execução anterior...`)
    await db.from('activities').delete().eq('tenant_id', tenant.id)
  }

  const alphaville = project('Interiores Alphaville')
  const araguaia = project('Sede administrativa')

  /*
    A fila da Arquiteta tem ordem 1..4, contígua, porque a tela de "Minhas
    Atividades" arrasta dentro dela. Atividade concluída sai da fila
    (execution_order nulo) — é o que o check da migration 0037 exige para a
    excluída, e é o mesmo raciocínio: posição ocupada por linha que a tela não
    mostra colide na próxima reordenação.
  */
  const ACTIVITIES = [
    // Fila da Arquiteta — é a pessoa cuja tela "Minhas Atividades" vai ser vista.
    {
      description: 'Detalhar caixilhos da fachada',
      collaborator: arquiteta,
      coordinator: coordenador,
      project: alphaville,
      status: 'in_progress',
      priority: 'high',
      execution_order: 1,
      start_date: dayOffset(-2),
      end_date: dayOffset(3),
      started_at: hoursAgo(5),
      notes: 'Conferir com o marceneiro antes de fechar as medidas.',
    },
    {
      description: 'Revisar prancha de layout com o cliente',
      collaborator: arquiteta,
      coordinator: coordenador,
      project: alphaville,
      status: 'not_started',
      priority: 'medium',
      execution_order: 2,
      start_date: dayOffset(3),
      end_date: dayOffset(6),
    },
    // ATRASADA: prazo no passado e ainda não iniciada. A tela precisa marcar.
    {
      description: 'Enviar memorial descritivo para aprovação',
      collaborator: arquiteta,
      coordinator: coordenador,
      project: araguaia,
      status: 'not_started',
      priority: 'urgent',
      execution_order: 3,
      start_date: dayOffset(-10),
      end_date: dayOffset(-3),
      notes: 'Cliente cobrou por WhatsApp na segunda.',
    },
    // Sem projeto e sem cliente: atividade administrativa, que o original permite.
    {
      description: 'Organizar biblioteca de blocos do escritório',
      collaborator: arquiteta,
      coordinator: coordenador,
      status: 'not_started',
      priority: 'low',
      execution_order: 4,
      start_date: dayOffset(5),
      end_date: dayOffset(20),
    },
    /*
      CONCLUÍDA NO PRAZO, com tempo real.

      O prazo é daqui a dois dias e ela já está pronta. Sem pelo menos uma
      assim, a taxa de atraso do relatório dá 100% em todas as linhas — e
      relatório onde toda linha diz o mesmo não deixa ninguém perceber se a
      conta funciona ou se ela só devolve o mesmo número sempre.

      Fora da fila (execution_order nulo), como as excluídas.
    */
    {
      description: 'Levantamento fotográfico do imóvel',
      collaborator: arquiteta,
      coordinator: coordenador,
      project: alphaville,
      status: 'completed',
      priority: 'high',
      start_date: dayOffset(-4),
      end_date: dayOffset(2),
      started_at: hoursAgo(52),
      completed_at: hoursAgo(48),
      started_by: arquiteta,
      completed_by: arquiteta,
    },

    // Outras pessoas — a tela gerencial precisa de mais de um responsável.
    {
      description: 'Compatibilizar hidráulica e elétrica',
      collaborator: coordenador,
      project: araguaia,
      status: 'in_progress',
      priority: 'high',
      execution_order: 1,
      start_date: dayOffset(-1),
      end_date: dayOffset(4),
      started_at: hoursAgo(3),
    },
    // Concluída no prazo também: duas no prazo e uma atrasada dá taxa de 33%,
    // que é um número que só sai certo se a conta estiver certa.
    {
      description: 'Montar apresentação para a reunião de sexta',
      collaborator: coordenador,
      project: araguaia,
      status: 'completed',
      priority: 'medium',
      start_date: dayOffset(-5),
      end_date: dayOffset(1),
      started_at: hoursAgo(30),
      completed_at: hoursAgo(27),
      started_by: coordenador,
      completed_by: coordenador,
    },
    {
      description: 'Atualizar tabela de acabamentos',
      collaborator: estagiario,
      coordinator: coordenador,
      project: alphaville,
      status: 'not_started',
      priority: 'low',
      execution_order: 1,
      start_date: dayOffset(2),
      end_date: dayOffset(9),
    },
    {
      description: 'Conferir orçamento de esquadrias com dois fornecedores',
      collaborator: estagiario,
      coordinator: coordenador,
      status: 'completed',
      priority: 'medium',
      start_date: dayOffset(-12),
      end_date: dayOffset(-9),
      started_at: hoursAgo(200),
      completed_at: hoursAgo(194),
      started_by: estagiario,
      completed_by: estagiario,
    },
    /*
      EXCLUÍDA. Não deve aparecer em lista nenhuma, mas continua no banco — é o
      que a exclusão lógica existe para preservar. Sem esta linha, ninguém
      percebe se a tela parar de filtrar por deleted_at.
    */
    {
      description: 'Cotação de mármore (cancelada pelo cliente)',
      collaborator: arquiteta,
      coordinator: coordenador,
      status: 'not_started',
      priority: 'low',
      start_date: dayOffset(-4),
      end_date: dayOffset(2),
      deleted_at: hoursAgo(20),
      deleted_by: diretora,
    },
  ]

  const created = []
  for (const a of ACTIVITIES) {
    const row = await insertOne(
      'activities',
      {
        tenant_id: tenant.id,
        description: a.description,
        collaborator_id: a.collaborator?.id,
        coordinator_id: a.coordinator?.id,
        project_id: a.project?.id,
        client_id: a.project?.client_id,
        status: a.status,
        priority: a.priority,
        execution_order: a.execution_order,
        start_date: a.start_date,
        end_date: a.end_date,
        started_at: a.started_at,
        completed_at: a.completed_at,
        started_by: a.started_by?.id,
        completed_by: a.completed_by?.id,
        notes: a.notes,
        deleted_at: a.deleted_at,
        deleted_by: a.deleted_by?.id,
      },
      'id, description, status, total_minutes, deleted_at',
    )
    created.push({ ...row, who: a.collaborator?.name })
  }

  const vivas = created.filter((a) => !a.deleted_at)
  const concluidas = vivas.filter((a) => a.status === 'completed')
  const minutos = concluidas.reduce((s, a) => s + (a.total_minutes ?? 0), 0)

  console.log(`  ${created.length} atividades (${vivas.length} vivas, ${created.length - vivas.length} excluída)`)
  console.log(`  ${concluidas.length} concluídas, somando ${Math.round(minutos / 60)}h de execução`)
  console.log('')
  for (const a of created) {
    const tempo = a.total_minutes ? `${Math.round(a.total_minutes / 60)}h` : '—'
    const marca = a.deleted_at ? ' (excluída)' : ''
    console.log(
      `    ${a.description.slice(0, 44).padEnd(46)}${(a.who ?? '').slice(0, 18).padEnd(20)}` +
        `${a.status.padEnd(13)}${tempo}${marca}`,
    )
  }
  console.log('')

  /*
    Confere a coluna gerada em vez de confiar nela: se o banco parar de calcular
    total_minutes, o relatório de produtividade mostra zero para todo mundo e
    nada quebra em tela. Falhar aqui é o único lugar onde isso aparece cedo.
  */
  const semTempo = concluidas.filter((a) => !a.total_minutes)
  if (semTempo.length > 0) {
    fail(
      `atividade concluída sem total_minutes calculado:\n` +
        semTempo.map((a) => `    ${a.description}`).join('\n'),
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
