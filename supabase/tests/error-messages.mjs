// Toda restrição que o usuário alcança precisa de mensagem em português.
//
// COMO RODAR
//   npm run test:errors
//
// POR QUE ESTE ARQUIVO EXISTE
//   O cliente esbarrou em "Não foi possível concluir a operação. Se continuar,
//   avise o suporte." quando a causa real era CPF já usado por outro cadastro.
//   A recusa estava certa; a tela é que não sabia explicá-la.
//
//   O mecanismo de mensagem por nome de constraint (src/lib/db-errors.ts) já
//   existia e funciona. O que faltava era saber QUANDO falta uma — e isso não se
//   descobre lendo código, porque a lista de restrições mora no banco e as
//   frases moram no frontend. Enquanto ninguém cruzava as duas, cada migration
//   nova podia acrescentar um beco sem saída sem que nada acusasse.
//
// O QUE ELE AFIRMA
//   Cruza as restrições de `public` com os mapas de `src/features/*/hooks.ts` e
//   `src/lib/db-errors.ts`, e falha quando aparece uma restrição ALCANÇÁVEL que
//   não tem frase nem declaração de por que não precisa.
//
// O QUE É "ALCANÇÁVEL", E POR QUE A REGRA É ESTA
//   Não é opinião: sai da própria definição da restrição.
//
//   - Chave primária e `unique (id, tenant_id)`: estruturais. Ninguém digita um
//     uuid repetido; elas existem para as FK compostas apontarem.
//   - FK com `on delete cascade` ou `set null`: apagar o pai NÃO levanta erro,
//     levanta o filho junto. Não há o que explicar na tela.
//   - FK sem cascade: apagar o pai FALHA, e é o gesto mais comum de dar errado
//     no sistema (excluir cliente, colaborador, projeto). Precisa de frase.
//   - Unicidade de negócio: alcançável por definição — é o usuário digitando a
//     mesma coisa duas vezes.
//
// OS CHECKS SÃO DÍVIDA DECLARADA, COM TETO
//   119 checks, e a maioria é barrada antes pelo Zod, com mensagem de campo. Mas
//   "a maioria" não é "todos", e não dá para afirmar caso a caso sem revisar os
//   119 um a um. Então este teste NÃO exige frase para check — ele congela o
//   número atual e falha se ele CRESCER. Dívida que não pode aumentar é dívida
//   sob controle; dívida sem número é dívida que ninguém lembra.
//
//   Quem escrever migration nova com check que o formulário não cobre vai ver
//   este teste falhar, e aí decide: escreve a frase ou aumenta o teto com
//   justificativa. As duas coisas são melhores que descobrir pelo cliente.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/*
  TETO DOS CHECKS SEM FRASE. Medido em 2026-08-11, depois de escrever as frases
  das unicidades e das exclusões bloqueadas: 113 de 119 checks seguem sem frase
  própria. Só se mexe para BAIXO, ou para cima com o motivo escrito aqui do lado.

  2026-08-13 — SOBE PARA 133. As migrations 0068-0069 (módulo 11, Diário do
  Projeto) acrescentam VINTE checks nas cinco tabelas novas, e nenhum deles é
  alcançável pelo formulário da linha do tempo:

  - oito em `project_diary_entries`, e SETE deles falam de colunas que tela
    nenhuma escreve — `is_automatic`, `event_key`, `system_event`, `from_phase`,
    `to_phase`, `operational_tag`. Quem as grava é `record_project_diary_event`,
    função SECURITY DEFINER que monta a linha por dentro; a policy de INSERT
    recusa `is_automatic` para todo mundo (migration 0070). O oitavo é o título
    em branco, que `diaryEntryInputSchema` barra com "Informe o título.";
  - onze em `project_site_visits`, `project_issues` e `project_issue_events`,
    que são as tabelas da FATIA 2 — nenhuma tela as escreve ainda. Quem
    escrever os formulários de visita e de pendência responde por eles: o teto
    volta a subir ou as frases aparecem, e este teste acusa a diferença;
  - um em `project_diary_files` (`byte_size > 0`), evitado no hook, que manda
    nulo quando o arquivo tem zero byte; e os de texto em branco, que não têm
    caminho de escrita (nome e caminho vêm do arquivo escolhido e de um uuid).

  O arco exclusivo (`num_nonnulls(entry_id, visit_id, issue_id) = 1`) é o único
  cuja violação seria bug nosso, e não gesto de quem usa — a frase não teria a
  quem falar.

  2026-08-13 — DESCE PARA 125. A fatia 2 do módulo 11 trouxe as telas de visita e
  de pendência, e com elas as OITO frases que a linha acima cobrava: o resumo em
  branco da visita, a descrição em branco da pendência, o prazo anterior à
  identificação, os dois lados da resolução (`resolved_at` × status e
  `resolved_by` sem resolução), o número da pendência positivo e os dois de
  `project_issue_events`. Estão em `src/features/diary/hooks.ts`, e a maioria
  delas o schema Zod barra antes — a frase existe para o que não passa pelo
  formulário.
