import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Calendar, FileText, Mail, MapPin, Pencil, Phone } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import LoadingPage from '@/components/shared/LoadingPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMenuPermissions } from '@/features/auth/hooks'
import { CLIENT_TYPE, LEAD_SOURCE, labelOf } from '@/lib/enums'
import { formatDateBR } from '@/lib/format'
import { createPageUrl } from '@/lib/page-url'
import ClientForm, { toFormValues } from './ClientForm'
import { DuplicateClientError, describeDatabaseError, useClient, useUpdateClient } from '../hooks'
import type { Client, ClientInput } from '../types'

/*
  Porta de projeto-original/src/pages/ClientDetail.jsx. Mesma leitura por
  `?id=`, mesmos blocos, mesma ordem, mesmos rótulos.

  O QUE NÃO VEIO, e por quê:

  - O painel de histórico (`<ClientHistory clientId={clientId} />`, última linha
    do original) lista `Project` e `AccountReceivable` do cliente e calcula
    faturamento, ticket médio e status do relacionamento. As duas tabelas entram
    nos MÓDULOS 5 e 7. Um painel com zeros seria pior que a ausência dele: diria
    "este cliente não fatura nada", que não é verdade — é só dado que ainda não
    existe no sistema.

  O QUE FOI ACRESCENTADO: estado de erro de leitura. O original só distingue
  "carregando" de "não encontrado", então falha de rede ou recusa da RLS aparece
  como "Cliente não encontrado" — que manda a pessoa procurar um cadastro que
  está lá. Mesma decisão já registrada em src/components/shared/ErrorState.tsx.
*/
export default function ClientDetail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const clientId = searchParams.get('id') ?? undefined
  const [formOpen, setFormOpen] = useState(false)
  const [duplicate, setDuplicate] = useState<DuplicateClientError | null>(null)

  const { canEdit } = useMenuPermissions('crm')
  const clientQuery = useClient(clientId)
  const client = clientQuery.data ?? null
  const updateMutation = useUpdateClient()

  const formInitialData = useMemo(() => (client ? toFormValues(client) : null), [client])

  const closeForm = () => {
    setFormOpen(false)
    setDuplicate(null)
  }

  const handleSubmit = (data: ClientInput) => {
    if (!clientId) return
    setDuplicate(null)

    updateMutation.mutate(
      { id: clientId, input: data },
      {
        onSuccess: () => {
          closeForm()
          toast.success('Cliente atualizado com sucesso!')
        },
        onError: (error) => {
          if (error instanceof DuplicateClientError) setDuplicate(error)
          toast.error('Erro ao atualizar: ' + describeDatabaseError(error))
        },
      },
    )
  }

  const openClient = (other: Client) => {
    navigate(createPageUrl('ClientDetail') + `?id=${other.id}`)
  }

  const backToList = () => {
    navigate(createPageUrl('Clients'))
  }

  if (clientQuery.isLoading) {
    return <LoadingPage />
  }

  if (clientQuery.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o cliente"
        description="O cadastro existe, mas não pôde ser lido agora."
        error={clientQuery.error}
        onRetry={() => {
          void clientQuery.refetch()
        }}
      />
    )
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-soft mb-4">Cliente não encontrado</p>
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para CRM
        </Button>
      </div>
    )
  }

  /* Mesma composição do original: logradouro e número juntos quando os dois
     existem, e o resto na ordem bairro, cidade, estado, CEP, país. */
  const location = [
    client.address_street && client.address_number
      ? `${client.address_street}, ${client.address_number}`
      : client.address_street,
    client.address_district,
    client.address_city,
    client.address_state,
    client.address_zipcode,
    client.address_country,
  ]
    .filter(Boolean)
    .join(', ')

  const siteLocation = [
    client.site_street && client.site_number
      ? `${client.site_street}, ${client.site_number}`
      : client.site_street,
    client.site_district,
    client.site_city,
    client.site_state,
    client.site_zipcode,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={backToList}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
            <p className="text-sm text-soft">Detalhes do Cliente</p>
          </div>
        </div>
        {/* O original mostra o botão para todo mundo, porque lá a autorização de
            escrita nunca existiu no banco. Aqui ele segue o mesmo `canEdit` que
            governa a listagem — prometer "Editar Cliente" a quem o banco recusa
            é o pior dos dois mundos. */}
        {canEdit && (
          <Button
            onClick={() => {
              setDuplicate(null)
              setFormOpen(true)
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Pencil className="w-4 h-4 mr-2" />
            Editar Cliente
          </Button>
        )}
      </div>

      {/* Dados principais */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Tipo */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Tipo</p>
            <Badge variant="outline" className="bg-elevated">
              {labelOf(CLIENT_TYPE, client.client_type)}
            </Badge>
          </div>

          {/* Email */}
          {client.email && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">E-mail</p>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-faint" />
                <span className="text-sm text-foreground">{client.email}</span>
              </div>
            </div>
          )}

          {/* Telefone */}
          {client.phone && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Telefone</p>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-faint" />
                <span className="text-sm text-foreground">{client.phone}</span>
              </div>
            </div>
          )}

          {/* CPF/CNPJ */}
          {client.tax_id && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">CPF/CNPJ</p>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-faint" />
                <span className="text-sm text-foreground">{client.tax_id}</span>
              </div>
            </div>
          )}

          {/* Data de Nascimento */}
          {client.birth_date && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Data de Nascimento</p>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-faint" />
                <span className="text-sm text-foreground">{formatDateBR(client.birth_date)}</span>
              </div>
            </div>
          )}

          {/* Origem */}
          {client.lead_source && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Origem do Lead</p>
              <Badge
                variant="outline"
                className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
              >
                {labelOf(LEAD_SOURCE, client.lead_source)}
              </Badge>
            </div>
          )}

          {/* Localização */}
          {(client.address_city || client.address_state || client.address_country) && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Localização</p>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-faint" />
                <span className="text-sm text-foreground">{location}</span>
              </div>
            </div>
          )}

          {/* Endereço da Obra */}
          {(client.site_city || client.site_state) && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Endereço da Obra</p>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-faint" />
                <span className="text-sm text-foreground">{siteLocation}</span>
              </div>
            </div>
          )}

          {/* Observações */}
          {client.notes && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm text-soft whitespace-pre-line">{client.notes}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Histórico do Cliente: MÓDULOS 5 (projects) e 7 (accounts_receivable). */}

      {/* Modal de Edição */}
      <ClientForm
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialData={formInitialData}
        isLoading={updateMutation.isPending}
        duplicate={duplicate}
        onOpenDuplicate={(other) => {
          closeForm()
          openClient(other)
        }}
      />
    </div>
  )
}
