import { useEffect, useState } from 'react'
import { Check, FileDown, FileText, Image, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { describeDiaryError, useGenerateDiaryReport } from '../hooks'
import { collectReportPhotos, isImagePhoto } from '../report'
import DiaryPhoto from './DiaryPhoto'
import type {
  DiaryEntryRow,
  DiaryProject,
  ProjectIssueRow,
  ReportAudience,
  ReportFormat,
  ReportPhoto,
  ReportSectionKey,
  ReportSections,
  SiteVisitRow,
} from '../types'

/*
  Porta de nova-versao/src/components/diary/resumo/RelatorioPDFModal.jsx — o
  modal de dois passos.

  Os dois cartões de destinatário com os emojis e as descrições, os dois de
  formato, a lista de seis seções com o aviso "(somente no formato Completo)", a
  grade de fotos com "Todas | Nenhuma", a contagem "N de M selecionadas", os
  rótulos dos botões e a troca de "Selecionar fotos" por "Gerar PDF" conforme a
  escolha são os da versão nova, com o mesmo microcopy.

  ═══ O QUE MUDA, E POR QUÊ ═══

  1. A MONTAGEM DO DOCUMENTO E A GERAÇÃO saíram do componente: o HTML está em
     `../report` e a chamada ao Supabase em `useGenerateDiaryReport`. É a regra do
     CLAUDE.md, e aqui ela vale duas vezes — o pedaço que saiu daqui é o que
     carrega o achado ALTO do módulo (defeito 9 do plano: HTML montado sem escape
     e entregue por `document.write`). Ver o cabeçalho de `../report`.
  2. AS MINIATURAS SÃO CAMINHO, NÃO URL. Lá cada foto é `<img src={p.url}>` com
     uma URL pública e eterna do `base44.app`; aqui o bucket é privado e o
     endereço é assinado na hora (ver DiaryPhoto), tanto na seleção quanto no
     documento.
  3. O REGISTRO NO DIÁRIO não derruba o relatório quando falha — ver
     `useGenerateDiaryReport`. No original ele está dentro do mesmo `try` da
     abertura da janela, então quem recebeu o relatório lê "Erro ao gerar
     relatório".

  QUEM CHEGA AQUI já passou por `useCanWriteProjectDiary()` na aba Resumo: o
  botão que abre este modal só existe para Diretor e Coordenador, que é a mesma
  regra de `is_project_diary_writer()` (migration 0070). Não há segunda regra
  escrita aqui.
*/

const AUDIENCE_OPTIONS: { id: ReportAudience; label: string; description: string }[] = [
  {
    id: 'internal',
    label: '📋 Relatório Interno',
    description: 'Inclui dados internos, responsáveis e observações',
  },
  {
    id: 'client',
    label: '🤝 Para o Cliente',
    description: 'Versão limpa e institucional, sem dados internos',
  },
]

const FORMAT_OPTIONS: { id: ReportFormat; label: string; description: string }[] = [
  {
    id: 'summary',
    label: '📄 Resumido',
    description: 'Indicadores, pendências, visitas e principais eventos',
  },
  {
    id: 'complete',
    label: '📚 Completo',
    description: 'Toda a timeline, detalhes de revisões e histórico completo',
  },
]

const SECTION_OPTIONS: { key: ReportSectionKey; label: string }[] = [
  { key: 'resumo', label: 'Resumo e indicadores' },
  { key: 'timeline', label: 'Histórico cronológico' },
  { key: 'revisoes', label: 'Revisões' },
  { key: 'pendencias', label: 'Pendências' },
  { key: 'visitas', label: 'Visitas à obra' },
  { key: 'fotos', label: 'Fotos e arquivos selecionados' },
]

const ALL_SECTIONS: ReportSections = {
  resumo: true,
  timeline: true,
  revisoes: true,
  pendencias: true,
  visitas: true,
  fotos: true,
}

export default function RelatorioPDFModal({
  open,
  onClose,
  project,
  entries,
  visits,
  issues,
}: {
  open: boolean
  onClose: () => void
  project: DiaryProject
  entries: DiaryEntryRow[]
  visits: SiteVisitRow[]
  issues: ProjectIssueRow[]
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [audience, setAudience] = useState<ReportAudience>('internal')
  const [format, setFormat] = useState<ReportFormat>('summary')
  const [sections, setSections] = useState<ReportSections>(ALL_SECTIONS)
  const [photos, setPhotos] = useState<ReportPhoto[]>([])

  const generate = useGenerateDiaryReport()

  /* Reabrir o modal recomeça no passo 1 com todas as fotos marcadas, como no
     original (RelatorioPDFModal.jsx:266-271). */
  useEffect(() => {
    if (!open) return
    setPhotos(collectReportPhotos(visits, issues))
    setStep(1)
  }, [open, visits, issues])

  const selectedCount = photos.filter((photo) => photo.selected).length

  const toggleSection = (key: ReportSectionKey) =>
    setSections((current) => ({ ...current, [key]: !current[key] }))

  const togglePhoto = (index: number) =>
    setPhotos((current) =>
      current.map((photo, position) =>
        position === index ? { ...photo, selected: !photo.selected } : photo,
      ),
    )

  const toggleAllPhotos = (selected: boolean) =>
    setPhotos((current) => current.map((photo) => ({ ...photo, selected })))

  const handleGenerate = () => {
    generate.mutate(
      {
        project,
        entries,
        visits,
        issues,
        options: { audience, format, sections },
        photos,
      },
      {
        onSuccess: (result) => {
          toast.success('Relatório aberto para impressão/download!')
          if (result.event.outcome === 'failed') {
            toast.warning(
              'O relatório foi gerado, mas a geração não ficou registrada na Timeline do projeto.',
            )
          }
          onClose()
        },
        onError: (error) => toast.error('Erro ao gerar relatório: ' + describeDiaryError(error)),
      },
    )
  }

  const goToPhotos = sections.fotos && photos.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Gerar Relatório
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5 mt-2">
            {/* Destinatário */}
            <div>
              <Label className="text-xs font-semibold text-soft mb-2 block">Destinatário</Label>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setAudience(option.id)}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${
                      audience === option.id
                        ? 'border-primary bg-elevated'
                        : 'border-border hover:border-faint'
                    }`}
                  >
                    <div className="text-xs font-semibold text-foreground">{option.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Formato */}
            <div>
              <Label className="text-xs font-semibold text-soft mb-2 block">Formato</Label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setFormat(option.id)}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${
                      format === option.id
                        ? 'border-primary bg-elevated'
                        : 'border-border hover:border-faint'
                    }`}
                  >
                    <div className="text-xs font-semibold text-foreground">{option.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Seções */}
            <div>
              <Label className="text-xs font-semibold text-soft mb-2 block">Seções a incluir</Label>
              <div className="space-y-2">
                {SECTION_OPTIONS.map((section) => (
                  <div key={section.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`sec-${section.key}`}
                      checked={sections[section.key]}
                      onCheckedChange={() => toggleSection(section.key)}
                    />
                    <label
                      htmlFor={`sec-${section.key}`}
                      className="text-xs text-soft cursor-pointer"
                    >
                      {section.label}
                      {section.key === 'timeline' && format !== 'complete'
                        ? ' (somente no formato Completo)'
                        : ''}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                onClick={() => (goToPhotos ? setStep(2) : handleGenerate())}
                disabled={generate.isPending}
              >
                {goToPhotos ? (
                  <>
                    <Image className="w-3.5 h-3.5" /> Selecionar fotos
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5" /> Gerar PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-soft">
                Selecionar fotos para o relatório
              </Label>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleAllPhotos(true)}
                  className="text-[10px] text-muted-foreground hover:text-soft"
                >
                  Todas
                </button>
                <span className="text-border">|</span>
                <button
                  onClick={() => toggleAllPhotos(false)}
                  className="text-[10px] text-muted-foreground hover:text-soft"
                >
                  Nenhuma
                </button>
              </div>
            </div>

            <p className="text-[10px] text-faint">
              {selectedCount} de {photos.length} selecionadas
            </p>

            {photos.length === 0 ? (
              <p className="text-xs text-faint text-center py-8">Nenhuma foto disponível.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {photos.map((photo, index) => (
                  <button
                    key={photo.file.id}
                    onClick={() => togglePhoto(index)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      photo.selected ? 'border-primary' : 'border-transparent opacity-50'
                    }`}
                  >
                    {isImagePhoto(photo) ? (
                      <DiaryPhoto file={photo.file} className="w-full h-16 object-cover" />
                    ) : (
                      <div className="w-full h-16 bg-muted flex items-center justify-center">
                        <FileText className="w-5 h-5 text-faint" />
                      </div>
                    )}
                    {photo.selected && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                    <div className="px-1 py-0.5 bg-card text-[8px] text-muted-foreground truncate">
                      {photo.file.file_name}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                onClick={handleGenerate}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5" />
                )}
                Gerar PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
