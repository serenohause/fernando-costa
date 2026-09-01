import { useEffect, useState } from 'react'
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
import { serviceKeyFrom } from '../hooks'
import type { ServiceContractGroup, ServiceTypeRow } from '../types'

/*
  O QUE O GRUPO DE CONTRATO DECIDE, e por que ele é perguntado aqui.

  `mark_negotiation_won` deriva o TIPO DO CONTRATO dos serviços da negociação:
  Interiores puxa "Arquitetura + Interiores", os complementares (estrutura,
  hidrossanitário, elétrico) puxam "Arquitetura + Complementares", e os dois
  juntos puxam "Completo". Sem esta pergunta, todo tipo novo cairia calado em
  "Arquitetura" — e ninguém teria escrito essa regra em lugar nenhum.
*/
const CONTRACT_GROUP_LABEL: Record<ServiceContractGroup, string> = {
  none: 'Não influencia o tipo de contrato',
  interiors: 'Conta como Interiores',
  engineering: 'Conta como Complementar (estrutura, hidrossanitário, elétrico)',
}

export type ServiceTypeFormValues = {
  label: string
  contract_group: ServiceContractGroup
}

export default function ServiceTypeDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ServiceTypeRow | null
  onSubmit: (values: ServiceTypeFormValues) => void
  isPending: boolean
}) {
  const [label, setLabel] = useState('')
  const [contractGroup, setContractGroup] = useState<ServiceContractGroup>('none')

  useEffect(() => {
    if (!open) return
    setLabel(editing?.label ?? '')
    setContractGroup(editing?.contract_group ?? 'none')
  }, [open, editing])

  const trimmed = label.trim()
  const chaveDerivada = serviceKeyFrom(trimmed)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar tipo de serviço' : 'Novo tipo de serviço'}</DialogTitle>
          <DialogDescription>
            Os tipos aparecem como opções na criação de uma negociação no Pipeline.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmed || !chaveDerivada) return
            onSubmit({ label: trimmed, contract_group: contractGroup })
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="service-type-label">Nome *</Label>
            <Input
              id="service-type-label"
              value={label}
              maxLength={60}
              autoFocus
              placeholder="Ex: Paisagismo"
              onChange={(event) => setLabel(event.target.value)}
            />
            {/*
              RENOMEAR NÃO REESCREVE O QUE JÁ FOI GRAVADO: a chave é derivada do
              nome só na criação e não muda depois. Dizer isso aqui evita a
              suposição de que renomear "conserta" o histórico.
            */}
            {editing && (
              <p className="text-xs text-faint">
                Identificador: <code className="font-mono">{editing.key}</code> — ele não muda ao
                renomear, para o histórico das negociações continuar de pé.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-type-group">Peso no tipo de contrato</Label>
            <Select
              value={contractGroup}
              onValueChange={(value) => setContractGroup(value as ServiceContractGroup)}
            >
              <SelectTrigger id="service-type-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTRACT_GROUP_LABEL) as ServiceContractGroup[]).map((group) => (
                  <SelectItem key={group} value={group}>
                    {CONTRACT_GROUP_LABEL[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-faint">
              Usado quando a negociação é marcada como Ganha e o contrato é gerado.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !trimmed || !chaveDerivada}>
              {isPending ? 'Salvando...' : editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
