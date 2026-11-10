import { useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TAG_COLORS, TAG_COLOR_VALUES, tagStyleOf } from '@/features/kanban/types'
import {
  MAX_REVIEW_MARK_LABEL,
  MAX_REVIEW_MARKS,
  type ReviewMarkTemplate,
} from '@/features/kanban/review-marks'

/*
  OS BOTÕES DE SINALIZAÇÃO DE REVISÃO DA ETAPA, editados dentro do diálogo da
  etapa (0131), logo abaixo do toggle de ambientes.

  POR QUE ELE MORA EMBAIXO DAQUELE TOGGLE, e não ao lado do modelo de objetivos:
  os botões só aparecem nos objetivos de AMBIENTE do cartão. Etapa sem ambientes
  não tem onde mostrá-los, e por isso o diálogo esconde este bloco quando o
  toggle está desligado — o que já estiver configurado continua gravado, só não
  tem onde aparecer.

  Nada é gravado aqui: o diálogo entrega a lista inteira ao salvar, e o hook a
  grava de uma vez (`replace_kanban_column_review_marks`).

  RASCUNHO COM CHAVE LOCAL, pelo mesmo motivo de ObjectiveTemplateEditor: o
  botão ainda não tem id no banco, e a chave do React não pode ser o rótulo, que
  muda a cada tecla.
*/

export type ReviewMarkDraft = { key: string; label: string; color: string }

const novaChave = () => crypto.randomUUID()

export function toMarkDrafts(marks: ReviewMarkTemplate[]): ReviewMarkDraft[] {
  return marks.map((mark) => ({ key: novaChave(), ...mark }))
}

export function fromMarkDrafts(drafts: ReviewMarkDraft[]): ReviewMarkTemplate[] {
  return drafts.map(({ label, color }) => ({ label, color }))
}

export default function ReviewMarkEditor({
  drafts,
  onChange,
  error,
}: {
  drafts: ReviewMarkDraft[]
  onChange: (drafts: ReviewMarkDraft[]) => void
  error: string | null
}) {
  const raiz = useRef<HTMLDivElement>(null)
  /* O campo recém-criado recebe o foco depois de existir no DOM. */
  const focarDepois = useRef<string | null>(null)

  useEffect(() => {
    const chave = focarDepois.current
    if (!chave) return
    focarDepois.current = null
    raiz.current?.querySelector<HTMLInputElement>(`[data-mark-key="${chave}"]`)?.focus()
  }, [drafts])

  const adicionar = () => {
    const novo: ReviewMarkDraft = { key: novaChave(), label: '', color: 'slate' }
    focarDepois.current = novo.key
    onChange([...drafts, novo])
  }

  const mudar = (key: string, patch: Partial<ReviewMarkDraft>) =>
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))

  const remover = (key: string) => onChange(drafts.filter((draft) => draft.key !== key))

  return (
    <div ref={raiz} className="space-y-2 rounded-lg border border-border p-3">
      <div>
        <Label>Botões de revisão do ambiente</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Quem revisa marca um deles em cada ambiente do cartão. Depois de marcado, o cartão mostra
          só o botão escolhido. Marcar não conclui o objetivo: o check continua sendo o que libera o
          avanço de etapa.
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum botão. Sem botão, o ambiente do cartão fica só com o check, como hoje.
        </p>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => (
            <div key={draft.key} className="flex items-center gap-2">
              <Input
                data-mark-key={draft.key}
                value={draft.label}
                onChange={(event) => mudar(draft.key, { label: event.target.value })}
                placeholder="Aprovado"
                maxLength={MAX_REVIEW_MARK_LABEL}
                className="h-8 flex-1 min-w-0"
                aria-label="Nome do botão"
              />

              {/* A cor é escolhida na mesma paleta dos crachás de status: são os
                  mesmos tons, no mesmo cartão, e duas paletas diferentes na
                  mesma tela seriam duas linguagens de cor. */}
              <div className="flex shrink-0 items-center gap-1">
                {TAG_COLOR_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => mudar(draft.key, { color: value })}
                    aria-label={TAG_COLORS[value].label}
                    aria-pressed={value === draft.color}
                    title={TAG_COLORS[value].label}
                    className={`h-4 w-4 rounded-full transition-all ${TAG_COLORS[value].dot} ${
                      value === draft.color
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remover(draft.key)}
                aria-label={`Remover ${draft.label || 'botão'}`}
                title="Remover botão"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* A prévia é o próprio botão como ele vai aparecer no cartão. Sem ela, a
          escolha de cor é um ponto colorido decidindo um crachá que ninguém viu. */}
      {drafts.some((draft) => draft.label.trim() !== '') && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground">No cartão:</span>
          {drafts
            .filter((draft) => draft.label.trim() !== '')
            .map((draft) => (
              <span
                key={draft.key}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tagStyleOf(draft.color).badge}`}
              >
                {draft.label.trim()}
              </span>
            ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={adicionar}
        disabled={drafts.length >= MAX_REVIEW_MARKS}
        title={
          drafts.length >= MAX_REVIEW_MARKS
            ? `No máximo ${MAX_REVIEW_MARKS} botões por etapa`
            : undefined
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Adicionar botão
      </Button>
    </div>
  )
}
