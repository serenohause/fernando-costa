/*
  O QUE A TELA DE COBRANÇA DECIDE, sem React e sem rede.

  POR QUE ESTE ARQUIVO É SEPARADO DE `cobranca.ts`, e não é organização: é o que
  torna estas funções CONFERÍVEIS. `tests/asaas-cobranca.mjs` as roda com Node,
  e o Node não resolve o alias `@/` do Vite — `cobranca.ts` importa
  `@/lib/supabase` e `@/lib/edge-functions`, então importá-lo num teste morre no
  resolvedor antes de rodar um caso. Mesmo recorte de
  `features/activities/list.ts`, `features/financial/installments.ts` e
  `features/asaas/baixa-manual.ts`.

  O QUE MORA AQUI: a tradução de `status` em palavra de tela (seção 7b do
  protótipo), a taxa do Asaas (que não é coluna), em que dia o cliente pagou, a
  validade do PIX e a cor da recusa. Tudo o que o TypeScript não cobre, porque
  `status` é `text` de propósito e a taxa é uma subtração com nulo no meio.

  O QUE NÃO MORA AQUI: consulta, mutation, cache e qualquer leitura de janela.
  `date-fns` e `lucide-react` entram porque são pacotes de verdade, que o Node
  resolve; nada neste arquivo renderiza.

  O tipo `CobrancaDaParcela` continua em `cobranca.ts`, ao lado da consulta que
  o produz, e chega aqui por `import type`, que é apagado na compilação e nunca
  faz o Node abrir aquele arquivo.
*/

import { format, parseISO } from 'date-fns'
import { CalendarX, Link2, Undo2, Webhook, type LucideIcon } from 'lucide-react'
/* A EXTENSÃO `.ts` É OBRIGATÓRIA NESTA LINHA, e não é estilo: este arquivo é
   importado por `tests/asaas-cobranca.mjs` com Node, e o Node não adivinha
   extensão em caminho relativo como o Vite faz. Sem ela o teste morre no
   resolvedor antes do primeiro caso. `allowImportingTsExtensions` já está
   ligado nos dois tsconfig do projeto. */
import { cobrancaAindaAceitaPagamento } from './baixa-manual.ts'
import type { CobrancaDaParcela } from './cobranca'

/* ------------------------------------------------------------------ */
/* A tradução da situação: seção 7b, palavra por palavra              */
/* ------------------------------------------------------------------ */

export type FamiliaDaSituacao = 'blue' | 'emerald' | 'rose' | 'neutral'

export type DesfechoDaCobranca =
  /* o cliente ainda consegue pagar pelo link */
  | 'aberta'
  /* o Asaas diz que entrou dinheiro */
  | 'paga'
  /* o Asaas registrou um estorno */
  | 'estornada'
  /* não aceita mais pagamento e não é nenhum dos dois acima */
  | 'encerrada'

export type SituacaoDaCobranca = {
  /* O rótulo do badge, no painel. Seção 7b. */
  rotulo: string
  familia: FamiliaDaSituacao
  /* A segunda linha da coluna Status, na tabela. Seção 7. */
  linha: string
  /* A mesma linha em versão curta, para o celular. Seção 18. */
  linhaCurta: string
  icone: LucideIcon | null
  desfecho: DesfechoDaCobranca
}

