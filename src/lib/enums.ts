/*
  Fonte única dos rótulos em português.

  O banco guarda o valor em inglês; a tela mostra o rótulo daqui. Nenhum
  componente escreve "Em andamento" à mão — sempre `labelOf(collaboratorRole, value)`
  ou o mapa correspondente.

  O de/para completo com os valores do base44 está em docs/ENUM-MAP.md.
  Este arquivo cobre só os enums do módulo já implementado; cada módulo novo
  acrescenta os seus.
*/

export type LabelMap<T extends string> = Readonly<Record<T, string>>

/** Ordem de exibição em select e filtro. Não é ordem alfabética de propósito. */
export function optionsOf<T extends string>(map: LabelMap<T>) {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }))
}

export function labelOf<T extends string>(map: LabelMap<T>, value: T | null | undefined) {
  if (value == null) return '—'
  return map[value] ?? value
}

// ── Fundação ────────────────────────────────────────────────────────────

export const COLLABORATOR_ROLE = {
  director: 'Diretor',
  coordinator: 'Coordenador',
  admin_staff: 'Administrativo',
  finance: 'Financeiro',
  architect: 'Arquiteto',
  intern: 'Estagiário',
} as const satisfies LabelMap<string>

export type CollaboratorRole = keyof typeof COLLABORATOR_ROLE

export const COLLABORATOR_AREA = {
  commercial: 'Comercial',
  projects: 'Projetos',
  operations: 'Operacional',
  administrative: 'Administrativo',
  finance: 'Financeiro',
} as const satisfies LabelMap<string>

export type CollaboratorArea = keyof typeof COLLABORATOR_AREA

export const COLLABORATOR_STATUS = {
  active: 'Ativo',
  vacation: 'Férias',
  on_leave: 'Afastado',
} as const satisfies LabelMap<string>

export type CollaboratorStatus = keyof typeof COLLABORATOR_STATUS

export const ACCESS_REQUEST_STATUS = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada',
} as const satisfies LabelMap<string>

export type AccessRequestStatus = keyof typeof ACCESS_REQUEST_STATUS

export const TENANT_ROLE = {
  owner: 'Proprietário',
  member: 'Membro',
} as const satisfies LabelMap<string>

export type TenantRole = keyof typeof TENANT_ROLE

// ── CRM ─────────────────────────────────────────────────────────────────

export const CLIENT_TYPE = {
  individual: 'Pessoa Física',
  company: 'Pessoa Jurídica',
} as const satisfies LabelMap<string>

export type ClientType = keyof typeof CLIENT_TYPE

/* Ordem do select de ClientForm.jsx do original, não alfabética. */
export const LEAD_SOURCE = {
  instagram: 'Instagram',
  referral: 'Indicação',
  website: 'Site',
  other: 'Outros',
} as const satisfies LabelMap<string>

export type LeadSource = keyof typeof LEAD_SOURCE

// ── Pipeline ────────────────────────────────────────────────────────────

/* Ordem dos checkboxes de NegociacaoForm.jsx do original, não alfabética. */
export const SERVICE_TYPE = {
  architecture: 'Arquitetura',
  interiors: 'Interiores',
  structural: 'Estrutura',
  plumbing: 'Hidrosanitário',
  electrical: 'Elétrico',
  consulting: 'Consultoria',
} as const satisfies LabelMap<string>

export type ServiceType = keyof typeof SERVICE_TYPE

export const NEGOTIATION_STATUS = {
  active: 'Ativa',
  won: 'Ganha',
  lost: 'Perdida',
} as const satisfies LabelMap<string>

export type NegotiationStatus = keyof typeof NEGOTIATION_STATUS

/* Ordem das colunas do quadro (NegociacaoKanban.jsx), que é a ordem do funil. */
export const FUNNEL_STAGE = {
  lead_received: 'Lead recebido',
  qualified: 'Qualificado',
  proposal_sent: 'Proposta enviada',
  negotiating: 'Em negociação',
  closing: 'Fechamento',
} as const satisfies LabelMap<string>

export type FunnelStage = keyof typeof FUNNEL_STAGE

