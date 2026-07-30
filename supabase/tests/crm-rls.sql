-- Teste de isolamento da RLS - Modulo 2 (CRM), tabela public.clients
--
-- O que este arquivo prova, e por que existe separado do crm-schema.sql: a 0017
-- e a primeira migration do projeto em que a PERMISSAO DE MENU vira regra de
-- escrita no banco. Ate ela, can_edit so escondia item na sidebar e quem decidia
-- era o frontend. Regra nova de autorizacao sem teste de negacao E de controle e
-- exatamente onde este projeto ja se enganou tres vezes.
--
-- COMO RODAR
--   npm run test:rls:crm
--   ou cole o arquivo inteiro no SQL Editor do Studio.
--
-- COMO LER O RESULTADO
--   observed = 'OK:<n>'    a operacao passou e afetou/devolveu n linhas.
--                          'OK:0' em UPDATE/DELETE E NEGACAO: a clausula USING
--                          nao casou com linha nenhuma, e o Postgres nao levanta
--                          erro nesse caso - ele so nao faz nada. E assim que o
--                          cliente enxerga a maior parte das negativas de escrita.
--   observed = 'ERR:42501' privilegio negado. Cobre tres coisas que o cliente
--                          enxerga igual: falta de GRANT, violacao de WITH CHECK
--                          e trigger.
--   observed = 'true'/'false'  valor devolvido por can_edit_menu().
--
--   Casos marcados CONTROLE afirmam o que precisa CONTINUAR possivel. Sem eles,
--   uma policy que negasse tudo passaria com nota cheia - e a nota cheia e
--   justamente o que faz ninguem reler o teste.
--
-- ESTE ARQUIVO FOI TESTADO CONTRA ELE MESMO
--
--   Suite verde nao e evidencia de suite util. Antes de ser dada por pronta, esta
--   suite foi rodada contra sete versoes ERRADAS da 0017, injetadas dentro da
--   transacao e desfeitas no ROLLBACK. O que cada defeito derruba:
--
--     helper ignora o menu pedido ("tem alguma permissao de edicao")  6.1-6.3, 10.4
--     helper esquece o filtro de status active                        2.3, 2.6, 10.5
--     policy de SELECT sem filtro de tenant                           1.1-1.C2, 4.C1, 6.C1-6.C2
--     GRANT de select para anon (com a RLS ligada)                     8.1, 11.2
--     policy de UPDATE sem WITH CHECK                                  11.4 (so ele - ver abaixo)
--     WITH CHECK do UPDATE trocado por "true"                          nenhum (ver abaixo)
--     WITH CHECK "true" + SELECT sem tenant, juntos                    7.4 e os de leitura
--
--   As duas ultimas linhas sao o achado que corrigiu este arquivo. Policy de
--   UPDATE sem WITH CHECK nao fica sem verificacao: o Postgres reusa a expressao
--   do USING. E mesmo com "with check (true)" a mudanca de tenant_id continua
--   recusada, porque a linha resultante ainda precisa passar pela policy de
--   SELECT. Ou seja, o caso 7.4 passa com ou sem WITH CHECK - dizer que ele
--   "prova o WITH CHECK" seria assercao vazia. Quem guarda a existencia da
--   clausula e o caso 11.4, que olha o catalogo.
--
-- POR QUE SIMULA O PAPEL EM VEZ DE FAZER LOGIN
--   set local role + request.jwt.claims reproduzem o que o PostgREST monta a cada
--   request. O que isso NAO cobre e se o JWT emitido no login realmente carrega o
--   claim - para esse elo existe o crm-rls.mjs, que faz login de verdade pela
--   rede e usa a chave publicavel.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug crm-rls-test-*), e TODA contagem e escopada nesses tenants ou
--   feita sob um claim que a propria RLS restringe a eles. Nenhum caso afirma
--   contagem absoluta sobre public.clients: o escritorio de teste do seed tem
--   clientes permanentes, e caso que depende de tabela vazia passa hoje e falha
--   depois, longe da causa.

begin;

-- Fixtures --------------------------------------------------------------------
-- Criadas como postgres, dono das tabelas, que por isso nao sofre RLS (nenhuma
-- tabela usa FORCE ROW LEVEL SECURITY, e nao pode passar a usar sem quebrar os
-- helpers SECURITY DEFINER).

