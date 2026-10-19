import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { initialsOf } from '@/features/projects/initials'
import { descreverErroAcessarComo, useVoltarParaMinhaConta } from '../hooks'
import type { EstadoAcessarComo } from '../storage'

/*
  A FAIXA DE SESSÃO ASSUMIDA.

  Ela tem um trabalho só, e é um trabalho de segurança: enquanto estiver na
  tela, nada do que o Diretor fizer é dele. Um gesto distraído aqui vira
  histórico no nome de outra pessoa, e o histórico não volta atrás.

  POR QUE VIOLETA, e não vermelho nem âmbar. Neste produto vermelho é "Remover"
  e "Em atraso"; âmbar é "Em aprovação" e espera. Usar um dos dois faria a
  sessão assumida parecer DEFEITO — e ela não é: é um modo deliberado. Violeta
  já é a cor de pessoa da equipe aqui (o crachá da tela Equipe é
  `from-violet-100 to-violet-200` com `text-violet-600`), e no StatusBadge
  violeta é fase, nunca erro.

  A COR É A MESMA NOS DOIS TEMAS, de propósito: é a cor de um MODO, e modo que
  muda de cor junto com o tema deixa de ser reconhecível de relance.

  ALTURA FIXA (`h-14`), e não `py-2`: o shell inteiro desce por este número —
  a sidebar, o cabeçalho grudado e a altura da área de rolagem (ver AppLayout).
  Com padding, a altura mudaria com o tamanho da fonte e cada deslocamento
  viraria uma conta diferente.

  UMA LINHA SÓ EM QUALQUER LARGURA. Abaixo de `lg` some o bloco "Sua conta";
  abaixo de `sm` o botão encurta para "Voltar". O que NUNCA encurta é o nome de
  quem está sendo representado — é a única informação que a faixa existe para
  dar.
*/
export default function ImpersonationBanner({ estado }: { estado: EstadoAcessarComo }) {
  const voltar = useVoltarParaMinhaConta()

  return (
    <div
      /*
        Acima de `--z-header` (100) para passar na frente da barra do topo e da
        sidebar, e MUITO abaixo dos overlays (o menor é 40000) para não cobrir
        diálogo nenhum. Um aviso que tapa a confirmação que ele mesmo pediu
        seria pior que nenhum aviso.
      */
      style={{ zIndex: 200 }}
      className="fixed top-0 left-0 right-0 h-14 bg-violet-700 text-violet-100 flex items-center gap-3 px-3 sm:px-4 lg:px-6"
      role="status"
    >
      <div
        className="shrink-0 w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-semibold"
        aria-hidden
      >
        {initialsOf(estado.alvoNome)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-200">
          Sessão assumida
        </p>
        <p className="text-sm truncate">
          {/* A frase é que some no celular, nunca o nome. */}
          <span className="hidden sm:inline">Você está usando o sistema como </span>
          <span className="font-semibold">{estado.alvoNome}</span>
          <span className="text-violet-200"> · {estado.alvoFuncao}</span>
        </p>
      </div>

      <div className="hidden lg:block text-right leading-tight shrink-0">
        <p className="text-xs text-violet-200">Sua conta</p>
        <p className="text-sm">{estado.diretorNome}</p>
      </div>

      <button
        type="button"
        onClick={() =>
          voltar.mutate(undefined, {
            onError: (error) => toast.error(descreverErroAcessarComo(error)),
          })
        }
        disabled={voltar.isPending}
        className="shrink-0 inline-flex items-center gap-2 h-9 px-3 sm:px-4 rounded-lg bg-violet-100 text-violet-700 text-sm font-medium hover:bg-white transition-colors disabled:opacity-60"
      >
        <Undo2 className="w-4 h-4 shrink-0" />
        {voltar.isPending ? (
          'Voltando...'
        ) : (
          <>
            <span className="hidden sm:inline">Voltar para minha conta</span>
            <span className="sm:hidden">Voltar</span>
          </>
        )}
      </button>
    </div>
  )
}
