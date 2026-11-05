-- O cofre da credencial do Asaas e a autenticação do aviso que chega.
--
-- O QUE A 0128 ESCREVEU, E O QUE ESTA SUÍTE PROVA
--   Seis funções `security definer`, com EXECUTE apenas para `service_role`, e
--   uma coluna que deixou de ser ponteiro de Vault para ser hash. É a camada em
--   que um descuido não aparece na tela: ninguém vê "a chave do escritório
--   vazou" nem "o aviso de pagamento não estava autenticado" olhando o sistema
--   funcionar.
--
--   1. NINGUÉM DE FORA DO SERVIDOR EXECUTA (seção 1): as seis funções, uma a
--      uma, chamadas como `authenticated` e como `anon`. Doze recusas de
--      privilégio, e nenhuma delas confundida com a recusa de AUTORIZAÇÃO que o
--      `connect` levanta: as duas são 42501, e `pg_temp.motivo` separa uma da
--      outra.
--   2. A CHAVE NÃO TEM CAMINHO DE TELA (seção 2): quem vê Configurações lê a
--      linha inteira da conexão e a chave não está em nenhuma coluna dela; o
--      Vault não é alcançável por ele; e nenhuma função `asaas%` tem EXECUTE
--      para `authenticated` ou `anon`.
--   3. O AVISO É AUTENTICADO PELO HASH (seção 3): token certo resolve o
--      escritório certo, token errado não resolve nada, o token de A não
--      resolve B, conexão com hash NULO não casa com token nenhum, e dois
--      escritórios não podem compartilhar o mesmo token. É a seção que o
--      mutante ataca.
--   4. QUEM PODE LIGAR E DESLIGAR (seção 4): Diretora entra pelo atalho de
--      cargo; quem tem `can_edit` em `settings` entra; quem só VÊ Configurações
--      NÃO entra; colega sem permissão não entra; e a Diretora do escritório
--      VIZINHO não entra, mesmo passando o uuid certo.
--   5. O DIAGNÓSTICO É COERENTE (seção 5): erro carimba, sucesso LIMPA o erro, e
--      o erro seguinte não apaga o último sucesso.
--   6. DESLIGAR NÃO DEIXA RESTO NEM LEVA DEMAIS (seção 6): o segredo do Vault
--      vai junto com a linha, e a cobrança e o espelho FICAM.
--   7. O CATÁLOGO (seção 7): as seis `security definer` com `search_path`
--      fixado e comentadas, `service_role` com EXECUTE nas seis (controle
--      positivo: suíte em que tudo é recusa passaria com nota cheia num módulo
--      que não funciona), a coluna nova com formato e unicidade, e o grant.
--
-- COMO RODAR
--   npm run test:asaas:conexao
--
-- POR QUE AS CHAMADAS QUE MUDAM ESTADO SÃO STATEMENT PRÓPRIO
--   Vários casos precisam do valor que a função devolveu E do estado que ela
--   deixou. Concatenar as duas coisas numa expressão só deixaria a ORDEM DE
--   AVALIAÇÃO decidir o resultado, e o Postgres não promete essa ordem. Então a
--   chamada vira um statement, o valor fica em `acc`, e o caso lê os dois.
--
-- RELAÇÃO COM A SUÍTE IRMÃ
--   supabase/tests/asaas-rls.sql (`npm run test:rls:asaas`) prova as policies da
--   0126: quem lê a cobrança, quem lê a conexão, e que ninguém escreve. Esta
--   aqui prova a 0128: o segredo e a autenticação do webhook. A fixture de lá já
--   acompanha a troca de coluna desta migration.
--
-- RESÍDUO
--   Nenhum: uma transação terminada em ROLLBACK. Os segredos criados no Vault
--   nascem aqui, o de A é apagado pelo próprio `asaas_disconnect` na seção 6 e o
--   de B cai no rollback.
--
--   ESTA SUÍTE NÃO ALTERA ESTRUTURA e não mexe em policy nenhuma: nenhum
--   `alter policy`, nenhum `grant`, nenhum `revoke`. O que ela faz de escrita é
--   chamar as funções da 0128 como o dono do banco, que é o que a Edge Function
--   fará como service_role.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

/* O acumulador: guarda o valor devolvido por uma chamada que mudou estado, para
   o caso poder afirmar o valor E o estado sem depender de ordem de avaliação. */
create temp table acc (k text primary key, v text) on commit drop;

create or replace function pg_temp.guarda(p_k text, p_v text)
returns void language plpgsql as $$
begin
  insert into acc(k, v) values (p_k, p_v)
  on conflict (k) do update set v = excluded.v;
end; $$;

create or replace function pg_temp.lido(p_k text)
returns text language sql as $$
  select coalesce((select v from acc where k = p_k), '<nao-guardado>')
$$;

/*
  AS DUAS RECUSAS DESTE ARQUIVO TÊM O MESMO SQLSTATE, e separá-las é o que dá
  sentido às seções 1 e 4. Falta de EXECUTE e `not_authorized` levantado por
  dentro da função são os dois 42501:

    ERR:EXECUTE         a barreira de privilégio recusou a CHAMADA. É o que a
                        seção 1 exige: a função não é alcançável de fora do
                        servidor, e o corpo dela nem roda.
    ERR:NOT_AUTHORIZED  a chamada passou e a REGRA DE PERMISSÃO recusou por
                        dentro. É o que a seção 4 exige de quem não pode editar
                        Configurações.

  Sem essa separação, um `grant execute to authenticated` esquecido passaria
  pela seção 1 inteira, porque a função recusaria de novo por autorização e o
  sqlstate seria o mesmo.
*/
create or replace function pg_temp.motivo(p_state text, p_msg text)
returns text language sql immutable as $$
  select case
    when p_state = '42501' and p_msg like 'permission denied for function%' then 'ERR:EXECUTE'
    when p_state = '42501' and p_msg = 'not_authorized' then 'ERR:NOT_AUTHORIZED'
    when p_state = '42501' and p_msg like '%row-level security%' then 'ERR:RLS'
    when p_state = '42501' then 'ERR:GRANT'
    else 'ERR:' || p_state
  end
