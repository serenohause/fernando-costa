import { Eye, Pencil, TerminalSquare, Undo2, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { initialsOf } from '@/features/projects/initials'
import { COLLABORATOR_ROLE, labelOf } from '@/lib/enums'
import type { Collaborator } from '@/features/team/types'
import { descreverErroAcessarComo, useAcessarComo } from '../hooks'

/*
  A CONFIRMAÇÃO DE "ACESSAR COMO".

  Ela existe para uma coisa: nomear a consequência ANTES, porque depois não dá
  para desfazer. O que o Diretor escrever enquanto estiver assumido fica no
  nome da outra pessoa no histórico do sistema, e histórico não volta atrás.

  AS TRÊS LINHAS SÃO A MENSAGEM INTEIRA, e nenhuma delas é enfeite:
  o que muda no que ele vê, o que muda no que ele escreve, e como se volta.
  A terceira está aí para a segunda não assustar mais do que deve.

  CONFIRMAR NÃO É VERMELHO. Nada é destruído, e vermelho aqui leria como erro
  iminente — o mesmo motivo pelo qual a faixa é violeta e não âmbar.
*/
export default function AcessarComoDialog({
  collaborator,
  open,
  onOpenChange,
}: {
  collaborator: Collaborator | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const acessarComo = useAcessarComo()

  if (!collaborator) return null

  const primeiroNome = collaborator.name.trim().split(/\s+/)[0] ?? collaborator.name

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Acessar o sistema como {collaborator.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Sua sessão de Diretor fica guardada e você entra na dela. Três coisas mudam na hora:
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/*
          `min-w-0` NÃO É OPCIONAL: `AlertDialogContent` é grid, e item de grade
          carrega mínimo automático igual ao próprio min-content. Sem ele, um
          e-mail longo empurra a largura do diálogo inteiro para fora da tela no
          celular. Medido no protótipo, em 375px.
        */}
        <div className="min-w-0 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <div
            className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 flex items-center justify-center text-violet-600 text-sm font-semibold"
            aria-hidden
          >
            {initialsOf(collaborator.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{collaborator.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {labelOf(COLLABORATOR_ROLE, collaborator.role)}
              {collaborator.email ? ` · ${collaborator.email}` : ''}
            </p>
          </div>
        </div>

        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <Eye className="w-4 h-4 shrink-0 mt-0.5 text-violet-600" aria-hidden />
            <span>
              Você passa a ver o sistema exatamente como {primeiroNome}: os menus dela, os dados
              dela. O que a permissão dela não abre, você também não abre.
            </span>
          </li>
          <li className="flex gap-3">
            <Pencil className="w-4 h-4 shrink-0 mt-0.5 text-violet-600" aria-hidden />
            <span>
              Tudo que você escrever fica gravado no nome dela. Tarefa, diário de projeto,
              contrato: o histórico vai dizer {collaborator.name}, não você.
            </span>
          </li>
          <li className="flex gap-3">
            <Undo2 className="w-4 h-4 shrink-0 mt-0.5 text-violet-600" aria-hidden />
            <span>
              A volta é um clique na faixa do topo. Não precisa digitar senha de novo — mas
              fechar a aba perde o atalho.
            </span>
          </li>
        </ul>

        <p className="flex items-center gap-2 text-xs text-faint">
          <TerminalSquare className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Disponível só para o Diretor e só no ambiente de desenvolvimento.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={acessarComo.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={acessarComo.isPending}
            onClick={(event) => {
              /* Sem isto o Radix fecha o diálogo antes de a sessão trocar, e a
                 pessoa fica olhando a tela antiga sem saber se funcionou. */
              event.preventDefault()
              acessarComo.mutate(
                { collaboratorId: collaborator.id, collaboratorName: collaborator.name },
                {
                  onError: (error) => {
                    toast.error(descreverErroAcessarComo(error))
                    onOpenChange(false)
                  },
                },
              )
            }}
          >
            <UserCog className="w-4 h-4 mr-2" />
            {acessarComo.isPending ? 'Entrando...' : `Acessar como ${primeiroNome}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
