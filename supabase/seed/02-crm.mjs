// Seed do modulo 2 (CRM) — clientes simulados no escritorio de teste.
//
// POR QUE ISTO EXISTE
//   Mesma razao do seed do modulo 1: o modulo so e dado por encerrado depois de
//   o usuario ver a tela funcionando. Lista cheia, busca, filtro, os tres
//   estados (carregando, vazio, erro) e a mensagem de duplicata precisam ter
//   dado plausivel embaixo.
//
// COMO RODAR
//   npm run seed:crm
//
//   Depende do seed do modulo 1 (npm run seed) ja ter criado o escritorio de
//   teste. Nao recria colaborador nem permissao — so clientes.
//
// SEGURANCA
//   - Escreve SOMENTE no tenant de slug TEST_TENANT_SLUG. Aborta se houver no
//     banco qualquer tenant fora da lista de escritorios de teste: sinal de que
//     ha dado real por perto. Lista e trava em supabase/seed/tenants.mjs.
//   - Rodar de novo apaga apenas os clientes daquele tenant e recria.
//   - Nao toca em colaborador, permissao nem solicitacao de acesso.
//
// SOBRE OS DADOS
//   Nomes, cidades e valores plausiveis de um escritorio de arquitetura em
//   Goias. Dado generico ("Cliente 1", "Cliente 2") esconde bug de ordenacao,
//   de acento, de nome longo e de formatacao de documento — que sao exatamente
//   os bugs que aparecem em tela de listagem.

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

/*
  Casos de borda deliberados, porque sao os que quebram tela:

  - documento com pontuacao e documento sem, para exercitar a busca por digitos
  - cliente sem documento (lead do Instagram, o caso que justifica documento
    opcional) e cliente sem e-mail
  - pessoa juridica, com CNPJ de 14 digitos
  - nome longo e nome com acento, hifen e apostrofo
  - cliente com endereco de obra preenchido e cliente sem
  - observacao longa, para ver o que a celula da tabela faz com texto grande
*/
const CLIENTS = [
  {
    name: 'Mariana Rezende Andrade',
    phone: '(62) 99812-4477',
    email: 'mariana.andrade@gmail.com',
    client_type: 'individual',
    lead_source: 'instagram',
    tax_id: '472.183.906-51',
    birth_date: '1984-03-12',
    address_zipcode: '74175-100',
    address_street: 'Rua T-55',
    address_number: '820',
    address_district: 'Setor Bueno',
    address_city: 'Goiânia',
    address_state: 'GO',
    site_zipcode: '74885-450',
    site_street: 'Alameda das Acácias',
    site_number: 'Lote 14, Quadra 8',
    site_district: 'Jardins Milano',
    site_city: 'Goiânia',
    site_state: 'GO',
    notes: 'Terreno em condomínio fechado. Aprovação do projeto passa pela comissão do condomínio antes da prefeitura.',
  },
  {
    // Mesmo documento sem pontuação: prova que a busca por dígitos funciona.
    name: 'Eduardo Sampaio Vilhena',
    phone: '(62) 98220-7315',
    email: 'eduardo.vilhena@outlook.com',
    client_type: 'individual',
    lead_source: 'referral',
    tax_id: '81624739025',
    address_zipcode: '74810-100',
    address_street: 'Avenida Portugal',
    address_number: '1240',
    address_complement: 'Apto 1802',
    address_district: 'Setor Marista',
    address_city: 'Goiânia',
    address_state: 'GO',
    notes: 'Indicação da Mariana Andrade. Reforma de apartamento, sem obra nova.',
  },
  {
    // Pessoa jurídica, CNPJ de 14 dígitos.
    name: 'Construtora Horizonte Norte Ltda',
    phone: '(62) 3251-8890',
    email: 'contato@horizontenorte.com.br',
    client_type: 'company',
    lead_source: 'website',
    tax_id: '19.472.055/0001-83',
    address_zipcode: '74063-010',
    address_street: 'Rua 89',
    address_number: '55',
    address_district: 'Setor Sul',
    address_city: 'Goiânia',
    address_state: 'GO',
    site_city: 'Aparecida de Goiânia',
    site_state: 'GO',
    site_district: 'Cidade Vera Cruz',
    notes: 'Projeto de 3 unidades geminadas para venda. Contato pelo telefone fixo, raramente responde e-mail.',
  },
  {
    // Lead sem documento: é o caso que justifica documento opcional.
    name: "Ana Lúcia D'Ávila",
    phone: '(64) 99145-6620',
    email: 'analucia.davila@gmail.com',
    client_type: 'individual',
    lead_source: 'instagram',
    address_city: 'Rio Verde',
    address_state: 'GO',
    notes: 'Chegou pelo Instagram, primeira conversa marcada. Ainda não passou documento nem endereço.',
  },
  {
    // Sem e-mail: o escritório fala por WhatsApp. client_key cai no documento.
    name: 'Joaquim Ferreira dos Santos Neto',
    phone: '(62) 99503-2288',
    client_type: 'individual',
    lead_source: 'referral',
    tax_id: '305.884.712-40',
    birth_date: '1961-11-02',
    address_zipcode: '75901-020',
    address_street: 'Rua Presidente Vargas',
    address_number: '312',
    address_district: 'Centro',
    address_city: 'Rio Verde',
    address_state: 'GO',
    site_city: 'Caldas Novas',
    site_state: 'GO',
    notes: 'Casa de campo. Só WhatsApp, não usa e-mail.',
  },
  {
    // Nome longo, para ver o que a célula faz.
    name: 'Maria das Graças Albuquerque Monteiro de Carvalho',
    phone: '(61) 98877-1204',
    email: 'mgracas.carvalho@terra.com.br',
    client_type: 'individual',
    lead_source: 'other',
    tax_id: '627.910.348-77',
    address_zipcode: '71680-350',
    address_street: 'SMDB Conjunto 12',
    address_number: 'Casa 7',
    address_district: 'Lago Sul',
    address_city: 'Brasília',
    address_state: 'DF',
    site_city: 'Pirenópolis',
    site_state: 'GO',
    notes: 'Cliente de Brasília, obra em Pirenópolis. Reuniões por vídeo.',
  },
  {
    name: 'Rodrigo Kenzo Yamaguchi',
    phone: '(62) 99671-0083',
    email: 'rodrigo.yamaguchi@gmail.com',
    client_type: 'individual',
    lead_source: 'website',
    tax_id: '154.203.687-19',
    address_zipcode: '74223-060',
    address_street: 'Rua 15',
    address_number: '405',
    address_district: 'Setor Oeste',
    address_city: 'Goiânia',
    address_state: 'GO',
  },
  {
    name: 'Beatriz Salgado Pinheiro',
    phone: '(62) 98419-5567',
    email: 'bia.pinheiro@icloud.com',
    client_type: 'individual',
    lead_source: 'instagram',
    tax_id: '739.056.128-04',
    address_city: 'Goiânia',
    address_state: 'GO',
    site_city: 'Goiânia',
    site_state: 'GO',
    site_district: 'Alphaville Flamboyant',
    notes: 'Projeto de interiores apenas. Já tem arquitetura aprovada com outro escritório.',
  },
  {
    name: 'Agropecuária Vale do Araguaia S/A',
    phone: '(62) 3702-4410',
    email: 'engenharia@valedoaraguaia.agr.br',
    client_type: 'company',
    lead_source: 'referral',
    tax_id: '08.551.940/0001-27',
    address_city: 'Barra do Garças',
    address_state: 'MT',
    site_city: 'Aragarças',
    site_state: 'GO',
    notes: 'Sede administrativa da fazenda. Decisão passa por dois sócios, prazo costuma escorregar.',
  },
  {
    // Sem documento E sem e-mail: client_key fica nulo e este cliente sai da
    // deduplicação. É o caso que justifica os índices únicos serem parciais, e
    // sem ele o seed não exercitaria chave nula em nenhuma linha.
    name: 'Thiago Moreira Bastos',
    phone: '(62) 99288-7741',
    client_type: 'individual',
    lead_source: 'other',
    address_city: 'Anápolis',
    address_state: 'GO',
    notes: 'Contato de evento, só o telefone anotado. Sem documento e sem e-mail.',
  },
]

