/*
  Fonte única dos rótulos em português.

  O banco guarda o valor em inglês; a tela mostra o rótulo daqui. Nenhum
  componente escreve "Em andamento" à mão — sempre `labelOf(collaboratorRole, value)`
  ou o mapa correspondente.

  O de/para completo com os valores do base44 está em docs/ENUM-MAP.md.
  Este arquivo cobre só os enums do módulo já implementado; cada módulo novo
  acrescenta os seus.
*/

import type { Enums } from './database.types'

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
  /*
    ENTROU NA MIGRATION 0048, e só existe para o checklist de orçamento
    (`budget_checklists.project_phase`). Fica NO FIM do mapa de propósito: a
    ordem de declaração é a ordem das colunas do kanban e a base de `PHASE_ORDER`
    / `phaseIndex` (src/features/projects/project-phase.ts) — pôr o valor no meio
    mudaria qual fase é "mais avançada" no fluxo de tarefas.

    Nem projeto nem tarefa aceitam este valor: `projects_current_phase_domain_check`
    e `tasks_phase_no_post_approval_check` (migration 0049) o barram no banco, e
    `TaskPhase` / `TASK_PHASE_VALUES` o barram antes de gravar. O rótulo existe
    porque o checklist de orçamento o mostra, e porque `labelOf` sobre uma coluna
    `project_phase` precisa saber traduzir tudo que a coluna pode conter.
  */
  post_approval: 'Pós-aprovação',
} as const satisfies LabelMap<string>

export type ProjectPhase = keyof typeof PROJECT_PHASE

/* Os dois recortes que `tasks_phase_not_finished_check` (0032) e
   `tasks_phase_no_post_approval_check` (0049) cobram do banco. */
export type TaskPhase = Exclude<ProjectPhase, 'finished' | 'post_approval'>

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

// ── Fornecedores ────────────────────────────────────────────────────────

/*
  UM enum, DOIS usos — `suppliers.category` (a "tipologia" do fornecedor) e
  `budget_checklist_items.category` (a categoria do item de orçamento). O
  compartilhamento é o que permite a sugestão de fornecedor por categoria do
  original (`f.tipologia === form.categoria`, ItemOrcamentoForm.jsx:45).

  A ordem é a do formulário de ITEM (ItemOrcamentoForm.jsx:11-19), que é a lista
  com os 23 valores — a mesma de docs/ENUM-MAP.md.

  Os quatro marcados abaixo NÃO valem para fornecedor: `suppliers_category_domain_check`
  (migration 0049) os barra, como `tasks.phase` barra `finished`. Quem monta
  select de fornecedor usa `SUPPLIER_TYPOLOGY`, logo abaixo.
*/
export const SUPPLIER_CATEGORY = {
  ceramics_porcelain: 'Cerâmica e Porcelanato',
  fixtures_sanitaryware: 'Metais e Louças',
  natural_stone: 'Pedras Naturais',
  indoor_lighting: 'Iluminação Interna',
  outdoor_lighting: 'Iluminação Externa e Paisagismo',
  frames_openings: 'Esquadrias',
  /* † só item de orçamento */ facade_cladding: 'Revestimento de Fachada',
  /* † só item de orçamento */ pool_cladding: 'Revestimento de Piscina',
  home_automation: 'Automação Residencial',
  solar_energy: 'Energia Solar',
  paint_texture: 'Tintas e Texturas',
  landscaping: 'Paisagismo',
  cabinetry: 'Marcenaria',
  wood: 'Madeira',
  structure_foundation: 'Estrutura e Fundação',
  /* † só item de orçamento */ waterproofing: 'Impermeabilização',
  /* † só item de orçamento */ drywall_plaster: 'Gesso e Drywall',
  electrical_plumbing: 'Elétrica e Hidráulica',
  hvac: 'Climatização',
  glass_mirrors: 'Vidros e Espelhos',
  elevators: 'Elevadores',
  pool_equipment: 'Bombas e Filtros de Piscina',
  other: 'Outros',
} as const satisfies LabelMap<string>

export type SupplierCategory = keyof typeof SUPPLIER_CATEGORY

/* O recorte que `suppliers_category_domain_check` cobra do banco. */
export type SupplierTypology = Exclude<
  SupplierCategory,
  'facade_cladding' | 'pool_cladding' | 'waterproofing' | 'drywall_plaster'
