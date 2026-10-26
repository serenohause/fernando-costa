/* Caminho relativo com extensão, e não o apelido "@/": este módulo é importado
   direto pelo node em tests/leads-fila.mjs, e o node não conhece o apelido do
   Vite. Mesma solução de src/features/projects/task-events.ts. Importação de
   TIPO pode continuar sem extensão, porque ela é apagada antes de rodar. */
import { semAcento } from '../../lib/text.ts'
import type { LeadPatch, ProductLead } from './types'

/*
  As duas decisões da fila que não dependem de rede, separadas dos hooks para
  poderem ser conferidas sozinhas (tests/leads-fila.mjs). Nada aqui importa o
  client do Supabase.
*/

/*
  A busca varre e-mail, nome e escritório juntos, porque é assim que alguém
  procura um lead: pelo que lembra dele. Sem acento e sem caixa, com a MESMA
  regra que o banco usa na busca global (`semAcento`, migration 0105) — duas
  regras diferentes para a mesma pergunta fariam a tela não achar o que existe.

  Recorte em memória, e não WHERE: a leitura inteira tem teto de 500 e já está
  na mão, e os quatro contadores do topo precisam dos quatro estados ao mesmo
  tempo.
*/
export function filterLeads(
  leads: ProductLead[],
  filters: { status: string; search: string },
): ProductLead[] {
  const busca = semAcento(filters.search).trim()

  return leads.filter((lead) => {
    if (filters.status !== 'all' && lead.status !== filters.status) return false
    if (busca === '') return true

    return [lead.email, lead.name, lead.office_name].some(
      (campo) => campo !== null && semAcento(campo).includes(busca),
    )
  })
}

/*
  O QUE VAI PARA O UPDATE, incluindo `contacted_at` — que não vem da tela.

    - ao sair de "Novo", a data nasce agora, se ainda não existir. Quem mudou o
      status para Contatado acabou de falar com a pessoa; pedir a data num campo
      separado seria pedir para digitar o que o sistema já sabe. E se a data JÁ
      existe, ela fica: mudar de Contatado para Qualificado não reescreve quando
      o contato aconteceu.
    - ao VOLTAR para "Novo", a data é apagada. Não é faxina: o check
      `product_leads_new_has_no_contact` (migration 0112) recusa a linha com
      23514, porque "Novo com data de contato" deixaria a tela escolher em qual
      dos dois acreditar. Sem esta regra, voltar um lead para Novo seria erro de
      banco.

  Patch que não mexe no status não toca na data: salvar uma anotação não é falar
  com a pessoa.
*/
export function camposParaGravar(
  lead: Pick<ProductLead, 'contacted_at'>,
  patch: LeadPatch,
  agora: Date = new Date(),
): LeadPatch & { contacted_at?: string | null } {
  if (patch.status === undefined) return { ...patch }
  if (patch.status === 'new') return { ...patch, contacted_at: null }
  if (lead.contacted_at !== null) return { ...patch }
  return { ...patch, contacted_at: agora.toISOString() }
}
