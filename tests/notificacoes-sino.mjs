// As decisões do painel do sino que não dependem de rede (migrations 0120/0121).
//
// COMO RODAR
//   npm run test:notificacoes-sino
//
// O QUE ELE PROVA, e por que estas duas coisas e não outras
//   1. O AGRUPAMENTO POR DIA, inclusive a virada de dia. A faixa de dia é o
//      elemento de assinatura do painel aprovado, e ela existe por causa de um
//      comportamento do banco: a varredura de atraso roda de madrugada e grava
//      vários avisos no MESMO instante (0120). Se o agrupamento errar, o lote da
//      madrugada volta a ler como quinze avisos soltos — e erra em silêncio: a
//      tela continua renderizando, só com a faixa errada.
//
//      A virada de dia é o caso que nenhum teste pega por acaso. O mesmo aviso é
//      "Hoje" às 23h59 e "Ontem" às 00h01, e nada no TypeScript cobra isso. É
//      também a razão de `agora` ser parâmetro em agrupar.ts em vez de
//      `new Date()` escondido lá dentro.
//
//   2. A CONTAGEM DE NÃO LIDAS COM O CORTE EM "9+". O callout do protótipo:
//      acima de nove o número deixa de informar e passa a deformar o quadrado de
//      1,25rem do badge. E o zero não é "0" — é badge nenhum, porque ausência de
//      aviso tem que ser ausência de marca.
//
// O QUE ELE NÃO PROVA
//   Nada de RLS, de privilégio de coluna nem de palpite otimista: isso é
//   supabase/tests/notificacoes-rls.sql e os hooks. Aqui não há rede.

import {
  agruparPorDia,
  contagemDeAvisos,
  CONTADOR_MAXIMO,
  rotuloDaContagem,
  rotuloDaEspecie,
  rotuloDeQuando,
  rotuloDoContador,
  rotuloDoDia,
} from '../src/features/notifications/agrupar.ts'

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

/*
  TODAS AS DATAS SÃO LOCAIS, escritas sem deslocamento de propósito.

  `new Date('2026-10-27T10:00:00')` é dez da manhã no fuso de quem roda o teste,
  e `created_at` nos casos abaixo também. É isso que torna o teste independente
  de onde ele roda: o agrupamento é por DIA LOCAL, e um par de datas escrito em
  UTC passaria em Goiânia e falharia em Lisboa (ou o contrário), sem o teste
  estar errado.
*/
const aviso = (created_at, extra = {}) => ({
  id: created_at,
  kind: 'task_overdue',
  created_at,
  due_date: '2026-10-21',
  actor_name: null,
  ...extra,
})

console.log('\nRótulo de cada faixa de dia\n')

const TARDE_DE_HOJE = new Date('2026-10-27T15:00:00')

eq('1  o dia de hoje é "Hoje"', 'Hoje', rotuloDoDia('2026-10-27', TARDE_DE_HOJE))
eq('2  o dia anterior é "Ontem"', 'Ontem', rotuloDoDia('2026-10-26', TARDE_DE_HOJE))
eq('3  antes disso é dia/mês, sem ano', '23/10', rotuloDoDia('2026-10-23', TARDE_DE_HOJE))
/* Primeiro dia do mês: o rótulo não pode virar "1/10". */
eq('4  dia e mês com dois dígitos', '01/10', rotuloDoDia('2026-10-01', TARDE_DE_HOJE))
/* Virada de ano: "ontem" atravessa dezembro sem virar "Ontem" errado nem data. */
eq(
  '5  "Ontem" atravessa a virada do ano',
  'Ontem',
  rotuloDoDia('2025-12-31', new Date('2026-01-01T08:00:00')),
)
eq(
  '6  e o dia antes dele volta a ser data',
  '30/12',
  rotuloDoDia('2025-12-30', new Date('2026-01-01T08:00:00')),
)

console.log('\nA VIRADA DE DIA — o mesmo aviso, dois relógios\n')

/*
  O ponto do bloco: o dado NÃO muda, só o relógio de quem olha. Um aviso gravado
  às 23h59 do dia 26 é "Hoje" para quem abre o painel às 23h59 e "Ontem" para
  quem deixou a aba aberta e olha dez minutos depois.
*/
const QUASE_MEIA_NOITE = aviso('2026-10-26T23:59:00')

