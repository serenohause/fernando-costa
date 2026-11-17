import { FolderKanban } from 'lucide-react'
import type { Guide } from '../types'

export const projectsGuide: Guide = {
  title: 'Projetos',
  icon: FolderKanban,
  menu: 'projects',
  page: 'Projects',
  purpose:
    'A lista dos projetos do escritório, com cliente, tipo, cidade, responsável pela negociação, prazos de fase e status.',
  tasks: [
    {
      title: 'Encontrar um projeto',
      steps: [
        'Digite no campo Buscar por nome do projeto ou cliente...',
        'Use as abas Todos, Em desenvolvimento, Em aprovação e Concluídos.',
        'Projetos em Prospecção, Em contrato ou Suspenso só aparecem na aba Todos.',
      ],
    },
    {
      title: 'Cadastrar um projeto novo',
      edit: true,
      steps: [
        'Clique em Novo Projeto, no alto da tela.',
        'Preencha Nome do Projeto e Tipo de Projeto, que são obrigatórios.',
        'Se quiser, escolha Cliente, Cidade, Estado, Endereço da Obra, Data de Início, Status e Ambientes.',
        'Clique em Criar Projeto.',
      ],
      note: 'Responsável pela Negociação é só controle comercial. O responsável operacional se define no Fluxo do Projeto.',
    },
    {
      title: 'Editar ou excluir',
      edit: true,
      steps: [
        'Na linha do projeto, abra o menu de três pontos.',
        'Editar abre o formulário; salve com Salvar Alterações.',
        'Excluir pede confirmação, e a exclusão não pode ser desfeita.',
      ],
    },
    {
      title: 'Mudar a ordem da lista',
      edit: true,
      steps: [
        'Segure a alça à esquerda da linha e arraste até a nova posição.',
        'A ordem vale para todo o escritório. O aviso Ordem atualizada! confirma.',
      ],
    },
    {
      title: 'Abrir o cliente do projeto',
      steps: [
        'O nome do cliente, abaixo do nome do projeto, abre a ficha dele no CRM, se você tem acesso ao CRM.',
      ],
    },
  ],
  links: [
    { key: 'project_flow', why: 'Os cartões de cada fase e o responsável operacional.' },
    { key: 'crm', why: 'O cadastro do cliente do projeto.' },
    { key: 'map', why: 'O projeto no mapa, pela cidade e endereço da obra.' },
    { key: 'contracts', why: 'O contrato ligado ao projeto.' },
  ],
}
