// Seed do modulo 9 (Mapa de Propriedades).
//
// COMO RODAR
//   npm run seed:map
//   Depende dos seeds 1, 2 e 5 (precisa de clientes e projetos).
//
// SOBRE OS DADOS
//   Doze pinos com coordenada REAL de Goiania e regiao — Alphaville Flamboyant,
//   Jardins Milano, Setor Bueno, Jardim Goias, Setor Marista, Setor Oeste,
//   Cidade Vera Cruz (Aparecida), o DAIA de Anapolis, a rota da GO-040 para
//   Hidrolandia, Bela Vista de Goias, Caldas Novas e Aragarcas. Coordenada
//   plausivel nao e capricho: pino no lugar errado so aparece quando alguem abre
//   o mapa, e ai o bug ja esta em producao.
//
//   Os casos cobertos sao os que a tela desenha e que o schema (0057) permite de
//   proposito:
//
//     - VINCULO ou ROTULO, nunca os dois. Quatro pinos gravam project_id (os
//       quatro projetos do seed 05) e oito gravam project_label. A mesma
//       alternativa vale para o cliente, e ela e INDEPENDENTE da do projeto:
//       ha pino com cliente do CRM e projeto so por rotulo (o caso do terreno
//       que o cliente ja tem mas cujo projeto ainda nao existe).
//     - Os quatro valores de map_visual_status, inclusive nos pinos VINCULADOS,
//       onde a tela ignora o campo e le o status do projeto (ponto (d) da 0057).
//     - Pino sem loteamento e pino com nome/quadra/lote preenchidos — este
//       ultimo so aparece na tela quando ha a tag "Loteamento fechado"
//       (MapaProjetos.jsx:1213), entao os tres campos e a tag andam juntos.
//     - Pino sem area nenhuma, com as duas e com so uma delas (as duas colunas
//       sao nullable em separado, e o check so exige que sejam positivas).
//     - UM PINO MINIMO: so lat e lng, que sao os dois unicos campos required da
//       entidade. Sem endereco, sem cidade, sem rotulo, sem tag, sem area e sem
//       visual_status explicito (cai no default). E o "terreno que o escritorio
//       esta de olho" do COMMENT da tabela, e e o pino que o filtro "Cidade
//       (pins geocodificados)" tem que deixar de fora — o indice de cidade e
//       parcial (`where city is not null`) exatamente por causa dele.
//
//   AS TAGS SAO TEXTO LIVRE, E O SEED PROVA ISSO
//   map_property_land_types e map_property_purposes existem porque o formulario
//   do original sugere alguns valores e tem um campo "Nova categoria..." que
//   empurra qualquer texto (ProjectForm.jsx:436, :479 e a justificativa no
//   cabecalho da 0057). Entao aqui aparecem as tres sugestoes de terreno
//   ("Loteamento fechado", "Terreno", "Comercial"), as quatro de finalidade
//   ("Moradia", "Investimento", "Comercial", "Hoteleiro") E quatro inventadas
//   ("Chacara", "Area rural", "Loteamento aberto", "Lazer") — as tres ultimas ja
//   usadas pelo seed 05 nas tabelas irmas de Project. Ha pino com nenhuma tag,
//   com uma so e com cinco.
//
// POR QUE state GUARDA "Goias" E NAO "GO"
//   Divergencia deliberada em relacao a clients, projects e suppliers, que
//   guardam a sigla. Esta coluna nao e digitada: ela vem do reverse geocoding do
//   Nominatim, e a tela grava `data.address.state` cru (MapaProjetos.jsx:494),
//   que em pt-BR e o nome por extenso. O popup do pino exibe "Local: {city},
//   {state}" (:1208). Semear "GO" aqui seria semear um valor que a tela nunca
//   produz, e esconderia o dia em que a UI nova assumir que a coluna tem duas
//   letras. Esta reportado ao usuario junto com o resto do modulo.
//
// OS OITO CAMPOS site_* DE projects, E POR QUE ELES NAO SAO O MAPA
//   O sistema guarda "onde a obra fica" em DOIS lugares que ninguem concilia
//   (0057, "Decisao 1" de docs/SCHEMA-PLAN.md): map_properties, que e o que a
//   tela de mapa desenha, e projects.site_*, geocodificado a partir do endereco
//   do CONTRATO pela API do Google e exibido so como uma linha de texto no
//   formulario de projeto.
//
//   Este seed grava os dois, e de PROPOSITO com coordenadas ligeiramente
//   diferentes no projeto de Alphaville: o pino foi posto a mao no lote, o
//   geocoder caiu na entrada do condominio. Se algum dia alguem tentar unificar
//   as duas fontes, e este par de numeros que mostra que unificar e uma decisao
//   de produto, e nao um `coalesce`.
//
//   Tres estados de geocodificacao aparecem, que sao os tres que existem:
//     ok      Alphaville e Caldas Novas — coordenada, place_id e data.
//     failed  Vale do Araguaia — endereco de fazenda que o geocoder nao resolve:
//             status e data preenchidos, coordenada NAO (geocoding.jsx:117 grava
//             so o status).
//     pending Alto de Pinheiros — NAO e tocado por este seed. E o default da
//             coluna, e e a verdade de todo projeto sem contrato: geocoding.jsx
//             monta o endereco a partir do contrato, e esse projeto nao tem um.
//
//   site_pin_manual fica false em todos. No original ele NUNCA vira true — a
//   protecao existe e as tres escritas do sistema a desligam (COMMENT da coluna
//   na 0057) —, entao seed que o ligasse estaria inventando um estado que o
//   sistema de hoje nao alcanca. Pelo mesmo motivo site_pin_updated_by e
//   site_pin_updated_at ficam nulos: tela nenhuma os escreve.
//
// O QUE ESTE SEED CONFERE, EM VEZ DE CONFIAR
//   Ele LE tudo de volta LOGADO COMO A DIRETORA, com a chave publicavel, e nao
//   com a chave de servico. A chave de servico passa por cima da RLS: ela leria
//   os pinos e as tags mesmo que a policy da 0058 estivesse errada ou que o
//   GRANT tivesse sumido — e GRANT que some e acidente com precedente neste
//   projeto (o de project_progress, entre a 0035 e a 0036). Lendo como gente,
//   uma policy quebrada derruba o seed aqui e nao na tela.
//
//   Aborta se:
//     - algum pino tiver vinculo E rotulo ao mesmo tempo (os checks
//       *_link_exclusive_check deveriam impedir; se passou, o check esta errado);
//     - as tags nao voltarem junto com o pino (embed pela FK composta — se ele
//       nao funcionar, a tela nova precisa saber disso agora, e nao depois);
//     - algum projeto com site_geocode_status = 'ok' estiver sem coordenada.

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

