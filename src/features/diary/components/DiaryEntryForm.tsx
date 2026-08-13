import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Loader2, Paperclip, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Collaborator } from '@/features/team/types'
import {
  DIARY_ENTRY_STATUS,
  DIARY_ENTRY_TYPE,
  DIARY_VISIBILITY,
  MANUAL_DIARY_ENTRY_TYPES,
  optionsOf,
  type DiaryEntryStatus,
  type DiaryManualEntryType,
  type DiaryVisibility,
} from '@/lib/enums'
import { ACCEPT_ATTRIBUTE, describeRejectedFile } from '../files'
import type { DiaryEntryInput, DiaryEntryRow, DiaryFile } from '../types'

/*
  Porta de nova-versao/src/components/diary/DiaryEntryForm.jsx.

  A ordem dos campos (data e hora lado a lado, tipo, título, descrição,
  responsável, status, visibilidade, anexos), os rótulos, os placeholders, o
  texto das opções de visibilidade e o texto dos botões são os do original.

  O QUE MUDA, E POR QUÊ:

  1. `responsavel_name` sai do estado. Era cópia do nome gravada junto do id
     (migration 0069); o nome vem do join agora, e é o ATUAL.
  2. `visibilidade` PASSA A EXISTIR DE VERDADE. Defeito 6 do plano: o original
     coleta este campo e `ProjectTimelineEntry` não o declara — a informação é
     descartada na gravação, e o relatório "para o cliente" não filtra nada.
     Aqui é coluna (`visibility`, migration 0069).
  3. O COMPONENTE NÃO SOBE ARQUIVO. No original o `<input type="file">` chama
     `base44.integrations.Core.UploadFile` de dentro do JSX e o anexo já sobe
     quando é escolhido — inclusive quando a pessoa cancela o formulário depois.
     Aqui o arquivo escolhido fica PENDENTE e vai junto com o salvamento, pelo
     hook da feature (regra do CLAUDE.md: nenhuma chamada ao Supabase dentro de
     componente). Consequência boa: cancelar não deixa arquivo pago e órfão no
     bucket.
  4. REMOVER UM ANEXO JÁ GRAVADO também espera o salvamento. No original o clipe
     some do array em memória e a remoção só acontece se a pessoa salvar — mas o
     arquivo continua no storage de qualquer jeito (defeito 14). Aqui a remoção
     é aplicada no salvamento, linha e objeto.
  5. A VALIDAÇÃO DOS TRÊS CAMPOS OBRIGATÓRIOS é o schema Zod da feature, com as
     MESMAS TRÊS FRASES do original — elas chegam pelo mesmo caminho de erro das
     outras telas do sistema, em vez de um `toast` escrito aqui dentro.
  6. O seletor de arquivo tem `accept` e recusa tipo/tamanho fora do que o
     bucket aceita (migration 0071). É conveniência: quem recusa de verdade é o
     bucket. O original manda qualquer arquivo e descobre no erro de rede.
*/

export type DiaryEntrySubmit = {
  input: DiaryEntryInput
  newFiles: File[]
  removedFileIds: string[]
}

type FormValues = {
  entry_type: DiaryManualEntryType | ''
  title: string
  description: string
  responsible_id: string
  status: DiaryEntryStatus
  occurrence_date: string
  occurrence_time: string
  visibility: DiaryVisibility
}

/* Os mesmos valores iniciais do original (DiaryEntryForm.jsx:39-50): hoje,
   "Em andamento" e "Interno" — que são também os defaults das colunas
   (migration 0069). */
function emptyValues(): FormValues {
  return {
    entry_type: '',
    title: '',
    description: '',
    responsible_id: '',
    status: 'in_progress',
    occurrence_date: format(new Date(), 'yyyy-MM-dd'),
    occurrence_time: '',
    visibility: 'internal',
  }
}

const text = (value: string | null): string => value ?? ''

