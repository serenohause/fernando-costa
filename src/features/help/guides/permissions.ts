import { Lock } from 'lucide-react'
import type { Guide } from '../types'

export const permissionsGuide: Guide = {
  title: 'Permissões',
  icon: Lock,
  needsMenu: 'team',
  purpose:
    'A matriz por tela, com Acesso e Gerenciar para cada pessoa. Os perfis prontos (Perfil Comercial, Perfil Projetos, Perfil Financeiro, Perfil Diretor e Administrador do Sistema) preenchem tudo de uma vez.',
  tasks: [
    {
      title: 'Abrir as permissões de uma pessoa',
      steps: [
        'Só o Diretor mexe nas permissões.',
        'Em Equipe, na linha da pessoa, abra o menu de três pontos e clique em Permissões.',
        'A janela lista os Módulos do Sistema por grupo: Dashboards, Comercial, Projetos & Operações, Financeiro e Administração.',
      ],
    },
    {
      title: 'Liberar uma tela',
      steps: [
        'Marque Acesso para a tela aparecer na barra lateral da pessoa.',
        'Marque Gerenciar para ela também criar, editar e excluir registros.',
        'Gerenciar só liga com Acesso marcado. Desmarcar Acesso tira o Gerenciar junto.',
        'Clique em Salvar Controle de Acesso.',
      ],
    },
    {
      title: 'Usar um perfil pronto',
      steps: [
        'Em Perfis de Acesso Rápido, clique no perfil: Perfil Comercial, Perfil Projetos, Perfil Financeiro, Perfil Diretor ou Administrador do Sistema.',
        'O perfil substitui tudo o que estava marcado. Ajuste linha a linha depois, se quiser.',
        'Nada é gravado até você clicar em Salvar Controle de Acesso.',
      ],
    },
    {
      title: 'O que não depende da matriz',
      steps: [
        'Quem tem a função Diretor vê e edita todas as telas, marcado ou não.',
        'Minhas Atividades não está na matriz: aparece pela função, para Arquiteto, Estagiário e Coordenador.',
        'Quem é aprovado em Controle de Acesso entra sem nenhuma tela liberada. Configure a matriz logo depois.',
      ],
    },
  ],
  links: [
    { key: 'team', why: 'Onde fica o item Permissões de cada pessoa.' },
    { key: 'sidebar', why: 'O que a pessoa passa a ver depois de salvar.' },
    { key: 'impersonate', why: 'Conferir o resultado vendo o sistema como ela.' },
  ],
}
