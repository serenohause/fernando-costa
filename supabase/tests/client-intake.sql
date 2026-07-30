-- Teste do formulario publico de briefing (modulo 3) - client_intakes
--
-- POR QUE ESTE ARQUIVO EXISTE SEPARADO
--   client_intakes e a unica superficie do sistema gravada sem sessao
--   autenticada. Os invariantes do padrao
--   (supabase/tests/pattern-invariants.sql) ja afirmam o lado autenticado da
--   tabela - RLS ligada, anon sem privilegio, quatro policies, isolamento entre
--   escritorios, escrita presa ao menu 'pipeline'. O que eles NAO sabem testar e
--   a via publica legitima: as duas funcoes que resolvem o token.
--
--   Os sete casos abaixo sao exatamente os sete que docs/SCHEMA-PLAN.md lista em
--   "O que precisa de teste proprio, porque o padrao nao cobre".
--
-- COMO RODAR
--   npm run test:intake
--
-- COMO LER
--   Cada caso guarda um VALOR, nao um "passou". Sonda de contagem onde o que
--   importa e o conteudo ja produziu asserçao vazia neste projeto duas vezes,
--   entao onde a contagem e o ponto (caso 1: uma linha, nunca duas) ela vem
--   acompanhada do valor devolvido.
--   'ERR:<sqlstate>' = a operacao foi recusada pelo banco. 42501 e privilegio
--   negado, 23503 FK violada.
--   Casos marcados CONTROLE afirmam o que precisa CONTINUAR possivel.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. Fixtures em tenants proprios
--   (slug intake-test-*).

begin;

-- Instrumentacao --------------------------------------------------------------

create temp table res (
  seq serial primary key, caso text, descricao text, expected text, observed text
) on commit drop;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', case when p_tenant is null then '{}'::jsonb
                         else jsonb_build_object('tenant_id', p_tenant::text) end)
$$;

-- Roda p_sql como p_role e devolve o texto da primeira coluna da primeira linha.
-- O sucesso PERSISTE de proposito: os casos 4, 5 e 6 dependem do estado deixado
-- pelo caso anterior (enviar duas vezes com o mesmo token e a coisa toda).
create or replace function pg_temp.as_role(p_caso text, p_desc text, p_expected text,
                                           p_role name, p_claims jsonb, p_sql text)
returns void language plpgsql as $$
declare v text; v_state text;
begin
  begin
    perform set_config('role', p_role, true);
    if p_claims is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', p_claims::text, true);
    end if;
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    v := coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    v := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v);
end;
$$;

-- Atalho para o que roda como postgres (montagem de cenario e conferencia de
-- estado, nunca como afirmacao sobre autorizacao).
create or replace function pg_temp.val(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
begin
  perform pg_temp.as_role(p_caso, p_desc, p_expected, 'postgres', null, p_sql);
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'c1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'c2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'c1000000-0000-4000-8000-000000000001'::uuid as u_editor_a,
  'c1100000-0000-4000-8000-000000000001'::uuid as col_a,
  'c2100000-0000-4000-8000-000000000001'::uuid as col_b,
  'c1300000-0000-4000-8000-000000000001'::uuid as client_a1,
  'c1300000-0000-4000-8000-000000000002'::uuid as client_a2,
  'c2300000-0000-4000-8000-000000000001'::uuid as client_b,
  'c1200000-0000-4000-8000-000000000001'::uuid as neg_a,
  -- Tokens fixos para o teste poder chamar as funcoes com literal. Em producao
  -- quem gera e o default da coluna (gen_random_uuid).
  'aaaaaaaa-0000-4000-8000-00000000000a'::uuid as tk_ok,
  'aaaaaaaa-0000-4000-8000-00000000000b'::uuid as tk_second,
  'aaaaaaaa-0000-4000-8000-00000000000c'::uuid as tk_expired,
  'aaaaaaaa-0000-4000-8000-00000000000d'::uuid as tk_submitted,
  'bbbbbbbb-0000-4000-8000-00000000000a'::uuid as tk_b,
  'ffffffff-0000-4000-8000-00000000000f'::uuid as tk_inexistente;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ((select u_editor_a from ids), '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'intake-editor-a@example.test', now(), now());

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Intake Test A', 'intake-test-a'),
  ((select tenant_b from ids), 'Intake Test B', 'intake-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_editor_a from ids), 'member');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_a from ids), (select tenant_a from ids), (select u_editor_a from ids),
   'Comercial A', 'architect', 'intake-editor-a@example.test', 'active'),
  ((select col_b from ids), (select tenant_b from ids), null,
   'Comercial B', 'architect', 'intake-editor-b@example.test', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit)
values ((select tenant_a from ids), (select col_a from ids), 'pipeline', true, true);

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select client_a1 from ids), (select tenant_a from ids), 'Helena Moraes', '(62) 99811-2200', 'Goiania', 'GO'),
  ((select client_a2 from ids), (select tenant_a from ids), 'Otavio Bandeira', '(62) 99811-2201', 'Goiania', 'GO'),
  ((select client_b from ids), (select tenant_b from ids), 'Regina Alencar', '(62) 99811-3300', 'Anapolis', 'GO');

