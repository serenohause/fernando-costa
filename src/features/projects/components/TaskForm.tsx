import { useEffect, useState, type FormEvent } from 'react'
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
  COLLABORATOR_ROLE,
  TASK_PRIORITY,
  TASK_TYPE,
  labelOf,
  optionsOf,
  type TaskPhase,
  type TaskPriority,
  type TaskType,
  type WorkStatus,
} from '@/lib/enums'
import type { ProjectRow, TaskInput, TaskRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/TaskForm.jsx.

  A ordem dos campos, as três grades de duas colunas, os rótulos, os
  placeholders e o texto dos botões são os do original.

  O QUE MUDA, E POR QUÊ:

  1. `project_name` e `responsible_name` saem do estado. Eram cópia do nome
     gravada junto do id (migration 0032, item 3); o nome vem do join agora.
  2. `phase`, `status` e `estimated_hours` continuam no estado e continuam SEM
     campo na tela, exatamente como no original — as três estão no `useState`
     dele e nenhuma é renderizada. Ficam aqui para que salvar uma tarefa não
     devolva a etapa para o começo nem apague as horas estimadas.
  3. A lista de responsáveis é a mesma três funções do original (Arquiteto,
     Coordenador, Estagiário), agora pelo valor do enum.
*/

export type TaskFormValues = {
  title: string
  project_id: string
  responsible_id: string
  task_type: TaskType | ''
  priority: TaskPriority
  start_date: string
  due_date: string
  description: string

  /* Sem campo na tela, como no original. */
  phase: TaskPhase
  status: WorkStatus
  estimated_hours: string
}

function emptyValues(): TaskFormValues {
  return {
    title: '',
    project_id: '',
    responsible_id: '',
    task_type: '',
    /* "Média" pré-selecionada é a do original (linha 29), e é o default da
       coluna também (migration 0032). */
    priority: 'medium',
    start_date: '',
    due_date: '',
    description: '',

    phase: 'not_started',
    status: 'not_started',
    estimated_hours: '',
  }
}

const text = (value: string | null): string => value ?? ''

export function toFormValues(task: TaskRow): TaskFormValues {
  return {
    title: task.title,
    project_id: text(task.project_id),
    responsible_id: text(task.responsible_id),
    task_type: task.task_type ?? '',
    /* O banco garante que `urgent` nunca chega aqui
       (`tasks_priority_not_urgent_check`). */
    priority: task.priority as TaskPriority,
    start_date: text(task.start_date),
    due_date: text(task.due_date),
    description: text(task.description),

    /* Idem para `finished` em `phase` (`tasks_phase_not_finished_check`). */
    phase: task.phase as TaskPhase,
    status: task.status,
    estimated_hours: task.estimated_hours == null ? '' : String(task.estimated_hours),
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: TaskFormValues): TaskInput {
  const hours = values.estimated_hours.trim()
  const parsedHours = hours === '' ? null : Number(hours)

  return {
    title: values.title.trim(),
    project_id: orNull(values.project_id),
    responsible_id: orNull(values.responsible_id),
    task_type: values.task_type === '' ? null : values.task_type,
    priority: values.priority,
    start_date: orNull(values.start_date),
    due_date: orNull(values.due_date),
    estimated_hours: parsedHours != null && Number.isFinite(parsedHours) ? parsedHours : null,
    description: orNull(values.description),
    phase: values.phase,
    status: values.status,
  }
}

/* Quem executa (TaskForm.jsx:144-147): ativo, e Arquiteto, Coordenador ou
   Estagiário. É a mesma lista do "Alterar Responsável" do cartão. */
export function operationalCandidates(collaborators: Collaborator[]): Collaborator[] {
  return collaborators
    .filter(
      (collaborator) =>
        collaborator.status === 'active' &&
        (collaborator.role === 'architect' ||
          collaborator.role === 'coordinator' ||
          collaborator.role === 'intern'),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function TaskForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  projects,
  collaborators,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: TaskInput) => void
  initialData: TaskFormValues | null
  isLoading: boolean
  projects: ProjectRow[]
  collaborators: Collaborator[]
}) {
  const [values, setValues] = useState<TaskFormValues>(() => initialData ?? emptyValues())

  useEffect(() => {
    setValues(initialData ?? emptyValues())
  }, [initialData, open])

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values))
  }

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))
  const responsibles = operationalCandidates(collaborators)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Editar Tarefa' : 'Nova Tarefa'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título da Tarefa *</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ex: Modelar volumetria no SketchUp"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Projeto</Label>
              <Select
                value={values.project_id}
                onValueChange={(value) => set('project_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {sortedProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select
                value={values.responsible_id}
                onValueChange={(value) => set('responsible_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {responsibles.map((collaborator) => (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name} - {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={values.task_type}
                onValueChange={(value) => set('task_type', value as TaskType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(TASK_TYPE).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select
                value={values.priority}
                onValueChange={(value) => set('priority', value as TaskPriority)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(TASK_PRIORITY).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Início</Label>
              <Input
                id="start_date"
                type="date"
                value={values.start_date}
                onChange={(e) => set('start_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Prazo</Label>
              <Input
                id="due_date"
                type="date"
                value={values.due_date}
                onChange={(e) => set('due_date', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição / Briefing</Label>
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Detalhes da tarefa..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Tarefa'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
