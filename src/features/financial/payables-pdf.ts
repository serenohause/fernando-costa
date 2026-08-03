import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { EXPENSE_CATEGORY, FINANCIAL_STATUS, labelOf } from '@/lib/enums'
import type { FinancialStatusFilter, PayableRow } from './types'

/*
  "Exportar PDF" da tela de Pagamentos (AccountsPayable.jsx:555-707).

  O relatório é o do original, bloco por bloco: cabeçalho com período, status e
  data de geração; "Resumo do Mês" com total e número de lançamentos; a tabela de
  distribuição por categoria; o "gráfico" de barras desenhado com retângulos; a
  tabela de lançamentos detalhados; e a linha de total no rodapé. Tamanhos de
  fonte, coordenadas, avanços de linha, temas de tabela e as cores dos retângulos
  são os mesmos.

  MORA FORA DO COMPONENTE porque é lógica, não marcação — regra do CLAUDE.md. O
  `toast` de sucesso fica na tela, que é de onde ele aparece.

  DUAS COISAS QUE MUDAM, E NENHUMA APARECE NO PDF:

  1. `doc.setFont(undefined, 'bold')` do original vira `doc.setFont('helvetica',
     'bold')`. `undefined` ali quer dizer "mantém a família atual", e a família
     atual de um jsPDF recém-criado É helvetica.
  2. `doc.autoTable(...)` vira `autoTable(doc, ...)`, que é a API da versão atual
     do jspdf-autotable. Mesma tabela, mesma chamada por baixo.

  Os valores são formatados com `toLocaleString('pt-BR')`, e não com
  `formatCurrencyBRL`: o Intl de moeda separa "R$" do número com espaço
  inquebrável, que nas fontes padrão do jsPDF não é o mesmo glifo do espaço que o
  original imprime.
*/

type WithLastAutoTable = jsPDF & { lastAutoTable?: { finalY: number } }

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/* Os rótulos do original (linhas 573-578) — "Previsto" para o filtro `pending`,
   e não "Pendente". */
const STATUS_LABELS: Record<FinancialStatusFilter, string> = {
  all: 'Todos',
  overdue: 'Em atraso',
  pending: 'Previsto',
  paid: 'Pago',
}

const HEAD_FILL: [number, number, number] = [15, 23, 42]

function money(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateBR(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export function exportPayablesPDF({
  rows,
  total,
  statusFilter,
  period,
}: {
  rows: PayableRow[]
  total: number
  statusFilter: FinancialStatusFilter
  period: Date
}) {
  const doc = new jsPDF() as WithLastAutoTable
  const month = period.getMonth()
  const year = period.getFullYear()
  let currentY = 20

  // Cabeçalho
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Pagamentos', 14, currentY)
  currentY += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${MONTH_NAMES[month]}/${year}`, 14, currentY)
  currentY += 6

  doc.text(`Status: ${STATUS_LABELS[statusFilter]}`, 14, currentY)
  currentY += 6
  doc.text(
    `Data de geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`,
    14,
    currentY,
  )
  currentY += 10

  // KPIs do mês
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumo do Mês', 14, currentY)
  currentY += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Total do Mês: R$ ${money(total)}`, 14, currentY)
  currentY += 6
  doc.text(`Número de Lançamentos: ${rows.length}`, 14, currentY)
  currentY += 10

  // Totais por categoria
  const categoryTotals = new Map<string, { count: number; total: number }>()
  rows.forEach((row) => {
    /* O original usa 'Sem categoria' quando o campo é vazio. A coluna é NOT NULL
       desde a 0041, então o ramo não é alcançável — fica escrito para que a
       ausência do rótulo não vire "undefined" se um dia for. */
    const label = labelOf(EXPENSE_CATEGORY, row.category) || 'Sem categoria'
    const current = categoryTotals.get(label) ?? { count: 0, total: 0 }
    categoryTotals.set(label, { count: current.count + 1, total: current.total + (row.value ?? 0) })
  })

  const categoryData = Array.from(categoryTotals, ([category, data]) => ({
    category,
    count: data.count,
    total: data.total,
    percent: (data.total / total) * 100,
  })).sort((a, b) => b.total - a.total)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Distribuição por Categoria', 14, currentY)
  currentY += 2

  autoTable(doc, {
    startY: currentY,
    head: [['Categoria', 'Qtde', 'Total (R$)', '% do Total']],
    body: categoryData.map((category) => [
      category.category,
      category.count.toString(),
      `R$ ${money(category.total)}`,
      `${category.percent.toFixed(1)}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: HEAD_FILL, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  })

  currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10

  // Gráfico de pizza (visualização em texto)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Gráfico - Categorias por Valor', 14, currentY)
  currentY += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  categoryData.slice(0, 5).forEach((category, index) => {
    const barWidth = (category.percent / 100) * 120
    doc.setFillColor(50 + index * 40, 100 + index * 20, 200 - index * 30)
    doc.rect(14, currentY, barWidth, 4, 'F')
    doc.text(`${category.category}: ${category.percent.toFixed(1)}%`, 140, currentY + 3)
    currentY += 6
  })

  currentY += 6

  // Tabela detalhada
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Lançamentos Detalhados', 14, currentY)
  currentY += 2

  autoTable(doc, {
    startY: currentY,
    head: [['Descrição', 'Categoria', 'Vencimento', 'Valor', 'Status', 'Recorrente']],
    body: rows.map((row) => [
      row.description || '-',
      labelOf(EXPENSE_CATEGORY, row.category),
      row.due_date ? dateBR(row.due_date) : '-',
      `R$ ${money(row.value ?? 0)}`,
      row.is_overdue ? 'Em atraso' : labelOf(FINANCIAL_STATUS, row.status),
      row.is_recurring || row.recurrence_parent_id ? 'Sim' : 'Não',
    ]),
    theme: 'grid',
    headStyles: { fillColor: HEAD_FILL, textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      3: { halign: 'right' },
    },
  })

  // Rodapé
  const finalY = doc.lastAutoTable?.finalY ?? currentY
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`TOTAL DO MÊS: R$ ${money(total)}`, 14, finalY + 10)

  doc.save(`pagamentos_${year}-${String(month + 1).padStart(2, '0')}.pdf`)
}
