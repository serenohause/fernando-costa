import type { ReactNode } from 'react'
import { CheckCircle, FileText, Paperclip, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCurrencyBRL, formatDateBR } from '@/lib/format'
import {
  BUDGET_ITEM_PRIORITY,
  BUDGET_ITEM_STATUS,
  SUPPLIER_CATEGORY,
  labelOf,
} from '@/lib/enums'
import {
  describeDatabaseError,
  useAddBudgetApprovalFile,
  useBudgetItemAttachments,
  useRemoveBudgetApprovalFile,
  useRemoveQuoteFile,
  useUploadQuoteFile,
} from '../hooks'
import PdfAttachButton, { PdfOpenButton } from './PdfAttachButton'
import { ITEM_STATUS_BADGE } from './budget-styles'
import type { BudgetChecklistItemRow, BudgetFileRef, BudgetItemQuoteRow } from '../types'

/*
  Porta de projeto-original/src/components/orcamento/ItemOrcamentoDrawer.jsx.

  O cabeçalho com nome, categoria e a fileira de crachás, o bloco de descrição, o
  bloco de sete linhas de informação, a seção "Orçamentos em PDF" com um cartão
  por fornecedor cotado, a seção "Aprovação do Cliente" com a lista de anexos, o
  bloco de observações e a barra de ações no rodapé são os do original, na mesma
  ordem e com o mesmo microcopy.

  O QUE MUDA, E POR QUÊ:

  1. NÃO HÁ CÓPIA LOCAL DO ITEM. O original guarda um `JSON.parse(JSON.stringify(item))`
     em estado e o edita a cada anexo, avisando o pai por `onUpdateItem` — que lá
     regrava o documento inteiro. Aqui cada anexo é uma gravação própria
     (`useUploadQuoteFile`, `useAddBudgetApprovalFile`, e as duas remoções), e a
     linha atualizada volta pela consulta que a gravação invalida. Quem abre o
     drawer deve passar a linha RECÉM-LIDA, como Suppliers.tsx faz com o
     fornecedor selecionado.
  2. O CRACHÁ DE CLIPES VEM DO BANCO (`useBudgetItemAttachments`, view
     `budget_item_attachments`, migration 0054). No original a fórmula está
     escrita duas vezes no navegador e depende de a tela ter carregado tudo para
     acertar o número.
  3. `canEdit` no lugar de `canManage`, e ele governa também os botões de anexar,
     substituir e remover PDF — não só o rodapé. É a regra do BANCO
     (`can_edit_menu('client_budget')`, migrations 0050 e 0054); o original assume
     permissão quando ela falta. Ver o comentário em Suppliers.tsx.
  4. NÃO HÁ upload "do item". `arquivo_orcamento_url` é campo declarado que tela
     nenhuma do original lê ou escreve (migration 0054) — os dois uploads reais
     são o PDF de cada cotação e a LISTA de PDFs de aprovação, que são os que
     estão aqui.
  5. Falha ao ABRIR um PDF passou a ter resposta visível (ver `PdfOpenButton`), e
     falha ao anexar ou remover vira toast com o motivo. No original o anexo some
     da tela mesmo quando a gravação não aconteceu, porque o estado local é
     alterado antes da resposta do servidor.
*/

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (!value && value !== 0) return null

  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  )
}

/* `formatBRL` do original: nulo esconde a linha, zero continua aparecendo. */
function money(value: number | null): string | null {
  return value == null ? null : formatCurrencyBRL(value)
}

/*
  O par caminho+nome da cotação como o botão de anexo o recebe. As duas colunas
  andam juntas por check do banco (`budget_item_quotes_quote_file_pair_check`);
  o `&&` aqui é o que convence o TypeScript disso.
*/
function quoteFile(quote: BudgetItemQuoteRow): BudgetFileRef | null {
  return quote.quote_file_path && quote.quote_file_name
    ? { path: quote.quote_file_path, name: quote.quote_file_name }
    : null
}

