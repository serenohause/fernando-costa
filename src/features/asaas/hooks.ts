import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AsaasLiveCharge } from './types'

export const asaasKeys = {
  all: ['asaas'] as const,
  liveCharges: () => [...asaasKeys.all, 'live-charges'] as const,
}

/*
  AS COBRANÇAS ABERTAS DO ESCRITÓRIO, indexadas pela parcela.

  POR QUE UMA CONSULTA SÓ, SEM FILTRO DE PERÍODO. A tela de Contas a Receber
  filtra por mês, e seria natural pedir as cobranças do mesmo mês. Não vale a
  pena: a 0125 garante no máximo UMA cobrança viva por parcela (índice único
  parcial), e cobrança viva é, por definição, cobrança que ainda não terminou —
  o conjunto inteiro é da ordem das parcelas em aberto do escritório, não do
  histórico. Uma consulta sem parâmetro também é uma entrada de cache só, que
  não se fragmenta a cada troca de mês.

  QUEM RECORTA É A RLS, E NÃO ESTE ARQUIVO. A policy da 0126 deixa ler
  `asaas_charges` apenas do próprio tenant e apenas para quem vê o menu
  `receivables`. Não há `tenant_id` nenhum neste código de propósito: repetir o
  recorte aqui criaria uma segunda cópia da regra para desalinhar, e quem não
  pode ver recebe lista vazia.

  ESCRITÓRIO SEM ASAAS RECEBE LISTA VAZIA, e isso é o caso comum hoje: a tabela
  não tem linha nenhuma e a consulta volta sem nada. Nenhuma tela precisa saber
  se a integração existe para usar este hook.
*/
export function useAsaasLiveCharges() {
  return useQuery({
    queryKey: asaasKeys.liveCharges(),
    queryFn: async (): Promise<Map<string, AsaasLiveCharge>> => {
      const { data, error } = await supabase
        .from('asaas_charges')
        .select('receivable_id, status')
        .eq('deleted', false)

      if (error) throw error

      /*
        Mapa, e não lista: quem chama pergunta por uma parcela de cada vez,
        dentro do render de cada linha da tabela. Procurar numa lista ali seria
        uma varredura por linha desenhada.
      */
      const porParcela = new Map<string, AsaasLiveCharge>()
      for (const cobranca of data ?? []) {
        porParcela.set(cobranca.receivable_id, cobranca)
      }
      return porParcela
    },
  })
}
