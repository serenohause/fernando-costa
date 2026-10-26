// As duas decisões da fila de leads que não dependem de rede (migration 0112).
//
// O QUE ELE PROVA
//   1. `camposParaGravar` respeita o check `product_leads_new_has_no_contact`.
//      É a regra com consequência: voltar um lead para "Novo" sem apagar
//      `contacted_at` é 23514 no banco, e o erro apareceria como falha de
//      servidor na cara de quem só mexeu num seletor. O caminho inverso também
//      importa — mudar de Contatado para Qualificado NÃO pode reescrever quando
//      o contato aconteceu.
//   2. A busca varre e-mail, nome e escritório, sem acento e sem caixa, com a
//      mesma regra do banco.
//
// COMO RODAR
//   npm run test:leads-fila

import { camposParaGravar, filterLeads } from '../src/features/leads/fila.ts'

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

const AGORA = new Date('2026-10-26T12:00:00.000Z')

console.log('\nO que vai para o UPDATE\n')

eq(
  '1  marcar como Contatado nasce com a data de agora',
  { status: 'contacted', contacted_at: '2026-10-26T12:00:00.000Z' },
  camposParaGravar({ contacted_at: null }, { status: 'contacted' }, AGORA),
)
eq(
  '2  quem já tem data de contato mantém a data dela',
  { status: 'qualified' },
  camposParaGravar({ contacted_at: '2026-10-20T09:30:00.000Z' }, { status: 'qualified' }, AGORA),
)
eq(
  '3  voltar para Novo apaga a data (senão o banco recusa com 23514)',
  { status: 'new', contacted_at: null },
  camposParaGravar({ contacted_at: '2026-10-20T09:30:00.000Z' }, { status: 'new' }, AGORA),
)
eq(
  '4  Novo que já estava sem data continua sem',
  { status: 'new', contacted_at: null },
  camposParaGravar({ contacted_at: null }, { status: 'new' }, AGORA),
)
eq(
  '5  Descartado também marca contato, se ainda não havia',
  { status: 'discarded', contacted_at: '2026-10-26T12:00:00.000Z' },
  camposParaGravar({ contacted_at: null }, { status: 'discarded' }, AGORA),
)
eq(
  '6  salvar anotação NÃO mexe na data de contato',
  { notes: 'ligou, quer demo' },
  camposParaGravar({ contacted_at: null }, { notes: 'ligou, quer demo' }, AGORA),
)
eq(
  '7  anotação em lead já contatado também não mexe',
  { notes: null },
  camposParaGravar({ contacted_at: '2026-10-20T09:30:00.000Z' }, { notes: null }, AGORA),
)

console.log('\nRecorte da fila\n')

const lead = (campos) => ({
  email: 'x@y.test',
  name: null,
  office_name: null,
  status: 'new',
  ...campos,
})

const FILA = [
  lead({ email: 'ana@prado.test', name: 'Ana Prado', office_name: 'Prado Arquitetura' }),
  lead({ email: 'bruno@sintonia.test', name: 'Brúno Júnior', status: 'contacted' }),
  lead({ email: 'carla@conceicao.test', office_name: 'Conceição e Associados', status: 'qualified' }),
  lead({ email: 'davi@zz.test', status: 'discarded' }),
]

const so = (resultado) => resultado.map((l) => l.email)

eq('1  sem filtro, a fila inteira', 4, filterLeads(FILA, { status: 'all', search: '' }).length)
eq(
  '2  filtro de situação recorta',
  ['bruno@sintonia.test'],
  so(filterLeads(FILA, { status: 'contacted', search: '' })),
)
eq(
  '3  busca acha pelo e-mail',
  ['ana@prado.test'],
  so(filterLeads(FILA, { status: 'all', search: 'ana@' })),
)
eq(
  '4  busca acha pelo nome da pessoa',
  ['ana@prado.test'],
  so(filterLeads(FILA, { status: 'all', search: 'Prado' })),
)
eq(
  '5  busca acha pelo nome do escritório',
  ['carla@conceicao.test'],
  so(filterLeads(FILA, { status: 'all', search: 'associados' })),
)
// Mesma dor da migration 0105: "Junior" e "Júnior" são a mesma pessoa aqui.
eq(
  '6  busca sem acento acha o nome com acento',
  ['bruno@sintonia.test'],
  so(filterLeads(FILA, { status: 'all', search: 'bruno junior'.split(' ')[1] })),
)
eq(
  '7  busca com acento acha o texto sem acento',
  ['carla@conceicao.test'],
  so(filterLeads(FILA, { status: 'all', search: 'Conceição' })),
)
eq(
  '8  espaço em volta do termo não quebra a busca',
  ['ana@prado.test'],
  so(filterLeads(FILA, { status: 'all', search: '  prado  ' })),
)
eq(
  '9  situação e busca valem ao mesmo tempo',
  [],
  so(filterLeads(FILA, { status: 'discarded', search: 'prado' })),
)
eq(
  '10 termo que não existe devolve nada',
  [],
  so(filterLeads(FILA, { status: 'all', search: 'inexistente' })),
)

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
