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
}
