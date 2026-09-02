import { useNavigate } from 'react-router'
import CardLink from '@/components/shared/CardLink'
import { useMenuPermissions } from '@/features/auth/hooks'
import { createPageUrl } from '@/lib/page-url'

/*
  O NOME DE UM CLIENTE, EM QUALQUER LUGAR DO SISTEMA, ABRE O CADASTRO DELE.

  Pedido do usuário, e literal: "em todo lugar que tiver o nome do cliente é pra
  ser linkado". Cada tela tinha três decisões idênticas a tomar — a permissão de
  menu, a URL do detalhe e a armadilha do clique dentro de cartão arrastável — e
  três decisões repetidas em nove telas é onde uma delas fica para trás.

  A PERMISSÃO É COERÊNCIA COM O MENU, NÃO CONFIDENCIALIDADE. Não há guarda na
  rota `/ClientDetail` e a policy de leitura de `clients` é larga de propósito:
  qualquer colaborador ativo lê. Quem digitar a URL entra. O que a permissão
  governa é para onde a tela CONVIDA a pessoa a ir — se o escritório tirou o CRM
  da barra lateral dela, oferecer uma porta lateral aqui contradiz essa decisão.

  Sem `clientId` vira texto: o cliente pode não estar vinculado (contrato
  lançado antes do cadastro, propriedade do mapa solta), e um link para lugar
  nenhum é pior que nenhum link.
*/
export default function ClientLink({
  clientId,
  name,
  fallback = 'Sem cliente',
  className,
}: {
  clientId: string | null | undefined
  name: string | null | undefined
  /* O que aparece quando não há cliente. Cada tela já tinha o seu texto. */
  fallback?: string
  className?: string
}) {
  const navigate = useNavigate()
  const { canView: canViewCrm } = useMenuPermissions('crm')

  return (
    <CardLink
      enabled={canViewCrm && Boolean(clientId)}
      onClick={() => navigate(createPageUrl('ClientDetail') + `?id=${clientId}`)}
      className={className}
    >
      {name ?? fallback}
    </CardLink>
  )
}
