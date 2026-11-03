-- O isolamento do Asaas: cobrança se lê, cobrança não se escreve, e o diário do
-- provedor ninguém vê.
--
-- O QUE A 0126 ESCREVEU, E O QUE ESTA SUÍTE PROVA
--   Três policies, todas de SELECT, e nenhuma de escrita em nenhuma das quatro
--   tabelas. É um desenho em que quase tudo é ausência, e ausência é exatamente
--   o que passa despercebido: antes da 0126 as quatro tabelas estavam fechadas
--   pelas duas barreiras (sem policy e sem grant), então TODOS os casos
--   negativos deste arquivo já passavam. Por isso cada negativa tem controle
--   positivo ao lado, e a seção 6 existe inteira para impedir que a suíte passe
--   com nota cheia num módulo que não funciona.
--
--   1. LER A COBRANÇA E O ESPELHO (seção 1): quem vê o menu `receivables` lê as
--      duas no próprio escritório; o escritório vizinho não lê nada; colega do
--      PRÓPRIO escritório sem o menu não lê; Diretor lê pelo atalho que
--      can_view_menu já tem; Afastada COM a permissão gravada não lê; claim de
--      tenant forjado e sessão sem claim não alcançam nada; `anon` não toca.
--   2. LER A CONEXÃO (seção 2): é o menu `settings`, e NÃO o mesmo da cobrança.
--      O caso 2.3 é o que separa os dois: quem vê o financeiro não vê a conexão,
--      e quem vê Configurações não vê a cobrança (1.8). Uma policy que
--      perguntasse o menu errado passaria em quase tudo e morreria nesses dois.
--   3. NÃO ESCREVER A COBRANÇA (seção 3): os TRÊS verbos, em cada tabela, e nos
--      dois campos que têm consequência em dinheiro - `status` virando RECEIVED
--      sem um centavo ter entrado, e `deleted` liberando a parcela para uma
--      segunda cobrança do mesmo valor. Inclusive para a Diretora: o atalho dela
--      é de leitura, e a seção prova que ele não virou escrita de carona.
--   4. O DIÁRIO DOS AVISOS (seção 4): `authenticated` não lê, não escreve e não
--      apaga nada de asaas_webhook_events, nem do próprio escritório. O caso 4.7
--      é indispensável: ele mede, como postgres, que o evento EXISTE - negativa
--      que passa porque a tabela estava vazia pareceria acerto.
--   5. O CATÁLOGO (seção 5): exatamente três policies, as três de SELECT, as
--      três `to authenticated`, as três comentadas; nenhuma de escrita, nenhuma
--      em asaas_webhook_events; grant de tabela só de SELECT em três e nada na
--      quarta; `anon` sem nada nas quatro.
--   6. service_role CONTINUA TRABALHANDO (seção 6): ele lê os dois escritórios
--      (é bypass, por desenho) e faz nas quatro tabelas o que a Edge Function
--      precisa fazer - emitir, aplicar aviso do webhook, remover cobrança,
--      espelhar cliente, carimbar a conexão e desconectar. Sem esta seção, uma
--      RLS que trancasse tudo passaria em 1 a 5 e o módulo simplesmente não
--      funcionaria.
--
-- COMO RODAR
--   npm run test:rls:asaas
--
-- RESÍDUO
--   Nenhum: uma transação terminada em ROLLBACK. Os dois escritórios, as
--   pessoas, os clientes, as parcelas, as conexões, os espelhos, as cobranças e
--   os eventos nascem aqui.
--
--   ESTA SUÍTE NÃO ALTERA ESTRUTURA, e a ausência de trava de ambiente é
--   decisão: notificacoes-rls.sql recusa rodar em produção porque ALARGA policy
--   dentro da transação para medir o `with check`, e entre um `alter policy` e o
--   seguinte uma requisição de verdade veria a policy larga. Aqui não há
--   `alter policy`, nem `grant`, nem `revoke`: a 0126 não tem policy de escrita
--   para alargar. As sondas de service_role da seção 6 escrevem e desfazem
--   dentro de subtransação própria, e o resto é leitura.
--
--   Nenhuma contagem absoluta sobre as quatro tabelas: tudo é recortado pelos
--   ids da fixture, para a suíte não passar hoje e falhar no dia em que o
--   escritório tiver cobrança de verdade.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

/* O claim no lugar em que o PostgREST o põe. `tenant` nulo = sessão de quem não
   está vinculado a escritório nenhum (o hook da 0006 remove o claim nesse caso). */
create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', case when p_tenant is null then '{}'::jsonb
                         else jsonb_build_object('tenant_id', p_tenant::text) end)
$$;

/*
  AS DUAS RECUSAS TÊM O MESMO SQLSTATE, e distinguir uma da outra é o que dá
  sentido à seção 3. Privilégio ausente e violação de policy são os dois 42501.
  Nesta suíte o esperado é SEMPRE ERR:GRANT nas escritas, e isso é afirmação
  forte: significa que a recusa vem da barreira que opina ANTES da RLS, ou seja,
  que não existe nem grant nem policy de escrita. ERR:RLS aqui seria notícia -
  quereria dizer que alguém concedeu o privilégio e deixou a policy segurando.
*/
create or replace function pg_temp.motivo(p_state text, p_msg text)
returns text language sql immutable as $$
  select case
    when p_msg like '%row-level security%' then 'ERR:RLS'
    when p_state = '42501' then 'ERR:GRANT'
    else 'ERR:' || p_state
  end
$$;

/* Lê um valor COMO a pessoa logada. */
create or replace function pg_temp.valor_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* Escreve COMO a pessoa logada, e devolve quantas linhas o comando alcançou.
   NÃO desfaz o que porventura passar, de propósito: é o que permite o caso
   seguinte afirmar que a cobrança continua PENDING depois das tentativas. OK:0
   seria recusa silenciosa de RLS; nesta suíte nem isso acontece, porque falta o
   privilégio e o comando morre antes. */
create or replace function pg_temp.exec_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return 'OK:' || n;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

create or replace function pg_temp.como_anon(p_sql text)
returns text language plpgsql as $$
declare n int; st text; msg text;
begin
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return 'OK:' || n;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* Lê COMO service_role: é o papel das Edge Functions, e ele é bypass de RLS por
   desenho. Nenhuma das três policies da 0126 se aplica a ele - as três são
   `to authenticated`. */
