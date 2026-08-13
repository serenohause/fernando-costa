import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Image, Loader2, Paperclip, Upload, X } from 'lucide-react'
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
  optionsOf,
  PROJECT_ISSUE_CATEGORY,
  PROJECT_ISSUE_STATUS,
  type ProjectIssueCategory,
  type ProjectIssueStatus,
} from '@/lib/enums'
import {
  ACCEPT_ATTRIBUTE,
  ACCEPT_IMAGE_ATTRIBUTE,
  describeRejectedFile,
  describeRejectedPhoto,
} from '../files'
import DiaryPhoto, { LocalPhotoPreview } from './DiaryPhoto'
import type { DiaryFile, ProjectIssueInput, ProjectIssueRow } from '../types'

/*
  Porta de nova-versao/src/components/diary/obra/IssueForm.jsx.

  A ordem dos campos (descrição, categoria, responsável, data de identificação e
  prazo lado a lado, status, observações, fotos, arquivos), os rótulos, os
  placeholders, o título com o círculo vermelho e o texto dos botões são os do
  original.

  O QUE MUDA, E POR QUÊ: as mesmas seis diferenças de `SiteVisitForm` — nome do
  responsável que virou join, arquivo que só sobe no salvamento, remoção que
  também espera o salvamento, validação por schema com as frases do original,
  `accept` nos dois seletores, e foto e arquivo na mesma tabela.

  E uma sétima, que é do banco: O NÚMERO DA PENDÊNCIA NÃO APARECE AQUI, nem para
  ler nem para escrever. No original ele é calculado no navegador na hora de
  gravar (`issues.length + 1`, defeito 8 do plano); aqui quem o aloca é o trigger,
  e o cartão da lista o mostra depois.
*/

export type IssueSubmit = {
  input: ProjectIssueInput
  newPhotos: File[]
  newAttachments: File[]
  removedFileIds: string[]
}

type FormValues = {
  description: string
  category: ProjectIssueCategory | ''
  responsible_id: string
  identified_date: string
  due_date: string
  status: ProjectIssueStatus
  notes: string
}

/* Os mesmos valores iniciais do original (IssueForm.jsx:17-28): hoje e "Aberta"
   — que é também o default da coluna (migration 0069). */
function emptyValues(): FormValues {
  return {
    description: '',
    category: '',
    responsible_id: '',
    identified_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    status: 'open',
    notes: '',
  }
}

const text = (value: string | null): string => value ?? ''

