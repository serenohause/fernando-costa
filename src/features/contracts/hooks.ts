import { useMutation, useQuery, useQueryClient, type MutateOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ContractStatus } from '@/lib/enums'
import { projectKeys } from '@/features/projects/hooks'
import { financialKeys } from '@/features/financial/hooks'
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
  contracts_tenant_id_contract_number_key:
    'Já existe um contrato com este número neste escritório. O número identifica o contrato na busca e no título das tarefas geradas — escolha outro.',
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

/*
  O PRÓXIMO NÚMERO DA SÉRIE, para o formulário sugerir em vez de deixar o campo
  vazio.

  A conta vive no banco (`increment_contract_number`, migration 0083) e é a
  MESMA que o contrato nascido do briefing usa. Refazê-la aqui em TypeScript
  criaria duas definições de "o próximo número", e elas divergiriam no primeiro
  dia em que uma fosse ajustada.

  É SUGESTÃO, e não reserva: nada é gravado, dois formulários abertos ao mesmo
  tempo recebem o mesmo número, e quem decide de verdade é o índice único na
  hora de gravar. O campo continua editável — o escritório manda na numeração
  dele.

  `staleTime: 0` porque a resposta envelhece a cada contrato criado: cache aqui
  faria o segundo formulário do dia sugerir um número já usado.
*/
export function useNextContractNumber(enabled: boolean) {
  return useQuery({
    queryKey: [...contractKeys.all, 'next-number'],
    enabled,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('suggest_contract_number')
      if (error) throw error
      return (data as unknown as string) ?? ''
    },
  })
}

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
export type ApproveContractResult = {
  outcome: 'created' | 'reused'
  statusChanged: boolean
  projectId: string
  projectName: string
  taskCreated: boolean
}

/*
  A função levanta P0001 com mensagem estável, e não com nome de constraint —
  então a tradução é por texto. `describeDatabaseError` não alcança: para ela
  P0001 é erro não mapeado e viraria a frase genérica.
*/
const CONTRACT_FUNCTION_MESSAGES: Record<string, string> = {
  not_authorized: 'É preciso permissão de edição em Contratos para este gesto.',
  contract_not_found: 'Este contrato não existe mais neste escritório.',
  client_required:
    'Vincule um cliente ao contrato antes de aprovar: o projeto nasce no nome dele.',
}

export function describeContractFunctionError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? ''
  for (const [chave, frase] of Object.entries(CONTRACT_FUNCTION_MESSAGES)) {
    if (message.includes(chave)) return frase
  }
  return describeDatabaseError(error)
}

/*
  APROVAR A PROPOSTA CRIA O PROJETO E O CARTÃO DO FLUXO.

  Era dívida declarada: o comentário do topo de Contracts.tsx registrava que a
  criação automática de projeto e tarefa (Contracts.jsx:416-599 do original)
  ficaria para o módulo 5, e "aprovar aqui muda o status e nada mais". O módulo 5
  subiu e ninguém voltou — aprovar não criava projeto nenhum.

  QUEM FAZ O TRABALHO É O BANCO, numa transação: `approve_contract_proposal`
  (migration 0078). Daqui seriam três gravações soltas — status, projeto, tarefa
  — e a falha no meio deixaria contrato aprovado sem projeto, ou projeto sem
  cartão. A função também confere a permissão por dentro, que é o que permite ao
  time comercial (menu `contracts`, sem `projects` nem `project_flow`) executar o
  gesto.
*/
export function useApproveContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<ApproveContractResult> => {
      const { data, error } = await supabase.rpc('approve_contract_proposal', {
        p_contract_id: id,
      })

      if (error) throw error
      return data as unknown as ApproveContractResult
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
      /* O projeto e o cartão nasceram em outro módulo: sem isto eles só
         aparecem no próximo carregamento de Projetos e do Fluxo. */
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/*
  MUDAR O STATUS PELO ARRASTE do quadro.

  NÃO cobre "Aprovado": aquele gesto cria projeto e cartão no Fluxo, e quem faz
  isso é `useApproveContract` chamando a função do banco numa transação. Aceitar
  `approved` aqui daria um segundo caminho para aprovar — um que grava o status e
  não cria nada, deixando um contrato aprovado sem projeto.

  O palpite entra ANTES de qualquer `await`, pelo mesmo motivo já escrito em
  `useMoveNegotiationStage`: o `@hello-pangea/dnd` pousa o cartão onde os DADOS
  mandam, e sem isso ele volta para a coluna de origem e só depois salta.
*/
export type ContractStatusChange = {
  id: string
  status: Exclude<ContractStatus, 'approved'>
}

export function useChangeContractStatus() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ id, status }: ContractStatusChange) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({ status })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O contrato não foi movido. É preciso permissão de edição em Contratos.',
      )
      return id
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })

  return (
    variables: ContractStatusChange,
    options?: MutateOptions<string, Error, ContractStatusChange>,
  ) => {
    void queryClient.cancelQueries({ queryKey: contractKeys.list() })

    const previous = queryClient.getQueryData<ContractRow[]>(contractKeys.list())
    queryClient.setQueryData<ContractRow[]>(contractKeys.list(), (current) =>
      current?.map((contract) =>
        contract.id === variables.id ? { ...contract, status: variables.status } : contract,
      ),
    )

    mutation.mutate(variables, {
      ...options,
      onError: (error, failed, onMutateResult, context) => {
        if (previous) queryClient.setQueryData(contractKeys.list(), previous)
        options?.onError?.(error, failed, onMutateResult, context)
      },
    })
  }
}

