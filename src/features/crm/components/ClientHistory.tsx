import { Activity, DollarSign, FolderKanban, TrendingUp, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import { PROJECT_STATUS, labelOf } from '@/lib/enums'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import { useClientHistory, type ClientHistory as ClientHistoryData } from '../hooks'

/*
  Porta de projeto-original/src/components/clients/ClientHistory.jsx — mesmos
  quatro indicadores, mesma tabela, mesmas colunas e mesma ordem (mais recente
  primeiro).

  Ficou de fora do módulo 2 com o motivo escrito no cabeçalho de ClientDetail.tsx:
  `projects` e `accounts_receivable` só chegariam nos módulos 5 e 7, e um painel
  de zeros diria "este cliente não fatura nada", que não é verdade — é dado que
  não existia. As duas tabelas subiram; a dívida é esta entrega.

  O QUE MUDA:

  1. A CONSULTA É RECORTADA. O original baixa a lista inteira de projetos e de
     parcelas do escritório e filtra no navegador. Ver `useClientHistory`.

  2. ESTADO DE ERRO. O original não tem: falha de leitura deixa o painel com
     zeros, indistinguível de "cliente sem projeto". Mesma decisão já registrada
     em ClientDetail.tsx para o cadastro em si.

  3. AS CORES SAEM DO TEMA. O original fixa slate/green/blue/orange do Tailwind
     v3 claro; aqui os pares claro/escuro são os mesmos já usados nos crachás do
     resto do sistema.
*/

const RELATIONSHIP: Record<
  ClientHistoryData['relationship'],
  { label: string; className: string }
> = {
  new: { label: 'Novo', className: 'bg-muted text-soft border-border' },
  active: {
    label: 'Ativo',
    className:
      'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  },
  recurring: {
    label: 'Recorrente',
    className:
      'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
  inactive: {
    label: 'Inativo',
    className:
      'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
  },
}

function Indicator({
  label,
  icon: Icon,
  iconClassName,
  children,
  hint,
}: {
  label: string
  icon: LucideIcon
  iconClassName: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground mb-1">{label}</p>
          {children}
          {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconClassName}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  )
}

export default function ClientHistory({ clientId }: { clientId: string }) {
  const historyQuery = useClientHistory(clientId)

  if (historyQuery.isLoading) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Histórico do Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (historyQuery.isError) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Histórico do Cliente</h3>
        <ErrorState
          title="Não foi possível carregar o histórico"
          description="Os projetos e o faturamento deste cliente não foram lidos. O que aparece abaixo estaria errado, então não é mostrado."
          error={historyQuery.error}
          onRetry={() => {
            void historyQuery.refetch()
          }}
        />
      </div>
    )
  }

  const history = historyQuery.data
  if (!history) return null

  const relationship = RELATIONSHIP[history.relationship]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Histórico do Cliente</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Indicator
            label="Projetos"
            icon={FolderKanban}
            iconClassName="bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
          >
            <p className="text-2xl font-bold text-foreground">{history.totalProjects}</p>
          </Indicator>

          <Indicator
            label="Valor Total Faturado"
            icon={DollarSign}
            iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            <p className="text-2xl font-bold text-foreground">
              {formatCurrencyBRL(history.totalRevenue)}
            </p>
          </Indicator>

          <Indicator
            label="Ticket Médio"
            icon={TrendingUp}
            iconClassName="bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
            hint={history.totalProjects > 0 ? 'por projeto' : undefined}
          >
            <p className="text-2xl font-bold text-foreground">
              {formatCurrencyBRL(history.averageTicket)}
            </p>
          </Indicator>

          <Indicator
            label="Status do Relacionamento"
            icon={Activity}
            iconClassName="bg-muted text-soft"
          >
            <Badge className={`${relationship.className} mt-2 text-sm font-medium px-3 py-1`}>
              {relationship.label}
            </Badge>
          </Indicator>
        </div>
      </div>

      {history.projects.length > 0 ? (
        <div>
          <h4 className="text-base font-semibold text-foreground mb-3">Projetos do Cliente</h4>
          <Card className="overflow-hidden">
            {/* A tabela rola dentro do próprio container: sem isto a página
                inteira ganha rolagem horizontal no celular. */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-elevated border-b border-border">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                      Projeto
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                      Cidade / UF
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                      Valor Faturado
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                      Última Atividade
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.projects.map((project) => (
                    <tr key={project.id} className="hover:bg-elevated transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{project.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={labelOf(PROJECT_STATUS, project.status)} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {project.city && project.state
                            ? `${project.city} / ${project.state}`
                            : (project.city ?? project.state ?? '-')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-foreground">
                          {formatCurrencyBRL(project.revenue)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {formatDateBR(project.lastActivity.slice(0, 10))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/*
            SÓ APARECE QUANDO OS DOIS NÚMEROS DIVERGEM, e existe para uma pergunta
            que o painel do original provoca e não responde: por que o total
            faturado é maior que a soma da coluna. A resposta é que há parcela
            paga do cliente sem projeto vinculado. Nenhum número muda — muda só a
            chance de isso ser lido como erro de conta.
          */}
          {history.unassignedRevenue > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {formatCurrencyBRL(history.unassignedRevenue)} do total faturado não está vinculado a
              um projeto e por isso não aparece na coluna acima.
            </p>
          )}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum projeto vinculado a este cliente.</p>
        </Card>
      )}
    </div>
  )
}
