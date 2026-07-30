-- Limite de requisicoes da porta publica - agora contado no Postgres.
--
-- O QUE ESTAVA ERRADO
--   supabase/functions/_shared/rate-limit.ts contava as requisicoes em um
--   `Map` na memoria do isolate. A plataforma entrega um isolate novo a cada
--   requisicao, entao cada requisicao encontrava o mapa vazio e o teto nunca era
--   alcancado. Medido contra a funcao publicada: 40 requisicoes paralelas contra
--   open-client-intake devolveram 40x HTTP 200, nenhuma recusa. O limite tinha
--   efeito ZERO.
--
--   Isso nao seria so um controle fraco. Duas decisoes ja registradas se APOIAM
--   nele:
--     - migration 0025, secao 4: anon nao ganha EXECUTE nas funcoes de token
--       porque "com EXECUTE direto, qualquer navegador varreria tokens contra
--       /rest/v1/rpc, sem nada no meio para barrar". A edge function era o
--       "algo no meio", e nao estava barrando nada.
--     - migration 0026: distinguir "expirado" de "ja enviado" foi aceito porque
--       o token e uuid v4 "com limite de requisicao na frente". A premissa era
--       falsa.
--     - COMMENT de public.open_client_intake (0025): "O limite de requisicoes
--       que torna essa diferenca [de tempo entre token existente e inexistente]
--       inexplorevel e da edge function."
--
--   Nenhuma das tres decisoes muda. O que muda e que a premissa passa a ser
--   verdadeira, e o texto passa a dizer ONDE o limite mora - para ninguem
--   voltar a se apoiar em memoria de isolate. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md, "Ambiente de banco"), entao a correcao do COMMENT
--   vem aqui, no fim do arquivo.
--
-- POR QUE NO BANCO, E NAO EM INFRAESTRUTURA
--   Um contador compartilhado precisa de um lugar que todos os isolates
--   enxerguem. O unico que este projeto ja tem, e que a edge function ja alcanca
--   com service_role, e o Postgres. Um `insert ... on conflict do update ...
--   returning` resolve a contagem em UMA ida, atomicamente, sem ler-e-escrever.
--
-- POR QUE A TABELA NAO TEM tenant_id
--   O CLAUDE.md exige tenant_id em toda tabela de NEGOCIO. Esta nao e: e um
--   contador de requisicoes de quem ainda nao tem sessao e portanto nao tem
--   escritorio. Nao ha dado de negocio aqui, nao entra em
--   supabase/tests/pattern-invariants.sql (que varre o padrao das tabelas de
--   negocio), e o que a protege e nao ter GRANT para anon nem authenticated.

-- 1. O contador ----------------------------------------------------------------

create table public.public_endpoint_hits (
  scope text not null,
  client_key text not null,
  window_start timestamptz not null,
  hit_count int not null default 0,

  constraint public_endpoint_hits_pkey primary key (scope, client_key, window_start)
);

comment on table public.public_endpoint_hits is
  'Contador de requisicoes das funcoes publicas (open-client-intake e submit-client-intake), compartilhado entre os isolates da plataforma. Uma linha por (funcao, origem, janela de tempo). NAO e tabela de negocio: nao tem tenant_id, nao guarda dado pessoal e nao aparece em nenhuma tela. Quem escreve e public.hit_public_endpoint, security definer; anon e authenticated nao tem privilegio algum sobre ela e a RLS esta ligada sem policy nenhuma, entao nem um GRANT acidental futuro a abre.';

comment on column public.public_endpoint_hits.scope is
  'Nome da funcao publica. O teto e por funcao: estourar o limite de abertura do formulario nao pode calar o envio de quem ja estava preenchendo.';

comment on column public.public_endpoint_hits.client_key is
  'Identidade de quem chama, extraida do PRIMEIRO valor de x-forwarded-for pela edge function (o resto da lista e escrito por quem chama e nao vale como identidade). Nao e dado pessoal de cliente do escritorio: e o IP de quem bate na porta, e some junto com a janela na limpeza.';

comment on column public.public_endpoint_hits.window_start is
  'Inicio da janela, truncado ao multiplo do tamanho da janela. Janela fixa, e nao deslizante: deslizante exigiria guardar uma linha por requisicao, e o que se quer barrar aqui e varredura, nao rajada de dois cliques.';

-- Limpeza. A tabela so cresce se ninguem apagar, e "tabela que so cresce" e
-- problema adiado: com IP forjado, uma varredura faria o proprio mecanismo de
-- defesa virar o problema. O indice existe para que o DELETE da funcao seja uma
-- faixa de indice e nao uma varredura.
create index public_endpoint_hits_window_start_idx
  on public.public_endpoint_hits (window_start);

-- Os dois lados da tranca, escritos a mao (docs/ARCHITECTURE.md: GRANT sem RLS
-- entrega a tabela, RLS sem GRANT ja nega, e o bootstrap do Supabase ja
-- concedeu por tras uma vez neste projeto - migration 0007).
alter table public.public_endpoint_hits enable row level security;

revoke all on table public.public_endpoint_hits from anon, authenticated;

