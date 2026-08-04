import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { supplierKeys } from '@/features/suppliers/hooks'
import {
  budgetChecklistInputSchema,
  budgetChecklistItemInputSchema,
  budgetItemQuoteInputSchema,
} from './schemas'
import {
  BUDGET_FILES_BUCKET,
  budgetFilePath,
  describeRejectedFile,
  SIGNED_URL_TTL_SECONDS,
} from './files'
import type {
  BudgetChecklistInput,
  BudgetChecklistItemInput,
  BudgetChecklistItemRow,
  BudgetChecklistRow,
  BudgetChecklistTotals,
  BudgetFileTarget,
  BudgetFilters,
  BudgetItemQuoteInput,
} from './types'
import type { BudgetChecklistStatus } from '@/lib/enums'

export const budgetKeys = {
  all: ['budget'] as const,
  checklists: () => [...budgetKeys.all, 'checklists'] as const,
  checklistList: (filters: BudgetFilters) => [...budgetKeys.checklists(), filters] as const,
  totals: () => [...budgetKeys.all, 'totals'] as const,
  items: (checklistId: string) => [...budgetKeys.all, 'items', checklistId] as const,
  /*
    FORA de `all` de propósito: a URL assinada não é dado do orçamento, é uma
    credencial temporária para um objeto do Storage. Invalidar o orçamento
    inteiro a cada gravação não deve derrubar o link que alguém está usando para
    abrir um PDF, e a URL expira sozinha (SIGNED_URL_TTL_SECONDS).
  */
  fileUrl: (path: string) => ['budget-file-url', path] as const,
}

/* `ChecklistOrcamento.list('-created_date')` é como o original carrega a tela —
   a lista inteira. O teto é folga. */
const LIST_LIMIT = 500

const BUDGET_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    O NOME DA CONSTRAINT ANTES DO CÓDIGO: `23505` aqui só pode ser uma coisa, e
    dizer "já existe" sem dizer o quê manda a pessoa procurar no lugar errado.
  */
  budget_item_quotes_item_id_supplier_id_key:
    'Esse fornecedor já tem uma cotação neste item. Edite a cotação existente em vez de adicionar outra.',

  '23503':
    'O cliente, o projeto, o responsável ou o fornecedor informado não existe mais neste escritório.',
  '23502': 'Falta um campo obrigatório: cliente no checklist, nome no item.',
  /*
    Os checks da migration 0049. Os schemas normalizam antes de gravar, então
    chegar aqui significa gravação vinda de outro caminho — a frase existe para
    não virar nome de constraint na tela.
  */
  '23514':
    'O orçamento está num estado que o sistema não aceita. Confira as datas, os valores e os percentuais (0 a 100).',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, BUDGET_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  Os três `*_name` do base44 saíram do schema (migration 0049, item 2) e voltam
  como embed: a lista quer o nome ATUAL do cadastro, e no original ele é copiado
  quando o checklist nasce e envelhece sozinho. O nome do relacionamento é o da
  CONSTRAINT porque as FK são compostas `(coluna, tenant_id)`.

  Leitura larga por decisão das policies da migration 0050: qualquer colaborador
  ativo do escritório lê. Quem esconde "Orçamento por Cliente" da sidebar é a
  permissão de menu, não a RLS.
*/
const CHECKLISTS_SELECT = `
  *,
  client:clients!budget_checklists_client_id_fkey(id, name),
  project:projects!budget_checklists_project_id_fkey(id, name),
  responsible:collaborators!budget_checklists_responsible_id_fkey(id, name)
`

export function useBudgetChecklists(filters: BudgetFilters) {
  return useQuery({
    queryKey: budgetKeys.checklistList(filters),
    queryFn: async (): Promise<BudgetChecklistRow[]> => {
      let query = supabase.from('budget_checklists').select(CHECKLISTS_SELECT)

      if (filters.status !== 'all') query = query.eq('status', filters.status)
      if (filters.responsibleId !== 'all') {
        query = query.eq('responsible_id', filters.responsibleId)
      }
      if (filters.phase !== 'all') query = query.eq('project_phase', filters.phase)

      /* `-created_date` do original (OrcamentoCliente.jsx:53). */
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as BudgetChecklistRow[]
    },
  })
}

