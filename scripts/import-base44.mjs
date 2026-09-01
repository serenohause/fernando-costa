#!/usr/bin/env node
// Importacao do dado REAL do base44 para o escritorio Fernando Costa.
//
// O QUE ESTE SCRIPT FAZ
//   Le os 17 CSV da pasta de exportacao (dado real de cliente: CPF/CNPJ,
//   endereco, telefone, valor de contrato, coordenada de residencia), cria o
//   tenant do escritorio real e grava as 32 tabelas na ordem de
//   docs/IMPORT-PLAN.md, secao 5 (as duas ultimas sao as do Diario do Projeto,
//   modulo 11). Depois cria as contas de login do time e confere o que gravou.
//
//   A PASTA OFICIAL E `banco/`. `db/` foi a primeira exportacao (06/08/2026) e
//   nao e mais usada: `banco/` (27/08/2026) contem os MESMOS ids do base44 mais
//   os novos, entao rodar por cima atualiza o que mudou e insere o que falta.
//   Medido na troca: 0 registros existiam so em db/, com uma unica excecao (um
//   colaborador que saiu do escritorio). Os arquivos sao achados por PREFIXO,
//   nao por nome exato - ver ENTITIES.
//
//   node scripts/import-base44.mjs --dir=banco   grava (pasta oficial)
//   node scripts/import-base44.mjs --dry-run  nao abre conexao de escrita:
//                                             so calcula e escreve o relatorio
//                                             de pendencias
//   node scripts/import-base44.mjs --skip-accounts   importa sem criar login
//
// O CSV NAO E VERSIONADO, ESTE SCRIPT E
//   db/ esta no .gitignore. Este arquivo esta no repositorio e por isso nao
//   pode conter nome, documento, endereco nem valor de nenhum cliente. Tudo
//   que identifica alguem sai em arquivo *.local, tambem ignorado pelo git:
//
//     scripts/import-pendencias.local          linhas recusadas, com motivo
//     scripts/credenciais-escritorio.local     logins criados, com senha (0600)
//
//   A saida do terminal e so contagem. Nada que identifique pessoa vai para o
//   stdout, porque terminal vira log, log vira anexo de mensagem.
//
// AS REGRAS QUE GOVERNAM O QUE ENTRA (revistas na SEGUNDA PASSADA)
//   O principio: nao inventar fato, mas tambem nao recusar dado por causa de
//   formato. Valor que existe e e verdadeiro entra, mesmo que precise de
//   traducao. Continua proibido gravar como verdade algo que ninguem registrou
//   — data de conclusao inventada, valor chutado, vinculo adivinhado.
//
//   1. Ponteiro ORFAO (aponta para um legacy_id que nao existe no export) em
//      coluna que aceita nulo entra como NULO, e a linha entra. A ausencia e a
//      verdade: a linha apontada nao existe em lugar nenhum. Vai para a secao
//      AJUSTES do relatorio, nunca em silencio. Em coluna NOT NULL continua
//      derrubando a linha.
//   2. Ponteiro em CASCATA (aponta para uma linha que existe no export e que
//      esta importacao recusou) continua derrubando a linha. O vinculo e real e
//      volta sozinho quando a raiz for destravada — o script e idempotente por
//      legacy_id, entao re-rodar recupera a cascata inteira.
//   3. Valor de lista fora do de/para de docs/ENUM-MAP.md nunca vira `other`
//      calado. Ou o de/para ganha a entrada (com o criterio escrito na doc), ou
//      a linha vai para pendencias.
//   4. Traducao de FORMATO (competencia "012026", parcela "n" sem total, prazo
//      0 querendo dizer "nao se aplica") e feita, e registrada nos AJUSTES.
//
//   A conferencia final continua sendo "consumidas + pendencias = total do CSV".
//   AJUSTES nao e pendencia: a linha entrou.
//
// A TERCEIRA PASSADA — A RESTRICAO PASSOU A DISTINGUIR IMPORTADO DE NASCIDO AQUI
//   As migrations 0061–0066 mudaram o BANCO, e este script foi destravado junto:
//   os guardas daqui espelhavam os checks antigos e continuavam recusando 445
//   das 539 linhas do relatorio de pendencias mesmo depois de o banco passar a
//   aceita-las.
//
//   A forma da mudanca no banco (docs/ARCHITECTURE.md, secao "A restricao
//   distingue dado importado de dado nascido aqui"): onde havia `check (X)`,
//   passou a haver `check (X or legacy_id is not null)`; onde havia NOT NULL que
//   a origem nao tinha como preencher, a obrigatoriedade virou check da mesma
//   familia; e onde havia unicidade que o base44 nunca teve, o indice unico
//   virou PARCIAL (`where legacy_id is null`) com um trigger fechando o caso
//   "linha nova colidindo com linha importada".
//
//   O QUE ISSO NAO E: nao e afrouxar o sistema. `legacy_id` so e preenchido por
//   este script — a tela nunca o preenche, entao tudo que ela criar continua
//   obrigado exatamente como antes. E onde a excecao larga seria perigosa, ela
//   foi ESTREITADA em vez de generalizada: recebivel importado aceita valor
//   ZERO e continua recusando negativo (0063), e este script espelha isso.
//
//   Cada guarda afrouxado aqui virou `g.note(...)`, e nao silencio: a linha
//   entra e a excecao usada sai no relatorio, linha a linha, na secao AJUSTES.
//
//   O QUE CONTINUA RECUSADO, e esta certo: as 94 collaborator_permissions de 7
//   pessoas que nao tem cadastro de colaborador. Nao e caso de restricao — a FK
//   nao tem onde pendurar, e criar a pessoa exigiria inventar e-mail (NOT NULL,
//   unico por escritorio) e funcao (NOT NULL, e e ela que define o que a pessoa
//   pode fazer). Duas das sete sao conta de teste declarada no proprio dado.
//   Recadastrada a pessoa, a reimportacao religa as linhas dela pelo legacy_id.
//
// AS DUAS DECISOES QUE O USUARIO TOMOU E QUE ESTAO CODIFICADAS AQUI
//   1. Item de checklist de tarefa concluido e sem data ENTRA. A migration 0060
//      derrubou o check que exigia data. `completed_at` fica nulo e significa
//      "concluido, e o quando nao foi registrado". Nenhuma data e inventada.
//   2. Conflito de permissao (o mesmo menu gravado duas vezes para a mesma
//      pessoa com valores contraditorios): vence o MAIS RESTRITIVO. Sao 44
//      conflitos em 17 pessoas. A regra antiga ("o mais permissivo", que estava
//      em docs/SCHEMA-PLAN.md e docs/ENUM-MAP.md) foi corrigida nas duas docs
//      junto com este script.
//
// A QUARTA PASSADA — ProjectTimelineEntry GANHOU DESTINO
//   As 36 linhas de ProjectTimelineEntry eram a unica entidade do export que
//   ficava de fora INTEIRA, e por um motivo que era verdadeiro na epoca: a
//   entidade nao aparece em nenhum arquivo de projeto-original/ e nao se
//   inventa tabela para dado sem destino (docs/IMPORT-PLAN.md, secao 7.1).
//
//   O modulo 11 descobriu de onde ela vem: nova-versao/, a exportacao mais
//   recente do MESMO base44, tem o Diario do Projeto — funcionalidade que o
//   escritorio criou depois do ponto em que esta migracao comecou e que a
//   versao migrada nao tinha. As migrations 0068-0071 criaram as cinco tabelas
//   e o bucket. O passo 31 traz as 36 linhas, e 5 delas sao anotacao manual
//   que nao existe em nenhum outro lugar.
//
// A QUINTA PASSADA — Task.tag_operacional GANHOU COLUNA
//   As 13 tags operacionais eram o ultimo campo do export recusado por falta de
//   destino: 7 "Em Revisao" e 6 "Aguardando Cliente", em Layout (4),
//   Perspectivas (5), Projeto Executivo (3) e Projeto Legal (1). O motivo da
//   recusa era verdadeiro (docs/IMPORT-PLAN.md, secao 8.1): o campo nao esta
//   declarado no Task.jsonc do projeto-original e nao aparece em nenhum arquivo
//   dele — alguem o criou direto no base44 e a aplicacao antiga nunca o leu.
//
//   A migration 0074 criou tasks.operational_tag, do tipo public.operational_tag
//   (que ja existia desde a 0068, compartilhado com o diario). A tag entra no
//   PROPRIO passo 17, como mais uma coluna do payload — nao ha passo novo: ela e
//   um campo da tarefa, e nao uma entidade.
//
//   E ela e a unica coluna deste passo OMITIDA do payload quando vazia, e nao
//   mandada como null. Mesmo motivo escrito no passo 31 (from_phase/to_phase/
//   operational_tag/visibility do diario): o upsert e por (tenant_id, legacy_id)
//   e chave ausente nao entra no SET do UPDATE, entao reexecutar a importacao
//   nao apaga a tag que alguem tenha marcado pela tela depois. Celula vazia no
//   CSV nao e "sem tag no banco": e "o CSV nao tem opiniao sobre esta tarefa".
//
// O QUE NAO E IMPORTADO, DE PROPOSITO
//   - Collaborator.senha_temporaria: FORA DE ESCOPO por decisao registrada em
//     docs/ARCHITECTURE.md — o original guarda senha em texto puro. A coluna
//     vem 100% vazia neste export, e mesmo assim o script a ignora
//     explicitamente (ver IGNORED_ON_PURPOSE): se um export futuro vier com o
//     campo preenchido, ele continua nao entrando.
//
// SEGURANCA
//   - Escreve com a service role key, que ignora RLS. Todo insert carrega
//     tenant_id explicito e a conferencia final aborta se alguma linha ficar
//     com tenant de outro escritorio.
//   - Nao cadastra tenant_email_domains para este escritorio. Ver a secao
//     "PRIMEIRO ACESSO" mais abaixo.
//   - Criar o escritorio real TRAVA os dez seeds de supabase/seed/. Isso e o
//     comportamento correto e esta explicado em supabase/seed/tenants.mjs.

import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
/*
  O de/para da visita de obra vem da FONTE UNICA dos rotulos (src/lib/enums.ts),
  invertido — o base44 grava o rotulo em portugues, e esses mapas ja sao a mesma
  lista que o formulario oferece. Repetir a tabela aqui criaria um segundo lugar
  para as duas divergirem, que e exatamente o que docs/ENUM-MAP.md existe para
  evitar.
*/
import { SITE_VISIT_STATUS, SITE_VISIT_TYPE } from '../src/lib/enums.ts'

const inverter = (mapa) => Object.fromEntries(Object.entries(mapa).map(([k, v]) => [v, k]))
const SITE_VISIT_TYPE_BY_LABEL = inverter(SITE_VISIT_TYPE)
const SITE_VISIT_STATUS_BY_LABEL = inverter(SITE_VISIT_STATUS)

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_ACCOUNTS = process.argv.includes('--skip-accounts')
const CSV_DIR = resolve(ROOT, process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? 'db')

// ---------------------------------------------------------------------------
// O escritorio real
// ---------------------------------------------------------------------------

// O `name` e o que aparece no topo da barra lateral, e a barra comporta cerca
// de 14 caracteres com o `tracking` do original (a decisao esta registrada em
// supabase/seed/tenants.mjs). "Fernando Costa" tem exatamente 14 e e o que o
// original mostra. O ambiente vive no SLUG, que e onde marcar ambiente serve
// para alguma coisa — os dois escritorios de teste carregam "-teste"; este,
// que e o real, nao carrega nada.
const TENANT_SLUG = 'fernando-costa'
const TENANT_NAME = 'Fernando Costa'

// Escritorios de teste. Este script nunca escreve neles; a checagem existe para
// que uma linha real nao caia num tenant de teste por engano de configuracao.
const TEST_TENANT_SLUGS = ['fernando-costa-teste', 'atelie-mirante-teste']

// PRIMEIRO ACESSO — por que tenant_email_domains NAO recebe entrada aqui
//   A descoberta por dominio (migration 0002) resolve o tenant a partir do
//   dominio do e-mail, e a unicidade de `domain` e GLOBAL, nao por tenant. Os
//   15 colaboradores deste escritorio usam 7 dominios: 8 gmail.com, 1
//   outlook.com, 1 hotmail.com, 2 creativearq.com.br (que e de OUTRO
//   escritorio), 1 shaus.com.br, 1 edu.unifor.br e 1 fernandocosta.com.
//   Cadastrar gmail.com rotearia qualquer pessoa com Gmail no mundo para este
//   escritorio, e impediria qualquer outro tenant de reivindicar o dominio.
//   Cadastrar creativearq.com.br daria entrada a terceiros identificaveis.
//   Por isso o caminho aqui e o outro: a conta e criada com senha definida na
//   criacao e vinculada ao colaborador por legacy_id (etapa 33), e o
//   auto-cadastro por dominio simplesmente nao e usado por este escritorio.
//   (A etapa mudou de numero quando o modulo 11 acrescentou dois passos de
//   dado antes dela; o que ela faz e o mesmo.)
const REGISTER_EMAIL_DOMAINS = false

// Campos que existem no CSV e que o script ignora de proposito. Nao e lista de
// documentacao: e o que o codigo consulta para dizer, no fim, quanto dado ficou
// para tras por decisao e nao por defeito.
const IGNORED_ON_PURPOSE = [
  ['Collaborator.senha_temporaria', 'senha em texto puro — fora de escopo (docs/ARCHITECTURE.md)'],
  ['Collaborator.user_auth_email', '100% vazio no export'],
  ['AccountPayable.generated_count', 'contador derivavel de recurrence_parent_id'],
  ['Atividade.tempo_total_minutos', 'coluna gerada no nosso schema'],
  ['Atividade.atividade_excluida', 'bandeira redundante com data_exclusao'],
  ['Negociacao.contrato_vinculado_number', 'numeracao morta (CTR-<timestamp>)'],
  ['Negociacao.projeto_vinculado_id', 'ligacao projeto<->negociacao nao existe no nosso schema'],
  ['Contract.file_url', '100% vazio e nao portado por decisao'],
  ['Client.email_norm / cpf_cnpj_norm / cliente_key', 'colunas geradas no nosso schema'],
  ['Project.progresso_percentual e contadores de tarefa', 'derivados, vivem na view project_progress'],
  ['ChecklistOrcamento.valor_total_*', 'derivados, vivem nas views da migration 0051'],
  ['Fornecedor.total_comissao_recebida', 'derivado'],
  ['ProjectTimelineEntry.project_name / responsavel_name', 'desnormalizacao do base44 — viram join'],
  ['ProjectTimelineEntry.criado_por_id / _name', 'identidade da plataforma base44, nao Collaborator'],
  ['ProjectTimelineEntry.atualizado_por_id / _name', 'idem — e nao ha e-mail para resolver o autor'],
  // `created_by` e o E-MAIL de quem gravou, e nas demais entidades ele nao
  // acrescenta nada ao que as colunas de responsavel ja dizem. A UNICA excecao
  // e ProjectTimelineEntry, onde ele e o unico caminho ate o autor do registro
  // (os ids de la sao da plataforma) — ver o passo 31.
  ['created_by / created_by_id / is_sample', 'identidade e metadado da plataforma base44'],
]

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

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
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.')
  process.exit(1)
}

const db = DRY_RUN
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function abort(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exitCode = 1
  throw new Error(`abort: ${message}`)
}

// ---------------------------------------------------------------------------
// CSV — parser escrito a mao (mesmo de scripts/analyze-import.mjs): sem
// dependencia nova, e o export tem virgula, aspas e quebra de linha DENTRO do
// valor (endereco vindo do Nominatim, observacao, e os campos que carregam
// JSON).
// ---------------------------------------------------------------------------

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false; i += 1; continue
      }
      field += c; i += 1; continue
    }
    if (c === '"') { quoted = true; i += 1; continue }
    if (c === ',') { row.push(field); field = ''; i += 1; continue }
    if (c === '\r') { i += 1; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue }
    field += c; i += 1
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  const header = rows.shift() ?? []
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? '') !== '')
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])))
}

/*
  As entidades esperadas, pelo PREFIXO do arquivo.

  Antes eram nomes exatos, e isso quebrou na segunda exportacao: o navegador
  acrescenta " (1)" e " (2)" quando o arquivo ja existe na pasta de downloads, e
  a pasta `banco/` chegou inteira com esses sufixos. Nome exato transforma um
  detalhe do navegador em erro de importacao, e o remendo obvio (renomear 19
  arquivos na mao) precisa ser refeito a cada exportacao nova.

  O prefixo `<Entidade>_export` e o que o base44 gera de fato; o resto do nome
  nao carrega informacao.
*/
const ENTITIES = [
  'Collaborator',
  'PermissoesUsuario',
  'SolicitacaoAcesso',
  'Client',
  'Negociacao',
  'ClientIntake',
  'Contract',
  'Project',
  'Task',
  'Atividade',
  'FinancialCategory',
  'AccountReceivable',
  'AccountPayable',
  'Fornecedor',
  'ChecklistOrcamento',
  'PropriedadeMapa',
  'ProjectTimelineEntry',
]

/*
  Entidades que so existem nas exportacoes NOVAS. Ausentes, entram como lista
  vazia em vez de derrubar a importacao: `db/` (06/08/2026) nao tinha nenhuma
  das duas, e exigir arquivo que a exportacao antiga nao gera transformaria
  "pasta mais velha" em erro.
*/
const ENTITIES_OPCIONAIS = ['ProjectSiteVisit']

/*
  `ProjectIssue` NAO entra: veio com 0 bytes — o escritorio nao registrou
  pendencia nenhuma no base44. Fica listada no relatorio para a ausencia ser
  dita em voz alta, e nao confundida com "importei".
*/
const NAO_IMPORTADAS = ['ProjectIssue']

function acharArquivo(entity) {
  const candidatos = readdirSync(CSV_DIR)
    .filter((nome) => nome.startsWith(`${entity}_export`) && nome.endsWith('.csv'))
    /* Mais de um: fica o mais recente por data de modificacao. Baixar de novo
       gera " (2)" ao lado do " (1)", e o antigo nao deve vencer. */
    .sort((a, b) => statSync(join(CSV_DIR, b)).mtimeMs - statSync(join(CSV_DIR, a)).mtimeMs)

  return candidatos[0] ?? null
}

const csv = {}
for (const entity of ENTITIES) {
  const arquivo = acharArquivo(entity)
  if (!arquivo) {
    console.error(`FALTA: nenhum ${entity}_export*.csv em ${CSV_DIR}`)
    process.exit(1)
  }
  csv[entity] = parseCsv(readFileSync(join(CSV_DIR, arquivo), 'utf8'))
}
for (const entity of ENTITIES_OPCIONAIS) {
  const arquivo = acharArquivo(entity)
  csv[entity] = arquivo ? parseCsv(readFileSync(join(CSV_DIR, arquivo), 'utf8')) : []
}

const idsOf = (rows) => new Set(rows.map((r) => r.id))

// ---------------------------------------------------------------------------
// De/para de docs/ENUM-MAP.md. Chave = texto exato gravado no base44.
// Copia deliberada de scripts/analyze-import.mjs: o de/para e descartavel
// depois que a importacao terminar, e um import cruzado entre dois scripts
// descartaveis so adia a limpeza.
// ---------------------------------------------------------------------------

const ENUMS = {
  collaborator_role: {
    Diretor: 'director', Coordenador: 'coordinator', Administrativo: 'admin_staff',
    Financeiro: 'finance', Arquiteto: 'architect', 'Estagiário': 'intern',
  },
  collaborator_area: {
    Comercial: 'commercial', Projetos: 'projects', Operacional: 'operations',
    Administrativo: 'administrative', Financeiro: 'finance',
  },
  collaborator_status: { Ativo: 'active', 'Férias': 'vacation', Afastado: 'on_leave' },
  access_request_status: { Pendente: 'pending', Aprovada: 'approved', Recusada: 'rejected' },
  lead_source: {
    Instagram: 'instagram', 'Indicação': 'referral', Site: 'website', Outros: 'other',
    // SEGUNDA PASSADA: WhatsApp e canal real do escritorio e a lista fechada do
    // base44 nao o tem. `other` e o valor que a propria lista oferece para
    // "canal que nao esta aqui" — e agora esta escrito no ENUM-MAP, entao nao e
    // mais um `other` calado. Criar `whatsapp` seria migration de enum.
    WhatsApp: 'other',
  },
  client_type: {
    'Pessoa Física': 'individual', 'Pessoa Jurídica': 'company',
    // SEGUNDA PASSADA: `Lead` nao e tipo de pessoa, e estagio de funil — e o
    // funil ja vive em negotiations. A coluna aceita nulo, e nulo aqui diz
    // exatamente o que se sabe: o tipo de pessoa nao foi informado.
    Lead: null, lead: null,
  },
  service_type: {
    Arquitetura: 'architecture', Interiores: 'interiors', Estrutura: 'structural',
    'Hidrosanitário': 'plumbing', 'Elétrico': 'electrical', Consultoria: 'consulting',
    // SEGUNDA PASSADA: rotulo de Contract usado em campo de servico. Mesmo
    // conceito, grafia da outra entidade.
    'Projeto de Arquitetura': 'architecture',
    // SEGUNDA PASSADA: `Complementares` e o guarda-chuva de Estrutura +
    // Hidrosanitario + Eletrico, e na unica linha em que aparece os TRES ja
    // estao listados um a um ao lado dele. Expandir em tres linhas inventaria
    // tres servicos onde o escritorio registrou um rotulo; mapear para um deles
    // escolheria por conta propria. Nao vira linha, e o registro fica nos
    // AJUSTES.
    Complementares: null,
  },
  client_intake_status: { Ativo: 'active', Expirado: 'expired', Enviado: 'submitted' },
  client_intake_validation_status: {
    CRIADO: 'created', OK: 'ok', EXPIRADO: 'expired', ENVIADO: 'already_submitted',
    EXPIRADO_NO_ENVIO: 'expired_on_submit',
    // 1 das 42 linhas tem o campo vazio. `created` e o que aconteceu com ela:
    // o link foi criado e nunca foi aberto, igual as outras 41.
    '': 'created',
  },
  negotiation_status: { Ativa: 'active', Ganha: 'won', Perdida: 'lost' },
  funnel_stage: {
    'Lead recebido': 'lead_received', Qualificado: 'qualified',
    'Proposta enviada': 'proposal_sent', 'Em negociação': 'negotiating', Fechamento: 'closing',
  },
  lead_origin: {
    Instagram: 'instagram', 'Indicação': 'referral', Site: 'website',
    Evento: 'event', Outro: 'other',
  },
  loss_reason: {
    Valor: 'price', Prazo: 'timeline', 'Escolheu outro escritório': 'chose_competitor',
    'Vai adiar o projeto': 'postponed', 'Não respondeu': 'no_response', Outro: 'other',
  },
  contract_type: {
    'Projeto de Arquitetura': 'architecture',
    'Projeto de Arquitetura + Complementares': 'architecture_engineering',
    'Projeto de Arquitetura + Interiores': 'architecture_interiors',
    Todos: 'full',
    Arquitetura: 'architecture',
    'Arquitetura + Complementares': 'architecture_engineering',
    'Arquitetura + Interiores': 'architecture_interiors',
  },
  billing_type: {
    'Por Fases': 'by_phase', 'Parcelado mensal': 'monthly_installments',
    'À vista': 'upfront', '% sobre obra': 'percent_of_construction',
  },
  contract_status: {
    'Em negociação': 'negotiating', Aprovado: 'approved', 'Em execução': 'in_progress',
    'Concluído': 'completed', Rescindido: 'terminated',
  },
  installment_frequency: {
    Mensal: 'monthly', Quinzenal: 'biweekly', Semanal: 'weekly', 'Única': 'single',
  },
  project_status: {
    'Prospecção': 'prospecting', 'Em contrato': 'under_contract',
    'Em desenvolvimento': 'in_development', 'Em aprovação': 'in_approval',
    'Concluído': 'completed', Suspenso: 'suspended',
  },
  project_phase: {
    'Não iniciado': 'not_started', Briefing: 'briefing', Layout: 'layout',
    Perspectivas: 'renderings', 'Revisão': 'revision', 'Projeto Legal': 'legal_permit',
    'Aprovação Condomínio': 'hoa_approval', 'Projeto Executivo': 'construction_docs',
    'Projetos Complementares': 'engineering_docs', 'Alvará de Construção': 'building_permit',
    'Aguardando Cliente': 'awaiting_client', Finalizado: 'finished',
    'Pós-aprovação': 'post_approval',
    // SEGUNDA PASSADA — tres fases que a operacao usa e que o base44 nunca
    // declarou. O criterio e o significado no dominio, conferido contra o
    // titulo das tarefas que carregam cada uma:
    //
    //   `Estudo preliminar` (18): primeira fase de projeto, a mesma que o
    //   contrato chama de prazo_estudo_layout -> layout_study_days. As tarefas
    //   sao as de abertura ("Iniciar projeto - <cliente>", "<numero> -
    //   <cliente>"). Briefing e a coleta com o cliente, que vem antes; o estudo
    //   preliminar E o estudo de layout.
    'Estudo preliminar': 'preliminary_study',
    //   `Anteprojeto` (3): fase seguinte ao estudo preliminar na NBR 13532, e
    //   as tres tarefas sao "Modelar volumetria no SketchUp", "Detalhar fachada
    //   frontal" e uma de cliente — trabalho de volumetria 3D, que nesta lista
    //   e Perspectivas.
    Anteprojeto: 'preliminary_design',
    //   `Executivo` (1): forma curta de Projeto Executivo. A tarefa e
    //   "Compatibilizacao estrutural", que so existe no executivo.
    Executivo: 'construction_docs',
    //
    // TERCEIRA PASSADA — `Em Obra` (14 tarefas) tem valor proprio desde a
    // migration 0061, que acrescentou `under_construction` ao enum depois de
    // `building_permit`. Nao e traducao: o valor foi criado PORQUE nenhum dos
    // treze anteriores significava obra (`building_permit` e o alvara, nao a
    // obra; `post_approval` e barrado em tasks pelo check da 0049). O de/para so
    // reflete o que o banco passou a ter.
    'Em Obra': 'under_construction',
  },
  geocode_status: { PENDING: 'pending', OK: 'ok', FAILED: 'failed', '': 'pending' },
  priority_level: { Baixa: 'low', 'Média': 'medium', Alta: 'high', Urgente: 'urgent' },
  work_status: {
    'Não iniciado': 'not_started', 'Não iniciada': 'not_started',
    'Em andamento': 'in_progress', 'Concluída': 'completed',
    // SEGUNDA PASSADA — quatro linhas de Task com status que a operacao digitou
    // e a entidade nao declara. O enum tem tres estados, e cada um destes cai
    // em um deles sem ambiguidade:
    //   `A fazer` = a fazer = ainda nao comecou.
    'A fazer': 'not_started',
    //   `Em revisão` e `Em espera cliente` sao trabalho JA em curso e ainda nao
    //   concluido. Nenhum dos dois e "nao iniciado" e nenhum e "concluida".
    //   Os dois perdem a nuance de "parada esperando alguem" AQUI, no status —
    //   mas ela deixou de se perder no dado: desde a migration 0074 ela vive em
    //   tasks.operational_tag, alimentada por Task.tag_operacional (ver o enum
    //   operational_tag logo abaixo). A traducao do status continua sendo
    //   registrada nos AJUSTES.
    'Em revisão': 'in_progress', 'Em espera cliente': 'in_progress',
  },
  // QUINTA PASSADA — a tag operacional da tarefa. Os dois valores sao os que
  // Task.jsonc da nova-versao declara, e sao os unicos que aparecem nas 13
  // linhas preenchidas do export (7 "Em Revisão", 6 "Aguardando Cliente"). O
  // de/para nao ganha entrada por conveniencia: valor fora daqui derruba a
  // tarefa para pendencias, como em qualquer outro enum deste script.
  operational_tag: {
    'Em Revisão': 'in_review', 'Aguardando Cliente': 'awaiting_client',
  },
  task_type: {
    'Técnica': 'technical', 'Reunião': 'meeting', 'Revisão': 'review',
    Administrativo: 'administrative',
  },
  // "Em atraso" nao vira valor do enum: e forecast com vencimento passado, e a
  // tela calcula sozinha (ENUM-MAP, secao Financeiro).
  financial_status: {
    Previsto: 'forecast', Pago: 'paid', Negociado: 'renegotiated', 'Em atraso': 'forecast',
  },
  payment_method: {
    PIX: 'pix', Boleto: 'boleto', 'Cartão': 'card', TED: 'ted',
    'Espécie': 'cash', 'Débito automático': 'direct_debit',
  },
  expense_category: {
    Folha: 'payroll', Impostos: 'taxes', 'Escritório': 'office', Softwares: 'software',
    Marketing: 'marketing', Viagens: 'travel', Prestadores: 'contractors',
    Materiais: 'materials', Equipamentos: 'equipment', Outros: 'other',
  },
  recurrence_frequency: {
    Mensal: 'monthly', Bimestral: 'bimonthly', Trimestral: 'quarterly',
    Semestral: 'semiannual', Anual: 'annual',
  },
  recurrence_status: { Ativa: 'active', Pausada: 'paused', Encerrada: 'ended' },
  financial_category_type: { Receita: 'revenue', Despesa: 'expense' },
  cost_center: {
    Arquitetura: 'architecture', Interiores: 'interiors', Obra: 'construction',
    Mentoria: 'mentoring', Administrativo: 'administrative',
  },
  supplier_category: {
    'Cerâmica e Porcelanato': 'ceramics_porcelain', 'Metais e Louças': 'fixtures_sanitaryware',
    'Pedras Naturais': 'natural_stone', 'Iluminação Interna': 'indoor_lighting',
    'Iluminação Externa e Paisagismo': 'outdoor_lighting', Esquadrias: 'frames_openings',
    'Revestimento de Fachada': 'facade_cladding', 'Revestimento de Piscina': 'pool_cladding',
    'Automação Residencial': 'home_automation', 'Energia Solar': 'solar_energy',
    'Tintas e Texturas': 'paint_texture', Paisagismo: 'landscaping', Marcenaria: 'cabinetry',
    Madeira: 'wood', 'Estrutura e Fundação': 'structure_foundation',
    'Impermeabilização': 'waterproofing', 'Gesso e Drywall': 'drywall_plaster',
    'Elétrica e Hidráulica': 'electrical_plumbing', 'Climatização': 'hvac',
    'Vidros e Espelhos': 'glass_mirrors', Elevadores: 'elevators',
    'Bombas e Filtros de Piscina': 'pool_equipment', Outros: 'other',
  },
  partnership_model: {
    'Comissão sobre venda': 'sales_commission', 'Desconto no preço': 'price_discount',
    'Comissão + Desconto': 'commission_and_discount',
    'Exclusividade de especificação': 'spec_exclusivity', 'Sem parceria formal': 'none',
  },
  commission_payment_term: {
    'Na entrega do material': 'on_delivery', '30 dias após entrega': 'net_30_after_delivery',
    '60 dias após entrega': 'net_60_after_delivery',
    'Após pagamento do cliente': 'after_client_payment', 'A combinar': 'to_be_agreed',
  },
  partnership_tier: {
    'Estratégico': 'strategic', Preferencial: 'preferred', Cadastrado: 'registered',
    'Em avaliação': 'under_evaluation',
  },
  supplier_status: { Ativo: 'active', Inativo: 'inactive', 'Em negociação': 'negotiating' },
  budget_checklist_status: {
    Aberto: 'open', 'Em andamento': 'in_progress', 'Aguardando cliente': 'awaiting_client',
    'Concluído': 'completed', Cancelado: 'cancelled',
  },
  budget_item_status: {
    Pendente: 'pending', 'Em cotação': 'quoting', Cotado: 'quoted',
    'Apresentado ao cliente': 'presented_to_client', Aprovado: 'approved', Cancelado: 'cancelled',
  },
  map_visual_status: {
    'Não iniciado': 'not_started', 'Em desenvolvimento': 'in_development',
    Pausado: 'paused', 'Concluído': 'completed',
    // SEGUNDA PASSADA: 1 linha com `Em andamento`. Dentro dos quatro estados
    // deste enum (nao iniciado / em desenvolvimento / pausado / concluido),
    // "em andamento" so pode ser o segundo. A grafia veio de project_status,
    // que e enum vizinho e diferente — o significado, nao.
    'Em andamento': 'in_development',
  },
  // Diario do Projeto (modulo 11). Os tres de/para saem das declaracoes de
  // nova-versao/base44/entities/ProjectTimelineEntry.jsonc, e nao do que as 36
  // linhas por acaso trazem: o dado real usa 4 dos 10 tipos e 2 dos 3 status, e
  // um de/para escrito so pelo dado real recusaria em silencio a primeira linha
  // que usasse um dos outros.
  diary_entry_type: {
    'Solicitação do Cliente': 'client_request', 'Alteração de Projeto': 'project_change',
    'Decisão': 'decision', 'Reunião': 'meeting', 'Aprovação': 'approval',
    'Correção': 'correction', Entrega: 'delivery', 'Observação': 'note',
    Outro: 'other', Sistema: 'system',
  },
  diary_entry_status: {
    'Em andamento': 'in_progress', 'Concluído': 'completed', Cancelado: 'cancelled',
  },
  // A CHAVE AQUI E O PREFIXO DE `evento_chave`, e nao um valor de lista.
  //
  // No base44 a natureza do evento automatico nao existe como campo: ela vive
  // como prefixo de texto dentro de evento_chave ('fase:6a20...:1785955294713')
  // e como palavra dentro do titulo. E dai que vem o defeito 10 do plano — o
  // relatorio calcula "Historico de Revisoes" com titulo.includes('revisao').
  //
  // O prefixo E deterministico (31 de 31 linhas) e nao e heuristica: ele foi
  // ESCRITO pelo codigo que gravou o evento, um por gesto. O que e heuristica,
  // e por isso NAO e feito aqui, e ler a FASE de dentro do titulo em portugues.
  // Ver o cabecalho do passo 31.
  diary_system_event: {
    fase: 'phase_change', responsavel: 'responsible_change',
    'tag-on': 'tag_on', 'tag-off': 'tag_off', relatorio: 'report_generated',
  },
  // Texto livre de PermissoesUsuario.menu -> menus.key. 27 rotulos, 16 menus.
  // As duas grafias corrompidas entram pelo codepoint, nao pela aparencia:
  // "Negoциaцões" tem cirilico e "Aprova​ções" tem zero-width space.
  menu_key: {
    'Visão Geral': 'dashboard_overview', 'Dashboard Geral': 'dashboard_overview',
    'Painel Executivo': 'dashboard_executive', 'Dashboard Executivo': 'dashboard_executive',
    'Painel Comercial': 'dashboard_commercial', 'Dashboard Comercial': 'dashboard_commercial',
    CRM: 'crm', Clientes: 'crm',
    Pipeline: 'pipeline', 'Negociações': 'pipeline', 'Negoциaцões': 'pipeline',
    'Contratos & Propostas': 'contracts', Contratos: 'contracts',
    Projetos: 'projects',
    'Mapa de Projetos': 'map',
    'Fluxo do Projeto': 'project_flow', Tarefas: 'project_flow',
    Atividades: 'activities',
    Fornecedores: 'suppliers',
    'Orçamento por Cliente': 'client_budget',
    'Recebíveis': 'receivables', 'Contas a Receber': 'receivables',
    Pagamentos: 'payables', 'Contas a Pagar': 'payables',
    Equipe: 'team', Colaboradores: 'team',
    'Controle de Acesso': 'access_control',
    'Aprovações de Acesso': 'access_control',
    'Aprova​ções de Acesso': 'access_control',
  },
}

