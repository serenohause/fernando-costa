import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { camposParaGravar } from './fila'
import type { LeadPatch, ProductLead } from './types'

/*
  A FILA DE LEADS DA LANDING PAGE — e o único módulo do sistema que não é de um
  escritório.

  Todos os outros hooks deste projeto leem dado de tenant: a linha tem
  `tenant_id`, o claim do JWT diz qual é, e a RLS recorta. Aqui não existe
  tenant: quem digitou o e-mail na página de venda não tem login e não é cliente
  de ninguém. Quem lê é a equipe do produto, e quem diz quem é ela é
  `public.is_platform_admin()` (migration 0112).

  Consequência prática, e é a parte que importa: NENHUMA consulta daqui filtra
  por escritório, e nenhuma precisa. Se a policy de SELECT falhar, um Diretor de
  escritório não vê dado trocado — vê zero linha, porque a cláusula não casa. A
  tela trata isso como "não há nada aqui", e é a resposta certa para ela.
*/

export const leadKeys = {
  all: ['product-leads'] as const,
  list: () => [...leadKeys.all, 'list'] as const,
  isPlatformAdmin: ['is-platform-admin'] as const,
}

/*
  A fila inteira, de uma vez. Teto alto porque é folga: lead é dado que a equipe
  do produto lê de ponta a ponta, e paginar uma lista de contato que ninguém
  consegue encher em um ano seria complicar sem motivo. Quando passar daqui, o
  teto é o aviso de que passou.
*/
const LIST_LIMIT = 500

const LEAD_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    `product_leads_new_has_no_contact`: lead "Novo" não pode ter data de
    contato. Chegar aqui significa que o hook não limpou a data ao voltar o
    status para Novo — é defeito desta camada, não do que a pessoa clicou, e a
    mensagem diz isso em vez de culpar quem está na tela.
  */
  product_leads_new_has_no_contact:
    'O sistema tentou marcar este lead como Novo sem apagar a data de contato. Recarregue a página e tente de novo.',

  /*
    42501 aqui tem DUAS causas, e as duas são a mesma frase para quem lê: ou a
    pessoa não está em platform_admins (a policy não casou a linha), ou a
    escrita tocou coluna fora do `grant update (status, contacted_at, notes)`.
    Nos dois casos a resposta é que não é acesso dela.
  */
  '42501': 'Esta fila é da equipe do produto, e sua conta não tem acesso a ela.',

  /*
    Os dois abaixo entraram por achado de auditoria: eram alcançáveis e caíam na
    frase genérica "Não foi possível concluir a operação", que não diz nada a
    quem está na tela nem a quem está depurando.

    `product_leads_notes_len`: a anotação passa de 2000 caracteres. O textarea
    tem `maxLength`, mas isso é conveniência do navegador — quem decide é o
    check da coluna (migration 0112), e colar texto por outro caminho chega aqui.
  */
  product_leads_notes_len:
    'A anotação passou de 2000 caracteres. Encurte o texto e salve de novo.',

  /*
    `22P02`: valor fora do enum `product_lead_status`. Da tela não acontece (o
    seletor só emite os quatro), então chegar aqui é defeito de código, e a
    mensagem precisa mandar a pessoa recarregar em vez de tentar de novo.
  */
  '22P02': 'O sistema tentou gravar uma situação que não existe. Recarregue a página e tente de novo.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, LEAD_ERROR_MESSAGES)
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  "Esta conta faz parte da equipe do produto?"

  A FUNÇÃO RESPONDE SOBRE QUEM PERGUNTA, E SOBRE MAIS NINGUÉM: ela não recebe
  parâmetro, então não há como perguntar sobre terceiro. É por isso que a tela
  pergunta por ela em vez de ler `platform_admins`, que não tem GRANT para
  authenticated — nem para descobrir quem está nela.

  ISTO NÃO É A TRANCA, É A PLACA NA PORTA. Quem nega o dado é a policy de SELECT
  de product_leads; esta consulta só evita desenhar uma tela vazia com filtros e
  cabeçalho de tabela para quem não tem nada a ver com ela. Tela nunca
  reimplementa autorização (CLAUDE.md).

  `staleTime` infinito: entrar e sair da equipe do produto é ato de migration ou
  do painel da Supabase, não coisa que mude durante uma sessão.
*/
export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: leadKeys.isPlatformAdmin,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (error) throw error
      return data === true
    },
    staleTime: Infinity,
  })
}

/*
  A fila em ordem de chegada invertida — o lead de hoje é o que precisa de
  resposta hoje. É a ordem que o índice `product_leads_created_at_idx` atende
  (migration 0112), e a única leitura que a tabela tem.

  Sem filtro de status no WHERE: os quatro estados caberiam em quatro consultas
  e a tela precisa dos quatro ao mesmo tempo para contar. O recorte é em
  memória, em `filterLeads`.
*/
export function useProductLeads(enabled: boolean) {
  return useQuery({
    queryKey: leadKeys.list(),
    queryFn: async (): Promise<ProductLead[]> => {
      const { data, error } = await supabase
        .from('product_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return data ?? []
    },
    enabled,
  })
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

/*
  Marcar contato e anotar — as três colunas que o privilégio permite.

  `contacted_at` NÃO VEM DA TELA: quem decide o valor dele é `camposParaGravar`
  (fila.ts), e a regra está documentada lá, junto do check de banco que ela
  existe para respeitar.

  `.select()` no fim, e `assertRowAffected` depois: UPDATE que a policy não
  alcança não levanta erro, só não casa linha nenhuma — o Postgres responde
  "zero linhas" e, sem esta conferência, a tela mostraria sucesso para uma
  gravação que não aconteceu.
*/
export function useUpdateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      lead,
      patch,
    }: {
      lead: ProductLead
      patch: LeadPatch
    }): Promise<ProductLead> => {
      const { data, error } = await supabase
        .from('product_leads')
        .update(camposParaGravar(lead, patch))
        .eq('id', lead.id)
        .select('*')

      if (error) throw error
      assertRowAffected(data, 'Este lead não pôde ser atualizado.')
      return data[0]
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leadKeys.all })
    },
  })
}
