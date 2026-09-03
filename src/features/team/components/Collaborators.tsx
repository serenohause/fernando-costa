import { useMemo, useState } from 'react'
import { Clock, Lock, Mail, MoreVertical, Pencil, Trash2, UserCircle } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type Column } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import AvatarPicture from '@/features/profile/components/AvatarPicture'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
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
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { COLLABORATOR_AREA, COLLABORATOR_ROLE, COLLABORATOR_STATUS, labelOf } from '@/lib/enums'
import AcessoNegado from './AcessoNegado'
import CollaboratorForm, { type CollaboratorFormValues } from './CollaboratorForm'
import PermissoesManager from './PermissoesManager'
import {
  describeDatabaseError,
  useCollaborators,
  useCreateCollaborator,
  useDeleteCollaborator,
  useUpdateCollaborator,
} from '../hooks'
import type { Collaborator, CollaboratorInput } from '../types'

/*
  Porta de projeto-original/src/pages/Collaborators.jsx.

  O guarda do original é `user.role === 'admin' || collaborator.role === 'Diretor'`.
  O primeiro é o papel de plataforma do base44 e não tem equivalente aqui
  (migration 0012), então sobra o Diretor. A RLS é quem manda: mesmo que este
  guarda falhasse, escrever em `collaborators` sem ser Diretor é negado no banco.
*/
export default function Collaborators() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; collaborator: Collaborator | null }>({
    open: false,
    collaborator: null,
  })
  const [permissoesDialog, setPermissoesDialog] = useState<{
    open: boolean
    collaborator: Collaborator | null
  }>({ open: false, collaborator: null })

  const currentCollaboratorQuery = useCurrentCollaborator()
  const currentCollaborator = currentCollaboratorQuery.data ?? null
  const isDirector = currentCollaborator?.role === 'director'

  const collaboratorsQuery = useCollaborators()
  const collaborators = collaboratorsQuery.data ?? []

  /*
    Referência estável de propósito: CollaboratorForm reinicia o formulário
    quando `initialData` muda, como no original. Recriar o objeto a cada render
    apagaria o que está sendo digitado assim que qualquer query se atualizasse.
  */
  const formInitialData = useMemo(
    () => (editingCollaborator ? toFormValues(editingCollaborator) : null),
    [editingCollaborator],
  )

  const createMutation = useCreateCollaborator()
  const updateMutation = useUpdateCollaborator()
  const deleteMutation = useDeleteCollaborator()

  const handleSubmit = (data: CollaboratorInput) => {
    if (editingCollaborator) {
      updateMutation.mutate(
        { id: editingCollaborator.id, input: data },
        {
          onSuccess: () => {
            setFormOpen(false)
            setEditingCollaborator(null)
            toast.success('Colaborador atualizado com sucesso!')
          },
          onError: (error) => {
            toast.error('Erro ao atualizar: ' + describeDatabaseError(error))
          },
        },
      )
      return
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        setFormOpen(false)
        /*
          O original avisa aqui que um e-mail de boas-vindas foi enviado. Não há
          provedor de e-mail neste projeto (docs/ARCHITECTURE.md) e nada é
          enviado — mesmo critério já aplicado em AcessoPendente.tsx.
        */
        toast.success('Colaborador criado com sucesso!')
      },
      onError: (error) => {
        toast.error('Erro ao criar: ' + describeDatabaseError(error))
      },
    })
  }

  const handleEdit = (collaborator: Collaborator) => {
    if (!isDirector) {
      toast.error('Você não tem permissão para executar esta ação.')
      return
    }
    setEditingCollaborator(collaborator)
    setFormOpen(true)
  }

  const handleDelete = (collaborator: Collaborator) => {
    if (!isDirector) {
      toast.error('Você não tem permissão para executar esta ação.')
      return
    }
    setDeleteDialog({ open: true, collaborator })
  }

  const handleCreateClick = () => {
    if (!isDirector) {
      toast.error('Você não tem permissão para criar colaboradores.')
      return
    }
    setEditingCollaborator(null)
    setFormOpen(true)
  }

  const confirmDelete = () => {
    const alvo = deleteDialog.collaborator
    if (!alvo) return

    deleteMutation.mutate(alvo.id, {
      onSuccess: () => {
        setDeleteDialog({ open: false, collaborator: null })
        toast.success('Colaborador excluído com sucesso!')
      },
      onError: (error) => {
        toast.error('Erro ao excluir: ' + describeDatabaseError(error))
      },
    })
  }

  const columns: Column<Collaborator>[] = [
    {
      header: 'Colaborador',
      cell: (row) => (
        <div className="flex items-center gap-3">
          {/*
            A FOTO DE PERFIL DA PESSOA, quando ela tem uma (migration 0088). Sem
            foto continua a inicial no quadrado violeta, que é o visual desta
            tela desde o original — o que muda é ter foto, não a aparência.

            Quem pode ver: a policy do bucket libera leitura para qualquer
            colaborador ativo do escritório, e a foto já aparece ao lado do nome
            em outras telas.
          */}
          <AvatarPicture
            avatarPath={row.avatar_path}
            name={row.name}
            size={40}
            shapeClassName="rounded-xl bg-gradient-to-br from-violet-100 to-violet-200"
            initialClassName="text-violet-600"
          />
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            <p className="text-sm text-muted-foreground">{labelOf(COLLABORATOR_ROLE, row.role)}</p>
            {row.area && (
              <p className="text-xs text-faint">{labelOf(COLLABORATOR_AREA, row.area)}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'E-mail',
      cell: (row) =>
        row.email ? (
          <div className="flex items-center gap-2 text-sm text-soft">
            <Mail className="w-4 h-4 text-faint" />
            {row.email}
          </div>
        ) : (
          <span className="text-faint">-</span>
        ),
    },
    /*
      A coluna "Senha Temporária" do original não existe mais: o campo guardava
      senha em texto puro e está fora de escopo desde docs/ARCHITECTURE.md.
    */
    {
      header: 'Carga Horária',
      cell: (row) =>
        row.weekly_hours ? (
          <div className="flex items-center gap-2 text-sm text-soft">
            <Clock className="w-4 h-4 text-faint" />
            {row.weekly_hours}h/semana
          </div>
        ) : (
          <span className="text-faint">-</span>
        ),
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={labelOf(COLLABORATOR_STATUS, row.status)} />,
    },
    {
      header: '',
      cell: (row) =>
        isDirector ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(row)}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPermissoesDialog({ open: true, collaborator: row })}
              >
                <Lock className="w-4 h-4 mr-2" />
                Permissões
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(row)}
                className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          /*
            O original mostra aqui um botão desabilitado com cadeado, porque lá
            o Administrativo abre a tela e precisa entender por que não pode
            agir. Aqui a página inteira é bloqueada antes (ver AcessoNegado
            abaixo), então este ramo só existiria na janela entre a tabela
            montar e o colaborador atual carregar — e nessa janela ainda não há
            linha para renderizar célula.

            Fica vazio em vez de reproduzir o cadeado: um controle bloqueado
            visível anuncia uma ação que, neste sistema, quem chegou aqui já
            tem. Seria dizer "você não pode" para o Diretor.
          */
          null
        ),
    },
  ]

  // Bloquear acesso se não for Diretor
  if (currentCollaborator && !isDirector) {
    return <AcessoNegado detalhe="Apenas o Diretor pode gerenciar colaboradores." />
  }

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Gerencie sua equipe e permissões"
        actionLabel="Novo Membro"
        onAction={handleCreateClick}
      />

      {collaboratorsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar a equipe"
          description="A lista de colaboradores não pôde ser lida agora."
          error={collaboratorsQuery.error}
          onRetry={() => {
            void collaboratorsQuery.refetch()
          }}
        />
      ) : collaborators.length === 0 && !collaboratorsQuery.isLoading ? (
        <EmptyState
          icon={UserCircle}
          title="Nenhum colaborador cadastrado"
          description="Adicione os membros da equipe para atribuir tarefas e projetos."
          actionLabel={isDirector ? 'Adicionar Colaborador' : undefined}
          onAction={isDirector ? handleCreateClick : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={collaborators}
          isLoading={collaboratorsQuery.isLoading}
          emptyMessage="Nenhum colaborador encontrado"
        />
      )}

      <CollaboratorForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingCollaborator(null)
        }}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <Dialog
        open={permissoesDialog.open}
        onOpenChange={(open) => setPermissoesDialog({ ...permissoesDialog, open })}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissões de {permissoesDialog.collaborator?.name}</DialogTitle>
          </DialogHeader>
          {permissoesDialog.collaborator && (
            <PermissoesManager
              collaborator={permissoesDialog.collaborator}
              isDirector={isDirector}
              onClose={() => setPermissoesDialog({ open: false, collaborator: null })}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteDialog.collaborator?.name}? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
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

function toFormValues(collaborator: Collaborator): CollaboratorFormValues {
  return {
    name: collaborator.name,
    role: collaborator.role,
    area: collaborator.area ?? '',
    email: collaborator.email,
    status: collaborator.status,
    weekly_hours: collaborator.weekly_hours == null ? '' : String(collaborator.weekly_hours),
  }
}
