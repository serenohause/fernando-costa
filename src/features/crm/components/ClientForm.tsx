import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaskedInput } from '@/components/ui/masked-input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CLIENT_TYPE, LEAD_SOURCE, optionsOf, type ClientType, type LeadSource } from '@/lib/enums'
import { maskPhone, maskTaxId, maskZipcode } from '@/lib/masks'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useClients, useLookupCnpj, useLookupZipcode } from '../hooks'
import type { DuplicateClientError } from '../hooks'
import type { DuplicateField } from '../types'
import type { Client, ClientInput, CompanyLookup } from '../types'

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
  referrer_name: string
  /* Vazio quando quem indicou não é cliente do escritório — ver `referrer_client_id`
     na migration 0087. */
  referrer_client_id: string
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

  /* Empresa (migration 0091). Só fazem sentido com client_type = 'company', e
     quem exige isso é a tela: a aba fica desabilitada nos outros tipos. */
  company_legal_name: string
  company_trade_name: string
  company_state_registration: string
  company_address_zipcode: string
  company_address_street: string
  company_address_number: string
  company_address_complement: string
  company_address_district: string
  company_address_city: string
  company_address_state: string
}

const EMPTY: ClientFormValues = {
  name: '',
  phone: '',
  email: '',
  client_type: '',
  lead_source: '',
  referrer_name: '',
  referrer_client_id: '',
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
  company_legal_name: '',
  company_trade_name: '',
  company_state_registration: '',
  company_address_zipcode: '',
  company_address_street: '',
  company_address_number: '',
  company_address_complement: '',
  company_address_district: '',
  company_address_city: '',
  company_address_state: '',
}

export function toFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    phone: client.phone,
    email: client.email ?? '',
    client_type: client.client_type ?? '',
    lead_source: client.lead_source ?? '',
    referrer_name: client.referrer_name ?? '',
    referrer_client_id: client.referrer_client_id ?? '',
    tax_id: client.tax_id ?? '',
    birth_date: client.birth_date ?? '',
    notes: client.notes ?? '',
    address_zipcode: client.address_zipcode ?? '',
    address_street: client.address_street ?? '',
    address_number: client.address_number ?? '',
    address_district: client.address_district ?? '',
    address_complement: client.address_complement ?? '',
    /*
      Anuláveis desde a migration 0064: 1 cliente do base44 não tem NENHUM campo
      de endereço preenchido — nem o da residência, nem o da obra — e não há de
      onde deduzir cidade e UF. Campo em branco é a leitura honesta ("não foi
      informado"), e é o mesmo que os outros vinte campos deste formulário já
      fazem com nulo. "Fortaleza/CE" porque é onde o escritório fica seria gravar
      endereço que ninguém informou.

      Os dois continuam obrigatórios para gravar (`Cidade *`, `Estado *`, e
      `clientInputSchema`), como no passo 1 do cadastro do original.
    */
    address_city: client.address_city ?? '',
    address_state: client.address_state ?? '',
    address_country: client.address_country,
    site_zipcode: client.site_zipcode ?? '',
    site_street: client.site_street ?? '',
    site_number: client.site_number ?? '',
    site_district: client.site_district ?? '',
    site_complement: client.site_complement ?? '',
    site_city: client.site_city ?? '',
    site_state: client.site_state ?? '',

    company_legal_name: client.company_legal_name ?? '',
    company_trade_name: client.company_trade_name ?? '',
    company_state_registration: client.company_state_registration ?? '',
    company_address_zipcode: client.company_address_zipcode ?? '',
    company_address_street: client.company_address_street ?? '',
    company_address_number: client.company_address_number ?? '',
    company_address_complement: client.company_address_complement ?? '',
    company_address_district: client.company_address_district ?? '',
    company_address_city: client.company_address_city ?? '',
    company_address_state: client.company_address_state ?? '',
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
    /*
      SÓ VIAJA COM A ORIGEM QUE LHE DÁ SENTIDO. Trocar de "Indicação" para
      "Instagram" e continuar gravando o indicador deixaria um nome pendurado
      num cadastro que não é mais indicação — e alguém, meses depois, lendo
      aquilo como fato.
    */
    referrer_name:
      values.lead_source === 'referral' ? orNull(values.referrer_name) : null,
    /*
      O PONTEIRO SÓ VAI JUNTO COM O NOME. O banco tem um check exigindo isso
      (0087), e a razão é de leitura: quase todo o sistema lê o indicador por
      `referrer_name`, e um ponteiro sem nome apareceria como "sem indicação"
      em toda parte menos aqui.
    */
    referrer_client_id:
      values.lead_source === 'referral' && values.referrer_name.trim() !== ''
        ? orNull(values.referrer_client_id)
        : null,
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

    /*
      OS DADOS DA EMPRESA SÓ VIAJAM COM O TIPO QUE LHES DÁ SENTIDO, pelo mesmo
      motivo de `referrer_name` logo acima: trocar de Pessoa Jurídica para
      Física e continuar gravando a razão social deixaria um dado pendurado num
      cadastro que não é mais empresa — e alguém, meses depois, lendo aquilo
      como fato.
    */
    company_legal_name: values.client_type === 'company' ? orNull(values.company_legal_name) : null,
    company_trade_name: values.client_type === 'company' ? orNull(values.company_trade_name) : null,
    company_state_registration: values.client_type === 'company' ? orNull(values.company_state_registration) : null,
    company_address_zipcode: values.client_type === 'company' ? orNull(values.company_address_zipcode) : null,
    company_address_street: values.client_type === 'company' ? orNull(values.company_address_street) : null,
    company_address_number: values.client_type === 'company' ? orNull(values.company_address_number) : null,
    company_address_complement: values.client_type === 'company' ? orNull(values.company_address_complement) : null,
    company_address_district: values.client_type === 'company' ? orNull(values.company_address_district) : null,
    company_address_city: values.client_type === 'company' ? orNull(values.company_address_city) : null,
    company_address_state: values.client_type === 'company' ? orNull(values.company_address_state) : null,
  }
}

