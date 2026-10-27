-- A LIMPEZA DO CONTADOR APAGAVA A LINHA DE QUEM TEM JANELA MAIOR.
--
-- Nada de schema muda aqui: so o corpo de public.hit_public_endpoint. A 0027
-- continua como esta, porque migration aplicada nao se edita.
--
-- O BUG, MEDIDO EM DESENVOLVIMENTO
--   A limpeza da 0027 roda dentro da propria chamada e usa a janela DE QUEM
--   CHAMOU para decidir o corte, sem filtrar por scope:
--
--     delete from public.public_endpoint_hits
--      where window_start < v_window_start - interval '10 minutes';
--
--   Com todos os contadores em janela de 60 segundos isso era inofensivo: o
--   corte caia sempre numa faixa vencida. A armadilha de robo da capture-lead
--   trouxe o primeiro contador de janela LONGA (3600 segundos, scope
--   capture-lead-armadilha). A linha dela nasce no comeco da hora, e qualquer
--   chamada de janela curta feita depois dos 10 primeiros minutos daquela hora
--   apaga ela, porque 00:00:00 e menor que (a janela do minuto corrente) menos
--   10 minutos.
--
--   Consequencia: o contador da armadilha nunca passava de 1, e sempre voltava
--   a 1 a cada minuto novo. A estatistica estava morta.
--
--   E ela nao e enfeite. E o UNICO sinal de que a armadilha esta fechando em
--   cima de lead de verdade (preenchedor automatico de formulario), que e o
--   falso positivo caro: a pessoa le "Recebemos seu e-mail" e o lead vai para o
--   lixo. Sem esse numero, isso acontece calado.
--
--   Vale dizer o que NAO era: o `.then(() => {}).catch(() => {})` que a edge
--   function usava para nao derrubar a resposta foi testado isolado e conta
--   normalmente. O contador chegava ao banco; o que o apagava era este delete.
--
-- A CORRECAO, E POR QUE DESTE JEITO
--   Duas condicoes, e cada uma cobre o que a outra nao cobre:
--
--   1. scope = p_scope e janela ja vencida (window_start + p_window_seconds
--      antes da janela corrente). So mexe no proprio scope, e o corte usa a
--      largura de janela DELE. Contador de outro scope deixa de ser alcancavel,
--      que e o bug.
--
--   2. Rede de um dia, para qualquer scope. Sem ela, scope que para de ser
--      chamado deixa linha parada para sempre, porque a condicao 1 so roda
--      quando alguem chama aquele mesmo scope. Um dia esta uma ordem de
--      grandeza acima da maior janela em uso (1 hora), entao ela nunca alcanca
--      janela viva.
--
--   O gatilho continua sendo v_count = 1: limpeza so quando a linha da janela
--   acabou de nascer, e nao a cada requisicao.
--
-- QUEM MAIS E AFETADO
--   Em producao hoje, ninguem: as duas portas publicas de la (open-client-intake
--   e submit-client-intake) usam janela de 60 segundos, e entre iguais o delete
--   antigo acertava. O estrago aparece a partir do primeiro contador de janela
--   diferente, e por isso esta correcao precisa estar em producao ANTES de a
--   landing page subir para la.

create or replace function public.hit_public_endpoint(
  p_scope text,
  p_client_key text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, hit_count int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'hit_public_endpoint: teto e janela precisam ser positivos'
      using errcode = '22023';
  end if;

  -- clock_timestamp(), e nao now(): now() e o instante da transacao, e a janela
  -- precisa acompanhar o relogio de verdade.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  -- UMA ida, atomica. Ler-e-depois-escrever deixaria duas requisicoes
  -- simultaneas lerem o mesmo valor antes de qualquer escrita, que e exatamente
  -- o cenario que este contador existe para barrar.
  insert into public.public_endpoint_hits as h (scope, client_key, window_start, hit_count)
  values (p_scope, left(p_client_key, 100), v_window_start, 1)
  on conflict (scope, client_key, window_start)
  do update set hit_count = h.hit_count + 1
  returning h.hit_count into v_count;

  -- Limpeza na propria chamada, so quando a linha da janela acabou de nascer.
  -- O cabecalho deste arquivo explica por que ela precisa ser por scope: o
  -- corte global apagava a linha de quem tem janela maior.
  if v_count = 1 then
    delete from public.public_endpoint_hits
     where (
             scope = p_scope
             and window_start < v_window_start - make_interval(secs => p_window_seconds)
           )
        or window_start < clock_timestamp() - interval '1 day';
  end if;

  return query select v_count <= p_limit, v_count;
end;
$$;

revoke all on function public.hit_public_endpoint(text, text, int, int) from public, anon, authenticated;
grant execute on function public.hit_public_endpoint(text, text, int, int) to service_role;

comment on function public.hit_public_endpoint(text, text, int, int) is
  'Registra UMA requisicao de p_client_key contra a funcao publica p_scope e responde se ela cabe no teto. E AQUI QUE O LIMITE DE REQUISICOES DA PORTA PUBLICA MORA, nao na memoria da edge function, que e um isolate novo a cada requisicao e por isso nunca chegava a contar nada. Janela fixa de p_window_seconds, teto de p_limit por (funcao, origem, janela). A contagem e um unico insert ... on conflict do update ... returning, atomico: duas requisicoes simultaneas nao leem o mesmo valor antes de escrever. Devolve allowed=false a partir da requisicao que passa do teto, e quem traduz isso em HTTP 429 e a edge function. So service_role executa: com EXECUTE para anon, o proprio contador viraria um endpoint anonimo de escrita. A LIMPEZA E POR SCOPE desde a migration 0115: ate ela, o delete usava a janela de quem chamou sem filtrar scope, e um contador de janela curta apagava a linha de um de janela longa (a armadilha da capture-lead nunca passava de 1).';
