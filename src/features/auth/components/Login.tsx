import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession, useSignInWithPassword } from '../hooks'

/*
  PENDENTE DE DECISÃO DO USUÁRIO.

  O `projeto-original/` não tem tela de login — a plataforma base44 cuidava da
  autenticação e o app já recebia o usuário logado (`base44.auth.me()`).
  Welcome.jsx, SolicitarAcesso.jsx e AcessoPendente.jsx são telas pós-login e
  não servem de referência visual para esta.

  Esta tela é só o mínimo para conseguir uma sessão do Supabase Auth durante o
  desenvolvimento. Não foi desenhada e não deve ser tratada como aprovada:
  falta decidir o provedor (e-mail/senha, magic link, Google), o que acontece
  com quem não tem cadastro e como isso conversa com a solicitação de acesso.
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
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

        <Button type="submit" className="w-full" disabled={signIn.isPending}>
          Entrar
        </Button>

        {signIn.isError && (
          <p className="text-sm text-destructive">{(signIn.error as Error).message}</p>
        )}
      </form>
    </div>
  )
}