eq(
  '7  às 23h59 do dia 26, o aviso das 23h59 é "Hoje"',
  [{ chave: '2026-10-26', rotulo: 'Hoje', avisos: 1 }],
  agruparPorDia([QUASE_MEIA_NOITE], new Date('2026-10-26T23:59:00')).map((g) => ({
    chave: g.chave,
    rotulo: g.rotulo,
    avisos: g.avisos.length,
  })),
)
eq(
  '8  dez minutos depois, o MESMO aviso é "Ontem"',
  [{ chave: '2026-10-26', rotulo: 'Ontem', avisos: 1 }],
  agruparPorDia([QUASE_MEIA_NOITE], new Date('2026-10-27T00:09:00')).map((g) => ({
    chave: g.chave,
    rotulo: g.rotulo,
    avisos: g.avisos.length,
  })),
)

/*
  Dois avisos a dois minutos de distância, mas em dias diferentes: é o caso que
  um agrupamento "por proximidade de horário" erraria, e o que a varredura de
  madrugada produz de verdade quando ela atrasa alguns minutos.
*/
eq(
  '9  23h59 e 00h01 são DOIS dias, mesmo a dois minutos de distância',
  [
    { chave: '2026-10-27', rotulo: 'Hoje', avisos: 1 },
    { chave: '2026-10-26', rotulo: 'Ontem', avisos: 1 },
  ],
  agruparPorDia(
    [aviso('2026-10-27T00:01:00'), aviso('2026-10-26T23:59:00')],
    TARDE_DE_HOJE,
  ).map((g) => ({ chave: g.chave, rotulo: g.rotulo, avisos: g.avisos.length })),
)

console.log('\nO agrupamento\n')

eq('10  lista vazia não inventa faixa de dia', [], agruparPorDia([], TARDE_DE_HOJE))

/*
  O LOTE DA VARREDURA: três avisos com o MESMO `created_at`, que é exatamente o
  que a varredura diária grava (um único INSERT, um único `now()`). Eles têm que
  cair numa faixa só — é esse agrupamento que impede o lote de ler como spam.
*/
eq(
  '11  o lote da varredura (mesmo instante) vira UMA faixa',
  [{ chave: '2026-10-27', rotulo: 'Hoje', avisos: 3 }],
  agruparPorDia(
    [
      aviso('2026-10-27T06:00:00', { id: 'a' }),
      aviso('2026-10-27T06:00:00', { id: 'b' }),
      aviso('2026-10-27T06:00:00', { id: 'c' }),
    ],
    TARDE_DE_HOJE,
  ).map((g) => ({ chave: g.chave, rotulo: g.rotulo, avisos: g.avisos.length })),
)

eq(
  '12  três dias, três faixas, na ordem em que chegaram',
  [
    { rotulo: 'Hoje', ids: ['2026-10-27T09:12:00', '2026-10-27T06:00:00'] },
    { rotulo: 'Ontem', ids: ['2026-10-26T17:40:00'] },
    { rotulo: '23/10', ids: ['2026-10-23T11:05:00'] },
  ],
  agruparPorDia(
    [
      aviso('2026-10-27T09:12:00'),
      aviso('2026-10-27T06:00:00'),
      aviso('2026-10-26T17:40:00'),
      aviso('2026-10-23T11:05:00'),
    ],
    TARDE_DE_HOJE,
  ).map((g) => ({ rotulo: g.rotulo, ids: g.avisos.map((a) => a.id) })),
)

/*
  O agrupamento NÃO reordena. A ordem é a do banco
  (`created_at desc`, índice da 0120), e dia que reaparece depois de outro no
  meio gera DUAS faixas iguais de propósito: a faixa repetida mostra que a ordem
  quebrou, em vez de esconder o defeito juntando o que não é vizinho.
*/
eq(
  '13  dia que reaparece fora de ordem gera duas faixas, e não uma',
  ['Hoje', 'Ontem', 'Hoje'],
  agruparPorDia(
    [
      aviso('2026-10-27T09:00:00'),
      aviso('2026-10-26T09:00:00'),
      aviso('2026-10-27T07:00:00'),
    ],
    TARDE_DE_HOJE,
  ).map((g) => g.rotulo),
)

console.log('\nO contador do sino, e o corte em "9+"\n')