*/
const TETO_CHECKS_SEM_FRASE = 125

/*
  Restrições que o usuário não alcança, uma a uma e com o motivo. Padrão que
  engole tudo não vale: a graça do teste é justamente o que sobra.
*/
const NAO_ALCANCAVEL = {
  client_intakes_token_key:
    'o token tem gen_random_uuid() no default e o INSERT nem menciona a coluna — não há caminho de escrita que escolha o valor',
  budget_item_approval_files_tenant_id_file_path_key:
    'o caminho do objeto é montado com uuid pelo hook de upload, nunca digitado',
  tenants_slug_key:
    'escritório só nasce por scripts/create-tenant.mjs, que recusa slug repetido com mensagem própria antes de tentar gravar',
  tenant_email_domains_domain_key:
    'domínio só é cadastrado pelo mesmo comando, que já explica a recusa',
  collaborator_permissions_menu_key_fkey:
    'a chave de menu vem de uma lista fechada do próprio sistema, nunca de digitação',
  menus_parent_key_fkey: 'o catálogo de menus é fixo, criado por migration',
  accounts_payable_recurrence_parent_id_fkey:
    'a linha-mãe da recorrência é escolhida pelo hook, não pela tela; e a exclusão da série é feita pelo caminho próprio',
  negotiation_owner_history_changed_by_id_fkey:
    'histórico de troca de responsável é escrito pelo sistema, e apagar colaborador já é barrado antes pelas frases de projeto e negociação',
  negotiation_owner_history_new_owner_id_fkey: 'idem',
  negotiation_owner_history_previous_owner_id_fkey: 'idem',
  projects_site_pin_updated_by_fkey:
    'coluna sem escritor: nenhuma tela ajusta pino de obra (ver 0057 e o comentário de useGeocodeProjectSite)',
  budget_checklist_items_chosen_supplier_id_fkey:
    'apagar fornecedor já é explicado por supplier_brands e budget_item_quotes, que aparecem primeiro',
  budget_item_quotes_supplier_id_fkey:
    'mesma exclusão, e a frase de fornecedor já cobre o gesto',
  contracts_negotiation_id_fkey:
    'negociação não é excluída depois de virar contrato; o gesto não existe na tela',
  activities_client_id_fkey: 'coberta pela frase de mesmo nome em CRM_ERROR_MESSAGES',
  project_diary_entries_tenant_id_event_key_key:
    'a chave de idempotência do evento automático só é escrita por record_project_diary_event, que trata a colisão com ON CONFLICT DO NOTHING e devolve already_recorded — o conflito é o comportamento desejado, não erro; registro manual vai com a chave nula, e nulo não colide',
  project_diary_files_tenant_id_file_path_key:
    'o caminho do objeto é montado com uuid pelo hook de upload, nunca digitado — mesma razão de budget_item_approval_files',
  project_issues_project_id_issue_number_key:
    'o número da pendência é alocado pelo trigger project_issues_assign_number sob advisory lock por projeto, e nenhuma tela oferece o campo; a unicidade existe para barrar número passado a mão pela API, caminho que não existe no frontend',
  project_site_visits_tenant_id_diary_entry_id_key:
    'o vínculo visita↔entrada de diário é gravado pelo hook que cria as duas juntas, nunca escolhido na tela; duas visitas reivindicarem a mesma entrada seria bug nosso, não gesto de quem usa',
}

function falhar(mensagem) {
  console.error(`\n  ABORTADO: ${mensagem}\n`)
  process.exit(1)
}

