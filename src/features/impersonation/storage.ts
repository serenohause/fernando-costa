/*
  ONDE A SESSÃO DO DIRETOR FICA ENQUANTO ELE ESTÁ SENDO OUTRA PESSOA.

  Assumir a sessão de alguém SUBSTITUI a sessão no `localStorage` — é o mesmo
  lugar onde o supabase-js guarda a única sessão que ele conhece. Sem guardar a
  do Diretor antes, "voltar para minha conta" não teria para onde voltar: ele
  precisaria digitar a senha de novo.

  POR QUE `sessionStorage`, E NÃO `localStorage`
  A sessão assumida tem que morrer com a aba. `localStorage` sobrevive ao
  fechamento do navegador, e uma sessão de outra pessoa esquecida ali, aberta na
  próxima semana, é exatamente o que esta feature não pode produzir.

  O CUSTO DISSO, dito em voz alta: fechar a aba no meio perde a volta, e o
  Diretor entra de novo com a própria senha. É o lado certo do balanço — perder
  o atalho é um aborrecimento, deixar sessão viva é um incidente.

  ISTO NÃO É EXPOSIÇÃO NOVA. A sessão do Diretor já vive no `localStorage` do
  mesmo domínio, posta lá pelo próprio supabase-js. O que muda é o prazo (uma
  aba) e o escopo (uma chave só).

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
    window.sessionStorage.setItem(CHAVE, JSON.stringify(estado))
    return true
  } catch {
    return false
  }
}

export function lerEstado(): EstadoAcessarComo | null {
  try {
    const cru = window.sessionStorage.getItem(CHAVE)
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
    window.sessionStorage.removeItem(CHAVE)
  } catch {
    /* Nada a fazer: se não dá para apagar, também não dava para gravar. */
  }
}