/*
  O MAPA DE SITUAÇÕES, E POR QUE ELE TEM DUAS COLUNAS DE TEXTO.

  O protótipo escreve duas vocabulários para o mesmo fato, de propósito:

    a seção 7b define o RÓTULO DO BADGE, que é o que o painel mostra em
    "Situação" ("Aguardando pagamento", "Cobrança vencida", "Pago, saldo em
    liberação", "Recebido", "Estornada", "Recebido em dinheiro");

    a seção 7 define a SEGUNDA LINHA DA TABELA, que fala do ponto de vista de
    quem lê a lista ("Aguardando pagamento", "Cobrança vencida no Asaas",
    "Baixado pelo aviso do Asaas", "Estornada no Asaas").

  Elas não são iguais e nenhuma das duas foi reescrita.

  `status` É TEXTO NA 0125 DE PROPÓSITO, e por isso este mapa não é exaustivo: o
  Asaas pode acrescentar palavra sem avisar. Palavra que não está aqui aparece
  CRUA, em cinza neutro, e nunca como erro — "com a palavra na tela, quem der
  suporte procura na documentação deles em dez segundos". O desfecho dela sai de
  `cobrancaAindaAceitaPagamento`, que é a mesma pergunta que a baixa manual faz,
  e que erra para o lado barato: status novo conta como aberto só se não estiver
  na lista dos fechados.
*/
const SITUACOES: Record<string, SituacaoDaCobranca> = {
  PENDING: {
    rotulo: 'Aguardando pagamento',
    familia: 'blue',
    linha: 'Aguardando pagamento',
    linhaCurta: 'Aguardando',
    icone: Link2,
    desfecho: 'aberta',
  },
  OVERDUE: {
    rotulo: 'Cobrança vencida',
    familia: 'rose',
    linha: 'Cobrança vencida no Asaas',
    linhaCurta: 'Vencida',
    icone: CalendarX,
    desfecho: 'aberta',
  },
  CONFIRMED: {
    rotulo: 'Pago, saldo em liberação',
    familia: 'emerald',
    linha: 'Baixado pelo aviso do Asaas',
    linhaCurta: 'Baixado',
    icone: Webhook,
    desfecho: 'paga',
  },
  RECEIVED: {
    rotulo: 'Recebido',
    familia: 'emerald',
    linha: 'Baixado pelo aviso do Asaas',
    linhaCurta: 'Baixado',
    icone: Webhook,
    desfecho: 'paga',
  },
  /*
    A LINHA DA TABELA AQUI NÃO É "Baixado pelo aviso do Asaas", e a diferença é
    de verdade: `PAYMENT_RECEIVED_IN_CASH` não está em `EVENTOS_QUE_BAIXAM`
    (supabase/functions/_shared/asaas.ts), então esta cobrança está recebida no
    painel do Asaas e a parcela daqui pode continuar aberta. Dizer "baixado"
    seria afirmar uma baixa que não houve. O texto é o rótulo da própria seção
    7b, que descreve o fato sem prometer a consequência.
  */
  RECEIVED_IN_CASH: {
    rotulo: 'Recebido em dinheiro',
    familia: 'emerald',
    linha: 'Recebido em dinheiro',
    linhaCurta: 'Em dinheiro',
    icone: Webhook,
    desfecho: 'paga',
  },
  REFUNDED: {
    rotulo: 'Estornada',
    familia: 'rose',
    linha: 'Estornada no Asaas',
    linhaCurta: 'Estornada',
    icone: Undo2,
    desfecho: 'estornada',
  },
}

export function situacaoDaCobranca(cobranca: CobrancaDaParcela): SituacaoDaCobranca {
  /*
    `deleted` vem antes do status porque é outra pergunta: a cobrança não está
    em situação nenhuma, ela não existe mais lá. Seção 7b.

    HOJE ESTE CAMINHO NÃO É ALCANÇADO pela tela: `useCobrancasPorParcela` lê só
    `deleted = false`, pelo motivo escrito lá. Fica escrito porque a coluna está
    no tipo e a resposta correta é esta, não um status cru.
  */
  if (cobranca.deleted) {
    return {
      rotulo: 'Removida no Asaas',
      familia: 'neutral',
      linha: 'Removida no Asaas',
      linhaCurta: 'Removida',
      icone: null,
      desfecho: 'encerrada',
    }
  }

  const chave = (cobranca.status ?? '').trim().toUpperCase()
  const conhecida = SITUACOES[chave]
  if (conhecida) return conhecida

  /* Palavra nova do provedor: crua, em cinza, nunca como erro. */
  const crua = (cobranca.status ?? '').trim()
  return {
    rotulo: crua,
    familia: 'neutral',
    linha: crua,
    linhaCurta: crua,
    icone: null,
    desfecho: cobrancaAindaAceitaPagamento(cobranca.status) ? 'aberta' : 'encerrada',
  }
}

/* ------------------------------------------------------------------ */
/* Os números e as datas que o painel mostra                          */
/* ------------------------------------------------------------------ */

