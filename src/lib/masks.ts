/*
  Máscara de entrada para os três campos que o escritório digita à mão:
  documento (CPF/CNPJ), telefone/WhatsApp e CEP.

  O QUE VAI PARA O BANCO É O TEXTO COM PONTUAÇÃO, e isso não é escolha desta
  camada: o COMMENT de clients.tax_id (migration 0015) diz que a coluna guarda
  "CPF ou CNPJ exatamente como a pessoa digitou, com pontuacao", sem check de
  tamanho nem de dígito verificador, "porque a importacao do dado real nao pode
  ser derrubada por documento parcial". A deduplicação não passa por aqui —
  quem compara é tax_id_digits, coluna GENERATED que o banco calcula sozinho.
  Mascarar o texto não move essa coluna nem a unicidade que ela sustenta.
  Mesmo raciocínio vale para phone (o COMMENT da coluna é explícito: "Guardado
  como a pessoa digitou, com pontuacao") e para os CEPs.

  Por isso NÃO HÁ VALIDAÇÃO AQUI. Documento pela metade continua salvável, e
  nada além de "não é dígito" é recusado.

  REGRA QUE GOVERNA OS TRÊS: a máscara nunca apaga informação. Quando os
  dígitos não cabem no padrão (um telefone colado com +55, um documento de 15
  dígitos vindo da importação), o valor volta cru, como foi digitado, em vez de
  ser truncado. Truncar é o mesmo defeito de mascarar dinheiro: o campo mostra
  um número plausível e errado, e ninguém volta para conferir.

  ISSO NÃO É LICENÇA PARA DIGITAR SEM LIMITE. As duas coisas convivem, e a
  linha que as separa é a origem do texto: DIGITAR é limitado à capacidade do
  padrão (a tecla que passaria não faz nada), COLAR e CARREGAR DO BANCO
  continuam tolerantes. O limite mora em applyMaskEdit, no caminho da
  digitação — as funções mask* abaixo são de exibição e seguem tolerantes. O
  detalhe está escrito lá embaixo, junto do código.
*/

export type Mask = (value: string) => string

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

/*
  '0' no padrão consome um dígito; qualquer outro caractere é literal e só é
  emitido se ainda houver dígito depois dele. É o que faz "123" parar em "123"
  em vez de virar "123." — separador pendurado no fim é o que trava o backspace.
*/
function applyPattern(digits: string, pattern: string): string {
  let out = ''
  let index = 0

  for (const char of pattern) {
    if (index >= digits.length) break
    if (char === '0') {
      out += digits[index]
      index += 1
    } else {
      out += char
    }
  }

  return out
}

function maskWithCapacity(value: string, pattern: string, capacity: number): string {
  const digits = onlyDigits(value)
  if (digits.length === 0) return ''
  if (digits.length > capacity) return value

  return applyPattern(digits, pattern)
}

const CPF_PATTERN = '000.000.000-00'
const CNPJ_PATTERN = '00.000.000/0000-00'
const LANDLINE_PATTERN = '(00) 0000-0000'
const MOBILE_PATTERN = '(00) 00000-0000'
const ZIPCODE_PATTERN = '00000-000'

/*
  Um campo só para os dois documentos, como no original: até 11 dígitos é CPF,
  daí para cima é CNPJ. Quem digita não escolhe o tipo — a 12ª tecla reformata
  a linha inteira sozinha.
*/
export function maskTaxId(value: string): string {
  const digits = onlyDigits(value)
  if (digits.length === 0) return ''
  if (digits.length > 14) return value

  return applyPattern(digits, digits.length <= 11 ? CPF_PATTERN : CNPJ_PATTERN)
}

/*
  Fixo de 8 dígitos e celular de 9, decididos pela quantidade digitada, sempre
  com DDD na frente (10 ou 11 dígitos no total).
*/
export function maskPhone(value: string): string {
  const digits = onlyDigits(value)
  if (digits.length === 0) return ''
  if (digits.length > 11) return value

  return applyPattern(digits, digits.length <= 10 ? LANDLINE_PATTERN : MOBILE_PATTERN)
}

export function maskZipcode(value: string): string {
  return maskWithCapacity(value, ZIPCODE_PATTERN, 8)
}

/*
  QUANTOS DÍGITOS CADA MÁSCARA COMPORTA.

  Serve para a DIGITAÇÃO, não para a exibição — a diferença é o conserto de um
  bug reportado. Antes, digitar além do limite fazia a máscara devolver o valor
  cru: o campo perdia a formatação inteira no meio da digitação e virava um
  amontoado de números.
*/
const CAPACIDADE = new Map<Mask, number>([
  [maskTaxId, 14],
  [maskPhone, 11],
  [maskZipcode, 8],
])

