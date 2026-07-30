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
      <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">{description}</p>
      {error != null && (
        <details className="text-left mb-6 max-w-md w-full">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-soft">
            Detalhes técnicos
          </summary>
          <pre className="mt-2 p-3 bg-muted rounded text-xs text-soft overflow-auto">
            {technicalDetail(error)}
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

/*
  O que aparece em "Detalhes técnicos" — e o que NÃO aparece.

  A mensagem crua do Postgres descreve o schema: "permission denied for table
  clients", "violates check constraint clients_email_format_check". Serve para
  quem depura e não serve para quem usa; e este componente é a tela de erro de
  todos os módulos, inclusive os que ainda não existem.

  Então a tela mostra o CÓDIGO, que é o que identifica o problema numa conversa
  com quem mantém o sistema, e a mensagem completa vai para o console, onde
  quem depura já olha. Erro sem código (rede, por exemplo) mostra o nome do
  tipo, que também não descreve estrutura interna.
*/
function technicalDetail(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  const detail =
    typeof code === 'string' && code
      ? `Código: ${code}`
      : error instanceof Error
        ? `Tipo: ${error.name}`
        : 'Erro sem código'

  if (import.meta.env.DEV) {
    console.error('[ErrorState]', error)
  }

  return `${detail}\n\nSe o problema continuar, informe este código a quem mantém o sistema.`
}
