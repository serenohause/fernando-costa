import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { FINANCIAL_STATUS, labelOf } from '@/lib/enums'
import type {
  FinancialStatusCounts,
  FinancialStatusFilter,
  FinancialSummary,
  MonthYear,
  ReceivableRow,
} from './types'

/*
  Porta de `handleExportPDF` (AccountsReceivable.jsx:232-509).

  Sai da página e vem para cá porque são 280 das 773 linhas do original e não têm
  nada de componente: montam um documento. O que a página guarda é o botão.

  A ESTRUTURA DO DOCUMENTO É A DO ORIGINAL, seção por seção: cabeçalho com
  período/status/data de geração, "Resumo do Mês", "Distribuição por Status",
  "Top Clientes" (10 + Outros), "Top Projetos" (10 + Outros), "Aging do Atraso"
  quando há atraso, "Lançamentos Detalhados" e o total do mês no rodapé. Os
  tamanhos de fonte, os avanços de `currentY`, os temas de tabela ('striped' nos
  resumos, 'grid' no detalhe), as cores de cabeçalho ([15,23,42] slate-900, e
  [220,38,38] no aging) e o nome do arquivo são os mesmos.

  TRÊS ADAPTAÇÕES, NENHUMA VISÍVEL NO PDF:

  1. `doc.autoTable({...})` vira `autoTable(doc, {...})`. O original usa a API de
     plugin do jspdf-autotable 3; a 5 expõe a função, e o `lastAutoTable` que a
     página lê continua sendo escrito no documento pelos dois caminhos.
  2. `doc.setFont(undefined, 'bold')` vira `doc.setFont('helvetica', 'bold')`.
     Passar `undefined` mantém a família corrente, que é helvetica desde a
     primeira linha — mesma saída, e sem mentir para o compilador.
  3. "Em atraso" sai de `is_overdue`, do banco, e não de
     `new Date(due_date) < new Date()` recalculado aqui (migration 0043).

  As cores são literais RGB porque é o que a API do jsPDF aceita — não são tema
  de tela, são tinta do documento.
*/

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

const STATUS_LABELS: Record<FinancialStatusFilter, string> = {
  all: 'Todos',
  overdue: 'Em atraso',
  pending: 'Previsto',
  paid: 'Recebido',
}

const HEAD_SLATE = [15, 23, 42] as const
const HEAD_ROSE = [220, 38, 38] as const

/* `doc.lastAutoTable` existe em tempo de execução (o plugin o escreve no
   documento) e não está na tipagem publicada pela versão 5. */
type DocWithLastTable = jsPDF & { lastAutoTable?: { finalY: number } }

function finalY(doc: jsPDF): number | undefined {
  return (doc as DocWithLastTable).lastAutoTable?.finalY
}

