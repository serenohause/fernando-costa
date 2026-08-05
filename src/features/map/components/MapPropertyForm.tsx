import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import type { ClientListRow } from '@/features/crm/types'
import type { ProjectRow } from '@/features/projects/types'
import { MAP_VISUAL_STATUS, optionsOf, type MapVisualStatus } from '@/lib/enums'
import type { EnrichedMapProperty, MapPinLocation, MapPropertyInput } from '../types'

/*
  Porta do ramo `isMapMode` de projeto-original/src/components/forms/ProjectForm.jsx.

  POR QUE É UM COMPONENTE PRÓPRIO, e não uma prop no nosso ProjectForm.

  No original um arquivo só guarda DOIS formulários, escolhidos por `isMapMode`:
  o de PROJETO (nome, cliente, tipo, responsável comercial, data, status,
  observações — que grava em `projects`) e o de PROPRIEDADE DO MAPA (combobox de
  projeto e de cliente, status visual, endereço detectado, tags de terreno e
  finalidade, loteamento e áreas — que grava em `map_properties`). Os dois ramos
  não compartilham um único campo: só o `<Dialog>` em volta e os dois botões do
  rodapé.

  Juntar os dois aqui significaria um componente com duas entidades, duas listas
  de campos e dois tipos de saída (`ProjectInput` | `MapPropertyInput`) decididos
  por um booleano — o tipo de união que o TypeScript só aceita afrouxando
  justamente o que ele deveria conferir. E mexer no formulário de projeto (módulo
  5, em produção) para acomodar o mapa colocaria em risco uma tela que já roda.

  A marcação de cada campo, a ordem, os rótulos, os placeholders, os textos de
  ajuda e o microcopy dos botões são os do original, linha a linha.

  UM DEFEITO DO ORIGINAL SOBREVIVE AQUI, e ele é de aparência, não de dado:
  `linkedProjectId` / `linkedClientId` são estado VISUAL e não são zerados quando
  a pessoa digita por cima de um vínculo já escolhido (ProjectForm.jsx:202-206).
  O selo "Vinculado" e o campo verde continuam na tela, e o Status Visual
  continua escondido, embora o vínculo já tenha sido desfeito no dado.

  O SEGUNDO DEFEITO — as duas áreas — FOI CORRIGIDO. Ver `parseArea` abaixo.
*/

/* As três sugestões de tipo de terreno e as quatro de finalidade
   (ProjectForm.jsx:436 e :479). São TEXTO LIVRE: o campo "Nova categoria..."
   aceita qualquer coisa, e é por isso que as duas viraram tabela de tag e não
   enum (migration 0057). */
const SUGGESTED_LAND_TYPES = ['Loteamento fechado', 'Terreno', 'Comercial']
const SUGGESTED_PURPOSES = ['Moradia', 'Investimento', 'Comercial', 'Hoteleiro']

/* A tag que faz o bloco de loteamento aparecer, aqui e no popup do pino
   (MapaProjetos.jsx:1213). Comparação exata, como no original. */
const GATED_SUBDIVISION_TAG = 'Loteamento fechado'

export type MapPropertyFormValues = {
  /*
    VÍNCULO e RÓTULO andam separados porque são colunas diferentes e mutuamente
    exclusivas (`map_properties_project_link_exclusive_check`). O TERMO DE BUSCA é
    uma terceira coisa: é o que aparece no campo, e no modo edição ele começa com
    o nome do projeto vinculado — que NÃO pode ser gravado como rótulo livre.
  */
  project_id: string | null
  project_label: string | null
  projectSearchTerm: string

  client_id: string | null
  client_label: string | null
  clientSearchTerm: string

  address: string

  /* Só exibição, no bloco "📍 Endereço Detectado" (ProjectForm.jsx:427-428). */
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null

  land_types: string[]
  purposes: string[]

  /* TEXTO, e não número — ver `parseArea`. */
  land_area_m2: string
  project_area_m2: string

  subdivision_name: string
  subdivision_block: string
  subdivision_lot: string

  visual_status: MapVisualStatus
}

