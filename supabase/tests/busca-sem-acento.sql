-- Buscar cliente sem depender do acento (migration 0105).
--
-- O QUE ELE PROVA
--   1. `clients.search_plain` e `client_people.name_plain` existem, sao geradas
--      e armazenadas, e acompanham a edicao do nome.
--   2. "Junior" acha "Júnior" e vice-versa — o caso real que originou a
--      migration (duas empresas cadastradas, uma com acento e outra sem).
--   3. A coluna antiga `search_text` continua como era: quem depende dela nao
--      muda de comportamento.
--   4. O termo tem de chegar SEM acento. A tela tira o acento antes de montar o
--      `ilike` (src/lib/text.ts); se um dia parar de tirar, o caso 2.4 falha.
--   5. O embrulho `unaccent_imm` e IMMUTABLE, invoker e com search_path fixo —
--      requisitos de coluna gerada e de funcao exposta no schema public.
--   6. A busca continua dentro do escritorio: o vizinho nao acha nada.
--
-- COMO RODAR
--   npm run test:acento
--
-- RESIDUO
--   Nenhum. Transacao terminada em ROLLBACK (slug acento-*).

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

create or replace function pg_temp.valor_as(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '(nulo)');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'acce0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'acce0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'acce0000-0000-4000-8000-00000000001a'::uuid as user_a,
  'acce0000-0000-4000-8000-00000000001b'::uuid as user_b,
  'acce0000-0000-4000-8000-00000000003a'::uuid as col_a,
  'acce0000-0000-4000-8000-00000000003b'::uuid as col_b,
  'acce0000-0000-4000-8000-0000000000c1'::uuid as com_acento,
  'acce0000-0000-4000-8000-0000000000c2'::uuid as sem_acento,
  'acce0000-0000-4000-8000-0000000000c3'::uuid as cidade;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_a from ids) u, 'acento-a@example.test' e
  union all select (select user_b from ids), 'acento-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Acento A', 'acento-a'),
  ((select tenant_b from ids), 'Acento B', 'acento-b');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_a from ids), (select tenant_a from ids), (select user_a from ids),
   'Diretora A', 'director', 'acento-a@example.test', 'active'),
  ((select col_b from ids), (select tenant_b from ids), (select user_b from ids),
   'Diretora B', 'director', 'acento-b@example.test', 'active');

/* O caso real: as duas empresas existem, e quem digita uma nunca viu a outra. */
insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select com_acento from ids), (select tenant_a from ids), 'Júnior Sintonia Ltda', '(85) 90000-1111', 'Fortaleza', 'CE'),
  ((select sem_acento from ids), (select tenant_a from ids), 'Junior Sintonia ME', '(85) 90000-2222', 'Fortaleza', 'CE'),
  ((select cidade from ids), (select tenant_a from ids), 'Maria da Conceição', '(85) 90000-3333', 'Brasília', 'DF');

insert into public.client_people (tenant_id, client_id, name, relationship) values
  ((select tenant_a from ids), (select com_acento from ids), 'Nicolle Conceição', 'spouse');

-- 1. A COLUNA EXISTE E E GERADA ---------------------------------------------------

select pg_temp.rec('1.1', 'clients.search_plain e coluna gerada e armazenada', 's',
  (select attgenerated::text from pg_attribute
    where attrelid = 'public.clients'::regclass and attname = 'search_plain'));

select pg_temp.rec('1.2', 'client_people.name_plain e coluna gerada e armazenada', 's',
  (select attgenerated::text from pg_attribute
    where attrelid = 'public.client_people'::regclass and attname = 'name_plain'));

select pg_temp.rec('1.3', 'indice trigrama em clients.search_plain', 'true',
  (select exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.clients'::regclass
      and pg_get_indexdef(i.indexrelid) like '%search_plain%'
      and pg_get_indexdef(i.indexrelid) like '%gin_trgm_ops%'))::text);

