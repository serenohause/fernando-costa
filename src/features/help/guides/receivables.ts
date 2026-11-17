import { ArrowDownCircle } from 'lucide-react'
import type { Guide } from '../types'

export const receivablesGuide: Guide = {
  title: 'Recebíveis',
  icon: ArrowDownCircle,
  menu: 'receivables',
  page: 'AccountsReceivable',
  purpose:
    'As receitas do escritório: o que há a receber dos contratos e o que já foi recebido.',
  tasks: [
    {
      title: 'Ver o que entra no mês',
      steps: [
        'Use as setas ao lado do mês para trocar de mês. A lista mostra as contas com vencimento no mês escolhido. O botão Hoje, quando aparece, volta ao mês atual.',
        'Filtre pelos botões Todos, Em atraso, Previsto e Recebido.',
        'No campo Cliente, digite pelo menos duas letras do cliente ou do projeto.',
        'Os cartões Total, Recebido, Previsto e Em atraso somam só o que está filtrado na lista.',
        'Exportar PDF gera o relatório do que está na tela.',
      ],
    },
    {
      title: 'Lançar um recebível',
      edit: true,
      steps: [
        'Clique em Novo Recebível.',
        'Preencha Descrição, Valor Total (R$) e Vencimento, que são obrigatórios. Se quiser, escolha Cliente, Contrato e Projeto.',
        'Digite o valor só com números: ele entra pelos centavos. Digitar 1, 2, 3 mostra 1,23.',
        'Para dividir, marque Parcelar recebimento e informe a Quantidade de Parcelas. O valor total é dividido entre elas, e cada parcela vence um mês depois da anterior. Ajuste em Valores Individuais (R$) se precisar.',
        'Clique em Criar Conta.',
      ],
    },
    {
      title: 'Dar baixa, editar ou remover',
      edit: true,
      steps: [
        'Na linha da conta, abra o menu de três pontos.',
        'Marcar como Pago dá a baixa da parcela.',
        'Se a parcela tem cobrança em aberto no Asaas, o sistema avisa antes: marcar como paga aqui não cancela a cobrança. Cancele no painel do Asaas antes de confirmar.',
        'Editar abre o formulário; salve com Salvar Alterações. Remover pede confirmação e não pode ser desfeito.',
      ],
    },
    {
      title: 'Gerar a cobrança no Asaas',
      edit: true,
      steps: [
        'Clique na linha da conta, ou em Gerar cobrança no menu de três pontos.',
        'No painel, clique em Gerar cobrança no Asaas.',
        'Clique em Copiar link e envie ao cliente. Na página do link ele paga por PIX, boleto ou cartão.',
      ],
      note: 'A conta precisa ter cliente, e o cliente precisa ter CPF ou CNPJ no cadastro. A conta Asaas do escritório é ligada em Configurações.',
    },
    {
      title: 'Acompanhar a cobrança',
      steps: [
        'Na coluna Status, a segunda linha mostra a situação da cobrança, como Aguardando pagamento, Cobrança vencida no Asaas ou Baixado pelo aviso do Asaas.',
        'Clique na linha da conta para abrir o painel da cobrança, com o link de pagamento para copiar.',
        'Quando o cliente paga, o Asaas avisa e a parcela vira paga sozinha. Se o painel mostrar que o aviso de pagamento não está registrado, a baixa é manual, por Marcar como Pago.',
        'Para cancelar ou alterar a cobrança, use o painel do Asaas. Esta tela emite e acompanha, mas não altera.',
      ],
    },
  ],
  links: [
    { key: 'contracts', why: 'O contrato de onde vêm as parcelas a receber.' },
    { key: 'crm', why: 'O cadastro do cliente, com o CPF ou CNPJ que a cobrança exige.' },
    { key: 'settings', why: 'Onde se liga a conta Asaas do escritório.' },
    { key: 'dashboard_overview', why: 'A receita prevista e a recebida do mês.' },
  ],
}