insert into public.negotiations (id, tenant_id, name, client_id, commercial_owner_id) values
  ((select neg_a from ids), (select tenant_a from ids), 'Residencia Alto da Glória',
   (select client_a1 from ids), (select col_a from ids));

-- created_at aparece explicito no link vencido porque o check
-- client_intakes_expires_after_creation_check recusa linha que ja nasce
-- vencida - e ele esta certo: link vencido e link ANTIGO, criado ha mais de 24h.
insert into public.client_intakes (tenant_id, token, negotiation_id, client_id, status,
                                   created_at, expires_at, submitted_at)
values
  -- Valido.
  ((select tenant_a from ids), (select tk_ok from ids), (select neg_a from ids),
   (select client_a1 from ids), 'active', now(), now() + interval '24 hours', null),
  -- Valido, OUTRO cliente do mesmo escritorio: e o que faz o caso 1 distinguir
  -- "achou pelo token" de "devolveu a primeira linha que viu".
  ((select tenant_a from ids), (select tk_second from ids), null,
   (select client_a2 from ids), 'active', now(), now() + interval '24 hours', null),
  -- Prazo vencido, status ainda 'active' (e assim que uma linha vence: ninguem
  -- passa marcando).
  ((select tenant_a from ids), (select tk_expired from ids), null,
   (select client_a1 from ids), 'active',
   now() - interval '25 hours', now() - interval '1 hour', null),
  -- Ja enviado.
  ((select tenant_a from ids), (select tk_submitted from ids), null,
   (select client_a1 from ids), 'submitted', now(), now() + interval '24 hours', now()),
  -- Outro escritorio.
  ((select tenant_b from ids), (select tk_b from ids), null,
   (select client_b from ids), 'active', now(), now() + interval '24 hours', null);

-- 1. Token valido abre e devolve UMA linha, nunca duas -------------------------

select pg_temp.as_role('1.1', 'token valido devolve exatamente uma linha', '1',
  'service_role', null, format($q$
  select count(*)::text from public.open_client_intake(%L)
$q$, (select tk_ok from ids)));

select pg_temp.as_role('1.2', 'a linha devolvida e a DAQUELE token', 'Helena Moraes',
  'service_role', null, format($q$
  select client_name from public.open_client_intake(%L)
$q$, (select tk_ok from ids)));

-- Sem este caso, uma funcao que ignorasse o token e devolvesse a primeira linha
-- da tabela passaria em 1.1 e em 1.2.
select pg_temp.as_role('1.3', 'CONTROLE: outro token do mesmo escritorio devolve OUTRO cliente', 'Otavio Bandeira',
  'service_role', null, format($q$
  select client_name from public.open_client_intake(%L)
$q$, (select tk_second from ids)));

-- 2. A resposta nao contem id interno nem tenant_id ----------------------------

select pg_temp.as_role('2.1', 'chaves da resposta, em execucao', 'client_name,expires_at,outcome',
  'service_role', null, format($q$
  select (select string_agg(k, ',' order by k) from jsonb_object_keys(to_jsonb(x)) k)
  from public.open_client_intake(%L) x
$q$, (select tk_ok from ids)));

