import { Link } from 'react-router'
import { CalendarClock, Check, ChevronRight, FolderOpen, UserPlus } from 'lucide-react'
import { createPageUrl } from '@/lib/page-url'
import { rotuloDaEspecie, rotuloDeQuando } from '../agrupar'
import type { NotificationRow } from '../types'

/*
  A LINHA DE AVISO — porte literal da `.notif` de
  prototypes/notificacoes-sino.html.

  A LINHA NÃO É UMA ÂNCORA, e isso é estrutura e não estilo: dentro dela existe o
  botão de marcar como lida, e botão dentro de link é HTML inválido (e, no React,
  um <Link> que engole o clique do <Button>). Então o link é o CORPO do texto,
  esticado por `after:inset-0` para cobrir a linha inteira, e o visto fica numa
  camada acima (`z-[1]` no lado direito). Resultado: a linha toda é clicável,
  existe um único alvo de teclado para "ir para a tarefa", e o visto continua
  sendo um controle separado.

  O ladrilho de espécie NÃO sobe de camada de propósito: ele fica sob o alvo
  esticado, para que clicar nele também leve à tarefa.
*/

/*
  PARA ONDE O CLIQUE LEVA, e por que não abre o diálogo da tarefa.

  O app não tem URL que abra o `TaskDetailDialog`: a tarefa aberta é estado
  local do quadro (`selectedTaskId` em TaskKanban.tsx), e não existe rota para
  ela. O que existe é `?focus=<id>`, que rola até o cartão e o destaca por
  alguns segundos (useFocusParam.ts) — é o MESMO parâmetro que a busca global já
  usa quando o resultado é uma tarefa (searchHitParam, src/features/search/types.ts).

  Então o sino usa o caminho que o sistema já tem, em vez de inventar rota. Quem
  clica cai no Fluxo do Projeto com o cartão dele em destaque, e abre o detalhe
  no clique seguinte.
*/
function urlDaTarefa(taskId: string): string {
  return `${createPageUrl('Tasks')}?focus=${taskId}`
}

/*
  Cor e ícone de cada espécie, lado a lado, porque é esse par que distingue
  "nova" de "em atraso" sem ler texto. As cores são tokens do tema
  (`--species-*`), portados do protótipo para o `@theme` de src/index.css.
*/
const ESPECIE = {
  task_assigned: {
    Icon: UserPlus,
    ladrilho:
      'bg-species-new-surface border-species-new-border text-species-new-ink',
    tinta: 'text-species-new-ink',
  },
  task_overdue: {
    Icon: CalendarClock,
    ladrilho:
      'bg-species-late-surface border-species-late-border text-species-late-ink',
    tinta: 'text-species-late-ink',
  },
} as const

