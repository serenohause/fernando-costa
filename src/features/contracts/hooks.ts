import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { contractInputSchema } from './schemas'
import type { ContractInput, ContractRow } from './types'

export const contractKeys = {
  all: ['contracts'] as const,
  list: () => [...contractKeys.all, 'list'] as const,
}

/* `Contract.list('-created_date')` é como o original carrega a tela. */
const CONTRACTS_LIST_LIMIT = 500

const CONTRACTS_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    AS DUAS PRIMEIRAS SÃO POR NOME DE CONSTRAINT, e não por código, porque `23503`
    aqui é duas situações opostas.

    Quem APONTA para o contrato é `accounts_receivable` (migration 0041) e
    `projects` (migration 0032), e nenhuma das duas FK tem cascade — de propósito.
    Excluir um contrato com parcelas geradas falha com `23503`, e a frase do
    código ("o cliente ou a negociação informada não existe mais") descreve o
    caso CONTRÁRIO: lá o contrato aponta para algo que sumiu; aqui é algo que
    aponta para o contrato e continua de pé.

    APAGAR CONTRATO NÃO PODE APAGAR DINHEIRO A RECEBER EM SILÊNCIO: a recusa é o
    comportamento certo, e o que faltava era dizer o que aconteceu e o que fazer.
    Por isso as frases nomeiam a tela onde a pessoa resolve.
  */
  accounts_receivable_contract_id_fkey:
    'Este contrato já tem parcelas geradas em Contas a Receber, e elas não são excluídas junto. Exclua as parcelas em Recebíveis antes de excluir o contrato.',
  projects_contract_id_fkey:
    'Este contrato tem projeto vinculado, e ele não é excluído junto. Desvincule ou exclua o projeto antes de excluir o contrato.',

  /*
    `contracts_tenant_id_contract_number_key`. O original não impede dois
    contratos com o mesmo número, e número repetido quebra a busca da tela e o
    título das tarefas geradas, que são identificadas por ele.
  */
  '23505': 'Já existe um contrato com este número neste escritório.',
  /* O 23503 que SOBRA depois das duas constraints acima: gravação apontando para
     cliente ou negociação que não existe mais. */
  '23503': 'O cliente ou a negociação informada não existe mais neste escritório.',
  '23502': 'Falta um campo obrigatório: número do contrato, tipo e valor total.',
  /*
    Os checks da migration 0029. `contractInputSchema` normaliza antes de gravar,
    então chegar aqui significa gravação vinda de outro caminho — a frase existe
    para não virar nome de constraint na tela.
  */
  '23514':
    'Algum campo está fora do que o sistema aceita. Confira valor total, parcelamento, prazos e as datas.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, CONTRACTS_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  UMA consulta traz a lista com o que a tela mostra.

  `client_name` não existe: a migration 0029 a removeu porque a lista quer o nome
  ATUAL do cadastro, e o nome congelado na assinatura é `client_legal_name`, que
  já vem na própria linha. O nome atual volta como embed, e o nome do
  relacionamento é o da CONSTRAINT (`contracts_client_id_fkey`) porque a FK é
  composta `(client_id, tenant_id)` — `clients!inner(...)` não desambigua.

  Leitura larga por decisão da policy `contracts_select_active_collaborator`
  (migration 0030): qualquer colaborador ativo do escritório lê. Quem esconde o
  item Contratos da sidebar é a permissão de menu, não a RLS.

  A linha inteira, e não um recorte de colunas: ao contrário da listagem do CRM,
  aqui a tela EDITA a partir da lista (o formulário abre com o contrato que já
  está em memória, como no original) e o snapshot do cliente é justamente o que
  ele precisa mostrar. Buscar de novo no clique só adicionaria uma viagem para
  reler o que acabou de chegar.
*/
const CONTRACTS_SELECT = `
  *,
  client:clients!contracts_client_id_fkey(id, name)
`

