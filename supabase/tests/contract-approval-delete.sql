-- Aprovar proposta cria projeto e cartao; excluir contrato leva SO o que nasceu dele.
--
-- O QUE ELE PROVA
--   As duas funcoes da migration 0078, chamadas de verdade como um colaborador
--   com o menu 'contracts' — nao uma copia da logica.
--
--   O caso que mais importa e o 3.1: a exclusao alcanca APENAS os projetos com
--   contract_id = o contrato apagado. Um projeto do MESMO CLIENTE, ligado a outro
--   contrato, e um projeto sem contrato nenhum ficam de pe. Sem esse caso, uma
--   funcao que varresse projects por cliente passaria em todos os outros.
--
--   E o 2.x guarda o lead: cliente e negociacao continuam existindo depois da
--   exclusao, que foi pedido explicito ("menos o lead").
--
-- COMO RODAR
--   npm run test:contract-cascade
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenant proprio (slug
--   cascade-test). Nao encosta em dado do escritorio.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

create or replace function pg_temp.como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role','authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql into v;
    perform set_config('role','postgres',true);
    return coalesce(v,'<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role','postgres',true);
    return 'ERR:' || st || (case when st='P0001' then ':'||sqlerrm else '' end);
  end;
end; $$;

create temp table ids on commit drop as select
  'dddddddd-1111-4000-8000-000000000001'::uuid as tenant,
  'dddddddd-1111-4000-8000-000000000002'::uuid as usuario,
  'dddddddd-1111-4000-8000-000000000003'::uuid as colaborador,
  'dddddddd-1111-4000-8000-000000000004'::uuid as cliente,
  'dddddddd-1111-4000-8000-000000000005'::uuid as contrato,
  'dddddddd-1111-4000-8000-000000000006'::uuid as outro_contrato,
  'dddddddd-1111-4000-8000-000000000007'::uuid as projeto_de_outro,
  'dddddddd-1111-4000-8000-000000000008'::uuid as projeto_solto,
  'dddddddd-1111-4000-8000-000000000009'::uuid as negociacao;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ((select usuario from ids), '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated','authenticated','cascade@example.test', now(), now());

insert into public.tenants (id,name,slug) values ((select tenant from ids),'Cascade Test','cascade-test');

insert into public.collaborators (id,tenant_id,user_id,name,email,role,area,status)
values ((select colaborador from ids),(select tenant from ids),(select usuario from ids),
        'Comercial','c@cascade.test','admin_staff','commercial','active');

insert into public.collaborator_permissions (tenant_id,collaborator_id,menu_key,can_view,can_edit)
values ((select tenant from ids),(select colaborador from ids),'contracts',true,true),
       ((select tenant from ids),(select colaborador from ids),'pipeline',true,true);

insert into public.clients (id,tenant_id,name,phone,address_city,address_state)
values ((select cliente from ids),(select tenant from ids),'Cliente Cascade','(62) 95555-0001','Goiania','GO');

insert into public.negotiations (id,tenant_id,name,client_id,commercial_owner_id)
values ((select negociacao from ids),(select tenant from ids),'Neg Cascade',
        (select cliente from ids),(select colaborador from ids));

insert into public.contracts (id,tenant_id,contract_number,contract_type,total_value,client_id,
                              project_name,status,layout_study_days,site_city,site_state,signature_date)
values ((select contrato from ids),(select tenant from ids),'0900','architecture_interiors',50000,
        (select cliente from ids),'Casa Cascade','negotiating',30,'Goiania','GO',current_date),
       ((select outro_contrato from ids),(select tenant from ids),'0901','architecture',10000,
        (select cliente from ids),'Outro Contrato','approved',null,'Goiania','GO',current_date);

-- Um projeto do MESMO CLIENTE ligado a OUTRO contrato, e um projeto sem contrato.
insert into public.projects (id,tenant_id,name,project_type,client_id,contract_id,status,current_phase,visible_in_list)
values ((select projeto_de_outro from ids),(select tenant from ids),'Projeto do outro contrato',
        'architecture',(select cliente from ids),(select outro_contrato from ids),'in_development','not_started',true),
       ((select projeto_solto from ids),(select tenant from ids),'Projeto sem contrato',
        'architecture',(select cliente from ids),null,'in_development','not_started',true);

-- 1. APROVAR ------------------------------------------------------------------

select pg_temp.rec('1.1','aprovar cria o projeto','created|true|true',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome') || '|' || (r ->> 'statusChanged') || '|' || (r ->> 'taskCreated')
    from public.approve_contract_proposal(%L) r $q$, (select contrato from ids))));

select pg_temp.rec('1.2','o projeto herda nome, tipo, prazo e local do contrato',
  'Casa Cascade|architecture_interiors|30|Goiania|in_development|not_started|true',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select p.name||'|'||p.project_type||'|'||p.layout_study_days||'|'||p.city||'|'||p.status||'|'||p.current_phase||'|'||p.visible_in_list
    from public.projects p where p.contract_id = %L $q$, (select contrato from ids))));

select pg_temp.rec('1.3','o cartao do Fluxo nasce com numero e cliente no titulo',
  '0900 - Cliente Cascade|not_started|high',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select t.title||'|'||t.phase||'|'||t.priority from public.tasks t
    join public.projects p on p.id=t.project_id where p.contract_id = %L $q$, (select contrato from ids))));

select pg_temp.rec('1.4','o contrato ficou Aprovado','approved',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select status::text from public.contracts where id = %L $q$, (select contrato from ids))));

