import { FileText, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/shared/ErrorState'
import { formatDateBR } from '@/lib/format'
import { useClientSiteAddresses } from '../hooks'

/*
  ENDEREÇOS DE OBRA — uma linha por projeto do cliente (migration 0101).

  Pedido do escritório: "um único CRM ter um histórico com os endereços de obra
  do cliente". O cadastro continua com o seu "Endereço da Obra" único; esta lista
  é a que conta a verdade para quem tem mais de um projeto, lida dos contratos e
  dos briefings (ver `useClientSiteAddresses`).
*/
export default function ClientSiteAddresses({ clientId }: { clientId: string }) {
  const query = useClientSiteAddresses(clientId)

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">Endereços de obra</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Uma obra por projeto: do contrato, ou do briefing enquanto não há contrato.
      </p>

      {query.isError ? (
        <ErrorState
          title="Não foi possível carregar os endereços de obra"
          description="Os contratos e briefings deste cliente não puderam ser lidos agora."
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
      ) : (query.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum endereço de obra nos contratos e briefings deste cliente.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {(query.data ?? []).map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <MapPin className="w-4 h-4 text-faint mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-sm text-soft">{item.address}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {item.detail} · {formatDateBR(item.date.slice(0, 10))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
