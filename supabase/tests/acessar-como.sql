-- "Acessar como": quem pode assumir a sessao de quem (migration 0109).
--
-- O QUE ELE PROVA
--   1. So Diretor ATIVO assume. Coordenador nao, Diretor afastado nao.
--   2. ISOLAMENTO ENTRE ESCRITORIOS: o id do alvo chega pelo corpo da
--      requisicao, ou seja, e dado nao confiavel. Diretor do escritorio vizinho
--      nao assume ninguem daqui — este e o caso que nao pode falhar nunca.
--   3. Alvo precisa estar ativo, ter login e nao ser o proprio ator.
--   4. A tentativa RECUSADA nao deixa linha de auditoria, e a aceita deixa
--      exatamente uma, com os dois nomes congelados.
--   5. Nem anon nem authenticated executam a funcao: quem chama e a edge
--      function, com a chave de servico. Esta e a funcao que entrega a conta de
--      outra pessoa — o GRANT dela vale um caso proprio.
--   6. A trilha e lida so pelo Diretor do proprio escritorio, e ninguem a
--      escreve, atualiza ou apaga pela API.
--
-- O QUE NAO DA PARA PROVAR AQUI
--   A emissao da sessao (`generateLink` + `verifyOtp`). Isso e Admin API, fora
--   do banco; o que o banco sabe e quem autorizou e o que foi registrado.
--
-- COMO RODAR
--   npm run test:acessar-como
--
-- RESIDUO
--   Nenhum. Transacao terminada em ROLLBACK (slug imp-*).

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

/* A funcao e chamada pela edge function com a chave de servico: como postgres e
   sem claim nenhum. O ator vai por PARAMETRO, e e ele que a propria funcao
   confere — e isso que esta sonda reproduz. */
create or replace function pg_temp.assumir(p_ator uuid, p_alvo uuid)
returns text language plpgsql as $$
declare v jsonb; msg text;
begin
  begin
    select public.start_impersonation(p_ator, p_alvo) into v;
    return 'OK:' || (v ->> 'target_name');
  exception when others then
    get stacked diagnostics msg = message_text;
    return 'ERR:' || msg;
  end;
end; $$;

