import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { financialKeys } from '@/features/financial/hooks'
import type { Tables } from '@/lib/database.types'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/edge-functions'
import { supabase } from '@/lib/supabase'
import { asaasKeys } from './hooks'
import {
  recusaDoServidor,
  RECUSA_SEM_SERVIDOR,
  type RecusaDaEmissao as RecusaDaEmissaoInterna,
} from './situacao'

/*
  A COBRANÇA DA PARCELA: consulta, emissão e tradução de situação.

  Tudo o que a tela de Contas a Receber precisa saber sobre `asaas_charges` sai
  deste arquivo. O protótipo aprovado (prototypes/asaas-cobranca.html, capítulo
  2) é a fonte do que aparece; aqui fica a decisão de onde cada coisa vem.

  ESTE ARQUIVO SUBSTITUIU `useAsaasLiveCharges` de `hooks.ts`. Lá a consulta lia
  três colunas, só para decidir se "Marcar como Pago" pergunta antes. O painel
  da cobrança precisa de muito mais colunas DAS MESMAS LINHAS — a cobrança viva
  de cada parcela — e duas consultas sobre a mesma tabela, com o mesmo recorte,
  se desalinhariam na primeira invalidação que alguém esquecesse. Então a
  consulta é uma só, mais larga, e quem só precisa dos três campos continua
  recebendo um mapa que os tem.

  `cobrancaQueAindaPodeSerPaga` continua em `baixa-manual.ts`, sem mudança: ela
  recebe `Map<string, AsaasLiveCharge>` e `CobrancaDaParcela` tem as três
  colunas daquele tipo, então o mapa novo serve para ela como estava.
*/

/*
  O RECORTE DE `asaas_charges` QUE O PAINEL DESENHA, coluna por coluna, e nada
  além:

    id, receivable_id, asaas_payment_id   identificação, aqui e no painel deles;
    status, billing_type                  a situação (seção 7b) e a forma;
    value, net_value                      valor cobrado e líquido na conta. A
                                          TAXA NÃO É COLUNA: é `value -
                                          net_value`, e some da tela quando
                                          `net_value` é nulo (ver `taxaDoAsaas`);
    due_date                              o vencimento no Asaas;
    payment_date, client_payment_date      "Pago em" da seção 14;
    invoice_url, bank_slip_url,
    pix_payload                           as três linhas da tira de copiar;
    pix_expires_at                        lida e NÃO mostrada; ver `pixVencido`;
    deleted                               cobrança removida no Asaas (seção 7b);
    created_at, created_by                "Emitida por ... em ...";
    synced_at                             o instante do último aviso do Asaas,
                                          que é o que a faixa da seção 14 data.

  Fora: `environment`, `external_reference`, `original_value`, `interest_value`,
  `original_due_date`, `credit_date`, `estimated_credit_date`, `invoice_number`,
  `transaction_receipt_url`, `asaas_installment_*`. Nenhuma delas aparece no
  capítulo 2 do protótipo, e coluna lida sem ser mostrada é peso sem leitor.
*/
export type CobrancaDaParcela = Pick<
  Tables<'asaas_charges'>,
  | 'id'
  | 'receivable_id'
  | 'asaas_payment_id'
  | 'status'
  | 'billing_type'
  | 'value'
  | 'net_value'
  | 'due_date'
  | 'payment_date'
  | 'client_payment_date'
  | 'invoice_url'
  | 'bank_slip_url'
  | 'pix_payload'
  | 'pix_expires_at'
  | 'deleted'
  | 'created_at'
  | 'synced_at'
> & {
  /* Quem clicou em "Gerar cobrança", pelo nome ATUAL do cadastro. A FK é
     composta `(created_by_id, tenant_id)`, então o embed vai pelo nome da
     constraint, como no resto do projeto. `on delete set null` existe na 0125:
     colaborador apagado deixa a cobrança sem autor, e a tela diz isso. */
  created_by: { id: string; name: string } | null
}

const COBRANCAS_SELECT = `
  id,
  receivable_id,
  asaas_payment_id,
  status,
  billing_type,
  value,
  net_value,
  due_date,
  payment_date,
  client_payment_date,
  invoice_url,
  bank_slip_url,
  pix_payload,
  pix_expires_at,
  deleted,
  created_at,
  synced_at,
  created_by:collaborators!asaas_charges_created_by_fkey(id, name)
`

