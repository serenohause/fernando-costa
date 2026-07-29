import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Mail, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import PageHeader from '@/components/shared/PageHeader'
import ErrorState from '@/components/shared/ErrorState'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import AcessoNegado from './AcessoNegado'
import CollaboratorForm, { type CollaboratorFormValues } from './CollaboratorForm'
import {
  useAccessRequests,
  useApproveAccessRequest,
  useCollaborators,
  useRejectAccessRequest,
} from '../hooks'
import type { AccessRequest, Collaborator, CollaboratorInput } from '../types'

/*
  Porta de projeto-original/src/pages/AprovacoesAcesso.jsx.

  Duas coisas mudam de lugar, não de comportamento:

  - Aprovar e recusar não escrevem na tabela. `access_requests` tem RLS ligada e
    nenhuma policy de escrita (migration 0011): quem grava é a edge function,
    com service_role, e ela deriva do JWT quem decidiu — no original isso vinha
    do corpo da requisição, ou seja, dava para assinar a decisão com o nome de
    outra pessoa.
  - Quem não é Diretor não vê "lista vazia": a policy de SELECT devolveria zero
    linhas, que na tela seria indistinguível de "não há solicitações". Por isso
    o guarda de função vem antes da consulta, e a consulta nem é disparada.
*/
export default function AprovacoesAcesso() {
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<AccessRequest | null>(null)
  const [action, setAction] = useState<'recusar' | null>(null)
  const [showCollaboratorForm, setShowCollaboratorForm] = useState(false)
  const [collaboratorToApprove, setCollaboratorToApprove] = useState<Collaborator | null>(null)

  const currentCollaboratorQuery = useCurrentCollaborator()
  const currentCollaborator = currentCollaboratorQuery.data ?? null
  const isDirector = currentCollaborator?.role === 'director'

  const solicitacoesQuery = useAccessRequests(isDirector)
  const solicitacoes = solicitacoesQuery.data ?? []

  /* Como no original: se já existe colaborador com aquele e-mail, o formulário
     de aprovação abre preenchido com o cadastro dele, não com o padrão. */
  const collaboratorsQuery = useCollaborators()

  const aprovarMutation = useApproveAccessRequest()
  const recusarMutation = useRejectAccessRequest()

  /*
    Referência estável: CollaboratorForm reinicia o formulário quando
    `initialData` muda. Objeto novo a cada render apagaria o que o Diretor
    estivesse digitando assim que qualquer query se atualizasse.
  */
  const formInitialData: CollaboratorFormValues | null = useMemo(() => {
    if (!selectedSolicitacao) return null
    if (collaboratorToApprove) {
      return {
        name: collaboratorToApprove.name,
        role: collaboratorToApprove.role,
        area: collaboratorToApprove.area ?? '',
        email: collaboratorToApprove.email,
        status: 'active',
        weekly_hours:
          collaboratorToApprove.weekly_hours == null
            ? ''
            : String(collaboratorToApprove.weekly_hours),
      }
    }
    /* Mesmo pré-preenchimento do original: Administrativo / Administrativo / Ativo. */
    return {
      name: selectedSolicitacao.name,
      email: selectedSolicitacao.email,
      area: 'administrative',
      role: 'admin_staff',
      status: 'active',
      weekly_hours: '',
    }
  }, [collaboratorToApprove, selectedSolicitacao])

  const handleAprovar = (solicitacao: AccessRequest) => {
    const existingCollab =
      collaboratorsQuery.data?.find(
        (c) => c.email.toLowerCase() === solicitacao.email.toLowerCase(),
      ) ?? null

    setCollaboratorToApprove(existingCollab)
    setSelectedSolicitacao(solicitacao)
    setShowCollaboratorForm(true)
  }

  const handleRecusar = (solicitacao: AccessRequest) => {
    setSelectedSolicitacao(solicitacao)
    setAction('recusar')
  }

  const fecharFormulario = () => {
    setShowCollaboratorForm(false)
    setCollaboratorToApprove(null)
    setSelectedSolicitacao(null)
  }

  const handleCollaboratorSubmit = (data: CollaboratorInput) => {
    if (!selectedSolicitacao) return

    aprovarMutation.mutate(
      {
        requestId: selectedSolicitacao.id,
        name: data.name,
        role: data.role,
        area: data.area,
        /* Não há campo de coordenador no formulário do original; o que já
           estava gravado é preservado em vez de virar nulo na reativação. */
        coordinatorId: collaboratorToApprove?.coordinator_id ?? null,
        weeklyHours: data.weekly_hours,
      },
      {
        onSuccess: () => {
          toast.success('Solicitação aprovada com sucesso!')
          setSelectedSolicitacao(null)
          setAction(null)
          setShowCollaboratorForm(false)
          setCollaboratorToApprove(null)
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : 'Erro ao aprovar solicitação',
          )
        },
      },
    )
  }

  const confirmAction = () => {
    if (action !== 'recusar' || !selectedSolicitacao) return

    recusarMutation.mutate(selectedSolicitacao.id, {
      onSuccess: () => {
        toast.success('Solicitação recusada')
        setSelectedSolicitacao(null)
        setAction(null)
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Erro ao recusar solicitação')
      },
    })
  }

  if (currentCollaborator && !isDirector) {
    return <AcessoNegado detalhe="Apenas o Diretor pode gerenciar aprovações." />
  }

  if (solicitacoesQuery.isLoading) {
    return (
      <div>
        <PageHeader
          title="Aprovações de Acesso"
          subtitle="Gerencie solicitações de acesso ao sistema"
        />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-2/3"></div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Aprovações de Acesso"
        subtitle="Gerencie solicitações de acesso ao sistema"
      />

      {solicitacoesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar a fila"
          description="As solicitações de acesso não puderam ser lidas agora. Só o Diretor do escritório enxerga esta fila."
          error={solicitacoesQuery.error}
          onRetry={() => {
            void solicitacoesQuery.refetch()
          }}
        />
      ) : solicitacoes.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Nenhuma solicitação pendente
          </h3>
          <p className="text-slate-500">Todas as solicitações foram processadas</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {solicitacoes.map((solicitacao) => (
            <Card key={solicitacao.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">{solicitacao.name}</h3>
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Pendente
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                    <Mail className="w-4 h-4" />
                    {solicitacao.email}
                  </div>
                  <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-lg p-2 mt-2">
                    ℹ️ Ao aprovar, será criado um colaborador ativo com permissões padrão (sem
                    acesso). Configure as permissões após aprovação.
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    onClick={() => handleAprovar(solicitacao)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRecusar(solicitacao)}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Recusar
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 mb-1">Data da solicitação</p>
                  <p className="font-medium text-slate-900">
                    {new Date(solicitacao.requested_at || solicitacao.created_at).toLocaleString(
                      'pt-BR',
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Última tentativa</p>
                  <p className="font-medium text-slate-900">
                    {new Date(solicitacao.last_attempt_at || solicitacao.created_at).toLocaleString(
                      'pt-BR',
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Tentativas</p>
                  <p className="font-medium text-slate-900">{solicitacao.attempts || 1}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Origem</p>
                  <p className="font-medium text-slate-900">{solicitacao.source || 'login'}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCollaboratorForm && (
        <CollaboratorForm
          open={showCollaboratorForm}
          onClose={fecharFormulario}
          onSubmit={handleCollaboratorSubmit}
          initialData={formInitialData}
          isLoading={aprovarMutation.isPending}
          variant="approval"
        />
      )}

      <AlertDialog
        open={action === 'recusar'}
        onOpenChange={() => {
          setAction(null)
          setSelectedSolicitacao(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar solicitação?</AlertDialogTitle>
            {/*
              O original promete aqui um e-mail de notificação ao solicitante.
              Não há provedor de e-mail (docs/ARCHITECTURE.md) e a edge function
              reject-access-request não envia nada — o texto diz só o que
              acontece de verdade, como já foi feito em AcessoPendente.tsx.
            */}
            <AlertDialogDescription>
              Você está prestes a recusar o acesso de {selectedSolicitacao?.name}. Ninguém é avisado
              por e-mail: se quiser dar retorno, precisa ser por outro canal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction} className="bg-rose-600 hover:bg-rose-700">
              {recusarMutation.isPending ? 'Processando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
