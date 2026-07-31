import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Calendar, FileText, GripVertical, MoreVertical, Pencil, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useNavigation } from '@/components/shared/useNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useClients } from '@/features/crm/hooks'
import { CONTRACT_STATUS, CONTRACT_TYPE, labelOf } from '@/lib/enums'
import { formatCurrencyBRL } from '@/lib/format'
import { filterContracts, sortContracts, type StatusFilter } from '../list'
import {
  describeDatabaseError,
  useApproveContract,
  useContracts,
  useCreateContract,
  useDeleteContract,
  useReorderContracts,
  useUpdateContract,
} from '../hooks'
import ContractForm, { toFormValues, type ContractFormValues } from './ContractForm'
import type { ContractInput, ContractRow } from '../types'

/*
  Porta de projeto-original/src/pages/Contracts.jsx.

  O cabeçalho, a busca, as cinco abas de status, a lista de linhas arrastáveis
  com a alça, o quadrado esmeralda com o ícone de documento, a grade de seis
  colunas de cada linha, o selo de parcelas, o menu de três pontos e o diálogo de
  exclusão são os do original, na mesma ordem.

  O array `columns` do original (linhas 772-861) NÃO foi portado: ele monta uma
  tabela que a página nunca renderiza — sobrou de uma versão anterior da tela. O
  que está no ar é a lista de cartões, e é ela que está aqui.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0030):

  - Leitura é larga (`contracts_select_active_collaborator`): qualquer
    colaborador ativo do escritório lê. O original também não fecha esta página.
  - Escrita é `can_edit` no menu `contracts` OU ser Diretor — `can_edit_menu()`,
    migration 0019. Sem isso os botões somem, a lista não arrasta, e o banco
    recusa de qualquer forma.

  O QUE NÃO FOI PORTADO, E O MÓDULO QUE TRAZ DE VOLTA:

  - "Gerar Parcelas" — o item de menu e o diálogo (Contracts.jsx:651-717 e
    1038-1106) criam `AccountReceivable` a partir do contrato. Essa tabela é o
    MÓDULO 7. O plano de parcelamento já é gravado pelo formulário, e o selo
    "Geradas / Pendente" continua na linha porque `installments_generated` já
    existe e o seed tem contrato nos dois estados.
  - A criação automática de projeto e tarefa ao aprovar (Contracts.jsx:416-599)
    → MÓDULO 5, junto com `projects` e `tasks`. Aprovar aqui muda o status e
    nada mais.
  - A geocodificação do endereço da obra (`updateProjectGeolocation`) → MÓDULO 9,
    onde `map_properties` e o PostGIS entram.
  - `updateClientCRM` (Contracts.jsx:215-367): a cada gravação o original varre
    a lista inteira de clientes no navegador e escreve de volta no cadastro do
    CRM os campos que estiverem vazios lá. É o sentido CONTRÁRIO do congelamento
    deste módulo — e escreve em `clients`, exigindo permissão do menu `crm`, a
    partir de uma tela de contratos. Fica de fora; a conferência campo a campo
    entre dado recebido e cadastro já existe no módulo 3 (BriefingReview).
*/
export default function Contracts() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ContractRow | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; contract: ContractRow | null }>({
    open: false,
    contract: null,
  })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('contracts')

  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])

  const contractsQuery = useContracts()
  const clientsQuery = useClients('')

  const contracts = useMemo(
    () => sortContracts(contractsQuery.data ?? []),
    [contractsQuery.data],
  )
  const filteredContracts = useMemo(
    () => filterContracts(contracts, statusFilter, searchTerm),
    [contracts, statusFilter, searchTerm],
  )

  const createMutation = useCreateContract()
  const updateMutation = useUpdateContract()
  const approveMutation = useApproveContract()
  const deleteMutation = useDeleteContract()
  const reorderMutation = useReorderContracts()

  /*
    Referência estável de propósito: ContractForm reinicia o formulário quando
    `initialData` muda, como no original. Recriar o objeto a cada render apagaria
    o que está sendo digitado assim que qualquer query se atualizasse.
  */
  const formInitialData = useMemo<ContractFormValues | null>(
    () => (editing ? toFormValues(editing) : null),
    [editing],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (data: ContractInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input: data },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Contrato atualizado com sucesso!')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        closeForm()
        toast.success('Contrato criado com sucesso!')
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
    })
  }

  const handleApprove = (contract: ContractRow) => {
    approveMutation.mutate(contract.id, {
      onSuccess: () => toast.success('Contrato aprovado!'),
      onError: (error) => toast.error('Erro ao aprovar: ' + describeDatabaseError(error)),
    })
  }

  const confirmDelete = () => {
    const target = deleteDialog.contract
    if (!target) return

    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, contract: null })
        toast.success('Contrato excluído com sucesso!')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  /*
    A ordem gravada é a da lista COMPLETA, não a da filtrada.

    No original o índice sai de `filteredContracts` (linha 754): arrastar com um
    filtro de status ativo reescreve `ordem_exibicao` de todo mundo usando a
    posição dentro do filtro, e os contratos que o filtro escondeu recebem
    índices repetidos. Aqui o contrato arrastado é movido para a posição que o
    contrato de destino ocupa na lista inteira, e o resto se acomoda em volta.
  */
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return

    const movedId = filteredContracts[result.source.index].id
    const targetId = filteredContracts[result.destination.index].id

    const reordered = [...contracts]
    const from = reordered.findIndex((contract) => contract.id === movedId)
    const to = reordered.findIndex((contract) => contract.id === targetId)
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    reorderMutation.mutate(
      reordered.map((contract) => ({
        id: contract.id,
        display_order: contract.display_order,
      })),
      {
        onSuccess: () => toast.success('Ordem atualizada!'),
        onError: (error) => toast.error('Erro ao atualizar ordem: ' + describeDatabaseError(error)),
      },
    )
  }

  const hasContracts = contracts.length > 0

  return (
    <div>
      <PageHeader
        title="Contratos & Propostas"
        subtitle="Gerencie contratos e propostas comerciais"
        actionLabel={canEdit ? 'Nova Proposta' : undefined}
        onAction={
          canEdit
            ? () => {
                setEditing(null)
                setFormOpen(true)
              }
            : undefined
        }
      />

      {hasContracts && (
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
            <Input
              type="text"
              placeholder="Buscar por nº do contrato, cliente ou projeto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-card"
            />
          </div>

          {/*
            As cinco abas do original, com os mesmos rótulos — inclusive o fato
            de não haver aba para "Rescindido". Contrato rescindido continua
            aparecendo em "Todos".
          */}
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <TabsList className="bg-card border">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="negotiating">{CONTRACT_STATUS.negotiating}</TabsTrigger>
              <TabsTrigger value="approved">Aprovados</TabsTrigger>
              <TabsTrigger value="in_progress">{CONTRACT_STATUS.in_progress}</TabsTrigger>
              <TabsTrigger value="completed">Concluídos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/*
        Três estados explícitos. O original só distingue dois — lista vazia e
        lista cheia — e falha de leitura nele deixa a tela igualzinha a "não há
        contrato nenhum".
      */}
      {contractsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os contratos"
          description="A lista de contratos não pôde ser lida agora."
          error={contractsQuery.error}
          onRetry={() => {
            void contractsQuery.refetch()
          }}
        />
      ) : contractsQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <Card key={index} className="border-0 shadow-xs">
              <div className="p-4">
                <Skeleton className="h-12 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : !hasContracts ? (
        <EmptyState
          icon={FileText}
          title="Nenhum contrato cadastrado"
          description="Crie contratos para gerenciar os acordos com seus clientes."
          actionLabel={canEdit ? 'Criar Contrato' : undefined}
          onAction={canEdit ? () => setFormOpen(true) : undefined}
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="contracts" isDropDisabled={!canEdit}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {filteredContracts.map((contract, index) => (
                  <Draggable
                    key={contract.id}
                    draggableId={contract.id}
                    index={index}
                    isDragDisabled={!canEdit}
                  >
                    {(dragProvided, dragSnapshot) => (
                      <Card
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`border-0 shadow-xs transition-shadow ${
                          dragSnapshot.isDragging ? 'shadow-lg' : ''
                        }`}
                      >
                        <div className="p-4 flex items-center gap-4">
                          <div
                            {...dragProvided.dragHandleProps}
                            className={canEdit ? 'cursor-grab active:cursor-grabbing' : ''}
                          >
                            <GripVertical className="w-5 h-5 text-faint" />
                          </div>

                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-950/40 dark:to-emerald-900/40 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>

                          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                            <div>
                              <p className="font-medium text-foreground">
                                {contract.contract_number}
                              </p>
                              {/* Nome ATUAL do cadastro, via join. O nome congelado
                                  na assinatura é `client_legal_name`, e os dois
                                  podem divergir legitimamente. */}
                              <p className="text-sm text-muted-foreground">
                                {contract.client?.name ?? 'Sem cliente'}
                              </p>
                              {contract.origin === 'referral' && contract.referrer_name && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                  Indicado por {contract.referrer_name}
                                </p>
                              )}
                            </div>

                            <div>
                              {contract.project_name ? (
                                <span className="text-sm text-soft">{contract.project_name}</span>
                              ) : (
                                <span className="text-faint">-</span>
                              )}
                            </div>

                            <div>
                              <Badge variant="outline" className="bg-elevated text-soft border-border">
                                {labelOf(CONTRACT_TYPE, contract.contract_type)}
                              </Badge>
                            </div>

                            <div>
                              <span className="font-semibold text-foreground">
                                {formatCurrencyBRL(contract.total_value)}
                              </span>
                            </div>

                            <div>
                              <StatusBadge status={labelOf(CONTRACT_STATUS, contract.status)} />
                            </div>

                            <div className="flex items-center justify-end gap-3">
                              {/* `installments_generated` continua exibida: quem a
                                  levanta é o MÓDULO 7, na mesma transação que cria
                                  as parcelas. */}
                              {contract.installments_generated ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
                                >
                                  Geradas
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900"
                                >
                                  Pendente
                                </Badge>
                              )}

                              {/* Quem não pode editar vê a lista sem os botões de ação. */}
                              {canEdit && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditing(contract)
                                        setFormOpen(true)
                                      }}
                                    >
                                      <Pencil className="w-4 h-4 mr-2" />
                                      Editar
                                    </DropdownMenuItem>
                                    {contract.status === 'negotiating' && (
                                      <DropdownMenuItem onClick={() => handleApprove(contract)}>
                                        <Calendar className="w-4 h-4 mr-2" />
                                        Aprovar Proposta
                                      </DropdownMenuItem>
                                    )}
                                    {/*
                                      "Gerar Parcelas" entrava aqui, entre aprovar e
                                      remover (Contracts.jsx:995). Volta com
                                      `accounts_receivable`, no MÓDULO 7.
                                    */}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeleteDialog({ open: true, contract })}
                                      className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Remover
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <ContractForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clients={clientsQuery.data ?? []}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato {deleteDialog.contract?.contract_number}?
              <br />
              <br />
              {/*
                O original promete excluir junto as parcelas, o projeto vinculado
                e as tarefas do projeto. Nenhuma dessas tabelas existe ainda
                (MÓDULOS 5 e 7), e prometer apagar o que não há é pior do que
                omitir: a lista volta quando as tabelas voltarem.
              */}
              <strong>Esta ação irá excluir:</strong>
              <ul className="list-disc pl-5 mt-2 text-sm">
                <li>O contrato</li>
              </ul>
              <br />
              Esta ação não pode ser desfeita.
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