/*
  AS COBRANÇAS VIVAS DO ESCRITÓRIO, indexadas pela parcela.

  POR QUE UMA CONSULTA SÓ, SEM FILTRO DE PERÍODO. A tela filtra por mês, e seria
  natural pedir as cobranças do mesmo mês. Não vale a pena: a 0125 garante no
  máximo UMA cobrança viva por parcela (índice único parcial), e cobrança viva é,
  por definição, cobrança que ainda não terminou — o conjunto é da ordem das
  parcelas em aberto do escritório, não do histórico. Uma consulta sem parâmetro
  também é uma entrada de cache só, que não se fragmenta a cada troca de mês.

  `deleted = false` É O QUE FAZ O MAPA SER UM MAPA. O índice único é parcial
  (`where not deleted`): removida no Asaas, a parcela pode receber cobrança nova,
  e nada impede duas, três linhas removidas para a mesma parcela. Sem este
  filtro, uma chave do mapa teria mais de um valor disputando o lugar e a tela
  escolheria em silêncio. O preço está escrito em `situacaoDaCobranca`: a
  situação "Removida no Asaas" da seção 7b não chega a aparecer, e parcela cuja
  cobrança foi removida lá volta a ler "Sem cobrança emitida" — que é verdade,
  porque ela está livre para uma emissão nova.

  QUEM RECORTA É A RLS, E NÃO ESTE ARQUIVO. A policy da 0126 deixa ler
  `asaas_charges` apenas do próprio tenant e apenas para quem vê o menu
  `receivables`. Não há `tenant_id` nenhum neste código de propósito: repetir o
  recorte aqui criaria uma segunda cópia da regra para desalinhar, e quem não
  pode ver recebe lista vazia.

  ESCRITÓRIO SEM ASAAS RECEBE MAPA VAZIO, e isso é o caso comum hoje: a tabela
  não tem linha nenhuma e a consulta volta sem nada. Nenhuma tela precisa saber
  se a integração existe para usar este hook.
*/
export function useCobrancasPorParcela() {
  return useQuery({
    queryKey: asaasKeys.charges(),
    queryFn: async (): Promise<Map<string, CobrancaDaParcela>> => {
      const { data, error } = await supabase
        .from('asaas_charges')
        .select(COBRANCAS_SELECT)
        .eq('deleted', false)

      if (error) throw error

      /*
        Mapa, e não lista: quem chama pergunta por uma parcela de cada vez,
        dentro do render de cada linha da tabela. Procurar numa lista ali seria
        uma varredura por linha desenhada.
      */
      const porParcela = new Map<string, CobrancaDaParcela>()
      for (const cobranca of (data ?? []) as unknown as CobrancaDaParcela[]) {
        porParcela.set(cobranca.receivable_id, cobranca)
      }
      return porParcela
    },
  })
}

/* O que `asaas-charge` devolve em 200. O contrato está escrito no cabeçalho da
   função e em `respostaDaCobranca`, no fim dela. */
export type RespostaDaEmissao = {
  chargeId: string
  asaasPaymentId: string
  invoiceUrl: string | null
  bankSlipUrl: string | null
  pixPayload: string | null
  pixExpiresAt: string | null
  status: string
  billingType: string
  value: number
  dueDate: string
  /* A parcela já tinha cobrança viva e esta é a mesma. NÃO É ERRO: segundo
     clique no botão é o caso comum, e quem clicou quer o link (seção 13). */
  alreadyExisted: boolean
  /*
    Falso significa que a cobrança saiu e NENHUM aviso vai chegar: o cliente
    paga e a parcela não baixa sozinha. Sai em todas as respostas de sucesso,
    inclusive nas de `alreadyExisted`.

    O CAPÍTULO 2 DO PROTÓTIPO NÃO DESENHA ESTE ESTADO no painel da cobrança (a
    faixa âmbar "O aviso de pagamento não está registrado no Asaas" existe no
    capítulo 1, na tela de Configurações), e o painel não o mostra. Está no
    relatório de entrega como ponto em aberto, porque a letra miúda da seção 11
    promete baixa automática e essa promessa não vale quando isto é falso.
  */
  webhookRegistered: boolean
}

