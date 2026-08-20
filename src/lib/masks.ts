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