/* Os três campos que deduplicam cliente: documento e e-mail desde a migration
   0015, telefone desde a 0076. Ternário aqui viraria "este e-mail" para uma
   colisão de telefone, mandando a pessoa conferir o campo errado. */
const DUPLICATE_TITLE: Record<DuplicateField, string> = {
  tax_id: 'Este CPF/CNPJ já está cadastrado',
  email: 'Este e-mail já está cadastrado',
  phone: 'Este telefone já está cadastrado',
}

const DUPLICATE_WHAT: Record<DuplicateField, string> = {
  tax_id: 'este documento',
  email: 'este e-mail',
  phone: 'este telefone',
}

export default function ClientForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  duplicate,
  onOpenDuplicate,
  editingClientId,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: ClientInput) => void
  initialData?: ClientFormValues | null
  isLoading?: boolean
  /* Quem está sendo editado, para sair da lista de indicadores. Ausente na
     criação, quando o cadastro ainda não tem id. */
  editingClientId?: string | null
  /* Recusa por unicidade da gravação anterior, já com o cliente que ocupa o valor. */
  duplicate?: DuplicateClientError | null
  onOpenDuplicate?: (client: Client) => void
}) {
  const [formData, setFormData] = useState<ClientFormValues>({ ...EMPTY, ...initialData })
  const [activeTab, setActiveTab] = useState('cliente')
  const [companyInfo, setCompanyInfo] = useState<CompanyLookup | null>(null)
  const cnpjLookup = useLookupCnpj()

  const isCompany = formData.client_type === 'company'

  /*
    O interruptor começa LIGADO quando o cadastro já tem dados de empresa — é a
    mesma regra do campo de indicação: quem abre um cadastro antigo não pode ver
    o que está gravado sumir da tela.
  */
  const [companyOpen, setCompanyOpen] = useState(
    () => Boolean(initialData?.company_legal_name || initialData?.company_trade_name),
  )

  const [referrerMissing, setReferrerMissing] = useState(false)
  const referrerFieldRef = useRef<HTMLDivElement>(null)

  /*
    Começa na busca quando o cadastro não tem indicador OU o indicador é um
    cliente; começa no texto livre quando já há um nome que não aponta para
    ninguém — senão editar um cadastro antigo apagaria o nome que está lá.
  */
  const [referrerFreeText, setReferrerFreeText] = useState(
    () => Boolean(initialData?.referrer_name) && !initialData?.referrer_client_id,
  )

  /* A lista inteira do escritório: `useClients('')` traz até o teto da consulta,
     ordenada por nome, e o SearchableSelect filtra no cliente. */
  const referrerCandidates = useClients('').data ?? []
  const referrerOptions = useMemo(
    () =>
      referrerCandidates
        /* O cadastro em edição sai da lista: cliente não indica a si mesmo, e o
           banco recusa (0087). Melhor não oferecer do que recusar depois. */
        .filter((candidate) => candidate.id !== editingClientId)
        .map((candidate) => ({ value: candidate.id, label: candidate.name })),
    [referrerCandidates, editingClientId],
  )

  useEffect(() => {
    setFormData(initialData ? { ...EMPTY, ...initialData } : EMPTY)
    setReferrerMissing(false)
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

  /*
    A RECUSA APARECE NO CAMPO, não em toast — a mesma decisão já tomada no
    formulário de negociação, e pelo mesmo motivo: mensagem que nasce longe do
    campo que a causou some sozinha e deixa a pessoa procurando.

    O diálogo rola, e este campo fica no meio dele; sem o `scrollIntoView` a
    marcação vermelha acontece fora da área visível e o botão parece não fazer
    nada.
  */
  /*
    Desligar LIMPA os campos, e não apenas os esconde: um cadastro com meia
    empresa gravada — razão social sem endereço, endereço sem razão social — é
    pior que nenhum, porque o contrato sai pela metade sem ninguém perceber.
  */
  const handleToggleCompany = (open: boolean) => {
    setCompanyOpen(open)
    if (!open) {
      setCompanyInfo(null)
      setFormData((current) => ({
        ...current,
        company_legal_name: '',
        company_trade_name: '',
        company_state_registration: '',
        company_address_zipcode: '',
        company_address_street: '',
        company_address_number: '',
        company_address_complement: '',
        company_address_district: '',
        company_address_city: '',
        company_address_state: '',
      }))
    }
  }

  /*
    A CONSULTA PREENCHE, E NÃO SOBRESCREVE O QUE JÁ ESTÁ LÁ. Quem já digitou a
    razão social à mão — porque a Receita traz um nome antigo, por exemplo — não
    a perde ao clicar em Buscar por causa do endereço.
  */
  const handleLookupCnpj = () => {
    cnpjLookup.mutate(formData.tax_id, {
      onSuccess: (dados) => {
        if (!dados) {
          toast.error('CNPJ não encontrado. Confira o número ou preencha à mão.')
          return
        }
        setCompanyInfo(dados)
        setFormData((current) => ({
          ...current,
          company_legal_name: current.company_legal_name || dados.legalName,
          company_trade_name: current.company_trade_name || dados.tradeName,
          company_address_zipcode: current.company_address_zipcode || maskZipcode(dados.zipcode),
          company_address_street: current.company_address_street || dados.street,
          company_address_number: current.company_address_number || dados.number,
          company_address_complement: current.company_address_complement || dados.complement,
          company_address_district: current.company_address_district || dados.district,
          company_address_city: current.company_address_city || dados.city,
          company_address_state: current.company_address_state || dados.state,
        }))
        toast.success('Dados da empresa preenchidos.')
      },
      onError: () => toast.error('Não foi possível consultar o CNPJ agora.'),
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (formData.lead_source === 'referral' && formData.referrer_name.trim() === '') {
      setReferrerMissing(true)
      referrerFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

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
                  {DUPLICATE_TITLE[duplicate.field]}
                </p>
                {duplicate.existing ? (
                  <>
                    <p className="text-sm text-rose-800 dark:text-rose-300">
                      Já existe um cliente com {DUPLICATE_WHAT[duplicate.field]}:{' '}
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
          {/*
            TRÊS ABAS, e não três blocos empilhados — pedido do usuário. O
            cadastro tem 27 campos, e rolar até o fim para achar o endereço da
            obra era o gesto de sempre.

            `forceMount` nas três, com o inativo escondido por CSS: o Radix
            DESMONTA o conteúdo da aba inativa por padrão, e cinco campos deste
            formulário são `required`. Um campo obrigatório vazio fora do DOM
            trava o submit em silêncio — o navegador tenta focar um elemento que
            não existe e desiste, sem mensagem. Com tudo montado, o aviso
            aparece e a aba certa continua sendo a que a pessoa escolheu.
          */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cliente">Dados do cliente</TabsTrigger>
              <TabsTrigger value="pj" disabled={!isCompany}>
                Dados PJ
              </TabsTrigger>
              <TabsTrigger value="obra">Dados da Obra</TabsTrigger>
            </TabsList>

            <TabsContent
              value="cliente"
              forceMount
              className="space-y-6 mt-4 data-[state=inactive]:hidden"
            >
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
                <MaskedInput
                  id="phone"
                  mask={maskPhone}
                  value={formData.phone}
                  onValueChange={(phone) => setFormData({ ...formData, phone })}
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

            {/*
              QUEM INDICOU, e só quando a origem é Indicação.

              O campo aparece pelo mesmo critério do formulário de negociação
              (`origin === 'referral'`): numa indicação, quem indicou É o dado —
              sem ele, "Indicação" fica indistinguível de "Outros". O original
              oferece a opção e nunca pergunta o nome (ClientForm.jsx:268); é o
              buraco que este bloco fecha.
            */}
            {formData.lead_source === 'referral' && (
              <div
                ref={referrerFieldRef}
                className="space-y-2 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg"
              >
                <Label htmlFor="client_referrer">Quem indicou? *</Label>

                {/*
                  BUSCA ENTRE OS CLIENTES, COM SAÍDA PARA TEXTO LIVRE.

                  Quem mais indica são os próprios clientes, e digitar o nome de
                  novo produz grafia divergente que não cruza com nada. Mas
                  indicação também vem de arquiteto parceiro, fornecedor, amigo
                  do diretor — gente que não é cliente e não deve virar um para
                  caber neste campo. Daí as duas portas.

                  Escolher da lista grava o ponteiro E o nome; digitar grava só
                  o nome. O banco recusa ponteiro sem nome (migration 0087).
                */}
                {referrerFreeText ? (
                  <Input
                    id="client_referrer"
                    maxLength={200}
                    value={formData.referrer_name}
                    onChange={(e) => {
                      setReferrerMissing(false)
                      setFormData({
                        ...formData,
                        referrer_name: e.target.value,
                        referrer_client_id: '',
                      })
                    }}
                    placeholder="Nome de quem indicou este cliente..."
                    aria-invalid={referrerMissing}
                    aria-describedby={referrerMissing ? 'client_referrer_error' : undefined}
                    className={`bg-card ${
                      referrerMissing ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                    }`}
                  />
                ) : (
                  <SearchableSelect
                    id="client_referrer"
                    options={referrerOptions}
                    value={formData.referrer_client_id}
                    onValueChange={(clientId) => {
                      const chosen = referrerCandidates.find(
                        (candidate) => candidate.id === clientId,
                      )
                      setReferrerMissing(false)
                      setFormData({
                        ...formData,
                        referrer_client_id: clientId,
                        /* O nome viaja junto: é por ele que o resto do sistema
                           lê o indicador, e ele sobrevive se o cadastro do
                           indicador for apagado. */
                        referrer_name: chosen?.name ?? formData.referrer_name,
                      })
                    }}
                    placeholder="Busque o cliente que indicou..."
                    searchPlaceholder="Buscar cliente pelo nome..."
                    emptyMessage="Nenhum cliente com esse nome."
                    className={
                      referrerMissing ? 'border-rose-500 focus-visible:ring-rose-500' : undefined
                    }
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    setReferrerFreeText((current) => !current)
                    setReferrerMissing(false)
                    /* Trocar de porta zera o campo: manter o nome do cliente
                       escolhido num campo de texto livre deixaria o ponteiro e
                       o texto contando histórias diferentes. */
                    setFormData((current) => ({
                      ...current,
                      referrer_client_id: '',
                      referrer_name: '',
                    }))
                  }}
                  className="text-xs text-blue-700 dark:text-blue-400 underline-offset-2 hover:underline"
                >
                  {referrerFreeText
                    ? 'Escolher entre os clientes cadastrados'
                    : 'Quem indicou não é cliente? Digitar o nome'}
                </button>

                {referrerMissing ? (
                  <p
                    id="client_referrer_error"
                    role="alert"
                    className="text-xs text-rose-600 dark:text-rose-400"
                  >
                    Informe quem indicou este cliente para continuar.
                  </p>
                ) : (
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Obrigatório quando a origem for Indicação
                  </p>
                )}
              </div>
            )}
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
                <MaskedInput
                  id="tax_id"
                  mask={maskTaxId}
                  value={formData.tax_id}
                  onValueChange={(tax_id) => setFormData({ ...formData, tax_id })}
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
              <MaskedInput
                id="address_zipcode"
                mask={maskZipcode}
                value={formData.address_zipcode}
                onValueChange={(address_zipcode) => setFormData({ ...formData, address_zipcode })}
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

            </TabsContent>

            <TabsContent
              value="pj"
              forceMount
              className="space-y-6 mt-4 data-[state=inactive]:hidden"
            >
              {/*
                O INTERRUPTOR EXISTE PORQUE PJ NEM SEMPRE QUER DIZER "TENHO OS
                DADOS". O escritório cadastra a empresa quando vai emitir
                contrato no nome dela; até lá, o cliente é Pessoa Jurídica e o
                cadastro tem só o CNPJ. Desligado, os campos somem — e são
                limpos, para não gravar meia empresa.
              */}
              <div className="flex items-center gap-3 p-4 bg-elevated rounded-lg border border-border">
                <Switch
                  id="tem-empresa"
                  checked={companyOpen}
                  onCheckedChange={handleToggleCompany}
                />
                <Label htmlFor="tem-empresa" className="font-medium cursor-pointer">
                  Preencher os dados da empresa
                </Label>
              </div>

              {companyOpen && (
                <div className="p-4 bg-violet-50 dark:bg-violet-950/40 rounded-lg border border-violet-200 dark:border-violet-900 space-y-4">
                  <h3 className="text-sm font-bold text-violet-900 dark:text-violet-300 uppercase tracking-wide">
                    🏢 Dados da Empresa
                  </h3>

                  {/*
                    O CNPJ É O MESMO `tax_id` DO CADASTRO, e não um campo novo:
                    ele já é o documento do cliente quando o tipo é Pessoa
                    Jurídica, e a deduplicação do CRM (0015, 0065) trabalha
                    sobre ele. Uma segunda coluna com o mesmo documento seria a
                    primeira coisa a divergir.
                  */}
                  <div className="space-y-2">
                    <Label htmlFor="company_cnpj">CNPJ</Label>
                    <div className="flex gap-2">
                      <MaskedInput
                        id="company_cnpj"
                        mask={maskTaxId}
                        value={formData.tax_id}
                        onValueChange={(value) => setFormData({ ...formData, tax_id: value })}
                        placeholder="00.000.000/0000-00"
                        className="bg-card"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleLookupCnpj}
                        disabled={cnpjLookup.isPending || formData.tax_id.replace(/\D/g, '').length !== 14}
                      >
                        {cnpjLookup.isPending ? 'Buscando...' : 'Buscar'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A busca preenche razão social e endereço da sede a partir do CNPJ. É o mesmo
                      documento da aba anterior.
                    </p>
                  </div>

                  {/* O que a consulta informou e o cadastro NÃO guarda: os dois
                      envelhecem, e um contrato afirmando "ATIVA" com base numa
                      consulta antiga seria uma mentira com data. */}
                  {companyInfo && (
                    <div className="text-xs text-violet-800 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/40 rounded-lg p-3 space-y-1">
                      {companyInfo.status && (
                        <p>
                          <span className="font-medium">Situação na Receita:</span>{' '}
                          {companyInfo.status}
                        </p>
                      )}
                      {companyInfo.mainActivity && (
                        <p>
                          <span className="font-medium">Atividade principal:</span>{' '}
                          {companyInfo.mainActivity}
                        </p>
                      )}
                      <p className="text-violet-700 dark:text-violet-400">
                        Consultado agora, e não guardado no cadastro — situação de empresa muda.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="company_legal_name">Razão Social</Label>
                    <Input
                      id="company_legal_name"
                      maxLength={200}
                      value={formData.company_legal_name}
                      onChange={(e) =>
                        setFormData({ ...formData, company_legal_name: e.target.value })
                      }
                      placeholder="Razão social da empresa"
                      className="bg-card"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_trade_name">Nome Fantasia</Label>
                      <Input
                        id="company_trade_name"
                        maxLength={200}
                        value={formData.company_trade_name}
                        onChange={(e) =>
                          setFormData({ ...formData, company_trade_name: e.target.value })
                        }
                        placeholder="Nome fantasia"
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_state_registration">Inscrição Estadual</Label>
                      <Input
                        id="company_state_registration"
                        maxLength={30}
                        value={formData.company_state_registration}
                        onChange={(e) =>
                          setFormData({ ...formData, company_state_registration: e.target.value })
                        }
                        placeholder="Isento, ou o número"
                        className="bg-card"
                      />
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-violet-900 dark:text-violet-300 uppercase tracking-wide pt-2">
                    Endereço da sede
                  </h4>
                  <p className="text-xs text-muted-foreground -mt-2">
                    O terceiro endereço do cadastro: a pessoa mora num lugar, a obra fica em outro,
                    e a empresa que assina tem o seu.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_address_zipcode">CEP</Label>
                      <MaskedInput
                        id="company_address_zipcode"
                        mask={maskZipcode}
                        value={formData.company_address_zipcode}
                        onValueChange={(value) =>
                          setFormData({ ...formData, company_address_zipcode: value })
                        }
                        placeholder="00000-000"
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_address_district">Bairro</Label>
                      <Input
                        id="company_address_district"
                        value={formData.company_address_district}
                        onChange={(e) =>
                          setFormData({ ...formData, company_address_district: e.target.value })
                        }
                        placeholder="Bairro"
                        className="bg-card"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="company_address_street">Endereço</Label>
                      <Input
                        id="company_address_street"
                        value={formData.company_address_street}
                        onChange={(e) =>
                          setFormData({ ...formData, company_address_street: e.target.value })
                        }
                        placeholder="Rua, avenida..."
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_address_number">Número</Label>
                      <Input
                        id="company_address_number"
                        value={formData.company_address_number}
                        onChange={(e) =>
                          setFormData({ ...formData, company_address_number: e.target.value })
                        }
                        placeholder="Nº"
                        className="bg-card"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_address_city">Cidade</Label>
                      <Input
                        id="company_address_city"
                        value={formData.company_address_city}
                        onChange={(e) =>
                          setFormData({ ...formData, company_address_city: e.target.value })
                        }
                        placeholder="Cidade"
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_address_state">UF</Label>
                      <Input
                        id="company_address_state"
                        maxLength={2}
                        value={formData.company_address_state}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            company_address_state: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="UF"
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_address_complement">Complemento</Label>
                      <Input
                        id="company_address_complement"
                        value={formData.company_address_complement}
                        onChange={(e) =>
                          setFormData({ ...formData, company_address_complement: e.target.value })
                        }
                        placeholder="Sala, andar..."
                        className="bg-card"
                      />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="obra"
              forceMount
              className="space-y-6 mt-4 data-[state=inactive]:hidden"
            >
          {/* ENDEREÇO DA OBRA */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900 space-y-4">
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide">
              🏗️ Endereço da Obra
            </h3>

            {/* Linha 1: CEP da Obra (com auto-preenchimento) */}
            <div className="space-y-2">
              <Label htmlFor="site_zipcode">CEP da Obra</Label>
              <MaskedInput
                id="site_zipcode"
                mask={maskZipcode}
                value={formData.site_zipcode}
                onValueChange={(site_zipcode) => setFormData({ ...formData, site_zipcode })}
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

            </TabsContent>
          </Tabs>

          {/* O rodapé fica FORA das abas: salvar é sobre o cadastro inteiro, e
              não sobre a aba aberta. */}
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
