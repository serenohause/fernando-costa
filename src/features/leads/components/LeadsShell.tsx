import { Navigate } from 'react-router'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import LoadingPage from '@/components/shared/LoadingPage'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { useCurrentUser, useSignOut } from '@/features/auth/hooks'
import Leads from './Leads'

/*
  A CASCA DA FILA DE LEADS, E POR QUE ELA NÃO É O AppLayout.

  O AppLayout exige colaborador ATIVO de algum escritório: sem isso ele mostra
  "Acesso Pendente" e não renderiza rota nenhuma. Faz todo sentido para as 20
  telas do backoffice, e nenhum para esta.

  Quem lê a fila é a equipe que FAZ o produto, e ela não é colaboradora de
  escritório nenhum. Para encaixar `/Leads` dentro do AppLayout havia duas
  saídas, e as duas eram piores:

    - pôr a conta da equipe do produto como colaboradora do escritório do
      cliente. Ela passaria a aparecer na lista de equipe dele, e a tranca de
      uma fila com dado pessoal de terceiros viraria o login de alguém dentro
      de um escritório que não é nosso;
    - inventar um tenant "HausOne". O CLAUDE.md define tenant como "um
      escritório de arquitetura"; um tenant que não é escritório mente para o
      modelo, e mentira de modelo cobra juros depois.

  Então a tela fica FORA, com a casca mínima que ela precisa. O precedente de
  rota fora do AppLayout já existe (`/FormularioCliente`), por um motivo
  parecido: quem a usa nunca vai ter login de escritório.

  O QUE ESTA CASCA FAZ, E O QUE ELA NÃO FAZ
    Faz: espera a sessão, manda para `/login` quem não tem, e desenha barra com
    o nome do produto, tema e sair. Não faz: barra lateral, menu, permissão de
    menu, breadcrumb, troca de escritório. Nada disso se aplica a quem não está
    dentro de um escritório.

    Ela NÃO decide se a pessoa pode ler a fila. Isso continua sendo da policy
    `product_leads_select_platform` (migration 0112): quem tem sessão e não está
    em `platform_admins` chega aqui, vê a casca, e a tela de dentro diz que não é
    acesso dela. Era assim antes e continua sendo.
*/
export default function LeadsShell() {
  const { data: usuario, isLoading } = useCurrentUser()
  const sair = useSignOut()

  if (isLoading) return <LoadingPage />
  if (!usuario) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-8">
          <div className="min-w-0">
            {/*
              A assinatura do produto, e não o nome de um escritório. No
              AppLayout o lugar de destaque é do <TenantName />, com "HAUSONE"
              miúdo embaixo; aqui a hierarquia inverte, porque esta tela é
              nossa.
            */}
            <p className="truncate text-sm font-light uppercase tracking-[0.15em] text-foreground">
              HausOne
            </p>
            <p className="truncate text-[10px] tracking-[0.3em] text-muted-foreground">
              EQUIPE DO PRODUTO
            </p>
          </div>

          <div className="flex items-center gap-1">
            <span className="mr-2 hidden truncate text-xs text-muted-foreground sm:block">
              {usuario.email}
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair"
              onClick={() => sair.mutate()}
              disabled={sair.isPending}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <Leads />
    </div>
  )
}