/* O pino recém-clicado: coordenada e o que o reverse geocoding devolveu
   (MapaProjetos.jsx:496-504). */
export function toCreateValues(location: MapPinLocation): MapPropertyFormValues {
  return {
    project_id: null,
    project_label: null,
    projectSearchTerm: '',
    client_id: null,
    client_label: null,
    clientSearchTerm: '',
    address: location.address ?? '',
    city: location.city,
    state: location.state,
    lat: location.lat,
    lng: location.lng,
    land_types: [],
    purposes: [],
    land_area_m2: '',
    project_area_m2: '',
    subdivision_name: '',
    subdivision_block: '',
    subdivision_lot: '',
    visual_status: 'not_started',
  }
}

/* "Editar Informações" (MapaProjetos.jsx:736): a propriedade já gravada, com os
   dois termos de busca preenchidos como no original (ProjectForm.jsx:91-94). */
export function toEditValues(property: EnrichedMapProperty): MapPropertyFormValues {
  return {
    project_id: property.project_id,
    project_label: property.project_label,
    projectSearchTerm: property.project_label || property.displayName || '',
    client_id: property.client_id,
    client_label: property.client_label,
    clientSearchTerm: property.client_label || property.clientName || '',
    address: property.address ?? '',
    city: property.city,
    state: property.state,
    lat: property.lat,
    lng: property.lng,
    land_types: property.land_types.map((tag) => tag.land_type),
    purposes: property.purposes.map((tag) => tag.purpose),
    land_area_m2: areaText(property.land_area_m2),
    project_area_m2: areaText(property.project_area_m2),
    subdivision_name: property.subdivision_name ?? '',
    subdivision_block: property.subdivision_block ?? '',
    subdivision_lot: property.subdivision_lot ?? '',
    visual_status: property.visual_status,
  }
}

/*
  O que sai do formulário para o hook de gravação.

  `address` VAI JUNTO nos dois modos, como no original — e agora VALE nos dois.
  No original a criação descarta o que foi digitado e grava o endereço do clique
  (MapaProjetos.jsx:546); a correção está em `useCreateMapProperty`, comentada
  lá.

  `visual_status` também vai sempre, inclusive com projeto vinculado — onde o
  campo nem aparece na tela e a LEITURA o ignora (list.ts, `resolveStatusLabel`).
  Quem decide não gravá-lo nesse caso é o hook, e o porquê está lá.
*/
function toInput(values: MapPropertyFormValues): MapPropertyInput {
  return {
    project_id: values.project_id,
    project_label: values.project_label,
    client_id: values.client_id,
    client_label: values.client_label,

    address: values.address,

    land_types: values.land_types,
    purposes: values.purposes,

    land_area_m2: parseArea(values.land_area_m2),
    project_area_m2: parseArea(values.project_area_m2),

    subdivision_name: values.subdivision_name,
    subdivision_block: values.subdivision_block,
    subdivision_lot: values.subdivision_lot,

    visual_status: values.visual_status,
  }
}

/*
  A ÁREA VIVE COMO TEXTO NO ESTADO e vira número só na gravação — o mesmo desenho
  que os campos de dinheiro dos outros módulos usam (`total_value` e
  `toNumberOrNull` em ContractForm.tsx).

  O QUE O ORIGINAL FAZ: guarda NÚMERO, com `parseFloat(e.target.value) || null`
  (ProjectForm.jsx:566 e :579). Como o valor exibido é reconstruído do número a
  cada tecla, o campo se reescreve enquanto a pessoa digita: "0" (inclusive o "0"
  de "0.5") vira `null` e some, e "1.0" volta como "1" — o próximo dígito de
  "1.05" cai no lugar errado e o campo fica "15". Ou seja, um campo com
  `step="0.01"` que não aceita decimal, e um "0" que vira "não informado" sem
  avisar ninguém: dado perdido e entrada impossível.

  O QUE MUDOU: o estado guarda o que foi digitado, o campo não é mais reescrito
  no meio da digitação, e a conversão acontece uma vez só, aqui. Zero deixa de
  virar nulo em silêncio — ele chega ao `mapPropertyInputSchema` como 0 e recebe
  a frase "A área precisa ser maior que zero.", que é a mesma regra do check
  `map_properties_areas_positive_check`.

  NaN NÃO É CONVERTIDO EM NULO de propósito (o `<input type="number">` não
  produz, mas colar texto por outro caminho produziria): o schema o recusa com
  frase, e "não informado" em silêncio é justamente o que este bloco corrige.
*/
function areaText(value: number | null): string {
  return value == null ? '' : String(value)
}

