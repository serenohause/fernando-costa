import { useState, type ReactNode } from 'react'
import { Edit3, MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import ClientLink from '@/features/crm/components/ClientLink'
import PropertyPhotos from './PropertyPhotos'
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

  O RODAPÉ É A DIVERGÊNCIA DELIBERADA. No original ele tem só o botão Fechar, e
  as três ações de escrita ficam no balão do pino (MapaProjetos.jsx:1240-1270).
  O escritório pediu a troca: o balão ficou com um botão só, e editar, ajustar
  localização e remover passaram para cá. O motivo é espaço — o balão abre sobre
  o mapa, tem largura de cartão e agora começa com o carrossel de fotos.

  AS TRÊS SOMEM SEM PERMISSÃO DE EDIÇÃO no menu `map`, exatamente como sumiam no
  balão. A autoridade continua sendo do banco (migration 0058): esconder botão é
  cortesia, policy é tranca.

  AS FOTOS OCUPAM A COLUNA DA ESQUERDA, e é por isso que o diálogo é largo
  (`max-w-5xl`, e não o `max-w-lg` do original). No balão a foto é miniatura de
  cartão; aqui ela é o conteúdo. A coluna usa a variante `coluna` do MESMO
  componente do balão, com a mesma chave de React Query: abrir o resumo logo
  depois de ver a foto no pino não paga assinatura nova.

  No celular as duas colunas viram duas linhas, foto em cima.

  ⚠ ENQUANTO A FOTO ESTÁ EM TELA CHEIA, ESTE DIÁLOGO FINGE NÃO ESTAR AQUI. O
  lightbox é montado em `document.body`, irmão deste diálogo e não filho, porque
  ele também serve o balão do pino, que vive dentro do mapa do Google. Para o
  Radix, portanto, tudo que acontece lá é "fora": Esc fecharia os dois de uma
  vez, e um clique no fundo preto do lightbox fecharia o resumo por baixo dele.
  `onEscapeKeyDown` e `onInteractOutside` ficam barrados enquanto `fotoAmpliada`
  é verdadeiro — não dá para resolver do lado do lightbox, porque o ouvinte de
  Esc do Radix é de CAPTURA e foi registrado primeiro.
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
  canEdit,
  onEditInfo,
  onEditPin,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  property: EnrichedMapProperty | null
  canEdit: boolean
  onEditInfo: (property: EnrichedMapProperty) => void
  onEditPin: (property: EnrichedMapProperty) => void
  onRemove: (property: EnrichedMapProperty) => void
}) {
  const [fotoAmpliada, setFotoAmpliada] = useState(false)

  if (!property) return null

  /* `linkedProject` é o mesmo do enriquecimento: projeto invisível não conta
     como vínculo (list.ts). O original passa a prop separada, calculada do mesmo
     jeito (MapaProjetos.jsx:1317). */
  const linkedProject = property.linkedProject
  const landTypes = property.land_types.map((tag) => tag.land_type)
  const purposes = property.purposes.map((tag) => tag.purpose)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* `md:h-[80vh]` e não só `max-h`: a coluna da foto precisa de altura para
          existir, e altura de diálogo que segue o conteúdo encolhe junto com um
          pino que tem três linhas de informação. */}
      <DialogContent
        className="max-w-5xl max-h-[92vh] md:h-[85vh] p-0 flex flex-col"
        onEscapeKeyDown={(event) => {
          if (fotoAmpliada) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (fotoAmpliada) event.preventDefault()
        }}
      >
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-soft" />
            {property.displayName || 'Propriedade'}
          </DialogTitle>
        </DialogHeader>

        {/*
          NO CELULAR SÃO DUAS LINHAS COM ALTURA DECLARADA, e isso não é detalhe:
          com as duas linhas livres, a foto esticava e empurrava as informações
          para fora do diálogo, que ficava sem jeito de rolar até elas. A linha
          da foto tem 16rem, e o que sobra é da informação, que rola.
        */}
        <div className="flex-1 min-h-0 grid grid-rows-[16rem_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[1.4fr_1fr]">
          {/* Coluna das fotos */}
          <div className="border-b border-border bg-elevated p-4 md:border-r md:border-b-0 md:p-5">
            <PropertyPhotos
              property={property}
              canEdit={canEdit}
              variante="coluna"
              onFotoAmpliada={setFotoAmpliada}
            />
          </div>

          {/* Informações, com scroll próprio */}
          <div className="overflow-y-auto px-6 py-4">
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
              <InfoRow
                label="Nome"
                value={<ClientLink clientId={property.client_id} name={property.clientName} />}
              />
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
        </div>

        {/* Footer sticky */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 bg-card space-y-2">
          {canEdit && (
            <>
              {/* As três numa linha só no desktop: cada linha de rodapé é altura
                  tirada da foto, que é o que a pessoa veio ver. No celular elas
                  empilham, porque o rótulo não cabe em um terço de 390px.
                  "Remover do Mapa" fica vermelha e separada de "Fechar" por uma
                  linha: é a única daqui que não tem volta. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button variant="outline" onClick={() => onEditInfo(property)} className="w-full">
                  <Edit3 className="w-4 h-4 mr-2" />
                  Editar Informações
                </Button>
                <Button variant="outline" onClick={() => onEditPin(property)} className="w-full">
                  <MapPin className="w-4 h-4 mr-2" />
                  Ajustar Localização
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onRemove(property)}
                  className="w-full text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <X className="w-4 h-4 mr-2" />
                  Remover do Mapa
                </Button>
              </div>
            </>
          )}
          <Button variant="outline" onClick={onClose} className="w-full">
            <X className="w-4 h-4 mr-2" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
