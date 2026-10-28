/* Caminho relativo com extensão, e não o apelido "@/": este módulo é importado
   direto pelo node em tests/leads-fila.mjs, e o node não conhece o apelido do
   Vite. Mesma solução de src/features/projects/task-events.ts. Importação de
   TIPO pode continuar sem extensão, porque ela é apagada antes de rodar. */
import { onlyDigits } from '../../lib/masks.ts'
import { semAcento } from '../../lib/text.ts'
import type { LeadPatch, ProductLead } from './types'

/* O que conta como "a pessoa está digitando um telefone": dígito e os
   separadores que a máscara produz, mais o `+` de quem cola do formato
   internacional. Uma letra no meio e o termo volta a ser busca de texto. */
const SO_NUMERO = /^[\d\s()+.-]+$/

/*
  As duas decisões da fila que não dependem de rede, separadas dos hooks para
  poderem ser conferidas sozinhas (tests/leads-fila.mjs). Nada aqui importa o
  client do Supabase.
*/

/*
  A busca varre e-mail, nome, telefone e escritório juntos, porque é assim que
  alguém procura um lead: pelo que lembra dele. Sem acento e sem caixa, com a
  MESMA regra que o banco usa na busca global (`semAcento`, migration 0105):
  duas regras diferentes para a mesma pergunta fariam a tela não achar o que
  existe.

  O TELEFONE É COMPARADO POR DÍGITO, E SÓ POR DÍGITO. O valor chega mascarado da
  página (`maskPhone`, "(62) 99999-9999"), então comparar o texto cru não
  atenderia quem digita `62999`: o parêntese e o espaço ficam no meio do que ele
  escreveu. Reduzir os dois lados a dígito resolve os dois jeitos de digitar ao
  mesmo tempo, porque `(62) 99888` e `6299888` viram a mesma coisa. Pôr o
  telefone TAMBÉM na lista de texto acima foi a primeira versão disto, e o teste
  de mutante mostrou que era linha morta: nenhum caso deixava de passar sem ela.

  MAS SÓ QUANDO A BUSCA INTEIRA É NÚMERO, e esta parte veio de achado de
  auditoria. Antes os dígitos eram arrancados de qualquer termo, então procurar
  `ana 1` devolvia o lead do Bruno, porque o telefone dele tem um `1`, e deixava
  a Ana de fora. Numa tela cuja função é escolher PARA QUEM mandar mensagem,
  lead estranho na lista filtrada é um clique de WhatsApp para a pessoa errada.
  O mínimo de três dígitos existe pelo mesmo motivo: `2` casaria com quase toda
  a fila e não recorta nada.

  Recorte em memória, e não WHERE: a leitura inteira tem teto de 500 e já está
  na mão, e os quatro contadores do topo precisam dos quatro estados ao mesmo
  tempo.
*/
export function filterLeads(
  leads: ProductLead[],
  filters: { status: string; search: string },
): ProductLead[] {
  const busca = semAcento(filters.search).trim()
  const digitos = SO_NUMERO.test(filters.search.trim()) ? onlyDigits(filters.search) : ''

  return leads.filter((lead) => {
    if (filters.status !== 'all' && lead.status !== filters.status) return false
    if (busca === '') return true

    const casaTexto = [lead.email, lead.name, lead.office_name].some(
      (campo) => campo !== null && semAcento(campo).includes(busca),
    )
    if (casaTexto) return true

    return digitos.length >= 3 && lead.phone !== null && onlyDigits(lead.phone).includes(digitos)
  })
}

/*
  O LINK DE WHATSAPP DO LEAD, ou nulo quando não há como montar um.

  `wa.me` com o 55 na frente é o que o projeto já faz em SupplierDrawer.tsx, e
  por isso é o que fica aqui: endereço documentado pela própria WhatsApp, que no
  computador cai no WhatsApp Web e no celular abre o aplicativo. Trocar por
  `web.whatsapp.com/send` pouparia uma tela de confirmação no computador e
  quebraria o celular, então não vale o troco.

  POR QUE A FUNÇÃO PODE DEVOLVER NULO. O telefone é obrigatório desde a
  migration 0124, mas a coluna segue aceitando nulo, e lead gravado ANTES dessa
  regra existe em produção. Além disso o valor é texto livre no banco: o que a
  máscara da página produz tem 10 ou 11 dígitos, e qualquer coisa fora disso não
  é telefone brasileiro com DDD. Montar o link de todo jeito entregaria um botão
  que abre o WhatsApp num número inexistente, o que é pior do que não ter botão.

  O 55 não é colado duas vezes: número que já chega com o código do país (12 ou
  13 dígitos começando em 55) tem o 55 retirado antes da conferência e recolocado
  depois, para a regra valer igual nos dois formatos.

  CONTAR OS DÍGITOS NÃO BASTA, e esta parte veio de achado de auditoria.
  "10 ou 11 dígitos" também descreve telefone de outros países: `+1 (212)
  555-0123` tem 11, e com o 55 na frente virava `wa.me/5512125550123`, um número
  brasileiro legítimo de DDD 12, de um desconhecido que receberia o primeiro
  nome do lead. Por isso o DDD precisa existir (11 a 99) e o celular precisa do
  nono dígito. Não é validação de operadora, é a barreira mais barata que separa
  telefone brasileiro de número que só tem o tamanho parecido.

  A MENSAGEM VAI PRONTA porque o motivo do botão é não ter que escrever a mesma
  abertura em todo lead. Ela se apresenta e diz de onde veio o contato, que é o
  que falta para a pessoa do outro lado entender por que está recebendo
  mensagem de um número desconhecido.
*/
export function linkWhatsapp(lead: Pick<ProductLead, 'phone' | 'name'>): string | null {
  if (lead.phone === null) return null

  const digitos = onlyDigits(lead.phone)

  const nacional =
    (digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')
      ? digitos.slice(2)
      : digitos

  const ddd = Number(nacional.slice(0, 2))
  const telefoneBrasileiro =
    ddd >= 11 &&
    ddd <= 99 &&
    (nacional.length === 10 || (nacional.length === 11 && nacional[2] === '9'))

  if (!telefoneBrasileiro) return null

  const primeiroNome = lead.name === null ? '' : lead.name.trim().split(/\s+/)[0]
  const saudacao = primeiroNome === '' ? 'Olá!' : `Olá, ${primeiroNome}!`
  const mensagem = `${saudacao} Aqui é da equipe do HausOne. Vi que você deixou seu contato no nosso site e vim conversar com você.`

  return `https://wa.me/55${nacional}?text=${encodeURIComponent(mensagem)}`
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
