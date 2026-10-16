-- O login criado pela tela de Equipe (migration 0108).
--
-- O QUE ELE PROVA
--   1. Quem liga um login a um colaborador e Diretor ATIVO do MESMO escritorio.
--      Coordenador nao liga, Diretor afastado nao liga, e Diretor do escritorio
--      vizinho nao liga.
--   2. Ligar abre o vinculo em tenant_users — sem ele o proximo JWT sai sem
--      app_metadata.tenant_id (0006) e a pessoa entra num sistema vazio.
--   3. As permissoes nascem TODAS em falso: ter login nao e ver tela.
--   4. Um login nao serve a duas pessoas do mesmo escritorio, nem a dois
--      escritorios (o hook do JWT escolhe o vinculo mais antigo, entao a conta
--      entraria sempre no primeiro).
--   5. Nem anon nem authenticated executam as duas funcoes: quem chama e a edge
--      function, com a chave de servico.
--
-- O QUE NAO DA PARA PROVAR AQUI
--   A criacao da conta no Auth com a senha. Senha e hash feito pela Admin API,
--   fora do banco; o que o banco sabe e o id do usuario. A edge function tem
--   teste proprio em supabase/tests/edge-functions.mjs.
--
--   `collaborator_without_email` tambem nao: `collaborators.email` e NOT NULL
--   desde a 0003, entao o ramo e defesa em profundidade e nao estado alcancavel.
--
-- COMO RODAR
--   npm run test:collaborator-login
--
-- RESIDUO
--   Nenhum. Transacao terminada em ROLLBACK (slug login-*).

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

/* A funcao e chamada pela edge function com a chave de servico, ou seja, como
   postgres e sem claim nenhum. O ator vai por parametro, e e ele que a propria
   funcao confere — e isso que esta sonda reproduz. */
create or replace function pg_temp.ligar(p_colaborador uuid, p_login uuid, p_ator uuid)
returns text language plpgsql as $$
declare v jsonb; st text; msg text;
begin
  begin
    select public.link_collaborator_login(p_colaborador, p_login, p_ator) into v;
    return v ->> 'outcome';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    return 'ERR:' || msg;
  end;
end; $$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'daa00000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'daa00000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'daa00000-0000-4000-8000-00000000001a'::uuid as u_dir_a,
  'daa00000-0000-4000-8000-00000000002a'::uuid as u_coord_a,
  'daa00000-0000-4000-8000-00000000003a'::uuid as u_dir_afastado,
  'daa00000-0000-4000-8000-00000000001b'::uuid as u_dir_b,
  'daa00000-0000-4000-8000-00000000009a'::uuid as u_novo,
  'daa00000-0000-4000-8000-00000000009b'::uuid as u_outro,
  'daa00000-0000-4000-8000-0000000000c1'::uuid as c_dir_a,
  'daa00000-0000-4000-8000-0000000000c2'::uuid as c_coord_a,
  'daa00000-0000-4000-8000-0000000000c3'::uuid as c_dir_afastado,
  'daa00000-0000-4000-8000-0000000000c4'::uuid as c_sem_login,
  'daa00000-0000-4000-8000-0000000000c5'::uuid as c_outro_sem_login,
  'daa00000-0000-4000-8000-0000000000c6'::uuid as c_dir_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_dir_a from ids) u, 'login-dir-a@example.test' e
  union all select (select u_coord_a from ids), 'login-coord-a@example.test'
  union all select (select u_dir_afastado from ids), 'login-afastado@example.test'
  union all select (select u_dir_b from ids), 'login-dir-b@example.test'
  union all select (select u_novo from ids), 'login-novo@example.test'
  union all select (select u_outro from ids), 'login-outro@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Login A', 'login-a'),
  ((select tenant_b from ids), 'Login B', 'login-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_dir_a from ids), 'owner'),
  ((select tenant_a from ids), (select u_coord_a from ids), 'member'),
  ((select tenant_a from ids), (select u_dir_afastado from ids), 'member'),
  ((select tenant_b from ids), (select u_dir_b from ids), 'owner'),
  /* Esta conta ja serve o escritorio B: e o caso do 1.9. */
  ((select tenant_b from ids), (select u_outro from ids), 'member');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_dir_a from ids), (select tenant_a from ids), (select u_dir_a from ids),
   'Diretora A', 'director', 'login-dir-a@example.test', 'active'),
  ((select c_coord_a from ids), (select tenant_a from ids), (select u_coord_a from ids),
   'Coordenador A', 'coordinator', 'login-coord-a@example.test', 'active'),
  ((select c_dir_afastado from ids), (select tenant_a from ids), (select u_dir_afastado from ids),
   'Diretor Afastado', 'director', 'login-afastado@example.test', 'on_leave'),
  ((select c_sem_login from ids), (select tenant_a from ids), null,
   'Recem Cadastrada', 'architect', 'login-nova@example.test', 'active'),
  ((select c_outro_sem_login from ids), (select tenant_a from ids), null,
   'Outra Sem Login', 'intern', 'login-outra@example.test', 'active'),
  ((select c_dir_b from ids), (select tenant_b from ids), (select u_dir_b from ids),
   'Diretor B', 'director', 'login-dir-b@example.test', 'active');

-- 1. QUEM PODE LIGAR -----------------------------------------------------------------

select pg_temp.rec('1.1', 'coordenador NAO liga login (so Diretor)', 'ERR:not_authorized',
  pg_temp.ligar((select c_sem_login from ids), (select u_novo from ids), (select u_coord_a from ids)));

select pg_temp.rec('1.2', 'Diretor AFASTADO nao liga', 'ERR:not_authorized',
  pg_temp.ligar((select c_sem_login from ids), (select u_novo from ids), (select u_dir_afastado from ids)));

