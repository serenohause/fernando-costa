-- Teste do modulo 9 (Mapa) - o que e especifico de map_properties, das duas
-- tabelas de tag e das oito colunas site_* que a 0057 acrescentou a projects.
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio de tabela, quatro
--   policies, WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios nos dois sentidos, colaborador
--   afastado sem leitura, escrita presa ao menu) estao em
--   supabase/tests/pattern-invariants.sql e cobrem as tres tabelas desde que elas
--   entraram em pattern_tables. NADA disso se repete aqui.
--
--   Este modulo tem UMA chave de menu para as tres tabelas ('map'), entao ele nao
--   precisa da secao que budget-schema.sql e financial-schema.sql escreveram para
--   distinguir duas chaves dentro do mesmo modulo. O par E1/E3 da suite de padrao
--   ja faz esse trabalho.
--
--   O que a secao 7 exercita e OUTRA coisa, e nenhuma suite alcanca: 'map' e
--   'projects' sao menus de MODULOS diferentes que governam os DOIS lugares onde
--   este sistema guarda onde a obra fica. O editor da suite de padrao tem can_edit
--   nos dois e nao consegue prova-lo.
--
-- COMO RODAR
--   npm run test:schema:map
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou/devolveu n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23502 not null violado,
--                         23503 FK violada, 23505 unicidade violada,
--                         42501 policy/privilegio.
--   Nas secoes 1.8, 3.7, 5 e 6 o observado e o VALOR devolvido, e nao contagem de
--   linhas: uma coluna que responda errado devolve uma linha do mesmo jeito.
--
--   TODO caso de negacao tem um CONTROLE ao lado. Este projeto ja teve teste de
--   negacao passar por falta de GRANT em vez de resultado vazio (migration 0036),
--   e quem acusou foi o controle.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug map-schema-test-*). Nenhuma contagem e absoluta sobre tabela de
--   negocio.

begin;

-- Instrumentacao --------------------------------------------------------------

create temp table res (
  seq serial primary key, caso text, descricao text, expected text, observed text
) on commit drop;

create or replace function pg_temp.try(p_sql text)
returns text language plpgsql as $$
declare v_rows bigint; v_state text;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    return 'ERR:' || v_state;
  end;
end;
$$;

create or replace function pg_temp.chk(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
begin
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, pg_temp.try(p_sql));
end;
$$;

-- Sonda de VALOR. pg_temp.try devolve contagem de linhas, e uma coluna que
-- responda errado devolve UMA linha do mesmo jeito.
create or replace function pg_temp.val(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_state text;
begin
  begin
    execute p_sql into v_out;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v_out, '<null>'));
end;
$$;

