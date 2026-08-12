import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { supplierInputSchema, supplierUpdateSchema } from './schemas'
import type {
  SupplierCommissionTotals,
  SupplierFilters,
  SupplierInput,
  SupplierRow,
} from './types'
import type { SupplierStatus } from '@/lib/enums'

export const supplierKeys = {
  all: ['suppliers'] as const,
  list: (filters: SupplierFilters) => [...supplierKeys.all, 'list', filters] as const,
  commissionTotals: () => [...supplierKeys.all, 'commission-totals'] as const,
}

/* `Fornecedor.list()` é como o original carrega a tela — a lista inteira. O teto
   é folga para o cadastro de um escritório. */
const LIST_LIMIT = 500

const SUPPLIER_ERROR_MESSAGES: DatabaseErrorMessages = {
  supplier_brands_supplier_id_name_key:
    'Esta marca já está na lista deste fornecedor.',
  /*
    O NOME DA CONSTRAINT ANTES DO CÓDIGO, porque `23503` quer dizer coisas
    OPOSTAS aqui.

    Ao EXCLUIR um fornecedor, quem recusa é a FK de quem aponta para ele — e as
    duas FKs são `no action` de propósito (migration 0049): cotação e item de
    orçamento guardam decisão comercial, e apagar o fornecedor deixaria o
    histórico apontando para o nada. É exatamente o que o original faz hoje.

    O caminho certo para fornecedor com histórico já existe e está do lado do
    botão: Inativar.
  */
  budget_item_quotes_supplier_id_fkey:
    'Este fornecedor já cotou itens de orçamento e não pode ser excluído. Use Inativar para tirá-lo das listas sem perder o histórico.',
  budget_checklist_items_chosen_supplier_id_fkey:
    'Este fornecedor foi escolhido em itens de orçamento e não pode ser excluído. Use Inativar para tirá-lo das listas sem perder o histórico.',

  /* `supplier_brands_supplier_id_name_key`. O schema já remove repetidas antes de
     gravar, então chegar aqui significa gravação vinda de outro caminho. */
  '23505': 'Esse fornecedor já tem uma marca com esse nome.',
  '23502': 'Falta um campo obrigatório: nome, tipologia e WhatsApp.',
  '23514':
    'O fornecedor está num estado que o sistema não aceita. Confira a tipologia, o percentual de comissão e o de desconto (0 a 100).',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, SUPPLIER_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  UMA consulta traz o cadastro com as marcas juntas.

  `marcas_representadas` deixou de ser array dentro da linha (migration 0049) e
  virou `supplier_brands`. O embed devolve a mesma lista que a tela sempre teve —
  a listagem mostra as duas primeiras, o drawer mostra todas.

  Leitura larga por decisão da policy `suppliers_select_active_collaborator`
  (migration 0050): qualquer colaborador ativo do escritório lê o cadastro, e é
  daqui que sai também o seletor de fornecedor do item de orçamento. Quem esconde
  o item Fornecedores da sidebar é a permissão de menu, não a RLS.
*/
const SUPPLIERS_SELECT = `
  *,
  brands:supplier_brands!supplier_brands_supplier_id_fkey(id, name)
`

/*
  Os três filtros do topo viram WHERE; a busca por texto continua em memória
  (`filterSuppliersBySearch`, list.ts), porque ela varre nome de fornecedor E
  nome de marca — duas tabelas.

  A ORDEM é por nome, e não por criação: o original não ordena nada (mostra o que
  o `list()` devolver) e tem índice `suppliers_tenant_id_name_idx` esperando por
  isso. Lista alfabética de cadastro é o que a tela desenha na prática.
*/
export function useSuppliers(filters: SupplierFilters) {
  return useQuery({
    queryKey: supplierKeys.list(filters),
    queryFn: async (): Promise<SupplierRow[]> => {
      let query = supabase.from('suppliers').select(SUPPLIERS_SELECT)

      if (filters.category !== 'all') query = query.eq('category', filters.category)
      if (filters.tier !== 'all') query = query.eq('partnership_tier', filters.tier)
      if (filters.status !== 'all') query = query.eq('status', filters.status)

      const { data, error } = await query.order('name').limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as SupplierRow[]
    },
  })
}

/*
  "ESTE ESCRITÓRIO NÃO TEM NENHUM FORNECEDOR" é outra pergunta que a tela precisa
  responder: sem cadastro nenhum, o vazio pede cadastrar; com cadastro e filtro
  sem resultado, o vazio pede mudar o filtro. O original decide isso olhando a
  lista completa (Fornecedores.jsx:200), que aqui já vem recortada.

  `head: true`: a contagem viaja no cabeçalho e nenhuma linha desce.
*/
export function useHasAnySuppliers() {
  return useQuery({
    queryKey: [...supplierKeys.all, 'any'],
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('suppliers')
        .select('id', { count: 'exact', head: true })

      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

/*
  A seção "Métricas" do drawer (FornecedorDrawer.jsx:106-110), que no original lê
  `Fornecedor.total_comissao_recebida` — campo que a entidade declara e que tela
  nenhuma preenche, ou seja, hoje a linha nunca aparece.

  Consulta separada, e não embed: `suppliers` não tem FK para a view, então o
  PostgREST não a encaixa no select acima. O cruzamento é por `supplier_id`, como
  no módulo 5 com `project_progress`. A view é SECURITY INVOKER (migration 0051):
  a RLS das tabelas vale para quem consulta.
*/
export function useSupplierCommissionTotals() {
  return useQuery({
    queryKey: supplierKeys.commissionTotals(),
    queryFn: async (): Promise<Map<string, SupplierCommissionTotals>> => {
      const { data, error } = await supabase
        .from('supplier_commission_totals')
        .select(
          'supplier_id, tenant_id, chosen_item_count, commission_total, commission_received_total',
        )
        .limit(LIST_LIMIT)

      if (error) throw error

      const bySupplier = new Map<string, SupplierCommissionTotals>()
      for (const row of data ?? []) {
        if (row.supplier_id) {
          bySupplier.set(row.supplier_id, row as SupplierCommissionTotals)
        }
      }
      return bySupplier
    },
  })
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

/*
  Sincroniza `supplier_brands` com o que o formulário deixou na lista.

  No original as marcas são um array dentro da própria linha, reescrito inteiro a
  cada gravação. Aqui são linhas: só o que mudou é tocado, o unique
  `(supplier_id, name)` impede repetição, e remover uma marca é um DELETE — que
  exige a mesma permissão de editar o fornecedor.

  Mesmo desenho de `syncServices` (módulo 3), e pelo mesmo motivo: apagar tudo e
  reinserir trocaria o id de marcas que ninguém tocou.
*/
async function syncBrands(
  supplierId: string,
  tenantId: string,
  desired: string[],
): Promise<void> {
  const { data: existingRows, error: readError } = await supabase
    .from('supplier_brands')
    .select('id, name')
    .eq('supplier_id', supplierId)

  if (readError) throw readError

  const existing = existingRows ?? []
  const wanted = new Set(desired)

  const toRemove = existing.filter((row) => !wanted.has(row.name))
  const present = new Set(existing.map((row) => row.name))
  const toAdd = desired.filter((name) => !present.has(name))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('supplier_brands')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id),
      )
    if (error) throw error
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('supplier_brands').insert(
      toAdd.map((name) => ({
        tenant_id: tenantId,
        supplier_id: supplierId,
        name,
      })),
    )
    if (error) throw error
  }
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  return useMutation({
    mutationFn: async (input: SupplierInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const parsed = supplierInputSchema.parse(input)
      const { brands, ...columns } = parsed

      const { data, error } = await supabase
        .from('suppliers')
        .insert({ ...columns, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error

      await syncBrands(data.id, tenantId, brands)
      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SupplierInput }) => {
      /* `supplierUpdateSchema`, e não `supplierInputSchema`: a edição precisa
         deixar passar a tipologia que a linha JÁ TEM, inclusive as quatro que só
         fornecedor importado pode carregar (migration 0063). Ver o comentário
         do esquema. */
      const parsed = supplierUpdateSchema.parse(input)
      const { brands, ...columns } = parsed

      const { data, error } = await supabase
        .from('suppliers')
        .update(columns)
        .eq('id', id)
        .select('id, tenant_id')

      if (error) throw error
      /*
        Escrita negada pela RLS em UPDATE não vira erro: a linha só não é
        alcançada e o PostgREST devolve zero linhas. Sem esta conferência a tela
        diria "atualizado com sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhum fornecedor foi alterado. É preciso permissão de edição em Fornecedores.',
      )

      /* O `tenant_id` das marcas sai da LINHA alcançada, e não do claim da
         sessão: é o mesmo que a FK composta vai cobrar. */
      await syncBrands(id, data[0].tenant_id, brands)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

/*
  O botão Inativar/Reativar do drawer (FornecedorDrawer.jsx:134), que alterna
  entre `active` e `inactive`.

  UMA COLUNA, e não o objeto inteiro: o original manda `{ ...fornecedor, status }`
  de volta (Fornecedores.jsx:116), o que reescreve todos os campos com a cópia que
  o navegador tinha em mãos — e apaga qualquer alteração feita por outra pessoa
  entre o carregamento da lista e o clique. `negotiating` não entra aqui: ele só
  vem pelo formulário, como no original.
*/
export function useSetSupplierStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupplierStatus }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update({ status })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O status do fornecedor não foi alterado. É preciso permissão de edição em Fornecedores.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}

/*
  Excluir fornecedor (Fornecedores.jsx:294).

  As marcas somem junto, por cascade — elas são parte do cadastro. O que NÃO
  some, e faz a exclusão falhar, é fornecedor com cotação ou item de orçamento
  apontando para ele: as duas FKs são `no action` de propósito (migration 0049).
  A frase que a tela mostra nesse caso vem de `describeDatabaseError`, e ela
  aponta o caminho certo, que é Inativar.
*/
export function useDeleteSupplier() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhum fornecedor foi excluído. É preciso permissão de edição em Fornecedores.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}
