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
import {
  COLLABORATOR_ROLE,
  PROJECT_STATUS,
  PROJECT_TYPE,
  labelOf,
  optionsOf,
  type ContractType,
  type ProjectStatus,
} from '@/lib/enums'
import type { ProjectInput, ProjectRow } from '../types'

/*
  Porta de projeto-original/src/components/forms/ProjectForm.jsx, ramo comum.

  Aquele arquivo tem DOIS formulários no mesmo componente, separados por
  `isMapMode`. O que a tela de Projetos abre é este; o outro é o formulário de
  propriedade do MAPA, e é ele que edita tipo de terreno, finalidade, loteamento
  e áreas em m² — `project_land_types`, `project_purposes` e as colunas
  `subdivision_*` / `*_area_m2`. Esse ramo é o MÓDULO 9 e não foi portado aqui:
  trazê-lo agora significaria desenhar a tela de mapa por antecipação.

  A ordem dos campos, os rótulos com asterisco, os placeholders, a grade de duas
  colunas de Cidade/Estado, o aviso âmbar do responsável comercial e o texto dos
  botões são os do original.

  O QUE MUDA, E POR QUÊ:

  1. `client_name`, `commercial_responsible_name` e `responsible_name` saem do
     estado do formulário. Eram cópia do nome gravada junto do id (migration
     0032, item 3); o nome vem do join agora.
  2. Os selects gravam o valor do banco e exibem o rótulo de src/lib/enums.ts. O
     rótulo do tipo é PROJECT_TYPE — a forma CURTA ("Arquitetura"), que é o que
     este formulário mostra no original; a longa é a da tela de Contratos, e as
     duas são o mesmo enum.
  3. O bloco "📍 Endereço da Obra" continua aparecendo só quando já existe
     endereço, e continua editável — mas SEM a linha "Localização: lat, lng"
     abaixo dele: `obra_lat` e `obra_lng` são MÓDULO 9 (decisão 1 do
     SCHEMA-PLAN), e a linha renderizaria "Localização: , ". O ajuste de pino
     também é de lá.
  4. `canEditResponsible` (ProjectForm.jsx:39-41) não foi portado: é calculado no
     original e nunca usado — não desabilita nem esconde nada.
*/

export type ProjectFormValues = {
  name: string
  client_id: string
  project_type: ContractType | ''
  city: string
  state: string
  site_address_text: string
  commercial_responsible_id: string
  start_date: string
  status: ProjectStatus
  notes: string
}

function emptyValues(): ProjectFormValues {
  return {
    name: '',
    client_id: '',
    project_type: '',
    city: '',
    state: '',
    site_address_text: '',
    commercial_responsible_id: '',
    start_date: '',
    /*
      "Prospecção" pré-selecionado é o do original (linha 56). É valor inicial do
      FORMULÁRIO, não default da coluna: `projects.status` nasce
      `under_contract`, porque projeto criado pela aprovação de um contrato já
      está em contrato (migration 0032).
    */
    status: 'prospecting',
    notes: '',
  }
}

const text = (value: string | null): string => value ?? ''

export function toFormValues(project: ProjectRow): ProjectFormValues {
  return {
    name: project.name,
    client_id: text(project.client_id),
    project_type: project.project_type,
    city: text(project.city),
    state: text(project.state),
    site_address_text: text(project.site_address_text),
    commercial_responsible_id: text(project.commercial_responsible_id),
    start_date: text(project.start_date),
    status: project.status,
    notes: text(project.notes),
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toInput(values: ProjectFormValues): ProjectInput {
  return {
    name: values.name.trim(),
    /* O `required` da marcação já barra o vazio; o schema recusa de novo. */
    project_type: values.project_type as ContractType,
    client_id: orNull(values.client_id),
    city: orNull(values.city),
    state: orNull(values.state),
    site_address_text: orNull(values.site_address_text),
    commercial_responsible_id: orNull(values.commercial_responsible_id),
    start_date: orNull(values.start_date),
    status: values.status,
    notes: orNull(values.notes),
  }
}

/*
  Quem pode ser responsável pela NEGOCIAÇÃO (ProjectForm.jsx:682-685): ativo, e
  da área Comercial ou com função de Diretor/Administrativo. É o responsável
  comercial — o operacional é definido no Fluxo do Projeto e tem outra lista.
*/
function commercialCandidates(collaborators: Collaborator[]): Collaborator[] {
  return collaborators
    .filter(
      (collaborator) =>
        collaborator.status === 'active' &&
        (collaborator.area === 'commercial' ||
          collaborator.role === 'director' ||
          collaborator.role === 'admin_staff'),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function ProjectForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  clients,
  collaborators,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: ProjectInput) => void
  initialData: ProjectFormValues | null
  isLoading: boolean
  clients: ClientListRow[]
  collaborators: Collaborator[]
}) {
  const [values, setValues] = useState<ProjectFormValues>(() => initialData ?? emptyValues())

  /* O original reinicia o formulário quando `initialData` ou `open` mudam. */
  useEffect(() => {
    setValues(initialData ?? emptyValues())
  }, [initialData, open])

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values))
  }

  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))
  const responsibles = commercialCandidates(collaborators)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Editar Projeto' : 'Novo Projeto'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Projeto *</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Casa Costa Uruaú"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={values.client_id} onValueChange={(value) => set('client_id', value)}>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={values.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Cidade"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <Input
                id="state"
                value={values.state}
                onChange={(e) => set('state', e.target.value)}
                placeholder="UF"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Projeto *</Label>
            <Select
              value={values.project_type}
              onValueChange={(value) => set('project_type', value as ContractType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(PROJECT_TYPE).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Só aparece quando já existe endereço, como no original. Quem o
              preenche hoje é a aprovação do contrato; o ajuste de pino e as
              coordenadas são o MÓDULO 9. */}
          {values.site_address_text && (
            <div className="space-y-2 bg-elevated p-3 rounded-lg border border-border">
              <Label className="text-soft">📍 Endereço da Obra</Label>
              <Input
                value={values.site_address_text}
                onChange={(e) => set('site_address_text', e.target.value)}
                placeholder="Endereço completo"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Responsável pela Negociação</Label>
            <Select
              value={values.commercial_responsible_id}
              onValueChange={(value) => set('commercial_responsible_id', value)}
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
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 dark:border-amber-900">
              💡 Este responsável é apenas para controle comercial. O responsável operacional deve
              ser definido no <strong>Fluxo de Projeto</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Data de Início</Label>
            <Input
              id="start_date"
              type="date"
              value={values.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) => set('status', value as ProjectStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(PROJECT_STATUS).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Projeto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
