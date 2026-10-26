import type { Tables } from '@/lib/database.types'
import type { ProductLeadStatus } from '@/lib/enums'

/*
  O lead como ele está no banco. NÃO há embed nenhum aqui, e isso é o módulo
  inteiro em uma frase: a linha não pertence a escritório nenhum, então não há
  cliente, projeto ou colaborador para juntar a ela. É nome, e-mail e de onde
  veio.
*/
export type ProductLead = Tables<'product_leads'>

export type LeadFilters = {
  status: ProductLeadStatus | 'all'
  /* Recorte em memória, não WHERE: a fila é pequena (a leitura inteira tem
     teto de 500) e a busca varre e-mail, nome e escritório ao mesmo tempo. */
  search: string
}

/*
  O que a tela pode gravar — e é MENOS do que a tabela tem, por privilégio de
  coluna, não por escolha de UI: a migration 0112 concede `update (status,
  contacted_at, notes)` e mais nada. Tentar gravar o e-mail daqui levaria 42501
  do Postgres, e é de propósito: ninguém reescreve o que a pessoa digitou.

  `contacted_at` não aparece porque quem decide o valor dele é o hook, a partir
  do status — ver useUpdateLead.
*/
export type LeadPatch = {
  status?: ProductLeadStatus
  notes?: string | null
}
