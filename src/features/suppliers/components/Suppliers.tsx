import { useMemo, useState } from 'react'
import { Plus, Search, Store } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useMenuPermissions } from '@/features/auth/hooks'
import {
  PARTNERSHIP_TIER,
  SUPPLIER_CATEGORY,
  SUPPLIER_STATUS,
  labelOf,
  optionsOf,
  type SupplierCategory,
} from '@/lib/enums'
import { filterSuppliersBySearch } from '../list'
import {
  describeDatabaseError,
  useCreateSupplier,
  useDeleteSupplier,
  useHasAnySuppliers,
  useSetSupplierStatus,
  useSuppliers,
  useUpdateSupplier,
} from '../hooks'
import SupplierDrawer from './SupplierDrawer'
import SupplierForm, { toFormValues, type SupplierFormValues } from './SupplierForm'
import { STATUS_PILL, TIER_BADGE } from './supplier-styles'
import type { SupplierFilters, SupplierInput, SupplierRow } from '../types'

/*
  Porta de projeto-original/src/pages/Fornecedores.jsx.

  O cabeçalho, a barra com busca e três filtros, a tabela de oito colunas com as
  duas primeiras marcas sob o nome, o crachá de nível, as pílulas de Showroom e
  Status, o drawer que abre ao clicar na linha e o diálogo de exclusão são os do
  original, na mesma ordem e com o mesmo microcopy.

  AUTORIZAÇÃO — DIVERGÊNCIA CONSCIENTE, e é a maior desta tela.

  O original calcula `canManage` no componente e ASSUME PERMISSÃO quando ela
  falta: sem colaborador correspondente, ou sem linha de permissão para o menu
  "Fornecedores", `setCanManage(true)` (Fornecedores.jsx:55-61). O banco faz o
  contrário — `can_edit_menu('suppliers')` (migration 0019, aplicada em
  suppliers/supplier_brands pela 0050) exige a linha gravada para quem não é
  Diretor. Seguir o original aqui mostraria botão de criar, editar e excluir para
  quem o banco recusa, e o clique terminaria em erro.

  Então quem manda é o BANCO: `useMenuPermissions('suppliers')`, mesma regra e
  mesma leitura que as telas já migradas (ver Projects.tsx). Leitura continua
  larga, como no original — qualquer colaborador ativo do escritório lê o
  cadastro (`suppliers_select_active_collaborator`).
*/

/*
  A LISTA DE TIPOLOGIA DO FILTRO É A DO ORIGINAL, DEFEITO INCLUÍDO — reproduzida
  literalmente porque é o que roda hoje, e reportada ao usuário.

  O defeito: esta lista (Fornecedores.jsx:27-34) não é a mesma do formulário de
  cadastro (FornecedorForm.jsx:11-18). Ela

  - OFERECE quatro categorias que fornecedor nenhum pode ter — Revestimento de
    Fachada, Revestimento de Piscina, Impermeabilização e Gesso e Drywall são só
    de item de orçamento, e `suppliers_category_domain_check` as barra na coluna.
    Filtrar por qualquer uma delas devolve lista vazia, sempre.
  - ESCONDE três que existem no cadastro — Madeira, Elevadores e Bombas e Filtros
    de Piscina. Fornecedor com essas tipologias é inalcançável pelo filtro.

  `SupplierFilters.category` aceita os 23 valores justamente para permitir esta
  cópia sem que o tipo minta sobre o resultado. Corrigir a lista é decisão do
  usuário, não desta implementação.
*/
const FILTER_CATEGORIES: SupplierCategory[] = [
  'ceramics_porcelain',
  'fixtures_sanitaryware',
  'natural_stone',
  'indoor_lighting',
  'outdoor_lighting',
  'frames_openings',
  'facade_cladding',
  'pool_cladding',
  'home_automation',
  'solar_energy',
  'paint_texture',
  'landscaping',
  'cabinetry',
  'structure_foundation',
  'waterproofing',
  'drywall_plaster',
  'electrical_plumbing',
  'hvac',
  'glass_mirrors',
  'other',
]

