import { FileText } from 'lucide-react'
import type { Guide } from '../types'

export const contractsGuide: Guide = {
  title: 'Contratos & Propostas',
  icon: FileText,
  menu: 'contracts',
  page: 'Contracts',
  purpose:
    'Contratos e propostas comerciais por cliente e projeto. O contrato pode nascer do briefing conferido no Pipeline.',
  tasks: [
    {
      title: 'Encontrar um contrato',
      steps: [
        'Digite no campo Buscar por nº do contrato, cliente ou projeto...',
        'Use as abas Todos, Em negociação, Aprovados, Em execução e Concluídos. Contratos Rescindidos só aparecem em Todos.',
        'A aba Kanban mostra os contratos em colunas, uma por status.',
        'O selo Geradas ou Pendente diz se as parcelas do contrato já foram criadas.',
      ],
    },
    {
      title: 'Criar uma proposta',
      edit: true,
      steps: [
        'Clique em Nova Proposta.',
        'O Número do Contrato já vem sugerido. Escolha o Tipo de Contrato e informe o Valor Total (R$), que são obrigatórios.',
        'O valor entra pelos centavos: digitar 1500000 dá R$ 15.000,00.',
        'Ao escolher o Cliente, os Dados do Cliente são copiados do cadastro. Confira e complete o Endereço da Obra.',
        'Clique em Criar Contrato. A proposta nasce Em negociação.',
      ],
    },
    {
      title: 'Aprovar a proposta',
      edit: true,
      steps: [
        'No menu de três pontos de um contrato Em negociação, clique em Aprovar Proposta. Ou, na aba Kanban, arraste o cartão para Aprovado e confirme.',
        'Aprovar cria o projeto em Projetos e o cartão inicial no Fluxo do Projeto. Se o contrato já tem projeto, ele é reaproveitado.',
        'Na aba Kanban, arrastar para as outras colunas só muda o status.',
      ],
      note: 'Pelo menu de três pontos, a aprovação acontece direto, sem a pergunta de confirmação que o Kanban faz.',
    },
    {
      title: 'Gerar as parcelas',
      edit: true,
      steps: [
        'No menu de três pontos, clique em Gerar Parcelas.',
        'Se o contrato já tem parcelamento salvo, a caixa verde mostra a configuração. Se não tem, informe Número de parcelas e Data de vencimento da 1ª parcela. Assim as parcelas saem mensais.',
        'Clique em Gerar Parcelas. As parcelas vão para Recebíveis, e o selo do contrato passa a Geradas.',
        'Contrato de R$ 0,00 só gera com Bonificação marcada. O botão vira Registrar Bonificação.',
      ],
      note: 'Gerar parcelas exige também permissão de edição em Recebíveis. Sem ela, o sistema recusa com uma mensagem de erro.',
    },
    {
      title: 'Editar, reordenar ou excluir',
      edit: true,
      steps: [
        'Editar, no menu de três pontos, abre o formulário. Salve com Salvar Alterações.',
        'Na lista, segure a alça à esquerda e arraste para mudar a ordem. O aviso Ordem atualizada! confirma.',
        'Remover mostra antes o que será apagado junto: parcelas, projeto, cartões do Fluxo do Projeto e registros do Diário. O cliente e a negociação ficam.',
        'Se algo impedir a exclusão, o aviso lista o quê, e o botão Excluir não aparece.',
      ],
    },
  ],
  links: [
    {
      key: 'pipeline',
      why: 'Onde o contrato pode nascer do briefing conferido.',
      via: 'pelo botão Gerar contrato, em Briefings recebidos',
    },
    { key: 'receivables', why: 'As parcelas geradas do contrato.' },
    { key: 'projects', why: 'O projeto criado na aprovação.' },
    { key: 'project_flow', why: 'O cartão inicial criado na aprovação.' },
  ],
  tour: [
    {
      target: 'contracts-new',
      edit: true,
      title: 'Criar uma proposta',
      body: 'Nova Proposta abre o formulário. Tipo de Contrato e Valor Total (R$) são obrigatórios. A proposta nasce Em negociação.',
    },
    {
      target: 'contracts-search',
      title: 'Encontrar um contrato',
      body: 'Busque pelo nº do contrato, cliente ou projeto.',
    },
    {
      target: 'contracts-tabs',
      title: 'Filtrar por status',
      body: 'Rescindido não tem aba: esses contratos só aparecem em Todos.',
    },
    {
      target: 'contracts-tab-kanban',
      title: 'Kanban',
      body: 'Mostra os contratos em colunas, uma por status.',
    },
    {
      target: 'contracts-grip',
      edit: true,
      title: 'Mudar a ordem',
      body: 'Segure a alça e arraste a linha para mudar a ordem da lista.',
    },
    {
      target: 'contracts-installments',
      title: 'Parcelas',
      body: 'Geradas ou Pendente diz se as parcelas do contrato já foram criadas em Recebíveis.',
    },
    {
      target: 'contracts-menu',
      edit: true,
      title: 'Aprovar, gerar parcelas, editar',
      body: 'No menu de três pontos ficam Editar, Aprovar Proposta, Gerar Parcelas e Remover. Aprovar cria o projeto e o cartão no Fluxo do Projeto.',
    },
  ],
}
