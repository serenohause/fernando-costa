import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ExternalLink, FileText, Loader2, RefreshCw, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { describeDatabaseError, useBudgetFileUrl } from '../hooks'
import { describeRejectedFile } from '../files'
import type { BudgetFileRef } from '../types'

/*
  Porta de projeto-original/src/components/orcamento/PdfUploadButton.jsx.

  Os três estados são os do original, com a mesma geometria e o mesmo microcopy:
  vazio (botão pontilhado "Anexar ..."), enviando (spinner, "Enviando PDF...",
  percentual à direita e barra de 1.5) e arquivo existente (faixa vermelha com
  nome, abrir, substituir e remover).

  O QUE MUDA, E POR QUÊ:

  1. O COMPONENTE NÃO SOBE ARQUIVO. O original chama
     `base44.integrations.Core.UploadFile` de dentro do JSX; aqui quem grava é o
     hook da feature (`useUploadQuoteFile`, `useAddBudgetApprovalFile`), chamado
     por quem usa este botão. Ele recebe o `File` escolhido em `onSelect` e o
     estado do envio em `isUploading` — regra do CLAUDE.md: nenhuma chamada ao
     Supabase dentro de componente.
  2. A BARRA DE PROGRESSO CONTINUA SENDO SIMULADA, como no original: nem o
     base44 nem o supabase-js informam progresso de upload. Os números são os
     dele (10%, +15 a cada 300ms, teto de 85, 100 ao terminar e 500ms de sobra
     antes de voltar ao estado normal).
  3. `allowReplace` sumiu como prop: no original ele é `true` em todas as
     chamadas, e quem decide se substituir e remover aparecem passou a ser
     `canEdit` — a permissão do banco (`can_edit_menu('client_budget')`), que o
     original não consulta neste componente.
  4. `existingUrl` virou `file: { path, name }`. O banco guarda o CAMINHO do
     objeto no bucket privado, nunca uma URL (migration 0052) — quem transforma
     um no outro é `PdfOpenButton`, logo abaixo.

  A validação de tipo e tamanho é a mesma do original, com as mesmas duas frases
  (`describeRejectedFile`), e continua sendo CONVENIÊNCIA: quem recusa de verdade
  é o bucket (ver src/features/budget/files.ts).
*/

/*
  ABRIR O PDF — CASO NOVO, que o original não tem.

  Lá o `href` é uma URL pública gravada no documento: o link nunca falha e o
  clique nunca precisa de resposta. Aqui o bucket é privado e o endereço é
  assinado na hora (`useBudgetFileUrl`), então abrir PODE falhar — arquivo
  removido do Storage, sessão sem permissão de leitura, rede fora. Acontece
  inclusive com os dados semeados, que gravam a linha sem o objeto
  correspondente (o caminho contém `seed-sem-objeto`).

  Por isso o botão tem três comportamentos, e nenhum deles é silêncio:

  - com o endereço em mãos, é o mesmo `<a target="_blank">` do original;
  - enquanto assina, fica desabilitado (o clique tem resposta visível);
  - se a assinatura falhou, o clique mostra o motivo em toast e tenta de novo.
*/
export function PdfOpenButton({ path }: { path: string }) {
  const urlQuery = useBudgetFileUrl(path)

  const className = 'h-7 px-2 text-blue-600 dark:text-blue-400 hover:text-blue-700'

  if (urlQuery.data) {
    return (
      <a href={urlQuery.data} target="_blank" rel="noopener noreferrer">
        <Button size="sm" variant="ghost" className={className}>
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </a>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className={className}
      disabled={urlQuery.isFetching}
      onClick={() => {
        toast.error('Não foi possível abrir o PDF. ' + describeDatabaseError(urlQuery.error))
        void urlQuery.refetch()
      }}
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </Button>
  )
}

export default function PdfAttachButton({
  file,
  label = 'Anexar PDF',
  canEdit,
  isUploading,
  onSelect,
  onRemove,
}: {
  /** O PDF já anexado, ou `null` quando ainda não há nenhum. */
  file: BudgetFileRef | null
  label?: string
  /** `useMenuPermissions('client_budget').canEdit` — sem isso, só leitura. */
  canEdit: boolean
  isUploading: boolean
  onSelect: (file: File) => void
  /** Ausente quando o anexo não pode ser removido por este botão. */
  onRemove?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(false)
  const wasUploading = useRef(false)

  useEffect(() => {
    if (isUploading) {
      wasUploading.current = true
      setShowProgress(true)
      setProgress(10)
      const tick = setInterval(() => setProgress((value) => Math.min(value + 15, 85)), 300)
      return () => clearInterval(tick)
    }

    if (!wasUploading.current) return
    wasUploading.current = false
    setProgress(100)
    const done = setTimeout(() => {
      setShowProgress(false)
      setProgress(0)
    }, 500)
    return () => clearTimeout(done)
  }, [isUploading])

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    if (!chosen) return

    const rejected = describeRejectedFile(chosen)
    if (rejected) {
      toast.error(rejected)
      return
    }

    onSelect(chosen)
  }

  const triggerUpload = () => {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".pdf,application/pdf"
      className="hidden"
      onChange={handleFile}
    />
  )

  /* Arquivo anexado */
  if (file && !showProgress) {
    return (
      <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
        <FileText className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
        <span className="text-sm text-soft flex-1 truncate" title={file.name}>
          {file.name}
        </span>
        <PdfOpenButton path={file.path} />
        {canEdit && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground hover:text-soft"
            onClick={triggerUpload}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        )}
        {canEdit && onRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-red-500 dark:text-red-400 hover:text-red-700"
            onClick={onRemove}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
        {hiddenInput}
      </div>
    )
  }

  /* Enviando */
  if (showProgress) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-soft">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500 dark:text-blue-400" />
          <span>Enviando PDF...</span>
          <span className="ml-auto text-xs">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
    )
  }

  /*
    Vazio. Quem não pode editar não vê o botão — no original ele aparece para
    todos, porque lá `canManage` só governa o rodapé do drawer e ainda assume
    permissão quando ela falta. O banco nega a escrita (migrations 0050 e 0054),
    então o botão seria um convite ao erro.
  */
  if (!canEdit) return null

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={triggerUpload}
        className="gap-1.5 text-soft border-dashed"
      >
        <Upload className="w-3.5 h-3.5" />
        {label}
      </Button>
      {hiddenInput}
    </>
  )
}