>

/*
  A lista de tipologia do formulário de FORNECEDOR (FornecedorForm.jsx:11-18):
  os 19 valores que a entidade aceita, na mesma ordem relativa do mapa acima.

  É TAMBÉM a lista do FILTRO da tela de Fornecedores. O original oferece ali uma
  TERCEIRA lista, com 20 valores (Fornecedores.jsx:27) — ela inclui os quatro †,
  que fornecedor nenhum pode ter e portanto filtram sempre vazio, e esconde
  Madeira, Elevadores e Bombas e Filtros de Piscina, que existem no cadastro e
  ficam inalcançáveis pelo filtro. Nenhum mapa foi criado para essa lista; o
  motivo de não reproduzi-la está em Suppliers.tsx.
*/
export const SUPPLIER_TYPOLOGY = {
  ceramics_porcelain: 'Cerâmica e Porcelanato',
  fixtures_sanitaryware: 'Metais e Louças',
  natural_stone: 'Pedras Naturais',
  indoor_lighting: 'Iluminação Interna',
  outdoor_lighting: 'Iluminação Externa e Paisagismo',
  frames_openings: 'Esquadrias',
  home_automation: 'Automação Residencial',
  solar_energy: 'Energia Solar',
  paint_texture: 'Tintas e Texturas',
  landscaping: 'Paisagismo',
  cabinetry: 'Marcenaria',
  wood: 'Madeira',
  structure_foundation: 'Estrutura e Fundação',
  electrical_plumbing: 'Elétrica e Hidráulica',
  hvac: 'Climatização',
  glass_mirrors: 'Vidros e Espelhos',
  elevators: 'Elevadores',
  pool_equipment: 'Bombas e Filtros de Piscina',
  other: 'Outros',
} as const satisfies LabelMap<SupplierTypology>

export const PARTNERSHIP_MODEL = {
  sales_commission: 'Comissão sobre venda',
  price_discount: 'Desconto no preço',
  commission_and_discount: 'Comissão + Desconto',
  spec_exclusivity: 'Exclusividade de especificação',
  none: 'Sem parceria formal',
} as const satisfies LabelMap<string>

export type PartnershipModel = keyof typeof PARTNERSHIP_MODEL

/*
  Nenhuma tela do original preenche este campo — ele só aparece no drawer
  (FornecedorDrawer.jsx:92) e no que a importação trouxer. O mapa existe para que
  o primeiro formulário que ganhar o campo não invente texto novo.
*/
export const COMMISSION_PAYMENT_TERM = {
  on_delivery: 'Na entrega do material',
  net_30_after_delivery: '30 dias após entrega',
  net_60_after_delivery: '60 dias após entrega',
  after_client_payment: 'Após pagamento do cliente',
  to_be_agreed: 'A combinar',
} as const satisfies LabelMap<string>

export type CommissionPaymentTerm = keyof typeof COMMISSION_PAYMENT_TERM

/* Ordem do select de FornecedorForm.jsx:86-89, que é a mesma do filtro. */
export const PARTNERSHIP_TIER = {
  strategic: 'Estratégico',
  preferred: 'Preferencial',
  registered: 'Cadastrado',
  under_evaluation: 'Em avaliação',
} as const satisfies LabelMap<string>

export type PartnershipTier = keyof typeof PARTNERSHIP_TIER

export const SUPPLIER_STATUS = {
  active: 'Ativo',
  inactive: 'Inativo',
  negotiating: 'Em negociação',
} as const satisfies LabelMap<string>

export type SupplierStatus = keyof typeof SUPPLIER_STATUS

// ── Orçamento por cliente ───────────────────────────────────────────────

/* Ordem do filtro de OrcamentoCliente.jsx:150-154 e do select do cabeçalho do
   detalhe (ChecklistDetalhe.jsx:119-123), que são a mesma. */
export const BUDGET_CHECKLIST_STATUS = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  awaiting_client: 'Aguardando cliente',
  completed: 'Concluído',
  cancelled: 'Cancelado',
} as const satisfies LabelMap<string>

export type BudgetChecklistStatus = keyof typeof BUDGET_CHECKLIST_STATUS