create or replace function pg_temp.valor_service(p_sql text)
returns text language plpgsql as $$
declare v text; st text; msg text;
begin
  begin
    perform set_config('role', 'service_role', true);
    perform set_config('request.jwt.claims', '', true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/*
  Escreve COMO service_role e DESFAZ, sempre.
  A escrita acontece dentro de uma subtransação que termina em exceção de
  propósito (errcode RL001, idioma da sonda de crm-rls.sql): o número de linhas
  viaja na mensagem e o efeito é descartado. Sem isso, o controle positivo da
  seção 6 mudaria o estado que as seções 1 a 5 medem, e o arquivo passaria a
  depender da ordem em que foi escrito.
*/
create or replace function pg_temp.exec_service(p_sql text)
returns text language plpgsql as $$
declare n int; st text; msg text; v_out text;
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception using errcode = 'RL001', message = n::text;
  exception
    when sqlstate 'RL001' then
      get stacked diagnostics msg = message_text;
      v_out := 'OK:' || msg;
    when others then
      get stacked diagnostics st = returned_sqlstate, msg = message_text;
      v_out := pg_temp.motivo(st, msg);
  end;
  perform set_config('role', 'postgres', true);
  return v_out;
end; $$;

/* Volta a ser "sem sessão": é o seed, a Edge Function, o script de correção. */
create or replace function pg_temp.sem_sessao()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;

-- Fixtures ---------------------------------------------------------------------
--
-- OS ATORES SÃO ESCOLHIDOS PARA SEPARAR OS DOIS MENUS, que é o que esta suíte
-- mais arrisca errar:
--   Ana   vê `receivables` e NÃO vê `settings`  -> lê cobrança, não lê conexão
--   Carla vê `settings` e NÃO vê `receivables`  -> lê conexão, não lê cobrança
-- Com um único ator que visse os dois, uma policy que perguntasse o menu errado
-- passaria em toda a suíte.
--
--   Bruno é Arquiteto sem UMA LINHA de permissão: é o colega do próprio
--     escritório, o caso que prova que a leitura não é larga como no resto do
--     sistema.
--   Dalva é Diretora de A e não tem nenhuma linha em collaborator_permissions
--     (o caso 1.9b mede essa ausência): ela lê pelo atalho de cargo que
--     can_view_menu tem desde a 0059, e não por permissão gravada.
--   Elza está Afastada COM `receivables` e `settings` gravados, e é ela que
--     discrimina: sem a permissão na matriz, "afastada não lê porque está
--     afastada" e "não lê porque não tem permissão" dariam o mesmo resultado.
--   Bia é Diretora do escritório B - o ator mais poderoso do outro lado da
--     parede.

create temp table ids on commit drop as select
  'a1260000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'a1260000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'a1260000-0000-4000-8000-00000000001a'::uuid as user_ana,
  'a1260000-0000-4000-8000-00000000002a'::uuid as user_carla,
  'a1260000-0000-4000-8000-00000000003a'::uuid as user_bruno,
  'a1260000-0000-4000-8000-00000000004a'::uuid as user_dalva,
  'a1260000-0000-4000-8000-00000000005a'::uuid as user_elza,
  'a1260000-0000-4000-8000-00000000001b'::uuid as user_bia,
  'a1260000-0000-4000-8000-0000000000c1'::uuid as col_ana,
  'a1260000-0000-4000-8000-0000000000c2'::uuid as col_carla,
  'a1260000-0000-4000-8000-0000000000c3'::uuid as col_bruno,
  'a1260000-0000-4000-8000-0000000000c4'::uuid as col_dalva,
  'a1260000-0000-4000-8000-0000000000c5'::uuid as col_elza,
  'a1260000-0000-4000-8000-0000000000d1'::uuid as col_bia,
  'a1260000-0000-4000-8000-0000000000e1'::uuid as cli_a,
  'a1260000-0000-4000-8000-0000000000e2'::uuid as cli_b,
  'a1260000-0000-4000-8000-0000000000f1'::uuid as ar_a1,
  'a1260000-0000-4000-8000-0000000000f2'::uuid as ar_a2,
  'a1260000-0000-4000-8000-0000000000f3'::uuid as ar_b1,
  'a1260000-0000-4000-8000-00000000a001'::uuid as conn_a,
  'a1260000-0000-4000-8000-00000000a002'::uuid as conn_b,
  'a1260000-0000-4000-8000-00000000b001'::uuid as cust_a,
  'a1260000-0000-4000-8000-00000000b002'::uuid as cust_b,
  'a1260000-0000-4000-8000-00000000c001'::uuid as chg_a,
  'a1260000-0000-4000-8000-00000000c002'::uuid as chg_b,
  'a1260000-0000-4000-8000-00000000d001'::uuid as evt_a,
  'a1260000-0000-4000-8000-00000000d002'::uuid as evt_b,
  /* Ponteiros de Vault de mentira: a coluna é um uuid sem FK de propósito (o
     segredo mora no Vault, e esta suíte não cria segredo nenhum). O que importa
     aqui é que o uuid seja LEGÍVEL por quem vê Configurações e inútil para
     qualquer outra coisa. */
  'a1260000-0000-4000-8000-00000000e001'::uuid as vault_a,
  'a1260000-0000-4000-8000-00000000e002'::uuid as vault_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_ana from ids) u, 'rls-asaas-ana@example.test' e
  union all select (select user_carla from ids), 'rls-asaas-carla@example.test'
  union all select (select user_bruno from ids), 'rls-asaas-bruno@example.test'
  union all select (select user_dalva from ids), 'rls-asaas-dalva@example.test'
  union all select (select user_elza from ids), 'rls-asaas-elza@example.test'
  union all select (select user_bia from ids), 'rls-asaas-bia@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'RLS Asaas A', 'rls-asaas-a'),
  ((select tenant_b from ids), 'RLS Asaas B', 'rls-asaas-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select user_ana from ids), 'member'),
  ((select tenant_a from ids), (select user_carla from ids), 'member'),
  ((select tenant_a from ids), (select user_bruno from ids), 'member'),
  ((select tenant_a from ids), (select user_dalva from ids), 'owner'),
  ((select tenant_a from ids), (select user_elza from ids), 'member'),
  ((select tenant_b from ids), (select user_bia from ids), 'owner');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_ana from ids), (select tenant_a from ids), (select user_ana from ids),
   'Ana Financeiro', 'admin_staff', 'rls-asaas-ana@example.test', 'active'),
  ((select col_carla from ids), (select tenant_a from ids), (select user_carla from ids),
   'Carla Administrativo', 'admin_staff', 'rls-asaas-carla@example.test', 'active'),
  ((select col_bruno from ids), (select tenant_a from ids), (select user_bruno from ids),
   'Bruno Arquiteto', 'architect', 'rls-asaas-bruno@example.test', 'active'),
  ((select col_dalva from ids), (select tenant_a from ids), (select user_dalva from ids),
   'Dalva Diretora', 'director', 'rls-asaas-dalva@example.test', 'active'),
  ((select col_elza from ids), (select tenant_a from ids), (select user_elza from ids),
   'Elza Afastada', 'admin_staff', 'rls-asaas-elza@example.test', 'on_leave'),
  ((select col_bia from ids), (select tenant_b from ids), (select user_bia from ids),
   'Bia Diretora', 'director', 'rls-asaas-bia@example.test', 'active');