create or replace function pg_temp.probe(p_role name, p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v_rows bigint; v_out text; v_msg text;
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
end; $$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql as $$
  select jsonb_build_object('sub', p_sub, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('tenant_id', p_tenant, 'tenant_role', 'member'));
$$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'daa00000-0000-4000-8000-0000000000a0'::uuid as tenant_a,
  'daa00000-0000-4000-8000-0000000000b0'::uuid as tenant_b,
  'daa00000-0000-4000-8000-0000000000a1'::uuid as u_dir_a,
  'daa00000-0000-4000-8000-0000000000a2'::uuid as u_arq_a,
  'daa00000-0000-4000-8000-0000000000a3'::uuid as u_coord_a,
  'daa00000-0000-4000-8000-0000000000a4'::uuid as u_dir_afastado,
  'daa00000-0000-4000-8000-0000000000a5'::uuid as u_arq_ferias,
  'daa00000-0000-4000-8000-0000000000a6'::uuid as u_dir2_a,
  'daa00000-0000-4000-8000-0000000000b1'::uuid as u_dir_b,
  'daa00000-0000-4000-8000-0000000000b2'::uuid as u_arq_b,
  'daa00000-0000-4000-8000-0000000000c1'::uuid as c_dir_a,
  'daa00000-0000-4000-8000-0000000000c2'::uuid as c_arq_a,
  'daa00000-0000-4000-8000-0000000000c3'::uuid as c_coord_a,
  'daa00000-0000-4000-8000-0000000000c4'::uuid as c_dir_afastado,
  'daa00000-0000-4000-8000-0000000000c5'::uuid as c_sem_login,
  'daa00000-0000-4000-8000-0000000000c6'::uuid as c_arq_ferias,
  'daa00000-0000-4000-8000-0000000000c7'::uuid as c_dir2_a,
  'daa00000-0000-4000-8000-0000000000d1'::uuid as c_dir_b,
  'daa00000-0000-4000-8000-0000000000d2'::uuid as c_arq_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_dir_a from ids) u, 'imp-dir-a@example.test' e
  union all select (select u_arq_a from ids), 'imp-arq-a@example.test'
  union all select (select u_coord_a from ids), 'imp-coord-a@example.test'
  union all select (select u_dir_afastado from ids), 'imp-afastado@example.test'
  union all select (select u_arq_ferias from ids), 'imp-ferias@example.test'
  union all select (select u_dir2_a from ids), 'imp-dir2-a@example.test'
  union all select (select u_dir_b from ids), 'imp-dir-b@example.test'
  union all select (select u_arq_b from ids), 'imp-arq-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Imp A', 'imp-a'),
  ((select tenant_b from ids), 'Imp B', 'imp-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_dir_a from ids), 'owner'),
  ((select tenant_a from ids), (select u_arq_a from ids), 'member'),
  ((select tenant_a from ids), (select u_coord_a from ids), 'member'),
  ((select tenant_a from ids), (select u_dir_afastado from ids), 'member'),
  ((select tenant_a from ids), (select u_arq_ferias from ids), 'member'),
  ((select tenant_a from ids), (select u_dir2_a from ids), 'member'),
  ((select tenant_b from ids), (select u_dir_b from ids), 'owner'),
  ((select tenant_b from ids), (select u_arq_b from ids), 'member');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_dir_a from ids), (select tenant_a from ids), (select u_dir_a from ids),
   'Diretora A', 'director', 'imp-dir-a@example.test', 'active'),
  ((select c_arq_a from ids), (select tenant_a from ids), (select u_arq_a from ids),
   'Arquiteta A', 'architect', 'imp-arq-a@example.test', 'active'),
  ((select c_coord_a from ids), (select tenant_a from ids), (select u_coord_a from ids),
   'Coordenador A', 'coordinator', 'imp-coord-a@example.test', 'active'),
  ((select c_dir_afastado from ids), (select tenant_a from ids), (select u_dir_afastado from ids),
   'Diretor Afastado', 'director', 'imp-afastado@example.test', 'on_leave'),
  ((select c_sem_login from ids), (select tenant_a from ids), null,
   'Sem Login', 'intern', 'imp-sem-login@example.test', 'active'),
  ((select c_arq_ferias from ids), (select tenant_a from ids), (select u_arq_ferias from ids),
   'Arquiteto de Ferias', 'architect', 'imp-ferias@example.test', 'vacation'),
  ((select c_dir2_a from ids), (select tenant_a from ids), (select u_dir2_a from ids),
   'Diretor Socio', 'director', 'imp-dir2-a@example.test', 'active'),
  ((select c_dir_b from ids), (select tenant_b from ids), (select u_dir_b from ids),
   'Diretor B', 'director', 'imp-dir-b@example.test', 'active'),
  ((select c_arq_b from ids), (select tenant_b from ids), (select u_arq_b from ids),
   'Arquiteto B', 'architect', 'imp-arq-b@example.test', 'active');

-- 1. QUEM PODE ASSUMIR ---------------------------------------------------------------

select pg_temp.rec('1.1', 'coordenador NAO assume (so Diretor)', 'ERR:not_authorized',
  pg_temp.assumir((select u_coord_a from ids), (select c_arq_a from ids)));

select pg_temp.rec('1.2', 'Diretor AFASTADO nao assume', 'ERR:not_authorized',
  pg_temp.assumir((select u_dir_afastado from ids), (select c_arq_a from ids)));

select pg_temp.rec('1.3', 'arquiteto comum nao assume', 'ERR:not_authorized',
  pg_temp.assumir((select u_arq_a from ids), (select c_coord_a from ids)));

select pg_temp.rec('1.4', 'usuario sem cadastro de colaborador nao assume', 'ERR:not_authorized',
  pg_temp.assumir('daa00000-0000-4000-8000-0000000000ff'::uuid, (select c_arq_a from ids)));

-- 2. O ALVO ---------------------------------------------------------------------------

/* O CASO QUE NAO PODE FALHAR: o id do alvo vem do corpo da requisicao. Quem
   decide o escritorio e a linha do ATOR, lida dentro da funcao. */