$$;

/* Chama algo COMO o papel indicado, sem JWT: é assim que `authenticated` e
   `anon` chegam a uma função pela Data API quando o grant existe. */
create or replace function pg_temp.chama_como(p_role text, p_sql text)
returns text language plpgsql as $$
declare st text; msg text;
begin
  begin
    perform set_config('role', p_role, true);
    execute p_sql;
    perform set_config('role', 'postgres', true);
    return 'OK';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* O claim no lugar em que o PostgREST o põe. */
create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))
$$;

/* Lê um escalar COMO a pessoa logada. É o caminho de TELA, e é por ele que a
   seção 2 tenta alcançar a chave. */
create or replace function pg_temp.valor_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* Lê um escalar como o DONO do banco, que é o papel em que a Edge Function
   (service_role) executará estas funções. É aqui que `not_authorized` aparece. */
create or replace function pg_temp.chk(p_sql text)
returns text language plpgsql as $$
declare v text; st text; msg text;
begin
  begin
    execute p_sql into v;
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* Idem, para comando que não devolve dado (UPDATE, ou função `void`). */
create or replace function pg_temp.cmd(p_sql text)
returns text language plpgsql as $$
declare st text; msg text;
begin
  begin
    execute p_sql;
    return 'OK';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    return pg_temp.motivo(st, msg);
  end;
end; $$;

-- Fixtures ---------------------------------------------------------------------
--
-- OS ATORES SEPARAM VER DE EDITAR, que é o que esta suíte mais arrisca errar:
--   Dalva  Diretora de A, SEM uma linha em collaborator_permissions. Liga pelo
--          atalho de cargo que collaborator_can_edit_menu tem desde a 0085.
--   Carla  `settings` com can_view E can_edit. É quem liga pela tela.
--   Vera   `settings` com can_view e SEM can_edit. A atriz mais importante da
--          seção 4: ela LÊ a conexão e não pode ligar nem desligar. Sem ela,
--          uma função que conferisse can_VIEW passaria em toda a suíte.
--   Bruno  Arquiteto do próprio escritório, sem nenhuma linha de permissão.
--   Bia    Diretora de B, a atriz mais poderosa do outro lado da parede.

create temp table ids on commit drop as select
  'a1280000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'a1280000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'a1280000-0000-4000-8000-00000000001a'::uuid as user_dalva,
  'a1280000-0000-4000-8000-00000000002a'::uuid as user_carla,
  'a1280000-0000-4000-8000-00000000003a'::uuid as user_vera,
  'a1280000-0000-4000-8000-00000000004a'::uuid as user_bruno,
  'a1280000-0000-4000-8000-00000000001b'::uuid as user_bia,
  'a1280000-0000-4000-8000-0000000000c1'::uuid as col_dalva,
  'a1280000-0000-4000-8000-0000000000c2'::uuid as col_carla,
  'a1280000-0000-4000-8000-0000000000c3'::uuid as col_vera,
  'a1280000-0000-4000-8000-0000000000c4'::uuid as col_bruno,
  'a1280000-0000-4000-8000-0000000000d1'::uuid as col_bia,
  'a1280000-0000-4000-8000-0000000000e1'::uuid as cli_a,
  'a1280000-0000-4000-8000-0000000000f1'::uuid as ar_a1,
  'a1280000-0000-4000-8000-00000000b001'::uuid as cust_a,
  'a1280000-0000-4000-8000-00000000c001'::uuid as chg_a,
  /* Usuário que não é colaborador de escritório nenhum, e um uuid de escritório
     que não existe. */
  'a1280000-0000-4000-8000-0000000000ff'::uuid as user_ninguem,
  'a1280000-0000-4000-8000-0000000000fe'::uuid as tenant_fantasma;

/* As chaves e os tokens.
   OS TAMANHOS SÃO CALCULADOS, e não contados à mão: md5 devolve 32 caracteres
   hexadecimais, que é exatamente o piso que a doc do Asaas exige para o
   authToken. `token_curto` é o piso menos um, e `token_32` é o piso cravado -
   os dois existem para medir a borda da validação, não para parecer realista. */
create temp table vals on commit drop as select
  'aact_asaas_A_chave_de_teste_0128_' || md5('key-a')      as key_a,
  'aact_asaas_A_chave_NOVA_0128_'     || md5('key-a2')     as key_a2,
  'aact_asaas_B_chave_de_teste_0128_' || md5('key-b')      as key_b,
  'tok.a.' || md5('token-a')                               as token_a,
  'tok.b.' || md5('token-b')                               as token_b,
  'tok.x.' || md5('token-x')                               as token_errado,
  left('tok.curto.' || md5('token-curto'), 31)             as token_curto,
  md5('token-borda-32')                                    as token_32,
  'tok com espaco ' || md5('token-espaco')                 as token_espaco;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_dalva from ids) u, 'conexao-asaas-dalva@example.test' e
  union all select (select user_carla from ids), 'conexao-asaas-carla@example.test'
  union all select (select user_vera from ids),  'conexao-asaas-vera@example.test'
  union all select (select user_bruno from ids), 'conexao-asaas-bruno@example.test'
  union all select (select user_bia from ids),   'conexao-asaas-bia@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Conexao Asaas A', 'conexao-asaas-a'),
  ((select tenant_b from ids), 'Conexao Asaas B', 'conexao-asaas-b');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_dalva from ids), (select tenant_a from ids), (select user_dalva from ids),
   'Dalva Diretora', 'director', 'conexao-asaas-dalva@example.test', 'active'),
  ((select col_carla from ids), (select tenant_a from ids), (select user_carla from ids),
   'Carla Administrativo', 'admin_staff', 'conexao-asaas-carla@example.test', 'active'),
  ((select col_vera from ids), (select tenant_a from ids), (select user_vera from ids),
   'Vera Observadora', 'admin_staff', 'conexao-asaas-vera@example.test', 'active'),
  ((select col_bruno from ids), (select tenant_a from ids), (select user_bruno from ids),
   'Bruno Arquiteto', 'architect', 'conexao-asaas-bruno@example.test', 'active'),
  ((select col_bia from ids), (select tenant_b from ids), (select user_bia from ids),
   'Bia Diretora', 'director', 'conexao-asaas-bia@example.test', 'active');

