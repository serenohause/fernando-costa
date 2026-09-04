-- A busca global devolve o que a pessoa veria na tela, e nada além.
--
-- O QUE ELE PROVA
--   `search_platform` é `security invoker`: cada SELECT dentro dela passa pela
--   RLS da própria tabela. É uma decisão fácil de desfazer sem querer — um
--   `security definer` acrescentado "para funcionar melhor" transformaria a
--   busca na porta dos fundos de todo o sistema de permissões, e o sintoma
--   seria bom: a busca acharia MAIS coisas.
--
--   Por isso os casos aqui são quase todos negativos, com controle positivo ao
--   lado: o escritório vizinho não aparece, e quem não tem o menu Atividades
--   não acha atividade dos outros — do mesmo jeito que não acha na tela.
--
-- COMO RODAR
--   npm run test:search
--
-- RESIDUO
--   Nenhum. Uma transação terminada em ROLLBACK, com tenants próprios
--   (slug busca-*).

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

/* Roda a busca COMO o usuário indicado e devolve um resumo em texto. */
create or replace function pg_temp.busca(p_sub uuid, p_tenant uuid, p_termo text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    select coalesce(string_agg(tipo || ':' || titulo, ' | ' order by ordem, titulo), '(nada)')
      into v from public.search_platform(p_termo);
    perform set_config('role', 'postgres', true);
    return v;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.conta(p_sub uuid, p_tenant uuid, p_termo text, p_tipo text)
returns text language plpgsql as $$
declare v int; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    select count(*) into v from public.search_platform(p_termo) where tipo = p_tipo;
    perform set_config('role', 'postgres', true);
    return v::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

-- Fixtures: dois escritórios com dados de nome parecido -----------------------

create temp table ids on commit drop as select
  'bbbb0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'bbbb0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'bbbb0000-0000-4000-8000-00000000001a'::uuid as user_dir_a,
  'bbbb0000-0000-4000-8000-00000000002a'::uuid as user_arq_a,
  'bbbb0000-0000-4000-8000-00000000001b'::uuid as user_dir_b,
  'bbbb0000-0000-4000-8000-00000000003a'::uuid as col_dir_a,
  'bbbb0000-0000-4000-8000-00000000004a'::uuid as col_arq_a,
  'bbbb0000-0000-4000-8000-00000000003b'::uuid as col_dir_b,
  'bbbb0000-0000-4000-8000-00000000005a'::uuid as cliente_a,
  'bbbb0000-0000-4000-8000-00000000005b'::uuid as cliente_b,
  'bbbb0000-0000-4000-8000-00000000006a'::uuid as projeto_a,
  'bbbb0000-0000-4000-8000-00000000007a'::uuid as atividade_a;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_dir_a from ids) u, 'busca-dir-a@example.test' e
  union all select (select user_arq_a from ids), 'busca-arq-a@example.test'
  union all select (select user_dir_b from ids), 'busca-dir-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Busca A', 'busca-a'),
  ((select tenant_b from ids), 'Busca B', 'busca-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_dir_a from ids), (select tenant_a from ids), (select user_dir_a from ids),
   'Diretora A', 'dir@busca-a.test', 'director', 'administrative', 'active'),
  /* Arquiteto SEM permissão em `activities`: é ele que prova que a busca
     respeita o recorte daquele módulo. */
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq@busca-a.test', 'architect', 'projects', 'active'),
  ((select col_dir_b from ids), (select tenant_b from ids), (select user_dir_b from ids),
   'Diretor B', 'dir@busca-b.test', 'director', 'administrative', 'active');

/* O Arquiteto precisa dos menus de leitura para o CONTROLE positivo existir —
   sem eles, "não achou" seria verdade pelo motivo errado. `activities` fica de
   fora de propósito. */
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_arq_a from ids), 'crm', true, false),
  ((select tenant_a from ids), (select col_arq_a from ids), 'projects', true, false);

/* O MESMO NOME NOS DOIS ESCRITÓRIOS: é isso que torna o caso de isolamento
   verdadeiro. Se cada um tivesse nome diferente, "não achou o do vizinho"
   passaria mesmo com a RLS desligada. */
insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cliente_a from ids), (select tenant_a from ids), 'Marambaia Engenharia',
   '(62) 90000-1111', 'Goiania', 'GO'),
  ((select cliente_b from ids), (select tenant_b from ids), 'Marambaia Engenharia',
   '(11) 90000-2222', 'Sao Paulo', 'SP');