function toFormValues(entry: DiaryEntryRow): FormValues {
  return {
    /* O banco garante que `system` nunca chega aqui: o lápis não aparece em
       registro automático, e o check amarra tipo Sistema a `is_automatic`. */
    entry_type: entry.entry_type as DiaryManualEntryType,
    title: entry.title,
    description: text(entry.description),
    responsible_id: text(entry.responsible_id),
    status: entry.status,
    occurrence_date: entry.occurrence_date,
    /* `time` volta do Postgres como `HH:MM:SS`; o campo do navegador mostra
       `HH:MM`. Sem o corte, o valor não aparece no input. */
    occurrence_time: text(entry.occurrence_time).slice(0, 5),
    visibility: entry.visibility,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: FormValues): DiaryEntryInput {
  return {
    entry_type: values.entry_type as DiaryManualEntryType,
    title: values.title.trim(),
    description: orNull(values.description),
    responsible_id: orNull(values.responsible_id),
    status: values.status,
    occurrence_date: values.occurrence_date,
    occurrence_time: orNull(values.occurrence_time),
    visibility: values.visibility,
  }
}

export default function DiaryEntryForm({
  open,
  onClose,
  onSubmit,
  initialData,
  collaborators,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (submit: DiaryEntrySubmit) => void
  initialData: DiaryEntryRow | null
  collaborators: Collaborator[]
  isLoading: boolean
}) {
  const [values, setValues] = useState<FormValues>(() => emptyValues())
  /* Os anexos já gravados que continuam de pé, e os que a pessoa tirou. */
  const [keptFiles, setKeptFiles] = useState<DiaryFile[]>([])
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([])
  /* Os escolhidos agora, ainda não enviados. */
  const [newFiles, setNewFiles] = useState<File[]>([])

  useEffect(() => {
    setValues(initialData ? toFormValues(initialData) : emptyValues())
    setKeptFiles(initialData?.files ?? [])
    setRemovedFileIds([])
    setNewFiles([])
  }, [initialData, open])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (chosen.length === 0) return

    const accepted: File[] = []
    for (const file of chosen) {
      const rejected = describeRejectedFile(file)
      if (rejected) toast.error(rejected)
      else accepted.push(file)
    }

    if (accepted.length > 0) setNewFiles((current) => [...current, ...accepted])
  }

  const removeKeptFile = (file: DiaryFile) => {
    setKeptFiles((current) => current.filter((kept) => kept.id !== file.id))
    setRemovedFileIds((current) => [...current, file.id])
  }

  const removeNewFile = (index: number) =>
    setNewFiles((current) => current.filter((_, position) => position !== index))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ input: toInput(values), newFiles, removedFileIds })
  }

  const activeCollaborators = collaborators.filter(
    (collaborator) => collaborator.status === 'active',
  )

  const hasAttachments = keptFiles.length > 0 || newFiles.length > 0
  /* O estado "Enviando..." do original (DiaryEntryForm.jsx:247-248) acontecia
     na escolha do arquivo. Aqui o envio faz parte do salvamento — então ele
     aparece durante o salvamento, e só quando há arquivo para enviar. */
  const isUploading = isLoading && newFiles.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar registro' : 'Adicionar registro'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Data + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-soft mb-1 block">Data *</Label>
              <Input
                type="date"
                value={values.occurrence_date}
                onChange={(event) => set('occurrence_date', event.target.value)}
                className="text-sm"
                required
              />
            </div>
            <div>
              <Label className="text-xs text-soft mb-1 block">Hora (opcional)</Label>
              <Input
                type="time"
                value={values.occurrence_time}
                onChange={(event) => set('occurrence_time', event.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Tipo */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Tipo *</Label>
            <Select
              value={values.entry_type}
              onValueChange={(value) => set('entry_type', value as DiaryManualEntryType)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione o tipo..." />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_DIARY_ENTRY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DIARY_ENTRY_TYPE[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Título */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Título *</Label>
            <Input
              placeholder="Ex: Alteração da bancada gourmet"
              value={values.title}
              onChange={(event) => set('title', event.target.value)}
              className="text-sm"
              required
            />
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Descrição</Label>
            <Textarea
              placeholder="Descreva o que aconteceu..."
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Responsável */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Responsável</Label>
            <Select
              value={values.responsible_id}
              onValueChange={(value) => set('responsible_id', value)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {activeCollaborators.map((collaborator) => (
                  <SelectItem key={collaborator.id} value={collaborator.id}>
                    {collaborator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) => set('status', value as DiaryEntryStatus)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(DIARY_ENTRY_STATUS).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Visibilidade */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Visibilidade</Label>
            <Select
              value={values.visibility}
              onValueChange={(value) => set('visibility', value as DiaryVisibility)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(DIARY_VISIBILITY).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Anexos */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Anexos</Label>
            {hasAttachments && (
              <div className="flex flex-wrap gap-2 mb-2">
                {keptFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated border border-border rounded-lg text-xs text-soft"
                  >
                    <Paperclip className="w-3 h-3 text-faint" />
                    <span className="max-w-[120px] truncate">{file.file_name}</span>
                    <button
                      type="button"
                      onClick={() => removeKeptFile(file)}
                      className="text-faint hover:text-rose-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {newFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated border border-border rounded-lg text-xs text-soft"
                  >
                    <Paperclip className="w-3 h-3 text-faint" />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeNewFile(index)}
                      className="text-faint hover:text-rose-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 border border-dashed border-border rounded-lg hover:bg-elevated transition-colors text-xs text-muted-foreground">
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {isUploading ? 'Enviando...' : 'Adicionar arquivo'}
              <input
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={handleFiles}
                disabled={isLoading}
              />
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} size="sm">
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {initialData ? 'Salvar alterações' : 'Salvar registro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