-- O mesmo pelo catalogo: a assinatura e o contrato, e e ela que impede alguem de
-- acrescentar 'id' ao retorno sem quebrar um teste.
select pg_temp.val('2.2', 'assinatura declarada de open_client_intake',
  'TABLE(outcome client_intake_outcome, client_name text, expires_at timestamp with time zone)', $q$
  select pg_get_function_result('public.open_client_intake(uuid)'::regprocedure)
$q$);

select pg_temp.val('2.3', 'a tabela TEM os campos que a resposta nao devolve', 'client_id,id,negotiation_id,tenant_id', $q$
  select string_agg(column_name, ',' order by column_name)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'client_intakes'
    and column_name in ('id', 'tenant_id', 'client_id', 'negotiation_id')
$q$);

-- 3. Inexistente, expirado e ja enviado recusam do MESMO jeito -----------------

-- MUDOU NA 0026, por decisao do usuario: token que EXISTE tem desfecho proprio.
-- O raciocinio esta no cabecalho da migration. Em resumo: a indistinguibilidade
-- protegia contra descoberta de token por tentativa, e o token e uuid v4 - 122
-- bits - com limite de requisicao na frente. Protecao teorica, custo real para
-- quem tem o link legitimamente e reabre depois de enviar.
--
-- O que a suite passa a afirmar: cada estado tem o SEU desfecho (senao a tela
-- nao consegue diferenciar), e nenhum deles vaza id nem campo do briefing.

select pg_temp.as_role('3.1', 'token inexistente: outcome not_found', 'not_found',
  'service_role', null, format($q$
  select outcome::text from public.open_client_intake(%L)
$q$, (select tk_inexistente from ids)));

select pg_temp.as_role('3.2', 'token expirado: outcome expired', 'expired',
  'service_role', null, format($q$
  select outcome::text from public.open_client_intake(%L)
$q$, (select tk_expired from ids)));

select pg_temp.as_role('3.3', 'token ja enviado: outcome already_submitted', 'already_submitted',
  'service_role', null, format($q$
  select outcome::text from public.open_client_intake(%L)
$q$, (select tk_submitted from ids)));

-- CONTROLE contra a volta do defeito oposto: token inexistente NAO pode devolver
-- nome de cliente. Sem este caso, uma versao que devolvesse o nome junto do
-- not_found passaria nos tres acima.
select pg_temp.as_role('3.1b', 'CONTROLE: token inexistente nao devolve nome de cliente', '<null>',
  'service_role', null, format($q$
  select coalesce(client_name, '<null>') from public.open_client_intake(%L)
$q$, (select tk_inexistente from ids)));

-- CONTROLE: sempre UMA linha, em todos os desfechos. Zero linha voltaria a
-- impedir a tela de distinguir, e mais de uma seria token colidindo.
select pg_temp.as_role('3.1c', 'CONTROLE: token inexistente devolve exatamente uma linha', '1',
  'service_role', null, format($q$
  select count(*)::text from public.open_client_intake(%L)
$q$, (select tk_inexistente from ids)));

-- A afirmacao que importa agora e a inversa da que existia ate a 0026: os tres
-- precisam ser DIFERENTES entre si, senao a tela publica nao consegue mostrar
-- "seus dados ja foram enviados" em vez de uma recusa seca. O oraculo que a
-- versao anterior evitava era
-- "este token existe?".
select pg_temp.val('3.4', 'os tres desfechos sao distintos entre si', '3', $q$
  select count(distinct observed)::text from res where caso in ('3.1', '3.2', '3.3')
$q$);

select pg_temp.val('3.5', 'CONTROLE: o token valido continua devolvendo linha', '1', $q$
  select count(distinct observed)::text from res where caso = '1.1' and observed = '1'
$q$);

-- A abertura do link vencido marcou a linha, server-side, sem mudar a resposta.
select pg_temp.val('3.6', 'a abertura do link vencido marcou a linha como expirada', 'expired', format($q$
  select status::text from public.client_intakes where token = %L
$q$, (select tk_expired from ids)));

select pg_temp.val('3.7', 'e registrou a tentativa', 'expired', format($q$
  select last_validation_status::text from public.client_intakes where token = %L
$q$, (select tk_expired from ids)));

