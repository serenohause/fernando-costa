// Escritorios de teste conhecidos e a trava que os seeds compartilham.
//
// POR QUE A TRAVA EXISTE
//   Todo seed deste diretorio escreve com a service role key, que ignora RLS.
//   Rodado por engano contra o projeto Supabase errado, um seed apagaria o
//   escritorio real e recriaria dado ficticio no lugar. A trava e a unica coisa
//   entre um `npm run seed` distraido e essa perda: antes de escrever, o seed
//   olha TODOS os tenants do banco e aborta se encontrar um que nao esteja na
//   lista abaixo. Banco de desenvolvimento so tem escritorio de teste; achar
//   outro significa que ha dado real por perto.
//
// O QUE ACONTECE NO DIA EM QUE O ESCRITORIO REAL NASCER
//   No minuto em que o tenant de producao for criado, TODOS os nove seeds
//   passam a abortar contra aquele banco. Isso e o comportamento correto, nao
//   um bug e nao um sinal de que a lista precisa crescer: seed nao roda em
//   banco com dado de cliente. Desenvolvimento continua em outro projeto
//   Supabase, com sua propria URL no .env. Adicionar o slug de producao aqui
//   para "destravar" e exatamente a perda que a trava evita.
//
// COMO ACRESCENTAR UM ESCRITORIO DE TESTE
//   Uma entrada nova em TEST_TENANTS, com slug e dominio de e-mail proprios. O
//   dominio precisa ser distinto: e-mail e global no Auth do Supabase, e dois
//   escritorios com o mesmo dominio colidem no cadastro do primeiro login
//   repetido.
//
// POR QUE E UM MODULO E NAO NOVE COPIAS
//   A mesma checagem estava copiada nos nove seeds, com tres redacoes
//   diferentes. Trava de seguranca replicada e trava que diverge: bastava um
//   seed novo copiar a versao mais frouxa para o banco ficar aberto por um lado
//   so. Agora ha um lugar so para mudar, e um lugar so para auditar.

/*
  O `name` E O QUE APARECE NO TOPO DA TELA, e por isso e o nome do escritorio e
  nada mais.

  Ele era 'Fernando Costa Arquitetura (teste)'. Isso deixou de caber no dia em
  que o cabecalho parou de ser texto fixo e passou a ler o tenant: sao 33
  caracteres numa barra lateral que comporta cerca de 14 com o `tracking` do
  original, entao a equipe leria "FERNANDO COSTA ARQUI..." todo dia, no lugar
  do "FERNANDO COSTA" que o original mostra.

  O "(teste)" nao se perdeu — ele vive no SLUG, que e onde marcar ambiente
  serve para alguma coisa: e o slug que aparece em log, em URL e nesta trava de
  seguranca. O nome e para gente ler.
*/
export const TEST_TENANTS = {
  // Goiania/GO. Povoado pelos nove seeds numerados (npm run seed ... seed:map).
  /*
    "FC Teste", e nao "Fernando Costa": desde a importacao existe um tenant REAL
    com esse nome (slug `fernando-costa`), e o nome e o que aparece no topo da
    tela. Dois escritorios com o mesmo rotulo tornam impossivel saber, olhando,
    se o que esta na tela e dado de cliente ou dado inventado — e essa e
    exatamente a duvida que ninguem pode ter.
  */
  'fernando-costa-teste': {
    name: 'FC Teste',
    emailDomain: 'fc-teste.com.br',
  },
  // Florianopolis/SC. Povoado de uma vez por npm run seed:second-office.
  'atelie-mirante-teste': {
    name: 'Ateliê Mirante',
    emailDomain: 'mirante-teste.com.br',
  },
}

export const TEST_TENANT_SLUGS = Object.keys(TEST_TENANTS)

function abort(message) {
  console.error(`\n  ABORTADO: ${message}\n`)
  process.exit(1)
}

// Aborta o processo se existir no banco qualquer tenant fora de
// TEST_TENANT_SLUGS. Chamada por todos os seeds antes da primeira escrita.
//
// Devolve os escritorios de teste que ja existem — o seed do modulo 1 usa a
// lista para achar a execucao anterior e limpar.
//
// A pergunta e feita AO BANCO ("existe tenant fora desta lista?"), e nao lendo
// todos os tenants para filtrar aqui. Filtrar no cliente depende de a lista vir
// inteira: com `max-rows` configurado no projeto, ou com muitos tenants, um
// tenant estranho fora da primeira pagina passaria sem ser visto e o seed
// seguiria escrevendo. Trava que falha em silencio e pior que trava ausente.
export async function assertOnlyTestTenants(db) {
  const knownList = `(${TEST_TENANT_SLUGS.join(',')})`

  const { data: foreign, error: foreignError } = await db
    .from('tenants')
    .select('slug, name')
    .not('slug', 'in', knownList)
    .limit(5)
  if (foreignError) abort(`nao consegui verificar os tenants: ${foreignError.message}`)

  if (foreign.length > 0) {
    abort(
      `este banco tem escritorio com DADO REAL DE CLIENTE, e seed nao roda aqui.\n\n` +
        `  Encontrado:\n` +
        foreign.map((t) => `    - ${t.slug} (${t.name})`).join('\n') +
        `\n\n  Os seeds so escrevem nos dois escritorios de teste:\n` +
        TEST_TENANT_SLUGS.map((s) => `    - ${s}`).join('\n') +
        `\n\n  ISTO NAO E UM BUG, E NAO E SINAL DE QUE A LISTA PRECISA CRESCER.\n` +
        `  O escritorio real foi criado de proposito por scripts/import-base44.mjs,\n` +
        `  com os 17 CSV de db/. No minuto em que ele nasceu, os dez seeds passaram\n` +
        `  a abortar contra este banco — que e exatamente o que esta trava existe\n` +
        `  para fazer. Todo seed escreve com a service role key, que ignora RLS: um\n` +
        `  "npm run seed" distraido aqui apagaria o escritorio real e poria dado\n` +
        `  ficticio no lugar.\n\n` +
        `  O que fazer, conforme o que voce queria:\n` +
        `    - popular dado de teste  -> use OUTRO projeto Supabase, com sua propria\n` +
        `                                URL no .env. Desenvolvimento nao acontece\n` +
        `                                mais neste banco.\n` +
        `    - reimportar/atualizar o dado real -> node scripts/import-base44.mjs\n` +
        `                                (idempotente por legacy_id; rodar de novo\n` +
        `                                nao duplica e traz o que estava pendente)\n\n` +
        `  Acrescentar o slug do escritorio real a TEST_TENANTS "para destravar" e\n` +
        `  exatamente a perda que esta trava evita. Nao faca isso.`,
    )
  }

  const { data: known, error: knownError } = await db
    .from('tenants')
    .select('id, slug, name')
    .in('slug', TEST_TENANT_SLUGS)
  if (knownError) abort(`nao consegui ler os escritorios de teste: ${knownError.message}`)

  return known
}