const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

/*
  Uma linha por vez, sempre.

  Insert em lote pelo PostgREST monta UMA lista de colunas a partir da união das
  chaves de todas as linhas, e a linha que omite uma chave recebe NULL EXPLÍCITO
  em vez do default da coluna. Isso já mordeu os seeds 3, 4 e 5 — aqui derrubaria
  `visual_status`, que é NOT NULL com default e que o pino mínimo omite de
  propósito, justamente para exercitar esse default.
*/
async function insertOne(table, row, select) {
  const clean = {}
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v
  const { data, error } = await db.from(table).insert(clean).select(select).single()
  if (error) fail(`inserir em ${table}: ${error.message}`)
  return data
}

/*
  As doze propriedades.

  `project` e `client` são lookup por PREFIXO do nome, resolvido contra o que os
  seeds 02 e 05 gravaram — id inventado aqui viraria FK quebrada ou, pior, pino
  apontando para a linha errada. Não achou, aborta.

  `project_label` e `client_label` são a ALTERNATIVA a esses lookups, e não um
  complemento: o check da 0057 recusa a linha que tenha os dois lados do mesmo
  par preenchidos, e o combobox do original zera um ao gravar o outro
  (ProjectForm.jsx:174 e :199).
*/
const PROPERTIES = [
  {
    key: 'alphaville',
    // Alphaville Flamboyant, na alça leste do Jardim Goiás.
    lat: -16.72054,
    lng: -49.21683,
    project: 'Interiores Alphaville',
    client: 'Beatriz',
    address: 'Alameda Ipê Roxo, 7, Alphaville Flamboyant\nGoiânia – Goiás, Brasil',
    city: 'Goiânia',
    state: 'Goiás',
    land_area_m2: 450,
    project_area_m2: 320,
    subdivision_name: 'Alphaville Flamboyant',
    subdivision_block: '12',
    subdivision_lot: '7',
    /*
      Vinculado a projeto E com visual_status gravado. A tela IGNORA este valor
      quando há projeto (`project?.status || prop.status_visual`,
      MapaProjetos.jsx:287) e mesmo assim o original grava o campo em toda
      criação (:556). É o ponto (d) do cabeçalho da 0057 virando dado: coluna com
      valor que ninguém lê em metade das linhas.
    */
    visual_status: 'in_development',
    land_types: ['Loteamento fechado'],
    purposes: ['Moradia'],
  },
  {
    key: 'pinheiros',
    // Jardins Milano, o condomínio que o cadastro da Mariana dá como endereço de obra.
    lat: -16.73412,
    lng: -49.21075,
    project: 'Residência Alto de Pinheiros',
    client: 'Mariana',
    address: 'Alameda das Acácias, 14, Jardins Milano\nGoiânia – Goiás, Brasil',
    city: 'Goiânia',
    state: 'Goiás',
    // Só a área do terreno: o projeto ainda é prospecção e não tem área definida.
    land_area_m2: 780,
    subdivision_name: 'Jardins Milano',
    subdivision_block: '8',
    subdivision_lot: '14',
    visual_status: 'not_started',
    land_types: ['Loteamento fechado', 'Terreno'],
    purposes: ['Moradia', 'Investimento'],
  },
  {
    key: 'caldas',
    // Setor Turista II, Caldas Novas.
    lat: -17.74417,
    lng: -48.62563,
    project: 'Casa de campo Caldas Novas',
    client: 'Joaquim',
    address: 'Rua do Lago, 210, Setor Turista II\nCaldas Novas – Goiás, Brasil',
    city: 'Caldas Novas',
    state: 'Goiás',
    land_area_m2: 1000,
    project_area_m2: 280,
    visual_status: 'completed',
    // 'Loteamento aberto' e 'Lazer' não estão entre os valores sugeridos pelo
    // formulário — vieram do campo "Nova categoria...", e o seed 05 já os usa
    // nas tabelas irmãs de Project.
    land_types: ['Loteamento aberto'],
    purposes: ['Moradia', 'Lazer', 'Hoteleiro'],
  },
  {
    key: 'araguaia',
    // Aragarças, na divisa com Barra do Garças (MT). É onde fica a obra.
    lat: -15.89664,
    lng: -52.25201,
    project: 'Sede administrativa',
    client: 'Agropecuária',
    address: 'Avenida Presidente Vargas, 1500, Setor Central\nAragarças – Goiás, Brasil',
    city: 'Aragarças',
    state: 'Goiás',
    land_area_m2: 5200,
    project_area_m2: 1450,
    visual_status: 'in_development',
    land_types: ['Área rural'],
    purposes: ['Comercial'],
  },
  {
    key: 'bueno',
    // Setor Bueno, no endereço residencial da Mariana.
    lat: -16.70663,
    lng: -49.27352,
    /*
      CLIENTE DO CRM COM PROJETO SÓ POR RÓTULO. As duas exclusividades da 0057
      são independentes, e este é o caso de uso que separa as duas: o terreno é
      de uma cliente cadastrada, e o projeto dele ainda não existe.
    */
    client: 'Mariana',
    project_label: 'Terreno Rua T-55 — estudo de viabilidade',
    address: 'Rua T-55, 820, Setor Bueno\nGoiânia – Goiás, Brasil',
    city: 'Goiânia',
    state: 'Goiás',
    land_area_m2: 620,
    visual_status: 'not_started',
    land_types: ['Terreno'],
    purposes: ['Investimento'],
  },
  {
    key: 'jardim_goias',
    // Av. Deputado Jamel Cecílio, o corredor do Jardim Goiás.
    lat: -16.70792,
    lng: -49.23814,
    client: 'Rodrigo',
    project_label: 'Cobertura Jardim Goiás — Rodrigo',
    address: 'Avenida Deputado Jamel Cecílio, 2690, Jardim Goiás\nGoiânia – Goiás, Brasil',
    city: 'Goiânia',
    state: 'Goiás',
    // NENHUMA TAG e NENHUMA ÁREA: o pino que só marca onde é. Os dois filtros de
    // tag da tela precisam deixá-lo de fora sem sumir com ele do mapa.
    visual_status: 'paused',
    land_types: [],
    purposes: [],
  },
  {
    key: 'marista',
    // Avenida Portugal, Setor Marista — o endereço do Eduardo.
    lat: -16.69601,
    lng: -49.26534,
    client: 'Eduardo',
    project_label: 'Reforma apto Avenida Portugal 1240',
    address: 'Avenida Portugal, 1240, Setor Marista\nGoiânia – Goiás, Brasil',
    city: 'Goiânia',
    state: 'Goiás',
    // Só a área do projeto: apartamento não tem terreno. É o inverso do pino do
    // Alto de Pinheiros, e as duas colunas são nullable em separado.
    project_area_m2: 168,
    visual_status: 'in_development',
    // UMA tag ao todo, e ela é de finalidade: a lista de tipo de terreno fica
    // vazia sem que a de finalidade fique.
    land_types: [],
    purposes: ['Moradia'],
  },
  {
    key: 'vera_cruz',
    // Cidade Vera Cruz, no norte de Aparecida de Goiânia.
    lat: -16.79204,
    lng: -49.26138,
    client: 'Construtora Horizonte Norte',
    project_label: 'Geminadas Cidade Vera Cruz — 3 unidades',
    address: 'Rua VC-24, 180, Cidade Vera Cruz\nAparecida de Goiânia – Goiás, Brasil',
    city: 'Aparecida de Goiânia',
    state: 'Goiás',
    land_area_m2: 1200,
    project_area_m2: 540,
    subdivision_name: 'Residencial Vera Cruz II',
    subdivision_block: 'VC-4',
    subdivision_lot: '22',
    visual_status: 'in_development',
    // A tag "Loteamento fechado" é o que faz o bloco de loteamento aparecer no
    // popup (MapaProjetos.jsx:1213). Os três campos sem a tag seriam dado
    // gravado e nunca exibido.
    land_types: ['Loteamento fechado', 'Terreno'],
    purposes: ['Investimento', 'Comercial'],
  },
  {
    key: 'anapolis',
    // Distrito Agroindustrial de Anápolis (DAIA).
    lat: -16.3482,
    lng: -48.9089,
    client: 'Thiago',
    project_label: 'Galpão showroom — DAIA Anápolis',
    address: 'Rua VP 7-D, Quadra 12, Distrito Agroindustrial\nAnápolis – Goiás, Brasil',
    city: 'Anápolis',
    state: 'Goiás',
    land_area_m2: 3000,
    project_area_m2: 1200,
    visual_status: 'not_started',
    land_types: ['Comercial', 'Terreno'],
    purposes: ['Comercial', 'Investimento'],
  },
  {
    key: 'hidrolandia',
    // Rota da GO-040, entre Aparecida e Hidrolândia.
    lat: -16.91875,
    lng: -49.20542,
    /*
      OS DOIS LADOS POR RÓTULO. Nem projeto nem cliente estão cadastrados: é uma
      família que procurou o escritório e ainda não virou lead. Sem os labels, o
      pino apareceria como "Sem nome" (MapaProjetos.jsx:283).
    */
    project_label: 'Chácara Recanto do Cerrado — GO-040',
    client_label: 'Família Peixoto Bandeira',
    address: 'Rodovia GO-040, Km 24, Zona Rural\nHidrolândia – Goiás, Brasil',
    city: 'Hidrolândia',
    state: 'Goiás',
    land_area_m2: 20000,
    project_area_m2: 460,
    visual_status: 'paused',
    // O pino com MAIS tags: duas inventadas de terreno e três de finalidade.
    land_types: ['Chácara', 'Área rural'],
    purposes: ['Lazer', 'Moradia', 'Investimento'],
  },
  {
    key: 'oeste',
    // Rua 15, Setor Oeste.
    lat: -16.68251,
    lng: -49.27204,
    project_label: 'Retrofit de fachada — Rua 15',
    client_label: 'Condomínio Edifício Solar do Oeste',
    address: 'Rua 15, 405, Setor Oeste\nGoiânia – Goiás, Brasil',
    city: 'Goiânia',
    state: 'Goiás',
    project_area_m2: 2400,
    visual_status: 'completed',
    land_types: ['Comercial'],
    purposes: ['Comercial'],
  },
  {
    /*
      O PINO MÍNIMO — só o par de coordenadas, que é o único required da entidade.

      Sem endereço, sem cidade, sem estado, sem vínculo, sem rótulo, sem área,
      sem tag e SEM visual_status: a coluna cai no default 'not_started', que é o
      que este seed grava uma vez por rodada para provar que o default existe (e
      é por isso que o insert é linha a linha — em lote ele viraria NULL e a
      linha seria recusada).

      É o "terreno que o escritório está de olho" do COMMENT da tabela, e é o
      pino que o filtro "Cidade (pins geocodificados)" da tela precisa deixar de
      fora sem sumir com ele do mapa — o índice de cidade é parcial por causa
      dele.
    */
    key: 'bela_vista',
    // Bela Vista de Goiás, saída da GO-040.
    lat: -16.97138,
    lng: -48.95312,
    land_types: [],
    purposes: [],
  },
]