function money(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function brDate(value: string | null): string {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

/* Top 10 por total, com o resto somado em "Outros" (linhas 309-357 e 359-407 do
   original, que fazem isso duas vezes para cliente e para projeto). */
function topTen(
  rows: ReceivableRow[],
  labelOf: (row: ReceivableRow) => string,
): { label: string; count: number; total: number }[] {
  const totals = new Map<string, { count: number; total: number }>()

  for (const row of rows) {
    const label = labelOf(row)
    const current = totals.get(label) ?? { count: 0, total: 0 }
    current.count += 1
    current.total += row.value || 0
    totals.set(label, current)
  }

  const sorted = [...totals.entries()]
    .map(([label, data]) => ({ label, count: data.count, total: data.total }))
    .sort((a, b) => b.total - a.total)

  const top = sorted.slice(0, 10)
  const others = sorted.slice(10)

  if (others.length > 0) {
    top.push({
      label: 'Outros',
      count: others.reduce((sum, item) => sum + item.count, 0),
      total: others.reduce((sum, item) => sum + item.total, 0),
    })
  }

  return top
}

const AGING_BUCKETS = ['0-7', '8-15', '16-30', '31-60', '60+'] as const

function agingBucket(days: number): (typeof AGING_BUCKETS)[number] {
  if (days <= 7) return '0-7'
  if (days <= 15) return '8-15'
  if (days <= 30) return '16-30'
  if (days <= 60) return '31-60'
  return '60+'
}

export function exportReceivablesPDF({
  rows,
  period,
  statusFilter,
  summary,
  counts,
}: {
  rows: ReceivableRow[]
  period: MonthYear
  statusFilter: FinancialStatusFilter
  summary: FinancialSummary
  counts: FinancialStatusCounts
}): void {
  const doc = new jsPDF()
  const { month, year } = period
  let currentY = 20

  // Cabeçalho
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Recebíveis', 14, currentY)
  currentY += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${MONTH_NAMES[month]}/${year}`, 14, currentY)
  currentY += 6

  doc.text(`Status: ${STATUS_LABELS[statusFilter] || 'Todos'}`, 14, currentY)
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
  doc.text(`Total Previsto: R$ ${money(summary.pending)}`, 14, currentY)
  currentY += 6
  doc.text(`Total Recebido: R$ ${money(summary.paid)}`, 14, currentY)
  currentY += 6
  doc.text(`Total em Atraso: R$ ${money(summary.overdue)}`, 14, currentY)
  currentY += 10

  // Totais por status
  const statusData = [
    {
      status: 'Previsto',
      count: counts.pending,
      total: summary.pending,
      percent: (summary.pending / summary.total) * 100,
    },
    {
      status: 'Recebido',
      count: counts.paid,
      total: summary.paid,
      percent: (summary.paid / summary.total) * 100,
    },
    {
      status: 'Em atraso',
      count: counts.overdue,
      total: summary.overdue,
      percent: (summary.overdue / summary.total) * 100,
    },
  ].filter((item) => item.count > 0)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Distribuição por Status', 14, currentY)
  currentY += 2

  autoTable(doc, {
    startY: currentY,
    head: [['Status', 'Qtde', 'Total (R$)', '% do Total']],
    body: statusData.map((item) => [
      item.status,
      item.count.toString(),
      `R$ ${money(item.total)}`,
      `${item.percent.toFixed(1)}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...HEAD_SLATE], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  })

  currentY = (finalY(doc) ?? currentY) + 10

  // Totais por cliente (Top 10 + Outros)
  const clientData = topTen(rows, (row) => row.client?.name ?? 'Sem cliente')

  if (clientData.length > 0) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Top Clientes', 14, currentY)
    currentY += 2

    autoTable(doc, {
      startY: currentY,
      head: [['Cliente', 'Qtde', 'Total (R$)']],
      body: clientData.map((item) => [
        item.label,
        item.count.toString(),
        `R$ ${money(item.total)}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [...HEAD_SLATE], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
      },
    })

    currentY = (finalY(doc) ?? currentY) + 10
  }

  // Totais por projeto (Top 10 + Outros)
  const projectData = topTen(rows, (row) => row.project?.name ?? 'Sem projeto')

  if (projectData.length > 0) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Top Projetos', 14, currentY)
    currentY += 2

    autoTable(doc, {
      startY: currentY,
      head: [['Projeto', 'Qtde', 'Total (R$)']],
      body: projectData.map((item) => [
        item.label,
        item.count.toString(),
        `R$ ${money(item.total)}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [...HEAD_SLATE], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
      },
    })

    currentY = (finalY(doc) ?? currentY) + 10
  }

  // Aging do atraso (se existir)
  const overdueRows = rows.filter((row) => row.is_overdue)

  if (overdueRows.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const buckets = new Map(AGING_BUCKETS.map((key) => [key, { count: 0, total: 0 }]))

    for (const row of overdueRows) {
      const [y, m, d] = row.due_date.split('-').map(Number)
      const dueDate = new Date(y, m - 1, d)
      const days = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      const bucket = buckets.get(agingBucket(days))!
      bucket.count += 1
      bucket.total += row.value || 0
    }

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Aging do Atraso (dias)', 14, currentY)
    currentY += 2

    autoTable(doc, {
      startY: currentY,
      head: [['Período', 'Qtde', 'Total (R$)']],
      body: [...buckets.entries()]
        .filter(([, data]) => data.count > 0)
        .map(([label, data]) => [
          `${label} dias`,
          data.count.toString(),
          `R$ ${money(data.total)}`,
        ]),
      theme: 'striped',
      headStyles: { fillColor: [...HEAD_ROSE], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
      },
    })

    currentY = (finalY(doc) ?? currentY) + 10
  }

  // Tabela detalhada
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Lançamentos Detalhados', 14, currentY)
  currentY += 2

  autoTable(doc, {
    startY: currentY,
    head: [['Descrição', 'Cliente', 'Vencimento', 'Valor', 'Status']],
    body: rows.map((row) => [
      row.description || '-',
      row.client?.name ?? '-',
      brDate(row.due_date),
      `R$ ${money(row.value ?? 0)}`,
      /* O original imprime `receivable.status` cru porque no base44 o valor
         gravado JÁ é o rótulo ('Previsto', 'Pago', 'Negociado'). */
      row.is_overdue ? 'Em atraso' : labelOf(FINANCIAL_STATUS, row.status),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [...HEAD_SLATE], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      3: { halign: 'right' },
    },
  })

  // Rodapé
  const bottom = finalY(doc) ?? currentY
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`TOTAL DO MÊS: R$ ${money(summary.total)}`, 14, bottom + 10)

  doc.save(`recebiveis_${year}-${String(month + 1).padStart(2, '0')}.pdf`)
}