// ---------------------------------------------------------------------------
// Conversao de valor
// ---------------------------------------------------------------------------

const txt = (v) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

const num = (v) => {
  const t = (v ?? '').toString().trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const int = (v) => {
  const n = num(v)
  return n === null ? null : Math.trunc(n)
}

// 'true'/'false' do base44. Vazio vira null, e quem chama decide o default.
const bool = (v) => {
  const t = (v ?? '').trim()
  if (t === 'true') return true
  if (t === 'false') return false
  return null
}

// Coluna `date`: aceita "2026-10-05" e "2026-10-05T00:00:00" (corta o horario).
const date = (v) => {
  const t = (v ?? '').trim()
  if (t === '') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t)
  return m ? m[1] : null
}

// Coluna `timestamptz`: o base44 grava "2026-05-06T11:19:55.317000", sem fuso.
// Sem o Z, o Postgres interpretaria no fuso da sessao. O base44 grava UTC.
const ts = (v) => {
  const t = (v ?? '').trim()
  if (t === '') return null
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(t)) return t
  return `${t}Z`
}

const jsonArray = (v) => {
  const t = (v ?? '').trim()
  if (t === '') return []
  try {
    const parsed = JSON.parse(t)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Coluna `time`: o base44 grava "15:42" (HH:MM). Formato conferido antes de
// mandar: string que o Postgres nao entende derruba a linha inteira com 22007,
// e o motivo apareceria como "erro do banco" em vez de "hora fora do formato".
const clock = (v) => {
  const t = (v ?? '').trim()
  if (t === '') return null
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t) ? t : undefined
}

// ---------------------------------------------------------------------------
// Anexos do base44 — download e conferencia de tipo
// ---------------------------------------------------------------------------
//
// POR QUE BAIXAR: os anexos do diario vivem em URL PUBLICA de base44.app. Elas
// funcionam para qualquer pessoa que as tenha e morrem no dia em que o app for
// desligado. Gravar essa URL na coluna seria gravar um endereco que ja se sabe
// que vai morrer, e o que esta atras dele e documento de projeto de cliente.
//
// O TIPO E CONFERIDO TRES VEZES, e as tres precisam concordar: o que o CSV
// declara, o que o servidor responde e o que os PRIMEIROS BYTES dizem. O
// terceiro e o unico que nao depende de ninguem ser honesto — e e ele que
// impede subir para um bucket de foto de obra um arquivo que so se diz imagem.
// A lista de tipos e o limite de tamanho NAO sao repetidos aqui: sao lidos do
// proprio bucket (migration 0071), para que afrouxar um controle continue sendo
// coisa de migration e nao de script.

const DIARY_BUCKET = 'project-diary-files'

const MIME_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
}

// Tipo pelos primeiros bytes. `null` = nao reconhecido (nao e o mesmo que
// "invalido": text/plain nao tem assinatura nenhuma).
function sniffMime(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) return 'image/webp'
  return null
}

// { ok: true, buffer, mime } | { ok: false, reason }
// A razao devolvida NUNCA carrega a URL nem o nome do arquivo: ela vai para o
// resumo por motivo, que e stdout. O endereco de origem fica no rotulo da
// pendencia, que so existe no relatorio *.local.
async function fetchAttachment(url, declaredMime, limits) {
  let res
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch (error) {
    return { ok: false, reason: `download falhou: ${error.message}` }
  }
  if (!res.ok) return { ok: false, reason: `download devolveu HTTP ${res.status}` }

  // Tamanho declarado: recusa ANTES de puxar o corpo. Nao e confianca no
  // servidor — o corpo tambem e cortado no limite logo abaixo —, e sim nao
  // baixar centenas de MB para descobrir no fim que o bucket nao aceita.
  const declaredLength = Number(res.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declaredLength) && declaredLength > limits.maxBytes) {
    try { await res.body?.cancel() } catch { /* nada a fazer */ }
    return {
      ok: false,
      reason:
        `anexo de ${(declaredLength / 1048576).toFixed(1)} MB acima do limite de ` +
        `${(limits.maxBytes / 1048576).toFixed(0)} MB do bucket ${limits.bucket}`,
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length === 0) return { ok: false, reason: 'download veio vazio (0 bytes)' }
  if (buffer.length > limits.maxBytes) {
    return {
      ok: false,
      reason:
        `anexo de ${(buffer.length / 1048576).toFixed(1)} MB acima do limite de ` +
        `${(limits.maxBytes / 1048576).toFixed(0)} MB do bucket ${limits.bucket}`,
    }
  }

  const served = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const declared = (declaredMime ?? '').split(';')[0].trim().toLowerCase()
  const sniffed = sniffMime(buffer)

  // O que os bytes dizem vence, e discordancia com o que foi declarado nao e
  // arredondada: quem sobe um arquivo cujo conteudo contradiz o rotulo esta
  // dizendo duas coisas, e nenhuma das duas pode ser gravada como verdade.
  if (sniffed && declared && sniffed !== declared) {
    return { ok: false, reason: `tipo declarado (${declared}) e conteudo (${sniffed}) nao batem` }
  }
  if (sniffed && served && sniffed !== served) {
    return { ok: false, reason: `tipo servido (${served}) e conteudo (${sniffed}) nao batem` }
  }

  const mime = sniffed ?? served ?? declared
  if (!mime) return { ok: false, reason: 'nao foi possivel determinar o tipo do arquivo' }
  if (!limits.allowedMime.includes(mime)) {
    return { ok: false, reason: `tipo ${mime} fora do allowed_mime_types do bucket ${limits.bucket}` }
  }
  // Sem assinatura para conferir (text/plain): pelo menos garante que nao e
  // binario disfarcado de texto.
  if (!sniffed && mime === 'text/plain' && buffer.subarray(0, 1024).includes(0)) {
    return { ok: false, reason: 'declarado text/plain e o conteudo tem byte nulo' }
  }

  return { ok: true, buffer, mime }
}

// ---------------------------------------------------------------------------
// Pendencias
// ---------------------------------------------------------------------------

// Uma linha recusada. `label` e o que ajuda um humano a achar a linha no base44
// (nome, numero de contrato, descricao curta) — por isso o relatorio de
// pendencias e *.local e nunca vai para o stdout nem para o repositorio.
const pendencies = []
const pendByEntity = new Map()

function pend(entity, legacyId, reason, label = '') {
  pendencies.push({ entity, legacyId, reason, label })
  if (!pendByEntity.has(entity)) pendByEntity.set(entity, [])
  pendByEntity.get(entity).push({ legacyId, reason, label })
}

// Conflitos de permissao resolvidos pela regra do mais restritivo. Nao sao
// pendencia (a linha entra), mas precisam de conferencia humana.
const permissionConflicts = []

// AJUSTES — a linha ENTROU, com um campo traduzido, nulificado ou descartado.
// Nao e pendencia e nao entra na conta "consumidas + pendencias = origem": e a
// lista do que mudou entre o que o base44 tinha e o que o banco passou a ter,
// para que nenhuma dessas mudancas aconteca em silencio.
const adjustments = []
const adjByEntity = new Map()

function adjust(entity, legacyId, what, label = '') {
  adjustments.push({ entity, legacyId, what, label })
  if (!adjByEntity.has(entity)) adjByEntity.set(entity, [])
  adjByEntity.get(entity).push({ legacyId, what, label })
}

// Contabilidade da conferencia final: para cada entidade de destino,
// consumidas + pendencias tem que dar o total de linhas de origem.
const stats = new Map()

function stat(entity) {
  if (!stats.has(entity)) {
    stats.set(entity, { source: 0, consumed: 0, written: 0 })
  }
  return stats.get(entity)
}

// ---------------------------------------------------------------------------
// Escrita — uma linha por vez
// ---------------------------------------------------------------------------

// POR QUE UMA LINHA POR VEZ, E NAO UM INSERT EM LOTE
//   O PostgREST monta a lista de colunas do INSERT pela UNIAO das chaves do
//   array. A linha que omite uma chave que outra linha tem recebe NULL
//   EXPLICITO, nao o default da coluna. Isso ja quebrou tres seeds deste
//   projeto de formas diferentes (status virando null, is_recurring virando
//   null, competence_month virando null). Aqui a linha vai sozinha: o payload
//   descreve exatamente uma linha e nao ha uniao possivel.
//
//   Onde ha lote (as tabelas-filhas), os objetos sao montados por uma unica
//   funcao com o mesmo conjunto de chaves em todas as linhas, e assertUniform()
//   confere isso antes de mandar. Uniformidade conferida e o que torna o lote
//   seguro; "eu escrevi tudo igual" nao e.

let fakeIdCounter = 0
const fakeId = () => `dry-${(++fakeIdCounter).toString().padStart(6, '0')}`

async function insertOne(table, row, conflict) {
  if (DRY_RUN) return { id: fakeId() }
  const { data, error } = await db
    .from(table)
    .upsert(row, { onConflict: conflict })
    .select('*')
    .single()
  if (error) return { error }
  return { id: data.id ?? null, data }
}

function assertUniform(table, rows) {
  if (rows.length === 0) return
  const shape = Object.keys(rows[0]).sort().join(',')
  for (const r of rows) {
    if (Object.keys(r).sort().join(',') !== shape) {
      abort(
        `lote de ${table} com linhas de formato diferente. O PostgREST daria ` +
          `NULL explicito na chave ausente. Corrija o montador da linha.`,
      )
    }
  }
}

async function insertBatch(table, rows, conflict, chunkSize = 200) {
  assertUniform(table, rows)
  if (DRY_RUN) return { count: rows.length }
  // O retorno pede a primeira coluna do conflito, e nao `id`: nem toda
  // tabela-filha tem `id` (collaborator_permissions tem chave primaria
  // composta), e pedir uma coluna que nao existe derruba o lote inteiro.
  const returning = conflict.split(',')[0].trim()
  let count = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error, data } = await db
      .from(table)
      .upsert(chunk, { onConflict: conflict })
      .select(returning)
    if (error) return { error, count }
    count += data.length
  }
  return { count }
}

// ---------------------------------------------------------------------------
// Resolucao de ponteiro (legacy_id -> uuid)
// ---------------------------------------------------------------------------

// Estado de cada entidade de origem: quem existe no CSV, e quem virou linha.
function makeIndex(sourceRows) {
  return { source: idsOf(sourceRows), byLegacy: new Map() }
}

// Devolve { ok: true, id } | { ok: false, reason }.
//   vazio            -> ausencia legitima, devolve null
//   fora do CSV      -> ORFAO: o ponteiro nao existe no export
//   no CSV, sem uuid -> CASCATA: a linha apontada foi recusada antes
function link(index, rawId, targetLabel) {
  const legacy = (rawId ?? '').trim()
  if (legacy === '') return { ok: true, id: null }
  const id = index.byLegacy.get(legacy)
  if (id) return { ok: true, id }
  if (!index.source.has(legacy)) {
    return { ok: false, reason: `orfao: ${targetLabel} ${legacy} nao existe no export` }
  }
  return { ok: false, reason: `cascata: ${targetLabel} ${legacy} nao foi importado` }
}

// Devolve { ok: true, value } | { ok: false, reason }. Valor fora do de/para
// NUNCA vira 'other' nem default: derruba a linha.
function pick(enumName, raw, { column }) {
  const t = (raw ?? '').trim()
  const map = ENUMS[enumName]
  if (t === '') {
    return { ok: true, value: Object.prototype.hasOwnProperty.call(map, '') ? map[''] : null }
  }
  if (Object.prototype.hasOwnProperty.call(map, t)) return { ok: true, value: map[t] }
  return { ok: false, reason: `${column}: valor "${t}" nao esta em docs/ENUM-MAP.md` }
}

// Acumulador de motivos por linha. A primeira falha ja condena a linha, mas
// juntar todos os motivos poupa uma segunda rodada de correcao no base44.
class RowGuard {
  constructor(entity, legacyId, label) {
    this.entity = entity
    this.legacyId = legacyId
    this.label = label
    this.reasons = []
    this.notes = []
  }

  enum(enumName, raw, column) {
    const r = pick(enumName, raw, { column })
    if (!r.ok) { this.reasons.push(r.reason); return null }
    return r.value
  }

  fk(index, rawId, targetLabel, column) {
    const r = link(index, rawId, targetLabel)
    if (!r.ok) { this.reasons.push(`${column}: ${r.reason}`); return null }
    return r.id
  }

  // Ponteiro em coluna que ACEITA NULO. Orfao (o alvo nao existe em lugar
  // nenhum do export) vira nulo e a linha entra: a ausencia e a verdade, e
  // segurar a linha inteira por um ponteiro para o nada nao devolve o ponteiro
  // a ninguem. Cascata continua derrubando — ali o alvo existe, so nao entrou
  // ainda, e a re-execucao recupera o vinculo de verdade em vez de apaga-lo.
  softFk(index, rawId, targetLabel, column) {
    const r = link(index, rawId, targetLabel)
    if (r.ok) return r.id
    if (r.reason.startsWith('orfao')) {
      adjust(this.entity, this.legacyId, `${column} gravado NULO — ${r.reason}`, this.label)
      return null
    }
    this.reasons.push(`${column}: ${r.reason}`)
    return null
  }

  // Ajuste aplicado a ESTA linha. Fica bufferizado ate se saber se a linha
  // entrou: ajuste anotado em linha que acabou recusada seria ruido, e o
  // relatorio precisa que AJUSTES signifique "isto esta no banco assim".
  note(what) {
    this.notes.push(what)
  }

  require(condition, reason) {
    if (!condition) this.reasons.push(reason)
    return condition
  }

  get failed() {
    return this.reasons.length > 0
  }

  // Usada no lugar de `if (g.failed) { g.reject(); continue }`. Recusa a linha
  // e devolve true, ou publica os ajustes bufferizados e devolve false.
  get rejected() {
    if (this.failed) { this.reject(); return true }
    for (const n of this.notes) adjust(this.entity, this.legacyId, n, this.label)
    this.notes = []
    return false
  }