/*
  A TAXA DO ASAAS NÃO É COLUNA: é `value - net_value`.

  E `net_value` é nulo até o Asaas dizer qual foi o líquido. Nulo devolve NULO, e
  não zero: zero afirmaria que a cobrança foi de graça, e é o tipo de número que
  alguém leva para a conciliação. Quando é nulo, as linhas "Líquido na conta" e
  "Taxa do Asaas" saem da tela em vez de mentir.
*/
export function taxaDoAsaas(cobranca: CobrancaDaParcela): number | null {
  if (cobranca.net_value === null) return null

  /*
    O ARREDONDAMENTO NÃO É ENFEITE. `9500 - 9310.46` em ponto flutuante dá
    189.54000000000087, e foi o caso 16 do teste que mostrou isso com os números
    que o sandbox devolveu de verdade. Hoje `formatCurrencyBRL` esconderia na
    tela, mas o número sai daqui e ninguém promete que o próximo leitor vai
    formatá-lo: subtração de dinheiro que devolve lixo é bug esperando por uma
    soma.

    Duas casas é exato, e não aproximação: `value` e `net_value` são
    `numeric(14,2)` na 0125, então o resultado verdadeiro nunca tem a terceira
    casa.
  */
  return Math.round((cobranca.value - cobranca.net_value) * 100) / 100
}

/*
  EM QUE DIA O CLIENTE PAGOU, e a ordem das três datas é a da 0125: a data do
  CLIENTE primeiro ("boleto pago na sexta e liquidado na segunda continua tendo
  sido pago na sexta"), a liquidação depois. Sem nenhuma das duas, devolve nulo e
  a linha "Pago em" não aparece.
*/
export function pagoEm(cobranca: CobrancaDaParcela): string | null {
  return cobranca.client_payment_date ?? cobranca.payment_date ?? null
}

/*
  DATA COM HORA, que `formatDateBR` não faz e que duas frases do protótipo
  pedem: "Emitida por Fernando Costa, em 03/11/2026 às 14:22" e "Em 03/11/2026
  às 15:07" na faixa da baixa automática.

  As duas leem coluna `timestamptz`, e não `date` — `parseISO` de um instante com
  fuso devolve o instante certo, e `format` o escreve no fuso de quem olha, que é
  o do escritório. O cuidado com `date` ("2026-08-03" virando o dia anterior) não
  se aplica aqui, mas a mesma dupla do `formatDateBR` é usada para a saída ser a
  mesma.
*/
export function dataEHoraBR(valor: string | null | undefined): string {
  if (!valor) return ''
  try {
    return format(parseISO(valor), "dd/MM/yyyy 'às' HH:mm")
  } catch {
    return valor
  }
}

