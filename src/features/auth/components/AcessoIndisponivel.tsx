import { AlertCircle, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSignOut } from '../hooks'

/*
  Tela sem equivalente no original: lá, uma falha ao carregar colaborador ou
  permissões só ia para o console e o app ficava preso no skeleton. Com a RLS
  como autoridade, "permission denied" é um estado normal e precisa de saída.
  Estilo e microcopy seguem AcessoPendente e ErrorBoundary.
*/
export default function AcessoIndisponivel({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const signOut = useSignOut()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center mb-3">
          Não foi possível carregar seu acesso
        </h1>

        <p className="text-slate-600 text-center mb-6">
          Ocorreu um erro ao consultar seu cadastro e suas permissões. Tente novamente ou saia e
          entre de novo.
        </p>

        {error != null && (
          <details className="text-left mb-6">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 p-3 bg-slate-100 rounded text-xs text-slate-700 overflow-auto">
              {String(error)}
            </pre>
          </details>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={onRetry} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </Button>
          <Button
            onClick={() => signOut.mutate()}
            className="gap-2 bg-slate-900 hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </Card>
    </div>
  )
}
