import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Building2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession, useSignInWithPassword } from '../hooks'

/*
  A TELA DE ENTRADA, a partir de uma referência visual escolhida pelo usuário —
  o estilo dela, com os padrões deste projeto.

  O projeto-original/ não tem tela de login (a plataforma base44 autenticava
  antes de o app carregar), então aqui não há fidelidade a perder.

  O QUE VEIO DA REFERÊNCIA
  - Formulário à esquerda, CENTRALIZADO na coluna, e um painel escuro à direita,
    recuado das bordas e de cantos arredondados.
  - O painel quase vazio: a marca no centro, formas grandes tom sobre tom ao
    fundo e uma frase curta embaixo. É o silêncio dele que faz a tela parecer
    limpa — uma tentativa anterior com textura e manchete foi recusada.
  - Campos preenchidos, sem borda até receberem foco, e um botão cheio.
  - Uma saudação curta acima do título.

  O QUE É DESTE PROJETO, e não da referência
  - A paleta. O botão é o --primary do tema (slate), e não o amarelo de lá; o
    painel é um carvão tirado dos tons escuros do próprio tema (--auth-panel).
  - O bloco escuro com ícone acima do título, que é o padrão das telas de
    autenticação do projeto (SolicitarAcesso e AcessoPendente).
  - Os ícones Lucide, como no resto do sistema.

  O QUE A REFERÊNCIA TEM E ESTA TELA DE PROPÓSITO NÃO TEM
  "Entrar com Google", "Entrar com Apple", "Cadastre-se" e "Esqueci a senha". O
  sistema não tem nenhum dos quatro: o acesso é por aprovação de um Diretor
  (migration 0013) e não há provedor de e-mail transacional (docs/
  ARCHITECTURE.md). Botão que não funciona é pior que botão que não existe — e o
  rodapé diz o caminho de verdade.
*/
export default function Login() {
  const sessionQuery = useSession()
  const signIn = useSignInWithPassword()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  if (sessionQuery.data) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    signIn.mutate({ email, password })
  }

  /*
    CAMPO PREENCHIDO: fundo cinza e borda transparente em repouso, e a borda e o
    fundo do cartão só no foco. É o estilo da referência, e ele depende do foco
    ficar evidente — sem borda em repouso, o campo ativo precisa se distinguir
    dos outros de algum jeito.
  */
  const campo =
    'h-11 rounded-lg bg-muted border-transparent shadow-none px-4 focus-visible:bg-card focus-visible:border-input'

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-3 lg:p-4 grid lg:grid-cols-2 gap-4">
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center">
            {/* O bloco escuro com ícone das telas de autenticação do projeto. */}
            <div className="w-12 h-12 mx-auto bg-primary rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>

            {/* A marca só aparece aqui no celular: no desktop ela está no
                painel, e repetida viraria ruído. */}
            <p className="lg:hidden mt-4 text-sm font-semibold text-foreground">HausOne</p>

            <p className="mt-6 text-sm text-muted-foreground">Que bom ter você de volta.</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              Acesse sua conta
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                autoFocus
                required
                className={campo}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className={`${campo} pr-11`}
                />
                {/* `type="button"`: sem ele, clicar no olho enviaria o
                    formulário. */}
                <button
                  type="button"
                  onClick={() => setShowPassword((atual) => !atual)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
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

          <p className="mt-8 text-sm text-center text-muted-foreground leading-relaxed">
            Sem acesso ou esqueceu a senha?
            <br />
            <span className="font-medium text-foreground">Fale com o administrador do escritório.</span>
          </p>
        </div>
      </main>

      {/*
        O PAINEL. Some no celular: ele não tem nada que o formulário precise, e
        empurraria o campo de e-mail para baixo da dobra.
      */}
      <aside className="hidden lg:flex relative overflow-hidden rounded-3xl bg-auth-panel text-auth-panel-foreground flex-col items-center justify-center p-12">
        <PanelShapes />

        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-auth-panel-foreground/10 border border-auth-panel-foreground/10 flex items-center justify-center">
            <Building2 className="w-7 h-7" />
          </div>
          <span className="text-4xl font-semibold tracking-tight">HausOne</span>
        </div>

        <p className="absolute bottom-10 inset-x-12 text-center text-sm text-auth-panel-foreground/70">
          Tudo do seu escritório de arquitetura em um só lugar.
        </p>
      </aside>
    </div>
  )
}

/*
  AS FORMAS TOM SOBRE TOM do fundo do painel. Na referência são hexágonos que
  ecoam o logo; aqui são quadrados de canto arredondado que ecoam o bloco do
  ícone ao lado da marca — a mesma forma, em escala de parede.

  Contraste mínimo de propósito: elas dão volume ao painel sem virar desenho.
  Quem olha percebe que o fundo não é liso antes de conseguir dizer o que há
  nele.
*/
function PanelShapes() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="absolute -right-24 top-[12%] w-80 h-80 rounded-[4rem] bg-auth-panel-foreground/2.5 rotate-12" />
      <div className="absolute right-[18%] bottom-[8%] w-72 h-72 rounded-[3.5rem] bg-auth-panel-foreground/2 -rotate-6" />
      <div className="absolute -left-16 bottom-[30%] w-56 h-56 rounded-[3rem] bg-auth-panel-foreground/1.5 rotate-6" />
    </div>
  )
}
