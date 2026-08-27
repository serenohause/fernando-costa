// Toda fase que uma TAREFA pode ter precisa estar na escada de cálculo.
//
// COMO RODAR
//   npm run test:project-phase
//
// POR QUE ESTE ARQUIVO EXISTE
//   `calculateProjectPhase` varre `ADVANCED_TO_INITIAL` da fase mais avançada
//   para a mais inicial e, quando nenhuma casa, cai em `return 'finished'`.
//   Fase que existe no enum e falta na lista não vira "fase desconhecida": vira
//   PROJETO CONCLUÍDO. Um projeto com trabalho em andamento é calculado como
//   terminado, some dos painéis de projetos ativos e entra na contagem de
//   entregues.
//
//   Já aconteceu duas vezes. A migration 0061 acrescentou `under_construction` e
//   precisou de um parágrafo explicando esse mesmo estrago. A 0079 acrescentou
//   `preliminary_study` e `preliminary_design` e repetiu o erro — 4 projetos do
//   escritório, cujas únicas tarefas abertas estão em "Estudo preliminar",
//   seriam calculados como concluídos. Duas vezes é padrão, não descuido.
//
//   Nada cobra isso: o TypeScript aceita uma lista incompleta de um union, o
//   banco aceita a fase, e a tela não erra — só mostra o número errado.
//
// AS QUATRO AUSÊNCIAS LEGÍTIMAS
//   `not_started`   fora de propósito: tarefa não iniciada não puxa o projeto de
//                   volta para o começo (regra do original).
//   `awaiting_client` tratada ANTES da varredura, e vence tudo — é bloqueio, não
//                   degrau.
//   `finished`      é o resultado da função, não entrada dela.
//   `post_approval` `tasks_phase_no_post_approval_check` (0049) recusa o valor em
//                   tarefa, então nenhuma tarefa chega nele.

/*
  Só `enums.ts` é importado. `project-phase.ts` usa o alias `@/`, que o Vite
  resolve e o Node não — importá-lo aqui exigiria um resolvedor só para o teste.
  O que ele exporta e que interessa (`PHASE_ORDER`) é `Object.keys(PROJECT_PHASE)`,
  reproduzido abaixo em uma linha.
*/
import { PROJECT_PHASE } from '../src/lib/enums.ts'
import { readFileSync } from 'node:fs'

const PHASE_ORDER = Object.keys(PROJECT_PHASE)

let passed = 0
let failed = 0

function check(name, ok, detail) {
  if (ok) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name} — ${detail}`)
  }
}

console.log('\nEscada de fases do cálculo de fase do projeto\n')

/*
  A lista é lida do ARQUIVO, e não importada: `ADVANCED_TO_INITIAL` não é
  exportada, e exportá-la só para o teste alargaria a superfície do módulo por
  causa da ferramenta. O recorte entre colchetes é estável e o teste falha alto
  se ele mudar de forma.
*/
const fonte = readFileSync(new URL('../src/features/projects/project-phase.ts', import.meta.url), 'utf8')
const bloco = fonte.match(/const ADVANCED_TO_INITIAL: ProjectPhase\[\] = \[([\s\S]*?)\]/)
if (!bloco) {
  console.error('\n  ABORTADO: não achei ADVANCED_TO_INITIAL em project-phase.ts.')
  console.error('  Sem ela este teste não afirma nada — e passar em silêncio seria pior.\n')
  process.exit(1)
}
const escada = [...bloco[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

const FORA_DE_PROPOSITO = ['not_started', 'awaiting_client', 'finished', 'post_approval']
const devemEstar = Object.keys(PROJECT_PHASE).filter((fase) => !FORA_DE_PROPOSITO.includes(fase))

const faltando = devemEstar.filter((fase) => !escada.includes(fase))
check(
  '1.1  toda fase de tarefa está na escada',
  faltando.length === 0,
  `fora da escada: ${faltando.join(', ')}. Projeto cuja única tarefa aberta ` +
    'estiver numa delas será calculado como CONCLUÍDO.',
)

const sobrando = escada.filter((fase) => !devemEstar.includes(fase))
check(
  '1.2  a escada não inventa fase que o enum não tem',
  sobrando.length === 0,
  `na escada e fora do enum (ou fora de propósito): ${sobrando.join(', ')}`,
)

/*
  1.3 guarda a ORDEM, que é o que decide qual fase vence quando o projeto tem
  tarefas abertas em duas. A escada precisa ser o enum de trás para frente: o
  enum é escrito na ordem do fluxo, e a varredura vai da mais avançada para a
  mais inicial.
*/
const esperada = PHASE_ORDER.filter((fase) => devemEstar.includes(fase)).reverse()
check(
  '1.3  a ordem é a do fluxo, invertida',
  JSON.stringify(escada) === JSON.stringify(esperada),
  `escada=${escada.join(' > ')}\n        esperada=${esperada.join(' > ')}`,
)

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
