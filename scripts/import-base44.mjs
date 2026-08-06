#!/usr/bin/env node
// Importacao do dado REAL do base44 para o escritorio Fernando Costa.
//
// O QUE ESTE SCRIPT FAZ
//   Le os 17 CSV de db/ (dado real de cliente: CPF/CNPJ, endereco, telefone,
//   valor de contrato, coordenada de residencia), cria o tenant do escritorio
//   real e grava as 30 tabelas na ordem de docs/IMPORT-PLAN.md, secao 5.
//   Depois cria as contas de login do time e confere o que gravou.
//
//   node scripts/import-base44.mjs            grava
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
// AS DUAS REGRAS QUE GOVERNAM O QUE ENTRA
//   1. Linha orfa nao e descartada em silencio nem apontada para nulo. Se um
//      ponteiro aponta para um legacy_id que nao existe no export, ou para uma
//      linha que a propria importacao recusou, a linha inteira vai para o
//      relatorio de pendencias com o motivo.
//   2. Valor de lista fora do de/para de docs/ENUM-MAP.md nunca vira `other`
//      calado. Vai para pendencias tambem.
//
//   O efeito das duas juntas e que uma linha ou entra inteira ou nao entra, e
//   por isso vale a conferencia final "importadas + pendencias = total do CSV".
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
// O QUE NAO E IMPORTADO, DE PROPOSITO
//   - ProjectTimelineEntry (36 linhas): entidade sem destino. Nao aparece em
//     nenhum arquivo de projeto-original/. Nao se inventa tabela para ela.
//   - Task.tag_operacional (13 linhas): campo que existe no dado e em lugar
//     nenhum mais. Nosso schema nao tem coluna.
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

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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
//   criacao e vinculada ao colaborador por legacy_id (etapa 31), e o
//   auto-cadastro por dominio simplesmente nao e usado por este escritorio.
const REGISTER_EMAIL_DOMAINS = false