-- 4. Envio depois de expirado e recusado, mesmo tendo aberto antes -------------
--
-- E o caso real: a pessoa abre o formulario as 23h de validade e envia duas
-- horas depois. No original quem confere as duas vezes e o navegador.

select pg_temp.as_role('4.1', 'CONTROLE: o token abre normalmente enquanto vale', '1',
  'service_role', null, format($q$
  select count(*)::text from public.open_client_intake(%L)
$q$, (select tk_second from ids)));

-- created_at recua junto: o check exige expires_at > created_at, e o que se
-- simula aqui e um link criado ontem, nao um link que nasceu vencido.
select pg_temp.val('4.2', 'o tempo passa entre abrir e enviar', 'OK', format($q$
  with u as (update public.client_intakes
     set created_at = now() - interval '25 hours',
         expires_at = now() - interval '1 minute'
   where token = %L returning 1)
  select 'OK' from u
$q$, (select tk_second from ids)));

select pg_temp.as_role('4.3', 'o envio e recusado', 'false',
  'service_role', null, format($q$
  select public.submit_client_intake(%L, '{"full_name":"Otavio Bandeira","phone":"(62) 90000-0000"}'::jsonb)::text
$q$, (select tk_second from ids)));

-- A afirmacao que separa "recusou" de "recusou e gravou assim mesmo".
select pg_temp.val('4.4', 'e NADA foi gravado no briefing', '<null>', format($q$
  select full_name from public.client_intakes where token = %L
$q$, (select tk_second from ids)));

select pg_temp.val('4.5', 'a linha ficou marcada como expirada no envio', 'expired|expired_on_submit', format($q$
  select status::text || '|' || last_validation_status::text
  from public.client_intakes where token = %L
$q$, (select tk_second from ids)));

-- 5. O segundo envio com o mesmo token e recusado ------------------------------

select pg_temp.as_role('5.1', 'CONTROLE: o primeiro envio e aceito', 'true',
  'service_role', null, format($q$
  select public.submit_client_intake(%L,
    '{"full_name":"Helena Moraes Silva","phone":"(62) 99811-2200","email":"helena@example.test","tax_id":"123.456.789-00","site_city":"Goiania"}'::jsonb)::text
$q$, (select tk_ok from ids)));

select pg_temp.val('5.2', 'CONTROLE: o briefing do primeiro envio foi gravado', 'Helena Moraes Silva|Goiania', format($q$
  select full_name || '|' || site_city from public.client_intakes where token = %L
$q$, (select tk_ok from ids)));

select pg_temp.val('5.3', 'CONTROLE: e a linha foi encerrada com hora de envio', 'submitted|true', format($q$
  select status::text || '|' || (submitted_at is not null)::text
  from public.client_intakes where token = %L
$q$, (select tk_ok from ids)));

select pg_temp.as_role('5.4', 'o segundo envio e recusado', 'false',
  'service_role', null, format($q$
  select public.submit_client_intake(%L,
    '{"full_name":"NOME SOBRESCRITO","phone":"(11) 90000-0000"}'::jsonb)::text
$q$, (select tk_ok from ids)));

-- Sem esta, "recusou" e "aceitou e sobrescreveu" dariam o mesmo false.
select pg_temp.val('5.5', 'e o briefing do primeiro envio continua intacto', 'Helena Moraes Silva', format($q$
  select full_name from public.client_intakes where token = %L
$q$, (select tk_ok from ids)));

-- Mass assignment: mesmo aceito, o payload nao escolhe tenant, cliente nem
-- status. Um envio legitimo com essas chaves no corpo nao pode move-los.
select pg_temp.as_role('5.6', 'payload com tenant_id, client_id e status e aceito', 'true',
  'service_role', null, format($q$
  select public.submit_client_intake(%L,
    ('{"full_name":"Regina Alencar","phone":"(62) 90000-1111",' ||
     '"tenant_id":"%s","client_id":"%s","status":"active","token":"%s"}')::jsonb)::text
$q$, (select tk_b from ids), (select tenant_a from ids), (select client_a1 from ids),
     (select tk_inexistente from ids)));