/* A matriz, e ela é o coração da fixture. Ana e Carla têm UM menu cada, e são
   menus diferentes. Elza tem os DOIS e está afastada. Dalva não aparece aqui de
   propósito. */
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_ana from ids),   'receivables', true, true),
  ((select tenant_a from ids), (select col_carla from ids), 'settings',    true, true),
  ((select tenant_a from ids), (select col_elza from ids),  'receivables', true, true),
  ((select tenant_a from ids), (select col_elza from ids),  'settings',    true, true),
  ((select tenant_b from ids), (select col_bia from ids),   'receivables', true, true);

insert into public.clients (id, tenant_id, name, phone, email, address_city, address_state) values
  ((select cli_a from ids), (select tenant_a from ids), 'Cliente Asaas A',
   '(62) 90126-0001', 'rls-asaas-cli-a@example.test', 'Goiania', 'GO'),
  ((select cli_b from ids), (select tenant_b from ids), 'Cliente Asaas B',
   '(62) 90126-0002', 'rls-asaas-cli-b@example.test', 'Goiania', 'GO');

/* ar_a2 existe para a seção 6: o índice único parcial da 0125 só deixa UMA
   cobrança viva por parcela, então o insert de service_role precisa de uma
   parcela sem cobrança. */
insert into public.accounts_receivable (id, tenant_id, client_id, description, value, due_date) values
  ((select ar_a1 from ids), (select tenant_a from ids), (select cli_a from ids),
   'Parcela 1/3 - projeto executivo', 1200.00, current_date + 10),
  ((select ar_a2 from ids), (select tenant_a from ids), (select cli_a from ids),
   'Parcela 2/3 - projeto executivo', 1200.00, current_date + 40),
  ((select ar_b1 from ids), (select tenant_b from ids), (select cli_b from ids),
   'Parcela unica - estudo preliminar', 800.00, current_date + 10);

insert into public.asaas_connections
  (id, tenant_id, environment, api_key_secret_id, webhook_token_secret_id, asaas_webhook_id, connected_by_id, last_error) values
  ((select conn_a from ids), (select tenant_a from ids), 'sandbox',
   (select vault_a from ids), (select vault_a from ids), 'wh_126a',
   (select col_dalva from ids), 'invalid_api_key'),
  ((select conn_b from ids), (select tenant_b from ids), 'sandbox',
   (select vault_b from ids), (select vault_b from ids), 'wh_126b',
   (select col_bia from ids), null);

insert into public.asaas_customers (id, tenant_id, client_id, environment, asaas_customer_id) values
  ((select cust_a from ids), (select tenant_a from ids), (select cli_a from ids), 'sandbox', 'cus_126AAA001'),
  ((select cust_b from ids), (select tenant_b from ids), (select cli_b from ids), 'sandbox', 'cus_126BBB001');

insert into public.asaas_charges
  (id, tenant_id, receivable_id, environment, asaas_payment_id, external_reference,
   status, billing_type, value, due_date, invoice_url, created_by_id) values
  ((select chg_a from ids), (select tenant_a from ids), (select ar_a1 from ids), 'sandbox',
   'pay_126AAA001', (select ar_a1::text from ids),
   'PENDING', 'PIX', 1200.00, current_date + 10,
   'https://sandbox.asaas.com/i/126aaa001', (select col_ana from ids)),
  ((select chg_b from ids), (select tenant_b from ids), (select ar_b1 from ids), 'sandbox',
   'pay_126BBB001', (select ar_b1::text from ids),
   'PENDING', 'BOLETO', 800.00, current_date + 10,
   'https://sandbox.asaas.com/i/126bbb001', (select col_bia from ids));

insert into public.asaas_webhook_events (id, tenant_id, asaas_event_id, event_name, payload) values
  ((select evt_a from ids), (select tenant_a from ids),
   'evt_126aaa0000000000000000000000001&1', 'PAYMENT_RECEIVED',
   jsonb_build_object(
     'id', 'evt_126aaa0000000000000000000000001&1',
     'event', 'PAYMENT_RECEIVED',
     'account', jsonb_build_object('id', '47ed0d25-126a-4000-8000-000000000001', 'ownerId', null),
     'payment', jsonb_build_object('id', 'pay_126AAA001', 'value', 1200.00, 'status', 'RECEIVED'))),
  ((select evt_b from ids), (select tenant_b from ids),
   'evt_126bbb0000000000000000000000001&1', 'PAYMENT_RECEIVED',
   jsonb_build_object(
     'id', 'evt_126bbb0000000000000000000000001&1',
     'event', 'PAYMENT_RECEIVED',
     'account', jsonb_build_object('id', '47ed0d25-126b-4000-8000-000000000001', 'ownerId', null),
     'payment', jsonb_build_object('id', 'pay_126BBB001', 'value', 800.00, 'status', 'RECEIVED')));

select pg_temp.sem_sessao();

/* Quantas das DUAS cobranças da fixture um ator alcança, e quantos dos DOIS
   espelhos. Recortado pelos ids da fixture, e nunca a tabela inteira: o banco de
   dev tem dado permanente, e contagem absoluta passa hoje e falha longe da
   causa. */
create or replace function pg_temp.ve_cobranca(p_sub uuid, p_tenant uuid)
returns text language sql as $$
  select pg_temp.valor_como(p_sub, p_tenant, format(
    $q$select count(*)::text from public.asaas_charges where id in (%L,%L)$q$,
    (select chg_a from ids), (select chg_b from ids)))
$$;

create or replace function pg_temp.ve_espelho(p_sub uuid, p_tenant uuid)
returns text language sql as $$
  select pg_temp.valor_como(p_sub, p_tenant, format(
    $q$select count(*)::text from public.asaas_customers where id in (%L,%L)$q$,
    (select cust_a from ids), (select cust_b from ids)))
$$;