function toFormValues(issue: ProjectIssueRow): FormValues {
  return {
    description: issue.description,
    category: issue.category,
    responsible_id: text(issue.responsible_id),
    identified_date: issue.identified_date,
    due_date: text(issue.due_date),
    status: issue.status,
    notes: text(issue.notes),
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: FormValues): ProjectIssueInput {
  return {
    description: values.description.trim(),
    category: values.category as ProjectIssueCategory,
    responsible_id: orNull(values.responsible_id),
    identified_date: values.identified_date,
    due_date: orNull(values.due_date),
    status: values.status,
    notes: orNull(values.notes),
  }
}

export default function IssueForm({
  open,
  onClose,
  onSubmit,
  initialData,
  collaborators,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (submit: IssueSubmit) => void
  initialData: ProjectIssueRow | null
  collaborators: Collaborator[]
  isLoading: boolean
}) {
  const [values, setValues] = useState<FormValues>(() => emptyValues())
  const [keptFiles, setKeptFiles] = useState<DiaryFile[]>([])
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([])
  const [newPhotos, setNewPhotos] = useState<File[]>([])
  const [newAttachments, setNewAttachments] = useState<File[]>([])

  useEffect(() => {
    setValues(initialData ? toFormValues(initialData) : emptyValues())
    setKeptFiles(initialData?.files ?? [])
    setRemovedFileIds([])
    setNewPhotos([])
    setNewAttachments([])
  }, [initialData, open])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const keptPhotos = keptFiles.filter((file) => file.file_kind === 'photo')
  const keptAttachments = keptFiles.filter((file) => file.file_kind === 'attachment')

  const chooseFiles = (
    event: ChangeEvent<HTMLInputElement>,
    reject: (file: File) => string | null,
    apply: (files: File[]) => void,
  ) => {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (chosen.length === 0) return

    const accepted: File[] = []
    for (const file of chosen) {
      const rejected = reject(file)
      if (rejected) toast.error(rejected)
      else accepted.push(file)
    }

    if (accepted.length > 0) apply(accepted)
  }

  const removeKeptFile = (file: DiaryFile) => {
    setKeptFiles((current) => current.filter((kept) => kept.id !== file.id))
    setRemovedFileIds((current) => [...current, file.id])
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ input: toInput(values), newPhotos, newAttachments, removedFileIds })
  }

  const activeCollaborators = collaborators.filter(
    (collaborator) => collaborator.status === 'active',
  )

  const isUploadingPhotos = isLoading && newPhotos.length > 0
  const isUploadingAttachments = isLoading && newAttachments.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🔴 {initialData ? 'Editar pendência' : 'Nova pendência'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Descrição */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Descrição da pendência *</Label>
            <Textarea
              placeholder="Ex: Rodapé da suíte master executado fora da especificação."
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Categoria */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Categoria *</Label>
            <Select
              value={values.category}
              onValueChange={(value) => set('category', value as ProjectIssueCategory)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(PROJECT_ISSUE_CATEGORY).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-soft mb-1 block">Data de identificação *</Label>
              <Input
                type="date"
                value={values.identified_date}
                onChange={(event) => set('identified_date', event.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-soft mb-1 block">Prazo (opcional)</Label>
              <Input
                type="date"
                value={values.due_date}
                onChange={(event) => set('due_date', event.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) => set('status', value as ProjectIssueStatus)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(PROJECT_ISSUE_STATUS).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Observações</Label>
            <Textarea
              placeholder="Detalhes adicionais..."
              value={values.notes}
              onChange={(event) => set('notes', event.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Fotos */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Fotos</Label>
            {(keptPhotos.length > 0 || newPhotos.length > 0) && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {keptPhotos.map((file) => (
                  <div key={file.id} className="relative group">
                    <DiaryPhoto
                      file={file}
                      className="w-full h-16 object-cover rounded-lg border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => removeKeptFile(file)}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-card/90 rounded-full text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {newPhotos.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="relative group">
                    <LocalPhotoPreview file={file} />
                    <button
                      type="button"
                      onClick={() =>
                        setNewPhotos((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      className="absolute top-0.5 right-0.5 p-0.5 bg-card/90 rounded-full text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 border border-dashed border-border rounded-lg hover:bg-elevated transition-colors text-xs text-muted-foreground">
              {isUploadingPhotos ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Image className="w-3.5 h-3.5" />
              )}
              {isUploadingPhotos ? 'Enviando...' : 'Adicionar fotos'}
              <input
                type="file"
                multiple
                accept={ACCEPT_IMAGE_ATTRIBUTE}
                className="hidden"
                onChange={(event) =>
                  chooseFiles(event, describeRejectedPhoto, (files) =>
                    setNewPhotos((current) => [...current, ...files]),
                  )
                }
                disabled={isLoading}
              />
            </label>
          </div>

          {/* Arquivos */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Arquivos</Label>
            {(keptAttachments.length > 0 || newAttachments.length > 0) && (
              <div className="flex flex-wrap gap-2 mb-2">
                {keptAttachments.map((file) => (
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
                {newAttachments.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated border border-border rounded-lg text-xs text-soft"
                  >
                    <Paperclip className="w-3 h-3 text-faint" />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewAttachments((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      className="text-faint hover:text-rose-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 border border-dashed border-border rounded-lg hover:bg-elevated transition-colors text-xs text-muted-foreground">
              {isUploadingAttachments ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {isUploadingAttachments ? 'Enviando...' : 'Adicionar arquivo'}
              <input
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(event) =>
                  chooseFiles(event, describeRejectedFile, (files) =>
                    setNewAttachments((current) => [...current, ...files]),
                  )
                }
                disabled={isLoading}
              />
            </label>
          </div>

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
              {initialData ? 'Salvar alterações' : 'Salvar pendência'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
