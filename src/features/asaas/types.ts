import type { Tables } from '@/lib/database.types'

/*
  O recorte de `asaas_charges` que a tela de Contas a Receber precisa para
  decidir UMA coisa: se marcar a parcela como paga na mão pode cobrar o cliente
  duas vezes.

  Não é o recorte do painel de cobrança (que mostra link, copia e cola do PIX,
  taxa e situação) — esse vem depois, com o painel. Aqui são TRÊS colunas:

    receivable_id     é a chave pela qual a lista encontra a cobrança da linha;
    status            decide se o cliente ainda consegue pagar pelo link;
    asaas_payment_id  é como a cobrança se chama no painel do Asaas, e o aviso
                      manda ir cancelar lá.

  A TERCEIRA ENTROU POR DECISÃO DO USUÁRIO (03/11/2026), e não por conta
  própria: o protótipo aprovado define a frase do aviso palavra por palavra e
  não mostra o identificador, então acrescentá-lo seria divergir do protótipo,
  que é bug de implementação (CLAUDE.md). Foi sinalizado e autorizado. Sem ele,
  a frase manda cancelar a cobrança e não diz qual é.

  `invoice_url` continua FORA: o aviso manda cancelar no painel do Asaas, não
  abrir a página de pagamento do cliente.
*/
export type AsaasLiveCharge = Pick<
  Tables<'asaas_charges'>,
  'receivable_id' | 'status' | 'asaas_payment_id'
>