function countDigits(value: string): number {
  let count = 0
  for (const char of value) if (isDigit(char)) count += 1

  return count
}

/*
  Onde o cursor precisa ficar para estar depois do n-ésimo dígito. Contar
  dígitos, e não caracteres, é o que sobrevive à máscara mudar de tamanho no
  meio da digitação (o 12º dígito troca CPF por CNPJ e desloca tudo).
*/
function caretAfterDigits(masked: string, digitCount: number): number {
  if (digitCount <= 0) return 0

  let seen = 0
  for (let i = 0; i < masked.length; i += 1) {
    if (!isDigit(masked[i])) continue
    seen += 1
    if (seen === digitCount) return i + 1
  }

  return masked.length
}

function removeDigitAt(value: string, digitIndex: number): string {
  if (digitIndex < 0) return value

  let seen = 0
  for (let i = 0; i < value.length; i += 1) {
    if (!isDigit(value[i])) continue
    if (seen === digitIndex) return value.slice(0, i) + value.slice(i + 1)
    seen += 1
  }

  return value
}

export type MaskDeletion = 'backward' | 'forward' | null

export type MaskEdit = {
  /* Texto que ficou no input DEPOIS da edição do navegador. */
  value: string
  /* Texto mascarado que estava lá ANTES dela. */
  previousValue: string
  caret: number
  deletion: MaskDeletion
}

export type MaskEditResult = {
  value: string
  caret: number
}

/*
  O núcleo do "digitar e apagar tem que funcionar".

  Dois casos que a máscara ingênua (remascarar e jogar o cursor no fim) erra:

  1. Backspace em cima de um separador. Nenhum dígito saiu, então remascarar
     devolve exatamente o texto anterior e a tecla parece não ter feito nada.
     Aqui o separador apagado leva junto o dígito da esquerda, que é o que a
     pessoa queria apagar.
  2. Delete (para a frente) em cima de um separador. Mesma coisa, e pior: o
     cursor volta para antes do separador e a tecla nunca sai do lugar, um
     campo que não apaga. Aqui o dígito comido é o da direita.

  O cursor volta para depois da mesma quantidade de dígitos que tinha antes à
  esquerda dele, então apagar do meio e colar valor completo não jogam ninguém
  para o fim do campo.
*/
export function applyMaskEdit(mask: Mask, edit: MaskEdit): MaskEditResult {
  const digitsBeforeCaret = countDigits(edit.value.slice(0, edit.caret))

  /*
    TECLA ALÉM DO LIMITE NÃO ENTRA — e COLAR é tratado diferente, de propósito.

    Digitar: a tecla que passaria da capacidade simplesmente não faz nada, como
    em qualquer campo com máscara. Antes ela era aceita e a máscara devolvia o
    valor cru, desmanchando a formatação da linha inteira.

    Colar: continua passando pelo caminho tolerante, que devolve o valor cru
    quando não cabe. O motivo está no dado real do escritório — 48 dos 126
    clientes têm telefone com 12 ou 13 dígitos, na forma `+55 (62) 98765-4321`.
    Cortar um desses em 11 produziria `(55) 62987-6543`: um número plausível e
    errado, que é pior que um campo sem formatação. Texto que chega de fora
    pode legitimamente não caber no padrão; uma tecla a mais num campo já cheio,
    não.

    A guarda `previamente <= capacidade` existe para não congelar campo que já
    veio do banco acima do limite: ali a pessoa continua livre para corrigir.
  */
  const capacidade = CAPACIDADE.get(mask)
  const digitouUmCaractere = edit.value.length - edit.previousValue.length === 1

  if (
    capacidade !== undefined &&
    digitouUmCaractere &&
    countDigits(edit.value) > capacidade &&
    countDigits(edit.previousValue) <= capacidade
  ) {
    return {
      value: edit.previousValue,
      caret: caretAfterDigits(edit.previousValue, Math.max(0, digitsBeforeCaret - 1)),
    }
  }

  const removedOneChar = edit.previousValue.length - edit.value.length === 1
  const keptEveryDigit = countDigits(edit.previousValue) === countDigits(edit.value)
  const deletedSeparator = edit.deletion !== null && removedOneChar && keptEveryDigit

  let text = edit.value
  let targetDigits = digitsBeforeCaret

  if (deletedSeparator && edit.deletion === 'backward' && digitsBeforeCaret > 0) {
    text = removeDigitAt(text, digitsBeforeCaret - 1)
    targetDigits = digitsBeforeCaret - 1
  } else if (deletedSeparator && edit.deletion === 'forward') {
    text = removeDigitAt(text, digitsBeforeCaret)
  }

  const masked = mask(text)

  return { value: masked, caret: caretAfterDigits(masked, targetDigits) }
}
