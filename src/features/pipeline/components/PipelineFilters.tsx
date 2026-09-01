import { Filter, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LEAD_ORIGIN, labelOf } from '@/lib/enums'
import { useServiceTypes } from '@/features/settings/hooks'
import type { Collaborator } from '@/features/team/types'
import type { NegotiationRow } from '../types'
import type { PipelineFilterState } from '../filters'

/*
  Porta de projeto-original/src/components/negociacoes/PipelineFilters.jsx.

  DIVERGÊNCIA CONSCIENTE, E ELA PRECISA DE DECISÃO DO USUÁRIO:

  este componente existe no original mas a página Negociacoes.jsx NUNCA o
  renderiza — ela monta um campo de busca solto (linhas 681-691) e o import de
  PipelineFilters não existe lá. O componente é código morto naquele
  repositório.

  Ele entra aqui porque o pedido do módulo 3 lista "filtros" como parte da tela,
  e porque a barra de busca que ele contém é exatamente a mesma do original —
  mesmo ícone, mesmo placeholder, mesmo `pl-10` — então nada da tela do original
  se perde: o que se ganha é a linha de selects abaixo dela. Se a intenção era
  manter a página como o original a renderiza, é só não montar este componente e
  voltar ao campo de busca solto; a busca em si não muda.

  As opções dos selects: no original elas saem dos VALORES presentes nas
  negociações carregadas (`[...new Set(...)]`). Cidade e origem continuam assim.
  Tipo de serviço passa a sair do enum, porque o valor gravado agora é
  `architecture` e o texto na tela é "Arquitetura" — derivar do dado daria uma
  lista de chaves em inglês, fora de ordem.
*/
export default function PipelineFilters({
  searchTerm,
  onSearchChange,
  filters,
  onFilterChange,
  collaborators,
  negotiations,
}: {
  searchTerm: string
  onSearchChange: (term: string) => void
  filters: PipelineFilterState
  onFilterChange: (key: keyof PipelineFilterState, value: string) => void
  collaborators: Collaborator[]
  negotiations: NegotiationRow[]
}) {
  const serviceTypes = useServiceTypes().data ?? []

  const cities = [
    ...new Set(negotiations.map((n) => n.client?.address_city).filter(Boolean)),
  ].sort() as string[]

  const origins = [...new Set(negotiations.map((n) => n.origin).filter(Boolean))].sort() as
    NonNullable<NegotiationRow['origin']>[]

  const activeFiltersCount = Object.values(filters).filter((v) => v && v !== 'todos').length

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
          <Input
            placeholder="Buscar por negociação, cliente ou responsável..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        {activeFiltersCount > 0 && (
          <Badge variant="secondary" className="h-9 px-3">
            <Filter className="w-3 h-3 mr-1" />
            {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro' : 'filtros'}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filters.owner} onValueChange={(v) => onFilterChange('owner', v)}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {collaborators
              .filter((c) => c.area === 'commercial' || c.role === 'director')
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={filters.city} onValueChange={(v) => onFilterChange('city', v)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as cidades</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.service} onValueChange={(v) => onFilterChange('service', v)}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue placeholder="Tipo de Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {serviceTypes.map((type) => (
              <SelectItem key={type.id} value={type.key}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.origin} onValueChange={(v) => onFilterChange('origin', v)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as origens</SelectItem>
            {origins.map((origin) => (
              <SelectItem key={origin} value={origin}>
                {labelOf(LEAD_ORIGIN, origin)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.valueRange} onValueChange={(v) => onFilterChange('valueRange', v)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Valor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os valores</SelectItem>
            <SelectItem value="ate50k">Até R$ 50mil</SelectItem>
            <SelectItem value="50a100k">R$ 50 - 100mil</SelectItem>
            <SelectItem value="100a200k">R$ 100 - 200mil</SelectItem>
            <SelectItem value="acima200k">Acima de R$ 200mil</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
