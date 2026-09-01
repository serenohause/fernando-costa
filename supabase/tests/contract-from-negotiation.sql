-- Teste de public.mark_negotiation_won (migration 0067).
--
-- O QUE ELE AFIRMA
--   1. Marcar Ganha cria o contrato, com os campos do original e com o vinculo
--      (contracts.negotiation_id), e fecha a negociacao na MESMA chamada.
--   2. generates_contract falso fecha o negocio e NAO cria contrato.
--   3. Chamar de novo nao cria um segundo contrato, e nao levanta erro - devolve
--      already_exists com o id do contrato que ja existe.
--   4. QUEM TEM can_edit no menu 'pipeline' E NAO TEM no menu 'contracts' CRIA.
--      E o caso que justifica a funcao existir e ser SECURITY DEFINER: o preset
--      "Perfil Comercial" do original (PermissoesManager.jsx:59-66) e exatamente
--      essa combinacao. O caso 4.1 prova a outra metade - esse mesmo colaborador
--      leva 42501 ao tentar escrever em contracts pela porta da frente.
--   5. Quem nao tem pipeline, quem esta afastado e quem e de outro escritorio sao
--      recusados, e NADA e gravado (nem contrato, nem o fechamento da negociacao).
--   6. O retrato do cliente entra so com o cadastro completo (crmCompleto do
--      original), e a falta dele nao impede o contrato de nascer.
--   7. O numero do contrato nao colide, inclusive quando o sufixo do relogio ja
--      esta ocupado no escritorio.
--
-- CONTROLE POSITIVO EM CADA NEGACAO
--   Todo caso que afirma "nao cria" tem ao lado um caso que afirma o que
--   ACONTECEU no lugar (o negocio fechou; a negociacao continua Ativa; o contrato
--   nasceu sem retrato). Sem isso, uma funcao que recusasse tudo passaria com
--   nota cheia.
--
-- COMO RODAR
--   npm run test:contract-from-negotiation
--
-- COMO LER
--   observed = 'OK'              a chamada passou.
--   observed = 'ERR:<mensagem>'  a chamada foi recusada, com a mensagem estavel
--                                que a funcao levanta (P0001).
--   observed = 'ERR:<sqlstate>'  nos casos que exercitam a RLS pela porta da
--                                frente, onde o que importa e o 42501.
--   Nos demais, o observado e o valor lido do banco depois da chamada.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug cfn-test-*) e nao encostam em fernando-costa nem em
--   fernando-costa-teste - o banco e o hospedado, com dado real do escritorio
--   dentro. Nenhum caso afirma contagem absoluta de tabela: toda contagem e
--   escopada nas fixtures.

begin;

-- Instrumentacao --------------------------------------------------------------

create temp table res (
  seq serial primary key, caso text, descricao text, expected text, observed text
) on commit drop;

-- Sonda de valor, como postgres: le o que ficou gravado.
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

-- Chama COMO OUTRA PESSOA e devolve a MENSAGEM do erro, nao o sqlstate: os cinco
-- erros de negocio da funcao saem todos como P0001, e 'ERR:P0001' nao
-- distinguiria "nao autorizado" de "negociacao sem cliente".
create or replace function pg_temp.call_as(p_caso text, p_desc text, p_expected text,
                                           p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql;
    perform set_config('role', 'postgres', true);
    v_out := 'OK';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'postgres', true);
    v_out := 'ERR:' || v_msg;
  end;
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- Igual a call_as, mas devolve o VALOR que a chamada produziu (uma chave do
-- jsonb da funcao). E como se le o desfecho que a tela vai receber.
create or replace function pg_temp.call_val(p_caso text, p_desc text, p_expected text,
                                            p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql into v_out;
    perform set_config('role', 'postgres', true);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'postgres', true);
    v_out := 'ERR:' || v_msg;
  end;
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v_out, '<null>'));
end;
$$;

