import { Activity } from 'lucide-react'
import type { Guide } from '../types'

export const myActivitiesGuide: Guide = {
  title: 'Minhas Atividades',
  icon: Activity,
  menu: 'my_activities',
  page: 'MinhasAtividades',
  byRole: true,
  purpose:
    'Seu resumo: as atividades atribuídas a você, os prazos e os projetos em que você é o responsável no Fluxo do Projeto.',
  tasks: [
    {
      title: 'Ver o que vence hoje e o que atrasou',
      steps: [
        'Os quatro cartões do topo contam Atividades de Hoje, Em Execução, Em Atraso e Concluídas (Semana).',
        'Se houver atraso, aparece a faixa rosa "Você possui N atividades em atraso".',
        'Na tabela Suas Atividades, a linha atrasada fica rosada e o prazo, em vermelho.',
      ],
    },
    {
      title: 'Começar e concluir uma atividade',
      steps: [
        'Clique em Ver Todas as Atividades.',
        'Na linha da atividade, clique em Começar agora. O tempo começa a contar.',
        'Ao terminar, clique em Concluir. O tempo total fica gravado na atividade.',
      ],
      note: 'Quem executa é o responsável ou o coordenador da atividade.',
    },
    {
      title: 'Acompanhar os seus projetos',
      steps: [
        'O cartão Meus Projetos (Responsável) lista os projetos em que você responde por algum cartão do Fluxo do Projeto.',
        'Cada projeto mostra a fase atual, a próxima entrega e o progresso. O selo Atrasado indica tarefa vencida.',
        'Clique no projeto para abrir Detalhes do Projeto, com a lista Tarefas do Projeto.',
        'O ícone ao lado do título abre o projeto no Fluxo do Projeto, numa aba nova.',
      ],
    },
    {
      title: 'Um projeto meu não aparece. Por quê?',
      steps: [
        'Só entram projetos em que você é o responsável de pelo menos um cartão no Fluxo do Projeto.',
        'Projetos Concluídos ou Suspensos saem da lista.',
        'Quem define o responsável do cartão é quem edita o Fluxo do Projeto.',
      ],
    },
  ],
  links: [
    { key: 'project_flow', why: 'Onde se define quem é o responsável de cada cartão.' },
    {
      key: 'activities',
      why: 'Onde se começa e conclui a atividade.',
      via: 'pelo botão Ver Todas as Atividades',
    },
    { key: 'notifications', why: 'Avisa de tarefa nova e de prazo vencido.' },
  ],
  tour: [
    {
      target: 'my-late',
      title: 'O que atrasou',
      body: 'A faixa rosa aparece quando alguma atividade sua passa do prazo.',
    },
    {
      target: 'my-stats',
      title: 'Seus números',
      body: 'Atividades de hoje, em execução, em atraso e concluídas na semana.',
    },
    {
      target: 'my-all',
      title: 'Começar e concluir',
      body: 'Começar agora e Concluir ficam em Atividades, por este botão. O tempo fica gravado na atividade.',
    },
    {
      target: 'my-project',
      title: 'Seus projetos',
      body: 'Projetos em que você é responsável por algum cartão do Fluxo do Projeto. Clique para ver fase e tarefas.',
    },
    {
      target: 'my-late-row',
      title: 'Suas Atividades',
      body: 'A linha rosada é atividade atrasada, com o prazo em vermelho.',
    },
  ],
}
