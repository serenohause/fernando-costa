// Teste de isolamento ponta a ponta - Modulo 1 (Fundacao)
//
// O irmao deste arquivo, rls-isolation.sql, testa as policies por dentro:
// simula papel e claim com `set local role` e `request.jwt.claims`. Isso cobre
// a logica das policies, mas assume que o JWT chega com o claim certo.
//
// Este aqui testa a corrente inteira, pela rede, do jeito que o navegador vai
// bater:
//   login real -> Auth Hook custom_access_token_hook -> claim app_metadata
//   .tenant_id no JWT assinado -> PostgREST -> GRANT -> policy.
//
// A diferenca importa. Um erro em qualquer elo (hook desligado no painel,
// GRANT faltando, policy correta mas tabela sem RLS) some no teste SQL e
// aparece aqui.
//
// COMO RODAR
//   SUPABASE_SERVICE_ROLE_KEY=<chave secreta> node supabase/tests/rls-isolation.mjs
//
//   A chave tambem pode estar no .env (nunca com prefixo VITE_). Pegar em
//   Settings > API Keys, ou:
//     supabase projects api-keys --project-ref <ref>
//
// PRE-REQUISITO NO PAINEL
//   Authentication > Hooks > Customize Access Token (JWT) Claims precisa estar
//   ligado, apontando para public.custom_access_token_hook. Sem isso o JWT sai
//   sem tenant_id e o proprio teste avisa (caso 0.1).
//
// LIMPEZA
//   O finally apaga tenants (que cascateia colaboradores, permissoes,
//   solicitacoes e dominios) e os usuarios de teste do auth.users. Se o
//   processo morrer no meio, rodar de novo limpa: o prefixo dos e-mails e fixo.

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
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
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
      '  SUPABASE_SERVICE_ROLE_KEY=<chave> node supabase/tests/rls-isolation.mjs'
  );
  process.exit(2);
}

const EMAIL_PREFIX = 'rls-test-';
const DOMAIN = 'rls-isolation.example.com';
const PASSWORD = 'rls-test-' + Math.random().toString(36).slice(2) + 'Aa1!';

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
// Dois clientes com a chave publicavel, de proposito: `anon` NUNCA faz login,
// para as sondas de papel anonimo serem realmente anonimas. signInWithPassword
// deixa a sessao pendurada no client que a chamou, e um login no client errado
// transformaria silenciosamente todo o bloco "anon" em teste autenticado.
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

// Traduz a resposta do PostgREST para o mesmo vocabulario do teste SQL:
//   'OK:<n>'    passou, n linhas devolvidas/afetadas
//   'ERR:<code>' negado (falta de GRANT, WITH CHECK ou trigger, todos 42501)
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
  await admin.from('tenants').delete().in('slug', ['rls-test-a', 'rls-test-b']);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith(EMAIL_PREFIX) && u.email.endsWith(DOMAIN)) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