-- Chama COMO OUTRA PESSOA e devolve o SQLSTATE: para o caso que bate na RLS de
-- contracts, onde a mensagem do Postgres nao e estavel e o 42501 e.
create or replace function pg_temp.call_state(p_caso text, p_desc text, p_expected text,
                                              p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_state text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql;
    perform set_config('role', 'postgres', true);
    v_out := 'OK';
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
  'd1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'd2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'd1000000-0000-4000-8000-000000000001'::uuid as u_pipe,
  'd1000000-0000-4000-8000-000000000002'::uuid as u_none,
  'd1000000-0000-4000-8000-000000000003'::uuid as u_leave,
  'd2000000-0000-4000-8000-000000000001'::uuid as u_b,
  'd1100000-0000-4000-8000-000000000001'::uuid as c_pipe,
  'd1100000-0000-4000-8000-000000000002'::uuid as c_none,
  'd1100000-0000-4000-8000-000000000003'::uuid as c_leave,
  'd2100000-0000-4000-8000-000000000001'::uuid as c_b,
  'd1300000-0000-4000-8000-000000000001'::uuid as cl_full,
  'd1300000-0000-4000-8000-000000000002'::uuid as cl_partial,
  'd2300000-0000-4000-8000-000000000001'::uuid as cl_b,
  'd1400000-0000-4000-8000-000000000001'::uuid as n_main,
  'd1400000-0000-4000-8000-000000000002'::uuid as n_arch,
  'd1400000-0000-4000-8000-000000000003'::uuid as n_inter,
  'd1400000-0000-4000-8000-000000000004'::uuid as n_eng,
  'd1400000-0000-4000-8000-000000000005'::uuid as n_nocontract,
  'd1400000-0000-4000-8000-000000000006'::uuid as n_partial,
  'd1400000-0000-4000-8000-000000000007'::uuid as n_denied,
  'd1400000-0000-4000-8000-000000000008'::uuid as n_leave,
  'd1400000-0000-4000-8000-000000000009'::uuid as n_lost,
  'd1400000-0000-4000-8000-00000000000a'::uuid as n_noclient,
  'd2400000-0000-4000-8000-000000000001'::uuid as n_b,
  'd2400000-0000-4000-8000-000000000002'::uuid as n_b_number,
  'd2500000-0000-4000-8000-000000000001'::uuid as ct_b_taken;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_pipe from ids) u, 'cfn-test-pipe@example.test' e
  union all select (select u_none from ids), 'cfn-test-none@example.test'
  union all select (select u_leave from ids), 'cfn-test-leave@example.test'
  union all select (select u_b from ids), 'cfn-test-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Contract From Negotiation A', 'cfn-test-a'),
  ((select tenant_b from ids), 'Contract From Negotiation B', 'cfn-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_pipe from ids), 'member'),
  ((select tenant_a from ids), (select u_none from ids), 'member'),
  ((select tenant_a from ids), (select u_leave from ids), 'member'),
  ((select tenant_b from ids), (select u_b from ids), 'member');

-- Nenhum e Diretor: o atalho da 0019 faria a secao 4 passar sem provar que a
-- funcao le a permissao de menu.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_pipe from ids), (select tenant_a from ids), (select u_pipe from ids),
   'Renata Alves', 'admin_staff', 'cfn-test-pipe@example.test', 'active'),
  ((select c_none from ids), (select tenant_a from ids), (select u_none from ids),
   'Tiago Barbosa', 'architect', 'cfn-test-none@example.test', 'active'),
  ((select c_leave from ids), (select tenant_a from ids), (select u_leave from ids),
   'Paula Nogueira', 'admin_staff', 'cfn-test-leave@example.test', 'on_leave'),
  ((select c_b from ids), (select tenant_b from ids), (select u_b from ids),
   'Marcos Prado', 'admin_staff', 'cfn-test-b@example.test', 'active');

