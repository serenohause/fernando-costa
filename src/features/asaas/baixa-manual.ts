/*
  A DECISÃO QUE A BAIXA MANUAL PRECISA TOMAR, sem React e sem rede.

  Mora fora de `hooks.ts` para poder ser conferida por `tests/asaas-baixa-manual.mjs`
  com Node, do mesmo jeito que `features/activities/list.ts` e
  `features/financial/installments.ts`: o que decide é separado de quem busca.
*/

import type { AsaasLiveCharge } from './types'

/*
  A COBRANÇA AINDA ACEITA PAGAMENTO? E por que a pergunta é esta, e não a
  pergunta de quem baixa a parcela.

  São perguntas diferentes, e confundi-las é o erro que custa dinheiro. O
  servidor pergunta "este evento significa que entrou dinheiro?"
  (`baixaAParcela`, em supabase/functions/_shared/asaas.ts). A tela pergunta
  "se eu baixar esta parcela à mão agora, o cliente ainda vai conseguir pagar
  pelo link que já está com ele?". A primeira olha o passado, esta olha o
  futuro.

  POR QUE IMPORTA SER SÓ ESTES TRÊS: o aviso existe para o caso de cobrança
  aberta, e ele diz "cancele a cobrança no painel do Asaas antes de confirmar".
  Mostrar essa frase para uma cobrança JÁ PAGA seria conselho errado na hora
  mais sensível — e é um estado que acontece de verdade, porque é exatamente o
  que o escritório vê enquanto o aviso de pagamento não está registrado: o
  cliente pagou, a parcela não baixou sozinha, e a baixa manual é o caminho
  certo. Mandar cancelar ali faria o escritório desfazer uma cobrança que já
  virou dinheiro.

  POR ISSO A LISTA É A DOS FECHADOS, E NÃO A DOS ABERTOS. O que a tela conhece
  como aberto são três (`PENDING`, `OVERDUE`, `AWAITING_RISK_ANALYSIS`), mas
  `status` é `text` na 0125 de propósito — o provedor pode acrescentar valor sem
  avisar, e o tipo não fecha a lista. Enumerar os abertos faria status novo cair
  em "não pergunta", que é o lado caro de errar. Enumerar os FECHADOS faz status
  novo cair em "pergunta", que custa um clique.

  Pelo mesmo motivo, só entra aqui o status cujo significado é certo. Valor que
  eu não sei dizer com segurança se ainda aceita pagamento fica de fora de
  propósito: `DUNNING_REQUESTED` (negativação pedida, cobrança segue aberta) não
  está, `DUNNING_RECEIVED` (recebida por negativação) está.
*/
const STATUS_QUE_NAO_ACEITAM_MAIS_PAGAMENTO = new Set([
  'CONFIRMED',
  'RECEIVED',
  'RECEIVED_IN_CASH',
  'DUNNING_RECEIVED',
  'REFUNDED',
  'REFUND_REQUESTED',
  'REFUND_IN_PROGRESS',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'AWAITING_CHARGEBACK_REVERSAL',
])

export function cobrancaAindaAceitaPagamento(status: string | null): boolean {
  const limpo = (status ?? '').trim().toUpperCase()
  return !STATUS_QUE_NAO_ACEITAM_MAIS_PAGAMENTO.has(limpo)
}

/*
  A PERGUNTA QUE A TELA FAZ ANTES DE BAIXAR UMA PARCELA À MÃO.

  Devolve a cobrança quando ela existe E o cliente ainda consegue pagar por ela,
  que é a condição do aviso de cobrança dupla. Nos outros casos devolve nulo, e
  "Marcar como Pago" segue direto como sempre fez.

  O `?? null` cobre o carregamento: enquanto a consulta não voltou, o mapa é
  `undefined` e a resposta é "não sei de nenhuma cobrança". Isso é deliberado e
  tem um custo honesto — clicar em "Marcar como Pago" no primeiro instante da
  tela baixa sem perguntar. A alternativa seria travar o item do menu enquanto
  carrega, o que atrasa o caminho comum (parcela sem cobrança nenhuma) por causa
  do raro.
*/
export function cobrancaQueAindaPodeSerPaga(
  cobrancas: Map<string, AsaasLiveCharge> | undefined,
  receivableId: string,
): AsaasLiveCharge | null {
  const cobranca = cobrancas?.get(receivableId) ?? null
  if (cobranca === null) return null
  return cobrancaAindaAceitaPagamento(cobranca.status) ? cobranca : null
}
