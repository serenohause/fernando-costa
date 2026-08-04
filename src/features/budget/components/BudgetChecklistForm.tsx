import { useEffect, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
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
import { BUDGET_PROJECT_PHASE, optionsOf, type BudgetProjectPhase } from '@/lib/enums'
import type { ClientListRow } from '@/features/crm/types'
import type { ProjectRow } from '@/features/projects/types'
import type { Collaborator } from '@/features/team/types'
import type { BudgetChecklistInput } from '../types'

/*
  Porta de projeto-original/src/components/orcamento/ChecklistForm.jsx.

  A ordem dos campos, os rótulos, o asterisco em Cliente, a grade de duas colunas
  no fim, os placeholders e o texto dos botões são os do original. Como lá, este
  formulário só CRIA — o original nunca o abre para editar um checklist
  existente, e o que se edita depois é o status, pelo select do cabeçalho do
  detalhe.

  O QUE MUDA, E POR QUÊ:

  1. NÃO HÁ `*_name` PARA COPIAR. O original grava `client_name`,
     `project_name` e `responsavel_orcamento_name` junto com os ids, e o nome
     envelhece sozinho quando o cadastro muda. As colunas saíram do schema
     (migration 0049) e os nomes voltam por embed na leitura.
  2. `data_inicio` continua sendo "hoje", como no original (ChecklistForm.jsx:59),
     mas no fuso LOCAL: `new Date().toISOString().slice(0, 10)` devolve o dia
     seguinte em Goiânia depois das 21h. Mesma decisão de todayISO no financeiro
     e de formatDateBR em src/lib/format.ts.
  3. `completion_date` e `notes` existem no tipo de gravação e continuam SEM
     campo, como no original — vão nulos.
*/

/* O original usa '__none__' como valor da opção "Nenhum" porque `SelectItem` não
   aceita valor vazio. Mesma tradução de BudgetItemForm. */
const NONE = '__none__'

type FormValues = {
  client_id: string
  project_id: string
  responsible_id: string
  status: BudgetChecklistInput['status']
  project_phase: BudgetProjectPhase | ''
  curation_percent: string
}

/* `EMPTY` do original (ChecklistForm.jsx:8-14), com "Aberto" pré-selecionado. */
function emptyValues(): FormValues {
  return {
    client_id: '',
    project_id: '',
    responsible_id: '',
    status: 'open',
    project_phase: '',
    curation_percent: '',
  }
}

export default function BudgetChecklistForm({
  open,
  onClose,
  onSubmit,
  isLoading,
  projects,
  clients,
  collaborators,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: BudgetChecklistInput) => void
  isLoading: boolean
  projects: ProjectRow[]
  clients: ClientListRow[]
  collaborators: Collaborator[]
}) {
  const [values, setValues] = useState<FormValues>(emptyValues)

  /* O original reinicia o formulário toda vez que `open` muda. */
  useEffect(() => {
    setValues(emptyValues())
  }, [open])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  /* Escolher o projeto traz o cliente dele junto, como no original — e o `||`
     preserva o que já estava escolhido quando o projeto não tem cliente. */
  const handleProject = (projectId: string) => {
    if (projectId === NONE) {
      setValues((current) => ({ ...current, project_id: '' }))
      return
    }

    const project = projects.find((candidate) => candidate.id === projectId)
    setValues((current) => ({
      ...current,
      project_id: projectId,
      client_id: project?.client_id || current.client_id,
    }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    onSubmit({
      client_id: values.client_id,
      project_id: values.project_id === '' ? null : values.project_id,
      responsible_id:
        values.responsible_id === '' || values.responsible_id === NONE
          ? null
          : values.responsible_id,

      status: values.status,
      project_phase: values.project_phase === '' ? null : values.project_phase,

      curation_percent:
        values.curation_percent.trim() === '' ? null : Number(values.curation_percent),

      start_date: format(new Date(), 'yyyy-MM-dd'),
      completion_date: null,
      notes: null,
    })
  }

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))
  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))
  const sortedCollaborators = collaborators
    .filter((collaborator) => collaborator.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Checklist de Orçamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div className="space-y-1">
            <Label>Projeto</Label>
            <Select value={values.project_id} onValueChange={handleProject}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {sortedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cliente *</Label>
            <Select
              value={values.client_id}
              onValueChange={(value) => set('client_id', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {sortedClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Responsável pelo Orçamento</Label>
            <Select
              value={values.responsible_id}
              onValueChange={(value) => set('responsible_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {sortedCollaborators.map((collaborator) => (
                  <SelectItem key={collaborator.id} value={collaborator.id}>
                    {collaborator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Fase do Projeto</Label>
              <Select
                value={values.project_phase}
                onValueChange={(value) => set('project_phase', value as BudgetProjectPhase)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(BUDGET_PROJECT_PHASE).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="checklist-curation">% Curadoria</Label>
              <Input
                id="checklist-curation"
                type="number"
                value={values.curation_percent}
                onChange={(e) => set('curation_percent', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? 'Criando...' : 'Criar Checklist'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