eq('14  zero não é "0": é badge nenhum', null, rotuloDoContador(0))
eq('15  uma não lida mostra "1"', '1', rotuloDoContador(1))
eq('16  nove ainda mostra o número', '9', rotuloDoContador(9))
eq('17  dez vira "9+"', '9+', rotuloDoContador(10))
eq('18  noventa e nove também é "9+"', '9+', rotuloDoContador(99))
eq('19  o corte é o CONTADOR_MAXIMO, e não um 9 solto no código', '9+', rotuloDoContador(CONTADOR_MAXIMO + 1))
/* Negativo só sai de bug de palpite otimista, e "-1" no badge seria o bug na
   cara de quem usa. Cai no mesmo caso do zero. */
eq('20  contagem negativa não desenha badge', null, rotuloDoContador(-1))

console.log('\nO complemento do título do painel\n')

eq('21  três não lidas, no plural', '· 3 não lidas', rotuloDaContagem(3, 7))
eq('22  uma não lida, no singular', '· 1 não lida', rotuloDaContagem(1, 7))
eq('23  com histórico e nada por ler: "tudo lido"', '· tudo lido', rotuloDaContagem(0, 7))
/* Quem nunca recebeu nada não está "em dia": o título fica seco, como no
   primeiro cartão da seção 5 do protótipo. */
eq('24  caixa que nunca recebeu nada não diz "tudo lido"', null, rotuloDaContagem(0, 0))

console.log('\nO contador da faixa de dia\n')

eq('25  um aviso, no singular', '1 aviso', contagemDeAvisos(1))
eq('26  três avisos, no plural', '3 avisos', contagemDeAvisos(3))

console.log('\nO rótulo de espécie, com quem atribuiu\n')

eq(
  '27  atraso não tem autor (o banco cobra isso num check)',
  'Tarefa em atraso',
  rotuloDaEspecie({ kind: 'task_overdue', actor_name: null }),
)
eq(
  '28  atribuição mostra quem atribuiu, depois da espécie',
  'Nova tarefa · Ana Souza',
  rotuloDaEspecie({ kind: 'task_assigned', actor_name: 'Ana Souza' }),
)
eq(
  '29  atribuição sem sessão conhecida é "Sistema", como no histórico do cartão',
  'Nova tarefa · Sistema',
  rotuloDaEspecie({ kind: 'task_assigned', actor_name: null }),
)

console.log('\nO "quando" de cada espécie\n')

/*
  O atraso mostra o PRAZO, e não a data da varredura. Aqui está a prova: a
  varredura rodou hoje (27/10) para um prazo de 21/10, que é o caso normal —
  ela pergunta "o que está vencido agora", não "o que venceu ontem".
*/
eq(
  '30  atraso mostra o prazo vencido, não o dia da varredura',
  'venceu 21/10',
  rotuloDeQuando(
    { kind: 'task_overdue', created_at: '2026-10-27T06:00:00', due_date: '2026-10-21' },
    TARDE_DE_HOJE,
  ),
)
/*
  `due_date` é coluna `date` e chega como "2026-10-01": lida como meia-noite em
  UTC, ela apareceria como 30/09 em Goiânia. É o mesmo defeito já corrigido em
  src/lib/format.ts, e aqui ele seria um prazo errado dentro de um aviso.
*/
eq(
  '31  prazo no primeiro dia do mês não escorrega para o mês anterior',
  'venceu 01/10',
  rotuloDeQuando(
    { kind: 'task_overdue', created_at: '2026-10-27T06:00:00', due_date: '2026-10-01' },
    TARDE_DE_HOJE,
  ),
)
eq(
  '32  atribuição de hoje mostra a hora',
  'hoje às 09:12',
  rotuloDeQuando(
    { kind: 'task_assigned', created_at: '2026-10-27T09:12:00', due_date: null },
    TARDE_DE_HOJE,
  ),
)
eq(
  '33  atribuição de ontem, idem',
  'ontem às 17:40',
  rotuloDeQuando(
    { kind: 'task_assigned', created_at: '2026-10-26T17:40:00', due_date: null },
    TARDE_DE_HOJE,
  ),
)
eq(
  '34  mais antiga mostra data e hora',
  '23/10 às 11:05',
  rotuloDeQuando(
    { kind: 'task_assigned', created_at: '2026-10-23T11:05:00', due_date: null },
    TARDE_DE_HOJE,
  ),
)

console.log(`\n${passed} passaram, ${failed} falharam\n`)
process.exit(failed === 0 ? 0 : 1)