create or replace function pg_temp.ve_conexao(p_sub uuid, p_tenant uuid)
returns text language sql as $$
  select pg_temp.valor_como(p_sub, p_tenant, format(
    $q$select count(*)::text from public.asaas_connections where id in (%L,%L)$q$,
    (select conn_a from ids), (select conn_b from ids)))
$$;

/* As duas tabelas de uma vez, no formato 'cobranca|espelho'. A maioria dos casos
   da seção 1 fala das duas juntas, porque o recorte delas é o mesmo e abrir uma
   sem a outra não é um estado que faça sentido. */
create or replace function pg_temp.ve_financeiro(p_sub uuid, p_tenant uuid)
returns text language sql as $$
  select pg_temp.ve_cobranca(p_sub, p_tenant) || '|' || pg_temp.ve_espelho(p_sub, p_tenant)
$$;

/* A verdade do banco, lida como postgres, por cima da RLS: é contra ela que as
   tentativas de escrita são medidas. */
create or replace function pg_temp.estado_cobranca(p_id uuid)
returns text language sql as $$
  select coalesce((select c.status || '|' || c.deleted::text || '|' || c.value::text
                     from public.asaas_charges c where c.id = p_id), '(nenhuma)')
$$;

-- 1. LER A COBRANÇA E O ESPELHO: o menu `receivables`, no tenant do JWT --------