/*
  Ordem do select de ItemOrcamentoForm.jsx:118-123. É este status, e não o campo
  `concluido` da entidade (não portado), que mede o progresso do checklist:
  `approved` e `cancelled` contam como finalizados — a conta vive na view
  `budget_checklist_totals` (migration 0051), não aqui.
*/
export const BUDGET_ITEM_STATUS = {
  pending: 'Pendente',
  quoting: 'Em cotação',
  quoted: 'Cotado',
  presented_to_client: 'Apresentado ao cliente',
  approved: 'Aprovado',
  cancelled: 'Cancelado',
} as const satisfies LabelMap<string>

export type BudgetItemStatus = keyof typeof BUDGET_ITEM_STATUS

/*
  O recorte de `project_phase` que `budget_checklists_project_phase_domain_check`
  (migration 0049) cobra, na ordem dos selects do original (ChecklistForm.jsx:107-110
  e OrcamentoCliente.jsx:170-173).

  Mapa próprio, e não `PROJECT_PHASE` inteiro: o checklist oferece QUATRO fases, e
  reaproveitar o mapa de doze colocaria "Briefing" e "Alvará de Construção" num
  select que o original nunca teve.
*/
export type BudgetProjectPhase = Extract<
  ProjectPhase,
  'renderings' | 'construction_docs' | 'engineering_docs' | 'post_approval'
>

export const BUDGET_PROJECT_PHASE = {
  renderings: 'Perspectivas',
  construction_docs: 'Projeto Executivo',
  engineering_docs: 'Projetos Complementares',
  post_approval: 'Pós-aprovação',
} as const satisfies LabelMap<BudgetProjectPhase>

/*
  MESMO enum `priority_level`, OUTRA ordem — a do select do item de orçamento
  (ItemOrcamentoForm.jsx:156-159), do mais urgente para o menos. Mesmo precedente
  de TASK_PRIORITY: `optionsOf` respeita a ordem de declaração, e cada tela pede
  o mapa dela. Aqui os QUATRO valores valem, inclusive `urgent`.
*/
export const BUDGET_ITEM_PRIORITY = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
} as const satisfies LabelMap<PriorityLevel>

// ── Mapa ────────────────────────────────────────────────────────────────

/*
  Status exibido no marcador de um pino SEM projeto vinculado. A ordem é a do
  select do formulário de propriedade (ProjectForm.jsx:365-368).

  NÃO É `PROJECT_STATUS`, apesar de dois rótulos coincidirem: "Pausado" aqui é
  "Suspenso" lá, e o mapa lê o status do PROJETO quando há vínculo, caindo neste
  enum só quando não há (MapaProjetos.jsx:287). Enum separado de propósito —
  docs/ENUM-MAP.md, seção "Mapa".
*/
export const MAP_VISUAL_STATUS = {
  not_started: 'Não iniciado',
  in_development: 'Em desenvolvimento',
  paused: 'Pausado',
  completed: 'Concluído',
} as const satisfies LabelMap<string>

export type MapVisualStatus = keyof typeof MAP_VISUAL_STATUS

/*
  `geocode_status` ENTRA SEM MAPA DE RÓTULO, e isso é a fidelidade ao de/para,
  não esquecimento: docs/ENUM-MAP.md declara este enum com duas colunas (base44 e
  Postgres) e nenhuma de "Rótulo UI", ao contrário de todos os outros. O motivo
  está lá — tela nenhuma do original exibe o campo. `geocoding.jsx` o escreve
  (`OK`/`FAILED`) e o formulário de projeto mostra só a coordenada que resultou
  dele (ProjectForm.jsx:666).

  O tipo existe porque o hook de geocodificação precisa nomear o valor que grava.
  Inventar "Pendente / Concluído / Falhou" aqui seria criar texto de tela que o
  de/para não aprovou — e o primeiro lugar a exibir o campo é quem tem que pedir
  o rótulo ao usuário.
*/
export type GeocodeStatus = Enums<'geocode_status'>

/*
  Funções que enxergam apenas as próprias atividades. Vem do Layout.jsx do
  original, que redireciona Arquiteto e Estagiário para MinhasAtividades e
  bloqueia dashboards e financeiro para eles.
*/
export const INDIVIDUAL_CONTRIBUTOR_ROLES: readonly CollaboratorRole[] = [
  'architect',
  'intern',
]
