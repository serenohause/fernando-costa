import { Edit3, ExternalLink, MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EnrichedMapProperty } from '../types'

/*
  O conteúdo do balão do pino (MapaProjetos.jsx:1182-1274).

  Fica em arquivo próprio só por tamanho — é a mesma marcação, na mesma ordem: o
  nome, cliente, status, endereço limpo, "Local: cidade, estado", o bloco de
  loteamento e os quatro botões.

  DUAS COISAS QUE SÃO DO ORIGINAL E PARECEM ERRO:

  - "Local" é impresso como `{city}, {state}` sem conferir se algum dos dois
    existe (:1209). O pino sem cidade — que o seed inclui de propósito — mostra
    uma vírgula solta.
  - O bloco de loteamento só aparece com a tag "Loteamento fechado" (:1213),
    mesmo que nome, quadra e lote estejam preenchidos.

  OS TRÊS BOTÕES DE ESCRITA SOMEM SEM PERMISSÃO DE EDIÇÃO no menu `map`. O
  original não tem essa conferência em lugar nenhum desta tela; o banco tem
  (migration 0058). Ver o cabeçalho de MapaProjetos.tsx.
*/
export default function PropertyPopup({
  property,
  canEdit,
  onViewSummary,
  onEditInfo,
  onEditPin,
  onRemove,
}: {
  property: EnrichedMapProperty
  canEdit: boolean
  onViewSummary: (property: EnrichedMapProperty) => void
  onEditInfo: (property: EnrichedMapProperty) => void
  onEditPin: (property: EnrichedMapProperty) => void
  onRemove: (property: EnrichedMapProperty) => void
}) {
  return (
    <div className="p-3 min-w-[300px]">
      <div className="mb-3">
        <h3 className="font-semibold text-foreground text-base mb-2">{property.displayName}</h3>

        {property.clientName && (
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xs text-muted-foreground min-w-[60px]">Cliente:</span>
            <span className="text-sm text-soft">{property.clientName}</span>
          </div>
        )}

        <div className="flex items-start gap-2 mb-2">
          <span className="text-xs text-muted-foreground min-w-[60px]">Status:</span>
          <span className="text-sm text-soft">{property.statusLabel}</span>
        </div>

        {property.cleanAddress && (
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xs text-muted-foreground min-w-[60px]">Endereço:</span>
            <span className="text-sm text-soft whitespace-pre-line">{property.cleanAddress}</span>
          </div>
        )}

        <div className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground min-w-[60px]">Local:</span>
          <span className="text-sm text-soft">
            {property.city}, {property.state}
          </span>
        </div>

        {property.land_types.some((tag) => tag.land_type === 'Loteamento fechado') && (
          <>
            {property.subdivision_name && (
              <div className="flex items-start gap-2 mt-2">
                <span className="text-xs text-muted-foreground min-w-[60px]">Loteamento:</span>
                <span className="text-sm text-soft">{property.subdivision_name}</span>
              </div>
            )}
            {(property.subdivision_block || property.subdivision_lot) && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground min-w-[60px]">Quadra/Lote:</span>
                <span className="text-sm text-soft">
                  {property.subdivision_block && `Quadra ${property.subdivision_block}`}
                  {property.subdivision_block && property.subdivision_lot && ' • '}
                  {property.subdivision_lot && `Lote ${property.subdivision_lot}`}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-2 border-t border-border">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs h-8"
          onClick={() => onViewSummary(property)}
        >
          <ExternalLink className="w-3 h-3 mr-2" />
          Ver Detalhes Completos
        </Button>
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-8"
              onClick={() => onEditInfo(property)}
            >
              <Edit3 className="w-3 h-3 mr-2" />
              Editar Informações
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-8"
              onClick={() => onEditPin(property)}
            >
              <MapPin className="w-3 h-3 mr-2" />
              Ajustar Localização
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-8 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => onRemove(property)}
            >
              <X className="w-3 h-3 mr-2" />
              Remover do Mapa
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
