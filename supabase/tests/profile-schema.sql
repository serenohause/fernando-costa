-- O perfil do proprio usuario: o que ele pode mudar, e o que nao pode.
--
-- O QUE ELE PROVA
--   A razao de `update_own_profile` existir e uma so: RLS decide QUAIS LINHAS e
--   nunca QUAIS COLUNAS. Uma policy de "editar a propria linha" em
--   `collaborators` deixaria qualquer colaborador reescrever `role` e virar
--   Diretor pela API. A funcao nomeia tres colunas; os casos abaixo provam que
--   as outras continuam fora de alcance, e que a porta direta (UPDATE na tabela)
--   segue fechada para quem nao e gestor.
--
--   E prova o recorte das fotos no Storage: cada um escreve DENTRO da propria
--   pasta. Sem isso, trocar a foto de um colega seria um INSERT.
--
-- COMO RODAR
--   npm run test:profile
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenants proprios
--   (slug perfil-*).

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
  '11111111-aaaa-4aaa-8aaa-00000000000a'::uuid as tenant_a,
  '11111111-aaaa-4aaa-8aaa-00000000000b'::uuid as tenant_b,
  '22222222-aaaa-4aaa-8aaa-00000000001a'::uuid as user_arq,
  '22222222-aaaa-4aaa-8aaa-00000000002a'::uuid as user_colega,
  '22222222-aaaa-4aaa-8aaa-00000000003a'::uuid as user_afastado,
  '22222222-aaaa-4aaa-8aaa-00000000001b'::uuid as user_b,
  '33333333-aaaa-4aaa-8aaa-00000000001a'::uuid as col_arq,
  '33333333-aaaa-4aaa-8aaa-00000000002a'::uuid as col_colega,
  '33333333-aaaa-4aaa-8aaa-00000000003a'::uuid as col_afastado,
  '33333333-aaaa-4aaa-8aaa-00000000001b'::uuid as col_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_arq from ids) u, 'perfil-arq@example.test' e
  union all select (select user_colega from ids), 'perfil-colega@example.test'
  union all select (select user_afastado from ids), 'perfil-afastado@example.test'
  union all select (select user_b from ids), 'perfil-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Perfil A', 'perfil-a'),
  ((select tenant_b from ids), 'Perfil B', 'perfil-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_arq from ids), (select tenant_a from ids), (select user_arq from ids),
   'Arquiteta A', 'arq@perfil.test', 'architect', 'projects', 'active'),
  ((select col_colega from ids), (select tenant_a from ids), (select user_colega from ids),
   'Colega A', 'colega@perfil.test', 'architect', 'projects', 'active'),
  ((select col_afastado from ids), (select tenant_a from ids), (select user_afastado from ids),
   'Afastado A', 'afastado@perfil.test', 'architect', 'projects', 'on_leave'),
  ((select col_b from ids), (select tenant_b from ids), (select user_b from ids),
   'Arquiteto B', 'arq@perfil-b.test', 'architect', 'projects', 'active');

-- 1. O que a funcao deixa mudar ------------------------------------------------

select pg_temp.rec('1.1', 'CONTROLE: o proprio nome e telefone sao alterados', 'Ana Arquiteta|(62) 90000-0001',
  pg_temp.como((select user_arq from ids), (select tenant_a from ids),
    $q$select name || '|' || coalesce(phone, '<null>')
         from public.update_own_profile('Ana Arquiteta', '(62) 90000-0001')$q$));

select pg_temp.rec('1.2', 'CONTROLE: e a gravacao ficou na linha certa', 'Ana Arquiteta',
  (select name from public.collaborators where id = (select col_arq from ids)));

select pg_temp.rec('1.3', 'CONTROLE: nenhuma outra linha foi tocada', 'Colega A',
  (select name from public.collaborators where id = (select col_colega from ids)));

/* Nome em branco derruba: a coluna e not blank, e a funcao recusa antes para a
   mensagem falar de nome e nao de constraint. */