/*
  A geolocalização da obra, em projects.site_*.

  NÃO é o que o mapa desenha — ver o cabeçalho. Só os três projetos que têm
  contrato aparecem aqui: geocoding.jsx monta o endereço a partir do CONTRATO
  (buildObraAddress, :51), e o Alto de Pinheiros não tem um. Ele fica no default
  'pending' sem coordenada, e a conferência do fim cobra exatamente isso.
*/
const SITE_GEOCODES = [
  {
    project: 'Interiores Alphaville',
    /*
      Coordenada DIFERENTE da do pino do mapa, de propósito: o geocoder do Google
      resolveu a portaria do condomínio, e o pino foi posto a mão no lote. É a
      "Decisão 1" de docs/SCHEMA-PLAN.md em dois números — duas fontes, dois
      provedores, nenhuma sincronia.
    */
    site_lat: -16.71988,
    site_lng: -49.21745,
    site_place_id: 'ChIJT3zHqVGZWpMRy0YqB8XmY6A',
    site_geocode_status: 'ok',
    site_geocode_updated_at: daysFromNow(-7),
  },
  {
    project: 'Casa de campo Caldas Novas',
    site_lat: -17.74392,
    site_lng: -48.62498,
    site_place_id: 'ChIJhcQ2r4d6qJQR2mDnWq0Y8fk',
    site_geocode_status: 'ok',
    site_geocode_updated_at: daysFromNow(-372),
  },
  {
    /*
      FALHOU. Endereço de fazenda, sem número e sem CEP, é o que o geocoder não
      resolve — e geocoding.jsx:117 grava só o status e a data, sem coordenada.
      O check projects_site_geocode_ok_requires_coordinates_check permite este
      estado de propósito: o que ele proíbe é o inverso.

      site_address_text é escrito AQUI porque ele é a ENTRADA da geocodificação
      (COMMENT da coluna, 0032/0057) e sem ele "failed" não diz o que falhou. A
      limpeza do início desta rodada NÃO zera essa coluna — ela é do seed 05 nos
      outros projetos, e apagá-la seria este seed desfazendo o anterior.
    */
    project: 'Sede administrativa',
    site_address_text: 'Fazenda Vale do Araguaia, Rodovia BR-070, Km 12, Zona Rural, Aragarças - GO',
    site_geocode_status: 'failed',
    site_geocode_updated_at: daysFromNow(-2),
  },
]

