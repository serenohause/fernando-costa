/* Caminho relativo com extensão, e não o apelido "@/": este módulo é importado
   direto pelo node em tests/notificacoes-sino.mjs, e o node não conhece o
   apelido do Vite. Mesma solução de src/features/leads/fila.ts. Importação de
   TIPO pode continuar sem extensão, porque ela é apagada antes de rodar. */
import { format, parseISO, subDays } from 'date-fns'
import type { NotificationRow } from './types'

/*
  AS DECISÕES DO PAINEL DO SINO QUE NÃO DEPENDEM DE REDE.

  Estão fora dos componentes e fora dos hooks por um motivo prático: são
  decisões de CALENDÁRIO e de CONTAGEM, as duas erram em silêncio, e as duas são
  conferíveis sem banco (tests/notificacoes-sino.mjs). Nada aqui importa o
  client do Supabase.

  A FAIXA DE DIA É O ELEMENTO DE ASSINATURA do painel aprovado
  (prototypes/notificacoes-sino.html), e ela existe por causa de um
  comportamento do banco: o aviso de atraso vem de uma varredura diária que roda
  de madrugada (migration 0120), então vários avisos chegam juntos, no mesmo
  instante, e sem agrupamento isso leria como spam. Agrupado por dia, lê como um
  lote — que é o que é.
*/

/*
  O dia de um aviso é o dia LOCAL de quem está olhando.

  `created_at` é timestamptz e chega com o deslocamento ("...+00:00"), então
  `parseISO` dá o instante certo e `format` o traduz para o fuso do navegador.
  Agrupar pelo dia em UTC jogaria o aviso das 21h de Goiânia para "amanhã", e a
  faixa "Hoje" apareceria vazia enquanto a de amanhã já tivesse linha.
*/
function diaLocal(instante: string): string {
  return format(parseISO(instante), 'yyyy-MM-dd')
}

export type GrupoDeDia<T> = {
  /* A chave é o dia em 'yyyy-MM-dd' — serve de `key` do React e de identidade
     estável do grupo, que o rótulo ("Hoje") não é: ele muda à meia-noite. */
  chave: string
  rotulo: string
  avisos: T[]
}

/*
  "Hoje", "Ontem", "23/10" — os três rótulos que o protótipo desenha.

  A VIRADA DE DIA É O CASO QUE IMPORTA, e é por isso que `agora` é parâmetro em
  vez de `new Date()` lá dentro: o mesmo aviso é "Hoje" antes da meia-noite e
  "Ontem" depois dela, e um teste que não controla o relógio não consegue
  provar isso.

  Sem ano no terceiro rótulo, como no protótipo. É consequência aceita de o
  painel ser o histórico inteiro (não existe tela "Ver todas"): aviso de mais de
  um ano atrás mostra "23/10" sem dizer de que ano. Hoje nenhum escritório tem
  histórico tão longo — a tabela nasceu na 0120.
*/
export function rotuloDoDia(chave: string, agora: Date): string {
  if (chave === format(agora, 'yyyy-MM-dd')) return 'Hoje'
  if (chave === format(subDays(agora, 1), 'yyyy-MM-dd')) return 'Ontem'
  return format(parseISO(chave), 'dd/MM')
}

/*
  A lista agrupada por dia, NA ORDEM EM QUE CHEGOU.

  A consulta vem em `created_at desc` (é o índice
  `notifications_tenant_id_recipient_id_created_at_idx`, migration 0120), e esta
  função não reordena nada: ela só corta a fita onde o dia muda. Ordenar aqui
  seria uma segunda regra de ordem, divergindo da do banco sem nada na tela
  explicando a diferença.

  Genérica em T, e não presa a `NotificationRow`, porque o que ela usa é uma
  coluna só — o que também é o que permite ao teste montar um objeto de duas
  chaves em vez de uma linha inteira.
*/
export function agruparPorDia<T extends { created_at: string }>(
  avisos: T[],
  agora: Date = new Date(),
): GrupoDeDia<T>[] {
  const grupos: GrupoDeDia<T>[] = []

  for (const aviso of avisos) {
    const chave = diaLocal(aviso.created_at)
    const ultimo = grupos[grupos.length - 1]

    /* Compara só com o ÚLTIMO grupo, e não com todos: dia que reaparece depois
       de outro dia no meio seria lista fora de ordem, e aí a faixa repetida é a
       informação honesta — melhor duas faixas "23/10" do que esconder que a
       ordem quebrou. */
    if (ultimo && ultimo.chave === chave) {
      ultimo.avisos.push(aviso)
      continue
    }

    grupos.push({ chave, rotulo: rotuloDoDia(chave, agora), avisos: [aviso] })
  }

  return grupos
}

/*
  O TETO DO CONTADOR.

  "A contagem é limitada a 9+: acima disso o número deixa de informar e passa a
  deformar o quadrado" — o callout do protótipo, e o quadrado é literal: o badge
  de QuickActions.tsx é `h-5 w-5`, um quadrado de 1,25rem.
*/
export const CONTADOR_MAXIMO = 9

