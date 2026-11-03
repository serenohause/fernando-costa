import type { LucideIcon } from 'lucide-react'

/*
  AS FAIXAS DE AVISO DO PAINEL (seções 9, 13, 14, 15 e 16 do protótipo).

  A de erro é literal do bloco de `last_error` do Google Agenda em
  IntegrationsSection.tsx: `destructive/10` com borda `destructive/30` e ícone
  `destructive`. As outras três usam as mesmas famílias do StatusBadge, classe
  por classe, sem cor nova no tema:

    info     azul      informação, e o resultado é o que a pessoa queria;
    done     esmeralda concluído;
    warn     âmbar     falta um dado, nada quebrou e nada foi cobrado;
    error    vermelho  há pendência real a resolver fora desta tela.
*/
export type TomDaFaixa = 'info' | 'done' | 'warn' | 'error'

const SUPERFICIE: Record<TomDaFaixa, string> = {
  info: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900',
  done: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900',
  warn: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
  error: 'bg-destructive/10 border-destructive/30',
}

const TINTA: Record<TomDaFaixa, string> = {
  info: 'text-blue-700 dark:text-blue-400',
  done: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  error: 'text-destructive',
}

export default function FaixaDaCobranca({
  tom,
  icone: Icone,
  titulo,
  texto,
  codigo,
}: {
  tom: TomDaFaixa
  icone: LucideIcon
  titulo: string
  texto?: string
  /* O código do provedor, quando houver: fica embaixo, em largura fixa. Serve
     para quem der suporte e não atrapalha quem só precisa corrigir o cadastro. */
  codigo?: string
}) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${SUPERFICIE[tom]}`}>
      <Icone className={`mt-0.5 size-4 shrink-0 ${TINTA[tom]}`} />
      <div>
        <p className={`font-medium ${TINTA[tom]}`}>{titulo}</p>
        {texto ? <p className="mt-0.5 text-muted-foreground">{texto}</p> : null}
        {codigo ? (
          <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">{codigo}</p>
        ) : null}
      </div>
    </div>
  )
}