select pg_temp.rec('1.4', 'indice trigrama em client_people.name_plain', 'true',
  (select exists (select 1 from pg_index i
    where i.indrelid = 'public.client_people'::regclass
      and pg_get_indexdef(i.indexrelid) like '%name_plain%'
      and pg_get_indexdef(i.indexrelid) like '%gin_trgm_ops%'))::text);

-- 2. O CASO REAL -------------------------------------------------------------------

select pg_temp.rec('2.1', '"junior" acha as DUAS empresas, com e sem acento', '2',
  (select count(*)::text from public.clients
    where tenant_id = (select tenant_a from ids) and search_plain ilike '%junior%'));

select pg_temp.rec('2.2', 'CONTROLE: a coluna antiga achava so uma', '1',
  (select count(*)::text from public.clients
    where tenant_id = (select tenant_a from ids) and search_text ilike '%junior%'));

select pg_temp.rec('2.3', 'cidade tambem perde o acento ("brasilia" acha "Brasília")', '1',
  (select count(*)::text from public.clients
    where tenant_id = (select tenant_a from ids) and search_plain ilike '%brasilia%'));

/* A tela tira o acento do termo ANTES de montar o ilike. Este caso guarda o
   outro lado do contrato: um termo acentuado nao casa com a coluna sem acento.
   Se a tela parar de tirar, a busca volta a nao achar — e aqui o numero muda. */
select pg_temp.rec('2.4', 'termo COM acento nao casa com a coluna sem acento', '0',
  (select count(*)::text from public.clients
    where tenant_id = (select tenant_a from ids) and search_plain ilike '%júnior%'));

select pg_temp.rec('2.5', 'pessoa vinculada achada sem acento', 'Nicolle Conceição',
  (select name from public.client_people
    where tenant_id = (select tenant_a from ids) and name_plain ilike '%conceicao%'));

-- 3. A COLUNA ACOMPANHA A EDICAO ----------------------------------------------------

update public.clients set name = 'Antônio Modificado'
  where id = (select sem_acento from ids);

select pg_temp.rec('3.1', 'renomear o cliente atualiza search_plain', 'true',
  (select (search_plain like 'antonio modificado%')::text from public.clients
    where id = (select sem_acento from ids)));

select pg_temp.rec('3.2', 'e o nome antigo deixa de ser achado', '1',
  (select count(*)::text from public.clients
    where tenant_id = (select tenant_a from ids) and search_plain ilike '%junior%'));

-- 4. O EMBRULHO DO UNACCENT ----------------------------------------------------------

select pg_temp.rec('4.1', 'unaccent_imm e IMMUTABLE (exigencia de coluna gerada)', 'i',
  (select provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unaccent_imm'));

select pg_temp.rec('4.2', 'unaccent_imm NAO e security definer', 'false',
  (select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unaccent_imm'));

select pg_temp.rec('4.3', 'unaccent_imm tem search_path fixo', 'true',
  (select exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unaccent_imm'));

-- 5. A BUSCA CONTINUA DENTRO DO ESCRITORIO --------------------------------------------

select pg_temp.rec('5.1', 'quem e do escritorio acha pela coluna nova', '1',
  pg_temp.valor_as((select user_a from ids), (select tenant_a from ids),
    'select count(*) from public.clients where search_plain ilike ''%conceicao%'''));

select pg_temp.rec('5.2', 'escritorio vizinho nao acha nada com a coluna nova', '0',
  pg_temp.valor_as((select user_b from ids), (select tenant_b from ids),
    'select count(*) from public.clients where search_plain ilike ''%conceicao%'''));

select pg_temp.rec('5.3', 'vizinho tambem nao acha a pessoa vinculada', '0',
  pg_temp.valor_as((select user_b from ids), (select tenant_b from ids),
    'select count(*) from public.client_people where name_plain ilike ''%conceicao%'''));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
