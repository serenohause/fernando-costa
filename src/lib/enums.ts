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
  UM enum, DOIS usos (migration 0031). `projects.current_phase` aceita os treze
  valores; `tasks.phase` aceita doze — `finished` é barrado por check na tabela.

  A ordem é a das colunas do kanban do original (TaskKanban.jsx:21-34), e não a
  ordem de percentual: `awaiting_client` vem entre `under_construction` e
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
  /*
    ENTROU NA MIGRATION 0061, vinda da importação: 14 tarefas do escritório estão
    em "Em Obra" e nenhum dos treze valores anteriores significava isso
    (`building_permit` é o ALVARÁ, não a obra). O rótulo é o de docs/ENUM-MAP.md.

    A POSIÇÃO É PARTE DO DADO, não arrumação: aqui, DEPOIS de `building_permit` e
    ANTES de `awaiting_client`, é onde a 0061 a pôs no tipo do Postgres, é a
    coluna dela no kanban e é o degrau dela em `PHASE_ORDER` / `phaseIndex`
    (src/features/projects/project-phase.ts). Obra vem depois do alvará.

    VALE 100 na escala de `project_progress`, desde a migration 0075. A 0061
    deixou o percentual em aberto de propósito (inventar um número mudaria o
    progresso de 14 projetos com base em palpite); a versão nova do base44
    declara `'Em Obra': 100` e resolveu a dúvida. Antes disso, tarefa em obra
    caía no `NULL` do `CASE` e o projeto exibia 0%.
  */
  under_construction: 'Em Obra',
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

  Os quatro marcados abaixo NÃO valem para fornecedor CADASTRADO PELA TELA:
  `suppliers_category_domain_check` (migration 0049) os barra, como `tasks.phase`
  barra `finished`. Quem monta select de fornecedor usa `SUPPLIER_TYPOLOGY`, logo
  abaixo.

  A MIGRATION 0063 ABRIU UMA EXCEÇÃO QUE ACOMPANHA A LINHA, e não a operação: o
  check passou a ser `não é uma das quatro OU legacy_id não é nulo`, porque 1
  fornecedor do base44 está cadastrado como "Revestimento de Fachada" — tipologia
  real, cuja troca por "Outros" apagaria um fato. `SupplierTypology` e
  `SUPPLIER_TYPOLOGY` continuam sendo os 19, porque a lista OFERECIDA não mudou;
  quem carrega de volta o valor já gravado é `typologyOptionsFor`
  (src/features/suppliers/components/SupplierForm.tsx).
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

/* O recorte que `suppliers_category_domain_check` cobra de toda linha que NASCE
   nesta aplicação. Fornecedor importado do base44 pode carregar um dos quatro
   (migration 0063) — ver o comentário acima. */
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

// ── Diário do Projeto ───────────────────────────────────────────────────

/*
  Os rótulos de `diary_entry_type` (migration 0068), na ordem em que a versão
  nova os oferece no formulário (DiaryEntryForm.jsx:24-34) — que é a mesma ordem
  do enum.

  `system` ENTRA NO MAPA e NÃO entra na lista do formulário: ele é reservado ao
  registro automático, e a policy de INSERT da 0070 recusa `is_automatic`, ou
  seja, ninguém escolhe esse tipo. Ele precisa de rótulo mesmo assim porque a
  linha do tempo desenha o crachá de todo registro, e a única coisa que os
  distingue é o tipo.
*/
export const DIARY_ENTRY_TYPE = {
  client_request: 'Solicitação do Cliente',
  project_change: 'Alteração de Projeto',
  decision: 'Decisão',
  meeting: 'Reunião',
  approval: 'Aprovação',
  correction: 'Correção',
  delivery: 'Entrega',
  note: 'Observação',
  other: 'Outro',
  system: 'Sistema',
} as const satisfies LabelMap<string>

export type DiaryEntryType = keyof typeof DIARY_ENTRY_TYPE

/*
  O tipo de um registro DIGITADO. Recorte derivado do mapa acima, e não segunda
  lista escrita à mão: duas listas de tipo são duas chances de o formulário
  oferecer um valor que a linha do tempo não sabe desenhar.

  É também o recorte do FILTRO da aba Timeline: `ALL_TYPES`
  (ProjectDiaryDrawer.jsx:60) tem os nove manuais e não tem "Sistema" — filtrar
  por tipo nunca seleciona evento automático, e "Todos" continua mostrando tudo.
*/
export type DiaryManualEntryType = Exclude<DiaryEntryType, 'system'>