/*
  O que vai escrito dentro do badge, ou `null` quando não há badge.

  `null` E NÃO "0": o protótipo é explícito em que ausência de aviso é ausência
  de MARCA — sem badge cinza de zero e sem sino riscado, porque qualquer marca
  permanente treina o olho a ignorar o canto. Quem consome isto não renderiza a
  Badge, igual ao `atrasadas > 0 &&` de QuickActions.tsx.

  Negativo cai no mesmo caso de zero: contagem negativa só sai de bug de
  palpite otimista (duas marcações descontando a mesma linha), e badge com "-1"
  seria o bug na cara de quem usa.
*/
export function rotuloDoContador(naoLidas: number): string | null {
  if (naoLidas <= 0) return null
  return naoLidas > CONTADOR_MAXIMO ? `${CONTADOR_MAXIMO}+` : String(naoLidas)
}

/*
  O complemento do título do painel: "· 3 não lidas", "· 1 não lida", "· tudo
  lido", ou nada.

  "tudo lido" SÓ APARECE QUANDO EXISTE ALGO LIDO. Painel de quem nunca recebeu
  nada mostra "Notificações" seco, como no primeiro cartão da seção 5 do
  protótipo; o "· tudo lido" é do segundo cartão, que é o de quem tem histórico.
*/
export function rotuloDaContagem(naoLidas: number, total: number): string | null {
  if (naoLidas > 0) return `· ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}`
  return total > 0 ? '· tudo lido' : null
}

/* "3 avisos" / "1 aviso" — o contador do lado direito da faixa de dia. */
export function contagemDeAvisos(total: number): string {
  return `${total} ${total === 1 ? 'aviso' : 'avisos'}`
}

/*
  O RÓTULO DE ESPÉCIE, primeira linha da notificação.

  Ele existe porque cor sozinha não é acessível: o ladrilho azul ou rosa diz a
  espécie para quem vê, e este texto diz o mesmo para quem não vê.

  QUEM ATRIBUIU ENTRA AQUI — é a decisão 1 do usuário sobre o protótipo ("a
  linha de nova tarefa mostra quem atribuiu"), e este é o lugar que o próprio
  protótipo aponta para ela ("cabe no lugar do rótulo de espécie"). O nome vem
  DEPOIS da espécie, e não no lugar dela, para não trocar a redundância de
  acessibilidade por um nome próprio.

  "Sistema" quando não há nome: é o que o histórico do cartão já escreve
  (TaskDetailDialog.tsx:1177) para o mesmo caso — atribuição gravada sem sessão,
  por seed ou correção no banco. Atraso nunca tem autor, e o banco cobra isso
  num check (`notifications_overdue_has_no_actor_check`).
*/
export function rotuloDaEspecie(
  aviso: Pick<NotificationRow, 'kind' | 'actor_name'>,
): string {
  if (aviso.kind === 'task_overdue') return 'Tarefa em atraso'
  return `Nova tarefa · ${aviso.actor_name ?? 'Sistema'}`
}

/*
  O "QUANDO" DA LINHA, e as duas espécies respondem perguntas diferentes.

  - Atraso mostra "venceu 21/10", que é o PRAZO, e não a data da varredura: o
    que interessa é há quanto tempo a tarefa está parada, e a varredura pode ter
    rodado hoje para um prazo de um mês atrás (ela não pergunta "o que venceu
    ontem", pergunta "o que está vencido agora" — migration 0120).
  - Atribuição mostra quando o aviso chegou, com a hora, porque o aviso e o
    fato aconteceram no mesmo instante.

  `due_date` é coluna `date` e chega como "2026-10-21": `parseISO` a lê como
  meia-noite LOCAL, que é a data gravada. `new Date` a leria como meia-noite em
  UTC e, em Goiânia, mostraria o dia anterior — a mesma correção registrada em
  src/lib/format.ts e em src/features/activities/list.ts.

  Minúsculas em "hoje" e "ontem", e maiúscula na faixa de dia: a faixa é
  `uppercase` por CSS, esta linha não é, e o protótipo escreve as duas assim.

  O `?? created_at` do atraso é cinto de segurança: o banco garante `due_date`
  em todo `task_overdue` por check, e sem a guarda o TypeScript pediria `!`.
*/
export function rotuloDeQuando(
  aviso: Pick<NotificationRow, 'kind' | 'created_at' | 'due_date'>,
  agora: Date = new Date(),
): string {
  if (aviso.kind === 'task_overdue') {
    return `venceu ${format(parseISO(aviso.due_date ?? aviso.created_at), 'dd/MM')}`
  }

  const instante = parseISO(aviso.created_at)
  const chave = diaLocal(aviso.created_at)
  const hora = format(instante, 'HH:mm')

  if (chave === format(agora, 'yyyy-MM-dd')) return `hoje às ${hora}`
  if (chave === format(subDays(agora, 1), 'yyyy-MM-dd')) return `ontem às ${hora}`
  return `${format(instante, 'dd/MM')} às ${hora}`
}
