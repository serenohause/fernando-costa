#!/usr/bin/env node
// Copia local de tudo que um escritorio tem no banco ATIVO, antes de apagar.
//
//   node scripts/backup-tenant.mjs [--slug=fernando-costa]
//
// POR QUE EXISTE
//   A importacao do base44 pode ser rodada em modo "apagar e subir do zero", e
//   nesse modo o que nasceu na TELA vai junto — trabalho que a equipe fez no
//   sistema e que nao esta em CSV nenhum. Um `delete from tenants` nao pergunta
//   duas vezes e nao tem desfazer.
//
//   Este arquivo nao substitui backup do Supabase; ele garante que a decisao de
//   apagar seja reversivel A MAO, com o dado em JSON legivel, na maquina de quem
//   apagou.
//
// O ARQUIVO TEM DADO REAL DE CLIENTE e sai em backup/, que esta no .gitignore
// pela mesma razao que banco/ e db/ estao.

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const i = linha.indexOf('=')
  if (i > 0) env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7) ?? 'fernando-costa'

/*
  TODA TABELA COM tenant_id, mais `tenants`. A lista foi tirada do catalogo do
  banco (information_schema) e nao da memoria de quem escreveu: tabela esquecida
  aqui e dado que o backup nao tem no dia em que ele for necessario, e ninguem
  descobre antes.

  FICAM DE FORA, e o motivo de cada uma:
    *_status, *_totals, project_progress   sao VIEWS, calculadas do que ja esta
                                           nas tabelas abaixo
    google_oauth_states                    consentimento em voo, validade de 10
                                           minutos: guardar nao serve para nada
    public_endpoint_hits                   contador de requisicoes
    menus                                  global, nao pertence a escritorio
*/
const TABELAS = [
  'tenants', 'tenant_users', 'tenant_email_domains',
  'collaborators', 'collaborator_permissions', 'access_requests',
  'clients', 'client_intakes',
  'negotiations', 'negotiation_services', 'negotiation_owner_history',
  'contracts',
  'projects', 'project_purposes', 'project_land_types', 'project_checklist_items',
  'tasks', 'task_checklist_items',
  'activities',
  'accounts_receivable', 'accounts_payable', 'financial_categories',
  'suppliers', 'supplier_brands',
  'budget_checklists', 'budget_checklist_items', 'budget_item_quotes',
  'budget_item_approval_files', 'budget_item_attachments',
  'map_properties', 'map_property_purposes', 'map_property_land_types',
  'project_diary_entries', 'project_site_visits', 'project_issues',
  'project_issue_events', 'project_diary_files',
  'service_types', 'integration_api_keys', 'google_calendar_connections',
]

const { data: tenant, error: tenantError } = await db
  .from('tenants').select('id, name, slug').eq('slug', slug).maybeSingle()
if (tenantError) { console.error('falha ao achar o escritorio:', tenantError.message); process.exit(1) }
if (!tenant) { console.error(`escritorio "${slug}" nao existe neste banco`); process.exit(1) }

const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const destino = resolve(ROOT, 'backup', `${slug}-${carimbo}`)
mkdirSync(destino, { recursive: true })

console.log(`\nBackup de "${tenant.name}" (${env.VITE_SUPABASE_URL})\n`)

let total = 0
const resumo = {}

for (const tabela of TABELAS) {
  /* `tenants` e a unica sem coluna tenant_id: o filtro dela e o proprio id. */
  const coluna = tabela === 'tenants' ? 'id' : 'tenant_id'

  const linhas = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await db
      .from(tabela).select('*').eq(coluna, tenant.id).range(inicio, inicio + 999)
    if (error) { console.error(`  ${tabela}: ${error.message}`); process.exit(1) }
    linhas.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  writeFileSync(resolve(destino, `${tabela}.json`), JSON.stringify(linhas, null, 2), { mode: 0o600 })
  resumo[tabela] = linhas.length
  total += linhas.length
  console.log(`  ${tabela.padEnd(30)} ${String(linhas.length).padStart(6)}`)
}

writeFileSync(
  resolve(destino, '_resumo.json'),
  JSON.stringify({ tenant, url: env.VITE_SUPABASE_URL, tiradoEm: new Date().toISOString(), linhas: resumo, total }, null, 2),
  { mode: 0o600 },
)

console.log(`\n  ${total} linhas em ${destino}\n`)
