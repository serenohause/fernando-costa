import type { Tables } from '@/lib/database.types'
import type {
  ClientType,
  FunnelStage,
  LeadOrigin,
  LossReason,
  NegotiationStatus,
} from '@/lib/enums'

export type Negotiation = Tables<'negotiations'>
export type ClientIntake = Tables<'client_intakes'>

/*
  A negociação como a tela a lê: a linha mais os três embeds.

  As desnormalizações do base44 (`cliente_name`, `cliente_cidade`,
  `cliente_estado`, `responsavel_comercial_name`) não existem no schema — a
  migration 0022 as tirou de propósito, porque o funil quer o nome ATUAL do
  cliente, não o que valia quando a negociação entrou. Elas voltam como join,
  em UMA consulta, e não como a lista inteira de clientes baixada em paralelo
  (que é como o original resolve).

  `owner` aparece anulável porque é assim que o PostgREST tipa qualquer embed —
  e desde a migration 0064 ele TAMBÉM vem nulo de verdade: `commercial_owner_id`
  deixou de ser NOT NULL para que as 15 negociações do base44 cujo responsável
  não está no export de Collaborator pudessem entrar. Nulo ali diz "o responsável
  não está mais cadastrado". A tela já tratava o nulo (`-` na coluna
  Responsável), e é esse o tratamento que vale.

  `client.address_city` e `client.address_state` viraram anuláveis pelo mesmo
  motivo, na mesma migration: 1 cliente do base44 não tem endereço nenhum
  preenchido. A célula de cidade já lida com os dois vazios — mostra "-", que é
  o que o original mostra em campo vazio.
*/
export type NegotiationRow = Negotiation & {
  client: {
    id: string
    name: string
    address_city: string | null
    address_state: string | null
  } | null
  owner: { id: string; name: string } | null
  /*
    O tipo de serviço virou uma LINHA (migration 0084), e o embed traz o rótulo
    junto do id — a tela mostra `type.label`, os filtros comparam `type.key`.
    `type` é anulável no tipo porque o PostgREST assim o declara num embed; na
    prática a FK é not null e ele sempre vem.
  */
  services: {
    service_type_id: string
    type: { id: string; key: string; label: string } | null
  }[]
}

/*
  O que o formulário de negociação edita.

  `services` não é coluna: vira linha em `negotiation_services` (migration
  0022). O hook cuida da sincronização; o formulário continua enxergando uma
  lista de caixas marcadas, como no original.

  DUAS COLUNAS DO ORIGINAL NÃO EXISTEM AQUI, e a ausência é a decisão:
  `projeto_vinculado_id` e `contrato_vinculado_id`. A ligação foi invertida —
  `contracts` (MÓDULO 4) e `projects` (MÓDULO 5) é que apontam para a negociação
  por (id, tenant_id). Ver migration 0022, item 4.
*/
export type NegotiationInput = {
  name: string
  client_id: string | null
  commercial_owner_id: string
  /* Os IDs dos tipos marcados no formulário. Era uma lista de valores de enum
     até a 0084. */
  services: string[]
  estimated_value: number | null
  close_probability: number | null
  status: NegotiationStatus
  funnel_stage: FunnelStage
  origin: LeadOrigin | null
  referrer_name: string | null
  funnel_entry_date: string
  expected_close_date: string | null
  closed_at: string | null
  loss_reason: LossReason | null
  loss_notes: string | null
  generates_contract: boolean
}

/* ── Formulário público de briefing ────────────────────────────────────── */

/*
  Desfecho da abertura do link, espelhando `public.client_intake_outcome`
  (migration 0026). Cada valor tem uma tela correspondente no original:

    not_found         → "Link Inválido ou Expirado"
    expired           → "Link Expirado"
    already_submitted → "Dados Enviados com Sucesso"
    active            → o formulário de três passos
*/
export type IntakeOutcome = 'active' | 'expired' | 'already_submitted' | 'not_found'

/* Tudo o que a tela pública recebe do servidor. Não há id, não há tenant_id,
   não há campo do briefing já preenchido — o formulário nasce em branco, como
   no original. */
export type OpenIntakeResult = {
  outcome: IntakeOutcome
  clientName: string | null
  expiresAt: string | null
}

/* As chaves são as colunas de briefing de `client_intakes`, e é este objeto que
   viaja para a edge function. */
export type IntakeBriefing = {
  full_name?: string
  phone?: string
  email?: string
  city?: string
  state?: string
  country?: string

  client_type?: ClientType
  tax_id?: string
  birth_date?: string

  address_zipcode?: string
  address_street?: string
  address_number?: string
  address_district?: string
  address_complement?: string
  address_city?: string
  address_state?: string

  site_zipcode?: string
  site_street?: string
  site_number?: string
  site_district?: string
  site_complement?: string
  site_city?: string
  site_state?: string
}

/* ── Conferência do briefing recebido (tela NOVA) ──────────────────────── */

/*
  NÃO EXISTE NO ORIGINAL. Lá o envio do formulário sobrescrevia o cadastro do
  CRM direto (FormularioCliente.jsx:148). Decisão do usuário, registrada em
  docs/SCHEMA-PLAN.md: o briefing fica guardado como foi preenchido e a equipe
  decide o que aplicar, campo a campo.

  Uma linha por campo em que o briefing difere do cadastro. `column` é a coluna
  de `clients` que o botão "Aplicar" grava — e é por isso que dois campos do
  briefing podem apontar para a MESMA coluna: o formulário pergunta a cidade
  duas vezes, em dois passos (`city` e `address_city`), e o original grava as
  duas no mesmo campo do CRM, a segunda por cima da primeira. Aqui as duas
  aparecem como linhas separadas e quem confere escolhe.
*/
export type BriefingDiff = {
  /* Chave da coluna de `client_intakes`, única na lista — serve de React key. */
  field: keyof IntakeBriefing
  label: string
  /* Coluna de `clients` que recebe o valor ao aplicar. */
  column: ApplicableClientColumn
  /* O valor cru, do jeito que vai para o banco. */
  value: string
  /* O que a tela mostra dos dois lados (enum vira rótulo, data vira dd/MM/yyyy). */
  briefingText: string
  currentText: string
  /*
    A OUTRA resposta para a MESMA coluna, quando o formulário perguntou duas
    vezes e recebeu valores diferentes — hoje só cidade e estado, perguntados no
    passo 1 e de novo no passo 2. Vem preenchido com o valor descartado, para a
    tela poder dizer que houve divergência em vez de escondê-la.
  */
  supersededText?: string
}

/* Só as colunas de `clients` que o briefing sabe preencher. Nome, documento e
   endereços — nunca `tenant_id`, nunca coluna gerada. */
export type ApplicableClientColumn =
  | 'name'
  | 'phone'
  | 'email'
  | 'client_type'
  | 'tax_id'
  | 'birth_date'
  | 'address_zipcode'
  | 'address_street'
  | 'address_number'
  | 'address_district'
  | 'address_complement'
  | 'address_city'
  | 'address_state'
  | 'address_country'
  | 'site_zipcode'
  | 'site_street'
  | 'site_number'
  | 'site_district'
  | 'site_complement'
  | 'site_city'
  | 'site_state'