/*
  "ESTE ESCRITÓRIO NÃO TEM NENHUM CHECKLIST" é outra pergunta: sem checklist
  nenhum o vazio pede criar o primeiro; com checklists e filtro sem resultado, o
  vazio pede mudar o filtro. O original decide olhando a lista completa
  (OrcamentoCliente.jsx:183), que aqui já vem recortada.
*/
export function useHasAnyBudgetChecklists() {
  return useQuery({
    queryKey: [...budgetKeys.checklists(), 'any'],
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('budget_checklists')
        .select('id', { count: 'exact', head: true })

      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

/*
  OS TOTAIS E O PROGRESSO, que no original são campos gravados e recalculados no
  navegador (ChecklistDetalhe.jsx:65-75) e aqui são a view
  `budget_checklist_totals` (migration 0051).

  Consulta separada, e não embed: `budget_checklists` não tem FK para a view, e o
  PostgREST não a encaixa no select acima. O cruzamento é por `checklist_id`,
  como no módulo 5 com `project_progress`. Assim o número do cartão da listagem e
  o número do rodapé do detalhe são literalmente a mesma conta.

  A view é SECURITY INVOKER: a RLS das tabelas vale para quem consulta.
*/
export function useBudgetChecklistTotals() {
  return useQuery({
    queryKey: budgetKeys.totals(),
    queryFn: async (): Promise<Map<string, BudgetChecklistTotals>> => {
      const { data, error } = await supabase
        .from('budget_checklist_totals')
        .select(
          'checklist_id, tenant_id, item_count, completed_item_count, progress_percent, estimated_total, approved_total, commission_total, commission_received_total, curation_total',
        )
        .limit(LIST_LIMIT)

      if (error) throw error

      const byChecklist = new Map<string, BudgetChecklistTotals>()
      for (const row of data ?? []) {
        if (row.checklist_id) byChecklist.set(row.checklist_id, row as BudgetChecklistTotals)
      }
      return byChecklist
    },
  })
}

/*
  Os itens de UM checklist, com as cotações e os dois nomes que a tela mostra.

  No original os itens são um array dentro da linha do checklist e as cotações
  são um array DENTRO de cada item — dois níveis de aninhamento numa linha só
  (migration 0049). Aqui são duas tabelas, e o embed devolve a mesma árvore.

  A ORDEM é por criação: o original mostra os itens na ordem em que foram
  empurrados no array, e o agrupamento por categoria (ChecklistDetalhe.jsx:39-47)
  acontece na tela, em memória, com `item.category || 'Outros'`.
*/
const ITEMS_SELECT = `
  *,
  responsible:collaborators!budget_checklist_items_responsible_id_fkey(id, name),
  supplier:suppliers!budget_checklist_items_chosen_supplier_id_fkey(id, name),
  quotes:budget_item_quotes!budget_item_quotes_item_id_fkey(
    *,
    supplier:suppliers!budget_item_quotes_supplier_id_fkey(id, name)
  )
`

export function useBudgetChecklistItems(checklistId: string | null | undefined) {
  return useQuery({
    queryKey: budgetKeys.items(checklistId ?? ''),
    enabled: Boolean(checklistId),
    queryFn: async (): Promise<BudgetChecklistItemRow[]> => {
      const { data, error } = await supabase
        .from('budget_checklist_items')
        .select(ITEMS_SELECT)
        .eq('checklist_id', checklistId as string)
        .order('created_at')
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as BudgetChecklistItemRow[]
    },
  })
}

/* ── Escrita: checklist ────────────────────────────────────────────────── */

export function useCreateBudgetChecklist() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: BudgetChecklistInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = budgetChecklistInputSchema.parse(input)

      const { data, error } = await supabase
        .from('budget_checklists')
        .insert({ ...parsed, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

export function useUpdateBudgetChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: BudgetChecklistInput }) => {
      const parsed = budgetChecklistInputSchema.parse(input)

      const { data, error } = await supabase
        .from('budget_checklists')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum checklist foi alterado. É preciso permissão de edição em Orçamento por Cliente.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

/*
  O select de status do cabeçalho do detalhe (ChecklistDetalhe.jsx:116).

  UMA COLUNA, e não o documento inteiro: o original manda `{ ...checklist, status
  }` de volta, o que reescreve todos os campos — inclusive os itens — com a cópia
  que o navegador tinha em mãos. Aqui os itens nem estão na mesma tabela, e
  regravar o resto apagaria alteração feita por outra pessoa no meio.

  `completion_date` NÃO é preenchida automaticamente ao concluir: a migration
  0049 registra que nenhuma tela do original a escreve, e amarrá-la ao status
  seria inventar regra que o original não tem.
*/
export function useSetBudgetChecklistStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BudgetChecklistStatus }) => {
      const { data, error } = await supabase
        .from('budget_checklists')
        .update({ status })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O status não foi alterado. É preciso permissão de edição em Orçamento por Cliente.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

/*
  Excluir o checklist (OrcamentoCliente.jsx:323). Os itens e as cotações somem
  por cascade — no original eles são parte do documento e somem com ele.

  OS PDFS NÃO SOMEM SOZINHOS: Storage não tem FK, e a migration 0052 registra o
  arquivo órfão como pendência conhecida do módulo. Por isso os caminhos são
  colhidos ANTES do DELETE e os objetos são removidos depois — é a única hora em
  que ainda dá para saber quais eram.

  A remoção do Storage é o ÚLTIMO passo e não derruba a exclusão: a linha já
  saiu, e falhar aqui deixa arquivo órfão (o estado que o original já tem), não
  checklist meio apagado.
*/
export function useDeleteBudgetChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const paths = await collectChecklistFilePaths(id)

      const { data, error } = await supabase
        .from('budget_checklists')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum checklist foi excluído. É preciso permissão de edição em Orçamento por Cliente.',
      )

      await removeStorageObjects(paths)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

/* ── Escrita: item do checklist ────────────────────────────────────────── */

/*
  Sincroniza `budget_item_quotes` com o que o formulário de item deixou na lista
  de fornecedores cotados.

  Compara por FORNECEDOR, e não por id de linha: no original a cotação não tem id
  próprio, e a chave natural é `(item, fornecedor)` — a mesma do unique do banco.
  Isso importa por causa do PDF: a cotação que continua na lista é ATUALIZADA, e
  o arquivo anexado a ela sobrevive à edição do item. Apagar tudo e reinserir
  perderia o anexo de toda cotação a cada salvamento do formulário.

  A cotação REMOVIDA leva o objeto do Storage junto — ver o cabeçalho de
  `useDeleteBudgetChecklist`.
*/
async function syncQuotes(
  itemId: string,
  tenantId: string,
  desired: BudgetItemQuoteInput[],
): Promise<void> {
  const { data: existingRows, error: readError } = await supabase
    .from('budget_item_quotes')
    .select('id, supplier_id, quote_file_path')
    .eq('item_id', itemId)

  if (readError) throw readError

  const existing = existingRows ?? []
  const wanted = new Map(desired.map((quote) => [quote.supplier_id, quote]))

  const toRemove = existing.filter((row) => !wanted.has(row.supplier_id))
  const toUpdate = existing.filter((row) => wanted.has(row.supplier_id))
  const present = new Set(existing.map((row) => row.supplier_id))
  const toAdd = desired.filter((quote) => !present.has(quote.supplier_id))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('budget_item_quotes')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id),
      )
    if (error) throw error

    await removeStorageObjects(
      toRemove.map((row) => row.quote_file_path).filter((path): path is string => Boolean(path)),
    )
  }

  for (const row of toUpdate) {
    const quote = wanted.get(row.supplier_id)
    if (!quote) continue
    const { error } = await supabase
      .from('budget_item_quotes')
      .update({ value: quote.value, notes: quote.notes })
      .eq('id', row.id)
    if (error) throw error
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('budget_item_quotes').insert(
      toAdd.map((quote) => ({
        tenant_id: tenantId,
        item_id: itemId,
        supplier_id: quote.supplier_id,
        value: quote.value,
        notes: quote.notes,
      })),
    )
    if (error) throw error
  }
}

