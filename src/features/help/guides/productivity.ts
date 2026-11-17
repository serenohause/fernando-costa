import { ChartColumn } from 'lucide-react'
import type { Guide } from '../types'

/* Sem `page` e sem `menu`, de propósito: a rota não tem item na barra, como no
   original. Decisão pendente do usuário (protótipo, pergunta 6). */
export const productivityGuide: Guide = {
  title: 'Relatório de Produtividade',
  icon: ChartColumn,
  special: 'productivity',
  purpose:
    'Análise de desempenho e métricas de execução, por colaborador e por projeto. Não tem item na barra lateral.',
  tasks: [
    {
      title: 'Abrir o relatório',
      steps: [
        'O relatório não tem item na barra lateral. Abra pelo endereço do sistema seguido de /RelatorioProdutividade.',
        'Ele abre para quem edita Atividades. Para os demais, a tela mostra "Acesso restrito a gestores".',
      ],
    },
    {
      title: 'Escolher o recorte',
      steps: [
        'No cartão Filtros, o período começa em Este mês. As opções são Hoje, Esta semana, Este mês, Todas e Customizado.',
        'Em Customizado, preencha Data início e Data fim.',
        'O período olha a data em que a atividade foi concluída.',
        'Filtre também por colaborador, projeto e prioridade.',
      ],
    },
    {
      title: 'Ler os números',
      steps: [
        'Só entram atividades concluídas que passaram por Começar agora e Concluir.',
        'Os cartões mostram Total de Atividades, Tempo Total, Tempo Médio e Taxa de Atraso.',
        'Atrasada é a atividade concluída depois do fim do dia da Data Término.',
      ],
    },
    {
      title: 'Ver por pessoa, por projeto ou atividade a atividade',
      steps: [
        'Ranking Colaboradores ordena as pessoas por número de atividades, com tempo total, tempo médio e taxa de atraso.',
        'Por Projeto soma atividades e tempo de cada projeto. Atividade sem projeto não entra nesta aba.',
        'Detalhamento lista cada atividade, com Tempo Execução, Conclusão e Status Prazo (No prazo ou Atrasada).',
      ],
    },
  ],
  links: [
    { key: 'activities', why: 'Onde se registra o tempo, com Começar agora e Concluir.' },
    { key: 'dashboard_executive', why: 'As mesmas atividades concluídas, ao lado dos projetos.' },
  ],
}
