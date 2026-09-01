import { useEffect, useMemo, useState } from 'react'
import { differenceInDays } from 'date-fns'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  FileText,
  Kanban,
  List,
  MapPin,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useNavigation } from '@/components/shared/useNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useClients, useClientsByIds } from '@/features/crm/hooks'
import { buildBriefingDiff } from '../briefing-diff'
import { useCollaborators } from '@/features/team/hooks'
import { FUNNEL_STAGE, LEAD_ORIGIN, LOSS_REASON, labelOf } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import { applyFilters, applySearch, EMPTY_FILTERS, type PipelineFilterState } from '../filters'
import {
  describeDatabaseError,
  useClientIntakes,
  useCreateNegotiation,
  useDeleteLostNegotiations,
  useDeleteNegotiation,
  useMarkNegotiationWon,
  useUndoMarkNegotiationWon,
  useMoveNegotiationStage,
  useNegotiations,
  useUpdateNegotiation,
} from '../hooks'
import BriefingReview from './BriefingReview'
import IntakeLinkButton from './IntakeLinkButton'
import NegociacaoForm, { toFormValues, type NegotiationFormValues } from './NegociacaoForm'
import NegociacaoKanban from './NegociacaoKanban'
import PipelineHeader from './PipelineHeader'
import type { NegotiationInput, NegotiationRow } from '../types'

