-- Teste de isolamento da RLS - Modulo 1 (Fundacao)
--
-- Cobre os seis casos obrigatorios de docs/SCHEMA-PLAN.md mais os casos de
-- escrita cruzada e de escalacao de privilegio.
--
-- COMO RODAR
--   Supabase Studio > SQL Editor: cole o arquivo inteiro e execute. O ultimo
--   SELECT devolve uma linha por caso, com PASS/FAIL. O ROLLBACK no fim apaga
--   todas as fixtures - nada sobra no banco, nem em auth.users.
--
--   Ou pela Management API (o que este arquivo foi rodado de verdade):
--     supabase/tests/run-sql-isolation.sh
--
-- COMO LER O RESULTADO
--   observed = 'OK:<n>'    a operacao passou e afetou/devolveu n linhas.
--                          'OK:0' em UPDATE/DELETE e negacao: a clausula USING
--                          nao casou com linha nenhuma, e o Postgres nao
--                          levanta erro nesse caso - ele so nao faz nada.
--   observed = 'ERR:42501' privilegio negado. Cobre tres coisas diferentes que
--                          o cliente enxerga igual: falta de GRANT, violacao de
--                          WITH CHECK e o trigger anti-escalacao.
--
-- POR QUE ELE SIMULA O PAPEL EM VEZ DE FAZER LOGIN
--   set local role + request.jwt.claims reproduzem exatamente o que o PostgREST
--   monta a cada request. O que ISSO NAO cobre e se o Auth Hook realmente
--   escreve o claim tenant_id no JWT emitido pelo login - para essa parte
--   existe o rls-isolation.mjs, que faz login de verdade pela rede.

begin;

-- Fixtures ------------------------------------------------------------------
-- Criadas como postgres, que e dono das tabelas e por isso nao sofre RLS
-- (nenhuma tabela usa FORCE ROW LEVEL SECURITY, e nao pode passar a usar sem
-- quebrar os helpers SECURITY DEFINER).

create temp table rls_ids on commit drop as
select
  '11111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  '22222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'a0000000-0000-4000-8000-000000000001'::uuid as u_dir_a,
  'a0000000-0000-4000-8000-000000000002'::uuid as u_arch_a,
  'a0000000-0000-4000-8000-000000000003'::uuid as u_leave_a,
  'a0000000-0000-4000-8000-000000000004'::uuid as u_admin_a,
  'a0000000-0000-4000-8000-000000000005'::uuid as u_vac_a,
  'a0000000-0000-4000-8000-000000000006'::uuid as u_pending_a,
  'b0000000-0000-4000-8000-000000000001'::uuid as u_dir_b,
  'c0000000-0000-4000-8000-000000000001'::uuid as u_orphan,
  'a1000000-0000-4000-8000-000000000001'::uuid as c_dir_a,
  'a1000000-0000-4000-8000-000000000002'::uuid as c_arch_a,
  'a1000000-0000-4000-8000-000000000003'::uuid as c_leave_a,
  'a1000000-0000-4000-8000-000000000004'::uuid as c_admin_a,
  'a1000000-0000-4000-8000-000000000005'::uuid as c_vac_a,
  'b1000000-0000-4000-8000-000000000001'::uuid as c_dir_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_dir_a from rls_ids) u, 'rls-test-dir-a@example.test' e
  union all select (select u_arch_a from rls_ids), 'rls-test-arch-a@example.test'
  union all select (select u_leave_a from rls_ids), 'rls-test-leave-a@example.test'
  union all select (select u_admin_a from rls_ids), 'rls-test-admin-a@example.test'
  union all select (select u_vac_a from rls_ids), 'rls-test-vac-a@example.test'
  union all select (select u_pending_a from rls_ids), 'rls-test-pending-a@example.test'
  union all select (select u_dir_b from rls_ids), 'rls-test-dir-b@example.test'
  union all select (select u_orphan from rls_ids), 'rls-test-orphan@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from rls_ids), 'RLS Test Escritorio A', 'rls-test-a'),
  ((select tenant_b from rls_ids), 'RLS Test Escritorio B', 'rls-test-b');

insert into public.tenant_email_domains (tenant_id, domain) values
  ((select tenant_a from rls_ids), 'rls-test-a.example.test'),
  ((select tenant_b from rls_ids), 'rls-test-b.example.test');

