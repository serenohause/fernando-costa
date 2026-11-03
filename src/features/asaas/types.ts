import type { Tables } from '@/lib/database.types'

/*
  O recorte de `asaas_charges` que a tela de Contas a Receber precisa para
  decidir UMA coisa: se marcar a parcela como paga na mão pode cobrar o cliente
  duas vezes.

  Não é o recorte do painel de cobrança (que mostra link, copia e cola do PIX,
  taxa e situação) — esse vem depois, com o painel. Aqui são DUAS colunas, e são
  duas porque a decisão usa duas:

    receivable_id   é a chave pela qual a lista encontra a cobrança da linha;
    status          decide se o cliente ainda consegue pagar pelo link.

  `invoice_url` e `asaas_payment_id` ficaram FORA de propósito, embora a tabela
  os tenha e fosse fácil trazer. O protótipo aprovado define a frase do aviso
  palavra por palavra, e ela não mostra nem o link nem o identificador da
  cobrança. Trazer coluna que a tela não desenha é convite a usá-la, e
  acrescentar dado ao diálogo por conta própria é divergir do protótipo, que é
  bug de implementação (CLAUDE.md). Sinalizado ao usuário em vez de resolvido
  aqui.
*/
export type AsaasLiveCharge = Pick<Tables<'asaas_charges'>, 'receivable_id' | 'status'>
