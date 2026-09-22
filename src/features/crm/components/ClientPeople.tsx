import { useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/shared/ErrorState'
import { useMenuPermissions } from '@/features/auth/hooks'
import { formatDateBR } from '@/lib/format'
import {
  describeDatabaseError,
  useClientPeople,
  useDeleteClientPerson,
  useSaveClientPerson,
  type ClientPersonInput,
} from '../hooks'
import { relationshipLabel } from '../people'
import type { ClientPerson } from '../types'
import ClientPersonDialog from './ClientPersonDialog'

/*
  TITULARES E CONTATOS do cliente (migration 0102).

  O cadastro tem um titular só, e o escritório precisa guardar o cônjuge — entre
  outros motivos porque é ele quem costuma preencher o formulário público, e
  esses dados são consultados depois. Aqui eles ficam, e a busca do CRM acha o
  cliente pelo nome ou CPF de qualquer pessoa desta lista.
*/
export default function ClientPeople({ clientId }: { clientId: string }) {
  const query = useClientPeople(clientId)
  const saveMutation = useSaveClientPerson()
  const deleteMutation = useDeleteClientPerson()
  const { canEdit } = useMenuPermissions('crm')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ClientPerson | null>(null)

  const people = query.data ?? []

  const handleSubmit = (input: ClientPersonInput) => {
    saveMutation.mutate(
      { id: editing?.id ?? null, clientId, input },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setEditing(null)
          toast.success(editing ? 'Pessoa atualizada' : 'Pessoa adicionada ao cadastro')
        },
        onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
      },
    )
  }

  const handleDelete = (person: ClientPerson) => {
    if (!window.confirm(`Remover ${person.name} do cadastro deste cliente?`)) return
    deleteMutation.mutate(person.id, {
      onSuccess: () => toast.success('Pessoa removida'),
      onError: (error) => toast.error('Erro ao remover: ' + describeDatabaseError(error)),
    })
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Titulares e contatos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Cônjuge, segundo titular, sócio ou representante. A busca do CRM encontra este cliente
            por estes nomes e CPFs.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar
          </Button>
        )}
      </div>

      {query.isError ? (
        <ErrorState
          title="Não foi possível carregar as pessoas do cadastro"
          description="A lista não pôde ser lida agora."
          error={query.error}
          onRetry={() => {
            void query.refetch()
          }}
        />
      ) : query.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-10 h-10 text-faint mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Ninguém além do titular neste cadastro.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{person.name}</p>
                  <Badge variant="outline" className="text-muted-foreground border-border">
                    {relationshipLabel(person.relationship)}
                  </Badge>
                  {person.is_contract_signer && (
                    <Badge variant="outline" className="text-muted-foreground border-border">
                      Assina o contrato
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-soft mt-0.5">
                  {[
                    person.tax_id,
                    person.birth_date ? formatDateBR(person.birth_date) : null,
                    person.phone,
                    person.email,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem dados além do nome'}
                </p>
                {person.notes && (
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                    {person.notes}
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${person.name}`}
                    onClick={() => {
                      setEditing(person)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${person.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(person)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ClientPersonDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        onSubmit={handleSubmit}
        isPending={saveMutation.isPending}
      />
    </Card>
  )
}
