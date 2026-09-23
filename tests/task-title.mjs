// O título sugerido ao criar pelo "Novo Projeto" do Fluxo do Projeto.
//
// COMO RODAR
//   npm run test:task-title

import { defaultTaskTitle } from '../src/features/projects/task-title.ts'

let passed = 0
let failed = 0
function eq(name, esperado, observado) {
  if (esperado === observado) { passed += 1; console.log(`PASS  ${name}`) }
  else { failed += 1; console.log(`FAIL  ${name}\n        esperado=${JSON.stringify(esperado)}\n        observado=${JSON.stringify(observado)}`) }
}

console.log('\nTítulo sugerido\n')
eq('1  número do contrato + nome do projeto', 'FC-2025-104 - Casa de campo', defaultTaskTitle({ name: 'Casa de campo', contract: { contract_number: 'FC-2025-104' } }))
eq('2  sem contrato fica só o nome', 'Residência Alto', defaultTaskTitle({ name: 'Residência Alto', contract: null }))
eq('3  nome que já começa pelo número não repete', '0730 Residência Silva', defaultTaskTitle({ name: '0730 Residência Silva', contract: { contract_number: '0730' } }))
eq('4  espaços sobrando são aparados', '0730 - Casa', defaultTaskTitle({ name: '  Casa ', contract: { contract_number: ' 0730 ' } }))
eq('5  número em branco conta como sem contrato', 'Casa', defaultTaskTitle({ name: 'Casa', contract: { contract_number: '  ' } }))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