-- Renata e Paula sao o "Perfil Comercial" do original: Pipeline COM edicao,
-- Contratos & Propostas SEM edicao. A linha de contracts existe de proposito -
-- sem ela, "cria mesmo assim" nao distinguiria permissao negada de permissao
-- ausente. Tiago tem a linha de pipeline com can_edit falso, pelo mesmo motivo.
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_pipe from ids), 'pipeline', true, true),
  ((select tenant_a from ids), (select c_pipe from ids), 'contracts', true, false),
  ((select tenant_a from ids), (select c_none from ids), 'pipeline', true, false),
  ((select tenant_a from ids), (select c_none from ids), 'contracts', true, false),
  ((select tenant_a from ids), (select c_leave from ids), 'pipeline', true, true),
  ((select tenant_b from ids), (select c_b from ids), 'pipeline', true, true),
  ((select tenant_b from ids), (select c_b from ids), 'contracts', true, false);

-- Cadastro COMPLETO pelo criterio do original: nome, telefone, cidade/UF de
-- residencia e os quatro campos da obra.
insert into public.clients (id, tenant_id, name, phone, email, tax_id, birth_date,
                            address_zipcode, address_street, address_number, address_complement,
                            address_city, address_state,
                            site_zipcode, site_street, site_number, site_complement,
                            site_city, site_state) values
  ((select cl_full from ids), (select tenant_a from ids), 'Helena Vasconcelos', '(31) 99999-1010',
   'helena@example.test', '123.456.789-00', '1985-04-12',
   '30140-071', 'Rua da Bahia', '1200', 'Apto 802', 'Belo Horizonte', 'MG',
   '34000-000', 'Alameda do Ipe', '45', 'Lote 3', 'Nova Lima', 'MG');

-- Mesmo cadastro SEM o CEP da obra: um campo a menos e o retrato nao entra.
insert into public.clients (id, tenant_id, name, phone, email, tax_id,
                            address_city, address_state,
                            site_street, site_city, site_state) values
  ((select cl_partial from ids), (select tenant_a from ids), 'Otavio Mendes', '(31) 98888-2020',
   'otavio@example.test', '987.654.321-00', 'Belo Horizonte', 'MG',
   'Rua das Acacias', 'Nova Lima', 'MG');

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cl_b from ids), (select tenant_b from ids), 'Cliente do Outro Escritorio',
   '(11) 97777-3030', 'Sao Paulo', 'SP');

insert into public.negotiations
  (id, tenant_id, name, client_id, commercial_owner_id, estimated_value,
   status, funnel_stage, origin, referrer_name, generates_contract) values
  ((select n_main from ids), (select tenant_a from ids), 'Residência Vila Nova',
   (select cl_full from ids), (select c_pipe from ids), 128000.00,
   'active', 'closing', 'referral', 'Marcos Prado', true),
  ((select n_arch from ids), (select tenant_a from ids), 'Casa Serra Verde',
   (select cl_full from ids), (select c_pipe from ids), 90000.00,
   'active', 'closing', 'instagram', null, true),
  ((select n_inter from ids), (select tenant_a from ids), 'Apartamento Savassi',
   (select cl_full from ids), (select c_pipe from ids), 60000.00,
   'active', 'closing', 'website', null, true),
  ((select n_eng from ids), (select tenant_a from ids), 'Galpao Industrial',
   (select cl_full from ids), (select c_pipe from ids), 250000.00,
   'active', 'closing', 'other', null, true),
  ((select n_nocontract from ids), (select tenant_a from ids), 'Consultoria Pontual',
   (select cl_full from ids), (select c_pipe from ids), 8000.00,
   'active', 'closing', 'other', null, false),
  ((select n_partial from ids), (select tenant_a from ids), 'Sobrado Buritis',
   (select cl_partial from ids), (select c_pipe from ids), 110000.00,
   'active', 'closing', 'referral', 'Ana Lima', true),
  ((select n_denied from ids), (select tenant_a from ids), 'Negociacao Intocada',
   (select cl_full from ids), (select c_pipe from ids), 50000.00,
   'active', 'closing', 'other', null, true),
  ((select n_leave from ids), (select tenant_a from ids), 'Negociacao Intocada 2',
   (select cl_full from ids), (select c_pipe from ids), 50000.00,
   'active', 'closing', 'other', null, true),
  ((select n_noclient from ids), (select tenant_a from ids), 'Lead Sem Cadastro',
   null, (select c_pipe from ids), 30000.00,
   'active', 'lead_received', 'other', null, true),
  ((select n_b from ids), (select tenant_b from ids), 'Negociacao do Outro Escritorio',
   (select cl_b from ids), (select c_b from ids), 70000.00,
   'active', 'closing', 'other', null, true),
  ((select n_b_number from ids), (select tenant_b from ids), 'Negociacao da Numeracao',
   (select cl_b from ids), (select c_b from ids), 70000.00,
   'active', 'closing', 'other', null, true);