export default function Suppliers() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<SupplierFilters>({
    category: 'all',
    tier: 'all',
    status: 'all',
  })
  const [selected, setSelected] = useState<SupplierRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [deleting, setDeleting] = useState<SupplierRow | null>(null)

  const { canEdit } = useMenuPermissions('suppliers')

  const suppliersQuery = useSuppliers(filters)
  const hasAnyQuery = useHasAnySuppliers()

  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier()
  const statusMutation = useSetSupplierStatus()
  const deleteMutation = useDeleteSupplier()

  const suppliers = useMemo(() => suppliersQuery.data ?? [], [suppliersQuery.data])
  const filteredSuppliers = useMemo(
    () => filterSuppliersBySearch(suppliers, search),
    [suppliers, search],
  )

  /*
    O drawer mostra a linha RECÉM-LIDA sempre que ela ainda estiver na lista, e a
    cópia guardada quando o filtro do topo a tiver tirado de lá. É o que o
    original tenta fazer ao mesclar `{ ...updated, ...vars.data }` depois de
    salvar (Fornecedores.jsx:88-89) — aqui o dado atualizado vem da própria
    consulta, que a gravação invalida.
  */
  const selectedSupplier = selected
    ? (suppliers.find((supplier) => supplier.id === selected.id) ?? selected)
    : null

  /* Referência estável: SupplierForm reinicia o formulário quando `initialData`
     muda, como no original. */
  const formInitialData = useMemo<SupplierFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (input: SupplierInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input },
        {
          onSuccess: () => {
            closeForm()
            /* Reabre o drawer com os dados atualizados, como no original. */
            setDrawerOpen(true)
            toast.success('Fornecedor atualizado com sucesso')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(input, {
      onSuccess: () => {
        closeForm()
        toast.success('Fornecedor criado com sucesso')
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
    })
  }

  /* Inativar / Reativar: `Ativo` vira `Inativo`, e qualquer outro status vira
     `Ativo` — inclusive "Em negociação", como no original. */
  const handleToggleStatus = (supplier: SupplierRow) => {
    statusMutation.mutate(
      { id: supplier.id, status: supplier.status === 'active' ? 'inactive' : 'active' },
      {
        onError: (error) => toast.error('Erro ao alterar status: ' + describeDatabaseError(error)),
      },
    )
  }

  const confirmDelete = () => {
    if (!deleting) return

    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null)
        setDrawerOpen(false)
        setSelected(null)
        toast.success('Fornecedor excluído')
      },
      /*
        Fornecedor com histórico de cotação NÃO é excluído — as FKs de
        `budget_item_quotes` e `budget_checklist_items` são `no action` de
        propósito (migration 0049). `describeDatabaseError` reconhece as duas pelo
        nome da constraint e devolve a frase que aponta o Inativar. O diálogo fica
        aberto: quem clicou precisa ler o motivo e decidir.
      */
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fornecedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie parceiros e fornecedores do escritório
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Fornecedor
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
          <Input
            placeholder="Buscar por nome ou marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {/*
          `'all'` no lugar do `value={null}` do original: item de Select com valor
          vazio não é aceito pelo Radix. Mesma tradução já feita em Atividades e
          Tarefas — o texto do item e o do placeholder continuam os do original.
        */}
        <Select
          value={filters.category}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              category: value as SupplierFilters['category'],
            }))
          }
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Tipologia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas tipologias</SelectItem>
            {FILTER_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {SUPPLIER_CATEGORY[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.tier}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, tier: value as SupplierFilters['tier'] }))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Nível de Parceria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos níveis</SelectItem>
            {optionsOf(PARTNERSHIP_TIER).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, status: value as SupplierFilters['status'] }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {optionsOf(SUPPLIER_STATUS).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        Três estados explícitos. O original só distingue dois — lista vazia e
        lista cheia — e falha de leitura nele deixa a tela igualzinha a "não há
        fornecedor nenhum".
      */}
      {suppliersQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os fornecedores"
          description="A lista de fornecedores não pôde ser lida agora."
          error={suppliersQuery.error}
          onRetry={() => {
            void suppliersQuery.refetch()
          }}
        />
      ) : suppliersQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredSuppliers.length === 0 ? (
        /*
          A caixa do original, com o mesmo ícone e a mesma geometria. A segunda
          linha é que muda conforme `useHasAnySuppliers`: sem cadastro nenhum não
          há filtro para ajustar, e a frase fica com a metade dela que se aplica.
        */
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Store className="w-12 h-12 text-faint mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum fornecedor encontrado</p>
          <p className="text-faint text-sm mt-1">
            {hasAnyQuery.data === false
              ? 'Cadastre um novo fornecedor'
              : 'Ajuste os filtros ou cadastre um novo fornecedor'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-elevated border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Nome
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Tipologia
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Nível de Parceria
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Contato
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  % Comissão
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Desconto
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Showroom
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSuppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  onClick={() => {
                    setSelected(supplier)
                    setDrawerOpen(true)
                  }}
                  className="hover:bg-elevated cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{supplier.name}</p>
                    {supplier.brands.length > 0 && (
                      <p className="text-xs text-faint mt-0.5">
                        {supplier.brands
                          .slice(0, 2)
                          .map((brand) => brand.name)
                          .join(', ')}
                        {supplier.brands.length > 2 ? '...' : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-soft">
                    {labelOf(SUPPLIER_CATEGORY, supplier.category)}
                  </td>
                  <td className="px-4 py-3">
                    {/* `nivel_parceria` do original é opcional e cai num '-';
                        aqui a coluna é NOT NULL e o crachá está sempre lá. */}
                    <Badge variant="outline" className={TIER_BADGE[supplier.partnership_tier]}>
                      {labelOf(PARTNERSHIP_TIER, supplier.partnership_tier)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-soft">{supplier.contact_whatsapp || '-'}</td>
                  <td className="px-4 py-3 text-sm text-soft">
                    {supplier.commission_percent ? `${supplier.commission_percent}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-soft">
                    {supplier.standard_discount_percent
                      ? `${supplier.standard_discount_percent}%`
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        supplier.has_showroom
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {supplier.has_showroom ? 'Sim' : 'Não'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/* Sem o `|| 'Ativo'` do original: a coluna é NOT NULL com
                        default `active`, então não há linha sem status. */}
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        STATUS_PILL[supplier.status]
                      }`}
                    >
                      {labelOf(SUPPLIER_STATUS, supplier.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer: fecha quando o formulário está aberto */}
      <SupplierDrawer
        open={drawerOpen && !formOpen}
        onClose={() => setDrawerOpen(false)}
        supplier={selectedSupplier}
        onEdit={(supplier) => {
          setEditing(supplier)
          setDrawerOpen(false)
          setFormOpen(true)
        }}
        onToggleStatus={handleToggleStatus}
        onDelete={(supplier) => setDeleting(supplier)}
        canEdit={canEdit}
      />

      <SupplierForm
        open={formOpen}
        onClose={() => {
          closeForm()
          if (selected) setDrawerOpen(true)
        }}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/*
        O original fixa `zIndex: 2000` neste diálogo para que ele fique acima do
        drawer. Aqui a camada já vem resolvida: alert-dialog é 60001 e o sheet é
        40001 (src/components/ui).
      */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o fornecedor <strong>{deleting?.name}</strong>? Esta
              ação não pode ser desfeita. Fornecedor que já cotou ou foi escolhido em item de
              orçamento não pode ser excluído — nesse caso, use Inativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                red-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