/* A matriz. Carla pode editar, Vera apenas ver, Bruno não aparece, e Dalva não
   precisa aparecer. */
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_carla from ids), 'settings', true, true),
  ((select tenant_a from ids), (select col_vera from ids),  'settings', true, false);

/* O cliente, a parcela, o espelho e a cobrança existem para a seção 6: eles são
   o que NÃO pode ser levado pelo desligamento. */
insert into public.clients (id, tenant_id, name, phone, email, address_city, address_state) values
  ((select cli_a from ids), (select tenant_a from ids), 'Cliente Conexao A',
   '(62) 90128-0001', 'conexao-asaas-cli-a@example.test', 'Goiania', 'GO');

insert into public.accounts_receivable (id, tenant_id, client_id, description, value, due_date) values
  ((select ar_a1 from ids), (select tenant_a from ids), (select cli_a from ids),
   'Parcela 1/2 - projeto executivo', 1500.00, current_date + 15);

insert into public.asaas_customers (id, tenant_id, client_id, environment, asaas_customer_id) values
  ((select cust_a from ids), (select tenant_a from ids), (select cli_a from ids), 'sandbox', 'cus_128AAA001');

insert into public.asaas_charges
  (id, tenant_id, receivable_id, environment, asaas_payment_id, external_reference,
   status, billing_type, value, due_date, invoice_url, created_by_id) values
  ((select chg_a from ids), (select tenant_a from ids), (select ar_a1 from ids), 'sandbox',
   'pay_128AAA001', (select ar_a1::text from ids),
   'PENDING', 'PIX', 1500.00, current_date + 15,
   'https://sandbox.asaas.com/i/128aaa001', (select col_carla from ids));

-- 1. NINGUÉM DE FORA DO SERVIDOR EXECUTA: as seis, uma a uma ------------------
--
-- Os argumentos são VÁLIDOS de propósito: se a recusa pudesse vir de argumento
-- inválido, o caso provaria a validação e não o privilégio.

select pg_temp.rec('1.1', 'authenticated não executa asaas_connect', 'ERR:EXECUTE',
  pg_temp.chama_como('authenticated', format(
    $q$select public.asaas_connect(%L, %L, %L, 'sandbox')$q$,
    (select tenant_a from ids), (select user_dalva from ids), (select key_a from vals))));

select pg_temp.rec('1.2', 'authenticated não executa asaas_api_key', 'ERR:EXECUTE',
  pg_temp.chama_como('authenticated', format(
    'select public.asaas_api_key(%L)', (select tenant_a from ids))));

select pg_temp.rec('1.3', 'authenticated não executa asaas_set_webhook', 'ERR:EXECUTE',
  pg_temp.chama_como('authenticated', format(
    'select public.asaas_set_webhook(%L, %L, %L)',
    (select tenant_a from ids), 'wh_128a', (select token_a from vals))));

select pg_temp.rec('1.4', 'authenticated não executa asaas_resolve_webhook_token', 'ERR:EXECUTE',
  pg_temp.chama_como('authenticated', format(
    'select * from public.asaas_resolve_webhook_token(%L)', (select token_a from vals))));

select pg_temp.rec('1.5', 'authenticated não executa asaas_record_result', 'ERR:EXECUTE',
  pg_temp.chama_como('authenticated', format(
    'select public.asaas_record_result(%L, null)', (select tenant_a from ids))));

select pg_temp.rec('1.6', 'authenticated não executa asaas_disconnect', 'ERR:EXECUTE',
  pg_temp.chama_como('authenticated', format(
    'select public.asaas_disconnect(%L, %L)',
    (select tenant_a from ids), (select user_dalva from ids))));

select pg_temp.rec('1.7', 'anon não executa asaas_connect', 'ERR:EXECUTE',
  pg_temp.chama_como('anon', format(
    $q$select public.asaas_connect(%L, %L, %L, 'sandbox')$q$,
    (select tenant_a from ids), (select user_dalva from ids), (select key_a from vals))));

select pg_temp.rec('1.8', 'anon não executa asaas_api_key', 'ERR:EXECUTE',
  pg_temp.chama_como('anon', format(
    'select public.asaas_api_key(%L)', (select tenant_a from ids))));

select pg_temp.rec('1.9', 'anon não executa asaas_set_webhook', 'ERR:EXECUTE',
  pg_temp.chama_como('anon', format(
    'select public.asaas_set_webhook(%L, %L, %L)',
    (select tenant_a from ids), 'wh_128a', (select token_a from vals))));

select pg_temp.rec('1.10', 'anon não executa asaas_resolve_webhook_token', 'ERR:EXECUTE',
  pg_temp.chama_como('anon', format(
    'select * from public.asaas_resolve_webhook_token(%L)', (select token_a from vals))));

select pg_temp.rec('1.11', 'anon não executa asaas_record_result', 'ERR:EXECUTE',
  pg_temp.chama_como('anon', format(
    'select public.asaas_record_result(%L, null)', (select tenant_a from ids))));

select pg_temp.rec('1.12', 'anon não executa asaas_disconnect', 'ERR:EXECUTE',
  pg_temp.chama_como('anon', format(
    'select public.asaas_disconnect(%L, %L)',
    (select tenant_a from ids), (select user_dalva from ids))));

-- 2. A CHAVE DO ASAAS NÃO TEM CAMINHO DE TELA ---------------------------------