function carregarEnv() {
  const env = { ...process.env }
  try {
    for (const linha of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      /* O .env do ambiente ATIVO vence o shell — ver npm run env:prod|env:dev.
         O contrario deixava um SUPABASE_ACCESS_TOKEN exportado numa sessao
         antiga sobreviver a troca de ambiente, autenticando numa conta enquanto
         o resto apontava para o projeto da outra. */
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env opcional */
  }
  return env
}

const env = carregarEnv()

/*
  As frases saem da LEITURA dos arquivos, e não de um registro paralelo.

  Registro paralelo é a mesma informação em dois lugares, e o segundo envelhece
  no dia em que alguém acrescenta uma frase e esquece dele — que é exatamente o
  tipo de divergência que este teste existe para impedir. Ler o arquivo tem o
  custo de depender do formato (`  nome_da_constraint:` com dois espaços de
  indentação, que é o que o Prettier produz nesses mapas); em troca, frase nova
  é reconhecida sem ninguém avisar nada.
*/
/*
  SÓ OS MAPAS DE MENSAGEM CONTAM, e a restrição é o conserto de um furo.

  A varredura antiga pegava qualquer chave com dois espaços de indentação
  terminada em `_key`/`_check`/`_fkey`, em qualquer lugar do arquivo. Isso passou
  a ser errado no dia em que nasceu o primeiro objeto que apenas NOMEIA
  restrições sem explicá-las — `CONSTRAINT_FIELD`, no CRM, que mapeia o nome do
  índice para o campo do formulário. Uma restrição listada ali passava a contar
  como "tem frase" sem que nenhuma frase existisse, e o teste dizia que o usuário
  estava coberto quando não estava. Foi pego por mutação: apagar a mensagem do
  telefone não derrubou nenhum caso.

  A fonte da verdade é o TIPO: mapa de mensagem é `: DatabaseErrorMessages = {`.
  O bloco vai até a primeira linha que fecha na coluna zero, que é como todos
  eles são escritos.
*/
function mapasDeMensagem(texto) {
  const blocos = []
  const linhas = texto.split('\n')
  let dentro = null

  for (const linha of linhas) {
    if (dentro === null) {
      if (/:\s*DatabaseErrorMessages\s*=\s*\{/.test(linha)) dentro = []
      continue
    }
    if (linha === '}') {
      blocos.push(dentro.join('\n'))
      dentro = null
      continue
    }
    dentro.push(linha)
  }

  return blocos
}

function frasesDoFrontend() {
  const arquivos = [resolve(ROOT, 'src/lib/db-errors.ts')]
  const base = resolve(ROOT, 'src/features')
  for (const feature of readdirSync(base)) {
    const caminho = resolve(base, feature, 'hooks.ts')
    try {
      readFileSync(caminho)
      arquivos.push(caminho)
    } catch {
      /* feature sem hooks.ts */
    }
  }

  const nomes = new Set()
  for (const arquivo of arquivos) {
    for (const bloco of mapasDeMensagem(readFileSync(arquivo, 'utf8'))) {
      for (const m of bloco.matchAll(/^ {2}([a-z][a-z0-9_]*(?:_key|_check|_fkey)):/gm)) {
        nomes.add(m[1])
      }
    }
  }
  return nomes
}

async function restricoesDoBanco() {
  if (!env.SUPABASE_ACCESS_TOKEN) {
    falhar('SUPABASE_ACCESS_TOKEN ausente (vem do direnv). Sem ele não dá para ler as restrições.')
  }
  const ref = env.SUPABASE_PROJECT_REF
  if (!ref) falhar('SUPABASE_PROJECT_REF ausente no .env.')

  /*
    SÓ LEITURA — esta consulta pergunta o que existe, não muda nada.

    DUAS FONTES, e a segunda quase ficou de fora. `pg_constraint` não enxerga
    índice único PARCIAL, e a deduplicação de cliente (migration 0065) é
    exatamente isso: `unique ... where legacy_id is null`. É a restrição que o
    cliente esbarrou e que originou este teste.

    A primeira versão daqui consultava só `pg_constraint`, passava com folga, e
    era vazia justamente no caso que motivou tudo: apagar a frase do CPF
    duplicado não derrubava nada. Foi pego por mutação, não por leitura — por
    isso a segunda metade do UNION.
  */
  const query = `
    select c.conname as nome, t.relname as tabela,
      case c.contype when 'c' then 'check' when 'u' then 'unique'
                     when 'f' then 'fkey' else 'pk' end as tipo,
      case c.confdeltype when 'c' then 'cascade' when 'n' then 'set null' else 'sem cascade' end as ao_apagar
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'

    union all

    select i.relname as nome, t.relname as tabela, 'unique' as tipo, '' as ao_apagar
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and x.indisunique
      and not exists (select 1 from pg_constraint c where c.conindid = i.oid)

    order by 2, 1`

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) falhar(`Management API devolveu ${res.status} ao ler as restrições.`)

  const linhas = await res.json()
  if (!Array.isArray(linhas)) falhar(`resposta inesperada da Management API: ${JSON.stringify(linhas).slice(0, 200)}`)
  return linhas
}

function estrutural(c) {
  if (c.tipo === 'pk') return true
  /* `unique (id, tenant_id)`: existe para as FK compostas apontarem. */
  if (c.tipo === 'unique' && c.nome.endsWith('_id_tenant_id_key')) return true
  /*
    `unique (tenant_id, legacy_id)`: a chave de idempotência da importação.
    `legacy_id` guarda o id da linha no base44 e é escrito SÓ por
    scripts/import-base44.mjs — nenhuma tela oferece o campo, ninguém digita.
    Colidir aqui significa a importação tentando gravar a mesma linha de origem
    duas vezes, e quem lê essa mensagem é quem roda o script, não o escritório.
  */
  if (c.tipo === 'unique' && c.nome.endsWith('_tenant_id_legacy_id_key')) return true
  return false
}

async function main() {
  console.log('\nMensagem de erro por restrição\n')

  const restricoes = await restricoesDoBanco()
  const frases = frasesDoFrontend()

  const semFrase = []
  let checksSemFrase = 0
  let cobertas = 0
  let dispensadas = 0

  for (const c of restricoes) {
    if (estrutural(c)) continue
    /* FK que cascateia não chega à tela: o filho cai junto com o pai. */
    if (c.tipo === 'fkey' && c.ao_apagar !== 'sem cascade') continue

    if (frases.has(c.nome)) {
      cobertas += 1
      continue
    }
    if (NAO_ALCANCAVEL[c.nome]) {
      dispensadas += 1
      continue
    }
    if (c.tipo === 'check') {
      checksSemFrase += 1
      continue
    }
    semFrase.push(c)
  }

  console.log(`  com frase própria      ${cobertas}`)
  console.log(`  dispensadas com motivo ${dispensadas}`)
  console.log(`  checks sem frase       ${checksSemFrase}  (teto ${TETO_CHECKS_SEM_FRASE})`)

  let falhou = false

  if (semFrase.length) {
    falhou = true
    console.log(`\n  FALHA: ${semFrase.length} restrição(ões) que o usuário alcança e a tela não sabe explicar.`)
    console.log('  Escreva a frase no mapa da feature dona da tabela, ou declare em')
    console.log('  NAO_ALCANCAVEL (neste arquivo) por que o usuário não chega nela.\n')
    for (const c of semFrase) {
      const gesto =
        c.tipo === 'fkey'
          ? 'apagar o registro-pai falha'
          : 'o usuário digita a mesma coisa duas vezes'
      console.log(`    ${c.tabela.padEnd(28)} ${c.nome}`)
      console.log(`    ${''.padEnd(28)}   ${c.tipo} — ${gesto}`)
    }
  }

  if (checksSemFrase > TETO_CHECKS_SEM_FRASE) {
    falhou = true
    console.log(
      `\n  FALHA: checks sem frase subiram de ${TETO_CHECKS_SEM_FRASE} para ${checksSemFrase}.`,
    )
    console.log('  Migration nova trouxe check que a tela não sabe explicar. Escreva a frase,')
    console.log('  ou suba o teto neste arquivo com o motivo escrito ao lado.\n')
  }

  if (falhou) process.exit(1)

  console.log('\n  Tudo que o usuário alcança tem explicação em português.')
}

main().catch((erro) => falhar(erro.message))
