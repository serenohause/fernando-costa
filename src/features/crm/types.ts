import type { Tables } from '@/lib/database.types'
import type { ClientType, LeadSource } from '@/lib/enums'

export type Client = Tables<'clients'>

/*
  O recorte que a LISTAGEM lê — não o cadastro inteiro.

  A tabela exibe oito campos, e é só isso que sai do banco (ver
  CLIENTS_LIST_COLUMNS em hooks.ts). CPF, data de nascimento, endereços,
  observações e as colunas derivadas ficam para a tela de detalhe, onde o
  cadastro completo é o que se está olhando.

  Tipo próprio, e não `Partial<Client>`: assim o compilador acusa se alguma
  coluna nova for usada na listagem sem ter sido pedida na consulta — que
  apareceria como `undefined` em produção, não como erro.
*/
export type ClientListRow = Pick<
  Client,
  | 'id'
  | 'name'
  | 'client_type'
  | 'email'
  | 'phone'
  | 'address_city'
  | 'address_state'
  | 'address_country'
  | 'lead_source'
>

/*
  O que o formulário de cliente do original edita, já em valores do banco.

  As quatro colunas GERADAS de `clients` — `tax_id_digits`, `email_normalized`,
  `client_key` e `search_text` — não estão aqui de propósito, e não é
  esquecimento: enviá-las no INSERT é erro 428C9 do Postgres. No original elas
  são calculadas em ClientForm.jsx e mandadas no corpo da gravação; desde a
  migration 0015 o banco as calcula, e a camada de dados não pode encostar nelas.
  `clientInputSchema` remove chave desconhecida além disso (Zod strip), então nem
  por engano elas viajam.

  `tenant_id` também não está aqui: vem do JWT do usuário logado, dentro do hook,
  nunca do formulário. O WITH CHECK da policy `clients_insert_crm_editor` recusa
  qualquer outro valor.
*/
export type ClientInput = {
  name: string
  phone: string
  email: string | null
  client_type: ClientType | null
  lead_source: LeadSource | null
  /* Só com lead_source = referral; a tela zera quando a origem muda (0082). */
  referrer_name: string | null
  /* O cliente que indicou, quando quem indicou é cliente do escritório (0087).
     Nulo quando o indicador é de fora — e nunca preenchido sem `referrer_name`. */
  referrer_client_id: string | null

  /* Empresa (0091). Nulos quando o cliente não é Pessoa Jurídica. */
  company_legal_name: string | null
  company_trade_name: string | null
  company_state_registration: string | null
  company_address_zipcode: string | null
  company_address_street: string | null
  company_address_number: string | null
  company_address_complement: string | null
  company_address_district: string | null
  company_address_city: string | null
  company_address_state: string | null
  tax_id: string | null
  birth_date: string | null
  notes: string | null

  /* Residência — cidade, estado e país são not null no banco, como no original. */
  address_zipcode: string | null
  address_street: string | null
  address_number: string | null
  address_district: string | null
  address_complement: string | null
  address_city: string
  address_state: string
  address_country: string

  /* Obra — tudo opcional: existe cliente antes de existir terreno. */
  site_zipcode: string | null
  site_street: string | null
  site_number: string | null
  site_district: string | null
  site_complement: string | null
  site_city: string | null
  site_state: string | null
}

/*
  Qual unicidade barrou a gravação, e quem já ocupa o valor.

  Os dois índices parciais da migration 0015 (`tenant_id, tax_id_digits` e
  `tenant_id, client_key`) devolvem o mesmo SQLSTATE 23505. A distinção importa
  para a tela: a frase muda, e o cliente a mostrar é achado por coluna diferente.
*/
export type DuplicateField = 'tax_id' | 'email' | 'phone'

/* Endereço devolvido pelo ViaCEP, já validado e reduzido ao que o form usa. */
/* O que a consulta de CNPJ devolve ao formulário, já traduzido para os nomes
   das colunas — a tela não fala o vocabulário da API. */
export type CompanyLookup = {
  legalName: string
  tradeName: string
  zipcode: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
  /* Só para exibir; nenhum dos dois é gravado (migration 0091). */
  status: string
  mainActivity: string
}

export type ZipcodeAddress = {
  street: string
  district: string
  city: string
  state: string
}
