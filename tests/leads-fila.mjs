// As duas decisões da fila de leads que não dependem de rede (migration 0112).
//
// O QUE ELE PROVA
//   1. `camposParaGravar` respeita o check `product_leads_new_has_no_contact`.
//      É a regra com consequência: voltar um lead para "Novo" sem apagar
//      `contacted_at` é 23514 no banco, e o erro apareceria como falha de
//      servidor na cara de quem só mexeu num seletor. O caminho inverso também
//      importa — mudar de Contatado para Qualificado NÃO pode reescrever quando
//      o contato aconteceu.
//   2. A busca varre e-mail, nome, telefone e escritório, sem acento e sem
//      caixa, com a mesma regra do banco. O telefone tem comparação por dígito
//      porque chega mascarado da página: sem ela, quem digita "62999" não acha
//      "(62) 99999-9999", e o campo fica na tela sem servir para procurar.
//   3. `linkWhatsapp` monta o endereço de contato, ou devolve nulo quando não
//      há telefone utilizável. O nulo é a parte com consequência: lead gravado
//      antes da migration 0124 não tem telefone, e um botão montado de todo
//      jeito abriria o WhatsApp num número que não existe.
//
// COMO RODAR
//   npm run test:leads-fila

import { camposParaGravar, filterLeads, linkWhatsapp } from '../src/features/leads/fila.ts'

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
  phone: null,
  status: 'new',
  ...campos,
})

const FILA = [
  lead({
    email: 'ana@prado.test',
    name: 'Ana Prado',
    office_name: 'Prado Arquitetura',
    phone: '(62) 99888-7766',
  }),
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
eq(
  '11 busca acha pelo telefone escrito com a máscara',
  ['ana@prado.test'],
  so(filterLeads(FILA, { status: 'all', search: '(62) 99888' })),
)
// O CASO QUE JUSTIFICA A COMPARAÇÃO POR DÍGITO. O valor no banco tem parêntese,
// espaço e hífen; quem copia o número de outro lugar digita só os dígitos. Sem
// o segundo caminho de comparação, isto devolve lista vazia.
eq(
  '12 busca acha pelo telefone digitado só com dígitos',
  ['ana@prado.test'],
  so(filterLeads(FILA, { status: 'all', search: '62998887766' })),
)
eq(
  '13 pedaço do número, sem DDD, também acha',
  ['ana@prado.test'],
  so(filterLeads(FILA, { status: 'all', search: '998887' })),
)
eq(
  '14 número que ninguém tem não acha lead sem telefone',
  [],
  so(filterLeads(FILA, { status: 'all', search: '11911112222' })),
)

console.log('\nLink de WhatsApp\n')

const MENSAGEM_ANA =
  'Olá, Ana! Aqui é da equipe do HausOne. Vi que você deixou seu contato no nosso site e vim conversar com você.'

eq(
  '1  celular com DDD ganha o 55 e a mensagem pronta',
  `https://wa.me/5562998887766?text=${encodeURIComponent(MENSAGEM_ANA)}`,
  linkWhatsapp({ phone: '(62) 99888-7766', name: 'Ana Prado' }),
)
eq(
  '2  a saudação usa só o primeiro nome',
  true,
  linkWhatsapp({ phone: '62998887766', name: 'Ana Carolina Prado' }).includes(
    encodeURIComponent('Olá, Ana!'),
  ),
)
eq(
  '3  sem nome, a mensagem abre sem saudação pessoal',
  true,
  linkWhatsapp({ phone: '62998887766', name: null }).includes(encodeURIComponent('Olá! Aqui é')),
)
eq(
  '4  fixo de 10 dígitos também vale',
  true,
  linkWhatsapp({ phone: '(62) 3222-1100', name: null }).startsWith('https://wa.me/556232221100?'),
)
// O 55 NÃO ENTRA DUAS VEZES. Número já em formato internacional passa como está;
// com o 55 colado na frente viraria 5555..., que não é número de ninguém.
eq(
  '5  número que já tem o código do país passa inteiro',
  true,
  linkWhatsapp({ phone: '+55 62 99888-7766', name: null }).startsWith('https://wa.me/5562998887766?'),
)
// OS QUATRO CASOS DE NULO. Cada um deles, montado de todo jeito, daria um botão
// que abre o WhatsApp num número inexistente.
eq('6  sem telefone não há link', null, linkWhatsapp({ phone: null, name: 'Ana' }))
eq('7  telefone vazio não há link', null, linkWhatsapp({ phone: '', name: 'Ana' }))
eq('8  número curto demais não há link', null, linkWhatsapp({ phone: '(62) 9988', name: 'Ana' }))
eq(
  '9  número comprido demais não há link',
  null,
  linkWhatsapp({ phone: '62998887766001122', name: 'Ana' }),
)
eq(
  '10 doze dígitos que não começam em 55 não há link',
  null,
  linkWhatsapp({ phone: '112233445566', name: 'Ana' }),
)

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
