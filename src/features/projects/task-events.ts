/* Caminho relativo, e não o alias `@/`: este módulo é puro e os testes o
   importam direto no Node, que não conhece o alias do Vite. */
import { TASK_PRIORITY, WORK_STATUS, labelOf } from '../../lib/enums.ts'
import { formatDateBR } from '../../lib/format.ts'

/*
  O HISTÓRICO DO CARTÃO EM PORTUGUÊS (migration 0104).

  O banco guarda o FATO — o tipo do evento e os valores de antes e depois —, e
  não a frase. Frase gravada envelhece: muda o jeito de escrever e o histórico
  antigo continua com o texto velho, e traduzir depois vira impossível. Aqui é
  onde o fato vira linha de texto.

  Rótulos de etapa e de status já vêm resolvidos do gatilho: os dois são
  cadastro que o escritório renomeia, e o histórico precisa dizer como era na
  época. Prioridade e situação são enums do código, e usam os mesmos rótulos do
  resto do sistema.
*/

export type TaskEventKind =
  | 'task_created'
  | 'title_changed'
  | 'description_changed'
  | 'due_date_changed'
  | 'start_date_changed'
  | 'priority_changed'
  | 'status_changed'
  | 'phase_changed'
  | 'responsible_changed'
  | 'operational_tag_changed'
  | 'hours_changed'
  | 'objective_added'
  | 'objectives_seeded'
  | 'objective_renamed'
  | 'objective_removed'
  | 'objective_completed'
  | 'objective_reopened'
  | 'objective_due_changed'
  | 'objective_assignee_added'
  | 'objective_assignee_removed'

export type TaskEventDetails = {
  title?: string | null
  from?: string | number | null
  to?: string | number | null
  person?: string | null
  count?: number | null
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

/* Data em branco vira "sem prazo": o histórico diz o que aconteceu, e tirar o
   prazo é um fato tão bom quanto pôr um. */
const data = (valor: unknown): string => {
  const bruto = texto(valor)
  return bruto === '' ? 'sem prazo' : formatDateBR(bruto.slice(0, 10))
}

const aspas = (valor: unknown, vazio = '—'): string => {
  const bruto = texto(valor)
  return bruto === '' ? vazio : `“${bruto}”`
}

export function describeTaskEvent(kind: string, details: TaskEventDetails | null): string {
  const d = details ?? {}

  switch (kind) {
    case 'task_created':
      return 'criou a tarefa'
    case 'title_changed':
      return `renomeou a tarefa para ${aspas(d.to)}`
    case 'description_changed':
      return 'alterou a descrição'
    case 'due_date_changed':
      return `mudou o prazo de ${data(d.from)} para ${data(d.to)}`
    case 'start_date_changed':
      return `mudou a data de início de ${data(d.from)} para ${data(d.to)}`
    case 'priority_changed':
      return `mudou a prioridade para ${labelOf(TASK_PRIORITY, texto(d.to))}`
    case 'status_changed':
      return `mudou a situação para ${labelOf(WORK_STATUS, texto(d.to))}`
    case 'phase_changed':
      return `moveu de ${aspas(d.from, 'nenhuma etapa')} para ${aspas(d.to)}`
    case 'responsible_changed':
      return texto(d.to) === ''
        ? 'tirou o responsável da tarefa'
        : `passou a tarefa para ${texto(d.to)}`
    case 'operational_tag_changed':
      return texto(d.to) === ''
        ? `tirou o status ${aspas(d.from)}`
        : `marcou o status ${aspas(d.to)}`
    case 'hours_changed':
      return `mudou as horas estimadas para ${d.to ?? '—'}`
    case 'objective_added':
      return `adicionou o objetivo ${aspas(d.title)}`
    case 'objectives_seeded':
      return `criou ${d.count ?? 0} objetivos da etapa`
    case 'objective_renamed':
      return `renomeou o objetivo ${aspas(d.from)} para ${aspas(d.to)}`
    case 'objective_removed':
      return `removeu o objetivo ${aspas(d.title)}`
    case 'objective_completed':
      return `concluiu o objetivo ${aspas(d.title)}`
    case 'objective_reopened':
      return `reabriu o objetivo ${aspas(d.title)}`
    case 'objective_due_changed':
      return `mudou o prazo do objetivo ${aspas(d.title)} para ${data(d.to)}`
    case 'objective_assignee_added':
      return `pôs ${texto(d.person) || 'alguém'} no objetivo ${aspas(d.title)}`
    case 'objective_assignee_removed':
      return `tirou ${texto(d.person) || 'alguém'} do objetivo ${aspas(d.title)}`
    default:
      /* Evento novo no banco e tela antiga no navegador de alguém: melhor uma
         linha genérica do que a linha sumir do histórico. */
      return 'registrou uma alteração'
  }
}