select pg_temp.rec('2.1', 'Diretor do escritorio VIZINHO nao assume ninguem daqui', 'ERR:target_other_tenant',
  pg_temp.assumir((select u_dir_b from ids), (select c_arq_a from ids)));

select pg_temp.rec('2.2', 'e nem o Diretor daqui assume alguem de la', 'ERR:target_other_tenant',
  pg_temp.assumir((select u_dir_a from ids), (select c_arq_b from ids)));

select pg_temp.rec('2.3', 'alvo inexistente', 'ERR:target_not_found',
  pg_temp.assumir((select u_dir_a from ids), 'daa00000-0000-4000-8000-00000000dead'::uuid));

select pg_temp.rec('2.4', 'alvo SEM LOGIN nao tem sessao para assumir', 'ERR:target_without_login',
  pg_temp.assumir((select u_dir_a from ids), (select c_sem_login from ids)));

select pg_temp.rec('2.5', 'alvo fora de atividade (ferias) nao e assumido', 'ERR:target_not_active',
  pg_temp.assumir((select u_dir_a from ids), (select c_arq_ferias from ids)));

select pg_temp.rec('2.6', 'o Diretor nao assume a si mesmo', 'ERR:target_is_self',
  pg_temp.assumir((select u_dir_a from ids), (select c_dir_a from ids)));

/* Ate aqui foram 10 tentativas, TODAS recusadas. Se alguma tivesse gravado, a
   trilha mentiria para o lado mais perigoso: acusando acesso que nao houve. */
select pg_temp.rec('2.7', 'nenhuma tentativa recusada deixou linha de auditoria', '0',
  (select count(*)::text from public.impersonation_events
    where tenant_id in ((select tenant_a from ids), (select tenant_b from ids))));

select pg_temp.rec('2.8', 'CONTROLE: Diretora ativa assume arquiteta do mesmo escritorio', 'OK:Arquiteta A',
  pg_temp.assumir((select u_dir_a from ids), (select c_arq_a from ids)));

/* Regra simples vence excecao: um Diretor assume outro Diretor, e fica
   registrado igual. */
select pg_temp.rec('2.9', 'Diretor assume outro Diretor ATIVO do mesmo escritorio', 'OK:Diretor Socio',
  pg_temp.assumir((select u_dir_a from ids), (select c_dir2_a from ids)));

-- 3. O QUE A TRILHA GUARDA ------------------------------------------------------------

