-- Teste de schema do modulo 4 (Contratos) - contracts
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio, quatro policies,
--   WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios, colaborador afastado sem leitura,
--   escrita presa ao menu 'contracts') estao em
--   supabase/tests/pattern-invariants.sql e cobrem contracts desde que ela
--   entrou em pattern_tables. NADA disso se repete aqui.
--
--   Aqui fica somente a regra de negocio listada em docs/SCHEMA-PLAN.md, secao
--   "Modulo 4 - Regra de negocio para o teste proprio": numero unico por
--   escritorio, valor nao negativo, parcelamento inteiro ou ausente, bandeira de
--   parcelas geradas so com plano, vigencia nao anterior a assinatura, prazos de
--   fase positivos, e as duas FK compostas.
--
-- COMO RODAR
--   npm run test:schema:contracts
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23503 FK violada,
--                         23505 unique violado.
--   Casos marcados CONTROLE afirmam o que precisa CONTINUAR possivel. Sem eles,
--   um check escrito ao contrario - que recusasse tudo - passaria com nota
--   cheia, e nota cheia e o que faz ninguem reler o teste.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug contracts-schema-test-*), e nenhuma contagem e absoluta sobre
--   tabela de negocio - o escritorio de teste do seed tem dado permanente.

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

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'c1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'c2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'c1100000-0000-4000-8000-000000000001'::uuid as owner_a,
  'c2200000-0000-4000-8000-000000000001'::uuid as owner_b,
  'c1300000-0000-4000-8000-000000000001'::uuid as client_a,
  'c2300000-0000-4000-8000-000000000001'::uuid as client_b,
  'c1200000-0000-4000-8000-000000000001'::uuid as neg_a,
  'c2200000-0000-4000-8000-000000000002'::uuid as neg_b;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Contracts Schema Test A', 'contracts-schema-test-a'),
  ((select tenant_b from ids), 'Contracts Schema Test B', 'contracts-schema-test-b');

insert into public.collaborators (id, tenant_id, name, role, email, status) values
  ((select owner_a from ids), (select tenant_a from ids), 'Comercial A', 'architect',
   'contracts-schema-a@example.test', 'active'),
  ((select owner_b from ids), (select tenant_b from ids), 'Comercial B', 'architect',
   'contracts-schema-b@example.test', 'active');

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select client_a from ids), (select tenant_a from ids), 'Marcela Peixoto',
   '(62) 99744-1100', 'Goiania', 'GO'),
  ((select client_b from ids), (select tenant_b from ids), 'Ricardo Sampaio',
   '(62) 99744-2200', 'Anapolis', 'GO');

insert into public.negotiations (id, tenant_id, name, client_id, commercial_owner_id) values
  ((select neg_a from ids), (select tenant_a from ids), 'Residencia Jardim Goias',
   (select client_a from ids), (select owner_a from ids)),
  ((select neg_b from ids), (select tenant_b from ids), 'Loja Setor Central',
   (select client_b from ids), (select owner_b from ids));

-- Contrato ja existente no escritorio A, alvo dos casos de unicidade.
insert into public.contracts (tenant_id, contract_number, contract_type, total_value) values
  ((select tenant_a from ids), 'CTR-2026-001', 'architecture', 185000);

-- 1. Numero de contrato unico POR ESCRITORIO -----------------------------------
--
-- O original nao impede dois contratos com o mesmo numero, e o numero e o que
-- identifica o contrato na busca da tela e no titulo das tarefas geradas.

select pg_temp.chk('1.1', 'numero repetido no MESMO escritorio e recusado', 'ERR:23505', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value)
  values (%L, 'CTR-2026-001', 'architecture_interiors', 90000)
$q$, (select tenant_a from ids)));

-- Sem este caso, 1.1 passaria igual com um unique global sobre contract_number,
-- e dois escritorios nunca mais poderiam chegar ao mesmo CTR-001.
select pg_temp.chk('1.2', 'CONTROLE: o MESMO numero no outro escritorio entra', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value)
  values (%L, 'CTR-2026-001', 'architecture', 120000)
$q$, (select tenant_b from ids)));

-- 2. Valor total nao negativo ---------------------------------------------------

select pg_temp.chk('2.1', 'valor total negativo e recusado', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value)
  values (%L, 'CTR-NEG', 'architecture', -1)
$q$, (select tenant_a from ids)));

-- Zero e o limite, e e valido: permuta e contrato de cortesia existem.
select pg_temp.chk('2.2', 'CONTROLE: valor total zero entra', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value)
  values (%L, 'CTR-ZERO', 'architecture', 0)
$q$, (select tenant_a from ids)));