export const MANUAL_DIARY_ENTRY_TYPES = (
  Object.keys(DIARY_ENTRY_TYPE) as DiaryEntryType[]
).filter((type): type is DiaryManualEntryType => type !== 'system')

export const DIARY_ENTRY_STATUS = {
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
} as const satisfies LabelMap<string>

export type DiaryEntryStatus = keyof typeof DIARY_ENTRY_STATUS

/*
  A VISIBILIDADE, com o rótulo LONGO do original.

  DiaryEntryForm.jsx:224-225 escreve a explicação dentro da própria opção do
  select ("🔒 Interno (não aparece no relatório para cliente)"), e é o único
  lugar do sistema em que o campo aparece — nenhuma tela mostra a visibilidade
  do registro depois de gravado. Então o rótulo daqui é o texto da opção, tal e
  qual; um mapa curto "Interno/Cliente" seria rótulo que tela nenhuma usa.

  Quem lê isto ao escrever o relatório da fatia 4: o filtro fiel do relatório
  externo é `visibility = client OR is_automatic` (RelatorioPDFModal.jsx:45), e
  não `visibility = client` — está no COMMENT do enum na migration 0068.
*/
export const DIARY_VISIBILITY = {
  internal: '🔒 Interno (não aparece no relatório para cliente)',
  client: '🤝 Cliente (pode aparecer no relatório externo)',
} as const satisfies LabelMap<string>

export type DiaryVisibility = keyof typeof DIARY_VISIBILITY

/*
  `diary_file_kind` ENTRA SEM MAPA DE RÓTULO, pelo mesmo motivo de
  `geocode_status`: tela nenhuma exibe o valor. Ele é o discriminador que separa
  a foto do anexo — o que no base44 era o NOME do array (`fotos` vs
  `anexos`/`arquivos`) e que virou coluna quando as três listas viraram uma
  tabela só (migration 0068).

  Quem o lê são a fita de miniaturas, a galeria e o clipe de papel, e o que eles
  fazem com ele é escolher ONDE desenhar o arquivo, não escrever um rótulo.
  Inventar "Foto / Anexo" aqui seria criar texto de tela que o de/para não pediu.
*/
export type DiaryFileKind = Enums<'diary_file_kind'>

/*
  A VISITA À OBRA (migration 0068), na ordem em que SiteVisitForm.jsx:13 e :14 as
  oferece — que é a ordem do enum, e é também a ordem dos dois filtros do topo da
  aba Obra (ObraTab.jsx:211 e :220).
*/
export const SITE_VISIT_TYPE = {
  follow_up: 'Acompanhamento',
  verification: 'Conferência',
  inspection: 'Fiscalização',
  meeting: 'Reunião',
  measurement: 'Medição',
  correction: 'Correção',
  delivery: 'Entrega',
  survey: 'Vistoria',
  other: 'Outro',
} as const satisfies LabelMap<string>

export type SiteVisitType = keyof typeof SITE_VISIT_TYPE

/*
  O RESULTADO DA VISITA. `with_issues` é o valor que abre o formulário de
  pendência vinculada assim que a visita é salva (ObraTab.jsx:77) — o fluxo que
  esta fatia precisa preservar, e que o COMMENT do enum na 0068 registra.
*/
export const SITE_VISIT_STATUS = {
  no_issues: 'Sem pendências',
  with_issues: 'Com pendências',
  awaiting_execution: 'Aguardando execução',
  resolved: 'Resolvido',
} as const satisfies LabelMap<string>

export type SiteVisitStatus = keyof typeof SITE_VISIT_STATUS

/*
  A CATEGORIA DA PENDÊNCIA (IssueForm.jsx:13), que é também a lista do filtro da
  aba Pendências (PendenciasTab.jsx:157).

  NÃO É `SUPPLIER_CATEGORY`, apesar de "Marcenaria", "Esquadrias" e "Iluminação"
  aparecerem nas duas: lá a lista descreve o que um FORNECEDOR vende, aqui a
  disciplina de uma pendência de obra. Enum separado por decisão da migration
  0068 — as listas só se parecem em parte.
*/
export const PROJECT_ISSUE_CATEGORY = {
  architecture: 'Arquitetura',
  interiors: 'Interiores',
  joinery: 'Marcenaria',
  frames: 'Esquadrias',
  electrical: 'Elétrica',
  plumbing: 'Hidráulica',
  lighting: 'Iluminação',
  structural: 'Estrutura',
  landscaping: 'Paisagismo',
  finishing: 'Acabamento',
  other: 'Outro',
} as const satisfies LabelMap<string>