export function useCreateBudgetChecklistItem() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async ({
      checklistId,
      input,
    }: {
      checklistId: string
      input: BudgetChecklistItemInput
    }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const parsed = budgetChecklistItemInputSchema.parse(input)
      const { quotes, ...columns } = parsed

      const { data, error } = await supabase
        .from('budget_checklist_items')
        .insert({ ...columns, checklist_id: checklistId, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error

      await syncQuotes(data.id, tenantId, quotes)
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      /* A comissão do fornecedor escolhido muda com o item
         (`supplier_commission_totals`, migration 0051). */
      void queryClient.invalidateQueries({ queryKey: supplierKeys.commissionTotals() })
    },
  })
}

export function useUpdateBudgetChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: BudgetChecklistItemInput }) => {
      const parsed = budgetChecklistItemInputSchema.parse(input)
      const { quotes, ...columns } = parsed

      const { data, error } = await supabase
        .from('budget_checklist_items')
        .update(columns)
        .eq('id', id)
        .select('id, tenant_id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum item foi alterado. É preciso permissão de edição em Orçamento por Cliente.',
      )

      await syncQuotes(id, data[0].tenant_id, quotes)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.commissionTotals() })
    },
  })
}

/*
  O botão "Comissão recebida / Comissão pendente" de cada item
  (ChecklistDetalhe.jsx:191-210).

  UMA COLUNA. No original este clique regrava o DOCUMENTO INTEIRO e manda junto
  só `valor_total_comissao` — os outros dois totais ficam como estavam, e é assim
  que eles passam a divergir dos itens. Aqui não há total gravado para divergir:
  `commission_received_total` sai da view.
*/
export function useSetItemCommissionReceived() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, received }: { id: string; received: boolean }) => {
      const { data, error } = await supabase
        .from('budget_checklist_items')
        .update({ commission_received: received })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A comissão não foi alterada. É preciso permissão de edição em Orçamento por Cliente.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.commissionTotals() })
    },
  })
}