select pg_temp.rec('2.1', 'CONTROLE: escritório nasce sem conexão', '0',
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

/* A Diretora liga a conta. É o gesto que a Edge Function fará como
   service_role, depois de validar a chave contra a API do Asaas. */
select pg_temp.guarda('2.2', (select case when public.asaas_connect(
    (select tenant_a from ids), (select user_dalva from ids),
    (select key_a from vals), 'sandbox') is not null then '1' else '0' end));

select pg_temp.rec('2.2', 'CONTROLE: Dalva (Diretora) liga a conta, e a conexão nasce no ambiente pedido',
  '1|sandbox|1',
  pg_temp.lido('2.2') || '|' ||
  (select environment::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)) || '|' ||
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

/* O ROUND-TRIP DO VAULT: sem este controle, "a chave não aparece em lugar
   nenhum" passaria também se a chave simplesmente não tivesse sido guardada. */
select pg_temp.rec('2.3', 'CONTROLE: asaas_api_key devolve a chave guardada, decifrada do Vault', 'true',
  (select (public.asaas_api_key((select tenant_a from ids)) = (select key_a from vals))::text));

/* `strpos` e não LIKE: a chave tem `_`, que em LIKE é curinga. */
select pg_temp.rec('2.4', 'a chave NÃO aparece em nenhuma coluna da linha de conexão', '0',
  (select strpos(c::text, (select key_a from vals))::text
     from public.asaas_connections c where c.tenant_id = (select tenant_a from ids)));

/* O CAMINHO DE TELA, medido como tela: Carla LÊ a linha inteira (a policy da
   0126 permite) e a chave não está nela. */
select pg_temp.rec('2.5', 'Carla (vê Configurações) lê a linha inteira, e a chave não está lá', '1|0',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_connections where tenant_id = %L',
    (select tenant_a from ids)))
  || '|' ||
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids), format(
    'select coalesce(max(strpos(c::text, %L)), 0)::text from public.asaas_connections c where c.tenant_id = %L',
    (select key_a from vals), (select tenant_a from ids))));

select pg_temp.rec('2.6', 'e o Vault não é alcançável por ela: nem a lista de segredos, nem os decifrados',
  'ERR:GRANT|ERR:GRANT',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids),
    'select count(*)::text from vault.secrets')
  || '|' ||
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids),
    'select count(*)::text from vault.decrypted_secrets'));

/*
  QUEM DE FORA DO SERVIDOR EXECUTA FUNÇÃO `asaas%`, E A LISTA É DE UMA.

  A seção 1 testa as seis do cofre por nome; este caso fecha a porta para a
  OITAVA, a que alguém acrescentar depois sem reler este arquivo.

  A EXCEÇÃO TEM NOME, e tem de ter: `asaas_connection_status` (0129) é
  `authenticated` de propósito, porque é a pergunta que a tela de Contas a
  Receber faz antes de prometer baixa automática, e ela não toca no cofre nem
  devolve segredo - devolve o ambiente e um booleano. Este caso deixou de ser
  "nenhuma" e passou a ser "só ela", que é mais forte: pega tanto a função nova
  com EXECUTE indevido quanto o dia em que alguém revogar o EXECUTE DELA e
  quebrar a tela sem saber por quê.

  O `anon` continua em zero, e aí não há exceção nenhuma. A 0129 precisou de
  `revoke ... from anon` PRÓPRIO para isso, porque `revoke ... from public` não
  tira grant explícito, e o `alter default privileges` da plataforma dá um.
*/
select pg_temp.rec('2.7',
  'só asaas_connection_status é executável por authenticated, e o anon não executa nenhuma',
  '0|0|true',
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'asaas%'
      and p.proname <> 'asaas_connection_status'
      and has_function_privilege('authenticated', p.oid, 'execute'))
  || '|' ||
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'asaas%'
      and has_function_privilege('anon', p.oid, 'execute'))
  || '|' ||
  (select coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'execute')), false)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'asaas_connection_status'));

-- 3. O AVISO É AUTENTICADO PELO HASH ------------------------------------------
--
-- A SEÇÃO QUE O MUTANTE ATACA. Se a comparação de hash for quebrada, é aqui que
-- tem de cair: função de autenticação cujo teste passa com a conferência
-- quebrada é a pior coisa que pode existir neste módulo.

select pg_temp.rec('3.1', 'CONTROLE: sem webhook registrado, o hash do token e o id são NULOS', '<null>|<null>',
  coalesce((select webhook_token_hash from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>')
  || '|' ||
  coalesce((select asaas_webhook_id from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>'));

/*
  O ESTADO MAIS PERIGOSO DO FLUXO, medido ANTES de existir token: hash nulo
  significa "ainda não registrei webhook", e nesse estado NENHUM aviso pode ser
  confiado. Com o token certo, com o errado e com string vazia: as três têm de
  devolver vazio.
*/
select pg_temp.rec('3.2', 'conexão com hash NULO não casa com token nenhum, nem com string vazia, nem com nulo',
  '0|0|0|0',
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals)))
  || '|' ||
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_errado from vals)))
  || '|' ||
  pg_temp.chk($q$select count(*)::text from public.asaas_resolve_webhook_token('')$q$)
  || '|' ||
  pg_temp.chk('select count(*)::text from public.asaas_resolve_webhook_token(null)'));

select pg_temp.guarda('3.3', (select public.asaas_set_webhook(
    (select tenant_a from ids), 'wh_128a', (select token_a from vals))::text));

select pg_temp.rec('3.3', 'CONTROLE: registrar o webhook grava o id e o sha256 do token', 'true|wh_128a|true',
  pg_temp.lido('3.3') || '|' ||
  (select asaas_webhook_id from public.asaas_connections
    where tenant_id = (select tenant_a from ids)) || '|' ||
  (select (webhook_token_hash = encode(extensions.digest((select token_a from vals), 'sha256'), 'hex'))::text
     from public.asaas_connections where tenant_id = (select tenant_a from ids)));

