-- INVARIANTES DO PADRAO — roda sobre TODA tabela de negocio, de todo modulo.
--
-- POR QUE ESTE ARQUIVO EXISTE
--   Os modulos 1 e 2 produziram 114 asserçoes cada. Isso fez sentido no 1, onde
--   o modelo era novo: achamos tabela aberta para a internet, chave-mestra
--   valida ate 2036 e tres caminhos de escalacao de privilegio. Fez menos
--   sentido no 2, que aplica o MESMO padrao a uma tabela.
--
--   Os modulos 3 a 9 tem todos a mesma forma:
--     tabela com tenant_id, leitura por colaborador active do tenant,
--     escrita por can_edit_menu('<chave do menu>').
--
--   Este arquivo afirma os invariantes DESSE PADRAO de uma vez, para todas as
--   tabelas, lendo o catalogo e sondando o comportamento. Cada modulo novo
--   acrescenta UMA linha em pattern_tables e ganha a cobertura inteira.
--
--   O que ele NAO substitui: o que e especifico do modulo. Coluna gerada,
--   restricao de unicidade, superficie publica por token, regra de negocio.
--   Isso continua tendo teste proprio, e curto.
--
-- COMO RODAR
--   npm run test:pattern
--
-- COMO LER
--   observed = 'OK:<n>' operacao passou, n linhas. 'OK:0' em UPDATE/DELETE E
--                       negacao: o USING nao casou linha e o Postgres nao
--                       levanta erro, so nao faz nada.
--   observed = 'ERR:42501' privilegio negado (falta de GRANT, WITH CHECK ou trigger).
--
--   Casos CONTROLE afirmam o que precisa CONTINUAR possivel. Sem eles, um
--   schema que negue tudo passa com nota cheia — e nota cheia e o que faz
--   ninguem reler o teste.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug pattern-test-*). Nenhuma contagem e absoluta sobre tabela de
--   negocio: o escritorio de teste do seed tem dado permanente, e caso que
--   depende de tabela vazia passa hoje e falha depois, longe da causa.

begin;

-- REGISTRO DAS TABELAS DO PADRAO ---------------------------------------------
--
-- Modulo novo entra aqui. `insert_cols` e `insert_vals` sao o minimo para
-- gravar uma linha valida (sem tenant_id, que a sonda acrescenta).

create temp table pattern_tables (
  modulo int,
  tabela text,
  menu_key text,
  insert_cols text,
  insert_vals text
) on commit drop;

insert into pattern_tables (modulo, tabela, menu_key, insert_cols, insert_vals) values
  (2, 'clients', 'crm',
   'name, phone, address_city, address_state',
   $$'Cliente Padrao', '(62) 90000-0000', 'Goiania', 'GO'$$);

  -- Modulo 3: (3, 'negotiations', 'pipeline', ..., ...)
  -- Modulo 4: (4, 'contracts', 'contracts', ..., ...)
  -- e assim por diante.

-- FIXTURES --------------------------------------------------------------------

create temp table pat on commit drop as select
  'e1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'e2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'ea000000-0000-4000-8000-000000000001'::uuid as u_editor_a,
  'ea000000-0000-4000-8000-000000000002'::uuid as u_viewer_a,
  'ea000000-0000-4000-8000-000000000003'::uuid as u_leave_a,
  'ea000000-0000-4000-8000-000000000004'::uuid as u_orphan,
  'eb000000-0000-4000-8000-000000000001'::uuid as u_editor_b,
  'ea100000-0000-4000-8000-000000000001'::uuid as c_editor_a,
  'ea100000-0000-4000-8000-000000000002'::uuid as c_viewer_a,
  'ea100000-0000-4000-8000-000000000003'::uuid as c_leave_a,
  'eb100000-0000-4000-8000-000000000001'::uuid as c_editor_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_editor_a from pat) u, 'pattern-editor-a@example.test' e
  union all select (select u_viewer_a from pat), 'pattern-viewer-a@example.test'
  union all select (select u_leave_a from pat), 'pattern-leave-a@example.test'
  union all select (select u_orphan from pat), 'pattern-orphan@example.test'
  union all select (select u_editor_b from pat), 'pattern-editor-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from pat), 'Pattern Test A', 'pattern-test-a'),
  ((select tenant_b from pat), 'Pattern Test B', 'pattern-test-b');