select pg_temp.rec('1.1', 'CONTROLE: Ana (vê receivables) lê a cobrança e o espelho do PRÓPRIO escritório', '1|1',
  pg_temp.valor_como((select user_ana from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_charges where id = %L', (select chg_a from ids))) || '|' ||
  pg_temp.valor_como((select user_ana from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_customers where id = %L', (select cust_a from ids))));

/* O CASO CENTRAL DO MULTITENANT: o escritório vizinho não existe para ela, nem
   pelo id vazado. */
select pg_temp.rec('1.2', 'e NÃO lê a cobrança nem o espelho do escritório B', '0|0',
  pg_temp.valor_como((select user_ana from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_charges where id = %L', (select chg_b from ids))) || '|' ||
  pg_temp.valor_como((select user_ana from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_customers where id = %L', (select cust_b from ids))));

select pg_temp.rec('1.3', 'a Diretora de B não lê nada do escritório A', '0|0',
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.asaas_charges where tenant_id = %L', (select tenant_a from ids))) || '|' ||
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.asaas_customers where tenant_id = %L', (select tenant_a from ids))));

select pg_temp.rec('1.4', 'CONTROLE: e lê a cobrança e o espelho do escritório dela', '1|1',
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.asaas_charges where id = %L', (select chg_b from ids))) || '|' ||
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.asaas_customers where id = %L', (select cust_b from ids))));

/* O COLEGA DO PRÓPRIO ESCRITÓRIO. É aqui que esta tabela se separa do padrão do
   sistema: em accounts_receivable (0042/0047) o Bruno LÊ a parcela, porque a
   leitura do financeiro é larga. A cobrança do Asaas da mesma parcela, não. */
select pg_temp.rec('1.5', 'colega do PRÓPRIO escritório, sem o menu receivables, não lê cobrança nem espelho', '0|0',
  pg_temp.ve_financeiro((select user_bruno from ids), (select tenant_a from ids)));

select pg_temp.rec('1.6', 'CONTROLE: e esse mesmo colega NÃO tem o menu (a recusa é a permissão, não o status)', 'false',
  pg_temp.valor_como((select user_bruno from ids), (select tenant_a from ids),
    $q$select public.can_view_menu('receivables')::text$q$));

/* O cruzamento dos dois menus, lado A: quem vê Configurações não vê a cobrança.
   Uma policy que perguntasse 'settings' aqui passaria em 1.1 só se o ator
   tivesse os dois menus - e é por isso que Ana e Carla têm um cada. */
select pg_temp.rec('1.7', 'Carla vê `settings` e por isso NÃO lê cobrança nem espelho', '0|0',
  pg_temp.ve_financeiro((select user_carla from ids), (select tenant_a from ids)));

select pg_temp.rec('1.8', 'CONTROLE: e a Carla realmente vê settings e não vê receivables', 'true|false',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids),
    $q$select public.can_view_menu('settings')::text$q$) || '|' ||
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids),
    $q$select public.can_view_menu('receivables')::text$q$));

/* O ATALHO DE DIRETOR, que aqui EXISTE (ao contrário do sino, 0121): a Diretora
   lê sem ter uma linha de permissão gravada. */
select pg_temp.rec('1.9', 'CONTROLE: a Diretora lê cobrança e espelho pelo atalho de cargo', '1|1',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_charges where id = %L', (select chg_a from ids))) || '|' ||
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_customers where id = %L', (select cust_a from ids))));

select pg_temp.rec('1.10', 'e ela NÃO tem nenhuma linha em collaborator_permissions (o atalho é o cargo)', '0',
  (select count(*)::text from public.collaborator_permissions
    where collaborator_id = (select col_dalva from ids)));

/* A regra que a policy NÃO escreve: o filtro de status vive dentro de
   can_view_menu -> auth_collaborator_id. Elza tem os dois menus gravados. */
select pg_temp.rec('1.11', 'colaboradora AFASTADA não lê, mesmo COM receivables gravado na matriz', '0|0',
  pg_temp.ve_financeiro((select user_elza from ids), (select tenant_a from ids)));

select pg_temp.rec('1.12', 'CONTROLE: a permissão dela está gravada, então a recusa só pode ser o status', '2',
  (select count(*)::text from public.collaborator_permissions
    where collaborator_id = (select col_elza from ids) and can_view));

/* CLAIM DE TENANT FORJADO: a sessão é da Bia (de B) e o claim diz tenant A. É o
   token manipulado, e é por isso que o claim sozinho não decide nada -
   can_view_menu procura a Bia DENTRO do tenant do claim, não acha, devolve
   false, e a comparação de tenant também não casa. */
select pg_temp.rec('1.13', 'claim de tenant forjado (Diretora de B dizendo-se de A) não alcança nada', '0|0',
  pg_temp.ve_financeiro((select user_bia from ids), (select tenant_a from ids)));

select pg_temp.rec('1.14', 'e o inverso também não (Ana dizendo-se de B)', '0|0',
  pg_temp.ve_financeiro((select user_ana from ids), (select tenant_b from ids)));

select pg_temp.rec('1.15', 'sessão SEM claim de tenant não alcança nada', '0|0',
  pg_temp.ve_financeiro((select user_ana from ids), null));

select pg_temp.rec('1.16', 'anon não lê cobrança nem espelho', 'ERR:GRANT|ERR:GRANT',
  pg_temp.como_anon('select count(*) from public.asaas_charges') || '|' ||
  pg_temp.como_anon('select count(*) from public.asaas_customers'));

/* O caso que pega a policy larga de uma vez: `using (true)` passaria em todos os
   controles acima e morreria aqui, porque ninguém alcança as DUAS cobranças. */
select pg_temp.rec('1.17', 'ninguém alcança as duas cobranças da fixture, nem os dois espelhos',
  '1|1|1|1|0|0|0|0|1|1',
  pg_temp.ve_financeiro((select user_ana from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_financeiro((select user_dalva from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_financeiro((select user_bruno from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_financeiro((select user_carla from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_financeiro((select user_bia from ids), (select tenant_b from ids)));

-- 2. LER A CONEXÃO: o menu é `settings`, e não o da cobrança -------------------
--
-- Molde da 0085: a linha diz QUAL conta Asaas está ligada, em que ambiente, e
-- qual foi o último erro. Interessa a quem configura, não ao escritório inteiro.

select pg_temp.rec('2.1', 'CONTROLE: Carla (vê settings) lê o estado da conexão do próprio escritório', '1',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_connections where id = %L', (select conn_a from ids))));

select pg_temp.rec('2.2', 'e o que ela lê é o ESTADO: ambiente e último erro', 'sandbox|invalid_api_key',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids), format(
    $q$select environment::text || '|' || coalesce(last_error, '<sem erro>')
         from public.asaas_connections where id = %L$q$, (select conn_a from ids))));

select pg_temp.rec('2.3', 'e NÃO lê a conexão do escritório B', '0',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_connections where id = %L', (select conn_b from ids))));

/* O cruzamento dos dois menus, lado B: quem vê o financeiro não vê a conexão.
   Com 1.7, é o par que prova que cada policy pergunta o SEU menu. */
select pg_temp.rec('2.4', 'Ana vê `receivables` e por isso NÃO lê a conexão', '0',
  pg_temp.ve_conexao((select user_ana from ids), (select tenant_a from ids)));

select pg_temp.rec('2.5', 'CONTROLE: a Diretora lê a conexão pelo atalho de cargo', '1',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_connections where id = %L', (select conn_a from ids))));

select pg_temp.rec('2.6', 'colega sem permissão nenhuma não lê a conexão', '0',
  pg_temp.ve_conexao((select user_bruno from ids), (select tenant_a from ids)));

select pg_temp.rec('2.7', 'afastada com `settings` gravado não lê a conexão', '0',
  pg_temp.ve_conexao((select user_elza from ids), (select tenant_a from ids)));

select pg_temp.rec('2.8', 'a Diretora de B não lê a conexão de A; CONTROLE: lê a dela', '0|1',
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.asaas_connections where tenant_id = %L',
    (select tenant_a from ids))) || '|' ||
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.asaas_connections where id = %L', (select conn_b from ids))));

select pg_temp.rec('2.9', 'claim forjado e sessão sem claim não alcançam conexão alguma', '0|0',
  pg_temp.ve_conexao((select user_carla from ids), (select tenant_b from ids)) || '|' ||
  pg_temp.ve_conexao((select user_carla from ids), null));

select pg_temp.rec('2.10', 'anon não lê a conexão', 'ERR:GRANT',
  pg_temp.como_anon('select count(*) from public.asaas_connections'));

select pg_temp.rec('2.11', 'ninguém alcança as duas conexões da fixture', '1|1|0|0|1',
  pg_temp.ve_conexao((select user_carla from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_conexao((select user_dalva from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_conexao((select user_ana from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_conexao((select user_bruno from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve_conexao((select user_bia from ids), (select tenant_b from ids)));

-- 3. NÃO ESCREVER: os três verbos, e os dois campos que valem dinheiro ---------
--
-- ESTA É A SEÇÃO QUE A 0126 EXISTE PARA GARANTIR. A verdade da cobrança é do
-- Asaas; quem escreve é a Edge Function como service_role. `status` virando
-- RECEIVED pela tela seria afirmar pagamento que não houve, e `deleted` virando
-- true liberaria a parcela para uma segunda cobrança do mesmo valor.
--
-- O esperado é ERR:GRANT, e não OK:0 nem ERR:RLS: as DUAS barreiras estão
-- ausentes, e a do privilégio opina primeiro. ERR:RLS aqui seria notícia - diria
-- que alguém concedeu o grant e deixou a policy segurando sozinha.

select pg_temp.rec('3.1', 'Ana não INSERE cobrança, nem no próprio escritório', 'ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.asaas_charges
         (tenant_id, receivable_id, environment, asaas_payment_id, status, billing_type, value, due_date)
       values (%L, %L, 'sandbox', 'pay_126FORJADA', 'RECEIVED', 'PIX', 1200.00, current_date)$q$,
    (select tenant_a from ids), (select ar_a2 from ids))));

/* O ataque que importa: marcar como recebida sem um centavo ter entrado. */
select pg_temp.rec('3.2', 'não marca a cobrança como RECEIVED', 'ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$update public.asaas_charges set status = 'RECEIVED' where id = %L$q$,
    (select chg_a from ids))));

/* O segundo: remover a cobrança viva libera a parcela para outra emissão. */
select pg_temp.rec('3.3', 'não marca a cobrança como deleted', 'ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.asaas_charges set deleted = true where id = %L', (select chg_a from ids))));

select pg_temp.rec('3.4', 'nem muda o valor cobrado', 'ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.asaas_charges set value = 1.00 where id = %L', (select chg_a from ids))));

select pg_temp.rec('3.5', 'nem APAGA a cobrança', 'ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'delete from public.asaas_charges where id = %L', (select chg_a from ids))));

/* A DIRETORA TAMBÉM NÃO. O atalho de can_view_menu é de LEITURA, e a seção prova
   que ele não virou escrita de carona. */
select pg_temp.rec('3.6', 'a DIRETORA também não insere, não atualiza e não apaga cobrança',
  'ERR:GRANT|ERR:GRANT|ERR:GRANT',
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    $q$insert into public.asaas_charges
         (tenant_id, receivable_id, environment, asaas_payment_id, status, billing_type, value, due_date)
       values (%L, %L, 'sandbox', 'pay_126DIRETORA', 'RECEIVED', 'PIX', 1200.00, current_date)$q$,
    (select tenant_a from ids), (select ar_a2 from ids))) || '|' ||
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    $q$update public.asaas_charges set status = 'RECEIVED', deleted = true where id = %L$q$,
    (select chg_a from ids))) || '|' ||
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    'delete from public.asaas_charges where id = %L', (select chg_a from ids))));

select pg_temp.rec('3.7', 'anon não insere, não atualiza e não apaga cobrança',
  'ERR:GRANT|ERR:GRANT|ERR:GRANT',
  pg_temp.como_anon(format(
    $q$insert into public.asaas_charges
         (tenant_id, receivable_id, environment, asaas_payment_id, status, billing_type, value, due_date)
       values (%L, %L, 'sandbox', 'pay_126ANON', 'RECEIVED', 'PIX', 1200.00, current_date)$q$,
    (select tenant_a from ids), (select ar_a2 from ids))) || '|' ||
  pg_temp.como_anon($q$update public.asaas_charges set status = 'RECEIVED'$q$) || '|' ||
  pg_temp.como_anon('delete from public.asaas_charges'));

/* DEPOIS DE ONZE TENTATIVAS, a verdade do banco não mudou uma vírgula. É o caso
   que transforma as recusas acima em afirmação sobre o DADO, e não só sobre o
   código de erro. */
select pg_temp.rec('3.8', 'depois de todas as tentativas, a cobrança segue PENDING, viva e no valor original',
  'PENDING|false|1200.00', pg_temp.estado_cobranca((select chg_a from ids)));

select pg_temp.rec('3.9', 'e nenhuma cobrança nova nasceu para a parcela 2/3', '0',
  (select count(*)::text from public.asaas_charges where receivable_id = (select ar_a2 from ids)));

select pg_temp.rec('3.10', 'Ana não insere, não atualiza e não apaga espelho de cliente',
  'ERR:GRANT|ERR:GRANT|ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.asaas_customers (tenant_id, client_id, environment, asaas_customer_id)
       values (%L, %L, 'production', 'cus_126FORJADO')$q$,
    (select tenant_a from ids), (select cli_a from ids))) || '|' ||
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$update public.asaas_customers set asaas_customer_id = 'cus_126OUTRO' where id = %L$q$,
    (select cust_a from ids))) || '|' ||
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'delete from public.asaas_customers where id = %L', (select cust_a from ids))));

select pg_temp.rec('3.11', 'o espelho segue apontando para o mesmo cus_, e segue único', 'cus_126AAA001|1',
  (select asaas_customer_id from public.asaas_customers where id = (select cust_a from ids))
  || '|' ||
  (select count(*)::text from public.asaas_customers
    where tenant_id = (select tenant_a from ids) and client_id = (select cli_a from ids)));

/* A CONEXÃO: nem quem vê Configurações escreve nela. Ligar e desligar são
   funções security definer da camada seguinte, porque tocam o Vault. O ataque
   específico é trocar o PONTEIRO do segredo ou o AMBIENTE - os dois mudariam qual
   conta Asaas recebe o dinheiro. */
select pg_temp.rec('3.12', 'Carla (vê settings) não troca o ponteiro do Vault, nem o ambiente, nem apaga a conexão',
  'ERR:GRANT|ERR:GRANT|ERR:GRANT',
  pg_temp.exec_como((select user_carla from ids), (select tenant_a from ids), format(
    'update public.asaas_connections set api_key_secret_id = %L where id = %L',
    (select vault_b from ids), (select conn_a from ids))) || '|' ||
  pg_temp.exec_como((select user_carla from ids), (select tenant_a from ids), format(
    $q$update public.asaas_connections set environment = 'production' where id = %L$q$,
    (select conn_a from ids))) || '|' ||
  pg_temp.exec_como((select user_carla from ids), (select tenant_a from ids), format(
    'delete from public.asaas_connections where id = %L', (select conn_a from ids))));

select pg_temp.rec('3.13', 'a Diretora também não insere nem atualiza conexão', 'ERR:GRANT|ERR:GRANT',
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    $q$insert into public.asaas_connections (tenant_id, environment, api_key_secret_id)
       values (%L, 'production', %L)$q$,
    (select tenant_b from ids), (select vault_a from ids))) || '|' ||
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    $q$update public.asaas_connections set last_error = 'apagado a mao' where id = %L$q$,
    (select conn_a from ids))));

select pg_temp.rec('3.14', 'a conexão de A segue com o mesmo ponteiro, o mesmo ambiente e o mesmo erro',
  'sandbox|invalid_api_key|igual',
  (select environment::text || '|' || coalesce(last_error, '<sem erro>') || '|' ||
          case when api_key_secret_id = (select vault_a from ids) then 'igual' else 'TROCADO' end
     from public.asaas_connections where id = (select conn_a from ids)));

select pg_temp.rec('3.15', 'CONTROLE: authenticated não tem INSERT, UPDATE nem DELETE nas três tabelas legíveis',
  'false|false|false|false|false|false|false|false|false',
  has_table_privilege('authenticated', 'public.asaas_charges', 'insert')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_charges', 'update')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_charges', 'delete')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_customers', 'insert')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_customers', 'update')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_customers', 'delete')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_connections', 'insert')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_connections', 'update')::text || '|' ||
  has_table_privilege('authenticated', 'public.asaas_connections', 'delete')::text);