export default function BudgetItemDrawer({
  open,
  onClose,
  item,
  onEdit,
  onDelete,
  canEdit,
}: {
  open: boolean
  onClose: () => void
  item: BudgetChecklistItemRow | null
  onEdit: (item: BudgetChecklistItemRow) => void
  onDelete: (item: BudgetChecklistItemRow) => void
  /** `useMenuPermissions('client_budget').canEdit` — a chave das migrations 0050 e 0054. */
  canEdit: boolean
}) {
  const attachmentsQuery = useBudgetItemAttachments(item?.checklist_id)

  const uploadQuoteFile = useUploadQuoteFile()
  const removeQuoteFile = useRemoveQuoteFile()
  const addApprovalFile = useAddBudgetApprovalFile()
  const removeApprovalFile = useRemoveBudgetApprovalFile()

  if (!item) return null

  const totalPdfs = attachmentsQuery.data?.get(item.id)?.attachment_count ?? 0

  const handleQuoteUpload = (quoteId: string, file: File) => {
    uploadQuoteFile.mutate(
      { id: quoteId, file },
      {
        onSuccess: () => toast.success('PDF enviado com sucesso'),
        onError: (error) => toast.error('Erro ao enviar o arquivo. ' + describeDatabaseError(error)),
      },
    )
  }

  const handleQuoteRemove = (quoteId: string) => {
    removeQuoteFile.mutate(quoteId, {
      onError: (error) => toast.error('Erro ao remover o arquivo. ' + describeDatabaseError(error)),
    })
  }

  const handleApprovalUpload = (file: File) => {
    addApprovalFile.mutate(
      { itemId: item.id, file },
      {
        onSuccess: () => toast.success('PDF enviado com sucesso'),
        onError: (error) => toast.error('Erro ao enviar o arquivo. ' + describeDatabaseError(error)),
      },
    )
  }

  const handleApprovalRemove = (fileId: string) => {
    removeApprovalFile.mutate(fileId, {
      onError: (error) => toast.error('Erro ao remover o arquivo. ' + describeDatabaseError(error)),
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <SheetTitle className="text-lg font-semibold">{item.name}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {item.category ? SUPPLIER_CATEGORY[item.category] : ''}
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {/* Sem o `|| 'Pendente'` do original: a coluna é NOT NULL com
                    default `pending`, então não há item sem status. */}
                <Badge className={`text-xs ${ITEM_STATUS_BADGE[item.status]}`}>
                  {labelOf(BUDGET_ITEM_STATUS, item.status)}
                </Badge>
                {/* O original esconde este crachá quando a prioridade falta;
                    aqui a coluna é NOT NULL, então ele está sempre presente. */}
                <Badge variant="outline" className="text-xs">
                  {labelOf(BUDGET_ITEM_PRIORITY, item.priority)}
                </Badge>
                {item.client_approved && (
                  <Badge className="text-xs bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="w-3 h-3 mr-1" /> Aprovado pelo cliente
                  </Badge>
                )}
                {totalPdfs > 0 && (
                  <Badge variant="outline" className="text-xs text-soft gap-1">
                    <Paperclip className="w-3 h-3" /> {totalPdfs} PDF{totalPdfs > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {item.description && (
          <div className="mb-4 bg-elevated rounded-xl p-3">
            <p className="text-sm text-soft">{item.description}</p>
          </div>
        )}

        <div className="mb-4 bg-elevated rounded-xl p-3">
          <InfoRow label="Responsável" value={item.responsible?.name} />
          <InfoRow label="Prazo" value={item.due_date ? formatDateBR(item.due_date) : null} />
          <InfoRow label="Valor Estimado" value={money(item.estimated_value)} />
          <InfoRow label="Valor Aprovado" value={money(item.approved_value)} />
          <InfoRow label="Fornecedor Escolhido" value={item.supplier?.name} />
          <InfoRow
            label="% Comissão"
            value={item.commission_percent ? `${item.commission_percent}%` : null}
          />
          {/* Coluna GERADA pelo banco (migration 0049), e não conta feita no
              formulário como no original. */}
          <InfoRow label="Comissão Estimada" value={money(item.commission_value)} />
        </div>

        {/* ─── Orçamentos em PDF (por fornecedor cotado) ─── */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Orçamentos em PDF
          </p>

          {item.quotes.length === 0 ? (
            <p className="text-sm text-faint italic">Nenhum fornecedor cotado adicionado.</p>
          ) : (
            <div className="space-y-3">
              {item.quotes.map((quote) => (
                <div key={quote.id} className="border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {quote.supplier?.name}
                      </span>
                      {quote.supplier_id === item.chosen_supplier_id && (
                        <Badge className="text-xs bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                          Escolhido
                        </Badge>
                      )}
                    </div>
                    {/* O original testa `fc.valor &&`, e `0` é falsy: a cotação
                        de cortesia — zero real, que o COMMENT de
                        `budget_item_quotes.value` reconhece como legítima —
                        aparecia sem valor nenhum, indistinguível de cotação que
                        ainda não chegou. O teste passa a ser sobre NULO. */}
                    {quote.value == null ? null : (
                      <span className="text-sm font-semibold text-soft">
                        {formatCurrencyBRL(quote.value)}
                      </span>
                    )}
                  </div>
                  {quote.notes && <p className="text-xs text-muted-foreground">{quote.notes}</p>}
                  <PdfAttachButton
                    file={quoteFile(quote)}
                    label="Anexar orçamento PDF"
                    canEdit={canEdit}
                    isUploading={
                      uploadQuoteFile.isPending && uploadQuoteFile.variables?.id === quote.id
                    }
                    onSelect={(file) => handleQuoteUpload(quote.id, file)}
                    onRemove={() => handleQuoteRemove(quote.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Aprovação do cliente ─── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider">
              Aprovação do Cliente
            </p>
            {/*
              LISTA, e não anexo único: vários PDFs, cada um com nome e data,
              adicionados e removidos um a um. Por isso este botão fica sempre no
              estado vazio (`file={null}`) — ele só acrescenta.
            */}
            <PdfAttachButton
              file={null}
              label="Anexar aprovação"
              canEdit={canEdit}
              isUploading={addApprovalFile.isPending}
              onSelect={handleApprovalUpload}
            />
          </div>

          {item.approval_files.length === 0 ? (
            <p className="text-sm text-faint italic">Nenhum PDF de aprovação anexado.</p>
          ) : (
            <div className="space-y-2">
              {item.approval_files.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2"
                >
                  <FileText className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-soft truncate">{approval.file_name}</p>
                    {/* `uploaded_on` tem default `current_date` e é NOT NULL
                        (migration 0054): quem responde que dia é hoje passou a
                        ser o banco, e a data está sempre lá. */}
                    <p className="text-xs text-faint">{formatDateBR(approval.uploaded_on)}</p>
                  </div>
                  <PdfOpenButton path={approval.file_path} />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-red-400 hover:text-red-600"
                      onClick={() => handleApprovalRemove(approval.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {item.notes && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
              Observações
            </p>
            <p className="text-sm text-soft bg-elevated rounded-xl p-3">{item.notes}</p>
          </div>
        )}

        {canEdit && (
          <div className="flex gap-3 mt-6 pt-4 border-t border-border">
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => onEdit(item)}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </Button>
            {/* O original manda `item_id`; aqui vai a linha inteira, como
                SupplierDrawer — quem confirma a exclusão é a tela. */}
            <Button
              variant="outline"
              onClick={() => onDelete(item)}
              className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
