import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Inbox, Mail, NotebookPen, Phone, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import PageHeader from '@/components/shared/PageHeader'
import { optionsOf, PRODUCT_LEAD_STATUS, type ProductLeadStatus } from '@/lib/enums'
import { filterLeads, linkWhatsapp } from '../fila'
import {
  describeDatabaseError,
  useIsPlatformAdmin,
  useProductLeads,
  useUpdateLead,
} from '../hooks'
import type { LeadFilters, ProductLead } from '../types'

/*
  PAINEL DA FILA DE LEADS — a tela da equipe do produto, e não do escritório.

  POR QUE ELA NÃO TEM ITEM NA BARRA LATERAL
    A barra lateral é montada a partir de `menus` e da matriz de permissão do
    escritório, e esta tela não tem lugar nenhum nessa matriz: não é acesso que
    um Diretor possa conceder, porque não é acesso dele para dar. Chega-se aqui
    pela URL, exatamente como em /RelatorioProdutividade.

  QUEM NEGA O DADO NÃO É ESTA TELA
    É a policy `product_leads_select_platform` (migration 0112). Um Diretor que
    descubra a URL abre esta página e lê ZERO linha, porque a cláusula
    `is_platform_admin()` não casa. O `useIsPlatformAdmin` abaixo existe só para
    não desenhar filtros e cabeçalho de tabela para quem não tem nada a ver com
    isso — é a placa na porta, não a tranca. Tela nunca reimplementa
    autorização (CLAUDE.md).

  O QUE A TELA PODE MEXER, E O QUE NÃO
    Situação e anotação. O e-mail, o nome, a origem e o contador de envios são
    somente leitura — não por escolha de UI, mas por privilégio de coluna: a
    0112 concede `update (status, contacted_at, notes)` e mais nada. Ninguém
    reescreve o que a pessoa digitou na página de venda.
*/

const ESTADOS = optionsOf(PRODUCT_LEAD_STATUS)

/*
  Mapa próprio em vez de StatusBadge: aquele componente é porta do original e é
  indexado pelo RÓTULO, e estes quatro rótulos não existem lá — cairiam todos no
  estilo neutro, que é justamente o que impede de bater o olho e achar o que
  ainda não foi contatado. Mesmo vocabulário de cor do resto do sistema: âmbar é
  espera, azul é informação, esmeralda é concluído, neutro é descartado.
*/
const CORES: Record<ProductLeadStatus, string> = {
  new: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  contacted:
    'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  qualified:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  discarded: 'bg-elevated text-soft border-border',
}

/*
  De onde o lead veio, em português. A lista é fechada na edge function
  (`capture-lead`), então valor fora do mapa significa que a função ganhou um
  bloco novo e este mapa não acompanhou — aparece como está, cru, em vez de
  virar "Outro" e esconder isso.
*/
const BLOCOS: Record<string, string> = {
  hero: 'Topo da página',
  'cta-final': 'Chamada final',
}

