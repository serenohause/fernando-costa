#!/usr/bin/env node
// Analise (somente leitura) do export do base44 em db/.
//
// NAO grava nada em banco nenhum. Le os CSV, confere contra docs/ENUM-MAP.md e
// contra o schema das migrations, e imprime o levantamento que sustenta
// docs/IMPORT-PLAN.md.
//
//   node scripts/analyze-import.mjs [pasta]   (padrao: db)
//
// A pasta db/ esta no .gitignore e tem dado real de cliente. Este script
// imprime CONTAGEM e valor de enum; nao imprime nome, CPF, telefone, endereco
// nem valor de contrato. Se um dia precisar de exemplo, anonimize antes de
// colar em qualquer lugar.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] ?? 'db';

// ---------------------------------------------------------------------------
// Parser de CSV. Escrito a mao de proposito: sem dependencia nova, e o export
// tem virgula, aspas e quebra de linha DENTRO do valor (endereco, observacao,
// e os campos que carregam JSON).
// ---------------------------------------------------------------------------

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? '') !== '')
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
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
};

const data = {};
for (const [entity, file] of Object.entries(FILES)) {
  const path = join(DIR, file);
  if (!existsSync(path)) {
    console.error(`FALTA: ${path}`);
    process.exit(1);
  }
  data[entity] = parseCsv(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------
// De/para de docs/ENUM-MAP.md. Chave = texto exato gravado no base44.
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
  client_intake_status: { Ativo: 'active', Expirado: 'expired', Enviado: 'submitted' },
  client_intake_validation_status: {
    CRIADO: 'created', OK: 'ok', EXPIRADO: 'expired', ENVIADO: 'already_submitted',
    EXPIRADO_NO_ENVIO: 'expired_on_submit',
  },
  // Compartilhado. As duas grafias (Contract e Project) na mesma tabela.
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
  // "Em atraso" nao vira valor: e forecast com vencimento passado (ENUM-MAP).
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
  // As duas grafias corrompidas do original entram pelo codepoint, nao pela
  // aparencia: "Negoциações" tem cirilico e "Aprova​ções" tem zero-width
  // space. Comparar de olho nao resolve.
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
};

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------

const out = [];
const push = (s = '') => out.push(s);
function h1(t) { push(); push('='.repeat(78)); push(t.toUpperCase()); push('='.repeat(78)); }
function h2(t) { push(); push(`--- ${t} ${'-'.repeat(Math.max(0, 73 - t.length))}`); }

const filled = (rows, col) => rows.filter((r) => (r[col] ?? '').trim() !== '').length;
const idsOf = (rows) => new Set(rows.map((r) => r.id));

function tally(rows, col) {
  const m = new Map();
  for (const r of rows) {
    const v = r[col] ?? '';
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function jsonOrNull(s) {
  const t = (s ?? '').trim();
  if (t === '') return null;
  try { return JSON.parse(t); } catch { return undefined; }
}

// Mostra o valor com codepoint quando ele tem caractere fora do latino comum,
// senao "Negoциações" e "Negociações" saem identicos no terminal.
function reveal(v) {
  const suspect = [...v].some((ch) => {
    const c = ch.codePointAt(0);
    return c > 0x24f && !(c >= 0x2010 && c <= 0x2019);
  });
  if (!suspect) return JSON.stringify(v);
  const cps = [...v].map((ch) => {
    const c = ch.codePointAt(0);
    return c > 0x7f ? `\\u${c.toString(16).padStart(4, '0')}` : ch;
  }).join('');
  return `${JSON.stringify(v)}  [${cps}]`;
}

const unmapped = [];
function checkEnum(entity, col, enumName, { rows = data[entity], multi = false } = {}) {
  const map = ENUMS[enumName];
  const counts = new Map();
  let empty = 0;
  for (const r of rows) {
    const raw = r[col] ?? '';
    let values;
    if (multi) {
      const parsed = jsonOrNull(raw);
      values = Array.isArray(parsed) ? parsed : [];
      if (values.length === 0) { empty += 1; continue; }
    } else {
      if (raw.trim() === '') { empty += 1; continue; }
      values = [raw];
    }
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const bad = [];
  const ok = [];
  for (const [v, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    (Object.prototype.hasOwnProperty.call(map, v) ? ok : bad).push([v, n]);
  }
  push(`${entity}.${col}  ->  ${enumName}`);
  push(`  vazio: ${empty}`);
  for (const [v, n] of ok) push(`  ok        ${String(n).padStart(4)}  ${reveal(v)} -> ${map[v]}`);
  for (const [v, n] of bad) {
    push(`  NAO MAPEADO ${String(n).padStart(3)}  ${reveal(v)}`);
    unmapped.push({ entity, col, enumName, value: v, rows: n });
  }
  push();
}

const orphans = [];
function checkFk(entity, col, targetEntity, { rows = data[entity], targetIds = idsOf(data[targetEntity]) } = {}) {
  const missing = new Map();
  let empty = 0;
  let ok = 0;
  for (const r of rows) {
    const v = (r[col] ?? '').trim();
    if (v === '') { empty += 1; continue; }
    if (targetIds.has(v)) ok += 1;
    else missing.set(v, (missing.get(v) ?? 0) + 1);
  }
  const missingRows = [...missing.values()].reduce((a, b) => a + b, 0);
  push(
    `${(entity + '.' + col).padEnd(44)} -> ${targetEntity.padEnd(22)} ` +
    `vazio=${String(empty).padStart(4)} ok=${String(ok).padStart(4)} ` +
    `ORFAO=${String(missingRows).padStart(4)} (${missing.size} id distinto)`,
  );
  if (missingRows > 0) orphans.push({ entity, col, target: targetEntity, rows: missingRows, ids: missing.size });
}

function dupReport(label, rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!m.has(k)) m.set(k, 0);
    m.set(k, m.get(k) + 1);
  }
  const dups = [...m.entries()].filter(([, n]) => n > 1);
  const affected = dups.reduce((a, [, n]) => a + n, 0);
  push(`${label.padEnd(56)} chaves=${String(m.size).padStart(4)} duplicadas=${String(dups.length).padStart(3)} linhas afetadas=${String(affected).padStart(4)}`);
  return dups;
}

const digits = (s) => (s ?? '').replace(/[^0-9]/g, '');
const lower = (s) => (s ?? '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// 0. Inventario
// ---------------------------------------------------------------------------

h1('0. inventario');
for (const [entity, file] of Object.entries(FILES)) {
  const rows = data[entity];
  push(`${entity.padEnd(22)} ${String(rows.length).padStart(4)} linhas  ${Object.keys(rows[0] ?? {}).length} colunas  (${file})`);
}
push();
push('Colunas presentes em TODO export e sem destino no nosso schema:');
push('  is_sample, created_by, created_by_id  -> metadado do base44.');
push('  created_date/updated_date             -> viram created_at/updated_at.');
{
  const nonSample = Object.entries(FILES).map(([e]) => [e, data[e].filter((r) => r.is_sample === 'true').length]);
  const withSample = nonSample.filter(([, n]) => n > 0);
  push(`  linhas com is_sample=true: ${withSample.length === 0 ? 'nenhuma em nenhum arquivo' : JSON.stringify(withSample)}`);
}
{
  const creators = new Set();
  for (const e of Object.keys(FILES)) for (const r of data[e]) if (r.created_by) creators.add(r.created_by);
  const collabEmails = new Set(data.Collaborator.map((r) => lower(r.email)));
  const notCollab = [...creators].filter((c) => !collabEmails.has(lower(c)));
  push(`  created_by distintos em todos os arquivos: ${creators.size}; que NAO sao e-mail de Collaborator: ${notCollab.length}`);
}

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------

h1('1. enums — valor que chega do base44 vs docs/ENUM-MAP.md');

h2('Fundacao');
checkEnum('Collaborator', 'role', 'collaborator_role');
checkEnum('Collaborator', 'area', 'collaborator_area');
checkEnum('Collaborator', 'status', 'collaborator_status');
checkEnum('SolicitacaoAcesso', 'status', 'access_request_status');
checkEnum('PermissoesUsuario', 'menu', 'menu_key');

h2('CRM');
checkEnum('Client', 'client_type', 'client_type');
checkEnum('Client', 'lead_source', 'lead_source');

h2('Pipeline');
checkEnum('Negociacao', 'status_negociacao', 'negotiation_status');
checkEnum('Negociacao', 'etapa_funil', 'funnel_stage');
checkEnum('Negociacao', 'origem', 'lead_origin');
checkEnum('Negociacao', 'motivo_perda', 'loss_reason');
checkEnum('Negociacao', 'tipo_servico', 'service_type', { multi: true });
checkEnum('ClientIntake', 'status', 'client_intake_status');
checkEnum('ClientIntake', 'ultimo_status_validacao', 'client_intake_validation_status');
checkEnum('ClientIntake', 'tipo_cliente', 'client_type');

h2('Contratos');
checkEnum('Contract', 'contract_type', 'contract_type');
checkEnum('Contract', 'billing_type', 'billing_type');
checkEnum('Contract', 'status', 'contract_status');
checkEnum('Contract', 'periodicidade_parcelas', 'installment_frequency');
checkEnum('Contract', 'origem_lead', 'lead_origin');

h2('Projetos e tarefas');
checkEnum('Project', 'project_type', 'contract_type');
checkEnum('Project', 'status', 'project_status');
checkEnum('Project', 'fase_projeto_atual', 'project_phase');
checkEnum('Project', 'obra_geocode_status', 'geocode_status');
checkEnum('Task', 'phase', 'project_phase');
checkEnum('Task', 'status', 'work_status');
checkEnum('Task', 'priority', 'priority_level');
checkEnum('Task', 'task_type', 'task_type');

h2('Atividades');
checkEnum('Atividade', 'status', 'work_status');
checkEnum('Atividade', 'prioridade', 'priority_level');

h2('Financeiro');
checkEnum('FinancialCategory', 'type', 'financial_category_type');
checkEnum('FinancialCategory', 'cost_center', 'cost_center');
checkEnum('AccountReceivable', 'status', 'financial_status');
checkEnum('AccountReceivable', 'payment_method', 'payment_method');
checkEnum('AccountPayable', 'status', 'financial_status');
checkEnum('AccountPayable', 'payment_method', 'payment_method');
checkEnum('AccountPayable', 'category', 'expense_category');
checkEnum('AccountPayable', 'recurrence_frequency', 'recurrence_frequency');
checkEnum('AccountPayable', 'recurrence_status', 'recurrence_status');

h2('Fornecedores');
checkEnum('Fornecedor', 'tipologia', 'supplier_category');
checkEnum('Fornecedor', 'modelo_parceria', 'partnership_model');
checkEnum('Fornecedor', 'prazo_pagamento_comissao', 'commission_payment_term');
checkEnum('Fornecedor', 'nivel_parceria', 'partnership_tier');
checkEnum('Fornecedor', 'status', 'supplier_status');

h2('Orcamento (inclusive dentro do JSON de ChecklistOrcamento.itens)');
checkEnum('ChecklistOrcamento', 'status_geral', 'budget_checklist_status');
checkEnum('ChecklistOrcamento', 'fase_projeto', 'project_phase');
{
  const items = [];
  let broken = 0;
  for (const r of data.ChecklistOrcamento) {
    const parsed = jsonOrNull(r.itens);
    if (parsed === undefined) { broken += 1; continue; }
    if (Array.isArray(parsed)) for (const it of parsed) items.push({ ...it, __checklist: r.id });
  }
  push(`ChecklistOrcamento.itens: ${items.length} itens em ${data.ChecklistOrcamento.length} checklists (JSON ilegivel: ${broken})`);
  push(`  chaves distintas nos itens: ${JSON.stringify([...new Set(items.flatMap((i) => Object.keys(i)))].filter((k) => k !== '__checklist').sort())}`);
  push();
  checkEnum('ChecklistOrcamento.itens[]', 'status_item', 'budget_item_status', { rows: items });
  checkEnum('ChecklistOrcamento.itens[]', 'categoria', 'supplier_category', { rows: items });
  checkEnum('ChecklistOrcamento.itens[]', 'prioridade', 'priority_level', { rows: items });
  const supplierIds = idsOf(data.Fornecedor);
  checkFk('ChecklistOrcamento.itens[]', 'fornecedor_escolhido_id', 'Fornecedor', { rows: items, targetIds: supplierIds });
  const withQuotes = items.filter((i) => Array.isArray(i.cotacoes) && i.cotacoes.length > 0);
  push(`  itens com cotacoes: ${withQuotes.length}; cotacoes no total: ${withQuotes.reduce((a, i) => a + i.cotacoes.length, 0)}`);
  const withFiles = items.filter((i) => i.arquivo_orcamento_url || i.arquivos_aprovacao?.length);
  push(`  itens com arquivo (URL do base44, NAO portavel para o bucket privado): ${withFiles.length}`);
  push(`  itens que sao os 4 valores so-de-orcamento: ${items.filter((i) => ['Revestimento de Fachada', 'Revestimento de Piscina', 'Impermeabilização', 'Gesso e Drywall'].includes(i.categoria)).length}`);
  push();
}

h2('Mapa');
checkEnum('PropriedadeMapa', 'status_visual', 'map_visual_status');

h2('Resumo dos valores NAO mapeados');
if (unmapped.length === 0) push('  nenhum');
for (const u of unmapped) {
  push(`  ${u.entity}.${u.col} (${u.enumName}): ${reveal(u.value)} -> ${u.rows} linha(s)`);
}
push(`  TOTAL de linhas que caem no relatorio de pendencias por enum: ${unmapped.reduce((a, u) => a + u.rows, 0)}`);

// ---------------------------------------------------------------------------
// 2. Orfaos
// ---------------------------------------------------------------------------

h1('2. orfaos — legacy_id apontado que nao existe no export');

const collabIds = idsOf(data.Collaborator);
push('Nota: no base44, "colaborador" e "usuario da plataforma" sao ids DIFERENTES.');
push('Collaborator.id nao e o id que aparece em responsavel_*/created_by_id.');
push();

h2('Para Collaborator');
checkFk('Collaborator', 'coordenador_id', 'Collaborator');
checkFk('PermissoesUsuario', 'colaborador_id', 'Collaborator');
checkFk('SolicitacaoAcesso', 'aprovado_por_id', 'Collaborator');
checkFk('Negociacao', 'responsavel_comercial_id', 'Collaborator');
checkFk('Project', 'responsible_id', 'Collaborator');
checkFk('Project', 'commercial_responsible_id', 'Collaborator');
checkFk('Task', 'responsible_id', 'Collaborator');
checkFk('Atividade', 'colaborador_id', 'Collaborator');
checkFk('Atividade', 'coordenador_id', 'Collaborator');
checkFk('Atividade', 'iniciado_por', 'Collaborator');
checkFk('Atividade', 'concluido_por', 'Collaborator');
checkFk('Atividade', 'usuario_exclusao_id', 'Collaborator');
checkFk('ChecklistOrcamento', 'responsavel_orcamento_id', 'Collaborator');

h2('Para Client');
checkFk('Negociacao', 'cliente_id', 'Client');
checkFk('ClientIntake', 'cliente_crm_id', 'Client');
checkFk('Contract', 'client_id', 'Client');
checkFk('Project', 'client_id', 'Client');
checkFk('Atividade', 'cliente_id', 'Client');
checkFk('AccountReceivable', 'client_id', 'Client');
checkFk('ChecklistOrcamento', 'client_id', 'Client');
checkFk('PropriedadeMapa', 'client_id', 'Client');

h2('Para Negociacao / Contract / Project');
checkFk('ClientIntake', 'negociacao_id', 'Negociacao');
checkFk('Negociacao', 'contrato_vinculado_id', 'Contract');
checkFk('Negociacao', 'projeto_vinculado_id', 'Project');
checkFk('Contract', 'project_id', 'Project');
checkFk('Project', 'contract_id', 'Contract');
checkFk('Task', 'project_id', 'Project');
checkFk('Atividade', 'projeto_id', 'Project');
checkFk('AccountReceivable', 'contract_id', 'Contract');
checkFk('AccountReceivable', 'project_id', 'Project');
checkFk('AccountPayable', 'project_id', 'Project');
checkFk('AccountPayable', 'recurrence_parent_id', 'AccountPayable');
checkFk('ChecklistOrcamento', 'project_id', 'Project');
checkFk('PropriedadeMapa', 'project_id', 'Project');
checkFk('ProjectTimelineEntry', 'project_id', 'Project');

h2('Resumo de orfaos');
push(`  ${orphans.length} relacoes com orfao; ${orphans.reduce((a, o) => a + o.rows, 0)} linhas com pelo menos um ponteiro quebrado (contagem por relacao, nao por linha unica)`);

// ---------------------------------------------------------------------------
// 3. NOT NULL / campos obrigatorios do nosso schema
// ---------------------------------------------------------------------------

h1('3. campos NOT NULL do nosso schema que o CSV pode nao preencher');

function notNull(label, rows, predicate) {
  const bad = rows.filter(predicate).length;
  push(`${label.padEnd(66)} faltando em ${String(bad).padStart(4)} de ${rows.length}`);
  return bad;
}

h2('collaborators');
notNull('name', data.Collaborator, (r) => !r.name.trim());
notNull('role', data.Collaborator, (r) => !r.role.trim());
notNull('email', data.Collaborator, (r) => !r.email.trim());

h2('access_requests');
notNull('name (SolicitacaoAcesso.nome)', data.SolicitacaoAcesso, (r) => !r.nome.trim());
notNull('email', data.SolicitacaoAcesso, (r) => !r.email.trim());
notNull('requested_at (data_solicitacao)', data.SolicitacaoAcesso, (r) => !r.data_solicitacao.trim());

h2('clients');
notNull('name', data.Client, (r) => !r.name.trim());
notNull('phone            [NOT NULL + check nao-vazio]', data.Client, (r) => !r.phone.trim());
notNull('address_city     [NOT NULL + check nao-vazio]', data.Client, (r) => !r.current_city.trim());
notNull('address_state    [NOT NULL + check nao-vazio]', data.Client, (r) => !r.current_state.trim());
notNull('address_country  [NOT NULL, default Brasil]', data.Client, (r) => !r.country.trim());

h2('negotiations');
notNull('name (nome_negociacao)', data.Negociacao, (r) => !r.nome_negociacao.trim());
notNull('commercial_owner_id [NOT NULL]', data.Negociacao, (r) => !r.responsavel_comercial_id.trim());
notNull('funnel_entry_date [NOT NULL, default current_date]', data.Negociacao, (r) => !r.data_entrada_funil.trim());

h2('client_intakes');
notNull('client_id [NOT NULL]', data.ClientIntake, (r) => !r.cliente_crm_id.trim());
notNull('expires_at [NOT NULL]', data.ClientIntake, (r) => !r.expira_em.trim());

h2('contracts');
notNull('contract_number [NOT NULL]', data.Contract, (r) => !r.contract_number.trim());
notNull('contract_type [NOT NULL]', data.Contract, (r) => !r.contract_type.trim());
notNull('total_value [NOT NULL]', data.Contract, (r) => !r.total_value.trim());

h2('projects');
notNull('name [NOT NULL]', data.Project, (r) => !r.name.trim());
notNull('project_type [NOT NULL]', data.Project, (r) => !r.project_type.trim());

h2('tasks');
notNull('title [NOT NULL]', data.Task, (r) => !r.title.trim());

h2('activities');
notNull('description [NOT NULL]', data.Atividade, (r) => !r.descricao.trim());
notNull('collaborator_id [NOT NULL]', data.Atividade, (r) => !r.colaborador_id.trim());
notNull('start_date (prazo_inicio) [NOT NULL]', data.Atividade, (r) => !r.prazo_inicio.trim());
notNull('end_date (prazo_termino) [NOT NULL]', data.Atividade, (r) => !r.prazo_termino.trim());

h2('accounts_receivable / accounts_payable');
notNull('AR.description [NOT NULL]', data.AccountReceivable, (r) => !r.description.trim());
notNull('AR.value [NOT NULL + > 0]', data.AccountReceivable, (r) => !r.value.trim() || Number(r.value) <= 0);
notNull('AR.due_date [NOT NULL]', data.AccountReceivable, (r) => !r.due_date.trim());
notNull('AP.supplier_name [NOT NULL]', data.AccountPayable, (r) => !r.supplier.trim());
notNull('AP.description [NOT NULL]', data.AccountPayable, (r) => !r.description.trim());
notNull('AP.category [NOT NULL]', data.AccountPayable, (r) => !r.category.trim());
notNull('AP.value [NOT NULL + > 0]', data.AccountPayable, (r) => !r.value.trim() || Number(r.value) <= 0);
notNull('AP.due_date [NOT NULL]', data.AccountPayable, (r) => !r.due_date.trim());

h2('suppliers / budget');
notNull('suppliers.name [NOT NULL]', data.Fornecedor, (r) => !r.nome.trim());
notNull('suppliers.category (tipologia) [NOT NULL]', data.Fornecedor, (r) => !r.tipologia.trim());
notNull('suppliers.contact_whatsapp [NOT NULL]', data.Fornecedor, (r) => !r.contato_whatsapp.trim());
notNull('budget_checklists.client_id [NOT NULL]', data.ChecklistOrcamento, (r) => !r.client_id.trim());

h2('map_properties');
notNull('lat [NOT NULL]', data.PropriedadeMapa, (r) => !r.lat.trim());
notNull('lng [NOT NULL]', data.PropriedadeMapa, (r) => !r.lng.trim());

// ---------------------------------------------------------------------------
// 4. Duplicatas e conflitos de unicidade
// ---------------------------------------------------------------------------

h1('4. duplicatas — unicidade que o nosso schema tem e o base44 nao tinha');

h2('clients: unique (tenant_id, tax_id_digits) e unique (tenant_id, client_key)');
const dupTax = dupReport('CPF/CNPJ normalizado (tax_id_digits)', data.Client, (r) => digits(r.cpf_cnpj));
const dupKey = dupReport('client_key (doc: > email:)', data.Client, (r) => {
  const d = digits(r.cpf_cnpj);
  if (d) return `doc:${d}`;
  const e = lower(r.email);
  return e ? `email:${e}` : '';
});
dupReport('e-mail normalizado (sem unique no schema, mas dedup usa)', data.Client, (r) => lower(r.email));
dupReport('nome exato (sem unique; so sinaliza cadastro repetido)', data.Client, (r) => lower(r.name));
push(`  linhas de Client que a unique de documento derruba: ${dupTax.reduce((a, [, n]) => a + n - 1, 0)}`);
push(`  linhas de Client que a unique de client_key derruba: ${dupKey.reduce((a, [, n]) => a + n - 1, 0)}`);
push('  documentos com formato invalido (nem 11 nem 14 digitos):');
{
  const badDoc = data.Client.filter((r) => {
    const d = digits(r.cpf_cnpj);
    return d !== '' && d.length !== 11 && d.length !== 14;
  });
  push(`    ${badDoc.length} linha(s)  comprimentos: ${JSON.stringify([...new Set(badDoc.map((r) => digits(r.cpf_cnpj).length))])}`);
}

h2('collaborators: unique (tenant_id, email)');
dupReport('e-mail de Collaborator', data.Collaborator, (r) => lower(r.email));
{
  const domains = new Map();
  for (const r of data.Collaborator) {
    const d = lower(r.email).split('@')[1] ?? '';
    domains.set(d, (domains.get(d) ?? 0) + 1);
  }
  push(`  dominios de e-mail dos ${data.Collaborator.length} colaboradores: ${domains.size}`);
  for (const [d, n] of [...domains.entries()].sort((a, b) => b[1] - a[1])) push(`    ${String(n).padStart(2)}  ${d}`);
}

h2('access_requests / contracts / financial_categories');
dupReport('e-mail de SolicitacaoAcesso', data.SolicitacaoAcesso, (r) => lower(r.email));
dupReport('contracts.contract_number  [unique (tenant_id, contract_number)]', data.Contract, (r) => r.contract_number.trim());
dupReport('financial_categories (type, name)  [unique]', data.FinancialCategory, (r) => `${r.type}|${lower(r.name)}`);
dupReport('suppliers.nome (sem unique no schema)', data.Fornecedor, (r) => lower(r.nome));

h2('accounts_receivable: unique (tenant_id, contract_id, installment_number)');
{
  const parsed = data.AccountReceivable.map((r) => {
    const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(r.installment_number ?? '');
    return { r, n: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null };
  });
  push(`  installment_number no base44 e TEXTO "n/total": ${parsed.filter((p) => p.n !== null).length} parseaveis, ${parsed.filter((p) => p.n === null && (p.r.installment_number ?? '').trim() !== '').length} em outro formato, ${parsed.filter((p) => (p.r.installment_number ?? '').trim() === '').length} vazios`);
  const other = [...new Set(parsed.filter((p) => p.n === null && (p.r.installment_number ?? '').trim() !== '').map((p) => p.r.installment_number))];
  if (other.length) push(`    formatos fora do padrao: ${JSON.stringify(other.slice(0, 10))}`);
  const dups = dupReport('  (contract_id, numero da parcela)', parsed.filter((p) => p.n !== null), (p) => `${p.r.contract_id}|${p.n}`);
  push(`    linhas que a unique derruba: ${dups.reduce((a, [, n]) => a + n - 1, 0)}`);
  push(`    fora da faixa (numero > total): ${parsed.filter((p) => p.n !== null && p.n > p.total).length}`);
  push(`    parcela SEM contrato (contract_id vazio; a unique nao pega, nulo nao colide): ${parsed.filter((p) => !(p.r.contract_id ?? '').trim()).length}`);
}

// ---------------------------------------------------------------------------
// 5. Check constraints que o dado real viola
// ---------------------------------------------------------------------------

h1('5. check constraints do nosso schema que o dado real viola');

function viol(label, rows, predicate) {
  const n = rows.filter(predicate).length;
  push(`${label.padEnd(70)} ${String(n).padStart(4)} linha(s)`);
  return n;
}

h2('negotiations');
viol('closed_at_requires_closed_status: data_fechamento com status Ativa', data.Negociacao,
  (r) => r.data_fechamento.trim() !== '' && r.status_negociacao === 'Ativa');
viol('loss_fields_require_lost: motivo/observacao de perda sem status Perdida', data.Negociacao,
  (r) => (r.motivo_perda.trim() !== '' || r.observacoes_perda.trim() !== '') && r.status_negociacao !== 'Perdida');
viol('close_probability_range (0..100)', data.Negociacao,
  (r) => r.probabilidade_fechamento.trim() !== '' && (Number(r.probabilidade_fechamento) < 0 || Number(r.probabilidade_fechamento) > 100));
viol('estimated_value >= 0', data.Negociacao,
  (r) => r.valor_estimado.trim() !== '' && Number(r.valor_estimado) < 0);
push(`  (informativo) valor_estimado < 1000, provavel erro de digitacao: ${data.Negociacao.filter((r) => r.valor_estimado.trim() !== '' && Number(r.valor_estimado) > 0 && Number(r.valor_estimado) < 1000).length}`);

h2('contracts');
viol('installment_plan_all_or_none (qtd/1o venc/periodicidade juntos)', data.Contract, (r) => {
  const n = [r.quantidade_parcelas, r.data_primeiro_vencimento, r.periodicidade_parcelas]
    .filter((v) => (v ?? '').trim() !== '').length;
  return n !== 0 && n !== 3;
});
viol('installments_generated_requires_plan', data.Contract,
  (r) => r.installments_generated === 'true' && !r.quantidade_parcelas.trim());
viol('installment_count >= 1', data.Contract,
  (r) => r.quantidade_parcelas.trim() !== '' && Number(r.quantidade_parcelas) < 1);
viol('start_date_not_before_signature', data.Contract,
  (r) => r.start_date.trim() && r.signature_date.trim() && r.start_date < r.signature_date);
viol('phase_days_positive (prazo_* = 0 e recusado)', data.Contract,
  (r) => ['prazo_estudo_layout', 'prazo_perspectivas', 'prazo_projeto_legal', 'prazo_projeto_executivo', 'prazo_projetos_complementares']
    .some((k) => (r[k] ?? '').trim() !== '' && Number(r[k]) <= 0));
viol('total_value >= 0', data.Contract, (r) => Number(r.total_value) < 0);

h2('projects');
viol('phase_days_positive (prazo_* = 0 e recusado)', data.Project,
  (r) => ['prazo_estudo_layout', 'prazo_perspectivas', 'prazo_projeto_legal', 'prazo_projeto_executivo', 'prazo_projetos_complementares']
    .some((k) => (r[k] ?? '').trim() !== '' && Number(r[k]) <= 0));
viol('areas_positive (area_* = 0 e recusado)', data.Project,
  (r) => ['area_terreno_m2', 'area_projeto_m2'].some((k) => (r[k] ?? '').trim() !== '' && Number(r[k]) <= 0));
viol('total_value >= 0', data.Project, (r) => r.total_value.trim() !== '' && Number(r.total_value) < 0);
push(`  (informativo) projetos com total_value = 0: ${data.Project.filter((r) => r.total_value.trim() !== '' && Number(r.total_value) === 0).length}`);

h2('tasks');
viol('completion_date_matches_status (concluida sem data, ou data sem concluida)', data.Task,
  (r) => (r.status === 'Concluída') !== (r.completion_date.trim() !== ''));
viol('due_date_not_before_start', data.Task,
  (r) => r.due_date.trim() && r.start_date.trim() && r.due_date < r.start_date);
viol('phase_not_finished (tarefa em Finalizado)', data.Task, (r) => r.phase === 'Finalizado');
viol('priority_not_urgent (tarefa Urgente)', data.Task, (r) => r.priority === 'Urgente');

h2('activities');
viol('completed_at_matches_status', data.Atividade,
  (r) => (r.status === 'Concluída') !== (r.data_conclusao_real.trim() !== ''));
viol('started_at_not_after_completed', data.Atividade,
  (r) => r.data_inicio_real.trim() && r.data_conclusao_real.trim() && r.data_inicio_real > r.data_conclusao_real);
viol('end_date_not_before_start_date', data.Atividade,
  (r) => r.prazo_termino < r.prazo_inicio);
viol('deleted_pair (data_exclusao sem usuario_exclusao_id, ou o contrario)', data.Atividade,
  (r) => (r.data_exclusao.trim() !== '') !== (r.usuario_exclusao_id.trim() !== ''));
push(`  atividade_excluida=true: ${data.Atividade.filter((r) => r.atividade_excluida === 'true').length}; com data_exclusao: ${data.Atividade.filter((r) => r.data_exclusao.trim() !== '').length}`);
viol('atividade_excluida=true sem data_exclusao (exclusao logica sem quando)', data.Atividade,
  (r) => r.atividade_excluida === 'true' && !r.data_exclusao.trim());
viol('data_exclusao com atividade_excluida=false (excluida que a tela mostra)', data.Atividade,
  (r) => r.atividade_excluida !== 'true' && r.data_exclusao.trim() !== '');
push(`  tempo_total_minutos gravado sem data_inicio_real (a coluna gerada daria NULL): ${data.Atividade.filter((r) => r.tempo_total_minutos.trim() !== '' && !r.data_inicio_real.trim()).length}`);
push(`  tempo_total_minutos divergente do calculado (>1 min de diferenca): ${data.Atividade.filter((r) => {
  if (!r.data_inicio_real.trim() || !r.data_conclusao_real.trim() || r.tempo_total_minutos.trim() === '') return false;
  const calc = Math.round((Date.parse(r.data_conclusao_real) - Date.parse(r.data_inicio_real)) / 60000);
  return Math.abs(calc - Number(r.tempo_total_minutos)) > 1;
}).length}`);

h2('accounts_receivable / accounts_payable');
viol('AR payment_date_matches_status', data.AccountReceivable,
  (r) => (r.status === 'Pago') !== (r.payment_date.trim() !== ''));
viol('AR payment_method_domain (Debito automatico em recebivel)', data.AccountReceivable,
  (r) => r.payment_method === 'Débito automático');
viol('AP payment_date_matches_status', data.AccountPayable,
  (r) => (r.status === 'Pago') !== (r.payment_date.trim() !== ''));
viol('AP payment_method_domain (Especie em pagamento)', data.AccountPayable,
  (r) => r.payment_method === 'Espécie');
viol('AP recurrence_plan (is_recurring sem frequencia ou sem data inicial)', data.AccountPayable,
  (r) => r.is_recurring === 'true' && (!r.recurrence_frequency.trim() || !r.recurrence_start_date.trim()));
viol('AP occurrence_is_not_recurring (filho com is_recurring=true)', data.AccountPayable,
  (r) => r.recurrence_parent_id.trim() !== '' && r.is_recurring === 'true');
viol('AP recurrence_parent_not_self', data.AccountPayable, (r) => r.recurrence_parent_id === r.id);
viol('AP recurrence_end_not_before_start', data.AccountPayable,
  (r) => r.recurrence_end_date.trim() && r.recurrence_start_date.trim() && r.recurrence_end_date < r.recurrence_start_date);
{
  const bad = data.AccountPayable.filter((r) => {
    const t = (r.competence_month ?? '').trim();
    return t !== '' && !/^\d{2}\/\d{4}$/.test(t);
  });
  push(`  competence_month vem como "MM/AAAA" (texto), nao date: ${filled(data.AccountPayable, 'competence_month')} preenchidos, ${bad.length} fora do formato MM/AAAA`);
}
push(`  AP mae de recorrencia (is_recurring=true): ${data.AccountPayable.filter((r) => r.is_recurring === 'true').length}`);
push(`  AP ocorrencia (recurrence_parent_id preenchido): ${data.AccountPayable.filter((r) => r.recurrence_parent_id.trim() !== '').length}`);
push(`  AP recurrence_status preenchido em linha NAO recorrente e sem pai: ${data.AccountPayable.filter((r) => r.recurrence_status.trim() !== '' && r.is_recurring !== 'true' && !r.recurrence_parent_id.trim()).length}`);

h2('map_properties');
viol('lat/lng fora de faixa', data.PropriedadeMapa,
  (r) => Math.abs(Number(r.lat)) > 90 || Math.abs(Number(r.lng)) > 180);
viol('not_null_island (0,0)', data.PropriedadeMapa,
  (r) => Number(r.lat) === 0 && Number(r.lng) === 0);
viol('project_link_exclusive: project_id E project_label preenchidos', data.PropriedadeMapa,
  (r) => r.project_id.trim() !== '' && r.project_label.trim() !== '');
viol('client_link_exclusive: client_id E client_label preenchidos', data.PropriedadeMapa,
  (r) => r.client_id.trim() !== '' && r.client_label.trim() !== '');
viol('areas_positive (area_* = 0 e recusado)', data.PropriedadeMapa,
  (r) => ['area_terreno_m2', 'area_projeto_m2'].some((k) => (r[k] ?? '').trim() !== '' && Number(r[k]) <= 0));
{
  const seen = new Map();
  for (const r of data.PropriedadeMapa) {
    const k = `${r.lat}|${r.lng}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = [...seen.values()].filter((n) => n > 1);
  push(`  coordenadas exatamente repetidas: ${dups.length} par(es), ${dups.reduce((a, b) => a + b, 0)} linha(s)`);
  const states = tally(data.PropriedadeMapa, 'state');
  push(`  state vem por EXTENSO (${states.length} distintos), enquanto Client.current_state vem por sigla: ${JSON.stringify(states.slice(0, 5).map(([v, n]) => `${v}=${n}`))}`);
}

h2('client_intakes');
{
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const nonUuid = data.ClientIntake.filter((r) => !uuid.test(r.token.trim()));
  push(`  token do base44 que NAO e uuid (nossa coluna token e uuid): ${nonUuid.length} de ${data.ClientIntake.length}`);
  viol('submitted_at_matches_status', data.ClientIntake,
    (r) => (r.status === 'Enviado') !== (r.enviado_em.trim() !== ''));
  viol('expires_after_creation (expira_em <= criado_em)', data.ClientIntake,
    (r) => r.expira_em.trim() && r.criado_em.trim() && r.expira_em <= r.criado_em);
  const now = new Date().toISOString();
  push(`  status "Ativo" com expira_em ja no passado: ${data.ClientIntake.filter((r) => r.status === 'Ativo' && r.expira_em < now).length}`);
}

// ---------------------------------------------------------------------------
// 6. Permissoes
// ---------------------------------------------------------------------------

h1('6. permissoes — 357 linhas, menus duplicados, conferencia humana');

{
  const rows = data.PermissoesUsuario;
  const byCollab = new Map();
  for (const r of rows) {
    if (!byCollab.has(r.colaborador_id)) byCollab.set(r.colaborador_id, []);
    byCollab.get(r.colaborador_id).push(r);
  }
  push(`linhas: ${rows.length}`);
  push(`colaborador_id distintos em PermissoesUsuario: ${byCollab.size}`);
  push(`colaborador_name distintos: ${new Set(rows.map((r) => r.colaborador_name)).size}`);
  push(`Collaborator no export: ${data.Collaborator.length}`);
  const known = [...byCollab.keys()].filter((k) => collabIds.has(k));
  push(`colaborador_id que existem em Collaborator: ${known.length}; ORFAOS: ${byCollab.size - known.length}`);
  push(`linhas de permissao presas a colaborador orfao: ${rows.filter((r) => !collabIds.has(r.colaborador_id)).length}`);
  push();
  push(`rotulos distintos de menu: ${new Set(rows.map((r) => r.menu)).size} (mapeiam para ${new Set(rows.map((r) => ENUMS.menu_key[r.menu]).filter(Boolean)).size} menu_key)`);
  push();

  push('CONFLITOS: mesmo colaborador, mesmo menu_key, valores DIFERENTES de can_view/can_edit.');
  push('(a importacao aplica o mais permissivo e lista o caso — SCHEMA-PLAN, pendencia 2)');
  push();
  let conflicts = 0;
  let collapsedNoConflict = 0;
  const conflictCollabs = new Set();
  const conflictMenus = new Map();
  for (const [cid, list] of byCollab) {
    const byKey = new Map();
    for (const r of list) {
      const key = ENUMS.menu_key[r.menu];
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }
    for (const [key, group] of byKey) {
      if (group.length < 2) continue;
      const combos = new Set(group.map((g) => `${g.pode_visualizar}/${g.pode_editar}`));
      if (combos.size === 1) { collapsedNoConflict += 1; continue; }
      conflicts += 1;
      conflictCollabs.add(cid);
      conflictMenus.set(key, (conflictMenus.get(key) ?? 0) + 1);
      const name = group[0].colaborador_name;
      const known2 = collabIds.has(cid) ? '' : '  [colaborador ORFAO]';
      push(`  ${name.padEnd(24)} ${key.padEnd(20)}${known2}`);
      for (const g of group) {
        push(`      ${reveal(g.menu).padEnd(40)} view=${g.pode_visualizar.padEnd(5)} edit=${g.pode_editar}`);
      }
      const view = group.some((g) => g.pode_visualizar === 'true');
      const edit = group.some((g) => g.pode_editar === 'true');
      push(`      -> mais permissivo: view=${view} edit=${edit}`);
    }
  }
  push();
  push(`pares colapsados SEM conflito (mesmo valor nas duas grafias): ${collapsedNoConflict}`);
  push(`CONFLITOS que precisam de conferencia humana: ${conflicts}, em ${conflictCollabs.size} colaborador(es)`);
  push(`menus com conflito: ${JSON.stringify([...conflictMenus.entries()])}`);
  push();
  const totalAfter = [...byCollab.values()].reduce((a, list) => {
    const keys = new Set(list.map((r) => ENUMS.menu_key[r.menu]).filter(Boolean));
    return a + keys.size;
  }, 0);
  push(`linhas de collaborator_permissions depois da consolidacao (todos os colaboradores): ${totalAfter}`);
  const totalKnown = [...byCollab.entries()].filter(([cid]) => collabIds.has(cid)).reduce((a, [, list]) => {
    const keys = new Set(list.map((r) => ENUMS.menu_key[r.menu]).filter(Boolean));
    return a + keys.size;
  }, 0);
  push(`  ... contando SO colaboradores que existem no export: ${totalKnown}`);
  push();
  push('Colaboradores do export SEM nenhuma linha de permissao:');
  const withPerm = new Set(rows.map((r) => r.colaborador_id));
  const semPerm = data.Collaborator.filter((c) => !withPerm.has(c.id));
  push(`  ${semPerm.length} de ${data.Collaborator.length}  (funcoes: ${JSON.stringify(tally(semPerm, 'role').map(([v, n]) => `${v}=${n}`))})`);
  push();
  push('Menus que NENHUMA linha de permissao menciona (viram default false):');
  const seenKeys = new Set(rows.map((r) => ENUMS.menu_key[r.menu]).filter(Boolean));
  const allKeys = ['dashboard_overview', 'dashboard_executive', 'dashboard_commercial', 'crm', 'pipeline',
    'contracts', 'projects', 'map', 'project_flow', 'activities', 'suppliers', 'client_budget',
    'financial', 'receivables', 'payables', 'team_group', 'team', 'access_control'];
  push(`  ${JSON.stringify(allKeys.filter((k) => !seenKeys.has(k)))}`);
  push(`  (financial e team_group sao agrupadores e nunca recebem linha, por desenho — ENUM-MAP)`);
}

// ---------------------------------------------------------------------------
// 7. Campos do base44 sem destino no nosso schema
// ---------------------------------------------------------------------------

h1('7. campos do base44 sem coluna nossa, e campos vazios no export inteiro');

const NO_DESTINATION = {
  Collaborator: ['senha_temporaria', 'user_auth_email'],
  Client: ['email_norm', 'cpf_cnpj_norm', 'cliente_key'],
  Negociacao: ['historico_responsavel', 'contrato_vinculado_number', 'projeto_vinculado_id'],
  Contract: ['file_url'],
  Project: ['progresso_percentual', 'tarefas_total_obrigatorias', 'tarefas_concluidas_obrigatorias',
    'checklist_etapa', 'obra_place_id'],
  Task: ['tag_operacional'],
  Atividade: ['tempo_total_minutos', 'atividade_excluida', 'ultimo_alerta_em'],
  AccountReceivable: ['responsible_id', 'responsible_name', 'receipt_url'],
  AccountPayable: ['responsible_id', 'responsible_name', 'receipt_url', 'generated_count'],
  Fornecedor: ['total_comissao_recebida'],
  ChecklistOrcamento: ['valor_total_estimado', 'valor_total_aprovado', 'valor_total_comissao',
    'curadoria_valor_total'],
  ProjectTimelineEntry: ['TODAS'],
};

for (const [entity, cols] of Object.entries(NO_DESTINATION)) {
  const rows = data[entity];
  push(`${entity}:`);
  if (cols[0] === 'TODAS') {
    push(`  entidade inteira sem destino: ${rows.length} linhas, ${Object.keys(rows[0]).length} colunas`);
    continue;
  }
  for (const c of cols) {
    push(`  ${c.padEnd(34)} preenchido em ${String(filled(rows, c)).padStart(4)} de ${rows.length}`);
  }
}

push();
push('Colunas 100% VAZIAS no export (nao ha o que migrar, com ou sem coluna nossa):');
for (const [entity, rows] of Object.entries(data)) {
  const empties = Object.keys(rows[0] ?? {}).filter((c) => filled(rows, c) === 0);
  if (empties.length) push(`  ${entity.padEnd(22)} ${JSON.stringify(empties)}`);
}

// ---------------------------------------------------------------------------
// 8. Campos JSON aninhados que viram tabela-filha
// ---------------------------------------------------------------------------

h1('8. campos json do base44 que viram tabela-filha');

function nested(entity, col, label) {
  const rows = data[entity];
  let total = 0;
  let withData = 0;
  let broken = 0;
  const distinct = new Map();
  for (const r of rows) {
    const parsed = jsonOrNull(r[col]);
    if (parsed === undefined) { broken += 1; continue; }
    if (!Array.isArray(parsed) || parsed.length === 0) continue;
    withData += 1;
    total += parsed.length;
    for (const v of parsed) {
      if (typeof v === 'string') distinct.set(v, (distinct.get(v) ?? 0) + 1);
    }
  }
  push(`${entity}.${col} -> ${label}`);
  push(`  linhas com conteudo: ${withData}/${rows.length}; itens: ${total}; JSON ilegivel: ${broken}`);
  if (distinct.size) {
    push(`  valores distintos (${distinct.size}, texto livre no original):`);
    for (const [v, n] of [...distinct.entries()].sort((a, b) => b[1] - a[1])) push(`    ${String(n).padStart(4)}  ${JSON.stringify(v)}`);
  }
  push();
}

nested('Negociacao', 'tipo_servico', 'negotiation_services (enum service_type)');
nested('Negociacao', 'historico_responsavel', 'negotiation_owner_history');
nested('Fornecedor', 'marcas_representadas', 'supplier_brands');
nested('Project', 'terreno_tipo', 'project_land_types');
nested('Project', 'finalidade_projeto', 'project_purposes');
nested('Project', 'checklist_etapa', 'project_checklist_items');
nested('PropriedadeMapa', 'terreno_tipo', 'map_property_land_types');
nested('PropriedadeMapa', 'finalidade_projeto', 'map_property_purposes');
nested('Task', 'checklist_tarefa', 'task_checklist_items');
{
  const items = [];
  for (const r of data.Task) {
    const parsed = jsonOrNull(r.checklist_tarefa);
    if (Array.isArray(parsed)) for (const it of parsed) items.push({ ...it, __task: r.id });
  }
  const keys = [...new Set(items.flatMap((i) => Object.keys(i)))].filter((k) => k !== '__task').sort();
  push(`Task.checklist_tarefa: ${items.length} itens`);
  push(`  chaves: ${JSON.stringify(keys)}`);
  push(`  NAO existe campo de data de conclusao no item do base44 (nossa coluna completed_at fica sem fonte).`);
  const byTaskTitle = new Map();
  for (const i of items) {
    const k = `${i.__task}|${(i.titulo ?? '').trim()}`;
    byTaskTitle.set(k, (byTaskTitle.get(k) ?? 0) + 1);
  }
  const dupTitles = [...byTaskTitle.values()].filter((n) => n > 1);
  push(`  unique (task_id, title): ${dupTitles.length} titulo(s) repetido(s) dentro da mesma tarefa, ${dupTitles.reduce((a, b) => a + b, 0)} itens envolvidos`);
  const reqDone = items.filter((i) => i.obrigatorio === true && i.concluido === true).length;
  push(`  obrigatorio=true E concluido=true: ${reqDone} itens`);
  push(`    -> TODOS violam task_checklist_items_required_completed_needs_date_check,`);
  push(`       porque a fonte nao tem data. Ver docs/IMPORT-PLAN.md, secao 1 (tasks).`);
  push(`  concluido=true no total: ${items.filter((i) => i.concluido === true).length}`);
  const etapas = tally(items, 'etapa').filter(([v]) => v !== '' && v !== 'undefined');
  push(`  etapa (vira task_checklist_items.phase, enum project_phase):`);
  for (const [v, n] of etapas) {
    const mapped = ENUMS.project_phase[v];
    push(`    ${String(n).padStart(4)}  ${JSON.stringify(v)} -> ${mapped ?? 'NAO MAPEADO'}`);
    if (!mapped && v !== undefined) unmapped.push({ entity: 'Task.checklist_tarefa[]', col: 'etapa', enumName: 'project_phase', value: String(v), rows: n });
  }
  push();
}
{
  const anexos = [];
  for (const r of data.ProjectTimelineEntry) {
    const parsed = jsonOrNull(r.anexos);
    if (Array.isArray(parsed)) anexos.push(...parsed);
  }
  push(`ProjectTimelineEntry.anexos: ${anexos.length} arquivo(s), todos apontando para URL do base44`);
  push(`  hosts: ${JSON.stringify([...new Set(anexos.map((a) => { try { return new URL(a.url).host; } catch { return a.url; } }))])}`);
  push();
}

// ---------------------------------------------------------------------------
// 9. ProjectTimelineEntry — dado sem destino
// ---------------------------------------------------------------------------

h1('9. ProjectTimelineEntry — dado sem destino');
{
  const rows = data.ProjectTimelineEntry;
  push(`linhas: ${rows.length}, sobre ${new Set(rows.map((r) => r.project_id)).size} projetos distintos`);
  push(`is_automatico=true: ${rows.filter((r) => r.is_automatico === 'true').length}; manual: ${rows.filter((r) => r.is_automatico !== 'true').length}`);
  push(`entry_type: ${JSON.stringify(tally(rows, 'entry_type').map(([v, n]) => `${v}=${n}`))}`);
  push(`status_registro: ${JSON.stringify(tally(rows, 'status_registro').map(([v, n]) => `${v}=${n}`))}`);
  push(`evento_chave preenchido: ${filled(rows, 'evento_chave')} (prefixos: ${JSON.stringify([...new Set(rows.map((r) => r.evento_chave.split(':')[0]).filter(Boolean))])})`);
  push(`com anexo: ${rows.filter((r) => (jsonOrNull(r.anexos) ?? []).length > 0).length}`);
  push(`titulos distintos: ${new Set(rows.map((r) => r.titulo)).size}`);
  push('Nenhuma tabela nossa recebe estas linhas. Ver docs/IMPORT-PLAN.md, secao 7.');
}

// ---------------------------------------------------------------------------
// 10. Ligacoes que discordam entre si
// ---------------------------------------------------------------------------

h1('10. ligacoes que os dois lados gravam e podem discordar');
{
  // contract.project_id vs project.contract_id
  const projByContract = new Map();
  for (const p of data.Project) if (p.contract_id.trim()) projByContract.set(p.contract_id, p.id);
  let agree = 0; let disagree = 0; let onlyContract = 0; let onlyProject = 0;
  for (const c of data.Contract) {
    const fromProject = projByContract.get(c.id);
    const fromContract = c.project_id.trim() || null;
    if (fromProject && fromContract) (fromProject === fromContract ? agree++ : disagree++);
    else if (fromContract) onlyContract++;
    else if (fromProject) onlyProject++;
  }
  push(`Contract.project_id x Project.contract_id: concordam=${agree} DISCORDAM=${disagree} so-no-contrato=${onlyContract} so-no-projeto=${onlyProject}`);
  push(`  contratos sem projeto nenhum dos dois lados: ${data.Contract.filter((c) => !c.project_id.trim() && !projByContract.has(c.id)).length}`);
  push(`  projetos sem contract_id: ${data.Project.filter((p) => !p.contract_id.trim()).length}`);
  push();

  // Negociacao.contrato_vinculado_number x Contract.contract_number
  const numbers = new Set(data.Contract.map((c) => c.contract_number.trim()));
  const negNums = data.Negociacao.map((n) => n.contrato_vinculado_number.trim()).filter(Boolean);
  push(`Negociacao.contrato_vinculado_number: ${negNums.length} preenchidos; batem com Contract.contract_number: ${negNums.filter((n) => numbers.has(n)).length}`);
  push('  (o numero da negociacao usa o padrao CTR-<timestamp>; o do contrato e sequencial de 4 digitos — sao numeracoes diferentes)');
  push();

  // Contract client snapshot vs Client
  const clientById = new Map(data.Client.map((c) => [c.id, c]));
  let snapDiff = 0; let snapSame = 0; let noClient = 0;
  for (const c of data.Contract) {
    const cl = clientById.get(c.client_id);
    if (!cl) { noClient += 1; continue; }
    (digits(c.client_cpf_cnpj) === digits(cl.cpf_cnpj) ? snapSame++ : snapDiff++);
  }
  push(`Copia congelada do cliente no contrato x cadastro atual (CPF/CNPJ): igual=${snapSame} DIFERENTE=${snapDiff} sem cliente=${noClient}`);
  push('  (divergencia e esperada e intencional — SCHEMA-PLAN, "Copia congelada do cliente")');
  push();

  // AccountReceivable contract_number x contract_id
  const contractById = new Map(data.Contract.map((c) => [c.id, c]));
  let arSame = 0; let arDiff = 0; let arNoContract = 0;
  for (const r of data.AccountReceivable) {
    const c = contractById.get(r.contract_id);
    if (!c) { arNoContract += 1; continue; }
    (c.contract_number.trim() === r.contract_number.trim() ? arSame++ : arDiff++);
  }
  push(`AccountReceivable.contract_number x Contract.contract_number: igual=${arSame} DIFERENTE=${arDiff} sem contrato=${arNoContract}`);
}

// ---------------------------------------------------------------------------
// 11. Colaboradores x logins
// ---------------------------------------------------------------------------

h1('11. colaborador x login — o que a importacao NAO consegue resolver sozinha');
{
  push(`Collaborator.user_auth_email preenchido: ${filled(data.Collaborator, 'user_auth_email')} de ${data.Collaborator.length}`);
  push(`Collaborator.senha_temporaria preenchido: ${filled(data.Collaborator, 'senha_temporaria')} de ${data.Collaborator.length}  [coluna EXISTE no CSV, FORA DE ESCOPO por decisao]`);
  push(`Collaborator.coordenador_id preenchido: ${filled(data.Collaborator, 'coordenador_id')} de ${data.Collaborator.length}`);
  push(`Collaborator.weekly_hours preenchido: ${filled(data.Collaborator, 'weekly_hours')} de ${data.Collaborator.length}`);
  push();
  // Ids de usuario da plataforma que aparecem como responsavel em algum lugar
  const userIds = new Set();
  const add = (entity, col) => { for (const r of data[entity]) if ((r[col] ?? '').trim()) userIds.add(r[col].trim()); };
  add('Negociacao', 'responsavel_comercial_id');
  add('Project', 'responsible_id');
  add('Project', 'commercial_responsible_id');
  add('Task', 'responsible_id');
  add('Atividade', 'colaborador_id');
  add('Atividade', 'iniciado_por');
  add('Atividade', 'concluido_por');
  add('Atividade', 'usuario_exclusao_id');
  add('ChecklistOrcamento', 'responsavel_orcamento_id');
  add('SolicitacaoAcesso', 'aprovado_por_id');
  push(`ids usados como "responsavel" em qualquer entidade: ${userIds.size}`);
  push(`  que existem como Collaborator.id: ${[...userIds].filter((u) => collabIds.has(u)).length}`);
  push(`  que NAO existem como Collaborator.id: ${[...userIds].filter((u) => !collabIds.has(u)).length}`);
  push();
  // Nomes usados como responsavel que existem/nao existem como nome de Collaborator
  const collabNames = new Set(data.Collaborator.map((c) => lower(c.name)));
  const nameCols = [['Negociacao', 'responsavel_comercial_name'], ['Project', 'responsible_name'],
    ['Project', 'commercial_responsible_name'], ['Task', 'responsible_name'],
    ['Atividade', 'colaborador_name'], ['Atividade', 'usuario_exclusao_name'],
    ['PermissoesUsuario', 'colaborador_name'], ['ChecklistOrcamento', 'responsavel_orcamento_name'],
    ['SolicitacaoAcesso', 'aprovado_por_nome']];
  const usedNames = new Map();
  for (const [e, c] of nameCols) for (const r of data[e]) {
    const v = (r[c] ?? '').trim();
    if (v) usedNames.set(v, (usedNames.get(v) ?? 0) + 1);
  }
  const unknownNames = [...usedNames.entries()].filter(([n]) => !collabNames.has(lower(n)));
  push(`nomes usados como responsavel: ${usedNames.size} distintos; sem Collaborator de mesmo nome: ${unknownNames.length}`);
  push('  (nome nao identifica pessoa — a ligacao correta e por id; aqui so mede o tamanho do buraco)');
  push(`  linhas presas a esses nomes: ${unknownNames.reduce((a, [, n]) => a + n, 0)}`);
  push();
  push('Nomes de Collaborator com espaco sobrando nas pontas (btrim muda o valor):');
  push(`  ${data.Collaborator.filter((c) => c.name !== c.name.trim()).length} de ${data.Collaborator.length}`);
}

// ---------------------------------------------------------------------------
// 12. Ordem de importacao
// ---------------------------------------------------------------------------

h1('12. ordem de importacao (uma tabela so entra depois das que referencia)');
[
  'tenants                    (uma linha, criada a mao — nao vem do export)',
  'tenant_email_domains       (ver secao 11: os dominios reais)',
  'menus                      (ja populada pela migration 0004)',
  'collaborators              <- Collaborator',
  'collaborator_permissions   <- PermissoesUsuario        (dep: collaborators, menus)',
  'access_requests            <- SolicitacaoAcesso        (dep: collaborators via decided_by)',
  'clients                    <- Client',
  'negotiations               <- Negociacao               (dep: clients, collaborators)',
  'negotiation_services       <- Negociacao.tipo_servico  (dep: negotiations)',
  'negotiation_owner_history  <- Negociacao.historico_responsavel (dep: negotiations, collaborators)',
  'contracts                  <- Contract                 (dep: clients, negotiations)',
  'client_intakes             <- ClientIntake             (dep: clients, negotiations)',
  'projects                   <- Project                  (dep: clients, contracts, collaborators)',
  'project_land_types         <- Project.terreno_tipo     (dep: projects)',
  'project_purposes           <- Project.finalidade_projeto (dep: projects)',
  'project_checklist_items    <- Project.checklist_etapa  (dep: projects)',
  'tasks                      <- Task                     (dep: projects, collaborators)',
  'task_checklist_items       <- Task.checklist_tarefa    (dep: tasks)',
  'activities                 <- Atividade                (dep: collaborators, projects, clients)',
  'financial_categories       <- FinancialCategory',
  'accounts_receivable        <- AccountReceivable        (dep: clients, contracts, projects)',
  'accounts_payable           <- AccountPayable           (dep: projects; e ela mesma, pela recorrencia: maes antes das ocorrencias)',
  'suppliers                  <- Fornecedor',
  'supplier_brands            <- Fornecedor.marcas_representadas (dep: suppliers)',
  'budget_checklists          <- ChecklistOrcamento       (dep: clients, projects, collaborators)',
  'budget_checklist_items     <- ChecklistOrcamento.itens (dep: budget_checklists, suppliers)',
  'budget_item_quotes         <- itens[].cotacoes         (dep: budget_checklist_items, suppliers)',
  'map_properties             <- PropriedadeMapa          (dep: projects, clients)',
  'map_property_land_types    <- PropriedadeMapa.terreno_tipo (dep: map_properties)',
  'map_property_purposes      <- PropriedadeMapa.finalidade_projeto (dep: map_properties)',
  '--- sem destino ---',
  'ProjectTimelineEntry       (36 linhas, nenhuma tabela)',
].forEach((s, i) => push(`${String(i + 1).padStart(2)}. ${s}`));

// ---------------------------------------------------------------------------
// 13. Resumo executivo
// ---------------------------------------------------------------------------

h1('13. resumo executivo — o que entra, o que trava');

push('TODOS os valores de enum sem de/para (a regra derruba a linha para pendencias):');
for (const u of unmapped) push(`  ${u.entity}.${u.col}: ${reveal(u.value)} -> ${u.rows} linha(s)`);
push(`  total: ${unmapped.reduce((a, u) => a + u.rows, 0)} linha(s)`);
push();

// Linhas que a importacao NAO consegue gravar sem decisao humana, por tabela.
const blocked = [];
function block(table, motivo, n) { if (n > 0) blocked.push({ table, motivo, n }); }

block('clients', 'client_type sem de/para ("Lead"/"lead")',
  data.Client.filter((r) => r.client_type.trim() && !ENUMS.client_type[r.client_type]).length);
block('clients', 'lead_source sem de/para ("WhatsApp")',
  data.Client.filter((r) => r.lead_source.trim() && !ENUMS.lead_source[r.lead_source]).length);
block('clients', 'address_city/address_state vazios (NOT NULL)',
  data.Client.filter((r) => !r.current_city.trim() || !r.current_state.trim()).length);
block('clients', 'CPF/CNPJ repetido (unique tax_id_digits)', dupTax.reduce((a, [, n]) => a + n - 1, 0));
block('negotiations', 'commercial_owner_id orfao (NOT NULL, FK collaborators)',
  data.Negociacao.filter((r) => r.responsavel_comercial_id.trim() && !collabIds.has(r.responsavel_comercial_id)).length);
block('negotiations', 'cliente_id orfao',
  data.Negociacao.filter((r) => r.cliente_id.trim() && !idsOf(data.Client).has(r.cliente_id)).length);
block('negotiation_services', 'service_type sem de/para',
  data.Negociacao.filter((r) => (jsonOrNull(r.tipo_servico) ?? []).some((v) => !ENUMS.service_type[v])).length);
block('client_intakes', 'client_id orfao (NOT NULL)',
  data.ClientIntake.filter((r) => !idsOf(data.Client).has(r.cliente_crm_id)).length);
block('client_intakes', 'negotiation_id orfao',
  data.ClientIntake.filter((r) => r.negociacao_id.trim() && !idsOf(data.Negociacao).has(r.negociacao_id)).length);
block('contracts', 'plano de parcela incompleto (all_or_none)', data.Contract.filter((r) => {
  const n = [r.quantidade_parcelas, r.data_primeiro_vencimento, r.periodicidade_parcelas].filter((v) => (v ?? '').trim() !== '').length;
  return n !== 0 && n !== 3;
}).length);
block('contracts', 'prazo de fase = 0 (phase_days_positive)', data.Contract.filter((r) =>
  ['prazo_estudo_layout', 'prazo_perspectivas', 'prazo_projeto_legal', 'prazo_projeto_executivo', 'prazo_projetos_complementares']
    .some((k) => (r[k] ?? '').trim() !== '' && Number(r[k]) <= 0)).length);
block('projects', 'project_type sem de/para (lista de servicos, nao tipo de contrato) [NOT NULL]',
  data.Project.filter((r) => !ENUMS.contract_type[r.project_type]).length);
block('projects', 'client_id orfao',
  data.Project.filter((r) => r.client_id.trim() && !idsOf(data.Client).has(r.client_id)).length);
block('tasks', 'phase sem de/para', data.Task.filter((r) => r.phase.trim() && !ENUMS.project_phase[r.phase]).length);
block('tasks', 'status sem de/para', data.Task.filter((r) => r.status.trim() && !ENUMS.work_status[r.status]).length);
block('tasks', 'project_id orfao', data.Task.filter((r) => r.project_id.trim() && !idsOf(data.Project).has(r.project_id)).length);
block('tasks', 'responsible_id orfao', data.Task.filter((r) => r.responsible_id.trim() && !collabIds.has(r.responsible_id)).length);
block('tasks', 'completion_date x status incoerentes',
  data.Task.filter((r) => (r.status === 'Concluída') !== (r.completion_date.trim() !== '')).length);
block('activities', 'completed_at x status incoerentes',
  data.Atividade.filter((r) => (r.status === 'Concluída') !== (r.data_conclusao_real.trim() !== '')).length);
block('activities', 'deleted_at sem deleted_by',
  data.Atividade.filter((r) => (r.data_exclusao.trim() !== '') !== (r.usuario_exclusao_id.trim() !== '')).length);
block('activities', 'colaborador/iniciado_por/concluido_por orfao',
  data.Atividade.filter((r) => [r.colaborador_id, r.iniciado_por, r.concluido_por]
    .some((v) => (v ?? '').trim() && !collabIds.has(v))).length);
block('accounts_receivable', 'value <= 0 (check value > 0)',
  data.AccountReceivable.filter((r) => !r.value.trim() || Number(r.value) <= 0).length);
block('accounts_receivable', 'payment_date x status incoerentes',
  data.AccountReceivable.filter((r) => (r.status === 'Pago') !== (r.payment_date.trim() !== '')).length);
block('accounts_payable', 'payment_date x status incoerentes',
  data.AccountPayable.filter((r) => (r.status === 'Pago') !== (r.payment_date.trim() !== '')).length);
block('accounts_payable', 'is_recurring sem plano (frequencia/data inicial)',
  data.AccountPayable.filter((r) => r.is_recurring === 'true' && (!r.recurrence_frequency.trim() || !r.recurrence_start_date.trim())).length);
block('accounts_payable', 'recurrence_end_date < recurrence_start_date',
  data.AccountPayable.filter((r) => r.recurrence_end_date.trim() && r.recurrence_start_date.trim() && r.recurrence_end_date < r.recurrence_start_date).length);
block('suppliers', 'tipologia vazia (category NOT NULL)',
  data.Fornecedor.filter((r) => !r.tipologia.trim()).length);
// Os quatro valores que so valem em item de orcamento: suppliers_category_domain_check
// os barra, do mesmo jeito que tasks.phase barra finished.
block('suppliers', 'tipologia que so vale em item de orcamento (suppliers_category_domain_check)',
  data.Fornecedor.filter((r) => ['Revestimento de Fachada', 'Revestimento de Piscina',
    'Impermeabilização', 'Gesso e Drywall'].includes(r.tipologia)).length);
block('map_properties', 'status_visual sem de/para ("Em andamento")',
  data.PropriedadeMapa.filter((r) => r.status_visual.trim() && !ENUMS.map_visual_status[r.status_visual]).length);
block('collaborator_permissions', 'colaborador_id orfao (7 pessoas fora do export de Collaborator)',
  data.PermissoesUsuario.filter((r) => !collabIds.has(r.colaborador_id)).length);
block('access_requests', 'decided_by orfao (aprovado_por_id nao e Collaborator.id)',
  data.SolicitacaoAcesso.filter((r) => r.aprovado_por_id.trim() && !collabIds.has(r.aprovado_por_id)).length);
block('task_checklist_items', 'obrigatorio+concluido sem data (a fonte nao tem o campo)',
  (() => {
    let n = 0;
    for (const r of data.Task) {
      const parsed = jsonOrNull(r.checklist_tarefa);
      if (Array.isArray(parsed)) n += parsed.filter((i) => i.obrigatorio === true && i.concluido === true).length;
    }
    return n;
  })());

push('Linhas que NAO entram sem decisao humana (uma linha pode aparecer em mais de um motivo):');
const byTable = new Map();
for (const b of blocked) {
  push(`  ${b.table.padEnd(26)} ${String(b.n).padStart(5)}  ${b.motivo}`);
  byTable.set(b.table, (byTable.get(b.table) ?? 0) + b.n);
}
push();
push('Volume total por arquivo x pendencias somadas (nao deduplicadas):');
const SOURCE_OF = {
  clients: 'Client', negotiations: 'Negociacao', negotiation_services: 'Negociacao',
  client_intakes: 'ClientIntake', contracts: 'Contract', projects: 'Project', tasks: 'Task',
  activities: 'Atividade', accounts_receivable: 'AccountReceivable',
  accounts_payable: 'AccountPayable', suppliers: 'Fornecedor', map_properties: 'PropriedadeMapa',
  collaborator_permissions: 'PermissoesUsuario', access_requests: 'SolicitacaoAcesso',
  task_checklist_items: 'Task',
};
for (const [t, n] of [...byTable.entries()].sort((a, b) => b[1] - a[1])) {
  const src = SOURCE_OF[t];
  push(`  ${t.padEnd(26)} ${String(n).padStart(5)} pendencia(s)  / fonte ${src} tem ${data[src].length} linhas`);
}

console.log(out.join('\n'));
