import { Link } from 'react-router'
import { Inbox, Lock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useIsPlatformAdmin } from '@/features/leads/hooks'
import { useSignOut } from '../hooks'

export default function AcessoPendente({ userEmail }: { userEmail: string | undefined }) {
  const signOut = useSignOut()
  /*
    ESTA TELA ERA UM BECO SEM SAIDA PARA A EQUIPE DO PRODUTO.

    O AppLayout exige colaborador ativo, e a conta que le a fila de leads nao e
    colaboradora de escritorio nenhum, de proposito. Ela caia aqui, lendo "um
    diretor do escritorio precisa liberar seu acesso", esperando uma liberacao
    que ninguem pode dar: nao e acesso de escritorio para um Diretor conceder.

    A consulta so roda para quem ja esta nesta tela, ou seja, para quem nao tem
    colaborador ativo. E ela nao decide acesso nenhum: quem decide e a policy
    product_leads_select_platform. Aqui ela so escolhe se existe uma porta a
    mostrar.
  */
  const daEquipeDoProduto = useIsPlatformAdmin().data === true

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/40 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-3">
          {daEquipeDoProduto ? 'Equipe do produto' : 'Aguardando Liberação'}
        </h1>

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
          {daEquipeDoProduto
            ? 'Esta conta é da equipe do produto, e não pertence a nenhum escritório. O backoffice não se aplica a ela: o que ela abre é a fila de leads.'
            : 'Seu e-mail foi validado com sucesso! Agora seu acesso precisa ser aprovado pelo administrador para que você possa utilizar o sistema.'}
        </p>

        {/*
          A CAIXA DE STATUS NAO SERVE PARA A EQUIPE DO PRODUTO. Ela diz que um
          Diretor precisa liberar, e nao ha o que liberar: o acesso daquela conta
          nao e de escritorio, e nenhum Diretor pode conceder. Texto que manda a
          pessoa esperar por algo que nao vem e o mesmo erro que a copy desta
          tela ja corrigiu uma vez, logo acima.
        */}
        {!daEquipeDoProduto && (
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
        )}

        <div className="space-y-3">
          {daEquipeDoProduto && (
            <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/Leads">
                <Inbox className="w-4 h-4 mr-2" />
                Ir para a fila de leads
              </Link>
            </Button>
          )}
          <Button
            onClick={() => signOut.mutate()}
            variant={daEquipeDoProduto ? 'outline' : 'default'}
            className={
              daEquipeDoProduto
                ? 'w-full'
                : 'w-full bg-primary text-primary-foreground hover:bg-primary/90'
            }
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
