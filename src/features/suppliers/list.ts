import { normalizeText } from '@/lib/format'
import type { SupplierRow } from './types'

/*
  O que a tela de Fornecedores calcula EM MEMÓRIA, sobre as linhas que o hook já
  devolveu. Tipologia, nível de parceria e status viram WHERE em `useSuppliers`;
  a busca por texto fica aqui.

  Fica fora do componente pela regra do CLAUDE.md — lógica não mora no JSX — e
  fora de hooks.ts porque não toca no Supabase.
*/

/*
  O campo "Buscar por nome ou marca..." (Fornecedores.jsx:122-124): procura no
  nome do fornecedor e no nome de cada marca representada.

  DUAS DIFERENÇAS EM RELAÇÃO AO ORIGINAL, e nenhuma muda o que a tela acha:

  - Acento é ignorado, com `normalizeText` — o mesmo tratamento que a busca do
    financeiro (módulo 7) e do CRM já dão. O original compara `toLowerCase()`
    puro, então "ceramica" não acha "Cerâmica"; isso é bug de busca, não layout.
  - As marcas vêm de `supplier_brands` (embed), e não do array dentro da linha.

  SEM corte mínimo de caracteres: o original filtra a partir da primeira letra
  digitada, ao contrário da tela de Pagamentos. Fica como está.
*/
export function filterSuppliersBySearch(rows: SupplierRow[], term: string): SupplierRow[] {
  if (!term.trim()) return rows

  const needle = normalizeText(term)

  return rows.filter(
    (row) =>
      normalizeText(row.name).includes(needle) ||
      row.brands.some((brand) => normalizeText(brand.name).includes(needle)),
  )
}

/*
  Os fornecedores SUGERIDOS para uma categoria de item de orçamento
  (ItemOrcamentoForm.jsx:43-47).

  A regra é a do original, inclusive o que ela tem de estranho:

  1. Sem categoria escolhida, a lista é a lista inteira.
  2. Com categoria, ficam os do MESMO valor (é o enum compartilhado
     `supplier_category` que torna a comparação possível — migration 0048) que
     não estejam inativos.
  3. Se ninguém sobrar, a lista volta a ser a INTEIRA, inclusive os inativos —
     é o `filtrados.length > 0 ? filtrados : fornecedores` do original.

  CONSEQUÊNCIA HERDADA, registrada na migration 0048: item de categoria
  `waterproofing`, `drywall_plaster`, `facade_cladding` ou `pool_cladding` nunca
  terá sugestão própria, porque fornecedor nenhum pode ter essas tipologias — cai
  sempre no item 3.

  Mora aqui, e não na feature de orçamento, porque é uma pergunta sobre o
  CADASTRO DE FORNECEDORES; quem a faz é a tela de orçamento.
*/
export function suggestSuppliersForCategory<T extends { category: string; status: string }>(
  suppliers: T[],
  category: string | null | undefined,
): T[] {
  if (!category) return suppliers

  const matching = suppliers.filter(
    (supplier) => supplier.category === category && supplier.status !== 'inactive',
  )
  return matching.length > 0 ? matching : suppliers
}
