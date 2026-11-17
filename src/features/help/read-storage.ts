/*
  O "LIDO" DA CENTRAL DE AJUDA, guardado no navegador.

  Decisão do usuário: sem tabela e sem migration. O preço, dito em voz alta: o
  lido some ao trocar de aparelho ou limpar os dados do site. Para um checklist
  opcional, que existe só para a pessoa se orientar, isso é aceitável.

  A CHAVE CARREGA ESCRITÓRIO E PESSOA (`hausone:help-read:<tenant>:<user>`):
  navegador compartilhado (recepção, obra) não mistura o lido de uma pessoa com
  o de outra, nem de um escritório com outro.

  TODO ACESSO EM try/catch, como em impersonation/storage.ts: aba anônima ou
  dados de site bloqueados fazem o próprio `localStorage` lançar, e isso tem que
  virar "lido só na memória desta página", nunca tela branca.
*/

const PREFIXO = 'hausone:help-read'

export function readStorageKey(tenantId: string, userId: string): string {
  return `${PREFIXO}:${tenantId}:${userId}`
}

export function loadRead(key: string | null, knownKeys: ReadonlySet<string>): Set<string> {
  if (!key) return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    /* Checagem de forma: valor corrompido ou de versão anterior vira "nada lido",
       e chave de guia que deixou de existir é descartada. */
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((k): k is string => typeof k === 'string' && knownKeys.has(k)),
    )
  } catch {
    return new Set()
  }
}

export function saveRead(key: string | null, read: ReadonlySet<string>): void {
  if (!key) return
  try {
    window.localStorage.setItem(key, JSON.stringify([...read]))
  } catch {
    /* Sem storage, o lido fica só na memória da página. */
  }
}
