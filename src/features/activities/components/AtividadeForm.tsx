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
import type { ClientListRow } from '@/features/crm/types'
import type { Collaborator } from '@/features/team/types'
import type { ProjectRow } from '@/features/projects/types'
import {
  COLLABORATOR_ROLE,
  PRIORITY_LEVEL,
  WORK_STATUS,
  labelOf,
  optionsOf,
  type PriorityLevel,
  type WorkStatus,
} from '@/lib/enums'
import type { ActivityInput, ActivityRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/AtividadeForm.jsx.

  A ordem dos campos, os rótulos com asterisco, os placeholders, a grade de duas
  colunas dos prazos e de status/prioridade, o bloco "Vínculos Opcionais" com a
  linha divisória, os avisos em texto pequeno e o texto dos botões são os do
  original.

  O QUE MUDA, E POR QUÊ:

  1. Os quatro `*_name` saem do estado do formulário. Eram cópia do nome gravada
     junto do id (migration 0037, item 1); o nome vem do join agora.
  2. Os selects gravam o valor do banco e exibem o rótulo de src/lib/enums.ts. A
     ordem da prioridade é a do original: Baixa, Média, Alta, Urgente — que é a
     ordem de declaração de `PRIORITY_LEVEL`.
  3. `ordem_execucao` some do estado. O original a mantém no objeto só para
     zerá-la ao trocar de responsável (linha 132); esse zerar continua
     acontecendo, mas em `useUpdateActivity`, que é quem sabe qual era o
     responsável anterior.
  4. Quem pode reatribuir e quem pode mexer na prioridade: o original decide pela
     FUNÇÃO do colaborador, com `isCoordenador` comparando contra 'Coordenação',
     valor que não existe em `Collaborator` (o ramo que sobra de pé é
     `role === 'Coordenador'`). Aqui decide a permissão de menu, que é a mesma
     regra do banco — do contrário a tela prometeria um campo que a RLS recusa.
     O aviso "Apenas Admin, Diretor ou Coordenador podem reatribuir atividades" é
     o do original, e continua descrevendo quem recebe `activities/can_edit` no
     seed.
  5. `pertenceAoTime` (linhas 42-46) não foi portado: no original ele lê
     `colaborador.coordenador_id`, e a mensagem "Esta atividade não pertence ao
     seu time" só aparece para quem já não pode editar a prioridade — condição
     que o `disabled` do campo já comunica.
*/

export type ActivityFormValues = {
  description: string
  collaborator_id: string
  coordinator_id: string
  project_id: string
  client_id: string
  start_date: string
  end_date: string
  status: WorkStatus
  priority: PriorityLevel
  notes: string
}

/* Os valores iniciais do original (AtividadeForm.jsx:55-71). */
function emptyValues(): ActivityFormValues {
  return {
    description: '',
    collaborator_id: '',
    coordinator_id: '',
    project_id: '',
    client_id: '',
    start_date: '',
    end_date: '',
    status: 'not_started',
    priority: 'medium',
    notes: '',
  }
}

const text = (value: string | null): string => value ?? ''

export function toFormValues(activity: ActivityRow): ActivityFormValues {
  return {
    description: activity.description,
    /*
      Anulável desde a migration 0064: 1 atividade do base44 tem responsável que
      não está no export de Collaborator. Vira campo EM BRANCO, e não um
      colaborador escolhido por nós — atribuir a atividade a quem não a executou
      grava um fato falso, e desfazer isso depois é trabalho manual. O select
      mostra o próprio "Selecione o colaborador" que ele já mostra em atividade
      nova; o aviso abaixo dele diz por que o campo veio vazio numa atividade que
      já existe.
    */
    collaborator_id: activity.collaborator_id ?? '',
    coordinator_id: text(activity.coordinator_id),
    project_id: text(activity.project_id),
    client_id: text(activity.client_id),
    start_date: activity.start_date,
    end_date: activity.end_date,
    status: activity.status,
    priority: activity.priority,
    notes: text(activity.notes),
  }
}

/*
  O RAMO DE PRÉ-PREENCHIMENTO DO ORIGINAL NÃO FOI PORTADO (AtividadeForm.jsx:
  83-100): lá, atividade nova nasce atribuída a quem está criando quando a tela
  NÃO está em visão gerencial. Aqui criar atividade exige `can_edit_menu`
  ('activities') — a policy de INSERT da migration 0038 não foi afrouxada pela
  0039 —, e quem tem esse menu é exatamente quem o original manda para o outro
  ramo, o que abre o formulário em branco. O ramo portado é o que o gesto
  alcança.
*/

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: ActivityFormValues): ActivityInput {
  return {
    description: values.description.trim(),
    /* O `required` da marcação já barra o vazio; o schema recusa de novo. */
    collaborator_id: values.collaborator_id,
    coordinator_id: orNull(values.coordinator_id),
    project_id: orNull(values.project_id),
    client_id: orNull(values.client_id),
    start_date: values.start_date,
    end_date: values.end_date,
    status: values.status,
    priority: values.priority,
    notes: orNull(values.notes),
  }
}

