// Seed do modulo 8 (Fornecedores e Orcamento por Cliente).
//
// COMO RODAR
//   npm run seed:budget
//   Depende dos seeds 1, 2 e 5 (precisa de colaboradores, clientes e projetos).
//
// SOBRE OS DADOS
//   Fornecedores de Goiania e regiao, com as marcas que cada um representa. Os
//   quatro niveis de parceria e os tres status aparecem todos, porque a tela de
//   Fornecedores filtra pelos dois e filtro sem linha para achar nao e filtro
//   testado.
//
//   Os checklists cobrem os casos que a tela precisa desenhar e que o schema
//   permitiu de proposito: um SEM projeto vinculado (project_id e nullable
//   apesar de a entidade do base44 declarar required — ver o COMMENT da coluna
//   na 0049) e um SEM item nenhum, que e o estado normal logo depois de criar e
//   e o caso de borda da view budget_checklist_totals.
//
//   Os itens cobrem os seis status, item obrigatorio e nao obrigatorio, prazo
//   vencido, item com fornecedor escolhido e item sem. As cotacoes cobrem item
//   com tres fornecedores (um deles escolhido), item com uma so e item nenhuma.
//
// O QUE ESTE SEED CONFERE, EM VEZ DE CONFIAR
//   Le as duas views do modulo (budget_checklist_totals e
//   supplier_commission_totals) e imprime os totais. Aborta se o checklist sem
//   item nao devolver ZERO em tudo — soma de conjunto vazio e NULL em SQL, e a
//   0051 so devolve zero porque cada agregado esta dentro de um coalesce. Se
//   alguem tirar um coalesce, o sintoma na tela seria "R$ -" ou uma barra de
//   progresso quebrada, e aqui falha na hora.
//
//   E le as views LOGADO COMO A DIRETORA, e nao com a chave de servico. Elas sao
//   `security invoker`: a chave de servico passa por cima da RLS e leria os
//   totais mesmo que policy e GRANT estivessem errados. O cabecalho da 0051
//   avisa que `drop view` leva o GRANT junto — foi o que aconteceu com
//   project_progress entre a 0035 e a 0036. Lendo como gente, isso aparece aqui.
//
// POR QUE NENHUM PDF E ENVIADO
//   budget_file_path e quote_file_path ficam NULOS. O bucket budget-files (0052)
//   e privado e o caminho do objeto e gravado pela tela no momento do upload.
//   Seed que inventa um caminho grava um anexo que a tela lista e que nao abre —
//   link morto, exatamente o que o COMMENT das colunas manda evitar. E o check
//   *_file_pair garante que caminho nulo com nome nulo e um estado valido.
//
// E POR QUE, MESMO ASSIM, HA PDFS DE APROVACAO SEMEADOS (E SEM OBJETO NO BUCKET)
//   budget_item_approval_files (0054) nao tem o estado "linha sem arquivo": a
//   linha SO existe porque ha um PDF, e as duas colunas sao NOT NULL. Ou seja, a
//   escolha aqui nao e entre "coluna nula" e "caminho inventado", como e nas duas
//   colunas acima — e entre TER a funcionalidade nos dados de teste ou nao ter.
//
//   Nao ter custa mais do que parece. Com zero linhas, approval_file_count e
//   attachment_count dao ZERO em todo o banco de teste, nas duas views. O clipe
//   do cartao da listagem, o clipe da linha do item e a secao "Aprovacao do
//   Cliente" do drawer nunca aparecem em tela, e um erro de ligacao na UI (ler
//   quote_file_count no lugar de attachment_count, esquecer de invalidar a
//   contagem depois de anexar) passa despercebido — o numero certo e o numero
//   errado sao os dois zero. Os testes de supabase/tests/budget-schema.sql cobrem
//   a conta no SQL; eles nao cobrem a tela lendo a coluna errada.
//
//   Ter custa UMA coisa, e ela e visivel e limitada: o botao de abrir o PDF falha
//   ("Object not found" na assinatura da URL), porque o objeto nao existe no
//   bucket. E o estado de erro que a tela precisa tratar de qualquer forma, ele
//   acontece so no tenant de teste, o caminho carrega 'seed-sem-objeto' escrito
//   nele para quem for investigar, e o resumo impresso no fim desta rodada avisa
//   antes de alguem clicar.
//
//   Por isso: linha semeada, arquivo nao. Nao subimos PDF de verdade porque isso
//   colocaria objeto no Storage sem passar pelo caminho da tela e sem que a
//   limpeza do inicio do seed (que apaga LINHAS) soubesse remove-lo — cada rodada
//   deixaria lixo acumulado no bucket.

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