/*
  O COPIA E COLA DO PIX VENCE, e a tela lê a validade sem mostrá-la.

  O QR Code do Asaas é dinâmico (0125): passado `pix_expires_at`, o banco do
  cliente recusa o código. O protótipo (seção 11) desenha a linha do PIX sem
  nenhuma palavra sobre validade, e a decisão de desenho não é minha para mudar,
  então a função fica aqui, sem uso na tela, e o ponto está no relatório de
  entrega. Quem decidir mostrar o aviso já tem a pergunta pronta.
*/
export function pixVencido(cobranca: CobrancaDaParcela, agora: Date = new Date()): boolean {
  if (!cobranca.pix_expires_at) return false
  try {
    return parseISO(cobranca.pix_expires_at).getTime() <= agora.getTime()
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* A recusa, quando a emissão não acontece (seção 16)                 */
/* ------------------------------------------------------------------ */

export type RecusaDaEmissao = {
  /* âmbar é "falta um dado, nada quebrou"; vermelho é "há pendência real". */
  tom: 'warn' | 'error'
  /* Documento: o ícone da seção 16 é o mesmo nos dois casos de cadastro. */
  assunto: 'documento' | 'falha'
  titulo: string
  texto: string
  /* A letra miúda, que diz o que aconteceu com o dinheiro. */
  rodape: string | null
  /* Só as duas recusas que NOMEIAM o cliente levam até a ficha dele. */
  abrirFichaDoCliente: boolean
}

/*
  OS CÓDIGOS QUE PRECISAM DE TRATAMENTO PRÓPRIO.

  Quem escreve a frase é o servidor, e isso é decisão do protótipo: "O texto da
  faixa é o do backend, palavra por palavra. Duas versões da mesma frase seria
  manutenção dobrada." O que este arquivo decide é a COR, o ÍCONE, a letra miúda
  e se existe caminho para a ficha do cliente.

  O rótulo em negrito da faixa é a primeira frase da mensagem, e o resto vira o
  texto de apoio: as mensagens de `asaas-charge` são escritas em duas frases, a
  primeira dizendo o que houve e a segunda o que fazer, que é exatamente a
  divisão que a faixa desenha.
*/
const AMBAR = new Set([
  'client_without_document',
  'asaas_customer_rejected',
  'asaas_charge_rejected',
  'receivable_without_client',
  'receivable_already_paid',
  'charge_already_exists',
  'asaas_not_connected',
  'forbidden',
])

const DOCUMENTO = new Set(['client_without_document', 'asaas_customer_rejected'])

const RODAPES: Record<string, string> = {
  /* Seção 16, as duas letras miúdas, palavra por palavra. A diferença entre
     elas é real: a recusa por documento ausente é nossa, antes da rede; a do
     Asaas acontece depois de falarmos com eles. */
  client_without_document:
    'Nada foi cobrado e nada foi criado no Asaas. A recusa acontece antes de qualquer chamada.',
  asaas_customer_rejected: 'Nada foi cobrado. A cobrança não chegou a ser criada no Asaas.',
}

function partirEmTituloETexto(mensagem: string): { titulo: string; texto: string } {
  const limpa = mensagem.trim()
  const corte = limpa.indexOf('. ')

  if (corte === -1) {
    return { titulo: limpa.replace(/\.$/, ''), texto: '' }
  }

  return { titulo: limpa.slice(0, corte), texto: limpa.slice(corte + 2).trim() }
}

/*
  O PRIMEIRO NOME, para o rótulo "Abrir ficha de Beatriz".

  Devolve vazio quando não há nome aproveitável, e o botão troca de frase em vez
  de ficar "Abrir ficha de ". O caso não é teórico: `recusaDoAsaasAoCliente`, no
  servidor, existe nessa forma porque cliente cadastrado sem nome produzia
  "recusou o cadastro de ." e frase quebrada numa tela de dinheiro faz quem lê
  duvidar do resto.
*/
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

/*
  A RECUSA QUE O SERVIDOR RESPONDEU.

  Recebe o `code` e a `message` já desembrulhados, e não o erro: quem desembrulha
  é `recusaDaEmissao` em `cobranca.ts`, porque reconhecer um `EdgeFunctionError`
  obriga a importar `@/lib/edge-functions`, que arrasta o client do Supabase e o
  `import.meta.env` do Vite. A decisão de COR, ÍCONE e letra miúda não precisa de
  nada disso, e por isso é conferível.
*/
export function recusaDoServidor(code: string, message: string): RecusaDaEmissao {
  const { titulo, texto } = partirEmTituloETexto(message)

  return {
    tom: AMBAR.has(code) ? 'warn' : 'error',
    assunto: DOCUMENTO.has(code) ? 'documento' : 'falha',
    titulo,
    texto,
    rodape: RODAPES[code] ?? null,
    abrirFichaDoCliente: DOCUMENTO.has(code),
  }
}

/*
  O QUE NÃO CHEGOU A SER RESPOSTA. `invokeEdgeFunction` só traduz em
  `EdgeFunctionError` o que o servidor respondeu; rede cortada e aba offline
  levantam o erro cru do supabase-js, com mensagem em inglês que não serve para
  ninguém ler. Esta é a única frase desta tela que não vem do servidor.
*/
export const RECUSA_SEM_SERVIDOR: RecusaDaEmissao = {
  tom: 'error',
  assunto: 'falha',
  titulo: 'Não foi possível falar com o servidor',
  texto:
    'A cobrança não foi gerada. Confira a conexão e tente de novo em instantes; se insistir, confira a conta Asaas do escritório antes de gerar outra.',
  rodape: null,
  abrirFichaDoCliente: false,
}