  reject() {
    pend(this.entity, this.legacyId, this.reasons.join(' | '), this.label)
  }
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

const log = (s = '') => console.log(s)
const step = (n, name) => log(`\n[${String(n).padStart(2, '0')}] ${name}`)

// ---------------------------------------------------------------------------
// Passo 1 — o escritorio
// ---------------------------------------------------------------------------

async function ensureTenant() {
  step(1, 'tenants')
  if (DRY_RUN) {
    log(`  (dry-run) escritorio "${TENANT_NAME}" / slug ${TENANT_SLUG}`)
    return fakeId()
  }

  const { data: existing, error: readError } = await db
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', TENANT_SLUG)
    .maybeSingle()
  if (readError) abort(`ler tenants: ${readError.message}`)

  if (existing) {
    log(`  escritorio ja existia: ${existing.name} (${existing.slug})`)
    return existing.id
  }

  const { data: created, error } = await db
    .from('tenants')
    .insert({ name: TENANT_NAME, slug: TENANT_SLUG })
    .select('id')
    .single()
  if (error) abort(`criar tenant: ${error.message}`)
  log(`  escritorio criado: ${TENANT_NAME} (${TENANT_SLUG})`)
  log('  A partir de agora os dez seeds de supabase/seed/ abortam contra este')
  log('  banco. E o comportamento correto: seed nao roda em banco com dado de')
  log('  cliente. Ver supabase/seed/tenants.mjs.')
  return created.id
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  log(`\nImportacao do base44 — ${DRY_RUN ? 'DRY RUN (nada e gravado)' : SUPABASE_URL}`)
  log(`CSV em ${CSV_DIR}\n`)
  for (const entity of [...ENTITIES, ...ENTITIES_OPCIONAIS]) {
    const arquivo = acharArquivo(entity)
    log(`  ${entity.padEnd(22)} ${String(csv[entity].length).padStart(5)} linhas  (${arquivo ?? 'ausente nesta pasta'})`)
  }
  /* Dito em voz alta: arquivo presente na pasta que este script NAO grava. */
  for (const entity of NAO_IMPORTADAS) {
    const arquivo = acharArquivo(entity)
    if (arquivo) log(`  ${entity.padEnd(22)}    -- NAO IMPORTADA  (${arquivo})`)
  }

  const tenantId = await ensureTenant()
  const T = () => tenantId

  // Indices de resolucao ------------------------------------------------------
  const ix = {
    collaborator: makeIndex(csv.Collaborator),
    client: makeIndex(csv.Client),
    negotiation: makeIndex(csv.Negociacao),
    contract: makeIndex(csv.Contract),
    project: makeIndex(csv.Project),
    task: makeIndex(csv.Task),
    supplier: makeIndex(csv.Fornecedor),
    budgetChecklist: makeIndex(csv.ChecklistOrcamento),
    payable: makeIndex(csv.AccountPayable),
    mapProperty: makeIndex(csv.PropriedadeMapa),
    budgetItem: { source: new Set(), byLegacy: new Map() },
  }

  // -------------------------------------------------------------------------
  // Passo 2 — tenant_email_domains (NAO cadastrado, de proposito)
  // -------------------------------------------------------------------------
  step(2, 'tenant_email_domains')
  if (REGISTER_EMAIL_DOMAINS) {
    abort('REGISTER_EMAIL_DOMAINS ligado sem dominio proprio definido — ver o comentario no topo.')
  }
  {
    const domains = new Map()
    for (const c of csv.Collaborator) {
      const d = (c.email.split('@')[1] ?? '').toLowerCase()
      domains.set(d, (domains.get(d) ?? 0) + 1)
    }
    log(`  nao cadastrado de proposito: ${domains.size} dominios entre os 15 colaboradores,`)
    log('  a maioria e-mail pessoal. A unicidade de tenant_email_domains.domain e')
    log('  GLOBAL: cadastrar gmail.com rotearia qualquer usuario de Gmail do mundo')
    log('  para este escritorio. O acesso e por conta criada no passo 33.')
  }

  // -------------------------------------------------------------------------
  // Passo 3 — menus (ja populada pela migration 0004)
  // -------------------------------------------------------------------------
  step(3, 'menus')
  let menuKeys = new Set(Object.values(ENUMS.menu_key))
  if (!DRY_RUN) {
    const { data: menus, error } = await db.from('menus').select('key')
    if (error) abort(`ler menus: ${error.message}`)
    menuKeys = new Set(menus.map((m) => m.key))
    for (const key of new Set(Object.values(ENUMS.menu_key))) {
      if (!menuKeys.has(key)) abort(`menu_key "${key}" do de/para nao existe na tabela menus`)
    }
  }
  log(`  ${menuKeys.size} menus na tabela (populados pela migration 0004)`)

  // -------------------------------------------------------------------------
  // Passo 4 — collaborators
  // -------------------------------------------------------------------------
  step(4, 'collaborators  <- Collaborator')
  stat('collaborators').source = csv.Collaborator.length
  let trimmedNames = 0
  for (const r of csv.Collaborator) {
    // O nome vem com espaco nas pontas em 2 das 15 linhas. btrim muda o valor
    // gravado, e por isso esta anotado: espaco de ponta nao carrega significado
    // e quebra qualquer comparacao por nome.
    const rawName = r.name ?? ''
    const name = rawName.trim()
    if (name !== rawName) trimmedNames += 1

    const g = new RowGuard('collaborators', r.id, name)
    const role = g.enum('collaborator_role', r.role, 'role')
    const area = g.enum('collaborator_area', r.area, 'area')
    const status = g.enum('collaborator_status', r.status, 'status')
    g.require(name !== '', 'name vazio (NOT NULL)')
    g.require(EMAIL_RE.test(r.email.trim()), `email "${r.email.trim()}" fora do formato aceito`)
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      /*
        `user_id` NAO ENTRA NO PAYLOAD, e a ausencia e o conserto de um defeito
        que tirou o escritorio inteiro do ar.

        Aqui havia `user_id: null`. Como o upsert e por (tenant_id, legacy_id),
        cada reexecucao DESLIGAVA os 15 logins, e o passo 33 os religava no fim.
        Enquanto o script ia ate o fim, ninguem via. Bastou uma execucao morrer
        no meio — uma falha de rede num recebivel — para os 15 colaboradores
        ficarem com a ficha solta: o login ainda autenticava, o token ainda
        trazia o escritorio, mas sem colaborador a RLS nao devolve linha nenhuma
        e todo mundo caia em "acesso pendente".

        Omitir a coluna faz o upsert nao tocar nela: quem ja tem login mantem, e
        o passo 33 continua preenchendo quem ainda nao tem. O vinculo deixa de
        depender de o script chegar inteiro ao fim.

        senha_temporaria e user_auth_email do CSV seguem ignorados de proposito
        (ver IGNORED_ON_PURPOSE).
      */
      name,
      role,
      area,
      email: r.email.trim(),
      coordinator_id: null, // 100% vazio no export
      status,
      weekly_hours: num(r.weekly_hours), // 100% vazio no export
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('collaborators', row, 'tenant_id,legacy_id')
    if (res.error) { pend('collaborators', r.id, `erro do banco: ${res.error.message}`, name); continue }
    ix.collaborator.byLegacy.set(r.id, res.id)
    stat('collaborators').consumed += 1
    stat('collaborators').written += 1
  }
  log(`  ${stat('collaborators').written} de ${csv.Collaborator.length}  (${trimmedNames} nomes com espaco de ponta removido)`)

  // -------------------------------------------------------------------------
  // Passo 5 — collaborator_permissions
  // -------------------------------------------------------------------------
  step(5, 'collaborator_permissions  <- PermissoesUsuario')
  stat('collaborator_permissions').source = csv.PermissoesUsuario.length
  {
    // Agrupa por (colaborador, menu_key). 27 rotulos do base44 colapsam em 16
    // menus, e o mesmo menu aparece duas vezes para a mesma pessoa em 59 pares
    // (44 deles com valores contraditorios).
    const groups = new Map()
    for (const r of csv.PermissoesUsuario) {
      const collaboratorId = ix.collaborator.byLegacy.get(r.colaborador_id)
      if (!collaboratorId) {
        const why = ix.collaborator.source.has(r.colaborador_id)
          ? `cascata: colaborador ${r.colaborador_id} nao foi importado`
          : `orfao: colaborador ${r.colaborador_id} nao existe no export de Collaborator`
        pend('collaborator_permissions', r.id, why, `${r.colaborador_name} / ${r.menu}`)
        continue
      }
      const key = ENUMS.menu_key[r.menu]
      if (!key) {
        pend('collaborator_permissions', r.id, `menu "${r.menu}" nao esta no de/para`, r.colaborador_name)
        continue
      }
      const gk = `${collaboratorId}|${key}`
      if (!groups.has(gk)) groups.set(gk, { collaboratorId, key, rows: [], name: r.colaborador_name })
      groups.get(gk).rows.push(r)
    }

    const permRows = []
    for (const g of groups.values()) {
      // REGRA: em conflito, vence o MAIS RESTRITIVO (decisao do usuario).
      // As duas grafias do mesmo menu foram gravadas por telas diferentes em
      // momentos diferentes; nenhuma e "a certa" por construcao, e dar o maior
      // acesso a quem tinha o menor e o erro que nao se percebe.
      const canView = g.rows.every((r) => r.pode_visualizar === 'true')
      const canEditRaw = g.rows.every((r) => r.pode_editar === 'true')
      const canEdit = canEditRaw && canView // o banco recusa can_edit sem can_view

      const combos = new Set(g.rows.map((r) => `${r.pode_visualizar}/${r.pode_editar}`))
      if (g.rows.length > 1 && combos.size > 1) {
        permissionConflicts.push({
          name: g.name,
          menuKey: g.key,
          gravado: g.rows.map((r) => `${r.menu} => view=${r.pode_visualizar} edit=${r.pode_editar}`),
          aplicado: `view=${canView} edit=${canEdit}`,
        })
      }

      // legacy_id precisa ser unico por tenant e o grupo consumiu varias linhas
      // de origem. Fica a menor id do grupo, que e estavel entre execucoes.
      const legacy = g.rows.map((r) => r.id).sort()[0]
      permRows.push({
        tenant_id: T(),
        collaborator_id: g.collaboratorId,
        menu_key: g.key,
        can_view: canView,
        can_edit: canEdit,
        legacy_id: legacy,
        created_at: ts(g.rows.map((r) => r.created_date).sort()[0]),
        updated_at: ts(g.rows.map((r) => r.updated_date).sort().reverse()[0]),
      })
      stat('collaborator_permissions').consumed += g.rows.length
    }

    const res = await insertBatch('collaborator_permissions', permRows, 'collaborator_id,menu_key')
    if (res.error) abort(`gravar permissoes: ${res.error.message}`)
    stat('collaborator_permissions').written = permRows.length
    log(`  ${permRows.length} linhas gravadas a partir de ${stat('collaborator_permissions').consumed} linhas de origem`)
    log(`  ${permissionConflicts.length} conflitos resolvidos pelo mais restritivo (listados no relatorio)`)
  }

  // -------------------------------------------------------------------------
  // Passo 6 — access_requests
  // -------------------------------------------------------------------------
  step(6, 'access_requests  <- SolicitacaoAcesso')
  stat('access_requests').source = csv.SolicitacaoAcesso.length
  for (const r of csv.SolicitacaoAcesso) {
    const g = new RowGuard('access_requests', r.id, r.nome)
    const status = g.enum('access_request_status', r.status, 'status')
    // aprovado_por_id nao e Collaborator.id em nenhuma das 22 linhas: sao ids
    // de USUARIO DA PLATAFORMA base44, que no base44 coexistem com o
    // colaborador e nao tem ligacao declarada.
    //
    // SEGUNDA PASSADA: entra NULO e a linha entra. decided_by e nullable e o
    // check access_requests_pending_has_no_decision so proibe decisao em pedido
    // PENDENTE — as 22 sao Aprovada. O que importa da solicitacao e que ela
    // existiu e qual foi o desfecho; quem aprovou aponta para uma identidade de
    // uma plataforma que vai ser desligada. Nao e silencio: o par (id da
    // plataforma, linha) sai na secao AJUSTES do relatorio.
    const decidedBy = g.softFk(ix.collaborator, r.aprovado_por_id, 'colaborador', 'aprovado_por_id')
    g.require(EMAIL_RE.test(r.email.trim()), `email "${r.email.trim()}" fora do formato aceito`)
    g.require(txt(r.nome) !== null, 'nome vazio (NOT NULL)')
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      email: r.email.trim(),
      name: r.nome.trim(),
      status,
      requested_at: ts(r.data_solicitacao),
      last_attempt_at: ts(r.ultima_tentativa),
      attempts: int(r.tentativas) ?? 1,
      source: txt(r.origem),
      decided_by: decidedBy,
      decided_at: ts(r.data_decisao),
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('access_requests', row, 'tenant_id,legacy_id')
    if (res.error) { pend('access_requests', r.id, `erro do banco: ${res.error.message}`, r.nome); continue }
    stat('access_requests').consumed += 1
    stat('access_requests').written += 1
  }
  log(`  ${stat('access_requests').written} de ${csv.SolicitacaoAcesso.length}`)

  // -------------------------------------------------------------------------
  // Passo 7 — clients
  // -------------------------------------------------------------------------
  step(7, 'clients  <- Client')
  stat('clients').source = csv.Client.length
  {
    // DUPLICATA DE CADASTRO — 3 pares (mesmo CPF, mesmo e-mail, mesmo nome).
    //
    // TERCEIRA PASSADA: as SEIS linhas entram. A migration 0065 tornou os dois
    // unicos de clients PARCIAIS (`where legacy_id is null`) e pos um trigger
    // no lugar da metade que o indice parcial nao expressa — "linha nascida
    // aqui nao colide com nada; linha importada convive com linha importada".
    // A deduplicacao continua inteira para o que a tela criar.
    //
    // Recusar a segunda linha de cada par (regra da segunda passada) perdia
    // tambem tudo que apontava para ela, e a fusao e decisao de negocio: as
    // duas linhas de cada par tem negociacao, contrato ou parcela penduradas em
    // graus diferentes. Com as seis no banco, o escritorio funde com os dois
    // registros a vista. O par continua listado nos AJUSTES para que a fusao
    // nao seja esquecida.
    const digits = (s) => (s ?? '').replace(/[^0-9]/g, '')
    const byDoc = new Map()
    for (const r of csv.Client) {
      const d = digits(r.cpf_cnpj)
      if (!d) continue
      if (!byDoc.has(d)) byDoc.set(d, [])
      byDoc.get(d).push(r)
    }
    const duplicates = new Map() // id -> id da outra linha do par
    for (const [, rows] of byDoc) {
      if (rows.length < 2) continue
      const sorted = [...rows].sort((a, b) => (a.created_date < b.created_date ? -1 : 1))
      for (const r of sorted.slice(1)) duplicates.set(r.id, sorted[0].id)
    }

    for (const r of csv.Client) {
      const g = new RowGuard('clients', r.id, r.name)
      const clientType = g.enum('client_type', r.client_type, 'client_type')
      const leadSource = g.enum('lead_source', r.lead_source, 'lead_source')
      g.require(txt(r.name) !== null, 'name vazio (NOT NULL)')
      g.require(txt(r.phone) !== null, 'phone vazio (NOT NULL + check nao-vazio)')
      // ENDERECO DA RESIDENCIA VAZIO — 1 cliente, e ele esta vazio em TODOS os
      // campos de endereco, inclusive os da obra. TERCEIRA PASSADA: a migration
      // 0064 tirou o NOT NULL de address_city/address_state e pos no lugar
      // `check (coluna is not null or legacy_id is not null)`. Nulo aqui diz "o
      // endereco nao foi informado", que e a verdade; preencher a cidade do
      // escritorio gravaria um endereco que ninguem informou. O check de
      // nao-vazio continua de pe para todo mundo — string vazia segue recusada,
      // por isso txt() (que devolve nulo para "  ") e nao .trim().
      if (txt(r.current_city) === null || txt(r.current_state) === null) {
        g.note('endereco da residencia sem cidade/UF gravado NULO (0064: a exigencia vale para o que nasce na tela)')
      }
      // SEGUNDA PASSADA: e-mail fora do formato NAO derruba mais o cliente. O
      // check clients_email_format_check recusaria a coluna, e so a coluna — o
      // nome, o telefone, o endereco e o documento desse cliente sao dado bom.
      // Entra com email nulo e o valor cru vai para os AJUSTES, para que o
      // escritorio corrija de onde ele sabe corrigir. E 1 linha em 122, com um
      // e-mail sem dominio completo.
      let email = txt(r.email)
      if (email !== null && !EMAIL_RE.test(email)) {
        g.note(`email fora do formato gravado NULO (valor original guardado abaixo): ${email}`)
        email = null
      }
      if (duplicates.has(r.id)) {
        g.note(
          `cadastro em duplicidade com a linha ${duplicates.get(r.id)} (mesmo CPF/CNPJ): as DUAS ` +
            'entraram (0065) e a fusao e decisao do escritorio, com os dois registros a vista',
        )
      }
      if (g.rejected) continue

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        name: r.name.trim(),
        phone: r.phone.trim(),
        email,
        client_type: clientType,
        lead_source: leadSource,
        tax_id: txt(r.cpf_cnpj),
        birth_date: date(r.birth_date),
        notes: txt(r.notes),
        address_zipcode: txt(r.current_zipcode),
        address_street: txt(r.current_address),
        address_number: txt(r.current_number),
        address_district: txt(r.current_neighborhood),
        address_complement: txt(r.current_complement),
        address_city: txt(r.current_city),
        address_state: txt(r.current_state),
        address_country: txt(r.country) ?? 'Brasil',
        site_zipcode: txt(r.construction_zipcode),
        site_street: txt(r.construction_address),
        site_number: txt(r.construction_number),
        site_district: txt(r.construction_neighborhood),
        site_complement: txt(r.construction_complement),
        site_city: txt(r.construction_city),
        site_state: txt(r.construction_state),
        created_at: ts(r.created_date),
        updated_at: ts(r.updated_date),
      }
      const res = await insertOne('clients', row, 'tenant_id,legacy_id')
      if (res.error) { pend('clients', r.id, `erro do banco: ${res.error.message}`, r.name); continue }
      ix.client.byLegacy.set(r.id, res.id)
      stat('clients').consumed += 1
      stat('clients').written += 1
    }
    log(`  ${stat('clients').written} de ${csv.Client.length}`)
  }

  // -------------------------------------------------------------------------
  // Passo 8 — negotiations
  // -------------------------------------------------------------------------
  step(8, 'negotiations  <- Negociacao')
  stat('negotiations').source = csv.Negociacao.length
  for (const r of csv.Negociacao) {
    const g = new RowGuard('negotiations', r.id, r.nome_negociacao)
    const status = g.enum('negotiation_status', r.status_negociacao, 'status_negociacao')
    const funnelStage = g.enum('funnel_stage', r.etapa_funil, 'etapa_funil')
    const origin = g.enum('lead_origin', r.origem, 'origem')
    const lossReason = g.enum('loss_reason', r.motivo_perda, 'motivo_perda')
    // client_id e nullable. Orfao vira nulo (SEGUNDA PASSADA); cascata continua
    // derrubando, porque o cliente existe e volta na proxima execucao.
    const clientId = g.softFk(ix.client, r.cliente_id, 'cliente', 'cliente_id')
    // RESPONSAVEL COMERCIAL QUE NAO ESTA NO EXPORT — 15 negociacoes, UMA
    // pessoa. TERCEIRA PASSADA: a migration 0064 tirou o NOT NULL de
    // commercial_owner_id. O vinculo era REAL (o nome esta em
    // responsavel_comercial_name); o que falta e a linha do outro lado. Nulo diz
    // "o responsavel nao esta mais cadastrado", que e a verdade, e se o
    // escritorio recadastrar a pessoa a reimportacao religa as 15 sozinha pelo
    // legacy_id — coisa que um responsavel substituto teria bloqueado. Cascata
    // continua derrubando, como em todo softFk.
    const ownerId = g.softFk(ix.collaborator, r.responsavel_comercial_id, 'colaborador', 'responsavel_comercial_id')
    // contrato_vinculado_id e o lado oposto de contracts.negotiation_id.
    // SEGUNDA PASSADA: ponteiro para contrato que nao existe no export nao
    // derruba mais a negociacao — o vinculo simplesmente nao existe, e e isso
    // que o banco passa a dizer. Fica registrado nos AJUSTES.
    const contractLink = link(ix.contract, r.contrato_vinculado_id, 'contrato')
    if (!contractLink.ok && contractLink.reason.startsWith('orfao')) {
      g.note(`contrato_vinculado_id ignorado — ${contractLink.reason}`)
    }
    if (txt(r.responsavel_comercial_id) === null) {
      g.note('responsavel_comercial_id vazio gravado NULO (0064: commercial_owner_id deixou de ser NOT NULL em linha importada)')
    }
    g.require(txt(r.nome_negociacao) !== null, 'name vazio (NOT NULL)')
    // DATA DE ENTRADA NO FUNIL VAZIA — 1 negociacao. TERCEIRA PASSADA: a
    // migration 0064 tirou o NOT NULL, e o payload continua mandando o nulo
    // EXPLICITO em vez de omitir a chave: o default da coluna e CURRENT_DATE, e
    // deixar o default agir gravaria "entrou no funil hoje" numa oportunidade
    // antiga — que e exatamente o que essa coluna mede. Nulo diz "nao foi
    // registrado"; a data de hoje mentiria.
    if (date(r.data_entrada_funil) === null) {
      g.note('data_entrada_funil vazia gravada NULO (0064: o default CURRENT_DATE nao age, ele inventaria a data de entrada)')
    }
    const closedAt = date(r.data_fechamento)
    if (closedAt !== null) {
      g.require(status === 'won' || status === 'lost', 'data_fechamento com status que nao e Ganha/Perdida')
    }
    // MOTIVO DE PERDA EM NEGOCIACAO QUE NAO ESTA PERDIDA — 1 linha. TERCEIRA
    // PASSADA: a migration 0063 abriu excecao para linha importada. Apagar o
    // motivo perderia o texto que alguem escreveu sobre por que o negocio nao
    // andou; trocar o status para Perdida inventaria um desfecho. As duas
    // metades entram como estao, e o estado incoerente fica visivel no
    // relatorio em vez de sumir.
    if (txt(r.motivo_perda) !== null || txt(r.observacoes_perda) !== null) {
      if (status !== 'lost') {
        g.note(`motivo/observacao de perda mantidos com status "${r.status_negociacao}" (0063: nem o texto nem o desfecho sao alterados)`)
      }
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      name: r.nome_negociacao.trim(),
      client_id: clientId,
      commercial_owner_id: ownerId,
      estimated_value: num(r.valor_estimado),
      close_probability: int(r.probabilidade_fechamento),
      status,
      funnel_stage: funnelStage ?? 'lead_received',
      origin,
      referrer_name: txt(r.nome_indicador),
      funnel_entry_date: date(r.data_entrada_funil),
      expected_close_date: date(r.previsao_fechamento),
      closed_at: closedAt,
      loss_reason: lossReason,
      loss_notes: txt(r.observacoes_perda),
      generates_contract: bool(r.gera_contrato) ?? true,
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('negotiations', row, 'tenant_id,legacy_id')
    if (res.error) { pend('negotiations', r.id, `erro do banco: ${res.error.message}`, r.nome_negociacao); continue }
    ix.negotiation.byLegacy.set(r.id, res.id)
    stat('negotiations').consumed += 1
    stat('negotiations').written += 1
  }
  log(`  ${stat('negotiations').written} de ${csv.Negociacao.length}`)

  // -------------------------------------------------------------------------
  // Passo 9 — negotiation_services
  // -------------------------------------------------------------------------
  step(9, 'negotiation_services  <- Negociacao.tipo_servico')
  {
    const rows = []
    for (const r of csv.Negociacao) {
      const services = jsonArray(r.tipo_servico)
      stat('negotiation_services').source += services.length
      const negotiationId = ix.negotiation.byLegacy.get(r.id)
      const seen = new Set()
      for (const s of services) {
        if (!negotiationId) {
          pend('negotiation_services', r.id, `cascata: negociacao ${r.id} nao foi importada`, String(s))
          continue
        }
        if (!Object.prototype.hasOwnProperty.call(ENUMS.service_type, s)) {
          pend('negotiation_services', r.id, `tipo_servico: valor "${s}" nao esta em docs/ENUM-MAP.md`, r.nome_negociacao)
          continue
        }
        const value = ENUMS.service_type[s]
        if (value === null) {
          // Rotulo guarda-chuva mapeado para "nao vira linha" no de/para
          // (`Complementares`). Nao e recusa e nao e servico: e um rotulo a
          // menos, com os servicos que ele resume ja listados ao lado.
          adjust('negotiation_services', r.id, `tipo_servico "${s}" e rotulo guarda-chuva e nao virou linha`, r.nome_negociacao)
          stat('negotiation_services').consumed += 1
          continue
        }
        if (seen.has(value)) {
          // DOIS ROTULOS PARA O MESMO SERVICO na mesma negociacao — 1 caso,
          // "Projeto de Arquitetura" e "Arquitetura" lado a lado, que o de/para
          // colapsa em `architecture` (o primeiro e a grafia de Contract, usada
          // em campo de Negociacao). Nao e linha recusada: o fato "esta
          // negociacao inclui arquitetura" ja esta no banco, gravado pela
          // primeira ocorrencia, e a unique (negotiation_id, service_type) e
          // justamente o que impede a mesma verdade de virar duas linhas.
          // Mesmo tratamento que os 27 rotulos de menu que colapsam em 16
          // (passo 5): a linha de origem conta como consumida.
          adjust('negotiation_services', r.id, `tipo_servico "${s}" e a segunda grafia do mesmo servico (${value}) na mesma negociacao e nao virou linha nova`, r.nome_negociacao)
          stat('negotiation_services').consumed += 1
          continue
        }
        seen.add(value)
        rows.push({ tenant_id: T(), negotiation_id: negotiationId, service_type: value })
        stat('negotiation_services').consumed += 1
      }
    }
    const res = await insertBatch('negotiation_services', rows, 'negotiation_id,service_type')
    if (res.error) abort(`gravar negotiation_services: ${res.error.message}`)
    stat('negotiation_services').written = rows.length

    /*
      O QUE SAIU DA LISTA TAMBEM PRECISA SAIR DO BANCO.

      O upsert acrescenta e atualiza, nunca remove — e para quase toda tabela
      isso esta certo, porque a linha some por exclusao e nao por ausencia. Aqui
      nao: `tipo_servico` e uma LISTA COMPLETA dentro da negociacao, entao um
      servico desmarcado no base44 simplesmente deixa de aparecer no CSV, sem
      nenhum registro de exclusao para importar.

      Sem esta limpeza a sobra fica invisivel: a negociacao mostra um servico que
      o escritorio ja tirou, e a unica pista e a conferencia final acusando
      contagem a mais. Foi assim que 3 linhas (electrical, structural, plumbing)
      sobreviveram da exportacao de agosto para a de 27/08.

      SO alcanca negociacao IMPORTADA (legacy_id not null): negociacao criada na
      tela tem os servicos que a tela gravou, e o CSV nao fala dela.
    */
    if (!DRY_RUN) {
      const esperado = new Set(rows.map((r) => `${r.negotiation_id}|${r.service_type}`))
      const { data: atuais, error: readError } = await db
        .from('negotiation_services')
        .select('negotiation_id, service_type, negotiations!inner(legacy_id)')
        .eq('tenant_id', T())
        .not('negotiations.legacy_id', 'is', null)

      if (readError) abort(`ler negotiation_services: ${readError.message}`)

      const sobras = (atuais ?? []).filter(
        (r) => !esperado.has(`${r.negotiation_id}|${r.service_type}`),
      )

      for (const sobra of sobras) {
        const { error } = await db
          .from('negotiation_services')
          .delete()
          .eq('tenant_id', T())
          .eq('negotiation_id', sobra.negotiation_id)
          .eq('service_type', sobra.service_type)
        if (error) abort(`remover negotiation_service: ${error.message}`)
        adjust(
          'negotiation_services',
          sobra.negotiation_id,
          `servico "${sobra.service_type}" removido: nao esta mais na lista do CSV`,
        )
      }
      if (sobras.length > 0) log(`  ${sobras.length} servico(s) removido(s) por terem saido da lista`)
    }

    log(`  ${rows.length} de ${stat('negotiation_services').source}`)
  }

  // -------------------------------------------------------------------------
  // Passo 10 — negotiation_owner_history
  // -------------------------------------------------------------------------
  step(10, 'negotiation_owner_history  <- Negociacao.historico_responsavel')
  {
    const rows = []
    for (const r of csv.Negociacao) {
      const history = jsonArray(r.historico_responsavel)
      stat('negotiation_owner_history').source += history.length
      for (const h of history) {
        const negotiationId = ix.negotiation.byLegacy.get(r.id)
        const label = r.nome_negociacao
        if (!negotiationId) {
          pend('negotiation_owner_history', r.id, `cascata: negociacao ${r.id} nao foi importada`, label)
          continue
        }
        const prev = link(ix.collaborator, h.responsavel_anterior_id, 'colaborador')
        const next = link(ix.collaborator, h.novo_responsavel_id, 'colaborador')
        const by = link(ix.collaborator, h.alterado_por_id, 'colaborador')
        const bad = [prev, next, by].filter((x) => !x.ok)
        if (bad.length > 0) {
          pend('negotiation_owner_history', r.id, bad.map((b) => b.reason).join(' | '), label)
          continue
        }
        if (!next.id || !ts(h.data_alteracao)) {
          pend('negotiation_owner_history', r.id, 'novo_responsavel_id ou data_alteracao vazios (NOT NULL)', label)
          continue
        }
        rows.push({
          tenant_id: T(),
          negotiation_id: negotiationId,
          previous_owner_id: prev.id,
          new_owner_id: next.id,
          changed_by_id: by.id,
          changed_at: ts(h.data_alteracao),
        })
        stat('negotiation_owner_history').consumed += 1
      }
    }
    const res = await insertBatch('negotiation_owner_history', rows, 'negotiation_id,changed_at')
    if (res.error) abort(`gravar negotiation_owner_history: ${res.error.message}`)
    stat('negotiation_owner_history').written = rows.length
    log(`  ${rows.length} de ${stat('negotiation_owner_history').source}`)
  }

  // -------------------------------------------------------------------------
  // Passo 11 — contracts
  // -------------------------------------------------------------------------
  step(11, 'contracts  <- Contract')
  stat('contracts').source = csv.Contract.length
  {
    // negotiation_id vem do LADO OPOSTO: e Negociacao.contrato_vinculado_id que
    // aponta para o contrato. So vale o vinculo cuja negociacao foi importada.
    const negotiationOfContract = new Map()
    for (const r of csv.Negociacao) {
      const legacyContract = (r.contrato_vinculado_id ?? '').trim()
      if (!legacyContract) continue
      const negotiationId = ix.negotiation.byLegacy.get(r.id)
      if (!negotiationId) continue
      negotiationOfContract.set(legacyContract, negotiationId)
    }

    const phaseDays = [
      ['prazo_estudo_layout', 'layout_study_days'],
      ['prazo_perspectivas', 'renderings_days'],
      ['prazo_projeto_legal', 'legal_permit_days'],
      ['prazo_projeto_executivo', 'construction_docs_days'],
      ['prazo_projetos_complementares', 'engineering_docs_days'],
    ]

    for (const r of csv.Contract) {
      const g = new RowGuard('contracts', r.id, r.contract_number)
      const contractType = g.enum('contract_type', r.contract_type, 'contract_type')
      const billingType = g.enum('billing_type', r.billing_type, 'billing_type')
      const status = g.enum('contract_status', r.status, 'status')
      const frequency = g.enum('installment_frequency', r.periodicidade_parcelas, 'periodicidade_parcelas')
      const origin = g.enum('lead_origin', r.origem_lead, 'origem_lead')
      const clientId = g.fk(ix.client, r.client_id, 'cliente', 'client_id')
      g.require(txt(r.contract_number) !== null, 'contract_number vazio (NOT NULL)')
      g.require(txt(r.contract_type) !== null, 'contract_type vazio (NOT NULL)')
      g.require(num(r.total_value) !== null, 'total_value vazio (NOT NULL)')

      // PLANO DE PARCELAMENTO INCOMPLETO — 6 contratos, 1 ou 2 dos 3 campos.
      //
      // SEGUNDA PASSADA: o contrato entra, com o plano NULO. O check
      // contracts_installment_plan_all_or_none exige os tres ou nenhum, e um
      // plano de 2 campos nao e um plano: nao da para gerar parcela com ele, e
      // completar o terceiro campo seria inventar quantidade ou vencimento. O
      // que se perde e um pedaco de plano inutilizavel; o que se ganha e o
      // contrato inteiro — cliente, valor, datas, copia congelada — e o dinheiro
      // dele na carteira. Os valores descartados saem um a um nos AJUSTES para
      // que o escritorio recomponha o plano na tela.
      let plan = [int(r.quantidade_parcelas), date(r.data_primeiro_vencimento), frequency]
      const planFilled = plan.filter((v) => v !== null && v !== undefined).length
      let installmentsGenerated = bool(r.installments_generated) ?? false
      if (planFilled > 0 && planFilled < 3) {
        g.note(
          `plano de parcelamento incompleto (${planFilled} de 3) gravado NULO — ` +
            `quantidade=${JSON.stringify(r.quantidade_parcelas)} ` +
            `primeiro_vencimento=${JSON.stringify(r.data_primeiro_vencimento)} ` +
            `periodicidade=${JSON.stringify(r.periodicidade_parcelas)}`,
        )
        plan = [null, null, null]
      }
      // installments_generated=true sem plano viola
      // contracts_installments_generated_requires_plan. Vai a false, e a
      // consequencia esta escrita: gerar parcela de novo exige antes recompor o
      // plano na tela, e a unique (tenant_id, contract_id, installment_number)
      // da 0041 barra duplicata de qualquer forma.
      if (installmentsGenerated && plan[0] === null) {
        g.note('installments_generated=true sem plano de parcelamento gravado como false (o check exige plano)')
        installmentsGenerated = false
      }
      // PRAZO DE FASE ZERO — 2 contratos, os cinco prazos em zero.
      // O check exige > 0 e a coluna e nullable: zero num campo de prazo nao e
      // "zero dias", e "nao se aplica", que e exatamente o que nulo diz aqui.
      // Traducao de formato, nao invencao.
      const phaseDaysValue = {}
      for (const [src, dst] of phaseDays) {
        const v = int(r[src])
        if (v === 0) {
          g.note(`${dst}: prazo 0 gravado NULO (o check exige > 0; nulo e como o schema diz "nao se aplica")`)
          phaseDaysValue[dst] = null
        } else {
          if (v !== null) g.require(v > 0, `${dst}: prazo ${v} negativo`)
          phaseDaysValue[dst] = v
        }
      }
      if (date(r.start_date) && date(r.signature_date)) {
        g.require(date(r.start_date) >= date(r.signature_date), 'start_date anterior a signature_date')
      }
      if (g.rejected) continue

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        contract_number: r.contract_number.trim(),
        contract_type: contractType,
        total_value: num(r.total_value),
        client_id: clientId,
        negotiation_id: negotiationOfContract.get(r.id) ?? null,
        project_name: txt(r.project_name),
        billing_type: billingType,
        status,
        signature_date: date(r.signature_date),
        start_date: date(r.start_date),
        notes: txt(r.notes),
        installment_count: plan[0],
        first_due_date: plan[1],
        installment_frequency: plan[2],
        installments_generated: installmentsGenerated,
        layout_study_days: phaseDaysValue.layout_study_days,
        renderings_days: phaseDaysValue.renderings_days,
        legal_permit_days: phaseDaysValue.legal_permit_days,
        construction_docs_days: phaseDaysValue.construction_docs_days,
        engineering_docs_days: phaseDaysValue.engineering_docs_days,
        // Copia congelada do cliente no momento da assinatura. Diverge do
        // cadastro atual em 7 dos 69 — e o comportamento esperado.
        client_legal_name: txt(r.client_full_name),
        client_tax_id: txt(r.client_cpf_cnpj),
        client_birth_date: date(r.client_birth_date),
        client_email: txt(r.client_email),
        client_address_zipcode: txt(r.client_cep),
        client_address_street: txt(r.client_endereco),
        client_address_number: txt(r.client_numero),
        client_address_complement: txt(r.client_complemento),
        client_address_city: txt(r.client_cidade),
        client_address_state: txt(r.client_estado),
        site_zipcode: txt(r.local_cep),
        site_street: txt(r.local_endereco),
        site_number: txt(r.local_numero),
        site_complement: txt(r.local_complemento),
        site_city: txt(r.local_cidade),
        site_state: txt(r.local_estado),
        origin,
        referrer_name: txt(r.nome_indicador),
        display_order: null, // sem fonte no export de Contract
        created_at: ts(r.created_date),
        updated_at: ts(r.updated_date),
      }
      const res = await insertOne('contracts', row, 'tenant_id,legacy_id')
      if (res.error) { pend('contracts', r.id, `erro do banco: ${res.error.message}`, r.contract_number); continue }
      ix.contract.byLegacy.set(r.id, res.id)
      stat('contracts').consumed += 1
      stat('contracts').written += 1
    }
    log(`  ${stat('contracts').written} de ${csv.Contract.length}`)
  }