-- Sonda que EXECUTA COMO OUTRA PESSOA, com claims de JWT. E o unico jeito de
-- exercitar a policy: postgres tem BYPASSRLS neste projeto.
create or replace function pg_temp.chk_as(p_caso text, p_desc text, p_expected text,
                                          p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint; v_state text; v_out text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql;
    get diagnostics v_rows = row_count;
    perform set_config('role', 'postgres', true);
    v_out := 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'c1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'c2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  -- Duas pessoas com UM menu cada. E o par que a suite de padrao nao monta, e o
  -- unico jeito de provar que 'map' e 'projects' governam lugares diferentes.
  'c1000000-0000-4000-8000-000000000001'::uuid as u_map,
  'c1000000-0000-4000-8000-000000000002'::uuid as u_proj,
  'c1100000-0000-4000-8000-000000000001'::uuid as c_map,
  'c1100000-0000-4000-8000-000000000002'::uuid as c_proj,
  'c2100000-0000-4000-8000-000000000001'::uuid as c_b,
  'c2000000-0000-4000-8000-000000000001'::uuid as u_b,
  'c1200000-0000-4000-8000-000000000001'::uuid as cli_a,
  'c2200000-0000-4000-8000-000000000001'::uuid as cli_b,
  -- proj_plain nunca foi geocodificado; proj_geo tem coordenada propria e um pino
  -- vinculado, que e o cenario dos "dois lugares"; proj_free nao tem pino e serve
  -- ao controle de exclusao; proj_scratch recebe as escritas da secao 7.
  'c1300000-0000-4000-8000-000000000001'::uuid as proj_plain,
  'c1300000-0000-4000-8000-000000000002'::uuid as proj_geo,
  'c1300000-0000-4000-8000-000000000003'::uuid as proj_free,
  'c1300000-0000-4000-8000-000000000004'::uuid as proj_scratch,
  'c2300000-0000-4000-8000-000000000001'::uuid as proj_b,
  -- prop_linked e o pino do proj_geo; prop_free e o pino de rotulo livre;
  -- prop_tags carrega as tags da secao 3 e morre na secao 5; prop_keep existe so
  -- para o controle de que o cascade nao passou dos limites.
  'c1400000-0000-4000-8000-000000000001'::uuid as prop_linked,
  'c1400000-0000-4000-8000-000000000002'::uuid as prop_free,
  'c1400000-0000-4000-8000-000000000003'::uuid as prop_tags,
  'c1400000-0000-4000-8000-000000000004'::uuid as prop_keep,
  'c2400000-0000-4000-8000-000000000001'::uuid as prop_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_map from ids) u, 'map-map@example.test' e
  union all select (select u_proj from ids), 'map-proj@example.test'
  union all select (select u_b from ids), 'map-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Map Schema Test A', 'map-schema-test-a'),
  ((select tenant_b from ids), 'Map Schema Test B', 'map-schema-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_map from ids), 'member'),
  ((select tenant_a from ids), (select u_proj from ids), 'member'),
  ((select tenant_b from ids), (select u_b from ids), 'member');

-- Nenhum deles e Diretor, de proposito: can_edit_menu tem atalho de Diretor
-- (0019) e Diretor passaria nos cruzamentos da secao 7 sem provar nada.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_map from ids), (select tenant_a from ids), (select u_map from ids),
   'Renata Caiado', 'admin_staff', 'map-map@example.test', 'active'),
  ((select c_proj from ids), (select tenant_a from ids), (select u_proj from ids),
   'Gustavo Ferraz', 'coordinator', 'map-proj@example.test', 'active'),
  ((select c_b from ids), (select tenant_b from ids), (select u_b from ids),
   'Leticia Vilela', 'coordinator', 'map-b@example.test', 'active');

-- UM menu com can_edit para cada, e a linha do outro menu existe com can_edit
-- FALSO. A linha precisa existir: sem ela, "nao escreve" nao distingue "permissao
-- negada" de "permissao ausente".
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_map from ids), 'map', true, true),
  ((select tenant_a from ids), (select c_map from ids), 'projects', true, false),
  ((select tenant_a from ids), (select c_proj from ids), 'projects', true, true),
  ((select tenant_a from ids), (select c_proj from ids), 'map', true, false),
  ((select tenant_b from ids), (select c_b from ids), 'map', true, true),
  ((select tenant_b from ids), (select c_b from ids), 'projects', true, true);

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cli_a from ids), (select tenant_a from ids), 'Familia Bittencourt', '(62) 98222-0001', 'Goiania', 'GO'),
  ((select cli_b from ids), (select tenant_b from ids), 'Familia Sanches', '(62) 98222-0002', 'Anapolis', 'GO');

insert into public.projects (id, tenant_id, name, project_type, client_id) values
  ((select proj_plain from ids), (select tenant_a from ids), 'Residencia Jardim Goias', 'architecture',
   (select cli_a from ids)),
  ((select proj_free from ids), (select tenant_a from ids), 'Residencia Alphaville', 'architecture',
   (select cli_a from ids)),
  ((select proj_scratch from ids), (select tenant_a from ids), 'Projeto de rascunho da secao 7', 'architecture', null),
  ((select proj_b from ids), (select tenant_b from ids), 'Residencia Anapolis', 'architecture',
   (select cli_b from ids));

-- O projeto geocodificado. A coordenada e a da Praca Civica; o pino vinculado a
-- ele (prop_linked, logo abaixo) fica no Jardim Goias, a alguns quilometros. Os
-- dois valores sao DIFERENTES de proposito: e isso que a secao 7 mede.
insert into public.projects
  (id, tenant_id, name, project_type, client_id, site_address_text,
   site_lat, site_lng, site_place_id, site_geocode_status, site_geocode_updated_at)
