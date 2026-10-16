import { type FormEvent, useState } from 'react'
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeDatabaseError } from '@/lib/db-errors'
import { useSignOut, useTrocarSenhaProvisoria } from '../hooks'

/*
  A PAREDE DO PRIMEIRO ACESSO.

  Quem entra com a senha provisória que o Diretor criou na tela de Equipe não
  chega ao sistema: vê esta tela até escolher uma senha própria. É o que separa
  "senha provisória" de "senha que duas pessoas sabem para sempre".

  Estilo e microcopy seguem AcessoPendente e AcessoIndisponivel — mesmo cartão
  centrado, mesmo bloco de ícone, mesmo botão de sair no rodapé. Sair existe
  porque a pessoa pode ter entrado na conta errada, e sem saída ela ficaria
  presa nesta tela.

  A REGRA DE TAMANHO É A DO SERVIDOR (8 caracteres, padrão do Supabase Auth), e
  está escrita na tela: recusar depois de enviar, com mensagem do GoTrue em
  inglês, é o jeito ruim de dizer a mesma coisa.
*/
export default function TrocarSenhaProvisoria({ userEmail }: { userEmail: string | undefined }) {
  const signOut = useSignOut()
  const trocar = useTrocarSenhaProvisoria()

  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [visivel, setVisivel] = useState(false)
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErroLocal(null)

    if (senha.length < 8) {
      setErroLocal('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErroLocal('As duas senhas não são iguais.')
      return
    }

    trocar.mutate(senha)
  }

  const mensagemDeErro = erroLocal ?? (trocar.error ? describeDatabaseError(trocar.error) : null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-3">Crie sua senha</h1>

        <p className="text-soft text-center mb-6">
          Você entrou com uma senha provisória, criada por quem cuida do sistema. Escolha agora uma
          senha só sua para continuar.
        </p>

        {userEmail && (
          <p className="text-sm text-muted-foreground text-center mb-6">
            Conta: <span className="font-medium text-soft">{userEmail}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <div className="relative">
              <Input
                id="nova-senha"
                type={visivel ? 'text' : 'password'}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setVisivel((atual) => !atual)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {visivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmar-senha">Repita a nova senha</Label>
            <Input
              id="confirmar-senha"
              type={visivel ? 'text' : 'password'}
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {mensagemDeErro && (
            <p className="text-sm text-destructive" role="alert">
              {mensagemDeErro}
            </p>
          )}

          <Button
            type="submit"
            disabled={trocar.isPending}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {trocar.isPending ? 'Salvando...' : 'Salvar e entrar'}
          </Button>
        </form>

        <Button
          variant="ghost"
          onClick={() => signOut.mutate()}
          className="w-full mt-4 text-muted-foreground"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </Card>
    </div>
  )
}
