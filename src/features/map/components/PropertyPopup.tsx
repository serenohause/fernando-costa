import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ClientLink from '@/features/crm/components/ClientLink'
import PropertyPhotos from './PropertyPhotos'
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

  OS TRÊS BOTÕES DE ESCRITA SAÍRAM DAQUI, e foram para o "Ver Detalhes
  Completos" (PropertySummaryModal). O original os tem no balão (:1240-1270), e
  esta é uma divergência PEDIDA pelo escritório, não um deslize: o balão abre
  sobre o mapa, tem a largura de um cartão e agora começa com o carrossel de
  fotos, então empilhar quatro botões ali empurrava o conteúdo para fora da
  tela. Com um botão só, o balão responde "o que é este pino" e o resumo responde
  "o que eu faço com ele".

  A CONFERÊNCIA DE PERMISSÃO NÃO SUMIU, mudou de lugar: `canEdit` continua
  chegando aqui porque o carrossel de fotos o usa, e as três ações de escrita
  passam por ele dentro do resumo. O banco cobra do mesmo jeito (migration
  0058), em qualquer dos dois caminhos.

  O QUE NÃO VEM DO ORIGINAL: o carrossel de fotos no topo. É feature nova
  (migration 0130), pedida pelo escritório, e por isso não tem linha de
  MapaProjetos.jsx para comparar. Ele fica ACIMA do nome de propósito: quem abre
  o balão de um terreno está procurando o lugar, e a foto responde isso antes de
  qualquer texto. Sem foto e sem permissão de edição ele não ocupa espaço nenhum
  — ver PropertyPhotos.tsx.
*/
export default function PropertyPopup({
  property,
  canEdit,
  onViewSummary,
}: {
  property: EnrichedMapProperty
  canEdit: boolean
  onViewSummary: (property: EnrichedMapProperty) => void
}) {
  return (
    <div className="p-3 min-w-[300px]">
      <PropertyPhotos property={property} canEdit={canEdit} />

      <div className="mb-3">
        <h3 className="font-semibold text-foreground text-base mb-2">{property.displayName}</h3>

        {property.clientName && (
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xs text-muted-foreground min-w-[60px]">Cliente:</span>
            <ClientLink
              clientId={property.client_id}
              name={property.clientName}
              className="text-sm text-soft"
            />
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
      </div>
    </div>
  )
}