values
  ((select proj_geo from ids), (select tenant_a from ids), 'Residencia Setor Bueno', 'architecture',
   (select cli_a from ids), 'Praca Civica, Goiania, GO',
   -16.678200, -49.254800, 'ChIJ_placeid_de_teste', 'ok', now());

insert into public.map_properties (id, tenant_id, lat, lng, project_id, client_id, city, state) values
  ((select prop_linked from ids), (select tenant_a from ids),
   -16.706100, -49.239400, (select proj_geo from ids), (select cli_a from ids), 'Goiania', 'GO');

insert into public.map_properties (id, tenant_id, lat, lng, project_label, client_label, city, state) values
  ((select prop_free from ids), (select tenant_a from ids),
   -16.640300, -49.310000, 'Terreno da Rua 9 (sem projeto)', 'Sr. Marcondes', 'Goiania', 'GO'),
  ((select prop_tags from ids), (select tenant_a from ids),
   -16.720000, -49.180000, 'Lote do condominio', null, 'Goiania', 'GO'),
  ((select prop_keep from ids), (select tenant_a from ids),
   -16.730000, -49.170000, 'Lote vizinho', null, 'Goiania', 'GO');

insert into public.map_properties (id, tenant_id, lat, lng, project_id) values
  ((select prop_b from ids), (select tenant_b from ids),
   -16.320000, -48.950000, (select proj_b from ids));

-- 1. lat/lng: faixa valida, sentinela e precisao ---------------------------------
--
-- O original nao valida nada disto na gravacao. A unica checagem de faixa que
-- existe la e sobre a coordenada DIGITADA na busca (MapaProjetos.jsx:583), que
-- nunca vira linha.

select pg_temp.chk('1.1', 'CONTROLE: pino em Goiania entra', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, -16.686891, -49.264794, 'Pino de controle')
$q$, (select tenant_a from ids)));

select pg_temp.chk('1.2', 'latitude 91 e recusada', 'ERR:23514', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, 91, -49.264794, 'Pino fora do planeta')
$q$, (select tenant_a from ids)));

select pg_temp.chk('1.3', 'longitude 181 e recusada', 'ERR:23514', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, -16.686891, 181, 'Pino fora do planeta')
$q$, (select tenant_a from ids)));

-- Os limites EXATOS sao validos. Sem este caso, um check escrito com > e < em vez
-- de >= e <= passaria em 1.2 e 1.3 e recusaria o Polo Sul e a linha de data.
select pg_temp.chk('1.4', 'CONTROLE: os limites exatos (-90, 180) entram', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, -90, 180, 'Pino no limite')
$q$, (select tenant_a from ids)));

select pg_temp.chk('1.5', 'o par (0,0) e recusado: e sentinela, nao lugar', 'ERR:23514', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, 0, 0, 'Null island')
$q$, (select tenant_a from ids)));

-- A DIVERGENCIA DELIBERADA EM RELACAO AO ORIGINAL. Ele recusa lat OU lng igual a
-- zero (MapaProjetos.jsx:386 e :532); latitude zero e o Equador, que corta o
-- Amapa. Sem este caso, alguem "corrigiria" o check para a forma do original e a
-- suite nao acusaria - so um pino em Macapa acusaria, um dia, na tela.
select pg_temp.chk('1.6', 'CONTROLE: latitude zero com longitude real entra (Equador, no Amapa)', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, 0, -51.066700, 'Pino no Equador, Macapa')
$q$, (select tenant_a from ids)));

select pg_temp.chk('1.7', 'pino sem longitude e recusado: coordenada e par', 'ERR:23502', format($q$
  insert into public.map_properties (tenant_id, lat, project_label)
  values (%L, -16.686891, 'Meio pino')
$q$, (select tenant_a from ids)));

-- A tela grava com toFixed(6) (MapaProjetos.jsx:383). numeric(9,6) guarda
-- exatamente isso; a setima casa arredonda e nao estoura.
select pg_temp.val('1.8', 'a setima casa decimal arredonda para seis', '-16.686892', format($q$
  with novo as (
    insert into public.map_properties (tenant_id, lat, lng, project_label)
    values (%L, -16.6868915, -49.264794, 'Pino de arredondamento')
    returning lat
  )
  select lat::text from novo
$q$, (select tenant_a from ids)));

