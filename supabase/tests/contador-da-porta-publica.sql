-- A limpeza do contador de requisicoes nao alcanca a linha de outro scope.
--
-- O QUE ELE PROVA
--   public.hit_public_endpoint limpa linha vencida na propria chamada. Ate a
--   migration 0115 esse delete usava a janela de QUEM CHAMOU e nao filtrava
--   scope, entao um contador de janela curta apagava a linha de um de janela
--   longa. O efeito real: o contador da armadilha de robo da capture-lead
--   (janela de 1 hora) voltava a 1 a cada minuto, e a unica estatistica que
--   acusaria a armadilha fechando em cima de lead de verdade nunca subia.
--
--   Tres casos, e cada um morre sozinho se a correcao for revertida:
--     1. linha de OUTRO scope, com janela ainda viva, sobrevive;
--     2. CONTROLE: linha do MESMO scope, com janela vencida, e apagada mesmo
--        assim (limpeza que nao limpa nada passaria no caso 1 por acidente);
--     3. a rede de um dia alcanca linha de scope abandonado.
--
-- POR QUE A LINHA DE TESTE ENTRA COM window_start EXPLICITO
--   Se o teste dependesse da hora em que roda, ele passaria sozinho: o delete
--   antigo so alcanca linha com mais de 10 minutos, e uma suite que rodasse nos
--   primeiros 10 minutos de cada hora nao veria o bug. Com window_start
--   escrito a mao a prova vale a qualquer hora.
--
-- COMO RODAR
--   npm run test:contador
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. Os scopes usados comecam com
--   `teste-contador-`, para nunca colidir com contador de verdade.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

-- Janela longa e VIVA: 30 minutos atras, numa janela de 1 hora. O delete antigo
-- cortava tudo com mais de 10 minutos, independente do scope.
insert into public.public_endpoint_hits (scope, client_key, window_start, hit_count)
values ('teste-contador-hora', 'total', clock_timestamp() - interval '30 minutes', 7);

-- Mesmo scope de janela curta, janela JA VENCIDA: tem de sair na limpeza.
insert into public.public_endpoint_hits (scope, client_key, window_start, hit_count)
values ('teste-contador-minuto', 'antigo', clock_timestamp() - interval '30 minutes', 3);

-- Scope que ninguem mais chama, e velho demais para servir: a rede de um dia.
insert into public.public_endpoint_hits (scope, client_key, window_start, hit_count)
values ('teste-contador-abandonado', 'total', clock_timestamp() - interval '3 days', 99);

-- O gatilho da limpeza e hit_count = 1, ou seja linha de janela nova. Chave de
-- cliente inedita garante isso.
select public.hit_public_endpoint('teste-contador-minuto', 'novo-agora', 10, 60);

select pg_temp.rec('1.1', 'linha de outro scope, janela viva, sobrevive', '1',
  (select count(*)::text from public.public_endpoint_hits
    where scope = 'teste-contador-hora'));

select pg_temp.rec('1.2', 'e o valor dela nao foi tocado', '7',
  (select coalesce(max(hit_count)::text, '(apagada)') from public.public_endpoint_hits
    where scope = 'teste-contador-hora'));

select pg_temp.rec('2.1', 'CONTROLE: mesmo scope, janela vencida, sai', '0',
  (select count(*)::text from public.public_endpoint_hits
    where scope = 'teste-contador-minuto' and client_key = 'antigo'));

select pg_temp.rec('2.2', 'CONTROLE: a linha nova do mesmo scope fica', '1',
  (select count(*)::text from public.public_endpoint_hits
    where scope = 'teste-contador-minuto' and client_key = 'novo-agora'));

select pg_temp.rec('3.1', 'rede de um dia alcanca scope abandonado', '0',
  (select count(*)::text from public.public_endpoint_hits
    where scope = 'teste-contador-abandonado'));

-- A contagem em si continua funcionando: tres chamadas na mesma janela somam.
select public.hit_public_endpoint('teste-contador-hora', 'somador', 1000000, 3600);
select public.hit_public_endpoint('teste-contador-hora', 'somador', 1000000, 3600);

select pg_temp.rec('4.1', 'janela longa soma, e nao e zerada por janela curta', '(t,3)',
  (select public.hit_public_endpoint('teste-contador-hora', 'somador', 1000000, 3600)::text));

select pg_temp.rec('4.2', 'teto respeitado: a quarta nao cabe num teto de 3', 'false',
  (select (public.hit_public_endpoint('teste-contador-hora', 'somador', 3, 3600)).allowed::text));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
