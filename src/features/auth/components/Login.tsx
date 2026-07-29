import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession, useSignInWithPassword } from '../hooks'

/*
  O projeto-original/ não tem tela de login: a plataforma base44 autenticava
  antes de o app carregar. O layout desta tela não foi inventado — segue o
  padrão que o original já usa nas telas de autenticação fora do shell
  (SolicitarAcesso.jsx e AcessoPendente.jsx): fundo em degradê slate, cartão
  centralizado de max-w-md, bloco escuro com ícone, título e subtítulo
  centralizados, botão slate-900 de largura cheia.

  Provedor definido com o usuário: e-mail e senha. A senha inicial vem do
  convite do Supabase Auth, disparado na aprovação do acesso — ver
  docs/ARCHITECTURE.md.
*/
export default function Login() {
  const sessionQuery = useSession()
  const signIn = useSignInWithPassword()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (sessionQuery.data) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    signIn.mutate({ email, password })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary-foreground" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-2">Backoffice</h1>
        <p className="text-soft text-center mb-6">Entre com seu e-mail de trabalho</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={signIn.isPending}
          >
            {signIn.isPending ? 'Entrando...' : 'Entrar'}
          </Button>

          {signIn.isError && (
            <p className="text-sm text-destructive text-center" role="alert">
              Não foi possível entrar. Confira o e-mail e a senha.
            </p>
          )}
        </form>

        <p className="text-xs text-center text-muted-foreground mt-6">
          Ainda não tem acesso? Fale com o administrador do escritório.
        </p>
      </Card>
    </div>
  )
}