create temp table crm_ids on commit drop as
select
  'f1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'f2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  -- usuarios
  'fa000000-0000-4000-8000-000000000001'::uuid as u_dir_a,
  'fa000000-0000-4000-8000-000000000002'::uuid as u_edit_a,
  'fa000000-0000-4000-8000-000000000003'::uuid as u_view_a,
  'fa000000-0000-4000-8000-000000000004'::uuid as u_other_a,
  'fa000000-0000-4000-8000-000000000005'::uuid as u_noperm_a,
  'fa000000-0000-4000-8000-000000000006'::uuid as u_leave_a,
  'fa000000-0000-4000-8000-000000000007'::uuid as u_vac_a,
  'fa000000-0000-4000-8000-000000000008'::uuid as u_pending_a,
  'fb000000-0000-4000-8000-000000000001'::uuid as u_edit_b,
  'fc000000-0000-4000-8000-000000000001'::uuid as u_orphan,
  -- colaboradores
  'fa100000-0000-4000-8000-000000000001'::uuid as c_dir_a,
  'fa100000-0000-4000-8000-000000000002'::uuid as c_edit_a,
  'fa100000-0000-4000-8000-000000000003'::uuid as c_view_a,
  'fa100000-0000-4000-8000-000000000004'::uuid as c_other_a,
  'fa100000-0000-4000-8000-000000000005'::uuid as c_noperm_a,
  'fa100000-0000-4000-8000-000000000006'::uuid as c_leave_a,
  'fa100000-0000-4000-8000-000000000007'::uuid as c_vac_a,
  'fb100000-0000-4000-8000-000000000001'::uuid as c_edit_b,
  -- clientes
  'fa200000-0000-4000-8000-000000000001'::uuid as cli_a1,
  'fa200000-0000-4000-8000-000000000002'::uuid as cli_a2,
  'fb200000-0000-4000-8000-000000000001'::uuid as cli_b1;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_dir_a from crm_ids) u, 'crm-rls-dir-a@example.test' e
  union all select (select u_edit_a from crm_ids), 'crm-rls-edit-a@example.test'
  union all select (select u_view_a from crm_ids), 'crm-rls-view-a@example.test'
  union all select (select u_other_a from crm_ids), 'crm-rls-other-a@example.test'
  union all select (select u_noperm_a from crm_ids), 'crm-rls-noperm-a@example.test'
  union all select (select u_leave_a from crm_ids), 'crm-rls-leave-a@example.test'
  union all select (select u_vac_a from crm_ids), 'crm-rls-vac-a@example.test'
  union all select (select u_pending_a from crm_ids), 'crm-rls-pending-a@example.test'
  union all select (select u_edit_b from crm_ids), 'crm-rls-edit-b@example.test'
  union all select (select u_orphan from crm_ids), 'crm-rls-orphan@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from crm_ids), 'CRM RLS Test Escritorio A', 'crm-rls-test-a'),
  ((select tenant_b from crm_ids), 'CRM RLS Test Escritorio B', 'crm-rls-test-b');

-- u_orphan de proposito NAO entra em tenant_users: e o usuario cujo JWT sai sem
-- claim de tenant. u_pending_a entra, mas nao vira colaborador: e quem fez login
-- e ainda espera aprovacao do Diretor.
insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from crm_ids), (select u_dir_a from crm_ids), 'owner'),
  ((select tenant_a from crm_ids), (select u_edit_a from crm_ids), 'member'),
  ((select tenant_a from crm_ids), (select u_view_a from crm_ids), 'member'),
  ((select tenant_a from crm_ids), (select u_other_a from crm_ids), 'member'),
  ((select tenant_a from crm_ids), (select u_noperm_a from crm_ids), 'member'),
  ((select tenant_a from crm_ids), (select u_leave_a from crm_ids), 'member'),
  ((select tenant_a from crm_ids), (select u_vac_a from crm_ids), 'member'),
  ((select tenant_a from crm_ids), (select u_pending_a from crm_ids), 'member'),
  ((select tenant_b from crm_ids), (select u_edit_b from crm_ids), 'owner');

-- As funcoes de negocio abaixo sao escolhidas para SEPARAR permissao de funcao:
--   c_edit_a  e architect  e ESCREVE  (tem can_edit em crm)
--   c_view_a  e coordinator e NAO escreve (tem so can_view em crm)
--   c_other_a e admin_staff e NAO escreve (tem can_edit, mas em contracts)
-- Se a policy olhasse a funcao em vez da permissao, c_edit_a (Arquiteto) falharia
-- e c_other_a (Administrativo) passaria - ou seja, o conjunto acusa a troca.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_dir_a from crm_ids),    (select tenant_a from crm_ids), (select u_dir_a from crm_ids),    'Diretora A',        'director',    'dir-a@crm-rls-a.example.test',    'active'),
  ((select c_edit_a from crm_ids),   (select tenant_a from crm_ids), (select u_edit_a from crm_ids),   'Arquiteta CRM A',   'architect',   'edit-a@crm-rls-a.example.test',   'active'),
  ((select c_view_a from crm_ids),   (select tenant_a from crm_ids), (select u_view_a from crm_ids),   'Coordenador A',     'coordinator', 'view-a@crm-rls-a.example.test',   'active'),
  ((select c_other_a from crm_ids),  (select tenant_a from crm_ids), (select u_other_a from crm_ids),  'Administrativo A',  'admin_staff', 'other-a@crm-rls-a.example.test',  'active'),
  ((select c_noperm_a from crm_ids), (select tenant_a from crm_ids), (select u_noperm_a from crm_ids), 'Estagiario A',      'intern',      'noperm-a@crm-rls-a.example.test', 'active'),
  ((select c_leave_a from crm_ids),  (select tenant_a from crm_ids), (select u_leave_a from crm_ids),  'Afastado A',        'architect',   'leave-a@crm-rls-a.example.test',  'on_leave'),
  ((select c_vac_a from crm_ids),    (select tenant_a from crm_ids), (select u_vac_a from crm_ids),    'Ferias A',          'architect',   'vac-a@crm-rls-a.example.test',    'vacation'),
  ((select c_edit_b from crm_ids),   (select tenant_b from crm_ids), (select u_edit_b from crm_ids),   'Diretor B',         'director',    'edit-b@crm-rls-b.example.test',   'active');