insert into public.negotiations
  (id, tenant_id, name, client_id, commercial_owner_id, estimated_value,
   status, funnel_stage, closed_at, loss_reason, generates_contract) values
  ((select n_lost from ids), (select tenant_a from ids), 'Negociacao Perdida',
   (select cl_full from ids), (select c_pipe from ids), 40000.00,
   'lost', 'closing', current_date, 'price', true);

-- Os quatro conjuntos de servico que o criterio de docs/ENUM-MAP.md distingue.
--
-- Desde a 0084 o servico e uma linha de service_types, resolvida aqui pela
-- CHAVE. E de proposito que o teste passe pela chave e nao pelo id literal: a
-- derivacao do tipo de contrato agora le `contract_group` da tabela, e o que
-- este arquivo precisa provar e que o criterio antigo continua valendo para os
-- seis tipos que o escritorio ja tinha.
insert into public.negotiation_services (tenant_id, negotiation_id, service_type_id)
select v.tenant_id, v.negotiation_id, st.id
from (values
  ((select tenant_a from ids), (select n_main from ids), 'architecture'),
  ((select tenant_a from ids), (select n_main from ids), 'interiors'),
  ((select tenant_a from ids), (select n_main from ids), 'electrical'),
  ((select tenant_a from ids), (select n_arch from ids), 'architecture'),
  ((select tenant_a from ids), (select n_inter from ids), 'architecture'),
  ((select tenant_a from ids), (select n_inter from ids), 'interiors'),
  ((select tenant_a from ids), (select n_eng from ids), 'architecture'),
  ((select tenant_a from ids), (select n_eng from ids), 'structural'),
  ((select tenant_a from ids), (select n_partial from ids), 'architecture'),
  ((select tenant_b from ids), (select n_b from ids), 'architecture'),
  ((select tenant_b from ids), (select n_b_number from ids), 'architecture')
) as v(tenant_id, negotiation_id, key)
join public.service_types st
  on st.tenant_id = v.tenant_id and st.key = v.key;

-- O sufixo do relogio ja ocupado no escritorio B, com o maior valor possivel de
-- 13 digitos: o proximo numero gerado la NAO pode ser este.
insert into public.contracts (id, tenant_id, contract_number, contract_type, total_value) values
  ((select ct_b_taken from ids), (select tenant_b from ids), 'CTR-9999999999999', 'architecture', 1000.00);

-- 1. Marcar Ganha cria o contrato ---------------------------------------------

select pg_temp.val('1.0', 'CONTROLE: a negociacao nasce sem contrato vinculado', '0', format($q$
  select count(*)::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.1', 'CONTROLE: e nasce Ativa', 'active', format($q$
  select status::text from public.negotiations where id = %L
$q$, (select n_main from ids)));

-- A chamada. Quem chama tem can_edit em 'pipeline' e NAO tem em 'contracts'.
select pg_temp.call_val('1.2', 'marcar Ganha devolve outcome created', 'created',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L) ->> 'outcome'
$q$, (select n_main from ids)));

