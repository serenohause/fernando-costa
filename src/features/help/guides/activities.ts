import { Activity } from 'lucide-react'
import type { Guide } from '../types'

export const activitiesGuide: Guide = {
  title: 'Atividades',
  icon: Activity,
  menu: 'activities',
  page: 'Atividades',
  purpose:
    'O trabalho atribuído a cada pessoa, com prazo e prioridade, e os botões Começar agora e Concluir, que registram o tempo.',
  tasks: [
    {
      title: 'Achar o que é seu',
      steps: [
        'A tela abre com as suas atividades e as de quem você coordena.',
        'Use as abas Todas, Hoje, Semana e Atrasadas. O número ao lado de cada aba conta as atividades dela.',
        'Refine com os filtros de prioridade, responsável, projeto e status.',
        'Se aparecer o interruptor Visão Gerencial (ver atividades de todos), ligue-o para ver as atividades do escritório inteiro.',
      ],
      note: 'As atrasadas ficam no topo da lista, com o ícone vermelho e a data em vermelho.',
    },
    {
      title: 'Começar e concluir uma atividade',
      steps: [
        'Na coluna Ações, clique em Começar agora. O tempo começa a contar.',
        'Ao terminar, clique em Concluir.',
        'O tempo total fica gravado na linha da atividade.',
      ],
      note: 'Os botões aparecem para o responsável e o coordenador da atividade, e para quem edita Atividades.',
    },
    {
      title: 'Atualizar uma atividade',
      steps: [
        'Clique na linha da atividade para abrir Editar Atividade. Funciona nas atividades suas ou de quem você coordena.',
        'Ajuste Status, Data Início, Data Término e Observações.',
        {
          t: 'Responsável e Prioridade só mudam para quem edita Atividades.',
          needs: 'activities',
        },
        'Clique em Salvar Alterações.',
      ],
    },
    {
      title: 'Criar uma atividade',
      edit: true,
      steps: [
        'Clique em Nova Atividade.',
        'Preencha Descrição da Atividade, Responsável, Data Início e Data Término, que são obrigatórios.',
        'Escolha Status e Prioridade. Em Vínculos Opcionais, ligue a um Projeto ou a um Cliente. Com projeto escolhido, o cliente vem dele.',
        'Clique em Criar Atividade.',
      ],
      note: 'Para excluir, use a lixeira na coluna Ações. A exclusão não pode ser desfeita.',
    },
    {
      title: 'Definir a ordem de execução',
      edit: true,
      steps: [
        'Clique em Reordenar.',
        'Escolha o Colaborador. Aparecem as atividades dele que ainda não foram concluídas.',
        'Arraste as atividades até a ordem desejada e clique em Salvar Ordem.',
        'O número da ordem aparece ao lado da descrição, na lista.',
      ],
    },
  ],
  links: [
    { key: 'my_activities', why: 'O resumo das suas atividades e dos seus prazos.' },
    { key: 'productivity', why: 'O tempo registrado em Começar agora e Concluir vira relatório.' },
    { key: 'projects', why: 'O projeto a que a atividade está ligada.' },
  ],
  tour: [
    {
      target: 'activities-new',
      edit: true,
      title: 'Criar uma atividade',
      body: 'Nova Atividade abre o formulário. Descrição, Responsável, Data Início e Data Término são obrigatórios.',
    },
    {
      target: 'activities-manager',
      title: 'Visão Gerencial',
      body: 'A tela abre com as suas atividades e as de quem você coordena. Ligue para ver as do escritório inteiro.',
    },
    {
      target: 'activities-tabs',
      title: 'Hoje, Semana, Atrasadas',
      body: 'O número ao lado de cada aba conta as atividades dela. As atrasadas ficam no topo da lista.',
    },
    {
      target: 'activities-filters',
      title: 'Refinar a lista',
      body: 'Filtre por prioridade, responsável, projeto e status.',
    },
    {
      target: 'activities-reorder',
      edit: true,
      title: 'Ordem de execução',
      body: 'Reordenar escolhe um colaborador e deixa arrastar as atividades dele. O número da ordem aparece ao lado da descrição.',
    },
    {
      target: 'activities-row',
      title: 'Atualizar uma atividade',
      body: 'Clique na linha para abrir Editar Atividade e ajustar status, datas e observações.',
    },
    {
      target: 'activities-run',
      title: 'Começar e concluir',
      body: 'Começar agora conta o tempo. Ao terminar, Concluir grava o tempo total na linha.',
    },
  ],
}
