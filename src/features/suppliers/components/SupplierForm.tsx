import { useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaskedInput } from '@/components/ui/masked-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  PARTNERSHIP_MODEL,
  PARTNERSHIP_TIER,
  SUPPLIER_CATEGORY,
  SUPPLIER_TYPOLOGY,
  optionsOf,
  type CommissionPaymentTerm,
  type PartnershipModel,
  type PartnershipTier,
  type SupplierCategory,
} from '@/lib/enums'
import { maskPhone } from '@/lib/masks'
import type { SupplierInput, SupplierRow } from '../types'

/*
  Porta de projeto-original/src/components/fornecedores/FornecedorForm.jsx.

  A ordem dos campos, os rótulos com asterisco, os cinco blocos separados por
  linha (Identificação, Marcas, Contato, Parceria Comercial, Logística,
  Observações), a grade de duas colunas, os placeholders e o texto dos botões são
  os do original.

  O QUE MUDA, E POR QUÊ:

  1. A lista de tipologia é `SUPPLIER_TYPOLOGY` (src/lib/enums.ts), que são os
     mesmos 19 rótulos do original na mesma ordem — o select grava o valor do
     banco e mostra o rótulo. O FILTRO da tela usa outra lista, e isso está
     comentado em Suppliers.tsx.
  2. `total_comissao_recebida` sai do estado: o original o carrega e não tem
     input para ele, e aqui ele deixou de ser campo — é a view
     `supplier_commission_totals`, que o drawer lê.
  3. `desconto_padrao`, `prazo_pagamento_comissao`, `prazo_entrega_medio` e
     `ultimo_pedido_data` continuam SEM input, como no original, mas seguem no
     estado e voltam intactos na gravação. É o que o original faz ao enviar
     `{ ...form }` sobre `{ ...EMPTY, ...initialData }`: sem isso, editar um
     fornecedor apagaria quatro campos que o drawer exibe.
*/

export type SupplierFormValues = {
  name: string
  /* `SupplierCategory`, e não `SupplierTypology`: ver `typologyOptions` abaixo. */
  category: SupplierCategory | ''
  partnership_tier: PartnershipTier

  brands: string[]

  contact_name: string
  contact_whatsapp: string
  contact_email: string
  phone: string
  website: string

  partnership_model: PartnershipModel | ''
  commission_percent: string

  city: string
  state: string
  address: string
  has_showroom: boolean
  serves_outside_fortaleza: boolean

  notes: string

  /* Sem input na tela — carregados do cadastro e devolvidos como vieram. */
  status: SupplierRow['status']
  standard_discount_percent: number | null
  commission_payment_term: CommissionPaymentTerm | null
  average_delivery_time: string | null
  last_order_date: string | null
}

function emptyValues(): SupplierFormValues {
  return {
    name: '',
    category: '',
    /* "Cadastrado" pré-selecionado é o do original (FornecedorForm.jsx:27). */
    partnership_tier: 'registered',

    brands: [],

    contact_name: '',
    contact_whatsapp: '',
    contact_email: '',
    phone: '',
    website: '',

    partnership_model: '',
    commission_percent: '',

    /*
      CIDADE E ESTADO NASCEM VAZIOS. O original pré-preenche "Fortaleza" / "CE"
      (FornecedorForm.jsx:23), de quando o sistema era de um escritório de
      Fortaleza; este é de Goiânia, e foi por isso que a migration 0049 tirou o
      default da coluna. Cadastro novo salvo sem olhar esses dois campos gravava
      um fornecedor de Goiânia como sendo do Ceará, e o valor errado se parece
      com valor preenchido — ninguém volta para conferir.

      Vazio, e não "Goiânia" / "GO": o campo continua opcional, e o formulário
      não deve adivinhar a praça do fornecedor. Quem digita vê o campo em branco
      e preenche o que é. O rótulo, a posição e a largura dos dois campos são os
      do original.
    */
    city: '',
    state: '',
    address: '',
    has_showroom: false,
    serves_outside_fortaleza: false,

    notes: '',

    status: 'active',
    standard_discount_percent: null,
    commission_payment_term: null,
    average_delivery_time: null,
    last_order_date: null,
  }
}

const text = (value: string | null): string => value ?? ''