-- u_orphan NAO entra em tenant_users de proposito: e o JWT sem claim de tenant.
insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from pat), (select u_editor_a from pat), 'member'),
  ((select tenant_a from pat), (select u_viewer_a from pat), 'member'),
  ((select tenant_a from pat), (select u_leave_a from pat), 'member'),
  ((select tenant_b from pat), (select u_editor_b from pat), 'member');

-- Nenhum deles e Diretor, de proposito: can_edit_menu tem atalho de Diretor
-- (migration 0019), e Diretor passaria em tudo sem provar que a permissao de
-- menu esta sendo lida. O atalho tem teste proprio em crm-rls.sql secao 12.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_editor_a from pat), (select tenant_a from pat), (select u_editor_a from pat),
   'Editor A', 'architect', 'pattern-editor-a@example.test', 'active'),
  ((select c_viewer_a from pat), (select tenant_a from pat), (select u_viewer_a from pat),
   'Leitor A', 'architect', 'pattern-viewer-a@example.test', 'active'),
  ((select c_leave_a from pat), (select tenant_a from pat), (select u_leave_a from pat),
   'Afastado A', 'architect', 'pattern-leave-a@example.test', 'on_leave'),
  ((select c_editor_b from pat), (select tenant_b from pat), (select u_editor_b from pat),
   'Editor B', 'architect', 'pattern-editor-b@example.test', 'active');

-- Permissao de edicao para o editor de cada escritorio, em TODO menu do
-- registro. O afastado recebe tambem, de proposito: sem isso, "afastado nao
-- escreve porque esta afastado" e "porque nao tem permissao" dariam o mesmo
-- resultado e o teste nao saberia dizer qual regra funciona.
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit)
select (select tenant_a from pat), (select c_editor_a from pat), t.menu_key, true, true from pattern_tables t
union all
select (select tenant_a from pat), (select c_leave_a from pat), t.menu_key, true, true from pattern_tables t
union all
select (select tenant_b from pat), (select c_editor_b from pat), t.menu_key, true, true from pattern_tables t
union all
-- Leitor: can_view sim, can_edit nao.
select (select tenant_a from pat), (select c_viewer_a from pat), t.menu_key, true, false from pattern_tables t;

-- INSTRUMENTACAO --------------------------------------------------------------

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

-- Executa como um usuario concreto e SEMPRE desfaz: escrita que porventura
-- PASSE nao pode contaminar o caso seguinte.
create or replace function pg_temp.probe(p_role name, p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v_rows bigint; v_state text;
begin
  begin
    perform set_config('role', p_role, true);
    if p_claims is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', p_claims::text, true);
    end if;
    execute p_sql;
    get diagnostics v_rows = row_count;
    raise exception 'PAT_OK:%', v_rows using errcode = 'RL001';
  exception
    when sqlstate 'RL001' then
      get stacked diagnostics v_state = message_text;
      perform set_config('role', 'postgres', true);
      return replace(v_state, 'PAT_OK:', 'OK:');
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      perform set_config('role', 'postgres', true);
      return 'ERR:' || v_state;
  end;
end;
$$;

-- Sonda de VALOR. Existe porque probe() devolve contagem de linhas, e
-- `select can_edit_menu(...)` devolve UMA linha tanto para true quanto para
-- false: usar probe() ali produz 'OK:1' nos dois casos, e o teste passa a
-- afirmar nada. Foi exatamente o erro da primeira versao deste arquivo.
create or replace function pg_temp.probe_val(p_role name, p_claims jsonb, p_sql text)
returns text language plpgsql as $$
declare v_out text; v_state text;
begin
  begin
    perform set_config('role', p_role, true);
    if p_claims is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', p_claims::text, true);
    end if;
    execute p_sql into v_out;
    perform set_config('role', 'postgres', true);
    return coalesce(v_out, '<null>');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || v_state;
  end;
end;
$$;

create or replace function pg_temp.rec(p_caso text, p_desc text, p_expected text, p_observed text)
returns void language plpgsql as $$
begin
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, p_observed);
end;
$$;

-- OS INVARIANTES --------------------------------------------------------------

do $$
declare
  t record;
  p record;
  v_row_a uuid;
  v_row_b uuid;
  v_pref text;
