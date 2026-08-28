// Teste de isolamento ponta a ponta - Modulo 2 (CRM), tabela public.clients
//
// O irmao deste arquivo, crm-rls.sql, testa as policies por dentro: simula papel
// e claim com `set local role` e `request.jwt.claims`. Isso cobre a logica, mas
// assume que o JWT chega com o claim certo e que o PostgREST alcanca a tabela.
//
// Este aqui testa a corrente inteira, do jeito que o navegador vai bater:
//   login real -> Auth Hook custom_access_token_hook -> claim
//   app_metadata.tenant_id no JWT assinado -> PostgREST -> GRANT -> policy.
//
// Por que vale rodar os dois num modulo em que a novidade e a permissao de menu:
// can_edit_menu() depende de auth.uid() e de auth.jwt(), que no teste SQL vem de
// um GUC que o proprio teste escreve. Se o claim real tivesse outro formato, ou se
// o GRANT de execute na funcao estivesse faltando para o papel authenticated de
// verdade, o SQL passaria e a tela quebraria. Aqui isso aparece.
//
// A chave publicavel tambem entra de verdade: os casos do bloco 6 usam a mesma
// chave que vai no bundle do frontend, que e a forma como a 0007 descobriu que as
// tabelas da fundacao estavam abertas para a internet.
//
// COMO RODAR
//   npm run test:rls:crm:e2e
//   (ou SUPABASE_SERVICE_ROLE_KEY=<chave> node supabase/tests/crm-rls.mjs)
//
// PRE-REQUISITO NO PAINEL
//   Authentication > Hooks > Customize Access Token (JWT) Claims ligado,
//   apontando para public.custom_access_token_hook. Sem isso o JWT sai sem
//   tenant_id e o caso 0.1 acusa.
//
// RESIDUO
//   O finally apaga os dois tenants de fixture (que cascateiam colaboradores,
//   permissoes e CLIENTES) e os usuarios de teste do auth.users. Se o processo
//   morrer no meio, rodar de novo limpa antes de comecar: o prefixo e fixo.
//   Nenhum caso conta clients sem filtrar tenant - o escritorio de teste do seed
//   tem clientes permanentes, e caso que depende de tabela vazia passa hoje e
//   falha depois, longe da causa.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      /* O .env do ambiente ATIVO vence o shell — ver npm run env:prod|env:dev.
         O contrario deixava um SUPABASE_ACCESS_TOKEN exportado numa sessao
         antiga sobreviver a troca de ambiente, autenticando numa conta enquanto
         o resto apontava para o projeto da outra. */
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env opcional quando as variaveis vem do ambiente */
  }
  return env;
}

const env = loadEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes.');
  process.exit(2);
}
if (!SERVICE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY ausente. Sem ela nao da para montar as fixtures\n' +
      '(criar usuario de teste exige a admin API). Rodar assim:\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=<chave> node supabase/tests/crm-rls.mjs'
  );
  process.exit(2);
}

