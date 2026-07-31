import { differenceInMinutes, parseISO } from 'date-fns'
import { CheckCircle, Clock, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ActivityRow } from '../types'

/*
  Porta de projeto-original/src/components/atividades/BotoesExecucao.jsx.

  Os três estados são os do original, na mesma ordem: "Começar agora" quando a
  atividade não foi iniciada, o tempo em execução mais "Concluir" quando está em
  andamento, e o tempo total quando já foi concluída.

  QUEM PODE EXECUTAR — a decisão sai daqui e vira `canExecute`, calculado pela
  tela. No original a conta é `isResponsavel || isAdmin || isCoordenador`, e o
  terceiro termo é código morto: ele compara `area === 'Coordenação'` e
  `role === 'Coordenação'`, e nenhum dos dois valores existe em `Collaborator`
  (as áreas são Comercial/Projetos/Operacional/Administrativo/Financeiro e as
  funções são Diretor/Coordenador/Arquiteto/Estagiário/Administrativo/
  Financeiro). Na prática, no ar, executa quem é o responsável ou é Diretor.

  Aqui o critério é o da policy `activities_update_activities_own_or_editor`
  (migration 0039): quem tem can_edit no menu `activities` — Diretor incluído
  pelo atalho da 0019 —, o responsável ou o coordenador da linha. É o mesmo
  desfecho do original para as duas pessoas que ele alcança, mais o coordenador,
  que o original queria alcançar e não alcança.
*/

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

export default function BotoesExecucao({
  activity,
  canExecute,
  onStart,
  onComplete,
}: {
  activity: ActivityRow
  canExecute: boolean
  onStart: (activity: ActivityRow) => void
  onComplete: (activity: ActivityRow) => void
}) {
  /* Instantâneo do render, como no original: o contador não corre sozinho. */
  const runningMinutes =
    activity.started_at && activity.status === 'in_progress'
      ? differenceInMinutes(new Date(), parseISO(activity.started_at))
      : null

  if (!canExecute) return null

  if (activity.status === 'not_started') {
    return (
      <Button
        size="sm"
        onClick={(event) => {
          event.stopPropagation()
          onStart(activity)
        }}
        /* `text-white` explícito: o token do botão inverte no tema escuro, e
           blue-600 é escuro o bastante para texto branco nos dois. */
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        <Play className="w-3 h-3 mr-1" />
        Começar agora
      </Button>
    )
  }

  if (activity.status === 'in_progress') {
    return (
      <div className="flex items-center gap-2">
        {runningMinutes !== null && (
          <div className="flex items-center gap-1 text-xs text-soft bg-muted px-2 py-1 rounded">
            <Clock className="w-3 h-3" />
            {formatMinutes(runningMinutes)}
          </div>
        )}
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onComplete(activity)
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Concluir
        </Button>
      </div>
    )
  }

  /* O tempo total vem de `total_minutes`, coluna GERADA pelo banco — no original
     é o número que o navegador calculou e gravou no clique de Concluir. */
  if (activity.status === 'completed' && activity.total_minutes) {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded">
        <Clock className="w-3 h-3" />
        {formatMinutes(activity.total_minutes)}
      </div>
    )
  }

  return null
}