/*
  Porta de projeto-original/src/pages/Negociacoes.jsx.

  O cabeçalho, o aviso âmbar de negociações paradas, os cinco cartões de total, a
  busca, as quatro abas (Funil / Ativas / Ganhas / Perdidas), as colunas de cada
  tabela, os três cartões de resumo da aba Ganhas, o botão de exclusão em massa
  das perdidas e os dois diálogos de confirmação são os do original, na mesma
  ordem.

  AUTORIZAÇÃO — a RLS decide, esta tela só reflete (migration 0024):

  - Leitura é larga (`negotiations_select_active_collaborator`): qualquer
    colaborador ativo do escritório lê. O original também não fecha esta página.
  - Escrita é `can_edit` no menu `pipeline` OU ser Diretor — `can_edit_menu()`,
    migration 0019. Sem isso os botões de ação somem, o quadro não arrasta, e o
    banco recusa de qualquer forma.

  O QUE NÃO FOI PORTADO, E O MÓDULO QUE TRAZ DE VOLTA:

  - A criação automática de `Contract` quando a negociação vira Ganha
    (Negociacoes.jsx:99-179, `handleCreateContractOnly`) → MÓDULO 4. A
    preferência já é gravada em `generates_contract`.
  - As colunas "Projeto" e "Contrato" da aba Ganhas liam
    `projeto_vinculado_name` e `contrato_vinculado_number`, que não existem: a
    ligação foi invertida e quem aponta para a negociação é `contracts` (MÓDULO
    4) e `projects` (MÓDULO 5), ver migration 0022, item 4. As colunas ficam na
    tela, vazias, até aqueles módulos existirem.
  - `NegociacaoDashboard.jsx` é importado pela página do original e nunca
    renderizado (a aba que o exibia foi removida e sobrou o import). Ele repete
    as mesmas cinco contas de PipelineHeader, então não foi portado.
*/
export default function Negociacoes() {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NegotiationRow | null>(null)
  /* Pré-carga do formulário ao marcar como perdida: o original monta um objeto
     "negociação" que não está no banco e abre o formulário com ele. */
  const [formOverride, setFormOverride] = useState<NegotiationFormValues | null>(null)
  const [deleting, setDeleting] = useState<NegotiationRow | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [briefingsOpen, setBriefingsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('kanban')
  const [searchTerm, setSearchTerm] = useState('')
  /* Mantido para o dia em que os filtros forem ligados; hoje é sempre EMPTY_FILTERS. */
  const [filters] = useState<PipelineFilterState>(EMPTY_FILTERS)

  const { saveOrigin } = useNavigation()
  const { canEdit } = useMenuPermissions('pipeline')

  useEffect(() => {
    saveOrigin()
  }, [saveOrigin])

  const negotiationsQuery = useNegotiations()
  const intakesQuery = useClientIntakes()
  const clientsQuery = useClients('')
  const collaboratorsQuery = useCollaborators()

  const negotiations = useMemo(() => negotiationsQuery.data ?? [], [negotiationsQuery.data])
  const intakes = useMemo(() => intakesQuery.data ?? [], [intakesQuery.data])

  const createMutation = useCreateNegotiation()
  const updateMutation = useUpdateNegotiation()
  const moveNegotiationStage = useMoveNegotiationStage()
  const deleteMutation = useDeleteNegotiation()
  const bulkDeleteMutation = useDeleteLostNegotiations()
  const markWon = useMarkNegotiationWon()
  const undoMarkWonMutation = useUndoMarkNegotiationWon()

  const formInitialData = useMemo(
    () => formOverride ?? (editing ? toFormValues(editing) : null),
    [formOverride, editing],
  )

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setFormOverride(null)
  }

  const handleSubmit = (data: NegotiationInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input: data, previousOwnerId: editing.commercial_owner_id },
        {
          onSuccess: () => {
            closeForm()
            toast.success('Negociação atualizada com sucesso')
          },
          onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        closeForm()
        toast.success('Negociação criada com sucesso')
      },
      onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
    })
  }

  const handleEdit = (negotiation: NegotiationRow) => {
    setFormOverride(null)
    setEditing(negotiation)
    setShowForm(true)
  }

  /*
    SOLTAR EM "FECHAMENTO" ENCERRA O NEGÓCIO — decisão do usuário, e é divergência
    do original, que ao arrastar só muda a etapa e deixa "marcar como ganha" como
    ação separada do menu do cartão.

    O gesto passa a fazer o mesmo que aquela ação: status Ganha, data de
    fechamento de hoje, briefing criado e link copiado. A negociação some do
    quadro na hora, porque o quadro mostra só as ativas, e aparece na aba Ganhas.

    E é justamente por sumir que existe o "Desfazer" no aviso: arrastar é um gesto
    fácil de errar, e sem ele quem soltasse na coluna errada teria que caçar a
    negociação na aba Ganhas, reabrir o formulário e devolver status e data na
    mão. As outras colunas continuam sendo só mudança de etapa.
  */
  const handleStageChange = (id: string, funnelStage: NegotiationRow['funnel_stage']) => {
    if (funnelStage === 'closing') {
      const negotiation = negotiations.find((candidate) => candidate.id === id)
      if (negotiation) {
        winNegotiation(negotiation, 'closing')
        return
      }
    }

    moveNegotiationStage(
      { id, funnelStage },
      { onError: (error) => toast.error('Erro ao mover: ' + describeDatabaseError(error)) },
    )
  }

  /*
    "Marcar como ganha": encerra a negociação, cria o briefing e copia o link,
    como no original. O que mudou (token gerado pelo banco, validade no banco)
    está no comentário de useMarkNegotiationWon.
  */
  const winNegotiation = (
    negotiation: NegotiationRow,
    funnelStage?: NegotiationRow['funnel_stage'],
  ) => {
    /*
      A conferência do cliente acontece AQUI, e não só dentro da mutação, porque
      pelo arraste ela precisa acontecer antes de o cartão sair do lugar. Deixar
      o banco recusar faria o cartão sumir do quadro e voltar — e a pessoa leria
      o erro sem relacionar com o cartão que piscou.
    */
    if (!negotiation.client_id) {
      toast.error(
        'Vincule um cliente à negociação antes de marcá-la como Ganha. ' +
          'O formulário de briefing é enviado para ele.',
      )
      return
    }

    markWon(
      { negotiation, funnelStage },
      {
        onSuccess: (result) => {
          void navigator.clipboard.writeText(result.link)
          toast.success(`Link copiado! Envie ao cliente: ${result.link}`, {
            duration: 10_000,
            action: {
              label: 'Desfazer',
              onClick: () =>
                undoMarkWonMutation.mutate(result, {
                  onSuccess: () =>
                    toast.success('Negociação devolvida ao funil e link do formulário cancelado.'),
                  onError: (error) =>
                    toast.error('Não deu para desfazer: ' + describeDatabaseError(error)),
                }),
            },
          })
        },
        onError: (error) => toast.error(describeDatabaseError(error)),
      },
    )
  }

  const handleMarkWon = (negotiation: NegotiationRow) => winNegotiation(negotiation)

  /* O original abre o formulário já com status Perdida e a data de hoje. */
  const handleMarkLost = (negotiation: NegotiationRow) => {
    setEditing(negotiation)
    setFormOverride({
      ...toFormValues(negotiation),
      status: 'lost',
      closed_at: new Date().toISOString().split('T')[0],
    })
    setShowForm(true)
  }

  const confirmDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.success('Negociação excluída com sucesso')
      },
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  const visible = applyFilters(applySearch(negotiations, searchTerm), filters)
  const activeNegotiations = visible.filter((n) => n.status === 'active')
  const wonNegotiations = visible.filter((n) => n.status === 'won')
  const lostNegotiations = visible.filter((n) => n.status === 'lost')

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(
      lostNegotiations.map((n) => n.id),
      {
        onSuccess: (count) => {
          setBulkDeleteOpen(false)
          toast.success(`${count} negociações perdidas excluídas com sucesso`)
        },
        onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
      },
    )
  }

  /* Negociações paradas há mais de 5 dias, conta do original. */
  const stalled = activeNegotiations.filter(
    (n) => differenceInDays(new Date(), new Date(n.updated_at ?? n.created_at)) > 5,
  )

  const submittedIntakes = intakes.filter((intake) => intake.status === 'submitted')

  /*
    O AVISO CONTA O QUE FALTA APLICAR, e não quantos briefings chegaram.

    Antes ele aparecia enquanto existisse briefing com status `submitted` — o
    que nunca deixa de ser verdade, porque aplicar campo não muda o status do
    briefing. Depois de aplicar tudo, a faixa continuava na tela dizendo "Nada
    foi gravado no cadastro", que a essa altura já era falso, e mandando
    conferir uma lista sem nada para conferir.

    Agora o aviso pergunta a mesma coisa que a tela de conferência responde:
    `buildBriefingDiff` sobre o cadastro ATUAL. Zerou, some.

    Os cadastros vêm de `useClientsByIds` e não de `clientsQuery`: aquele é um
    `Pick` de oito colunas para a listagem, e comparar contra ele acusaria
    divergência em CPF, nascimento e endereço só porque não foram carregados.
  */
  const intakeClientIds = submittedIntakes
    .map((intake) => intake.client_id)
    .filter((id): id is string => Boolean(id))
  const intakeClientsQuery = useClientsByIds(intakeClientIds)

  const pendingIntakes = useMemo(() => {
    const porId = new Map((intakeClientsQuery.data ?? []).map((c) => [c.id, c]))
    return submittedIntakes.filter((intake) => {
      const cliente = intake.client_id ? porId.get(intake.client_id) : undefined
      /*
        Sem cadastro do outro lado não há o que aplicar — é o caso dos briefings
        cujo cliente saiu do CRM (migration 0064), que a tela de conferência já
        trata com estado próprio.
      */
      if (!cliente) return false
      return buildBriefingDiff(intake, cliente).length > 0
    })
  }, [submittedIntakes, intakeClientsQuery.data])

  const isPrevisaoVencida = (row: NegotiationRow) =>
    Boolean(row.expected_close_date && new Date(row.expected_close_date) < new Date())

  const originCell = (row: NegotiationRow) => (
    <div className="flex flex-col gap-1">
      {row.origin ? (
        <Badge variant="outline" className="text-xs bg-elevated">
          {labelOf(LEAD_ORIGIN, row.origin)}
        </Badge>
      ) : (
        <span className="text-faint">-</span>
      )}
      {row.origin === 'referral' && row.referrer_name && (
        <span className="text-xs text-soft">por {row.referrer_name}</span>
      )}
    </div>
  )

  const cityCell = (row: NegotiationRow) =>
    row.client?.address_city || row.client?.address_state ? (
      <div className="flex items-center gap-2 text-sm text-soft">
        <MapPin className="w-3 h-3 text-faint" />
        {row.client?.address_city && row.client?.address_state
          ? `${row.client.address_city} / ${row.client.address_state}`
          : (row.client?.address_city ?? row.client?.address_state)}
      </div>
    ) : (
      <span className="text-faint">-</span>
    )

  const servicesCell = (row: NegotiationRow) => (
    <div className="flex flex-col gap-1">
      {row.services.map((service) => (
        <Badge key={service.service_type_id} variant="outline" className="text-xs">
          {service.type?.label ?? '—'}
        </Badge>
      ))}
    </div>
  )

  const clientCell = (row: NegotiationRow) =>
    row.client?.name ?? <span className="text-faint">-</span>

  const ownerCell = (row: NegotiationRow) => row.owner?.name ?? <span className="text-faint">-</span>

  const activeColumns: Column<NegotiationRow>[] = [
    {
      header: 'Negociação',
      cell: (row) => {
        const daysStalled = differenceInDays(new Date(), new Date(row.updated_at ?? row.created_at))
        const atRisk = daysStalled > 5 || isPrevisaoVencida(row)

        return (
          <div className="flex items-center gap-2">
            {atRisk && (
              <div className="flex items-center">
                <AlertTriangle
                  className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0"
                  aria-label={
                    isPrevisaoVencida(row) ? 'Previsão vencida' : `Parada há ${daysStalled} dias`
                  }
                />
                <Badge
                  variant="outline"
                  className="ml-1 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900"
                >
                  Em risco
                </Badge>
              </div>
            )}
            <span className="font-medium">{row.name}</span>
          </div>
        )
      },
    },
    { header: 'Cliente', cell: clientCell },
    { header: 'Origem', cell: originCell },
    { header: 'Cidade / Estado', cell: cityCell },
    { header: 'Tipo', cell: servicesCell },
    {
      header: 'Valor',
      cell: (row) => (
        <span className="text-lg font-bold text-foreground">
          {formatCurrencyBRL(row.estimated_value)}
        </span>
      ),
    },
    /*
      "-" e nao "0%" quando nao ha valor. O campo de probabilidade saiu do
      formulario, entao negociacao nova nasce sem ele — e "0%" leria como "chance
      zero de fechar", que e um juizo que ninguem fez. A coluna Previsao logo
      abaixo ja usa "-" para o mesmo caso.
    */
    {
      header: 'Prob.',
      cell: (row) => <span>{row.close_probability == null ? '-' : `${row.close_probability}%`}</span>,
    },
    { header: 'Etapa', cell: (row) => <StatusBadge status={labelOf(FUNNEL_STAGE, row.funnel_stage)} /> },
    { header: 'Responsável', cell: ownerCell },
    {
      header: 'Previsão',
      cell: (row) => (row.expected_close_date ? formatDateBR(row.expected_close_date) : '-'),
    },
    {
      header: 'Ações',
      cell: (row) =>
        canEdit ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              onClick={(event) => {
                event.stopPropagation()
                handleMarkWon(row)
              }}
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              onClick={(event) => {
                event.stopPropagation()
                handleMarkLost(row)
              }}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ]

  const wonColumns: Column<NegotiationRow>[] = [
    {
      header: 'Negociação',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <Badge className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900">
            Convertida
          </Badge>
        </div>
      ),
    },
    { header: 'Cliente', cell: clientCell },
    { header: 'Origem', cell: originCell },
    { header: 'Cidade / Estado', cell: cityCell },
    { header: 'Tipo', cell: servicesCell },
    {
      header: 'Valor',
      cell: (row) => (
        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
          {formatCurrencyBRL(row.estimated_value)}
        </span>
      ),
    },
    {
      header: 'Data Fechamento',
      cell: (row) =>
        row.closed_at ? (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-3 h-3 text-faint" />
            {formatDateBR(row.closed_at)}
          </div>
        ) : (
          '-'
        ),
    },
    { header: 'Responsável', cell: ownerCell },
    /*
      Projeto e Contrato: a coluna existe na tela do original e lê
      `projeto_vinculado_name` / `contrato_vinculado_number`, que NÃO existem
      aqui — contrato (MÓDULO 4) e projeto (MÓDULO 5) é que apontam para a
      negociação, por (id, tenant_id). Ver migration 0022, item 4. Fica vazia até
      aqueles módulos, exatamente como fica no original quando nada está ligado.
    */
    { header: 'Projeto', cell: () => null },
    {
      header: 'Contrato',
      cell: () => (
        <div className="flex items-center gap-2">
          <FileText className="w-3 h-3 text-faint" />
          <span className="font-mono text-sm text-faint">-</span>
        </div>
      ),
    },
    {
      header: 'Link Cliente',
      cell: (row) => (
        <IntakeLinkButton
          intake={intakes.find((intake) => intake.negotiation_id === row.id) ?? null}
        />
      ),
    },
    {
      header: 'Ações',
      cell: (row) =>
        canEdit ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              onClick={(event) => {
                event.stopPropagation()
                setDeleting(row)
              }}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ]

  const lostColumns: Column<NegotiationRow>[] = [
    {
      header: 'Negociação',
      cell: (row) => (
        <div className="flex items-center gap-2 opacity-75">
          <div className="w-1 h-8 bg-rose-400 rounded-full" />
          <span className="font-medium text-soft">{row.name}</span>
        </div>
      ),
    },
    { header: 'Cliente', cell: clientCell },
    { header: 'Origem', cell: originCell },
    { header: 'Cidade / Estado', cell: cityCell },
    { header: 'Tipo', cell: servicesCell },
    {
      header: 'Valor',
      cell: (row) => (
        <span className="text-lg font-semibold text-muted-foreground">
          {formatCurrencyBRL(row.estimated_value)}
        </span>
      ),
    },
    {
      header: 'Data Fechamento',
      cell: (row) =>
        row.closed_at ? (
          <div className="flex items-center gap-2 text-sm text-soft">
            <Calendar className="w-3 h-3 text-faint" />
            {formatDateBR(row.closed_at)}
          </div>
        ) : (
          '-'
        ),
    },
    {
      header: 'Motivo',
      cell: (row) =>
        row.loss_reason ? (
          <Badge
            variant="outline"
            className="bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900"
          >
            {labelOf(LOSS_REASON, row.loss_reason)}
          </Badge>
        ) : (
          '-'
        ),
    },
    { header: 'Responsável', cell: ownerCell },
  ]

  /*
    TRÊS ESTADOS. O original só conhece "carregando" (passa `isLoading` ao
    DataTable): falha de leitura ia para o console e a tela ficava com a lista
    vazia, indistinguível de escritório sem negociação. Erro e vazio agora têm
    saída própria — e "vazio" só é vazio de verdade quando não há busca nem
    filtro ativo, senão o campo de busca sumiria junto com o texto que causou o
    vazio.
  */
  const isFiltering =
    searchTerm.trim() !== '' || Object.values(filters).some((value) => value !== 'todos')
  const hasNegotiations = negotiations.length > 0

  if (negotiationsQuery.isError) {
    return (
      <div>
        <PageHeader title="Pipeline" subtitle="Gerencie seu funil de vendas e oportunidades" />
        <ErrorState
          title="Não foi possível carregar o funil"
          description="As negociações não puderam ser lidas agora."
          error={negotiationsQuery.error}
          onRetry={() => {
            void negotiationsQuery.refetch()
          }}
        />
      </div>
    )
  }

  const openCreateForm = () => {
    setEditing(null)
    setFormOverride(null)
    setShowForm(true)
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Gerencie seu funil de vendas e oportunidades"
        actionLabel={canEdit ? 'Nova Oportunidade' : undefined}
        onAction={canEdit ? openCreateForm : undefined}
        icon={Plus}
      />

      {stalled.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-300">
              {stalled.length}{' '}
              {stalled.length === 1 ? 'negociação parada' : 'negociações paradas'} há mais de 5 dias
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              Revise estas negociações para evitar perda de oportunidades
            </p>
          </div>
        </div>
      )}

      {/*
        NÃO EXISTE NO ORIGINAL. Lá o briefing enviado sobrescrevia o cadastro do
        CRM sozinho e não havia nada para conferir. Decisão do usuário: o
        briefing fica guardado e a equipe aplica campo a campo — ver
        BriefingReview.tsx. O aviso reusa a forma do aviso âmbar acima, que é a
        linguagem que a página já tem para "isto pede sua atenção".
      */}
      {pendingIntakes.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl flex items-start gap-3">
          <ClipboardCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-blue-900 dark:text-blue-300">
              {pendingIntakes.length}{' '}
              {pendingIntakes.length === 1
                ? 'briefing com dados a conferir'
                : 'briefings com dados a conferir'}
            </p>
            {/*
              A frase deixou de afirmar que "nada foi gravado": depois de a
              equipe aplicar alguns campos isso vira mentira. O que continua
              verdade — e é o que a pessoa precisa saber — é que o briefing não
              altera o cadastro sozinho.
            */}
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              O briefing não altera o cadastro sozinho. Confira o que difere e aplique o que
              estiver certo.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBriefingsOpen(true)}>
            Conferir
          </Button>
        </div>
      )}

      <PipelineHeader negotiations={negotiations} />

      {/*
        Campo de busca solto, e NÃO o componente PipelineFilters.

        O original tem `components/negociacoes/PipelineFilters.jsx` no código,
        mas `Negociacoes.jsx` nunca o monta — nem importa o arquivo. Ele desenha
        só esta busca. Decisão do usuário: a tela fica como o original de fato
        mostra.

        O motivo pesa mais que a fidelidade em si: o comportamento daqueles
        filtros nunca existiu em lugar nenhum, então as regras — as faixas de
        valor, principalmente — seriam invenção nossa. Equipe se acostumando com
        um recorte que ninguém definiu é pior que recurso ausente.

        O componente continua no repositório, desmontado. Se um dia for ligado,
        as faixas precisam vir do escritório, não de palpite.
      */}
      {(hasNegotiations || isFiltering) && (
        <div className="mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <Input
              placeholder="Buscar por negociação, cliente ou responsável..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      )}

      {!hasNegotiations && !isFiltering && !negotiationsQuery.isLoading ? (
        <EmptyState
          icon={TrendingUp}
          title="Nenhuma negociação no funil"
          description="Comece registrando a primeira oportunidade para acompanhar o funil comercial."
          actionLabel={canEdit ? 'Nova Oportunidade' : undefined}
          onAction={canEdit ? openCreateForm : undefined}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card border border-border shadow-xs w-full sm:w-auto overflow-x-auto flex-nowrap">
            <TabsTrigger
              value="kanban"
              className="gap-1 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
            >
              <Kanban className="h-4 w-4" />
              Funil
            </TabsTrigger>
            <TabsTrigger
              value="ativas"
              className="gap-1 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
            >
              <List className="h-4 w-4" />
              Ativas
            </TabsTrigger>
            <TabsTrigger
              value="ganhas"
              className="gap-1 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
            >
              <CheckCircle className="h-4 w-4" />
              Ganhas
            </TabsTrigger>
            <TabsTrigger
              value="perdidas"
              className="gap-1 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
            >
              <XCircle className="h-4 w-4" />
              Perdidas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <NegociacaoKanban
              negotiations={activeNegotiations}
              onStageChange={handleStageChange}
              onEdit={handleEdit}
              onDelete={setDeleting}
              canEdit={canEdit}
            />
          </TabsContent>

          <TabsContent value="ativas">
            <div className="bg-gradient-to-br from-blue-50 dark:from-blue-950/30 to-card rounded-xl border border-blue-100 dark:border-blue-900 p-3 sm:p-6 shadow-xs">
              <DataTable
                columns={activeColumns}
                data={activeNegotiations}
                isLoading={negotiationsQuery.isLoading}
                onRowClick={handleEdit}
                emptyMessage="Nenhuma negociação ativa"
              />
            </div>
          </TabsContent>

          <TabsContent value="ganhas">
            <div className="bg-gradient-to-br from-emerald-50 dark:from-emerald-950/30 to-card rounded-xl border border-emerald-100 dark:border-emerald-900 p-3 sm:p-6 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-card rounded-lg p-4 border border-emerald-200 dark:border-emerald-900">
                  <p className="text-sm text-soft mb-1">Total Ganhas (30d)</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {
                      wonNegotiations.filter((n) => {
                        const thirtyDaysAgo = new Date()
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                        return n.closed_at && new Date(n.closed_at) >= thirtyDaysAgo
                      }).length
                    }
                  </p>
                </div>
                <div className="bg-card rounded-lg p-4 border border-emerald-200 dark:border-emerald-900">
                  <p className="text-sm text-soft mb-1">Soma Total</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrencyBRL(
                      wonNegotiations.reduce((sum, n) => sum + (n.estimated_value ?? 0), 0),
                    )}
                  </p>
                </div>
                <div className="bg-card rounded-lg p-4 border border-emerald-200 dark:border-emerald-900">
                  <p className="text-sm text-soft mb-1">Ticket Médio</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrencyBRL(
                      wonNegotiations.length > 0
                        ? wonNegotiations.reduce((sum, n) => sum + (n.estimated_value ?? 0), 0) /
                            wonNegotiations.length
                        : 0,
                    )}
                  </p>
                </div>
              </div>
              <DataTable
                columns={wonColumns}
                data={wonNegotiations}
                isLoading={negotiationsQuery.isLoading}
                onRowClick={handleEdit}
                emptyMessage="Nenhuma negociação ganha"
              />
            </div>
          </TabsContent>

          <TabsContent value="perdidas">
            <div className="bg-gradient-to-br from-rose-50 dark:from-rose-950/30 to-card rounded-xl border border-rose-100 dark:border-rose-900 p-3 sm:p-6 shadow-xs">
              {lostNegotiations.length > 0 && canEdit && (
                <div className="mb-4">
                  <Button
                    variant="outline"
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/40 dark:border-rose-900"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir todas as negociações perdidas ({lostNegotiations.length})
                  </Button>
                </div>
              )}
              <DataTable
                columns={lostColumns}
                data={lostNegotiations}
                isLoading={negotiationsQuery.isLoading}
                onRowClick={handleEdit}
                emptyMessage="Nenhuma negociação perdida"
              />
            </div>
          </TabsContent>
        </Tabs>
      )}

      <NegociacaoForm
        open={showForm}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clients={clientsQuery.data ?? []}
        collaborators={collaboratorsQuery.data ?? []}
      />

      <BriefingReview
        open={briefingsOpen}
        onClose={() => setBriefingsOpen(false)}
        intakes={submittedIntakes}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a negociação "{deleting?.name}"? Esta ação não pode ser
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir todas as negociações perdidas?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {lostNegotiations.length} negociações perdidas? Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Excluir todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
