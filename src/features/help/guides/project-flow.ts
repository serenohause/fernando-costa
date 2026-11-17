import { CheckSquare } from 'lucide-react'
import type { Guide } from '../types'

export const projectFlowGuide: Guide = {
  title: 'Fluxo do Projeto',
  icon: CheckSquare,
  menu: 'project_flow',
  page: 'Tasks',
  purpose:
    'O quadro com os cartões de cada projeto por fase. É aqui que se define o responsável operacional.',
  tasks: [
    {
      title: 'Ler o quadro',
      steps: [
        'Cada coluna é uma etapa do projeto. No alto, filtre por responsável e por projeto.',
        'O ponto vermelho antes do título marca prioridade alta. A borda vermelha à esquerda marca prazo vencido.',
        'Cartão com status operacional mostra o status no lugar da data e não fica vermelho por atraso.',
        'Clique no cartão para abrir o detalhe, com Descrição, Objetivos, Atividade, responsável e prazos.',
        'O menu de três pontos do cartão tem atalho para o Diário do Projeto.',
      ],
      note: 'O cartão inicial de cada projeto nasce quando o contrato é aprovado, em Contratos & Propostas.',
    },
    {
      title: 'Andar com o cartão pelas etapas',
      edit: true,
      steps: [
        'Arraste o cartão para a coluna da próxima etapa.',
        'Para avançar, os objetivos obrigatórios (com *) da etapa atual precisam estar marcados. Se faltar algum, o aviso vermelho do topo lista o que falta.',
        'Voltar para uma etapa anterior nunca é bloqueado.',
        'Ao mudar de etapa, os objetivos da nova etapa entram sozinhos no cartão.',
        'Soltar em Finalizado conclui a tarefa.',
      ],
    },
    {
      title: 'Definir o responsável operacional',
      edit: true,
      steps: [
        'No menu de três pontos do cartão, abra Alterar Responsável e escolha a pessoa.',
        'Ou, no detalhe do cartão, clique em Responsável.',
        'O responsável passa a ver o projeto em Minhas Atividades, no cartão Meus Projetos (Responsável).',
      ],
    },
    {
      title: 'Cuidar dos objetivos da etapa',
      edit: true,
      steps: [
        'No detalhe do cartão, marque o objetivo quando ele estiver feito.',
        'Cada objetivo pode ter prazo próprio e responsável próprio.',
        'Adicionar objetivo, no fim da lista, cria mais um nesta etapa. Objetivo que não é obrigatório pode ser removido no X.',
        'Título e Descrição se editam clicando neles. Todos os campos abre o formulário completo da tarefa.',
      ],
      note: 'Excluir tarefa só aparece para o Diretor.',
    },
    {
      title: 'Revisar os ambientes',
      edit: true,
      steps: [
        'Nas etapas que mostram os ambientes do projeto, cada objetivo de ambiente tem o botão Revisar.',
        'Clique em Revisar e escolha o resultado. As opções de cada etapa são definidas em Configurações.',
        'O selo fica no objetivo, com quem marcou e quando. Clique nele para trocar a marca ou em Limpar revisão.',
        'Marcar a revisão não conclui o objetivo: é o check que libera a etapa.',
      ],
    },
  ],
  links: [
    { key: 'projects', why: 'A lista dos projetos, com cliente e status.' },
    { key: 'my_activities', why: 'Onde o responsável acompanha os seus projetos.' },
    { key: 'contracts', why: 'A aprovação do contrato cria o cartão inicial.' },
    { key: 'settings', why: 'As etapas do quadro e os botões de revisão dos ambientes.' },
  ],
}
