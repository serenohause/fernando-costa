-- Teste da deduplicacao de cliente por TELEFONE (migration 0076).
--
-- O QUE ELE PROVA, E POR QUE EXISTE
--   A regra "nao permitir telefone duplicado" nao mora em um lugar so. Ela e uma
--   coluna gerada (phone_digits), um indice unico parcial e um trigger, e as tres
--   pecas precisam concordar. Cada uma falha de um jeito diferente e silencioso:
--
--     - a coluna gerada pode normalizar demais e destruir numero valido (cortar
--       o "55" de um celular do DDD 55, Santa Maria/RS);
--     - a coluna pode normalizar de menos e deixar passar a duplicata que existe
--       ("+55 85 98686-2020" e "(85) 98686-2020" sao a MESMA linha telefonica);
--     - o indice parcial sozinho deixaria cadastro novo colidir com importado sem
--       ninguem perceber;
--     - e a dispensa das duas linhas de teste, se ficasse so no indice, travaria
--       os dois cadastros: salvar qualquer campo reenvia `phone` e o trigger
--       recusaria a gravacao.
--
--   Cada caso abaixo e uma dessas possibilidades escrita como afirmacao.
--
-- COMO RODAR
--   npm run test:phone-dedup
--
-- RESIDUO
--   Nenhum. Tudo em UMA transacao terminada em ROLLBACK, com tenants proprios
--   (slug phone-dedup-test-*). O caso 6.2 encosta numa linha real do escritorio
--   para provar que ela continua editavel, e o rollback desfaz.
--
-- COMO LER
--   observed = 'OK:<n>'          a operacao passou e afetou n linhas.
--   observed = 'ERR:<sqlstate>'  foi recusada. 23505 = unicidade violada.
--   Os casos marcados CONTROLE afirmam o que precisa CONTINUAR possivel - sem
--   eles, um schema que recusasse tudo passaria com nota cheia.

begin;

create temp table res (
  seq serial primary key,
  caso text,
  descricao text,
  expected text,
  observed text
) on commit drop;

create or replace function pg_temp.try(p_sql text)
returns text
language plpgsql
as $$
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

create temp table ids on commit drop as select
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid as tenant_a,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'::uuid as tenant_b;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Phone Dedup Test A', 'phone-dedup-test-a'),
  ((select tenant_b from ids), 'Phone Dedup Test B', 'phone-dedup-test-b');

