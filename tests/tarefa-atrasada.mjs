/*
  "ATRASADA" QUER DIZER A MESMA COISA NA TELA E NO AVISO.

  COMO RODAR
    npm run test:tarefa-atrasada

  POR QUE ESTE ARQUIVO EXISTE
    `isTaskOverdue` decide o crachá vermelho do cartão do kanban E o "projeto em
    risco" do Painel Executivo. Até hoje ela não tinha teste nenhum, e carregava
    a comparação literal do sistema original: `new Date(due_date) < now`.

    `due_date` é coluna `date`, e `new Date("2026-10-28")` é meia-noite EM UTC.
    Em Goiânia (UTC-3) isso fazia a tarefa que vence HOJE contar como atrasada
    desde as 21h de ontem.

    Enquanto só a tela usava essa régua, era dívida consciente. O módulo de
    notificações criou uma segunda, no banco (`due_date < current_date`,
    migration 0120), e o desencontro virou relato: uma usuária viu o crachá
    vermelho e não recebeu aviso nenhum, porque a tarefa vencia naquele mesmo
    dia. Ver vermelho e não receber nada.

    Agora as duas dizem o mesmo, e este arquivo é o que impede alguém de
    "restaurar o comportamento do original" sem perceber o que está desfazendo.

  O QUE ELE PROVA
    A virada do dia, que é onde o defeito morava: às 21h de Goiânia, a tarefa
    que vence amanhã continua NÃO atrasada. Com a régua antiga, ela já estaria
    vermelha.
*/

import { isTaskOverdue } from '../src/features/projects/list.ts'

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  if (String(esperado) === String(obtido)) {
    console.log(`PASS  ${nome.padEnd(56)} ${esperado}`)
    ok++
  } else {
    console.log(`FAIL  ${nome.padEnd(56)} esperado=${esperado} obtido=${obtido}`)
    falhas++
  }
}

const tarefa = (due_date, status = 'in_progress') => ({ status, due_date })

/* Meio-dia local: longe de qualquer borda, para o caso medir a REGRA e não o
   fuso de quem roda o teste. */
const hoje = new Date('2026-10-28T12:00:00')

caso('venceu ontem: atrasada', 'true', isTaskOverdue(tarefa('2026-10-27'), hoje))
caso('vence HOJE: ainda NAO atrasada', 'false', isTaskOverdue(tarefa('2026-10-28'), hoje))
caso('vence amanha: nao atrasada', 'false', isTaskOverdue(tarefa('2026-10-29'), hoje))
caso('sem prazo: nao atrasada', 'false', isTaskOverdue(tarefa(null), hoje))
caso('concluida, mesmo vencida: nao atrasada', 'false',
  isTaskOverdue(tarefa('2026-01-01', 'completed'), hoje))

/*
  A BORDA QUE DEU ORIGEM AO DEFEITO. 21h em Goiânia é meia-noite do dia seguinte
  em UTC. Com `new Date(due_date) < now`, a tarefa de amanhã passava a ser
  "atrasada" neste instante. Estes dois casos morrem se alguém reverter.
*/
const vinteEUma = new Date('2026-10-28T21:00:00')
caso('as 21h: a tarefa de amanha NAO esta atrasada', 'false',
  isTaskOverdue(tarefa('2026-10-29'), vinteEUma))
caso('as 21h: a de hoje tambem nao', 'false', isTaskOverdue(tarefa('2026-10-28'), vinteEUma))
caso('as 21h: a de ontem continua atrasada', 'true',
  isTaskOverdue(tarefa('2026-10-27'), vinteEUma))

/*
  E O ALINHAMENTO COM O BANCO, que é o motivo da mudança. A varredura de
  notificação usa `due_date < current_date` (migration 0120). Para cada data em
  volta de hoje, a tela e o aviso precisam concordar.
*/
const comoOBanco = (due) => due < '2026-10-28'
let divergencias = 0
for (const due of ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']) {
  if (isTaskOverdue(tarefa(due), hoje) !== comoOBanco(due)) divergencias++
}
caso('a tela concorda com a varredura do banco em todas as datas', '0', divergencias)

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
