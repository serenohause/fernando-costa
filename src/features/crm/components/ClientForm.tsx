import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CLIENT_TYPE, LEAD_SOURCE, optionsOf, type ClientType, type LeadSource } from '@/lib/enums'
import { useLookupZipcode } from '../hooks'
import type { DuplicateClientError } from '../hooks'
import type { Client, ClientInput } from '../types'

/*
  Porta de projeto-original/src/components/forms/ClientForm.jsx.

  Os três blocos, a ordem dos campos, os rótulos, os placeholders, os emojis dos
  títulos e a caixa de passo 1/2/3 no cabeçalho são os do original. Os pares
  `SelectMobile`/`SelectContentMobile` do original não são componente próprio: o
  select-mobile.jsx dele é um re-export do Select padrão (ele mesmo diz isso no
  comentário), então usar `@/components/ui/select` aqui é o mesmo componente.

  DUAS COISAS QUE PARECEM ERRO E SÃO FIDELIDADE (as duas relatadas ao usuário):

  1. Cidade e Estado aparecem DUAS VEZES, em "Dados Iniciais" e em "Dados
     Complementares", ligados ao mesmo campo — no original os dois pares editam
     `current_city`/`current_state`, então digitar em um muda o outro. Reproduzido
     como está, inclusive os ids terminados em `_complement`.

  2. O bloco da obra não tem Cidade nem Estado — o original não os oferece, mesmo
     exibindo-os na tela de detalhe. Os valores existentes são carregados e
     regravados sem alteração, para editar um cliente não apagar o que já está lá.

  UMA DIVERGÊNCIA DELIBERADA: o campo País. No original o estado inicial é `''` e
  o input mostra 'Brasil' por causa de `value={formData.country || 'Brasil'}` — o
  que se vê é "Brasil", o que se grava é vazio. Como `address_country` é not null
  com check de não-branco (migration 0015), gravar vazio seria erro na cara do
  usuário. O valor inicial passa a ser 'Brasil' de fato. Em tela, nada muda.
*/

export type ClientFormValues = {
  name: string
  phone: string
  email: string
  client_type: ClientType | ''
  lead_source: LeadSource | ''
  tax_id: string
  birth_date: string
  notes: string
  address_zipcode: string
  address_street: string
  address_number: string
  address_district: string
  address_complement: string
  address_city: string
  address_state: string
  address_country: string
  site_zipcode: string
  site_street: string
  site_number: string
  site_district: string
  site_complement: string
  site_city: string
  site_state: string
}

const EMPTY: ClientFormValues = {
  name: '',
  phone: '',
  email: '',
  client_type: '',
  lead_source: '',
  tax_id: '',
  birth_date: '',
  notes: '',
  address_zipcode: '',
  address_street: '',
  address_number: '',
  address_district: '',
  address_complement: '',
  address_city: '',
  address_state: '',
  address_country: 'Brasil',
  site_zipcode: '',
  site_street: '',
  site_number: '',
  site_district: '',
  site_complement: '',
  site_city: '',
  site_state: '',
}

export function toFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    phone: client.phone,
    email: client.email ?? '',
    client_type: client.client_type ?? '',
    lead_source: client.lead_source ?? '',
    tax_id: client.tax_id ?? '',
    birth_date: client.birth_date ?? '',
    notes: client.notes ?? '',
    address_zipcode: client.address_zipcode ?? '',
    address_street: client.address_street ?? '',
    address_number: client.address_number ?? '',
    address_district: client.address_district ?? '',
    address_complement: client.address_complement ?? '',
    address_city: client.address_city,
    address_state: client.address_state,
    address_country: client.address_country,
    site_zipcode: client.site_zipcode ?? '',
    site_street: client.site_street ?? '',
    site_number: client.site_number ?? '',
    site_district: client.site_district ?? '',
    site_complement: client.site_complement ?? '',
    site_city: client.site_city ?? '',
    site_state: client.site_state ?? '',
  }
}

