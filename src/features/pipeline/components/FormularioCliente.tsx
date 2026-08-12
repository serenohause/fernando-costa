import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CLIENT_TYPE, optionsOf, type ClientType } from '@/lib/enums'
import { firstIssueMessage } from '@/lib/db-errors'
import { useLookupZipcode } from '@/features/crm/hooks'
import { useOpenClientIntake, useSubmitClientIntake } from '../hooks'
import type { IntakeBriefing } from '../types'

/*
  Porta de projeto-original/src/pages/FormularioCliente.jsx.

  ROTA PÚBLICA: fica FORA do AppLayout, não exige login e não tem sidebar — como
  no original, onde a página é registrada com `requiresAuth: false`.

  Os três passos, os títulos, a barra de progresso numerada, a ordem dos campos,
  os placeholders, o preenchimento por CEP e o texto dos botões (inclusive o
  "Salvar e Enviar ✅") são os do original. As quatro telas de recusa/confirmação
  também: "Link Inválido", "Link Inválido ou Expirado", "Link Expirado" e "Dados
  Enviados com Sucesso", cada uma com o mesmo ícone, a mesma cor e o mesmo texto.

  O QUE MUDA, E É O MOTIVO DE ESTE MÓDULO EXISTIR:

  O TOKEN NUNCA É RESOLVIDO NO NAVEGADOR. O original faz, nesta página pública,
  `ClientIntake.list()` seguido de `find(i => i.token === token)` (linhas 55-56):
  baixa a lista INTEIRA de briefings — nome, WhatsApp, e-mail, CPF/CNPJ,
  nascimento e dois endereços de todo mundo — antes de validar coisa alguma.
  Aqui a tela chama uma edge function, a edge function chama
  `public.open_client_intake`, e o que volta são três campos: desfecho, nome do
  cliente e fim da validade. A tela não conhece a tabela.

  Consequência visível: o formulário nasce EM BRANCO mesmo quando reaberto, o que
  também é o comportamento do original (ele carrega o intake mas nunca preenche o
  estado com ele).

  A EXPIRAÇÃO É DECIDIDA NO SERVIDOR. No original é o navegador que compara
  `new Date()` com `expira_em` (linha 70) — relógio atrasado, ou requisição
  montada à mão, reabrem um link vencido. Aqui a comparação está dentro da função
  de banco, e é refeita no envio.

  UMA TELA A MAIS QUE O ORIGINAL NÃO TEM: falha de rede ou do servidor. No
  original, qualquer erro que não fosse "NAO_ENCONTRADO" caía em `if (!intake)
  return null` — página em branco, sem explicação e sem como tentar de novo. A
  tela nova usa a mesma moldura de cartão das outras quatro.
*/

type FormValues = {
  full_name: string
  phone: string
  email: string
  city: string
  state: string
  country: string

  client_type: ClientType | ''
  tax_id: string
  birth_date: string
  address_zipcode: string
  address_city: string
  address_state: string
  address_street: string
  address_number: string
  address_district: string
  address_complement: string

  site_zipcode: string
  site_city: string
  site_state: string
  site_street: string
  site_number: string
  site_district: string
  site_complement: string
}

const EMPTY: FormValues = {
  full_name: '',
  phone: '',
  email: '',
  city: '',
  state: '',
  country: 'Brasil',
  client_type: '',
  tax_id: '',
  birth_date: '',
  address_zipcode: '',
  address_city: '',
  address_state: '',
  address_street: '',
  address_number: '',
  address_district: '',
  address_complement: '',
  site_zipcode: '',
  site_city: '',
  site_state: '',
  site_street: '',
  site_number: '',
  site_district: '',
  site_complement: '',
}

function toBriefing(values: FormValues): IntakeBriefing {
  const briefing: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    const trimmed = value.trim()
    if (trimmed !== '') briefing[key] = trimmed
  }
  return briefing as IntakeBriefing
}

