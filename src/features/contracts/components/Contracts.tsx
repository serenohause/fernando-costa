import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import {
  Calendar,
  FileText,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import ClientLink from '@/features/crm/components/ClientLink'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useNavigation } from '@/components/shared/useNavigation'
import { useFocusParam } from '@/components/shared/useFocusParam'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMenuPermissions } from '@/features/auth/hooks'
import { useClients } from '@/features/crm/hooks'
import { useGenerateContractInstallments } from '@/features/financial/hooks'
import {
  describeInstallmentPlan,
  describeInstallmentValue,
  splitInstallments,
} from '@/features/financial/installments'
import { CONTRACT_STATUS, CONTRACT_TYPE, INSTALLMENT_FREQUENCY, labelOf, type ContractStatus } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import { filterContracts, sortContracts, type StatusFilter } from '../list'
import {
  describeContractFunctionError,
  describeDatabaseError,
  useApproveContract,
  useChangeContractStatus,
  useContracts,
  useCreateContract,
  useDeleteContract,
  useReorderContracts,
  useUpdateContract,
  type ContractDeleteBlock,
  type ContractDeleteResult,
} from '../hooks'
import ContractKanban from './ContractKanban'
import ContractForm, {
  toContractInput,
  toFormValues,
  type ContractFormValues,
} from './ContractForm'
import type { ContractInput, ContractRow } from '../types'

/*
  Porta de projeto-original/src/pages/Contracts.jsx.

  O cabeçalho, a busca, as cinco abas de status, a lista de linhas arrastáveis
  com a alça, o quadrado esmeralda com o ícone de documento, a grade de seis
  colunas de cada linha, o selo de parcelas, o menu de três pontos, o diálogo de
  geração de parcelas e o de exclusão são os do original, na mesma ordem.

  O array `columns` do original (linhas 772-861) NÃO foi portado: ele monta uma
  tabela que a página nunca renderiza — sobrou de uma versão anterior da tela. O
  que está no ar é a lista de cartões, e é ela que está aqui.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0030):

  - Leitura é larga (`contracts_select_active_collaborator`): qualquer
    colaborador ativo do escritório lê. O original também não fecha esta página.
  - Escrita é `can_edit` no menu `contracts` OU ser Diretor — `can_edit_menu()`,
    migration 0019. Sem isso os botões somem, a lista não arrasta, e o banco
    recusa de qualquer forma.

  "GERAR PARCELAS" (MÓDULO 7) — o item de menu (Contracts.jsx:995) e o diálogo
  (Contracts.jsx:1038-1106) estão aqui, com os DOIS ramos do original: o contrato
  que já tem plano salvo mostra a caixa esmeralda, e o que não tem mostra os
  campos "Número de parcelas" e "Data de vencimento da 1ª parcela" e gera na hora.

  A DIFERENÇA ESTÁ NA ORDEM DOS DOIS PASSOS DO SEGUNDO RAMO, e ela vem do banco.
  `public.generate_contract_installments` (migration 0044) NÃO aceita quantidade,
  data e periodicidade por parâmetro: ela lê o plano gravado no contrato. No
  original os valores digitados aqui geram as parcelas SEM NUNCA SEREM GRAVADOS,
  e o contrato passa a descrever um parcelamento diferente do que foi emitido —
  a própria 0044 registra que a saída é a tela gravar o plano e depois chamar a
  função. É o que `confirmGenerateInstallments` faz, nessa ordem.

  O QUE NÃO FOI PORTADO, E O MÓDULO QUE TRAZ DE VOLTA:

  - A criação automática de projeto e tarefa ao aprovar (Contracts.jsx:416-599)
    → PORTADO na migration 0078, e não mais aqui: aprovar chama
    `approve_contract_proposal`, que muda o status, cria (ou reaproveita) o
    projeto e cria o cartão do Fluxo na MESMA transação. Daqui seriam três
    gravações soltas, e a falha no meio deixaria contrato aprovado sem projeto.
    A exclusão em cascata (Contracts.jsx:682-720) veio junto, em
    `delete_contract_cascade`, com dois recortes decididos pelo usuário: alcança
    só os projetos DESTE contrato, e nunca o lead.
  - A geocodificação do endereço da obra (`updateProjectGeolocation`) → MÓDULO 9,
    onde `map_properties` e o PostGIS entram.
  - `updateClientCRM` (Contracts.jsx:215-367): a cada gravação o original varre
    a lista inteira de clientes no navegador e escreve de volta no cadastro do
    CRM os campos que estiverem vazios lá. É o sentido CONTRÁRIO do congelamento
    deste módulo — e escreve em `clients`, exigindo permissão do menu `crm`, a
    partir de uma tela de contratos. Fica de fora; a conferência campo a campo
    entre dado recebido e cadastro já existe no módulo 3 (BriefingReview).
*/
function describeCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/* Cada motivo de recusa diz ONDE resolver: a lista sem o caminho deixa a pessoa
   sabendo que não pode, e não sabendo o que fazer. */