-- 2. Vinculo e rotulo sao alternativas, nao complementos -------------------------
--
-- No combobox do original, escolher da lista zera o rotulo (ProjectForm.jsx:174 e
-- :216) e digitar texto livre zera o vinculo (:199 e :228).

select pg_temp.chk('2.1', 'CONTROLE: pino so com VINCULO entra', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_id, client_id)
  values (%L, -16.690000, -49.260000, %L, %L)
$q$, (select tenant_a from ids), (select proj_plain from ids), (select cli_a from ids)));

select pg_temp.chk('2.2', 'CONTROLE: pino so com ROTULO entra', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label, client_label)
  values (%L, -16.691000, -49.261000, 'Terreno sem projeto', 'Cliente sem cadastro')
$q$, (select tenant_a from ids)));

-- O pino anonimo e caso de uso real: marcar um terreno de olho antes de haver
-- projeto e antes de haver cliente. A tela o desenha como "Sem nome"
-- (MapaProjetos.jsx:283).
select pg_temp.chk('2.3', 'CONTROLE: pino sem vinculo e sem rotulo entra', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng)
  values (%L, -16.692000, -49.262000)
$q$, (select tenant_a from ids)));

select pg_temp.chk('2.4', 'projeto vinculado E rotulo livre juntos sao recusados', 'ERR:23514', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_id, project_label)
  values (%L, -16.693000, -49.263000, %L, 'Rotulo que ninguem veria')
$q$, (select tenant_a from ids), (select proj_plain from ids)));

select pg_temp.chk('2.5', 'cliente vinculado E rotulo livre juntos sao recusados', 'ERR:23514', format($q$
  insert into public.map_properties (tenant_id, lat, lng, client_id, client_label)
  values (%L, -16.694000, -49.264000, %L, 'Rotulo que ninguem veria')
$q$, (select tenant_a from ids), (select cli_a from ids)));

-- O original manda `formData.project_label || null`, entao string vazia ja vira
-- nulo la. Aqui o check garante que nenhum outro caminho grave um rotulo que a
-- tela exibiria como espaco em branco.
select pg_temp.chk('2.6', 'rotulo em branco e recusado', 'ERR:23514', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, -16.695000, -49.265000, '   ')
$q$, (select tenant_a from ids)));

-- 3. Os dois campos de array: o que a tabela filha faz e o array nao fazia -------
--
-- terreno_tipo e finalidade_projeto sao array de string no base44. A decisao deste
-- modulo foi tabela filha com TEXTO LIVRE, e nao array de enum: o formulario tem
-- campo "Nova categoria..." e aceita qualquer valor digitado (ProjectForm.jsx:270
-- e :289). Os casos 3.2 e 3.5 sao os que provam a parte "texto livre" - com enum,
-- os dois viriam 22P02 ou 42704.

select pg_temp.chk('3.1', 'CONTROLE: tag sugerida pelo formulario entra', 'OK:1', format($q$
  insert into public.map_property_land_types (tenant_id, map_property_id, land_type)
  values (%L, %L, 'Loteamento fechado')
$q$, (select tenant_a from ids), (select prop_tags from ids)));

select pg_temp.chk('3.2', 'categoria INVENTADA na tela entra: a tag e texto livre', 'OK:1', format($q$
  insert into public.map_property_land_types (tenant_id, map_property_id, land_type)
  values (%L, %L, 'Chacara de recreio')
$q$, (select tenant_a from ids), (select prop_tags from ids)));

select pg_temp.chk('3.3', 'a mesma tag duas vezes na mesma propriedade e recusada', 'ERR:23505', format($q$
  insert into public.map_property_land_types (tenant_id, map_property_id, land_type)
  values (%L, %L, 'Loteamento fechado')
$q$, (select tenant_a from ids), (select prop_tags from ids)));

-- Sem este controle, 3.3 passaria tambem se a unicidade fosse global por tag e
-- duas propriedades nao pudessem ser loteamento fechado ao mesmo tempo.
select pg_temp.chk('3.4', 'CONTROLE: a mesma tag em OUTRA propriedade entra', 'OK:1', format($q$
  insert into public.map_property_land_types (tenant_id, map_property_id, land_type)
  values (%L, %L, 'Loteamento fechado')
$q$, (select tenant_a from ids), (select prop_keep from ids)));