async function main() {
  console.log(`\nSeed do módulo 2 (CRM) — ${URL}\n`)

  // 1. Trava de segurança -----------------------------------------------------
  // Trava de seguranca: aborta se houver no banco tenant fora da lista de
  // escritorios de teste. A lista, e o que acontece quando o escritorio real
  // nascer, estao em supabase/seed/tenants.mjs.
  await assertOnlyTestTenants(db)

  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle()

  if (tenantError) fail(`não consegui ler o escritório de teste: ${tenantError.message}`)
  if (!tenant) {
    fail(
      `o escritório de teste "${TEST_TENANT_SLUG}" não existe.\n` +
        `  Rode primeiro o seed do módulo 1: npm run seed`,
    )
  }

  // 2. Limpeza do que sobrou de execução anterior ------------------------------
  const { count: previous } = await db
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)

  if (previous) {
    console.log(`  Apagando ${previous} clientes da execução anterior...`)
    const { error } = await db.from('clients').delete().eq('tenant_id', tenant.id)
    if (error) fail(`limpar clientes: ${error.message}`)
  }

  // 3. Clientes ---------------------------------------------------------------
  const { data: inserted, error: insertError } = await db
    .from('clients')
    .insert(CLIENTS.map((c) => ({ ...c, tenant_id: tenant.id })))
    .select('name, tax_id, tax_id_digits, client_key, email_normalized')

  if (insertError) fail(`inserir clientes: ${insertError.message}`)

  console.log(`  ${inserted.length} clientes criados`)

  // 4. Conferência das colunas geradas ---------------------------------------
  // Não é enfeite: se o banco parar de calcular os derivados, a deduplicação
  // silenciosamente deixa de existir e nada quebra na tela.
  const semChave = inserted.filter((c) => !c.client_key)
  const comDocumento = inserted.filter((c) => c.tax_id_digits)

  console.log(`  ${comDocumento.length} com documento, ${inserted.length - comDocumento.length} sem`)
  console.log(`  ${semChave.length} sem chave de deduplicação (esperado: os sem documento e sem e-mail)`)

  const digitosErrados = comDocumento.filter((c) => !/^\d+$/.test(c.tax_id_digits))
  if (digitosErrados.length > 0) {
    fail(
      `coluna gerada tax_id_digits saiu com caractere não numérico:\n` +
        digitosErrados.map((c) => `    ${c.name}: ${c.tax_id_digits}`).join('\n'),
    )
  }

  console.log('')
  for (const c of inserted) {
    console.log(
      `    ${c.name.slice(0, 42).padEnd(44)}${(c.tax_id ?? '—').padEnd(20)}${c.client_key ?? '(sem chave)'}`,
    )
  }
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