// Campos que existem no CSV e que o script ignora de proposito. Nao e lista de
// documentacao: e o que o codigo consulta para dizer, no fim, quanto dado ficou
// para tras por decisao e nao por defeito.
const IGNORED_ON_PURPOSE = [
  ['Collaborator.senha_temporaria', 'senha em texto puro — fora de escopo (docs/ARCHITECTURE.md)'],
  ['Collaborator.user_auth_email', '100% vazio no export'],
  ['Task.tag_operacional', 'campo sem coluna no nosso schema'],
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
  ['ProjectTimelineEntry (entidade inteira, 36 linhas)', 'sem destino em nenhuma tabela'],
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
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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

const FILES = {
  Collaborator: 'Collaborator_export.csv',
  PermissoesUsuario: 'PermissoesUsuario_export.csv',
  SolicitacaoAcesso: 'SolicitacaoAcesso_export.csv',
  Client: 'Client_export.csv',
  Negociacao: 'Negociacao_export.csv',
  ClientIntake: 'ClientIntake_export.csv',
  Contract: 'Contract_export.csv',
  Project: 'Project_export (1).csv',
  Task: 'Task_export.csv',
  Atividade: 'Atividade_export.csv',
  FinancialCategory: 'FinancialCategory_export.csv',
  AccountReceivable: 'AccountReceivable_export.csv',
  AccountPayable: 'AccountPayable_export.csv',
  Fornecedor: 'Fornecedor_export.csv',
  ChecklistOrcamento: 'ChecklistOrcamento_export.csv',
  PropriedadeMapa: 'PropriedadeMapa_export.csv',
  ProjectTimelineEntry: 'ProjectTimelineEntry_export.csv',
}

const csv = {}
for (const [entity, file] of Object.entries(FILES)) {
  const path = join(CSV_DIR, file)
  if (!existsSync(path)) {
    console.error(`FALTA: ${path}`)
    process.exit(1)
  }
  csv[entity] = parseCsv(readFileSync(path, 'utf8'))
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
  lead_source: { Instagram: 'instagram', 'Indicação': 'referral', Site: 'website', Outros: 'other' },
  client_type: { 'Pessoa Física': 'individual', 'Pessoa Jurídica': 'company' },
  service_type: {
    Arquitetura: 'architecture', Interiores: 'interiors', Estrutura: 'structural',
    'Hidrosanitário': 'plumbing', 'Elétrico': 'electrical', Consultoria: 'consulting',
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
  },
  geocode_status: { PENDING: 'pending', OK: 'ok', FAILED: 'failed', '': 'pending' },
  priority_level: { Baixa: 'low', 'Média': 'medium', Alta: 'high', Urgente: 'urgent' },
  work_status: {
    'Não iniciado': 'not_started', 'Não iniciada': 'not_started',
    'Em andamento': 'in_progress', 'Concluída': 'completed',
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

  require(condition, reason) {
    if (!condition) this.reasons.push(reason)
    return condition
  }

  get failed() {
    return this.reasons.length > 0
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
  for (const [entity, file] of Object.entries(FILES)) {
    log(`  ${entity.padEnd(22)} ${String(csv[entity].length).padStart(5)} linhas  (${file})`)
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
    log('  para este escritorio. O acesso e por conta criada no passo 31.')
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
    if (g.failed) { g.reject(); continue }

    const row = {
      tenant_id: T(),
      legacy_id: r.id,
      // user_id fica nulo aqui: o vinculo com o login e feito no passo 31,
      // depois que a conta de Auth existe. senha_temporaria e user_auth_email
      // do CSV sao ignorados de proposito (ver IGNORED_ON_PURPOSE).
      user_id: null,
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
    // colaborador e nao tem ligacao declarada. O check do banco permitiria
    // decided_by nulo aqui (a proibicao e so para pedido pendente), mas
    // nulificar em silencio e exatamente o que a regra do projeto proibe.
    const decidedBy = g.fk(ix.collaborator, r.aprovado_por_id, 'colaborador', 'aprovado_por_id')
    g.require(EMAIL_RE.test(r.email.trim()), `email "${r.email.trim()}" fora do formato aceito`)
    g.require(txt(r.nome) !== null, 'nome vazio (NOT NULL)')
    if (g.failed) { g.reject(); continue }

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
    // A unique (tenant_id, tax_id_digits) e a unique (tenant_id, client_key)
    // derrubam 3 linhas: sao 3 clientes cadastrados duas vezes (mesmo CPF,
    // mesmo e-mail e mesmo nome). Qual das duas linhas o escritorio quer
    // manter e decisao dele; o que o script faz e o minimo mecanico e
    // reversivel: entra a MAIS ANTIGA, a outra vai para pendencias para que a
    // fusao seja feita a mao.
    const digits = (s) => (s ?? '').replace(/[^0-9]/g, '')
    const byDoc = new Map()
    for (const r of csv.Client) {
      const d = digits(r.cpf_cnpj)
      if (!d) continue
      if (!byDoc.has(d)) byDoc.set(d, [])
      byDoc.get(d).push(r)
    }
    const duplicates = new Map() // id -> id da linha que ficou
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
      g.require(txt(r.current_city) !== null, 'address_city vazio (NOT NULL + check nao-vazio)')
      g.require(txt(r.current_state) !== null, 'address_state vazio (NOT NULL + check nao-vazio)')
      if (txt(r.email) !== null) {
        g.require(EMAIL_RE.test(r.email.trim()), `email "${r.email.trim()}" fora do formato aceito`)
      }
      if (duplicates.has(r.id)) {
        g.reasons.push(
          `CPF/CNPJ duplicado: a linha ${duplicates.get(r.id)} (mais antiga) entrou; ` +
            'esta precisa de decisao de fusao ou descarte',
        )
      }
      if (g.failed) { g.reject(); continue }

      const row = {
        tenant_id: T(),
        legacy_id: r.id,
        name: r.name.trim(),
        phone: r.phone.trim(),
        email: txt(r.email),
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
        address_city: r.current_city.trim(),
        address_state: r.current_state.trim(),
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
    const clientId = g.fk(ix.client, r.cliente_id, 'cliente', 'cliente_id')
    const ownerId = g.fk(ix.collaborator, r.responsavel_comercial_id, 'colaborador', 'responsavel_comercial_id')
    // contrato_vinculado_id e o lado oposto de contracts.negotiation_id. Um
    // ponteiro quebrado aqui nao pode virar nulo em silencio: vai para
    // pendencias como qualquer outro orfao.
    const contractLink = link(ix.contract, r.contrato_vinculado_id, 'contrato')
    if (!contractLink.ok && contractLink.reason.startsWith('orfao')) {
      g.reasons.push(`contrato_vinculado_id: ${contractLink.reason}`)
    }
    g.require(txt(r.responsavel_comercial_id) !== null, 'responsavel_comercial_id vazio (commercial_owner_id e NOT NULL)')
    g.require(txt(r.nome_negociacao) !== null, 'name vazio (NOT NULL)')
    // funnel_entry_date e NOT NULL. O default do banco e CURRENT_DATE, mas
    // gravar a data de hoje como "entrada no funil" de uma negociacao real e
    // inventar data. A linha vai para pendencias.
    g.require(date(r.data_entrada_funil) !== null, 'data_entrada_funil vazia (funnel_entry_date e NOT NULL)')
    const closedAt = date(r.data_fechamento)
    if (closedAt !== null) {
      g.require(status === 'won' || status === 'lost', 'data_fechamento com status que nao e Ganha/Perdida')
    }
    if (txt(r.motivo_perda) !== null || txt(r.observacoes_perda) !== null) {
      g.require(status === 'lost', 'motivo/observacao de perda com status que nao e Perdida')
    }
    if (g.failed) { g.reject(); continue }

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
        const value = ENUMS.service_type[s]
        if (!value) {
          pend('negotiation_services', r.id, `tipo_servico: valor "${s}" nao esta em docs/ENUM-MAP.md`, r.nome_negociacao)
          continue
        }
        if (seen.has(value)) {
          pend('negotiation_services', r.id, `tipo_servico repetido na mesma negociacao: "${s}"`, r.nome_negociacao)
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

      const plan = [int(r.quantidade_parcelas), date(r.data_primeiro_vencimento), frequency]
      const planFilled = plan.filter((v) => v !== null && v !== undefined).length
      g.require(
        planFilled === 0 || planFilled === 3,
        `plano de parcelamento incompleto: ${planFilled} de 3 campos (o check e all-or-none)`,
      )
      if (bool(r.installments_generated) === true) {
        g.require(plan[0] !== null, 'installments_generated=true sem plano de parcelamento')
      }
      for (const [src, dst] of phaseDays) {
        const v = int(r[src])
        if (v !== null) g.require(v > 0, `${dst}: prazo ${v} (o check exige > 0; vazio e o jeito de dizer "nao se aplica")`)
      }
      if (date(r.start_date) && date(r.signature_date)) {
        g.require(date(r.start_date) >= date(r.signature_date), 'start_date anterior a signature_date')
      }
      if (g.failed) { g.reject(); continue }

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
        installments_generated: bool(r.installments_generated) ?? false,
        layout_study_days: int(r.prazo_estudo_layout),
        renderings_days: int(r.prazo_perspectivas),
        legal_permit_days: int(r.prazo_projeto_legal),
        construction_docs_days: int(r.prazo_projeto_executivo),
        engineering_docs_days: int(r.prazo_projetos_complementares),
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
  for (const r of csv.ClientIntake) {
    const g = new RowGuard('client_intakes', r.id, r.nome || r.cliente_crm_name)
    // A nossa coluna `token` e uuid e e a CREDENCIAL de um formulario publico.
    // O base44 usa "<timestamp>-<sufixo>": 42 de 42 nao sao uuid. Gerar um uuid
    // novo criaria uma credencial que nunca existiu — inventar credencial e
    // pior do que perder o link. E o que se perde e proximo de zero: os 42 sao
    // links criados, nunca abertos e ja expirados, com as 25 colunas de
    // formulario 100% vazias.
    g.reasons.push('token do base44 nao e uuid e a coluna token e uuid (gerar um novo seria inventar credencial de acesso publico)')
    g.fk(ix.client, r.cliente_crm_id, 'cliente', 'cliente_crm_id')
    g.fk(ix.negotiation, r.negociacao_id, 'negociacao', 'negociacao_id')
    g.reject()
  }
  log(`  0 de ${csv.ClientIntake.length}  (todos para pendencias — ver o motivo no relatorio)`)

  // -------------------------------------------------------------------------
  // Passo 13 — projects
  // -------------------------------------------------------------------------
  step(13, 'projects  <- Project')
  stat('projects').source = csv.Project.length
  for (const r of csv.Project) {
    const g = new RowGuard('projects', r.id, r.name)
    // project_type e NOT NULL e 18 linhas trazem a LISTA DE SERVICOS da
    // negociacao ("Arquitetura, Estrutura, Hidrosanitario, Eletrico"), nao um
    // tipo de contrato. Nao ha traducao possivel sem adivinhar.
    const projectType = g.enum('contract_type', r.project_type, 'project_type')
    const status = g.enum('project_status', r.status, 'status')
    const phase = g.enum('project_phase', r.fase_projeto_atual, 'fase_projeto_atual')
    const geocode = g.enum('geocode_status', r.obra_geocode_status, 'obra_geocode_status')
    const clientId = g.fk(ix.client, r.client_id, 'cliente', 'client_id')
    const contractId = g.fk(ix.contract, r.contract_id, 'contrato', 'contract_id')
    const operational = g.fk(ix.collaborator, r.responsible_id, 'colaborador', 'responsible_id')
    const commercial = g.fk(ix.collaborator, r.commercial_responsible_id, 'colaborador', 'commercial_responsible_id')
    const pinBy = g.fk(ix.collaborator, r.obra_pin_updated_by, 'colaborador', 'obra_pin_updated_by')
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
    if (g.failed) { g.reject(); continue }

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
  for (const r of csv.Task) {
    const g = new RowGuard('tasks', r.id, r.title)
    // 36 linhas trazem fase que o base44 nunca declarou ("Estudo preliminar",
    // "Em Obra", "Anteprojeto", "Executivo"). Nenhuma vira fase existente por
    // deducao: "Executivo" PARECE "Projeto Executivo", e parecer nao basta.
    const phase = g.enum('project_phase', r.phase, 'phase')
    const status = g.enum('work_status', r.status, 'status')
    const priority = g.enum('priority_level', r.priority, 'priority')
    const taskType = g.enum('task_type', r.task_type, 'task_type')
    const projectId = g.fk(ix.project, r.project_id, 'projeto', 'project_id')
    const responsibleId = g.fk(ix.collaborator, r.responsible_id, 'colaborador', 'responsible_id')
    g.require(txt(r.title) !== null, 'title vazio (NOT NULL)')
    if (phase !== null) {
      g.require(phase !== 'finished', 'phase = Finalizado (so existe em Project, barrado por check em tasks)')
      g.require(phase !== 'post_approval', 'phase = Pos-aprovacao (barrado por check em tasks)')
    }
    if (priority !== null) g.require(priority !== 'urgent', 'priority = Urgente (barrado por check em tasks)')
    const effectiveStatus = status ?? 'not_started'
    g.require(
      (effectiveStatus === 'completed') === (date(r.completion_date) !== null),
      'completion_date x status incoerentes (o check exige data se e so se estiver concluida)',
    )
    if (date(r.due_date) && date(r.start_date)) {
      g.require(date(r.due_date) >= date(r.start_date), 'due_date anterior a start_date')
    }
    if (g.failed) { g.reject(); continue }

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
      // tag_operacional NAO entra: campo que existe no dado e em lugar nenhum
      // mais (nem em Task.jsonc, nem em projeto-original/). Ver
      // IGNORED_ON_PURPOSE e docs/IMPORT-PLAN.md, secao 8.1.
      created_at: ts(r.created_date),
      updated_at: ts(r.updated_date),
    }
    const res = await insertOne('tasks', row, 'tenant_id,legacy_id')
    if (res.error) { pend('tasks', r.id, `erro do banco: ${res.error.message}`, r.title); continue }
    ix.task.byLegacy.set(r.id, res.id)
    stat('tasks').consumed += 1
    stat('tasks').written += 1
  }
  log(`  ${stat('tasks').written} de ${csv.Task.length}`)

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
    const collaboratorId = g.fk(ix.collaborator, r.colaborador_id, 'colaborador', 'colaborador_id')
    const coordinatorId = g.fk(ix.collaborator, r.coordenador_id, 'colaborador', 'coordenador_id')
    const startedBy = g.fk(ix.collaborator, r.iniciado_por, 'colaborador', 'iniciado_por')
    const completedBy = g.fk(ix.collaborator, r.concluido_por, 'colaborador', 'concluido_por')
    const deletedBy = g.fk(ix.collaborator, r.usuario_exclusao_id, 'colaborador', 'usuario_exclusao_id')
    const projectId = g.fk(ix.project, r.projeto_id, 'projeto', 'projeto_id')
    const clientId = g.fk(ix.client, r.cliente_id, 'cliente', 'cliente_id')
    g.require(txt(r.descricao) !== null, 'descricao vazia (NOT NULL)')
    g.require(txt(r.colaborador_id) !== null, 'colaborador_id vazio (NOT NULL)')
    g.require(date(r.prazo_inicio) !== null, 'prazo_inicio vazio (NOT NULL)')
    g.require(date(r.prazo_termino) !== null, 'prazo_termino vazio (NOT NULL)')
    if (date(r.prazo_inicio) && date(r.prazo_termino)) {
      g.require(date(r.prazo_termino) >= date(r.prazo_inicio), 'prazo_termino anterior a prazo_inicio')
    }
    const effectiveStatus = status ?? 'not_started'
    g.require(
      (effectiveStatus === 'completed') === (ts(r.data_conclusao_real) !== null),
      'data_conclusao_real x status incoerentes (o check exige data se e so se estiver concluida)',
    )
    if (ts(r.data_inicio_real) && ts(r.data_conclusao_real)) {
      g.require(ts(r.data_inicio_real) <= ts(r.data_conclusao_real), 'data_inicio_real posterior a data_conclusao_real')
    }
    g.require(
      (ts(r.data_exclusao) !== null) === (txt(r.usuario_exclusao_id) !== null),
      'exclusao logica sem o par completo (deleted_at e deleted_by andam juntos)',
    )
    if (g.failed) { g.reject(); continue }

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
    if (g.failed) { g.reject(); continue }
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
    const clientId = g.fk(ix.client, r.client_id, 'cliente', 'client_id')
    const contractId = g.fk(ix.contract, r.contract_id, 'contrato', 'contract_id')
    const projectId = g.fk(ix.project, r.project_id, 'projeto', 'project_id')
    g.require(txt(r.description) !== null, 'description vazia (NOT NULL)')
    g.require(date(r.due_date) !== null, 'due_date vazia (NOT NULL)')
    const value = num(r.value)
    g.require(value !== null && value > 0, `value = ${r.value} (o check exige > 0)`)
    const effectiveStatus = status ?? 'forecast'
    g.require(
      (effectiveStatus === 'paid') === (date(r.payment_date) !== null),
      'payment_date x status incoerentes (o check exige data se e so se estiver Pago)',
    )
    if (method !== null) g.require(method !== 'direct_debit', 'Debito automatico nao vale em recebivel (check de dominio)')

    // installment_number vem como TEXTO "n/total" no base44, e a nossa coluna e
    // um par de inteiros com check de "os dois ou nenhum".
    const raw = (r.installment_number ?? '').trim()
    let installmentNumber = null
    let installmentTotal = null
    if (raw !== '') {
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw)
      if (!m) {
        g.reasons.push(`installment_number "${raw}" fora do formato "n/total" (o par numero+total e obrigatorio)`)
      } else {
        installmentNumber = Number(m[1])
        installmentTotal = Number(m[2])
        g.require(installmentNumber >= 1 && installmentNumber <= installmentTotal, `parcela ${raw} fora da faixa`)
      }
    }
    if (g.failed) { g.reject(); continue }

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
      const projectId = g.fk(ix.project, r.project_id, 'projeto', 'project_id')
      const parentId = g.fk(ix.payable, r.recurrence_parent_id, 'conta a pagar', 'recurrence_parent_id')
      g.require(txt(r.supplier) !== null, 'supplier vazio (supplier_name e NOT NULL)')
      g.require(txt(r.description) !== null, 'description vazia (NOT NULL)')
      g.require(txt(r.category) !== null, 'category vazia (NOT NULL)')
      g.require(date(r.due_date) !== null, 'due_date vazia (NOT NULL)')
      const value = num(r.value)
      g.require(value !== null && value > 0, `value = ${r.value} (o check exige > 0)`)
      const effectiveStatus = status ?? 'forecast'
      g.require(
        (effectiveStatus === 'paid') === (date(r.payment_date) !== null),
        'payment_date x status incoerentes (o check exige data se e so se estiver Pago)',
      )
      if (method !== null) g.require(method !== 'cash', 'Especie nao vale em conta a pagar (check de dominio)')

      const isRecurring = bool(r.is_recurring) ?? false
      if (isRecurring) {
        g.require(frequency !== null, 'is_recurring=true sem recurrence_frequency')
        g.require(date(r.recurrence_start_date) !== null, 'is_recurring=true sem recurrence_start_date')
      }
      if (parentId !== null) g.require(isRecurring === false, 'ocorrencia marcada como is_recurring=true')
      if (date(r.recurrence_end_date) && date(r.recurrence_start_date)) {
        g.require(
          date(r.recurrence_end_date) >= date(r.recurrence_start_date),
          'recurrence_end_date anterior a recurrence_start_date',
        )
      }

      // competence_month vem como TEXTO "MM/AAAA"; a coluna e `date` com check
      // de primeiro dia do mes.
      const rawCompetence = (r.competence_month ?? '').trim()
      let competence = null
      if (rawCompetence !== '') {
        const m = /^(\d{2})\/(\d{4})$/.exec(rawCompetence)
        if (!m) g.reasons.push(`competence_month "${rawCompetence}" fora do formato MM/AAAA`)
        else if (Number(m[1]) < 1 || Number(m[1]) > 12) g.reasons.push(`competence_month "${rawCompetence}" com mes invalido`)
        else competence = `${m[2]}-${m[1]}-01`
      }
      if (g.failed) { g.reject(); continue }

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
        recurrence_end_date: date(r.recurrence_end_date),
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
    const category = g.enum('supplier_category', r.tipologia, 'tipologia')
    const model = g.enum('partnership_model', r.modelo_parceria, 'modelo_parceria')
    const term = g.enum('commission_payment_term', r.prazo_pagamento_comissao, 'prazo_pagamento_comissao')
    const tier = g.enum('partnership_tier', r.nivel_parceria, 'nivel_parceria')
    const status = g.enum('supplier_status', r.status, 'status')
    g.require(txt(r.nome) !== null, 'nome vazio (NOT NULL)')
    g.require(txt(r.tipologia) !== null, 'tipologia vazia (category e NOT NULL)')
    g.require(txt(r.contato_whatsapp) !== null, 'contato_whatsapp vazio (NOT NULL)')
    if (category !== null) {
      g.require(
        !['facade_cladding', 'pool_cladding', 'waterproofing', 'drywall_plaster'].includes(category),
        `tipologia "${r.tipologia}" so vale em item de orcamento (suppliers_category_domain_check)`,
      )
    }
    if (txt(r.contato_email) !== null) {
      g.require(EMAIL_RE.test(r.contato_email.trim()), `contato_email "${r.contato_email.trim()}" fora do formato aceito`)
    }
    if (g.failed) { g.reject(); continue }

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
    if (g.failed) { g.reject(); continue }

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
    if (g.failed) { g.reject(); continue }

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
    // cotacoes em 15 itens.
    const rows = []
    for (const it of budgetItemsSource) {
      const quotes = Array.isArray(it.fornecedores_cotados) ? it.fornecedores_cotados : []
      stat('budget_item_quotes').source += quotes.length
      const legacy = String(it.item_id ?? '').trim()
      const itemId = ix.budgetItem.byLegacy.get(legacy)
      const seen = new Set()
      for (const q of quotes) {
        const label = `${it.nome_item} / ${q?.fornecedor_nome ?? ''}`
        if (!itemId) { pend('budget_item_quotes', legacy, `cascata: item de orcamento ${legacy} nao foi importado`, label); continue }
        const supplier = link(ix.supplier, q?.fornecedor_id, 'fornecedor')
        if (!supplier.ok) { pend('budget_item_quotes', legacy, `fornecedor_id: ${supplier.reason}`, label); continue }
        if (!supplier.id) { pend('budget_item_quotes', legacy, 'fornecedor_id vazio (NOT NULL)', label); continue }
        if (seen.has(supplier.id)) {
          // unique (item_id, supplier_id): o mesmo fornecedor cotado duas vezes
          // no mesmo item, com valores diferentes. Qual das duas vale e decisao
          // do escritorio.
          pend('budget_item_quotes', legacy, 'fornecedor cotado mais de uma vez no mesmo item (unique item_id,supplier_id)', label)
          continue
        }
        seen.add(supplier.id)
        rows.push({
          tenant_id: T(),
          item_id: itemId,
          supplier_id: supplier.id,
          value: num(q?.valor),
          notes: txt(q?.observacao),
          quote_file_path: null,
          quote_file_name: null,
        })
        stat('budget_item_quotes').consumed += 1
      }
    }
    const res = await insertBatch('budget_item_quotes', rows, 'item_id,supplier_id')
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
    const projectId = g.fk(ix.project, r.project_id, 'projeto', 'project_id')
    const clientId = g.fk(ix.client, r.client_id, 'cliente', 'client_id')
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
    if (g.failed) { g.reject(); continue }

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
  // Passo 31 — contas de acesso
  // -------------------------------------------------------------------------
  const credentials = []
  step(31, 'contas de acesso (auth.users + tenant_users + collaborators.user_id)')
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
    'map_property_purposes',
  ]
  for (const table of TABLES) {
    const { count, error } = await db
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    if (error) { problems.push(`${table}: nao consegui contar (${error.message})`); continue }
    const expected = stat(table).written
    const ok = count === expected
    log(`   ${ok ? 'ok  ' : 'FALHA'} ${table.padEnd(28)} banco=${String(count).padStart(5)} esperado=${String(expected).padStart(5)}`)
    if (!ok) problems.push(`${table}: banco tem ${count}, esperado ${expected}`)
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
      'supplier_brands', 'budget_item_quotes', 'map_property_land_types', 'map_property_purposes'].includes(t))
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
  log('\n4. totais financeiros (soma do CSV das linhas importadas x soma no banco)')
  const money = [
    ['contracts', 'total_value', csv.Contract, 'total_value', 'Contract'],
    ['accounts_receivable', 'value', csv.AccountReceivable, 'value', 'AccountReceivable'],
    ['accounts_payable', 'value', csv.AccountPayable, 'value', 'AccountPayable'],
  ]
  for (const [table, column, sourceRows, sourceColumn, entity] of money) {
    const { rows, error } = await selectAll(table, `legacy_id, ${column}`, (q) => q.eq('tenant_id', tenantId))
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
    const fmt = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    log(`   ${ok ? 'ok  ' : 'FALHA'} ${table.padEnd(22)} banco=${fmt(observed).padStart(16)}  csv(importadas)=${fmt(expected).padStart(16)}`)
    log(`        ${entity}: ficou de fora ${fmt(pendedMoney)} em ${sourceRows.length - inDb.size} linha(s) pendente(s)`)
    if (!ok) problems.push(`${table}: soma do banco ${fmt(observed)} != soma do CSV ${fmt(expected)}`)
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
  log('  Detalhe linha a linha em scripts/import-pendencias.local (nao versionado).')
  log('')
}

main().catch((error) => {
  if (!String(error?.message ?? '').startsWith('abort:')) console.error(error)
  process.exit(1)
})