async function main() {
  await cleanup();

  // Fixtures -----------------------------------------------------------------

  const users = {
    dirA: await createUser('dir-a'),
    archA: await createUser('arch-a'),
    leaveA: await createUser('leave-a'),
    adminA: await createUser('admin-a'),
    pendingA: await createUser('pending-a'),
    dirB: await createUser('dir-b'),
    orphan: await createUser('orphan'),
  };

  const { data: tenants, error: tenantsError } = await admin
    .from('tenants')
    .insert([
      { name: 'RLS Test Escritorio A', slug: 'rls-test-a' },
      { name: 'RLS Test Escritorio B', slug: 'rls-test-b' },
    ])
    .select();
  if (tenantsError) throw new Error(`fixtures tenants: ${tenantsError.message}`);
  const tenantA = tenants.find((t) => t.slug === 'rls-test-a').id;
  const tenantB = tenants.find((t) => t.slug === 'rls-test-b').id;

  await admin.from('tenant_email_domains').insert([
    { tenant_id: tenantA, domain: 'rls-test-a.example.com' },
    { tenant_id: tenantB, domain: 'rls-test-b.example.com' },
  ]);

  // orphan de proposito fica fora de tenant_users: JWT dele sai sem tenant_id.
  await admin.from('tenant_users').insert([
    { tenant_id: tenantA, user_id: users.dirA.id, role: 'owner' },
    { tenant_id: tenantA, user_id: users.archA.id, role: 'member' },
    { tenant_id: tenantA, user_id: users.leaveA.id, role: 'member' },
    { tenant_id: tenantA, user_id: users.adminA.id, role: 'member' },
    { tenant_id: tenantA, user_id: users.pendingA.id, role: 'member' },
    { tenant_id: tenantB, user_id: users.dirB.id, role: 'owner' },
  ]);

  // pendingA tem vinculo de tenant mas nao tem colaborador: e quem fez login e
  // espera aprovacao.
  const { data: collabs, error: collabsError } = await admin
    .from('collaborators')
    .insert([
      { tenant_id: tenantA, user_id: users.dirA.id, name: 'Diretora A', role: 'director', email: 'dir-a@rls-test-a.example.com', status: 'active' },
      { tenant_id: tenantA, user_id: users.archA.id, name: 'Arquiteto A', role: 'architect', email: 'arch-a@rls-test-a.example.com', status: 'active' },
      { tenant_id: tenantA, user_id: users.leaveA.id, name: 'Afastado A', role: 'architect', email: 'leave-a@rls-test-a.example.com', status: 'on_leave' },
      { tenant_id: tenantA, user_id: users.adminA.id, name: 'Administrativo A', role: 'admin_staff', email: 'admin-a@rls-test-a.example.com', status: 'active' },
      { tenant_id: tenantB, user_id: users.dirB.id, name: 'Diretor B', role: 'director', email: 'dir-b@rls-test-b.example.com', status: 'active' },
    ])
    .select();
  if (collabsError) throw new Error(`fixtures collaborators: ${collabsError.message}`);
  const byEmail = Object.fromEntries(collabs.map((c) => [c.email, c.id]));
  const cDirA = byEmail['dir-a@rls-test-a.example.com'];
  const cArchA = byEmail['arch-a@rls-test-a.example.com'];
  const cAdminA = byEmail['admin-a@rls-test-a.example.com'];
  const cDirB = byEmail['dir-b@rls-test-b.example.com'];

  await admin.from('collaborator_permissions').insert([
    { tenant_id: tenantA, collaborator_id: cDirA, menu_key: 'crm', can_view: true, can_edit: true },
    { tenant_id: tenantA, collaborator_id: cDirA, menu_key: 'team', can_view: true, can_edit: true },
    { tenant_id: tenantA, collaborator_id: cArchA, menu_key: 'crm', can_view: true, can_edit: false },
    { tenant_id: tenantA, collaborator_id: cAdminA, menu_key: 'team', can_view: true, can_edit: false },
    { tenant_id: tenantB, collaborator_id: cDirB, menu_key: 'crm', can_view: true, can_edit: true },
  ]);

  await admin.from('access_requests').insert([
    { tenant_id: tenantA, email: 'candidato1@rls-test-a.example.com', name: 'Candidato Um' },
    { tenant_id: tenantA, email: 'candidato2@rls-test-a.example.com', name: 'Candidato Dois' },
    { tenant_id: tenantB, email: 'candidato3@rls-test-b.example.com', name: 'Candidato Tres' },
  ]);

  // Login real ---------------------------------------------------------------

  const sessions = {};
  for (const [key, user] of Object.entries(users)) {
    sessions[key] = await signIn(user.email);
  }

  const as = Object.fromEntries(
    Object.entries(sessions).map(([k, s]) => [k, clientFor(s.access_token)])
  );

  // Caso 0 - o Auth Hook realmente escreve o claim ---------------------------
  // Se isto falhar, todo o resto do teste passa por motivo errado: sem claim,
  // auth_tenant_id() e null e ninguem le nada - inclusive quem deveria.

  record('0.1', 'JWT da Diretora A traz app_metadata.tenant_id do proprio escritorio',
    tenantA, decodeJwt(sessions.dirA.access_token).app_metadata?.tenant_id ?? '(ausente)');

  record('0.2', 'JWT do Diretor B traz o tenant_id do escritorio B',
    tenantB, decodeJwt(sessions.dirB.access_token).app_metadata?.tenant_id ?? '(ausente)');

  record('0.3', 'JWT de usuario sem vinculo sai SEM tenant_id',
    '(ausente)', decodeJwt(sessions.orphan.access_token).app_metadata?.tenant_id ?? '(ausente)');

  record('0.4', 'JWT da Diretora A traz tenant_role owner',
    'owner', decodeJwt(sessions.dirA.access_token).app_metadata?.tenant_role ?? '(ausente)');

  // Caso 1 - isolamento entre tenants ---------------------------------------

  await check('1.1', 'Diretora A le tenants do escritorio B', 'OK:0',
    as.dirA.from('tenants').select('id').eq('id', tenantB));
  await check('1.2', 'Diretora A le tenant_users do escritorio B', 'OK:0',
    as.dirA.from('tenant_users').select('user_id').eq('tenant_id', tenantB));
  await check('1.3', 'Diretora A le colaboradores do escritorio B', 'OK:0',
    as.dirA.from('collaborators').select('id').eq('tenant_id', tenantB));
  await check('1.4', 'Diretora A le permissoes do escritorio B', 'OK:0',
    as.dirA.from('collaborator_permissions').select('menu_key').eq('tenant_id', tenantB));
  await check('1.5', 'Diretora A le solicitacoes de acesso do escritorio B', 'OK:0',
    as.dirA.from('access_requests').select('id').eq('tenant_id', tenantB));
  await check('1.6', 'Diretora A le tenant_email_domains', 'ERR:42501',
    as.dirA.from('tenant_email_domains').select('id'));
  await check('1.7', 'Diretor B le colaboradores do escritorio A', 'OK:0',
    as.dirB.from('collaborators').select('id').eq('tenant_id', tenantA));
  await check('1.8', 'Diretor B le a fila de aprovacao do escritorio A', 'OK:0',
    as.dirB.from('access_requests').select('id').eq('tenant_id', tenantA));
  await check('1.9', 'Diretor B ve so o proprio escritorio em tenants', 'OK:1',
    as.dirB.from('tenants').select('id'));

  await check('1.C1', 'CONTROLE: Diretora A ve os 4 colaboradores do escritorio', 'OK:4',
    as.dirA.from('collaborators').select('id'));
  await check('1.C2', 'CONTROLE: Diretora A ve as 4 permissoes do escritorio', 'OK:4',
    as.dirA.from('collaborator_permissions').select('menu_key'));
  await check('1.C3', 'CONTROLE: Diretora A ve as 2 solicitacoes do escritorio', 'OK:2',
    as.dirA.from('access_requests').select('id'));
  await check('1.C4', 'CONTROLE: Diretora A ve o catalogo de menus', 'OK:18',
    as.dirA.from('menus').select('key'));
  await check('1.C5', 'CONTROLE: Diretora A ve so a propria linha em tenant_users', 'OK:1',
    as.dirA.from('tenant_users').select('user_id'));
  await check('1.C6', 'CONTROLE: Arquiteto A ve a equipe', 'OK:4',
    as.archA.from('collaborators').select('id'));
  await check('1.C7', 'CONTROLE: Arquiteto A ve so as proprias permissoes', 'OK:1',
    as.archA.from('collaborator_permissions').select('menu_key'));

  // Caso 2 - autenticado sem vinculo nao le nada ----------------------------

  await check('2.1', 'Usuario sem tenant_users le tenants', 'OK:0', as.orphan.from('tenants').select('id'));
  await check('2.2', 'Usuario sem tenant_users le tenant_users', 'OK:0', as.orphan.from('tenant_users').select('user_id'));
  await check('2.3', 'Usuario sem tenant_users le collaborators', 'OK:0', as.orphan.from('collaborators').select('id'));
  await check('2.4', 'Usuario sem tenant_users le menus', 'OK:0', as.orphan.from('menus').select('key'));
  await check('2.5', 'Usuario sem tenant_users le collaborator_permissions', 'OK:0', as.orphan.from('collaborator_permissions').select('menu_key'));
  await check('2.6', 'Usuario sem tenant_users le access_requests', 'OK:0', as.orphan.from('access_requests').select('id'));
  await check('2.7', 'Usuario sem tenant_users le tenant_email_domains', 'ERR:42501', as.orphan.from('tenant_email_domains').select('id'));
  await check('2.8', 'Usuario aguardando aprovacao le collaborators', 'OK:0', as.pendingA.from('collaborators').select('id'));
  await check('2.9', 'Usuario aguardando aprovacao le menus', 'OK:0', as.pendingA.from('menus').select('key'));
  await check('2.10', 'Usuario aguardando aprovacao le a propria linha de tenant_users', 'OK:0', as.pendingA.from('tenant_users').select('user_id'));

  // Caso 3 - colaborador Afastado nao le nada -------------------------------

  await check('3.1', 'Afastado le tenants', 'OK:0', as.leaveA.from('tenants').select('id'));
  await check('3.2', 'Afastado le collaborators', 'OK:0', as.leaveA.from('collaborators').select('id'));
  await check('3.3', 'Afastado le menus', 'OK:0', as.leaveA.from('menus').select('key'));
  await check('3.4', 'Afastado le collaborator_permissions', 'OK:0', as.leaveA.from('collaborator_permissions').select('menu_key'));
  await check('3.5', 'Afastado le tenant_users', 'OK:0', as.leaveA.from('tenant_users').select('user_id'));
  await check('3.6', 'Afastado le access_requests', 'OK:0', as.leaveA.from('access_requests').select('id'));

  // Caso 4 - Arquiteto nao mexe em permissao --------------------------------

  await check('4.1', 'Arquiteto A concede can_edit a si mesmo', 'OK:0',
    as.archA.from('collaborator_permissions').update({ can_edit: true }).eq('collaborator_id', cArchA).select());
  await check('4.2', 'Arquiteto A insere permissao nova para si mesmo', 'ERR:42501',
    as.archA.from('collaborator_permissions').insert({ tenant_id: tenantA, collaborator_id: cArchA, menu_key: 'receivables', can_view: true, can_edit: true }));
  await check('4.3', 'Arquiteto A altera permissao da Diretora', 'OK:0',
    as.archA.from('collaborator_permissions').update({ can_view: false }).eq('collaborator_id', cDirA).select());
  await check('4.4', 'Arquiteto A apaga as proprias permissoes', 'OK:0',
    as.archA.from('collaborator_permissions').delete().eq('collaborator_id', cArchA).select());
  await check('4.5', 'CONTROLE: Diretora A altera permissao do Arquiteto', 'OK:1',
    as.dirA.from('collaborator_permissions').update({ can_edit: true }).eq('collaborator_id', cArchA).select());

  // Caso 5 - escalacao de privilegio ----------------------------------------

  await check('5.1', 'Arquiteto A troca a propria role para director', 'OK:0',
    as.archA.from('collaborators').update({ role: 'director' }).eq('id', cArchA).select());
  await check('5.2', 'Arquiteto A cadastra um director novo', 'ERR:42501',
    as.archA.from('collaborators').insert({ tenant_id: tenantA, name: 'Intruso', role: 'director', email: 'intruso@rls-test-a.example.com' }));
  await check('5.3', 'Arquiteto A apaga a Diretora', 'OK:0',
    as.archA.from('collaborators').delete().eq('id', cDirA).select());
  // Desde a 0012 so o Diretor escreve em collaborators, entao ele e o unico que
  // ainda alcanca o trigger collaborators_guard_self_service. ERR e nao OK:0:
  // aqui a policy PASSA e quem barra e o trigger. OK:0 significaria policy
  // restritiva demais; OK:1 significaria trigger sumido.
  await check('5b.1', 'Diretora A rebaixa a si mesma para intern', 'ERR:42501',
    as.dirA.from('collaborators').update({ role: 'intern' }).eq('id', cDirA).select());
  await check('5b.2', 'Diretora A cria linha ja vinculada ao proprio login', 'ERR:42501',
    as.dirA.from('collaborators').insert({ tenant_id: tenantA, user_id: users.dirA.id, name: 'Eu De Novo', role: 'director', email: 'eu-de-novo@rls-test-a.example.com' }));
  await check('5b.3', 'Diretora A desvincula o proprio user_id', 'ERR:42501',
    as.dirA.from('collaborators').update({ user_id: null }).eq('id', cDirA).select());
  await check('5b.4', 'Diretora A cola o proprio user_id na linha do Arquiteto', 'ERR:42501',
    as.dirA.from('collaborators').update({ user_id: users.dirA.id }).eq('id', cArchA).select());
  await check('5b.5', 'Diretora A apaga a propria linha de colaborador', 'OK:0',
    as.dirA.from('collaborators').delete().eq('id', cDirA).select());
  await check('5b.6', 'CONTROLE: Diretora A promove o Arquiteto a coordinator', 'OK:1',
    as.dirA.from('collaborators').update({ role: 'coordinator' }).eq('id', cArchA).select());
  await check('5b.7', 'CONTROLE: Diretora A devolve o Arquiteto para architect', 'OK:1',
    as.dirA.from('collaborators').update({ role: 'architect' }).eq('id', cArchA).select());

  // Caso 6 - service_role: bypass real, e so server-side ---------------------

  // Escopo por tenant da fixture, nao contagem da tabela inteira. service_role
  // enxerga tudo, inclusive o que outro processo estiver gravando ao mesmo
  // tempo - outro agente rodando teste, um seed, o dado real do cliente depois
  // da importacao. Ja falhou por isso, acusando "bypass quebrado" com o bypass
  // intacto. A assercao continua a mesma (service_role atravessa a fronteira
  // dos dois escritorios); so deixa de exigir que o banco esteja vazio.
  const fixtureTenants = [tenantA, tenantB];

  await check('6.1', 'service_role le os dois escritorios', 'OK:2',
    admin.from('tenants').select('id').in('id', fixtureTenants));
  await check('6.2', 'service_role le os colaboradores dos dois escritorios', 'OK:5',
    admin.from('collaborators').select('id').in('tenant_id', fixtureTenants));
  await check('6.3', 'service_role le tenant_email_domains', 'OK:2',
    admin.from('tenant_email_domains').select('id').in('tenant_id', fixtureTenants));
  await check('6.4', 'service_role grava access_requests (papel da edge function)', 'OK:1',
    admin.from('access_requests').insert({ tenant_id: tenantB, email: 'novo@rls-test-b.example.com', name: 'Novo Candidato' }).select());

  await check('6.5', 'anon (chave publicavel, sem login) le tenants', 'ERR:42501', anon.from('tenants').select('id'));
  await check('6.6', 'anon le collaborators', 'ERR:42501', anon.from('collaborators').select('id'));
  await check('6.7', 'anon le menus', 'ERR:42501', anon.from('menus').select('key'));
  await check('6.8', 'anon le collaborator_permissions', 'ERR:42501', anon.from('collaborator_permissions').select('menu_key'));
  await check('6.9', 'anon le access_requests', 'ERR:42501', anon.from('access_requests').select('id'));
  await check('6.10', 'anon le tenant_users', 'ERR:42501', anon.from('tenant_users').select('user_id'));
  await check('6.11', 'anon le tenant_email_domains', 'ERR:42501', anon.from('tenant_email_domains').select('id'));
  await check('6.12', 'anon insere solicitacao de acesso (inundar a fila de aprovacao)', 'ERR:42501',
    anon.from('access_requests').insert({ tenant_id: tenantA, email: 'spam@rls-test-a.example.com', name: 'Spam' }));
  await check('6.13', 'anon reescreve rotulo de menu', 'ERR:42501',
    anon.from('menus').update({ label_pt: 'Invadido' }).eq('key', 'crm').select());
  await check('6.14', 'anon cria escritorio', 'ERR:42501',
    anon.from('tenants').insert({ name: 'Escritorio Pirata', slug: 'rls-test-pirata' }));

  // "so server-side" nao e testavel por request; e testavel por inspecao do
  // que vai para o bundle. Estas duas checagens sao o que impede a chave
  // secreta de virar VITE_ por descuido em algum commit futuro.
  const envRaw = (() => {
    try { return readFileSync(resolve(ROOT, '.env'), 'utf8'); } catch { return ''; }
  })();
  record('6.15', 'Nenhuma variavel VITE_ carrega a chave de service_role', 'ok',
    /^\s*VITE_[A-Z0-9_]*(SERVICE|SECRET)/m.test(envRaw) ? 'chave secreta exposta com prefixo VITE_' : 'ok');

  const { execSync } = await import('node:child_process');
  const leaked = (() => {
    try {
      execSync(`grep -rl -- "${SERVICE_KEY}" "${ROOT}/src" "${ROOT}/dist" 2>/dev/null`, { encoding: 'utf8' });
      return 'chave secreta encontrada em src/ ou dist/';
    } catch {
      return 'ok';
    }
  })();
  record('6.16', 'Chave de service_role nao aparece em src/ nem no bundle de dist/', 'ok', leaked);

  // 6.17 e 6.18 - token forjado -----------------------------------------------
  //
  // POR QUE ESTES CASOS EXISTEM
  //   A auditoria do modulo 1 encontrou um buraco que esta suite passava por
  //   cima com nota cheia: as chaves JWT legadas (HS256, segredo simetrico)
  //   estavam ativas. Quem tivesse o segredo assinava um token proprio, com
  //   role service_role ou com o tenant_id de outro escritorio, e o PostgREST
  //   aceitava - toda a RLS das migrations 0006 a 0013 virava contornavel.
  //
  //   Os casos 6.5 a 6.14 provam que a RLS nega a chave publicavel. Nenhum
  //   deles provava que ela nega um token FORJADO. A suite media a fechadura
  //   e ignorava que havia uma copia da chave circulando.
  //
  //   As chaves legadas foram desligadas e o projeto assina em ES256. Estes
  //   dois casos existem para acusar se alguem religar o formato antigo - o
  //   que reabriria o buraco em silencio, sem quebrar nada visivel.
  // CUIDADO AO MEXER AQUI: um teste que assina com um segredo chutado passa
  // sempre, ligado ou desligado o formato antigo - a assinatura errada e
  // recusada antes de a pergunta ser feita. Seria um caso que da PASS sem
  // provar nada, exatamente o tipo de teste que a auditoria criticou.
  //
  // O que discrimina de verdade e usar a chave legada REAL do projeto, que e
  // ela mesma um token HS256 assinado com o segredo. Se as legacy keys forem
  // religadas, ela volta a ler o banco inteiro e estes casos FALHAM. E o
  // caminho de ataque de verdade, nao uma imitacao dele.
  const legacyKeys = await (async () => {
    const token = env.SUPABASE_ACCESS_TOKEN;
    const ref = (URL.match(/https:\/\/([a-z0-9]+)\.supabase\./) ?? [])[1];
    if (!token || !ref) return null;
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const keys = await res.json();
      return {
        service: keys.find((k) => k.id === 'service_role')?.api_key,
        anon: keys.find((k) => k.id === 'anon')?.api_key,
      };
    } catch {
      return null;
    }
  })();

  if (!legacyKeys?.service) {
    // Sem SUPABASE_ACCESS_TOKEN no ambiente nao da para buscar a chave legada.
    // Marcar como nao executado, e nao como aprovado: PASS aqui seria mentira.
    record('6.17', 'chave legada HS256 recusada (NAO EXECUTADO: falta SUPABASE_ACCESS_TOKEN)',
      'ok', 'nao executado');
    record('6.18', 'chave legada anon recusada (NAO EXECUTADO: falta SUPABASE_ACCESS_TOKEN)',
      'ok', 'nao executado');
  } else {
    for (const [id, desc, key] of [
      ['6.17', 'chave legada service_role (HS256) e recusada pelo PostgREST', legacyKeys.service],
      ['6.18', 'chave legada anon (HS256) e recusada pelo PostgREST', legacyKeys.anon],
    ]) {
      if (!key) {
        record(id, `${desc} (NAO EXECUTADO: chave ausente)`, 'ok', 'nao executado');
        continue;
      }
      const res = await fetch(`${URL}/rest/v1/collaborators?select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const body = await res.text();
      const readRows = res.ok && body.trim() !== '[]';
      record(id, desc, 'ok',
        readRows
          ? `LEGACY KEYS RELIGADAS: a chave antiga leu o banco (HTTP ${res.status}). A RLS voltou a ser contornavel.`
          : 'ok');
    }
  }

  // Caso 7 - escrita cruzada entre tenants ----------------------------------

  await check('7.1', 'Diretora A cadastra colaborador com tenant_id do escritorio B', 'ERR:42501',
    as.dirA.from('collaborators').insert({ tenant_id: tenantB, name: 'Plantado em B', role: 'director', email: 'plantado@rls-test-b.example.com' }));
  await check('7.2', 'Diretora A altera colaborador do escritorio B', 'OK:0',
    as.dirA.from('collaborators').update({ name: 'Sequestrado' }).eq('id', cDirB).select());
  await check('7.3', 'Diretora A apaga colaborador do escritorio B', 'OK:0',
    as.dirA.from('collaborators').delete().eq('id', cDirB).select());
  await check('7.4', 'Diretora A grava permissao no escritorio B', 'ERR:42501',
    as.dirA.from('collaborator_permissions').insert({ tenant_id: tenantB, collaborator_id: cDirB, menu_key: 'team', can_view: true }));
  await check('7.5', 'Diretora A renomeia o proprio escritorio', 'ERR:42501',
    as.dirA.from('tenants').update({ name: 'Renomeado' }).eq('id', tenantA).select());
  await check('7.6', 'Diretora A aprova solicitacao direto pelo cliente', 'ERR:42501',
    as.dirA.from('access_requests').update({ status: 'approved' }).eq('tenant_id', tenantA).select());
  await check('7.7', 'Diretora A cria vinculo em tenant_users', 'ERR:42501',
    as.dirA.from('tenant_users').insert({ tenant_id: tenantA, user_id: users.orphan.id }));
  await check('7.8', 'Diretora A cadastra dominio de e-mail (sequestro de tenant)', 'ERR:42501',
    as.dirA.from('tenant_email_domains').insert({ tenant_id: tenantA, domain: 'gmail.com' }));

  // Caso 8 - recorte por funcao dentro do mesmo tenant ----------------------

  await check('8.1', 'Arquiteto A le a fila de aprovacao do proprio escritorio', 'OK:0',
    as.archA.from('access_requests').select('id'));
  await check('8.2', 'Arquiteto A cadastra colaborador', 'ERR:42501',
    as.archA.from('collaborators').insert({ tenant_id: tenantA, name: 'Contratado pelo Arquiteto', role: 'intern', email: 'estagiario@rls-test-a.example.com' }));
  // Caso 9 - Administrativo NAO gerencia equipe -----------------------------
  //
  // Ate a 0011 estes casos afirmavam o contrario: a matriz do SCHEMA-PLAN dizia
  // "escreve: Diretor e Administrativo". A matriz e que estava errada. Em
  // projeto-original/src/pages/Collaborators.jsx a pagina inteira e bloqueada
  // para quem nao e Diretor, e o "Admin" aceito ao lado dele e o papel de
  // plataforma do base44, nao o Administrativo do escritorio.

  await check('9.1', 'Administrativo A cadastra colaborador', 'ERR:42501',
    as.adminA.from('collaborators').insert({ tenant_id: tenantA, name: 'Contratado pelo Administrativo', role: 'intern', email: 'novo-estagiario@rls-test-a.example.com' }));
  await check('9.2', 'Administrativo A promove a si mesmo a director', 'OK:0',
    as.adminA.from('collaborators').update({ role: 'director' }).eq('id', cAdminA).select());
  await check('9.3', 'Administrativo A promove o Arquiteto a director', 'OK:0',
    as.adminA.from('collaborators').update({ role: 'director' }).eq('id', cArchA).select());
  await check('9.4', 'Administrativo A altera o nome de um colega', 'OK:0',
    as.adminA.from('collaborators').update({ name: 'Renomeado pelo Administrativo' }).eq('id', cArchA).select());
  await check('9.5', 'Administrativo A apaga um colaborador', 'OK:0',
    as.adminA.from('collaborators').delete().eq('id', cArchA).select());
  await check('9.6', 'Administrativo A concede permissao a si mesmo', 'ERR:42501',
    as.adminA.from('collaborator_permissions').insert({ tenant_id: tenantA, collaborator_id: cAdminA, menu_key: 'receivables', can_view: true }));
  await check('9.7', 'Administrativo A eleva a propria permissao para can_edit', 'OK:0',
    as.adminA.from('collaborator_permissions').update({ can_edit: true }).eq('collaborator_id', cAdminA).select());
  await check('9.8', 'Administrativo A altera permissao de terceiro', 'OK:0',
    as.adminA.from('collaborator_permissions').update({ can_view: false }).eq('collaborator_id', cArchA).select());
  await check('9.9', 'Administrativo A apaga permissao de terceiro', 'OK:0',
    as.adminA.from('collaborator_permissions').delete().eq('collaborator_id', cArchA).select());
  await check('9.10', 'Administrativo A le permissao de terceiro', 'OK:0',
    as.adminA.from('collaborator_permissions').select('menu_key').eq('collaborator_id', cDirA));
  await check('9.11', 'Administrativo A le a fila de aprovacao', 'OK:0',
    as.adminA.from('access_requests').select('id'));

  // Caso 9.C - o que o Administrativo AINDA precisa conseguir ---------------
  // Sem estes, o aperto passaria de "nao gerencia equipe" para "nao usa o
  // sistema", e nenhum caso acima acusaria.

  await check('9.C1', 'CONTROLE: Administrativo A le a equipe do escritorio', 'OK:4',
    as.adminA.from('collaborators').select('id'));
  await check('9.C2', 'CONTROLE: Administrativo A le as PROPRIAS permissoes', 'OK:1',
    as.adminA.from('collaborator_permissions').select('menu_key'));
  await check('9.C3', 'CONTROLE: Administrativo A le o catalogo de menus', 'OK:18',
    as.adminA.from('menus').select('key'));
  await check('9.C4', 'CONTROLE: Administrativo A le o proprio escritorio', 'OK:1',
    as.adminA.from('tenants').select('id'));
  await check('9.C5', 'CONTROLE: Administrativo A le a propria linha em tenant_users', 'OK:1',
    as.adminA.from('tenant_users').select('user_id'));
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