select pg_temp.rec('1.3', 'Diretor do escritorio VIZINHO nao liga', 'ERR:not_authorized',
  pg_temp.ligar((select c_sem_login from ids), (select u_novo from ids), (select u_dir_b from ids)));

select pg_temp.rec('1.4', 'colaborador inexistente', 'ERR:collaborator_not_found',
  pg_temp.ligar('daa00000-0000-4000-8000-00000000dead'::uuid, (select u_novo from ids), (select u_dir_a from ids)));

select pg_temp.rec('1.5', 'CONTROLE: Diretora ativa do MESMO escritorio liga', 'linked',
  pg_temp.ligar((select c_sem_login from ids), (select u_novo from ids), (select u_dir_a from ids)));

-- 2. O QUE LIGAR DEIXA PRONTO ---------------------------------------------------------

select pg_temp.rec('2.1', 'o colaborador passa a ter login', (select u_novo from ids)::text,
  (select user_id::text from public.collaborators where id = (select c_sem_login from ids)));

/* Sem esta linha o JWT sai sem app_metadata.tenant_id (0006) e a RLS nao devolve
   nada: a pessoa entraria e veria o sistema vazio. */
select pg_temp.rec('2.2', 'o vinculo de escritorio e aberto como member', 'member',
  (select role::text from public.tenant_users
    where tenant_id = (select tenant_a from ids) and user_id = (select u_novo from ids)));

select pg_temp.rec('2.3', 'a matriz de permissoes nasce semeada', 'true',
  (select (count(*) > 0)::text from public.collaborator_permissions
    where collaborator_id = (select c_sem_login from ids)));

select pg_temp.rec('2.4', 'e nasce TODA em falso: ter login nao e ver tela', '0',
  (select count(*)::text from public.collaborator_permissions
    where collaborator_id = (select c_sem_login from ids) and (can_view or can_edit)));

/* Agrupador nao recebe linha. O criterio e estrutural, igual ao da 0013: chave
   que vire agrupador amanha ja entra certa, sem tocar na funcao. */
select pg_temp.rec('2.5', 'agrupador de menu nao recebe permissao', '0',
  (select count(*)::text from public.collaborator_permissions p
    where p.collaborator_id = (select c_sem_login from ids)
      and exists (select 1 from public.menus child where child.parent_key = p.menu_key)));

select pg_temp.rec('2.6', 'repetir a operacao nao duplica nada, e diz que religou', 'relinked',
  pg_temp.ligar((select c_sem_login from ids), (select u_novo from ids), (select u_dir_a from ids)));

select pg_temp.rec('2.7', 'CONTROLE: o vinculo de escritorio continua unico', '1',
  (select count(*)::text from public.tenant_users
    where tenant_id = (select tenant_a from ids) and user_id = (select u_novo from ids)));

-- 3. UM LOGIN, UMA PESSOA -------------------------------------------------------------

select pg_temp.rec('3.1', 'o mesmo login nao serve a outra pessoa do escritorio', 'ERR:user_already_linked',
  pg_temp.ligar((select c_outro_sem_login from ids), (select u_novo from ids), (select u_dir_a from ids)));

/* custom_access_token_hook (0006) escreve no JWT o vinculo MAIS ANTIGO: uma
   conta em dois escritorios entraria sempre no primeiro e nunca veria o
   segundo. Enquanto nao houver troca de escritorio na tela, o caso e recusado. */
select pg_temp.rec('3.2', 'login que ja serve OUTRO escritorio e recusado', 'ERR:user_in_other_tenant',
  pg_temp.ligar((select c_outro_sem_login from ids), (select u_outro from ids), (select u_dir_a from ids)));

select pg_temp.rec('3.3', 'CONTROLE: e a recusa nao deixou meio caminho andado', '(nulo)',
  coalesce((select user_id::text from public.collaborators where id = (select c_outro_sem_login from ids)), '(nulo)'));

-- 4. QUEM CHAMA AS FUNCOES -------------------------------------------------------------

select pg_temp.rec('4.1', 'anon NAO executa link_collaborator_login', 'false',
  has_function_privilege('anon', 'public.link_collaborator_login(uuid, uuid, uuid)', 'execute')::text);

select pg_temp.rec('4.2', 'authenticated NAO executa link_collaborator_login', 'false',
  has_function_privilege('authenticated', 'public.link_collaborator_login(uuid, uuid, uuid)', 'execute')::text);

select pg_temp.rec('4.3', 'anon NAO executa find_auth_user_by_email', 'false',
  has_function_privilege('anon', 'public.find_auth_user_by_email(text)', 'execute')::text);

select pg_temp.rec('4.4', 'authenticated NAO executa find_auth_user_by_email', 'false',
  has_function_privilege('authenticated', 'public.find_auth_user_by_email(text)', 'execute')::text);

select pg_temp.rec('4.5', 'as duas sao SECURITY DEFINER com search_path fixo', 'true',
  (select bool_and(p.prosecdef and exists (
     select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'))::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('link_collaborator_login', 'find_auth_user_by_email')));

-- 5. A BUSCA POR E-MAIL ------------------------------------------------------------------

select pg_temp.rec('5.1', 'acha o login pelo e-mail, sem diferenciar maiuscula', (select u_novo from ids)::text,
  public.find_auth_user_by_email('LOGIN-NOVO@EXAMPLE.TEST')::text);

select pg_temp.rec('5.2', 'e-mail sem conta devolve nulo', '(nulo)',
  coalesce(public.find_auth_user_by_email('ninguem@example.test')::text, '(nulo)'));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
