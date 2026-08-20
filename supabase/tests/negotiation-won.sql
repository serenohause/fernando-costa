-- Encerrar negociacao pelo arraste, e DESFAZER.
--
-- O QUE ELE PROVA, E POR QUE EXISTE
--   Soltar o cartao na coluna Fechamento passou a encerrar o negocio (decisao do
--   usuario; o original so muda a etapa ao arrastar). Como o gesto e facil de
--   errar e a negociacao some do quadro, o aviso oferece "Desfazer" — e o
--   desfazer e a parte que quebra em silencio.
--
--   O caso 4.1 e o motivo deste arquivo: `negotiations_closed_at_requires_
--   closed_status_check` (migration 0022) proibe data de fechamento em
--   negociacao Ativa. Um desfazer que devolvesse o status sem limpar a data
--   levantaria 23514, e o unico sintoma seria o botao Desfazer nao funcionar. Os
--   dois campos precisam voltar no MESMO UPDATE, e e isso que 3.2 e 4.1 fixam:
--   um afirma que junto passa, o outro que separado e recusado.
--
--   3.4 guarda o outro lado: desfazer sem apagar o briefing deixaria um link
--   publico valido para uma negociacao que voltou a ser Ativa, e o cliente que
--   recebesse esse link preencheria um formulario que nao deveria mais existir.
--
-- COMO RODAR
--   npm run test:won
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenant proprio (slug
--   won-test). Nao encosta em dado do escritorio.

begin;
create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;
create or replace function pg_temp.try(q text) returns text language plpgsql as $$
declare n bigint; st text;
begin
  begin execute q; get diagnostics n = row_count; return 'OK:'||n;
  exception when others then get stacked diagnostics st = returned_sqlstate; return 'ERR:'||st; end;
end; $$;
create or replace function pg_temp.chk(c text,d text,e text,q text) returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,pg_temp.try(q)); end; $$;
create or replace function pg_temp.val(c text,d text,e text,q text) returns void language plpgsql as $$
declare v text;
begin
  begin execute q into v; exception when others then get stacked diagnostics v = returned_sqlstate; v:='ERR:'||v; end;
  insert into res(caso,descricao,expected,observed) values (c,d,e,coalesce(v,'<null>'));
end; $$;

insert into public.tenants (id,name,slug) values ('aaaaaaaa-0000-4000-8000-000000000001','Won Test','won-test');
insert into public.collaborators (id,tenant_id,name,email,role,area,status)
  values ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001','Dono','dono@won.test','director','commercial','active');
insert into public.clients (id,tenant_id,name,phone,address_city,address_state)
  values ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001','Cliente Won','(62) 97777-0001','Goiania','GO');
insert into public.negotiations (id,tenant_id,name,client_id,commercial_owner_id,funnel_stage,status)
  values ('aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000001','Neg Won',
          'aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000002','negotiating','active');

-- 1. o UPDATE do gesto: etapa + status + data, tudo junto
select pg_temp.chk('1.1','soltar em Fechamento encerra e move a etapa no mesmo UPDATE','OK:1', $q$
  update public.negotiations
     set status='won', closed_at=current_date, funnel_stage='closing'
   where id='aaaaaaaa-0000-4000-8000-000000000004'$q$);

select pg_temp.val('1.2','a negociacao ficou Ganha em Fechamento','won|closing', $q$
  select status||'|'||funnel_stage from public.negotiations where id='aaaaaaaa-0000-4000-8000-000000000004'$q$);

-- 2. o briefing nasce em seguida
select pg_temp.chk('2.1','briefing criado para a negociacao','OK:1', $q$
  insert into public.client_intakes (id,tenant_id,negotiation_id,client_id)
  values ('aaaaaaaa-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000001',
          'aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000003')$q$);

select pg_temp.val('2.2','o token uuid foi gerado pelo banco','true', $q$
  select (token is not null)::text from public.client_intakes
   where id='aaaaaaaa-0000-4000-8000-000000000005'$q$);

-- 3. DESFAZER: apaga o briefing e devolve o estado anterior
select pg_temp.chk('3.1','o briefing e apagado','OK:1', $q$
  delete from public.client_intakes where id='aaaaaaaa-0000-4000-8000-000000000005'$q$);

/*
  3.2 e o caso que o check negotiations_closed_at_requires_closed_status_check
  poderia recusar: voltar para 'active' exige limpar closed_at no MESMO UPDATE.
  Devolver o status sem devolver a data seria um 23514 no desfazer.
*/
select pg_temp.chk('3.2','a negociacao volta a Ativa com a etapa e a data de antes','OK:1', $q$
  update public.negotiations
     set status='active', funnel_stage='negotiating', closed_at=null
   where id='aaaaaaaa-0000-4000-8000-000000000004'$q$);

select pg_temp.val('3.3','estado restaurado','active|negotiating|<null>', $q$
  select status||'|'||funnel_stage||'|'||coalesce(closed_at::text,'<null>')
    from public.negotiations where id='aaaaaaaa-0000-4000-8000-000000000004'$q$);

select pg_temp.val('3.4','nenhum briefing sobrou de pe','0', $q$
  select count(*)::text from public.client_intakes
   where negotiation_id='aaaaaaaa-0000-4000-8000-000000000004'$q$);

-- 4. o erro que o desfazer NAO pode cometer
select pg_temp.chk('4.1','voltar a Ativa SEM limpar a data e recusado','ERR:23514', $q$
  update public.negotiations set status='active', closed_at=current_date
   where id='aaaaaaaa-0000-4000-8000-000000000004'$q$);

select case when observed=expected then 'PASS' else 'FAIL' end as status, caso, descricao, expected, observed from res order by seq;
rollback;
