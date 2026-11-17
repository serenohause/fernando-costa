import { PanelLeft } from 'lucide-react'
import type { Guide } from '../types'

export const sidebarGuide: Guide = {
  title: 'A barra lateral',
  icon: PanelLeft,
  always: true,
  purpose:
    'Mostra só as telas liberadas para você. Se falta alguma, quem libera é o Diretor, em Equipe.',
  tasks: [
    {
      title: 'Achar uma tela',
      steps: [
        'Clique no nome da tela. A tela aberta fica destacada, com uma seta à direita.',
        'Financeiro e Equipe são grupos: clique para abrir e ver Recebíveis e Pagamentos, ou Equipe e Controle de Acesso.',
        'Dentro de um grupo só aparecem as telas liberadas para você.',
      ],
    },
    {
      title: 'Usar no celular',
      steps: [
        'No celular a barra fica escondida. Toque no ícone de menu, no canto esquerdo do cabeçalho, para abrir. O X fecha.',
        'Embaixo da tela fica uma barra fixa com Início, CRM, Tarefas e Projetos.',
      ],
    },
    {
      title: 'O rodapé da barra',
      steps: [
        'Seu nome e sua área abrem Meu Perfil.',
        'Central de ajuda abre os guias.',
        'Sair encerra a sua sessão.',
      ],
    },
    {
      title: 'Falta uma tela. Por quê?',
      steps: [
        'A barra mostra só as telas liberadas para você na matriz de permissões.',
        'Se aparece Nenhum menu liberado para o seu acesso, nenhuma tela foi liberada ainda.',
        'Algumas telas dependem da função: Minhas Atividades aparece para Arquiteto, Estagiário e Coordenador, e Atividades não aparece para Arquiteto e Estagiário.',
        'Para liberar uma tela, fale com o Diretor. Ele faz isso em Equipe, nas Permissões da sua linha.',
      ],
    },
  ],
  links: [
    { key: 'permissions', why: 'Onde o Diretor libera cada tela.' },
    { key: 'profile', why: 'Seu nome, no rodapé, abre o perfil.' },
    { key: 'help_center', why: 'Os guias das telas que você usa.' },
  ],
}
