// Onde ficam as credenciais das contas de teste, POR AMBIENTE.
//
// POR QUE NAO E UM CAMINHO FIXO
//   Era, e o preco apareceu no dia em que nasceu o segundo ambiente: rodar o
//   seed no projeto de desenvolvimento sobrescreveu, em silencio, as senhas das
//   contas de teste da PRODUCAO. Um arquivo so, dois bancos, e o ultimo a rodar
//   ganha.
//
//   Nao e so inconveniencia. `supabase/tests/forged-token.mjs` usa a Diretora
//   como CONTROLE POSITIVO — sem ela, o teste aborta, e os casos que provam que
//   token forjado e recusado deixam de provar qualquer coisa. Perder o arquivo da
//   producao desarma o teste de seguranca da producao.
//
// A REGRA
//   O nome carrega o ambiente ativo (`HAUSONE_ENV`, escrito por
//   `npm run env:prod|env:dev`): credenciais.prod.local, credenciais.dev.local.
//
//   Sem HAUSONE_ENV — .env escrito a mao, ou repositorio antigo — cai no nome
//   sem sufixo, que e o que existia antes. Ler continua achando o arquivo velho
//   enquanto ninguem regerar; escrever passa a nomear o ambiente.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '../..')

function ambienteAtivo() {
  try {
    const m = readFileSync(resolve(RAIZ, '.env'), 'utf8').match(/^HAUSONE_ENV\s*=\s*(\w+)/m)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Caminho para ESCREVER: sempre nomeia o ambiente quando ele e conhecido. */
export function caminhoCredenciais() {
  const env = ambienteAtivo()
  return resolve(AQUI, env ? `credenciais.${env}.local` : 'credenciais.local')
}

/**
 * Caminho para LER. Prefere o do ambiente; se nao existir, aceita o nome antigo
 * — repositorio que ainda nao regerou o arquivo continua funcionando em vez de
 * abortar por causa de um rename.
 */
export function caminhoCredenciaisExistente() {
  const doAmbiente = caminhoCredenciais()
  if (existsSync(doAmbiente)) return doAmbiente
  const antigo = resolve(AQUI, 'credenciais.local')
  return existsSync(antigo) ? antigo : doAmbiente
}