export default function FormularioCliente() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<FormValues>(EMPTY)

  const intakeQuery = useOpenClientIntake(token)
  const submitMutation = useSubmitClientIntake(token)

  const addressZipcode = useLookupZipcode()
  const siteZipcode = useLookupZipcode()

  /* Passo 2: o CEP preenche logradouro, bairro, cidade e estado — como no
     original (`handleCepBlur(cep, 'cliente')`). */
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

  /* Passo 3: só logradouro e bairro, como no original — cidade e estado da obra
     têm campo próprio e não são sobrescritos pelo CEP. */
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

    /*
      SÓ O ÚLTIMO PASSO ENVIA — e esta guarda não é zelo, é o conserto de um
      defeito que chegou às mãos do cliente.

      "Próximo" e "Salvar e Enviar" são o mesmo elemento na mesma posição do
      JSX, trocados por um ternário. Ao sair do passo 2, o React NÃO troca o
      botão: ele reaproveita o mesmo nó do DOM e só troca o atributo `type` de
      `button` para `submit`. O clique já aconteceu, mas o navegador só resolve
      a ação padrão dele DEPOIS que o React terminou de aplicar a mudança — e
      então lê `type="submit"` e envia o formulário. Por isso o passo 1 para o 2
      funcionava e só o 2 para o 3 quebrava.

      O sintoma: o briefing era gravado sem NADA do passo 3, e a pessoa caía na
      tela de sucesso sem ter preenchido o endereço da obra. Aconteceu duas
      vezes em produção — os dois envios têm todos os campos `site_*` nulos.

      As chaves distintas nos dois botões (mais abaixo) fazem o React desmontar
      um e montar o outro, então o nó clicado deixa de existir e a ação padrão
      não encontra formulário para enviar. Esta guarda é a segunda barreira, e
      é ela que também cobre o Enter dentro de um campo dos passos 1 e 2.
    */
    if (currentStep < 3) return

    submitMutation.mutate(toBriefing(formData), {
      onSuccess: () => {
        toast.success('Dados enviados com sucesso!')
      },
      onError: (error) => {
        /*
          Campo mínimo do original: nome, e telefone OU e-mail. A mensagem sai do
          schema quando a recusa é local, e da edge function quando é do
          servidor — as duas dizem a mesma coisa.
        */
        toast.error(
          firstIssueMessage(error) ??
            (error instanceof Error ? error.message : 'Erro ao enviar dados'),
        )
        /* Link recusado pelo servidor (expirou ou já foi enviado no meio do
           preenchimento): a reabertura já foi invalidada pelo hook e a tela troca
           sozinha para o desfecho certo. */
      },
    })
  }

  if (token === '') {
    return (
      <MessageCard tone="rose" icon={XCircle} title="Link Inválido">
        Link inválido. Solicite um novo link ao escritório.
      </MessageCard>
    )
  }

  if (intakeQuery.isLoading) {
    return (
      <PublicShell>
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3">
              <Clock className="w-5 h-5 animate-spin text-soft" />
              <p className="text-soft">Carregando...</p>
            </div>
          </CardContent>
        </Card>
      </PublicShell>
    )
  }

  if (intakeQuery.isError) {
    return (
      <MessageCard tone="rose" icon={AlertCircle} title="Não foi possível abrir o formulário">
        <p className="text-soft mb-4">
          Houve uma falha ao contatar o escritório. Verifique sua conexão e tente de novo.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void intakeQuery.refetch()
          }}
        >
          Tentar novamente
        </Button>
      </MessageCard>
    )
  }

  const intake = intakeQuery.data
  if (!intake || intake.outcome === 'not_found') {
    return (
      <MessageCard tone="rose" icon={XCircle} title="Link Inválido ou Expirado">
        Este link não é válido ou já expirou. Solicite um novo link ao escritório.
      </MessageCard>
    )
  }

  if (intake.outcome === 'expired') {
    return (
      <MessageCard tone="amber" icon={Clock} title="Link Expirado">
        Este link expirou. Solicite um novo link ao escritório.
      </MessageCard>
    )
  }

  if (intake.outcome === 'already_submitted') {
    return (
      <MessageCard tone="emerald" icon={CheckCircle2} title="Dados Enviados com Sucesso">
        Seus dados foram recebidos com sucesso. Entraremos em contato em breve!
      </MessageCard>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              Formulário de Cadastro - {intake.clientName}
            </CardTitle>
            <CardDescription>Preencha seus dados para prosseguir com o projeto</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress Steps */}
            <div className="flex items-center justify-between mb-8">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                      currentStep >= step
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`flex-1 h-1 mx-2 ${currentStep > step ? 'bg-primary' : 'bg-muted'}`}
                    />
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Passo 1 - Dados Iniciais */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Dados Iniciais</h3>

                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nome Completo *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Seu nome completo"
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
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="seu@email.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Cidade"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state">Estado</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="UF"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="country">País</Label>
                      <Input
                        id="country"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Brasil"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Passo 2 - Dados Complementares */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground mb-4">
                    Dados Complementares
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client_type">Tipo de Cliente</Label>
                      <Select
                        value={formData.client_type}
                        onValueChange={(value) =>
                          setFormData({ ...formData, client_type: value as ClientType })
                        }
                      >
                        <SelectTrigger id="client_type">
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

                  <div className="space-y-2">
                    <Label htmlFor="birth_date">Data de Nascimento</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_zipcode">CEP</Label>
                    <Input
                      id="address_zipcode"
                      value={formData.address_zipcode}
                      onChange={(e) =>
                        setFormData({ ...formData, address_zipcode: e.target.value })
                      }
                      onBlur={(e) => handleAddressZipcodeBlur(e.target.value)}
                      placeholder="00000-000"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="address_city">Cidade</Label>
                      <Input
                        id="address_city"
                        value={formData.address_city}
                        onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address_state">Estado</Label>
                      <Input
                        id="address_state"
                        value={formData.address_state}
                        onChange={(e) =>
                          setFormData({ ...formData, address_state: e.target.value })
                        }
                        placeholder="UF"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="address_street">Logradouro</Label>
                      <Input
                        id="address_street"
                        value={formData.address_street}
                        onChange={(e) =>
                          setFormData({ ...formData, address_street: e.target.value })
                        }
                        placeholder="Rua, avenida..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address_number">Número</Label>
                      <Input
                        id="address_number"
                        value={formData.address_number}
                        onChange={(e) =>
                          setFormData({ ...formData, address_number: e.target.value })
                        }
                        placeholder="Nº"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_district">Bairro</Label>
                    <Input
                      id="address_district"
                      value={formData.address_district}
                      onChange={(e) =>
                        setFormData({ ...formData, address_district: e.target.value })
                      }
                      placeholder="Bairro"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_complement">Complemento</Label>
                    <Input
                      id="address_complement"
                      value={formData.address_complement}
                      onChange={(e) =>
                        setFormData({ ...formData, address_complement: e.target.value })
                      }
                      placeholder="Apto, sala, bloco..."
                    />
                  </div>
                </div>
              )}

              {/* Passo 3 - Endereço da Obra */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Endereço da Obra</h3>

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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="site_city">Cidade da Obra</Label>
                      <Input
                        id="site_city"
                        value={formData.site_city}
                        onChange={(e) => setFormData({ ...formData, site_city: e.target.value })}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="site_state">Estado da Obra</Label>
                      <Input
                        id="site_state"
                        value={formData.site_state}
                        onChange={(e) => setFormData({ ...formData, site_state: e.target.value })}
                        placeholder="UF"
                      />
                    </div>
                  </div>

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
                      <Label htmlFor="site_number">Número</Label>
                      <Input
                        id="site_number"
                        value={formData.site_number}
                        onChange={(e) => setFormData({ ...formData, site_number: e.target.value })}
                        placeholder="Nº"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="site_district">Bairro da Obra</Label>
                    <Input
                      id="site_district"
                      value={formData.site_district}
                      onChange={(e) => setFormData({ ...formData, site_district: e.target.value })}
                      placeholder="Bairro"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="site_complement">Complemento da Obra</Label>
                    <Input
                      id="site_complement"
                      value={formData.site_complement}
                      onChange={(e) =>
                        setFormData({ ...formData, site_complement: e.target.value })
                      }
                      placeholder="Apto, sala, bloco..."
                    />
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t border-border">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCurrentStep(currentStep - 1)}
                  >
                    Voltar
                  </Button>
                )}
                {currentStep < 3 ? (
                  <Button
                    key="proximo"
                    type="button"
                    onClick={() => setCurrentStep(currentStep + 1)}
                    className="ml-auto bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Próximo
                  </Button>
                ) : (
                  <Button
                    key="enviar"
                    type="submit"
                    disabled={submitMutation.isPending}
                    className="ml-auto bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {submitMutation.isPending ? 'Enviando...' : 'Salvar e Enviar ✅'}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* A moldura das quatro telas de recusa/confirmação do original: página inteira,
   degradê de fundo, cartão centrado de no máximo 2xl. */
function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-6">
      {children}
    </div>
  )
}

const TONE_CLASS = {
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
} as const

function MessageCard({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof TONE_CLASS
  icon: typeof XCircle
  title: string
  children: ReactNode
}) {
  return (
    <PublicShell>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className={`flex items-center gap-3 ${TONE_CLASS[tone]}`}>
            <Icon className="w-8 h-8" />
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {typeof children === 'string' ? <p className="text-soft">{children}</p> : children}
        </CardContent>
      </Card>
    </PublicShell>
  )
}