export function useDeleteBudgetChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const paths = await collectItemFilePaths(id)

      const { data, error } = await supabase
        .from('budget_checklist_items')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum item foi excluído. É preciso permissão de edição em Orçamento por Cliente.',
      )

      await removeStorageObjects(paths)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.commissionTotals() })
    },
  })
}

/* ── Escrita: cotação avulsa ───────────────────────────────────────────── */

/*
  As três escritas de UMA cotação, para quando a tela mexer numa sem reabrir o
  formulário do item inteiro (é o que o drawer faz para anexar PDF).

  Quem grava a lista toda de uma vez é `syncQuotes`, chamada pela gravação do
  item.
*/
export function useCreateBudgetItemQuote() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async ({ itemId, input }: { itemId: string; input: BudgetItemQuoteInput }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = budgetItemQuoteInputSchema.parse(input)

      const { data, error } = await supabase
        .from('budget_item_quotes')
        .insert({ ...parsed, item_id: itemId, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

export function useUpdateBudgetItemQuote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: BudgetItemQuoteInput }) => {
      const parsed = budgetItemQuoteInputSchema.parse(input)

      const { data, error } = await supabase
        .from('budget_item_quotes')
        .update(parsed)
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma cotação foi alterada. É preciso permissão de edição em Orçamento por Cliente.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

export function useDeleteBudgetItemQuote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: existing, error: readError } = await supabase
        .from('budget_item_quotes')
        .select('quote_file_path')
        .eq('id', id)
        .maybeSingle()

      if (readError) throw readError

      const { data, error } = await supabase
        .from('budget_item_quotes')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma cotação foi excluída. É preciso permissão de edição em Orçamento por Cliente.',
      )

      if (existing?.quote_file_path) await removeStorageObjects([existing.quote_file_path])
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

/* ── Os PDFs: bucket privado `budget-files` ────────────────────────────── */

/*
  A URL PARA ABRIR O PDF, ASSINADA NA HORA.

  O banco guarda o CAMINHO do objeto, nunca uma URL (migration 0049, COMMENT de
  `budget_file_path`): assinatura expira, e link morto gravado no banco é pior que
  nenhum link. Quem transforma caminho em endereço que abre é esta consulta, e o
  endereço vale poucos minutos.

  `staleTime` fica ABAIXO do tempo de expiração de propósito: uma URL guardada em
  cache até o último segundo é uma URL que falha justamente quando alguém clica.

  Quem autoriza a assinatura é `budget_files_select_active_collaborator`
  (migration 0052) — colaborador ativo do escritório dono do caminho. Colaborador
  de outro escritório recebe erro aqui, e não um PDF.
*/
export function useBudgetFileUrl(path: string | null | undefined) {
  const filePath = path ?? ''

  return useQuery({
    queryKey: budgetKeys.fileUrl(filePath),
    enabled: filePath !== '',
    staleTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    gcTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(BUDGET_FILES_BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

      if (error) throw error
      return data.signedUrl
    },
  })
}

