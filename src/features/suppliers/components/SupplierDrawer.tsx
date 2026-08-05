import type { ReactNode } from 'react'
import { Pencil, Phone, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import {
  COMMISSION_PAYMENT_TERM,
  PARTNERSHIP_MODEL,
  PARTNERSHIP_TIER,
  SUPPLIER_CATEGORY,
  SUPPLIER_STATUS,
  labelOf,
} from '@/lib/enums'
import { useSupplierCommissionTotals } from '../hooks'
import type { SupplierRow } from '../types'
import { TIER_BADGE } from './supplier-styles'

/*
  Porta de projeto-original/src/components/fornecedores/FornecedorDrawer.jsx.

  O cabeçalho com nome, tipologia e crachá de nível, o bloco de marcas, as quatro
  seções em caixa (Contato Comercial, Parceria Comercial, Logística, Métricas), o
  bloco de observações e a barra de ações no rodapé são os do original, na mesma
  ordem e com o mesmo microcopy. Linha sem valor continua sumindo (`InfoRow`).

  DUAS COISAS MUDAM:

  1. "Total Comissão Recebida" vem da view `supplier_commission_totals`
     (`useSupplierCommissionTotals`), e não de `Fornecedor.total_comissao_recebida`
     — campo que a entidade do original declara e que tela nenhuma preenche, ou
     seja, a linha nunca aparecia. Agora ela aparece para quem já foi escolhido em
     item de orçamento.
  2. Os botões de escrita (Editar, Inativar/Reativar, Excluir) seguem `canEdit`,
     que reproduz a regra do BANCO (`can_edit_menu('suppliers')`, migration 0050).
     O original assume permissão quando ela falta — ver o comentário em
     Suppliers.tsx.
*/

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (!value && value !== 0) return null

  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">{title}</h3>
      <div className="bg-elevated rounded-xl p-3">{children}</div>
    </div>
  )
}

export default function SupplierDrawer({
  open,
  onClose,
  supplier,
  onEdit,
  onToggleStatus,
  onDelete,
  canEdit,
}: {
  open: boolean
  onClose: () => void
  supplier: SupplierRow | null
  onEdit: (supplier: SupplierRow) => void
  onToggleStatus: (supplier: SupplierRow) => void
  onDelete: (supplier: SupplierRow) => void
  canEdit: boolean
}) {
  const commissionTotalsQuery = useSupplierCommissionTotals()

  if (!supplier) return null

  const commissionReceived = commissionTotalsQuery.data?.get(supplier.id)?.commission_received_total

  const whatsappUrl = supplier.contact_whatsapp
    ? `https://wa.me/55${supplier.contact_whatsapp.replace(/\D/g, '')}`
    : null

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <SheetTitle className="text-xl font-semibold text-foreground">
                {supplier.name}
              </SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {labelOf(SUPPLIER_CATEGORY, supplier.category)}
              </p>
              {/* No original o crachá some quando `nivel_parceria` falta; aqui a
                  coluna é NOT NULL, então ele está sempre presente. */}
              <Badge variant="outline" className={`mt-2 ${TIER_BADGE[supplier.partnership_tier]}`}>
                <Star className="w-3 h-3 mr-1" />
                {labelOf(PARTNERSHIP_TIER, supplier.partnership_tier)}
              </Badge>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(supplier)}>
                <Pencil className="w-4 h-4 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Marcas */}
        {supplier.brands.length > 0 && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
              Marcas Representadas
            </h3>
            <div className="flex flex-wrap gap-2">
              {supplier.brands.map((brand) => (
                <Badge key={brand.id} variant="secondary" className="text-xs">
                  {brand.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Contato */}
        <Section title="Contato Comercial">
          <InfoRow label="Contato" value={supplier.contact_name} />
          <InfoRow label="WhatsApp" value={supplier.contact_whatsapp} />
          <InfoRow label="E-mail" value={supplier.contact_email} />
          <InfoRow label="Telefone" value={supplier.phone} />
          <InfoRow label="Site/Instagram" value={supplier.website} />
        </Section>

        {/* Parceria Comercial */}
        <Section title="Parceria Comercial">
          <InfoRow
            label="Modelo de Parceria"
            value={
              supplier.partnership_model
                ? labelOf(PARTNERSHIP_MODEL, supplier.partnership_model)
                : null
            }
          />
          {/*
            ZERO NÃO É "SEM VALOR", mesma correção da tabela: o original testa o
            número (`percentual_comissao ?`), e `0` é falsy, então a linha some do
            drawer como se o percentual não existisse. Comissão de 0% é acordo
            fechado sem comissão, e precisa aparecer. O teste é sobre NULO; a
            linha continua sumindo quando não há valor, que é o que `InfoRow` faz.
          */}
          <InfoRow
            label="% Comissão"
            value={supplier.commission_percent == null ? null : `${supplier.commission_percent}%`}
          />
          <InfoRow
            label="Desconto Padrão"
            value={
              supplier.standard_discount_percent == null
                ? null
                : `${supplier.standard_discount_percent}%`
            }
          />
          <InfoRow
            label="Prazo Pagamento Comissão"
            value={
              supplier.commission_payment_term
                ? labelOf(COMMISSION_PAYMENT_TERM, supplier.commission_payment_term)
                : null
            }
          />
        </Section>

        {/* Logística */}
        <Section title="Logística">
          <InfoRow label="Cidade" value={supplier.city} />
          <InfoRow label="Estado" value={supplier.state} />
          <InfoRow label="Endereço Showroom" value={supplier.address} />
          <InfoRow
            label="Atende fora de Fortaleza"
            value={supplier.serves_outside_fortaleza ? 'Sim' : 'Não'}
          />
          <InfoRow label="Tem Showroom" value={supplier.has_showroom ? 'Sim' : 'Não'} />
          <InfoRow label="Prazo Médio de Entrega" value={supplier.average_delivery_time} />
        </Section>

        {/* Métricas */}
        <Section title="Métricas">
          <InfoRow
            label="Total Comissão Recebida"
            value={commissionReceived ? formatCurrencyBRL(commissionReceived) : null}
          />
          <InfoRow
            label="Último Pedido"
            value={supplier.last_order_date ? formatDateBR(supplier.last_order_date) : null}
          />
          <InfoRow label="Status" value={labelOf(SUPPLIER_STATUS, supplier.status)} />
        </Section>

        {/* Observações */}
        {supplier.notes && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
              Observações
            </h3>
            <p className="text-sm text-soft bg-elevated rounded-xl p-3">{supplier.notes}</p>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-border flex-wrap">
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
              {/* `text-white` explícito: o token do botão inverte no tema escuro e
                  emerald-600 é escuro o bastante para texto branco nos dois. */}
              <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                <Phone className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
            </a>
          )}
          {canEdit && (
            <>
              <Button
                variant="outline"
                onClick={() => onToggleStatus(supplier)}
                className={
                  supplier.status === 'active'
                    ? 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                    : 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }
              >
                {supplier.status === 'active' ? 'Inativar' : 'Reativar'}
              </Button>
              <Button
                variant="outline"
                onClick={() => onDelete(supplier)}
                className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