-- u_orphan de proposito NAO entra em tenant_users: e o caso 2.
-- u_pending_a entra em tenant_users mas nao vira colaborador: e o usuario que
-- fez login e ainda espera aprovacao.
insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from rls_ids), (select u_dir_a from rls_ids), 'owner'),
  ((select tenant_a from rls_ids), (select u_arch_a from rls_ids), 'member'),
  ((select tenant_a from rls_ids), (select u_leave_a from rls_ids), 'member'),
  ((select tenant_a from rls_ids), (select u_admin_a from rls_ids), 'member'),
  ((select tenant_a from rls_ids), (select u_vac_a from rls_ids), 'member'),
  ((select tenant_a from rls_ids), (select u_pending_a from rls_ids), 'member'),
  ((select tenant_b from rls_ids), (select u_dir_b from rls_ids), 'owner');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_dir_a from rls_ids),   (select tenant_a from rls_ids), (select u_dir_a from rls_ids),   'Diretora A',       'director',   'dir-a@rls-test-a.example.test',   'active'),
  ((select c_arch_a from rls_ids),  (select tenant_a from rls_ids), (select u_arch_a from rls_ids),  'Arquiteto A',      'architect',  'arch-a@rls-test-a.example.test',  'active'),
  ((select c_leave_a from rls_ids), (select tenant_a from rls_ids), (select u_leave_a from rls_ids), 'Afastado A',       'architect',  'leave-a@rls-test-a.example.test', 'on_leave'),
  ((select c_admin_a from rls_ids), (select tenant_a from rls_ids), (select u_admin_a from rls_ids), 'Administrativo A', 'admin_staff','admin-a@rls-test-a.example.test', 'active'),
  ((select c_vac_a from rls_ids),   (select tenant_a from rls_ids), (select u_vac_a from rls_ids),   'Ferias A',         'architect',  'vac-a@rls-test-a.example.test',   'vacation'),
  ((select c_dir_b from rls_ids),   (select tenant_b from rls_ids), (select u_dir_b from rls_ids),   'Diretor B',        'director',   'dir-b@rls-test-b.example.test',   'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from rls_ids), (select c_dir_a from rls_ids),  'crm',  true, true),
  ((select tenant_a from rls_ids), (select c_dir_a from rls_ids),  'team', true, true),
  ((select tenant_a from rls_ids), (select c_arch_a from rls_ids), 'crm',  true, false),
  -- O Administrativo tem permissao propria de proposito: sem ela, "Administrativo
  -- le so as proprias permissoes" e "Administrativo nao le permissao nenhuma"
  -- dariam o mesmo OK:0, e o teste nao saberia distinguir aperto correto de
  -- aperto demais.
  ((select tenant_a from rls_ids), (select c_admin_a from rls_ids), 'team', true, false),
  ((select tenant_b from rls_ids), (select c_dir_b from rls_ids),  'crm',  true, true);

insert into public.access_requests (tenant_id, email, name) values
  ((select tenant_a from rls_ids), 'candidato1@rls-test-a.example.test', 'Candidato Um'),
  ((select tenant_a from rls_ids), 'candidato2@rls-test-a.example.test', 'Candidato Dois'),
  ((select tenant_b from rls_ids), 'candidato3@rls-test-b.example.test', 'Candidato Tres');

-- Sonda ---------------------------------------------------------------------
-- Executa p_sql com o papel e o claim de um usuario concreto e devolve o
-- resultado como texto. Toda execucao termina em excecao de proposito
-- (errcode RL001), para que a subtransacao do bloco seja desfeita e uma
-- escrita que porventura PASSE nao contamine os casos seguintes.

create or replace function pg_temp.probe(p_role name, p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_rows bigint;
  v_out text;
  v_msg text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    raise exception using errcode = 'RL001', message = v_rows::text;
  exception
    when sqlstate 'RL001' then
      get stacked diagnostics v_msg = message_text;
      v_out := 'OK:' || v_msg;
    when others then
      get stacked diagnostics v_msg = returned_sqlstate;
      v_out := 'ERR:' || v_msg;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end;
$$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb
language sql
as $$
  select case
    when p_tenant is null then jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)
    else jsonb_build_object('sub', p_sub, 'role', 'authenticated',
           'app_metadata', jsonb_build_object('tenant_id', p_tenant, 'tenant_role', 'member'))
  end;
$$;

create temp table rls_results (
  seq serial primary key,
  caso text,
  descricao text,
  expected text,
  observed text
) on commit drop;

create or replace function pg_temp.check(p_caso text, p_desc text, p_expected text, p_role name, p_claims jsonb, p_sql text)
returns void
language plpgsql
as $$
begin
  insert into rls_results (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, pg_temp.probe(p_role, p_claims, p_sql));
end;
$$;

-- Caso 1 - Tenant A nao le nenhuma linha de tenant B, e vice-versa -----------

select pg_temp.check('1.1', 'Diretora A conta linhas de tenants do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('select 1 from public.tenants where id = %L', (select tenant_b from rls_ids)));

select pg_temp.check('1.2', 'Diretora A conta linhas de tenant_users do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('select 1 from public.tenant_users where tenant_id = %L', (select tenant_b from rls_ids)));

select pg_temp.check('1.3', 'Diretora A conta colaboradores do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('select 1 from public.collaborators where tenant_id = %L', (select tenant_b from rls_ids)));

select pg_temp.check('1.4', 'Diretora A conta permissoes do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('select 1 from public.collaborator_permissions where tenant_id = %L', (select tenant_b from rls_ids)));

select pg_temp.check('1.5', 'Diretora A conta solicitacoes de acesso do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('select 1 from public.access_requests where tenant_id = %L', (select tenant_b from rls_ids)));

select pg_temp.check('1.6', 'Diretora A le tenant_email_domains (tabela sem grant para authenticated)', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.tenant_email_domains');

select pg_temp.check('1.7', 'Diretor B conta colaboradores do escritorio A', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_b from rls_ids), (select tenant_b from rls_ids)),
  format('select 1 from public.collaborators where tenant_id = %L', (select tenant_a from rls_ids)));

select pg_temp.check('1.8', 'Diretor B conta solicitacoes de acesso do escritorio A', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_b from rls_ids), (select tenant_b from rls_ids)),
  format('select 1 from public.access_requests where tenant_id = %L', (select tenant_a from rls_ids)));

select pg_temp.check('1.9', 'Diretor B ve apenas o proprio escritorio em tenants', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_b from rls_ids), (select tenant_b from rls_ids)),
  'select 1 from public.tenants');

select pg_temp.check('1.10', 'Diretor B ve apenas o proprio colaborador em collaborators', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_b from rls_ids), (select tenant_b from rls_ids)),
  'select 1 from public.collaborators');