/* As duas aceitas (2.8 e 2.9), e nada das dez recusadas. */
select pg_temp.rec('3.1', 'as duas tentativas aceitas deixaram duas linhas', '2',
  (select count(*)::text from public.impersonation_events where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('3.2', 'a linha guarda o NOME de quem assumiu', 'Diretora A',
  (select actor_name from public.impersonation_events where target_user_id = (select u_arq_a from ids)));

select pg_temp.rec('3.3', 'e o nome e a funcao de quem foi assumido', 'Arquiteta A|architect',
  (select target_name || '|' || target_role from public.impersonation_events
    where target_user_id = (select u_arq_a from ids)));

/* Os ids de login sao o que amarra a linha as sessoes de verdade. */
select pg_temp.rec('3.4', 'guarda os dois ids de login', 'true',
  (select (actor_user_id = (select u_dir_a from ids))::text
   from public.impersonation_events where target_user_id = (select u_arq_a from ids)));

/* O nome fica mesmo quando o cadastro sai: e o motivo de ele ser copiado. */
delete from public.collaborator_permissions where collaborator_id = (select c_arq_a from ids);
delete from public.collaborators where id = (select c_arq_a from ids);

select pg_temp.rec('3.5', 'apagar o colaborador nao apaga a trilha', '2',
  (select count(*)::text from public.impersonation_events where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('3.6', 'o nome sobrevive ao cadastro, o id vira nulo', 'Arquiteta A|(nulo)',
  (select target_name || '|' || coalesce(target_collaborator_id::text, '(nulo)')
   from public.impersonation_events where target_user_id = (select u_arq_a from ids)));

/* Sem a lista de colunas no ON DELETE SET NULL, tenant_id (NOT NULL) seria
   anulado junto e o DELETE falharia. Defeito documentado na 0073. */
select pg_temp.rec('3.7', 'e o tenant_id continua de pe', 'true',
  (select (tenant_id = (select tenant_a from ids))::text
   from public.impersonation_events where target_user_id = (select u_arq_a from ids)));

-- 4. QUEM EXECUTA A FUNCAO -------------------------------------------------------------

select pg_temp.rec('4.1', 'anon NAO executa start_impersonation', 'false',
  has_function_privilege('anon', 'public.start_impersonation(uuid,uuid)', 'execute')::text);

/* O caso mais importante desta secao: `authenticated` e todo mundo que esta
   logado. Se ela executasse, qualquer pessoa logada chamaria a funcao
   diretamente pela API e pularia a edge function inteira. */
select pg_temp.rec('4.2', 'authenticated NAO executa start_impersonation', 'false',
  has_function_privilege('authenticated', 'public.start_impersonation(uuid,uuid)', 'execute')::text);

select pg_temp.rec('4.3', 'service_role executa', 'true',
  has_function_privilege('service_role', 'public.start_impersonation(uuid,uuid)', 'execute')::text);

select pg_temp.rec('4.4', 'e SECURITY DEFINER com search_path fixo', 'true',
  (select (p.prosecdef and exists (
     select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'))::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'start_impersonation'));

-- 5. QUEM LE A TRILHA --------------------------------------------------------------------

select pg_temp.rec('5.1', 'Diretora le a trilha do proprio escritorio', 'OK:2',
  pg_temp.probe('authenticated', pg_temp.claims((select u_dir_a from ids), (select tenant_a from ids)),
    'select * from public.impersonation_events'));

select pg_temp.rec('5.2', 'coordenador do mesmo escritorio NAO le', 'OK:0',
  pg_temp.probe('authenticated', pg_temp.claims((select u_coord_a from ids), (select tenant_a from ids)),
    'select * from public.impersonation_events'));

select pg_temp.rec('5.3', 'Diretor do escritorio vizinho NAO le', 'OK:0',
  pg_temp.probe('authenticated', pg_temp.claims((select u_dir_b from ids), (select tenant_b from ids)),
    'select * from public.impersonation_events'));

/* Claim de tenant forjado nao basta: a policy tambem pergunta a funcao do
   colaborador, que e lida do banco. */
select pg_temp.rec('5.4', 'Diretor de B com claim do tenant A ainda nao le', 'OK:0',
  pg_temp.probe('authenticated', pg_temp.claims((select u_dir_b from ids), (select tenant_a from ids)),
    'select * from public.impersonation_events'));

select pg_temp.rec('5.5', 'anonimo nao le', 'ERR:42501',
  pg_temp.probe('anon', null, 'select * from public.impersonation_events'));

-- 6. NINGUEM ESCREVE A TRILHA PELA API ----------------------------------------------------

select pg_temp.rec('6.1', 'nem a Diretora INSERE linha', 'ERR:42501',
  pg_temp.probe('authenticated', pg_temp.claims((select u_dir_a from ids), (select tenant_a from ids)),
    format('insert into public.impersonation_events (tenant_id, actor_user_id, actor_name, target_user_id, target_name, target_role) values (%L, %L, %L, %L, %L, %L)',
      (select tenant_a from ids), (select u_dir_a from ids), 'Forjada',
      (select u_coord_a from ids), 'Forjado', 'coordinator')));

select pg_temp.rec('6.2', 'nem ATUALIZA', 'ERR:42501',
  pg_temp.probe('authenticated', pg_temp.claims((select u_dir_a from ids), (select tenant_a from ids)),
    'update public.impersonation_events set actor_name = ''Outro'''));

select pg_temp.rec('6.3', 'nem APAGA', 'ERR:42501',
  pg_temp.probe('authenticated', pg_temp.claims((select u_dir_a from ids), (select tenant_a from ids)),
    'delete from public.impersonation_events'));

select pg_temp.rec('6.4', 'a tabela tem RLS ligada', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.impersonation_events'::regclass));

select pg_temp.rec('6.5', 'e exatamente uma policy, de SELECT', 'SELECT',
  (select string_agg(cmd, ',') from pg_policies where tablename = 'impersonation_events'));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
