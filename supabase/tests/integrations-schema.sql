-- A integracao com o Google Agenda: segredo, chave de automacao e `state`.
--
-- O QUE ELE PROVA
--   As tres coisas que, se estiverem erradas, ninguem descobre pela tela:
--
--   1. o refresh_token NAO esta na tabela — esta no Vault, e o unico caminho
--      ate ele e uma funcao sem EXECUTE para authenticated;
--   2. a chave de automacao e guardada como hash, resolve o escritorio certo,
--      para de resolver quando revogada, e nao vaza atraves da tabela;
--   3. o `state` do OAuth e consumido UMA vez e respeita a validade — e o que
--      impede um terceiro de ligar a conta Google dele ao escritorio.
--
--   Cada negativa tem controle positivo ao lado: sem isso, uma negativa que
--   passa por outro motivo (a linha nem existia, a funcao nem foi chamada)
--   pareceria acerto.
--
-- COMO RODAR
--   npm run test:integrations
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenants proprios
--   (slug integ-*). O segredo criado no Vault e apagado pela propria
--   funcao de desconexao no caso 1.6, e o resto cai no rollback.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))
$$;

/* Roda um comando como POSTGRES (sem trocar de papel), devolvendo OK ou o
   sqlstate da recusa. Serve para as funcoes que so service_role executa. */
create or replace function pg_temp.chk(p_sql text)
returns text language plpgsql as $$
declare st text;
begin
  begin
    execute p_sql;
    return 'OK';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    return 'ERR:' || st;
  end;
end; $$;

/* Roda uma consulta escalar COMO o usuario indicado, devolvendo o valor ou o
   sqlstate da recusa. */
create or replace function pg_temp.como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

/* Executa um comando (sem retorno) como o usuario, devolvendo OK:<linhas> ou
   ERR:<sqlstate>. */
create or replace function pg_temp.exec_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return 'OK:' || n;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'ffffffff-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'ffffffff-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'ffffffff-0000-4000-8000-00000000001a'::uuid as user_dir_a,
  'ffffffff-0000-4000-8000-00000000002a'::uuid as user_arq_a,
  'ffffffff-0000-4000-8000-00000000001b'::uuid as user_dir_b,
  'ffffffff-0000-4000-8000-00000000003a'::uuid as col_dir_a,
  'ffffffff-0000-4000-8000-00000000004a'::uuid as col_arq_a,
  'ffffffff-0000-4000-8000-00000000003b'::uuid as col_dir_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_dir_a from ids) u, 'integ-dir-a@example.test' e
  union all select (select user_arq_a from ids), 'integ-arq-a@example.test'
  union all select (select user_dir_b from ids), 'integ-dir-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Integ A', 'integ-a'),
  ((select tenant_b from ids), 'Integ B', 'integ-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_dir_a from ids), (select tenant_a from ids), (select user_dir_a from ids),
   'Diretora A', 'dir-a@integ.test', 'director', 'administrative', 'active'),
  /* Arquiteto SEM permissao em `settings`: e ele que prova o recorte de leitura
     mais estreito deste modulo. */
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq-a@integ.test', 'architect', 'projects', 'active'),
  ((select col_dir_b from ids), (select tenant_b from ids), (select user_dir_b from ids),
   'Diretor B', 'dir-b@integ.test', 'director', 'administrative', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_arq_a from ids), 'pipeline', true, true);

-- 1. A conexao e o segredo -----------------------------------------------------

select pg_temp.rec('1.1', 'CONTROLE: escritorio nasce sem conexao', '0',
  (select count(*)::text from public.google_calendar_connections
    where tenant_id = (select tenant_a from ids)));

/* Token vazio e recusado: conexao sem refresh_token autentica por uma hora e
   morre calada depois. */
select pg_temp.rec('1.2', 'conectar sem refresh_token e recusado', 'ERR:22023',
  pg_temp.chk(format($q$
     select public.google_calendar_connect(%L, %L, 'x@y.test', '', 'escopo')
   $q$, (select tenant_a from ids), (select col_dir_a from ids))));