select pg_temp.rec('1.4', 'nome em branco e recusado', 'ERR:22023',
  pg_temp.como((select user_arq from ids), (select tenant_a from ids),
    $q$select name from public.update_own_profile('   ')$q$));

/* Telefone vazio VIRA NULO, e nao string vazia: "sem telefone" e um estado, e
   duas representacoes dele fariam a tela e as buscas discordarem. */
select pg_temp.rec('1.5', 'telefone em branco vira nulo', '<null>',
  pg_temp.como((select user_arq from ids), (select tenant_a from ids),
    $q$select coalesce(phone, '<null>') from public.update_own_profile('Ana Arquiteta', '  ')$q$));

-- 2. O que ela NAO deixa mudar -------------------------------------------------

/* O caso central deste arquivo. A funcao nao tem parametro de funcao/status, e a
   porta direta (UPDATE na tabela) e de gestor - policy da 0009. */
select pg_temp.rec('2.1', 'colaborador comum NAO se promove a Diretor pela tabela', 'OK:0',
  pg_temp.exec_como((select user_arq from ids), (select tenant_a from ids),
    $q$update public.collaborators set role = 'director' where id = '33333333-aaaa-4aaa-8aaa-00000000001a'$q$));

select pg_temp.rec('2.2', 'CONTROLE: e a funcao continua sendo architect', 'architect',
  (select role::text from public.collaborators where id = (select col_arq from ids)));

select pg_temp.rec('2.3', 'colaborador comum NAO reativa a si mesmo pela tabela', 'OK:0',
  pg_temp.exec_como((select user_afastado from ids), (select tenant_a from ids),
    $q$update public.collaborators set status = 'active' where id = '33333333-aaaa-4aaa-8aaa-00000000003a'$q$));

/* Quem esta afastado nao edita nem o proprio perfil: auth_collaborator_id()
   devolve nulo para quem nao esta active, e a funcao para ali. */
select pg_temp.rec('2.4', 'colaborador AFASTADO nao edita o proprio perfil', 'ERR:42501',
  pg_temp.como((select user_afastado from ids), (select tenant_a from ids),
    $q$select name from public.update_own_profile('Tentativa')$q$));

/* Nao ha como pedir "edite a linha de fulano": a funcao nao recebe id nenhum, e
   e sempre a linha do JWT. Este caso guarda essa ausencia. */
select pg_temp.rec('2.5', 'CONTROLE: editar como o colega mexe na linha DELE, nunca na de A', 'Colega Novo|Ana Arquiteta',
  (select pg_temp.como((select user_colega from ids), (select tenant_a from ids),
     $q$select name from public.update_own_profile('Colega Novo')$q$)
   || '|' || (select name from public.collaborators where id = (select col_arq from ids))));

select pg_temp.rec('2.6', 'usuario sem colaborador nao edita perfil nenhum', 'ERR:42501',
  pg_temp.como((select user_b from ids), (select tenant_a from ids),
    $q$select name from public.update_own_profile('Invasor')$q$));

-- 3. A foto no Storage ----------------------------------------------------------
--
--    O caminho e <tenant_id>/<collaborator_id>/<uuid>.<ext>, e as policies
--    conferem os DOIS primeiros segmentos.

select pg_temp.rec('3.1', 'CONTROLE: envia foto na PROPRIA pasta', 'OK:1',
  pg_temp.exec_como((select user_arq from ids), (select tenant_a from ids), format($q$
    insert into storage.objects (bucket_id, name, owner)
    values ('avatars', %L, %L)
  $q$,
  (select tenant_a from ids)::text || '/' || (select col_arq from ids)::text || '/44444444-aaaa-4aaa-8aaa-000000000001.jpg',
  (select user_arq from ids))));