-- Caso 1 (controle) - o que o Diretor do proprio tenant PRECISA enxergar -----
-- Sem isto o teste passaria com uma policy que nega tudo para todo mundo.

select pg_temp.check('1.C1', 'CONTROLE: Diretora A ve os 5 colaboradores do proprio escritorio', 'OK:5',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborators');

select pg_temp.check('1.C2', 'CONTROLE: Diretora A ve as 4 permissoes do proprio escritorio', 'OK:4',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborator_permissions');

select pg_temp.check('1.C3', 'CONTROLE: Diretora A ve as 2 solicitacoes do proprio escritorio', 'OK:2',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.access_requests');

select pg_temp.check('1.C4', 'CONTROLE: Diretora A ve o catalogo de menus', 'OK:18',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.menus');

select pg_temp.check('1.C5', 'CONTROLE: Diretora A ve apenas a propria linha em tenant_users', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.tenant_users');

select pg_temp.check('1.C6', 'CONTROLE: Arquiteto A ve a equipe do proprio escritorio', 'OK:5',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborators');

select pg_temp.check('1.C7', 'CONTROLE: Arquiteto A ve apenas as proprias permissoes', 'OK:1',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborator_permissions');

-- Caso 2 - usuario autenticado sem linha em tenant_users nao le nada --------
-- Sem vinculo, o hook nao escreve o claim: o JWT chega sem tenant_id.

select pg_temp.check('2.1', 'Usuario sem tenant_users le tenants', 'OK:0',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.tenants');

select pg_temp.check('2.2', 'Usuario sem tenant_users le tenant_users', 'OK:0',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.tenant_users');

select pg_temp.check('2.3', 'Usuario sem tenant_users le collaborators', 'OK:0',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.collaborators');

select pg_temp.check('2.4', 'Usuario sem tenant_users le menus', 'OK:0',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.menus');

select pg_temp.check('2.5', 'Usuario sem tenant_users le collaborator_permissions', 'OK:0',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.collaborator_permissions');

select pg_temp.check('2.6', 'Usuario sem tenant_users le access_requests', 'OK:0',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.access_requests');

select pg_temp.check('2.7', 'Usuario sem tenant_users le tenant_email_domains', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_orphan from rls_ids), null), 'select 1 from public.tenant_email_domains');

select pg_temp.check('2.8', 'Usuario COM tenant_users mas sem colaborador (aguardando aprovacao) le collaborators', 'OK:0',
  'authenticated', pg_temp.claims((select u_pending_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborators');

select pg_temp.check('2.9', 'Usuario aguardando aprovacao le menus', 'OK:0',
  'authenticated', pg_temp.claims((select u_pending_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.menus');

select pg_temp.check('2.10', 'Usuario aguardando aprovacao le a propria linha de tenant_users', 'OK:0',
  'authenticated', pg_temp.claims((select u_pending_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.tenant_users');

-- Caso 3 - colaborador on_leave / vacation nao le nada ----------------------

select pg_temp.check('3.1', 'Colaborador Afastado le tenants', 'OK:0',
  'authenticated', pg_temp.claims((select u_leave_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.tenants');

select pg_temp.check('3.2', 'Colaborador Afastado le collaborators', 'OK:0',
  'authenticated', pg_temp.claims((select u_leave_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.collaborators');

select pg_temp.check('3.3', 'Colaborador Afastado le menus', 'OK:0',
  'authenticated', pg_temp.claims((select u_leave_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.menus');

select pg_temp.check('3.4', 'Colaborador Afastado le collaborator_permissions', 'OK:0',
  'authenticated', pg_temp.claims((select u_leave_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.collaborator_permissions');

select pg_temp.check('3.5', 'Colaborador Afastado le tenant_users', 'OK:0',
  'authenticated', pg_temp.claims((select u_leave_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.tenant_users');

select pg_temp.check('3.6', 'Colaborador Afastado le access_requests', 'OK:0',
  'authenticated', pg_temp.claims((select u_leave_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.access_requests');

select pg_temp.check('3.7', 'Colaborador em Ferias le collaborators', 'OK:0',
  'authenticated', pg_temp.claims((select u_vac_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.collaborators');

select pg_temp.check('3.8', 'Colaborador em Ferias le menus', 'OK:0',
  'authenticated', pg_temp.claims((select u_vac_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.menus');

select pg_temp.check('3.9', 'Colaborador em Ferias le as proprias permissoes', 'OK:0',
  'authenticated', pg_temp.claims((select u_vac_a from rls_ids), (select tenant_a from rls_ids)), 'select 1 from public.collaborator_permissions');

-- Caso 4 - Arquiteto nao altera collaborator_permissions, nem as proprias ---

select pg_temp.check('4.1', 'Arquiteto A concede can_edit a si mesmo', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborator_permissions set can_edit = true where collaborator_id = %L', (select c_arch_a from rls_ids)));

select pg_temp.check('4.2', 'Arquiteto A insere permissao nova para si mesmo', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values (%L, %L, %L, true, true)',
         (select tenant_a from rls_ids), (select c_arch_a from rls_ids), 'receivables'));

select pg_temp.check('4.3', 'Arquiteto A altera permissao da Diretora', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborator_permissions set can_view = false where collaborator_id = %L', (select c_dir_a from rls_ids)));

select pg_temp.check('4.4', 'Arquiteto A apaga as proprias permissoes', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('delete from public.collaborator_permissions where collaborator_id = %L', (select c_arch_a from rls_ids)));

select pg_temp.check('4.5', 'CONTROLE: Diretora A altera permissao do Arquiteto (tem que funcionar)', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborator_permissions set can_edit = true where collaborator_id = %L', (select c_arch_a from rls_ids)));

-- Caso 5 - Arquiteto nao escala a propria role -----------------------------

select pg_temp.check('5.1', 'Arquiteto A troca a propria role para director', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set role = %L where id = %L', 'director', (select c_arch_a from rls_ids)));

select pg_temp.check('5.2', 'Arquiteto A cadastra um colaborador director novo', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborators (tenant_id, name, role, email) values (%L, %L, %L, %L)',
         (select tenant_a from rls_ids), 'Intruso', 'director', 'intruso@rls-test-a.example.test'));

select pg_temp.check('5.3', 'Arquiteto A apaga a Diretora', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('delete from public.collaborators where id = %L', (select c_dir_a from rls_ids)));

select pg_temp.check('5.4', 'Arquiteto A troca o proprio status de vacation para active (se estivesse de ferias)', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set status = %L where id = %L', 'active', (select c_vac_a from rls_ids)));

-- Caso 5b - trigger anti-escalacao, exercitado contra o DIRETOR -------------
--
-- Desde a 0012 so o Diretor escreve em collaborators. Ele e, portanto, o unico
-- que ainda alcanca o trigger collaborators_guard_self_service - e os quatro
-- caminhos que o trigger fecha continuam ruins vindos dele: auto-rebaixamento
-- sem volta e troca de identidade dentro do escritorio.
--
-- Todos esperam ERR:42501 e nao OK:0: aqui a policy PASSA (e Diretor, e do
-- proprio tenant) e quem barra e o trigger. Se algum destes virar OK:0, a
-- policy ficou restritiva demais; se virar OK:1, o trigger sumiu.

select pg_temp.check('5b.1', 'Diretora A rebaixa a si mesma para intern', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set role = %L where id = %L', 'intern', (select c_dir_a from rls_ids)));

select pg_temp.check('5b.2', 'Diretora A cria uma linha ja vinculada ao proprio login', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborators (tenant_id, user_id, name, role, email) values (%L, %L, %L, %L, %L)',
         (select tenant_a from rls_ids), (select u_dir_a from rls_ids), 'Eu De Novo', 'director', 'eu-de-novo@rls-test-a.example.test'));

select pg_temp.check('5b.3', 'Diretora A desvincula o proprio user_id (passo 1 da troca de identidade)', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set user_id = null where id = %L', (select c_dir_a from rls_ids)));

select pg_temp.check('5b.4', 'Diretora A cola o proprio user_id na linha do Arquiteto (passo 2)', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set user_id = %L where id = %L', (select u_dir_a from rls_ids), (select c_arch_a from rls_ids)));

select pg_temp.check('5b.5', 'Diretora A apaga a propria linha de colaborador', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('delete from public.collaborators where id = %L', (select c_dir_a from rls_ids)));

select pg_temp.check('5b.6', 'CONTROLE: Diretora A promove o Arquiteto a coordinator (tem que funcionar)', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set role = %L where id = %L', 'coordinator', (select c_arch_a from rls_ids)));

select pg_temp.check('5b.7', 'CONTROLE: Diretora A altera o proprio nome (o trigger so barra role e user_id)', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set name = %L where id = %L', 'Diretora A (nome novo)', (select c_dir_a from rls_ids)));

-- Caso 9 - Administrativo NAO gerencia equipe ------------------------------
--
-- Ate a 0011 a matriz de docs/SCHEMA-PLAN.md dizia "escreve: Diretor e
-- Administrativo", e estes casos afirmavam o contrario do que afirmam agora.
-- A matriz e que estava errada: em projeto-original/src/pages/Collaborators.jsx
-- a pagina inteira e bloqueada para quem nao e Diretor, e o "Admin" que ela
-- aceita ao lado dele e o papel de plataforma do base44, nao o Administrativo
-- do escritorio.
--
-- UPDATE e DELETE dao OK:0 e nao ERR: sem policy que case, o Postgres nao
-- levanta erro, ele so nao encontra linha. INSERT da ERR:42501 porque a
-- violacao de WITH CHECK e erro de verdade.

select pg_temp.check('9.1', 'Administrativo A cadastra colaborador', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborators (tenant_id, name, role, email) values (%L, %L, %L, %L)',
         (select tenant_a from rls_ids), 'Contratado pelo Administrativo', 'intern', 'novo-estagiario@rls-test-a.example.test'));

select pg_temp.check('9.2', 'Administrativo A promove a si mesmo a director', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set role = %L where id = %L', 'director', (select c_admin_a from rls_ids)));

select pg_temp.check('9.3', 'Administrativo A promove o Arquiteto a director', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set role = %L where id = %L', 'director', (select c_arch_a from rls_ids)));

select pg_temp.check('9.4', 'Administrativo A altera o nome de um colega', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set name = %L where id = %L', 'Renomeado pelo Administrativo', (select c_arch_a from rls_ids)));

select pg_temp.check('9.5', 'Administrativo A apaga um colaborador', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('delete from public.collaborators where id = %L', (select c_arch_a from rls_ids)));

select pg_temp.check('9.6', 'Administrativo A concede permissao a si mesmo', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view) values (%L, %L, %L, true)',
         (select tenant_a from rls_ids), (select c_admin_a from rls_ids), 'receivables'));

select pg_temp.check('9.7', 'Administrativo A eleva a propria permissao para can_edit', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborator_permissions set can_edit = true where collaborator_id = %L', (select c_admin_a from rls_ids)));

select pg_temp.check('9.8', 'Administrativo A altera permissao de terceiro', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborator_permissions set can_view = false where collaborator_id = %L', (select c_arch_a from rls_ids)));

select pg_temp.check('9.9', 'Administrativo A apaga permissao de terceiro', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('delete from public.collaborator_permissions where collaborator_id = %L', (select c_arch_a from rls_ids)));

select pg_temp.check('9.10', 'Administrativo A le permissao de terceiro', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  format('select 1 from public.collaborator_permissions where collaborator_id = %L', (select c_dir_a from rls_ids)));

select pg_temp.check('9.11', 'Administrativo A le a fila de aprovacao', 'OK:0',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.access_requests');

-- Caso 9.C - o que o Administrativo AINDA precisa conseguir ----------------
--
-- Sem estes, o aperto passaria de "Administrativo nao gerencia equipe" para
-- "Administrativo nao usa o sistema", e o teste nao acusaria.

select pg_temp.check('9.C1', 'CONTROLE: Administrativo A le a equipe do escritorio', 'OK:5',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborators');

select pg_temp.check('9.C2', 'CONTROLE: Administrativo A le as PROPRIAS permissoes', 'OK:1',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.collaborator_permissions');

select pg_temp.check('9.C3', 'CONTROLE: Administrativo A le o catalogo de menus', 'OK:18',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.menus');

select pg_temp.check('9.C4', 'CONTROLE: Administrativo A le o proprio escritorio', 'OK:1',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.tenants');

select pg_temp.check('9.C5', 'CONTROLE: Administrativo A le a propria linha em tenant_users', 'OK:1',
  'authenticated', pg_temp.claims((select u_admin_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.tenant_users');

-- Caso 6 - service_role mantem bypass; anon nao alcanca nada ---------------

select pg_temp.check('6.1', 'service_role le os dois escritorios em tenants', 'OK:2',
  'service_role', null, 'select 1 from public.tenants');

select pg_temp.check('6.2', 'service_role le os 6 colaboradores dos dois escritorios', 'OK:6',
  'service_role', null, 'select 1 from public.collaborators');

select pg_temp.check('6.3', 'service_role le access_requests dos dois escritorios', 'OK:3',
  'service_role', null, 'select 1 from public.access_requests');

select pg_temp.check('6.4', 'service_role le tenant_email_domains', 'OK:2',
  'service_role', null, 'select 1 from public.tenant_email_domains');

select pg_temp.check('6.5', 'service_role grava access_requests (papel da edge function register-access-request)', 'OK:1',
  'service_role', null,
  format('insert into public.access_requests (tenant_id, email, name) values (%L, %L, %L)',
         (select tenant_a from rls_ids), 'novo@rls-test-a.example.test', 'Novo Candidato'));

select pg_temp.check('6.6', 'anon le tenants', 'ERR:42501', 'anon', null, 'select 1 from public.tenants');
select pg_temp.check('6.7', 'anon le collaborators', 'ERR:42501', 'anon', null, 'select 1 from public.collaborators');
select pg_temp.check('6.8', 'anon le menus', 'ERR:42501', 'anon', null, 'select 1 from public.menus');
select pg_temp.check('6.9', 'anon le collaborator_permissions', 'ERR:42501', 'anon', null, 'select 1 from public.collaborator_permissions');
select pg_temp.check('6.10', 'anon le access_requests', 'ERR:42501', 'anon', null, 'select 1 from public.access_requests');
select pg_temp.check('6.11', 'anon le tenant_users', 'ERR:42501', 'anon', null, 'select 1 from public.tenant_users');
select pg_temp.check('6.12', 'anon le tenant_email_domains', 'ERR:42501', 'anon', null, 'select 1 from public.tenant_email_domains');

select pg_temp.check('6.13', 'anon insere em tenants', 'ERR:42501', 'anon', null,
  format('insert into public.tenants (name, slug) values (%L, %L)', 'Escritorio Pirata', 'rls-test-pirata'));

select pg_temp.check('6.14', 'anon insere solicitacao de acesso', 'ERR:42501', 'anon', null,
  format('insert into public.access_requests (tenant_id, email, name) values (%L, %L, %L)',
         (select tenant_a from rls_ids), 'spam@rls-test-a.example.test', 'Spam'));

select pg_temp.check('6.15', 'anon reescreve o rotulo de um menu', 'ERR:42501', 'anon', null,
  'update public.menus set label_pt = ''Invadido'' where key = ''crm''');

-- Caso 7 (extra) - escrita cruzada entre tenants ---------------------------
-- Leitura isolada nao basta: e possivel escrever em um tenant que nao se
-- enxerga se o WITH CHECK estiver ausente ou frouxo.

select pg_temp.check('7.1', 'Diretora A cadastra colaborador com tenant_id do escritorio B', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborators (tenant_id, name, role, email) values (%L, %L, %L, %L)',
         (select tenant_b from rls_ids), 'Plantado em B', 'director', 'plantado@rls-test-b.example.test'));

select pg_temp.check('7.2', 'Diretora A altera colaborador do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set name = %L where id = %L', 'Sequestrado', (select c_dir_b from rls_ids)));

select pg_temp.check('7.3', 'Diretora A apaga colaborador do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('delete from public.collaborators where id = %L', (select c_dir_b from rls_ids)));

select pg_temp.check('7.4', 'Diretora A move um colaborador do proprio escritorio para o B', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborators set tenant_id = %L where id = %L', (select tenant_b from rls_ids), (select c_leave_a from rls_ids)));

select pg_temp.check('7.5', 'Diretora A grava permissao no escritorio B', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view) values (%L, %L, %L, true)',
         (select tenant_b from rls_ids), (select c_dir_b from rls_ids), 'team'));

select pg_temp.check('7.6', 'Diretora A altera permissao do escritorio B', 'OK:0',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.collaborator_permissions set can_edit = false where tenant_id = %L', (select tenant_b from rls_ids)));

select pg_temp.check('7.7', 'Diretora A renomeia o proprio escritorio', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.tenants set name = %L where id = %L', 'Renomeado', (select tenant_a from rls_ids)));

select pg_temp.check('7.8', 'Diretora A aprova uma solicitacao de acesso direto pelo cliente', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('update public.access_requests set status = %L where tenant_id = %L', 'approved', (select tenant_a from rls_ids)));

select pg_temp.check('7.9', 'Diretora A cria vinculo em tenant_users (auto-adicionar usuario ao escritorio)', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.tenant_users (tenant_id, user_id) values (%L, %L)',
         (select tenant_a from rls_ids), (select u_orphan from rls_ids)));

select pg_temp.check('7.10', 'Diretora A cadastra dominio de e-mail (rota de sequestro de tenant)', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_dir_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.tenant_email_domains (tenant_id, domain) values (%L, %L)',
         (select tenant_a from rls_ids), 'gmail.com'));

-- Caso 8 (extra) - Arquiteto nao le a fila de aprovacao --------------------

select pg_temp.check('8.1', 'Arquiteto A le access_requests do proprio escritorio', 'OK:0',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  'select 1 from public.access_requests');

select pg_temp.check('8.2', 'Arquiteto A cadastra colaborador', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_arch_a from rls_ids), (select tenant_a from rls_ids)),
  format('insert into public.collaborators (tenant_id, name, role, email) values (%L, %L, %L, %L)',
         (select tenant_a from rls_ids), 'Contratado pelo Arquiteto', 'intern', 'estagiario@rls-test-a.example.test'));

-- Resultado ------------------------------------------------------------------

select
  caso,
  case when observed = expected then 'PASS' else 'FAIL' end as status,
  expected,
  observed,
  descricao
from rls_results
order by seq;

rollback;