/*
  Quem pode ser responsável por uma atividade (AtividadeForm.jsx:202-207): ativo,
  e da área Projetos ou Operacional, ou com função de Arquiteto, Coordenador ou
  Estagiário.
*/
function assignableCollaborators(collaborators: Collaborator[]): Collaborator[] {
  return collaborators
    .filter(
      (collaborator) =>
        collaborator.status === 'active' &&
        (collaborator.area === 'projects' ||
          collaborator.area === 'operations' ||
          collaborator.role === 'architect' ||
          collaborator.role === 'coordinator' ||
          collaborator.role === 'intern'),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

/* O original usa a string '__none__' como valor da opção "Nenhum" porque
   `SelectItem` não aceita valor vazio. Fica igual. */
const NONE = '__none__'

export default function AtividadeForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  canAssign,
  collaborators,
  projects,
  clients,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: ActivityInput) => void
  initialData: ActivityFormValues | null
  isLoading: boolean
  canAssign: boolean
  collaborators: Collaborator[]
  projects: ProjectRow[]
  clients: ClientListRow[]
}) {
  const [values, setValues] = useState<ActivityFormValues>(() => initialData ?? emptyValues())

  /* O original reinicia o formulário quando `initialData` ou `open` mudam. */
  useEffect(() => {
    setValues(initialData ?? emptyValues())
  }, [initialData, open])

  const set = <K extends keyof ActivityFormValues>(key: K, value: ActivityFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  /*
    Trocar o responsável traz o coordenador DELE junto (AtividadeForm.jsx:130).
    Não é adorno: `coordinator_id` é a coluna que a policy de leitura e a de
    escrita consultam para decidir quem enxerga e quem mexe na atividade
    (migrations 0038 e 0039).
  */
  const handleCollaboratorChange = (collaboratorId: string) => {
    const collaborator = collaborators.find((item) => item.id === collaboratorId)
    setValues((current) => ({
      ...current,
      collaborator_id: collaboratorId,
      coordinator_id: text(collaborator?.coordinator_id ?? null),
    }))
  }

  /* Escolher o projeto traz o cliente dele (AtividadeForm.jsx:136-149). */
  const handleProjectChange = (projectId: string) => {
    if (projectId === NONE) {
      setValues((current) => ({ ...current, project_id: '', client_id: '' }))
      return
    }
    const project = projects.find((item) => item.id === projectId)
    setValues((current) => ({
      ...current,
      project_id: projectId,
      client_id: text(project?.client_id ?? null),
    }))
  }

  const handleClientChange = (clientId: string) => {
    set('client_id', clientId === NONE ? '' : clientId)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values))
  }

  const responsibles = assignableCollaborators(collaborators)
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))
  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Editar Atividade' : 'Nova Atividade'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição da Atividade *</Label>
            <Input
              id="description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="O que precisa ser feito?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Responsável *</Label>
            <Select
              value={values.collaborator_id}
              onValueChange={handleCollaboratorChange}
              disabled={!canAssign}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o colaborador" />
              </SelectTrigger>
              <SelectContent>
                {responsibles.map((collaborator) => (
                  <SelectItem key={collaborator.id} value={collaborator.id}>
                    {collaborator.name} — {labelOf(COLLABORATOR_ROLE, collaborator.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {initialData && !values.collaborator_id && (
              <p className="text-xs text-muted-foreground">
                O responsável desta atividade não está mais cadastrado. Escolha um para salvar.
              </p>
            )}
            {!canAssign && (
              <p className="text-xs text-muted-foreground">
                Apenas Admin, Diretor ou Coordenador podem reatribuir atividades
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Data Início *</Label>
              <Input
                id="start_date"
                type="date"
                value={values.start_date}
                onChange={(e) => set('start_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">Data Término *</Label>
              <Input
                id="end_date"
                type="date"
                value={values.end_date}
                onChange={(e) => set('end_date', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => set('status', value as WorkStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(WORK_STATUS).map((option) => (
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
                onValueChange={(value) => set('priority', value as PriorityLevel)}
                disabled={!canAssign}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(PRIORITY_LEVEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canAssign && (
                <p className="text-xs text-muted-foreground">
                  Apenas gestores podem editar prioridade
                </p>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-soft mb-3">Vínculos Opcionais</p>

            <div className="space-y-2 mb-4">
              <Label>Projeto</Label>
              <Select value={values.project_id} onValueChange={handleProjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum projeto vinculado" />
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

            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select
                value={values.client_id}
                onValueChange={handleClientChange}
                disabled={Boolean(values.project_id)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum cliente vinculado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {sortedClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {values.project_id && (
                <p className="text-xs text-muted-foreground">Cliente definido pelo projeto</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Informações adicionais..."
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
              {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Atividade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
