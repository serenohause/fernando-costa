import { Badge } from '@/components/ui/badge'

/*
  Porta de projeto-original/src/components/shared/StatusBadge.jsx.

  O mapa é indexado pelo RÓTULO em português, não pelo valor do banco: quem
  chama passa `labelOf(MAPA, valor)` (src/lib/enums.ts). Rótulo sem entrada aqui
  cai no estilo slate padrão — é o que acontece no original com 'Férias' e
  'Afastado', que existem no formulário de colaborador e não no mapa.

  Único ajuste em relação ao original: lá a chave 'Em execução' aparece duas
  vezes no mesmo objeto (contratos, violet; e tarefas, blue). Em JS a segunda
  vence em silêncio, e em TS objeto com chave repetida não compila. Fica só a
  segunda — mesmo resultado em tela que o original.
*/
const statusStyles: Record<string, string> = {
  // Contas
  Previsto: 'bg-blue-50 text-blue-700 border-blue-200',
  Pago: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Em atraso': 'bg-rose-50 text-rose-700 border-rose-200',
  Negociado: 'bg-amber-50 text-amber-700 border-amber-200',

  // Projetos
  Prospecção: 'bg-slate-50 text-slate-700 border-slate-200',
  'Em desenvolvimento': 'bg-blue-50 text-blue-700 border-blue-200',
  'Em aprovação': 'bg-amber-50 text-amber-700 border-amber-200',
  Concluído: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Suspenso: 'bg-rose-50 text-rose-700 border-rose-200',

  // Contratos
  'Em negociação': 'bg-amber-50 text-amber-700 border-amber-200',
  Aprovado: 'bg-blue-50 text-blue-700 border-blue-200',
  Rescindido: 'bg-rose-50 text-rose-700 border-rose-200',

  // Tarefas e Atividades - Novos status
  Pendente: 'bg-slate-50 text-slate-700 border-slate-200',
  'Em execução': 'bg-blue-50 text-blue-700 border-blue-200',
  Finalizada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Não iniciado': 'bg-slate-50 text-slate-700 border-slate-200',
  'Em andamento': 'bg-blue-50 text-blue-700 border-blue-200',
  Concluída: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Não iniciada': 'bg-slate-50 text-slate-700 border-slate-200',
  Briefing: 'bg-blue-50 text-blue-700 border-blue-200',
  Layout: 'bg-violet-50 text-violet-700 border-violet-200',
  'Em Revisão': 'bg-amber-50 text-amber-700 border-amber-200',
  Perspectivas: 'bg-purple-50 text-purple-700 border-purple-200',
  'Projeto Legal': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Aprovação Condomínio': 'bg-orange-50 text-orange-700 border-orange-200',
  'Projeto Executivo': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Projetos Complementares': 'bg-pink-50 text-pink-700 border-pink-200',
  'Alvará de Construção': 'bg-lime-50 text-lime-700 border-lime-200',
  Finalizado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Aguardando Cliente': 'bg-rose-50 text-rose-700 border-rose-200',

  // Prioridade
  Alta: 'bg-rose-50 text-rose-700 border-rose-200',
  Média: 'bg-amber-50 text-amber-700 border-amber-200',
  Baixa: 'bg-slate-50 text-slate-700 border-slate-200',

  // Colaboradores
  Ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Desligado: 'bg-slate-50 text-slate-700 border-slate-200',

  // Negociações
  'Lead recebido': 'bg-slate-50 text-slate-700 border-slate-200',
  Qualificado: 'bg-blue-50 text-blue-700 border-blue-200',
  'Proposta enviada': 'bg-violet-50 text-violet-700 border-violet-200',
  Fechamento: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Arquitetura: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Interiores: 'bg-purple-50 text-purple-700 border-purple-200',
  Obra: 'bg-orange-50 text-orange-700 border-orange-200',
  Mentoria: 'bg-cyan-50 text-cyan-700 border-cyan-200',
}

export default function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || 'bg-slate-50 text-slate-700 border-slate-200'

  return (
    <Badge variant="outline" className={`${style} font-medium`}>
      {status}
    </Badge>
  )
}
