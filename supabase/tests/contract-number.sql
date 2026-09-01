-- O numero do contrato gerado continua a serie do escritorio (migration 0077).
--
-- O QUE ELE PROVA, E POR QUE NAO REPRODUZ A CONTA
--   A primeira versao deste arquivo copiava a expressao da funcao para um
--   pg_temp e afirmava sobre a COPIA. Isso passa sempre: a copia e a copia, e
--   nada acusaria se a funcao no banco fizesse outra coisa. Aqui os casos chamam
--   `public.mark_negotiation_won` de verdade, como um colaborador com permissao
--   de Pipeline, e leem o numero que o contrato REALMENTE recebeu.
--
--   O que se guarda: que o proximo numero sai do contrato MAIS RECENTEMENTE
--   CRIADO (regra do usuario) e nao do maior da serie, que o formato do numero
--   anterior e preservado, e que escritorio sem contrato comeca em 0001.
--
-- COMO RODAR
--   npm run test:contract-number
--
-- RESIDUO
--   Nenhum. Uma transacao terminada em ROLLBACK, com tenants proprios (slug
--   ctrnum-*). Nao encosta em dado do escritorio.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))
$$;

/* Chama a funcao como o usuario e devolve o contractNumber do jsonb, ou o
   sqlstate quando ela recusa. */
create or replace function pg_temp.ganhar(p_sub uuid, p_tenant uuid, p_negotiation uuid)
returns text language plpgsql as $$
declare v jsonb; v_state text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    v := public.mark_negotiation_won(p_negotiation);
    perform set_config('role', 'postgres', true);
    return coalesce(v ->> 'outcome', '?') || '|' || coalesce(v ->> 'contractNumber', '<null>');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || v_state;
  end;
end; $$;

-- Fixtures: dois escritorios, um com serie de 4 digitos e outro com prefixo ----

create temp table ids on commit drop as select
  'cccccccc-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'cccccccc-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'cccccccc-0000-4000-8000-00000000001a'::uuid as user_a,
  'cccccccc-0000-4000-8000-00000000001b'::uuid as user_b,
  'cccccccc-0000-4000-8000-00000000002a'::uuid as col_a,
  'cccccccc-0000-4000-8000-00000000002b'::uuid as col_b,
  'cccccccc-0000-4000-8000-00000000003a'::uuid as client_a,
  'cccccccc-0000-4000-8000-00000000003b'::uuid as client_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_a from ids) u, 'ctrnum-a@example.test' e
  union all select (select user_b from ids), 'ctrnum-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Ctrnum A', 'ctrnum-a'),
  ((select tenant_b from ids), 'Ctrnum B', 'ctrnum-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_a from ids), (select tenant_a from ids), (select user_a from ids),
   'Comercial A', 'a@ctrnum.test', 'admin_staff', 'commercial', 'active'),
  ((select col_b from ids), (select tenant_b from ids), (select user_b from ids),
   'Comercial B', 'b@ctrnum.test', 'admin_staff', 'commercial', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_a from ids), 'pipeline', true, true),
  ((select tenant_b from ids), (select col_b from ids), 'pipeline', true, true),
  /* `contracts` porque suggest_contract_number pede esse menu: quem nao cria
     contrato nao precisa saber qual seria o proximo numero da serie. O caso 6.3
     prova a recusa com um terceiro colaborador, sem a permissao. */
  ((select tenant_a from ids), (select col_a from ids), 'contracts', true, true),
  ((select tenant_b from ids), (select col_b from ids), 'contracts', true, true);

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select client_a from ids), (select tenant_a from ids), 'Cliente A', '(62) 96666-0001', 'Goiania', 'GO'),
  ((select client_b from ids), (select tenant_b from ids), 'Cliente B', '(48) 96666-0002', 'Florianopolis', 'SC');

/* Roda uma consulta escalar COMO o usuario indicado. `ganhar` faz isso para a
   funcao de fechar negocio; este e o mesmo mecanismo, para qualquer select. */
create or replace function pg_temp.como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.nova(p_tenant uuid, p_client uuid, p_owner uuid, p_nome text)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.negotiations (tenant_id, name, client_id, commercial_owner_id, generates_contract)
  values (p_tenant, p_nome, p_client, p_owner, true)
  returning id into v;
  return v;