export function toFormValues(supplier: SupplierRow): SupplierFormValues {
  return {
    name: supplier.name,
    /* SEM CAST: a tipologia entra como está gravada. Desde a migration 0063 ela
       pode ser uma das quatro de item de orçamento, em fornecedor importado —
       ver `typologyOptions`. */
    category: supplier.category,
    partnership_tier: supplier.partnership_tier,

    brands: supplier.brands.map((brand) => brand.name),

    contact_name: text(supplier.contact_name),
    contact_whatsapp: supplier.contact_whatsapp,
    contact_email: text(supplier.contact_email),
    phone: text(supplier.phone),
    website: text(supplier.website),

    partnership_model: supplier.partnership_model ?? '',
    commission_percent: supplier.commission_percent == null ? '' : String(supplier.commission_percent),

    city: text(supplier.city),
    state: text(supplier.state),
    address: text(supplier.address),
    has_showroom: supplier.has_showroom,
    serves_outside_fortaleza: supplier.serves_outside_fortaleza,

    notes: text(supplier.notes),

    status: supplier.status,
    standard_discount_percent: supplier.standard_discount_percent,
    commission_payment_term: supplier.commission_payment_term,
    average_delivery_time: supplier.average_delivery_time,
    last_order_date: supplier.last_order_date,
  }
}

/*
  A LISTA DO SELECT DE TIPOLOGIA: os 19 do original, mais a tipologia ATUAL do
  fornecedor aberto quando ela não está entre eles.

  A migration 0063 abriu uma exceção em `suppliers_category_domain_check` que
  acompanha a linha (`legacy_id` não nulo), e há um fornecedor real importado do
  base44 com `facade_cladding` — "Revestimento de Fachada", uma das quatro
  tipologias que só valem em item de orçamento. Sem esta função o select abriria
  no placeholder "Selecione", como se a tipologia nunca tivesse sido preenchida, e
  a gravação exigiria escolher outra coisa: a tela apagaria um fato do escritório
  para conseguir salvar um telefone.

  A opção extra SÓ APARECE quando já é o valor do fornecedor aberto. Ela não é
  oferecida em cadastro novo e some assim que a pessoa escolhe outra — trocar a
  tipologia continua sendo um gesto deliberado, e depois de trocada não há como
  voltar por aqui, porque o valor deixou de ser o atual. É o mesmo desenho de
  "manter o que está gravado sem oferecer o que não se pode escolher" que o
  formulário já usa nos quatro campos sem input.

  O rótulo da opção extra vem de `SUPPLIER_CATEGORY`, o mapa dos 23 — ele é o
  mesmo texto que a listagem e o drawer já mostram para esse fornecedor.
*/
type TypologyOption = { value: SupplierCategory; label: string }

function typologyOptionsFor(current: SupplierCategory | ''): TypologyOption[] {
  const options: TypologyOption[] = optionsOf(SUPPLIER_TYPOLOGY)
  if (current === '' || options.some((option) => option.value === current)) return options
  return [...options, { value: current, label: SUPPLIER_CATEGORY[current] }]
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: SupplierFormValues): SupplierInput {
  return {
    name: values.name.trim(),
    /* O `required` da marcação barra o nome e o WhatsApp vazios; a tipologia
       vazia é o schema quem recusa, com frase em português. */
    category: values.category as SupplierCategory,
    contact_whatsapp: values.contact_whatsapp.trim(),
    partnership_tier: values.partnership_tier,

    brands: values.brands,

    contact_name: orNull(values.contact_name),
    contact_email: orNull(values.contact_email),
    phone: orNull(values.phone),
    website: orNull(values.website),

    address: orNull(values.address),
    city: orNull(values.city),
    state: orNull(values.state),

    has_showroom: values.has_showroom,
    serves_outside_fortaleza: values.serves_outside_fortaleza,

    partnership_model: values.partnership_model === '' ? null : values.partnership_model,
    /* `Number(form.percentual_comissao)` do original (FornecedorForm.jsx:55):
       vazio vira NULO, e não zero. */
    commission_percent:
      values.commission_percent.trim() === '' ? null : Number(values.commission_percent),
    commission_payment_term: values.commission_payment_term,
    standard_discount_percent: values.standard_discount_percent,
    average_delivery_time: values.average_delivery_time,

    status: values.status,
    notes: orNull(values.notes),
    last_order_date: values.last_order_date,
  }
}

