import { KeyRound } from 'lucide-react'
import type { Guide } from '../types'

export const firstLoginGuide: Guide = {
  title: 'Entrar e criar sua senha',
  icon: KeyRound,
  always: true,
  purpose:
    'No primeiro acesso o sistema pede para trocar a senha provisória, criada pelo Diretor, por uma senha sua de pelo menos 8 caracteres.',
  tasks: [
    {
      title: 'Entrar pela primeira vez',
      steps: [
        'Na tela de login, digite seu E-mail e a senha provisória que o Diretor te passou, e clique em Entrar.',
        'Abre a tela Crie sua senha. Digite a Nova senha, com pelo menos 8 caracteres, e repita em Repita a nova senha.',
        'O olho ao lado do campo mostra ou esconde o que você digitou.',
        'Clique em Salvar e entrar.',
      ],
      note: 'A senha nova precisa ser diferente da provisória. Enquanto você não trocar, o sistema não abre.',
    },
    {
      title: 'Entrei na conta errada',
      steps: ['Na tela Crie sua senha, clique em Sair, no rodapé do cartão, e entre com a conta certa.'],
    },
    {
      title: 'Esqueci a senha',
      steps: [
        'Não há botão de recuperar senha. Fale com o administrador do escritório, como diz a tela de login.',
        'O Diretor define uma nova senha provisória para você em Equipe.',
        'No próximo acesso, o sistema pede de novo para você criar a sua.',
      ],
    },
    {
      title: 'Apareceu Aguardando Liberação',
      steps: [
        'Seu login existe, mas o seu cadastro na equipe não está ativo.',
        'Avise quem cuida do sistema. Depois de liberado, basta recarregar a página.',
        'Para sair dessa tela, clique em Sair.',
      ],
    },
  ],
  links: [
    { key: 'profile', why: 'Onde você troca a senha depois, quando quiser.' },
    { key: 'sidebar', why: 'O caminho para as telas, depois de entrar.' },
  ],
}
