import { useEffect, useRef } from 'react'
import { FolderPlus, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ObjectiveTemplateGroup } from '@/features/kanban/objectives'

/*
  OS OBJETIVOS PADRÃO DA ETAPA, editados dentro do diálogo da etapa (0099).

  A forma é a do cartão aberto: objetivos soltos em cima e, abaixo, seções com
  nome próprio, cada uma com os seus. Nada é gravado aqui — o diálogo entrega a
  lista inteira ao salvar, e o hook a grava de uma vez.

  RASCUNHO COM CHAVE LOCAL: o objetivo ainda não tem id no banco (e perde o que
  tinha a cada gravação, porque o modelo é trocado inteiro), e a chave do React
  não pode ser o título, que muda a cada tecla.
*/

export type ObjectiveDraft = { key: string; title: string; is_required: boolean }
export type ObjectiveGroupDraft = { key: string; name: string | null; objectives: ObjectiveDraft[] }

const novaChave = () => crypto.randomUUID()

/* O grupo sem seção existe sempre no rascunho, mesmo vazio: é onde o botão
   "Adicionar objetivo" de cima escreve. */
export function toGroupDrafts(groups: ObjectiveTemplateGroup[]): ObjectiveGroupDraft[] {
  const drafts: ObjectiveGroupDraft[] = groups.map((group) => ({
    key: novaChave(),
    name: group.name,
    objectives: group.objectives.map((objective) => ({ key: novaChave(), ...objective })),
  }))
  if (!drafts.some((group) => group.name === null)) {
    drafts.unshift({ key: novaChave(), name: null, objectives: [] })
  }
  return drafts
}

export function fromGroupDrafts(drafts: ObjectiveGroupDraft[]): ObjectiveTemplateGroup[] {
  return drafts.map((group) => ({
    name: group.name,
    objectives: group.objectives.map(({ title, is_required }) => ({ title, is_required })),
  }))
}

export default function ObjectiveTemplateEditor({
  drafts,
  onChange,
  error,
}: {
  drafts: ObjectiveGroupDraft[]
  onChange: (drafts: ObjectiveGroupDraft[]) => void
  error: string | null
}) {
  const raiz = useRef<HTMLDivElement>(null)
  /* O campo recém-criado recebe o foco depois de existir no DOM. */
  const focarDepois = useRef<string | null>(null)

  useEffect(() => {
    const chave = focarDepois.current
    if (!chave) return
    focarDepois.current = null
    raiz.current?.querySelector<HTMLInputElement>(`[data-draft-key="${chave}"]`)?.focus()
  }, [drafts])

  const temSecoes = drafts.some((group) => group.name !== null)

  const mudarGrupo = (groupKey: string, mudar: (group: ObjectiveGroupDraft) => ObjectiveGroupDraft) =>
    onChange(drafts.map((group) => (group.key === groupKey ? mudar(group) : group)))

  const adicionarObjetivo = (groupKey: string, depoisDe?: string) => {
    const novo: ObjectiveDraft = { key: novaChave(), title: '', is_required: true }
    focarDepois.current = novo.key
    mudarGrupo(groupKey, (group) => {
      const lista = [...group.objectives]
      const indice = depoisDe ? lista.findIndex((objective) => objective.key === depoisDe) : -1
      lista.splice(indice === -1 ? lista.length : indice + 1, 0, novo)
      return { ...group, objectives: lista }
    })
  }

  const adicionarSecao = () => {
    const nova: ObjectiveGroupDraft = { key: novaChave(), name: '', objectives: [] }
    focarDepois.current = nova.key
    onChange([...drafts, nova])
  }

  const removerSecao = (group: ObjectiveGroupDraft) => {
    const preenchidos = group.objectives.filter((objective) => objective.title.trim() !== '').length
    if (
      preenchidos > 0 &&
      !window.confirm(
        `Remover a seção “${group.name?.trim() || 'sem nome'}” e ${
          preenchidos === 1 ? 'o objetivo dela' : `os ${preenchidos} objetivos dela`
        }?`,
      )
    ) {
      return
    }
    onChange(drafts.filter((candidate) => candidate.key !== group.key))
  }

  return (
    <div ref={raiz} className="space-y-3">
      <div>
        <Label>Objetivos padrão</Label>
        <p className="text-xs text-muted-foreground mt-1">
          A tarefa ganha estes objetivos ao entrar na etapa. Os obrigatórios travam o avanço até
          serem concluídos. Mudanças valem para os objetivos que ainda não foram criados nas
          tarefas.
        </p>
      </div>

      {drafts.map((group) => (
        <div key={group.key} className="rounded-lg border border-border">
          {group.name === null ? (
            temSecoes && (
              <p className="px-3 pt-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sem seção
              </p>
            )
          ) : (
            <div className="flex items-center gap-2 px-2 py-2 border-b border-border bg-elevated/50 rounded-t-lg">
              <Input
                data-draft-key={group.key}
                value={group.name}
                onChange={(event) => mudarGrupo(group.key, (atual) => ({ ...atual, name: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    adicionarObjetivo(group.key)
                  }
                }}
                placeholder="Nome da seção"
                aria-label="Nome da seção"
                maxLength={60}
                className="h-8 font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remover seção ${group.name || 'sem nome'}`}
                onClick={() => removerSecao(group)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="p-2 space-y-1">
            {group.objectives.map((objective) => (
              <div key={objective.key} className="flex items-center gap-2">
                <Input
                  data-draft-key={objective.key}
                  value={objective.title}
                  onChange={(event) =>
                    mudarGrupo(group.key, (atual) => ({
                      ...atual,
                      objectives: atual.objectives.map((candidate) =>
                        candidate.key === objective.key ? { ...candidate, title: event.target.value } : candidate,
                      ),
                    }))
                  }
                  /* Enter cria o próximo, como num checklist — e não envia o
                     formulário da etapa pela metade. */
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      adicionarObjetivo(group.key, objective.key)
                    }
                  }}
                  placeholder="Descreva o objetivo"
                  aria-label="Título do objetivo"
                  maxLength={300}
                  className="h-8 flex-1"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <Checkbox
                    id={`objetivo-obrigatorio-${objective.key}`}
                    checked={objective.is_required}
                    onCheckedChange={(checked) =>
                      mudarGrupo(group.key, (atual) => ({
                        ...atual,
                        objectives: atual.objectives.map((candidate) =>
                          candidate.key === objective.key
                            ? { ...candidate, is_required: checked === true }
                            : candidate,
                        ),
                      }))
                    }
                  />
                  <Label
                    htmlFor={`objetivo-obrigatorio-${objective.key}`}
                    className="text-xs font-normal text-muted-foreground"
                  >
                    Obrigatório
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={`Remover objetivo ${objective.title || 'sem título'}`}
                  onClick={() =>
                    mudarGrupo(group.key, (atual) => ({
                      ...atual,
                      objectives: atual.objectives.filter((candidate) => candidate.key !== objective.key),
                    }))
                  }
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => adicionarObjetivo(group.key)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-elevated"
            >
              <Plus className="w-4 h-4" />
              Adicionar objetivo
            </button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={adicionarSecao}>
        <FolderPlus className="w-4 h-4 mr-2" />
        Adicionar seção
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