begin
  select * into p from pat;

  for t in select * from pattern_tables order by modulo, tabela loop
    v_pref := t.modulo || '.' || t.tabela;

    -- ---- Catalogo: os dois lados da tranca -----------------------------------
    --
    -- RLS sem GRANT da "permission denied"; GRANT sem RLS entrega a tabela.
    -- Precisa dos dois, e este projeto ja foi ao ar com seis tabelas abertas
    -- por confiar que "sem GRANT explicito" bastava - o bootstrap do Supabase
    -- concedia por tras (ver migration 0007).

    perform pg_temp.rec(v_pref || '/A1', 'RLS esta LIGADA', 'true',
      (select relrowsecurity::text from pg_class where oid = ('public.' || t.tabela)::regclass));

    perform pg_temp.rec(v_pref || '/A2', 'anon NAO tem privilegio nenhum', '<null>',
      coalesce((select string_agg(privilege_type, ',' order by privilege_type)
                from information_schema.role_table_grants
                where table_schema = 'public' and table_name = t.tabela and grantee = 'anon'), '<null>'));

    perform pg_temp.rec(v_pref || '/A3', 'authenticated tem os quatro privilegios', 'DELETE,INSERT,SELECT,UPDATE',
      coalesce((select string_agg(distinct privilege_type, ',' order by privilege_type)
                from information_schema.role_table_grants
                where table_schema = 'public' and table_name = t.tabela and grantee = 'authenticated'), '<null>'));

    perform pg_temp.rec(v_pref || '/A4', 'tem policy para os quatro comandos', 'DELETE,INSERT,SELECT,UPDATE',
      coalesce((select string_agg(distinct cmd, ',' order by cmd) from pg_policies
                where schemaname = 'public' and tablename = t.tabela), '<null>'));

    perform pg_temp.rec(v_pref || '/A5', 'INSERT e UPDATE declaram WITH CHECK', '2',
      (select count(*)::text from pg_policies
       where schemaname = 'public' and tablename = t.tabela
         and cmd in ('INSERT', 'UPDATE') and with_check is not null));

    -- tenant_id not null: coluna anulavel deixaria gravar linha orfa, que
    -- nenhuma policy escopada por tenant conseguiria ler nem apagar depois.
    perform pg_temp.rec(v_pref || '/A6', 'tenant_id existe e e NOT NULL', 'NO',
      coalesce((select is_nullable from information_schema.columns
                where table_schema = 'public' and table_name = t.tabela and column_name = 'tenant_id'), '<sem coluna>'));

    -- Alvo de FK composta: sem isto, os modulos seguintes so podem referenciar
    -- por id, e referencia por id sozinho deixa apontar para outro escritorio.
    perform pg_temp.rec(v_pref || '/A7', 'tem unique (id, tenant_id) para FK composta', 'true',
      (select exists (
        select 1 from pg_constraint c
        where c.conrelid = ('public.' || t.tabela)::regclass and c.contype = 'u'
          and (select array_agg(a.attname::text order by a.attname)
               from unnest(c.conkey) k join pg_attribute a
                 on a.attrelid = c.conrelid and a.attnum = k) = array['id','tenant_id']
      ))::text);

    -- Indice comecando por tenant_id: sem ele, toda listagem varre a tabela
    -- inteira e filtra depois.
    perform pg_temp.rec(v_pref || '/A8', 'tem indice comecando por tenant_id', 'true',
      (select exists (
        select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid
        where i.indrelid = ('public.' || t.tabela)::regclass
          and (select attname from pg_attribute
               where attrelid = i.indrelid and attnum = i.indkey[0]) = 'tenant_id'
      ))::text);

    -- ---- Comportamento: uma linha em cada escritorio -------------------------

    execute format('insert into public.%I (tenant_id, %s) values (%L, %s) returning id',
                   t.tabela, t.insert_cols, p.tenant_a, t.insert_vals) into v_row_a;
    execute format('insert into public.%I (tenant_id, %s) values (%L, %s) returning id',
                   t.tabela, t.insert_cols, p.tenant_b, t.insert_vals) into v_row_b;

    -- Isolamento entre escritorios, nos dois sentidos.
    perform pg_temp.rec(v_pref || '/B1', 'editor de A nao le linha de B', 'OK:0',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('select 1 from public.%I where id = %L', t.tabela, v_row_b)));

    perform pg_temp.rec(v_pref || '/B2', 'editor de B nao le linha de A', 'OK:0',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_b, p.tenant_b),
        format('select 1 from public.%I where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/B3', 'CONTROLE: editor de A LE a linha de A', 'OK:1',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('select 1 from public.%I where id = %L', t.tabela, v_row_a)));

    -- Regra transversal: status <> active nao le nada, mesmo com permissao.
    perform pg_temp.rec(v_pref || '/B4', 'colaborador Afastado (COM can_edit) nao le', 'OK:0',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_leave_a, p.tenant_a),
        format('select 1 from public.%I where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/B5', 'usuario sem vinculo de escritorio nao le', 'OK:0',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_orphan, null),
        format('select 1 from public.%I where id = %L', t.tabela, v_row_a)));

    -- ---- Escrita presa a permissao do menu -----------------------------------

    perform pg_temp.rec(v_pref || '/C1', 'quem tem can_edit no menu CRIA', 'OK:1',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('insert into public.%I (tenant_id, %s) values (%L, %s)',
               t.tabela, t.insert_cols, p.tenant_a, t.insert_vals)));

    perform pg_temp.rec(v_pref || '/C2', 'quem tem can_edit no menu APAGA', 'OK:1',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('delete from public.%I where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/C3', 'quem tem apenas can_view NAO cria', 'ERR:42501',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_viewer_a, p.tenant_a),
        format('insert into public.%I (tenant_id, %s) values (%L, %s)',
               t.tabela, t.insert_cols, p.tenant_a, t.insert_vals)));

    perform pg_temp.rec(v_pref || '/C4', 'quem tem apenas can_view NAO apaga', 'OK:0',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_viewer_a, p.tenant_a),
        format('delete from public.%I where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/C5', 'CONTROLE: quem tem apenas can_view LE', 'OK:1',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_viewer_a, p.tenant_a),
        format('select 1 from public.%I where id = %L', t.tabela, v_row_a)));

    -- Escrita cruzada: WITH CHECK. Editor de A tem permissao de sobra no
    -- proprio escritorio - o que se afirma e que ele nao grava NO escritorio B.
    perform pg_temp.rec(v_pref || '/C6', 'editor de A nao grava com tenant_id de B', 'ERR:42501',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('insert into public.%I (tenant_id, %s) values (%L, %s)',
               t.tabela, t.insert_cols, p.tenant_b, t.insert_vals)));

    perform pg_temp.rec(v_pref || '/C7', 'editor de A nao move linha propria para B', 'ERR:42501',
      pg_temp.probe('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('update public.%I set tenant_id = %L where id = %L', t.tabela, p.tenant_b, v_row_a)));

    -- ---- Chave publicavel nao alcanca nada -----------------------------------

    perform pg_temp.rec(v_pref || '/D1', 'anon nao le', 'ERR:42501',
      pg_temp.probe('anon', null, format('select 1 from public.%I', t.tabela)));

    perform pg_temp.rec(v_pref || '/D2', 'anon nao grava', 'ERR:42501',
      pg_temp.probe('anon', null,
        format('insert into public.%I (tenant_id, %s) values (%L, %s)',
               t.tabela, t.insert_cols, p.tenant_a, t.insert_vals)));

    -- ---- A chave do menu e a certa -------------------------------------------
    --
    -- Sem este par, um helper que respondesse "tem alguma permissao de edicao"
    -- passaria em todos os casos C acima.
    perform pg_temp.rec(v_pref || '/E1', 'can_edit_menu(' || t.menu_key || ') = true para o editor', 'true',
      pg_temp.probe_val('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        format('select public.can_edit_menu(%L)::text', t.menu_key)));

    perform pg_temp.rec(v_pref || '/E2', 'can_edit_menu(' || t.menu_key || ') = false para o leitor', 'false',
      pg_temp.probe_val('authenticated', pg_temp.claims(p.u_viewer_a, p.tenant_a),
        format('select public.can_edit_menu(%L)::text', t.menu_key)));

    -- Chave de OUTRO menu para o mesmo editor. Sem este caso, um helper que
    -- respondesse "tem alguma permissao de edicao" passaria em E1, E2 e em
    -- todos os casos C. O editor tem permissao nos menus do registro e em
    -- nenhum outro - 'team' e do modulo 1 e nunca e concedido aqui.
    perform pg_temp.rec(v_pref || '/E3', 'can_edit_menu(team) = false para o editor (le o menu pedido)', 'false',
      pg_temp.probe_val('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        $q$select public.can_edit_menu('team')::text$q$));

    -- Chave inexistente falha alto: erro de digitacao na policy de um modulo
    -- novo nao pode virar "ninguem escreve isso, nunca" em silencio.
    perform pg_temp.rec(v_pref || '/E4', 'can_edit_menu com chave inexistente falha alto', 'ERR:22023',
      pg_temp.probe_val('authenticated', pg_temp.claims(p.u_editor_a, p.tenant_a),
        $q$select public.can_edit_menu('chave_que_nao_existe')::text$q$));
  end loop;
end
$$;

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