function describeBlock(block: ContractDeleteBlock): string {
  switch (block.kind) {
    case 'paid_receivables':
      return `${describeCount(block.count, 'parcela já paga', 'parcelas já pagas')}${
        block.total ? ` (${formatCurrencyBRL(block.total)})` : ''
      } — desfaça a baixa em Financeiro antes.`
    case 'activities':
      return `${describeCount(block.count, 'atividade', 'atividades')} da equipe no projeto — remova ou desvincule em Atividades.`
    case 'payables':
      return `${describeCount(block.count, 'conta a pagar', 'contas a pagar')} no projeto — remova ou desvincule em Financeiro.`
    case 'budgets':
      return `${describeCount(block.count, 'orçamento', 'orçamentos')} do cliente ligado ao projeto — desvincule em Orçamento por Cliente.`
    case 'map_pins':
      return `${describeCount(block.count, 'propriedade', 'propriedades')} marcada no Mapa — remova ou desvincule no Mapa.`
    case 'other_receivables':
      return `${describeCount(block.count, 'parcela', 'parcelas')} de outro contrato apontando para o projeto — desvincule em Financeiro.`
    default:
      /* Motivo novo no banco sem frase aqui: diz o que é em vez de sumir da
         lista, que faria a recusa parecer sem causa. */
      return 'Há registros ligados ao projeto que precisam ser resolvidos antes.'
  }
}

