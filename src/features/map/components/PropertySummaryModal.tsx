import type { ReactNode } from 'react'
import { MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PROJECT_TYPE, labelOf } from '@/lib/enums'
import type { EnrichedMapProperty } from '../types'

/*
  Porta de projeto-original/src/components/maps/PropertySummaryModal.jsx —
  "Ver Detalhes Completos" no popup do pino.

  As seções, a ordem delas, a regra de cada uma aparecer ou não, os rótulos e o
  rodapé fixo com o botão Fechar são os do original.

  O ENDEREÇO AQUI É O GRAVADO, cru, e não o `cleanAddress` que o popup do mapa
  mostra — é o que o original faz (`property.address`, :59). Os dois textos podem
  divergir num pino antigo, e é assim lá também.
*/

function InfoRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: ReactNode
  multiline?: boolean
}) {
  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <span className="text-xs text-muted-foreground font-medium block mb-1">{label}</span>
      <span className={`text-sm text-foreground block ${multiline ? 'whitespace-pre-line' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold text-soft uppercase tracking-wide mb-3">{title}</h4>
      <div className="bg-card rounded-lg border border-border divide-y divide-border px-4">
        {children}
      </div>
    </div>
  )
}

export default function PropertySummaryModal({
  open,
  onClose,
  property,
}: {
  open: boolean
  onClose: () => void
  property: EnrichedMapProperty | null
}) {
  if (!property) return null

  /* `linkedProject` é o mesmo do enriquecimento: projeto invisível não conta
     como vínculo (list.ts). O original passa a prop separada, calculada do mesmo
     jeito (MapaProjetos.jsx:1317). */
  const linkedProject = property.linkedProject
  const landTypes = property.land_types.map((tag) => tag.land_type)
  const purposes = property.purposes.map((tag) => tag.purpose)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-soft" />
            {property.displayName || 'Propriedade'}
          </DialogTitle>
        </DialogHeader>

        {/* Conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Projeto */}
          <InfoSection title="Projeto">
            <InfoRow label="Nome" value={property.displayName || '—'} />
            <InfoRow
              label="Status"
              value={<Badge className="bg-muted text-foreground">{property.statusLabel}</Badge>}
            />
            {linkedProject && (
              <InfoRow label="Tipo" value={labelOf(PROJECT_TYPE, linkedProject.project_type)} />
            )}
          </InfoSection>

          {/* Cliente */}
          {property.clientName && (
            <InfoSection title="Cliente">
              <InfoRow label="Nome" value={property.clientName} />
            </InfoSection>
          )}

          {/* Localização */}
          <InfoSection title="Localização">
            {property.address && (
              <InfoRow label="Endereço" value={property.address} multiline={true} />
            )}
            {property.lat && property.lng && (
              <InfoRow
                label="Coordenadas"
                value={`${property.lat.toFixed(6)}, ${property.lng.toFixed(6)}`}
              />
            )}
          </InfoSection>

          {/* Terreno */}
          {(landTypes.length > 0 || property.land_area_m2) && (
            <InfoSection title="Terreno">
              {landTypes.length > 0 && (
                <div className="py-3 border-b border-border">
                  <span className="text-xs text-muted-foreground font-medium block mb-2">Tipo</span>
                  <div className="flex flex-wrap gap-1.5">
                    {property.land_types.map((tag) => (
                      <Badge key={tag.id} variant="outline" className="text-xs">
                        {tag.land_type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {property.land_area_m2 && (
                <InfoRow
                  label="Área"
                  value={`${property.land_area_m2.toLocaleString('pt-BR')} m²`}
                />
              )}
            </InfoSection>
          )}

          {/* Finalidade */}
          {purposes.length > 0 && (
            <InfoSection title="Finalidade">
              <div className="py-3">
                <div className="flex flex-wrap gap-1.5">
                  {property.purposes.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className="bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 text-xs border-blue-200 dark:border-blue-900"
                    >
                      {tag.purpose}
                    </Badge>
                  ))}
                </div>
              </div>
            </InfoSection>
          )}

          {/* Loteamento */}
          {landTypes.includes('Loteamento fechado') && (
            <InfoSection title="Loteamento">
              {property.subdivision_name && (
                <InfoRow label="Nome" value={property.subdivision_name} />
              )}
              {property.subdivision_block && (
                <InfoRow label="Quadra" value={property.subdivision_block} />
              )}
              {property.subdivision_lot && (
                <InfoRow label="Lote" value={property.subdivision_lot} />
              )}
            </InfoSection>
          )}

          {/* Projeto (área) */}
          {property.project_area_m2 && (
            <InfoSection title="Projeto">
              <InfoRow
                label="Área"
                value={`${property.project_area_m2.toLocaleString('pt-BR')} m²`}
              />
            </InfoSection>
          )}
        </div>

        {/* Footer sticky */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 bg-card">
          <Button variant="outline" onClick={onClose} className="w-full">
            <X className="w-4 h-4 mr-2" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
