import { SlidersHorizontal } from 'lucide-react'
import type { Guide } from '../types'

export const settingsGuide: Guide = {
  title: 'Configurações',
  icon: SlidersHorizontal,
  menu: 'settings',
  page: 'Settings',
  purpose:
    'As opções do escritório que antes só mudavam por código, como os tipos de serviço do Pipeline e as colunas do quadro.',
  tasks: [
    {
      title: 'Achar uma opção',
      steps: [
        'À esquerda ficam as seções: Tipos de Serviço, Quadros, Status Operacional e Integrações.',
        'Quem só vê enxerga tudo, mas sem os botões de criar e editar.',
      ],
    },
    {
      title: 'Cuidar dos tipos de serviço do Pipeline',
      edit: true,
      steps: [
        'Em Tipos de Serviço, clique em Novo Tipo.',
        'Preencha Nome, escolha o Peso no tipo de contrato e clique em Adicionar. O lápis da linha edita.',
        'O interruptor da linha desativa o tipo: ele sai das negociações novas e continua nas antigas. Não há exclusão.',
        'Arraste pela alça à esquerda para mudar a ordem.',
      ],
    },
    {
      title: 'Ajustar as etapas do Fluxo do Projeto',
      edit: true,
      steps: [
        'Em Quadros, clique em Nova Etapa, ou no lápis de uma etapa para editar.',
        'Defina Nome da etapa, Cor do cabeçalho e Percentual de progresso. Vazio deixa a etapa fora do progresso. Clique em Salvar.',
        'O interruptor oculta a etapa do quadro sem perder nada, e pode ser desfeito.',
        'A lixeira exclui de vez. Se a etapa tiver tarefas abertas, escolha em Mover as tarefas para e clique em Excluir etapa.',
      ],
      note: 'Não iniciado e Finalizado não podem ser excluídas, só ocultadas.',
    },
    {
      title: 'Criar um status operacional',
      edit: true,
      steps: [
        'Em Status Operacional, clique em Novo Status.',
        'Preencha Nome do status, escolha a Cor do crachá e clique em Salvar.',
        'Enquanto estiver marcado no cartão, o status pausa o prazo da tarefa.',
      ],
    },
    {
      title: 'Conectar o Google Agenda',
      edit: true,
      steps: [
        'Em Integrações, clique em Conectar Google Agenda e entre com a conta Google do escritório.',
        'Depois, em Escolher agenda, escolha a agenda do escritório, e não a pessoal.',
        'A chave de automação nasce junto com a conexão.',
      ],
    },
  ],
  links: [
    { key: 'pipeline', why: 'Onde aparecem os tipos de serviço.' },
    { key: 'project_flow', why: 'O quadro com as etapas e os status operacionais.' },
  ],
  tour: [
    {
      target: 'settings-sections',
      title: 'As seções',
      body: 'Clique numa seção para abrir. Quem só vê enxerga tudo, mas sem os botões de criar e editar.',
    },
    {
      target: 'settings-kanban',
      title: 'Quadros',
      body: 'As etapas do Fluxo do Projeto, com nome, cor do cabeçalho e percentual de progresso.',
    },
    {
      target: 'settings-tags',
      title: 'Status Operacional',
      body: 'Os crachás do cartão do quadro. Enquanto estiver marcado no cartão, o status pausa o prazo da tarefa.',
    },
    {
      target: 'settings-integrations',
      title: 'Integrações',
      body: 'A conexão com o Google Agenda do escritório e as chaves de automação.',
    },
    {
      target: 'settings-new',
      edit: true,
      title: 'Novo tipo de serviço',
      body: 'Novo Tipo abre o formulário: Nome e Peso no tipo de contrato. O tipo aparece ao criar uma negociação no Pipeline.',
    },
    {
      target: 'settings-type',
      edit: true,
      title: 'Editar e ordenar',
      body: 'O lápis da linha edita. Arraste pela alça à esquerda para mudar a ordem.',
    },
    {
      target: 'settings-type-switch',
      edit: true,
      title: 'Desativar',
      body: 'O interruptor tira o tipo das negociações novas; as antigas continuam com ele. Não há exclusão.',
    },
  ],
}
