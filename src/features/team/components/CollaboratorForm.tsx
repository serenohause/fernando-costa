import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  COLLABORATOR_AREA,
  COLLABORATOR_ROLE,
  COLLABORATOR_STATUS,
  optionsOf,
  type CollaboratorArea,
  type CollaboratorRole,
  type CollaboratorStatus,
} from '@/lib/enums'
import type { CollaboratorInput } from '../types'

/*
  Porta de projeto-original/src/components/forms/CollaboratorForm.jsx.

  Duas diferenças em relação ao original, as duas por decisão já registrada:

  1. O campo "Senha temporária" não existe mais. Era senha em texto puro na
     tabela; está fora de escopo desde docs/ARCHITECTURE.md.
  2. No fluxo de aprovação (`variant="approval"`) e-mail e status ficam
     travados: quem grava é a edge function approve-access-request, que usa o
     e-mail da própria solicitação e cria o colaborador sempre como Ativo.
     Deixar os dois campos editáveis mostraria um controle que não muda nada.
*/

export type CollaboratorFormValues = {
  name: string
  role: CollaboratorRole | ''
  area: CollaboratorArea | ''
  email: string
  status: CollaboratorStatus
  weekly_hours: string
}

const EMPTY: CollaboratorFormValues = {
  name: '',
  role: '',
  area: '',
  email: '',
  status: 'active',
  weekly_hours: '',
}

export default function CollaboratorForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  variant = 'collaborator',
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: CollaboratorInput) => void
  initialData?: Partial<CollaboratorFormValues> | null
  isLoading?: boolean
  variant?: 'collaborator' | 'approval'
}) {
  const [formData, setFormData] = useState<CollaboratorFormValues>({ ...EMPTY, ...initialData })

  useEffect(() => {
    setFormData(initialData ? { ...EMPTY, ...initialData } : EMPTY)
  }, [initialData, open])

  /*
    Como no original: o título e o botão saem de `initialData` existir, e não do
    fluxo. Na aprovação isso faz a caixa dizer "Editar Colaborador" / "Salvar
    Alterações", que é exatamente o que o original mostra ali — está no
    relatório do módulo como ponto para o usuário decidir.
  */
  const isEditing = Boolean(initialData)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({
      name: formData.name,
      role: formData.role as CollaboratorRole,
      area: formData.area === '' ? null : formData.area,
      email: formData.email,
      status: formData.status,
      weekly_hours: formData.weekly_hours ? Number(formData.weekly_hours) : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Colaborador *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nome completo"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Função *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData({ ...formData, role: value as CollaboratorRole })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(COLLABORATOR_ROLE).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as CollaboratorStatus })
                }
                disabled={variant === 'approval'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {optionsOf(COLLABORATOR_STATUS).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {variant === 'approval' && (
                <p className="text-xs text-slate-500">
                  Quem é aprovado entra sempre como Ativo. Depois dá para mudar em Equipe.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Área</Label>
            <Select
              value={formData.area}
              onValueChange={(value) =>
                setFormData({ ...formData, area: value as CollaboratorArea })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {optionsOf(COLLABORATOR_AREA).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail interno *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@escritorio.com"
              disabled={variant === 'approval'}
              required
            />
            {variant === 'approval' && (
              <p className="text-xs text-slate-500">
                É o e-mail que fez a solicitação — é por ele que o login é vinculado.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="weekly_hours">Carga horária semanal</Label>
            <Input
              id="weekly_hours"
              type="number"
              value={formData.weekly_hours}
              onChange={(e) => setFormData({ ...formData, weekly_hours: e.target.value })}
              placeholder="40"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-slate-900 hover:bg-slate-800">
              {isLoading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Colaborador'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