/* GRANT DE COLUNA também não existe, e isso merece caso próprio: a 0085 usa
   grant de coluna para liberar UM update pela tela (a agenda lida), e
   has_table_privilege devolveria false mesmo se alguém tivesse concedido UPDATE
   em uma coluna só. Aqui não há nenhuma coluna gravável em nenhuma das três. */
select pg_temp.rec('3.16', 'e não há grant de COLUNA escondido: nenhuma coluna gravável nas três', 'false|false|false|false',
  has_column_privilege('authenticated', 'public.asaas_charges', 'status', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.asaas_charges', 'deleted', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.asaas_customers', 'asaas_customer_id', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.asaas_connections', 'environment', 'update')::text);

-- 4. O DIÁRIO DOS AVISOS: nada para authenticated, e a ausência é decisão ------
--
-- asaas_webhook_events é tráfego de provedor e fila de processamento, não dado de
-- escritório. Quem lê e escreve é a Edge Function como service_role. O caso 4.7 é
-- o que impede esta seção de ser vazia por acidente.

select pg_temp.rec('4.1', 'Ana não lê o diário dos avisos, nem do próprio escritório', 'ERR:GRANT',
  pg_temp.valor_como((select user_ana from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_webhook_events where id = %L', (select evt_a from ids))));

select pg_temp.rec('4.2', 'a DIRETORA do próprio escritório também não', 'ERR:GRANT',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.asaas_webhook_events where tenant_id = %L',
    (select tenant_a from ids))));

select pg_temp.rec('4.3', 'nem quem vê Configurações', 'ERR:GRANT',
  pg_temp.valor_como((select user_carla from ids), (select tenant_a from ids),
    'select count(*)::text from public.asaas_webhook_events'));

/* Nem o payload por caminho indireto: o corpo cru é de terceiro, e é o que mais
   interessaria a quem quisesse saber o que o provedor disse. */
select pg_temp.rec('4.4', 'e ninguém alcança o payload cru', 'ERR:GRANT',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    $q$select payload ->> 'event' from public.asaas_webhook_events where id = %L$q$,
    (select evt_a from ids))));

select pg_temp.rec('4.5', 'não insere, não atualiza e não apaga aviso', 'ERR:GRANT|ERR:GRANT|ERR:GRANT',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.asaas_webhook_events (tenant_id, asaas_event_id, event_name, payload)
       values (%L, 'evt_126forjado&1', 'PAYMENT_RECEIVED', '{"forjado": true}'::jsonb)$q$,
    (select tenant_a from ids))) || '|' ||
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.asaas_webhook_events set processed_at = now() where id = %L',
    (select evt_a from ids))) || '|' ||
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'delete from public.asaas_webhook_events where id = %L', (select evt_a from ids))));

