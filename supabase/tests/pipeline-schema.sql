-- Teste de schema do modulo 3 (Pipeline) - negotiations e as duas tabelas filhas
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio, quatro policies,
--   isolamento entre escritorios, escrita presa ao menu 'pipeline') estao em
--   supabase/tests/pattern-invariants.sql e cobrem estas tabelas desde que elas
--   entraram em pattern_tables. Aqui fica somente o que e proprio do modulo:
--   os tres checks que o base44 nao tem, as tabelas que substituiram os campos
--   array da entidade original, as FK compostas e a ponte entre os dois enums de
--   origem de lead.
--
-- COMO RODAR
--   npm run test:schema:pipeline
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
--   proprios (slug pipeline-schema-test-*), e nenhuma contagem e absoluta sobre
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

create or replace function pg_temp.val(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics v = returned_sqlstate;
    v := 'ERR:' || v;
  end;
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v, '<null>'));
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'f1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'f2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'f1100000-0000-4000-8000-000000000001'::uuid as owner_a,
  'f1100000-0000-4000-8000-000000000002'::uuid as owner_a2,
  'f2200000-0000-4000-8000-000000000001'::uuid as owner_b,
  'f1300000-0000-4000-8000-000000000001'::uuid as client_a,
  'f1300000-0000-4000-8000-000000000002'::uuid as client_a_free,
  'f2300000-0000-4000-8000-000000000001'::uuid as client_b,
  'f1200000-0000-4000-8000-000000000001'::uuid as neg_a,
  'f2200000-0000-4000-8000-000000000002'::uuid as neg_b,
  'f1200000-0000-4000-8000-000000000009'::uuid as neg_cascade;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Pipeline Schema Test A', 'pipeline-schema-test-a'),
  ((select tenant_b from ids), 'Pipeline Schema Test B', 'pipeline-schema-test-b');

insert into public.collaborators (id, tenant_id, name, role, email, status) values
  ((select owner_a from ids), (select tenant_a from ids), 'Comercial A', 'architect',
   'pipeline-schema-a@example.test', 'active'),
  ((select owner_a2 from ids), (select tenant_a from ids), 'Comercial A2', 'architect',
   'pipeline-schema-a2@example.test', 'active'),
  ((select owner_b from ids), (select tenant_b from ids), 'Comercial B', 'architect',
   'pipeline-schema-b@example.test', 'active');

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select client_a from ids), (select tenant_a from ids), 'Helena Moraes', '(62) 99811-2200', 'Goiania', 'GO'),
  ((select client_a_free from ids), (select tenant_a from ids), 'Otavio Bandeira', '(62) 99811-2201', 'Goiania', 'GO'),
  ((select client_b from ids), (select tenant_b from ids), 'Regina Alencar', '(62) 99811-3300', 'Anapolis', 'GO');

insert into public.negotiations (id, tenant_id, name, client_id, commercial_owner_id) values
  ((select neg_a from ids), (select tenant_a from ids), 'Residencia Alto da Glória',
   (select client_a from ids), (select owner_a from ids)),
  ((select neg_b from ids), (select tenant_b from ids), 'Clinica Vila Nova',
   (select client_b from ids), (select owner_b from ids)),
  ((select neg_cascade from ids), (select tenant_a from ids), 'Reforma Setor Bueno',
   null, (select owner_a from ids));

-- 1. Motivo e observacao de perda so existem em negociacao perdida -------------
--
-- O original nao impede negociacao Ativa com motivo de perda preenchido, e o
-- card do kanban exibe esse motivo: o estado invalido chega ate a tela.

select pg_temp.chk('1.1', 'negociacao ativa com motivo de perda e recusada', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, status, loss_reason)
  values (%L, 'Ativa com motivo', %L, 'active', 'price')
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('1.2', 'negociacao ativa com observacao de perda e recusada', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, status, loss_notes)
  values (%L, 'Ativa com observacao', %L, 'active', 'Cliente sumiu')
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('1.3', 'negociacao GANHA com motivo de perda e recusada', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, status, loss_reason)
  values (%L, 'Ganha com motivo', %L, 'won', 'price')
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('1.4', 'CONTROLE: negociacao perdida COM motivo e observacao entra', 'OK:1', format($q$
  insert into public.negotiations (id, tenant_id, name, commercial_owner_id, status,
                                   loss_reason, loss_notes, closed_at)
  values ('f1200000-0000-4000-8000-000000000002', %L, 'Perdida completa', %L, 'lost',
          'chose_competitor', 'Escolheu escritorio de Brasilia', current_date)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('1.5', 'CONTROLE: negociacao ativa SEM campos de perda entra', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, status)
  values (%L, 'Ativa limpa', %L, 'active')
$q$, (select tenant_a from ids), (select owner_a from ids)));

