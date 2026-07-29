import { Lock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSignOut } from '../hooks'

export default function AcessoPendente({ userEmail }: { userEmail: string | undefined }) {
  const signOut = useSignOut()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/40 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-3">Aguardando Liberação</h1>

        {/*
          Copy alterada em relação ao original, com aprovação do usuário.

          O original promete duas coisas que este sistema ainda não faz: que a
          solicitação foi enviada ao administrador e que a pessoa receberá um
          e-mail na aprovação. No base44 as duas dependiam da integração
          Core.SendEmail, que não tem equivalente aqui — a decisão foi seguir
          sem provedor de e-mail por enquanto (ver docs/ARCHITECTURE.md). Tela
          que promete e-mail e não manda faz a pessoa esperar por algo que não
          vem, então o texto passa a dizer só o que é verdade hoje.
        */}
        <p className="text-soft text-center mb-6">
          Seu e-mail foi validado com sucesso! Agora seu acesso precisa ser aprovado pelo
          administrador para que você possa utilizar o sistema.
        </p>

        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-900">
          <p className="text-sm text-blue-900 dark:text-blue-200 mb-2">
            <strong>Status do seu acesso:</strong>
          </p>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse"></div>
            <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Aguardando liberação
            </span>
          </div>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>Um diretor do escritório precisa liberar seu acesso</li>
            <li>Avise quem cuida do sistema para agilizar</li>
            <li>Depois de liberado, basta recarregar a página</li>
          </ul>
        </div>

        <div>
          <Button
            onClick={() => signOut.mutate()}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-6">
          E-mail conectado: <strong>{userEmail}</strong>
        </p>
      </Card>
    </div>
  )
}
