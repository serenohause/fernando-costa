import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession, useSignInWithPassword } from '../hooks'

/*
  A TELA DE ENTRADA, redesenhada a pedido do usuário a partir de uma referência
  — com o conceito dela, e não uma cópia.

  O projeto-original/ não tem tela de login (a plataforma base44 autenticava
  antes de o app carregar), então aqui não há fidelidade a perder: a versão
  anterior desta tela seguia o padrão de SolicitarAcesso.jsx por falta de outro,
  e o usuário pediu algo melhor.

  O QUE FOI TIRADO DA REFERÊNCIA
  - Tela dividida: um painel "de imagem", recuado das bordas e com cantos
    arredondados, carrega a marca no topo e uma frase forte embaixo; do outro
    lado, o formulário com muito respiro, alinhado à esquerda.
  - Uma única cor forte, que é a do painel e a do botão de entrar.
  - Um detalhe que quebra a textura (lá, a gaivota).

  O QUE FOI TRADUZIDO
  No lugar da foto do mar, uma TEXTURA DE PRANCHETA — grade fina, traços de
  planta baixa, uma cota. Escritório de arquitetura se reconhece nisso antes de
  ler qualquer palavra. No lugar da gaivota, uma ROSA-DOS-VENTOS, o símbolo que
  toda planta carrega. E tudo é SVG desenhado aqui: nenhuma imagem de terceiro
  para licenciar, nada para carregar pela rede, e a textura acompanha o tema.

  O QUE A REFERÊNCIA TEM E ESTA TELA DE PROPÓSITO NÃO TEM
  - "Entrar com Google" e "Cadastre-se": o sistema não tem nenhum dos dois. O
    acesso é por aprovação de um Diretor (migration 0013), e botão que não
    funciona é pior do que botão que não existe.
  - "Lembrar de mim": o Supabase já mantém a sessão; um checkbox sem efeito
    seria uma promessa falsa.
  - "Esqueci a senha": não há provedor de e-mail transacional (decisão em
    docs/ARCHITECTURE.md). Quem esquece a senha fala com o administrador, e é
    exatamente isso que a linha do rodapé diz.
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

  return (
    /*
      `grid-rows-[auto_1fr]` no celular: sem ele a grade distribui a altura que
      sobra entre as duas linhas, e a faixa do painel crescia até empurrar o
      formulário para longe. Assim a faixa tem a altura dela e o formulário
      fica com o resto.
    */
    <div className="min-h-screen bg-background p-3 lg:p-4 grid grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[1.05fr_1fr] gap-4">
      {/*
        O PAINEL. No celular ele ENCOLHE para uma faixa com a textura e a marca,
        em vez de sumir: sumir levava junto o conceito inteiro da tela, e o que
        sobrava era um formulário solto. Encolher mantém a identidade sem
        empurrar o formulário para baixo da dobra — a frase e a rosa-dos-ventos
        só aparecem onde há espaço para elas.
      */}
      <aside className="relative overflow-hidden rounded-3xl bg-auth-panel text-auth-panel-foreground flex flex-col justify-between h-32 p-6 lg:h-auto lg:p-10 xl:p-12">
        {/*
          A LUZ. A foto da referência tem profundidade — claro onde a água
          reflete, escuro onde é fundo —, e o painel liso não tinha nenhuma. Um
          foco difuso no canto de cima dá esse volume sem imagem nenhuma, e
          cai justamente onde está a planta.
        */}
        <div
          className="absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full bg-auth-panel-foreground/[0.07] blur-3xl"
          aria-hidden
        />
        <BlueprintTexture />

        {/*
          O degradê de baixo faz o papel da parte escura da foto na referência:
          a textura se apaga onde está o texto, e a frase fica legível sem
          precisar de uma caixa por trás.
        */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-auth-panel via-auth-panel/85 to-transparent"
          aria-hidden
        />

        <p className="relative text-sm font-semibold tracking-[0.18em] uppercase">HausOne</p>

        <CompassRose />

        <div className="relative max-w-md hidden lg:block">
          {/* `text-balance` equilibra as linhas: sem ele a frase quebrava
              deixando o "à" pendurado sozinho no fim da primeira. */}
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05] text-balance">
            Do primeiro traço à entrega da obra.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-pretty text-auth-panel-foreground/70">
            Clientes, contratos, projetos e a equipe do escritório, num lugar só.
          </p>
        </div>
      </aside>

      <main className="flex items-start lg:items-center justify-center px-3 pt-8 pb-10 lg:px-6 lg:py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Acesse sua conta</h1>
          <p className="mt-2 text-muted-foreground">Entre com seu e-mail de trabalho.</p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
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
                className="h-11"
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
                  className="h-11 pr-11"
                />
                {/*
                  `type="button"` é o que impede este botão de enviar o
                  formulário: sem ele, clicar no olho tentaria entrar.
                */}
                <button
                  type="button"
                  onClick={() => setShowPassword((atual) => !atual)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-faint hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={signIn.isPending}
            >
              {signIn.isPending ? 'Entrando...' : 'Entrar'}
            </Button>

            {signIn.isError && (
              <p className="text-sm text-destructive" role="alert">
                Não foi possível entrar. Confira o e-mail e a senha.
              </p>
            )}
          </form>

          {/* Um peso só: a versão com a segunda metade em negrito quebrava de
              linha no meio do destaque, e o negrito virava um fragmento solto. */}
          <p className="mt-10 text-sm text-muted-foreground leading-relaxed">
            Sem acesso ou esqueceu a senha? Fale com o administrador do escritório.
          </p>
        </div>
      </main>
    </div>
  )
}