-- Roda p_sql e devolve a MENSAGEM do erro (ou '<sem erro>'). Usado para provar
-- que o trigger cita o nome do indice, que e o que a tela do CRM le.
create or replace function pg_temp.msg(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql;
    return '<sem erro>';
  exception when others then
    get stacked diagnostics v = message_text;
    return v;
  end;
end;
$$;

/*
  MONTA o INSERT e devolve o TEXTO dele. Nao executa, de proposito.

  A primeira versao deste arquivo executava aqui dentro, com pg_temp.try, e o
  resultado era um teste vazio: try engolia a excecao e devolvia 'ERR:23505' como
  VALOR, entao o chk de fora via um SELECT bem-sucedido e gravava 'OK:1'. Todos
  os casos de colisao passavam a reportar sucesso, e os CONTROLES passavam pelo
  mesmo motivo errado - nenhum deles estava afirmando coisa alguma.
*/
create or replace function pg_temp.ins(p_tenant uuid, p_nome text, p_phone text, p_legacy text default null)
returns text language sql as $$
  select format($q$
    insert into public.clients (tenant_id, legacy_id, name, phone, address_city, address_state)
    values (%L, %L, %L, %L, 'Goiania', 'GO')
  $q$, p_tenant, p_legacy, p_nome, p_phone);
$$;

-- 1. A normalizacao, numero por numero ---------------------------------------

select pg_temp.chk('1.1', 'insere cliente com celular pontuado', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Base Celular', '(62) 99812-4477'));

select pg_temp.val('1.2', 'phone_digits tira a pontuacao', '62998124477',
  $q$select phone_digits from public.clients where name = 'Base Celular'$q$);

select pg_temp.chk('1.3', 'insere o MESMO numero escrito com +55', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Base DDI', '+55 62 99812-4478'));

select pg_temp.val('1.4', 'o DDI sai: 13 digitos viram 11', '62998124478',
  $q$select phone_digits from public.clients where name = 'Base DDI'$q$);

select pg_temp.chk('1.5', 'insere fixo com +55 (12 digitos)', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Base Fixo DDI', '+55 62 3212-4479'));

select pg_temp.val('1.6', 'o DDI sai: 12 digitos viram 10', '6232124479',
  $q$select phone_digits from public.clients where name = 'Base Fixo DDI'$q$);

/*
  1.7 e 1.8 sao o caso que a normalizacao poderia destruir: 55 tambem e DDD
  (Santa Maria/RS). Com 11 digitos ele NAO pode ser cortado - cortar
  transformaria um celular valido em outro numero, plausivel e errado.
*/
select pg_temp.chk('1.7', 'insere celular do DDD 55', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Base DDD 55', '(55) 99812-4480'));

select pg_temp.val('1.8', 'DDD 55 com 11 digitos NAO e cortado', '55998124480',
  $q$select phone_digits from public.clients where name = 'Base DDD 55'$q$);

select pg_temp.chk('1.9', 'insere numero malformado', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Base Torto', '+55 85'));

/* Ha um assim no dado real do escritorio: um cadastro cujo telefone e so
   "'+55 85". Inventar o que falta seria gravar como fato um numero que ninguem
   digitou. */
select pg_temp.val('1.9b', 'numero malformado fica como esta, sem adivinhacao', '5585',
  $q$select phone_digits from public.clients where name = 'Base Torto'$q$);

select pg_temp.chk('1.10', 'coluna gerada nao aceita escrita', 'ERR:428C9',
  format($q$
    insert into public.clients (tenant_id, name, phone, phone_digits, address_city, address_state)
    values (%L, 'Escreve Derivado', '(62) 90000-0001', '62900000001', 'Goiania', 'GO')
  $q$, (select tenant_a from ids)));

-- 2. Nova x nova: o indice unico parcial --------------------------------------

select pg_temp.chk('2.1', 'mesmo telefone, mesmo escritorio, recusado', 'ERR:23505',
  pg_temp.ins((select tenant_a from ids), 'Duplicata Crua', '(62) 99812-4477'));

/*
  2.2 e o coracao do pedido. O par existe no dado real do escritorio - um cadastro
  gravado com "+55" e outro sem - e comparar o texto cru de `phone` deixaria os
  dois entrarem. E por causa deste caso que a comparacao passa por phone_digits.
*/
select pg_temp.chk('2.2', 'mesmo numero escrito com +55 tambem e recusado', 'ERR:23505',
  pg_temp.ins((select tenant_a from ids), 'Duplicata DDI', '+55 62 99812-4477'));

select pg_temp.chk('2.3', 'mesmo numero sem pontuacao tambem e recusado', 'ERR:23505',
  pg_temp.ins((select tenant_a from ids), 'Duplicata Nua', '62998124477'));

select pg_temp.chk('2.4', 'CONTROLE: telefone diferente entra', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Outro Numero', '(62) 99812-4499'));

select pg_temp.chk('2.5', 'CONTROLE: outro escritorio pode ter o mesmo telefone', 'OK:1',
  pg_temp.ins((select tenant_b from ids), 'Mesmo Numero Outro Tenant', '(62) 99812-4477'));

-- 3. Nova x importada: o trigger ----------------------------------------------

select pg_temp.chk('3.1', 'insere cliente IMPORTADO', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Importado Um', '(62) 98888-1111', 'b44-phone-1'));

/*
  3.2 e o buraco que um indice parcial sozinho abriria. A linha importada nao esta
  no indice unico, entao sem o trigger este insert PASSARIA - e o escritorio
  ganharia um segundo cadastro do mesmo contato em silencio, que e exatamente o
  que o pedido quer impedir. 118 dos clientes deste banco vieram da importacao.
*/
select pg_temp.chk('3.2', 'cadastro NOVO nao pode repetir telefone de IMPORTADO', 'ERR:23505',
  pg_temp.ins((select tenant_a from ids), 'Novo Sobre Importado', '(62) 98888-1111'));

select pg_temp.chk('3.3', 'e tambem nao pode com o mesmo numero em +55', 'ERR:23505',
  pg_temp.ins((select tenant_a from ids), 'Novo Sobre Importado DDI', '+55 62 98888-1111'));

/*
  3.4: duas linhas importadas CONVIVEM. Nao e tolerancia, e requisito - o dado
  real do escritorio tem 3 pares de telefone repetido vindos do base44, com
  contrato e recebivel pendurados, e recusa-los apagaria cadastro de verdade.
*/
select pg_temp.chk('3.4', 'CONTROLE: duas linhas IMPORTADAS convivem', 'OK:1',
  pg_temp.ins((select tenant_a from ids), 'Importado Dois', '(62) 98888-1111', 'b44-phone-2'));

-- 4. O erro chega com o nome do indice ----------------------------------------
--
--    A tela do CRM decide QUAL campo mostrar lendo o nome da restricao na
--    mensagem. Se o trigger levantasse o erro com outro texto, a tela cairia no
--    palpite antigo e diria "CPF ja cadastrado" numa colisao de telefone.

select pg_temp.val('4.1', 'trigger cita clients_tenant_id_phone_digits_key', 'true',
  format($q$
    select (pg_temp.msg(format($i$
      insert into public.clients (tenant_id, name, phone, address_city, address_state)
      values (%L, 'Le O Nome', '(62) 98888-1111', 'Goiania', 'GO')
    $i$)) ~ 'clients_tenant_id_phone_digits_key')::text
  $q$, (select tenant_a from ids)));

select pg_temp.val('4.2', 'indice cita o mesmo nome na colisao nova x nova', 'true',
  format($q$
    select (pg_temp.msg(format($i$
      insert into public.clients (tenant_id, name, phone, address_city, address_state)
      values (%L, 'Le O Nome 2', '(62) 99812-4477', 'Goiania', 'GO')
    $i$)) ~ 'clients_tenant_id_phone_digits_key')::text
  $q$, (select tenant_a from ids)));

-- 5. Edicao: a linha nao pode colidir consigo mesma ---------------------------

select pg_temp.chk('5.1', 'CONTROLE: salvar o cliente mantendo o proprio telefone', 'OK:1',
  $q$update public.clients set notes = 'editado' where name = 'Outro Numero'$q$);

select pg_temp.chk('5.2', 'trocar para o telefone de outro cliente e recusado', 'ERR:23505',
  $q$update public.clients set phone = '(62) 99812-4477' where name = 'Outro Numero'$q$);

-- 6. A dispensa das duas linhas de agosto/2026 --------------------------------

select pg_temp.val('6.1', 'a dispensa esta no indice E no trigger', 'true',
  $q$
  select (
    (select indexdef ~ '8db85ac3' and indexdef ~ '3580e4d1'
       from pg_indexes where indexname = 'clients_tenant_id_phone_digits_key')
    and
    (select prosrc ~ '8db85ac3' and prosrc ~ '3580e4d1'
       from pg_proc where proname = 'clients_reject_key_collision')
  )::text
  $q$);

/*
  6.2 e o caso que a dispensa existe para garantir: as duas linhas continuam
  EDITAVEIS. Salvar qualquer campo do cadastro reenvia `phone`, o trigger acorda,
  acha a outra linha - e sem a dispensa recusaria a gravacao, travando dois
  cadastros reais em nome de uma regra que eles nao precisam cumprir.

  Encosta em linha real, e o ROLLBACK desfaz. No dia em que o escritorio corrigir
  o telefone de uma delas, este caso passa a devolver OK:0 e vira o sinal de que a
  dispensa pode sair da migration.
*/
select pg_temp.chk('6.2', 'linha dispensada continua editavel', 'OK:1',
  $q$update public.clients set phone = phone
     where id = '8db85ac3-28b7-4908-9091-ed3dd21541d8'$q$);

-- Resultado ------------------------------------------------------------------

select
  case when observed = expected or expected = '(informativo)' then 'PASS' else 'FAIL' end as status,
  caso, descricao, expected, observed
from res
order by seq;

rollback;