/*
  ANEXAR (ou SUBSTITUIR) o PDF de um item ou de uma cotação — o botão
  PdfUploadButton do original, que lá manda o arquivo para um bucket PÚBLICO e
  grava a URL devolvida dentro do documento.

  A ORDEM DOS PASSOS É O QUE IMPEDE ARQUIVO ÓRFÃO, e ela é deliberada:

  1. lê o caminho atual da linha (é ele que vai ser substituído) e o checklist a
     que ela pertence — o segundo segmento do caminho sai do BANCO, não de
     parâmetro da tela;
  2. sobe o objeto novo;
  3. grava caminho e nome na linha;
  4. se a gravação falhar ou não alcançar linha nenhuma (RLS), APAGA o objeto que
     acabou de subir e levanta o erro — senão sobraria um arquivo pago que
     ninguém alcança;
  5. só então apaga o objeto antigo.

  O PRIMEIRO SEGMENTO DO CAMINHO É O `tenant_id` DA SESSÃO, e não um parâmetro:
  é ele que as policies de `storage.objects` comparam com o claim do JWT. Deixar
  a tela escolher esse segmento seria deixar a tela escolher em que escritório
  gravar.

  A validação de tipo e tamanho aqui é CONVENIÊNCIA (ver src/features/budget/files.ts):
  quem recusa de verdade é o bucket, que aplica `allowed_mime_types` e
  `file_size_limit` antes de aceitar o corpo.
*/
export function useUploadBudgetFile(target: BudgetFileTarget) {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const rejected = describeRejectedFile(file)
      if (rejected) throw new WriteError(rejected)

      const current = await readFileState(target, id)
      const path = budgetFilePath(tenantId, current.checklistId)

      const { error: uploadError } = await supabase.storage
        .from(BUDGET_FILES_BUCKET)
        .upload(path, file, { contentType: 'application/pdf', upsert: false })

      if (uploadError) throw uploadError

      const { rows, error } = await writeFileColumns(target, id, { path, name: file.name })

      if (error || !rows || rows.length === 0) {
        await removeStorageObjects([path])
        if (error) throw error
        throw new WriteError(
          'O PDF não foi anexado. É preciso permissão de edição em Orçamento por Cliente.',
        )
      }

      if (current.path) await removeStorageObjects([current.path])
      return path
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

/*
  REMOVER o PDF. A linha perde as duas colunas juntas
  (`*_file_pair_check` cobra isso) e o objeto sai do bucket em seguida.

  A ordem é a inversa do upload, e pelo mesmo motivo: primeiro o banco, depois o
  Storage. Se a gravação for negada, o arquivo continua lá e a tela continua
  mostrando o anexo — que é a verdade. Se o Storage falhar depois, sobra um
  órfão, que é o estado que o original já tem hoje.
*/
export function useRemoveBudgetFile(target: BudgetFileTarget) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const current = await readFileState(target, id)

      const { rows, error } = await writeFileColumns(target, id, null)
      if (error) throw error
      assertRowAffected(
        rows,
        'O PDF não foi removido. É preciso permissão de edição em Orçamento por Cliente.',
      )

      if (current.path) await removeStorageObjects([current.path])
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
}

/* ── Storage: as funções que as duas metades acima compartilham ────────── */

/*
  As duas tabelas com coluna de arquivo, escritas por extenso em vez de por nome
  de coluna montado em variável: assim o TypeScript continua conferindo que a
  coluna existe, e o par caminho+nome nunca é gravado pela metade.
*/
async function writeFileColumns(
  target: BudgetFileTarget,
  id: string,
  file: { path: string; name: string } | null,
): Promise<{ rows: { id: string }[] | null; error: unknown }> {
  if (target === 'item') {
    const { data, error } = await supabase
      .from('budget_checklist_items')
      .update({ budget_file_path: file?.path ?? null, budget_file_name: file?.name ?? null })
      .eq('id', id)
      .select('id')
    return { rows: data, error }
  }

  const { data, error } = await supabase
    .from('budget_item_quotes')
    .update({ quote_file_path: file?.path ?? null, quote_file_name: file?.name ?? null })
    .eq('id', id)
    .select('id')
  return { rows: data, error }
}

