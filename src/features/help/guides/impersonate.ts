import { UserCog } from 'lucide-react'
import type { Guide } from '../types'

export const impersonateGuide: Guide = {
  title: 'Acessar como',
  icon: UserCog,
  special: 'impersonate',
  purpose:
    'Só para o Diretor: entra no sistema como outra pessoa para ver o que ela vê. Cada acesso fica registrado.',
  tasks: [
    {
      title: 'Entrar como outra pessoa',
      steps: [
        'Em Equipe, na linha da pessoa, abra o menu de três pontos e clique em Acessar como.',
        'Leia o aviso e clique em Acessar como, com o nome dela.',
        'A página recarrega. A faixa violeta Sessão assumida, no topo, mostra de quem é a sessão.',
      ],
    },
    {
      title: 'O que muda enquanto você está na sessão dela',
      steps: [
        'Você vê os menus e os dados dela. O que a permissão dela não abre, você também não abre.',
        'Tudo o que você escrever fica gravado no nome dela no histórico: tarefa, diário de projeto, contrato.',
        'Cada acesso fica registrado em auditoria, com quem assumiu, quem foi assumido e quando.',
      ],
    },
    {
      title: 'Voltar para a sua conta',
      steps: [
        'Clique em Voltar para minha conta, na faixa do topo. No celular, o botão diz Voltar.',
        'Não precisa digitar a senha de novo.',
      ],
    },
    {
      title: 'O item Acessar como está cinza',
      steps: [
        'O motivo aparece escrito logo abaixo do item.',
        'Pessoa sem login: defina uma senha provisória em Editar.',
        'Também não dá para acessar como quem não está em atividade, como você mesmo ou como outro Diretor.',
      ],
    },
  ],
  links: [
    { key: 'team', why: 'Onde fica o item Acessar como.' },
    { key: 'permissions', why: 'O que define o que a pessoa vê.' },
  ],
}
