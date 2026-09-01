import type { ContractStatus } from '@/lib/enums'
import type { ContractRow } from './types'

/*
  A ordenação e os filtros da lista de contratos, fora do componente.

  ORDEM (Contracts.jsx:68-83): contrato arrastado tem `display_order` e vem
  primeiro, na ordem em que foi arrastado; o resto cai no critério seguinte, que
  é o NÚMERO do contrato em ordem decrescente — comparado pelos dígitos, porque
  "FC-2026-018" e "2024-001" não se comparam como texto.

  A única tradução: no original o teste é `ordem_exibicao !== undefined`, porque
  o base44 simplesmente não devolve o campo quando ele nunca foi gravado. Aqui a
  coluna existe e é nula até alguém arrastar (migration 0029), então o teste é
  por nulo. Mesmo desfecho em tela.
*/
function orderNumber(contract: ContractRow): number {
  const digits = (contract.contract_number || '0').replace(/\D/g, '')
  return Number.parseInt(digits, 10) || 0
}

export function sortContracts(contracts: ContractRow[]): ContractRow[] {
  return [...contracts].sort((a, b) => {
    if (a.display_order != null && b.display_order != null) {
      return a.display_order - b.display_order
    }
    if (a.display_order != null) return -1
    if (b.display_order != null) return 1
    return orderNumber(b) - orderNumber(a)
  })
}

/*
  'kanban' NÃO É UM STATUS — é a aba do quadro, e entra aqui porque as abas e o
  filtro compartilham o mesmo estado desde o original. `filterContracts` a trata
  como 'all': o quadro mostra todas as colunas, e o que ele recorta é a BUSCA,
  não o status.
*/
export type StatusFilter = ContractStatus | 'all' | 'kanban'

/*
  Busca e filtro em memória, como no original (Contracts.jsx:736-749): número do
  contrato, nome do cliente e nome do projeto. O nome do cliente vem do embed —
  `client_name` saiu do schema porque a lista quer o nome ATUAL do cadastro — e
  não do snapshot `client_legal_name`, que é o nome da assinatura e pode estar
  legitimamente diferente.
*/
export function filterContracts(
  contracts: ContractRow[],
  statusFilter: StatusFilter,
  searchTerm: string,
): ContractRow[] {
  const filtered =
    statusFilter === 'all' || statusFilter === 'kanban'
      ? contracts
      : contracts.filter((contract) => contract.status === statusFilter)

  const term = searchTerm.trim().toLowerCase()
  if (!term) return filtered

  return filtered.filter(
    (contract) =>
      contract.contract_number?.toLowerCase().includes(term) ||
      contract.client?.name?.toLowerCase().includes(term) ||
      contract.project_name?.toLowerCase().includes(term),
  )
}
