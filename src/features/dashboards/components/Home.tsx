import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import TenantName from '@/features/auth/components/TenantName'
import { useCurrentTenant } from '@/features/auth/hooks'
import { createPageUrl } from '@/lib/page-url'
import { tenantInitials } from '@/lib/tenant-initials'
import { useHomeDashboardTarget } from '../hooks'

/*
  Porta de projeto-original/src/pages/Home.jsx — a rota de entrada.

  A tela é só a espera: o quadrado com as iniciais do escritório, o nome dele,
  "HAUSONE" em caixa alta espaçada, o spinner e o "Carregando...". Geometria (w-32 h-32,
  rounded-3xl, shadow-2xl, mb-8/mb-6/mb-4, text-5xl, text-3xl) e microcopy são os
  do original. O degradê de fundo e o do quadrado vêm dos tokens: `from-slate-50
  to-slate-100` é `from-background to-muted` (ver o comentário do src/index.css,
  e o mesmo par já usado em Login/AcessoPendente), e o bloco escuro do quadrado
  segue o precedente do Login, que traduz o slate-900 do original para `primary`.

  A REGRA DE PARA ONDE IR NÃO ESTÁ AQUI. `useHomeDashboardTarget` compõe a
  escolha por ÁREA deste arquivo com o redirecionamento por FUNÇÃO do Layout —
  ver `homeTargetFor` em ../list.ts, que documenta as duas metades e por que elas
  são uma função só. No original o Layout roda depois e sempre vence, o que
  produz um salto de tela visível; aqui o destino já sai resolvido.

  A BUSCA POR E-MAIL DO ORIGINAL TAMBÉM NÃO ESTÁ AQUI: ele baixa a lista inteira
  de colaboradores e procura por texto de e-mail. O hook usa o colaborador da
  sessão, que o AppLayout já deixou em cache.

  QUEM NÃO TEM CADASTRO ATIVO NUNCA CHEGA A ESTA TELA: o AppLayout trata sessão
  ausente, cadastro pendente e falha de leitura antes de renderizar a página. Por
  isso `isError` aqui só impede o redirecionamento — não há segunda tela de erro
  para desenhar, e o original nesse ramo manda para o login, que é o que o
  AppLayout faz.

  A NAVEGAÇÃO É COM `replace`, e é correção: no original (Home.jsx:24-35) ela é
  um `navigate` comum, então esta tela de espera FICA NO HISTÓRICO — quem apertar
  "voltar" cai de novo aqui, é redirecionado para frente no quadro seguinte e não
  consegue passar deste ponto. O botão "voltar" do navegador deixava de funcionar
  na primeira tela do sistema. `replace` troca a entrada em vez de empilhar: a
  rota de entrada some do histórico, que é o que uma rota de entrada faz.
*/
export default function Home() {
  const navigate = useNavigate()
  const { target, isLoading, isError } = useHomeDashboardTarget()
  const initials = tenantInitials(useCurrentTenant().data?.name)

  useEffect(() => {
    if (isLoading || isError) return
    navigate(createPageUrl(target), { replace: true })
  }, [isLoading, isError, target, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="text-center px-4">
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto bg-gradient-to-br from-primary to-soft rounded-3xl flex items-center justify-center shadow-2xl mb-6">
            {/* "FC" era literal; agora sai do nome do escritório por
                `tenantInitials`, que limita a duas letras justamente para o
                quadrado de lado fixo não estourar. Enquanto o nome não chega, o
                quadrado fica vazio — ele tem tamanho próprio, nada salta. */}
            <span className="text-primary-foreground font-bold text-5xl">{initials}</span>
          </div>
          {/* `uppercase` no lugar da caixa alta escrita na string, e
              `max-w-xs`/`wrap-break-word` para nome comprido quebrar dentro da
              coluna em vez de passar da tela. Corpo, peso e mb-2 são os do
              original. */}
          <h1 className="text-3xl font-bold text-foreground mb-2 uppercase max-w-xs mx-auto wrap-break-word">
            <TenantName />
          </h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest">HausOne</p>
        </div>
        <Loader2 className="w-8 h-8 text-faint animate-spin mx-auto mb-4" />
        <p className="text-soft">Carregando...</p>
      </div>
    </div>
  )
}
