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
  SITE_VISIT_STATUS,
  SITE_VISIT_TYPE,
  type SiteVisitStatus,
  type SiteVisitType,
} from '@/lib/enums'
import {
  ACCEPT_ATTRIBUTE,
  ACCEPT_IMAGE_ATTRIBUTE,
  describeRejectedFile,
  describeRejectedPhoto,
} from '../files'
import DiaryPhoto, { LocalPhotoPreview } from './DiaryPhoto'
import type { DiaryFile, SiteVisitInput, SiteVisitRow } from '../types'

/*
  Porta de nova-versao/src/components/diary/obra/SiteVisitForm.jsx.

  A ordem dos campos (data e hora lado a lado, tipo, responsável, resumo,
  observações, status, fotos, arquivos), os rótulos, os placeholders, o título
  com o capacete e o texto dos botões são os do original.

  O QUE MUDA, E POR QUÊ — são as mesmas cinco diferenças que `DiaryEntryForm` já
  tem, pelos mesmos motivos:

  1. `responsavel_name` sai do estado: era cópia do nome gravada junto do id
     (migration 0069), e o nome vem do join agora.
  2. O COMPONENTE NÃO SOBE ARQUIVO. Lá o `<input type="file">` chama
     `UploadFile` de dentro do JSX e a foto já sobe quando é escolhida —
     inclusive quando a pessoa cancela o formulário depois. Aqui o arquivo fica
     PENDENTE e vai junto com o salvamento, pelo hook da feature.
  3. REMOVER UMA FOTO JÁ GRAVADA também espera o salvamento, e aí a linha e o
     objeto saem juntos (defeito 14 do plano).
  4. A VALIDAÇÃO é `siteVisitInputSchema`, com as MESMAS TRÊS FRASES do original.
  5. Os dois seletores têm `accept` e recusam tipo e tamanho fora do que o bucket
     aceita (migration 0071) — conveniência, quem recusa de verdade é o bucket.

  E uma sexta, que é do dado: FOTO E ARQUIVO SÃO A MESMA TABELA. No base44 são
  dois arrays dentro da visita (`fotos` e `arquivos`); aqui são linhas de
  `project_diary_files` com `file_kind` diferente. Os dois campos continuam
  separados na tela, como lá.
*/

export type SiteVisitSubmit = {
  input: SiteVisitInput
  newPhotos: File[]
  newAttachments: File[]
  removedFileIds: string[]
}

type FormValues = {
  visit_date: string
  visit_time: string
  visit_type: SiteVisitType | ''
  responsible_id: string
  summary: string
  notes: string
  status: SiteVisitStatus
}

/* Os mesmos valores iniciais do original (SiteVisitForm.jsx:17-28): hoje e "Sem
   pendências" — que é também o default da coluna (migration 0069). */
function emptyValues(): FormValues {
  return {
    visit_date: format(new Date(), 'yyyy-MM-dd'),
    visit_time: '',
    visit_type: '',
    responsible_id: '',
    summary: '',
    notes: '',
    status: 'no_issues',
  }
}

const text = (value: string | null): string => value ?? ''

function toFormValues(visit: SiteVisitRow): FormValues {
  return {
    visit_date: visit.visit_date,
    /* `time` volta do Postgres como `HH:MM:SS` e o campo do navegador mostra
       `HH:MM`. Sem o corte, o valor não aparece no input. */
    visit_time: text(visit.visit_time).slice(0, 5),
    visit_type: visit.visit_type,
    responsible_id: text(visit.responsible_id),
    summary: text(visit.summary),
    notes: text(visit.notes),
    status: visit.status,
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: FormValues): SiteVisitInput {
  return {
    visit_date: values.visit_date,
    visit_time: orNull(values.visit_time),
    visit_type: values.visit_type as SiteVisitType,
    responsible_id: orNull(values.responsible_id),
    summary: values.summary.trim(),
    notes: orNull(values.notes),
    status: values.status,
  }
}

export default function SiteVisitForm({
  open,
  onClose,
  onSubmit,
  initialData,
  collaborators,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (submit: SiteVisitSubmit) => void
  initialData: SiteVisitRow | null
  collaborators: Collaborator[]
  isLoading: boolean
}) {
  const [values, setValues] = useState<FormValues>(() => emptyValues())
  /* Os arquivos já gravados que continuam de pé, e os que a pessoa tirou. */
  const [keptFiles, setKeptFiles] = useState<DiaryFile[]>([])
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([])
  /* Os escolhidos agora, ainda não enviados. */
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

  /* A mesma tabela guarda as duas listas; o que as separa é `file_kind`. */
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

  /* O estado "Enviando..." do original acontecia na escolha do arquivo. Aqui o
     envio faz parte do salvamento — então ele aparece durante o salvamento, e só
     quando há arquivo para enviar. */
  const isUploadingPhotos = isLoading && newPhotos.length > 0
  const isUploadingAttachments = isLoading && newAttachments.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🏗️ {initialData ? 'Editar visita' : 'Registrar visita à obra'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Data + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-soft mb-1 block">Data da visita *</Label>
              <Input
                type="date"
                value={values.visit_date}
                onChange={(event) => set('visit_date', event.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-soft mb-1 block">Hora (opcional)</Label>
              <Input
                type="time"
                value={values.visit_time}
                onChange={(event) => set('visit_time', event.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Tipo */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Tipo de visita *</Label>
            <Select
              value={values.visit_type}
              onValueChange={(value) => set('visit_type', value as SiteVisitType)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(SITE_VISIT_TYPE).map((option) => (
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

          {/* Resumo */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Resumo da visita *</Label>
            <Input
              placeholder="Ex: Realizada conferência da execução da marcenaria..."
              value={values.summary}
              onChange={(event) => set('summary', event.target.value)}
              className="text-sm"
            />
          </div>

          {/* Observações */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Observações</Label>
            <Textarea
              placeholder="Detalhes adicionais, não conformidades, etc."
              value={values.notes}
              onChange={(event) => set('notes', event.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs text-soft mb-1 block">Status da visita</Label>
            <Select
              value={values.status}
              onValueChange={(value) => set('status', value as SiteVisitStatus)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(SITE_VISIT_STATUS).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {initialData ? 'Salvar alterações' : 'Salvar visita'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
