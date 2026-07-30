-- Teste de schema do modulo 2 (CRM) - clients
--
-- O que ele prova, e por que existe: a deduplicacao de cliente deste projeto nao
-- e codigo de aplicacao, e sim tres colunas geradas mais duas unicidades
-- parciais no banco (migration 0015). Coluna gerada e restricao sao exatamente o
-- tipo de coisa que "parece certa" na leitura da migration e falha calada no uso:
-- expressao nao immutable que virou trigger, regex sobre citext que recusa valor
-- valido, unique que nao pega o documento pontuado. Cada caso abaixo e uma dessas
-- possibilidades escrita como afirmacao.
--
-- COMO RODAR
--   npm run test:schema:crm
--   ou cole o arquivo inteiro no SQL Editor do Studio.
--
-- RESIDUO
--   Nenhum. Tudo roda em UMA transacao terminada em ROLLBACK, inclusive os dois
--   escritorios de fixture e as 5000 linhas sinteticas do caso 6.1. O dado do
--   escritorio de teste que ja esta no banco nao e tocado: as fixtures usam
--   tenants proprios (slug crm-schema-test-*).
--
-- COMO LER
--   observed = 'OK:<n>'    a operacao passou e afetou n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam aqui:
--                          23505 unique violado (duplicata barrada),
--                          23514 check violado, 23503 FK violada,
--                          428C9 tentativa de escrever coluna gerada.
--   Os casos marcados CONTROLE afirmam o que precisa CONTINUAR possivel - sem
--   eles, um schema que recusasse tudo passaria com nota cheia.

begin;

-- Instrumentacao -------------------------------------------------------------

create temp table res (
  seq serial primary key,
  caso text,
  descricao text,
  expected text,
  observed text
) on commit drop;

-- Executa p_sql e devolve 'OK:<linhas>' ou 'ERR:<sqlstate>'. O sucesso PERSISTE
-- de proposito (os casos de colisao dependem da linha gravada pelo caso
-- anterior); o erro desfaz apenas a subtransacao deste bloco.
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

-- Mesma coisa para valor: roda um SELECT de uma coluna e guarda o texto.
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
  'dddddddd-dddd-4ddd-8ddd-dddddddddd01'::uuid as tenant_a,
  'dddddddd-dddd-4ddd-8ddd-dddddddddd02'::uuid as tenant_b;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'CRM Schema Test A', 'crm-schema-test-a'),
  ((select tenant_b from ids), 'CRM Schema Test B', 'crm-schema-test-b');

-- 1. As tres colunas derivadas sao do banco, nao da aplicacao ----------------