-- 2. A contagem ----------------------------------------------------------------

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
  -- simultaneas lerem o mesmo valor antes de qualquer escrita - que e
  -- exatamente o cenario que este contador existe para barrar.
  insert into public.public_endpoint_hits as h (scope, client_key, window_start, hit_count)
  values (p_scope, left(p_client_key, 100), v_window_start, 1)
  on conflict (scope, client_key, window_start)
  do update set hit_count = h.hit_count + 1
  returning h.hit_count into v_count;

  -- Limpeza na propria chamada, so quando a linha da janela acabou de nascer:
  -- em operacao normal isso acontece uma vez por origem por minuto, e a faixa
  -- apagada e quase sempre vazia. Janela de 1 minuto: nada com mais de 10
  -- minutos serve para decidir coisa alguma.
  if v_count = 1 then
    delete from public.public_endpoint_hits
     where window_start < v_window_start - interval '10 minutes';
  end if;

  return query select v_count <= p_limit, v_count;
end;
$$;

comment on function public.hit_public_endpoint(text, text, int, int) is
  'Registra UMA requisicao de p_client_key contra a funcao publica p_scope e responde se ela cabe no teto. E AQUI QUE O LIMITE DE REQUISICOES DA PORTA PUBLICA MORA - nao na memoria da edge function, que e um isolate novo a cada requisicao e por isso nunca chegava a contar nada. Janela fixa de p_window_seconds, teto de p_limit por (funcao, origem, janela). A contagem e um unico insert ... on conflict do update ... returning, atomico: duas requisicoes simultaneas nao leem o mesmo valor antes de escrever. Devolve allowed=false a partir da requisicao que passa do teto, e quem traduz isso em HTTP 429 e a edge function. So service_role executa: com EXECUTE para anon, o proprio contador viraria um endpoint anonimo de escrita.';

revoke all on function public.hit_public_endpoint(text, text, int, int) from public, anon, authenticated;
grant execute on function public.hit_public_endpoint(text, text, int, int) to service_role;

-- 3. Correcao do texto que a 0025 deixou falso ---------------------------------
--
-- Mesmo COMMENT de antes, com a ultima frase apontando para onde o limite mora
-- de verdade. Sem isto, a proxima pessoa a ler o catalogo tomaria por
-- verdadeira uma defesa que nao existia.

comment on function public.open_client_intake(uuid) is
  'Resolve o token do formulario publico e devolve o desfecho, o nome do cliente e o fim da validade - nada mais. Sempre UMA linha: "not_found" para token inexistente ou invalido (os dois indistinguiveis de proposito), e os outros tres descrevendo um token que existe. A distincao entre expirado e ja enviado existe porque quem tem um token que existe o recebeu do escritorio, e ver "seus dados ja foram enviados" em vez de uma recusa seca e o comportamento do original - ver o cabecalho da migration 0026 para o raciocinio completo. O que NAO sai daqui, por desenho da assinatura: id, tenant_id, client_id, negotiation_id e todos os campos do briefing. Marca a linha como expirada quando o prazo venceu e registra a tentativa; nada disso muda a resposta.
LIMITE CONHECIDO: token inexistente nao escreve nada e token existente escreve, o que deixa uma diferenca de tempo entre os dois casos. O limite de requisicoes que torna essa diferenca inexplorevel MORA EM public.hit_public_endpoint / public.public_endpoint_hits (migration 0027), contado no Postgres e compartilhado entre os isolates. Ate a 0027 o texto dizia "e da edge function", e la o contador vivia na memoria do isolate - ou seja, nao existia. A edge function continua sendo quem chama o contador e quem responde 429.';

comment on function public.submit_client_intake(uuid, jsonb) is
  'Grava o briefing enviado pelo cliente final e encerra o link. Devolve true quando aceitou e false quando recusou; a recusa e a mesma para token inexistente, expirado e ja enviado. Revalida validade e status DENTRO da transacao, com a linha travada por FOR UPDATE: dois envios simultaneos com o mesmo token nao passam os dois, e o envio de um link que ja tinha aberto antes de vencer e recusado. Le do payload somente as chaves do briefing, uma a uma - status, token, tenant_id e client_id nao tem caminho de entrada pelo corpo da requisicao. Dado incompleto levanta 22023, e nao false, para nao se confundir com recusa de token.
O limite de requisicoes desta porta e o mesmo da abertura, e mora em public.hit_public_endpoint (migration 0027) - contado no Postgres, nao na memoria da edge function.
NAO PORTADO, E PRECISA DE DECISAO DO USUARIO ANTES DA UI: o original, no mesmo passo, sobrescreve o cadastro do CRM com o que o cliente digitou (FormularioCliente.jsx:148, Client.update). Aqui o briefing fica guardado em client_intakes e NADA e escrito em clients. Deixar um envio sem sessao sobrescrever nome, documento e enderecos de um cadastro que a equipe curou e escrita anonima em dado de negocio, e a decisao de aplicar (tudo, alguns campos, ou mediante conferencia na tela) e do usuario, nao do banco.';