/*
  A TEXTURA DE PRANCHETA. Duas grades — a fina, de papel milimetrado, e a
  grossa, de módulo —, uma planta baixa esboçada com uma porta e uma cota.

  É TEXTURA, NÃO ILUSTRAÇÃO: tudo em `currentColor` com opacidade baixa. Na
  referência a foto do mar faz a mesma coisa — dá matéria ao painel sem competir
  com a frase. Se a planta fosse legível como desenho, ela passaria a ser o
  assunto da tela.

  A planta fica no terço de cima: é onde o degradê ainda não chegou, e onde ela
  não passa por trás do texto.
*/
function BlueprintTexture() {
  return (
    <svg
      className="absolute inset-0 w-full h-full text-auth-panel-foreground"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 800 1000"
    >
      <defs>
        <pattern id="login-grid-fina" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity="0.045" strokeWidth="1" />
        </pattern>
        <pattern id="login-grid-modulo" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="800" height="1000" fill="url(#login-grid-fina)" />
      <rect width="800" height="1000" fill="url(#login-grid-modulo)" />

      {/*
        UM FRAGMENTO, e não uma planta inteira: ela começa dentro do painel e
        SAI pela borda de cima e pela da direita. Planta inteira e centralizada
        se lê como ilustração e vira o assunto da tela; pedaço de uma folha
        maior se lê como a folha em que se está trabalhando — que é o papel da
        textura.
      */}
      <g fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.5">
        <path d="M 400 -60 V 380 H 560 V 470 H 880" />
        <path d="M 400 170 H 640 V -60" />
        <path d="M 640 170 V 470" />
        <path d="M 640 290 H 880" />
        {/* Porta: a folha e o arco de abertura */}
        <path d="M 520 170 V 210" />
        <path d="M 520 170 A 40 40 0 0 1 560 210" strokeDasharray="4 4" />
        {/* Janela na parede da esquerda */}
        <path d="M 396 60 V 130 M 404 60 V 130" />
      </g>

      {/*
        A COTA corre na vertical, ao longo da parede esquerda — e não mais em
        cima, onde disputava a altura da marca.
      */}
      <g stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" fill="none">
        <path d="M 360 -60 V 380" />
        <path d="M 352 380 H 368" />
      </g>
      <text
        x="348"
        y="200"
        textAnchor="middle"
        fontSize="12"
        letterSpacing="1"
        fill="currentColor"
        fillOpacity="0.28"
        transform="rotate(-90 348 200)"
      >
        12,40
      </text>
    </svg>
  )
}

/*
  A ROSA-DOS-VENTOS, no lugar da gaivota da referência: o único elemento do
  painel que não é textura, e por isso o único com contraste de verdade.

  EM ESPAÇO ABERTO, como a gaivota — longe da planta. A primeira versão a punha
  no canto do desenho, e ela passava por mais um traço dele. Aqui ela fica à
  direita, no vão entre o fim da planta e o começo da frase.
*/
function CompassRose() {
  return (
    <svg
      className="hidden lg:block absolute right-14 top-[57%] w-14 h-14 text-auth-panel-foreground"
      viewBox="0 0 64 64"
      aria-hidden
    >
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      <path d="M 32 12 L 38 32 L 32 29 L 26 32 Z" fill="currentColor" fillOpacity="0.9" />
      <path d="M 32 52 L 38 32 L 32 35 L 26 32 Z" fill="currentColor" fillOpacity="0.3" />
      <text x="32" y="8" textAnchor="middle" fontSize="8" fontWeight="600" fill="currentColor" fillOpacity="0.8">
        N
      </text>
    </svg>
  )
}
