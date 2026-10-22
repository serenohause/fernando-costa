/*
  ONDE A SESSÃO DO DIRETOR FICA ENQUANTO ELE ESTÁ SENDO OUTRA PESSOA.

  Assumir a sessão de alguém SUBSTITUI a sessão guardada pelo supabase-js — é
  uma só, e ele a mantém em `localStorage` (`persistSession: true`, ver
  src/lib/supabase.ts). Sem guardar a do Diretor antes, "voltar para minha
  conta" não teria para onde voltar: ele precisaria digitar a senha de novo.

  POR QUE `localStorage`, E NÃO `sessionStorage` — ISTO FOI UM DEFEITO E ESTÁ
  CONSERTADO. A primeira versão usava `sessionStorage`, com a intenção de a
  sessão assumida "morrer com a aba". Ela não morre: quem guarda a sessão
  assumida é o supabase-js, no `localStorage`, que sobrevive a fechar a aba e a
  fechar o navegador. O que morria com a aba era só a FAIXA e o botão de voltar.

  O resultado era o pior arranjo possível: numa aba nova o Diretor continuava
  logado como a outra pessoa, sem nenhum aviso na tela, e sem o botão de voltar
  — indistinguível de a pessoa estar logada. Pior ainda, a isenção da parede de
  senha provisória (AppLayout) depende desta chave: sem ela, o Diretor cairia na
  tela de definir a senha DELA.

  A REGRA QUE PASSA A VALER: esta chave tem exatamente o mesmo tempo de vida da
  sessão assumida, porque mora no mesmo lugar que ela. Enquanto existir sessão
  assumida existe faixa, em qualquer aba, inclusive depois de reabrir o
  navegador. "Sem faixa" volta a significar "não estou assumido".

  O QUE ISSO CUSTA, dito em voz alta: o refresh token do Diretor fica em
  `localStorage` enquanto durar a impersonação. Não é classe nova de exposição —
  a sessão corrente já vive ali, posta pelo próprio supabase-js —, mas é uma
  segunda identidade legível na mesma origem. O que encurta a janela é o
  `signOut` local na volta (ver hooks.ts), não o tipo de storage.

  TODO ACESSO É ENVOLVIDO EM try/catch: em aba anônima, com dados de site
  bloqueados, o próprio acessador pode lançar — e "não consegui guardar" precisa
  virar "não assume", nunca tela branca.
*/

const CHAVE = 'hausone.acessar-como'

export type SessaoGuardada = {
  access_token: string
  refresh_token: string
}

export type EstadoAcessarComo = {
  /* A sessão de volta. É o que `supabase.auth.setSession` recebe. */
  diretor: SessaoGuardada
  diretorNome: string
  alvoNome: string
  /* Rótulo já em português — a faixa não tem de onde traduzir sozinha. */
  alvoFuncao: string
  iniciadoEm: string
}

export function guardarEstado(estado: EstadoAcessarComo): boolean {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(estado))
    return true
  } catch {
    return false
  }
}

export function lerEstado(): EstadoAcessarComo | null {
  try {
    const cru = window.localStorage.getItem(CHAVE)
    if (!cru) return null

    const estado = JSON.parse(cru) as Partial<EstadoAcessarComo>
    /*
      Checagem de forma, e não confiança no que estava guardado: chave corrompida
      (ou de uma versão anterior) tem que virar "não há sessão assumida", e não
      uma faixa sem nome com um botão de voltar que não volta.
    */
    if (
      !estado?.diretor?.access_token ||
      !estado.diretor.refresh_token ||
      !estado.alvoNome
    ) {
      limparEstado()
      return null
    }

    return estado as EstadoAcessarComo
  } catch {
    return null
  }
}

export function limparEstado(): void {
  try {
    window.localStorage.removeItem(CHAVE)
  } catch {
    /* Nada a fazer: se não dá para apagar, também não dava para gravar. */
  }
}