  // -------------------------------------------------------------------------
  // Passo 12 — client_intakes
  // -------------------------------------------------------------------------
  step(12, 'client_intakes  <- ClientIntake')
  stat('client_intakes').source = csv.ClientIntake.length
  {
    // O TOKEN: POR QUE ELE E GERADO NOVO, E O QUE ISSO SIGNIFICA
    //
    //   A nossa coluna `token` e uuid; o base44 usa "<timestamp>-<sufixo>" e 42
    //   de 42 nao sao uuid. Na primeira passada isso derrubou as 42 linhas.
    //
    //   SEGUNDA PASSADA: o token e a credencial de um link PUBLICO que ja
    //   EXPIROU — o mais novo dos 42 venceu em julho/2026. Ele nao vale nada
    //   hoje, nem para quem tinha o link. O que tem valor e o registro do
    //   briefing: para qual cliente, de qual negociacao, quando foi enviado e
    //   se chegou a ser aberto.
    //
    //   Por isso cada linha recebe um uuid NOVO, gerado pelo banco no default
    //   da coluna, e entra com status `expired` e o `expires_at` original (que
    //   ja passou). O TOKEN NOVO NAO E O TOKEN ORIGINAL e NAO DEVE SER
    //   DISTRIBUIDO: ele nao abre nada (open_client_intake confere expires_at e
    //   status no servidor), e nao corresponde a nenhum link que alguem tenha
    //   recebido um dia. Ele existe porque a coluna e `not null unique`, e nao
    //   porque algum link novo foi criado.
    //
    //   O que NAO e recuperado: nenhuma resposta de formulario. As 25 colunas
    //   de conteudo do briefing estao 100% vazias nas 42 linhas — os links
    //   foram criados e nunca abertos (ultimo_status_validacao = CRIADO). O
    //   conteudo importado e o registro do envio, nao o briefing preenchido,
    //   porque briefing preenchido nao existe neste export.
    for (const r of csv.ClientIntake) {
      const g = new RowGuard('client_intakes', r.id, r.cliente_crm_name || r.negociacao_name)
      const status = g.enum('client_intake_status', r.status, 'status')
      const validation = g.enum('client_intake_validation_status', r.ultimo_status_validacao, 'ultimo_status_validacao')
      // BRIEFING DE CLIENTE QUE SAIU DO CRM — 18 links, 11 clientes. TERCEIRA
      // PASSADA: a migration 0064 tirou o NOT NULL de client_id. A superficie
      // publica continua correta com nulo — open_client_intake (0026) faz JOIN
      // com clients, entao o token devolve `not_found`, a mesma recusa
      // indistinguivel de token inexistente. Nada vaza e nada quebra; o briefing
      // fica no historico do escritorio, que e onde ele tem valor.
      const clientId = g.softFk(ix.client, r.cliente_crm_id, 'cliente', 'cliente_crm_id')
      const negotiationId = g.softFk(ix.negotiation, r.negociacao_id, 'negociacao', 'negociacao_id')
      const createdAt = ts(r.criado_em) ?? ts(r.created_date)
      const expiresAt = ts(r.expira_em)
      g.require(createdAt !== null, 'criado_em e created_date vazios (created_at e NOT NULL)')
      g.require(expiresAt !== null, 'expira_em vazio (expires_at e NOT NULL)')
      if (createdAt && expiresAt) {
        g.require(expiresAt > createdAt, 'expira_em anterior a criacao (check client_intakes_expires_after_creation)')
      }

      // Link vencido e link vencido, independente do que o base44 gravou em
      // `status` (as 42 dizem `Ativo` porque o base44 so muda o status quando
      // alguem tenta abrir). Marcar `expired` nao inventa nada: e o que
      // expires_at ja diz, escrito tambem na coluna que a tela le.
      const expired = expiresAt !== null && expiresAt <= new Date().toISOString()
      if (expired && status !== 'expired') {
        g.note(`status "${r.status}" gravado como expired — o link venceu em ${expiresAt.slice(0, 10)}`)
      }
      g.note('token do base44 descartado e substituido por uuid novo gerado pelo banco: o token novo NAO e o link original e nao deve ser distribuido')
      if (g.rejected) continue

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        // `token` fica FORA do payload de proposito: o default da coluna e
        // gen_random_uuid(), e deixar o banco gerar e o unico caminho em que
        // ninguem — nem este script, nem o log dele — chega a escolher o valor.
        negotiation_id: negotiationId,
        client_id: clientId,
        status: expired ? 'expired' : (status ?? 'active'),
        expires_at: expiresAt,
        submitted_at: null, // nenhuma das 42 foi enviada
        country: txt(r.pais) ?? 'Brasil',
        last_validation_status: validation ?? 'created',
        // link_publico nao entra: URL absoluta do dominio do original.
        created_at: createdAt,
        updated_at: ts(r.updated_date),
      }
      const res = await insertOne('client_intakes', row, 'tenant_id,legacy_id')
      if (res.error) { pend('client_intakes', r.id, `erro do banco: ${res.error.message}`, r.cliente_crm_name); continue }
      stat('client_intakes').consumed += 1
      stat('client_intakes').written += 1
    }
    log(`  ${stat('client_intakes').written} de ${csv.ClientIntake.length}  (token novo, registro expirado)`)
  }

  // -------------------------------------------------------------------------
  // Passo 13 — projects
  // -------------------------------------------------------------------------
  step(13, 'projects  <- Project')
  stat('projects').source = csv.Project.length
  for (const r of csv.Project) {
    const g = new RowGuard('projects', r.id, r.name)
    // project_type e NOT NULL e 18 linhas trazem a LISTA DE SERVICOS da
    // negociacao ("Arquitetura, Estrutura, Hidrosanitario, Eletrico"), em 8
    // grafias, nao um tipo de contrato.
    //
    // SEGUNDA PASSADA: nao e dado ausente, e formato ruim — e a lista tem
    // dentro dela exatamente o que os quatro valores de contract_type
    // descrevem. O criterio (escrito em docs/ENUM-MAP.md) le o CONJUNTO de
    // servicos, nao a string:
    //
    //   tem Interiores E algum complementar (Estrutura/Hidro/Eletrico) -> full
    //   tem Interiores e nenhum complementar        -> architecture_interiors
    //   tem complementar e nao tem Interiores       -> architecture_engineering
    //   so Arquitetura                              -> architecture
    //
    // E o mesmo significado dos quatro rotulos do original ("Arquitetura +
    // Complementares", "Arquitetura + Interiores", "Todos"), lido do conjunto e
    // nao da ordem — as 8 grafias sao 4 conjuntos escritos em ordens
    // diferentes. Nada e adivinhado: o conjunto esta escrito na propria celula.
    //
    // OS DEMAIS SERVICOS NAO SE PERDEM em 15 dos 18: esses projetos tem
    // contrato, o contrato tem negociacao, e a lista de servicos daquela
    // negociacao e IDENTICA a string — ela ja entrou linha a linha em
    // negotiation_services (passo 9). Nos outros 3 nao ha contrato nem
    // negociacao, e `projects` nao tem tabela-filha de servico: neles a lista
    // sobrevive so como o tipo escolhido, e o texto original fica nos AJUSTES.
    let projectType = null
    if (r.project_type.includes(',')) {
      const services = r.project_type.split(',').map((s) => s.trim()).filter(Boolean)
      const unknown = services.filter((s) => !Object.prototype.hasOwnProperty.call(ENUMS.service_type, s))
      if (unknown.length > 0) {
        g.reasons.push(`project_type: lista com servico fora do de/para: ${unknown.join(', ')}`)
      } else {
        const set = new Set(services.map((s) => ENUMS.service_type[s]))
        const hasInteriors = set.has('interiors')
        const hasEngineering = ['structural', 'plumbing', 'electrical'].some((s) => set.has(s))
        projectType = hasInteriors && hasEngineering ? 'full'
          : hasInteriors ? 'architecture_interiors'
            : hasEngineering ? 'architecture_engineering'
              : 'architecture'
        g.note(`project_type "${r.project_type}" (lista de servicos) lido como ${projectType}`)
      }
    } else {
      projectType = g.enum('contract_type', r.project_type, 'project_type')
    }
    const status = g.enum('project_status', r.status, 'status')
    const phase = g.enum('project_phase', r.fase_projeto_atual, 'fase_projeto_atual')
    const geocode = g.enum('geocode_status', r.obra_geocode_status, 'obra_geocode_status')
    // Os cinco sao nullable: orfao vira nulo, cascata continua derrubando.
    const clientId = g.softFk(ix.client, r.client_id, 'cliente', 'client_id')
    const contractId = g.softFk(ix.contract, r.contract_id, 'contrato', 'contract_id')
    const operational = g.softFk(ix.collaborator, r.responsible_id, 'colaborador', 'responsible_id')
    const commercial = g.softFk(ix.collaborator, r.commercial_responsible_id, 'colaborador', 'commercial_responsible_id')
    const pinBy = g.softFk(ix.collaborator, r.obra_pin_updated_by, 'colaborador', 'obra_pin_updated_by')
    g.require(txt(r.name) !== null, 'name vazio (NOT NULL)')
    g.require(txt(r.project_type) !== null, 'project_type vazio (NOT NULL)')
    if (phase !== null) g.require(phase !== 'post_approval', 'current_phase = Pos-aprovacao (barrado por check em projects)')
    for (const [src, dst] of [
      ['prazo_estudo_layout', 'layout_study_days'],
      ['prazo_perspectivas', 'renderings_days'],
      ['prazo_projeto_legal', 'legal_permit_days'],
      ['prazo_projeto_executivo', 'construction_docs_days'],
      ['prazo_projetos_complementares', 'engineering_docs_days'],
    ]) {
      const v = int(r[src])
      if (v !== null) g.require(v > 0, `${dst}: prazo ${v} (o check exige > 0)`)
    }
    if (g.rejected) continue

    const lat = num(r.obra_lat)
    const lng = num(r.obra_lng)
    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      name: r.name.trim(),
      project_type: projectType,
      client_id: clientId,
      contract_id: contractId,
      location: txt(r.location),
      city: txt(r.city),
      state: txt(r.state),
      site_address_text: txt(r.obra_endereco_texto),
      commercial_responsible_id: commercial,
      operational_responsible_id: operational,
      start_date: date(r.start_date),
      status: status ?? 'under_contract',
      current_phase: phase ?? 'not_started',
      layout_study_days: int(r.prazo_estudo_layout),
      renderings_days: int(r.prazo_perspectivas),
      legal_permit_days: int(r.prazo_projeto_legal),
      construction_docs_days: int(r.prazo_projeto_executivo),
      engineering_docs_days: int(r.prazo_projetos_complementares),
      total_value: num(r.total_value),
      visible_in_list: bool(r.visivel_em_projetos) ?? false,
      display_order: int(r.ordem_exibicao),
      notes: txt(r.notes),
      land_area_m2: num(r.area_terreno_m2),
      project_area_m2: num(r.area_projeto_m2),
      subdivision_name: txt(r.loteamento_nome),
      subdivision_block: txt(r.loteamento_quadra),
      subdivision_lot: txt(r.loteamento_lote),
      // Os oito campos obra_* estao 100% vazios no export, fora de
      // obra_geocode_status=PENDING e obra_pin_manual=false. O par lat/lng tem
      // check de "os dois ou nenhum".
      site_lat: lat !== null && lng !== null ? lat : null,
      site_lng: lat !== null && lng !== null ? lng : null,
      site_place_id: txt(r.obra_place_id),
      site_geocode_status: geocode ?? 'pending',
      site_geocode_updated_at: ts(r.obra_geocode_updated_at),
      site_pin_manual: bool(r.obra_pin_manual) ?? false,
      site_pin_updated_by: pinBy,
      site_pin_updated_at: ts(r.obra_pin_updated_at),
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('projects', row, 'tenant_id,legacy_id')
    if (res.error) { pend('projects', r.id, `erro do banco: ${res.error.message}`, r.name); continue }
    ix.project.byLegacy.set(r.id, res.id)
    stat('projects').consumed += 1
    stat('projects').written += 1
  }
  log(`  ${stat('projects').written} de ${csv.Project.length}`)

  // -------------------------------------------------------------------------
  // Passos 14, 15, 16 — filhas de Project (vazias no export)
  // -------------------------------------------------------------------------
  step(14, 'project_land_types / project_purposes / project_checklist_items')
  {
    const landRows = []
    const purposeRows = []
    const checklistRows = []
    for (const r of csv.Project) {
      const projectId = ix.project.byLegacy.get(r.id)
      const land = jsonArray(r.terreno_tipo)
      const purposes = jsonArray(r.finalidade_projeto)
      const checklist = jsonArray(r.checklist_etapa)
      stat('project_land_types').source += land.length
      stat('project_purposes').source += purposes.length
      stat('project_checklist_items').source += checklist.length
      if (!projectId) {
        for (const v of land) pend('project_land_types', r.id, `cascata: projeto ${r.id} nao foi importado`, String(v))
        for (const v of purposes) pend('project_purposes', r.id, `cascata: projeto ${r.id} nao foi importado`, String(v))
        for (const v of checklist) pend('project_checklist_items', r.id, `cascata: projeto ${r.id} nao foi importado`, String(v?.titulo ?? ''))
        continue
      }
      for (const v of new Set(land.map((x) => String(x).trim()).filter(Boolean))) {
        landRows.push({ tenant_id: T(), project_id: projectId, land_type: v })
        stat('project_land_types').consumed += 1
      }
      for (const v of new Set(purposes.map((x) => String(x).trim()).filter(Boolean))) {
        purposeRows.push({ tenant_id: T(), project_id: projectId, purpose: v })
        stat('project_purposes').consumed += 1
      }
      for (const it of checklist) {
        const title = String(it?.titulo ?? '').trim()
        if (!title) { pend('project_checklist_items', r.id, 'titulo vazio (NOT NULL)', ''); continue }
        const completed = it?.concluido === true
        checklistRows.push({
          tenant_id: T(),
          project_id: projectId,
          title,
          phase: ENUMS.project_phase[it?.etapa] ?? null,
          is_completed: completed,
          completed_at: null,
          display_order: int(it?.ordem),
        })
        stat('project_checklist_items').consumed += 1
      }
    }
    for (const [table, rows, conflict] of [
      ['project_land_types', landRows, 'project_id,land_type'],
      ['project_purposes', purposeRows, 'project_id,purpose'],
      ['project_checklist_items', checklistRows, 'project_id,title'],
    ]) {
      const res = await insertBatch(table, rows, conflict)
      if (res.error) abort(`gravar ${table}: ${res.error.message}`)
      stat(table).written = rows.length
      log(`  ${table.padEnd(24)} ${rows.length} de ${stat(table).source}`)
    }
  }

  // -------------------------------------------------------------------------
  // Passo 17 — tasks
  // -------------------------------------------------------------------------
  step(17, 'tasks  <- Task')
  stat('tasks').source = csv.Task.length
  const tagsWritten = new Map()
  for (const r of csv.Task) {
    const g = new RowGuard('tasks', r.id, r.title)
    // As fases e os status que o base44 nunca declarou entraram no de/para na
    // segunda passada, com o criterio escrito no bloco ENUMS e em
    // docs/ENUM-MAP.md. `Em Obra` (14 linhas) era a unica que ficava de fora, e
    // nao por lacuna de mapeamento: faltava valor no enum. A migration 0061
    // criou `under_construction`, e o de/para passou a te-lo — nada de especial
    // acontece aqui, a fase entra pelo mesmo caminho das outras.
    const phase = g.enum('project_phase', r.phase, 'phase')
    const status = g.enum('work_status', r.status, 'status')
    const priority = g.enum('priority_level', r.priority, 'priority')
    const taskType = g.enum('task_type', r.task_type, 'task_type')
    // Os dois sao nullable: ponteiro para projeto/colaborador que nao existe em
    // lugar nenhum do export vira nulo e a tarefa entra. Tarefa sem projeto e
    // caso previsto no original (Tasks.jsx confere project_id antes de usar).
    const projectId = g.softFk(ix.project, r.project_id, 'projeto', 'project_id')
    const responsibleId = g.softFk(ix.collaborator, r.responsible_id, 'colaborador', 'responsible_id')
    // QUINTA PASSADA — a tag operacional. Valor fora do de/para nao vira nulo
    // calado: `g.enum` empilha o motivo e a tarefa inteira vai para pendencias,
    // como manda a regra 3 do cabecalho. Celula vazia devolve null (o de/para
    // nao tem chave ''), e null aqui significa "o CSV nao diz nada sobre esta
    // tarefa" — por isso a coluna e OMITIDA do payload logo abaixo, em vez de
    // mandada como null.
    const operationalTag = g.enum('operational_tag', r.tag_operacional, 'tag_operacional')
    g.require(txt(r.title) !== null, 'title vazio (NOT NULL)')
    if (phase !== null) {
      g.require(phase !== 'finished', 'phase = Finalizado (so existe em Project, barrado por check em tasks)')
      g.require(phase !== 'post_approval', 'phase = Pos-aprovacao (barrado por check em tasks)')
    }
    if (priority !== null) g.require(priority !== 'urgent', 'priority = Urgente (barrado por check em tasks)')
    const effectiveStatus = status ?? 'not_started'
    // CONCLUIDA SEM DATA (ou o contrario) — 1 tarefa. TERCEIRA PASSADA: a
    // migration 0062 abriu excecao para linha importada nos DOIS sentidos. O
    // base44 guarda a bandeira e nao a data; nulo aqui significa "aconteceu, e o
    // quando nao foi registrado". Nenhuma data e inventada, e as duas metades
    // entram como o escritorio as tem.
    if ((effectiveStatus === 'completed') !== (date(r.completion_date) !== null)) {
      g.note(
        `completion_date e status entram como estao (status="${r.status}", ` +
          `completion_date=${JSON.stringify(date(r.completion_date))}) — 0062`,
      )
    }
    if (date(r.due_date) && date(r.start_date)) {
      g.require(date(r.due_date) >= date(r.start_date), 'due_date anterior a start_date')
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      title: r.title.trim(),
      project_id: projectId,
      phase: phase ?? 'not_started',
      responsible_id: responsibleId,
      priority: priority ?? 'medium',
      status: effectiveStatus,
      start_date: date(r.start_date),
      due_date: date(r.due_date),
      completion_date: date(r.completion_date),
      estimated_hours: num(r.estimated_hours),
      spent_hours: num(r.spent_hours), // 100% vazia no export
      description: txt(r.description),
      task_type: taskType,
      // A COLUNA SO APARECE QUANDO O CSV TEM TAG. Chave ausente nao entra no
      // SET do UPDATE do upsert por (tenant_id, legacy_id): assim reexecutar a
      // importacao nao apaga a tag que alguem tenha marcado pela tela. Mandar
      // `operational_tag: null` nas 117 sem tag faria exatamente isso — e o
      // motivo e o mesmo ja escrito no passo 31, para as quatro colunas que o
      // diario deixa de fora do payload.
      ...(operationalTag === null ? {} : { operational_tag: operationalTag }),
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('tasks', row, 'tenant_id,legacy_id')
    if (res.error) { pend('tasks', r.id, `erro do banco: ${res.error.message}`, r.title); continue }
    ix.task.byLegacy.set(r.id, res.id)
    if (operationalTag !== null) tagsWritten.set(operationalTag, (tagsWritten.get(operationalTag) ?? 0) + 1)
    stat('tasks').consumed += 1
    stat('tasks').written += 1
  }
  log(`  ${stat('tasks').written} de ${csv.Task.length}`)
  {
    const total = [...tagsWritten.values()].reduce((a, n) => a + n, 0)
    log(`  ${total} com status operacional (0074)`)
    for (const [tag, n] of [...tagsWritten.entries()].sort((a, b) => b[1] - a[1])) {
      log(`    ${String(n).padStart(3)}  ${tag}`)
    }
  }

  // -------------------------------------------------------------------------
  // Passo 18 — task_checklist_items
  // -------------------------------------------------------------------------
  step(18, 'task_checklist_items  <- Task.checklist_tarefa')
  {
    const rows = []
    let completedWithoutDate = 0
    for (const r of csv.Task) {
      const items = jsonArray(r.checklist_tarefa)
      stat('task_checklist_items').source += items.length
      const taskId = ix.task.byLegacy.get(r.id)
      const seen = new Set()
      for (const it of items) {
        const title = String(it?.titulo ?? '').trim()
        if (!taskId) {
          pend('task_checklist_items', r.id, `cascata: tarefa ${r.id} nao foi importada`, title)
          continue
        }
        if (!title) { pend('task_checklist_items', r.id, 'titulo vazio (NOT NULL)', ''); continue }
        if (seen.has(title)) {
          pend('task_checklist_items', r.id, `titulo repetido dentro da mesma tarefa (unique task_id,title): "${title}"`, r.title)
          continue
        }
        seen.add(title)
        const phase = it?.etapa === undefined || it?.etapa === null || it?.etapa === ''
          ? null
          : ENUMS.project_phase[it.etapa]
        if (phase === undefined) {
          pend('task_checklist_items', r.id, `etapa: valor "${it.etapa}" nao esta em docs/ENUM-MAP.md`, title)
          continue
        }
        const completed = it?.concluido === true
        const required = it?.obrigatorio === true
        if (completed && required) completedWithoutDate += 1
        rows.push({
          tenant_id: T(),
          task_id: taskId,
          title,
          phase,
          is_required: required,
          is_completed: completed,
          // DECISAO DO USUARIO: item obrigatorio e concluido ENTRA sem data. A
          // migration 0060 derrubou o check que exigia completed_at, e nulo
          // aqui significa "concluido, e o quando nao foi registrado". A fonte
          // nao tem campo de data de conclusao no item; inventar uma data
          // sentinela mentiria sobre quando o trabalho foi feito.
          completed_at: null,
          display_order: int(it?.ordem),
        })
        stat('task_checklist_items').consumed += 1
      }
    }
    const res = await insertBatch('task_checklist_items', rows, 'task_id,title')
    if (res.error) abort(`gravar task_checklist_items: ${res.error.message}`)
    stat('task_checklist_items').written = rows.length
    log(`  ${rows.length} de ${stat('task_checklist_items').source}`)
    log(`  ${completedWithoutDate} itens obrigatorios e concluidos entraram com completed_at nulo (decisao do usuario)`)
  }

  // -------------------------------------------------------------------------
  // Passo 19 — activities
  // -------------------------------------------------------------------------
  step(19, 'activities  <- Atividade')
  stat('activities').source = csv.Atividade.length
  for (const r of csv.Atividade) {
    const g = new RowGuard('activities', r.id, r.descricao?.slice(0, 60))
    const status = g.enum('work_status', r.status, 'status')
    const priority = g.enum('priority_level', r.prioridade, 'prioridade')
    // RESPONSAVEL QUE NAO ESTA NO EXPORT — 1 atividade. TERCEIRA PASSADA: a
    // migration 0064 tirou o NOT NULL de collaborator_id. O efeito na LEITURA
    // APERTA em vez de afrouxar: as policies da 0038/0059 concedem leitura sem
    // permissao de menu por `collaborator_id = auth_collaborator_id()`, e nulo
    // nunca e igual a ninguem — a atividade sem dono so aparece para quem tem
    // can_view/can_edit em `activities`.
    const collaboratorId = g.softFk(ix.collaborator, r.colaborador_id, 'colaborador', 'colaborador_id')
    const coordinatorId = g.softFk(ix.collaborator, r.coordenador_id, 'colaborador', 'coordenador_id')
    const startedBy = g.softFk(ix.collaborator, r.iniciado_por, 'colaborador', 'iniciado_por')
    const completedBy = g.softFk(ix.collaborator, r.concluido_por, 'colaborador', 'concluido_por')
    // EXCLUSAO LOGICA PELA METADE — 1 atividade, com data de exclusao e sem
    // autor. TERCEIRA PASSADA: a migration 0063 abriu excecao no par
    // deleted_at/deleted_by para linha importada. Inventar o autor seria
    // atribuir a alguem um ato que ele pode nao ter praticado; nulificar tambem
    // a data seria "desapagar" a atividade, que e mudar o fato. Entra a metade
    // que existe.
    const deletedBy = g.softFk(ix.collaborator, r.usuario_exclusao_id, 'colaborador', 'usuario_exclusao_id')
    const projectId = g.softFk(ix.project, r.projeto_id, 'projeto', 'projeto_id')
    const clientId = g.softFk(ix.client, r.cliente_id, 'cliente', 'cliente_id')
    g.require(txt(r.descricao) !== null, 'descricao vazia (NOT NULL)')
    if (txt(r.colaborador_id) === null) {
      g.note('colaborador_id vazio gravado NULO (0064: a atividade sem dono so aparece para quem tem permissao de menu)')
    }
    g.require(date(r.prazo_inicio) !== null, 'prazo_inicio vazio (NOT NULL)')
    g.require(date(r.prazo_termino) !== null, 'prazo_termino vazio (NOT NULL)')
    if (date(r.prazo_inicio) && date(r.prazo_termino)) {
      g.require(date(r.prazo_termino) >= date(r.prazo_inicio), 'prazo_termino anterior a prazo_inicio')
    }
    const effectiveStatus = status ?? 'not_started'
    // CONCLUIDA SEM DATA, E O CONTRARIO — 9 atividades concluidas sem
    // data_conclusao_real e 1 com a data preenchida e status "Nao iniciada"
    // (foi reaberta, e o base44 guardou as duas metades). TERCEIRA PASSADA: a
    // migration 0062 afrouxa a equivalencia nos DOIS sentidos para linha
    // importada, e de proposito — a linha reaberta guarda o fato "ja foi
    // concluida uma vez, em tal dia, e voltou a nao iniciada".
    //
    // O que NAO muda: activities_started_at_not_after_completed continua de pe,
    // entao tempo negativo em total_minutes (coluna gerada) segue impossivel.
    if ((effectiveStatus === 'completed') !== (ts(r.data_conclusao_real) !== null)) {
      g.note(
        `data_conclusao_real e status entram como estao (status="${r.status}", ` +
          `data_conclusao_real=${JSON.stringify(ts(r.data_conclusao_real))}) — 0062`,
      )
    }
    if (ts(r.data_inicio_real) && ts(r.data_conclusao_real)) {
      g.require(ts(r.data_inicio_real) <= ts(r.data_conclusao_real), 'data_inicio_real posterior a data_conclusao_real')
    }
    if ((ts(r.data_exclusao) !== null) !== (txt(r.usuario_exclusao_id) !== null)) {
      g.note('exclusao logica pela metade mantida como esta (0063: inventar o autor seria pior que nao ter)')
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      description: r.descricao.trim(),
      collaborator_id: collaboratorId,
      start_date: date(r.prazo_inicio),
      end_date: date(r.prazo_termino),
      coordinator_id: coordinatorId,
      project_id: projectId,
      client_id: clientId,
      status: effectiveStatus,
      priority: priority ?? 'medium',
      execution_order: int(r.ordem_execucao), // 100% vazia no export
      started_at: ts(r.data_inicio_real),
      completed_at: ts(r.data_conclusao_real),
      started_by: startedBy,
      completed_by: completedBy,
      notes: txt(r.observacoes),
      last_alert_on: date(r.ultimo_alerta_em),
      deleted_at: ts(r.data_exclusao),
      deleted_by: deletedBy,
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('activities', row, 'tenant_id,legacy_id')
    if (res.error) { pend('activities', r.id, `erro do banco: ${res.error.message}`, r.descricao?.slice(0, 60)); continue }
    stat('activities').consumed += 1
    stat('activities').written += 1
  }
  log(`  ${stat('activities').written} de ${csv.Atividade.length}`)

  // -------------------------------------------------------------------------
  // Passo 20 — financial_categories
  // -------------------------------------------------------------------------
  step(20, 'financial_categories  <- FinancialCategory')
  stat('financial_categories').source = csv.FinancialCategory.length
  for (const r of csv.FinancialCategory) {
    const g = new RowGuard('financial_categories', r.id, r.name)
    const type = g.enum('financial_category_type', r.type, 'type')
    const costCenter = g.enum('cost_center', r.cost_center, 'cost_center')
    g.require(txt(r.name) !== null, 'name vazio (NOT NULL)')
    g.require(txt(r.type) !== null, 'type vazio (NOT NULL)')
    if (g.rejected) continue
    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      name: r.name.trim(),
      type,
      cost_center: costCenter,
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('financial_categories', row, 'tenant_id,legacy_id')
    if (res.error) { pend('financial_categories', r.id, `erro do banco: ${res.error.message}`, r.name); continue }
    stat('financial_categories').consumed += 1
    stat('financial_categories').written += 1
  }
  log(`  ${stat('financial_categories').written} de ${csv.FinancialCategory.length}`)

  // -------------------------------------------------------------------------
  // Passo 21 — accounts_receivable
  // -------------------------------------------------------------------------
  step(21, 'accounts_receivable  <- AccountReceivable')
  stat('accounts_receivable').source = csv.AccountReceivable.length
  const receivableImported = new Set()
  for (const r of csv.AccountReceivable) {
    const g = new RowGuard('accounts_receivable', r.id, r.description?.slice(0, 60))
    const status = g.enum('financial_status', r.status, 'status')
    const method = g.enum('payment_method', r.payment_method, 'payment_method')
    const clientId = g.softFk(ix.client, r.client_id, 'cliente', 'client_id')
    const contractId = g.softFk(ix.contract, r.contract_id, 'contrato', 'contract_id')
    const projectId = g.softFk(ix.project, r.project_id, 'projeto', 'project_id')
    g.require(txt(r.description) !== null, 'description vazia (NOT NULL)')
    g.require(date(r.due_date) !== null, 'due_date vazia (NOT NULL)')
    // PARCELA DE VALOR ZERO — 4 linhas, todas "Parcela 1/1" de contrato.
    // TERCEIRA PASSADA: a migration 0063 estreitou o check para
    // `value > 0 or (legacy_id is not null and value >= 0)`. A excecao e
    // ESTREITA DE PROPOSITO e este guarda a espelha: importada aceita ZERO,
    // nunca negativo. O export nao tem nenhum negativo, e como a excecao
    // acompanha a linha para sempre, `>= 0` puro deixaria a tela editar uma
    // parcela importada para -100.
    const value = num(r.value)
    g.require(value !== null && value >= 0, `value = ${r.value} (o check exige > 0, e >= 0 so em linha importada)`)
    if (value === 0) {
      g.note('value 0 mantido (0063: parcela de zero real nao e cobranca, mas recusa-la apagaria o contrato da conciliacao)')
    }
    const effectiveStatus = status ?? 'forecast'
    // PAGA SEM DATA — 15 parcelas (R$ 146.500). TERCEIRA PASSADA: a migration
    // 0062 abriu excecao para linha importada. O base44 guarda a bandeira e nao
    // a data; usar `updated_date` como se fosse o pagamento gravaria como FATO
    // uma data que ninguem registrou. Nulo significa "recebida, e o quando nao
    // foi registrado". A view accounts_receivable_status nao se abala: "em
    // atraso" e calculado por due_date e status, nunca por payment_date.
    if ((effectiveStatus === 'paid') !== (date(r.payment_date) !== null)) {
      g.note(
        `payment_date e status entram como estao (status="${r.status}", ` +
          `payment_date=${JSON.stringify(date(r.payment_date))}) — 0062`,
      )
    }
    if (method !== null) g.require(method !== 'direct_debit', 'Debito automatico nao vale em recebivel (check de dominio)')

    // installment_number vem como TEXTO "n/total" no base44, e a nossa coluna e
    // um par de inteiros com check de "os dois ou nenhum".
    const raw = (r.installment_number ?? '').trim()
    let installmentNumber = null
    let installmentTotal = null
    if (raw !== '') {
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw)
      if (!m) {
        // 1 linha em 279 traz so "1", sem o total. O check
        // accounts_receivable_installment_pair exige os dois ou nenhum, e o
        // total nao esta em lugar nenhum — deduzi-lo do plano do contrato seria
        // inventar. Entra sem o par, que e o que se sabe: nao ha total
        // registrado. O valor cru fica nos AJUSTES.
        g.note(`installment_number "${raw}" sem o total: par numero+total gravado NULO (o check exige os dois ou nenhum)`)
      } else {
        installmentNumber = Number(m[1])
        installmentTotal = Number(m[2])
        g.require(installmentNumber >= 1 && installmentNumber <= installmentTotal, `parcela ${raw} fora da faixa`)
      }
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      description: r.description.trim(),
      value,
      due_date: date(r.due_date),
      client_id: clientId,
      contract_id: contractId,
      project_id: projectId,
      installment_number: installmentNumber,
      installment_total: installmentTotal,
      issue_date: date(r.issue_date),
      status: effectiveStatus,
      payment_date: date(r.payment_date),
      payment_method: method,
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('accounts_receivable', row, 'tenant_id,legacy_id')
    if (res.error) { pend('accounts_receivable', r.id, `erro do banco: ${res.error.message}`, r.description?.slice(0, 60)); continue }
    receivableImported.add(r.id)
    stat('accounts_receivable').consumed += 1
    stat('accounts_receivable').written += 1
  }
  log(`  ${stat('accounts_receivable').written} de ${csv.AccountReceivable.length}`)

  // -------------------------------------------------------------------------
  // Passo 22 — accounts_payable (as maes de recorrencia antes das ocorrencias)
  // -------------------------------------------------------------------------
  step(22, 'accounts_payable  <- AccountPayable')
  stat('accounts_payable').source = csv.AccountPayable.length
  {
    // A tabela referencia a si mesma: 35 maes, 307 ocorrencias. Sem contar as
    // ocorrencias por ultimo, a FK quebra.
    const ordered = [...csv.AccountPayable].sort((a, b) => {
      const ap = (a.recurrence_parent_id ?? '').trim() === '' ? 0 : 1
      const bp = (b.recurrence_parent_id ?? '').trim() === '' ? 0 : 1
      return ap - bp
    })

    for (const r of ordered) {
      const g = new RowGuard('accounts_payable', r.id, r.description?.slice(0, 60))
      const status = g.enum('financial_status', r.status, 'status')
      const method = g.enum('payment_method', r.payment_method, 'payment_method')
      const category = g.enum('expense_category', r.category, 'category')
      const frequency = g.enum('recurrence_frequency', r.recurrence_frequency, 'recurrence_frequency')
      const recurrenceStatus = g.enum('recurrence_status', r.recurrence_status, 'recurrence_status')
      const projectId = g.softFk(ix.project, r.project_id, 'projeto', 'project_id')
      const parentId = g.fk(ix.payable, r.recurrence_parent_id, 'conta a pagar', 'recurrence_parent_id')
      g.require(txt(r.supplier) !== null, 'supplier vazio (supplier_name e NOT NULL)')
      g.require(txt(r.description) !== null, 'description vazia (NOT NULL)')
      g.require(txt(r.category) !== null, 'category vazia (NOT NULL)')
      g.require(date(r.due_date) !== null, 'due_date vazia (NOT NULL)')
      const value = num(r.value)
      g.require(value !== null && value > 0, `value = ${r.value} (o check exige > 0)`)
      const effectiveStatus = status ?? 'forecast'
      // PAGA SEM DATA — 2 despesas (e com elas 3 ocorrencias que caiam so por
      // cascata da linha-mae). Gemea do caso de accounts_receivable, e pelo
      // mesmo motivo: migration 0062.
      if ((effectiveStatus === 'paid') !== (date(r.payment_date) !== null)) {
        g.note(
          `payment_date e status entram como estao (status="${r.status}", ` +
            `payment_date=${JSON.stringify(date(r.payment_date))}) — 0062`,
        )
      }
      if (method !== null) g.require(method !== 'cash', 'Especie nao vale em conta a pagar (check de dominio)')

      // RECORRENCIA DECLARADA SEM PLANO COMPLETO — 2 despesas, as duas com data
      // de inicio e sem frequencia. TERCEIRA PASSADA: a migration 0063 abriu
      // excecao para linha importada. A recorrencia e um FATO do dado ("isto se
      // repete"), e o check existe porque o ORIGINAL chuta o que falta (assume
      // mensal quando a frequencia nao bate com o mapa, AccountsPayable.jsx:171)
      // — chute vira lancamento financeiro em data que ninguem pediu. Importada,
      // a recorrencia entra incompleta e NAO gera nada sozinha: quem gera
      // ocorrencia e a tela, e a tela pede os campos.
      const isRecurring = bool(r.is_recurring) ?? false
      if (isRecurring && (frequency === null || date(r.recurrence_start_date) === null)) {
        g.note(
          'recorrencia declarada com plano incompleto mantida como esta ' +
            `(frequencia=${JSON.stringify(txt(r.recurrence_frequency))}, ` +
            `inicio=${JSON.stringify(date(r.recurrence_start_date))}) — 0063; ` +
            'nao gera ocorrencia sozinha, so a tela gera',
        )
      }
      if (parentId !== null) g.require(isRecurring === false, 'ocorrencia marcada como is_recurring=true')
      // FIM DE RECORRENCIA ANTERIOR AO INICIO — 3 maes, todas com o fim caindo
      // em janeiro e o inicio meses depois. Uma data que termina antes de
      // comecar nao descreve nada, e o check a recusa. O fim entra NULO ("nao ha
      // termino confiavel registrado") e o valor original vai para os AJUSTES;
      // recusar a linha inteira tiraria da carteira uma despesa real, com valor
      // e vencimento corretos. Nada e gerado a partir disso: ocorrencia so
      // nasce quando alguem cria a conta pela tela (useCreatePayable), nunca a
      // partir de linha importada.
      let recurrenceEnd = date(r.recurrence_end_date)
      if (recurrenceEnd && date(r.recurrence_start_date) && recurrenceEnd < date(r.recurrence_start_date)) {
        g.note(
          `recurrence_end_date ${recurrenceEnd} e anterior ao inicio ${date(r.recurrence_start_date)}: ` +
            'gravado NULO (o check exige fim >= inicio)',
        )
        recurrenceEnd = null
      }

      // competence_month vem como TEXTO "MM/AAAA"; a coluna e `date` com check
      // de primeiro dia do mes.
      const rawCompetence = (r.competence_month ?? '').trim()
      let competence = null
      if (rawCompetence !== '') {
        // "MMAAAA" sem a barra (2 linhas, ambas "012026") e a MESMA competencia
        // escrita sem separador — traducao de formato, nao deducao: os seis
        // digitos ja dizem mes e ano, na mesma ordem do formato bom.
        const m = /^(\d{2})\/?(\d{4})$/.exec(rawCompetence)
        if (!m) g.reasons.push(`competence_month "${rawCompetence}" fora do formato MM/AAAA`)
        else if (Number(m[1]) < 1 || Number(m[1]) > 12) g.reasons.push(`competence_month "${rawCompetence}" com mes invalido`)
        else {
          competence = `${m[2]}-${m[1]}-01`
          if (!rawCompetence.includes('/')) {
            g.note(`competence_month "${rawCompetence}" lido como ${m[1]}/${m[2]} (mesma competencia, sem a barra)`)
          }
        }
      }
      if (g.rejected) continue

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        supplier_name: r.supplier.trim(),
        description: r.description.trim(),
        category,
        value,
        due_date: date(r.due_date),
        project_id: projectId,
        status: effectiveStatus,
        payment_date: date(r.payment_date),
        payment_method: method,
        competence_month: competence,
        is_recurring: isRecurring,
        recurrence_frequency: frequency,
        recurrence_start_date: date(r.recurrence_start_date),
        recurrence_end_date: recurrenceEnd,
        recurrence_count: int(r.recurrence_count),
        recurrence_parent_id: parentId,
        recurrence_status: recurrenceStatus,
        // generated_count nao entra: e derivavel de recurrence_parent_id.
        created_at: ts(r.created_date),
        updated_at: ts(r.updated_date),
      }
      const res = await insertOne('accounts_payable', row, 'tenant_id,legacy_id')
      if (res.error) { pend('accounts_payable', r.id, `erro do banco: ${res.error.message}`, r.description?.slice(0, 60)); continue }
      ix.payable.byLegacy.set(r.id, res.id)
      stat('accounts_payable').consumed += 1
      stat('accounts_payable').written += 1
    }
    log(`  ${stat('accounts_payable').written} de ${csv.AccountPayable.length}`)
  }

  // -------------------------------------------------------------------------
  // Passo 23 — suppliers
  // -------------------------------------------------------------------------
  step(23, 'suppliers  <- Fornecedor')
  stat('suppliers').source = csv.Fornecedor.length
  for (const r of csv.Fornecedor) {
    const g = new RowGuard('suppliers', r.id, r.nome)
    // tipologia vazia (1 em 37) e `category` e NOT NULL. `other` ("Outros") e o
    // valor que a propria lista do base44 oferece para fornecedor sem
    // classificacao, e dois fornecedores ja o usam: nao afirma categoria
    // nenhuma, so registra que nao ha uma. O ajuste fica no relatorio.
    let category = null
    if (txt(r.tipologia) === null) {
      g.note('tipologia vazia gravada como other/Outros (category e NOT NULL; other e o valor de "sem classificacao")')
      category = 'other'
    } else {
      category = g.enum('supplier_category', r.tipologia, 'tipologia')
    }
    const model = g.enum('partnership_model', r.modelo_parceria, 'modelo_parceria')
    const term = g.enum('commission_payment_term', r.prazo_pagamento_comissao, 'prazo_pagamento_comissao')
    const tier = g.enum('partnership_tier', r.nivel_parceria, 'nivel_parceria')
    const status = g.enum('supplier_status', r.status, 'status')
    g.require(txt(r.nome) !== null, 'nome vazio (NOT NULL)')
    g.require(txt(r.contato_whatsapp) !== null, 'contato_whatsapp vazio (NOT NULL)')
    // TIPOLOGIA QUE SO VALE EM ITEM DE ORCAMENTO — 1 fornecedor,
    // `Revestimento de Fachada` (+2 marcas que caiam por cascata). TERCEIRA
    // PASSADA: a migration 0063 abriu excecao no suppliers_category_domain_check
    // para linha importada. A tipologia e REAL e conhecida — virar `other`
    // apagaria um fato que o escritorio registrou, e nao e o mesmo caso da
    // tipologia VAZIA logo acima, onde nao ha fato a apagar.
    //
    // CONSEQUENCIA PARA A TELA, que esta escrita no COMMENT da constraint: o
    // seletor de tipologia do formulario nao oferece esse valor, entao editar
    // esse fornecedor por la exige escolher outra coisa. O valor sobrevive
    // enquanto ninguem reeditar a tipologia.
    if (['facade_cladding', 'pool_cladding', 'waterproofing', 'drywall_plaster'].includes(category)) {
      g.note(`tipologia "${r.tipologia}" mantida (0063: valor de item de orcamento, aceito em fornecedor importado; o formulario nao o oferece)`)
    }
    if (txt(r.contato_email) !== null) {
      g.require(EMAIL_RE.test(r.contato_email.trim()), `contato_email "${r.contato_email.trim()}" fora do formato aceito`)
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      name: r.nome.trim(),
      category,
      contact_whatsapp: r.contato_whatsapp.trim(),
      partnership_tier: tier ?? 'registered',
      contact_name: txt(r.contato_nome),
      contact_email: txt(r.contato_email),
      phone: txt(r.telefone),
      // 14 dos 15 valores de `site` comecam com apostrofo e sao @ do Instagram,
      // nao URL. E artefato de planilha, e entra como esta: limpar aqui seria
      // mudar o dado do escritorio sem ele pedir.
      website: txt(r.site),
      address: txt(r.endereco),
      city: txt(r.cidade),
      state: txt(r.estado),
      has_showroom: bool(r.tem_showroom) ?? false,
      serves_outside_fortaleza: bool(r.atende_fora_fortaleza) ?? false,
      partnership_model: model,
      commission_percent: num(r.percentual_comissao),
      commission_payment_term: term,
      standard_discount_percent: num(r.desconto_padrao),
      average_delivery_time: txt(r.prazo_entrega_medio),
      status: status ?? 'active',
      notes: txt(r.observacoes),
      last_order_date: date(r.ultimo_pedido_data),
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('suppliers', row, 'tenant_id,legacy_id')
    if (res.error) { pend('suppliers', r.id, `erro do banco: ${res.error.message}`, r.nome); continue }
    ix.supplier.byLegacy.set(r.id, res.id)
    stat('suppliers').consumed += 1
    stat('suppliers').written += 1
  }
  log(`  ${stat('suppliers').written} de ${csv.Fornecedor.length}`)

  // -------------------------------------------------------------------------
  // Passo 24 — supplier_brands
  // -------------------------------------------------------------------------
  step(24, 'supplier_brands  <- Fornecedor.marcas_representadas')
  {
    const rows = []
    for (const r of csv.Fornecedor) {
      const brands = jsonArray(r.marcas_representadas)
      stat('supplier_brands').source += brands.length
      const supplierId = ix.supplier.byLegacy.get(r.id)
      const seen = new Set()
      for (const b of brands) {
        const name = String(b ?? '').trim()
        if (!supplierId) { pend('supplier_brands', r.id, `cascata: fornecedor ${r.id} nao foi importado`, name); continue }
        if (!name) { pend('supplier_brands', r.id, 'marca vazia (NOT NULL)', r.nome); continue }
        if (seen.has(name)) { pend('supplier_brands', r.id, `marca repetida no mesmo fornecedor: "${name}"`, r.nome); continue }
        seen.add(name)
        rows.push({ tenant_id: T(), supplier_id: supplierId, name })
        stat('supplier_brands').consumed += 1
      }
    }
    const res = await insertBatch('supplier_brands', rows, 'supplier_id,name')
    if (res.error) abort(`gravar supplier_brands: ${res.error.message}`)
    stat('supplier_brands').written = rows.length
    log(`  ${rows.length} de ${stat('supplier_brands').source}`)
  }

  // -------------------------------------------------------------------------
  // Passo 25 — budget_checklists
  // -------------------------------------------------------------------------
  step(25, 'budget_checklists  <- ChecklistOrcamento')
  stat('budget_checklists').source = csv.ChecklistOrcamento.length
  for (const r of csv.ChecklistOrcamento) {
    const g = new RowGuard('budget_checklists', r.id, r.project_name || r.client_name)
    const status = g.enum('budget_checklist_status', r.status_geral, 'status_geral')
    const phase = g.enum('project_phase', r.fase_projeto, 'fase_projeto')
    const clientId = g.fk(ix.client, r.client_id, 'cliente', 'client_id')
    const projectId = g.fk(ix.project, r.project_id, 'projeto', 'project_id')
    const responsibleId = g.fk(ix.collaborator, r.responsavel_orcamento_id, 'colaborador', 'responsavel_orcamento_id')
    g.require(txt(r.client_id) !== null, 'client_id vazio (NOT NULL)')
    if (phase !== null) {
      g.require(
        ['renderings', 'construction_docs', 'engineering_docs', 'post_approval'].includes(phase),
        `fase_projeto "${r.fase_projeto}" fora do dominio aceito em budget_checklists`,
      )
    }
    if (date(r.data_inicio) && date(r.data_conclusao)) {
      g.require(date(r.data_conclusao) >= date(r.data_inicio), 'data_conclusao anterior a data_inicio')
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      client_id: clientId,
      status: status ?? 'open',
      project_id: projectId,
      responsible_id: responsibleId,
      project_phase: phase,
      notes: txt(r.observacoes),
      start_date: date(r.data_inicio),
      completion_date: date(r.data_conclusao),
      curation_percent: num(r.curadoria_percentual),
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('budget_checklists', row, 'tenant_id,legacy_id')
    if (res.error) { pend('budget_checklists', r.id, `erro do banco: ${res.error.message}`, r.project_name); continue }
    ix.budgetChecklist.byLegacy.set(r.id, res.id)
    stat('budget_checklists').consumed += 1
    stat('budget_checklists').written += 1
  }
  log(`  ${stat('budget_checklists').written} de ${csv.ChecklistOrcamento.length}`)

  // -------------------------------------------------------------------------
  // Passo 26 — budget_checklist_items
  // -------------------------------------------------------------------------
  step(26, 'budget_checklist_items  <- ChecklistOrcamento.itens')
  const budgetItemsSource = []
  for (const r of csv.ChecklistOrcamento) {
    for (const it of jsonArray(r.itens)) budgetItemsSource.push({ ...it, __checklist: r.id, __label: r.project_name })
  }
  stat('budget_checklist_items').source = budgetItemsSource.length
  for (const it of budgetItemsSource) {
    const legacy = String(it.item_id ?? '').trim()
    ix.budgetItem.source.add(legacy)
    const g = new RowGuard('budget_checklist_items', legacy || it.__checklist, it.nome_item)
    const checklistId = ix.budgetChecklist.byLegacy.get(it.__checklist)
    if (!checklistId) {
      pend('budget_checklist_items', legacy || it.__checklist, `cascata: checklist ${it.__checklist} nao foi importado`, it.nome_item)
      continue
    }
    const category = g.enum('supplier_category', it.categoria, 'categoria')
    const status = g.enum('budget_item_status', it.status_item, 'status_item')
    const priority = g.enum('priority_level', it.prioridade, 'prioridade')
    const responsibleId = g.fk(ix.collaborator, it.responsavel_item_id, 'colaborador', 'responsavel_item_id')
    const supplierId = g.fk(ix.supplier, it.fornecedor_escolhido_id, 'fornecedor', 'fornecedor_escolhido_id')
    g.require(String(it.nome_item ?? '').trim() !== '', 'nome_item vazio (NOT NULL)')
    g.require(legacy !== '', 'item_id vazio (sem legacy_id nao ha idempotencia)')
    const clientApproved = it.aprovado_cliente === true
    if (date(it.data_aprovacao)) g.require(clientApproved, 'data_aprovacao sem aprovado_cliente')
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: legacy,
      checklist_id: checklistId,
      name: String(it.nome_item).trim(),
      description: txt(it.descricao),
      category,
      responsible_id: responsibleId,
      due_date: date(it.data_prazo),
      status: status ?? 'pending',
      priority: priority ?? 'medium',
      estimated_value: num(it.valor_estimado),
      approved_value: num(it.valor_aprovado),
      chosen_supplier_id: supplierId,
      commission_percent: num(it.comissao_percentual),
      // comissao_valor e coluna gerada do nosso lado; `concluido` e bandeira
      // duplicada que nenhuma tela le (ENUM-MAP). Nenhum dos dois entra.
      commission_received: false,
      client_approved: clientApproved,
      approval_date: date(it.data_aprovacao),
      is_required: it.obrigatorio === true,
      budget_file_path: null,
      budget_file_name: null,
      notes: txt(it.observacoes),
    }
    const res = await insertOne('budget_checklist_items', row, 'tenant_id,legacy_id')
    if (res.error) { pend('budget_checklist_items', legacy, `erro do banco: ${res.error.message}`, it.nome_item); continue }
    ix.budgetItem.byLegacy.set(legacy, res.id)
    stat('budget_checklist_items').consumed += 1
    stat('budget_checklist_items').written += 1
  }
  log(`  ${stat('budget_checklist_items').written} de ${budgetItemsSource.length}`)

  // -------------------------------------------------------------------------
  // Passo 27 — budget_item_quotes
  // -------------------------------------------------------------------------
  step(27, 'budget_item_quotes  <- ChecklistOrcamento.itens[].fornecedores_cotados')
  {
    // ATENCAO: docs/IMPORT-PLAN.md diz "zero cotacoes". O levantamento procurou
    // a chave `cotacoes`, e a chave real e `fornecedores_cotados`. Ha 28
    // cotacoes em 15 itens, e 10 delas repetem o fornecedor dentro do mesmo
    // item, com valores diferentes.
    //
    // O legacy_id DESTA TABELA E O ENDERECO DO ELEMENTO NA ORIGEM, e nao um id
    // de linha (migration 0066). No base44 a cotacao nao tem id proprio: e um
    // objeto solto dentro do array `fornecedores_cotados`, que esta dentro do
    // array `itens`, que esta dentro da linha de ChecklistOrcamento. O que
    // identifica o elemento la e a POSICAO, e "a terceira cotacao do item X
    // feita pelo fornecedor Y" e uma descricao verdadeira e estavel de onde
    // aquele dado estava. Formato, na ordem que a 0066 documenta:
    //
    //     <item_id do base44>:<fornecedor_id do base44>:<indice no array>
    //
    // Sao os ids DA ORIGEM, nao os uuid deste banco: o endereco descreve o
    // documento do base44, e uuid novo a cada execucao nao seria endereco de
    // coisa nenhuma. O indice e a posicao crua no array (base 0), que e o que
    // torna as duas cotacoes do mesmo fornecedor distinguiveis — e o que torna a
    // reimportacao idempotente, junto com o unique (tenant_id, legacy_id).
    const rows = []
    for (const it of budgetItemsSource) {
      const quotes = Array.isArray(it.fornecedores_cotados) ? it.fornecedores_cotados : []
      stat('budget_item_quotes').source += quotes.length
      const legacy = String(it.item_id ?? '').trim()
      const itemId = ix.budgetItem.byLegacy.get(legacy)
      const seen = new Set()
      quotes.forEach((q, position) => {
        const label = `${it.nome_item} / ${q?.fornecedor_nome ?? ''}`
        if (!itemId) { pend('budget_item_quotes', legacy, `cascata: item de orcamento ${legacy} nao foi importado`, label); return }
        const supplier = link(ix.supplier, q?.fornecedor_id, 'fornecedor')
        if (!supplier.ok) { pend('budget_item_quotes', legacy, `fornecedor_id: ${supplier.reason}`, label); return }
        if (!supplier.id) { pend('budget_item_quotes', legacy, 'fornecedor_id vazio (NOT NULL)', label); return }
        // FORNECEDOR REPETIDO NO MESMO ITEM — 10 cotacoes. TERCEIRA PASSADA: a
        // migration 0066 tornou a unicidade (item, fornecedor) PARCIAL
        // (`where legacy_id is null`), com um trigger fechando o caso "cotacao
        // nova x cotacao importada". As duas entram: sao cotacoes reais, com
        // valor, e recusar a segunda apagaria a comparacao de preco que o
        // escritorio fez — nao ha como escolher qual fica sem escolher tambem
        // qual preco vale.
        const supplierLegacy = String(q?.fornecedor_id ?? '').trim()
        if (seen.has(supplierLegacy)) {
          adjust(
            'budget_item_quotes', legacy,
            'fornecedor cotado mais de uma vez no mesmo item: as duas cotacoes entraram (0066) e a ' +
              'escolha de qual preco vale e do escritorio',
            label,
          )
        }
        seen.add(supplierLegacy)
        rows.push({
          tenant_id: T(),
          legacy_id: `${legacy}:${supplierLegacy}:${position}`,
          item_id: itemId,
          supplier_id: supplier.id,
          value: num(q?.valor),
          notes: txt(q?.observacao),
          quote_file_path: null,
          quote_file_name: null,
        })
        stat('budget_item_quotes').consumed += 1
      })
    }

    // AS COTACOES DA PASSADA ANTERIOR ESTAO COM legacy_id NULO, e o upsert
    // agora conflita por (tenant_id, legacy_id) — sem apagar antes, elas
    // ficariam no banco ao lado das mesmas cotacoes gravadas de novo, e a
    // conferencia veria 46 onde o CSV tem 28. Cotacao e filha PURA do item (ON
    // DELETE CASCADE, nenhum dependente), entao apagar e regravar nao derruba
    // nada em volta.
    //
    // O recorte e `legacy_id is null` e nao "tudo deste escritorio": as linhas
    // que ESTA execucao vai gravar tem legacy_id e sao atualizadas em vez de
    // recriadas, o que preserva o uuid delas entre execucoes.
    //
    // MAS `legacy_id is null` NAO QUER DIZER "sobra da importacao anterior".
    // Cotacao criada PELA TELA tambem nasce com legacy_id nulo, e seria apagada
    // por aqui. Hoje nao existe nenhuma — a tabela so tem saida de importacao —,
    // e este script e etapa de migracao e nao rotina. Mas "hoje nao existe" e
    // exatamente o tipo de premissa que envelhece: basta o escritorio comecar a
    // cotar pela tela antes de uma quarta passada.
    //
    // Entao o script NAO CONFIA no recorte: ele confere se tudo que vai apagar e
    // mesmo coisa que vai regravar, e ABORTA se achar uma linha que nao
    // reconhece. Apagar o que nao se reconhece e perda de dado do escritorio;
    // parar e pedir ajuda e um seed que nao rodou.
    if (!DRY_RUN) {
      const willWrite = new Set(rows.map((r) => `${r.item_id}|${r.supplier_id}`))

      const { data: orphans, error: readError } = await db
        .from('budget_item_quotes')
        .select('id, item_id, supplier_id')
        .eq('tenant_id', T())
        .is('legacy_id', null)
      if (readError) abort(`ler cotacoes sem legacy_id: ${readError.message}`)

      const unknown = (orphans ?? []).filter(
        (q) => !willWrite.has(`${q.item_id}|${q.supplier_id}`),
      )
      if (unknown.length) {
        abort(
          `${unknown.length} cotacao(oes) sem legacy_id que esta importacao NAO vai regravar.\n` +
            `    Elas nao vieram do base44 — provavelmente foram criadas pela tela de Orcamento.\n` +
            `    Apagar seria perder dado do escritorio, entao a importacao para aqui.\n` +
            `    Resolva a mao (apague ou de legacy_id a elas) e rode de novo.\n` +
            `    ids: ${unknown.map((q) => q.id).join(', ')}`,
        )
      }

      const { error: delError } = await db
        .from('budget_item_quotes')
        .delete()
        .eq('tenant_id', T())
        .is('legacy_id', null)
      if (delError) abort(`limpar cotacoes sem legacy_id: ${delError.message}`)
    }

    // onConflict por (tenant_id, legacy_id), como os outros 21 passos: o indice
    // (item_id, supplier_id) virou PARCIAL na 0066, e indice parcial nao serve
    // de alvo de ON CONFLICT sem repetir o predicado — o PostgREST nao repete e
    // devolveria 42P10.
    const res = await insertBatch('budget_item_quotes', rows, 'tenant_id,legacy_id')
    if (res.error) abort(`gravar budget_item_quotes: ${res.error.message}`)
    stat('budget_item_quotes').written = rows.length
    log(`  ${rows.length} de ${stat('budget_item_quotes').source}`)
  }

  // -------------------------------------------------------------------------
  // Passo 28 — map_properties
  // -------------------------------------------------------------------------
  step(28, 'map_properties  <- PropriedadeMapa')
  stat('map_properties').source = csv.PropriedadeMapa.length
  for (const r of csv.PropriedadeMapa) {
    const g = new RowGuard('map_properties', r.id, r.project_label || r.client_label || r.address?.slice(0, 40))
    const visual = g.enum('map_visual_status', r.status_visual, 'status_visual')
    // Nullable, e o pino tem rotulo de texto para quando nao ha vinculo: pino
    // apontando para projeto/cliente que nao existe no export entra sem vinculo,
    // e o rotulo (project_label/client_label) assume, como ja acontece nas 201
    // linhas que nunca tiveram vinculo.
    const projectId = g.softFk(ix.project, r.project_id, 'projeto', 'project_id')
    const clientId = g.softFk(ix.client, r.client_id, 'cliente', 'client_id')
    const lat = num(r.lat)
    const lng = num(r.lng)
    g.require(lat !== null && lng !== null, 'lat/lng vazios (NOT NULL)')
    if (lat !== null && lng !== null) {
      g.require(Math.abs(lat) <= 90 && Math.abs(lng) <= 180, 'lat/lng fora de faixa')
      g.require(!(lat === 0 && lng === 0), 'coordenada (0,0)')
    }
    g.require(!(txt(r.project_id) && txt(r.project_label)), 'project_id e project_label preenchidos ao mesmo tempo (mutuamente exclusivos)')
    g.require(!(txt(r.client_id) && txt(r.client_label)), 'client_id e client_label preenchidos ao mesmo tempo (mutuamente exclusivos)')
    for (const k of ['area_terreno_m2', 'area_projeto_m2']) {
      const v = num(r[k])
      if (v !== null) g.require(v > 0, `${k} = ${v} (o check exige > 0)`)
    }
    if (g.rejected) continue

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      lat,
      lng,
      project_id: projectId,
      // project_label/client_label so entram quando NAO ha vinculo, por causa
      // do check de exclusividade. Se o projeto vinculado nao entrou, a linha
      // ja foi recusada acima — o rotulo nunca substitui o vinculo perdido.
      project_label: projectId ? null : txt(r.project_label),
      client_id: clientId,
      client_label: clientId ? null : txt(r.client_label),
      // O endereco vem do Nominatim e tem quebra de linha DENTRO do valor.
      // Entra como esta: e o que o escritorio ve hoje.
      address: txt(r.address),
      city: txt(r.city),
      state: txt(r.state),
      land_area_m2: num(r.area_terreno_m2),
      project_area_m2: num(r.area_projeto_m2),
      subdivision_name: txt(r.loteamento_nome),
      subdivision_block: txt(r.loteamento_quadra),
      subdivision_lot: txt(r.loteamento_lote),
      visual_status: visual ?? 'not_started',
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('map_properties', row, 'tenant_id,legacy_id')
    if (res.error) { pend('map_properties', r.id, `erro do banco: ${res.error.message}`, r.project_label); continue }
    ix.mapProperty.byLegacy.set(r.id, res.id)
    stat('map_properties').consumed += 1
    stat('map_properties').written += 1
  }
  log(`  ${stat('map_properties').written} de ${csv.PropriedadeMapa.length}`)

  // -------------------------------------------------------------------------
  // Passos 29 e 30 — filhas de PropriedadeMapa
  // -------------------------------------------------------------------------
  step(29, 'map_property_land_types / map_property_purposes')
  {
    const landRows = []
    const purposeRows = []
    for (const r of csv.PropriedadeMapa) {
      const propertyId = ix.mapProperty.byLegacy.get(r.id)
      const land = jsonArray(r.terreno_tipo)
      const purposes = jsonArray(r.finalidade_projeto)
      stat('map_property_land_types').source += land.length
      stat('map_property_purposes').source += purposes.length
      if (!propertyId) {
        for (const v of land) pend('map_property_land_types', r.id, `cascata: propriedade ${r.id} nao foi importada`, String(v))
        for (const v of purposes) pend('map_property_purposes', r.id, `cascata: propriedade ${r.id} nao foi importada`, String(v))
        continue
      }
      const seenLand = new Set()
      for (const v of land) {
        const value = String(v ?? '').trim()
        if (!value) { pend('map_property_land_types', r.id, 'terreno_tipo vazio (NOT NULL)', ''); continue }
        if (seenLand.has(value)) { pend('map_property_land_types', r.id, `terreno_tipo repetido: "${value}"`, ''); continue }
        seenLand.add(value)
        landRows.push({ tenant_id: T(), map_property_id: propertyId, land_type: value })
        stat('map_property_land_types').consumed += 1
      }
      const seenPurpose = new Set()
      for (const v of purposes) {
        const value = String(v ?? '').trim()
        if (!value) { pend('map_property_purposes', r.id, 'finalidade_projeto vazia (NOT NULL)', ''); continue }
        if (seenPurpose.has(value)) { pend('map_property_purposes', r.id, `finalidade repetida: "${value}"`, ''); continue }
        seenPurpose.add(value)
        purposeRows.push({ tenant_id: T(), map_property_id: propertyId, purpose: value })
        stat('map_property_purposes').consumed += 1
      }
    }
    for (const [table, rows, conflict] of [
      ['map_property_land_types', landRows, 'map_property_id,land_type'],
      ['map_property_purposes', purposeRows, 'map_property_id,purpose'],
    ]) {
      const res = await insertBatch(table, rows, conflict)
      if (res.error) abort(`gravar ${table}: ${res.error.message}`)
      stat(table).written = rows.length
      log(`  ${table.padEnd(26)} ${rows.length} de ${stat(table).source}`)
    }
  }

  // -------------------------------------------------------------------------
  // Passo 31 — project_diary_entries  <- ProjectTimelineEntry
  // -------------------------------------------------------------------------
  //
  // A ENTIDADE QUE NAO TINHA DESTINO, E AGORA TEM. Ver "A QUARTA PASSADA" no
  // cabecalho deste arquivo. Sao 36 linhas em 18 projetos, entre 28/07 e 05/08:
  // 31 eventos automaticos (mudanca de fase, troca de responsavel, tag ligada e
  // desligada, relatorio gerado) e 5 ANOTACOES MANUAIS que nao existem em
  // nenhum outro lugar do export.
  //
  // AS QUATRO COLUNAS QUE FICAM FORA DO PAYLOAD, e cada uma por um motivo
  //
  //   from_phase / to_phase — 11 linhas sao mudanca de fase, e o titulo delas
  //     diz "Projeto movido de Perspectivas -> Layout". Daria para extrair por
  //     regex. NAO E FEITO: ler rotulo em portugues de dentro de texto livre e
  //     exatamente a heuristica que o modulo 11 existe para eliminar (defeito
  //     10 do plano — ResumoTab.jsx calcula grafico com titulo.includes()).
  //     Fazer isso aqui plantaria o defeito no dado historico, e um titulo
  //     renomeado passaria a mudar um grafico. O check
  //     project_diary_entries_phase_change_needs_to_phase_check abre excecao
  //     para linha com legacy_id justamente para permitir esta ausencia.
  //
  //   operational_tag — mesma coisa nas 16 linhas de tag: a tag so aparece
  //     dentro do titulo ("Marcado como Em Revisao").
  //
  //   visibility — fica no default `internal`. A origem NAO TEM o campo (e o
  //     defeito 6: o formulario coleta e a entidade nao declara), entao nao ha
  //     o que portar. `client` seria afirmar que o escritorio autorizou mostrar
  //     aquilo ao cliente, e ninguem autorizou.
  //
  //   As colunas sao OMITIDAS do payload, e nao mandadas como null. O upsert e
  //   por (tenant_id, legacy_id) e coluna ausente nao entra no SET do UPDATE:
  //   assim uma reexecucao nao apaga o que alguem tiver preenchido a mao, que e
  //   o unico jeito de essas colunas ganharem valor nestas 36 linhas.
  //
  // AS DUAS IDENTIDADES DA ORIGEM, E POR QUE SO UMA VIRA AUTOR
  //   `created_by` e o E-MAIL de quem gravou e resolve colaborador por e-mail
  //   exato em 31 das 36 linhas. Ja `criado_por_id`/`criado_por_name` e
  //   `atualizado_por_id`/`atualizado_por_name` sao identidade da PLATAFORMA
  //   base44: NENHUM dos ids e Collaborator.id, e nenhum dos nomes bate com
  //   nome de colaborador. E a mesma coisa que access_requests.aprovado_por_id
  //   ja tinha encontrado no passo 6. Autor sai do e-mail; o resto nao vira
  //   coluna, e updated_by_id fica fora do payload.
  //
  //   As 5 linhas cujo e-mail nao e de colaborador entram COM AUTOR NULO e vao
  //   para os AJUSTES. O e-mail delas parece o mesmo Fernando de outro
  //   endereco, e "parece" nao vira vinculo: identidade adivinhada num registro
  //   de autoria e pior do que autoria em branco.
  //
  // O RESPONSAVEL SAI DO ID, E NAO DO NOME
  //   O de/para levantado dizia "por nome exato". Conferido contra o CSV:
  //   `responsavel_id` E Collaborator.id nas 5 linhas em que existe (5 de 5), e
  //   o nome bate com o mesmo colaborador nas 5. Entao o ponteiro entra pelo
  //   caminho normal do script (softFk por legacy_id, como os outros 30 passos)
  //   e o nome serve de CONFERENCIA: se um dia os dois discordarem, a
  //   divergencia sai nos AJUSTES em vez de o script escolher sozinho. Nome
  //   nunca e chave de vinculo neste projeto — homonimo e acento decidem
  //   ligacao errada em silencio.
  step(31, 'project_diary_entries  <- ProjectTimelineEntry')
  const diaryEntryIdByLegacy = new Map()
  stat('project_diary_entries').source = csv.ProjectTimelineEntry.length
  {
    // Colaborador por e-mail. O e-mail e unico por escritorio no nosso schema e
    // vem de Collaborator.email, a mesma coluna que o passo 4 gravou.
    const collaboratorByEmail = new Map()
    for (const c of csv.Collaborator) {
      const id = ix.collaborator.byLegacy.get(c.id)
      const email = (c.email ?? '').trim().toLowerCase()
      if (id && email) collaboratorByEmail.set(email, { id, name: (c.name ?? '').trim() })
    }
    const collaboratorNameById = new Map(
      csv.Collaborator
        .filter((c) => ix.collaborator.byLegacy.has(c.id))
        .map((c) => [ix.collaborator.byLegacy.get(c.id), (c.name ?? '').trim()]),
    )

    // Colisao de event_key DENTRO do CSV. O unique (tenant_id, event_key) da
    // 0069 e a deduplicacao de verdade (defeito 5), e sem este teste a segunda
    // linha de um par colidido morreria como "erro do banco 23505" — motivo que
    // nao diz a quem le o relatorio que ha duas linhas disputando a mesma
    // chave. No dado real sao 31 chaves para 31 linhas automaticas.
    const eventKeySeen = new Map()

    const byEvent = new Map()
    for (const r of csv.ProjectTimelineEntry) {
      const g = new RowGuard('project_diary_entries', r.id, r.titulo)

      const entryType = g.enum('diary_entry_type', r.entry_type, 'entry_type')
      const status = g.enum('diary_entry_status', r.status_registro, 'status_registro')
      const isAutomatic = bool(r.is_automatico) ?? false
      const eventKey = txt(r.evento_chave)

      // project_id e NOT NULL: orfao e cascata derrubam a linha, e nao ha
      // softFk aqui. As 36 apontam para projeto que existe no export.
      const projectId = g.fk(ix.project, r.project_id, 'projeto', 'project_id')
      g.require(projectId !== null, 'project_id vazio (NOT NULL)')

      const responsibleId = g.softFk(ix.collaborator, r.responsavel_id, 'colaborador', 'responsavel_id')
      const responsibleName = txt(r.responsavel_name)
      if (responsibleId && responsibleName && collaboratorNameById.get(responsibleId) !== responsibleName) {
        g.note(
          'responsavel_id e responsavel_name apontam para pessoas diferentes: valeu o ID ' +
            '(nome nao e chave de vinculo neste projeto)',
        )
      }

      // O autor pelo e-mail. Ausente do cadastro -> nulo, e a linha entra.
      let createdById = null
      const authorEmail = (r.created_by ?? '').trim().toLowerCase()
      if (authorEmail !== '') {
        const author = collaboratorByEmail.get(authorEmail)
        if (author) createdById = author.id
        // O e-mail vai DEPOIS dos dois-pontos de proposito: o resumo do
        // terminal corta a frase ali (summary()), e terminal vira log. O
        // endereco inteiro fica no relatorio *.local.
        else g.note(`autor gravado NULO — o created_by nao e e-mail de colaborador do escritorio: ${authorEmail}`)
      }
      if (txt(r.atualizado_por_id) !== null) {
        g.note(
          'atualizado_por_id descartado: e identidade da plataforma base44 (nao e Collaborator.id) ' +
            'e a entidade nao guarda e-mail de quem atualizou — updated_by_id fica nulo',
        )
      }

      // system_event vem do PREFIXO de evento_chave, que foi escrito pelo
      // codigo que gravou o evento — um prefixo por gesto, 31 de 31. Valor fora
      // do de/para nao vira nada calado, como em qualquer outro passo.
      let systemEvent = null
      if (isAutomatic) {
        const prefix = (eventKey ?? '').split(':')[0]
        if (prefix === '') {
          g.reasons.push('registro automatico sem evento_chave: nao ha como dizer que evento ele registra')
        } else {
          systemEvent = g.enum('diary_system_event', prefix, 'evento_chave (prefixo)')
        }
      } else if (eventKey !== null) {
        // O check event_key_requires_automatic recusaria; e apagar a chave de
        // um registro manual seria decidir sozinho qual das duas metades esta
        // errada. Zero linhas assim no dado real.
        g.reasons.push('registro manual com evento_chave preenchido (o banco so aceita chave em registro automatico)')
      }

      // Os dois pares que o banco amarra por check. Conferidos aqui para que a
      // recusa saia como frase e nao como 23514.
      if (entryType !== null) {
        g.require(
          (entryType === 'system') === isAutomatic,
          `entry_type "${r.entry_type}" e is_automatico ${r.is_automatico} discordam ` +
            '(o tipo Sistema e reservado ao registro automatico, e vice-versa)',
        )
      }

      if (eventKey !== null) {
        if (eventKeySeen.has(eventKey)) {
          g.reasons.push(`evento_chave repetido no CSV (ja usado pela linha ${eventKeySeen.get(eventKey)})`)
        } else {
          eventKeySeen.set(eventKey, r.id)
        }
      }

      const occurrenceDate = date(r.data_ocorrencia)
      g.require(occurrenceDate !== null, 'data_ocorrencia vazia (NOT NULL)')
      const occurrenceTime = clock(r.hora_ocorrencia)
      if (occurrenceTime === undefined) {
        g.reasons.push(`hora_ocorrencia "${(r.hora_ocorrencia ?? '').trim()}" fora do formato HH:MM`)
      }
      g.require(txt(r.titulo) !== null, 'titulo vazio (NOT NULL)')

      if (g.rejected) continue

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        project_id: projectId,
        entry_type: entryType,
        title: r.titulo.trim(),
        description: txt(r.descricao),
        occurrence_date: occurrenceDate,
        occurrence_time: occurrenceTime,
        responsible_id: responsibleId,
        status: status ?? 'in_progress',
        is_automatic: isAutomatic,
        // Preservado como veio, inclusive o Date.now() que a origem embutiu
        // nele. NAO e reescrito para uma chave derivada do fato: a chave do
        // base44 e o registro de como aquele evento foi gravado la, e
        // "consertar" o passado inventaria uma idempotencia que nunca existiu.
        // Quem nasce nesta aplicacao usa chave derivada do fato (0070).
        event_key: eventKey,
        system_event: systemEvent,
        created_by_id: createdById,
        created_at: ts(r.created_date),
        updated_at: ts(r.updated_date),
      }

      const res = await insertOne('project_diary_entries', row, 'tenant_id,legacy_id')
      if (res.error) {
        // A policy de INSERT da 0070 recusa is_automatic verdadeiro — de
        // proposito, para que ninguem forje evento de sistema pela API. Este
        // script escreve com a service role key, que nao passa por policy
        // nenhuma, entao as 31 automaticas entram por aqui. Se um dia isso
        // mudar, o erro sai com nome e a importacao para em vez de gravar 5 de
        // 36 e chamar de sucesso.
        if (/row-level security|42501/i.test(res.error.message)) {
          abort(
            'a RLS de project_diary_entries recusou a escrita da importacao.\n' +
              `    ${res.error.message}\n` +
              '    O caminho automatico e public.record_project_diary_event (0070), que confere\n' +
              '    can_edit_menu(project_flow) do JWT — e este script nao tem sessao de usuario.\n' +
              '    NAO contorne aqui: decida no banco.',
          )
        }
        pend('project_diary_entries', r.id, `erro do banco: ${res.error.message}`, r.titulo)
        continue
      }
      diaryEntryIdByLegacy.set(r.id, res.id)
      byEvent.set(systemEvent ?? 'manual', (byEvent.get(systemEvent ?? 'manual') ?? 0) + 1)
      stat('project_diary_entries').consumed += 1
      stat('project_diary_entries').written += 1
    }
    log(`  ${stat('project_diary_entries').written} de ${csv.ProjectTimelineEntry.length}`)
    for (const [event, n] of [...byEvent.entries()].sort((a, b) => b[1] - a[1])) {
      log(`    ${String(n).padStart(3)}  ${event}`)
    }
  }

  // -------------------------------------------------------------------------
  // Passo 31b — project_site_visits  <- ProjectSiteVisit
  // -------------------------------------------------------------------------
  //
  // A VISITA DE OBRA, que ficou de fora da primeira passada com o motivo dito em
  // voz alta no relatorio ("NAO IMPORTADA"): o arquivo so apareceu na exportacao
  // de 27/08 e este script nao sabia grava-la. Sao 1 visita e 1 foto.
  //
  // 31b, e nao 32: a visita precisa existir ANTES dos arquivos (a foto dela e
  // uma linha de project_diary_files apontando para visit_id), e renumerar os
  // passos seguintes desalinharia docs/IMPORT-PLAN.md sem nenhum ganho.
  //
  // O DE/PARA DOS DOIS ENUMS SAI DE src/lib/enums.ts, invertido: SITE_VISIT_TYPE
  // e SITE_VISIT_STATUS ja guardam o rotulo em portugues que o base44 grava, e
  // eles sao a mesma lista que o formulario oferece. Repetir a tabela aqui
  // criaria um segundo lugar para as duas divergirem.
  //
  // `hora_visita` E A UNICA HORA DO SISTEMA que vem do base44 — visit_time
  // existe justamente para ela. Vazia entra nula: 00:00 seria inventar que a
  // visita foi a meia-noite.
  step('31b', 'project_site_visits  <- ProjectSiteVisit')
  const siteVisitIdByLegacy = new Map()
  {
    const visitas = csv.ProjectSiteVisit ?? []
    stat('project_site_visits').source = visitas.length

    for (const r of visitas) {
      const label = txt(r.resumo) ?? txt(r.project_name) ?? r.id
      const projectId = ix.project.byLegacy.get(txt(r.project_id) ?? '')
      if (!projectId) {
        pend('project_site_visits', r.id, `project_id: orfao: projeto ${r.project_id} nao existe no export`, label)
        continue
      }

      const visitDate = date(r.data_visita)
      if (!visitDate) {
        pend('project_site_visits', r.id, 'data_visita vazia (visit_date e NOT NULL)', label)
        continue
      }

      const visitType = SITE_VISIT_TYPE_BY_LABEL[(txt(r.tipo_visita) ?? '').trim()]
      if (!visitType) {
        pend('project_site_visits', r.id, `tipo_visita: valor "${r.tipo_visita}" nao esta em src/lib/enums.ts`, label)
        continue
      }

      const visitStatus = SITE_VISIT_STATUS_BY_LABEL[(txt(r.status_visita) ?? '').trim()]
      if (!visitStatus) {
        pend('project_site_visits', r.id, `status_visita: valor "${r.status_visita}" nao esta em src/lib/enums.ts`, label)
        continue
      }

      /*
        A hora vem "14:30" e a coluna e `time`. Formato diferente disso entra
        NULO com ajuste anotado, em vez de derrubar a visita inteira: a hora e
        detalhe, a visita e o fato.
      */
      let visitTime = null
      const horaCru = txt(r.hora_visita)
      if (horaCru) {
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(horaCru.trim())) {
          visitTime = horaCru.trim()
        } else {
          adjust('project_site_visits', r.id, `hora_visita "${horaCru}" fora do formato HH:MM e gravada NULA`, label)
        }
      }

      /*
        `timeline_entry_id` e o defeito 7 do plano do modulo 11: a versao nova
        coleta o campo e NUNCA o grava. No dado real ele vem vazio, entao aqui
        nao ha o que religar — mas o de/para fica escrito, porque o dia em que
        vier preenchido nao pode depender de alguem lembrar disso.
      */
      const diaryEntryId = diaryEntryIdByLegacy.get(txt(r.timeline_entry_id) ?? '') ?? null
      if (txt(r.timeline_entry_id) && !diaryEntryId) {
        adjust('project_site_visits', r.id, `timeline_entry_id ${r.timeline_entry_id} nao foi importado: visita gravada sem o vinculo`, label)
      }

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        project_id: projectId,
        visit_date: visitDate,
        visit_time: visitTime,
        visit_type: visitType,
        status: visitStatus,
        responsible_id: link(ix.collaborator, r.responsavel_id, 'colaborador'),
        summary: txt(r.resumo),
        notes: txt(r.observacoes),
        diary_entry_id: diaryEntryId,
        created_by_id: link(ix.collaborator, r.criado_por_id, 'colaborador'),
      }

      const res = await insertOne('project_site_visits', row, 'tenant_id,legacy_id')
      if (res.error) {
        pend('project_site_visits', r.id, `erro do banco: ${res.error.message}`, label)
        continue
      }
      siteVisitIdByLegacy.set(r.id, res.id)
      stat('project_site_visits').consumed += 1
      stat('project_site_visits').written += 1
    }
    log(`  ${stat('project_site_visits').written} de ${visitas.length}`)
  }

  // -------------------------------------------------------------------------
  // Passo 32 — project_diary_files  <- ProjectTimelineEntry.anexos[]
  // -------------------------------------------------------------------------
  //
  // Sao 5 arquivos em 4 entradas, todas manuais. No base44 cada um e um objeto
  // { nome, url, tipo } dentro do array `anexos`, e a `url` e PUBLICA e de
  // base44.app: funciona para quem quer que a tenha e morre no dia em que o app
  // for desligado. Por isso os arquivos sao BAIXADOS e REGRAVADOS no bucket
  // privado project-diary-files (0071), e a coluna guarda CAMINHO, nunca URL.
  //
  // SE O DOWNLOAD OU A CONFERENCIA DE TIPO FALHAR, a entrada continua no banco
  // e o ANEXO vai para pendencias com o endereco de origem no rotulo (rotulo so
  // existe no relatorio *.local; stdout nunca ve URL nem nome de arquivo).
  // Gravar a URL de origem "por enquanto" seria gravar um link que ja se sabe
  // que vai morrer, e atras dele ha documento de projeto de cliente.
  //
  // IDEMPOTENCIA, e ela e diferente da dos outros passos: o nome do objeto no
  // bucket e um uuid novo a cada chamada, entao regravar o arquivo a cada
  // execucao criaria um objeto novo e deixaria o anterior orfao e pago no
  // bucket (Storage nao tem cascade — ver o COMMENT de project_diary_files). O
  // passo entao PERGUNTA ANTES: se ja existe linha com este legacy_id e o
  // objeto dela ainda esta no bucket, nao baixa e nao sobe nada.
  step(32, 'project_diary_files  <- ProjectTimelineEntry.anexos[] + ProjectSiteVisit.fotos[]/arquivos[]')
  {
    /*
      DUAS MAES, e nao so a entrada de diario: `project_diary_files` tem arco
      exclusivo entre entry_id, visit_id e issue_id (0069), e a visita de obra
      traz `fotos` e `arquivos`.

      `fotos` vira file_kind 'photo' e `arquivos` vira 'attachment'. A distincao
      nao e decorativa: a aba Fotos e o lightbox agregam so photo.
    */
    const attachments = []
    for (const r of csv.ProjectTimelineEntry) {
      jsonArray(r.anexos).forEach((a, position) => {
        attachments.push({
          parent: 'entries', parentLegacy: r.id, array: 'anexos',
          fileKind: 'attachment', position, meta: a ?? {}, title: r.titulo,
        })
      })
    }
    for (const r of csv.ProjectSiteVisit ?? []) {
      for (const [array, fileKind] of [['fotos', 'photo'], ['arquivos', 'attachment']]) {
        jsonArray(r[array]).forEach((a, position) => {
          attachments.push({
            parent: 'visits', parentLegacy: r.id, array,
            fileKind, position, meta: a ?? {}, title: r.resumo,
          })
        })
      }
    }
    stat('project_diary_files').source = attachments.length

    // Limites lidos DO BUCKET, e nao repetidos aqui: se a 0071 mudar a lista de
    // tipos ou o teto de tamanho, este passo muda junto. Script que repete o
    // limite do bucket e um segundo lugar para o controle divergir.
    let limits = { bucket: DIARY_BUCKET, maxBytes: 20971520, allowedMime: Object.keys(MIME_EXTENSION) }
    if (!DRY_RUN) {
      const { data: bucket, error } = await db.storage.getBucket(DIARY_BUCKET)
      if (error || !bucket) {
        abort(`bucket ${DIARY_BUCKET} nao existe (migration 0071 aplicada?): ${error?.message ?? 'nao encontrado'}`)
      }
      limits = {
        bucket: DIARY_BUCKET,
        maxBytes: bucket.file_size_limit ?? 20971520,
        allowedMime: bucket.allowed_mime_types ?? Object.keys(MIME_EXTENSION),
      }
      log(`  bucket ${DIARY_BUCKET}: ${(limits.maxBytes / 1048576).toFixed(0)} MB, ${limits.allowedMime.length} tipos`)
    }

    // O que ja esta no banco desta importacao, para nao baixar de novo.
    const alreadyByLegacy = new Map()
    if (!DRY_RUN) {
      const { rows, error } = await selectAll('project_diary_files', 'legacy_id, file_path', (q) =>
        q.eq('tenant_id', T()).not('legacy_id', 'is', null))
      if (error) abort(`ler project_diary_files: ${error.message}`)
      for (const row of rows) alreadyByLegacy.set(row.legacy_id, row.file_path)
    }

    let reused = 0
    let uploaded = 0
    for (const att of attachments) {
      // Formato documentado na 0069: <legacy_id da mae>:<array>:<indice>. O
      // item do array nao tem id proprio no base44, e a posicao e o que o
      // identifica la — mesmo desenho de budget_item_quotes (0066).
      const legacy = `${att.parentLegacy}:${att.array}:${att.position}`
      const fileName = txt(att.meta.nome) ?? txt(att.meta.name)
      const url = txt(att.meta.url)
      // O rotulo carrega o que identifica o arquivo (nome e endereco de
      // origem). Ele so aparece no relatorio *.local, nunca no stdout.
      const label = `${fileName ?? '(sem nome)'} — ${url ?? '(sem url)'}`

      const parentId =
        att.parent === 'entries'
          ? diaryEntryIdByLegacy.get(att.parentLegacy)
          : siteVisitIdByLegacy.get(att.parentLegacy)
      if (!parentId) {
        const mae = att.parent === 'entries' ? 'entrada de diario' : 'visita de obra'
        pend('project_diary_files', legacy, `cascata: ${mae} ${att.parentLegacy} nao foi importada`, label)
        continue
      }
      if (!fileName) { pend('project_diary_files', legacy, 'anexo sem nome (file_name e NOT NULL)', label); continue }
      if (!url) { pend('project_diary_files', legacy, 'anexo sem url de origem: nao ha o que baixar', label); continue }

      if (DRY_RUN) {
        stat('project_diary_files').consumed += 1
        stat('project_diary_files').written += 1
        continue
      }

      // Ja importado numa execucao anterior? So conta como reaproveitado se o
      // OBJETO ainda estiver la: linha apontando para caminho vazio e pior do
      // que linha nenhuma, porque a tela mostra o clipe e o download falha.
      const existingPath = alreadyByLegacy.get(legacy)
      if (existingPath) {
        const slash = existingPath.lastIndexOf('/')
        const { data: found, error: listError } = await db.storage
          .from(DIARY_BUCKET)
          .list(existingPath.slice(0, slash), { search: existingPath.slice(slash + 1), limit: 1 })
        if (listError) abort(`listar objeto do bucket: ${listError.message}`)
        if ((found ?? []).length > 0) {
          reused += 1
          stat('project_diary_files').consumed += 1
          stat('project_diary_files').written += 1
          continue
        }
      }

      const got = await fetchAttachment(url, txt(att.meta.tipo) ?? txt(att.meta.type), limits)
      if (!got.ok) {
        // A ENTRADA JA ESTA NO BANCO — so o anexo fica de fora. E o que o plano
        // manda: nunca gravar link que se sabe que vai morrer, e nunca segurar
        // a anotacao por causa do arquivo dela.
        pend('project_diary_files', legacy, got.reason, label)
        adjust(
          att.parent === 'entries' ? 'project_diary_entries' : 'project_site_visits',
          att.parentLegacy,
          `gravada SEM o arquivo — ${got.reason}; nome e endereco de origem: ${label}`,
          label,
        )
        continue
      }

      // <tenant_id>/<mae>/<id da mae>/<uuid>.<ext>, o formato que a 0071
      // documenta. O PRIMEIRO segmento e o que as policies de storage.objects
      // comparam com o claim do JWT — e o equivalente, no Storage, do
      // tenant_id = auth_tenant_id() das tabelas. A extensao sai do tipo
      // CONFERIDO nos bytes, e nao do nome enviado; o nome de exibicao vive em
      // project_diary_files.file_name.
      const path = `${T()}/${att.parent}/${parentId}/${randomUUID()}.${MIME_EXTENSION[got.mime] ?? 'bin'}`
      const { error: uploadError } = await db.storage
        .from(DIARY_BUCKET)
        .upload(path, got.buffer, { contentType: got.mime, upsert: false })
      if (uploadError) {
        pend('project_diary_files', legacy, `upload para o bucket falhou: ${uploadError.message}`, label)
        adjust(
          att.parent === 'entries' ? 'project_diary_entries' : 'project_site_visits',
          att.parentLegacy,
          `gravada SEM o arquivo — upload recusado pelo bucket; nome e endereco de origem: ${label}`,
          label,
        )
        continue
      }

      const row = {
        tenant_id: T(),
        legacy_id: legacy,
        entry_id: att.parent === 'entries' ? parentId : null,
        visit_id: att.parent === 'visits' ? parentId : null,
        issue_id: null,
        file_kind: att.fileKind,
        file_path: path,
        file_name: fileName,
        mime_type: got.mime,
        byte_size: got.buffer.length,
        display_order: att.position,
        // Quem anexou nao existe na origem: o objeto do array tem nome, url e
        // tipo, e nada mais. Nulo e a resposta honesta.
        uploaded_by_id: null,
      }
      const res = await insertOne('project_diary_files', row, 'tenant_id,legacy_id')
      if (res.error) {
        // O objeto ja subiu e a linha nao entrou: sem a linha, o objeto e lixo
        // pago no bucket e alcancavel por caminho. Some com ele.
        await db.storage.from(DIARY_BUCKET).remove([path])
        pend('project_diary_files', legacy, `erro do banco: ${res.error.message}`, label)
        continue
      }
      uploaded += 1
      stat('project_diary_files').consumed += 1
      stat('project_diary_files').written += 1
    }
    log(
      `  ${stat('project_diary_files').written} de ${attachments.length}  ` +
        (DRY_RUN
          ? '(dry-run: nada foi baixado nem gravado)'
          : `(${uploaded} regravados no bucket, ${reused} ja estavam la)`),
    )
  }

  // -------------------------------------------------------------------------
  // Passo 33 — contas de acesso
  // -------------------------------------------------------------------------
  const credentials = []
  step(33, 'contas de acesso (auth.users + tenant_users + collaborators.user_id)')
  if (SKIP_ACCOUNTS) {
    log('  pulado por --skip-accounts')
  } else if (DRY_RUN) {
    log(`  (dry-run) ${stat('collaborators').written} contas seriam criadas`)
  } else {
    // Indice de quem ja existe no Auth. O e-mail e global no Supabase Auth:
    // uma conta ja criada por outra execucao (ou por outro escritorio) precisa
    // ser reaproveitada, nunca recriada.
    const existingByEmail = new Map()
    for (let page = 1; ; page += 1) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
      if (error) abort(`listar usuarios do Auth: ${error.message}`)
      for (const u of data.users) existingByEmail.set((u.email ?? '').toLowerCase(), u.id)
      if (data.users.length < 200) break
    }

    const { data: collaborators, error: readError } = await db
      .from('collaborators')
      .select('id, legacy_id, name, email, role, status, user_id')
      .eq('tenant_id', tenantId)
    if (readError) abort(`ler colaboradores: ${readError.message}`)

    let created = 0
    let reused = 0
    for (const c of collaborators.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const email = c.email.toLowerCase()
      let userId = c.user_id
      let password = null

      if (!userId && existingByEmail.has(email)) {
        userId = existingByEmail.get(email)
        reused += 1
      } else if (!userId) {
        // Senha definida na criacao, e nao convite por e-mail: o convite exige
        // SMTP configurado no projeto e uma URL de redirecionamento, e nenhum
        // dos dois esta pronto. A senha vai para o arquivo *.local e o
        // escritorio a troca no primeiro acesso.
        password = `Fc${randomBytes(9).toString('base64url')}!7`
        const { data: user, error } = await db.auth.admin.createUser({
          email: c.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: c.name },
        })
        if (error) {
          pend('contas_de_acesso', c.legacy_id, `criar usuario: ${error.message}`, c.email)
          continue
        }
        userId = user.user.id
        created += 1
      } else {
        reused += 1
      }

      if (c.user_id !== userId) {
        const { error } = await db.from('collaborators').update({ user_id: userId }).eq('id', c.id)
        if (error) { pend('contas_de_acesso', c.legacy_id, `vincular user_id: ${error.message}`, c.email); continue }
      }

      const { error: linkError } = await db
        .from('tenant_users')
        .upsert({ tenant_id: tenantId, user_id: userId, role: c.role === 'director' ? 'owner' : 'member' },
          { onConflict: 'tenant_id,user_id' })
      if (linkError) { pend('contas_de_acesso', c.legacy_id, `vincular ao escritorio: ${linkError.message}`, c.email); continue }

      credentials.push({ name: c.name, role: c.role, status: c.status, email: c.email, password })
    }

    const directors = collaborators.filter((c) => c.role === 'director')
    log(`  ${created} contas criadas, ${reused} reaproveitadas, ${credentials.length} vinculadas ao escritorio`)
    log(`  Diretores com login: ${directors.length}`)
    if (directors.length < 2) {
      abort(
        'o escritorio ficou com menos de dois Diretores. Diretor e o unico papel que ' +
          'gerencia equipe, e Diretor afastado nao le nada (docs/ARCHITECTURE.md).',
      )
    }
  }

  // -------------------------------------------------------------------------
  // Relatorio de pendencias (escrito ANTES da conferencia: se a conferencia
  // abortar, o relatorio ja esta em disco)
  // -------------------------------------------------------------------------
  writePendencies()

  // -------------------------------------------------------------------------
  // Conferencia
  // -------------------------------------------------------------------------
  await verify(tenantId, credentials)

  // -------------------------------------------------------------------------
  // Credenciais
  // -------------------------------------------------------------------------
  if (!DRY_RUN && !SKIP_ACCOUNTS) writeCredentials(credentials)

  summary()
}

