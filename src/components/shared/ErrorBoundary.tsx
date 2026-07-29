import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createPageUrl } from '@/lib/page-url'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={() => this.setState({ hasError: false, error: null })}
        />
      )
    }

    return this.props.children
  }
}

function ErrorFallback({ error, resetError }: { error: Error | null; resetError: () => void }) {
  const navigate = useNavigate()

  const handleGoBack = () => {
    resetError()
    navigate(-1)
  }

  const handleGoHome = () => {
    resetError()
    navigate(createPageUrl('Dashboard'))
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
        </div>

        <h2 className="text-xl font-semibold text-foreground mb-2">
          Não foi possível carregar esta página
        </h2>

        <p className="text-soft mb-6">
          Ocorreu um erro ao tentar exibir o conteúdo. Tente voltar ou ir para a página inicial.
        </p>

        {error && (
          <details className="text-left mb-6">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-soft">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded text-xs text-soft overflow-auto">
              {error.toString()}
            </pre>
          </details>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={handleGoBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Button onClick={handleGoHome} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Home className="w-4 h-4" />
            Ir para Visão Geral
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default ErrorBoundary
