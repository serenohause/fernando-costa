import { CLIENT_TYPE, labelOf } from '@/lib/enums'
import { formatDateBR } from '@/lib/format'
import type { Client } from '@/features/crm/types'
import type { ApplicableClientColumn, BriefingDiff, ClientIntake, IntakeBriefing } from './types'

/*
  A comparação entre o briefing recebido e o cadastro do CRM.

  NÃO EXISTE NO ORIGINAL, e é o que substitui o que existia lá: em
  FormularioCliente.jsx:120-148, o envio do formulário montava um objeto
  `updateCRM` e escrevia direto em `Client` — sem sessão, sem histórico do que
  mudou, sem autor. Um CPF digitado errado substituía o certo e ninguém ficava
  sabendo.

  Decisão do usuário (docs/SCHEMA-PLAN.md, "O envio NÃO sobrescreve o cadastro do
  CRM"): o briefing fica guardado como foi preenchido e a equipe aplica campo a
  campo. Esta lista é exatamente aquele `updateCRM`, com o mesmo de/para de
  colunas — só que em vez de virar um UPDATE, vira uma linha na tela com um botão.

  A ORDEM É A DO FORMULÁRIO PÚBLICO (passo 1, passo 2, passo 3), não a ordem das
  colunas: quem confere está lendo a resposta de alguém, na sequência em que ela
  foi respondida.

  DOIS CAMPOS APONTAM PARA A MESMA COLUNA, e isso é fidelidade, não descuido:
  `city`/`state` (passo 1) e `address_city`/`address_state` (passo 2) gravam em
  `address_city`/`address_state`. O original pergunta a cidade duas vezes e
  escreve as duas no mesmo campo, a segunda por cima da primeira (linhas 124 e
  138). Aqui as duas aparecem como linhas separadas, rotuladas pelo passo, e quem
  confere escolhe qual vale.
*/

type FieldMap = {
  field: keyof IntakeBriefing
  label: string
  column: ApplicableClientColumn
}

const FIELDS: FieldMap[] = [
  // Passo 1 — Dados Iniciais
  { field: 'full_name', label: 'Nome Completo', column: 'name' },
  { field: 'phone', label: 'Telefone/WhatsApp', column: 'phone' },
  { field: 'email', label: 'E-mail', column: 'email' },
  { field: 'city', label: 'Cidade (dados iniciais)', column: 'address_city' },
  { field: 'state', label: 'Estado (dados iniciais)', column: 'address_state' },
  { field: 'country', label: 'País', column: 'address_country' },

  // Passo 2 — Dados Complementares
  { field: 'client_type', label: 'Tipo de Cliente', column: 'client_type' },
  { field: 'tax_id', label: 'CPF / CNPJ', column: 'tax_id' },
  { field: 'birth_date', label: 'Data de Nascimento', column: 'birth_date' },
  { field: 'address_zipcode', label: 'CEP', column: 'address_zipcode' },
  { field: 'address_city', label: 'Cidade (dados complementares)', column: 'address_city' },
  { field: 'address_state', label: 'Estado (dados complementares)', column: 'address_state' },
  { field: 'address_street', label: 'Logradouro', column: 'address_street' },
  { field: 'address_number', label: 'Número', column: 'address_number' },
  { field: 'address_district', label: 'Bairro', column: 'address_district' },
  { field: 'address_complement', label: 'Complemento', column: 'address_complement' },

  // Passo 3 — Endereço da Obra
  { field: 'site_zipcode', label: 'CEP da Obra', column: 'site_zipcode' },
  { field: 'site_city', label: 'Cidade da Obra', column: 'site_city' },
  { field: 'site_state', label: 'Estado da Obra', column: 'site_state' },
  { field: 'site_street', label: 'Logradouro da Obra', column: 'site_street' },
  { field: 'site_number', label: 'Número da Obra', column: 'site_number' },
  { field: 'site_district', label: 'Bairro da Obra', column: 'site_district' },
  { field: 'site_complement', label: 'Complemento da Obra', column: 'site_complement' },
]

export function buildBriefingDiff(intake: ClientIntake, client: Client): BriefingDiff[] {
  const diffs: BriefingDiff[] = []

  for (const map of FIELDS) {
    const raw = intake[map.field as keyof ClientIntake]
    const value = typeof raw === 'string' ? raw.trim() : ''
    /* Campo que a pessoa não respondeu não é divergência: é ausência. */
    if (value === '') continue

    const current = client[map.column]
    const currentValue = typeof current === 'string' ? current.trim() : ''
    if (currentValue === value) continue

    diffs.push({
      field: map.field,
      label: map.label,
      column: map.column,
      value,
      briefingText: displayValue(map.column, value),
      currentText: currentValue === '' ? '—' : displayValue(map.column, currentValue),
    })
  }

  return diffs
}

/* O que a tela mostra dos dois lados: enum vira rótulo em português, data vira
   dd/MM/yyyy. O que o botão grava continua sendo o valor cru. */
function displayValue(column: ApplicableClientColumn, value: string): string {
  if (column === 'client_type') {
    return labelOf(CLIENT_TYPE, value as keyof typeof CLIENT_TYPE)
  }
  if (column === 'birth_date') return formatDateBR(value)
  return value
}