select pg_temp.rec('4.6', 'anon não lê e não insere aviso', 'ERR:GRANT|ERR:GRANT',
  pg_temp.como_anon('select count(*) from public.asaas_webhook_events') || '|' ||
  pg_temp.como_anon(format(
    $q$insert into public.asaas_webhook_events (tenant_id, asaas_event_id, event_name, payload)
       values (%L, 'evt_126anon&1', 'PAYMENT_RECEIVED', '{"anon": true}'::jsonb)$q$,
    (select tenant_a from ids))));

/* O CONTROLE QUE DÁ SENTIDO À SEÇÃO: os dois avisos EXISTEM, lidos como
   postgres. Sem ele, "ninguém lê" passaria também numa tabela vazia. */
select pg_temp.rec('4.7', 'CONTROLE: os dois avisos da fixture estão no banco, intactos', '2|<null>',
  (select count(*)::text from public.asaas_webhook_events
    where id in ((select evt_a from ids), (select evt_b from ids)))
  || '|' ||
  coalesce((select processed_at::text from public.asaas_webhook_events
             where id = (select evt_a from ids)), '<null>'));

select pg_temp.rec('4.8', 'nem authenticated nem anon têm privilégio algum na tabela', '<null>|<null>',
  coalesce((select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'asaas_webhook_events'
      and grantee = 'authenticated'), '<null>')
  || '|' ||
  coalesce((select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'asaas_webhook_events'
      and grantee = 'anon'), '<null>'));

-- 5. O CATÁLOGO: três policies, as três de leitura -----------------------------

