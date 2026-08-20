// A máscara de entrada tem que LIMITAR a digitação e TOLERAR o que vem de fora.
//
// COMO RODAR
//   npm run test:masks
//
// POR QUE ESTE ARQUIVO EXISTE
//   É o primeiro teste de frontend do projeto, e ele nasce de um defeito
//   reportado pelo escritório: digitar além do tamanho do padrão fazia o campo
//   perder a formatação inteira e virar um amontoado de números. A causa era
//   sutil — o corte por capacidade morava na função de EXIBIÇÃO, então a tecla
//   extra passava e a máscara caía no caminho tolerante.
//
//   O conserto separa dois caminhos que pareciam um só, e a separação é a coisa
//   que precisa ficar provada:
//
//     DIGITAR   limitado. A tecla que passaria do padrão não faz nada.
//     COLAR     tolerante. Volta cru em vez de truncar.
//     DO BANCO  tolerante, e editável — campo não congela.
//
//   O caminho tolerante não é folga: 48 dos 126 clientes reais têm telefone com
//   12 ou 13 dígitos, na forma `+55 (62) 98765-4321`. Cortar um desses em 11
//   produz `(55) 62987-6543`, um número plausível e errado. É o mesmo defeito de
//   mascarar dinheiro, e é por isso que os dois comportamentos convivem.
//
// SOBRE A PASTA
//   Os testes de banco vivem em supabase/tests/. Este não toca no banco — é
//   função pura de src/lib/. Ficaria mal-endereçado lá.

import {
  applyMaskEdit,
  maskTaxId,
  maskPhone,
  maskZipcode,
} from '../src/lib/masks.ts'

let passed = 0
let failed = 0

function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name} — recebeu ${JSON.stringify(got)}, esperava ${JSON.stringify(want)}`)
  }
}

/*
  As duas formas de o texto entrar no campo, como o navegador as entrega.

  `digitar` acrescenta um caractere no fim; `colar` troca o conteúdo inteiro de
  uma vez. A diferença entre elas é exatamente o que applyMaskEdit usa para
  decidir se limita ou tolera, então o teste precisa simular as duas de verdade,
  e não chamar a máscara direto.
*/
function digitar(mask, previous, char) {
  const value = previous + char
  return applyMaskEdit(mask, { value, caret: value.length, previousValue: previous, deletion: null })
}

function colar(mask, previous, text) {
  return applyMaskEdit(mask, { value: text, caret: text.length, previousValue: previous, deletion: null })
}

function digitarTudo(mask, digits) {
  let value = ''
  for (const d of digits) value = digitar(mask, value, d).value
  return value
}

console.log('\nMáscaras de entrada — documento, telefone e CEP\n')

// 1. DIGITAR PARA NO TETO DO PADRÃO — o defeito reportado.
const cnpj = digitarTudo(maskTaxId, '12345678901234')
check('1.1  CNPJ chega aos 14 dígitos formatado', cnpj, '12.345.678/9012-34')
check('1.2  15ª tecla no documento não entra', digitar(maskTaxId, cnpj, '5').value, cnpj)
check('1.3  e o cursor fica onde estava', digitar(maskTaxId, cnpj, '5').caret, cnpj.length)

const celular = digitarTudo(maskPhone, '62987654321')
check('1.4  celular chega aos 11 dígitos formatado', celular, '(62) 98765-4321')
check('1.5  12ª tecla no telefone não entra', digitar(maskPhone, celular, '9').value, celular)

const cep = digitarTudo(maskZipcode, '74000000')
check('1.6  CEP chega aos 8 dígitos formatado', cep, '74000-000')
check('1.7  9ª tecla no CEP não entra', digitar(maskZipcode, cep, '1').value, cep)

/*
  1.8 é o caso que o teto poderia estragar: o campo cheio tem que continuar
  editável no meio, e a tecla recusada não pode jogar o cursor para o fim.
*/
const comDigitoNoMeio = celular.slice(0, 6) + '0' + celular.slice(6)
const noMeio = applyMaskEdit(maskPhone, {
  value: comDigitoNoMeio,
  caret: 7,
  previousValue: celular,
  deletion: null,
})
check('1.8  tecla no meio de campo cheio não entra', noMeio.value, celular)
check('1.9  e o cursor não pula para o fim', noMeio.caret, 6)

// 2. COLAR ACIMA DO TETO CONTINUA TOLERANTE — os 48 telefones com +55.
check('2.1  colar 13 dígitos volta cru, não truncado', colar(maskPhone, '', '+55 62 98765-4321').value, '+55 62 98765-4321')
check('2.2  colar 12 dígitos volta cru', colar(maskPhone, '', '556298765432').value, '556298765432')

// 3. VALOR VINDO DO BANCO ACIMA DO TETO NÃO CONGELA O CAMPO.
const legado = '+55 62 98765-4321'
const apagouUm = applyMaskEdit(maskPhone, {
  value: legado.slice(0, -1),
  caret: legado.length - 1,
  previousValue: legado,
  deletion: 'backward',
})
check('3.1  backspace funciona no valor legado', apagouUm.value, '+55 62 98765-432')

const doze = '+55 62 98765-432'
const apagouOutro = applyMaskEdit(maskPhone, {
  value: doze.slice(0, -1),
  caret: doze.length - 1,
  previousValue: doze,
  deletion: 'backward',
})
check('3.2  ao cair para 11 dígitos a máscara volta a pegar', apagouOutro.value, '(55) 62987-6543')

/*
  4. O QUE JÁ FUNCIONAVA E NÃO PODE REGREDIR.

  4.2 é o caso que motivou o tratamento de separador: sem ele, backspace em cima
  de ')' devolve o mesmo texto e a tecla parece não fazer nada.
*/
const semUmDigito = applyMaskEdit(maskPhone, {
  value: '(62) 98765-432',
  caret: 14,
  previousValue: celular,
  deletion: 'backward',
})
check('4.1  10 dígitos passam para o padrão de telefone fixo', semUmDigito.value, '(62) 9876-5432')

const emCimaDoSeparador = applyMaskEdit(maskPhone, {
  value: '(62 98765-4321',
  caret: 3,
  previousValue: celular,
  deletion: 'backward',
})
check('4.2  backspace sobre separador come o dígito da esquerda', emCimaDoSeparador.value, '(69) 8765-4321')

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
