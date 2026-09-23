// O modelo de objetivos padrão de cada etapa (migration 0099).
//
// COMO RODAR
//   npm run test:objectives
//
// POR QUE EXISTE
//   Os objetivos que a tarefa ganha ao entrar numa etapa saíram de uma constante
//   do código para o banco, editáveis em Configurações e com seções nomeadas.
//   Três coisas precisam continuar certas: quais objetivos a tarefa ainda não
//   tem (a regra do original), o nome da seção indo junto para o item, e as
//   recusas que a tela faz antes de mandar ao banco.

import {
  countObjectives,
  groupObjectivesByColumn,
  normalizeObjectiveGroups,
  objectiveGroupsError,
  sameObjectiveGroups,
} from '../src/features/kanban/objectives.ts'
import {
  groupChecklistBySection,
  missingChecklistItems,
} from '../src/features/projects/checklist-templates.ts'

let passed = 0
let failed = 0

function eq(name, esperado, observado) {
  const a = JSON.stringify(esperado)
  const b = JSON.stringify(observado)
  if (a === b) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}\n        esperado=${a}\n        observado=${b}`)
  }
}

console.log('\nObjetivos padrão por etapa\n')

const grupos = [
  { name: null, objectives: [{ title: 'Emitir RRT', is_required: true }] },
  {
    name: 'Detalhamentos',
    objectives: [
      { title: 'Esquadrias', is_required: true },
      { title: 'Piscina', is_required: false },
    ],
  },
]

const faltam = missingChecklistItems('construction_docs', grupos, [])
eq('1.1  tarefa sem itens ganha o modelo inteiro', ['Emitir RRT', 'Esquadrias', 'Piscina'], faltam.map((i) => i.title))
eq('1.2  o nome da seção vai para o item', [null, 'Detalhamentos', 'Detalhamentos'], faltam.map((i) => i.section))
eq('1.3  obrigatório vem do modelo', [true, true, false], faltam.map((i) => i.is_required))
eq('1.4  a ordem continua depois dos itens existentes', [1, 2, 3], faltam.map((i) => i.display_order))
eq('1.5  a etapa do item é a etapa de destino', ['construction_docs'], [...new Set(faltam.map((i) => i.phase))])

const parcial = missingChecklistItems('construction_docs', grupos, [{ title: 'Esquadrias' }, { title: 'Outro' }])
eq('2.1  título que a tarefa já tem não entra de novo', ['Emitir RRT', 'Piscina'], parcial.map((i) => i.title))
eq('2.2  e a ordem começa depois dos dois existentes', [3, 4], parcial.map((i) => i.display_order))

eq('3.1  etapa sem modelo não gera nada', [], missingChecklistItems('revision', undefined, []))
eq('3.2  modelo vazio não gera nada', [], missingChecklistItems('revision', [], []))

const porColuna = groupObjectivesByColumn(
  [
    { id: 's2', column_id: 'c1', name: 'Segunda', display_order: 2 },
    { id: 's1', column_id: 'c1', name: 'Primeira', display_order: 1 },
    { id: 's3', column_id: 'c1', name: 'Vazia', display_order: 3 },
  ],
  [
    { column_id: 'c1', section_id: 's2', title: 'B', is_required: true, display_order: 3 },
    { column_id: 'c1', section_id: null, title: 'Solto', is_required: false, display_order: 1 },
    { column_id: 'c1', section_id: 's1', title: 'A', is_required: true, display_order: 2 },
    { column_id: 'c2', section_id: null, title: 'Outra etapa', is_required: true, display_order: 1 },
  ],
)
eq('4.1  soltos primeiro, depois seções na ordem', [null, 'Primeira', 'Segunda', 'Vazia'], porColuna.get('c1').map((g) => g.name))
eq('4.2  cada objetivo na sua seção', [['Solto'], ['A'], ['B'], []], porColuna.get('c1').map((g) => g.objectives.map((o) => o.title)))
eq('4.3  etapas não se misturam', ['Outra etapa'], porColuna.get('c2').flatMap((g) => g.objectives.map((o) => o.title)))
eq('4.4  contagem ignora seções vazias', 3, countObjectives(porColuna.get('c1')))

eq(
  '5.1  normalizar apara e descarta objetivo em branco',
  [{ name: 'Docs', objectives: [{ title: 'RRT', is_required: true }] }],
  normalizeObjectiveGroups([{ name: '  Docs ', objectives: [{ title: ' RRT ', is_required: true }, { title: '   ', is_required: true }] }]),
)
eq('5.2  modelo válido não tem erro', null, objectiveGroupsError(grupos))
eq('5.3  seção sem nome é recusada', true, Boolean(objectiveGroupsError([{ name: '  ', objectives: [] }])))
eq(
  '5.4  seções com mesmo nome são recusadas, sem ligar para maiúsculas',
  true,
  Boolean(objectiveGroupsError([{ name: 'Docs', objectives: [] }, { name: 'docs', objectives: [] }])),
)
eq(
  '5.5  título repetido em seções diferentes é recusado',
  true,
  Boolean(
    objectiveGroupsError([
      { name: null, objectives: [{ title: 'RRT', is_required: true }] },
      { name: 'Docs', objectives: [{ title: 'RRT ', is_required: false }] },
    ]),
  ),
)

eq('6.1  modelo igual não pede gravação', true, sameObjectiveGroups(grupos, JSON.parse(JSON.stringify(grupos))))
eq(
  '6.2  grupo sem seção vazio não conta como mudança',
  true,
  sameObjectiveGroups([{ name: null, objectives: [] }], []),
)
eq(
  '6.3  trocar obrigatório conta como mudança',
  false,
  sameObjectiveGroups(grupos, [grupos[0], { ...grupos[1], objectives: [{ title: 'Esquadrias', is_required: false }, grupos[1].objectives[1]] }]),
)

const noCartao = groupChecklistBySection([
  { title: 'Solto 1', section: null },
  { title: 'A1', section: 'A' },
  { title: 'B1', section: 'B' },
  { title: 'Solto 2', section: null },
  { title: 'A2', section: 'A' },
])
eq('7.1  cartão: soltos primeiro, seções na ordem de aparição', [null, 'A', 'B'], noCartao.map((g) => g.name))
eq('7.2  cartão: itens de cada grupo', [['Solto 1', 'Solto 2'], ['A1', 'A2'], ['B1']], noCartao.map((g) => g.items.map((i) => i.title)))
eq('7.3  cartão: tarefa sem seção nenhuma é um grupo só', [null], groupChecklistBySection([{ title: 'x', section: null }]).map((g) => g.name))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