/*
  SUPERCONJUNTO de LEAD_SOURCE (CRM): o pipeline tem `event` e o CRM não, e os
  quatro valores comuns têm a mesma grafia de propósito — é o que permite a
  conversão `lead_source::text::lead_origin` da migration 0021.
*/
export const LEAD_ORIGIN = {
  instagram: 'Instagram',
  referral: 'Indicação',
  website: 'Site',
  event: 'Evento',
  other: 'Outro',
} as const satisfies LabelMap<string>

export type LeadOrigin = keyof typeof LEAD_ORIGIN

export const LOSS_REASON = {
  price: 'Valor',
  timeline: 'Prazo',
  chose_competitor: 'Escolheu outro escritório',
  postponed: 'Vai adiar o projeto',
  no_response: 'Não respondeu',
  other: 'Outro',
} as const satisfies LabelMap<string>

export type LossReason = keyof typeof LOSS_REASON

export const CLIENT_INTAKE_STATUS = {
  active: 'Ativo',
  expired: 'Expirado',
  submitted: 'Enviado',
} as const satisfies LabelMap<string>

export type ClientIntakeStatus = keyof typeof CLIENT_INTAKE_STATUS

/*
  Coluna de auditoria do link público (`client_intakes.last_validation_status`).
  Não aparece em nenhuma tela hoje — existe para investigar link que "não
  funciona" sem depender do relato de quem tentou. O rótulo vem de
  docs/ENUM-MAP.md, seção Pipeline, e fica aqui para que a primeira tela que
  precisar dele não invente texto novo.
*/
export const CLIENT_INTAKE_VALIDATION_STATUS = {
  created: 'Link criado',
  ok: 'Link aberto',
  expired: 'Link expirado',
  already_submitted: 'Link já utilizado',
  expired_on_submit: 'Expirou antes do envio',
  submitted: 'Enviado com sucesso',
} as const satisfies LabelMap<string>

export type ClientIntakeValidationStatus = keyof typeof CLIENT_INTAKE_VALIDATION_STATUS

// ── Contratos ───────────────────────────────────────────────────────────

/*
  MESMO enum, DOIS rótulos — e os dois são fiéis, cada um no seu lugar.

  Ordem dos selects do original, não alfabética.

  O original escreve "Projeto de Arquitetura" no select de Contrato
  (ContractForm.jsx) e "Arquitetura" no de Projeto (ProjectForm.jsx), para o
  mesmo valor. `docs/ENUM-MAP.md` unifica os DADOS num enum só — isso é sobre a
  importação, não sobre o que a tela mostra. Achatar o rótulo junto trocaria
  texto visível em duas telas para poupar quatro linhas aqui.

  `CONTRACT_TYPE` é o rótulo da tela de contratos; `PROJECT_TYPE` é o da tela de
  projetos (módulo 5). Os valores são os mesmos e o tipo é um só.
*/
export const CONTRACT_TYPE = {
  architecture: 'Projeto de Arquitetura',
  architecture_engineering: 'Projeto de Arquitetura + Complementares',
  architecture_interiors: 'Projeto de Arquitetura + Interiores',
  full: 'Todos',
} as const satisfies LabelMap<string>

export type ContractType = keyof typeof CONTRACT_TYPE

export const PROJECT_TYPE = {
  architecture: 'Arquitetura',
  architecture_engineering: 'Arquitetura + Complementares',
  architecture_interiors: 'Arquitetura + Interiores',
  full: 'Todos',
} as const satisfies LabelMap<ContractType>

export const BILLING_TYPE = {
  by_phase: 'Por Fases',
  monthly_installments: 'Parcelado mensal',
  upfront: 'À vista',
  percent_of_construction: '% sobre obra',
} as const satisfies LabelMap<string>

export type BillingType = keyof typeof BILLING_TYPE

export const CONTRACT_STATUS = {
  negotiating: 'Em negociação',
  approved: 'Aprovado',
  in_progress: 'Em execução',
  completed: 'Concluído',
  terminated: 'Rescindido',
} as const satisfies LabelMap<string>

export type ContractStatus = keyof typeof CONTRACT_STATUS

export const INSTALLMENT_FREQUENCY = {
  monthly: 'Mensal',
  biweekly: 'Quinzenal',
  weekly: 'Semanal',
  single: 'Única',
} as const satisfies LabelMap<string>

export type InstallmentFrequency = keyof typeof INSTALLMENT_FREQUENCY

// ── Projetos ────────────────────────────────────────────────────────────