-- Reabrir uma perdida sem limpar o motivo e a mesma violacao pelo outro lado. E
-- o gesto real da tela: o usuario tira a negociacao de "Perdida" e volta para
-- "Ativa".
select pg_temp.chk('1.6', 'reabrir perdida sem limpar o motivo e recusado', 'ERR:23514', $q$
  update public.negotiations set status = 'active', closed_at = null
  where id = 'f1200000-0000-4000-8000-000000000002'
$q$);

select pg_temp.chk('1.7', 'CONTROLE: reabrir perdida limpando motivo, observacao e data', 'OK:1', $q$
  update public.negotiations
     set status = 'active', loss_reason = null, loss_notes = null, closed_at = null
   where id = 'f1200000-0000-4000-8000-000000000002'
$q$);

-- 2. Data de fechamento so em negociacao encerrada -----------------------------

select pg_temp.chk('2.1', 'negociacao ativa com data de fechamento e recusada', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, status, closed_at)
  values (%L, 'Ativa fechada', %L, 'active', current_date)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('2.2', 'CONTROLE: negociacao ganha com data de fechamento entra', 'OK:1', format($q$
  insert into public.negotiations (id, tenant_id, name, commercial_owner_id, status, closed_at)
  values ('f1200000-0000-4000-8000-000000000003', %L, 'Ganha com data', %L, 'won', current_date)
$q$, (select tenant_a from ids), (select owner_a from ids)));

-- O check e de um lado so de proposito: encerrada SEM data continua valida,
-- porque o dado historico do base44 tem esse caso.
select pg_temp.chk('2.3', 'CONTROLE: negociacao ganha SEM data de fechamento entra', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, status)
  values (%L, 'Ganha sem data', %L, 'won')
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('2.4', 'reabrir ganha sem limpar a data de fechamento e recusado', 'ERR:23514', $q$
  update public.negotiations set status = 'active'
  where id = 'f1200000-0000-4000-8000-000000000003'
$q$);

-- 3. Probabilidade de fechamento e percentual ---------------------------------
--
-- O original aceita qualquer numero (parseInt do que o usuario digitar) e o
-- painel soma isso como percentual.

select pg_temp.chk('3.1', 'probabilidade negativa e recusada', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, close_probability)
  values (%L, 'Probabilidade -1', %L, -1)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('3.2', 'probabilidade acima de 100 e recusada', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, close_probability)
  values (%L, 'Probabilidade 101', %L, 101)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('3.3', 'CONTROLE: probabilidade 0 entra', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, close_probability)
  values (%L, 'Probabilidade 0', %L, 0)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('3.4', 'CONTROLE: probabilidade 100 entra', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, close_probability)
  values (%L, 'Probabilidade 100', %L, 100)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('3.5', 'CONTROLE: probabilidade nula entra (campo opcional)', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, close_probability)
  values (%L, 'Probabilidade nula', %L, null)
$q$, (select tenant_a from ids), (select owner_a from ids)));

-- 4. Nome e valor --------------------------------------------------------------

select pg_temp.chk('4.1', 'nome so com espaco e recusado', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id)
  values (%L, '   ', %L)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('4.2', 'valor estimado negativo e recusado', 'ERR:23514', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, estimated_value)
  values (%L, 'Valor negativo', %L, -1000)
$q$, (select tenant_a from ids), (select owner_a from ids)));

select pg_temp.chk('4.3', 'CONTROLE: valor estimado zero entra', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id, estimated_value)
  values (%L, 'Valor zero', %L, 0)
$q$, (select tenant_a from ids), (select owner_a from ids)));

-- 5. FK compostas de negotiations ----------------------------------------------
--
-- A RLS filtra o que se LE, nao o que se aponta: sem a FK composta, um editor do
-- escritorio A gravaria negociacao apontando para cliente ou responsavel do
-- escritorio B, e a linha resultante seria invisivel para os dois lados.

select pg_temp.chk('5.1', 'negociacao de A apontando para cliente de B e recusada', 'ERR:23503', format($q$
  insert into public.negotiations (tenant_id, name, client_id, commercial_owner_id)
  values (%L, 'Cliente de outro escritorio', %L, %L)
$q$, (select tenant_a from ids), (select client_b from ids), (select owner_a from ids)));