export default function NotificationItem({
  aviso,
  compacto,
  ultimo,
  onMarcarLido,
  onNavegar,
}: {
  aviso: NotificationRow
  /*
    `compacto` é a folha de baixo do celular, e não um palpite de largura: em
    360px o nome do projeto já ocupa a linha inteira, e cortá-lo para caber a
    data perderia justamente o que identifica a tarefa. Então projeto e data
    quebram em duas linhas, e a seta sai porque a linha inteira já é o alvo de
    toque.
  */
  compacto?: boolean
  /* A última linha do painel não tem borda de baixo — ver o comentário em
     NotificationPanel.tsx, onde a conta é feita. */
  ultimo?: boolean
  onMarcarLido: (id: string) => void
  onNavegar: () => void
}) {
  const lida = aviso.read_at !== null
  const { Icon, ladrilho, tinta } = ESPECIE[aviso.kind]

  /*
    TAREFA APAGADA DEPOIS DO AVISO — `task_id` nulo (a FK é
    `on delete set null`, migration 0120). O aviso continua legível pelas cópias
    de título e de projeto que a linha carrega, e é só o link que deixa de
    existir: não há cartão para onde ir. O protótipo não desenha este caso; o
    tratamento vem do que o banco garante.
  */
  const destino = aviso.task_id ? urlDaTarefa(aviso.task_id) : null

  const corpo = (
    <>
      <span className={`block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] mb-0.5 ${lida ? 'text-muted-foreground' : tinta}`}>
        {rotuloDaEspecie(aviso)}
      </span>
      <span
        className={`block text-sm truncate ${lida ? 'font-normal text-muted-foreground' : 'font-medium text-foreground'}`}
      >
        {aviso.task_title}
      </span>
      {/*
        TAREFA SEM PROJETO é caso previsto do banco desde a 0032, e o protótipo
        não o desenha: `project_name` nulo. A pasta e o separador saem junto com
        o nome — ícone de pasta sozinho, apontando para nada, leria como dado
        que não carregou. O "quando" fica, porque ele não depende de projeto.
      */}
      <span
        className={`flex items-center gap-1.5 mt-[0.1875rem] text-xs min-w-0 ${lida ? 'text-faint' : 'text-soft'}`}
      >
        {aviso.project_name !== null && (
          <>
            <FolderOpen aria-hidden="true" className="w-3 h-3 shrink-0 text-faint" />
            <span className="truncate">{aviso.project_name}</span>
          </>
        )}
        {!compacto && (
          <>
            {aviso.project_name !== null && (
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
            )}
            <span
              className={`whitespace-nowrap tabular-nums ${lida ? 'text-faint' : 'text-muted-foreground'}`}
            >
              {rotuloDeQuando(aviso)}
            </span>
          </>
        )}
      </span>
      {compacto && (
        <span className="flex items-center gap-1.5 mt-[0.1875rem] text-xs min-w-0">
          <span
            className={`whitespace-nowrap tabular-nums ${lida ? 'text-faint' : 'text-muted-foreground'}`}
          >
            {rotuloDeQuando(aviso)}
          </span>
        </span>
      )}
    </>
  )

  return (
    <div
      className={`group/notif relative flex items-start gap-3 py-3 transition-colors hover:bg-muted has-[a:focus-visible]:inset-ring-1 has-[a:focus-visible]:inset-ring-ring ${
        ultimo ? '' : 'border-b border-border'
      } ${compacto ? 'pl-3.5 pr-2' : 'px-4'} ${destino ? 'cursor-pointer' : ''}`}
    >
      <span aria-hidden="true" className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-md border ${lida ? 'bg-muted border-border text-faint' : ladrilho}`}>
        <Icon className="w-4 h-4" />
      </span>

      {destino ? (
        <Link
          to={destino}
          onClick={onNavegar}
          className="flex-1 min-w-0 block no-underline text-inherit after:absolute after:inset-0 after:content-['']"
        >
          {corpo}
        </Link>
      ) : (
        <span className="flex-1 min-w-0 block">{corpo}</span>
      )}

      <span className="relative z-[1] shrink-0 flex items-center gap-0.5 self-center">
        {/*
          O VISTO E O PONTO SÓ EXISTEM NA NÃO LIDA. É o que o protótipo faz: ao
          marcar como lida, os dois saem da linha e sobra a seta. Nada de visto
          desligado nem de ponto vazado — a linha não muda de altura, e por isso
          marcar como lida não reorganiza a lista debaixo do dedo.

          `hover-none:opacity-100` é o `@media (hover: none)` do protótipo: em
          tela de toque não existe hover, e controle que só aparece no hover é
          controle que não existe.
        */}
        {!lida && (
          <>
            <button
              type="button"
              aria-label="Marcar como lida"
              onClick={() => onMarcarLido(aviso.id)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,background-color] hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring group-hover/notif:opacity-100 group-focus-within/notif:opacity-100 hover-none:opacity-100"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <span role="img" aria-label="Não lida" className="w-2 h-2 rounded-full bg-counter" />
          </>
        )}
        {!compacto && destino && (
          <span
            aria-hidden="true"
            className="text-faint opacity-0 transition-opacity group-hover/notif:opacity-100 hover-none:opacity-100"
          >
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
      </span>
    </div>
  )
}
