import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CLIENT_RELATIONSHIP_OPTIONS } from '../people'
import type { ClientPersonInput } from '../hooks'
import type { ClientPerson } from '../types'

/* O formulário de uma pessoa do cadastro (cônjuge, segundo titular, sócio) —
   migration 0102. Só o nome é obrigatório: o resto chega aos poucos. */
export default function ClientPersonDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ClientPerson | null
  onSubmit: (input: ClientPersonInput) => void
  isPending: boolean
}) {
  const [values, setValues] = useState<ClientPersonInput>(vazio())

  useEffect(() => {
    if (!open) return
    setValues(editing ? doBanco(editing) : vazio())
  }, [open, editing])

  const set = <K extends keyof ClientPersonInput>(key: K, value: ClientPersonInput[K]) =>
    setValues((atual) => ({ ...atual, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (values.name.trim() === '') return
    onSubmit({
      ...values,
      name: values.name.trim(),
      tax_id: orNull(values.tax_id),
      email: orNull(values.email),
      phone: orNull(values.phone),
      notes: orNull(values.notes),
      birth_date: orNull(values.birth_date),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar pessoa' : 'Nova pessoa'}</DialogTitle>
          <DialogDescription>
            Cônjuge, segundo titular, sócio ou representante. Fica no cadastro do cliente e a busca
            do CRM encontra o cliente por este nome ou CPF.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="person-name">Nome *</Label>
            <Input
              id="person-name"
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Relação</Label>
              <Select value={values.relationship} onValueChange={(value) => set('relationship', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_RELATIONSHIP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="person-birth">Data de nascimento</Label>
              <Input
                id="person-birth"
                type="date"
                value={values.birth_date ?? ''}
                onChange={(event) => set('birth_date', event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="person-tax">CPF / CNPJ</Label>
              <Input
                id="person-tax"
                value={values.tax_id ?? ''}
                onChange={(event) => set('tax_id', event.target.value)}
                maxLength={30}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="person-phone">Telefone</Label>
              <Input
                id="person-phone"
                value={values.phone ?? ''}
                onChange={(event) => set('phone', event.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-email">E-mail</Label>
            <Input
              id="person-email"
              type="email"
              value={values.email ?? ''}
              onChange={(event) => set('email', event.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="person-signer">Assina o contrato</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Marca quem assina junto com o titular. Por ora é informação do cadastro: o contrato
                continua sendo gerado com um titular.
              </p>
            </div>
            <Switch
              id="person-signer"
              checked={values.is_contract_signer}
              onCheckedChange={(checked) => set('is_contract_signer', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-notes">Observações</Label>
            <Textarea
              id="person-notes"
              value={values.notes ?? ''}
              onChange={(event) => set('notes', event.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || values.name.trim() === ''}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function vazio(): ClientPersonInput {
  return {
    name: '',
    relationship: 'spouse',
    tax_id: '',
    birth_date: '',
    email: '',
    phone: '',
    notes: '',
    is_contract_signer: false,
  }
}

function doBanco(person: ClientPerson): ClientPersonInput {
  return {
    name: person.name,
    relationship: person.relationship,
    tax_id: person.tax_id ?? '',
    birth_date: person.birth_date ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    notes: person.notes ?? '',
    is_contract_signer: person.is_contract_signer,
  }
}

function orNull(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}