select pg_temp.val('1.3', 'existe UM contrato apontando para a negociacao', '1', format($q$
  select count(*)::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.4', 'o nome do projeto e o nome da negociacao', 'Residência Vila Nova', format($q$
  select project_name from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.5', 'o valor total e o valor estimado da negociacao', '128000.00', format($q$
  select total_value::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.6', 'o contrato nasce Em negociacao', 'negotiating', format($q$
  select status::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.7', 'assinatura e inicio sao hoje',
  current_date::text || '|' || current_date::text, format($q$
  select signature_date::text || '|' || start_date::text
    from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.8', 'a observacao diz de onde o contrato veio',
  'Contrato criado automaticamente a partir da negociação: Residência Vila Nova', format($q$
  select notes from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.9', 'origem do lead e indicador foram copiados', 'referral|Marcos Prado', format($q$
  select origin::text || '|' || referrer_name from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.10', 'o cliente do contrato e o da negociacao', 'true', format($q$
  select (c.client_id = n.client_id)::text
    from public.contracts c join public.negotiations n on n.id = c.negotiation_id
   where c.negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.11', 'o contrato nasce sem parcelas geradas', 'false', format($q$
  select installments_generated::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

-- O fechamento do negocio e a criacao do contrato sao a MESMA transacao.
select pg_temp.val('1.12', 'a negociacao ficou Ganha, fechada hoje',
  'won|' || current_date::text, format($q$
  select status::text || '|' || closed_at::text from public.negotiations where id = %L
$q$, (select n_main from ids)));

select pg_temp.val('1.13', 'tipo de contrato: Interiores + complementar = full', 'full', format($q$
  select contract_type::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

-- Os outros tres conjuntos de servico. Chamada e leitura em comandos separados
-- de proposito: dentro do MESMO comando, a linha que a funcao acabou de inserir
-- nao esta no snapshot do scan que a leria.
select pg_temp.call_as('1.14', 'marca Ganha a negociacao so de Arquitetura', 'OK',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_arch from ids)));

select pg_temp.val('1.15', 'so Arquitetura vira architecture', 'architecture', format($q$
  select contract_type::text from public.contracts where negotiation_id = %L
$q$, (select n_arch from ids)));

select pg_temp.call_as('1.16', 'marca Ganha a negociacao de Arquitetura + Interiores', 'OK',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_inter from ids)));

select pg_temp.val('1.17', 'Arquitetura + Interiores vira architecture_interiors',
  'architecture_interiors', format($q$
  select contract_type::text from public.contracts where negotiation_id = %L
$q$, (select n_inter from ids)));

select pg_temp.call_as('1.18', 'marca Ganha a negociacao de Arquitetura + Estrutura', 'OK',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_eng from ids)));

select pg_temp.val('1.19', 'Arquitetura + Estrutura vira architecture_engineering',
  'architecture_engineering', format($q$
  select contract_type::text from public.contracts where negotiation_id = %L
$q$, (select n_eng from ids)));

-- 2. gera_contrato desmarcado --------------------------------------------------

select pg_temp.call_val('2.1', 'sem generates_contract o desfecho e not_requested', 'not_requested',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L) ->> 'outcome'
$q$, (select n_nocontract from ids)));

select pg_temp.val('2.2', 'e NENHUM contrato foi criado', '0', format($q$
  select count(*)::text from public.contracts where negotiation_id = %L
$q$, (select n_nocontract from ids)));

-- CONTROLE POSITIVO: o negocio fechou do mesmo jeito, como no original.
select pg_temp.val('2.3', 'CONTROLE: a negociacao ficou Ganha mesmo assim', 'won', format($q$
  select status::text from public.negotiations where id = %L
$q$, (select n_nocontract from ids)));

-- 3. Idempotencia --------------------------------------------------------------

select pg_temp.call_val('3.1', 'chamar de novo devolve already_exists, SEM erro', 'already_exists',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L) ->> 'outcome'
$q$, (select n_main from ids)));

select pg_temp.call_val('3.2', 'e devolve o id do contrato que ja existia', 'true',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select ((public.mark_negotiation_won(%L) ->> 'contractId')::uuid
          = (select id from public.contracts where negotiation_id = %L))::text
$q$, (select n_main from ids), (select n_main from ids)));