export type ProjectIssueCategory = keyof typeof PROJECT_ISSUE_CATEGORY

/*
  A SITUAÇÃO DA PENDÊNCIA (IssueForm.jsx:14), na ordem dos chips de filtro
  rápido da aba (PendenciasTab.jsx:139).

  `resolved` é o único valor que exige `resolved_at`, e a igualdade vale nos dois
  sentidos (check de `project_issues`, migration 0069) — por isso quem grava o
  status resolve as duas colunas junto, dentro do hook.
*/
export const PROJECT_ISSUE_STATUS = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  resolved: 'Resolvida',
  cancelled: 'Cancelada',
} as const satisfies LabelMap<string>

export type ProjectIssueStatus = keyof typeof PROJECT_ISSUE_STATUS

/*
  A FRASE DE CADA LINHA DO HISTÓRICO DA PENDÊNCIA.

  No base44 este texto é gravado DENTRO do array `historico`
  (PendenciasTab.jsx:45/85/103), e é por isso que ele está aqui: copy de tela
  dentro do banco envelhece no primeiro ajuste de texto e leva junto o histórico
  já gravado (COMMENT de `project_issue_events.event_type`, migration 0069). O
  banco guarda o TIPO do evento; a frase é desta tabela.

  As três primeiras são as do original, palavra por palavra. `status_changed`,
  `reopened` e `cancelled` não existem lá — o histórico daqui é escrito por
  trigger e enxerga toda mudança de status, inclusive a que reabre uma pendência
  já resolvida.
*/
export const PROJECT_ISSUE_EVENT_TYPE = {
  created: 'Pendência criada.',
  updated: 'Pendência atualizada.',
  status_changed: 'Status alterado.',
  resolved: 'Pendência resolvida.',
  reopened: 'Pendência reaberta.',
  cancelled: 'Pendência cancelada.',
} as const satisfies LabelMap<string>

export type ProjectIssueEventType = keyof typeof PROJECT_ISSUE_EVENT_TYPE

/*
  O STATUS OPERACIONAL DA TAREFA (migrations 0068 e 0074), com os rótulos que a
  versão nova escreve à mão em três lugares — o item do submenu, o crachá do
  cartão e o texto do evento automático (TaskKanban.jsx:545/566 e
  diaryAutoEvents.js:65/76). Lá o valor gravado JÁ É o rótulo; aqui a coluna
  guarda `in_review` e o texto vem daqui.

  NÃO É STATUS NEM FASE, e é por isso que ele não reusa `work_status`: é a
  terceira coisa — "parada esperando alguém" —, e "Em Revisão" dentro de
  `work_status` significaria coisa diferente em `tasks`, em `activities` e em
  `project_checklist_items`, que compartilham aquele enum.

  O MAPA NÃO TEM VALOR PARA "SEM TAG": a ausência é nula na coluna e é o caso
  normal (13 tags em 130 tarefas), o crachá não desenha nada, e o item "Sem
  status" do submenu é copy do menu, não rótulo de valor.

  SEM RECORTE DE FASE AQUI: quais colunas oferecem qual tag é oferta de tela e
  vive em `src/features/projects/flow.ts`, junto do resto da decisão do quadro.
*/
export const OPERATIONAL_TAG = {
  in_review: 'Em Revisão',
  awaiting_client: 'Aguardando Cliente',
} as const satisfies LabelMap<Enums<'operational_tag'>>

export type OperationalTag = keyof typeof OPERATIONAL_TAG

/*
  Funções que enxergam apenas as próprias atividades. Vem do Layout.jsx do
  original, que redireciona Arquiteto e Estagiário para MinhasAtividades e
  bloqueia dashboards e financeiro para eles.
*/
export const INDIVIDUAL_CONTRIBUTOR_ROLES: readonly CollaboratorRole[] = [
  'architect',
  'intern',
]