/* '' vira null antes de sair do formulário: o banco recusa string vazia em
   `email` e nos campos obrigatórios. `clientInputSchema` refaz a conversão — é
   barreira, não confiança. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toClientInput(values: ClientFormValues): ClientInput {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    email: orNull(values.email),
    client_type: values.client_type === '' ? null : values.client_type,
    lead_source: values.lead_source === '' ? null : values.lead_source,
    tax_id: orNull(values.tax_id),
    birth_date: orNull(values.birth_date),
    notes: orNull(values.notes),
    address_zipcode: orNull(values.address_zipcode),
    address_street: orNull(values.address_street),
    address_number: orNull(values.address_number),
    address_district: orNull(values.address_district),
    address_complement: orNull(values.address_complement),
    address_city: values.address_city.trim(),
    address_state: values.address_state.trim(),
    address_country: values.address_country.trim(),
    site_zipcode: orNull(values.site_zipcode),
    site_street: orNull(values.site_street),
    site_number: orNull(values.site_number),
    site_district: orNull(values.site_district),
    site_complement: orNull(values.site_complement),
    site_city: orNull(values.site_city),
    site_state: orNull(values.site_state),
  }
}

export default function ClientForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  duplicate,
  onOpenDuplicate,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: ClientInput) => void
  initialData?: ClientFormValues | null
  isLoading?: boolean
  /* Recusa por unicidade da gravação anterior, já com o cliente que ocupa o valor. */
  duplicate?: DuplicateClientError | null
  onOpenDuplicate?: (client: Client) => void
}) {
  const [formData, setFormData] = useState<ClientFormValues>({ ...EMPTY, ...initialData })

  useEffect(() => {
    setFormData(initialData ? { ...EMPTY, ...initialData } : EMPTY)
  }, [initialData, open])

  const addressZipcode = useLookupZipcode()
  const siteZipcode = useLookupZipcode()

  const isEditing = Boolean(initialData)

  /* Endereço do cliente: o CEP preenche logradouro, bairro, cidade e estado. */
  const handleAddressZipcodeBlur = (zipcode: string) => {
    addressZipcode.mutate(zipcode, {
      onSuccess: (address) => {
        if (!address) return
        setFormData((previous) => ({
          ...previous,
          address_street: address.street || previous.address_street,
          address_district: address.district || previous.address_district,
          address_city: address.city || previous.address_city,
          address_state: address.state || previous.address_state,
        }))
      },
    })
  }

  /* CEP da obra: só logradouro e bairro, como no original — cidade e estado da
     obra não têm campo no formulário. */
  const handleSiteZipcodeBlur = (zipcode: string) => {
    siteZipcode.mutate(zipcode, {
      onSuccess: (address) => {
        if (!address) return
        setFormData((previous) => ({
          ...previous,
          site_street: address.street || previous.site_street,
          site_district: address.district || previous.site_district,
        }))
      },
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(toClientInput(formData))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
          <div className="text-sm text-muted-foreground mt-2 space-y-1">
            <p>
              📌 <strong>Passo 1:</strong> Cadastre apenas os dados iniciais do cliente
            </p>
            <p>
              📌 <strong>Passo 2:</strong> Crie a negociação
            </p>
            <p>
              📌 <strong>Passo 3:</strong> Complete os dados conforme avanço do atendimento
            </p>
          </div>
        </DialogHeader>

        {/*
          Não existe no original: lá a recusa por duplicata é só um toast com
          "Já existe um cliente cadastrado com este CPF/CNPJ", e quem estava
          procurando o cliente continua sem achá-lo. Entra por decisão do usuário
          (docs/SCHEMA-PLAN.md, "O que a tela faz quando a duplicata é barrada"):
          o aviso diz de quem é o documento e abre o cadastro. Fica dentro do
          formulário, e não no toast, porque precisa continuar na tela até a
          pessoa decidir o que fazer.
        */}
        {duplicate && (
          <div className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-rose-900 dark:text-rose-300">
                  {duplicate.field === 'tax_id'
                    ? 'Este CPF/CNPJ já está cadastrado'
                    : 'Este e-mail já está cadastrado'}
                </p>
                {duplicate.existing ? (
                  <>
                    <p className="text-sm text-rose-800 dark:text-rose-300">
                      Já existe um cliente com {duplicate.field === 'tax_id' ? 'este documento' : 'este e-mail'}:{' '}
                      <strong>{duplicate.existing.name}</strong>.
                    </p>
                    {onOpenDuplicate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenDuplicate(duplicate.existing!)}
                      >
                        Abrir cadastro de {duplicate.existing.name}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-rose-800 dark:text-rose-300">
                    O cadastro que ocupa esse valor não está visível para o seu acesso. Procure a
                    coordenação do escritório antes de cadastrar de novo.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* DADOS INICIAIS */}
          <div className="p-4 bg-elevated rounded-lg border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
              📋 Dados Iniciais
            </h3>

            <div className="space-y-2">
              <Label htmlFor="name">Nome do Cliente *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome completo ou razão social"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone/WhatsApp *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address_city">Cidade *</Label>
                <Input
                  id="address_city"
                  value={formData.address_city}
                  onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                  placeholder="Cidade"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_state">Estado *</Label>
                <Input
                  id="address_state"
                  value={formData.address_state}
                  onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                  placeholder="UF"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_country">País *</Label>
                <Input
                  id="address_country"
                  value={formData.address_country}
                  onChange={(e) => setFormData({ ...formData, address_country: e.target.value })}
                  placeholder="País"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Origem do Lead</Label>
              <Select
                value={formData.lead_source}
                onValueChange={(value) =>
                  setFormData({ ...formData, lead_source: value as LeadSource })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Como chegou até você?" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(LEAD_SOURCE).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* DADOS COMPLEMENTARES */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900 space-y-4">
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wide">
              📝 Dados Complementares
            </h3>

            {/* Linha 1: Tipo do Cliente | CPF/CNPJ */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_type">Tipo de Cliente</Label>
                <Select
                  value={formData.client_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, client_type: value as ClientType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf(CLIENT_TYPE).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_id">CPF / CNPJ</Label>
                <Input
                  id="tax_id"
                  value={formData.tax_id}
                  onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            {/* Linha 2: Data de Nascimento */}
            <div className="space-y-2">
              <Label htmlFor="birth_date">Data de Nascimento</Label>
              <Input
                id="birth_date"
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
              />
            </div>

            {/* Linha 3: CEP (com auto-preenchimento) */}
            <div className="space-y-2">
              <Label htmlFor="address_zipcode">CEP</Label>
              <Input
                id="address_zipcode"
                value={formData.address_zipcode}
                onChange={(e) => setFormData({ ...formData, address_zipcode: e.target.value })}
                onBlur={(e) => handleAddressZipcodeBlur(e.target.value)}
                placeholder="00000-000"
              />
            </div>

            {/* Linha 4: Cidade | Estado — os mesmos campos do bloco de cima */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address_city_complement">Cidade</Label>
                <Input
                  id="address_city_complement"
                  value={formData.address_city}
                  onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_state_complement">Estado</Label>
                <Input
                  id="address_state_complement"
                  value={formData.address_state}
                  onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                  placeholder="UF"
                />
              </div>
            </div>

            {/* Linha 5: Logradouro | Número | Bairro */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="address_street">Logradouro</Label>
                <Input
                  id="address_street"
                  value={formData.address_street}
                  onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  placeholder="Rua, avenida..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_number">Número</Label>
                <Input
                  id="address_number"
                  value={formData.address_number}
                  onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                  placeholder="Nº"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_district">Bairro</Label>
              <Input
                id="address_district"
                value={formData.address_district}
                onChange={(e) => setFormData({ ...formData, address_district: e.target.value })}
                placeholder="Bairro"
              />
            </div>

            {/* Linha 6: Complemento */}
            <div className="space-y-2">
              <Label htmlFor="address_complement">Complemento</Label>
              <Input
                id="address_complement"
                value={formData.address_complement}
                onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                placeholder="Apto, sala, bloco..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Informações adicionais..."
                rows={3}
              />
            </div>
          </div>

          {/* ENDEREÇO DA OBRA */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900 space-y-4">
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide">
              🏗️ Endereço da Obra
            </h3>

            {/* Linha 1: CEP da Obra (com auto-preenchimento) */}
            <div className="space-y-2">
              <Label htmlFor="site_zipcode">CEP da Obra</Label>
              <Input
                id="site_zipcode"
                value={formData.site_zipcode}
                onChange={(e) => setFormData({ ...formData, site_zipcode: e.target.value })}
                onBlur={(e) => handleSiteZipcodeBlur(e.target.value)}
                placeholder="00000-000"
              />
            </div>

            {/* Linha 2: Logradouro da Obra | Número da Obra */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="site_street">Logradouro da Obra</Label>
                <Input
                  id="site_street"
                  value={formData.site_street}
                  onChange={(e) => setFormData({ ...formData, site_street: e.target.value })}
                  placeholder="Rua, avenida..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site_number">Número da Obra</Label>
                <Input
                  id="site_number"
                  value={formData.site_number}
                  onChange={(e) => setFormData({ ...formData, site_number: e.target.value })}
                  placeholder="Nº"
                />
              </div>
            </div>

            {/* Linha 3: Bairro da Obra */}
            <div className="space-y-2">
              <Label htmlFor="site_district">Bairro da Obra</Label>
              <Input
                id="site_district"
                value={formData.site_district}
                onChange={(e) => setFormData({ ...formData, site_district: e.target.value })}
                placeholder="Bairro"
              />
            </div>

            {/* Linha 4: Complemento da Obra */}
            <div className="space-y-2">
              <Label htmlFor="site_complement">Complemento da Obra</Label>
              <Input
                id="site_complement"
                value={formData.site_complement}
                onChange={(e) => setFormData({ ...formData, site_complement: e.target.value })}
                placeholder="Apto, sala, bloco..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