select pg_temp.chk('5.2', 'CONTROLE: negociacao de A apontando para cliente de A entra', 'OK:1', format($q$
  insert into public.negotiations (tenant_id, name, client_id, commercial_owner_id)
  values (%L, 'Cliente do proprio escritorio', %L, %L)
$q$, (select tenant_a from ids), (select client_a from ids), (select owner_a from ids)));

select pg_temp.chk('5.3', 'negociacao de A com responsavel de B e recusada', 'ERR:23503', format($q$
  insert into public.negotiations (tenant_id, name, commercial_owner_id)
  values (%L, 'Responsavel de outro escritorio', %L)
$q$, (select tenant_a from ids), (select owner_b from ids)));

-- Sem ON DELETE nas duas FK: apagar cliente ou responsavel com negociacao falha
-- de proposito. A policy de DELETE de clients (0017) ja contava com isso.
select pg_temp.chk('5.4', 'apagar cliente que tem negociacao e recusado', 'ERR:23503', format($q$
  delete from public.clients where id = %L
$q$, (select client_a from ids)));

select pg_temp.chk('5.5', 'CONTROLE: apagar cliente sem negociacao funciona', 'OK:1', format($q$
  delete from public.clients where id = %L
$q$, (select client_a_free from ids)));

select pg_temp.chk('5.6', 'apagar responsavel comercial que tem negociacao e recusado', 'ERR:23503', format($q$
  delete from public.collaborators where id = %L
$q$, (select owner_a from ids)));

-- 6. negotiation_services (substitui o array tipo_servico) ---------------------

select pg_temp.chk('6.1', 'CONTROLE: primeiro servico da negociacao entra', 'OK:1', format($q$
  insert into public.negotiation_services (tenant_id, negotiation_id, service_type)
  values (%L, %L, 'architecture')
$q$, (select tenant_a from ids), (select neg_a from ids)));

select pg_temp.chk('6.2', 'CONTROLE: segundo servico DIFERENTE na mesma negociacao entra', 'OK:1', format($q$
  insert into public.negotiation_services (tenant_id, negotiation_id, service_type)
  values (%L, %L, 'interiors')
$q$, (select tenant_a from ids), (select neg_a from ids)));

select pg_temp.chk('6.3', 'o mesmo servico duas vezes na mesma negociacao e recusado', 'ERR:23505', format($q$
  insert into public.negotiation_services (tenant_id, negotiation_id, service_type)
  values (%L, %L, 'architecture')
$q$, (select tenant_a from ids), (select neg_a from ids)));

select pg_temp.chk('6.4', 'CONTROLE: o mesmo servico em OUTRA negociacao entra', 'OK:1', format($q$
  insert into public.negotiation_services (tenant_id, negotiation_id, service_type)
  values (%L, %L, 'architecture')
$q$, (select tenant_a from ids), (select neg_cascade from ids)));

select pg_temp.chk('6.5', 'servico de A apontando para negociacao de B e recusado', 'ERR:23503', format($q$
  insert into public.negotiation_services (tenant_id, negotiation_id, service_type)
  values (%L, %L, 'structural')
$q$, (select tenant_a from ids), (select neg_b from ids)));

select pg_temp.val('6.6', 'CONTROLE: a negociacao tem 2 servicos antes de ser apagada', '2', format($q$
  select count(*)::text from public.negotiation_services where negotiation_id = %L
$q$, (select neg_a from ids)));

-- 7. negotiation_owner_history (substitui o array historico_responsavel) -------

select pg_temp.chk('7.1', 'CONTROLE: troca de responsavel entra', 'OK:1', format($q$
  insert into public.negotiation_owner_history
    (tenant_id, negotiation_id, previous_owner_id, new_owner_id, changed_by_id, changed_at)
  values (%L, %L, null, %L, %L, now())
$q$, (select tenant_a from ids), (select neg_a from ids), (select owner_a from ids),
     (select owner_a from ids)));

select pg_temp.chk('7.2', 'evento em que o responsavel nao mudou e recusado', 'ERR:23514', format($q$
  insert into public.negotiation_owner_history
    (tenant_id, negotiation_id, previous_owner_id, new_owner_id, changed_at)
  values (%L, %L, %L, %L, now() + interval '1 minute')
$q$, (select tenant_a from ids), (select neg_a from ids), (select owner_a from ids),
     (select owner_a from ids)));

