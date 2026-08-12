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

  DOIS CAMPOS APONTAM PARA A MESMA COLUNA: `city`/`state` (passo 1) e
  `address_city`/`address_state` (passo 2) gravam em `address_city`/
  `address_state`. O original pergunta a cidade duas vezes e escreve as duas no
  mesmo campo, num único UPDATE, a segunda por cima da primeira (linhas 124 e
  138) — ou seja, LÁ O PASSO 2 VENCE, e ninguém vê o empate.

  ISTO JÁ FOI DUAS LINHAS SEPARADAS, E ERA UM BUG. A ideia era "quem confere
  escolhe qual vale", mas não existia como escolher: aplicar uma fazia a outra
  divergir, e a lista pedia para aplicar de novo, para sempre. Chegou ao cliente
  — um briefing respondeu Fortaleza no passo 1 e Belo Horizonte no passo 2, e o
  cadastro ficava alternando entre os dois a cada clique.

  Agora é UMA linha por coluna, com o desempate do original (o último a
  escrever vence, isto é, o passo 2). O valor descartado não some da tela: vai
  em `supersededText`, para quem confere saber que a pessoa respondeu duas
  coisas diferentes — que é justamente o que esta tela existe para mostrar, e o
  que o original escondia.
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
  /*
    PRIMEIRO as respostas, DEPOIS a comparação — e a ordem entre as duas etapas
    é o conserto.

    Duas perguntas podem apontar para a mesma coluna (cidade e estado, no passo
    1 e de novo no passo 2). Juntar tudo antes de comparar deixa duas coisas
    certas de uma vez: quem vence é a última resposta, como no UPDATE único do
    original; e a resposta vencida continua conhecida, mesmo quando por acaso
    ela é igual ao que está no cadastro hoje — que é exatamente o caso que
    apareceu em produção e que uma versão anterior deste código escondia.
  */
  const answers = new Map<ApplicableClientColumn, { map: FieldMap; value: string }[]>()

  for (const map of FIELDS) {
    const raw = intake[map.field as keyof ClientIntake]
    const value = typeof raw === 'string' ? raw.trim() : ''
    /* Campo que a pessoa não respondeu não é divergência: é ausência. */
    if (value === '') continue

    const list = answers.get(map.column) ?? []
    list.push({ map, value })
    answers.set(map.column, list)
  }

  const diffs: BriefingDiff[] = []

  for (const [column, list] of answers) {
    const winner = list[list.length - 1]

    const current = client[column]
    const currentValue = typeof current === 'string' ? current.trim() : ''
    /* O cadastro já é o que vale: não há o que aplicar, nem sobre a resposta
       vencida — aplicá-la seria voltar atrás. */
    if (currentValue === winner.value) continue

    /* A resposta anterior só vira nota quando DIFERE da que venceu: responder a
       mesma cidade duas vezes não é conflito. */
    const previous = [...list]
      .slice(0, -1)
      .reverse()
      .find((entry) => entry.value !== winner.value)

    diffs.push({
      field: winner.map.field,
      label: winner.map.label,
      column,
      value: winner.value,
      briefingText: displayValue(column, winner.value),
      currentText: currentValue === '' ? '—' : displayValue(column, currentValue),
      ...(previous ? { supersededText: displayValue(column, previous.value) } : {}),
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