insert into public.projects (id, tenant_id, name, client_id, project_type, status) values
  ((select projeto_a from ids), (select tenant_a from ids), 'Marambaia Residencial',
   (select cliente_a from ids), 'architecture', 'in_development');

insert into public.activities (id, tenant_id, collaborator_id, description, start_date, end_date, status) values
  ((select atividade_a from ids), (select tenant_a from ids), (select col_dir_a from ids),
   'Marambaia: revisar planta', current_date, current_date, 'not_started');

-- 1. Acha o que existe ---------------------------------------------------------

select pg_temp.rec('1.1', 'CONTROLE: a Diretora acha cliente, projeto e atividade', 'true',
  (pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), 'marambaia')
     like '%cliente:Marambaia Engenharia%')::text);

select pg_temp.rec('1.2', 'CONTROLE: e o projeto aparece junto', 'true',
  (pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), 'marambaia')
     like '%projeto:Marambaia Residencial%')::text);

/* Nome INCOMPLETO e no meio da palavra — é o gesto de quem busca. */
select pg_temp.rec('1.3', 'pedaço do nome no MEIO da palavra acha', 'true',
  (pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), 'ramba')
     like '%cliente:Marambaia Engenharia%')::text);

select pg_temp.rec('1.4', 'a busca ignora maiúsculas', 'true',
  (pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), 'MARAMBAIA')
     like '%cliente:%')::text);

select pg_temp.rec('1.5', 'termo que não existe devolve nada', '(nada)',
  pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), 'zzzznaoexiste'));

-- 2. O ISOLAMENTO, que é a razão de a função ser security invoker ---------------

select pg_temp.rec('2.1', 'a Diretora de A NÃO acha o cliente homônimo de B', '1',
  pg_temp.conta((select user_dir_a from ids), (select tenant_a from ids), 'marambaia', 'cliente'));

select pg_temp.rec('2.2', 'CONTROLE: o Diretor de B acha o DELE', 'true',
  (pg_temp.busca((select user_dir_b from ids), (select tenant_b from ids), 'marambaia')
     like '%cliente:Marambaia Engenharia%')::text);

select pg_temp.rec('2.3', 'e o de B não vê o projeto de A', '0',
  pg_temp.conta((select user_dir_b from ids), (select tenant_b from ids), 'marambaia', 'projeto'));

-- 3. A busca respeita a permissão de MENU, não só o escritório ------------------

/* `activities_select_own_or_activities_viewer` (0059) só devolve atividade dos
   outros a quem tem o menu. A atividade da fixture é da Diretora; o Arquiteto
   não deve achá-la. */
select pg_temp.rec('3.1', 'Arquiteto sem o menu Atividades NÃO acha a atividade alheia', '0',
  pg_temp.conta((select user_arq_a from ids), (select tenant_a from ids), 'marambaia', 'atividade'));

select pg_temp.rec('3.2', 'CONTROLE: e a Diretora acha', '1',
  pg_temp.conta((select user_dir_a from ids), (select tenant_a from ids), 'marambaia', 'atividade'));

/* CONTROLE do controle: o Arquiteto acha o que ele PODE ver. Sem este caso,
   o 3.1 passaria mesmo se a busca estivesse quebrada para ele. */
select pg_temp.rec('3.3', 'CONTROLE: o mesmo Arquiteto acha cliente e projeto', 'true',
  (pg_temp.busca((select user_arq_a from ids), (select tenant_a from ids), 'marambaia')
     like '%projeto:Marambaia Residencial%')::text);

-- 4. O termo é texto, não instrução --------------------------------------------

/* `%` sozinho casaria com tudo se não fosse escapado — a busca devolveria o
   escritório inteiro para quem digitasse um caractere. */
select pg_temp.rec('4.1', 'curinga digitado NÃO lista tudo', '(nada)',
  pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), '%'));

select pg_temp.rec('4.2', 'sublinhado também é literal', '(nada)',
  pg_temp.busca((select user_dir_a from ids), (select tenant_a from ids), '_arambaia'));

-- 5. Quem pode chamar -----------------------------------------------------------

select pg_temp.rec('5.1', 'anon NÃO executa a busca', 'false',
  has_function_privilege('anon', 'public.search_platform(text)', 'execute')::text);

select pg_temp.rec('5.2', 'CONTROLE: authenticated executa', 'true',
  has_function_privilege('authenticated', 'public.search_platform(text)', 'execute')::text);

/* A função NÃO pode ser security definer: seria a porta dos fundos das
   permissões, e o sintoma seria "a busca acha mais coisas". */
select pg_temp.rec('5.3', 'a função é security INVOKER', 'false',
  (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_platform'));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