/* O que ficou gravado NÃO é o token: se algum dia alguém trocar o hash pelo
   valor cru, este caso cai antes de a tela mostrar o token de ninguém. */
select pg_temp.rec('3.4', 'o que ficou gravado não é o token em texto', '0',
  (select strpos(c::text, (select token_a from vals))::text
     from public.asaas_connections c where c.tenant_id = (select tenant_a from ids)));

select pg_temp.rec('3.5', 'o token CERTO resolve o escritório certo, e o ambiente dele',
  (select tenant_a::text from ids) || '|sandbox',
  pg_temp.chk(format(
    $q$select tenant_id::text || '|' || environment::text from public.asaas_resolve_webhook_token(%L)$q$,
    (select token_a from vals))));

select pg_temp.rec('3.6', 'token ERRADO não resolve nada: nenhuma linha, e não um escritório qualquer', '0',
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_errado from vals))));

/* B liga a conta e registra o PRÓPRIO webhook: é o que permite os casos
   cruzados seguintes dizerem alguma coisa. */
select pg_temp.guarda('3.7a', (select case when public.asaas_connect(
    (select tenant_b from ids), (select user_bia from ids),
    (select key_b from vals), 'production') is not null then 'true' else 'false' end));

select pg_temp.guarda('3.7b', (select public.asaas_set_webhook(
    (select tenant_b from ids), 'wh_128b', (select token_b from vals))::text));

select pg_temp.rec('3.7', 'CONTROLE: B liga a conta (em produção) e registra o webhook dele', 'true|true',
  pg_temp.lido('3.7a') || '|' || pg_temp.lido('3.7b'));

select pg_temp.rec('3.8', 'o token de A resolve A e NÃO resolve B; o de B resolve B',
  (select tenant_a::text from ids) || '|' || (select tenant_b::text from ids),
  pg_temp.chk(format(
    'select tenant_id::text from public.asaas_resolve_webhook_token(%L)', (select token_a from vals)))
  || '|' ||
  pg_temp.chk(format(
    'select tenant_id::text from public.asaas_resolve_webhook_token(%L)', (select token_b from vals))));

select pg_temp.rec('3.9', 'e cada token resolve UMA linha só, nunca os dois escritórios', '1|1',
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals)))
  || '|' ||
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_b from vals))));

/* O ambiente vem da CONEXÃO, e não do aviso: B está em produção, A em sandbox.
   Resolver o escritório sem resolver o ambiente deixaria um aviso de sandbox
   baixar parcela em produção. */
