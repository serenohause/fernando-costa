// A fase do projeto sai das tarefas, e a escada agora vem do quadro.
//
// COMO RODAR
//   npm run test:project-phase
//
// POR QUE ESTE ARQUIVO EXISTE
//   `calculateProjectPhase` varre a escada da etapa mais avançada para a mais
//   inicial e, quando nenhuma casa, cai em `return 'finished'`. Etapa que existe
//   e falta na escada não vira "etapa desconhecida": vira PROJETO CONCLUÍDO. Um
//   projeto com trabalho em andamento é calculado como terminado, some dos
//   painéis de projetos ativos e entra na contagem de entregues.
//
//   Já aconteceu duas vezes com a escada escrita à mão. A migration 0061
//   acrescentou `under_construction` e precisou de um parágrafo explicando esse
//   estrago. A 0079 acrescentou `preliminary_study` e `preliminary_design` e
//   repetiu o erro — 4 projetos do escritório seriam calculados como concluídos.
//
//   A MIGRATION 0094 MUDOU A NATUREZA DO RISCO. A escada deixou de ser uma lista
//   no código e passou a ser a ordem do quadro (`display_order` de
//   `kanban_columns`), recebida como argumento. A antiga pergunta — "alguém
//   esqueceu de acrescentar a fase nova aqui?" — não pode mais ser respondida
//   errado, porque não há mais lista para esquecer.
//
//   O risco que SOBROU é outro, e é o que este arquivo passa a vigiar: a escada
//   chega de fora, então chegar VAZIA ou INCOMPLETA produz exatamente o mesmo
//   estrago de antes, agora em silêncio e em tempo de execução. Os casos abaixo
//   fixam o comportamento nos dois extremos.
//
// AS DUAS AUSÊNCIAS LEGÍTIMAS NA ESCADA
//   `not_started`   fora de propósito: tarefa não iniciada não puxa o projeto de
//                   volta para o começo (regra do original).
//   `finished`      é o resultado da função, não entrada dela.
//   `awaiting_client` está na escada mas é tratada ANTES da varredura, e vence
//                   tudo — é bloqueio, não degrau.

/*
  O módulo é importado DE VERDADE, e não lido como texto: os dois imports dele
  são `import type`, que o Node apaga ao interpretar TypeScript, então o alias
  `@/` nunca chega a ser resolvido. É o que permite testar comportamento em vez
  de conferir o formato de um array.
*/
import { calculateProjectPhase, allTasksCompleted } from '../src/features/projects/project-phase.ts'
import { PROJECT_PHASE } from '../src/lib/enums.ts'

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

function eq(name, esperado, observado) {
  check(name, esperado === observado, `esperado=${esperado} observado=${observado}`)
}

console.log('\nFase do projeto a partir das tarefas\n')

/* A escada padrão: a ordem que a migration 0093 semeia em todo escritório. */
const ESCADA = Object.keys(PROJECT_PHASE).filter((fase) => fase !== 'post_approval')

const t = (phase, status = 'in_progress') => ({ project_id: 'p1', phase, status })

// 1. As quatro regras do original ------------------------------------------

eq('1.1  projeto sem tarefa nenhuma está em "Não iniciado"', 'not_started',
  calculateProjectPhase('p1', [], ESCADA))

eq('1.2  a etapa é a mais avançada com tarefa aberta', 'renderings',
  calculateProjectPhase('p1', [t('briefing'), t('renderings'), t('layout')], ESCADA))

/* Regra 2 do original: esperar o cliente é bloqueio, não degrau — vence até
   uma tarefa em obra, que é a etapa mais avançada que existe. */
eq('1.3  "Aguardando Cliente" vence a etapa mais avançada', 'awaiting_client',
  calculateProjectPhase('p1', [t('under_construction'), t('awaiting_client')], ESCADA))

eq('1.4  mas só enquanto a tarefa não está concluída', 'under_construction',
  calculateProjectPhase(
    'p1',
    [t('under_construction'), t('awaiting_client', 'completed')],
    ESCADA,
  ))

eq('1.5  tudo concluído é "Finalizado"', 'finished',
  calculateProjectPhase('p1', [t('layout', 'completed'), t('briefing', 'completed')], ESCADA))

eq('1.6  tarefa NÃO iniciada não puxa o projeto de volta ao começo', 'layout',
  calculateProjectPhase('p1', [t('not_started'), t('layout')], ESCADA))

eq('1.7  tarefa de outro projeto não conta', 'not_started',
  calculateProjectPhase('p1', [{ project_id: 'p2', phase: 'layout', status: 'in_progress' }], ESCADA))

// 2. A ESCADA VEM DE FORA — o risco que a 0094 criou ------------------------

/* A etapa criada pelo escritório funciona sem que ninguém edite código: é isso
   que a migration 0094 comprou, e é o caso que prova que comprou mesmo. */
eq('2.1  etapa criada pelo escritório entra na escada', 'aprovacao_cliente',
  calculateProjectPhase('p1', [t('layout'), t('aprovacao_cliente')], [
    'not_started', 'briefing', 'layout', 'aprovacao_cliente', 'finished',
  ]))

/* A ORDEM DO QUADRO decide quem vence, e não a ordem do enum. Aqui `briefing`
   foi posto DEPOIS de `layout` pelo escritório — e passa a vencer. */
eq('2.2  quem vence é a ordem do quadro, não a do enum', 'briefing',
  calculateProjectPhase('p1', [t('briefing'), t('layout')], [
    'not_started', 'layout', 'briefing', 'finished',
  ]))

/*
  O MODO DE FALHA NOVO, e a razão de `syncProjectFromTasks` abortar quando não
  consegue ler o quadro: com a escada vazia, um projeto cheio de trabalho aberto
  é calculado como CONCLUÍDO. A função não tem como saber que a lista chegou
  vazia por engano — quem precisa recusar é quem a chama.
*/
eq('2.3  escada VAZIA calcula projeto aberto como concluído (por isso quem chama aborta antes)',
  'finished', calculateProjectPhase('p1', [t('layout'), t('renderings')], []))

/* Mesmo estrago, versão parcial: a etapa que falta na escada é ignorada. */
eq('2.4  etapa fora da escada é ignorada na varredura', 'briefing',
  calculateProjectPhase('p1', [t('briefing'), t('renderings')], [
    'not_started', 'briefing', 'finished',
  ]))

// 3. "Todas concluídas" -----------------------------------------------------

check('3.1  projeto sem tarefa nenhuma NÃO conta como concluído',
  allTasksCompleted('p1', []) === false, 'devolveu true')

check('3.2  CONTROLE: com todas concluídas, conta',
  allTasksCompleted('p1', [t('layout', 'completed')]) === true, 'devolveu false')

check('3.3  uma aberta basta para não estar concluído',
  allTasksCompleted('p1', [t('layout', 'completed'), t('briefing')]) === false, 'devolveu true')

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