select pg_temp.chk('3.5', 'finalidade INVENTADA na tela entra: a tag e texto livre', 'OK:1', format($q$
  insert into public.map_property_purposes (tenant_id, map_property_id, purpose)
  values (%L, %L, 'Aluguel por temporada')
$q$, (select tenant_a from ids), (select prop_tags from ids)));

select pg_temp.chk('3.6', 'a mesma finalidade duas vezes na mesma propriedade e recusada', 'ERR:23505', format($q$
  insert into public.map_property_purposes (tenant_id, map_property_id, purpose)
  values (%L, %L, 'Aluguel por temporada')
$q$, (select tenant_a from ids), (select prop_tags from ids)));

select pg_temp.chk('3.7', 'tag em branco e recusada', 'ERR:23514', format($q$
  insert into public.map_property_purposes (tenant_id, map_property_id, purpose)
  values (%L, %L, '   ')
$q$, (select tenant_a from ids), (select prop_tags from ids)));

-- A condicao que decide se a tela mostra o bloco de loteamento era
-- `property.terreno_tipo?.includes('Loteamento fechado')` (MapaProjetos.jsx:1213).
-- Com tabela filha ela vira um EXISTS, e continua respondendo.
select pg_temp.val('3.8', 'o bloco de loteamento continua decidivel: a propriedade TEM a tag', 'true', format($q$
  select exists (
    select 1 from public.map_property_land_types
     where map_property_id = %L and land_type = 'Loteamento fechado'
  )::text
$q$, (select prop_tags from ids)));

select pg_temp.val('3.9', 'CONTROLE: propriedade sem a tag responde falso', 'false', format($q$
  select exists (
    select 1 from public.map_property_land_types
     where map_property_id = %L and land_type = 'Loteamento fechado'
  )::text
$q$, (select prop_free from ids)));

-- 4. As FKs sao COMPOSTAS ---------------------------------------------------------
--
-- Referencia por id sozinho deixaria o pino apontar para fora do escritorio: a
-- RLS filtra o que se le, nao o que se aponta.

select pg_temp.chk('4.1', 'pino apontando para projeto de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_id)
  values (%L, -16.700000, -49.270000, %L)
$q$, (select tenant_a from ids), (select proj_b from ids)));

select pg_temp.chk('4.2', 'CONTROLE: pino apontando para projeto do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_id)
  values (%L, -16.700000, -49.270000, %L)
$q$, (select tenant_a from ids), (select proj_plain from ids)));

select pg_temp.chk('4.3', 'pino apontando para cliente de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.map_properties (tenant_id, lat, lng, client_id)
  values (%L, -16.701000, -49.271000, %L)
$q$, (select tenant_a from ids), (select cli_b from ids)));

select pg_temp.chk('4.4', 'CONTROLE: pino apontando para cliente do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, client_id)
  values (%L, -16.701000, -49.271000, %L)
$q$, (select tenant_a from ids), (select cli_a from ids)));

select pg_temp.chk('4.5', 'tag apontando para propriedade de OUTRO escritorio e recusada', 'ERR:23503', format($q$
  insert into public.map_property_land_types (tenant_id, map_property_id, land_type)
  values (%L, %L, 'Terreno')
$q$, (select tenant_a from ids), (select prop_b from ids)));

select pg_temp.chk('4.6', 'CONTROLE: tag apontando para propriedade do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.map_property_land_types (tenant_id, map_property_id, land_type)
  values (%L, %L, 'Terreno')
$q$, (select tenant_a from ids), (select prop_free from ids)));

-- 5. O que a exclusao leva junto, e o que ela recusa -------------------------------

select pg_temp.val('5.1', 'CONTROLE: a propriedade que sera apagada TEM tags', '3', format($q$
  select (
    (select count(*) from public.map_property_land_types where map_property_id = %L)
    + (select count(*) from public.map_property_purposes where map_property_id = %L)
  )::text
$q$, (select prop_tags from ids), (select prop_tags from ids)));

select pg_temp.chk('5.2', 'apagar a propriedade', 'OK:1', format($q$
  delete from public.map_properties where id = %L
$q$, (select prop_tags from ids)));