function parseArea(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return Number(trimmed)
}

export default function MapPropertyForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  clients,
  projects,
  isEditing,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (input: MapPropertyInput) => void
  initialData: MapPropertyFormValues | null
  isLoading: boolean
  clients: ClientListRow[]
  projects: ProjectRow[]
  isEditing: boolean
}) {
  const [values, setValues] = useState<MapPropertyFormValues | null>(initialData)

  const [customLandType, setCustomLandType] = useState('')
  const [customPurpose, setCustomPurpose] = useState('')

  const [showProjectSuggestions, setShowProjectSuggestions] = useState(false)
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null)
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null)

  /*
    O original reinicia o formulário quando `initialData` ou `open` mudam
    (ProjectForm.jsx:86-130).

    A DIFERENÇA: quando `initialData` volta a ser nulo — o que acontece ao FECHAR,
    porque a página zera o modal e os dados dele juntos — o conteúdo aqui fica
    como estava. No original o formulário é limpo nesse instante, e o que se vê é
    um lampejo de formulário vazio durante a animação de saída do diálogo.
  */
  useEffect(() => {
    if (!initialData) return

    setValues(initialData)
    setLinkedProjectId(initialData.project_id)
    setLinkedClientId(initialData.client_id)
    setShowProjectSuggestions(false)
    setShowClientSuggestions(false)
    setCustomLandType('')
    setCustomPurpose('')
  }, [initialData, open])

  const set = <K extends keyof MapPropertyFormValues>(
    key: K,
    value: MapPropertyFormValues[K],
  ) => setValues((current) => (current ? { ...current, [key]: value } : current))

  /* Sugestões: a partir de 2 caracteres, no máximo 5, comparação em minúsculas —
     as três regras do original (ProjectForm.jsx:239-259). `useProjects` já traz
     só projeto visível, que é o `p.visivel_em_projetos` de lá. */
  const projectSuggestions = useMemo(() => {
    const term = values?.projectSearchTerm ?? ''
    if (term.length < 2) return []

    const needle = term.toLowerCase()
    return projects.filter((project) => project.name.toLowerCase().includes(needle)).slice(0, 5)
  }, [values?.projectSearchTerm, projects])

  const clientSuggestions = useMemo(() => {
    const term = values?.clientSearchTerm ?? ''
    if (term.length < 2) return []

    const needle = term.toLowerCase()
    return clients.filter((client) => client.name.toLowerCase().includes(needle)).slice(0, 5)
  }, [values?.clientSearchTerm, clients])

  /* Antes do primeiro pino clicado não há formulário nenhum para desenhar. */
  if (!values) return null

  /* Escolher da lista VINCULA (ProjectForm.jsx:168): grava o id e zera o rótulo
     livre. O cliente do projeto é preenchido junto, quando existe. */
  const selectProjectSuggestion = (project: ProjectRow) => {
    setLinkedProjectId(project.id)
    setValues((current) =>
      current
        ? {
            ...current,
            project_id: project.id,
            project_label: null,
            projectSearchTerm: project.name,
            ...(project.client
              ? {
                  client_id: project.client.id,
                  client_label: null,
                  clientSearchTerm: project.client.name,
                }
              : {}),
          }
        : current,
    )
    if (project.client) setLinkedClientId(project.client.id)
    setShowProjectSuggestions(false)
  }

  /* Digitar DESVINCULA no dado (ProjectForm.jsx:194): o rótulo livre passa a
     valer e o id vai a nulo. `linkedProjectId` só cai quando o campo fica vazio —
     é o defeito 1 do cabeçalho. */
  const changeProjectSearch = (value: string) => {
    setValues((current) =>
      current
        ? { ...current, projectSearchTerm: value, project_label: value, project_id: null }
        : current,
    )

    if (!value) {
      setLinkedProjectId(null)
    } else {
      setShowProjectSuggestions(true)
    }
  }

  const selectClientSuggestion = (client: ClientListRow) => {
    setLinkedClientId(client.id)
    setValues((current) =>
      current
        ? {
            ...current,
            client_id: client.id,
            client_label: null,
            clientSearchTerm: client.name,
          }
        : current,
    )
    setShowClientSuggestions(false)
  }

  const changeClientSearch = (value: string) => {
    setValues((current) =>
      current
        ? { ...current, clientSearchTerm: value, client_label: value, client_id: null }
        : current,
    )

    if (!value) {
      setLinkedClientId(null)
    } else {
      setShowClientSuggestions(true)
    }
  }

  const toggleTag = (key: 'land_types' | 'purposes', tag: string) => {
    const current = values[key]
    set(
      key,
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    )
  }

  /* `addCustomTerrenoTipo` (ProjectForm.jsx:270) empurra no array sem conferir se
     a tag já está lá. Aqui o `mapPropertyInputSchema` remove a repetida antes de
     gravar, porque o unique da tabela derrubaria a gravação inteira por causa de
     um clique duplo. */
  const addCustomTag = (key: 'land_types' | 'purposes', value: string, clear: () => void) => {
    if (value.trim()) {
      set(key, [...values[key], value.trim()])
      clear()
    }
  }

  const isSubdivision = values.land_types.includes(GATED_SUBDIVISION_TAG)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(toInput(values))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Propriedade' : 'Criar Propriedade'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Combobox - Nome do Projeto */}
          <div className="space-y-2">
            <Label htmlFor="project">Nome do Projeto</Label>
            <div className="relative">
              <Input
                id="project"
                value={values.projectSearchTerm}
                onChange={(e) => changeProjectSearch(e.target.value)}
                onFocus={() => projectSuggestions.length > 0 && setShowProjectSuggestions(true)}
                placeholder="Digite ou selecione um projeto..."
                className={
                  linkedProjectId
                    ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40'
                    : ''
                }
              />
              {linkedProjectId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 dark:text-green-400 font-medium">
                  Vinculado
                </span>
              )}
            </div>

            {showProjectSuggestions && projectSuggestions.length > 0 && (
              <div className="absolute z-10001 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                {projectSuggestions.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => selectProjectSuggestion(project)}
                    className="w-full text-left px-4 py-2 hover:bg-elevated border-b border-border last:border-b-0"
                  >
                    <p className="text-sm font-medium text-foreground">{project.name}</p>
                    {(project.city || project.client) && (
                      <p className="text-xs text-muted-foreground">
                        {project.city && project.state ? `${project.city}/${project.state}` : ''}
                        {project.client && ` • ${project.client.name}`}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status visual - apenas para propriedades não vinculadas */}
          {!linkedProjectId && (
            <div className="space-y-2">
              <Label>Status Visual</Label>
              <Select
                value={values.visual_status}
                onValueChange={(value) => set('visual_status', value as MapVisualStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(MAP_VISUAL_STATUS).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Status visual da propriedade (não vinculada a projeto)
              </p>
            </div>
          )}

          {/* Combobox - Cliente */}
          <div className="space-y-2">
            <Label htmlFor="client">Cliente</Label>
            <div className="relative">
              <Input
                id="client"
                value={values.clientSearchTerm}
                onChange={(e) => changeClientSearch(e.target.value)}
                onFocus={() => clientSuggestions.length > 0 && setShowClientSuggestions(true)}
                placeholder="Digite ou selecione um cliente..."
                className={
                  linkedClientId
                    ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40'
                    : ''
                }
              />
              {linkedClientId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 dark:text-green-400 font-medium">
                  Vinculado
                </span>
              )}
            </div>

            {showClientSuggestions && clientSuggestions.length > 0 && (
              <div className="absolute z-10001 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                {clientSuggestions.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectClientSuggestion(client)}
                    className="w-full text-left px-4 py-2 hover:bg-elevated border-b border-border last:border-b-0"
                  >
                    <p className="text-sm font-medium text-foreground">{client.name}</p>
                    {(client.address_city || client.email) && (
                      <p className="text-xs text-muted-foreground">
                        {client.address_city && client.address_state
                          ? `${client.address_city}/${client.address_state}`
                          : ''}
                        {client.email && ` • ${client.email}`}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* O campo é editável nos dois modos, e o que for digitado aqui é o
              que vai para o banco nos dois — no original a criação o descartava
              (ver `useCreateMapProperty`). */}
          {values.address && (
            <div className="space-y-2 bg-elevated p-3 rounded-lg border border-border">
              <Label className="text-soft">📍 Endereço Detectado</Label>
              <Input
                value={values.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Endereço completo"
              />
              <p className="text-xs text-muted-foreground">
                {values.city && values.state && `${values.city}, ${values.state} • `}
                Lat: {values.lat?.toFixed(6)}, Lng: {values.lng?.toFixed(6)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Terreno (Tipo de Terreno)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {SUGGESTED_LAND_TYPES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag('land_types', tag)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    values.land_types.includes(tag)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-soft border-input hover:border-muted-foreground'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {values.land_types
                .filter((tag) => !SUGGESTED_LAND_TYPES.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag('land_types', tag)}
                    className="px-3 py-1.5 rounded-full text-sm bg-primary text-primary-foreground border-primary"
                  >
                    {tag}
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova categoria..."
                value={customLandType}
                onChange={(e) => setCustomLandType(e.target.value)}
                /* `onKeyPress` do original: o evento está morto no React 19 e
                   `onKeyDown` é o substituto direto, com o mesmo efeito. */
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomTag('land_types', customLandType, () => setCustomLandType(''))
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addCustomTag('land_types', customLandType, () => setCustomLandType(''))}
              >
                + Adicionar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Projeto / Finalidade</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {SUGGESTED_PURPOSES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag('purposes', tag)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    values.purposes.includes(tag)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-soft border-input hover:border-muted-foreground'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {values.purposes
                .filter((tag) => !SUGGESTED_PURPOSES.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag('purposes', tag)}
                    className="px-3 py-1.5 rounded-full text-sm bg-primary text-primary-foreground border-primary"
                  >
                    {tag}
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova categoria..."
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomTag('purposes', customPurpose, () => setCustomPurpose(''))
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addCustomTag('purposes', customPurpose, () => setCustomPurpose(''))}
              >
                + Adicionar
              </Button>
            </div>
          </div>

          {isSubdivision && (
            <div className="space-y-4 bg-elevated p-4 rounded-lg border border-border">
              <h3 className="text-sm font-semibold text-soft">Dados do Loteamento</h3>

              <div className="space-y-2">
                <Label htmlFor="loteamento">Loteamento</Label>
                <Input
                  id="loteamento"
                  value={values.subdivision_name}
                  onChange={(e) => set('subdivision_name', e.target.value)}
                  placeholder="Nome do loteamento"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quadra">Quadra</Label>
                  <Input
                    id="quadra"
                    value={values.subdivision_block}
                    onChange={(e) => set('subdivision_block', e.target.value)}
                    placeholder="Ex: A, 01, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lote">Lote</Label>
                  <Input
                    id="lote"
                    value={values.subdivision_lot}
                    onChange={(e) => set('subdivision_lot', e.target.value)}
                    placeholder="Ex: 15, 23, etc."
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="area_terreno">Terreno (m²)</Label>
              <Input
                id="area_terreno"
                type="number"
                min="0"
                step="0.01"
                value={values.land_area_m2}
                onChange={(e) => set('land_area_m2', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="area_projeto">Projeto (m²)</Label>
              <Input
                id="area_projeto"
                type="number"
                min="0"
                step="0.01"
                value={values.project_area_m2}
                onChange={(e) => set('project_area_m2', e.target.value)}
                placeholder="0.00"
              />
            </div>
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
              {isLoading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Propriedade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