select pg_temp.chk('1.1', 'insere cliente com CPF pontuado', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, email, tax_id, client_type, lead_source,
                              address_city, address_state)
  values (%L, 'Mariana Rezende', '(62) 99812-4477', 'Mariana.Rezende@Gmail.com',
          '123.456.789-00', 'individual', 'instagram', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.val('1.2', 'tax_id_digits calculado pelo banco', '12345678900',
  $q$select tax_id_digits from public.clients where name = 'Mariana Rezende'$q$);

select pg_temp.val('1.3', 'email_normalized calculado pelo banco', 'mariana.rezende@gmail.com',
  $q$select email_normalized::text from public.clients where name = 'Mariana Rezende'$q$);

select pg_temp.val('1.4', 'client_key prefere documento', 'doc:12345678900',
  $q$select client_key::text from public.clients where name = 'Mariana Rezende'$q$);

-- Cinco campos desde a 0016: o documento (so digitos) e a cidade entraram.
-- O documento porque procurar por CPF e o caminho natural de quem quer achar
-- o cliente, e nao achar e o que produz duplicata; a cidade porque a busca do
-- original tenta filtrar por ela e nunca funcionou (Clients.jsx:172 le
-- `client.city`, campo que nao existe em Client.jsonc).
select pg_temp.val('1.5', 'search_text junta nome, e-mail, telefone, documento e cidade',
  'Mariana Rezende Mariana.Rezende@Gmail.com (62) 99812-4477 12345678900 Goiania',
  $q$select search_text from public.clients where name = 'Mariana Rezende'$q$);

-- E o caso central: no original estes campos vem do corpo do INSERT, escritos
-- pelo frontend, e por isso podem chegar errados ou nao chegar.
select pg_temp.chk('1.6', 'aplicacao NAO consegue escrever coluna gerada', 'ERR:428C9', format($q$
  insert into public.clients (tenant_id, name, phone, tax_id_digits, address_city, address_state)
  values (%L, 'Escritor de Derivado', '62999990000', '99999999999', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.chk('1.7', 'UPDATE recalcula o derivado (troca de documento)', 'OK:1', $q$
  update public.clients set tax_id = '987.654.321/00' where name = 'Mariana Rezende'
$q$);

select pg_temp.val('1.8', 'tax_id_digits depois do UPDATE', '98765432100',
  $q$select tax_id_digits from public.clients where name = 'Mariana Rezende'$q$);

select pg_temp.val('1.9', 'client_key depois do UPDATE', 'doc:98765432100',
  $q$select client_key::text from public.clients where name = 'Mariana Rezende'$q$);

select pg_temp.chk('1.10', 'restaura o documento original para os casos de colisao', 'OK:1', $q$
  update public.clients set tax_id = '123.456.789-00' where name = 'Mariana Rezende'
$q$);

-- 2. Documento com e sem pontuacao e o mesmo documento -----------------------

select pg_temp.chk('2.1', 'mesmo CPF SEM pontuacao colide com o pontuado', 'ERR:23505', format($q$
  insert into public.clients (tenant_id, name, phone, tax_id, address_city, address_state)
  values (%L, 'Mariana R. (duplicata)', '62998124477', '12345678900', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.chk('2.2', 'mesmo CPF com OUTRA pontuacao tambem colide', 'ERR:23505', format($q$
  insert into public.clients (tenant_id, name, phone, tax_id, address_city, address_state)
  values (%L, 'Mariana R. (duplicata 2)', '62998124477', '123 456 789 00', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.chk('2.3', 'CONTROLE: mesmo CPF em OUTRO escritorio e permitido', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, tax_id, address_city, address_state)
  values (%L, 'Mariana Rezende', '62998124477', '123.456.789-00', 'Goiania', 'GO')
$q$, (select tenant_b from ids)));

-- 3. E-mail: caixa diferente e o mesmo e-mail --------------------------------

select pg_temp.chk('3.1', 'cliente sem documento, so e-mail', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
  values (%L, 'Paulo Andrade', '(62) 98411-2030', 'Paulo.Andrade@Outlook.com', 'Aparecida de Goiania', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.val('3.2', 'client_key cai no e-mail quando nao ha documento', 'email:paulo.andrade@outlook.com',
  $q$select client_key::text from public.clients where name = 'Paulo Andrade'$q$);

select pg_temp.chk('3.3', 'mesmo e-mail em CAIXA DIFERENTE colide', 'ERR:23505', format($q$
  insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
  values (%L, 'Paulo A. (duplicata)', '62984112030', 'PAULO.ANDRADE@OUTLOOK.COM', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

-- Espaco nas pontas nao chega a virar duplicata porque o check de formato recusa
-- antes: o e-mail cru e o que a tela exibe, entao " x@y.com " nao entra.
select pg_temp.chk('3.4', 'e-mail com espaco nas pontas e RECUSADO pelo check de formato', 'ERR:23514', format($q$
  insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
  values (%L, 'Paulo A. (duplicata 2)', '62984112030', '  paulo.andrade@outlook.com  ', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

-- Limite conhecido do modelo de chave, herdado do original: documento tem
-- precedencia, entao duas linhas com o mesmo e-mail convivem se uma tiver
-- documento. Esta afirmado aqui para nao ser descoberto como surpresa.
select pg_temp.chk('3.5', 'LIMITE: e-mail repetido NAO colide quando a linha nova tem documento', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, email, tax_id, address_city, address_state)
  values (%L, 'Paulo Andrade (empresa)', '62984112030', 'paulo.andrade@outlook.com', '11.222.333/0001-44', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

-- 4. Bordas ------------------------------------------------------------------

select pg_temp.chk('4.1', 'documento so com pontuacao ("---") e aceito', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, tax_id, address_city, address_state)
  values (%L, 'Helena Braga', '62991002030', '---', 'Trindade', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.val('4.2', 'tax_id_digits e nulo quando nao ha digito algum', '<null>',
  $q$select tax_id_digits from public.clients where name = 'Helena Braga'$q$);

select pg_temp.val('4.3', 'client_key e nulo sem documento e sem e-mail', '<null>',
  $q$select client_key::text from public.clients where name = 'Helena Braga'$q$);

-- Cadastro do passo 1 do original: nome, telefone e cidade. Precisa caber mais
-- de um, e e por isso que os dois unique sao parciais.
select pg_temp.chk('4.4', 'CONTROLE: segundo cliente sem documento e sem e-mail e permitido', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, address_city, address_state)
  values (%L, 'Rodrigo Vasques', '62993334040', 'Senador Canedo', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.5', 'e-mail string vazia e RECUSADO (a camada de dados manda null)', 'ERR:23514', format($q$
  insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
  values (%L, 'Vazio Silva', '62990001111', '', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

-- Se o check usasse ~ em vez de ~*, este caso falharia: citext deixa a igualdade
-- insensivel a caixa, mas nao o operador de regex.
select pg_temp.chk('4.6', 'CONTROLE: e-mail em CAIXA ALTA passa no check de formato', 'OK:1', format($q$
  insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
  values (%L, 'Caixa Alta', '62990002222', 'CAIXA.ALTA@FernandoCosta.ARQ.BR', 'Goiania', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.7', 'cidade obrigatoria em branco e recusada (not null aceitaria "")', 'ERR:23514', format($q$
  insert into public.clients (tenant_id, name, phone, address_city, address_state)
  values (%L, 'Sem Cidade', '62990003333', '   ', 'GO')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.8', 'cliente de tenant inexistente e recusado (FK)', 'ERR:23503', $q$
  insert into public.clients (tenant_id, name, phone, address_city, address_state)
  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee99', 'Orfao', '62990004444', 'Goiania', 'GO')
$q$);

select pg_temp.val('4.9', 'default de pais aplicado', 'Brasil',
  $q$select address_country from public.clients where name = 'Rodrigo Vasques'$q$);

-- 5. Superficie de acesso ----------------------------------------------------
--
-- Enquanto a RLS do modulo nao existir, o esperado e ZERO privilegio para anon e
-- authenticated: e o que a 0007 garantiu ao desarmar o DEFAULT PRIVILEGE do papel
-- postgres. Se 5.1 ou 5.2 deixarem de ser nulos sem que haja policy, a tabela
-- esta exposta pela chave publicavel.
--
-- 5.3 e 5.4 sao um marcador de etapa, nao uma afirmacao de seguranca: valem
-- 'false' e '0' so ate o rls-guardian entrar. Quando ele entrar, viram 'true' e
-- o numero de policies - e a atualizacao destes dois casos e parte daquele
-- trabalho.

select pg_temp.val('5.1', 'privilegios de anon em public.clients', '<null>',
  $q$select nullif(string_agg(privilege_type, ','), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients' and grantee = 'anon'$q$);

select pg_temp.val('5.2', 'privilegios de authenticated em public.clients', '<null>',
  $q$select nullif(string_agg(privilege_type, ','), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients' and grantee = 'authenticated'$q$);

select pg_temp.val('5.3', 'RLS ligada? (false ate o rls-guardian entrar)', 'false',
  $q$select relrowsecurity::text from pg_class where oid = 'public.clients'::regclass$q$);

select pg_temp.val('5.4', 'policies existentes (0 ate o rls-guardian entrar)', '0',
  $q$select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'clients'$q$);

-- 6. Indices e busca ---------------------------------------------------------
--
-- O escritorio B leva 5000 clientes sinteticos para que o EXPLAIN diga algo.
-- Nenhum deles casa com os termos usados nos casos do escritorio A.
--
-- O QUE ESTE BLOCO AFIRMA, E O QUE ELE DEIXOU DE AFIRMAR
--
--   A primeira versao do 6.1 exigia que o planejador ESCOLHESSE o indice com
--   5000 linhas. Passou, e depois quebrou quando a 0016 acrescentou documento e
--   cidade ao search_text: a coluna ficou mais longa, o indice de trigrama
--   cresceu, e o custo estimado passou o da varredura sequencial (311 contra
--   266). O indice continuava perfeito - o planejador so achou mais barato
--   varrer 5000 linhas, o que E a decisao certa nesse tamanho.
--
--   Ou seja: aquele caso afirmava a decisao de custo do planejador, que depende
--   de volume, distribuicao e largura da coluna - nada disso e do schema. Teste
--   que quebra quando o schema melhora nao esta medindo o schema.
--
--   O que importa e o indice ser USAVEL para este predicado. Isso e do schema,
--   e e o que 6.1 afirma agora, proibindo a varredura sequencial. 6.1b registra
--   a escolha natural como informativo: serve para ver o custo mudar de lado
--   conforme a tabela cresce, sem transformar isso em falha.

insert into public.clients (tenant_id, name, phone, email, address_city, address_state)
select
  (select tenant_b from ids),
  'Cliente Sintetico ' || g,
  '(62) 9' || lpad(g::text, 8, '0'),
  'sintetico' || g || '@exemplo.test',
  'Goiania',
  'GO'
from generate_series(1, 5000) g;

analyze public.clients;

do $$
declare
  v_line text;
  v_natural text := '';
  v_forcado text := '';
  v_tenant uuid;
  v_sql text;
begin
  select tenant_b into v_tenant from ids;
  v_sql := format(
    'explain (format text) select id from public.clients where tenant_id = %L and search_text ilike ''%%sintetico 4321%%''',
    v_tenant);

  for v_line in execute v_sql loop
    v_natural := v_natural || ' | ' || btrim(v_line);
  end loop;

  -- Varredura sequencial proibida: se o indice for usavel para este predicado,
  -- e aqui que ele aparece. Se nao aparecer nem assim, o indice esta errado -
  -- opclass trocada, ordem de coluna incompativel, extensao ausente.
  set local enable_seqscan = off;
  for v_line in execute v_sql loop
    v_forcado := v_forcado || ' | ' || btrim(v_line);
  end loop;
  set local enable_seqscan = on;

  insert into res (caso, descricao, expected, observed)
  values ('6.1', 'indice de trigrama e USAVEL para a busca livre',
          'true', (v_forcado like '%clients_tenant_id_search_text_idx%')::text);
  insert into res (caso, descricao, expected, observed)
  values ('6.1b', 'plano com o indice forcado', '(informativo)', v_forcado);
  insert into res (caso, descricao, expected, observed)
  values ('6.2', 'escolha natural do planejador com 5000 linhas', '(informativo)', v_natural);
end
$$;

select pg_temp.val('6.3', 'indices da tabela',
  'clients_id_tenant_id_key,clients_pkey,clients_tenant_id_client_key_key,clients_tenant_id_created_at_idx,clients_tenant_id_legacy_id_key,clients_tenant_id_name_idx,clients_tenant_id_search_text_idx,clients_tenant_id_tax_id_digits_key',
  $q$select string_agg(indexname, ',' order by indexname) from pg_indexes
     where schemaname = 'public' and tablename = 'clients'$q$);

select pg_temp.val('6.4', 'colunas geradas declaradas', 'client_key,email_normalized,search_text,tax_id_digits',
  $q$select string_agg(column_name, ',' order by column_name) from information_schema.columns
     where table_schema = 'public' and table_name = 'clients' and is_generated = 'ALWAYS'$q$);

-- 1 por "rezende" (nome) + 2 por "outlook" (Paulo e Paulo empresa) + 1 por
-- "99812" (telefone) = 4.
select pg_temp.val('6.5', 'busca livre encontra por pedaco do nome, do e-mail e do telefone', '4', format($q$
  select (
    (select count(*) from public.clients where tenant_id = %1$L and search_text ilike '%%rezende%%') +
    (select count(*) from public.clients where tenant_id = %1$L and search_text ilike '%%outlook%%') +
    (select count(*) from public.clients where tenant_id = %1$L and search_text ilike '%%99812%%')
  )::text
$q$, (select tenant_a from ids)));

-- Resultado ------------------------------------------------------------------

select
  case when observed = expected or expected = '(informativo)' then 'PASS' else 'FAIL' end as status,
  caso, descricao, expected, observed
from res
order by seq;

rollback;