/*
  O caminho do arquivo que está lá hoje e o checklist a que a linha pertence.

  A cotação não guarda `checklist_id` — ela pertence ao ITEM, e é do item que sai
  a pasta. São duas consultas nesse caso, e elas existem para que o caminho seja
  montado a partir do BANCO: caminho vindo da tela é caminho que a tela pode
  errar, e o segundo segmento é o que organiza o bucket por documento.
*/
async function readFileState(
  target: BudgetFileTarget,
  id: string,
): Promise<{ path: string | null; checklistId: string }> {
  if (target === 'item') {
    const { data, error } = await supabase
      .from('budget_checklist_items')
      .select('budget_file_path, checklist_id')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new WriteError('Item de orçamento não encontrado neste escritório.')
    return { path: data.budget_file_path, checklistId: data.checklist_id }
  }

  const { data: quote, error } = await supabase
    .from('budget_item_quotes')
    .select('quote_file_path, item_id')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!quote) throw new WriteError('Cotação não encontrada neste escritório.')

  const { data: item, error: itemError } = await supabase
    .from('budget_checklist_items')
    .select('checklist_id')
    .eq('id', quote.item_id)
    .maybeSingle()

  if (itemError) throw itemError
  if (!item) throw new WriteError('Item de orçamento não encontrado neste escritório.')

  return { path: quote.quote_file_path, checklistId: item.checklist_id }
}

/* Todos os PDFs de um item: o dele e os das cotações. */
async function collectItemFilePaths(itemId: string): Promise<string[]> {
  const { data: item, error } = await supabase
    .from('budget_checklist_items')
    .select('budget_file_path')
    .eq('id', itemId)
    .maybeSingle()

  if (error) throw error

  const { data: quotes, error: quotesError } = await supabase
    .from('budget_item_quotes')
    .select('quote_file_path')
    .eq('item_id', itemId)

  if (quotesError) throw quotesError

  return [
    item?.budget_file_path ?? null,
    ...(quotes ?? []).map((quote) => quote.quote_file_path),
  ].filter((path): path is string => Boolean(path))
}

/* Todos os PDFs de um checklist: os dos itens e os das cotações de cada item.
   Duas consultas, e não uma por item — a exclusão de um checklist com trinta
   itens não vira sessenta requisições. */
async function collectChecklistFilePaths(checklistId: string): Promise<string[]> {
  const { data: items, error } = await supabase
    .from('budget_checklist_items')
    .select('id, budget_file_path')
    .eq('checklist_id', checklistId)

  if (error) throw error

  const itemIds = (items ?? []).map((item) => item.id)
  const paths = (items ?? [])
    .map((item) => item.budget_file_path)
    .filter((path): path is string => Boolean(path))

  if (itemIds.length === 0) return paths

  const { data: quotes, error: quotesError } = await supabase
    .from('budget_item_quotes')
    .select('quote_file_path')
    .in('item_id', itemIds)

  if (quotesError) throw quotesError

  return [
    ...paths,
    ...(quotes ?? [])
      .map((quote) => quote.quote_file_path)
      .filter((path): path is string => Boolean(path)),
  ]
}

/*
  Apagar objeto do bucket é sempre EFEITO SECUNDÁRIO: quando isto roda, a linha
  do banco já foi gravada ou já sumiu. Falhar aqui deixa um arquivo órfão — o
  mesmo estado que o original tem hoje, e que a migration 0052 registra como
  pendência declarada do módulo — e não pode desfazer o que já aconteceu no
  banco. Por isso vai para o console e não sobe.

  A única remoção que NÃO passa por aqui é a do passo 4 do upload, que precisa
  falhar junto com a gravação.
*/
async function removeStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(BUDGET_FILES_BUCKET).remove(paths)
  if (error) console.error('[budget] falha ao remover PDF do Storage:', error)
}