select pg_temp.val('5.7', 'mas nada disso entrou na linha', 'true|true|submitted|true', format($q$
  select (tenant_id = %L)::text || '|' || (client_id = %L)::text || '|' ||
         status::text || '|' || (token = %L)::text
  from public.client_intakes where id = (select id from public.client_intakes where token = %L)
$q$, (select tenant_b from ids), (select client_b from ids), (select tk_b from ids),
     (select tk_b from ids)));

-- 6. Token de um escritorio nao alcanca dado de outro --------------------------

select pg_temp.val('6.1', 'o envio do escritorio B nao encostou na linha de A', 'Helena Moraes Silva', format($q$
  select full_name from public.client_intakes where token = %L
$q$, (select tk_ok from ids)));

select pg_temp.val('6.2', 'briefing de A apontando para cliente de B e recusado', 'ERR:23503', format($q$
  with i as (insert into public.client_intakes (tenant_id, client_id)
  values (%L, %L) returning 1)
  select 'OK' from i
$q$, (select tenant_a from ids), (select client_b from ids)));

select pg_temp.val('6.3', 'CONTROLE: briefing de A apontando para cliente de A entra', 'OK', format($q$
  with i as (insert into public.client_intakes (tenant_id, client_id)
  values (%L, %L) returning 1)
  select 'OK' from i
$q$, (select tenant_a from ids), (select client_a1 from ids)));

select pg_temp.val('6.4', 'o token nasce do banco, e nao repetido', 'true|true', $q$
  select (count(*) = count(distinct token))::text || '|' ||
         (count(*) filter (where token is null) = 0)::text
  from public.client_intakes
$q$);

-- 7. anon nao alcanca a tabela nem as funcoes ----------------------------------
--
-- O padrao ja afirma D1/D2 (anon nao le e nao grava na tabela). O que e proprio
-- daqui e a porta publica: se anon ganhasse EXECUTE nestas funcoes, qualquer
-- navegador varreria tokens contra /rest/v1/rpc sem nada no meio para barrar, e
-- nenhum caso do padrao acusaria.

select pg_temp.as_role('7.1', 'anon nao le a tabela', 'ERR:42501',
  'anon', null, 'select count(*)::text from public.client_intakes');

select pg_temp.as_role('7.2', 'anon nao grava na tabela', 'ERR:42501',
  'anon', null, format($q$
  with i as (insert into public.client_intakes (tenant_id, client_id)
  values (%L, %L) returning 1)
  select 'OK' from i
$q$, (select tenant_a from ids), (select client_a1 from ids)));

select pg_temp.as_role('7.3', 'anon nao executa open_client_intake', 'ERR:42501',
  'anon', null, format($q$
  select count(*)::text from public.open_client_intake(%L)
$q$, (select tk_second from ids)));

select pg_temp.as_role('7.4', 'anon nao executa submit_client_intake', 'ERR:42501',
  'anon', null, format($q$
  select public.submit_client_intake(%L, '{"full_name":"X","phone":"1"}'::jsonb)::text
$q$, (select tk_second from ids)));

-- Colaborador logado tambem nao passa pela porta publica: ele alcanca a tabela
-- pela RLS, e nao tem por que resolver token.
select pg_temp.as_role('7.5', 'colaborador logado nao executa open_client_intake', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_editor_a from ids), (select tenant_a from ids)),
  format($q$
  select count(*)::text from public.open_client_intake(%L)
$q$, (select tk_second from ids)));

select pg_temp.as_role('7.6', 'CONTROLE: o colaborador logado LE a tabela do proprio escritorio', 'true',
  'authenticated', pg_temp.claims((select u_editor_a from ids), (select tenant_a from ids)),
  format($q$
  select (count(*) > 0)::text from public.client_intakes where tenant_id = %L
$q$, (select tenant_a from ids)));

select pg_temp.as_role('7.7', 'CONTROLE: o colaborador logado NAO le a do outro escritorio', '0',
  'authenticated', pg_temp.claims((select u_editor_a from ids), (select tenant_a from ids)),
  format($q$
  select count(*)::text from public.client_intakes where tenant_id = %L
$q$, (select tenant_b from ids)));

select pg_temp.as_role('7.8', 'CONTROLE: service_role executa a porta publica', '1',
  'service_role', null, format($q$
  select count(*)::text from public.open_client_intake(%L)
$q$, (select tk_inexistente from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
