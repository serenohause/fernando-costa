import type { Tables } from '@/lib/database.types'
import type {
  CostCenter,
  ExpenseCategory,
  FinancialCategoryType,
  FinancialStatus,
  PayablePaymentMethod,
  ReceivablePaymentMethod,
  RecurrenceFrequency,
  RecurrenceStatus,
} from '@/lib/enums'

/*
  LEITURA E ESCRITA SÃO OBJETOS DIFERENTES NESTE MÓDULO, e é a única coisa que
  precisa ficar clara antes de qualquer tela.

  Escrita vai na TABELA (`accounts_receivable`, `accounts_payable`): é lá que
  moram as policies de INSERT/UPDATE/DELETE (migration 0042) e os checks.

  Leitura vem da VIEW (`accounts_receivable_status`, `accounts_payable_status`,
  migration 0043): ela acrescenta `is_overdue` — a regra de "Em atraso", que no
  original está copiada em seis lugares (lista, filtro, cartão, contagem, PDF e
  o desenho da linha) e aqui vive numa função só, `public.is_financial_overdue`.
  A view de pagamentos acrescenta também `generated_count`, a contagem de
  ocorrências de uma recorrência, que no original é um contador que a aplicação
  incrementa e ninguém decrementa.

  Nenhuma tela deste módulo lê da tabela. Ler da tabela é recalcular atraso no
  navegador, que é exatamente o que a 0043 existe para não deixar acontecer.
*/

export type AccountReceivable = Tables<'accounts_receivable'>
export type AccountPayable = Tables<'accounts_payable'>
export type FinancialCategory = Tables<'financial_categories'>

/*
  POR QUE NÃO `Tables<'accounts_receivable_status'>` DIRETO.

  O gerador de tipos marca TODA coluna de view como anulável, porque o Postgres
  não declara nulidade através de uma view. Só que a view é `select r.*, …`: se
  `description` é NOT NULL na tabela, ela é NOT NULL em toda linha que a view
  devolve. Usar o tipo gerado obrigaria a tela a testar nulo em quinze colunas
  que nunca são nulas, e o primeiro `?? '—'` escrito por causa disso viraria
  tratamento de um caso que não existe.

  Então o tipo de leitura é a LINHA DA TABELA mais as colunas calculadas — que é
  o que a view devolve de fato. O `as unknown as` nos hooks é o preço, e está em
  um lugar só, ao lado da consulta.
*/
export type ReceivableView = AccountReceivable & {
  /* Não pago e vencido (migration 0046). Inclui parcela renegociada que venceu
     de novo — decisão do usuário, registrada naquela migration. */
  is_overdue: boolean
}

export type PayableView = AccountPayable & {
  is_overdue: boolean
  /* Quantas ocorrências saíram desta linha-mãe. Zero em despesa avulsa e em
     ocorrência, nunca nulo. */
  generated_count: number
}

/* Cliente, projeto ou contrato como as duas telas os exibem: só o rótulo. */
export type NamedRef = { id: string; name: string }
export type ContractRef = { id: string; contract_number: string }

/*
  A parcela como a tela de Recebíveis a lê.

  Os três `*_name` do base44 (client_name, contract_number, project_name) saíram
  do schema (migration 0041, item 1) e voltam como embed: a lista quer o nome
  ATUAL do cadastro, e no original ele é copiado no momento em que a parcela
  nasce e envelhece sozinho. O nome do relacionamento é o da CONSTRAINT porque
  as FK são compostas `(coluna, tenant_id)` e `clients!inner(...)` não desambigua.

  Os três vêm anuláveis porque as três colunas são anuláveis: recebível avulso
  não tem contrato nem projeto, e pode nem ter cliente do CRM. O original desenha
  esse caso com "Sem cliente" (AccountsReceivable.jsx:529).
*/
export type ReceivableRow = ReceivableView & {
  client: NamedRef | null
  contract: ContractRef | null
  project: NamedRef | null
}

/*
  A despesa como a tela de Pagamentos a lê.

  `supplier_name` NÃO é embed: no original "Fornecedor / Destinatário" é texto
  digitado no formulário, e a tabela de fornecedores só nasce no módulo 8
  (migration 0041). Continua sendo coluna da linha.
*/
export type PayableRow = PayableView & {
  project: NamedRef | null
}

/*
  O que o formulário de recebível edita (AccountReceivableForm.jsx).

  FORA DAQUI:

  - `tenant_id` — vem do claim da sessão, escrito pelo hook. Campo de formulário
    que o escreva é escrita cruzada esperando um bug.
  - `legacy_id` — só a importação preenche.
  - `client_name` / `contract_number` / `project_name` — ver ReceivableRow.

  `installment_number` DIVERGE do original e a divergência está registrada na
  migration 0041 (item 2): lá é o TEXTO "1/12", digitado à mão num campo com
  placeholder "1/4"; aqui são dois smallint. O texto não ordena ("10/12" antes de
  "2/12"), não soma, e é justamente sobre ele que a proteção contra parcela
  duplicada se apoia. O rótulo "3/12" continua existindo, montado na tela.
*/
export type ReceivableInput = {
  description: string
  value: number
  due_date: string

  client_id: string | null
  contract_id: string | null
  project_id: string | null

  installment_number: number | null
  installment_total: number | null

  issue_date: string | null

  status: FinancialStatus
  payment_date: string | null
  /* Sem `direct_debit`: é forma de PAGAR. Check
     `accounts_receivable_payment_method_domain_check`. */
  payment_method: ReceivablePaymentMethod | null
}