export default function Leads() {
  const adminQuery = useIsPlatformAdmin()
  const ehAdmin = adminQuery.data === true
  const leadsQuery = useProductLeads(ehAdmin)
  const atualizar = useUpdateLead()

  const [filters, setFilters] = useState<LeadFilters>({ status: 'all', search: '' })
  const [anotando, setAnotando] = useState<ProductLead | null>(null)
  const [rascunho, setRascunho] = useState('')

  const leads = leadsQuery.data ?? []
  const filtrados = useMemo(() => filterLeads(leads, filters), [leads, filters])

  /* Os contadores são o que faz a fila ser varrida de relance, e por isso são
     clicáveis: contar e filtrar é a mesma pergunta feita duas vezes. */
  const contagem = useMemo(() => {
    const porEstado = { new: 0, contacted: 0, qualified: 0, discarded: 0 }
    for (const lead of leads) porEstado[lead.status] += 1
    return porEstado
  }, [leads])

  function mudarEstado(lead: ProductLead, status: ProductLeadStatus) {
    atualizar.mutate(
      { lead, patch: { status } },
      {
        onSuccess: () => toast.success(`Lead marcado como ${PRODUCT_LEAD_STATUS[status]}`),
        onError: (error) => toast.error('Erro ao atualizar: ' + describeDatabaseError(error)),
      },
    )
  }

  function salvarAnotacao() {
    if (anotando === null) return
    atualizar.mutate(
      /* String vazia vira nulo: "sem anotação" é a ausência, e não um texto em
         branco que a tela depois teria que tratar como se fosse ausência. */
      { lead: anotando, patch: { notes: rascunho.trim() === '' ? null : rascunho.trim() } },
      {
        onSuccess: () => {
          toast.success('Anotação salva')
          setAnotando(null)
        },
        onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
      },
    )
  }

  if (adminQuery.isLoading) {
    return (
      <div className="p-4 sm:p-8 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  /*
    Quem não é da equipe do produto vê a página existir e não ver nada — e é
    melhor do que 404: a URL é real, e dizer "não é seu" é mais honesto do que
    fingir que a tela não existe para quem chegou nela com um link.
  */
  if (!ehAdmin) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          icon={Inbox}
          title="Esta página não é do seu escritório"
          description="A fila de leads é da equipe que faz o HausOne. Sua conta não tem acesso a ela, e nada do seu escritório aparece aqui."
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Leads do HausOne"
        subtitle="Quem deixou e-mail na página de venda do sistema"
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {ESTADOS.map((estado) => (
          <button
            key={estado.value}
            type="button"
            onClick={() =>
              setFilters((atual) => ({
                ...atual,
                /* Clicar no filtro ativo desliga: é o jeito de voltar para
                   "todos" sem procurar outro controle. */
                status: atual.status === estado.value ? 'all' : (estado.value as ProductLeadStatus),
              }))
            }
            aria-pressed={filters.status === estado.value}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              filters.status === estado.value
                ? 'border-primary bg-elevated'
                : 'border-border bg-card hover:bg-elevated'
            }`}
          >
            <p className="text-2xl font-semibold text-foreground">
              {contagem[estado.value as ProductLeadStatus]}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{estado.label}</p>
          </button>
        ))}
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
        <Input
          value={filters.search}
          onChange={(evento) =>
            setFilters((atual) => ({ ...atual, search: evento.target.value }))
          }
          placeholder="Buscar por e-mail, nome, telefone ou escritório"
          className="pl-9"
          aria-label="Buscar lead"
        />
      </div>

      {/* Três estados explícitos, como toda tela de listagem do projeto. */}
      {leadsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar a fila"
          description="A lista de leads não pôde ser lida agora."
          error={leadsQuery.error}
          onRetry={() => {
            void leadsQuery.refetch()
          }}
        />
      ) : leadsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nenhum lead por aqui"
          /* Fila vazia e filtro sem resultado são perguntas diferentes, e a
             segunda linha é a que separa as duas. */
          description={
            leads.length === 0
              ? 'Ninguém deixou e-mail na página ainda. Quando alguém deixar, aparece aqui.'
              : 'Nenhum lead casa com a busca ou a situação escolhida.'
          }
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chegou</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Escritório</TableHead>
                <TableHead>Veio de</TableHead>
                <TableHead>Envios</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Anotação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((lead) => {
                const whatsapp = linkWhatsapp(lead)

                return (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(parseISO(lead.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {/* O e-mail é a única coisa que todo lead tem, e o motivo da
                          tela existir: clicar escreve a mensagem. */}
                      <a href={`mailto:${lead.email}`} className="hover:underline">
                        {lead.email}
                      </a>
                      {lead.name !== null && (
                        <span className="block text-xs text-muted-foreground">{lead.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-soft whitespace-nowrap">
                      {/*
                        O TELEFONE NÃO APARECIA NESTA TELA, e é a correção que
                        trouxe esta célula. A coluna existe desde a migration 0112
                        e é obrigatória desde a 0124, mas a tabela foi escrita
                        antes disso e nunca ganhou a coluna.

                        O botão só existe quando `linkWhatsapp` consegue montar o
                        endereço: lead gravado antes da 0124 tem telefone nulo, e
                        número fora de 10 ou 11 dígitos não é telefone com DDD.
                        Nesses dois casos sobra o texto, sem botão que não levaria
                        a ninguém.
                      */}
                      {lead.phone === null ? (
                        <span className="text-faint">-</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{lead.phone}</span>
                          {whatsapp !== null && (
                            <a
                              href={whatsapp}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Falar no WhatsApp com ${lead.name ?? lead.email}`}
                            >
                              {/* `text-white` explícito e emerald-600: o mesmo
                                  botão do SupplierDrawer, que é o único outro
                                  lugar do sistema que abre WhatsApp. */}
                              <Button
                                size="sm"
                                className="h-7 px-2 bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                <Phone className="w-3.5 h-3.5 mr-1" />
                                WhatsApp
                              </Button>
                            </a>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-soft">{lead.office_name ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {lead.placement === null ? '-' : (BLOCOS[lead.placement] ?? lead.placement)}
                    </TableCell>
                    <TableCell>
                      {/* Reenvio é sinal de interesse, e por isso aparece em vez
                          de ficar escondido no banco. */}
                      {lead.submission_count > 1 ? (
                        <Badge variant="outline" className={`${CORES.qualified} font-medium`}>
                          {lead.submission_count}x
                        </Badge>
                      ) : (
                        <span className="text-faint">1x</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={lead.status}
                        onValueChange={(valor) => mudarEstado(lead, valor as ProductLeadStatus)}
                        disabled={atualizar.isPending}
                      >
                        <SelectTrigger className={`w-40 ${CORES[lead.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS.map((estado) => (
                            <SelectItem key={estado.value} value={estado.value}>
                              {estado.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {lead.contacted_at !== null && (
                        <span className="block text-xs text-faint mt-1">
                          contato em {format(parseISO(lead.contacted_at), 'dd/MM/yyyy')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAnotando(lead)
                          setRascunho(lead.notes ?? '')
                        }}
                      >
                        <NotebookPen className="w-4 h-4 mr-2" />
                        {lead.notes === null ? 'Anotar' : 'Ver nota'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={anotando !== null} onOpenChange={(aberto) => !aberto && setAnotando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anotação do lead</DialogTitle>
            <DialogDescription>{anotando?.email}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rascunho}
            onChange={(evento) => setRascunho(evento.target.value)}
            placeholder="O que foi conversado, o que o escritório precisa, quando voltar a falar"
            rows={6}
            /* O mesmo teto do check `product_leads_notes_len` (migration 0112):
               recusa no banco por texto comprido seria erro para quem só
               escreveu demais. */
            maxLength={2000}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnotando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarAnotacao} disabled={atualizar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
