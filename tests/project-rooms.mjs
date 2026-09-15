// Ambientes do projeto e os objetivos de ambiente no quadro (migration 0100).
//
// COMO RODAR
//   npm run test:project-rooms

import { nextRoomName, projectRoomsError } from '../src/features/projects/rooms.ts'
import {
  buildChecklistSources,
  missingChecklistItems,
  missingItemsForTask,
  ROOMS_SECTION,
} from '../src/features/projects/checklist-templates.ts'

let passed = 0
let failed = 0
function eq(name, esperado, observado) {
  const a = JSON.stringify(esperado)
  const b = JSON.stringify(observado)
  if (a === b) { passed += 1; console.log(`PASS  ${name}`) }
  else { failed += 1; console.log(`FAIL  ${name}\n        esperado=${a}\n        observado=${b}`) }
}

console.log('\nAmbientes do projeto\n')

const salas = [{ id: 'r1', name: 'Sala' }, { id: 'r2', name: 'Cozinha' }]
const modelo = [{ name: null, objectives: [{ title: 'Sala', is_required: true }] }]

const novos = missingChecklistItems('layout', modelo, [], salas)
eq('1.1  modelo primeiro, ambientes depois', ['Sala', 'Sala', 'Cozinha'], novos.map((i) => i.title))
eq('1.2  ambientes na seção Ambientes, obrigatórios, com room_id',
  [[ROOMS_SECTION, true, 'r1'], [ROOMS_SECTION, true, 'r2']],
  novos.filter((i) => i.room_id).map((i) => [i.section, i.is_required, i.room_id]))
eq('1.3  objetivo do modelo não tem room_id', [null], novos.filter((i) => !i.room_id).map((i) => i.room_id))

const jaTem = [{ title: 'Sala', room_id: 'r1', phase: 'layout' }]
eq('2.1  ambiente já marcado na mesma etapa não repete', ['Sala', 'Cozinha'],
  missingChecklistItems('layout', modelo, jaTem, salas).map((i) => i.title))
eq('2.2  objetivo de ambiente "Sala" não bloqueia o objetivo do modelo "Sala"', 1,
  missingChecklistItems('layout', modelo, jaTem, salas).filter((i) => !i.room_id).length)
eq('2.3  em OUTRA etapa o ambiente entra de novo', ['r1', 'r2'],
  missingChecklistItems('renderings', [], jaTem, salas).map((i) => i.room_id))
eq('2.4  objetivo comum antigo sem room_id ainda bloqueia pelo título', 0,
  missingChecklistItems('layout', modelo, [{ title: 'Sala' }], []).length)

const sources = buildChecklistSources(
  [
    { key: 'layout', objectiveGroups: [], shows_project_rooms: true },
    { key: 'briefing', objectiveGroups: [], shows_project_rooms: false },
  ],
  [
    { id: 'b', project_id: 'p1', name: 'Quarto', display_order: 2 },
    { id: 'a', project_id: 'p1', name: 'Sala', display_order: 1 },
    { id: 'c', project_id: 'p2', name: 'Varanda', display_order: 1 },
  ],
)
eq('3.1  etapa que mostra ambientes gera os do projeto, na ordem', ['Sala', 'Quarto'],
  missingItemsForTask({ project_id: 'p1', checklist: [] }, 'layout', sources).map((i) => i.title))
eq('3.2  etapa que NÃO mostra não gera ambiente', [],
  missingItemsForTask({ project_id: 'p1', checklist: [] }, 'briefing', sources))
eq('3.3  tarefa sem projeto não gera ambiente', [],
  missingItemsForTask({ project_id: null, checklist: [] }, 'layout', sources))
eq('3.4  projetos não se misturam', ['Varanda'],
  missingItemsForTask({ project_id: 'p2', checklist: [] }, 'layout', sources).map((i) => i.title))

eq('4.1  nome repetido é recusado, sem ligar para maiúsculas', true,
  Boolean(projectRoomsError([{ name: 'Quarto' }, { name: ' quarto ' }])))
eq('4.2  linhas em branco não contam como repetidas', null, projectRoomsError([{ name: '' }, { name: '  ' }]))
eq('4.3  sugestão livre fica como está', 'Cozinha', nextRoomName('Cozinha', [{ name: 'Sala' }]))
eq('4.4  sugestão repetida vira 2', 'Quarto 2', nextRoomName('Quarto', [{ name: 'Quarto' }]))
eq('4.5  e 3 quando 2 já existe', 'Quarto 3', nextRoomName('Quarto', [{ name: 'Quarto' }, { name: 'quarto 2' }]))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
