import type { Tables } from '@/lib/database.types'
import type {
  BillingType,
  ContractStatus,
  ContractType,
  InstallmentFrequency,
} from '@/lib/enums'

export type Contract = Tables<'contracts'>

/*
  O contrato como a tela o lê: a linha mais o nome ATUAL do cliente.

  `client_name` não existe no schema — a migration 0029 a removeu por ser
  desnormalização pura: a lista quer o nome que está no cadastro hoje. O que
  congela o nome da assinatura é `client_legal_name`, que é outra coluna, com
  outra razão de existir, e continua na linha.

  `client` vem anulável porque `client_id` é anulável (contrato lançado antes de
  o cliente virar cadastro no CRM), e a lista trata esse caso com "Sem cliente",
  como o original.
*/
export type ContractRow = Contract & {
  client: { id: string; name: string } | null
}

/*
  O que o formulário de contrato edita.

  QUATRO COLUNAS FICAM DE FORA DE PROPÓSITO:

  - `installments_generated` — bandeira que quem levanta é o MÓDULO 7, na mesma
    transação que cria as parcelas. Formulário que a escrevesse permitiria dizer
    "já gerei" sem ter gerado nada.
  - `origin` e `referrer_name` — cópia congelada da atribuição comercial, vinda
    da negociação (Negociacoes.jsx:138). O ContractForm.jsx do original também
    não tem esses campos: eles chegam quando a negociação é marcada como ganha.
    Como o UPDATE só manda as colunas deste objeto, editar um contrato não as
    apaga.
  - `display_order` — ordem manual da lista, escrita só pelo arrastar da linha.

  `project_id` NÃO EXISTE na tabela: a ligação foi invertida e quem aponta é
  `projects` (MÓDULO 5), por (id, tenant_id). `project_name` fica e é campo de
  texto digitado, como no original (ContractForm.jsx:228) — não é cópia do nome
  de um projeto que ainda nem existe.

  `file_url` não foi portada: coluna morta, nenhuma tela do original a lê ou
  escreve. O upload do sistema é desenhado uma vez, no MÓDULO 8.
*/
export type ContractInput = {
  contract_number: string
  contract_type: ContractType
  total_value: number
  client_id: string | null
  negotiation_id: string | null
  project_name: string | null
  billing_type: BillingType | null
  status: ContractStatus
  signature_date: string | null
  start_date: string | null
  notes: string | null

  /* Plano de parcelamento acordado. Ou os três, ou nenhum — check da 0029. */
  installment_count: number | null
  first_due_date: string | null
  installment_frequency: InstallmentFrequency | null

  /* Prazos por fase, em dias úteis. Quem os usa é o cronograma do MÓDULO 5. */
  layout_study_days: number | null
  renderings_days: number | null
  legal_permit_days: number | null
  construction_docs_days: number | null
  engineering_docs_days: number | null

  /* Cópia congelada do cliente. CONGELAMENTO, NÃO ESPELHO: é copiada do cadastro
     ao criar o contrato e daí em diante só muda à mão. Ver snapshot.ts. */
  client_legal_name: string | null
  client_tax_id: string | null
  client_birth_date: string | null
  client_email: string | null
  client_address_zipcode: string | null
  client_address_street: string | null
  client_address_number: string | null
  client_address_complement: string | null
  client_address_city: string | null
  client_address_state: string | null

  /* Cópia congelada do local da obra, mesma regra. */
  site_zipcode: string | null
  site_street: string | null
  site_number: string | null
  site_complement: string | null
  site_city: string | null
  site_state: string | null
}