end; $$;

-- 0. A FUNCAO PURA, isolada -------------------------------------------------
--
--    increment_contract_number nasceu dentro de mark_negotiation_won e saiu de
--    la na 0083, quando o formulario manual passou a precisar da mesma conta.
--    Sendo pura, ela se testa sem fixture, sem sessao e sem escrever nada — e e
--    aqui que os casos de borda ficam legiveis.

select pg_temp.rec('0.1', 'serie de 4 digitos', '0728',
  (select public.increment_contract_number('0727')));
select pg_temp.rec('0.2', 'prefixo com ano: incrementa o ULTIMO grupo', 'MIR-2026-009',
  (select public.increment_contract_number('MIR-2026-008')));
select pg_temp.rec('0.3', 'numero fora da serie', '3567',
  (select public.increment_contract_number('3566')));
select pg_temp.rec('0.4', 'sem numero anterior comeca a serie', '0001',
  (select public.increment_contract_number(null)));
select pg_temp.rec('0.5', 'numero sem digito algum comeca a serie', '0001',
  (select public.increment_contract_number('Contrato do Ze')));
select pg_temp.rec('0.6', 'estouro de largura NAO trunca', '10000',
  (select public.increment_contract_number('9999')));
select pg_temp.rec('0.7', 'ano nao e confundido com a serie', '2026-0100',
  (select public.increment_contract_number('2026-0099')));
select pg_temp.rec('0.8', 'sufixo depois dos digitos e preservado', '008/A',
  (select public.increment_contract_number('007/A')));
select pg_temp.rec('0.9', 'numero longo demais nao estoura o cast', '0001',
  (select public.increment_contract_number('9999999999999999')));

-- 1. Escritorio sem contrato nenhum ------------------------------------------

select pg_temp.rec('1.1', 'escritorio sem contrato comeca a serie em 0001', 'created|0001',
  pg_temp.ganhar((select user_b from ids), (select tenant_b from ids),
    pg_temp.nova((select tenant_b from ids), (select client_b from ids), (select col_b from ids), 'Neg B1')));

select pg_temp.rec('1.2', 'e o proximo continua dali', 'created|0002',
  pg_temp.ganhar((select user_b from ids), (select tenant_b from ids),
    pg_temp.nova((select tenant_b from ids), (select client_b from ids), (select col_b from ids), 'Neg B2')));

-- 2. A regra do usuario: ULTIMO CRIADO, e nao maior da serie ------------------
--
--    A fixture reproduz de proposito o estado real do escritorio Fernando Costa:
--    a serie vai ate 0727, mas o contrato mais recente e um numero fora dela.
--    Maior-da-serie devolveria 0728; ultimo-criado devolve 3567. E este o caso
--    que separa as duas regras, e o que fixa a que foi escolhida.

insert into public.contracts (tenant_id, client_id, contract_number, contract_type, total_value,
                              project_name, status, created_at)
values
  ((select tenant_a from ids), (select client_a from ids), '0727', 'architecture', 1000,
   'Antigo 0727', 'negotiating', now() - interval '2 days'),
  ((select tenant_a from ids), (select client_a from ids), '3566', 'architecture', 1000,
   'Fora da serie', 'negotiating', now() - interval '1 day');

select pg_temp.rec('2.1', 'segue o mais RECENTE (3566), nao o maior da serie (0727)', 'created|3567',
  pg_temp.ganhar((select user_a from ids), (select tenant_a from ids),
    pg_temp.nova((select tenant_a from ids), (select client_a from ids), (select col_a from ids), 'Neg A1')));

-- 3. O formato do numero anterior e preservado -------------------------------

insert into public.contracts (tenant_id, client_id, contract_number, contract_type, total_value,
                              project_name, status, created_at)
values ((select tenant_a from ids), (select client_a from ids), 'MIR-2026-008', 'architecture', 1000,
        'Com prefixo', 'negotiating', now() + interval '1 minute');