async function signedInAsDirector() {
  const creds = readFileSync(resolve(ROOT, 'supabase/seed/credenciais.local'), 'utf8')
  const m = creds.match(/email:\s+(diretora\S+)\n\s+senha:\s+(\S+)/)
  if (!m) fail('não achei as credenciais da Diretora. Rode: npm run seed')

  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email: m[1], password: m[2] })
  if (error) fail(`login da Diretora: ${error.message}`)
  return client
}

function fail(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const brl = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/*
  Uma linha por vez, sempre.

  Insert em lote pelo PostgREST monta UMA lista de colunas a partir da união das
  chaves de todas as linhas, e a linha que omite uma chave recebe NULL EXPLÍCITO
  em vez do default da coluna. Isso já mordeu os seeds 3, 4 e 5 — aqui derrubaria
  `status`, `priority`, `is_required`, `has_showroom` e `partnership_tier`, que
  são NOT NULL com default.
*/
async function insertOne(table, row, select) {
  const clean = {}
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v
  const { data, error } = await db.from(table).insert(clean).select(select).single()
  if (error) fail(`inserir em ${table}: ${error.message}`)
  return data
}

// ── Fornecedores ─────────────────────────────────────────────────────────────
//
// Treze cadastros cobrindo os quatro níveis de parceria, os três status e os
// cinco modelos de parceria. Três marmorarias e duas casas de iluminação de
// propósito: é o que permite um item com três cotações concorrentes.
const SUPPLIERS = [
  {
    key: 'sao_jorge',
    name: 'Marmoraria São Jorge',
    category: 'natural_stone',
    contact_name: 'Wagner Sales',
    contact_whatsapp: '(62) 99184-2210',
    contact_email: 'comercial@marmorariasaojorge.com.br',
    phone: '(62) 3241-8800',
    website: 'https://marmorariasaojorge.com.br',
    address: 'Av. Independência, 2140, Setor Coimbra',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: true,
    serves_outside_fortaleza: true,
    partnership_tier: 'strategic',
    partnership_model: 'commission_and_discount',
    commission_percent: 5,
    commission_payment_term: 'after_client_payment',
    standard_discount_percent: 8,
    average_delivery_time: '20 a 25 dias após medição',
    status: 'active',
    last_order_date: dayOffset(-18),
    notes: 'Faz medição a laser e entrega instalada. Parceiro desde 2019.',
    brands: ['Granitos Bueno', 'Silestone', 'Dekton'],
  },
  {
    key: 'ipiranga',
    name: 'Marmoraria Ipiranga',
    category: 'natural_stone',
    contact_name: 'Cleide Marinho',
    contact_whatsapp: '(62) 98812-7745',
    city: 'Aparecida de Goiânia',
    state: 'GO',
    has_showroom: false,
    partnership_tier: 'registered',
    partnership_model: 'price_discount',
    standard_discount_percent: 10,
    average_delivery_time: '30 dias',
    status: 'active',
    brands: ['Mármores Pedra Viva'],
  },
  {
    key: 'serra_dourada',
    name: 'Granitos Serra Dourada',
    category: 'natural_stone',
    contact_name: 'Ubirajara Peixoto',
    contact_whatsapp: '(64) 99301-5566',
    city: 'Rio Verde',
    state: 'GO',
    has_showroom: false,
    serves_outside_fortaleza: true,
    partnership_tier: 'under_evaluation',
    partnership_model: 'none',
    status: 'negotiating',
    notes: 'Preço bom, prazo ruim. Aguardando a primeira entrega para avaliar.',
    brands: ['Granitos Serra Dourada'],
  },
  {
    key: 'portobello',
    name: 'Portobello Shop Goiânia',
    category: 'ceramics_porcelain',
    contact_name: 'Renata Caiado',
    contact_whatsapp: '(62) 99671-3308',
    contact_email: 'goiania@portobelloshop.com.br',
    phone: '(62) 3086-4500',
    website: 'https://portobelloshop.com.br',
    address: 'Av. T-63, 1400, Setor Bueno',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: true,
    partnership_tier: 'strategic',
    partnership_model: 'sales_commission',
    commission_percent: 7,
    commission_payment_term: 'on_delivery',
    average_delivery_time: '10 dias para itens de estoque',
    status: 'active',
    last_order_date: dayOffset(-9),
    brands: ['Portobello', 'Pointer', 'Portinari'],
  },
  {
    key: 'deca_roca',
    name: 'Casa Show Metais e Louças',
    category: 'fixtures_sanitaryware',
    contact_name: 'Anderson Prado',
    contact_whatsapp: '(62) 99245-1180',
    contact_email: 'projetos@casashowmetais.com.br',
    address: 'Av. Anhanguera, 5510, Setor Aeroporto',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: true,
    partnership_tier: 'preferred',
    partnership_model: 'sales_commission',
    commission_percent: 4,
    commission_payment_term: 'net_30_after_delivery',
    status: 'active',
    brands: ['Deca', 'Roca', 'Docol', 'Tramontina'],
  },
  {
    key: 'lumini',
    name: 'Lumini Iluminação Centro-Oeste',
    category: 'indoor_lighting',
    contact_name: 'Sílvia Marques',
    contact_whatsapp: '(62) 99503-4417',
    contact_email: 'silvia@luminicentrooeste.com.br',
    address: 'Rua 9, 320, Setor Oeste',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: true,
    serves_outside_fortaleza: true,
    partnership_tier: 'preferred',
    partnership_model: 'sales_commission',
    commission_percent: 6,
    commission_payment_term: 'net_60_after_delivery',
    average_delivery_time: '15 dias',
    status: 'active',
    last_order_date: dayOffset(-3),
    brands: ['Lumini', 'Newline', 'Stella'],
  },
  {
    key: 'iluminar',
    name: 'Iluminar Paisagismo e Luz',
    category: 'outdoor_lighting',
    contact_name: 'Domingos Sávio',
    contact_whatsapp: '(62) 98407-9932',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: false,
    partnership_tier: 'registered',
    // Sem parceria FORMAL declarada — diferente de "nada acordado", que seria a
    // coluna nula (ver o COMMENT do enum partnership_model na 0048).
    partnership_model: 'none',
    status: 'negotiating',
    brands: ['Interlight'],
  },
  {
    key: 'ipe_dourado',
    name: 'Marcenaria Ipê Dourado',
    category: 'cabinetry',
    contact_name: 'Valdir Tomazini',
    contact_whatsapp: '(62) 99122-6003',
    contact_email: 'orcamento@ipedourado.ind.br',
    phone: '(62) 3945-2020',
    address: 'Rua VP 7-D, Quadra 12, Distrito Agroindustrial',
    city: 'Anápolis',
    state: 'GO',
    has_showroom: true,
    serves_outside_fortaleza: true,
    partnership_tier: 'strategic',
    partnership_model: 'commission_and_discount',
    commission_percent: 8,
    commission_payment_term: 'after_client_payment',
    standard_discount_percent: 12,
    average_delivery_time: '45 dias após aprovação do projeto executivo',
    status: 'active',
    last_order_date: dayOffset(-40),
    notes: 'Trabalha com o nosso executivo em DWG, sem redesenhar. Reduz retrabalho.',
    brands: ['Sayerlack', 'Duratex', 'Guararapes', 'Blum'],
  },
  {
    key: 'anhanguera',
    name: 'Esquadrias Anhanguera',
    category: 'frames_openings',
    contact_name: 'Rosana Ferraz',
    contact_whatsapp: '(62) 99788-2141',
    city: 'Aparecida de Goiânia',
    state: 'GO',
    has_showroom: false,
    partnership_tier: 'registered',
    partnership_model: 'price_discount',
    standard_discount_percent: 15,
    average_delivery_time: '35 dias',
    status: 'active',
    brands: ['Alcoa', 'Blindex'],
  },
  {
    key: 'cristal_serrano',
    name: 'Vidraçaria Cristal Serrano',
    category: 'glass_mirrors',
    contact_name: 'Nivaldo Serrano',
    contact_whatsapp: '(62) 98330-7712',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: false,
    // Sem partnership_model, sem comissão, sem desconto: nada foi acordado, e
    // isso é NULO — não é 'none'.
    partnership_tier: 'registered',
    status: 'inactive',
    notes: 'Inativado após dois atrasos seguidos na obra de Caldas Novas.',
    brands: ['Guardian Glass'],
  },
  {
    key: 'solaris',
    name: 'Solaris Energia Solar Goiás',
    category: 'solar_energy',
    contact_name: 'Fabrício Naves',
    contact_whatsapp: '(62) 99614-8877',
    contact_email: 'fabricio@solarisgo.com.br',
    website: 'https://solarisgo.com.br',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: false,
    serves_outside_fortaleza: true,
    partnership_tier: 'under_evaluation',
    partnership_model: 'sales_commission',
    commission_percent: 3,
    commission_payment_term: 'to_be_agreed',
    status: 'negotiating',
    brands: ['Canadian Solar', 'Growatt'],
  },
  {
    key: 'cerrado',
    name: 'Casa do Paisagista Cerrado',
    category: 'landscaping',
    contact_name: 'Lucimar Boaventura',
    contact_whatsapp: '(62) 99055-3126',
    address: 'Av. Padre Orlando, 900, Jardim Novo Mundo',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: true,
    partnership_tier: 'preferred',
    // Exclusividade de especificação: parceria sem um centavo de comissão.
    partnership_model: 'spec_exclusivity',
    average_delivery_time: '7 dias para mudas, 20 para árvores de porte',
    status: 'active',
    brands: ['Vasart', 'Nutriplan'],
  },
  {
    key: 'smart_house',
    name: 'Smart House Automação',
    category: 'home_automation',
    contact_name: 'Igor Bandeira',
    contact_whatsapp: '(62) 98166-4409',
    city: 'Goiânia',
    state: 'GO',
    has_showroom: false,
    partnership_tier: 'registered',
    partnership_model: 'sales_commission',
    commission_percent: 5,
    commission_payment_term: 'on_delivery',
    status: 'active',
    brands: ['Control4', 'Lutron'],
  },
]

async function main() {
  console.log(`\nSeed do módulo 8 (Fornecedores e Orçamento) — ${env.VITE_SUPABASE_URL}\n`)

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

  const { data: clients } = await db.from('clients').select('id, name').eq('tenant_id', tenant.id)
  const { data: projects } = await db.from('projects').select('id, name').eq('tenant_id', tenant.id)
  const { data: team } = await db
    .from('collaborators')
    .select('id, name, role')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')

  if (!clients?.length) fail('não há clientes. Rode: npm run seed:crm')
  if (!projects?.length) fail('não há projetos. Rode: npm run seed:projects')

  const client = (s) => clients.find((c) => c.name.startsWith(s))
  const project = (s) => projects.find((p) => p.name.startsWith(s))
  const byRole = (r) => team?.find((c) => c.role === r)
  const diretora = byRole('director')
  const coordenador = byRole('coordinator')
  const arquiteta = byRole('architect')

  /*
    Limpeza — incondicional, de propósito.

    Mesma correção que o seed 07 recebeu: uma rodada que morre DEPOIS de gravar
    os fornecedores e ANTES dos checklists deixa o banco num estado que uma
    checagem do tipo `if (previous)` lê como "vazio", e a rodada seguinte bate na
    chave única de supplier_brands (fornecedor + marca). Seed tem que ser
    re-executável a partir de qualquer meio-caminho, não só do estado limpo.

    A ordem importa. budget_item_quotes tem FK SEM cascade para suppliers (0049,
    de propósito: apagar fornecedor já cotado precisa ser decisão explícita), e o
    delete dos fornecedores falharia enquanto houvesse cotação apontando para
    eles. Os checklists vêm primeiro, e o cascade deles leva itens e cotações.
  */
  const { count: prevC } = await db
    .from('budget_checklists')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  const { count: prevS } = await db
    .from('suppliers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  console.log(`  Apagando ${prevC ?? 0} checklists e ${prevS ?? 0} fornecedores anteriores...`)
  await db.from('budget_checklists').delete().eq('tenant_id', tenant.id)
  await db.from('suppliers').delete().eq('tenant_id', tenant.id)

  // ── Fornecedores e marcas ──────────────────────────────────────────────────
  const supplier = {}
  let brandCount = 0
  for (const { key, brands, ...row } of SUPPLIERS) {
    const created = await insertOne('suppliers', { tenant_id: tenant.id, ...row }, 'id, name')
    supplier[key] = created
    for (const name of brands) {
      await insertOne(
        'supplier_brands',
        { tenant_id: tenant.id, supplier_id: created.id, name },
        'id',
      )
      brandCount++
    }
  }
  console.log(`  ${SUPPLIERS.length} fornecedores e ${brandCount} marcas gravados.`)

  // ── Checklists de orçamento ────────────────────────────────────────────────
  //
  // Quatro, e cada um existe por um motivo:
  //   1. Alphaville  — o cheio: seis dos seis status de item, cotação múltipla,
  //                    comissão recebida e prazo vencido.
  //   2. Vale do Araguaia — obra corporativa, com as duas categorias que
  //                    fornecedor nenhum pode ter (facade_cladding e a
  //                    waterproofing do 1) e um item aprovado SEM comissão.
  //   3. Sem projeto — project_id nulo, o caso que a entidade do base44 diz ser
  //                    impossível e que as telas dele tratam desde sempre.
  //   4. Sem item    — o caso de borda da view: tudo zero, nada nulo.
  //
  // As quatro fases que o check da 0049 aceita aparecem uma em cada checklist.
  const CHECKLISTS = [
    {
      key: 'alphaville',
      client: 'Beatriz',
      project: 'Interiores Alphaville',
      responsible_id: coordenador?.id,
      status: 'in_progress',
      project_phase: 'renderings',
      start_date: dayOffset(-45),
      curation_percent: 8,
      notes: 'Cliente quer fechar acabamentos antes da viagem de dezembro.',
      items: [
        {
          name: 'Bancadas em granito Preto São Gabriel',
          description: 'Cozinha, ilha e duas bancadas de banheiro, com rodabanca.',
          category: 'natural_stone',
          responsible_id: arquiteta?.id,
          due_date: dayOffset(-30),
          status: 'approved',
          priority: 'high',
          is_required: true,
          estimated_value: 18500,
          approved_value: 17400,
          chosen: 'sao_jorge',
          commission_percent: 5,
          commission_received: true,
          client_approved: true,
          approval_date: dayOffset(-8),
          // DOIS PDFs de aprovação, com data própria: é o caso que prova que
          // pdfs_aprovacao é LISTA, e não um par de colunas. As datas são
          // anteriores a hoje de propósito — no original elas vêm do dia do
          // anexo, e para o dado importado do base44 vão divergir do created_at
          // da linha (COMMENT de uploaded_on, 0054).
          approvals: [
            { file_name: 'aprovacao-bancadas-assinada.pdf', uploaded_on: dayOffset(-9) },
            { file_name: 'aprovacao-bancadas-aditivo-rodabanca.pdf', uploaded_on: dayOffset(-8) },
          ],
          // Três concorrentes, uma escolhida. Quem responde qual venceu é
          // chosen_supplier_id do item, e não uma bandeira na cotação (0049).
          quotes: [
            { supplier: 'sao_jorge', value: 17400, notes: 'Inclui instalação e rodabanca de 10 cm.' },
            { supplier: 'ipiranga', value: 18900, notes: 'Instalação por conta do cliente.' },
            { supplier: 'serra_dourada', value: 21200, notes: 'Prazo de 40 dias, fora do cronograma.' },
          ],
        },
        {
          name: 'Porcelanato 120x120 da sala e varanda',
          description: '186 m² incluindo perda de corte a 45 graus.',
          category: 'ceramics_porcelain',
          responsible_id: arquiteta?.id,
          due_date: dayOffset(10),
          status: 'presented_to_client',
          priority: 'high',
          is_required: true,
          estimated_value: 42000,
          quotes: [{ supplier: 'portobello', value: 41320, notes: 'Preço válido por 15 dias.' }],
        },
        {
          // Prazo vencido e ainda em cotação, sem nenhuma cotação registrada.
          name: 'Marcenaria dos dormitórios e closet',
          category: 'cabinetry',
          responsible_id: coordenador?.id,
          due_date: dayOffset(-3),
          status: 'quoting',
          priority: 'high',
          is_required: true,
          estimated_value: 96000,
          notes: 'Marcenaria só orça depois do executivo liberado.',
          quotes: [],
        },
        {
          // Não obrigatório, aprovado, comissão prevista e ainda NÃO recebida.
          name: 'Luminárias técnicas de embutir',
          category: 'indoor_lighting',
          responsible_id: arquiteta?.id,
          due_date: dayOffset(-5),
          status: 'approved',
          priority: 'medium',
          is_required: false,
          estimated_value: 23000,
          approved_value: 21800,
          chosen: 'lumini',
          commission_percent: 6,
          commission_received: false,
          client_approved: true,
          approval_date: dayOffset(-2),
          // UM PDF só, e SEM uploaded_on: esta linha exercita o default
          // `current_date` da coluna, que é o caminho de quem anexa pela tela.
          approvals: [{ file_name: 'aprovacao-luminarias-whatsapp.pdf' }],
          quotes: [
            { supplier: 'lumini', value: 21800 },
            { supplier: 'iluminar', value: 24500, notes: 'Trabalha melhor com externa.' },
          ],
        },
        {
          name: 'Metais e louças dos banheiros',
          category: 'fixtures_sanitaryware',
          due_date: dayOffset(25),
          status: 'pending',
          priority: 'medium',
          is_required: true,
          estimated_value: 15600,
          quotes: [],
        },
        {
          name: 'Espelho bisotado do lavabo',
          category: 'glass_mirrors',
          status: 'cancelled',
          priority: 'low',
          is_required: false,
          estimated_value: 2400,
          notes: 'Cliente desistiu — vai reaproveitar o espelho do apartamento antigo.',
          quotes: [],
        },
        {
          /*
            Categoria 'waterproofing': item de orçamento pode tê-la, fornecedor
            NÃO (check suppliers_category_domain_check, 0049). Consequência
            registrada no cabeçalho da 0048 e não corrigida: este item nunca vai
            receber sugestão de fornecedor por categoria. Está aqui para que esse
            comportamento apareça em tela, e não só no comentário da migration.
          */
          name: 'Impermeabilização da varanda gourmet',
          category: 'waterproofing',
          due_date: dayOffset(-15),
          status: 'pending',
          priority: 'high',
          is_required: true,
          estimated_value: 3800,
          quotes: [],
        },
      ],
    },
    {
      key: 'araguaia',
      client: 'Agropecuária',
      project: 'Sede administrativa',
      responsible_id: coordenador?.id,
      status: 'awaiting_client',
      project_phase: 'construction_docs',
      start_date: dayOffset(-20),
      curation_percent: 5,
      items: [
        {
          name: 'Esquadrias de alumínio da fachada oeste',
          description: '42 vãos, vidro laminado refletivo.',
          category: 'frames_openings',
          responsible_id: coordenador?.id,
          due_date: dayOffset(18),
          status: 'quoted',
          priority: 'high',
          is_required: true,
          estimated_value: 210000,
          quotes: [
            { supplier: 'anhanguera', value: 198400, notes: 'Desconto padrão de 15% já aplicado.' },
          ],
        },
        {
          name: 'Sistema fotovoltaico de 75 kWp',
          category: 'solar_energy',
          due_date: dayOffset(30),
          status: 'quoting',
          priority: 'medium',
          is_required: false,
          estimated_value: 320000,
          quotes: [{ supplier: 'solaris', value: 298000, notes: 'Homologação na Equatorial inclusa.' }],
        },
        {
          name: 'Revestimento de fachada em ACM',
          category: 'facade_cladding',
          due_date: dayOffset(40),
          status: 'pending',
          priority: 'medium',
          is_required: true,
          estimated_value: 88000,
          quotes: [],
        },
        {
          /*
            Aprovado, fornecedor escolhido e commission_percent NULO — a parceria
            com o Cerrado é de exclusividade de especificação, não de comissão. A
            coluna gerada commission_value fica NULA, e não zero: "não há comissão
            combinada" é diferente de "a comissão é zero" (COMMENT da 0049).
          */
          name: 'Paisagismo da área de convivência',
          category: 'landscaping',
          responsible_id: arquiteta?.id,
          due_date: dayOffset(-1),
          status: 'approved',
          priority: 'low',
          is_required: false,
          estimated_value: 46000,
          approved_value: 43500,
          chosen: 'cerrado',
          client_approved: true,
          quotes: [{ supplier: 'cerrado', value: 43500 }],
        },
      ],
    },
    {
      /*
        SEM PROJETO. A entidade do base44 marca project_id como required, mas o
        formulário oferece "Nenhum" e a listagem desenha "Sem projeto vinculado".
        A 0049 seguiu as telas, não a entidade — e sem uma linha assim o caminho
        nunca é exercitado.
      */
      key: 'sem_projeto',
      client: 'Maria das Graças',
      project: null,
      responsible_id: diretora?.id,
      status: 'open',
      project_phase: 'post_approval',
      start_date: dayOffset(-6),
      notes: 'Cliente pediu orçamento de acabamentos antes de fechar o projeto.',
      items: [
        {
          name: 'Automação de iluminação e cortinas',
          category: 'home_automation',
          due_date: dayOffset(14),
          status: 'presented_to_client',
          priority: 'medium',
          is_required: false,
          estimated_value: 54000,
          quotes: [{ supplier: 'smart_house', value: 51900 }],
        },
        {
          name: 'Revestimento da piscina em pastilha de vidro',
          category: 'pool_cladding',
          due_date: dayOffset(-1),
          status: 'pending',
          priority: 'low',
          is_required: true,
          estimated_value: 26000,
          quotes: [],
        },
      ],
    },
    {
      /*
        SEM ITEM NENHUM, e com curation_percent preenchido de propósito: é o que
        prova que curation_total dá 0 por não haver aprovado, e não por falta de
        percentual. É o estado normal logo depois de criar o checklist.
      */
      key: 'vazio',
      client: 'Mariana',
      project: 'Residência Alto de Pinheiros',
      responsible_id: coordenador?.id,
      status: 'open',
      project_phase: 'engineering_docs',
      curation_percent: 10,
      notes: 'Recém-criado. Itens serão lançados depois da reunião de briefing.',
      items: [],
    },
  ]

  const checklist = {}
  /* Guardado por nome só para a conferência do fim poder cobrar a contagem de
     clipes do item que recebeu os dois PDFs de aprovação. */
  const itemByName = {}
  let itemCount = 0
  let quoteCount = 0
  let approvalCount = 0

  for (const c of CHECKLISTS) {
    const clientRow = client(c.client)
    if (!clientRow) fail(`cliente "${c.client}" não existe. Rode: npm run seed:crm`)
    const projectRow = c.project ? project(c.project) : null
    if (c.project && !projectRow) fail(`projeto "${c.project}" não existe. Rode: npm run seed:projects`)

    const created = await insertOne(
      'budget_checklists',
      {
        tenant_id: tenant.id,
        client_id: clientRow.id,
        project_id: projectRow?.id,
        responsible_id: c.responsible_id,
        status: c.status,
        project_phase: c.project_phase,
        start_date: c.start_date,
        completion_date: c.completion_date,
        curation_percent: c.curation_percent,
        notes: c.notes,
      },
      'id',
    )
    checklist[c.key] = created

    for (const i of c.items) {
      const { chosen, quotes, approvals, ...row } = i
      const item = await insertOne(
        'budget_checklist_items',
        {
          tenant_id: tenant.id,
          checklist_id: created.id,
          ...row,
          chosen_supplier_id: chosen ? supplier[chosen].id : undefined,
          // budget_file_path/budget_file_name ficam nulos: ver o cabeçalho.
        },
        'id, name, commission_value',
      )
      itemByName[item.name] = item
      itemCount++

      /*
        Os PDFs de aprovação — LINHA SIM, OBJETO NÃO. O motivo está no cabeçalho.

        O caminho tem a forma que a tela grava (<tenant_id>/<checklist_id>/<uuid>),
        porque é o primeiro segmento que as policies de storage.objects comparam
        com o claim do JWT — caminho de teste com outra forma esconderia um erro
        de isolamento. O 'seed-sem-objeto' no meio existe para que quem abrir a
        linha no banco enquanto investiga um "Object not found" leia a resposta ali
        mesmo.
      */
      for (const a of approvals ?? []) {
        await insertOne(
          'budget_item_approval_files',
          {
            tenant_id: tenant.id,
            item_id: item.id,
            file_path: `${tenant.id}/${created.id}/seed-sem-objeto-${crypto.randomUUID()}.pdf`,
            file_name: a.file_name,
            uploaded_on: a.uploaded_on,
          },
          'id',
        )
        approvalCount++
      }

      for (const q of quotes) {
        await insertOne(
          'budget_item_quotes',
          {
            tenant_id: tenant.id,
            item_id: item.id,
            supplier_id: supplier[q.supplier].id,
            value: q.value,
            notes: q.notes,
          },
          'id',
        )
        quoteCount++
      }
    }
  }

  console.log(
    `  ${CHECKLISTS.length} checklists, ${itemCount} itens e ${quoteCount} cotações gravados.`,
  )
  console.log(
    `  ${approvalCount} PDFs de aprovação gravados SEM objeto no bucket: a lista aparece na tela\n` +
      '  e o botão de abrir falha com "Object not found". É de propósito — ver o cabeçalho.\n',
  )

  /*
    ── Conferência, lida das VIEWS e LOGADA COMO GENTE ───────────────────────

    As duas views são `security invoker`. Lidas com a chave de serviço elas
    devolveriam os números mesmo com policy quebrada ou GRANT perdido — e GRANT
    perdido é exatamente o acidente que a 0051 documenta no próprio cabeçalho.
  */
  const asDirector = await signedInAsDirector()

  const { data: totals, error: totalsError } = await asDirector
    .from('budget_checklist_totals')
    .select('*')
  if (totalsError) fail(`ler budget_checklist_totals como Diretora: ${totalsError.message}`)

  const { data: commissions, error: commissionsError } = await asDirector
    .from('supplier_commission_totals')
    .select('*')
  if (commissionsError) {
    fail(`ler supplier_commission_totals como Diretora: ${commissionsError.message}`)
  }

  const totalOf = (key) => totals.find((t) => t.checklist_id === checklist[key].id)

  console.log('  budget_checklist_totals')
  for (const c of CHECKLISTS) {
    const t = totalOf(c.key)
    if (!t) fail(`a view não devolveu linha para o checklist "${c.key}"`)
    console.log(
      `    ${c.key.padEnd(13)} ${String(t.completed_item_count).padStart(2)}/${String(t.item_count).padEnd(2)} itens` +
        `  ${String(t.progress_percent).padStart(3)}%` +
        `  estimado R$ ${brl(t.estimated_total).padStart(12)}` +
        `  aprovado R$ ${brl(t.approved_total).padStart(10)}` +
        `  comissão R$ ${brl(t.commission_total).padStart(8)}` +
        ` (recebida R$ ${brl(t.commission_received_total)})` +
        `  curadoria R$ ${brl(t.curation_total)}` +
        `  ${String(t.attachment_count).padStart(2)} PDF(s)`,
    )
  }

  /*
    A contagem de clipes POR ITEM, lida da view budget_item_attachments (0054).

    O item das bancadas tem dois PDFs de aprovação e três cotações, nenhuma com
    arquivo. Se a view somasse cotação sem PDF — o filtro que o original tem e que
    é fácil perder —, aqui sairia 5 em vez de 2, e a tela nova mostraria um número
    diferente do que o escritório vê hoje.
  */
  const bancadas = itemByName['Bancadas em granito Preto São Gabriel']
  const { data: clipes, error: clipesError } = await asDirector
    .from('budget_item_attachments')
    .select('quote_file_count, approval_file_count, attachment_count')
    .eq('item_id', bancadas.id)
    .maybeSingle()
  if (clipesError) fail(`ler budget_item_attachments como Diretora: ${clipesError.message}`)
  if (!clipes) fail('a view budget_item_attachments não devolveu linha para o item das bancadas')
  if (
    Number(clipes.approval_file_count) !== 2 ||
    Number(clipes.quote_file_count) !== 0 ||
    Number(clipes.attachment_count) !== 2
  ) {
    fail(
      'budget_item_attachments devolveu ' +
        `${clipes.quote_file_count} cotação(ões) com PDF e ${clipes.approval_file_count} aprovação(ões) ` +
        `(total ${clipes.attachment_count}) para o item das bancadas. Esperado: 0, 2 e 2 — ` +
        'cotação sem arquivo NÃO conta.',
    )
  }
  console.log(
    '\n  OK: o item das bancadas conta 2 clipes (2 aprovações; as 3 cotações não têm PDF).',
  )

  console.log('\n  supplier_commission_totals (só quem já foi escolhido)')
  for (const s of commissions.filter((c) => c.chosen_item_count > 0)) {
    const nome = Object.values(supplier).find((x) => x.id === s.supplier_id)?.name ?? s.supplier_id
    console.log(
      `    ${nome.padEnd(32)} ${s.chosen_item_count} item(s)` +
        `  comissão R$ ${brl(s.commission_total).padStart(9)}` +
        `  recebida R$ ${brl(s.commission_received_total)}`,
    )
  }
  const semComissao = commissions.filter((c) => c.chosen_item_count === 0).length
  console.log(`    (+ ${semComissao} fornecedores nunca escolhidos, todos com total zero)`)

  /*
    O checklist SEM ITEM tem que devolver ZERO em tudo, e não NULL.

    Soma de conjunto vazio é NULL em SQL; a view só devolve zero porque cada
    agregado está dentro de um coalesce (0051). Sem esta checagem, alguém
    limpando "coalesce redundante" da view não faria nada falhar aqui — o
    sintoma apareceria como "R$ -" na listagem e como barra de progresso
    quebrada, longe da causa.
  */
  const vazio = totalOf('vazio')
  const ZERADOS = [
    'item_count',
    'completed_item_count',
    'progress_percent',
    'estimated_total',
    'approved_total',
    'commission_total',
    'commission_received_total',
    'curation_total',
    /* Entrou na view pela 0054, e pelo mesmo motivo dos outros: a soma vem de um
       LEFT JOIN com budget_item_attachments, e checklist sem item nenhum não tem
       o que somar — sem o coalesce, isto seria NULL. */
    'attachment_count',
  ]
  for (const campo of ZERADOS) {
    const v = vazio[campo]
    if (v === null || v === undefined) {
      fail(
        `o checklist sem item devolveu ${campo} = ${v} na view budget_checklist_totals. ` +
          'Tem que ser zero, não nulo — o coalesce da migration 0051 existe para isso.',
      )
    }
    if (Number(v) !== 0) {
      fail(`o checklist sem item devolveu ${campo} = ${v}, e deveria ser zero.`)
    }
  }
  console.log('  OK: o checklist sem item devolve zero (não nulo) nos nove campos da view.')

  /*
    Fornecedor nunca escolhido também tem que dar zero, pelo mesmo motivo e na
    outra view. Cristal Serrano está inativo e nunca cotou nada.
  */
  const nuncaEscolhido = commissions.find((c) => c.supplier_id === supplier.cristal_serrano.id)
  if (
    nuncaEscolhido === undefined ||
    nuncaEscolhido.commission_total === null ||
    Number(nuncaEscolhido.commission_total) !== 0 ||
    Number(nuncaEscolhido.chosen_item_count) !== 0
  ) {
    fail(
      'fornecedor nunca escolhido não devolveu zero em supplier_commission_totals: ' +
        JSON.stringify(nuncaEscolhido),
    )
  }
  console.log('  OK: fornecedor nunca escolhido devolve zero (não nulo) na view de comissão.\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
