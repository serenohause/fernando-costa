import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/*
  Sem equivalente no projeto-original/: lá, falha de leitura só ia para o
  console e a tela ficava em branco ou com lista vazia — o que é pior do que
  mostrar o erro, porque "vazio" e "não deu para carregar" viram a mesma coisa.
  Com a RLS como autoridade, erro de leitura é estado esperado e precisa de
  saída, como já decidido em AcessoIndisponivel.tsx.

  Geometria e espaçamento são os do EmptyState do original; o par de cores
  rose-100/rose-600 é o mesmo que o original usa no bloco de acesso negado.
*/
export default function ErrorState({
  title = 'Não foi possível carregar',
  description,
  error,
  onRetry,
}: {
  title?: string
  description?: string
  error?: unknown
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-rose-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-500 text-center max-w-md mb-6">{description}</p>
      {error != null && (
        <details className="text-left mb-6 max-w-md w-full">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
            Detalhes técnicos
          </summary>
          <pre className="mt-2 p-3 bg-slate-100 rounded text-xs text-slate-700 overflow-auto">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        </details>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  )
}
