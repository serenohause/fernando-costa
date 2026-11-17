import { ShieldCheck } from 'lucide-react'
import type { Guide } from '../types'

export const accessControlGuide: Guide = {
  title: 'Controle de Acesso',
  icon: ShieldCheck,
  menu: 'access_control',
  page: 'AprovacoesAcesso',
  purpose: 'Aprovações de Acesso: quem pediu para entrar no sistema e espera resposta.',
  tasks: [
    {
      title: 'Ver os pedidos',
      steps: [
        'Só o Diretor abre esta tela. Para os demais, ela mostra Acesso Negado.',
        'Cada pedido mostra nome, e-mail, Data da solicitação, Última tentativa, Tentativas e Origem.',
        'Sem pedidos, aparece Nenhuma solicitação pendente.',
      ],
    },
    {
      title: 'Aprovar um pedido',
      edit: true,
      steps: [
        'No pedido, clique em Aprovar.',
        'Na janela Aprovar Acesso, confira Nome do Colaborador, Função, Área e Carga horária semanal. Função e Área já vêm como Administrativo; troque se for o caso.',
        'O E-mail interno é o do pedido e não muda. Se já existe alguém na equipe com esse e-mail, o formulário abre com o cadastro dele.',
        'Clique em Aprovar Acesso.',
      ],
      note: 'A pessoa entra sem nenhuma tela liberada. Configure as permissões dela em Equipe logo depois.',
    },
    {
      title: 'Recusar um pedido',
      edit: true,
      steps: [
        'No pedido, clique em Recusar e depois em Confirmar.',
        'Ninguém é avisado por e-mail. Se quiser dar retorno, use outro canal.',
      ],
    },
  ],
  links: [
    { key: 'permissions', why: 'Liberar as telas de quem acabou de ser aprovado.' },
    { key: 'team', why: 'Onde a pessoa aprovada aparece.' },
  ],
}