-- Responsaveis DIFERENTES aqui de proposito: com o mesmo dos dois lados, o
-- 23514 do caso 7.2 aparece antes e este caso passaria a repetir aquele.
select pg_temp.chk('7.3', 'dois eventos da mesma negociacao no mesmo instante sao recusados', 'ERR:23505', format($q$
  insert into public.negotiation_owner_history
    (tenant_id, negotiation_id, previous_owner_id, new_owner_id, changed_at)
  values (%L, %L, %L, %L, now())
$q$, (select tenant_a from ids), (select neg_a from ids), (select owner_a2 from ids),
     (select owner_a from ids)));

select pg_temp.chk('7.4', 'CONTROLE: segundo evento em outro instante entra', 'OK:1', format($q$
  insert into public.negotiation_owner_history
    (tenant_id, negotiation_id, previous_owner_id, new_owner_id, changed_at)
  values (%L, %L, %L, %L, now() + interval '2 minutes')
$q$, (select tenant_a from ids), (select neg_a from ids), (select owner_a from ids),
     (select owner_a2 from ids)));

select pg_temp.chk('7.5', 'historico de A apontando para responsavel de B e recusado', 'ERR:23503', format($q$
  insert into public.negotiation_owner_history
    (tenant_id, negotiation_id, new_owner_id, changed_at)
  values (%L, %L, %L, now() + interval '3 minutes')
$q$, (select tenant_a from ids), (select neg_a from ids), (select owner_b from ids)));

select pg_temp.val('7.6', 'CONTROLE: a negociacao tem 2 eventos antes de ser apagada', '2', format($q$
  select count(*)::text from public.negotiation_owner_history where negotiation_id = %L
$q$, (select neg_a from ids)));

-- 8. Cascata: servicos e historico sao parte da negociacao ---------------------
--
-- Os dois cascateiam de proposito (nao sao entidade propria). A negociacao usada
-- aqui e a mesma dos casos 6 e 7, que acabaram de contar 2 e 2 - sem aquelas
-- duas contagens, "sumiu na cascata" e "nunca existiu" dariam o mesmo zero.

select pg_temp.chk('8.1', 'apagar a negociacao funciona', 'OK:1', format($q$
  delete from public.negotiations where id = %L
$q$, (select neg_a from ids)));

select pg_temp.val('8.2', 'os servicos foram junto', '0', format($q$
  select count(*)::text from public.negotiation_services where negotiation_id = %L
$q$, (select neg_a from ids)));

select pg_temp.val('8.3', 'o historico foi junto', '0', format($q$
  select count(*)::text from public.negotiation_owner_history where negotiation_id = %L
$q$, (select neg_a from ids)));

select pg_temp.val('8.4', 'CONTROLE: o servico da OUTRA negociacao continua la', '1', format($q$
  select count(*)::text from public.negotiation_services where negotiation_id = %L
$q$, (select neg_cascade from ids)));

-- 9. A ponte entre os dois enums de origem de lead -----------------------------
--
-- "Criar Oportunidade" (Clients.jsx:137) copia clients.lead_source para
-- negotiations.origin. Sao dois enums distintos - lead_origin tem 'event' e
-- lead_source nao - e a conversao e por texto. Se alguem renomear um valor de um
-- lado so, a copia passa a estourar 22P02 na hora do clique, nao aqui.

select pg_temp.val('9.1', 'valores de lead_source que NAO existem em lead_origin', '<nenhum>', $q$
  select coalesce(string_agg(v::text, ','), '<nenhum>')
  from unnest(enum_range(null::public.lead_source)) v
  where v::text <> all (select unnest(enum_range(null::public.lead_origin))::text)
$q$);

select pg_temp.val('9.2', 'a conversao por texto funciona para lead_source instagram', 'instagram', $q$
  select ('instagram'::public.lead_source)::text::public.lead_origin::text
$q$);

-- Controle do caso 9.1: se os dois enums fossem identicos, 9.1 passaria por
-- tautologia. Sao distintos, e e o 'event' que os distingue.
select pg_temp.val('9.3', 'CONTROLE: lead_origin tem valor que lead_source nao tem', 'event', $q$
  select coalesce(string_agg(v::text, ','), '<nenhum>')
  from unnest(enum_range(null::public.lead_origin)) v
  where v::text <> all (select unnest(enum_range(null::public.lead_source))::text)
$q$);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