select pg_temp.val('3.3', 'continua sendo UM contrato', '1', format($q$
  select count(*)::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('3.4', 'e o numero dele nao mudou', '1', format($q$
  select count(distinct contract_number)::text from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

-- 4. Autorizacao conferida POR DENTRO -------------------------------------------
--
-- SECURITY DEFINER passa por cima da RLS: sem estes casos, qualquer colaborador
-- active de qualquer escritorio fecharia negocio e criaria contrato em qualquer
-- negociacao.

-- O CASO QUE JUSTIFICA O DESENHO INTEIRO. Quem criou os contratos da secao 1 e
-- exatamente quem a RLS de contracts (0030) recusa aqui.
select pg_temp.call_state('4.1',
  'CONTROLE: quem criou o contrato pela funcao NAO escreve em contracts pela porta da frente',
  'ERR:42501',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value)
  values (%L, 'CFN-DIRETO', 'architecture', 1000.00)
$q$, (select tenant_a from ids)));

select pg_temp.call_as('4.2', 'colaborador SEM can_edit em pipeline e recusado',
  'ERR:not_authorized',
  (select u_none from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_denied from ids)));

select pg_temp.val('4.3', 'CONTROLE: e nada foi gravado - negociacao Ativa, zero contrato',
  'active|0', format($q$
  select n.status::text || '|' || (select count(*) from public.contracts c where c.negotiation_id = n.id)::text
    from public.negotiations n where n.id = %L
$q$, (select n_denied from ids)));

-- Afastada, mas com can_edit em pipeline gravado: quem barra e o status, via
-- auth_collaborator_id() dentro de can_edit_menu.
select pg_temp.call_as('4.4', 'colaborador afastado e recusado, mesmo com a permissao gravada',
  'ERR:not_authorized',
  (select u_leave from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_leave from ids)));

select pg_temp.val('4.5', 'CONTROLE: e nada foi gravado', 'active|0', format($q$
  select n.status::text || '|' || (select count(*) from public.contracts c where c.negotiation_id = n.id)::text
    from public.negotiations n where n.id = %L
$q$, (select n_leave from ids)));

-- Negociacao do OUTRO escritorio, chamada por quem tem permissao no seu. A funcao
-- busca com tenant_id = auth_tenant_id(), entao ela nem existe daqui.
select pg_temp.call_as('4.6', 'negociacao de outro escritorio nao e alcancada',
  'ERR:negotiation_not_found',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_b from ids)));

select pg_temp.val('4.7', 'CONTROLE: e a negociacao de la continua Ativa e sem contrato',
  'active|0', format($q$
  select n.status::text || '|' || (select count(*) from public.contracts c where c.negotiation_id = n.id)::text
    from public.negotiations n where n.id = %L
$q$, (select n_b from ids)));

select pg_temp.call_as('4.8', 'negociacao Perdida nao vira Ganha por aqui',
  'ERR:negotiation_lost',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_lost from ids)));

select pg_temp.call_as('4.9', 'negociacao sem cliente e recusada, como na tela do original',
  'ERR:client_required',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L)
$q$, (select n_noclient from ids)));

select pg_temp.val('4.10', 'CONTROLE: e ela continua Ativa', 'active', format($q$
  select status::text from public.negotiations where id = %L
$q$, (select n_noclient from ids)));

-- 5. O retrato do cliente --------------------------------------------------------