/* 1.5 e a idempotencia: apertar de novo nao cria um segundo projeto nem uma
   segunda tarefa, e nao rebobina o cartao que ja andou. */
select pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
  select 1 from (select public.approve_contract_proposal(%L)) _ $q$, (select contrato from ids)));

select pg_temp.rec('1.5','aprovar de novo nao duplica projeto nem tarefa','1|1',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (select count(*) from public.projects where contract_id = %L)::text ||'|'||
           (select count(*) from public.tasks t join public.projects p on p.id=t.project_id
             where p.contract_id = %L)::text $q$,
    (select contrato from ids),(select contrato from ids))));

-- 2. BLOQUEIOS ----------------------------------------------------------------

-- `paid` exige data de pagamento (accounts_receivable_payment_date_matches_status_check).
insert into public.accounts_receivable (tenant_id,description,value,due_date,client_id,contract_id,status,payment_date)
values ((select tenant from ids),'Parcela paga',1000,current_date,(select cliente from ids),(select contrato from ids),'paid',current_date),
       ((select tenant from ids),'Parcela prevista',1000,current_date,(select cliente from ids),(select contrato from ids),'forecast',null);

select pg_temp.rec('2.1','parcela PAGA bloqueia a exclusao','blocked|paid_receivables',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome') || '|' || (r -> 'blocks' -> 0 ->> 'kind')
    from public.delete_contract_cascade(%L, true) r $q$, (select contrato from ids))));

select pg_temp.rec('2.2','CONTROLE: bloqueado significa que NADA foi apagado','1',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select count(*)::text from public.contracts where id = %L $q$, (select contrato from ids))));

update public.accounts_receivable set status='forecast', payment_date=null where status='paid';

insert into public.activities (tenant_id, description, collaborator_id, project_id,
                               start_date, end_date, status, priority)
select (select tenant from ids),'Atividade',(select colaborador from ids), p.id,
       current_date, current_date, 'not_started','high'
from public.projects p where p.contract_id = (select contrato from ids);

select pg_temp.rec('2.3','atividade da equipe bloqueia a exclusao','blocked|activities',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome') || '|' || (r -> 'blocks' -> 0 ->> 'kind')
    from public.delete_contract_cascade(%L, true) r $q$, (select contrato from ids))));

delete from public.activities where tenant_id = (select tenant from ids);

-- 3. EXCLUSAO ----------------------------------------------------------------

select pg_temp.rec('3.0','conferir sem apagar devolve as contagens','preview|1|2',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome')||'|'||(r ->> 'projects')||'|'||(r ->> 'receivables')
    from public.delete_contract_cascade(%L) r $q$, (select contrato from ids))));

select pg_temp.rec('3.0b','CONTROLE: conferir NAO apagou nada','1',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select count(*)::text from public.contracts where id = %L $q$, (select contrato from ids))));

select pg_temp.rec('3.1','apagar de verdade','deleted',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome') from public.delete_contract_cascade(%L, true) r $q$, (select contrato from ids))));

select pg_temp.rec('3.2','o contrato, o projeto, as parcelas e o cartao sumiram','0|0|0|0',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (select count(*) from public.contracts where id = %L)::text ||'|'||
           (select count(*) from public.projects where contract_id = %L)::text ||'|'||
           (select count(*) from public.accounts_receivable where contract_id = %L)::text ||'|'||
           (select count(*) from public.tasks)::text $q$,
    (select contrato from ids),(select contrato from ids),(select contrato from ids))));

/* 3.3 e o caso central desta entrega: SO os projetos deste contrato. O projeto
   do mesmo cliente ligado a outro contrato, e o projeto sem contrato, ficam. */
select pg_temp.rec('3.3','projeto de OUTRO contrato e projeto sem contrato continuam de pe','2',
  pg_temp.como((select usuario from ids),(select tenant from ids), $q$
    select count(*)::text from public.projects
     where id in ('dddddddd-1111-4000-8000-000000000007','dddddddd-1111-4000-8000-000000000008') $q$));

select pg_temp.rec('3.4','o LEAD fica: cliente e negociacao intactos','1|1',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (select count(*) from public.clients where id = %L)::text ||'|'||
           (select count(*) from public.negotiations where id = %L)::text $q$,
    (select cliente from ids),(select negociacao from ids))));

-- 4. CONTROLE de autorizacao --------------------------------------------------

-- Tira a permissao de edicao em Contratos. So conferir que OUTRA permissao nao
-- basta seria asserção vazia: o colaborador continuaria autorizado pela de
-- Contratos, e o caso passaria sem provar nada.
update public.collaborator_permissions
   set can_edit = false
 where tenant_id = (select tenant from ids)
   and collaborator_id = (select colaborador from ids)
   and menu_key = 'contracts';

select pg_temp.rec('4.1','sem permissao de Contratos nao aprova','ERR:P0001:not_authorized',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome') from public.approve_contract_proposal(%L) r $q$,
    (select outro_contrato from ids))));

select pg_temp.rec('4.2','nem apaga','ERR:P0001:not_authorized',
  pg_temp.como((select usuario from ids),(select tenant from ids), format($q$
    select (r ->> 'outcome') from public.delete_contract_cascade(%L, true) r $q$,
    (select outro_contrato from ids))));

select case when observed = expected then 'PASS' else 'FAIL' end as status, caso, descricao, expected, observed
from res order by seq;

rollback;