/* Trocar a foto de um colega seria um INSERT dentro da pasta dele. */
select pg_temp.rec('3.2', 'NAO envia foto na pasta de um colega', 'ERR:42501',
  pg_temp.exec_como((select user_arq from ids), (select tenant_a from ids), format($q$
    insert into storage.objects (bucket_id, name, owner)
    values ('avatars', %L, %L)
  $q$,
  (select tenant_a from ids)::text || '/' || (select col_colega from ids)::text || '/44444444-aaaa-4aaa-8aaa-000000000002.jpg',
  (select user_arq from ids))));

select pg_temp.rec('3.3', 'NAO envia foto na pasta de OUTRO escritorio', 'ERR:42501',
  pg_temp.exec_como((select user_arq from ids), (select tenant_a from ids), format($q$
    insert into storage.objects (bucket_id, name, owner)
    values ('avatars', %L, %L)
  $q$,
  (select tenant_b from ids)::text || '/' || (select col_b from ids)::text || '/44444444-aaaa-4aaa-8aaa-000000000003.jpg',
  (select user_arq from ids))));

select pg_temp.rec('3.4', 'CONTROLE: colega LE a foto do escritorio', '1',
  pg_temp.como((select user_colega from ids), (select tenant_a from ids),
    $q$select count(*)::text from storage.objects where bucket_id = 'avatars'$q$));

select pg_temp.rec('3.5', 'escritorio B nao ve a foto de A', '0',
  pg_temp.como((select user_b from ids), (select tenant_b from ids),
    $q$select count(*)::text from storage.objects where bucket_id = 'avatars'$q$));

/*
  APAGAR NAO E TESTAVEL POR SQL, e a limitacao e do Supabase: a plataforma tem
  um gatilho que recusa DELETE direto em storage.objects com "Direct deletion
  from storage tables is not allowed. Use the Storage API instead." Ou seja, a
  primeira versao destes dois casos falhava por um motivo que nao tinha nada a
  ver com a policy — e passaria a "provar" a policy no dia em que a plataforma
  soltasse o gatilho.

  O que da para afirmar aqui e a FORMA da policy: que ela existe e que compara
  os dois segmentos do caminho. Quem exercita o caminho real e a tela, e o que
  ela usa e a Storage API. Fica declarado que este par nao e prova de
  comportamento.
*/
select pg_temp.rec('3.6', 'a policy de apagar existe e confere o ESCRITORIO', 'true',
  (select (qual like '%auth_tenant_id%')::text
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_delete_own'));

select pg_temp.rec('3.7', 'e confere o PROPRIO colaborador (segundo segmento)', 'true',
  (select (qual like '%auth_collaborator_id%')::text
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_delete_own'));

-- 4. O formato do caminho gravado no cadastro ----------------------------------

select pg_temp.rec('4.1', 'CONTROLE: caminho no formato esperado entra', 'OK',
  pg_temp.como((select user_arq from ids), (select tenant_a from ids), format($q$
    select 'OK' from public.update_own_profile('Ana Arquiteta', null, %L)
  $q$, (select tenant_a from ids)::text || '/' || (select col_arq from ids)::text || '/44444444-aaaa-4aaa-8aaa-000000000004.png')));

/* URL no lugar do caminho e o erro que o check existe para pegar: bucket privado
   nao serve URL publica, e guardar uma seria guardar mentira. */
select pg_temp.rec('4.2', 'URL no lugar do caminho e recusada', 'ERR:23514',
  pg_temp.como((select user_arq from ids), (select tenant_a from ids),
    $q$select 'OK' from public.update_own_profile('Ana', null, 'https://exemplo.test/foto.png')$q$));

select pg_temp.rec('4.3', 'extensao nao suportada e recusada', 'ERR:23514',
  pg_temp.como((select user_arq from ids), (select tenant_a from ids), format($q$
    select 'OK' from public.update_own_profile('Ana', null, %L)
  $q$, (select tenant_a from ids)::text || '/' || (select col_arq from ids)::text || '/44444444-aaaa-4aaa-8aaa-000000000005.svg')));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
