import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

/* Porta de projeto-original/src/components/shared/DataTable.jsx. */

// Columns that should be hidden on mobile (secondary info)
const MOBILE_HIDDEN_HEADERS = [
  'Localização',
  'Origem',
  'Prob.',
  'Etapa',
  'Previsão',
  'Cidade / Estado',
  'Tipo',
  'Prazos de Projeto',
  'Resp. Negociação',
  'Responsável',
  'Projeto',
  'Contrato',
]

export type Column<T> = {
  header: string
  cell?: (row: T) => ReactNode
  accessor?: keyof T
}

export default function DataTable<T extends { id?: string }>({
  columns,
  data,
  isLoading,
  onRowClick,
  emptyMessage = 'Nenhum registro encontrado',
}: {
  columns: Column<T>[]
  data: T[]
  isLoading?: boolean
  onRowClick?: (row: T) => void
  emptyMessage?: string
}) {
  if (isLoading) {
    return (
      /* v4: `shadow-xs` == `shadow-sm` do v3, que é o que o original usa aqui. */
      <Card className="bg-white border-0 shadow-xs overflow-hidden">
        <div className="p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="bg-white border-0 shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                {columns.map((column, index) => (
                  <TableHead
                    key={index}
                    className={`text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap ${
                      MOBILE_HIDDEN_HEADERS.includes(column.header) ? 'hidden md:table-cell' : ''
                    }`}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-12 text-slate-500">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, rowIndex) => (
                  <motion.tr
                    key={row.id ?? rowIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: rowIndex * 0.05, duration: 0.2 }}
                    whileHover={{ backgroundColor: 'rgba(248, 250, 252, 1)' }}
                    className={`border-b border-slate-100 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={() => onRowClick && onRowClick(row)}
                  >
                    {columns.map((column, colIndex) => (
                      <TableCell
                        key={colIndex}
                        className={`py-4 ${
                          MOBILE_HIDDEN_HEADERS.includes(column.header) ? 'hidden md:table-cell' : ''
                        }`}
                      >
                        {column.cell ? column.cell(row) : column.accessor ? String(row[column.accessor] ?? '') : null}
                      </TableCell>
                    ))}
                  </motion.tr>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </motion.div>
  )
}
