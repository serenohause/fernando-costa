import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Mail, MapPin, MoreVertical, Pencil, Phone, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { useNavigation } from '@/components/shared/useNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { CLIENT_TYPE, LEAD_SOURCE, labelOf } from '@/lib/enums'
import { createPageUrl } from '@/lib/page-url'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import ClientForm, { toFormValues } from './ClientForm'
import {
  DuplicateClientError,
  describeDatabaseError,
  fetchClient,
  useClients,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from '../hooks'
import type { Client, ClientInput, ClientListRow } from '../types'

/*
  Porta de projeto-original/src/pages/Clients.jsx.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete:

  - Leitura é larga (policy `clients_select_active_collaborator`): qualquer
    colaborador ativo do escritório lê a lista, porque ela alimenta seletor de
    cliente em contrato, projeto, atividade, orçamento e recebível. Por isso o
    original envolve a página em `<PermissionGuard menu="CRM">` e aqui NÃO há
    guarda de visualização: esconder a lista de quem o banco deixa ler seria
    inventar uma regra que nem o banco nem o original têm. Quem não deve chegar
    aqui não vê o item CRM na sidebar (`buildNavigation` olha `can_view`).
  - Escrita é `can_edit` no menu `crm` OU ser Diretor — `can_edit_menu()`,
    migration 0019, a mesma regra de `usePermissions.jsx:43`. Sem isso os botões
    de ação não aparecem, e ainda assim o banco é quem recusa.
*/
export default function Clients() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; client: ClientListRow | null }>({
    open: false,
    client: null,
  })
  const [searchQuery, setSearchQuery] = useState('')
  /* Recusa por unicidade da última gravação, para o formulário mostrar de quem é o documento. */
  const [duplicate, setDuplicate] = useState<DuplicateClientError | null>(null)

  const navigate = useNavigate()
  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('crm')

  // Salvar rota de origem
  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])

  const debouncedSearch = useDebouncedValue(searchQuery)
  const clientsQuery = useClients(debouncedSearch)
  const clients = clientsQuery.data ?? []

  /*
    Referência estável de propósito: ClientForm reinicia o formulário quando
    `initialData` muda, como no original. Recriar o objeto a cada render apagaria
    o que está sendo digitado assim que qualquer query se atualizasse.
  */
  const formInitialData = useMemo(
    () => (editingClient ? toFormValues(editingClient) : null),
    [editingClient],
  )

  const createMutation = useCreateClient()
  const updateMutation = useUpdateClient()
  const deleteMutation = useDeleteClient()

  const closeForm = () => {
    setFormOpen(false)
    setEditingClient(null)
    setDuplicate(null)
  }

  const handleWriteError = (error: unknown, prefix: string) => {
    if (error instanceof DuplicateClientError) setDuplicate(error)
    toast.error(prefix + describeDatabaseError(error))
  }

  const handleSubmit = (data: ClientInput) => {
    setDuplicate(null)

    if (editingClient) {
      updateMutation.mutate(
        { id: editingClient.id, input: data },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Cliente atualizado com sucesso!')
          },
          onError: (error) => handleWriteError(error, 'Erro ao atualizar: '),
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        closeForm()
        toast.success('Cliente criado com sucesso!')
      },
      onError: (error) => handleWriteError(error, 'Erro ao criar: '),
    })
  }

  const openClient = (client: ClientListRow) => {
    navigate(createPageUrl('ClientDetail') + `?id=${client.id}`)
  }

  const handleCreateClick = () => {
    setEditingClient(null)
    setDuplicate(null)
    setFormOpen(true)
  }

  /*
    A listagem lê só as colunas que exibe, então a linha da tabela não tem
    endereço, documento nem observações. O formulário precisa do cadastro
    inteiro: busca no clique. Abrir o formulário com a linha reduzida gravaria
    nulo em tudo que não veio.
  */
  const handleEdit = async (client: ClientListRow) => {
    setDuplicate(null)
    try {
      setEditingClient(await fetchClient(client.id))
      setFormOpen(true)
    } catch (error) {
      toast.error('Não foi possível carregar o cadastro: ' + describeDatabaseError(error))
    }
  }

  const confirmDelete = () => {
    const alvo = deleteDialog.client
    if (!alvo) return

    deleteMutation.mutate(alvo.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, client: null })
        toast.success('Cliente excluído com sucesso!')
      },
      onError: (error) => {
        toast.error('Erro ao excluir: ' + describeDatabaseError(error))
      },
    })
  }

  const columns: Column<ClientListRow>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div className="flex items-center gap-3">
          {/* slate-100 → slate-200 do original são exatamente `--muted` e
              `--border` do tema; no escuro o degrau se mantém. */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-muted to-border flex items-center justify-center">
            <span className="font-semibold text-soft">{row.name?.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            <p className="text-sm text-muted-foreground">{labelOf(CLIENT_TYPE, row.client_type)}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Contato',
      cell: (row) => (
        <div className="space-y-1">
          {row.email && (
            <div className="flex items-center gap-2 text-sm text-soft">
              <Mail className="w-4 h-4 text-faint" />
              {row.email}
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-2 text-sm text-soft">
              <Phone className="w-4 h-4 text-faint" />
              {row.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Localização',
      cell: (row) =>
        row.address_city || row.address_state || row.address_country ? (
          <div className="flex items-center gap-2 text-sm text-soft">
            <MapPin className="w-4 h-4 text-faint" />
            {[row.address_city, row.address_state, row.address_country].filter(Boolean).join(', ')}
          </div>
        ) : (
          <span className="text-faint">-</span>
        ),
    },
    {
      header: 'Origem',
      cell: (row) =>
        row.lead_source ? (
          <Badge variant="outline" className="bg-elevated text-soft border-border">
            {labelOf(LEAD_SOURCE, row.lead_source)}
          </Badge>
        ) : (
          <span className="text-faint">-</span>
        ),
    },
    {
      header: '',
      cell: (row) =>
        /* Quem não pode editar vê a lista sem os botões de ação. */
        canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/*
                DUAS ENTRADAS DO ORIGINAL FICAM DE FORA, cada uma esperando o
                módulo que traz a tabela que ela usa:

                - "Criar Oportunidade" (Clients.jsx:137) grava uma `Negociacao`
                  a partir do cliente → tabela `negotiations`, MÓDULO 3.
                - "Histórico do Cliente" abre components/clients/ClientHistory.jsx,
                  que lista `Project` e `AccountReceivable` → MÓDULOS 5 e 7. O
                  item não fica visível levando a um painel vazio: volta junto
                  com os dados que ele mostra.
              */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleEdit(row)
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Editar Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteDialog({ open: true, client: row })
                }}
                className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ]

  /*
    A busca virou consulta ao banco, então "lista vazia" passou a ter dois
    significados: escritório sem cliente nenhum e busca sem resultado. O original
    não precisava distinguir (filtrava em memória, `clients` era sempre a lista
    inteira). Aqui o termo ativo é o que separa os dois casos — e é ele também
    que mantém o campo de busca na tela quando o resultado é vazio, senão o campo
    desapareceria justamente com o texto que causou o vazio dentro dele.
  */
  const isSearching = debouncedSearch.trim() !== ''
  const hasClients = clients.length > 0

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Gerencie sua base de leads e clientes"
        actionLabel={canEdit ? 'Novo Lead' : undefined}
        onAction={canEdit ? handleCreateClick : undefined}
      />

      {(hasClients || isSearching) && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-faint w-4 h-4" />
            <Input
              type="text"
              placeholder="Buscar por nome, email, telefone, cidade ou CPF/CNPJ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      )}

      {clientsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os clientes"
          description="A lista de clientes não pôde ser lida agora."
          error={clientsQuery.error}
          onRetry={() => {
            void clientsQuery.refetch()
          }}
        />
      ) : !hasClients && !isSearching && !clientsQuery.isLoading ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado"
          description="Comece adicionando seu primeiro cliente para gerenciar projetos e contratos."
          actionLabel={canEdit ? 'Adicionar Cliente' : undefined}
          onAction={canEdit ? handleCreateClick : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={clients}
          isLoading={clientsQuery.isLoading}
          emptyMessage="Nenhum cliente encontrado"
          onRowClick={openClient}
        />
      )}

      <ClientForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        duplicate={duplicate}
        onOpenDuplicate={(client) => {
          closeForm()
          openClient(client)
        }}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteDialog.client?.name}? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                rose-600 é escuro o bastante para texto branco nos dois. */}
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
