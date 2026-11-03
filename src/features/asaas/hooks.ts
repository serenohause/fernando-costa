export const asaasKeys = {
  all: ['asaas'] as const,
  /*
    AS COBRANÇAS VIVAS DO ESCRITÓRIO, uma entrada de cache só.

    A consulta mora em `cobranca.ts`, com o recorte e o motivo escritos lá. A
    chave fica aqui porque é o lugar das chaves desta feature, e porque quem
    invalida ("emitiu cobrança") não é quem consulta.

    ELA JÁ FOI DUAS. Até 03/11/2026 existia aqui um `useAsaasLiveCharges` que
    lia três colunas (`receivable_id`, `status`, `asaas_payment_id`) só para
    decidir se "Marcar como Pago" pergunta antes, e o painel da cobrança
    precisava das mesmas linhas com muito mais colunas. Duas consultas sobre a
    mesma tabela, com o mesmo recorte, se desalinham na primeira invalidação que
    alguém esquecer de repetir — então ficou uma, a larga, e quem só precisa dos
    três campos continua recebendo um mapa que os tem.
  */
  charges: () => [...asaasKeys.all, 'charges'] as const,

  /*
    O ESTADO DA CONEXÃO COMO A TELA DE COBRANÇA O VÊ: em que ambiente a conta
    fala e se o aviso de pagamento está registrado. Dois campos, por função
    (0129), porque a linha inteira de `asaas_connections` é leitura de quem vê
    Configurações e quem usa Contas a Receber é o financeiro.

    SEPARADA DE `asaasConnectionKeys` de propósito: aquela é a linha inteira,
    para a tela de Configurações, e esta é o recorte de dois campos. Quem conecta
    invalida as duas; quem emite cobrança não invalida nenhuma.
  */
  connectionStatus: () => [...asaasKeys.all, 'connection-status'] as const,
}