select pg_temp.rec('3.10', 'o ambiente devolvido é o da conexão de cada um', 'sandbox|production',
  pg_temp.chk(format('select environment::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals)))
  || '|' ||
  pg_temp.chk(format('select environment::text from public.asaas_resolve_webhook_token(%L)',
    (select token_b from vals))));

select pg_temp.rec('3.11', 'token curto (31), com espaço, ou nulo é recusado com 22023',
  '31|ERR:22023|ERR:22023|ERR:22023',
  (select length(token_curto)::text from vals)
  || '|' ||
  pg_temp.chk(format('select public.asaas_set_webhook(%L, %L, %L)::text',
    (select tenant_a from ids), 'wh_128a', (select token_curto from vals)))
  || '|' ||
  pg_temp.chk(format('select public.asaas_set_webhook(%L, %L, %L)::text',
    (select tenant_a from ids), 'wh_128a', (select token_espaco from vals)))
  || '|' ||
  pg_temp.chk(format('select public.asaas_set_webhook(%L, %L, null)::text',
    (select tenant_a from ids), 'wh_128a')));

/* A BORDA DE CIMA DA RECUSA: 32 caracteres cravados é o que a doc do Asaas
   exige, e tem de PASSAR. Sem este caso, uma validação que pedisse 33 ou mais
   passaria em 3.11 e recusaria token legítimo em produção. Medido em B, e o
   token de B é restaurado no mesmo caso. */
select pg_temp.guarda('3.12a', (select public.asaas_set_webhook(
    (select tenant_b from ids), 'wh_128b', (select token_32 from vals))::text));

select pg_temp.guarda('3.12b', pg_temp.chk(format(
  'select tenant_id::text from public.asaas_resolve_webhook_token(%L)', (select token_32 from vals))));

select pg_temp.guarda('3.12c', (select public.asaas_set_webhook(
    (select tenant_b from ids), 'wh_128b', (select token_b from vals))::text));

select pg_temp.rec('3.12', 'token de 32 caracteres (o piso da doc) é ACEITO e autentica',
  '32|true|' || (select tenant_b::text from ids) || '|true|' || (select tenant_b::text from ids),
  (select length(token_32)::text from vals) || '|' ||
  pg_temp.lido('3.12a') || '|' || pg_temp.lido('3.12b') || '|' || pg_temp.lido('3.12c') || '|' ||
  pg_temp.chk(format('select tenant_id::text from public.asaas_resolve_webhook_token(%L)',
    (select token_b from vals))));

/* Dois escritórios com o MESMO token seria um aviso legítimo de um podendo
   baixar a parcela do outro. O índice único é parte da autenticação. */
select pg_temp.rec('3.13', 'dois escritórios não podem compartilhar o mesmo token', 'ERR:23505',
  pg_temp.chk(format('select public.asaas_set_webhook(%L, %L, %L)::text',
    (select tenant_b from ids), 'wh_128b', (select token_a from vals))));

select pg_temp.rec('3.14', 'registrar webhook em escritório sem conexão devolve false', 'false',
  pg_temp.chk(format('select public.asaas_set_webhook(%L, %L, %L)::text',
    (select tenant_fantasma from ids), 'wh_128z', (select token_errado from vals))));

/* TROCAR DE AMBIENTE DERRUBA O WEBHOOK: webhook de sandbox não existe em
   produção, e o token dele não pode seguir autenticando aviso. */
select pg_temp.guarda('3.15', (select case when public.asaas_connect(
    (select tenant_a from ids), (select user_dalva from ids),
    (select key_a from vals), 'production') is not null then 'true' else 'false' end));

select pg_temp.rec('3.15', 'reconectar em OUTRO ambiente zera o webhook, e o token antigo para de autenticar',
  'true|<null>|<null>|0',
  pg_temp.lido('3.15') || '|' ||
  coalesce((select webhook_token_hash from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>') || '|' ||
  coalesce((select asaas_webhook_id from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>') || '|' ||
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals))));

/* Volta ao sandbox e registra de novo: é o estado que as seções 5 e 6 medem. */
select pg_temp.guarda('3.16a', (select case when public.asaas_connect(
    (select tenant_a from ids), (select user_dalva from ids),
    (select key_a from vals), 'sandbox') is not null then 'true' else 'false' end));

select pg_temp.guarda('3.16b', (select public.asaas_set_webhook(
    (select tenant_a from ids), 'wh_128a', (select token_a from vals))::text));

select pg_temp.rec('3.16', 'CONTROLE: de volta ao sandbox e registrado de novo, o token autentica outra vez',
  'true|true|' || (select tenant_a::text from ids),
  pg_temp.lido('3.16a') || '|' || pg_temp.lido('3.16b') || '|' ||
  pg_temp.chk(format('select tenant_id::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals))));

/* Reconectar no MESMO ambiente PRESERVA o webhook: trocar uma chave vencida não
   pode obrigar a registrar webhook de novo. */
select pg_temp.guarda('3.17', (select case when public.asaas_connect(
    (select tenant_a from ids), (select user_carla from ids),
    (select key_a from vals), 'sandbox') is not null then 'true' else 'false' end));

select pg_temp.rec('3.17', 'reconectar no MESMO ambiente preserva o webhook registrado',
  'true|wh_128a|' || (select tenant_a::text from ids),
  pg_temp.lido('3.17') || '|' ||
  (select asaas_webhook_id from public.asaas_connections
    where tenant_id = (select tenant_a from ids)) || '|' ||
  pg_temp.chk(format('select tenant_id::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals))));

-- 4. QUEM PODE LIGAR E DESLIGAR -----------------------------------------------

select pg_temp.guarda('4.1', (select case when public.asaas_connect(
    (select tenant_a from ids), (select user_carla from ids),
    (select key_a2 from vals), 'sandbox') is not null then 'true' else 'false' end));

select pg_temp.rec('4.1', 'CONTROLE: Carla (can_edit em settings) liga a conta, e fica registrada como quem ligou',
  'true|' || (select col_carla::text from ids),
  pg_temp.lido('4.1') || '|' ||
  (select connected_by_id::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('4.2', 'e a reconexão TROCA o valor no Vault em vez de criar um segundo segredo', 'true|1|1',
  (select (public.asaas_api_key((select tenant_a from ids)) = (select key_a2 from vals))::text)
  || '|' ||
  (select count(*)::text from vault.secrets s
    where s.name = 'asaas_api_key:' || (select tenant_a::text from ids))
  || '|' ||
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

/* A ATRIZ MAIS IMPORTANTE DA SEÇÃO: Vera VÊ Configurações e não pode ligar. Uma
   função que conferisse can_view em vez de can_edit passaria em 4.1 e cairia
   aqui, e em nenhum outro lugar. */
select pg_temp.rec('4.3', 'Vera (só VÊ Configurações) não liga e não desliga',
  'ERR:NOT_AUTHORIZED|ERR:NOT_AUTHORIZED',
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, %L, 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_vera from ids), (select key_a from vals)))
  || '|' ||
  pg_temp.chk(format('select public.asaas_disconnect(%L, %L)::text',
    (select tenant_a from ids), (select user_vera from ids))));

select pg_temp.rec('4.4', 'Bruno (colega do próprio escritório, sem permissão) não liga e não desliga',
  'ERR:NOT_AUTHORIZED|ERR:NOT_AUTHORIZED',
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, %L, 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_bruno from ids), (select key_a from vals)))
  || '|' ||
  pg_temp.chk(format('select public.asaas_disconnect(%L, %L)::text',
    (select tenant_a from ids), (select user_bruno from ids))));

/* O CASO CENTRAL DO MULTITENANT NESTA CAMADA: Bia pode editar Configurações no
   escritório DELA, e isso não vale no de A. Sem o filtro por tenant_id no
   retorno de collaborator_can_edit_menu, este caso passaria a ligar a conta de
   A com a mão de B. */
select pg_temp.rec('4.5', 'Bia (Diretora de B) não liga nem desliga a conta de A, mesmo passando o uuid de A',
  'ERR:NOT_AUTHORIZED|ERR:NOT_AUTHORIZED',
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, %L, 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_bia from ids), (select key_b from vals)))
  || '|' ||
  pg_temp.chk(format('select public.asaas_disconnect(%L, %L)::text',
    (select tenant_a from ids), (select user_bia from ids))));

select pg_temp.rec('4.6', 'usuário que não é colaborador de escritório nenhum não liga', 'ERR:NOT_AUTHORIZED',
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, %L, 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_ninguem from ids), (select key_a from vals))));

select pg_temp.rec('4.7', 'chave em branco é recusada com 22023, mesmo para quem PODE ligar',
  'ERR:22023|ERR:22023',
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, '', 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_carla from ids)))
  || '|' ||
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, '   ', 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_carla from ids))));

/* A ORDEM IMPORTA: quem não pode ligar não tem direito nem a saber se a chave
   que mandou era aceita. Bruno com chave em branco recebe a recusa de
   AUTORIZAÇÃO, e não a de formato. */
select pg_temp.rec('4.8', 'e quem não pode ligar recebe a recusa de autorização ANTES da de formato',
  'ERR:NOT_AUTHORIZED',
  pg_temp.chk(format(
    $q$select public.asaas_connect(%L, %L, '', 'sandbox')::text$q$,
    (select tenant_a from ids), (select user_bruno from ids))));

