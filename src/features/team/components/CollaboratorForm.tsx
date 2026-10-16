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
  senha_provisoria: string
}

const EMPTY: CollaboratorFormValues = {
  name: '',
  role: '',
  area: '',
  email: '',
  status: 'active',
  weekly_hours: '',
  senha_provisoria: '',
}

export default function CollaboratorForm({
  open,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  variant = 'collaborator',
  temLogin = false,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: CollaboratorInput, senhaProvisoria: string) => void
  initialData?: Partial<CollaboratorFormValues> | null
  isLoading?: boolean
  variant?: 'collaborator' | 'approval'
  temLogin?: boolean
}) {
  const [formData, setFormData] = useState<CollaboratorFormValues>({ ...EMPTY, ...initialData })

  useEffect(() => {
    setFormData(initialData ? { ...EMPTY, ...initialData } : EMPTY)
  }, [initialData, open])

  /*
    Divergência do original, decidida pelo usuário.

    No original o título e o botão saem apenas de `initialData` existir, e não
    do fluxo — a mesma caixa serve para editar e para aprovar. O efeito é que
    quem clica em "Aprovar" na fila de acesso recebe uma janela escrita
    "Editar Colaborador", com botão "Salvar Alterações". É economia de código
    que vaza para quem usa. Aqui o texto acompanha o fluxo; layout, campos e
    espaçamento continuam idênticos.
  */
  const isEditing = Boolean(initialData)
  const isApproval = variant === 'approval'

  const title = isApproval ? 'Aprovar Acesso' : isEditing ? 'Editar Colaborador' : 'Novo Colaborador'
  const submitLabel = isApproval
    ? 'Aprovar Acesso'
    : isEditing
      ? 'Salvar Alterações'
      : 'Criar Colaborador'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(
      {
        name: formData.name,
        role: formData.role as CollaboratorRole,
        area: formData.area === '' ? null : formData.area,
        email: formData.email,
        status: formData.status,
        weekly_hours: formData.weekly_hours ? Number(formData.weekly_hours) : null,
      },
      /* Vai por fora de CollaboratorInput de propósito: senha não é coluna de
         `collaborators`, e misturar as duas coisas num objeto só é o primeiro
         passo para alguém gravá-la lá sem querer. */
      formData.senha_provisoria.trim(),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
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
                <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                É o e-mail que fez a solicitação — é por ele que o login é vinculado.
              </p>
            )}
          </div>

          {/*
            SENHA PROVISÓRIA — o campo que o original tinha e que tinha sumido.

            Lá ele era a coluna `senha_temporaria`, texto puro no banco, visível
            na listagem da Equipe. Aqui ele não é coluna nenhuma: o que for
            digitado vai para o Auth do Supabase pela edge function
            create-collaborator-login, que guarda hash, e a pessoa é obrigada a
            trocar no primeiro acesso.

            Não aparece na aprovação de acesso: ali a pessoa já tem login (foi
            com ele que ela pediu acesso), e oferecer troca de senha no meio de
            uma aprovação é outra ação, em outro lugar.
          */}
          {!isApproval && (
            <div className="space-y-2">
              <Label htmlFor="senha_provisoria">
                {temLogin ? 'Nova senha provisória' : 'Senha provisória'}
              </Label>
              <Input
                id="senha_provisoria"
                type="text"
                value={formData.senha_provisoria}
                onChange={(e) => setFormData({ ...formData, senha_provisoria: e.target.value })}
                placeholder="Pelo menos 8 caracteres"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {temLogin
                  ? 'Preenchida, redefine a senha desta pessoa. Em branco, nada muda.'
                  : 'Preenchida, cria o login com este e-mail. Em branco, o cadastro entra sem acesso ao sistema.'}
              </p>
            </div>
          )}

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
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? 'Salvando...' : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
