// Comparação de texto sem acento (migration 0105).
//
// COMO RODAR
//   npm run test:text

import { semAcento } from '../src/lib/text.ts'

let passed = 0
let failed = 0
function eq(name, esperado, observado) {
  if (esperado === observado) { passed += 1; console.log(`PASS  ${name}`) }
  else { failed += 1; console.log(`FAIL  ${name}\n        esperado=${JSON.stringify(esperado)}\n        observado=${JSON.stringify(observado)}`) }
}

console.log('\nBusca sem acento\n')
eq('1  tira acento e baixa a caixa', 'junior sintonia', semAcento('Júnior Sintonia'))
eq('2  o mesmo texto sem acento não muda', 'junior sintonia', semAcento('Junior Sintonia'))
eq('3  os dois caem no mesmo valor', semAcento('Júnior'), semAcento('junior'))
eq('4  cedilha vira c', 'conceicao', semAcento('Conceição'))
eq('5  circunflexo e til', 'antonio joao', semAcento('Antônio João'))
eq('6  trema e agudo', 'muniz aguero', semAcento('Muniz Agüero'))
eq('7  não mexe em número nem pontuação', '12.345.678/0001-90', semAcento('12.345.678/0001-90'))
eq('8  texto vazio continua vazio', '', semAcento(''))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