select pg_temp.val('5.3', 'as tags cairam junto (cascade)', '0', format($q$
  select (
    (select count(*) from public.map_property_land_types where map_property_id = %L)
    + (select count(*) from public.map_property_purposes where map_property_id = %L)
  )::text
$q$, (select prop_tags from ids), (select prop_tags from ids)));

select pg_temp.val('5.4', 'CONTROLE: as tags da outra propriedade continuam la', '1', format($q$
  select count(*)::text from public.map_property_land_types where map_property_id = %L
$q$, (select prop_keep from ids)));

-- FK sem cascade, como em todo o projeto desde a 0022: apagar o que tem pino
-- falha, forcando decisao explicita em vez de orfanar a linha em silencio. A tela
-- precisa dizer isso.
select pg_temp.chk('5.5', 'apagar projeto que tem pino no mapa e RECUSADO', 'ERR:23503', format($q$
  delete from public.projects where id = %L
$q$, (select proj_geo from ids)));

select pg_temp.chk('5.6', 'CONTROLE: projeto SEM pino e apagado', 'OK:1', format($q$
  delete from public.projects where id = %L
$q$, (select proj_free from ids)));

-- A promessa que o dialogo do original faz por escrito: "O projeto vinculado
-- continuara existindo normalmente" (MapaProjetos.jsx:1328).
select pg_temp.chk('5.7', 'apagar o PINO do projeto vinculado', 'OK:1', format($q$
  delete from public.map_properties where id = %L
$q$, (select prop_linked from ids)));

select pg_temp.val('5.8', 'o projeto vinculado continua existindo', '1', format($q$
  select count(*)::text from public.projects where id = %L
$q$, (select proj_geo from ids)));

-- 6. As oito colunas site_* em projeto SEM geocodificacao --------------------------
--
-- proj_plain nasceu como qualquer projeto do modulo 5 nasce: sem nenhum campo
-- site_* informado.

