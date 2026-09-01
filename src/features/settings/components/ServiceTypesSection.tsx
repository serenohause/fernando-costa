import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  describeDatabaseError,
  useCreateServiceType,
  useServiceTypes,
  useUpdateServiceType,
} from '../hooks'
import type { ServiceContractGroup, ServiceTypeRow } from '../types'
import ServiceTypeDialog, { type ServiceTypeFormValues } from './ServiceTypeDialog'

const GROUP_BADGE: Record<ServiceContractGroup, { label: string; className: string }> = {
  none: { label: 'Sem peso', className: 'bg-muted text-muted-foreground border-border' },
  interiors: {
    label: 'Interiores',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  },
  engineering: {
    label: 'Complementar',
    className: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  },
}

export default function ServiceTypesSection({ canEdit }: { canEdit: boolean }) {
  const serviceTypesQuery = useServiceTypes()
  const createMutation = useCreateServiceType()
  const updateMutation = useUpdateServiceType()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceTypeRow | null>(null)

  const types = serviceTypesQuery.data ?? []

  const handleSubmit = (values: ServiceTypeFormValues) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, label: values.label, contract_group: values.contract_group },
        {
          onSuccess: () => {
            setDialogOpen(false)
            setEditing(null)
            toast.success('Tipo de serviço atualizado')
          },
          onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
        },
      )
      return
    }

    createMutation.mutate(values, {
      onSuccess: () => {
        setDialogOpen(false)
        toast.success('Tipo de serviço adicionado')
      },
      onError: (error) => toast.error('Erro ao adicionar: ' + describeDatabaseError(error)),
    })
  }

  const handleToggleActive = (type: ServiceTypeRow) => {
    updateMutation.mutate(
      { id: type.id, is_active: !type.is_active },
      {
        onError: (error) => toast.error('Erro ao alterar: ' + describeDatabaseError(error)),
      },
    )
  }

  /*
    TROCAR DE LUGAR É TROCAR AS DUAS ORDENS, e não empurrar a lista inteira: são
    dois UPDATEs, um por linha. A ordem é o que decide a sequência dos checkboxes
    no formulário de negociação — o mesmo papel que a ordem do enum tinha.
  */
  const handleMove = (index: number, direction: -1 | 1) => {
    const current = types[index]
    const neighbour = types[index + direction]
    if (!current || !neighbour) return

    updateMutation.mutate(
      { id: current.id, display_order: neighbour.display_order },
      {
        onSuccess: () => {
          updateMutation.mutate(
            { id: neighbour.id, display_order: current.display_order },
            {
              onError: (error) => toast.error('Erro ao reordenar: ' + describeDatabaseError(error)),
            },
          )
        },
        onError: (error) => toast.error('Erro ao reordenar: ' + describeDatabaseError(error)),
      },
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tipos de Serviço</h2>
          <p className="text-sm text-muted-foreground mt-1">
            As opções que aparecem ao criar uma negociação no Pipeline.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Tipo
          </Button>
        )}
      </div>

      {/* Três estados explícitos, como em toda tela de listagem do sistema. */}
      {serviceTypesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os tipos de serviço"
          description="A lista de tipos de serviço não pôde ser lida agora."
          error={serviceTypesQuery.error}
          onRetry={() => {
            void serviceTypesQuery.refetch()
          }}
        />
      ) : serviceTypesQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Wrench className="w-12 h-12 text-faint mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum tipo de serviço cadastrado</p>
          <p className="text-faint text-sm mt-1">
            {canEdit
              ? 'Adicione o primeiro para o Pipeline ter o que oferecer'
              : 'Peça a um Diretor para cadastrar os tipos do escritório'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border divide-y divide-border">
          {types.map((type, index) => (
            <div key={type.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={
                      type.is_active
                        ? 'font-medium text-foreground'
                        : 'font-medium text-muted-foreground line-through'
                    }
                  >
                    {type.label}
                  </p>
                  <Badge variant="outline" className={GROUP_BADGE[type.contract_group].className}>
                    {GROUP_BADGE[type.contract_group].label}
                  </Badge>
                </div>
                <p className="text-xs text-faint mt-0.5 font-mono">{type.key}</p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir ${type.label}`}
                    disabled={index === 0 || updateMutation.isPending}
                    onClick={() => handleMove(index, -1)}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer ${type.label}`}
                    disabled={index === types.length - 1 || updateMutation.isPending}
                    onClick={() => handleMove(index, 1)}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${type.label}`}
                    onClick={() => {
                      setEditing(type)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/*
                DESATIVAR, E NÃO EXCLUIR: o tipo sai do formulário de negociações
                novas e continua aparecendo nas antigas que já o venderam. É por
                isso que não há botão de lixeira aqui.
              */}
              <div className="flex items-center gap-2 pl-2">
                <Switch
                  checked={type.is_active}
                  disabled={!canEdit || updateMutation.isPending}
                  aria-label={`${type.is_active ? 'Desativar' : 'Ativar'} ${type.label}`}
                  onCheckedChange={() => handleToggleActive(type)}
                />
                <span className="text-xs text-muted-foreground w-16">
                  {type.is_active ? 'Ativo' : 'Desativado'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ServiceTypeDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  )
}