export default function Contracts() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ContractRow | null>(null)
  /* O que a exclusão levaria junto, medido pela própria função em modo de
     conferência. Nulo enquanto a contagem não volta. */
  const [deletePreview, setDeletePreview] = useState<ContractDeleteResult | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; contract: ContractRow | null }>({
    open: false,
    contract: null,
  })
  const [installmentsDialog, setInstallmentsDialog] = useState<{
    open: boolean
    contract: ContractRow | null
  }>({ open: false, contract: null })
  /* Os dois campos do diálogo quando o contrato ainda não tem plano salvo, com
     os mesmos valores iniciais do original (Contracts.jsx:49-50). */
  const [installmentsCount, setInstallmentsCount] = useState(4)
  const [firstDueDate, setFirstDueDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('contracts')
  /* Chegada da busca global: `?focus=<id>` rola até o contrato e o destaca. */
  const { registerFocusRef, focusClassName } = useFocusParam()

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

  /*
    SOLTAR EM "APROVADO" PERGUNTA ANTES, e as outras colunas não.

    O gesto de aprovar não muda só uma coluna: cria o projeto em Projetos e o
    cartão no Fluxo do Projeto, numa transação (migration 0078). Isso é grande
    demais para acontecer a partir de um arraste que a pessoa pode ter errado —
    e, diferente de mudar de "Em execução" para "Concluído", não se desfaz
    arrastando de volta.

    As demais colunas mudam direto: `useChangeContractStatus` nem aceita
    'approved' no tipo, para que este caminho não exista por engano.
  */
  const [approveDialog, setApproveDialog] = useState<ContractRow | null>(null)
  const changeStatus = useChangeContractStatus()

  const handleKanbanStatusChange = (contract: ContractRow, status: ContractStatus) => {
    if (status === 'approved') {
      setApproveDialog(contract)
      return
    }

    changeStatus(
      { id: contract.id, status },
      {
        onError: (error) => toast.error('Erro ao mover: ' + describeDatabaseError(error)),
      },
    )
  }

  const createMutation = useCreateContract()
  const updateMutation = useUpdateContract()
  const approveMutation = useApproveContract()
  const deleteMutation = useDeleteContract()
  const reorderContracts = useReorderContracts()
  const generateInstallmentsMutation = useGenerateContractInstallments()

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

  /*
    Aprovar cria o projeto e o cartão do Fluxo, e o aviso precisa dizer isso: o
    gesto agora tem efeito em duas telas que a pessoa não está olhando.
  */
  const handleApprove = (contract: ContractRow) => {
    approveMutation.mutate(contract.id, {
      onSuccess: (result) => {
        if (result.outcome === 'created') {
          toast.success(
            `Contrato aprovado. Projeto "${result.projectName}" criado em Projetos` +
              (result.taskCreated ? ', com o cartão no Fluxo do Projeto.' : '.'),
          )
        } else {
          toast.success(
            `Contrato aprovado. O projeto "${result.projectName}" já existia e foi atualizado` +
              (result.taskCreated ? ', e o cartão do Fluxo foi criado.' : '.'),
          )
        }
      },
      onError: (error) => toast.error('Erro ao aprovar: ' + describeContractFunctionError(error)),
    })
  }

  /*
    O DIÁLOGO CONTA ANTES DE APAGAR.

    A exclusão passou a levar junto o projeto, as tarefas, o diário e as parcelas
    do contrato — e isso não pode ser desfeito. Abrir o diálogo chama a função em
    modo de conferência (`confirm: false`), que não escreve nada e devolve as
    contagens; é o que a lista abaixo mostra. Se algo impedir, o mesmo retorno já
    diz o quê, e o botão de excluir some.
  */
  const openDeleteDialog = (contract: ContractRow) => {
    setDeleteDialog({ open: true, contract })
    setDeletePreview(null)
    deleteMutation.mutate(
      { id: contract.id, confirm: false },
      {
        onSuccess: (result) => setDeletePreview(result),
        onError: (error) =>
          toast.error('Não foi possível conferir: ' + describeContractFunctionError(error)),
      },
    )
  }

  const confirmDelete = () => {
    const target = deleteDialog.contract
    if (!target) return

    deleteMutation.mutate(
      { id: target.id, confirm: true },
      {
        onSuccess: (result) => {
          if (result.outcome === 'blocked') {
            setDeletePreview(result)
            return
          }
          setDeleteDialog({ open: false, contract: null })
          setDeletePreview(null)
          toast.success(
            result.projects > 0
              ? `Contrato excluído, junto com ${describeCount(result.projects, 'projeto', 'projetos')} e o que estava dentro dele.`
              : 'Contrato excluído.',
          )
        },
        onError: (error) => toast.error('Erro ao excluir: ' + describeContractFunctionError(error)),
      },
    )
  }

  /* Abrir o diálogo devolve os campos ao estado inicial, e fechar também: o
     número digitado para um contrato não segue para o próximo. O original zera
     `firstDueDate` depois de gerar (Contracts.jsx:715). */
  const openInstallmentsDialog = (contract: ContractRow) => {
    setInstallmentsCount(4)
    setFirstDueDate('')
    setInstallmentsDialog({ open: true, contract })
  }

  const closeInstallmentsDialog = () => {
    setInstallmentsCount(4)
    setFirstDueDate('')
    setInstallmentsDialog({ open: false, contract: null })
  }

  /*
    A recusa por permissão CHEGA AQUI COMO ERRO, e é mostrada como tal.

    `generate_contract_installments` é SECURITY DEFINER e confere
    `can_edit_menu('receivables')` por dentro (migration 0044): quem enxerga esta
    tela pelo menu `contracts` pode não poder gerar parcela nenhuma. Engolir esse
    erro — ou fechar o diálogo como se tivesse dado certo — deixaria a pessoa
    esperando parcelas que não existem. Por isso o diálogo fica ABERTO quando
    falha: a mensagem aparece e a ação continua ao alcance.

    `planWasJustSaved` MUDA A MENSAGEM DE ERRO, e essa distinção é o ponto:
    quando o plano acabou de ser gravado no contrato e a geração falhou, o
    contrato ficou com o parcelamento salvo e SEM parcelas. É estado recuperável
    — reabrir "Gerar Parcelas" agora cai no ramo da caixa esmeralda e tenta de
    novo — mas só se a mensagem disser isso. "Erro ao gerar parcelas", sozinho,
    esconde que metade do gesto já foi gravada, e a pessoa não tem como saber que
    o contrato mudou.
  */
  const generateInstallments = (contract: ContractRow, planWasJustSaved: boolean) => {
    generateInstallmentsMutation.mutate(contract.id, {
      onSuccess: (result) => {
        closeInstallmentsDialog()
        toast.success(`${result.installmentCount} parcelas geradas com sucesso!`)
      },
      onError: (error) =>
        toast.error(
          planWasJustSaved
            ? 'O parcelamento foi salvo no contrato, mas as parcelas NÃO foram geradas: ' +
                describeDatabaseError(error) +
                ' Abra "Gerar Parcelas" de novo para tentar outra vez.'
            : 'Erro ao gerar parcelas: ' + describeDatabaseError(error),
        ),
    })
  }

  /*
    DOIS PASSOS quando o contrato ainda não tem plano salvo, nesta ordem: GRAVAR o
    plano no contrato e só então gerar as parcelas (migration 0044). Se a gravação
    falhar, a função NÃO é chamada — parcelas emitidas a partir de números que o
    contrato não conhece são exatamente o que o original produz.

    A gravação passa pelo mesmo `useUpdateContract` do formulário, com as mesmas
    colunas (`toContractInput`), para que salvar o plano por aqui não apague nada
    do que estava gravado.
  */
  const confirmGenerateInstallments = () => {
    /* A linha da lista, não a congelada no clique — ver `installmentsContract`. */
    const target = installmentsContract
    if (!target) return

    if (hasInstallmentPlan) {
      generateInstallments(target, false)
      return
    }

    /* A frase é a do original (Contracts.jsx:673). */
    if (!firstDueDate) {
      toast.error('Informe a data de vencimento da primeira parcela')
      return
    }

    updateMutation.mutate(
      {
        id: target.id,
        input: {
          ...toContractInput(toFormValues(target)),
          installment_count: installmentsCount,
          first_due_date: firstDueDate,
          /* Mensal quando o contrato não diz outra coisa, como no original
             (Contracts.jsx:670) — o diálogo não pergunta periodicidade, e o
             banco exige os três campos ou nenhum (migration 0029). */
          installment_frequency: 'monthly',
        },
      },
      {
        onSuccess: () => generateInstallments(target, true),
        onError: (error) =>
          toast.error('Erro ao salvar o parcelamento no contrato: ' + describeDatabaseError(error)),
      },
    )
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

    reorderContracts(
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

  /*
    O contrato do diálogo vem da LISTA, e não do objeto guardado no clique.

    Gravar o plano de parcelamento invalida a lista, e a linha volta do banco com
    `installment_count` e `first_due_date` preenchidos. Lendo do objeto congelado,
    uma geração que falhasse DEPOIS da gravação deixaria o diálogo mostrando os
    campos vazios de um plano que já está salvo. O congelado fica como reserva,
    para o contrato que sumiu da lista entre o clique e o render.
  */
  const installmentsContract = installmentsDialog.contract
    ? (contracts.find((contract) => contract.id === installmentsDialog.contract?.id) ??
      installmentsDialog.contract)
    : null
  /* A condição do original (Contracts.jsx:1052) é quantidade E primeiro
     vencimento. A periodicidade não entra porque o check
     `contracts_installment_plan_all_or_none_check` (0029) já a amarra às outras
     duas — ou os três campos estão preenchidos, ou nenhum está. */
  const installmentCount = installmentsContract?.installment_count ?? null
  const hasInstallmentPlan =
    installmentCount != null && installmentsContract?.first_due_date != null

  /* As duas prévias fazem a conta do BANCO, e não a divisão simples do original.
     O porquê está em src/features/financial/installments.ts. */
  const savedPlanSplit = splitInstallments(installmentsContract?.total_value, installmentCount)
  const typedPlanSplit = splitInstallments(installmentsContract?.total_value, installmentsCount)

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
              {/*
                A aba do quadro fica no FIM, e não no começo: as cinco anteriores
                são recortes da mesma lista e a ordem delas veio do original.
                Entrar no meio delas mudaria o gesto de quem já usa a tela.
              */}
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/*
        Três estados explícitos. O original só distingue dois — lista vazia e
        lista cheia — e falha de leitura nele deixa a tela igualzinha a "não há
        contrato nenhum".
      */}
      {statusFilter === 'kanban' && !contractsQuery.isError && !contractsQuery.isLoading ? (
        <ContractKanban
          contracts={filteredContracts}
          canEdit={canEdit}
          onOpen={(contract) => {
            setEditing(contract)
            setFormOpen(true)
          }}
          onStatusChange={handleKanbanStatusChange}
        />
      ) : contractsQuery.isError ? (
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
                        ref={(node) => {
                          dragProvided.innerRef(node)
                          registerFocusRef(contract.id)(node)
                        }}
                        {...dragProvided.draggableProps}
                        className={`border-0 shadow-xs transition-shadow ${focusClassName(contract.id)} ${
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
                                <ClientLink
                                  clientId={contract.client?.id}
                                  name={contract.client?.name}
                                />
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
                              {/* `installments_generated` é levantada por
                                  `generate_contract_installments` (migration 0044),
                                  na MESMA transação que cria as parcelas — o selo
                                  muda junto com elas, nunca antes. */}
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
                                      A condição é a do original (Contracts.jsx:995):
                                      some quando a bandeira já está levantada, e é a
                                      ÚNICA condição — status do contrato não entra.
                                    */}
                                    {!contract.installments_generated && (
                                      <DropdownMenuItem
                                        onClick={() => openInstallmentsDialog(contract)}
                                      >
                                        <Receipt className="w-4 h-4 mr-2" />
                                        Gerar Parcelas
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(contract)}
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

      {/* Generate Installments Dialog */}
      <Dialog
        open={installmentsDialog.open}
        onOpenChange={(open) => {
          if (open) return
          closeInstallmentsDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Parcelas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-soft">
              Contrato: <strong>{installmentsContract?.contract_number}</strong>
            </p>
            <p className="text-sm text-soft">
              Valor total: <strong>{formatCurrencyBRL(installmentsContract?.total_value)}</strong>
            </p>

            {hasInstallmentPlan ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg">
                <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium mb-1">
                  Configuração salva no contrato:
                </p>
                {/*
                  A conta é a de `generate_contract_installments` (migration
                  0044), e não a divisão simples do original: centavos inteiros
                  com o resto na PRIMEIRA parcela. Quando a primeira difere das
                  demais, a linha diz as duas — divergência consciente,
                  explicada em src/features/financial/installments.ts.
                */}
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  • {describeInstallmentPlan(savedPlanSplit)}
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  • Primeiro vencimento: {formatDateBR(installmentsContract?.first_due_date)}
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  • Periodicidade:{' '}
                  {labelOf(INSTALLMENT_FREQUENCY, installmentsContract?.installment_frequency)}
                </p>
              </div>
            ) : (
              /*
                Os campos do original (Contracts.jsx:1068-1093), com o mesmo
                layout e o mesmo microcopy. A frase sob a data continua sendo a de
                lá: os campos do formulário do contrato são o que fica valendo
                como padrão para as próximas vezes — o que se digita aqui vale
                para ESTA geração, e é gravado no contrato junto com ela.
              */
              <>
                <div className="space-y-2">
                  <Label htmlFor="installments_count">Número de parcelas</Label>
                  <Input
                    id="installments_count"
                    type="number"
                    min="1"
                    max="24"
                    value={installmentsCount}
                    onChange={(e) =>
                      setInstallmentsCount(Number.parseInt(e.target.value, 10) || 1)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="installments_first_due_date">
                    Data de vencimento da 1ª parcela
                  </Label>
                  <Input
                    id="installments_first_due_date"
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Configure estes campos no formulário do contrato para salvar como padrão
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Valor por parcela: {describeInstallmentValue(typedPlanSplit)}
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeInstallmentsDialog}>
              Cancelar
            </Button>
            {/* Desabilitado só enquanto uma das duas escritas está em curso —
                gravar o plano é a primeira delas. */}
            <Button
              onClick={confirmGenerateInstallments}
              disabled={updateMutation.isPending || generateInstallmentsMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Gerar Parcelas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Contrato {deleteDialog.contract?.contract_number}.
                </p>

                {deletePreview === null ? (
                  <p className="mt-3 text-sm">Conferindo o que está ligado a este contrato...</p>
                ) : deletePreview.blocks.length > 0 ? (
                  <>
                    <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-400">
                      Não dá para excluir enquanto houver:
                    </p>
                    <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                      {deletePreview.blocks.map((block) => (
                        <li key={block.kind}>{describeBlock(block)}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm">
                      Resolva o que está na lista e tente de novo. Nada foi apagado.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm font-medium">Isto será apagado, sem volta:</p>
                    <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                      <li>O contrato</li>
                      {deletePreview.receivables > 0 && (
                        <li>{describeCount(deletePreview.receivables, 'parcela', 'parcelas')} do contrato</li>
                      )}
                      {deletePreview.projects > 0 && (
                        <li>{describeCount(deletePreview.projects, 'projeto', 'projetos')} deste contrato</li>
                      )}
                      {deletePreview.tasks > 0 && (
                        <li>{describeCount(deletePreview.tasks, 'cartão', 'cartões')} do Fluxo do Projeto</li>
                      )}
                      {deletePreview.diaryEntries > 0 && (
                        <li>
                          {describeCount(deletePreview.diaryEntries, 'registro', 'registros')} do Diário
                          do Projeto
                        </li>
                      )}
                    </ul>
                    {/* O cliente e a negociação ficam por decisão do usuário
                        ("menos o lead") — dizer isso evita a dúvida de quem
                        hesita em apagar por medo de perder o cadastro. */}
                    <p className="mt-3 text-sm text-muted-foreground">
                      O cadastro do cliente e a negociação no Pipeline não são apagados.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {/* `text-white` explícito: o token do botão inverte no tema escuro e
                rose-600 é escuro o bastante para texto branco nos dois. */}
            {/* Some quando algo impede: oferecer o botão seria oferecer um
                gesto que já se sabe que vai ser recusado. */}
            {deletePreview !== null && deletePreview.blocks.length === 0 && (
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        A CONFIRMAÇÃO DIZ O QUE VAI NASCER, e não só "tem certeza?".

        Quem arrasta para "Aprovado" está a um clique de criar um projeto e um
        cartão no Fluxo. "Deseja continuar?" não dá a essa pessoa nada em que
        pensar; a lista do que será criado dá.
      */}
      <AlertDialog
        open={approveDialog !== null}
        onOpenChange={(open) => {
          if (!open) setApproveDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar a proposta {approveDialog?.contract_number}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>Aprovar não muda só a coluna. Isto será criado:</p>
                <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                  <li>
                    O projeto{' '}
                    <strong>
                      {approveDialog?.project_name?.trim() ||
                        approveDialog?.client?.name ||
                        approveDialog?.contract_number}
                    </strong>{' '}
                    em Projetos
                  </li>
                  <li>O cartão inicial no Fluxo do Projeto</li>
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                  Se o contrato já tiver projeto, ele é reaproveitado — nenhum segundo projeto é
                  criado.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = approveDialog
                if (!target) return
                setApproveDialog(null)
                handleApprove(target)
              }}
            >
              Aprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
