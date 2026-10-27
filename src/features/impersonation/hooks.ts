import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { impersonationHabilitada } from '@/lib/env'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/edge-functions'
import { COLLABORATOR_ROLE, labelOf, type CollaboratorRole } from '@/lib/enums'
import { useSession } from '@/features/auth/hooks'
import { guardarEstado, lerEstado, limparEstado, type EstadoAcessarComo } from './storage'

/*
  "ACESSAR COMO" — o Diretor assume a sessão de um colaborador do escritório.

  O QUE ACONTECE DE VERDADE, porque a palavra "visualizar" engana aqui: não há
  simulação. A sessão do navegador passa a ser a da outra pessoa, com o JWT
  dela, e quem responde "o que eu posso ver" é a RLS — uma vez só, para o
  sistema inteiro. Fingir no frontend responderia "o que ele consegue clicar" e
  mentiria sobre "o que ele consegue ler": `can_view_menu`/`can_edit_menu` têm
  atalho de Diretor (0014).

  A CONSEQUÊNCIA É IRREVERSÍVEL NO HISTÓRICO: tarefa movida, item de diário,
  contrato gerado — tudo fica no nome de quem foi assumido, porque foi a sessão
  dela que escreveu. O único lugar que sabe a verdade é `impersonation_events`
  (0109), gravado antes de o token existir.

  A FAIXA TEM O MESMO TEMPO DE VIDA DA SESSÃO ASSUMIDA, e isso é requisito de
  segurança, não detalhe: as duas moram em `localStorage`. Enquanto houver
  sessão assumida há faixa, em qualquer aba. Ver o cabeçalho de storage.ts para
  o defeito que isso conserta.

  POR QUE RECARREGAR A PÁGINA NAS DUAS PONTAS
  Trocar de sessão invalida TUDO que está em memória: o cache do React Query, os
  `staleTime: Infinity` da sessão e do escritório, as permissões de menu, os
  `useMemo` de tela. Dar `queryClient.clear()` e torcer para nada ter ficado
  seria a versão frágil disso. Recarregar é a versão que não tem exceção — e o
  gesto já é raro e deliberado, não um clique de navegação.
*/

type RespostaAcessarComo = {
  tokenHash: string
  /* De quem é a sessão que está sendo entregue. É o que dá dono à chave do
     localStorage, e sem dono a faixa aparecia para quem logasse depois. */
  targetUserId: string
  targetName: string
  targetRole: string
}

/*
  A FEATURE EXISTE NESTA TELA? Terceira das quatro fechaduras: a variável só
  existe no .env.dev. As outras três são o segredo IMPERSONATION_ENABLED na edge
  function, a função só publicada em dev e a migration 0109 só aplicada em dev.
*/
export function acessarComoDisponivel(): boolean {
  return impersonationHabilitada
}

/*
  A SESSÃO ASSUMIDA DE AGORA, lida uma vez. Não é estado reativo de propósito:
  as duas transições terminam em recarga da página, então nada muda debaixo de
  quem já está renderizando.

  A CHAVE SÓ VALE SE FOR DESTA SESSÃO, e esse é o conserto de um achado crítico.
  Antes, a existência da chave bastava, e ela sobrevive ao logout (`useSignOut`
  não a apagava, e agora apaga). O resultado era que a próxima pessoa a entrar
  naquele navegador via a faixa com o nome do Diretor e um botão que entregava a
  conta dele, sem senha e sem registro na trilha.

  ENQUANTO A SESSÃO ESTÁ CARREGANDO, devolve null: a faixa aparece um instante
  depois, e isso é de longe o lado certo para errar. E NÃO apaga a chave em caso
  de divergência, de propósito: apagar enquanto a sessão apenas ainda não
  chegou destruiria a passagem de volta de quem está legitimamente dentro de uma
  sessão assumida. Quem apaga é o logout, que sabe que acabou.
*/
export function useAcessarComoAtivo(): EstadoAcessarComo | null {
  /* Lido no primeiro render e mantido: devolver objeto novo a cada render faria
     qualquer `useMemo` que dependesse dele recalcular para sempre. Vale em
     qualquer aba, porque a chave é de `localStorage`. */
  const [estado] = useState<EstadoAcessarComo | null>(() =>
    impersonationHabilitada ? lerEstado() : null,
  )

  const usuarioAtual = useSession().data?.user ?? null

  if (!estado) return null
  if (!usuarioAtual) return null
  if (usuarioAtual.id !== estado.alvoUserId) return null

  return estado
}