select pg_temp.rec('5.1', 'RLS está ligada nas quatro tabelas', 'true|true|true|true',
  (select string_agg(relrowsecurity::text, '|' order by relname) from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events')));

/* SEM FORCE: as funções security definer da camada seguinte (conectar,
   desconectar, aplicar aviso) são do dono da tabela, e é por não haver FORCE que
   elas gravam. Ligar FORCE "para endurecer" pararia a integração. */
select pg_temp.rec('5.2', 'e nenhuma está em modo FORCE', 'false|false|false|false',
  (select string_agg(relforcerowsecurity::text, '|' order by relname) from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events')));

select pg_temp.rec('5.3', 'exatamente três policies no módulo, e as três de SELECT', 'SELECT,SELECT,SELECT',
  (select string_agg(cmd, ',' order by tablename) from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events')));

/* Policy de ALL é a que mais engana: cobriria os quatro comandos de uma vez e o
   5.3 mostraria só 'ALL'. */
select pg_temp.rec('5.4', 'nenhuma policy de INSERT, UPDATE, DELETE ou ALL', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')));

select pg_temp.rec('5.5', 'asaas_webhook_events segue com ZERO policy, e isso é decisão', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'asaas_webhook_events'));

/* Policy em `public` alcançaria também `anon` - hoje sem GRANT, mas é a
   combinação que já foi ao ar errada uma vez (0007). */
select pg_temp.rec('5.6', 'as três são `to authenticated`, nenhuma para public ou anon',
  '{authenticated},{authenticated},{authenticated}',
  (select string_agg(roles::text, ',' order by tablename) from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_connections','asaas_customers')));

select pg_temp.rec('5.7', 'as três são PERMISSIVE, as três têm USING e nenhuma tem WITH CHECK', 'true',
  (select (count(*) = 3)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_connections','asaas_customers')
      and permissive = 'PERMISSIVE' and qual is not null and with_check is null));

/*
  AS EXPRESSÕES, e este caso guarda a frase do módulo: as três comparam tenant
  contra o CLAIM do JWT (auth_tenant_id) e perguntam o menu certo. Uma policy
  reescrita só com tenant_id passaria em 5.3, 5.6 e 5.7 e abriria a cobrança para
  o escritório inteiro; uma que trocasse os menus entre si passaria em tudo
  menos aqui e nos casos 1.7 e 2.4.
*/
select pg_temp.rec('5.8', 'as três comparam tenant com o claim do JWT, e cada uma pergunta o SEU menu',
  '3|2|1|0',
  (select count(*)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_connections','asaas_customers')
      and qual like '%auth_tenant_id%')
  || '|' ||
  (select count(*)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_customers')
      and qual like '%can_view_menu%' and qual like '%receivables%')
  || '|' ||
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'asaas_connections'
      and qual like '%can_view_menu%' and qual like '%settings%')
  || '|' ||
  (select count(*)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('asaas_charges','asaas_connections','asaas_customers')
      and qual like '%tenant_users%'));

/* Regra da casa: policy sem COMMENT é policy cuja intenção mora na cabeça de
   quem a escreveu. */
select pg_temp.rec('5.9', 'as três policies têm COMMENT', '3',
  (select count(*)::text from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('asaas_charges','asaas_connections','asaas_customers')
     and obj_description(p.oid, 'pg_policy') is not null));

select pg_temp.rec('5.10', 'o GRANT de tabela para authenticated é SELECT nas três, e nada na quarta',
  'SELECT|SELECT|SELECT|<null>',
  (select string_agg(p, '|' order by t) from (
    select t, coalesce((select string_agg(distinct privilege_type, ',' order by privilege_type)
       from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = t and g.grantee = 'authenticated'), '<null>') p
    from unnest(array['asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events']) t
  ) s));

select pg_temp.rec('5.11', 'anon não tem privilégio nenhum em nenhuma das quatro', '<null>',
  coalesce((select string_agg(distinct table_name || ':' || privilege_type, ',')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and table_name in ('asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events')),
   '<null>'));

/* O bypass de service_role é server-side e é de propósito: é quem a Edge Function
   usa, e a chave dele nunca vai para o navegador. Policy nenhuma se aplica a ele,
   porque as três são `to authenticated`. */
select pg_temp.rec('5.12', 'service_role segue com os quatro privilégios nas quatro tabelas', 'true',
  (select (count(*) = 16)::text from unnest(
      array['asaas_charges','asaas_connections','asaas_customers','asaas_webhook_events']) t,
     unnest(array['select','insert','update','delete']) v
   where has_table_privilege('service_role', 'public.' || t, v)));

-- 6. service_role CONTINUA FAZENDO O TRABALHO DELE -----------------------------
--
-- A seção que impede o conjunto de passar por estar tudo trancado. Toda escrita
-- aqui acontece dentro de subtransação e é DESFEITA (ver pg_temp.exec_service):
-- o que se mede é que o comando passa, não que ele fica.

select pg_temp.rec('6.1', 'CONTROLE: service_role lê as duas cobranças, os dois espelhos, as duas conexões e os dois avisos',
  '2|2|2|2',
  pg_temp.valor_service(format(
    'select count(*)::text from public.asaas_charges where id in (%L,%L)',
    (select chg_a from ids), (select chg_b from ids))) || '|' ||
  pg_temp.valor_service(format(
    'select count(*)::text from public.asaas_customers where id in (%L,%L)',
    (select cust_a from ids), (select cust_b from ids))) || '|' ||
  pg_temp.valor_service(format(
    'select count(*)::text from public.asaas_connections where id in (%L,%L)',
    (select conn_a from ids), (select conn_b from ids))) || '|' ||
  pg_temp.valor_service(format(
    'select count(*)::text from public.asaas_webhook_events where id in (%L,%L)',
    (select evt_a from ids), (select evt_b from ids))));

/* O gesto de EMITIR: a Edge Function grava a cobrança que o Asaas devolveu. */
select pg_temp.rec('6.2', 'service_role emite cobrança para a parcela 2/3', 'OK:1',
  pg_temp.exec_service(format(
    $q$insert into public.asaas_charges
         (tenant_id, receivable_id, environment, asaas_payment_id, external_reference,
          status, billing_type, value, due_date)
       values (%L, %L, 'sandbox', 'pay_126AAA002', %L, 'PENDING', 'PIX', 1200.00, current_date + 40)$q$,
    (select tenant_a from ids), (select ar_a2 from ids), (select ar_a2::text from ids))));

/* O gesto de APLICAR O AVISO: é ele que baixa a parcela, e é por isso que ele é
   privilégio de servidor e não de tela. */
select pg_temp.rec('6.3', 'service_role aplica o aviso do webhook na cobrança (status e datas)', 'OK:1',
  pg_temp.exec_service(format(
    $q$update public.asaas_charges
          set status = 'RECEIVED', net_value = 1188.01, payment_date = current_date,
              client_payment_date = current_date, synced_at = now()
        where id = %L$q$, (select chg_a from ids))));

select pg_temp.rec('6.4', 'service_role marca a cobrança como removida, e apaga cobrança', 'OK:1|OK:1',
  pg_temp.exec_service(format(
    'update public.asaas_charges set deleted = true where id = %L', (select chg_a from ids))) || '|' ||
  pg_temp.exec_service(format(
    'delete from public.asaas_charges where id = %L', (select chg_a from ids))));

select pg_temp.rec('6.5', 'service_role espelha o cliente em outro ambiente e atualiza o espelho', 'OK:1|OK:1',
  pg_temp.exec_service(format(
    $q$insert into public.asaas_customers (tenant_id, client_id, environment, asaas_customer_id)
       values (%L, %L, 'production', 'cus_126AAA002')$q$,
    (select tenant_a from ids), (select cli_a from ids))) || '|' ||
  pg_temp.exec_service(format(
    'update public.asaas_customers set synced_at = now() where id = %L', (select cust_a from ids))));

select pg_temp.rec('6.6', 'service_role grava um aviso novo e carimba o processamento do antigo', 'OK:1|OK:1',
  pg_temp.exec_service(format(
    $q$insert into public.asaas_webhook_events (tenant_id, asaas_event_id, event_name, payload)
       values (%L, 'evt_126aaa0000000000000000000000002&1', 'PAYMENT_CONFIRMED',
               jsonb_build_object('id', 'evt_126aaa0000000000000000000000002&1',
                                  'event', 'PAYMENT_CONFIRMED',
                                  'payment', jsonb_build_object('id', 'pay_126AAA001')))$q$,
    (select tenant_a from ids))) || '|' ||
  pg_temp.exec_service(format(
    'update public.asaas_webhook_events set processed_at = now(), processing_attempts = 1 where id = %L',
    (select evt_a from ids))));

/* O record_result da conexão (molde da 0085) e o desconectar. */
select pg_temp.rec('6.7', 'service_role carimba o resultado na conexão e desconecta', 'OK:1|OK:1',
  pg_temp.exec_service(format(
    $q$update public.asaas_connections
          set last_success_at = now(), last_error = null, last_error_at = null
        where tenant_id = %L$q$, (select tenant_a from ids))) || '|' ||
  pg_temp.exec_service(format(
    'delete from public.asaas_connections where id = %L', (select conn_a from ids))));

/* E nada do que a seção 6 fez ficou: as sondas desfazem. Se este caso cair, as
   seções 1 a 5 passaram a depender da ordem do arquivo. */
select pg_temp.rec('6.8', 'e nada disso ficou gravado: a fixture está como a seção 1 a viu',
  'PENDING|false|1200.00|1|1|1|<null>',
  pg_temp.estado_cobranca((select chg_a from ids)) || '|' ||
  (select count(*)::text from public.asaas_charges where tenant_id = (select tenant_a from ids)) || '|' ||
  (select count(*)::text from public.asaas_customers where tenant_id = (select tenant_a from ids)) || '|' ||
  (select count(*)::text from public.asaas_connections where tenant_id = (select tenant_a from ids)) || '|' ||
  coalesce((select processed_at::text from public.asaas_webhook_events
             where id = (select evt_a from ids)), '<null>'));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
