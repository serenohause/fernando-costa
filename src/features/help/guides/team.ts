import { UserCircle } from 'lucide-react'
import type { Guide } from '../types'

export const teamGuide: Guide = {
  title: 'Equipe',
  icon: UserCircle,
  menu: 'team',
  page: 'Collaborators',
  purpose: 'Cadastro da equipe: função, área e status de cada pessoa.',
  tasks: [
    {
      title: 'Quem mexe nesta tela',
      steps: [
        'Só o Diretor gerencia a equipe. Para os demais, a tela mostra Acesso Negado.',
        'A lista mostra cada pessoa com função, área, E-mail, Carga Horária e Status.',
        'O selo sem login, ao lado do e-mail, indica quem está cadastrado mas ainda não entra no sistema.',
      ],
    },
    {
      title: 'Cadastrar uma pessoa',
      edit: true,
      steps: [
        'Clique em Novo Membro.',
        'Preencha Nome do Colaborador, Função e E-mail interno, que são obrigatórios. Se quiser, escolha Status, Área e Carga horária semanal.',
        'Para a pessoa entrar no sistema, preencha Senha provisória, com pelo menos 8 caracteres. Em branco, o cadastro entra sem acesso ao sistema.',
        'Clique em Criar Colaborador.',
      ],
      note: 'Nenhum e-mail é enviado: passe a senha provisória por outro canal. No primeiro acesso a pessoa é obrigada a trocá-la por uma dela.',
    },
    {
      title: 'Editar ou redefinir a senha',
      edit: true,
      steps: [
        'Na linha da pessoa, abra o menu de três pontos e clique em Editar.',
        'Quem está sem login: preencha Senha provisória para criar o login.',
        'Quem já tem login: Nova senha provisória redefine a senha. Em branco, nada muda.',
        'Clique em Salvar Alterações.',
      ],
      note: 'Com Status Férias ou Afastado, a pessoa não entra no sistema até voltar para Ativo.',
    },
    {
      title: 'Remover uma pessoa',
      edit: true,
      steps: [
        'No menu de três pontos, clique em Remover.',
        'Confirme em Excluir. A exclusão não pode ser desfeita.',
      ],
    },
  ],
  links: [
    { key: 'permissions', why: 'As telas que cada pessoa vê e edita.', via: 'pelo item Permissões do menu de três pontos' },
    { key: 'impersonate', why: 'Ver o sistema como a pessoa vê.', via: 'pelo item Acessar como do menu de três pontos' },
    { key: 'access_control', why: 'Os pedidos de acesso que esperam resposta.' },
    { key: 'first_login', why: 'O que a pessoa vê ao entrar com a senha provisória.' },
  ],
  tour: [
    {
      target: 'team-new',
      edit: true,
      title: 'Cadastrar uma pessoa',
      body: 'Novo Membro abre o formulário. Para a pessoa entrar no sistema, preencha Senha provisória, com pelo menos 8 caracteres.',
    },
    {
      target: 'team-person',
      title: 'Cada pessoa',
      body: 'A linha mostra nome, função e área, com E-mail, Carga Horária e Status ao lado.',
    },
    {
      target: 'team-no-login',
      title: 'Sem login',
      body: 'A pessoa está cadastrada, mas ainda não entra no sistema. Preencher Senha provisória em Editar cria o login.',
    },
    {
      target: 'team-menu',
      edit: true,
      title: 'Editar, permissões, remover',
      body: 'No menu de três pontos ficam Editar, Permissões, Acessar como e Remover. Remover não pode ser desfeito.',
    },
  ],
}