select pg_temp.val('6.1', 'projeto sem geocodificacao nasce com status pending', 'pending', format($q$
  select site_geocode_status::text from public.projects where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.val('6.2', 'projeto sem geocodificacao nasce SEM coordenada', '<null>', format($q$
  select site_lat::text from public.projects where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.val('6.3', 'projeto sem geocodificacao nasce com pino nao-manual', 'false', format($q$
  select site_pin_manual::text from public.projects where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.val('6.4', 'projeto sem geocodificacao nao tem data de tentativa', '<null>', format($q$
  select site_geocode_updated_at::text from public.projects where id = %L
$q$, (select proj_plain from ids)));

-- O caminho que geocoding.jsx:115-119 percorre quando a API nao acha o endereco:
-- grava status e data, sem coordenada nenhuma.
select pg_temp.chk('6.5', 'CONTROLE: geocodificacao FALHA grava status sem coordenada', 'OK:1', format($q$
  update public.projects set site_geocode_status = 'failed', site_geocode_updated_at = now()
   where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.chk('6.6', 'status ok SEM coordenada e recusado', 'ERR:23514', format($q$
  update public.projects set site_geocode_status = 'ok' where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.chk('6.7', 'CONTROLE: status ok COM coordenada entra', 'OK:1', format($q$
  update public.projects
     set site_geocode_status = 'ok', site_lat = -16.678200, site_lng = -49.254800
   where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.chk('6.8', 'coordenada pela metade e recusada', 'ERR:23514', format($q$
  update public.projects set site_lng = null where id = %L
$q$, (select proj_plain from ids)));

select pg_temp.chk('6.9', 'latitude fora da faixa e recusada tambem no projeto', 'ERR:23514', format($q$
  update public.projects set site_lat = 91 where id = %L
$q$, (select proj_plain from ids)));

-- Pino ajustado a mao: coordenada com status pending e valido de proposito - o
-- check so proibe o inverso.
select pg_temp.chk('6.10', 'CONTROLE: coordenada com status pending e valida (pino manual)', 'OK:1', format($q$
  update public.projects
     set site_geocode_status = 'pending', site_pin_manual = true,
         site_pin_updated_by = %L, site_pin_updated_at = now()
   where id = %L
$q$, (select c_proj from ids), (select proj_plain from ids)));

select pg_temp.chk('6.11', 'quem ajustou o pino nao pode ser colaborador de OUTRO escritorio', 'ERR:23503', format($q$
  update public.projects set site_pin_updated_by = %L where id = %L
$q$, (select c_b from ids), (select proj_plain from ids)));

-- 7. Os DOIS lugares que guardam onde a obra fica ----------------------------------
--
-- Nenhuma suite alcanca isto: 'map' e 'projects' sao menus de modulos diferentes,
-- e o editor da suite de padrao tem can_edit nos dois. A duplicacao e heranca do
-- base44 e esta registrada em docs/SCHEMA-PLAN.md ("Decisao 1") - estes casos
-- existem para que ela nunca seja confundida com sincronia.

-- proj_geo tem coordenada propria desde a fixture (Praca Civica), vinda da API do
-- Google pelo endereco do CONTRATO. O pino que se cria aqui fica no Jardim Goias.
-- Vincular um ao outro nao aproxima os dois numeros - e esse e o ponto.
select pg_temp.chk('7.1', 'CONTROLE: cria pino vinculado ao projeto que JA tem coordenada propria', 'OK:1', format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_id)
  values (%L, -16.706100, -49.239400, %L)
$q$, (select tenant_a from ids), (select proj_geo from ids)));

select pg_temp.val('7.2', 'o pino e o projeto vinculado guardam coordenadas DIFERENTES', 'false', format($q$
  select (p.lat = pr.site_lat)::text
    from public.map_properties p
    join public.projects pr on pr.id = p.project_id
   where p.project_id = %L
$q$, (select proj_geo from ids)));

-- prop_b e do escritorio B e nao foi tocada por nenhuma secao acima; proj_b nunca
-- foi geocodificado. Mover o pino nao mexe no projeto.
select pg_temp.chk('7.3', 'mover o pino do escritorio B', 'OK:1', format($q$
  update public.map_properties set lat = -16.400000, lng = -48.900000 where id = %L
$q$, (select prop_b from ids)));

select pg_temp.val('7.4', 'o projeto vinculado continua sem coordenada: nada sincroniza os dois', '<null>', format($q$
  select site_lat::text from public.projects where id = %L
$q$, (select proj_b from ids)));

select pg_temp.chk_as('7.5', 'CONTROLE: quem tem o menu map CRIA pino', 'OK:1',
  (select u_map from ids), (select tenant_a from ids), format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, -16.710000, -49.290000, 'Pino da secao 7')
$q$, (select tenant_a from ids)));

-- O ponto do modulo: quem cuida do mapa NAO escreve a geolocalizacao do projeto.
-- E o comportamento do original, onde a tela de mapa e explicitamente
-- nao-intrusiva (MapaProjetos.jsx:537).
select pg_temp.chk_as('7.6', 'quem tem SO o menu map NAO escreve site_lat no projeto', 'OK:0',
  (select u_map from ids), (select tenant_a from ids), format($q$
  update public.projects set site_lat = -16.6, site_lng = -49.2 where id = %L
$q$, (select proj_scratch from ids)));

select pg_temp.chk_as('7.7', 'CONTROLE: quem tem o menu projects ESCREVE site_lat', 'OK:1',
  (select u_proj from ids), (select tenant_a from ids), format($q$
  update public.projects set site_lat = -16.6, site_lng = -49.2 where id = %L
$q$, (select proj_scratch from ids)));

select pg_temp.chk_as('7.8', 'quem tem SO o menu projects NAO cria pino', 'ERR:42501',
  (select u_proj from ids), (select tenant_a from ids), format($q$
  insert into public.map_properties (tenant_id, lat, lng, project_label)
  values (%L, -16.711000, -49.291000, 'Pino negado da secao 7')
$q$, (select tenant_a from ids)));

-- CONTROLE de leitura: a leitura deste modulo e LARGA, e o menu nao a recorta.
-- Sem este caso, uma policy de SELECT que exigisse can_edit passaria em tudo acima
-- e so apareceria na tela de quem consulta.
select pg_temp.chk_as('7.9', 'CONTROLE: quem tem SO o menu projects LE os pinos', 'OK:1',
  (select u_proj from ids), (select tenant_a from ids), format($q$
  select 1 from public.map_properties where id = %L
$q$, (select prop_free from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