select pg_temp.rec('1.3', 'CONTROLE: conectar com token grava a linha', '1',
  (select count(*)::text from (
     select public.google_calendar_connect(
       (select tenant_a from ids), (select col_dir_a from ids),
       'diretora@integ.test', 'refresh-token-secreto-A', 'openid email calendar.readonly')
   ) s));

/* O SEGREDO NAO ESTA NA TABELA. A coluna guarda um ponteiro para o Vault, e o
   teste le a tabela INTEIRA como texto para nao depender de saber o nome da
   coluna certa — se o token aparecer em qualquer campo, este caso acusa. */
select pg_temp.rec('1.4', 'o refresh_token NAO aparece em nenhuma coluna da tabela', 'false',
  (select bool_or(c::text like '%refresh-token-secreto-A%')::text
     from public.google_calendar_connections c
    where c.tenant_id = (select tenant_a from ids)));

select pg_temp.rec('1.5', 'CONTROLE: a funcao do Vault devolve o token gravado', 'refresh-token-secreto-A',
  (select public.google_calendar_refresh_token((select tenant_a from ids))));

/* Reconectar a MESMA conta preserva a agenda escolhida: renovar consentimento
   nao pode devolver o disparo diario para a agenda pessoal. */
update public.google_calendar_connections
set calendar_id = 'agenda-escritorio', calendar_label = 'Escritorio'
where tenant_id = (select tenant_a from ids);

select pg_temp.rec('1.6', 'CONTROLE: agenda escolhida antes da reconexao', 'agenda-escritorio',
  (select calendar_id from public.google_calendar_connections
    where tenant_id = (select tenant_a from ids)));

/* A CHAMADA E A LEITURA EM COMANDOS SEPARADOS, e nao num SELECT so: dentro de
   um unico comando, a leitura da tabela usa o snapshot do inicio dele e nao
   enxerga o que a funcao acabou de gravar. A primeira versao deste arquivo lia
   junto, e o caso 1.9 falhava mostrando o valor anterior. */
select public.google_calendar_connect(
  (select tenant_a from ids), (select col_dir_a from ids),
  'diretora@integ.test', 'refresh-token-secreto-A2', 'openid email calendar.readonly');