// ---------------------------------------------------------------------------
// Relatorios
// ---------------------------------------------------------------------------

function writePendencies() {
  const file = resolve(HERE, 'import-pendencias.local')
  const lines = []
  lines.push('RELATORIO DE PENDENCIAS DA IMPORTACAO DO BASE44')
  lines.push(`Gerado em ${new Date().toISOString()}${DRY_RUN ? '  (DRY RUN)' : ''}`)
  lines.push(`Escritorio: ${TENANT_NAME} (${TENANT_SLUG})`)
  lines.push('')
  lines.push('Este arquivo tem dado que identifica cliente e colaborador. Nao versionar,')
  lines.push('nao colar em mensagem, nao anexar em ticket. Ele existe para que cada linha')
  lines.push('recusada possa ser achada no base44 e decidida uma a uma.')
  lines.push('')
  lines.push('A regra que produziu esta lista: linha orfa nao e descartada em silencio nem')
  lines.push('apontada para nulo, e valor de lista fora de docs/ENUM-MAP.md nunca vira')
  lines.push('"other" calado. Uma linha ou entra inteira, ou aparece aqui com o motivo.')
  lines.push('')

  lines.push('='.repeat(78))
  lines.push('RESUMO POR MOTIVO')
  lines.push('='.repeat(78))
  const byReason = new Map()
  for (const p of pendencies) {
    // Agrupa pelo motivo sem o id, que muda a cada linha.
    const key = `${p.entity} :: ${p.reason.replace(/\b[0-9a-f]{24}\b/g, '<id>').replace(/"[^"]*"/g, '"<valor>"')}`
    byReason.set(key, (byReason.get(key) ?? 0) + 1)
  }
  for (const [key, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`${String(n).padStart(5)}  ${key}`)
  }
  lines.push('')

  lines.push('='.repeat(78))
  lines.push('LINHA A LINHA')
  lines.push('='.repeat(78))
  for (const [entity, rows] of [...pendByEntity.entries()].sort()) {
    lines.push('')
    lines.push(`--- ${entity}  (${rows.length} linha(s)) ${'-'.repeat(Math.max(0, 50 - entity.length))}`)
    for (const r of rows) {
      lines.push(`  ${r.legacyId}  ${r.label ? `[${r.label}]  ` : ''}${r.reason}`)
    }
  }

  lines.push('')
  lines.push('='.repeat(78))
  lines.push('AJUSTES APLICADOS (a linha ENTROU, com o campo traduzido ou nulo)')
  lines.push('='.repeat(78))
  lines.push('Nao sao pendencia. Sao as diferencas entre o que o base44 tinha e o que o')
  lines.push('banco passou a ter, uma a uma, para que nenhuma traducao aconteca em silencio.')
  lines.push('Tres familias: ponteiro orfao gravado NULO (o alvo nao existe em lugar nenhum')
  lines.push('do export), valor traduzido pelo de/para novo de docs/ENUM-MAP.md, e formato')
  lines.push('convertido (competencia sem barra, prazo 0, parcela sem total).')
  lines.push('')
  {
    const byWhat = new Map()
    for (const a of adjustments) {
      const key = `${a.entity} :: ${a.what.replace(/\b[0-9a-f]{24}\b/g, '<id>')}`
      byWhat.set(key, (byWhat.get(key) ?? 0) + 1)
    }
    lines.push('--- resumo ---')
    for (const [key, n] of [...byWhat.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`${String(n).padStart(5)}  ${key}`)
    }
  }
  for (const [entity, rows] of [...adjByEntity.entries()].sort()) {
    lines.push('')
    lines.push(`--- ${entity}  (${rows.length} ajuste(s)) ${'-'.repeat(Math.max(0, 46 - entity.length))}`)
    for (const r of rows) {
      lines.push(`  ${r.legacyId}  ${r.label ? `[${r.label}]  ` : ''}${r.what}`)
    }
  }
  lines.push('')
  lines.push(`total: ${adjustments.length} ajustes`)

  lines.push('')
  lines.push('='.repeat(78))
  lines.push('CONFLITOS DE PERMISSAO RESOLVIDOS PELO MAIS RESTRITIVO')
  lines.push('='.repeat(78))
  lines.push('Nao sao pendencia: a linha entrou. Sao os casos em que o mesmo menu foi')
  lines.push('gravado duas vezes para a mesma pessoa, com valores contraditorios, por duas')
  lines.push('telas diferentes do base44. Em conflito vale o MENOR acesso.')
  lines.push('')
  for (const c of permissionConflicts) {
    lines.push(`  ${c.name}  ->  ${c.menuKey}`)
    for (const g of c.gravado) lines.push(`      ${g}`)
    lines.push(`      aplicado: ${c.aplicado}`)
  }
  lines.push('')
  lines.push(`total: ${permissionConflicts.length} conflitos`)

  lines.push('')
  lines.push('='.repeat(78))
  lines.push('O QUE NAO FOI IMPORTADO POR DECISAO (e nao por defeito do dado)')
  lines.push('='.repeat(78))
  for (const [field, why] of IGNORED_ON_PURPOSE) lines.push(`  ${field.padEnd(52)} ${why}`)

  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 })
  log(`\n  Pendencias em scripts/import-pendencias.local  (${pendencies.length} linhas)`)
}