select pg_temp.rec('4.9', 'e nada disso mexeu na conexão: a chave segue a de Carla, com o webhook dela',
  'true|wh_128a|1|' || (select tenant_a::text from ids),
  (select (public.asaas_api_key((select tenant_a from ids)) = (select key_a2 from vals))::text)
  || '|' ||
  (select asaas_webhook_id from public.asaas_connections
    where tenant_id = (select tenant_a from ids))
  || '|' ||
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids))
  || '|' ||
  pg_temp.chk(format('select tenant_id::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals))));

-- 5. O DIAGNÓSTICO: erro carimba, sucesso limpa -------------------------------
--
-- last_error é a ÚNICA coluna deste módulo que a tela de Configurações lê
-- (asaas_webhook_events não tem policy nem grant, decisão da 0126). Por isso
-- esta função tem dois usos: erro de conversa com a API do Asaas E falha no
-- processamento de um aviso. Estado incoerente aqui é o escritório não ficando
-- sabendo de nenhum dos dois.

select pg_temp.guarda('5.1', pg_temp.cmd(format(
  $q$select public.asaas_record_result(%L, 'invalid_api_key')$q$, (select tenant_a from ids))));

select pg_temp.rec('5.1', 'erro carimba last_error e last_error_at, e não inventa sucesso',
  'OK|invalid_api_key|true|<null>',
  pg_temp.lido('5.1') || '|' ||
  coalesce((select last_error from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>') || '|' ||
  (select (last_error_at is not null)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)) || '|' ||
  coalesce((select last_success_at::text from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>'));

/* SUCESSO LIMPA O ERRO. Erro que sobrevive ao sucesso seguinte faz a tela
   mostrar problema que não existe mais, e quem olha para de acreditar no
   campo. */
select pg_temp.guarda('5.2', pg_temp.cmd(format(
  'select public.asaas_record_result(%L, null)', (select tenant_a from ids))));

select pg_temp.rec('5.2', 'sucesso carimba last_success_at e LIMPA o erro e a data dele',
  'OK|<null>|<null>|true',
  pg_temp.lido('5.2') || '|' ||
  coalesce((select last_error from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>') || '|' ||
  coalesce((select last_error_at::text from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>') || '|' ||
  (select (last_success_at is not null)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

/* O SEGUNDO USO, decidido pelo usuário: a falha de PROCESSAMENTO de um aviso
   chega ao escritório por aqui. E o último sucesso NÃO é apagado por ela: "não
   funciona desde sempre" e "funcionou e parou" são diagnósticos diferentes. */
select pg_temp.guarda('5.3', pg_temp.cmd(format(
  $q$select public.asaas_record_result(%L, 'falha ao aplicar PAYMENT_RECEIVED')$q$,
  (select tenant_a from ids))));

select pg_temp.rec('5.3', 'erro no processamento de um aviso carimba sem apagar o último sucesso',
  'OK|falha ao aplicar PAYMENT_RECEIVED|true|true',
  pg_temp.lido('5.3') || '|' ||
  coalesce((select last_error from public.asaas_connections
             where tenant_id = (select tenant_a from ids)), '<null>') || '|' ||
  (select (last_error_at is not null)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)) || '|' ||
  (select (last_success_at is not null)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

select pg_temp.rec('5.4', 'carimbar escritório sem conexão não explode e não cria linha', 'OK|0',
  pg_temp.cmd(format($q$select public.asaas_record_result(%L, 'x')$q$,
    (select tenant_fantasma from ids)))
  || '|' ||
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_fantasma from ids)));

select pg_temp.rec('5.5', 'e o carimbo não atravessa a parede: a conexão de B ficou intacta',
  '<null>|<null>',
  coalesce((select last_error from public.asaas_connections
             where tenant_id = (select tenant_b from ids)), '<null>')
  || '|' ||
  coalesce((select last_success_at::text from public.asaas_connections
             where tenant_id = (select tenant_b from ids)), '<null>'));

-- 6. DESLIGAR: sem segredo órfão, e sem levar a cobrança ----------------------

select pg_temp.rec('6.1', 'CONTROLE: antes de desligar há 1 conexão, 1 segredo no Vault, 1 cobrança e 1 espelho',
  '1|1|1|1',
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids))
  || '|' ||
  (select count(*)::text from vault.secrets s
    where s.name = 'asaas_api_key:' || (select tenant_a::text from ids))
  || '|' ||
  (select count(*)::text from public.asaas_charges
    where tenant_id = (select tenant_a from ids))
  || '|' ||
  (select count(*)::text from public.asaas_customers
    where tenant_id = (select tenant_a from ids)));

select pg_temp.guarda('6.2', (select public.asaas_disconnect(
    (select tenant_a from ids), (select user_dalva from ids))::text));

select pg_temp.rec('6.2', 'Dalva desliga, e a linha de conexão vai embora', 'true|0',
  pg_temp.lido('6.2') || '|' ||
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_a from ids)));

/* O SEGREDO VAI JUNTO. Apagar só a linha deixaria a API Key viva no Vault, sem
   dono e sem nada que a mencione: a pior forma de credencial esquecida. */
select pg_temp.rec('6.3', 'e o segredo do Vault vai junto: nenhum órfão', '0',
  (select count(*)::text from vault.secrets s
    where s.name = 'asaas_api_key:' || (select tenant_a::text from ids)));

/* DECISÃO DO USUÁRIO, e é o caso que impede alguém de "limpar" o módulo no
   desligamento: cobrança emitida existe no Asaas independente da nossa conexão,
   e apagar o espelho faria o sistema esquecer que já criou aquele cliente lá,
   criando um segundo cus_ na reconexão. */
select pg_temp.rec('6.4', 'a cobrança e o espelho do cliente FICAM, e intactos', '1|PENDING|1|cus_128AAA001',
  (select count(*)::text from public.asaas_charges
    where tenant_id = (select tenant_a from ids))
  || '|' ||
  (select status from public.asaas_charges where id = (select chg_a from ids))
  || '|' ||
  (select count(*)::text from public.asaas_customers
    where tenant_id = (select tenant_a from ids))
  || '|' ||
  (select asaas_customer_id from public.asaas_customers where id = (select cust_a from ids)));

select pg_temp.rec('6.5', 'depois de desligar, a chave não é mais legível e o token não autentica mais',
  '<null>|0',
  coalesce((select public.asaas_api_key((select tenant_a from ids))), '<null>')
  || '|' ||
  pg_temp.chk(format('select count(*)::text from public.asaas_resolve_webhook_token(%L)',
    (select token_a from vals))));

select pg_temp.rec('6.6', 'desligar de novo devolve false, sem erro', 'false',
  pg_temp.chk(format('select public.asaas_disconnect(%L, %L)::text',
    (select tenant_a from ids), (select user_dalva from ids))));

/* A PAREDE CONTINUA EM PÉ depois do desligamento de A: B segue ligado, com
   chave e token próprios. Sem este caso, um disconnect que apagasse a conexão
   de todo mundo passaria em 6.2 e 6.3. */
select pg_temp.rec('6.7', 'e o escritório B segue ligado, com a chave e o token dele',
  '1|true|' || (select tenant_b::text from ids),
  (select count(*)::text from public.asaas_connections
    where tenant_id = (select tenant_b from ids))
  || '|' ||
  (select (public.asaas_api_key((select tenant_b from ids)) = (select key_b from vals))::text)
  || '|' ||
  pg_temp.chk(format('select tenant_id::text from public.asaas_resolve_webhook_token(%L)',
    (select token_b from vals))));

-- 7. O CATÁLOGO ----------------------------------------------------------------

select pg_temp.rec('7.1', 'as seis funções são security definer com search_path fixado', '6',
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('asaas_connect','asaas_api_key','asaas_set_webhook',
                        'asaas_resolve_webhook_token','asaas_record_result','asaas_disconnect')
      and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')));

/* Regra da casa: função sem COMMENT é função cuja intenção mora na cabeça de
   quem a escreveu. Aqui o comentário carrega decisões que não estão no corpo (o
   segundo uso do record_result, o que o disconnect NÃO apaga). */
select pg_temp.rec('7.2', 'as seis têm COMMENT', '6',
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('asaas_connect','asaas_api_key','asaas_set_webhook',
                        'asaas_resolve_webhook_token','asaas_record_result','asaas_disconnect')
      and obj_description(p.oid, 'pg_proc') is not null));

/* CONTROLE POSITIVO DO ARQUIVO INTEIRO: service_role executa as seis. Sem ele,
   uma camada que não concedesse EXECUTE a ninguém passaria nas seções 1 e 2 e a
   integração simplesmente não funcionaria. */
select pg_temp.rec('7.3', 'service_role executa as seis', '6',
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('asaas_connect','asaas_api_key','asaas_set_webhook',
                        'asaas_resolve_webhook_token','asaas_record_result','asaas_disconnect')
      and has_function_privilege('service_role', p.oid, 'execute')));

select pg_temp.rec('7.4', 'webhook_token_secret_id não existe mais, e webhook_token_hash existe', '0|1',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'asaas_connections'
      and column_name = 'webhook_token_secret_id')
  || '|' ||
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'asaas_connections'
      and column_name = 'webhook_token_hash'));

select pg_temp.rec('7.5', 'o hash tem check de formato (64 hex) e índice único', 'true|true',
  (select exists (select 1 from pg_constraint
    where conrelid = 'public.asaas_connections'::regclass
      and conname = 'asaas_connections_webhook_token_hash_format_check'
      and contype = 'c')::text)
  || '|' ||
  (select exists (select 1 from pg_constraint
    where conrelid = 'public.asaas_connections'::regclass
      and conname = 'asaas_connections_webhook_token_hash_key'
      and contype = 'u')::text));

/* Hash truncado, ou texto cru gravado por engano, falha na ESCRITA. Sem o
   formato no check isso viraria um token que nunca casa e que ninguém entende
   por quê - erro que se parece com dado. */
select pg_temp.rec('7.6', 'hash fora do formato é recusado com 23514', 'ERR:23514|ERR:23514',
  pg_temp.cmd(format(
    $q$update public.asaas_connections set webhook_token_hash = 'nao-e-hash' where tenant_id = %L$q$,
    (select tenant_b from ids)))
  || '|' ||
  pg_temp.cmd(format(
    $q$update public.asaas_connections set webhook_token_hash = 'abc123' where tenant_id = %L$q$,
    (select tenant_b from ids))));

/*
  A DECISÃO DE GRANT DESTA MIGRATION, afirmada no teste para não virar descuido
  silencioso: o grant em asaas_connections continua sendo de TABELA e só de
  SELECT, como a 0126 escreveu e como a 0085 faz com integration_api_keys (onde
  key_hash também fica dentro do grant). Logo webhook_token_hash É legível por
  quem vê Configurações no próprio escritório, e isso é inofensivo: sha256 não
  volta, e forjar um aviso exige o token em TEXTO no cabeçalho.
  Se este caso cair, foi porque alguém trocou o grant. A troca pode estar certa,
  mas tem de ser deliberada.
*/
select pg_temp.rec('7.7', 'o grant de tabela para authenticated segue SELECT, com o hash dentro dele e sem escrita',
  'SELECT|true|false|false',
  coalesce((select string_agg(distinct privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'asaas_connections'
      and grantee = 'authenticated'), '<null>')
  || '|' ||
  has_column_privilege('authenticated', 'public.asaas_connections', 'webhook_token_hash', 'select')::text
  || '|' ||
  has_column_privilege('authenticated', 'public.asaas_connections', 'webhook_token_hash', 'update')::text
  || '|' ||
  has_column_privilege('anon', 'public.asaas_connections', 'webhook_token_hash', 'select')::text);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