/*
  O que o formulário de despesa edita (AccountPayableForm.jsx).

  FORA DAQUI, e cada um por um motivo:

  - `recurrence_parent_id` — quem a escreve é a geração de ocorrências, não o
    formulário. O original também não a oferece; ele só a lê para decidir se
    desabilita o "é recorrente" (linha 232).
  - `generated_count` — deixou de ser coluna (migration 0041, item 3).
  - `responsible_id` / `responsible_name` — declarados na entidade do base44 e
    preenchidos por formulário nenhum (migration 0041, item 7).
  - `receipt_url` — coluna morta, não portada (item 6).

  `competence_month` DIVERGE do original de propósito (item 5): lá é texto
  "MM/YYYY", que ordena errado em qualquer lugar que ordene texto, e o relatório
  mensal é o que esta tela produz. Aqui é `date` presa ao primeiro dia do mês. A
  TELA continua com o campo "MM/YYYY" — quem converte nos dois sentidos é
  `parseCompetenceMonth` / `formatCompetenceMonth`, em schemas.ts.
*/
export type PayableInput = {
  supplier_name: string
  description: string
  category: ExpenseCategory
  value: number
  due_date: string

  project_id: string | null

  status: FinancialStatus
  payment_date: string | null
  /* Sem `cash`: é forma de RECEBER. Check
     `accounts_payable_payment_method_domain_check`. */
  payment_method: PayablePaymentMethod | null

  competence_month: string | null

  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_start_date: string | null
  recurrence_end_date: string | null
  recurrence_count: number | null
  recurrence_status: RecurrenceStatus | null
}

/*
  O cadastro de categorias. ATENÇÃO ao que a migration 0041 registra: NENHUMA
  tela do original lê esta entidade — ela é declarada no base44 e nunca
  consultada, e a categoria que a despesa usa de fato é o enum
  `expense_category`, gravado na própria linha. Não há FK de `accounts_payable`
  para cá, e criar uma seria decidir por conta própria que a categoria da despesa
  deixou de ser enum.

  Ou seja: não existe tela de origem para portar. Os hooks existem porque a
  tabela existe e é o lugar natural do plano de contas; a tela que os consumir é
  decisão do usuário, não deste módulo.
*/
export type FinancialCategoryInput = {
  name: string
  type: FinancialCategoryType
  cost_center: CostCenter | null
}

/*
  O filtro de status das duas telas, na ordem dos botões do original
  (AccountsReceivable.jsx:680-719 e AccountsPayable.jsx:989-1028).

  `pending` é `status <> 'paid'`. O original testa
  `status === 'Previsto' || status === 'Pendente'` ('Pendente' não é valor de
  AccountReceivable.status em lugar nenhum do base44), e com esse teste a parcela
  `renegotiated` que ainda não venceu não aparecia em NENHUM dos três recortes —
  só em "Todos". Corrigido em `applyStatusFilter`, com o mesmo predicado que a
  migration 0046 usa para "Em atraso"; ver o comentário lá.
*/
export type FinancialStatusFilter = 'all' | 'overdue' | 'pending' | 'paid'

/*
  O recorte que as duas telas carregam: um mês, pela data de VENCIMENTO
  (AccountsReceivable.jsx:140-153). `month` é 0-11, como `Date.getMonth()`, que é
  de onde o MonthYearFilter tira o valor.
*/
export type MonthYear = { year: number; month: number }

export type ReceivableFilters = {
  period: MonthYear
  status: FinancialStatusFilter
}

export type PayableFilters = {
  period: MonthYear
  status: FinancialStatusFilter
  /* 'all' = sem recorte. NÃO EXISTE NO ORIGINAL: nenhuma das duas telas filtra
     por categoria (a de pagamentos filtra por mês, texto, status e "só
     recorrentes"). Entra porque foi pedido para a camada de dados; enquanto o
     usuário não decidir, a tela não deve criar o controle. */
  category: ExpenseCategory | 'all'
  /* O botão "Mostrar Recorrentes" (AccountsPayable.jsx:1031-1041), que recorta
     linha-mãe OU ocorrência. */
  recurringOnly: boolean
}

/* Os quatro cartões do topo, na ordem em que o original os desenha. */
export type FinancialSummary = {
  total: number
  paid: number
  pending: number
  overdue: number
}

export type FinancialStatusCounts = Record<FinancialStatusFilter, number>

/* O que `public.generate_contract_installments` devolve (migration 0044). */
export type GeneratedInstallments = {
  contractId: string
  installmentCount: number
  totalValue: number
  firstInstallmentValue: number
  otherInstallmentValue: number
  projectId: string | null
}

/* "Excluir apenas este" ou "este e todos os futuros"
   (DeleteRecurringDialog.jsx). */
export type DeleteRecurringOption = 'single' | 'all_future'