/* Ordem do select de ProjectForm.jsx do original, não alfabética. */
export const PROJECT_STATUS = {
  prospecting: 'Prospecção',
  under_contract: 'Em contrato',
  in_development: 'Em desenvolvimento',
  in_approval: 'Em aprovação',
  completed: 'Concluído',
  suspended: 'Suspenso',
} as const satisfies LabelMap<string>

export type ProjectStatus = keyof typeof PROJECT_STATUS

/*
  UM enum, DOIS usos (migration 0031). `projects.current_phase` aceita os doze
  valores; `tasks.phase` aceita onze — `finished` é barrado por check na tabela.

  A ordem é a das colunas do kanban do original (TaskKanban.jsx:21-34), e não a
  ordem de percentual: `awaiting_client` vem entre `building_permit` e
  `finished` na tela, mesmo não tendo percentual próprio na view.
*/
export const PROJECT_PHASE = {
  not_started: 'Não iniciado',
  briefing: 'Briefing',
  layout: 'Layout',
  renderings: 'Perspectivas',
  revision: 'Revisão',
  legal_permit: 'Projeto Legal',
  hoa_approval: 'Aprovação Condomínio',
  construction_docs: 'Projeto Executivo',
  engineering_docs: 'Projetos Complementares',
  building_permit: 'Alvará de Construção',
  awaiting_client: 'Aguardando Cliente',
  finished: 'Finalizado',
} as const satisfies LabelMap<string>

export type ProjectPhase = keyof typeof PROJECT_PHASE

/* O recorte que `tasks_phase_not_finished_check` cobra do banco. */
export type TaskPhase = Exclude<ProjectPhase, 'finished'>

// ── Tarefas ─────────────────────────────────────────────────────────────

/*
  Enum compartilhado por `tasks.priority` (módulo 5) e `activities.priority`
  (módulo 6). A ordem é a de `activity_priority` em docs/ENUM-MAP.md.
*/
export const PRIORITY_LEVEL = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
} as const satisfies LabelMap<string>

export type PriorityLevel = keyof typeof PRIORITY_LEVEL

/* `urgent` só existe em Atividade, e `tasks_priority_not_urgent_check` o barra. */
export type TaskPriority = Exclude<PriorityLevel, 'urgent'>

/*
  MESMO enum, OUTRA ordem — e a ordem é o que está na tela. O select de
  TaskForm.jsx lista Alta, Média, Baixa (linhas 188-190), de cima para baixo;
  o de Atividade lista do menor para o maior. `optionsOf` respeita a ordem de
  declaração, então cada tela pede o mapa dela. Mesmo precedente de
  CONTRACT_TYPE / PROJECT_TYPE.
*/
export const TASK_PRIORITY = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
} as const satisfies LabelMap<TaskPriority>

/*
  O original escreve "Não iniciado" para tarefa e "Não iniciada" para atividade
  — a mesma coisa em dois gêneros. docs/ENUM-MAP.md unifica no feminino, e é o
  rótulo que as duas telas passam a usar.
*/
export const WORK_STATUS = {
  not_started: 'Não iniciada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
} as const satisfies LabelMap<string>

export type WorkStatus = keyof typeof WORK_STATUS

export const TASK_TYPE = {
  technical: 'Técnica',
  meeting: 'Reunião',
  review: 'Revisão',
  administrative: 'Administrativo',
} as const satisfies LabelMap<string>

export type TaskType = keyof typeof TASK_TYPE

// ── Financeiro ──────────────────────────────────────────────────────────

/*
  Ordem do select de AccountReceivableForm.jsx / AccountPayableForm.jsx, que é a
  mesma nos dois.

  "Em atraso" É a quarta opção daqueles selects e NÃO entra aqui: ela nunca foi
  valor gravável (migration 0040) — é estado derivado, que vem da coluna
  `is_overdue` das views. A tela mostra o rótulo "Em atraso" no lugar do status
  quando `is_overdue` é verdadeiro, que é o que o original faz ao desenhar a
  linha (AccountsReceivable.jsx:565). O que se perde é a possibilidade de
  ESCOLHER "Em atraso" no formulário — escolha que no original grava um status
  que a própria tela ignora ao desenhar.
*/
export const FINANCIAL_STATUS = {
  forecast: 'Previsto',
  paid: 'Pago',
  renegotiated: 'Negociado',
} as const satisfies LabelMap<string>

export type FinancialStatus = keyof typeof FINANCIAL_STATUS

