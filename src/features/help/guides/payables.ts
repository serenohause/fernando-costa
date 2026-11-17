import { ArrowUpCircle } from 'lucide-react'
import type { Guide } from '../types'

export const payablesGuide: Guide = {
  title: 'Pagamentos',
  icon: ArrowUpCircle,
  menu: 'payables',
  page: 'AccountsPayable',
  purpose:
    'As despesas do escritório (na tela, Contas a Pagar): o que vence e o que já foi pago.',
  tasks: [
    {
      title: 'Ver o que vence no mês',
      steps: [
        'Use as setas ao lado do mês para trocar de mês. A lista mostra as contas com vencimento no mês escolhido. O botão Hoje, quando aparece, volta ao mês atual.',
        'Filtre pelos botões Todos, Em atraso, Previsto e Pago. Mostrar Recorrentes deixa só os pagamentos recorrentes.',
        'No campo Busca, digite pelo menos duas letras do fornecedor ou do projeto.',
        'Os cartões Total, Pago, Previsto e Em atraso somam só o que está filtrado na lista.',
        'Exportar PDF gera o relatório do que está na tela.',
      ],
    },
    {
      title: 'Lançar uma despesa',
      edit: true,
      steps: [
        'Clique em Nova Conta.',
        'Preencha Fornecedor, Categoria, Descrição, Valor (R$) e Vencimento, que são obrigatórios. Se quiser, escolha o Projeto e a Competência.',
        'Digite o valor só com números: ele entra pelos centavos. Digitar 1, 2, 3 mostra 1,23.',
        'Clique em Criar Conta.',
      ],
    },
    {
      title: 'Lançar um pagamento recorrente',
      edit: true,
      steps: [
        'No formulário da conta, marque Este pagamento é recorrente.',
        'Escolha a Frequência e a Data de Início, que são obrigatórias.',
        'Se quiser limitar, informe a Data de Término ou a Quantidade de Repetições. Sem nenhum dos dois, os lançamentos são gerados para até dez anos.',
        'Ao salvar, o sistema gera os lançamentos futuros. Cada um pode ser editado ou pago à parte.',
        'No menu de três pontos da conta recorrente: Pausar Recorrência, Reativar Recorrência e Encerrar Recorrência.',
      ],
    },
    {
      title: 'Dar baixa num pagamento',
      edit: true,
      steps: [
        'Na linha da conta, abra o menu de três pontos e clique em Marcar como Pago.',
        'Escolha a Forma de Pagamento. A data do pagamento é a de hoje.',
        'Clique em Confirmar Pagamento. Em pagamento recorrente, só aquela parcela é marcada como paga.',
      ],
    },
    {
      title: 'Editar ou excluir',
      edit: true,
      steps: [
        'No menu de três pontos, Editar abre o formulário. Num lançamento gerado por recorrência, o item é Editar este lançamento.',
        'Para levar a mudança aos próximos, marque Atualizar também todos os pagamentos recorrentes futuros desta série.',
        'Excluir pede confirmação. Num pagamento recorrente, escolha entre Excluir somente este pagamento e Excluir este pagamento e todos os pagamentos futuros.',
        'Os pagamentos já realizados da série são preservados.',
      ],
    },
  ],
  links: [
    { key: 'projects', why: 'O projeto a que a despesa está ligada.' },
    { key: 'dashboard_overview', why: 'As despesas pagas e o resultado do mês.' },
  ],
  tour: [
    {
      target: 'payables-new',
      edit: true,
      title: 'Lançar uma despesa',
      body: 'Nova Conta abre o formulário. Para um pagamento recorrente, marque Este pagamento é recorrente.',
    },
    {
      target: 'payables-export',
      title: 'Exportar PDF',
      body: 'Gera o relatório do que está na tela, com os filtros aplicados.',
    },
    {
      target: 'payables-stats',
      title: 'Os totais',
      body: 'Total, Pago, Previsto e Em atraso somam só o que está filtrado na lista.',
    },
    {
      target: 'payables-month',
      title: 'Trocar de mês',
      body: 'A lista mostra as contas com vencimento no mês escolhido. Hoje, quando aparece, volta ao mês atual.',
    },
    {
      target: 'payables-search',
      title: 'Buscar',
      body: 'Digite pelo menos duas letras do fornecedor ou do projeto.',
    },
    {
      target: 'payables-status',
      title: 'Filtrar por status',
      body: 'Todos, Em atraso, Previsto e Pago. O número conta as contas de cada um.',
    },
    {
      target: 'payables-recurring',
      title: 'Só os recorrentes',
      body: 'Mostrar Recorrentes deixa na lista só os pagamentos recorrentes.',
    },
    {
      target: 'payables-menu',
      edit: true,
      title: 'Pagar, editar ou excluir',
      body: 'No menu de três pontos ficam Editar, Marcar como Pago e Excluir. Na conta recorrente, também Pausar, Reativar e Encerrar Recorrência.',
    },
  ],
}