-- 3. Parcelamento: os tres campos, ou nenhum -----------------------------------
--
-- Parcelamento pela metade gera parcela errada no modulo 7: quantidade sem data
-- de vencimento nao tem por onde comecar, data sem quantidade nao tem onde
-- parar. O caso 2.2 acima ja e o controle do "nenhum dos tres".

select pg_temp.chk('3.1', 'zero parcelas e recusado', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                installment_count, first_due_date, installment_frequency)
  values (%L, 'CTR-P0', 'architecture', 50000, 0, current_date, 'monthly')
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.2', 'so a quantidade de parcelas, sem data nem periodicidade', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                installment_count)
  values (%L, 'CTR-P1', 'architecture', 50000, 10)
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.3', 'quantidade e data, sem periodicidade', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                installment_count, first_due_date)
  values (%L, 'CTR-P2', 'architecture', 50000, 10, current_date)
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.4', 'CONTROLE: os tres campos de parcelamento juntos entram', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                installment_count, first_due_date, installment_frequency,
                                layout_study_days, renderings_days, legal_permit_days,
                                construction_docs_days, engineering_docs_days)
  values (%L, 'CTR-P3', 'architecture', 50000, 10, current_date, 'monthly',
          15, 20, 30, 45, 60)
$q$, (select tenant_a from ids)));

-- 4. Bandeira de parcelas geradas so com plano de parcelamento ------------------

select pg_temp.chk('4.1', 'parcelas geradas sem plano de parcelamento e recusado', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                installments_generated)
  values (%L, 'CTR-G1', 'architecture', 50000, true)
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.2', 'CONTROLE: parcelas geradas COM plano entra', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                installment_count, first_due_date, installment_frequency,
                                installments_generated)
  values (%L, 'CTR-G2', 'architecture', 50000, 6, current_date, 'monthly', true)
$q$, (select tenant_a from ids)));

-- 5. Vigencia nao comeca antes da assinatura -----------------------------------

select pg_temp.chk('5.1', 'inicio de vigencia anterior a assinatura e recusado', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                signature_date, start_date)
  values (%L, 'CTR-D1', 'architecture', 50000, '2026-03-10', '2026-03-09')
$q$, (select tenant_a from ids)));

-- Assinar e comecar no mesmo dia e o caso comum, e e o que o original preenche
-- sozinho quando cria o contrato a partir de uma negociacao ganha.
select pg_temp.chk('5.2', 'CONTROLE: assinatura e inicio no mesmo dia entram', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                signature_date, start_date)
  values (%L, 'CTR-D2', 'architecture', 50000, '2026-03-10', '2026-03-10')
$q$, (select tenant_a from ids)));

-- 6. Prazo de fase positivo ----------------------------------------------------
--
-- Zero dias uteis viraria data de entrega igual ao inicio no cronograma do
-- modulo 5. O controle e o caso 3.4, que grava os cinco prazos preenchidos.

select pg_temp.chk('6.1', 'prazo de fase igual a zero e recusado', 'ERR:23514', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value,
                                legal_permit_days)
  values (%L, 'CTR-F1', 'architecture', 50000, 0)
$q$, (select tenant_a from ids)));

-- 7. FK composta para clients --------------------------------------------------
--
-- A RLS filtra o que se le, nao o que se aponta: referencia por id sozinho
-- deixaria o contrato de um escritorio apontar para o cliente de outro.

select pg_temp.chk('7.1', 'cliente de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value, client_id)
  values (%L, 'CTR-X1', 'architecture', 50000, %L)
$q$, (select tenant_a from ids), (select client_b from ids)));

select pg_temp.chk('7.2', 'CONTROLE: cliente do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value, client_id)
  values (%L, 'CTR-X2', 'architecture', 50000, %L)
$q$, (select tenant_a from ids), (select client_a from ids)));

-- 8. FK composta para negotiations ----------------------------------------------
--
-- Esta ligacao nao existe no original: la e a negociacao que guarda
-- contrato_vinculado_id. Aqui o vinculo vive de um lado so, e no escritorio
-- certo. O controle e implicito - se a FK recusasse tudo, 7.2 tambem cairia,
-- mas para nao depender disso o caso positivo vai junto.

select pg_temp.chk('8.1', 'negociacao de OUTRO escritorio e recusada', 'ERR:23503', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value, negotiation_id)
  values (%L, 'CTR-N1', 'architecture', 50000, %L)
$q$, (select tenant_a from ids), (select neg_b from ids)));

select pg_temp.chk('8.2', 'CONTROLE: negociacao do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.contracts (tenant_id, contract_number, contract_type, total_value, negotiation_id)
  values (%L, 'CTR-N2', 'architecture', 50000, %L)
$q$, (select tenant_a from ids), (select neg_a from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