const EMAIL_PREFIX = 'crm-rls-test-';
const DOMAIN = 'crm-rls.example.com';
const PASSWORD = 'crm-rls-test-' + Math.random().toString(36).slice(2) + 'Aa1!';
const SLUG_A = 'crm-rls-e2e-a';
const SLUG_B = 'crm-rls-e2e-b';

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
// Dois clientes com a chave publicavel de proposito: `anon` NUNCA faz login, para
// as sondas anonimas serem realmente anonimas. signInWithPassword deixa a sessao
// pendurada no client que a chamou, e um login no client errado transformaria em
// silencio todo o bloco anonimo em teste autenticado.
const anon = createClient(URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const loginClient = createClient(URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];

function record(caso, descricao, expected, observed) {
  results.push({ caso, descricao, expected, observed, pass: expected === observed });
}

// Mesmo vocabulario do teste SQL:
//   'OK:<n>'     passou, n linhas devolvidas/afetadas
//   'ERR:<code>' negado (falta de GRANT ou violacao de WITH CHECK, ambos 42501)
async function outcome(query) {
  const { data, error } = await query;
  if (error) return `ERR:${error.code ?? error.status ?? 'unknown'}`;
  return `OK:${Array.isArray(data) ? data.length : data == null ? 0 : 1}`;
}

async function check(caso, descricao, expected, query) {
  record(caso, descricao, expected, await outcome(query));
}

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function clientFor(accessToken) {
  return createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function signIn(email) {
  const { data, error } = await loginClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login falhou para ${email}: ${error.message}`);
  return data.session;
}

async function createUser(slug) {
  const email = `${EMAIL_PREFIX}${slug}@${DOMAIN}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return { id: data.user.id, email };
}

async function cleanup() {
  await admin.from('tenants').delete().in('slug', [SLUG_A, SLUG_B]);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith(EMAIL_PREFIX) && u.email.endsWith(DOMAIN)) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

function clientRow(tenantId, name, extra = {}) {
  return {
    tenant_id: tenantId,
    name,
    phone: '(62) 90000-0000',
    address_city: 'Goiania',
    address_state: 'GO',
    ...extra,
  };
}

async function main() {
  await cleanup();

  // Fixtures -----------------------------------------------------------------
  //
  // As funcoes de negocio abaixo separam permissao de funcao de proposito:
  //   editA  e architect   e ESCREVE (can_edit em crm)
  //   viewA  e coordinator e NAO escreve (so can_view em crm)
  //   otherA e admin_staff e NAO escreve (can_edit em contracts)
  // Se a policy olhasse funcao em vez de permissao, o Arquiteto falharia e o
  // Administrativo passaria - o conjunto acusa a troca.

  const users = {
    dirA: await createUser('dir-a'),
    editA: await createUser('edit-a'),
    viewA: await createUser('view-a'),
    otherA: await createUser('other-a'),
    leaveA: await createUser('leave-a'),
    editB: await createUser('edit-b'),
    orphan: await createUser('orphan'),
  };

  const { data: tenants, error: tenantsError } = await admin
    .from('tenants')
    .insert([
      { name: 'CRM RLS E2E Escritorio A', slug: SLUG_A },
      { name: 'CRM RLS E2E Escritorio B', slug: SLUG_B },
    ])
    .select();
  if (tenantsError) throw new Error(`fixtures tenants: ${tenantsError.message}`);
  const tenantA = tenants.find((t) => t.slug === SLUG_A).id;
  const tenantB = tenants.find((t) => t.slug === SLUG_B).id;

  await admin.from('tenant_email_domains').insert([
    { tenant_id: tenantA, domain: `a.${DOMAIN}` },
    { tenant_id: tenantB, domain: `b.${DOMAIN}` },
  ]);

  // orphan fica fora de tenant_users de proposito: o JWT dele sai sem tenant_id.
  await admin.from('tenant_users').insert([
    { tenant_id: tenantA, user_id: users.dirA.id, role: 'owner' },
    { tenant_id: tenantA, user_id: users.editA.id, role: 'member' },
    { tenant_id: tenantA, user_id: users.viewA.id, role: 'member' },
    { tenant_id: tenantA, user_id: users.otherA.id, role: 'member' },
    { tenant_id: tenantA, user_id: users.leaveA.id, role: 'member' },
    { tenant_id: tenantB, user_id: users.editB.id, role: 'owner' },
  ]);

  const { data: collabs, error: collabsError } = await admin
    .from('collaborators')
    .insert([
      { tenant_id: tenantA, user_id: users.dirA.id, name: 'Diretora A', role: 'director', email: `dir-a@a.${DOMAIN}`, status: 'active' },
      { tenant_id: tenantA, user_id: users.editA.id, name: 'Arquiteta CRM A', role: 'architect', email: `edit-a@a.${DOMAIN}`, status: 'active' },
      { tenant_id: tenantA, user_id: users.viewA.id, name: 'Coordenador A', role: 'coordinator', email: `view-a@a.${DOMAIN}`, status: 'active' },
      { tenant_id: tenantA, user_id: users.otherA.id, name: 'Administrativo A', role: 'admin_staff', email: `other-a@a.${DOMAIN}`, status: 'active' },
      // Afastado COM can_edit em crm: e o que faz o caso 3 discriminar status de
      // permissao. Sem a permissao gravada, as duas negativas dariam o mesmo
      // resultado e o teste nao saberia qual regra funcionou.
      { tenant_id: tenantA, user_id: users.leaveA.id, name: 'Afastado A', role: 'architect', email: `leave-a@a.${DOMAIN}`, status: 'on_leave' },
      { tenant_id: tenantB, user_id: users.editB.id, name: 'Diretor B', role: 'director', email: `edit-b@b.${DOMAIN}`, status: 'active' },
    ])
    .select();
  if (collabsError) throw new Error(`fixtures collaborators: ${collabsError.message}`);
  const byEmail = Object.fromEntries(collabs.map((c) => [c.email, c.id]));

  await admin.from('collaborator_permissions').insert([
    { tenant_id: tenantA, collaborator_id: byEmail[`dir-a@a.${DOMAIN}`], menu_key: 'crm', can_view: true, can_edit: true },
    { tenant_id: tenantA, collaborator_id: byEmail[`edit-a@a.${DOMAIN}`], menu_key: 'crm', can_view: true, can_edit: true },
    { tenant_id: tenantA, collaborator_id: byEmail[`view-a@a.${DOMAIN}`], menu_key: 'crm', can_view: true, can_edit: false },
    { tenant_id: tenantA, collaborator_id: byEmail[`other-a@a.${DOMAIN}`], menu_key: 'contracts', can_view: true, can_edit: true },
    { tenant_id: tenantA, collaborator_id: byEmail[`other-a@a.${DOMAIN}`], menu_key: 'crm', can_view: true, can_edit: false },
    { tenant_id: tenantA, collaborator_id: byEmail[`leave-a@a.${DOMAIN}`], menu_key: 'crm', can_view: true, can_edit: true },
    { tenant_id: tenantB, collaborator_id: byEmail[`edit-b@b.${DOMAIN}`], menu_key: 'crm', can_view: true, can_edit: true },
  ]);

  const { data: fixtureClients, error: clientsError } = await admin
    .from('clients')
    .insert([
      clientRow(tenantA, 'Cliente A Um', { email: `a1@${DOMAIN}` }),
      clientRow(tenantA, 'Cliente A Dois', { email: `a2@${DOMAIN}` }),
      clientRow(tenantB, 'Cliente B Um', { email: `b1@${DOMAIN}` }),
    ])
    .select();
  if (clientsError) throw new Error(`fixtures clients: ${clientsError.message}`);
  const cliA1 = fixtureClients.find((c) => c.name === 'Cliente A Um').id;
  const cliA2 = fixtureClients.find((c) => c.name === 'Cliente A Dois').id;
  const cliB1 = fixtureClients.find((c) => c.name === 'Cliente B Um').id;

  // Login real ---------------------------------------------------------------

  const sessions = {};
  for (const [key, user] of Object.entries(users)) {
    sessions[key] = await signIn(user.email);
  }
  const as = Object.fromEntries(
    Object.entries(sessions).map(([k, s]) => [k, clientFor(s.access_token)])
  );

  // Caso 0 - o claim chega mesmo -------------------------------------------
  // Se isto falhar, todo o resto passa por motivo errado: sem claim,
  // auth_tenant_id() e null e ninguem le nada, inclusive quem deveria.

  record('0.1', 'JWT da Arquiteta CRM A traz app_metadata.tenant_id do escritorio A',
    tenantA, decodeJwt(sessions.editA.access_token).app_metadata?.tenant_id ?? '(ausente)');
  record('0.2', 'JWT do Diretor B traz o tenant_id do escritorio B',
    tenantB, decodeJwt(sessions.editB.access_token).app_metadata?.tenant_id ?? '(ausente)');
  record('0.3', 'JWT de usuario sem vinculo sai SEM tenant_id',
    '(ausente)', decodeJwt(sessions.orphan.access_token).app_metadata?.tenant_id ?? '(ausente)');

  // Caso 1 - isolamento de leitura entre escritorios ------------------------

  await check('1.1', 'Diretora A le clientes do escritorio B', 'OK:0',
    as.dirA.from('clients').select('id').eq('tenant_id', tenantB));
  await check('1.2', 'Diretora A le o cliente de B pelo id', 'OK:0',
    as.dirA.from('clients').select('id').eq('id', cliB1));
  await check('1.3', 'Diretor B le clientes do escritorio A', 'OK:0',
    as.editB.from('clients').select('id').eq('tenant_id', tenantA));
  await check('1.4', 'Diretor B ve so o proprio cliente (a policy filtra, nao o SQL)', 'OK:1',
    as.editB.from('clients').select('id'));

  await check('1.C1', 'CONTROLE: Diretora A ve os 2 clientes do escritorio', 'OK:2',
    as.dirA.from('clients').select('id'));
  await check('1.C2', 'CONTROLE: Arquiteta CRM A ve os 2 clientes do escritorio', 'OK:2',
    as.editA.from('clients').select('id'));
  await check('1.C3', 'CONTROLE: Coordenador A (sem can_edit) ve os 2 clientes', 'OK:2',
    as.viewA.from('clients').select('id'));
  await check('1.C4', 'CONTROLE: Administrativo A (can_edit em outro menu) ve os 2 clientes', 'OK:2',
    as.otherA.from('clients').select('id'));

  // Caso 2 - autenticado sem vinculo ---------------------------------------

  await check('2.1', 'Usuario sem tenant_users le clientes', 'OK:0',
    as.orphan.from('clients').select('id'));
  await check('2.2', 'Usuario sem tenant_users cadastra cliente em A', 'ERR:42501',
    as.orphan.from('clients').insert(clientRow(tenantA, 'Cliente do Estranho')));
  await check('2.3', 'Usuario sem tenant_users altera cliente de A', 'OK:0',
    as.orphan.from('clients').update({ name: 'Sequestrado' }).eq('id', cliA1).select());

  // Caso 3 - colaborador Afastado, COM can_edit em crm ---------------------

  await check('3.1', 'Afastado le clientes', 'OK:0', as.leaveA.from('clients').select('id'));
  await check('3.2', 'Afastado cadastra cliente', 'ERR:42501',
    as.leaveA.from('clients').insert(clientRow(tenantA, 'Cliente do Afastado')));
  await check('3.3', 'Afastado altera cliente', 'OK:0',
    as.leaveA.from('clients').update({ name: 'Renomeado pelo Afastado' }).eq('id', cliA1).select());
  await check('3.4', 'Afastado apaga cliente', 'OK:0',
    as.leaveA.from('clients').delete().eq('id', cliA1).select());

  // Caso 4 - can_view sem can_edit, e can_edit em outro menu ---------------

  await check('4.1', 'Coordenador A (so can_view em crm) cadastra cliente', 'ERR:42501',
    as.viewA.from('clients').insert(clientRow(tenantA, 'Cliente do Coordenador')));
  await check('4.2', 'Coordenador A altera cliente', 'OK:0',
    as.viewA.from('clients').update({ name: 'Renomeado pelo Coordenador' }).eq('id', cliA1).select());
  await check('4.3', 'Coordenador A apaga cliente', 'OK:0',
    as.viewA.from('clients').delete().eq('id', cliA1).select());

  await check('4.4', 'Administrativo A (can_edit em contracts) cadastra cliente', 'ERR:42501',
    as.otherA.from('clients').insert(clientRow(tenantA, 'Cliente do Administrativo')));
  await check('4.5', 'Administrativo A altera cliente', 'OK:0',
    as.otherA.from('clients').update({ name: 'Renomeado pelo Administrativo' }).eq('id', cliA1).select());
  await check('4.6', 'Administrativo A apaga cliente', 'OK:0',
    as.otherA.from('clients').delete().eq('id', cliA1).select());

  // Caso 5 - CONTROLE: quem tem can_edit em crm escreve --------------------
  // Sem estes, o arquivo passaria inteiro com uma escrita que nega tudo, e o CRM
  // iria para producao como tela somente-leitura.

  await check('5.1', 'CONTROLE: Arquiteta CRM A cadastra cliente', 'OK:1',
    as.editA.from('clients').insert(clientRow(tenantA, 'Cliente Novo Legitimo', { email: `novo@${DOMAIN}` })).select());
  await check('5.2', 'CONTROLE: Arquiteta CRM A altera cliente', 'OK:1',
    as.editA.from('clients').update({ name: 'Cliente A Um (editado)' }).eq('id', cliA1).select());
  await check('5.3', 'CONTROLE: Arquiteta CRM A altera o documento (deduplicacao recalculada pelo banco)', 'OK:1',
    as.editA.from('clients').update({ tax_id: '111.222.333-44' }).eq('id', cliA1).select());
  await check('5.4', 'CONTROLE: Diretora A cadastra cliente', 'OK:1',
    as.dirA.from('clients').insert(clientRow(tenantA, 'Cliente da Diretora')).select());
  await check('5.5', 'CONTROLE: Arquiteta CRM A apaga cliente', 'OK:1',
    as.editA.from('clients').delete().eq('id', cliA2).select());

  // Caso 5b - escrita cruzada -----------------------------------------------

  await check('5b.1', 'Arquiteta CRM A cadastra cliente com tenant_id do escritorio B', 'ERR:42501',
    as.editA.from('clients').insert(clientRow(tenantB, 'Plantado em B')));
  await check('5b.2', 'Arquiteta CRM A altera cliente do escritorio B', 'OK:0',
    as.editA.from('clients').update({ name: 'Sequestrado' }).eq('id', cliB1).select());
  await check('5b.3', 'Arquiteta CRM A apaga cliente do escritorio B', 'OK:0',
    as.editA.from('clients').delete().eq('id', cliB1).select());
  await check('5b.4', 'Arquiteta CRM A move cliente do proprio escritorio para o B', 'ERR:42501',
    as.editA.from('clients').update({ tenant_id: tenantB }).eq('id', cliA1).select());
  await check('5b.5', 'Diretor B cadastra cliente no escritorio A', 'ERR:42501',
    as.editB.from('clients').insert(clientRow(tenantA, 'Plantado em A')));

  // Caso 6 - a chave publicavel nao alcanca a tabela -----------------------
  // Este bloco e o motivo principal de o arquivo existir: e a mesma chave que vai
  // no bundle do frontend. Foi assim que a 0007 descobriu que as tabelas da
  // fundacao respondiam para a internet.

  await check('6.1', 'anon (chave publicavel) le clients', 'ERR:42501',
    anon.from('clients').select('id'));
  await check('6.2', 'anon le clients filtrando por tenant', 'ERR:42501',
    anon.from('clients').select('id').eq('tenant_id', tenantA));
  await check('6.3', 'anon cadastra cliente', 'ERR:42501',
    anon.from('clients').insert(clientRow(tenantA, 'Cliente Pirata')));
  await check('6.4', 'anon altera cliente', 'ERR:42501',
    anon.from('clients').update({ name: 'Invadido' }).eq('id', cliA1).select());
  await check('6.5', 'anon apaga cliente', 'ERR:42501',
    anon.from('clients').delete().eq('id', cliA1).select());
  await check('6.6', 'anon chama can_edit_menu por RPC', 'ERR:42501',
    anon.rpc('can_edit_menu', { p_menu_key: 'crm' }));

  // Caso 7 - service_role mantem bypass, e a chave dele fica no servidor ----
  //
  // Escopado nos tenants da fixture: service_role enxerga o banco todo, inclusive
  // o escritorio de teste do seed e o que outro processo estiver gravando.
  //
  // E afirmado como PROPRIEDADE, nao como contagem. Diferente do teste SQL, aqui a
  // escrita PERSISTE: os controles do bloco 5 acabaram de inserir e apagar cliente,
  // entao um numero fixo aqui depende da ordem e da quantidade dos casos anteriores
  // - a primeira versao deste caso esperava OK:3 e observou OK:4 por isso. O que o
  // bypass significa e "atravessa a fronteira dos dois escritorios", e e isso que
  // fica afirmado.
  const { data: svcRows, error: svcError } = await admin
    .from('clients')
    .select('tenant_id')
    .in('tenant_id', [tenantA, tenantB]);
  record('7.1', 'service_role le cliente dos DOIS escritorios da fixture (atravessa a fronteira)',
    '2 tenants', svcError ? `ERR:${svcError.code}` : `${new Set(svcRows.map((r) => r.tenant_id)).size} tenants`);
  await check('7.2', 'service_role cadastra cliente (papel de edge function / importacao)', 'OK:1',
    admin.from('clients').insert(clientRow(tenantA, 'Cliente do service_role')).select());
  await check('7.3', 'service_role altera cliente de escritorio onde nao tem colaborador', 'OK:1',
    admin.from('clients').update({ name: 'Cliente B Um (pelo service_role)' }).eq('id', cliB1).select());

  // A chave de bypass nunca pode chegar ao navegador. Vite so expoe ao bundle o
  // que comeca com VITE_: uma variavel VITE_SUPABASE_SERVICE_ROLE_KEY publicaria a
  // chave-mestra do projeto. Mesmo caso 6.15 do teste do modulo 1, repetido aqui
  // porque este arquivo pode ser rodado sozinho.
  record('7.4', 'a chave de service_role NAO esta exposta com prefixo VITE_',
    'ausente', env.VITE_SUPABASE_SERVICE_ROLE_KEY ? 'PRESENTE' : 'ausente');

  // Caso 8 - can_edit_menu pela rede ---------------------------------------
  // O helper e o que os modulos 3 a 9 vao reusar. Aqui ele e chamado por RPC com
  // JWT de verdade: se faltasse o grant de execute para authenticated, ou se o
  // claim real tivesse outro formato, apareceria aqui e nao no teste SQL.

  await check('8.1', 'CONTROLE: RPC can_edit_menu responde para authenticated', 'OK:1',
    as.editA.rpc('can_edit_menu', { p_menu_key: 'crm' }));

  const rpc = async (client, menu) => {
    const { data, error } = await client.rpc('can_edit_menu', { p_menu_key: menu });
    return error ? `ERR:${error.code ?? 'unknown'}` : String(data);
  };

  record('8.2', 'can_edit_menu(crm) para quem tem can_edit em crm', 'true', await rpc(as.editA, 'crm'));
  record('8.3', 'can_edit_menu(crm) para quem tem so can_view em crm', 'false', await rpc(as.viewA, 'crm'));
  record('8.4', 'can_edit_menu(contracts) para quem tem can_edit em contracts', 'true', await rpc(as.otherA, 'contracts'));
  record('8.5', 'can_edit_menu(crm) para o MESMO usuario do 8.4', 'false', await rpc(as.otherA, 'crm'));
  record('8.6', 'can_edit_menu(crm) para colaborador Afastado COM can_edit gravado', 'false', await rpc(as.leaveA, 'crm'));
  record('8.7', 'can_edit_menu(crm) para usuario sem vinculo de tenant', 'false', await rpc(as.orphan, 'crm'));
  record('8.8', 'can_edit_menu com menu inexistente falha alto (22023), nao nega em silencio', 'ERR:22023', await rpc(as.editA, 'crmm'));
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error('Erro durante o teste:', err.message);
  exitCode = 2;
} finally {
  await cleanup();
}

const width = Math.max(...results.map((r) => r.caso.length), 4);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.caso.padEnd(width)}  ${r.descricao}`);
  if (!r.pass) console.log(`        esperado=${r.expected} observado=${r.observed}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} casos passaram.`);
process.exit(exitCode || (failed ? 1 : 0));