/*
  UM enum no banco, DUAS listas na tela — e as duas listas do original são
  diferentes de propósito: a de receber termina em "Espécie" e a de pagar em
  "Débito automático" (migration 0040). Os checks
  `accounts_receivable_payment_method_domain_check` e
  `accounts_payable_payment_method_domain_check` cobram isso do banco.

  Mesmo precedente de CONTRACT_TYPE / PROJECT_TYPE: cada tela pede o seu mapa, e
  `optionsOf` respeita a ordem de declaração.
*/
export const PAYMENT_METHOD = {
  pix: 'PIX',
  boleto: 'Boleto',
  card: 'Cartão',
  ted: 'TED',
  cash: 'Espécie',
  direct_debit: 'Débito automático',
} as const satisfies LabelMap<string>

export type PaymentMethod = keyof typeof PAYMENT_METHOD

export type ReceivablePaymentMethod = Exclude<PaymentMethod, 'direct_debit'>
export type PayablePaymentMethod = Exclude<PaymentMethod, 'cash'>

/* A lista da tela de RECEBER (AccountReceivableForm.jsx:393-398). */
export const RECEIVABLE_PAYMENT_METHOD = {
  pix: 'PIX',
  boleto: 'Boleto',
  card: 'Cartão',
  ted: 'TED',
  cash: 'Espécie',
} as const satisfies LabelMap<ReceivablePaymentMethod>

/* A lista da tela de PAGAR (AccountPayableForm.jsx:348-352). */
export const PAYABLE_PAYMENT_METHOD = {
  pix: 'PIX',
  boleto: 'Boleto',
  card: 'Cartão',
  ted: 'TED',
  direct_debit: 'Débito automático',
} as const satisfies LabelMap<PayablePaymentMethod>

/* Ordem do select de categoria de AccountPayableForm.jsx:144-153. */
export const EXPENSE_CATEGORY = {
  payroll: 'Folha',
  taxes: 'Impostos',
  office: 'Escritório',
  software: 'Softwares',
  marketing: 'Marketing',
  travel: 'Viagens',
  contractors: 'Prestadores',
  materials: 'Materiais',
  equipment: 'Equipamentos',
  other: 'Outros',
} as const satisfies LabelMap<string>

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORY

export const RECURRENCE_FREQUENCY = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
} as const satisfies LabelMap<string>

export type RecurrenceFrequency = keyof typeof RECURRENCE_FREQUENCY

/*
  MESMO enum, outro texto — e o outro texto é o que está no SELECT do original
  (AccountPayableForm.jsx:254-258), com o intervalo entre parênteses. Fora do
  select — no crachá da linha, no PDF — o original escreve só "Bimestral", que é
  RECURRENCE_FREQUENCY acima. Achatar os dois num mapa só trocaria microcopy
  visível em uma das duas telas.
*/
export const RECURRENCE_FREQUENCY_OPTION = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral (a cada 2 meses)',
  quarterly: 'Trimestral (a cada 3 meses)',
  semiannual: 'Semestral (a cada 6 meses)',
  annual: 'Anual',
} as const satisfies LabelMap<RecurrenceFrequency>

export const RECURRENCE_STATUS = {
  active: 'Ativa',
  paused: 'Pausada',
  ended: 'Encerrada',
} as const satisfies LabelMap<string>

export type RecurrenceStatus = keyof typeof RECURRENCE_STATUS

export const FINANCIAL_CATEGORY_TYPE = {
  revenue: 'Receita',
  expense: 'Despesa',
} as const satisfies LabelMap<string>

export type FinancialCategoryType = keyof typeof FINANCIAL_CATEGORY_TYPE

export const COST_CENTER = {
  architecture: 'Arquitetura',
  interiors: 'Interiores',
  construction: 'Obra',
  mentoring: 'Mentoria',
  administrative: 'Administrativo',
} as const satisfies LabelMap<string>

export type CostCenter = keyof typeof COST_CENTER

/*
  Funções que enxergam apenas as próprias atividades. Vem do Layout.jsx do
  original, que redireciona Arquiteto e Estagiário para MinhasAtividades e
  bloqueia dashboards e financeiro para eles.
*/
export const INDIVIDUAL_CONTRIBUTOR_ROLES: readonly CollaboratorRole[] = [
  'architect',
  'intern',
]