select pg_temp.val('5.1', 'cadastro completo: o retrato do cliente entrou',
  'Helena Vasconcelos|helena@example.test|123.456.789-00|1985-04-12', format($q$
  select client_legal_name || '|' || client_email || '|' || client_tax_id || '|' || client_birth_date::text
    from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('5.2', 'com o endereco residencial',
  '30140-071|Rua da Bahia|1200|Apto 802|Belo Horizonte|MG', format($q$
  select concat_ws('|', client_address_zipcode, client_address_street, client_address_number,
                        client_address_complement, client_address_city, client_address_state)
    from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

select pg_temp.val('5.3', 'e com o endereco da obra',
  '34000-000|Alameda do Ipe|45|Lote 3|Nova Lima|MG', format($q$
  select concat_ws('|', site_zipcode, site_street, site_number, site_complement, site_city, site_state)
    from public.contracts where negotiation_id = %L
$q$, (select n_main from ids)));

-- Falta UM campo do criterio (o CEP da obra): o retrato nao entra.
select pg_temp.call_val('5.4', 'cadastro incompleto: clientSnapshot e falso', 'false',
  (select u_pipe from ids), (select tenant_a from ids), format($q$
  select public.mark_negotiation_won(%L) ->> 'clientSnapshot'
$q$, (select n_partial from ids)));

select pg_temp.val('5.5', 'e o contrato nasceu SEM o retrato', '<null>', format($q$
  select coalesce(client_legal_name, '<null>') || coalesce(site_city, '')
    from public.contracts where negotiation_id = %L
$q$, (select n_partial from ids)));

-- CONTROLE POSITIVO: cadastro incompleto nao impede o contrato de nascer.
select pg_temp.val('5.6', 'CONTROLE: o contrato foi criado do mesmo jeito, com nome e valor',
  'Sobrado Buritis|110000.00', format($q$
  select project_name || '|' || total_value::text
    from public.contracts where negotiation_id = %L
$q$, (select n_partial from ids)));

select pg_temp.val('5.7', 'CONTROLE: e o cliente continua vinculado por id', 'true', format($q$
  select (client_id = %L)::text from public.contracts where negotiation_id = %L
$q$, (select cl_partial from ids), (select n_partial from ids)));

-- 6. O numero do contrato ---------------------------------------------------------

-- ESCRITORIO SEM CONTRATO ANTERIOR: nao ha modelo a seguir, e a numeracao
-- comeca em 0001 e anda de um em um (0083). O formato CTR-<relogio> que este
-- caso conferia era o do original e saiu junto com o sufixo de relogio: quem
-- da o modelo agora e o ULTIMO contrato do proprio escritorio, como no 6.3.
select pg_temp.val('6.1', 'sem contrato anterior, a numeracao comeca em 0001 e e sequencial',
  '0001,0002,0003,0004,0005', format($q$
  select string_agg(contract_number, ',' order by contract_number)
    from public.contracts where tenant_id = %L
$q$, (select tenant_a from ids)));

-- Cinco contratos criados nesta transacao, possivelmente no mesmo milissegundo.
select pg_temp.val('6.2', 'os cinco contratos do escritorio tem numeros diferentes', '5|5', format($q$
  select count(*)::text || '|' || count(distinct contract_number)::text
    from public.contracts where tenant_id = %L
$q$, (select tenant_a from ids)));

-- O sufixo do relogio ja esta ocupado no escritorio B (CTR-9999999999999): o
-- numero novo passa por cima em vez de colidir.
select pg_temp.call_val('6.3', 'com o sufixo do relogio ocupado, o proximo numero e o seguinte',
  'CTR-10000000000000',
  (select u_b from ids), (select tenant_b from ids), format($q$
  select public.mark_negotiation_won(%L) ->> 'contractNumber'
$q$, (select n_b_number from ids)));

select pg_temp.val('6.4', 'CONTROLE: os dois numeros convivem no escritorio B',
  'CTR-10000000000000|CTR-9999999999999', format($q$
  select string_agg(contract_number, '|' order by contract_number)
    from public.contracts where tenant_id = %L
$q$, (select tenant_b from ids)));

-- A NUMERACAO E POR ESCRITORIO: o CTR-9999999999999 do B nao serviu de modelo
-- para o A, que seguiu comecando do zero. Sem o recorte por tenant_id o
-- escritorio A teria herdado a numeracao de um escritorio que nao e o dele.
select pg_temp.val('6.5', 'CONTROLE: e nao empurraram a numeracao do escritorio A', '0', format($q$
  select count(*)::text from public.contracts
   where tenant_id = %L and contract_number like 'CTR-%%'
$q$, (select tenant_a from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