export function useAcessarComo() {
  return useMutation({
    mutationFn: async (input: { collaboratorId: string; collaboratorName: string }) => {
      if (!impersonationHabilitada) {
        throw new Error('Acessar como não está disponível neste ambiente.')
      }

      /*
        UM SALTO DE CADA VEZ. Assumir a partir de uma sessão já assumida faria
        duas coisas ruins de uma vez: a trilha registraria o INTERMEDIÁRIO como
        autor (a função SQL não tem como distinguir sessão assumida de login
        real — é esse o ponto da feature), e o segundo `guardarEstado`
        sobrescreveria a passagem de volta do Diretor original, que ficaria
        preso na conta do meio.
      */
      if (lerEstado()) {
        throw new Error(
          'Você já está em uma sessão assumida. Volte para a sua conta antes de acessar como outra pessoa.',
        )
      }

      /*
        A SESSÃO DE VOLTA É LIDA ANTES DE QUALQUER COISA. Depois do `verifyOtp`
        ela não existe mais em lugar nenhum — o supabase-js guarda uma só.
      */
      const { data: atual } = await supabase.auth.getSession()
      if (!atual.session) {
        throw new Error('Sua sessão expirou. Entre de novo para continuar.')
      }

      const { data: eu } = await supabase
        .from('collaborators')
        .select('name')
        .eq('user_id', atual.session.user.id)
        .maybeSingle()

      const resposta = await invokeEdgeFunction<RespostaAcessarComo>(
        'impersonate-collaborator',
        { collaboratorId: input.collaboratorId },
      )

      /*
        GUARDAR ANTES DE TROCAR, e abortar se não der. Trocar primeiro e falhar
        ao guardar deixaria o Diretor dentro da conta de outra pessoa sem
        caminho de volta — o pior dos dois erros possíveis aqui.
      */
      const guardou = guardarEstado({
        diretor: {
          access_token: atual.session.access_token,
          refresh_token: atual.session.refresh_token,
        },
        diretorNome: eu?.name ?? 'sua conta',
        alvoUserId: resposta.targetUserId,
        alvoNome: resposta.targetName,
        alvoFuncao: labelOf(COLLABORATOR_ROLE, resposta.targetRole as CollaboratorRole),
        iniciadoEm: new Date().toISOString(),
      })

      if (!guardou) {
        throw new Error(
          'Este navegador não deixou guardar a sua sessão, e sem isso não haveria como voltar. Nada foi alterado.',
        )
      }

      /*
        `type: 'email'` é o que o supabase-js chama de magic link no
        `verifyOtp`. O token é de uso único: a partir daqui a sessão do
        navegador é a do colaborador.
      */
      const { error } = await supabase.auth.verifyOtp({
        token_hash: resposta.tokenHash,
        type: 'email',
      })

      if (error) {
        limparEstado()
        throw new Error('Não foi possível abrir a sessão. Nada foi alterado.')
      }

      return resposta
    },
    onSuccess: () => {
      /* Rota raiz: cada função entra num painel diferente, e quem decide qual é
         o roteador de entrada, já com a sessão nova. */
      window.location.assign('/')
    },
  })
}

export function useVoltarParaMinhaConta() {
  return useMutation({
    mutationFn: async () => {
      const estado = lerEstado()
      if (!estado) {
        throw new Error('Não há sessão guardada para voltar.')
      }

      /*
        A VOLTA SÓ VALE PARA QUEM ESTÁ DENTRO DA SESSÃO ASSUMIDA.

        Mesmo achado crítico da faixa, conferido aqui também porque esta é a
        função que de fato entrega a conta do Diretor: `setSession` com o que
        estiver guardado, sem perguntar de quem é. A faixa já não aparece para
        outra sessão, mas a faixa é tela, e tela não é barreira: a mutação é
        alcançável por quem chamar ela direto.

        Aqui a sessão é lida com `getSession`, e não por query, então ou ela
        existe agora ou não existe. Divergência apaga a chave: diferente da
        faixa, neste ponto já se sabe que a pessoa sentada na frente não é a
        dona da passagem, e deixar o token do Diretor ali seria guardar a
        escalada para a próxima tentativa.
      */
      const { data: sessaoAgora } = await supabase.auth.getSession()
      const quemEstaAqui = sessaoAgora.session?.user?.id ?? null

      if (!quemEstaAqui || quemEstaAqui !== estado.alvoUserId) {
        limparEstado()
        throw new Error(
          'Esta sessão não é a que foi assumida. Entre com a sua própria senha.',
        )
      }

      /*
        REVOGAR A SESSÃO ASSUMIDA ANTES DE SAIR DELA. `setSession` só troca o
        que está no navegador: sem isto, o refresh token emitido para o
        colaborador continua válido no servidor depois da volta, e cada
        "Acessar como" deixaria para trás uma credencial viva dele que ninguém
        vê e ninguém expira.

        `scope: 'local'` derruba SÓ a sessão corrente — a que acabou de ser
        emitida. `'global'` seria errado: expulsaria a pessoa do próprio login,
        no aparelho dela, sem ela ter feito nada.

        Falhar aqui não impede a volta: ficar preso na conta do outro é pior que
        um token sobrando. O erro vai para o console e o fluxo segue.
      */
      const { error: revogacao } = await supabase.auth.signOut({ scope: 'local' })
      if (revogacao) {
        console.error('[acessar-como] falha ao revogar a sessao assumida:', revogacao)
      }

      const { error } = await supabase.auth.setSession({
        access_token: estado.diretor.access_token,
        refresh_token: estado.diretor.refresh_token,
      })

      /*
        A CHAVE SÓ É APAGADA DEPOIS DE A VOLTA DAR CERTO. Apagar antes e falhar
        deixaria o Diretor preso na conta da outra pessoa, com a faixa sumida e
        nenhum botão para tentar de novo.
      */
      if (error) {
        throw new Error(
          'Não foi possível voltar para a sua conta. Saia e entre de novo com a sua senha.',
        )
      }

      limparEstado()
    },
    onSuccess: () => {
      window.location.assign('/')
    },
  })
}

export function descreverErroAcessarComo(error: unknown): string {
  if (error instanceof EdgeFunctionError) return error.message
  if (error instanceof Error) return error.message
  return 'Não foi possível concluir a operação.'
}