-- c_leave_a e c_vac_a recebem can_edit em crm DE PROPOSITO: e o que faz o caso 2
-- discriminar. Sem a permissao gravada, "afastado nao escreve porque esta
-- afastado" e "afastado nao escreve porque nao tem permissao" produziriam o mesmo
-- resultado, e o teste nao saberia dizer qual regra esta funcionando.
-- c_noperm_a nao recebe permissao nenhuma: e o controle de que LEITURA nao
-- depende de can_view (decisao registrada na policy de SELECT).
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from crm_ids), (select c_dir_a from crm_ids),   'crm',       true, true),
  ((select tenant_a from crm_ids), (select c_dir_a from crm_ids),   'team',      true, true),
  ((select tenant_a from crm_ids), (select c_edit_a from crm_ids),  'crm',       true, true),
  ((select tenant_a from crm_ids), (select c_view_a from crm_ids),  'crm',       true, false),
  ((select tenant_a from crm_ids), (select c_other_a from crm_ids), 'contracts', true, true),
  ((select tenant_a from crm_ids), (select c_other_a from crm_ids), 'crm',       true, false),
  ((select tenant_a from crm_ids), (select c_leave_a from crm_ids), 'crm',       true, true),
  ((select tenant_a from crm_ids), (select c_vac_a from crm_ids),   'crm',       true, true),
  ((select tenant_b from crm_ids), (select c_edit_b from crm_ids),  'crm',       true, true);

insert into public.clients (id, tenant_id, name, phone, email, address_city, address_state) values
  ((select cli_a1 from crm_ids), (select tenant_a from crm_ids), 'Cliente A Um',  '(62) 90000-0001', 'a1@crm-rls.example.test', 'Goiania', 'GO'),
  ((select cli_a2 from crm_ids), (select tenant_a from crm_ids), 'Cliente A Dois','(62) 90000-0002', 'a2@crm-rls.example.test', 'Goiania', 'GO'),
  ((select cli_b1 from crm_ids), (select tenant_b from crm_ids), 'Cliente B Um',  '(62) 90000-0003', 'b1@crm-rls.example.test', 'Goiania', 'GO');

-- Sondas ----------------------------------------------------------------------
-- probe executa p_sql com o papel e o claim de um usuario concreto e devolve
-- 'OK:<linhas>' ou 'ERR:<sqlstate>'. Toda execucao termina em excecao de
-- proposito (errcode RL001), para que a subtransacao seja desfeita e uma escrita
-- que porventura PASSE nao contamine os casos seguintes.

