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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/40 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-3">
          Não foi possível carregar seu acesso
        </h1>

        <p className="text-soft text-center mb-6">
          Ocorreu um erro ao consultar seu cadastro e suas permissões. Tente novamente ou saia e
          entre de novo.
        </p>

        {error != null && (
          <details className="text-left mb-6">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-soft">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded text-xs text-soft overflow-auto">
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
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </Card>
    </div>
  )
}