select pg_temp.rec('3.1', 'prefixo com ano: incrementa o ULTIMO grupo de digitos', 'created|MIR-2026-009',
  pg_temp.ganhar((select user_a from ids), (select tenant_a from ids),
    pg_temp.nova((select tenant_a from ids), (select client_a from ids), (select col_a from ids), 'Neg A2')));

-- 4. Numero calculado que ja existe: quem decide e o indice -------------------

insert into public.contracts (tenant_id, client_id, contract_number, contract_type, total_value,
                              project_name, status, created_at)
values ((select tenant_a from ids), (select client_a from ids), 'MIR-2026-010', 'architecture', 1000,
        'Ocupa o proximo', 'negotiating', now() + interval '2 minute');

select pg_temp.rec('4.1', 'numero ja ocupado faz a funcao tentar o seguinte', 'created|MIR-2026-011',
  pg_temp.ganhar((select user_a from ids), (select tenant_a from ids),
    pg_temp.nova((select tenant_a from ids), (select client_a from ids), (select col_a from ids), 'Neg A3')));

-- 5. CONTROLES: o que precisa continuar NAO acontecendo -----------------------

select pg_temp.rec('5.1', 'sem permissao de Pipeline nao gera contrato', 'ERR:P0001',
  pg_temp.ganhar((select user_b from ids), (select tenant_b from ids),
    pg_temp.nova((select tenant_a from ids), (select client_a from ids), (select col_a from ids), 'Neg de outro escritorio')));

-- 6. A sugestao da TELA -------------------------------------------------------
--
--    O formulario manual pergunta "qual seria o proximo?" antes de gravar. A
--    conta e a mesma da 0.x; o que este caso guarda e que ela olha o escritorio
--    de QUEM PERGUNTA, e nao o banco inteiro.

/*
  O `created_at` E EXPLICITO AQUI, e a razao vale escrita: dentro de UMA
  transacao `now()` e constante, entao contratos criados por casos diferentes
  deste arquivo nascem com o MESMO instante e o desempate cai no `id` — um uuid
  aleatorio. A sugestao ficaria nao-deterministica, e o teste passaria ou
  falharia por sorteio.

  Em producao o problema nao existe (contratos nascem com segundos de
  diferenca), mas um teste que depende de sorteio nao prova nada.
*/
insert into public.contracts (tenant_id, client_id, contract_number, contract_type, total_value,
                              project_name, status, created_at)
values ((select tenant_a from ids), (select client_a from ids), 'FC-2026-041', 'architecture', 1000,
        'Ultimo do escritorio A', 'negotiating', now() + interval '1 hour'),
       ((select tenant_b from ids), (select client_b from ids), '0812', 'architecture', 1000,
        'Ultimo do escritorio B', 'negotiating', now() + interval '1 hour');

select pg_temp.rec('6.1', 'a sugestao segue a serie do proprio escritorio', 'FC-2026-042',
  pg_temp.como((select user_a from ids), (select tenant_a from ids),
    $q$select public.suggest_contract_number()$q$));

select pg_temp.rec('6.2', 'outro escritorio recebe a serie DELE, nao a do vizinho', '0813',
  pg_temp.como((select user_b from ids), (select tenant_b from ids),
    $q$select public.suggest_contract_number()$q$));

/* 6.3 e o controle: sem o menu `contracts`, a sugestao e recusada. Sem ele, os
   dois casos acima passariam mesmo se a funcao nao conferisse nada. */
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('cccccccc-0000-4000-8000-0000000000ff', '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'sem-contratos@ctrnum.test', now(), now());

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status)
values ('cccccccc-0000-4000-8000-0000000000fe', (select tenant_a from ids),
        'cccccccc-0000-4000-8000-0000000000ff', 'Sem Contratos', 'sem-contratos@ctrnum.test',
        'admin_staff', 'commercial', 'active');

select pg_temp.rec('6.3', 'CONTROLE: sem o menu Contratos, a sugestao e recusada', 'ERR:P0001',
  pg_temp.como('cccccccc-0000-4000-8000-0000000000ff', (select tenant_a from ids),
    $q$select public.suggest_contract_number()$q$));

select case when observed = expected then 'PASS' else 'FAIL' end as status, caso, descricao, expected, observed
from res order by seq;

rollback;