function writeCredentials(credentials) {
  const withPassword = credentials.filter((c) => c.password)
  const file = resolve(HERE, 'credenciais-escritorio.local')
  // Execucao sem conta nova NAO reescreve o arquivo. O script e idempotente e
  // sera rodado de novo a cada lote de pendencia resolvida; sobrescrever com
  // "nenhuma conta nova" apagaria as unicas copias das senhas do escritorio, e
  // elas nao sao recuperaveis — so redefiniveis.
  if (withPassword.length === 0) {
    log(`  Nenhuma conta nova: scripts/credenciais-escritorio.local preservado como estava.`)
    return
  }
  const content =
    `Contas de acesso — escritorio "${TENANT_SLUG}" (${TENANT_NAME})\n` +
    `Gerado em ${new Date().toISOString()}\n` +
    `Projeto: ${SUPABASE_URL}\n\n` +
    `Arquivo ignorado pelo git (*.local), modo 0600. NAO versionar, NAO colar em\n` +
    `mensagem. Estas sao contas de PRODUCAO, de gente real: a senha abaixo e a\n` +
    `senha inicial e precisa ser trocada no primeiro acesso.\n\n` +
    `As contas que ja existiam nao aparecem com senha — a senha delas nao e\n` +
    `conhecida por este script e nao foi alterada.\n\n` +
    (withPassword.length === 0
      ? 'Nenhuma conta nova nesta execucao.\n'
      : withPassword
          .map(
            (c) =>
              `${c.name}\n  funcao: ${c.role}   status: ${c.status}\n  email:  ${c.email}\n  senha:  ${c.password}\n`,
          )
          .join('\n')) +
    `\nSem senha (conta ja existia): ${credentials.filter((c) => !c.password).length}\n` +
    credentials.filter((c) => !c.password).map((c) => `  ${c.email}  (${c.role})\n`).join('')
  writeFileSync(file, content, { mode: 0o600 })
  log(`  Credenciais em scripts/credenciais-escritorio.local  (${withPassword.length} senhas novas)`)
}