export default function SupplierForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: SupplierInput) => void
  initialData: SupplierFormValues | null
  isLoading: boolean
}) {
  const [values, setValues] = useState<SupplierFormValues>(() => initialData ?? emptyValues())
  const [newBrand, setNewBrand] = useState('')

  /* O original reinicia o formulário quando `initialData` ou `open` mudam. */
  useEffect(() => {
    setValues(initialData ?? emptyValues())
    setNewBrand('')
  }, [initialData, open])

  const typologyOptions = typologyOptionsFor(values.category)

  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const addBrand = () => {
    const name = newBrand.trim()
    if (!name) return
    setValues((current) => ({ ...current, brands: [...current.brands, name] }))
    setNewBrand('')
  }

  const removeBrand = (index: number) =>
    setValues((current) => ({
      ...current,
      brands: current.brands.filter((_, position) => position !== index),
    }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Identificação */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="supplier-name">Nome *</Label>
              <Input
                id="supplier-name"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Tipologia *</Label>
              <Select
                value={values.category}
                onValueChange={(value) => set('category', value as SupplierCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {typologyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nível de Parceria</Label>
              <Select
                value={values.partnership_tier}
                onValueChange={(value) => set('partnership_tier', value as PartnershipTier)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(PARTNERSHIP_TIER).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Marcas */}
          <div className="space-y-1">
            <Label>Marcas Representadas</Label>
            <div className="flex gap-2">
              <Input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="Adicionar marca..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addBrand()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addBrand}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {values.brands.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {values.brands.map((brand, index) => (
                  <Badge key={`${brand}-${index}`} variant="secondary" className="gap-1">
                    {brand}
                    <button type="button" onClick={() => removeBrand(index)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Contato */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-soft mb-3">Contato</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="supplier-contact-name">Nome do Contato</Label>
                <Input
                  id="supplier-contact-name"
                  value={values.contact_name}
                  onChange={(e) => set('contact_name', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-whatsapp">WhatsApp *</Label>
                <MaskedInput
                  id="supplier-whatsapp"
                  mask={maskPhone}
                  value={values.contact_whatsapp}
                  onValueChange={(whatsapp) => set('contact_whatsapp', whatsapp)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-email">E-mail</Label>
                <Input
                  id="supplier-email"
                  type="email"
                  value={values.contact_email}
                  onChange={(e) => set('contact_email', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-phone">Telefone</Label>
                <MaskedInput
                  id="supplier-phone"
                  mask={maskPhone}
                  value={values.phone}
                  onValueChange={(phone) => set('phone', phone)}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="supplier-website">Site / Instagram</Label>
                <Input
                  id="supplier-website"
                  value={values.website}
                  onChange={(e) => set('website', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Parceria */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-soft mb-3">Parceria Comercial</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Modelo de Parceria</Label>
                <Select
                  value={values.partnership_model}
                  onValueChange={(value) => set('partnership_model', value as PartnershipModel)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(PARTNERSHIP_MODEL).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-commission">% Comissão</Label>
                <Input
                  id="supplier-commission"
                  type="number"
                  value={values.commission_percent}
                  onChange={(e) => set('commission_percent', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Logística */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-soft mb-3">Logística</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="supplier-city">Cidade</Label>
                <Input
                  id="supplier-city"
                  value={values.city}
                  onChange={(e) => set('city', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-state">Estado</Label>
                <Input
                  id="supplier-state"
                  value={values.state}
                  onChange={(e) => set('state', e.target.value)}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="supplier-address">Endereço Showroom</Label>
                <Input
                  id="supplier-address"
                  value={values.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showroom"
                  checked={values.has_showroom}
                  onChange={(e) => set('has_showroom', e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="showroom">Tem Showroom</Label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="fora_fortaleza"
                  checked={values.serves_outside_fortaleza}
                  onChange={(e) => set('serves_outside_fortaleza', e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="fora_fortaleza">Atende fora de Fortaleza</Label>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1 border-t pt-4">
            <Label htmlFor="supplier-notes">Observações</Label>
            <Textarea
              id="supplier-notes"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Fornecedor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