/*
  EMITIR A COBRANÇA DE UMA PARCELA.

  A autorização é do servidor: `asaas-charge` exige sessão e `can_edit` no menu
  `receivables` (emitir é mais do que ver). A tela esconde o botão de quem não
  pode, e isso é conveniência, não trava.

  A INVALIDAÇÃO ACONTECE DENTRO DA MUTATION, DE PROPÓSITO, e é o que faz o
  painel não precisar montar a cobrança com os campos da resposta. O corpo de
  200 não traz `created_at` nem quem emitiu, e a seção 11 mostra "Emitida por
  Fernando Costa, em 03/11/2026 às 14:22" — dado que só existe na linha do
  banco. Esperando o refetch aqui, `isPending` continua verdadeiro até o mapa
  ter a cobrança, o painel fica em "Emitindo" até lá e depois desenha a partir
  de UMA fonte só. Compor a tela com a resposta e a linha ao mesmo tempo seria
  duas fontes para o mesmo painel.
*/
export function useGerarCobranca() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (receivableId: string): Promise<RespostaDaEmissao> => {
      const resposta = await invokeEdgeFunction<RespostaDaEmissao>('asaas-charge', {
        receivableId,
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: asaasKeys.charges() }),
        /* A parcela em si não muda ao emitir, mas a lista é lida junto com a
           cobrança e o protótipo pede as duas em pé depois da emissão. */
        queryClient.invalidateQueries({ queryKey: financialKeys.receivables() }),
      ])

      return resposta
    },
  })
}

/* ------------------------------------------------------------------ */
/* A tradução da situação e a recusa, que moram em `situacao.ts`      */
/* ------------------------------------------------------------------ */

/*
  REEXPORTADAS daqui porque é daqui que a tela já as importava, e porque é aqui
  que elas pertencem conceitualmente: quem lê `cobranca.ts` não precisa saber
  que o teste de Node obrigou a separação. O motivo do recorte está no cabeçalho
  de `situacao.ts`.
*/
export {
  dataEHoraBR,
  pagoEm,
  pixVencido,
  primeiroNome,
  situacaoDaCobranca,
  taxaDoAsaas,
} from './situacao'
export type {
  DesfechoDaCobranca,
  FamiliaDaSituacao,
  RecusaDaEmissao,
  SituacaoDaCobranca,
} from './situacao'

/*
  O EMBRULHO: reconhecer o erro é a única parte que precisa de
  `@/lib/edge-functions`, e por isso é a única que ficou fora de `situacao.ts`.
*/
export function recusaDaEmissao(erro: unknown): RecusaDaEmissaoInterna {
  if (erro instanceof EdgeFunctionError) return recusaDoServidor(erro.code, erro.message)
  return RECUSA_SEM_SERVIDOR
}

/* ------------------------------------------------------------------ */
/* O invólucro do painel: diálogo no desktop, folha no celular        */
/* ------------------------------------------------------------------ */

const CORTE_DO_PAINEL = '(min-width: 40rem)'

/*
  QUAL DOS DOIS INVÓLUCROS MONTAR, e por que esta é a primeira leitura de
  `matchMedia` do projeto.

  O par é o que o protótipo do sino fixou e a seção 18 repete: Dialog centrado
  no desktop, `Sheet side="bottom"` no celular. No sino a escolha é do CSS
  (`hidden sm:block` no gatilho), e ali isso funciona porque o que está escondido
  é o BOTÃO: o painel nasce do clique dele, e botão com `display: none` não é
  clicável.

  AQUI NÃO HÁ GATILHO: o painel abre pelo clique na linha da tabela, que é uma só
  para os dois tamanhos. Montar os dois invólucros com o mesmo `open` abriria os
  dois ao mesmo tempo, e o conteúdo deles vai para um portal no fim do documento
  — esconder o invólucro por CSS não esconde o portal. O resultado seriam dois
  fundos escurecidos sobrepostos (um 80% sobre o outro) e duas armadilhas de foco
  disputando o teclado.

  Então a escolha é de JavaScript, no mesmo corte do CSS (40rem é o `sm` do
  Tailwind, e é a media query que o próprio protótipo usa para o painel). Tudo o
  que muda DENTRO do painel continua sendo CSS, com as classes `sm:`.
*/
export function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CORTE_DO_PAINEL).matches,
  )

  useEffect(() => {
    const consulta = window.matchMedia(CORTE_DO_PAINEL)
    const ouvir = () => setLarga(consulta.matches)

    ouvir()
    consulta.addEventListener('change', ouvir)
    return () => consulta.removeEventListener('change', ouvir)
  }, [])

  return larga
}
