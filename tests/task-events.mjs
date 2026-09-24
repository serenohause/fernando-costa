// O histórico do cartão, em português (migration 0104).
//
// COMO RODAR
//   npm run test:task-events

import { describeTaskEvent } from '../src/features/projects/task-events.ts'

let passed = 0
let failed = 0
function eq(name, esperado, observado) {
  if (esperado === observado) { passed += 1; console.log(`PASS  ${name}`) }
  else { failed += 1; console.log(`FAIL  ${name}\n        esperado=${JSON.stringify(esperado)}\n        observado=${JSON.stringify(observado)}`) }
}

console.log('\nHistórico do cartão\n')
eq('1  criação', 'criou a tarefa', describeTaskEvent('task_created', { title: 'Projeto executivo' }))
eq('2  objetivo concluído', 'concluiu o objetivo “Emitir RRT”', describeTaskEvent('objective_completed', { title: 'Emitir RRT' }))
eq('3  objetivo reaberto', 'reabriu o objetivo “Emitir RRT”', describeTaskEvent('objective_reopened', { title: 'Emitir RRT' }))
eq('4  semeadura vira uma linha', 'criou 11 objetivos da etapa', describeTaskEvent('objectives_seeded', { count: 11 }))
eq('5  prazo posto', 'mudou o prazo de sem prazo para 30/09/2026', describeTaskEvent('due_date_changed', { from: null, to: '2026-09-30' }))
eq('6  prazo tirado', 'mudou o prazo de 30/09/2026 para sem prazo', describeTaskEvent('due_date_changed', { from: '2026-09-30', to: null }))
eq('7  etapa', 'moveu de “Layout” para “Perspectivas”', describeTaskEvent('phase_changed', { from: 'Layout', to: 'Perspectivas' }))
eq('8  responsável', 'passou a tarefa para Camila Nogueira', describeTaskEvent('responsible_changed', { from: null, to: 'Camila Nogueira' }))
eq('9  responsável removido', 'tirou o responsável da tarefa', describeTaskEvent('responsible_changed', { from: 'Camila', to: null }))
eq('10 status marcado', 'marcou o status “Em Revisão”', describeTaskEvent('operational_tag_changed', { from: null, to: 'Em Revisão' }))
eq('11 status tirado', 'tirou o status “Em Revisão”', describeTaskEvent('operational_tag_changed', { from: 'Em Revisão', to: null }))
eq('12 responsável do objetivo', 'pôs Larissa no objetivo “Planta”', describeTaskEvent('objective_assignee_added', { title: 'Planta', person: 'Larissa' }))
eq('13 prioridade', 'mudou a prioridade para Alta', describeTaskEvent('priority_changed', { from: 'medium', to: 'high' }))
eq('14 evento desconhecido não some', 'registrou uma alteração', describeTaskEvent('coisa_nova', {}))
eq('15 detalhes nulos não quebram', 'alterou a descrição', describeTaskEvent('description_changed', null))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
