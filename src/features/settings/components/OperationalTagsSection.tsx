import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import {
  describeDatabaseError,
  useCreateOperationalTag,
  useDeleteOperationalTag,
  useOperationalTags,
  useUpdateOperationalTag,
} from '@/features/kanban/hooks'
import { tagStyleOf, type OperationalTagRow } from '@/features/kanban/types'
import OperationalTagDialog, { type OperationalTagFormValues } from './OperationalTagDialog'

/*
  OS STATUS OPERACIONAIS DO ESCRITÓRIO (migration 0097).

  Eram dois valores de enum, com rótulo e cor cravados no código: "Em Revisão" e
  "Aguardando Cliente". Viraram cadastro porque o escritório pediu para escolher
  nome e cor de cada um.

  O QUE O STATUS FAZ, e é o que justifica ele ser um conceito e não um rótulo
  qualquer: marcado num cartão, ele PAUSA O PRAZO — a data de vencimento e a
  borda de atraso somem enquanto ele estiver lá. É o desenho da versão nova do
  base44, e vale para qualquer status criado aqui.

  DESATIVAR E EXCLUIR SÃO GESTOS DIFERENTES. Desativar tira o status das ofertas
  novas e preserva o que já está marcado; excluir é definitivo, e o banco recusa
  enquanto houver tarefa marcada com ele (`tasks_operational_tag_fkey`).
*/
export default function OperationalTagsSection({ canEdit }: { canEdit: boolean }) {
  const tagsQuery = useOperationalTags()
  const createTag = useCreateOperationalTag()
  const updateTag = useUpdateOperationalTag()
  const deleteTag = useDeleteOperationalTag()
  const { data: collaborator } = useCurrentCollaborator()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OperationalTagRow | null>(null)

  const tags = tagsQuery.data ?? []

  const handleSubmit = (values: OperationalTagFormValues) => {
    if (editing) {
      updateTag.mutate(
        { id: editing.id, label: values.label, color: values.color },
        {
          onSuccess: () => {
            setDialogOpen(false)
            setEditing(null)
            toast.success('Status atualizado')
          },
          onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    if (!collaborator?.tenant_id) {
      toast.error('Escritório não identificado na sua sessão.')
      return
    }

    createTag.mutate(
      {
        tenantId: collaborator.tenant_id,
        label: values.label,
        color: values.color,
        lastOrder: tags.reduce((maior, tag) => Math.max(maior, tag.display_order), 0),
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          toast.success('Status criado')
        },
        onError: (error) => toast.error('Erro ao criar: ' + describeDatabaseError(error)),
      },
    )
  }

  /* A ordem decide a sequência do submenu do cartão. Troca as duas posições, como
     em Tipos de Serviço. */
  const handleMove = (index: number, direction: -1 | 1) => {
    const atual = tags[index]
    const vizinho = tags[index + direction]
    if (!atual || !vizinho) return

    updateTag.mutate(
      { id: atual.id, display_order: vizinho.display_order },
      {
        onSuccess: () =>
          updateTag.mutate(
            { id: vizinho.id, display_order: atual.display_order },
            {
              onError: (error) =>
                toast.error('Erro ao reordenar: ' + describeDatabaseError(error)),
            },
          ),
        onError: (error) => toast.error('Erro ao reordenar: ' + describeDatabaseError(error)),
      },
    )
  }

  const handleDelete = (tag: OperationalTagRow) => {
    const confirmado = window.confirm(
      `Excluir o status “${tag.label}”? Ele sai do menu de todos os cartões e não volta.\n\n` +
        'Se houver tarefa marcada com ele, o sistema recusa — nesse caso, tire a marca das tarefas primeiro ou apenas desative o status.',
    )
    if (!confirmado) return

    deleteTag.mutate(tag.id, {
      onSuccess: () => toast.success('Status excluído'),
      onError: (error) => toast.error('Erro ao excluir: ' + describeDatabaseError(error)),
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Status Operacional</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Os crachás que o cartão do Fluxo do Projeto pode receber. Enquanto marcado, o status
            pausa o prazo da tarefa.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Status
          </Button>
        )}
      </div>

      {tagsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os status"
          description="A lista de status operacionais não pôde ser lida agora."
          error={tagsQuery.error}
          onRetry={() => {
            void tagsQuery.refetch()
          }}
        />
      ) : tagsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((index) => (
            <div key={index} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Tag className="w-12 h-12 text-faint mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum status cadastrado</p>
          <p className="text-faint text-sm mt-1">
            {canEdit
              ? 'Sem status, o cartão do quadro não mostra o submenu.'
              : 'Peça a um Diretor para cadastrar os status do escritório'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border divide-y divide-border">
          {tags.map((tag, index) => (
            <div key={tag.id} className="flex items-center gap-3 px-4 py-3">
              {/* O crachá como ele aparece no cartão — não uma amostra de cor. */}
              <Badge
                variant="outline"
                className={`${tagStyleOf(tag.color).badge} text-xs font-medium`}
              >
                {tag.label}
              </Badge>

              <div className="flex-1 min-w-0">
                {!tag.is_active && (
                  <span className="text-xs text-muted-foreground">Desativado</span>
                )}
              </div>

              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir ${tag.label}`}
                    disabled={index === 0 || updateTag.isPending}
                    onClick={() => handleMove(index, -1)}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer ${tag.label}`}
                    disabled={index === tags.length - 1 || updateTag.isPending}
                    onClick={() => handleMove(index, 1)}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${tag.label}`}
                    onClick={() => {
                      setEditing(tag)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Excluir ${tag.label}`}
                    onClick={() => handleDelete(tag)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/*
                DESATIVAR, e não só excluir: o status sai das ofertas novas e
                continua legível nas tarefas que já o carregam. É o mesmo gesto
                dos tipos de serviço, e pelo mesmo motivo.
              */}
              <div className="flex items-center gap-2 pl-2">
                <Switch
                  checked={tag.is_active}
                  disabled={!canEdit || updateTag.isPending}
                  aria-label={`${tag.is_active ? 'Desativar' : 'Ativar'} ${tag.label}`}
                  onCheckedChange={() =>
                    updateTag.mutate(
                      { id: tag.id, is_active: !tag.is_active },
                      {
                        onError: (error) =>
                          toast.error('Erro ao alterar: ' + describeDatabaseError(error)),
                      },
                    )
                  }
                />
                <span className="text-xs text-muted-foreground w-20">
                  {tag.is_active ? 'Em uso' : 'Desativado'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-faint mt-3">
        Em quais etapas cada status aparece é decidido em Configurações → Quadros, ao editar a
        etapa.
      </p>

      <OperationalTagDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        onSubmit={handleSubmit}
        isPending={createTag.isPending || updateTag.isPending}
      />
    </div>
  )
}
