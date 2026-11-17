import { ClipboardList } from 'lucide-react'
import type { Guide } from '../types'

export const clientBudgetGuide: Guide = {
  title: 'Orçamento por Cliente',
  icon: ClipboardList,
  menu: 'client_budget',
  page: 'OrcamentoCliente',
  purpose:
    'Checklist do que orçar para cada cliente, por fase do projeto, com responsável e status.',
  tasks: [
    {
      title: 'Encontrar um checklist',
      steps: [
        'Use os três filtros do topo: status, responsável e fase do projeto.',
        'Cada cartão mostra os itens finalizados, a barra de progresso, o Total Estimado e o Total Aprovado. O clipe indica PDFs anexados.',
        'Clique no cartão para abrir o checklist. O nome do cliente abre a ficha dele no CRM, se você tem acesso ao CRM.',
      ],
    },
    {
      title: 'Criar um checklist',
      edit: true,
      steps: [
        'Clique em Novo Checklist.',
        'Escolha o Cliente, que é obrigatório. Projeto, Responsável pelo Orçamento, Fase do Projeto e % Curadoria são opcionais.',
        'Clique em Criar Checklist.',
      ],
    },
    {
      title: 'Adicionar itens ao checklist',
      edit: true,
      steps: [
        'Dentro do checklist, clique em Adicionar Item.',
        'Preencha Nome do Item e Categoria, que são obrigatórios.',
        'Valor Aprovado (R$) e Valor Estimado (R$) entram pelos centavos: digitar 150000 dá R$ 1.500,00.',
        'Em Fornecedores Cotados, escolha o fornecedor, digite o valor e clique em Adicionar. Fornecedor Escolhido sugere os da mesma categoria do item.',
        'Clique em Adicionar Item.',
      ],
      note: 'Os itens aparecem agrupados por categoria. No progresso, item Aprovado ou Cancelado conta como finalizado.',
    },
    {
      title: 'Anexar orçamentos e registrar a aprovação',
      edit: true,
      steps: [
        'Clique no item para abrir o painel lateral.',
        'Em Orçamentos em PDF, Anexar orçamento PDF guarda o orçamento de cada fornecedor cotado.',
        'Em Aprovação do Cliente, Anexar aprovação acrescenta um PDF por vez. Só PDF, de até 20 MB.',
        'Na linha do item, o selo Comissão pendente vira Comissão recebida com um clique.',
        'Editar, no rodapé do painel, abre o formulário do item. A lixeira exclui o item.',
      ],
    },
    {
      title: 'Mudar o status ou excluir o checklist',
      edit: true,
      steps: [
        'No alto do checklist, o seletor de status muda entre Aberto, Em andamento, Aguardando cliente, Concluído e Cancelado.',
        'Para excluir, use Excluir no menu de três pontos do cartão. Itens, cotações e PDFs vão junto, e a exclusão não pode ser desfeita.',
      ],
    },
  ],
  links: [
    { key: 'suppliers', why: 'Os fornecedores que aparecem nas cotações.' },
    { key: 'crm', why: 'O cadastro do cliente do checklist.' },
    { key: 'projects', why: 'O projeto ligado ao checklist.' },
  ],
}