async function main() {
  console.log(`\nSeed do módulo 9 (Mapa) — ${env.VITE_SUPABASE_URL}\n`)

  // 1. Trava de segurança -------------------------------------------------------
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
  const { data: projects } = await db.from('projects').select('id, name').eq('tenant_id', tenant.id)

  if (!clients?.length) fail('não há clientes. Rode: npm run seed:crm')
  if (!projects?.length) fail('não há projetos. Rode: npm run seed:projects')

  const findClient = (s) => clients.find((c) => c.name.startsWith(s))
  const findProject = (s) => projects.find((p) => p.name.startsWith(s))

  /*
    2. Limpeza — incondicional, de propósito.

    Mesma correção dos seeds 07 e 08: uma rodada que morre no meio deixa o banco
    num estado que uma checagem do tipo `if (previous)` lê como "vazio", e a
    rodada seguinte grava pino duplicado. Seed tem que ser re-executável a partir
    de qualquer meio-caminho.

    As duas tabelas de tag saem por cascade (FK composta com ON DELETE CASCADE,
    0057) — elas são parte do pino.

    Os oito campos site_* voltam ao estado de fábrica em TODOS os projetos do
    escritório, e não só nos três que este seed escreve: rodada anterior que
    tenha gravado 'ok' num projeto que hoje não está na lista deixaria uma
    coordenada órfã. site_address_text NÃO entra na limpeza — ela é do seed 05
    nos outros projetos.
  */
  const { count: prevProps } = await db
    .from('map_properties')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
  console.log(`  Apagando ${prevProps ?? 0} propriedades anteriores (as tags saem por cascade)...`)
  await db.from('map_properties').delete().eq('tenant_id', tenant.id)

  const { error: resetError } = await db
    .from('projects')
    .update({
      site_lat: null,
      site_lng: null,
      site_place_id: null,
      site_geocode_status: 'pending',
      site_geocode_updated_at: null,
      site_pin_manual: false,
      site_pin_updated_by: null,
      site_pin_updated_at: null,
    })
    .eq('tenant_id', tenant.id)
  if (resetError) fail(`limpar a geolocalização dos projetos: ${resetError.message}`)
  console.log('  Geolocalização de obra de todos os projetos zerada (volta ao default pending).')

  // 3. Propriedades e tags ------------------------------------------------------
  const property = {}
  let landTypeCount = 0
  let purposeCount = 0

  for (const p of PROPERTIES) {
    const { key, project: projectName, client: clientName, land_types, purposes, ...row } = p

    const projectRow = projectName ? findProject(projectName) : null
    if (projectName && !projectRow) {
      fail(`projeto "${projectName}" não existe. Rode: npm run seed:projects`)
    }
    const clientRow = clientName ? findClient(clientName) : null
    if (clientName && !clientRow) {
      fail(`cliente "${clientName}" não existe. Rode: npm run seed:crm`)
    }

    const created = await insertOne(
      'map_properties',
      {
        tenant_id: tenant.id,
        ...row,
        project_id: projectRow?.id,
        client_id: clientRow?.id,
      },
      'id, lat, lng, city, visual_status, project_id, project_label, client_id, client_label',
    )
    property[key] = created

    for (const landType of land_types ?? []) {
      await insertOne(
        'map_property_land_types',
        { tenant_id: tenant.id, map_property_id: created.id, land_type: landType },
        'id',
      )
      landTypeCount++
    }
    for (const purpose of purposes ?? []) {
      await insertOne(
        'map_property_purposes',
        { tenant_id: tenant.id, map_property_id: created.id, purpose },
        'id',
      )
      purposeCount++
    }
  }

  console.log(
    `  ${PROPERTIES.length} propriedades, ${landTypeCount} tags de terreno e ` +
      `${purposeCount} tags de finalidade gravadas.`,
  )

  // 4. Geolocalização da obra (projects.site_*) ---------------------------------
  for (const g of SITE_GEOCODES) {
    const { project: projectName, ...columns } = g
    const projectRow = findProject(projectName)
    if (!projectRow) fail(`projeto "${projectName}" não existe. Rode: npm run seed:projects`)

    const { error } = await db
      .from('projects')
      .update(columns)
      .eq('id', projectRow.id)
      .eq('tenant_id', tenant.id)
    if (error) fail(`geolocalizar o projeto "${projectName}": ${error.message}`)
  }
  console.log(`  ${SITE_GEOCODES.length} projetos geocodificados (os demais ficam em pending).\n`)

  /*
    ── Conferência, lida COMO GENTE ───────────────────────────────────────────

    Tudo daqui para baixo usa a sessão da Diretora e a chave publicável. Com a
    chave de serviço, RLS desligada e GRANT perdido passariam despercebidos: ela
    lê a tabela de qualquer jeito. Este é o único ponto do seed em que uma policy
    quebrada consegue falhar.
  */
  const asDirector = await signedInAsDirector()

  /*
    O embed traz as duas tabelas-filhas pela FK COMPOSTA (map_property_id,
    tenant_id). Ele está aqui não só por comodidade: é a consulta que a tela vai
    fazer, e se o PostgREST não conseguir resolver a relação composta, é melhor
    descobrir agora do que no hook.
  */
  const { data: pins, error: pinsError } = await asDirector
    .from('map_properties')
    .select(
      'id, lat, lng, city, state, visual_status, project_id, project_label, client_id, client_label, ' +
        'subdivision_name, subdivision_block, subdivision_lot, land_area_m2, project_area_m2, ' +
        'map_property_land_types(land_type), map_property_purposes(purpose)',
    )
    .order('created_at')
  if (pinsError) fail(`ler map_properties como Diretora: ${pinsError.message}`)
  if (pins.length !== PROPERTIES.length) {
    fail(`a Diretora leu ${pins.length} propriedades, e o seed gravou ${PROPERTIES.length}.`)
  }

  const { data: geo, error: geoError } = await asDirector
    .from('projects')
    .select('id, name, site_lat, site_lng, site_place_id, site_geocode_status, site_pin_manual')
    .order('display_order')
  if (geoError) fail(`ler a geolocalização dos projetos como Diretora: ${geoError.message}`)

  const pinOf = (key) => pins.find((p) => p.id === property[key].id)
  const label = (p) =>
    p.project_label ?? projects.find((x) => x.id === p.project_id)?.name ?? 'Sem nome'

  console.log('  map_properties (lidas com a chave publicável, na sessão da Diretora)\n')
  for (const p of PROPERTIES) {
    const pin = pinOf(p.key)
    if (!pin) fail(`a propriedade "${p.key}" não voltou na leitura da Diretora`)
    const tags = [
      ...pin.map_property_land_types.map((t) => t.land_type),
      ...pin.map_property_purposes.map((t) => t.purpose),
    ]
    const vinculo = pin.project_id ? 'projeto' : pin.project_label ? 'rótulo ' : '—      '
    const cliente = pin.client_id ? 'CRM   ' : pin.client_label ? 'rótulo' : '—     '
    console.log(
      `    ${String(pin.lat).padStart(10)}, ${String(pin.lng).padStart(10)}` +
        `  ${(pin.city ?? '—').padEnd(20)}` +
        `  ${pin.visual_status.padEnd(14)}` +
        `  proj:${vinculo} cli:${cliente}` +
        `  ${String(tags.length).padStart(2)} tag(s)` +
        `  ${label(pin)}`,
    )
  }

  /*
    A exclusividade vínculo/rótulo. Os dois checks da 0057 deveriam tornar isto
    impossível; se uma linha passar, o problema é o check, e o sintoma na tela
    seria um rótulo digitado sumindo sem aviso (o join vence, :283).
  */
  for (const pin of pins) {
    if (pin.project_id && pin.project_label) {
      fail(
        `a propriedade ${pin.id} tem project_id E project_label ("${pin.project_label}"). ` +
          'O check map_properties_project_link_exclusive_check deveria ter recusado a linha.',
      )
    }
    if (pin.client_id && pin.client_label) {
      fail(
        `a propriedade ${pin.id} tem client_id E client_label ("${pin.client_label}"). ` +
          'O check map_properties_client_link_exclusive_check deveria ter recusado a linha.',
      )
    }
  }
  console.log('\n  OK: nenhum pino tem vínculo e rótulo ao mesmo tempo (nem de projeto, nem de cliente).')

  /*
    As tags voltaram junto com o pino? Confere contra o que o seed pediu, pino a
    pino — inclusive os dois que não têm tag nenhuma, onde o esperado é lista
    vazia e não ausência de propriedade no JSON.
  */
  let readLandTypes = 0
  let readPurposes = 0
  for (const p of PROPERTIES) {
    const pin = pinOf(p.key)
    const land = (pin.map_property_land_types ?? []).map((t) => t.land_type).sort()
    const purp = (pin.map_property_purposes ?? []).map((t) => t.purpose).sort()
    readLandTypes += land.length
    readPurposes += purp.length

    const wantLand = [...(p.land_types ?? [])].sort()
    const wantPurp = [...(p.purposes ?? [])].sort()
    if (land.join('|') !== wantLand.join('|') || purp.join('|') !== wantPurp.join('|')) {
      fail(
        `as tags do pino "${p.key}" não voltaram com ele no embed. ` +
          `Esperado terreno [${wantLand}] e finalidade [${wantPurp}]; ` +
          `veio terreno [${land}] e finalidade [${purp}].`,
      )
    }
  }
  if (readLandTypes !== landTypeCount || readPurposes !== purposeCount) {
    fail(
      `o embed devolveu ${readLandTypes} tags de terreno e ${readPurposes} de finalidade; ` +
        `o seed gravou ${landTypeCount} e ${purposeCount}.`,
    )
  }
  console.log(
    `  OK: as ${readLandTypes + readPurposes} tags voltaram no embed pela FK composta, ` +
      'inclusive as listas vazias dos dois pinos sem tag.',
  )

  // O universo de tags que os filtros da tela vão montar.
  const allLand = [...new Set(pins.flatMap((p) => p.map_property_land_types.map((t) => t.land_type)))]
  const allPurposes = [...new Set(pins.flatMap((p) => p.map_property_purposes.map((t) => t.purpose)))]
  console.log(`\n  Tipos de terreno em uso:  ${allLand.sort().join(', ')}`)
  console.log(`  Finalidades em uso:       ${allPurposes.sort().join(', ')}`)

  const cities = [...new Set(pins.map((p) => p.city).filter(Boolean))].sort()
  const semCidade = pins.filter((p) => !p.city).length
  console.log(
    `  Cidades no filtro:        ${cities.join(', ')}` +
      `  (+ ${semCidade} pino sem cidade, fora do filtro de propósito)`,
  )

  /*
    A geolocalização da obra. O check
    projects_site_geocode_ok_requires_coordinates_check já barra "ok sem
    coordenada" na escrita; conferir na LEITURA é o que pega o dia em que alguém
    largar o check para trás numa migration futura — e o sintoma seria o
    formulário de projeto exibindo "Localização: null, null".
  */
  console.log('\n  projects.site_* (a OUTRA fonte de "onde a obra fica", que o mapa não lê)')
  for (const p of geo) {
    const coord = p.site_lat === null ? '—' : `${p.site_lat}, ${p.site_lng}`
    console.log(
      `    ${p.name.padEnd(40)} ${p.site_geocode_status.padEnd(8)}` +
        `  ${coord.padEnd(22)}` +
        `  pin manual: ${p.site_pin_manual ? 'sim' : 'não'}`,
    )
    if (p.site_geocode_status === 'ok' && (p.site_lat === null || p.site_lng === null)) {
      fail(
        `o projeto "${p.name}" está com site_geocode_status = 'ok' e sem coordenada. ` +
          'O check projects_site_geocode_ok_requires_coordinates_check existe para isso.',
      )
    }
  }

  const pinheiros = geo.find((p) => p.name.startsWith('Residência Alto de Pinheiros'))
  if (!pinheiros || pinheiros.site_geocode_status !== 'pending' || pinheiros.site_lat !== null) {
    fail(
      'o projeto sem contrato deveria estar em pending e sem coordenada — é o default da coluna ' +
        'e a verdade de todo projeto que a geocodificação nunca visitou.',
    )
  }
  console.log(
    '\n  OK: os dois projetos "ok" têm coordenada, o "failed" não tem, e o projeto sem contrato\n' +
      '  ficou no default pending — este seed não o tocou.\n',
  )

  const alphavillePin = pinOf('alphaville')
  const alphavilleProject = geo.find((p) => p.name.startsWith('Interiores Alphaville'))
  console.log(
    '  As duas fontes de localização do MESMO projeto, lado a lado (Decisão 1, e é assim mesmo):\n' +
      `    map_properties  ${alphavillePin.lat}, ${alphavillePin.lng}   (clique no mapa, Nominatim)\n` +
      `    projects.site_* ${alphavilleProject.site_lat}, ${alphavilleProject.site_lng}   (endereço do contrato, Google)\n`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
