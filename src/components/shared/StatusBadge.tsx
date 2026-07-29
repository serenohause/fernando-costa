import { Badge } from '@/components/ui/badge'

/*
  Porta de projeto-original/src/components/shared/StatusBadge.jsx.

  O mapa é indexado pelo RÓTULO em português, não pelo valor do banco: quem
  chama passa `labelOf(MAPA, valor)` (src/lib/enums.ts). Rótulo sem entrada aqui
  cai no estilo neutro — é o que acontece no original com 'Férias' e 'Afastado',
  que existem no formulário de colaborador e não no mapa.

  Único ajuste em relação ao original: lá a chave 'Em execução' aparece duas
  vezes no mesmo objeto (contratos, violet; e tarefas, blue). Em JS a segunda
  vence em silêncio, e em TS objeto com chave repetida não compila. Fica só a
  segunda — mesmo resultado em tela que o original.

  As cores de estado continuam sendo cores de estado: azul é informação, âmbar é
  espera, esmeralda é concluído, rosa é problema. O que muda é que cada uma ganha
  variante escura — o fundo 50 de cada cor, no escuro, era faixa quase branca com
  texto quase branco. O par claro de cada cor é o mesmo do original, classe por
  classe; o `dark:` é adição. O estilo neutro (o que o original escreve com a
  escala slate 50/700/200) não é estado: vira token.
*/
const STATE_STYLES = {
  neutral: 'bg-elevated text-soft border-border',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  emerald:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  amber:
    'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  violet:
    'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900',
  purple:
    'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-900',
  cyan: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900',
  orange:
    'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900',
  indigo:
    'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900',
  pink: 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900',
  lime: 'bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-400 border-lime-200 dark:border-lime-900',
} as const

const statusStyles: Record<string, string> = {
  // Contas
  Previsto: STATE_STYLES.blue,
  Pago: STATE_STYLES.emerald,
  'Em atraso': STATE_STYLES.rose,
  Negociado: STATE_STYLES.amber,

  // Projetos
  Prospecção: STATE_STYLES.neutral,
  'Em desenvolvimento': STATE_STYLES.blue,
  'Em aprovação': STATE_STYLES.amber,
  Concluído: STATE_STYLES.emerald,
  Suspenso: STATE_STYLES.rose,

  // Contratos
  'Em negociação': STATE_STYLES.amber,
  Aprovado: STATE_STYLES.blue,
  Rescindido: STATE_STYLES.rose,

  // Tarefas e Atividades - Novos status
  Pendente: STATE_STYLES.neutral,
  'Em execução': STATE_STYLES.blue,
  Finalizada: STATE_STYLES.emerald,
  'Não iniciado': STATE_STYLES.neutral,
  'Em andamento': STATE_STYLES.blue,
  Concluída: STATE_STYLES.emerald,
  'Não iniciada': STATE_STYLES.neutral,
  Briefing: STATE_STYLES.blue,
  Layout: STATE_STYLES.violet,
  'Em Revisão': STATE_STYLES.amber,
  Perspectivas: STATE_STYLES.purple,
  'Projeto Legal': STATE_STYLES.cyan,
  'Aprovação Condomínio': STATE_STYLES.orange,
  'Projeto Executivo': STATE_STYLES.indigo,
  'Projetos Complementares': STATE_STYLES.pink,
  'Alvará de Construção': STATE_STYLES.lime,
  Finalizado: STATE_STYLES.emerald,
  'Aguardando Cliente': STATE_STYLES.rose,

  // Prioridade
  Alta: STATE_STYLES.rose,
  Média: STATE_STYLES.amber,
  Baixa: STATE_STYLES.neutral,

  // Colaboradores
  Ativo: STATE_STYLES.emerald,
  Desligado: STATE_STYLES.neutral,

  // Negociações
  'Lead recebido': STATE_STYLES.neutral,
  Qualificado: STATE_STYLES.blue,
  'Proposta enviada': STATE_STYLES.violet,
  Fechamento: STATE_STYLES.emerald,
  Arquitetura: STATE_STYLES.indigo,
  Interiores: STATE_STYLES.purple,
  Obra: STATE_STYLES.orange,
  Mentoria: STATE_STYLES.cyan,
}

export default function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || STATE_STYLES.neutral

  return (
    <Badge variant="outline" className={`${style} font-medium`}>
      {status}
    </Badge>
  )
}