export type ContractDeleteBlock = {
  kind: 'paid_receivables' | 'activities' | 'payables' | 'budgets' | 'map_pins' | 'other_receivables'
  count: number
  total?: number
}

export type ContractDeleteResult = {
  outcome: 'preview' | 'blocked' | 'deleted'
  blocks: ContractDeleteBlock[]
  projects: number
  receivables: number
  tasks: number
  diaryEntries: number
}

/*
  EXCLUSÃO DO CONTRATO E DO QUE NASCEU DELE.

  Antes, apagar contrato apagava UMA linha e o banco RECUSAVA quando havia
  parcela ou projeto apontando para ele (FK sem cascade, de propósito). O
  usuário pediu a cascata do original — e com dois recortes que ele mesmo
  definiu: só os projetos DESTE contrato, e o lead nunca é tocado.

  `delete_contract_cascade` (migration 0078) faz tudo numa transação e recusa,
  em vez de apagar, quando encontra parcela já paga ou registro com valor
  próprio pendurado no projeto. `confirm: false` não apaga nada — devolve as
  contagens que o diálogo mostra antes de a pessoa decidir.
*/
export function useDeleteContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      confirm,
    }: {
      id: string
      confirm: boolean
    }): Promise<ContractDeleteResult> => {
      const { data, error } = await supabase.rpc('delete_contract_cascade', {
        p_contract_id: id,
        p_confirm: confirm,
      })

      if (error) throw error
      return data as unknown as ContractDeleteResult
    },
    onSuccess: (result) => {
      /* Conferir não muda nada; invalidar ali só provocaria recarga à toa. */
      if (result.outcome !== 'deleted') return

      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      void queryClient.invalidateQueries({ queryKey: financialKeys.all })
    },
  })
}

type DisplayOrder = { id: string; display_order: number | null }

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

  const applyOrder = (ordered: { id: string }[]) => {
    /* A mesma conta que o `mutationFn` grava: a posição no array VIRA o
       `display_order`. Repetir a regra nos dois lugares é o que faz o palpite
       bater com o que o servidor vai devolver. */
    const positions = new Map(ordered.map((row, index) => [row.id, index]))
    queryClient.setQueryData<ContractRow[]>(contractKeys.list(), (current) =>
      current?.map((row) => {
        const position = positions.get(row.id)
        return position === undefined ? row : { ...row, display_order: position }
      }),
    )
  }

  const mutation = useMutation({
    mutationFn: async (ordered: DisplayOrder[]) => {
      const changed = ordered
        .map((row, index) => ({ id: row.id, index }))
        .filter(({ index }) => ordered[index].display_order !== index)

      if (changed.length === 0) return 0

      const results = await Promise.all(
        changed.map(({ id, index }) =>
          supabase.from('contracts').update({ display_order: index }).eq('id', id).select('id'),
        ),
      )

      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error

      assertRowAffected(results[0]?.data, 'A ordem não foi alterada. É preciso permissão de edição em Contratos.')
      return changed.length
    },
    /*
      `onSettled`: a gravação são vários UPDATE em paralelo, um por linha que
      mudou de posição. Falhando no meio, parte já passou — a ordem no banco não
      é nem a antiga nem a nova, e só o servidor sabe qual ficou.
    */
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.all })
    },
  })

  /*
    A ORDEM MUDA NA MESMA BATIDA DO GESTO, antes de qualquer `await`. Mesmo
    defeito visual dos quadros e mesma correção — o porquê do "antes" está
    escrito em `useMoveNegotiationStage`. A lista é ordenada por
    `display_order` no cliente (`list.ts`), então escrever a posição nova no
    cache já basta.
  */
  return (ordered: DisplayOrder[], options?: MutateOptions<number, Error, DisplayOrder[]>) => {
    void queryClient.cancelQueries({ queryKey: contractKeys.list() })

    const previous = queryClient.getQueryData<ContractRow[]>(contractKeys.list())
    applyOrder(ordered)

    mutation.mutate(ordered, {
      ...options,
      onError: (error, failed, onMutateResult, context) => {
        if (previous) queryClient.setQueryData(contractKeys.list(), previous)
        options?.onError?.(error, failed, onMutateResult, context)
      },
    })
  }
}
