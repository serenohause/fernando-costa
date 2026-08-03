import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Calendar, Filter, Users, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { FinancialStatusFilter, ReceivableRow } from '../types'

/*
  Porta de projeto-original/src/components/financial/FinancialFilters.jsx.

  PRECISA SER DITO ANTES DE MAIS NADA: este componente NÃO É USADO no original.
  Nenhuma página o importa — `AccountsReceivable.jsx` e `AccountsPayable.jsx`
  desenham os próprios botões de status em marcação solta (linhas 679-720 e
  987-1029), com outra paleta (rosa para atraso, azul para previsto, esmeralda
  para pago) e outro raio de borda (`rounded-lg`), e o filtro de cliente é um
  `<input>` cru, sem sugestões. Ele foi portado porque foi pedido, e fica aqui
  como o que é: um componente pronto e desligado.

  QUEM FOR MONTAR AS DUAS TELAS PRECISA ESCOLHER, e a escolha é do usuário, não
  de quem implementa: usar ESTE componente muda a aparência dos filtros em
  relação ao que está no ar hoje. Fidelidade ao original é reproduzir os botões
  soltos das páginas; usar este arquivo é adotar um desenho que existe no
  repositório e nunca chegou à tela.

  O que foi preservado, classe por classe: os cinco botões de período, os quatro
  de status com a bolinha de contagem, o campo de cliente com sugestão a partir
  de dois caracteres, o teto de cinco sugestões, o crachá escuro do cliente
  escolhido com o "x", e as duas caixas de resposta ("Nenhum cliente
  encontrado"). O `framer-motion` do original é o `motion` que este projeto já
  usa, com o mesmo `whileHover`/`whileTap`.

  DUAS DIFERENÇAS DE API, e as duas são consequência do schema:

  1. A prop `clients` do original é declarada e NUNCA usada — a lista de
     clientes disponíveis sai dos próprios recebíveis. Não foi portada: prop que
     ninguém lê é superfície que envelhece sozinha.
  2. `r.client_name` deixou de existir (migration 0041, item 1) e virou o embed
     `r.client`. A lista de clientes disponíveis passa a sair dele, ou seja, do
     nome ATUAL do cadastro — no original ela sai da cópia congelada no momento
     em que a parcela nasceu.
*/

type PeriodFilter = 'month' | '30' | '60' | '90' | 'all'

/*
  O filtro de período NÃO é o mesmo recorte de `MonthYearFilter`, e as duas telas
  usam o segundo. "Próximos 30/60/90 dias" não existe em nenhuma consulta deste
  módulo — quem adotar este componente precisa implementá-lo, porque no original
  ele nunca chegou a ser ligado a nada.
*/
const periodOptions: { value: PeriodFilter; label: string }[] = [
  { value: 'month', label: 'Mês Atual' },
  { value: '30', label: 'Próximos 30 dias' },
  { value: '60', label: 'Próximos 60 dias' },
  { value: '90', label: 'Próximos 90 dias' },
  { value: 'all', label: 'Todos' },
]

/*
  Os rótulos são os deste componente ("Atrasados", "Previstos"), e não os das
  páginas ("Em atraso", "Previsto"). Os valores batem com `FinancialStatusFilter`
  — é o mesmo recorte que `countFinancialByStatus` conta.
*/
const statusOptions: { value: FinancialStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'paid', label: 'Pagos' },
  { value: 'pending', label: 'Previstos' },
]

const BUTTON_BASE = 'px-4 py-2.5 rounded-xl text-sm font-medium transition-all'
const BUTTON_ACTIVE = 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
const BUTTON_IDLE =
  'bg-card text-soft border border-border hover:border-faint hover:bg-elevated'

export default function FinancialFilters({
  periodFilter,
  setPeriodFilter,
  statusFilter,
  setStatusFilter,
  statusCounts = {},
  clientFilter,
  setClientFilter,
  receivables = [],
}: {
  periodFilter: PeriodFilter
  setPeriodFilter: (value: PeriodFilter) => void
  statusFilter: FinancialStatusFilter
  setStatusFilter: (value: FinancialStatusFilter) => void
  statusCounts?: Partial<Record<FinancialStatusFilter, number>>
  clientFilter: string
  /* Opcional como no original: sem ele, o bloco de cliente não é desenhado. */
  setClientFilter?: (value: string) => void
  receivables?: ReceivableRow[]
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Clientes únicos que aparecem nos recebíveis
  const availableClients = useMemo(() => {
    const uniqueClients = new Map<string, string>()
    receivables.forEach((r) => {
      if (r.client_id && r.client) {
        uniqueClients.set(r.client_id, r.client.name)
      }
    })
    return Array.from(uniqueClients, ([id, name]) => ({ id, name }))
  }, [receivables])

  // Filtrar clientes baseado no termo de busca
  const filteredClients = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return []
    const term = searchTerm.toLowerCase()
    return availableClients.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 5)
  }, [searchTerm, availableClients])

  const handleClientSelect = (client: { id: string; name: string }) => {
    setClientFilter?.(client.id)
    setSearchTerm(client.name)
    setShowSuggestions(false)
  }

  const handleClearClient = () => {
    setClientFilter?.('')
    setSearchTerm('')
    setShowSuggestions(false)
  }

  const selectedClient = useMemo(() => {
    if (!clientFilter) return null
    return availableClients.find((c) => c.id === clientFilter)
  }, [clientFilter, availableClients])

  return (
    <div className="space-y-4 mb-6">
      {/* Filtro de Período */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-soft">Período</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <motion.button
              key={option.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setPeriodFilter(option.value)}
              className={`${BUTTON_BASE} ${periodFilter === option.value ? BUTTON_ACTIVE : BUTTON_IDLE}`}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Filtro de Status */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-soft">Status</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => {
            const count = statusCounts[option.value]
            return (
              <motion.button
                key={option.value}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStatusFilter(option.value)}
                className={`${BUTTON_BASE} ${statusFilter === option.value ? BUTTON_ACTIVE : BUTTON_IDLE}`}
              >
                {option.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      statusFilter === option.value
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Filtro de Cliente */}
      {setClientFilter && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-soft">Cliente</span>
          </div>
          <div className="relative max-w-sm">
            {selectedClient ? (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium flex-1">{selectedClient.name}</span>
                <button
                  onClick={handleClearClient}
                  className="p-1 hover:bg-primary-foreground/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Input
                  type="text"
                  placeholder="Filtrar por cliente..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setShowSuggestions(e.target.value.length >= 2)
                  }}
                  onFocus={() => searchTerm.length >= 2 && setShowSuggestions(true)}
                  className="pl-10"
                />
                <Users className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />

                {showSuggestions && filteredClients.length > 0 && (
                  <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                    {filteredClients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => handleClientSelect(client)}
                        className="w-full px-4 py-3 text-left hover:bg-elevated transition-colors flex items-center gap-3 border-b border-border last:border-0"
                      >
                        <Users className="w-4 h-4 text-faint" />
                        <span className="text-sm text-foreground">{client.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {showSuggestions && searchTerm.length >= 2 && filteredClients.length === 0 && (
                  <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg z-10 px-4 py-3">
                    <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