// ---------------------------------------------------------------------------
// Conferencia — releitura do banco
// ---------------------------------------------------------------------------

// Dinheiro em centavos: somar float de 279 recebiveis acumula erro e a
// conferencia que mais importa e justamente a do dinheiro.
const cents = (v) => Math.round(Number(v ?? 0) * 100)

// Le a tabela inteira em paginas. Sem isso, o PostgREST devolve so a primeira
// pagina (1000 linhas por padrao, menos se `max-rows` estiver configurado) e a
// conferencia somaria menos do que existe — conferencia que le pela metade e
// pior do que conferencia nenhuma, porque passa.
async function selectAll(table, columns, apply) {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let query = db.from(table).select(columns).range(from, from + PAGE - 1)
    query = apply(query)
    const { data, error } = await query
    if (error) return { error }
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return { rows }
}

async function verify(tenantId, credentials) {
  log('\n' + '='.repeat(78))
  log('CONFERENCIA')
  log('='.repeat(78))

  const problems = []

  // 1. importadas + pendencias = total do CSV, por entidade -------------------
  log('\n1. contagem por entidade (consumidas + pendencias = total do CSV)')
  for (const [entity, s] of stats) {
    const pended = (pendByEntity.get(entity) ?? []).length
    const ok = s.consumed + pended === s.source
    log(
      `   ${ok ? 'ok  ' : 'FALHA'} ${entity.padEnd(28)} ` +
        `origem=${String(s.source).padStart(5)} consumidas=${String(s.consumed).padStart(5)} ` +
        `pendencias=${String(pended).padStart(5)} gravadas=${String(s.written).padStart(5)}`,
    )
    if (!ok) problems.push(`${entity}: ${s.consumed} + ${pended} != ${s.source}`)
  }

  if (DRY_RUN) {
    log('\n   (dry-run) as conferencias 2 a 4 precisam do banco e foram puladas')
    if (problems.length > 0) abort(`conferencia falhou:\n    ${problems.join('\n    ')}`)
    return
  }

  // 2. contagem no banco bate com o que o script acha que gravou --------------
  log('\n2. contagem no banco')
  const TABLES = [
    'collaborators', 'collaborator_permissions', 'access_requests', 'clients',
    'negotiations', 'negotiation_services', 'negotiation_owner_history', 'contracts',
    'client_intakes', 'projects', 'project_land_types', 'project_purposes',
    'project_checklist_items', 'tasks', 'task_checklist_items', 'activities',
    'financial_categories', 'accounts_receivable', 'accounts_payable', 'suppliers',
    'supplier_brands', 'budget_checklists', 'budget_checklist_items',
    'budget_item_quotes', 'map_properties', 'map_property_land_types',
    'map_property_purposes', 'project_diary_entries', 'project_diary_files',
  ]
  /*
    A CONTAGEM E DAS LINHAS IMPORTADAS, e nao do total da tabela.

    Ela nasceu comparando com o total, e estava certa enquanto a tabela so
    tivesse saida de importacao. Deixou de estar: o escritorio comecou a USAR o
    sistema, e criou 29 linhas legitimas pela tela (3 clientes, 2 contratos, 4
    negociacoes, 8 briefings, 12 recebiveis, mais filhas). A conferencia lia
    isso como falha e o script inteiro saia com codigo 1 — acusando um problema
    que nao existia e escondendo os que existirem.

    O que ela quer garantir e "toda linha do CSV foi contabilizada", e linha
    nascida na tela nao e linha do CSV. O discriminador e `legacy_id`, o mesmo
    que ja separa dado importado de dado nascido aqui em todo o resto do
    projeto (migrations 0061 a 0066).

    Isto NAO afrouxa a conferencia: ela passa a medir exatamente o que a
    importacao controla. Linha importada que sumir, duplicar ou entrar a mais
    continua derrubando.
  */
  /*
    NEM TODA TABELA TEM `legacy_id`. As filhas de array (servicos da negociacao,
    tags de projeto, itens de checklist, marcas de fornecedor, tags do mapa,
    historico de responsavel) nao tem, porque o elemento nao tem id na origem —
    esta escrito nas migrations que as criaram. Filtrar por uma coluna que nao
    existe devolve erro do PostgREST, e a conferencia vira "nao consegui contar"
    em oito tabelas de uma vez.
  */
  /*
    NEM TODA TABELA TEM `legacy_id`. As filhas de array (servicos da negociacao,
    tags de projeto, itens de checklist, marcas de fornecedor, tags do mapa,
    historico de responsavel) nao tem, porque o elemento nao tem id na origem —
    esta escrito nas migrations que as criaram.

    Para elas, "linha importada" e "linha cuja MAE veio da importacao": o filtro
    vira um embed `!inner` na mae com `legacy_id not null`. Sem isso, o item de
    checklist criado pela equipe numa tarefa nova entraria na conta e a
    conferencia acusaria diferenca a cada tarefa aberta.
  */
  const MAE = {
    negotiation_services: 'negotiations',
    negotiation_owner_history: 'negotiations',
    project_land_types: 'projects',
    project_purposes: 'projects',
    project_checklist_items: 'projects',
    task_checklist_items: 'tasks',
    supplier_brands: 'suppliers',
    map_property_land_types: 'map_properties',
    map_property_purposes: 'map_properties',
  }

  /* Tabelas que vem DIRETO de um CSV, e de qual. Só estas conseguem dizer o que
     o export deixou de declarar; as filhas herdam o destino da mae. */
  const TABELA_ENTIDADE = {
    collaborators: 'Collaborator',
    access_requests: 'SolicitacaoAcesso',
    clients: 'Client',
    negotiations: 'Negociacao',
    client_intakes: 'ClientIntake',
    contracts: 'Contract',
    projects: 'Project',
    tasks: 'Task',
    activities: 'Atividade',
    financial_categories: 'FinancialCategory',
    accounts_receivable: 'AccountReceivable',
    accounts_payable: 'AccountPayable',
    suppliers: 'Fornecedor',
    budget_checklists: 'ChecklistOrcamento',
    map_properties: 'PropriedadeMapa',
    project_diary_entries: 'ProjectTimelineEntry',
  }

  /*
    Quantas linhas de cada tabela tem legacy_id que o CSV NAO declara mais.
    Calculado uma vez e usado pelas duas conferencias, para as duas contarem a
    mesma coisa — se cada uma fizesse a sua conta, elas divergiriam no dia em que
    alguem mudasse uma delas.
  */
  const sobrasPorTabela = new Map()
  for (const [table, entity] of Object.entries(TABELA_ENTIDADE)) {
    const { rows, error } = await selectAll(table, 'legacy_id', (q) =>
      q.eq('tenant_id', tenantId).not('legacy_id', 'is', null),
    )
    if (error) continue
    const noCsv = new Set((csv[entity] ?? []).map((r) => r.id))
    sobrasPorTabela.set(table, rows.filter((r) => !noCsv.has(r.legacy_id)).length)
  }

  /*
    A FILHA HERDA A SOBRA DA MAE, e esquecer disso deixou a conferencia falhando
    por 14 linhas que ja tinham explicacao: as permissoes de um colaborador que
    saiu do escritorio. A linha filha nao tem legacy_id proprio para comparar com
    o CSV — quem decide se ela ainda deveria existir e a mae.
  */
  for (const [table, parent] of Object.entries(MAE)) {
    const entity = TABELA_ENTIDADE[parent]
    if (!entity) continue
    const { rows, error } = await selectAll(table, `mae:${parent}!inner(legacy_id)`, (q) =>
      q.eq('tenant_id', tenantId).not('mae.legacy_id', 'is', null),
    )
    if (error) continue
    const noCsv = new Set((csv[entity] ?? []).map((r) => r.id))
    sobrasPorTabela.set(table, rows.filter((r) => !noCsv.has(r.mae?.legacy_id)).length)
  }

  for (const table of TABLES) {
    /*
      `task_checklist_items` NAO E CONFERIVEL POR CONTAGEM, e o motivo e do
      dominio: a tabela nao tem `legacy_id` (item de array sem id na origem) e a
      mae nao serve de discriminador, porque o SISTEMA cria item de checklist
      sozinho quando uma tarefa IMPORTADA entra numa fase com template
      (`CHECKLIST_BY_PHASE`). Item novo em tarefa velha e uso normal, nao desvio.

      Entao esta conferencia sai da lista que derruba o script, e o numero e
      impresso como informacao. Fechar isso de verdade exige dar `legacy_id`
      sintetico a tabela, como a 0066 fez com budget_item_quotes — migration, e
      fora do escopo desta entrega. Fica escrito para nao virar buraco calado.
    */
    if (table === 'task_checklist_items') {
      const { count: total } = await db
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      log(
        `   info ${table.padEnd(28)} no banco=${String(total).padStart(5)}` +
          ` importadas=${String(stat(table).written).padStart(5)}` +
          ` (nao conferivel: sem legacy_id, e o sistema gera item por template)`,
      )
      continue
    }

    const mae = MAE[table]
    let query = mae
      ? db
          .from(table)
          .select(`*, mae:${mae}!inner(legacy_id)`, { count: 'exact', head: true })
          .not('mae.legacy_id', 'is', null)
      : db.from(table).select('*', { count: 'exact', head: true }).not('legacy_id', 'is', null)
    query = query.eq('tenant_id', tenantId)
    const { count, error } = await query
    if (error) { problems.push(`${table}: nao consegui contar (${error.message})`); continue }
    const expected = stat(table).written

    /*
      O QUE O CSV NAO DECLARA MAIS NAO CONTA COMO ERRO AQUI.

      `expected` e o que ESTA execucao gravou; `count` e tudo que tem legacy_id
      no banco. A diferenca inclui linha gravada por uma importacao ANTERIOR e
      que o export de hoje nao traz mais — alguem removida na origem, mantida
      aqui de proposito (o caso concreto: um colaborador que saiu do escritorio
      e foi desativado em vez de apagado, para nao perder o rastro do trabalho
      dele).

      Sem este desconto, a conferencia passaria a abortar para sempre depois da
      primeira remocao na origem — e uma conferencia que sempre falha e uma
      conferencia que ninguem le. A pergunta que ela precisa responder continua
      inteira: "tudo que eu gravei esta la?".
    */
    const foraDoCsv = (sobrasPorTabela.get(table) ?? 0)
    const ok = count - foraDoCsv === expected
    log(
      `   ${ok ? 'ok  ' : 'FALHA'} ${table.padEnd(28)} importadas=${String(count).padStart(5)}` +
        ` esperado=${String(expected).padStart(5)}` +
        (foraDoCsv > 0 ? `  (+${foraDoCsv} fora do CSV, removida na origem)` : ''),
    )
    if (!ok) {
      problems.push(
        `${table}: banco tem ${count} importadas (${foraDoCsv} fora do CSV), esperado ${expected}`,
      )
    }
  }

  // 3. nenhuma linha do escritorio real caiu em outro tenant ------------------
  log('\n3. isolamento: nenhum legacy_id deste export em outro escritorio')
  {
    const { data: others, error } = await db.from('tenants').select('id, slug').neq('id', tenantId)
    if (error) abort(`ler tenants: ${error.message}`)
    const otherIds = new Set(others.map((t) => t.id))
    const bySlug = new Map(others.map((t) => [t.id, t.slug]))
    for (const t of others) {
      if (!TEST_TENANT_SLUGS.includes(t.slug)) {
        log(`   aviso  tenant desconhecido no banco: ${t.slug}`)
      }
    }
    const legacyTables = TABLES.filter((t) => !['negotiation_services', 'negotiation_owner_history',
      'project_land_types', 'project_purposes', 'project_checklist_items', 'task_checklist_items',
      'supplier_brands', 'budget_item_quotes', 'map_property_land_types', 'map_property_purposes',
      // legacy_id sintetico (<id da mae>:anexos:<indice>), como budget_item_quotes:
      // nao e ObjectId do base44 e nao entra no teste de intruso abaixo.
      'project_diary_files'].includes(t))
    let intruders = 0
    for (const table of legacyTables) {
      // A pergunta e feita AO BANCO ("existe linha com legacy_id fora deste
      // escritorio?"). Ler tudo e filtrar aqui dependeria de a lista vir
      // inteira, e a primeira pagina do PostgREST nao e a lista inteira.
      const { rows, error: readError } = await selectAll(table, 'tenant_id, legacy_id', (q) =>
        q.not('legacy_id', 'is', null).neq('tenant_id', tenantId))
      if (readError) { problems.push(`${table}: nao consegui ler legacy_id (${readError.message})`); continue }
      for (const row of rows) {
        if (!otherIds.has(row.tenant_id)) continue
        // O legacy_id do base44 e um ObjectId de 24 hex. Se um aparece em outro
        // escritorio, e linha real fora de lugar.
        if (/^[0-9a-f]{24}$/.test(row.legacy_id)) {
          problems.push(`${table}: legacy_id ${row.legacy_id} esta no tenant ${bySlug.get(row.tenant_id)}`)
          intruders += 1
        }
      }
    }
    log(`   ${intruders === 0 ? 'ok  ' : 'FALHA'} ${intruders} linha(s) com legacy_id do base44 fora deste escritorio`)
  }

  // 4. dinheiro --------------------------------------------------------------
  //
  // DUAS PERGUNTAS DIFERENTES, e a partir da terceira passada as duas sao
  // conferidas:
  //   a) o banco soma o mesmo que as linhas que ele tem? (gravacao fiel)
  //   b) o banco soma o mesmo que o CSV INTEIRO? (nada ficou de fora)
  // Ate a segunda passada so (a) era exigida, e (b) saia como informacao. A meta
  // desta passada e 100% do dinheiro, entao (b) tambem derruba a conferencia:
  // centavo que falta e linha que ficou de fora, e linha que fica de fora
  // precisa de motivo escrito no relatorio de pendencias.
  log('\n4. totais financeiros (CSV inteiro x banco)')
  const money = [
    ['contracts', 'total_value', csv.Contract, 'total_value', 'Contract'],
    ['accounts_receivable', 'value', csv.AccountReceivable, 'value', 'AccountReceivable'],
    ['accounts_payable', 'value', csv.AccountPayable, 'value', 'AccountPayable'],
  ]
  const fmt = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  let sourceTotal = 0
  let dbTotal = 0
  for (const [table, column, sourceRows, sourceColumn, entity] of money) {
    /*
      SO AS LINHAS IMPORTADAS, pelo mesmo motivo da conferencia 2: o escritorio
      esta usando o sistema e cadastrou contrato e recebivel pela tela. Somar a
      tabela inteira faria a conferencia acusar diferenca a cada venda nova —
      e a pergunta aqui e "o dinheiro do CSV chegou inteiro", nao "quanto o
      escritorio tem". Sem o recorte, este bloco derrubaria o script para sempre
      a partir do primeiro contrato fechado depois da migracao.
    */
    const { rows, error } = await selectAll(table, `legacy_id, ${column}`, (q) =>
      q.eq('tenant_id', tenantId).not('legacy_id', 'is', null),
    )
    if (error) { problems.push(`${table}: nao consegui somar (${error.message})`); continue }
    const inDb = new Map(rows.map((r) => [r.legacy_id, r[column]]))
    let expected = 0
    let pendedMoney = 0
    for (const r of sourceRows) {
      const v = cents(r[sourceColumn])
      if (inDb.has(r.id)) expected += v
      else pendedMoney += v
    }
    const observed = [...inDb.values()].reduce((a, v) => a + cents(v), 0)
    const ok = expected === observed
    const whole = pendedMoney === 0
    sourceTotal += expected + pendedMoney
    dbTotal += observed
    log(`   ${ok ? 'ok  ' : 'FALHA'} ${table.padEnd(22)} banco=${fmt(observed).padStart(16)}  csv(importadas)=${fmt(expected).padStart(16)}`)
    log(
      `   ${whole ? 'ok  ' : 'FALHA'} ${entity.padEnd(22)} CSV inteiro=${fmt(expected + pendedMoney).padStart(11)}` +
        `  ficou de fora=${fmt(pendedMoney).padStart(13)} em ${sourceRows.length - inDb.size} linha(s)`,
    )
    if (!ok) problems.push(`${table}: soma do banco ${fmt(observed)} != soma do CSV das importadas ${fmt(expected)}`)
    if (!whole) problems.push(`${entity}: ${fmt(pendedMoney)} do CSV nao esta no banco (${sourceRows.length - inDb.size} linha(s))`)
  }
  log(`   ${dbTotal === sourceTotal ? 'ok  ' : 'FALHA'} ${'TOTAL (3 tabelas)'.padEnd(22)} banco=${fmt(dbTotal).padStart(16)}  csv inteiro=${fmt(sourceTotal).padStart(16)}`)

  // 4b. a tabela do diagnostico, relida do banco -----------------------------
  //
  // Uma linha por entidade que o Diretor abre na tela, com o que o CSV tem e o
  // que o banco tem AGORA. `falta` e a diferenca, e cada unidade dela precisa
  // ter um motivo no relatorio de pendencias.
  log('\n4b. carteira: CSV x banco, entidade por entidade')
  {
    const CARTEIRA = [
      ['Tarefas', 'Task', 'tasks'],
      ['A receber', 'AccountReceivable', 'accounts_receivable'],
      ['Briefings', 'ClientIntake', 'client_intakes'],
      ['Mapa', 'PropriedadeMapa', 'map_properties'],
      ['Atividades', 'Atividade', 'activities'],
      ['Negociacoes', 'Negociacao', 'negotiations'],
      ['Projetos', 'Project', 'projects'],
      ['Solicitacoes', 'SolicitacaoAcesso', 'access_requests'],
      ['A pagar', 'AccountPayable', 'accounts_payable'],
      ['Contratos', 'Contract', 'contracts'],
      ['Clientes', 'Client', 'clients'],
      ['Colaboradores', 'Collaborator', 'collaborators'],
      ['Fornecedores', 'Fornecedor', 'suppliers'],
      ['Diario', 'ProjectTimelineEntry', 'project_diary_entries'],
    ]
    log(`   ${'entidade'.padEnd(16)}${'CSV'.padStart(6)}${'banco'.padStart(7)}${'falta'.padStart(7)}`)
    let missing = 0
    for (const [label, entity, table] of CARTEIRA) {
      const source = csv[entity].length
      /*
        SO AS IMPORTADAS, pelo mesmo motivo das conferencias 2 e 4: a pergunta e
        "toda linha do CSV chegou", e cliente cadastrado pela equipe depois da
        migracao nao e linha do CSV. Sem o recorte, esta conferencia passa a
        acusar diferenca NEGATIVA a cada cadastro novo — e foi o que aconteceu
        assim que o escritorio comecou a usar o sistema.
      */
      const { rows: importadas, error } = await selectAll(table, 'legacy_id', (q) =>
        q.eq('tenant_id', tenantId).not('legacy_id', 'is', null),
      )
      if (error) { problems.push(`${table}: nao consegui contar (${error.message})`); continue }

      /*
        DUAS PERGUNTAS DIFERENTES, e antes elas eram uma so.

        A conferencia comparava `CSV - total importado` e exigia que a diferenca
        fosse igual as pendencias. Isso confunde "linha do CSV que nao chegou"
        com "linha que o CSV nao tem mais" — e as duas passaram a existir no dia
        em que o escritorio removeu alguem do base44 e a decisao aqui foi manter
        o registro, desativado, em vez de apagar (Luiz Antonio, 31/08/2026).

        Somadas, elas se cancelam: uma linha faltando e uma sobrando davam
        diferenca zero e a conferencia passava com um defeito dentro. Separadas,
        cada uma diz o que e.

          FALTA   linha do CSV que nao esta no banco. Tem que ser exatamente o
                  que o relatorio de pendencias explica. Isto continua sendo
                  FALHA.
          SOBRA   linha no banco com legacy_id que o CSV nao declara mais.
                  Removida na origem. E INFORMACAO, e vai listada — decisao de
                  apagar ou nao e do escritorio, nao deste script.
      */
      const noCsv = new Set(csv[entity].map((r) => r.id))
      const presentes = new Set(importadas.map((r) => r.legacy_id))
      const gap = source - [...noCsv].filter((id) => presentes.has(id)).length
      const sobra = [...presentes].filter((id) => !noCsv.has(id))
      missing += gap
      log(
        `   ${label.padEnd(16)}${String(source).padStart(6)}${String(importadas.length).padStart(7)}` +
          `${(gap === 0 ? '-' : String(gap)).padStart(7)}` +
          (sobra.length > 0 ? `   (+${sobra.length} fora do CSV)` : ''),
      )

      const pended = (pendByEntity.get(table) ?? []).length
      if (gap !== pended) {
        problems.push(`${table}: faltam ${gap} linhas e o relatorio explica ${pended}`)
      }
      for (const id of sobra) {
        adjust(table, id, 'linha existe no banco e o CSV nao a declara mais: removida na origem')
      }
    }
    log(`   ${'TOTAL'.padEnd(16)}${''.padStart(6)}${''.padStart(7)}${String(missing).padStart(7)}`)
  }

  // 4c. o diario do projeto, relido do banco ---------------------------------
  //
  // As contagens 1, 2 e 4b ja cobrem "36 = gravadas + pendencias" e "o banco
  // tem o que o script acha que gravou". O que elas NAO cobrem e o que este
  // modulo tem de especial: o registro manual e a unica coisa deste export que
  // nao existe em nenhum outro lugar, e ele nao pode entrar mutilado. Titulo e
  // descricao sao conferidos CARACTERE A CARACTERE contra o CSV.
  log('\n4c. diario do projeto (modulo 11)')
  {
    const { rows, error } = await selectAll(
      'project_diary_entries',
      'legacy_id, project_id, title, description, is_automatic, entry_type, system_event, event_key, visibility, from_phase, to_phase',
      (q) => q.eq('tenant_id', tenantId),
    )
    if (error) {
      problems.push(`project_diary_entries: nao consegui reler (${error.message})`)
    } else {
      const byLegacy = new Map(rows.map((r) => [r.legacy_id, r]))
      const source = csv.ProjectTimelineEntry
      const written = source.filter((r) => byLegacy.has(r.id)).length
      const pended = (pendByEntity.get('project_diary_entries') ?? []).length

      const check = (ok, label, detail) => {
        log(`   ${ok ? 'ok  ' : 'FALHA'} ${label}`)
        if (!ok) problems.push(detail)
      }

      check(
        written + pended === source.length,
        `${source.length} lidas = ${written} gravadas + ${pended} pendencias`,
        `project_diary_entries: ${written} + ${pended} != ${source.length}`,
      )

      // Nenhuma das 36 pode estar fora do escritorio real. A pergunta e feita
      // ao banco inteiro, e nao so a este tenant.
      const { rows: elsewhere, error: elsewhereError } = await selectAll(
        'project_diary_entries', 'legacy_id, tenant_id', (q) => q.neq('tenant_id', tenantId))
      if (elsewhereError) problems.push(`project_diary_entries: nao consegui varrer outros escritorios (${elsewhereError.message})`)
      else {
        const csvIds = new Set(source.map((r) => r.id))
        const intruders = elsewhere.filter((r) => csvIds.has(r.legacy_id))
        check(
          intruders.length === 0,
          `nenhum legacy_id do CSV em outro escritorio (${elsewhere.length} linha(s) de diario em outros tenants)`,
          `project_diary_entries: ${intruders.length} legacy_id do export do escritorio real fora dele`,
        )
      }

      const projectsExpected = new Set(source.filter((r) => byLegacy.has(r.id)).map((r) => r.project_id)).size
      const projectsInDb = new Set(rows.map((r) => r.project_id)).size
      check(
        projectsExpected === projectsInDb,
        `${projectsInDb} projetos distintos com diario (CSV: ${projectsExpected})`,
        `project_diary_entries: ${projectsInDb} projetos distintos no banco, ${projectsExpected} no CSV`,
      )

      // As 5 manuais, inteiras. Titulo com btrim (o payload grava trim); a
      // descricao entra por txt(), que tambem apara as pontas.
      const manuals = source.filter((r) => r.is_automatico !== 'true')
      let broken = 0
      for (const r of manuals) {
        const got = byLegacy.get(r.id)
        if (!got) { broken += 1; continue }
        if (got.title !== r.titulo.trim()) { broken += 1; continue }
        if ((got.description ?? '') !== (txt(r.descricao) ?? '')) { broken += 1; continue }
        if (got.is_automatic !== false) broken += 1
      }
      check(
        broken === 0 && manuals.length === 5,
        `${manuals.length} anotacoes manuais integras (titulo e descricao identicos ao CSV)`,
        `project_diary_entries: ${broken} de ${manuals.length} anotacoes manuais divergem do CSV`,
      )

      // As decisoes do plano, conferidas no dado e nao so no codigo.
      const autos = rows.filter((r) => r.is_automatic)
      check(
        autos.every((r) => r.system_event !== null && r.entry_type === 'system'),
        `${autos.length} automaticas com system_event preenchido pelo prefixo de evento_chave`,
        'project_diary_entries: automatica sem system_event ou com entry_type fora de system',
      )
      check(
        rows.every((r) => r.from_phase === null && r.to_phase === null),
        'from_phase/to_phase nulos nas 36 (a fase NAO foi extraida do texto do titulo)',
        'project_diary_entries: alguma linha importada ganhou fase — ver defeito 10 do plano',
      )
      check(
        rows.every((r) => r.visibility === 'internal'),
        'visibility no default internal (a origem nao tem o campo)',
        'project_diary_entries: linha importada marcada como visivel ao cliente',
      )

      const keys = rows.map((r) => r.event_key).filter((k) => k !== null)
      check(
        new Set(keys).size === keys.length,
        `${keys.length} event_key, todos distintos`,
        'project_diary_entries: event_key repetido',
      )

      // Os anexos: cada linha precisa ter objeto vivo no bucket. Linha
      // apontando para caminho vazio e a tela mostrando um clipe que nao abre.
      const { rows: files, error: filesError } = await selectAll(
        'project_diary_files', 'legacy_id, file_path, mime_type, byte_size, entry_id', (q) => q.eq('tenant_id', tenantId))
      if (filesError) problems.push(`project_diary_files: nao consegui reler (${filesError.message})`)
      else {
        /*
          AS DUAS MAES, e nao so a entrada de diario.

          Esta conta somava apenas `ProjectTimelineEntry.anexos` e ficou para
          tras quando o passo 32 passou a coletar tambem `fotos` e `arquivos` da
          visita de obra. O resultado foi uma FALHA que nao descrevia defeito
          nenhum: "5 anexos = 4 no bucket + 2 pendencias" — 4+2=6, porque a sexta
          linha existia e o total esperado e que estava velho.

          Conferencia que conta menos do que o passo grava acusa erro onde nao ha,
          e some com o erro que houver: o proximo anexo de verdade que faltasse
          entraria nessa mesma diferenca sem ninguem distinguir.
        */
        const sourceFiles =
          csv.ProjectTimelineEntry.reduce((n, r) => n + jsonArray(r.anexos).length, 0) +
          (csv.ProjectSiteVisit ?? []).reduce(
            (n, r) => n + jsonArray(r.fotos).length + jsonArray(r.arquivos).length,
            0,
          )
        const filesPended = (pendByEntity.get('project_diary_files') ?? []).length
        check(
          files.length + filesPended === sourceFiles,
          `${sourceFiles} anexos = ${files.length} no bucket + ${filesPended} pendencia(s)`,
          `project_diary_files: ${files.length} + ${filesPended} != ${sourceFiles}`,
        )
        let missing = 0
        for (const f of files) {
          if (!f.file_path.startsWith(`${tenantId}/`)) {
            problems.push('project_diary_files: caminho de objeto que nao comeca pelo tenant_id')
            continue
          }
          const slash = f.file_path.lastIndexOf('/')
          const { data: found, error: listError } = await db.storage
            .from(DIARY_BUCKET)
            .list(f.file_path.slice(0, slash), { search: f.file_path.slice(slash + 1), limit: 1 })
          if (listError || (found ?? []).length === 0) missing += 1
        }
        check(
          missing === 0,
          `${files.length} objeto(s) conferido(s) no bucket ${DIARY_BUCKET}`,
          `project_diary_files: ${missing} linha(s) apontam para objeto que nao esta no bucket`,
        )
      }
    }
  }

  // 4d. o status operacional das tarefas (modulo 11, fatia 3) ----------------
  //
  // As 13 tags sao o menor lote desta importacao e o mais facil de sumir sem
  // ninguem notar: elas nao mudam contagem de linha nenhuma (a tarefa entra com
  // ou sem tag), entao as conferencias 1, 2 e 4b passariam com nota cheia se a
  // coluna inteira chegasse vazia. Aqui a conferencia e do CONTEUDO: o esperado
  // e recalculado do CSV pelo de/para, e comparado tag a tag com o que o banco
  // devolve.
  log('\n4d. status operacional das tarefas (fatia 3)')
  {
    const check = (ok, label, detail) => {
      log(`   ${ok ? 'ok  ' : 'FALHA'} ${label}`)
      if (!ok) problems.push(detail)
    }

    // O esperado sai do CSV, e nao do que o passo 17 achou que escreveu: uma
    // conferencia que releia a propria variavel do passo so confirmaria que o
    // script concorda consigo mesmo.
    const expected = new Map()
    const byTag = new Map()
    let unmapped = 0
    for (const r of csv.Task) {
      const raw = txt(r.tag_operacional)
      if (raw === null) continue
      const mapped = ENUMS.operational_tag[raw]
      // Valor fora do de/para: o passo 17 ja derrubou a tarefa para pendencias.
      // Contado aqui para que ele apareca como numero e nao como ausencia.
      if (mapped === undefined) { unmapped += 1; continue }
      expected.set(r.id, mapped)
      byTag.set(mapped, (byTag.get(mapped) ?? 0) + 1)
    }
    check(
      unmapped === 0,
      `${expected.size} tags no CSV, todas no de/para de docs/ENUM-MAP.md`,
      `tasks.operational_tag: ${unmapped} linha(s) do CSV com tag fora do de/para`,
    )

    // Todas as tarefas IMPORTADAS, com tag ou sem: uma tag que sumiu so aparece
    // se a tarefa dela for lida junto. Ler so as tagueadas mostraria a ausencia
    // como ausencia, que e o defeito que esta conferencia existe para pegar.
    const { rows: imported, error } = await selectAll('tasks', 'legacy_id, operational_tag', (q) =>
      q.eq('tenant_id', tenantId).not('legacy_id', 'is', null))
    if (error) {
      problems.push(`tasks: nao consegui reler operational_tag (${error.message})`)
    } else {
      const rows = imported.filter((r) => r.operational_tag !== null)
      /*
        A CONFERENCIA E SOBRE AS TAGS DO CSV, e nao sobre "toda tarefa com tag".

        Pela MESMA razao das conferencias 2, 4 e 4b: o escritorio usa o sistema,
        e marcar uma tarefa como Em Revisao pela tela e o gesto que a fatia 3
        existe para permitir — inclusive numa tarefa IMPORTADA, que continua com
        legacy_id depois de marcada. Exigir "13 no banco" derrubaria o script
        para sempre a partir da primeira tag marcada a mao, acusando um problema
        que nao existe e escondendo os que existirem.

        O que a importacao controla, e portanto o que e exigido aqui, e o
        caminho de ida: toda tag que o CSV declara esta no banco, na tarefa
        certa, com o valor certo. Tag a mais e uso normal e sai como INFO.
      */
      const inDb = new Map(imported.map((r) => [r.legacy_id, r.operational_tag]))
      let missing = 0
      let wrong = 0
      let pendedTask = 0
      const observed = new Map()
      for (const [legacyId, tag] of expected) {
        // A tarefa inteira ficou de fora (recusada por outro motivo, e explicada
        // no relatorio de pendencias). Nao e tag perdida: e linha que nao entrou,
        // e a conferencia 1 ja cobra essa.
        if (!inDb.has(legacyId)) { pendedTask += 1; continue }
        if (inDb.get(legacyId) === null) { missing += 1; continue }
        if (inDb.get(legacyId) !== tag) { wrong += 1; continue }
        observed.set(tag, (observed.get(tag) ?? 0) + 1)
      }
      const arrived = expected.size - missing - wrong - pendedTask
      check(
        missing === 0 && wrong === 0,
        `${arrived} das ${expected.size} tags do CSV no banco, na tarefa e no valor certos` +
          (pendedTask > 0 ? `  (${pendedTask} em tarefa recusada, ver pendencias)` : ''),
        `tasks.operational_tag: ${missing} tag(s) do CSV ausente(s) em tarefa importada e ${wrong} com valor diferente`,
      )
      for (const [tag, n] of [...byTag.entries()].sort()) {
        const expectedNow = [...expected.entries()].filter(([id, v]) => v === tag && inDb.has(id)).length
        check(
          observed.get(tag) === expectedNow,
          `${String(observed.get(tag) ?? 0).padStart(3)}  ${tag}   (CSV: ${n})`,
          `tasks.operational_tag: ${tag} tem ${observed.get(tag) ?? 0} das ${expectedNow} esperadas no banco`,
        )
      }
      // Tag que o CSV nao declara: tarefa importada marcada pela tela depois.
      // Sai como numero para nao virar buraco calado, mas nao derruba nada — e
      // e justamente o caso que a omissao da coluna no payload protege.
      log(`   info ${rows.length - arrived} tarefa(s) importada(s) com tag que o CSV nao declara (marcadas pela tela)`)
    }

    // Nenhuma tarefa deste export pode estar tagueada em outro escritorio. A
    // conferencia 3 ja varre legacy_id fora do tenant; esta pergunta a mesma
    // coisa do lado da coluna nova, que e a que acabou de nascer.
    const { rows: elsewhere, error: elsewhereError } = await selectAll('tasks', 'legacy_id', (q) =>
      q.neq('tenant_id', tenantId).not('operational_tag', 'is', null))
    if (elsewhereError) {
      problems.push(`tasks: nao consegui varrer operational_tag de outros escritorios (${elsewhereError.message})`)
    } else {
      const intruders = elsewhere.filter((r) => expected.has(r.legacy_id)).length
      check(
        intruders === 0,
        `nenhuma tarefa tagueada do export em outro escritorio (${elsewhere.length} tarefa(s) com tag em outros tenants)`,
        `tasks.operational_tag: ${intruders} tarefa(s) do export tagueadas fora do escritorio real`,
      )
    }
  }

  // 5. contas de acesso ------------------------------------------------------
  if (!SKIP_ACCOUNTS) {
    const { count: linked, error } = await db
      .from('collaborators')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('user_id', 'is', null)
    if (error) problems.push(`nao consegui contar vinculos de login: ${error.message}`)
    else log(`\n5. logins: ${linked} de ${stat('collaborators').written} colaboradores com user_id`)
    if (credentials.length > 0 && linked === 0) problems.push('nenhum colaborador ficou com user_id')
  }

  if (problems.length > 0) {
    abort(`conferencia falhou:\n    ${problems.join('\n    ')}`)
  }
  log('\n   Conferencia passou.')
}