select pg_temp.rec('1.7', 'reconectar a MESMA conta preserva a agenda escolhida', 'agenda-escritorio',
  (select calendar_id from public.google_calendar_connections
    where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('1.8', 'CONTROLE: e o token novo substituiu o antigo no Vault', 'refresh-token-secreto-A2',
  (select public.google_calendar_refresh_token((select tenant_a from ids))));

/* Conta DIFERENTE reinicia a escolha: a agenda antiga pertencia a outra conta e
   pode nem existir na nova. */
select public.google_calendar_connect(
  (select tenant_a from ids), (select col_dir_a from ids),
  'outra@integ.test', 'refresh-token-secreto-A3', 'openid email calendar.readonly');

select pg_temp.rec('1.9', 'reconectar com OUTRA conta volta para a agenda principal', 'primary',
  (select calendar_id from public.google_calendar_connections
    where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('1.10', 'desconectar apaga a linha', 'true',
  (select public.google_calendar_disconnect((select tenant_a from ids))::text));

/* O SEGREDO VAI JUNTO: apagar so a linha deixaria um refresh_token vivo no
   Vault, sem dono e sem nada que o mencione. */
select pg_temp.rec('1.11', 'e o segredo sai do Vault junto com a linha', '0',
  (select count(*)::text from vault.secrets s
    where s.name = 'google_calendar_refresh_token:' || (select tenant_a from ids)::text));

select pg_temp.rec('1.12', 'CONTROLE: desconectar de novo devolve false', 'false',
  (select public.google_calendar_disconnect((select tenant_a from ids))::text));

-- 2. Quem le a conexao ---------------------------------------------------------

select public.google_calendar_connect(
  (select tenant_a from ids), (select col_dir_a from ids),
  'diretora@integ.test', 'refresh-token-secreto-A', 'openid email calendar.readonly');

select pg_temp.rec('2.1', 'CONTROLE: Diretora do escritorio A ve a conexao', '1',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    'select count(*)::text from public.google_calendar_connections'));

/* Recorte mais estreito que o do resto do sistema, e de proposito: a linha diz
   qual conta Google do diretor esta ligada. */
select pg_temp.rec('2.2', 'Arquiteto SEM permissao em settings nao ve a conexao', '0',
  pg_temp.como((select user_arq_a from ids), (select tenant_a from ids),
    'select count(*)::text from public.google_calendar_connections'));

select pg_temp.rec('2.3', 'Diretor do escritorio B nao ve a conexao de A', '0',
  pg_temp.como((select user_dir_b from ids), (select tenant_b from ids),
    'select count(*)::text from public.google_calendar_connections'));

/* A funcao que abre o Vault nao tem EXECUTE para authenticated. Se um dia
   alguem der esse grant, este caso acusa. */
select pg_temp.rec('2.4', 'authenticated NAO executa a funcao que le o segredo', 'ERR:42501',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    format('select public.google_calendar_refresh_token(%L)', (select tenant_a from ids))));

/* GRANT DE COLUNA: a policy permite o UPDATE, mas o grant so alcanca
   calendar_id e calendar_label. Sem isso, a tela poderia trocar o ponteiro do
   segredo. */
select pg_temp.rec('2.5', 'CONTROLE: a Diretora troca a agenda lida', 'OK:1',
  pg_temp.exec_como((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.google_calendar_connections set calendar_id = 'outra-agenda'$q$));

select pg_temp.rec('2.6', 'e NAO troca o ponteiro do segredo', 'ERR:42501',
  pg_temp.exec_como((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.google_calendar_connections set refresh_token_secret_id = gen_random_uuid()$q$));

select pg_temp.rec('2.7', 'ninguem apaga a conexao pela tela', 'ERR:42501',
  pg_temp.exec_como((select user_dir_a from ids), (select tenant_a from ids),
    'delete from public.google_calendar_connections'));

-- 3. A chave da automacao ------------------------------------------------------

create temp table chave on commit drop as
select * from public.create_integration_api_key('n8n - agenda diaria');

select pg_temp.rec('3.1', 'CONTROLE: a chave criada volta em texto, uma vez', 'true',
  (select (api_key like 'fc\_int\_%')::text from chave));

/* A chave em texto nao esta em lugar nenhum da tabela: o que existe la e o
   SHA-256 dela. */
select pg_temp.rec('3.2', 'a chave em texto NAO esta na tabela', 'false',
  (select bool_or(k::text like '%' || (select api_key from chave) || '%')::text
     from public.integration_api_keys k));

select pg_temp.rec('3.3', 'CONTROLE: a chave resolve o escritorio dono', 'true',
  (select (public.resolve_integration_api_key((select api_key from chave), 'calendar_agenda')
           = (select tenant_a from ids))::text));

select pg_temp.rec('3.4', 'chave inventada nao resolve escritorio nenhum', '<null>',
  coalesce(public.resolve_integration_api_key('fc_int_naoexiste', 'calendar_agenda')::text, '<null>'));

select pg_temp.rec('3.5', 'CONTROLE: o uso foi carimbado', 'false',
  (select (last_used_at is null)::text from public.integration_api_keys
    where id = (select id from chave)));

select pg_temp.rec('3.6', 'revogar devolve true', 'true',
  (select public.revoke_integration_api_key((select id from chave))::text));

select pg_temp.rec('3.7', 'chave revogada NAO resolve mais', '<null>',
  coalesce(public.resolve_integration_api_key((select api_key from chave), 'calendar_agenda')::text, '<null>'));

select pg_temp.rec('3.8', 'CONTROLE: e a linha continua la, carimbada', 'false',
  (select (revoked_at is null)::text from public.integration_api_keys
    where id = (select id from chave)));

select pg_temp.rec('3.9', 'revogar de novo devolve false', 'false',
  (select public.revoke_integration_api_key((select id from chave))::text));

/* Quem gera chave e quem edita Configuracoes. O Arquiteto tem can_edit em
   `pipeline` e nao em `settings` — e o menu certo que decide. */
select pg_temp.rec('3.10', 'Arquiteto sem settings NAO gera chave', 'ERR:42501',
  pg_temp.como((select user_arq_a from ids), (select tenant_a from ids),
    $q$select api_key from public.create_integration_api_key('tentativa')$q$));

select pg_temp.rec('3.11', 'CONTROLE: a Diretora gera chave', 'true',
  (select (pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    $q$select api_key from public.create_integration_api_key('da diretora')$q$) like 'fc\_int\_%')::text));

/* A funcao que traduz a chave e chamada pela Edge Function, como service_role.
   authenticated nao pode chama-la: seria um oraculo para testar chaves. */
select pg_temp.rec('3.12', 'authenticated NAO executa a funcao que resolve chave', 'ERR:42501',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    $q$select public.resolve_integration_api_key('fc_int_x', 'calendar_agenda')::text$q$));

select pg_temp.rec('3.13', 'Diretor de B nao ve as chaves de A', '0',
  pg_temp.como((select user_dir_b from ids), (select tenant_b from ids),
    'select count(*)::text from public.integration_api_keys'));

-- 4. O `state` do OAuth --------------------------------------------------------

create temp table st1 on commit drop as
select public.google_oauth_state_issue((select user_dir_a from ids), repeat('a', 64)) as tenant_id;

select pg_temp.rec('4.1', 'CONTROLE: emitir o state devolve o escritorio', 'true',
  (select (tenant_id = (select tenant_a from ids))::text from st1));

select pg_temp.rec('4.2', 'CONTROLE: o state e consumido e devolve quem o abriu', 'true',
  (select (collaborator_id = (select col_dir_a from ids))::text
     from public.google_oauth_state_consume(repeat('a', 64))));

/* UMA VEZ SO. Sem isto, um state interceptado valeria para sempre. */
select pg_temp.rec('4.3', 'o MESMO state nao e consumido duas vezes', '0',
  (select count(*)::text from public.google_oauth_state_consume(repeat('a', 64))));

select pg_temp.rec('4.4', 'state desconhecido nao consome nada', '0',
  (select count(*)::text from public.google_oauth_state_consume(repeat('b', 64))));

/* Vencido, mas COERENTE: `expires_at > created_at` e check da tabela, e um
   state que expira antes de existir seria dado corrompido, nao state velho.
   Este aqui nasceu ha 20 minutos e venceu ha 10. */
insert into public.google_oauth_states (state_hash, tenant_id, collaborator_id, created_at, expires_at)
values (repeat('c', 64), (select tenant_a from ids), (select col_dir_a from ids),
        now() - interval '20 minutes', now() - interval '10 minutes');

select pg_temp.rec('4.5', 'state VENCIDO nao e consumido', '0',
  (select count(*)::text from public.google_oauth_state_consume(repeat('c', 64))));

/* Quem nao edita Configuracoes nao abre consentimento — senao qualquer
   colaborador poderia comecar a ligar uma conta Google ao escritorio. */
select pg_temp.rec('4.6', 'Arquiteto sem settings NAO abre consentimento', 'ERR:42501',
  pg_temp.chk(format($q$
     select public.google_oauth_state_issue(%L, %L)
   $q$, (select user_arq_a from ids), repeat('d', 64))));

/* 42501, e nao "zero linhas": a tabela nao tem RLS permissiva nem GRANT — o
   comando nem chega a ser tentado. Duas barreiras, e esta e a de fora. */
select pg_temp.rec('4.7', 'a tabela de states nao e alcancavel pela tela', 'ERR:42501',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    'select count(*)::text from public.google_oauth_states'));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