export function useContracts() {
  return useQuery({
    queryKey: contractKeys.list(),
    queryFn: async (): Promise<ContractRow[]> => {
      const { data, error } = await supabase
        .from('contracts')
        .select(CONTRACTS_SELECT)
        .order('created_at', { ascending: false })
        .limit(CONTRACTS_LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as ContractRow[]
    },
  })
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

export function useCreateContract() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: ContractInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = contractInputSchema.parse(input)

      const { data, error } = await supabase
        .from('contracts')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    /*
      O QUE O ORIGINAL FAZ AQUI E ESTE MÓDULO NÃO FAZ: contrato criado já como
      "Aprovado" dispara a criação de um `Project` e de uma `Task`
      (Contracts.jsx:106-210), e depois grava `project_id` de volta no contrato.
      As duas tabelas entram no MÓDULO 5, e `contracts.project_id` não existe
      mais — quem aponta passa a ser `projects`, por (id, tenant_id) (migration
      0029, item 2). O gesto volta com aquele módulo.
    */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })
}

export function useUpdateContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ContractInput }) => {
      const parsed = contractInputSchema.parse(input)

      const { data, error } = await supabase
        .from('contracts')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      /*
        `contracts_update_contracts_editor` filtra por USING: sem can_edit no
        menu `contracts` (nem ser Diretor), nenhuma linha é alcançada e o
        PostgREST devolve zero linhas, SEM erro. Sem esta conferência a tela
        diria "atualizado com sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhum contrato foi alterado. É preciso permissão de edição em Contratos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })
}

/*
  "Aprovar Proposta" do menu de cada linha (Contracts.jsx:990). Aqui é UM UPDATE
  de `status` e nada mais.

  No original o mesmo gesto cria projeto, cria tarefa, grava `project_id` de
  volta no contrato e geocodifica o endereço da obra — quatro escritas
  encadeadas no navegador (linhas 416-599), em que uma falha no meio deixa
  projeto sem tarefa ou contrato apontando para projeto que não nasceu.
  `projects` e `tasks` são o MÓDULO 5; o encadeamento é decisão daquele módulo,
  não deste.
*/
export function useApproveContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({ status: 'approved' })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O contrato não foi aprovado. É preciso permissão de edição em Contratos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })
}

/*
  Exclusão do contrato, e SÓ dele.

  O original apaga junto os recebíveis, o projeto e as tarefas do projeto
  (Contracts.jsx:603-649), em quatro varreduras no cliente — uma sequência que
  pode parar no meio e deixar metade apagada.

  As tabelas já existem (`projects` no MÓDULO 5, `accounts_receivable` no MÓDULO
  7) e as FK delas continuam SEM cascade (migrations 0032 e 0041): contrato com
  parcela gerada ou projeto vinculado não é apagado, o banco recusa com `23503`
  e a tela diz qual é o caso pelo nome da constraint — ver
  CONTRACTS_ERROR_MESSAGES. Apagar contrato apagaria dinheiro a receber junto, e
  isso não pode acontecer por um clique num menu de contrato.
*/
export function useDeleteContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum contrato foi excluído. É preciso permissão de edição em Contratos.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })
}

/*
  O arrastar da lista, que grava `display_order` (Contracts.jsx:751-770).

  DUAS DIFERENÇAS EM RELAÇÃO AO ORIGINAL, e as duas são sobre não escrever à toa:

  1. Só as linhas que MUDARAM de posição são gravadas. O original manda um
     update por contrato da lista inteira, em `Promise.all`, mesmo para as que
     ficaram onde estavam.
  2. A ordem gravada é a da lista COMPLETA, e não a da lista filtrada. No
     original o índice sai de `filteredContracts`: arrastar com um filtro de
     status ativo reescreve a ordem de todo mundo usando a posição dentro do
     filtro, e os contratos escondidos herdam índices repetidos.

  Continua sendo uma requisição por linha alterada — o PostgREST não atualiza
  valores diferentes em linhas diferentes num comando só, e `upsert` exigiria
  mandar a linha inteira de volta, que é justamente o que reescreve edição
  alheia.
*/
export function useReorderContracts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ordered: { id: string; display_order: number | null }[]) => {
      const changed = ordered
        .map((contract, index) => ({ id: contract.id, index }))
        .filter(({ index }) => ordered[index].display_order !== index)

      if (changed.length === 0) return 0

      const results = await Promise.all(
        changed.map(({ id, index }) =>
          supabase.from('contracts').update({ display_order: index }).eq('id', id).select('id'),
        ),
      )

      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error

      assertRowAffected(
        results[0]?.data,
        'A ordem não foi alterada. É preciso permissão de edição em Contratos.',
      )
      return changed.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })
}
