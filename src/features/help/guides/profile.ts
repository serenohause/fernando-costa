import { Settings2 } from 'lucide-react'
import type { Guide } from '../types'

export const profileGuide: Guide = {
  title: 'Meu Perfil',
  icon: Settings2,
  always: true,
  page: 'Perfil',
  purpose:
    'Seus dados, sua foto e sua senha. Chega-se pelo seu nome, no rodapé da barra lateral.',
  tasks: [
    {
      title: 'Trocar a foto',
      steps: [
        'Clique em Trocar foto e escolha uma imagem de até 25 MB.',
        'Em Ajustar foto, arraste para posicionar e use o zoom. O que estiver dentro do círculo é o que fica.',
        'Clique em Usar esta foto.',
        'Para tirar a foto atual, clique em Remover.',
      ],
    },
    {
      title: 'Corrigir nome e telefone',
      steps: [
        'Em Dados pessoais, edite Nome e Telefone. Nome é obrigatório.',
        'Clique em Salvar alterações. O botão só acende depois que algo muda.',
      ],
      note: 'Função, área e e-mail são mantidos pela direção do escritório, na tela de Equipe.',
    },
    {
      title: 'Trocar a senha',
      steps: [
        'Na seção Senha, preencha Senha atual, Nova senha e Confirmar.',
        'A nova senha precisa ter ao menos 6 caracteres e ser diferente da atual.',
        'Clique em Alterar senha. O aviso Senha alterada confirma.',
      ],
      note: 'A senha atual é pedida para confirmar que é você.',
    },
  ],
  links: [
    { key: 'sidebar', why: 'Seu nome no rodapé abre esta tela.' },
    { key: 'first_login', why: 'A troca da senha provisória, no primeiro acesso.' },
    { key: 'team', why: 'Onde a direção muda função, área e e-mail.' },
  ],
  tour: [
    {
      target: 'profile-photo',
      title: 'Trocar a foto',
      body: 'Trocar foto abre o ajuste: o que ficar dentro do círculo é o que fica. Remover tira a foto atual.',
    },
    {
      target: 'profile-data',
      title: 'Dados pessoais',
      body: 'Aqui você corrige Nome e Telefone. Função, área e e-mail são mantidos pela direção, na tela de Equipe.',
    },
    {
      target: 'profile-save',
      title: 'Salvar',
      body: 'Salvar alterações só acende depois que algo muda.',
    },
    {
      target: 'profile-password',
      title: 'Trocar a senha',
      body: 'Preencha Senha atual, Nova senha e Confirmar. A nova precisa ter ao menos 6 caracteres e ser diferente da atual.',
    },
  ],
}