create or replace function pg_temp.probe(p_role name, p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_rows bigint;
  v_out text;
  v_msg text;
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
end;
$$;

-- probe_val e para os casos que afirmam o VALOR devolvido (can_edit_menu). Nao da
-- para usar probe: 'select can_edit_menu(...)' devolve uma linha tanto para true
-- quanto para false, e OK:1 nao distinguiria os dois.
create or replace function pg_temp.probe_val(p_role name, p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_out text;
  v_msg text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_out;
    v_out := coalesce(v_out, '<null>');
  exception when others then
    get stacked diagnostics v_msg = returned_sqlstate;
    v_out := 'ERR:' || v_msg;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end;
$$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb
language sql
as $$
  select case
    when p_tenant is null then jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)
    else jsonb_build_object('sub', p_sub, 'role', 'authenticated',
           'app_metadata', jsonb_build_object('tenant_id', p_tenant, 'tenant_role', 'member'))
  end;
$$;

create temp table crm_results (
  seq serial primary key,
  caso text,
  descricao text,
  expected text,
  observed text
) on commit drop;

create or replace function pg_temp.check(p_caso text, p_desc text, p_expected text, p_role name, p_claims jsonb, p_sql text)
returns void language plpgsql as $$
begin
  insert into crm_results (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, pg_temp.probe(p_role, p_claims, p_sql));
end;
$$;

create or replace function pg_temp.check_val(p_caso text, p_desc text, p_expected text, p_role name, p_claims jsonb, p_sql text)
returns void language plpgsql as $$
begin
  insert into crm_results (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, pg_temp.probe_val(p_role, p_claims, p_sql));
end;
$$;

-- Atalhos de claim, para os casos ficarem legiveis.
create temp table cl on commit drop as select
  pg_temp.claims((select u_dir_a from crm_ids),    (select tenant_a from crm_ids)) as dir_a,
  pg_temp.claims((select u_edit_a from crm_ids),   (select tenant_a from crm_ids)) as edit_a,
  pg_temp.claims((select u_view_a from crm_ids),   (select tenant_a from crm_ids)) as view_a,
  pg_temp.claims((select u_other_a from crm_ids),  (select tenant_a from crm_ids)) as other_a,
  pg_temp.claims((select u_noperm_a from crm_ids), (select tenant_a from crm_ids)) as noperm_a,
  pg_temp.claims((select u_leave_a from crm_ids),  (select tenant_a from crm_ids)) as leave_a,
  pg_temp.claims((select u_vac_a from crm_ids),    (select tenant_a from crm_ids)) as vac_a,
  pg_temp.claims((select u_pending_a from crm_ids),(select tenant_a from crm_ids)) as pending_a,
  pg_temp.claims((select u_edit_b from crm_ids),   (select tenant_b from crm_ids)) as edit_b,
  pg_temp.claims((select u_orphan from crm_ids),   null)                           as orphan;

-- Caso 1 - Tenant A nao le cliente de tenant B, nos dois sentidos -------------

select pg_temp.check('1.1', 'Diretora A conta clientes do escritorio B (filtrado por tenant_id de B)', 'OK:0',
  'authenticated', (select dir_a from cl),
  format('select 1 from public.clients where tenant_id = %L', (select tenant_b from crm_ids)));

select pg_temp.check('1.2', 'Diretora A le o cliente de B pelo id (id vazado nao vira leitura)', 'OK:0',
  'authenticated', (select dir_a from cl),
  format('select 1 from public.clients where id = %L', (select cli_b1 from crm_ids)));

select pg_temp.check('1.3', 'Diretor B conta clientes do escritorio A', 'OK:0',
  'authenticated', (select edit_b from cl),
  format('select 1 from public.clients where tenant_id = %L', (select tenant_a from crm_ids)));

-- Sem filtro de tenant no SQL: quem filtra e a policy. Determinista porque o
-- claim e de um tenant de fixture, criado nesta transacao - o escritorio do seed
-- e os 10 clientes dele ficam fora por construcao.
select pg_temp.check('1.4', 'Diretor B ve apenas o proprio cliente, sem filtrar no SQL', 'OK:1',
  'authenticated', (select edit_b from cl), 'select 1 from public.clients');

select pg_temp.check('1.C1', 'CONTROLE: Diretora A ve os 2 clientes do proprio escritorio', 'OK:2',
  'authenticated', (select dir_a from cl), 'select 1 from public.clients');

select pg_temp.check('1.C2', 'CONTROLE: Arquiteta CRM A ve os 2 clientes do escritorio', 'OK:2',
  'authenticated', (select edit_a from cl), 'select 1 from public.clients');

-- Caso 2 - colaborador on_leave / vacation nao le nem escreve cliente ---------
--
-- Os dois TEM can_edit em crm na fixture. Se a policy tivesse esquecido o filtro
-- de status (ou se can_edit_menu() nao embutisse active via
-- auth_collaborator_id()), estes casos passariam a escrever - e o caso 4, que
-- nega por falta de permissao, continuaria verde do mesmo jeito.

select pg_temp.check('2.1', 'Colaborador Afastado (com can_edit em crm) le clientes', 'OK:0',
  'authenticated', (select leave_a from cl), 'select 1 from public.clients');

select pg_temp.check('2.2', 'Colaborador em Ferias (com can_edit em crm) le clientes', 'OK:0',
  'authenticated', (select vac_a from cl), 'select 1 from public.clients');

select pg_temp.check('2.3', 'Colaborador Afastado cadastra cliente', 'ERR:42501',
  'authenticated', (select leave_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do Afastado', '62900001111', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('2.4', 'Colaborador Afastado altera cliente do proprio escritorio', 'OK:0',
  'authenticated', (select leave_a from cl),
  format('update public.clients set name = %L where id = %L', 'Renomeado pelo Afastado', (select cli_a1 from crm_ids)));

select pg_temp.check('2.5', 'Colaborador Afastado apaga cliente', 'OK:0',
  'authenticated', (select leave_a from cl),
  format('delete from public.clients where id = %L', (select cli_a1 from crm_ids)));

select pg_temp.check('2.6', 'Colaborador em Ferias cadastra cliente', 'ERR:42501',
  'authenticated', (select vac_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente das Ferias', '62900002222', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

-- Caso 3 - autenticado sem vinculo, e vinculado sem colaborador ---------------

select pg_temp.check('3.1', 'Usuario sem linha em tenant_users (JWT sem claim) le clientes', 'OK:0',
  'authenticated', (select orphan from cl), 'select 1 from public.clients');

select pg_temp.check('3.2', 'Usuario sem tenant_users cadastra cliente no escritorio A', 'ERR:42501',
  'authenticated', (select orphan from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do Estranho', '62900003333', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('3.3', 'Usuario sem tenant_users altera cliente do escritorio A', 'OK:0',
  'authenticated', (select orphan from cl),
  format('update public.clients set name = %L where id = %L', 'Sequestrado', (select cli_a1 from crm_ids)));

select pg_temp.check('3.4', 'Usuario COM tenant_users mas sem colaborador (aguardando aprovacao) le clientes', 'OK:0',
  'authenticated', (select pending_a from cl), 'select 1 from public.clients');

select pg_temp.check('3.5', 'Usuario aguardando aprovacao cadastra cliente', 'ERR:42501',
  'authenticated', (select pending_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do Pendente', '62900004444', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

-- Caso 4 - can_view SEM can_edit: le, e nao escreve ---------------------------

select pg_temp.check('4.C1', 'CONTROLE: Coordenador A (can_view em crm) LE os 2 clientes', 'OK:2',
  'authenticated', (select view_a from cl), 'select 1 from public.clients');

select pg_temp.check('4.1', 'Coordenador A cadastra cliente', 'ERR:42501',
  'authenticated', (select view_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do Coordenador', '62900005555', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('4.2', 'Coordenador A altera cliente', 'OK:0',
  'authenticated', (select view_a from cl),
  format('update public.clients set name = %L where id = %L', 'Renomeado pelo Coordenador', (select cli_a1 from crm_ids)));

select pg_temp.check('4.3', 'Coordenador A apaga cliente', 'OK:0',
  'authenticated', (select view_a from cl),
  format('delete from public.clients where id = %L', (select cli_a1 from crm_ids)));

-- Coluna gerada nao entra na conta: quem nao escreve, nao escreve nem o derivado.
select pg_temp.check('4.4', 'Coordenador A altera o documento (mexeria na deduplicacao)', 'OK:0',
  'authenticated', (select view_a from cl),
  format('update public.clients set tax_id = %L where id = %L', '999.999.999-99', (select cli_a1 from crm_ids)));

-- Caso 5 - CONTROLE: quem tem can_edit em crm cria, edita e apaga -------------
--
-- Sem estes tres o arquivo inteiro passaria com uma policy de escrita que negasse
-- tudo, e o CRM chegaria em producao como tela somente-leitura.
-- c_edit_a e ARQUITETO de proposito: prova que quem libera a escrita e a linha de
-- permissao, nao a funcao de negocio.

select pg_temp.check('5.1', 'CONTROLE: Arquiteta CRM A (can_edit em crm) cadastra cliente', 'OK:1',
  'authenticated', (select edit_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
            values (%L, 'Cliente Novo Legitimo', '62900006666', 'novo@crm-rls.example.test', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('5.2', 'CONTROLE: Arquiteta CRM A altera cliente do escritorio', 'OK:1',
  'authenticated', (select edit_a from cl),
  format('update public.clients set name = %L where id = %L', 'Cliente A Um (editado)', (select cli_a1 from crm_ids)));

select pg_temp.check('5.3', 'CONTROLE: Arquiteta CRM A apaga cliente do escritorio', 'OK:1',
  'authenticated', (select edit_a from cl),
  format('delete from public.clients where id = %L', (select cli_a2 from crm_ids)));

select pg_temp.check('5.4', 'CONTROLE: Diretora A (can_edit em crm pelo seed) cadastra cliente', 'OK:1',
  'authenticated', (select dir_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente da Diretora', '62900007777', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('5.5', 'CONTROLE: Arquiteta CRM A altera o documento (deduplicacao recalculada pelo banco)', 'OK:1',
  'authenticated', (select edit_a from cl),
  format('update public.clients set tax_id = %L where id = %L', '111.222.333-44', (select cli_a1 from crm_ids)));

-- Caso 6 - can_edit em OUTRO menu nao escreve cliente -------------------------
--
-- O caso que prova que o helper olha o MENU, e nao "tem alguma permissao de
-- edicao". c_other_a tem can_edit em contracts e apenas can_view em crm.
-- Sem este bloco, um can_edit_menu() que ignorasse o parametro e devolvesse
-- "existe alguma permissao com can_edit" passaria em todos os outros casos.

select pg_temp.check('6.1', 'Administrativo A (can_edit em contracts, so can_view em crm) cadastra cliente', 'ERR:42501',
  'authenticated', (select other_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do Administrativo', '62900008888', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('6.2', 'Administrativo A altera cliente', 'OK:0',
  'authenticated', (select other_a from cl),
  format('update public.clients set name = %L where id = %L', 'Renomeado pelo Administrativo', (select cli_a1 from crm_ids)));

select pg_temp.check('6.3', 'Administrativo A apaga cliente', 'OK:0',
  'authenticated', (select other_a from cl),
  format('delete from public.clients where id = %L', (select cli_a1 from crm_ids)));

select pg_temp.check('6.C1', 'CONTROLE: Administrativo A LE os 2 clientes (a negativa e sobre o menu, nao sobre acesso)', 'OK:2',
  'authenticated', (select other_a from cl), 'select 1 from public.clients');

select pg_temp.check('6.C2', 'CONTROLE: Estagiario A, SEM permissao alguma, le os 2 clientes (leitura nao exige can_view)', 'OK:2',
  'authenticated', (select noperm_a from cl), 'select 1 from public.clients');

select pg_temp.check('6.4', 'Estagiario A, sem permissao alguma, cadastra cliente', 'ERR:42501',
  'authenticated', (select noperm_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do Estagiario', '62900009999', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

-- Caso 7 - escrita cruzada entre escritorios ----------------------------------
-- Leitura isolada nao basta: da para escrever em tenant que nao se enxerga se o
-- WITH CHECK estiver ausente ou frouxo.

select pg_temp.check('7.1', 'Arquiteta CRM A cadastra cliente com tenant_id do escritorio B', 'ERR:42501',
  'authenticated', (select edit_a from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Plantado em B', '62900010001', 'Goiania', 'GO')$q$,
         (select tenant_b from crm_ids)));

select pg_temp.check('7.2', 'Arquiteta CRM A altera cliente do escritorio B', 'OK:0',
  'authenticated', (select edit_a from cl),
  format('update public.clients set name = %L where id = %L', 'Sequestrado', (select cli_b1 from crm_ids)));

select pg_temp.check('7.3', 'Arquiteta CRM A apaga cliente do escritorio B', 'OK:0',
  'authenticated', (select edit_a from cl),
  format('delete from public.clients where id = %L', (select cli_b1 from crm_ids)));

-- Nao atribua este caso ao WITH CHECK: ele passa tambem sem a clausula, porque o
-- Postgres reusa o USING nesse caso e porque a linha resultante ainda precisa
-- passar pela policy de SELECT. O que ele afirma e o fato que importa para o
-- cliente - cliente nao muda de escritorio -, e ele so cai quando as duas
-- metades sao afrouxadas juntas. A presenca da clausula e assunto do 11.4.
select pg_temp.check('7.4', 'Arquiteta CRM A move cliente do proprio escritorio para o B (leitura + WITH CHECK, em camada)', 'ERR:42501',
  'authenticated', (select edit_a from cl),
  format('update public.clients set tenant_id = %L where id = %L', (select tenant_b from crm_ids), (select cli_a1 from crm_ids)));

select pg_temp.check('7.5', 'Diretor B cadastra cliente no escritorio A', 'ERR:42501',
  'authenticated', (select edit_b from cl),
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Plantado em A', '62900010002', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('7.6', 'Diretor B apaga todos os clientes de A de uma vez', 'OK:0',
  'authenticated', (select edit_b from cl),
  format('delete from public.clients where tenant_id = %L', (select tenant_a from crm_ids)));

-- Caso 8 - anon (o papel da chave publicavel) nao alcanca a tabela ------------
-- ERR:42501 aqui e ausencia de GRANT, e nao policy que nao casou: sem privilegio
-- o Postgres nem chega a avaliar a RLS. E a diferenca que a 0007 registrou -
-- policy sem GRANT da "permission denied"; GRANT sem policy entrega a tabela.

select pg_temp.check('8.1', 'anon le clients', 'ERR:42501', 'anon', null, 'select 1 from public.clients');

select pg_temp.check('8.2', 'anon cadastra cliente', 'ERR:42501', 'anon', null,
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente Pirata', '62900010003', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('8.3', 'anon altera cliente', 'ERR:42501', 'anon', null,
  format('update public.clients set name = %L where id = %L', 'Invadido', (select cli_a1 from crm_ids)));

select pg_temp.check('8.4', 'anon apaga cliente', 'ERR:42501', 'anon', null,
  format('delete from public.clients where id = %L', (select cli_a1 from crm_ids)));

select pg_temp.check('8.5', 'anon executa can_edit_menu (sem grant de execute)', 'ERR:42501', 'anon', null,
  $q$select public.can_edit_menu('crm')$q$);

-- Caso 9 - service_role mantem o bypass --------------------------------------
-- Escopado nos dois tenants da fixture de proposito: service_role enxerga tudo,
-- inclusive o escritorio de teste do seed e o que outro processo estiver
-- gravando. Contagem absoluta aqui ja acusou "bypass quebrado" no modulo 1 com o
-- bypass intacto.

select pg_temp.check('9.1', 'service_role le clientes dos DOIS escritorios da fixture', 'OK:3',
  'service_role', null,
  format('select 1 from public.clients where tenant_id in (%L, %L)',
    (select tenant_a from crm_ids), (select tenant_b from crm_ids)));

select pg_temp.check('9.2', 'service_role cadastra cliente (papel de edge function / importacao)', 'OK:1',
  'service_role', null,
  format($q$insert into public.clients (tenant_id, name, phone, address_city, address_state)
            values (%L, 'Cliente do service_role', '62900010004', 'Goiania', 'GO')$q$,
         (select tenant_a from crm_ids)));

select pg_temp.check('9.3', 'service_role altera cliente de um escritorio em que nao tem colaborador', 'OK:1',
  'service_role', null,
  format('update public.clients set name = %L where id = %L', 'Cliente B Um (pelo service_role)', (select cli_b1 from crm_ids)));

select pg_temp.check('9.4', 'service_role apaga cliente', 'OK:1',
  'service_role', null,
  format('delete from public.clients where id = %L', (select cli_a2 from crm_ids)));

-- Caso 10 - o helper can_edit_menu() por dentro -------------------------------
-- As policies escondem o valor do helper atras de OK:0 / ERR:42501. Aqui ele e
-- afirmado direto, porque e ele que os modulos 3 a 9 vao reusar - e um helper
-- errado nesses casos produz oito modulos errados.

select pg_temp.check_val('10.1', 'can_edit_menu(crm) para quem tem can_edit em crm', 'true',
  'authenticated', (select edit_a from cl), $q$select public.can_edit_menu('crm')$q$);

select pg_temp.check_val('10.2', 'can_edit_menu(crm) para quem tem apenas can_view em crm', 'false',
  'authenticated', (select view_a from cl), $q$select public.can_edit_menu('crm')$q$);

select pg_temp.check_val('10.3', 'can_edit_menu(contracts) para quem tem can_edit em contracts (o helper le o menu pedido)', 'true',
  'authenticated', (select other_a from cl), $q$select public.can_edit_menu('contracts')$q$);

select pg_temp.check_val('10.4', 'can_edit_menu(crm) para o MESMO usuario do 10.3', 'false',
  'authenticated', (select other_a from cl), $q$select public.can_edit_menu('crm')$q$);

select pg_temp.check_val('10.5', 'can_edit_menu(crm) para colaborador Afastado COM can_edit gravado', 'false',
  'authenticated', (select leave_a from cl), $q$select public.can_edit_menu('crm')$q$);

select pg_temp.check_val('10.6', 'can_edit_menu(crm) para usuario sem claim de tenant', 'false',
  'authenticated', (select orphan from cl), $q$select public.can_edit_menu('crm')$q$);

select pg_temp.check_val('10.7', 'can_edit_menu(crm) para usuario sem colaborador (aguardando aprovacao)', 'false',
  'authenticated', (select pending_a from cl), $q$select public.can_edit_menu('crm')$q$);

-- Claim de tenant B com colaborador que existe em A: e o token adulterado no
-- claim, nao no formato. auth_collaborator_id() exige user_id E tenant_id juntos.
select pg_temp.check_val('10.8', 'can_edit_menu(crm) para usuario de A com claim de tenant B', 'false',
  'authenticated', pg_temp.claims((select u_edit_a from crm_ids), (select tenant_b from crm_ids)),
  $q$select public.can_edit_menu('crm')$q$);

select pg_temp.check_val('10.9', 'can_edit_menu com chave de menu inexistente falha alto (22023), nao nega em silencio', 'ERR:22023',
  'authenticated', (select edit_a from cl), $q$select public.can_edit_menu('crmm')$q$);

select pg_temp.check_val('10.10', 'can_edit_menu e SECURITY DEFINER (nao depende da RLS de collaborator_permissions)', 'definer',
  'authenticated', (select edit_a from cl),
  $q$select case when p.prosecdef then 'definer' else 'invoker' end
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_edit_menu'$q$);

-- Caso 11 - superficie de acesso da tabela ------------------------------------
-- Afirmacoes de configuracao, nao de comportamento. Existem porque as duas
-- metades sao independentes: RLS ligada sem GRANT da tabela inalcancavel; GRANT
-- sem RLS entrega a tabela. O crm-schema.sql afirma o mesmo - duplicata de
-- proposito, para o achado nao depender de qual suite alguem rodou.

select pg_temp.check_val('11.1', 'RLS ligada em public.clients', 'true',
  'postgres', null, $q$select relrowsecurity::text from pg_class where oid = 'public.clients'::regclass$q$);

select pg_temp.check_val('11.2', 'anon nao tem privilegio algum em public.clients', '<null>',
  'postgres', null,
  $q$select nullif(string_agg(privilege_type, ','), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients' and grantee = 'anon'$q$);

select pg_temp.check_val('11.3', 'as 4 policies existem, uma por comando', 'DELETE,INSERT,SELECT,UPDATE',
  'postgres', null,
  $q$select string_agg(cmd, ',' order by cmd) from pg_policies
     where schemaname = 'public' and tablename = 'clients'$q$);

-- Este e o UNICO caso que acusa a ausencia do WITH CHECK, e por isso ele existe.
-- Medido por mutacao: remover a clausula do UPDATE nao muda comportamento nenhum
-- hoje (o Postgres reusa o USING, e a policy de SELECT tambem barra a linha
-- resultante), entao nenhum caso de comportamento cai. A clausula continua sendo
-- a metade que sobrevive a um afrouxamento futuro da leitura - ver 0018.
select pg_temp.check_val('11.4', 'INSERT e UPDATE tem WITH CHECK declarado', 'clients_insert_crm_editor,clients_update_crm_editor',
  'postgres', null,
  $q$select string_agg(policyname, ',' order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'clients' and with_check is not null$q$);

-- 12. Atalho de Diretor (migration 0019) --------------------------------------
--
-- POR QUE ESTA SECAO EXISTE
--   A 0019 fez can_edit_menu devolver true para Diretor sem consultar
--   collaborator_permissions, por fidelidade ao original
--   (usePermissions.jsx:43 da canEdit ao Diretor sem olhar a matriz).
--
--   Quando essa mudanca foi aplicada, as 114 asserçoes das duas suites
--   continuaram passando - antes E depois. Ou seja: uma mudanca de
--   autorizacao passou sem que nada acusasse. Nao havia Diretor SEM a linha de
--   permissao em fixture nenhuma: a Diretora A tem crm/can_edit gravado, e os
--   casos de escrita usam a Arquiteta de proposito, para provar que quem libera
--   e a permissao e nao a funcao. O atalho ficou no ponto cego exato entre as
--   duas escolhas.
--
--   Esta secao remove a linha de permissao da Diretora A dentro da propria
--   transacao e afirma o atalho a partir dai. Se alguem tirar o atalho do
--   helper, 12.1 e 12.2 caem.

delete from public.collaborator_permissions
where collaborator_id = (select c_dir_a from crm_ids)
  and menu_key = 'crm';

select pg_temp.check_val('12.1', 'ATALHO: Diretora SEM a linha de permissao tem can_edit_menu(crm) = true', 'true',
  'authenticated', pg_temp.claims((select u_dir_a from crm_ids), (select tenant_a from crm_ids)),
  $q$select public.can_edit_menu('crm')::text$q$);

select pg_temp.check('12.2', 'ATALHO: Diretora SEM a linha de permissao cria cliente', 'OK:1',
  'authenticated', pg_temp.claims((select u_dir_a from crm_ids), (select tenant_a from crm_ids)),
  format($q$
    insert into public.clients (tenant_id, name, phone, address_city, address_state)
    values (%L, 'Cliente Criado Pela Diretora', '(62) 90000-0099', 'Goiania', 'GO')
  $q$, (select tenant_a from crm_ids)));

-- CONTROLE: sem estes dois, "o atalho funciona" seria indistinguivel de "o
-- helper passou a devolver true para todo mundo".
select pg_temp.check_val('12.C1', 'CONTROLE: Estagiario sem permissao nenhuma continua sem editar', 'false',
  'authenticated', pg_temp.claims((select u_noperm_a from crm_ids), (select tenant_a from crm_ids)),
  $q$select public.can_edit_menu('crm')::text$q$);

select pg_temp.check_val('12.C2', 'CONTROLE: Coordenador com apenas can_view continua sem editar', 'false',
  'authenticated', pg_temp.claims((select u_view_a from crm_ids), (select tenant_a from crm_ids)),
  $q$select public.can_edit_menu('crm')::text$q$);

-- O atalho depende de auth_collaborator_id(), que ja exige status active.
-- Promover o Afastado a Diretor prova que o atalho NAO passa por cima do
-- status. Sem estes casos, a afirmacao "Diretor afastado nao escreve" existia
-- apenas no COMMENT da 0019 - e este projeto ja colecionou afirmacao sem teste.
update public.collaborators
set role = 'director'
where id = (select c_leave_a from crm_ids);

update public.collaborators
set role = 'director'
where id = (select c_vac_a from crm_ids);

delete from public.collaborator_permissions
where collaborator_id in ((select c_leave_a from crm_ids), (select c_vac_a from crm_ids));

select pg_temp.check_val('12.C3', 'CONTROLE: Diretor Afastado NAO edita (status manda sobre o atalho)', 'false',
  'authenticated', pg_temp.claims((select u_leave_a from crm_ids), (select tenant_a from crm_ids)),
  $q$select public.can_edit_menu('crm')::text$q$);

select pg_temp.check_val('12.C3b', 'CONTROLE: Diretor de Ferias NAO edita', 'false',
  'authenticated', pg_temp.claims((select u_vac_a from crm_ids), (select tenant_a from crm_ids)),
  $q$select public.can_edit_menu('crm')::text$q$);

-- Nao basta o helper devolver false: a policy tem que recusar de fato. Sem este
-- caso, um erro que fizesse a policy ignorar o helper passaria sem acusar.
select pg_temp.check('12.C3c', 'CONTROLE: Diretor Afastado nao cria cliente', 'ERR:42501',
  'authenticated', pg_temp.claims((select u_leave_a from crm_ids), (select tenant_a from crm_ids)),
  format($q$
    insert into public.clients (tenant_id, name, phone, address_city, address_state)
    values (%L, 'Cliente do Diretor Afastado', '(62) 90000-0098', 'Goiania', 'GO')
  $q$, (select tenant_a from crm_ids)));

-- Diretor de OUTRO escritorio nao ganha nada no escritorio A.
-- Sonda de CONTAGEM, nao de valor: `select 1 from ... where` sem linha devolve
-- nulo na sonda de valor, e nulo nao distingue "nao encontrou" de "falhou".
select pg_temp.check('12.C3d', 'CONTROLE: Diretor de B nao alcanca cliente de A', 'OK:0',
  'authenticated', pg_temp.claims((select u_edit_b from crm_ids), (select tenant_b from crm_ids)),
  format($q$select 1 from public.clients where id = %L$q$, (select cli_a1 from crm_ids)));

-- Chave inexistente falha alto ANTES do atalho: erro de digitacao na policy de
-- um modulo futuro nao pode virar "so Diretor escreve" em silencio.
select pg_temp.check_val('12.C4', 'CONTROLE: chave inexistente falha alto mesmo para Diretor', 'ERR:22023',
  'authenticated', pg_temp.claims((select u_dir_a from crm_ids), (select tenant_a from crm_ids)),
  $q$select public.can_edit_menu('contratcs')::text$q$);

-- Resultado -------------------------------------------------------------------

select
  case when observed = expected then 'PASS' else 'FAIL' end as status,
  caso, descricao, expected, observed
from crm_results
order by seq;

rollback;