// ---------------------------------------------------------------------------
// Resumo final no terminal (so contagem — nada que identifique alguem)
// ---------------------------------------------------------------------------

function summary() {
  log('\n' + '='.repeat(78))
  log('RESUMO DE PENDENCIAS POR MOTIVO')
  log('='.repeat(78))
  const byReason = new Map()
  for (const p of pendencies) {
    const key = `${p.entity} :: ${p.reason.split(' | ')[0].replace(/\b[0-9a-f]{24}\b/g, '<id>').replace(/"[^"]*"/g, '"<valor>"')}`
    byReason.set(key, (byReason.get(key) ?? 0) + 1)
  }
  for (const [key, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(n).padStart(5)}  ${key}`)
  }
  log(`\n  TOTAL: ${pendencies.length} linhas recusadas`)

  log('\n' + '='.repeat(78))
  log('RESUMO DE AJUSTES POR TIPO (a linha ENTROU)')
  log('='.repeat(78))
  const byWhat = new Map()
  for (const a of adjustments) {
    const key = `${a.entity} :: ${a.what.split(':')[0].replace(/\b[0-9a-f]{24}\b/g, '<id>')}`
    byWhat.set(key, (byWhat.get(key) ?? 0) + 1)
  }
  for (const [key, n] of [...byWhat.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(n).padStart(5)}  ${key}`)
  }
  log(`\n  TOTAL: ${adjustments.length} ajustes`)
  log('  Detalhe linha a linha em scripts/import-pendencias.local (nao versionado).')
  log('')
}

main().catch((error) => {
  if (!String(error?.message ?? '').startsWith('abort:')) console.error(error)
  process.exit(1)
})
