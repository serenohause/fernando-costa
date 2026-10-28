-- O lead da landing page passa a exigir os QUATRO campos.
--
-- O PEDIDO, do usuario: "para o lead agora preciso que seja preenchido um form
-- com: nome, telefone, email e nome do escritorio".
--
-- Ate aqui so o e-mail era obrigatorio, e a pagina pedia so e-mail (no topo) ou
-- e-mail e escritorio (no fim). Nome e telefone nunca eram pedidos, e as colunas
-- existiam desde a 0112 esperando por isso.
--
-- POR QUE A RECUSA FICA AQUI TAMBEM, E NAO SO NA TELA
--   Perguntado, o usuario escolheu que o servidor exija junto. A pagina e
--   publica e a porta de captura nao tem credencial nenhuma: quem postar direto
--   no endereco, ou quem estiver com a pagina ANTIGA em cache no navegador,
--   gravaria lead pela metade sem ninguem notar. Regra de negocio que vive so no
--   navegador nao e regra, e uma sugestao.
--
--   Sao duas barreiras, de proposito. A edge function recusa antes, com zod, e e
--   ela que devolve a frase por campo que a tela mostra. Esta aqui e a rede: ela
--   nao produz texto bonito, produz 22023, e existe para o dia em que alguem
--   escrever outro caminho de escrita e esquecer da regra.
--
-- O QUE NAO MUDA
--   As colunas continuam aceitando nulo. Nao ha NOT NULL novo, e e deliberado:
--   a fila de producao ja pode ter lead gravado antes desta regra, e subir uma
--   restricao de coluna derrubaria a migration no primeiro lead antigo. Quem
--   decide a partir de agora e a funcao, que e por onde TODO lead entra (nao ha
--   policy de INSERT para ninguem, ver 0112).
--
--   O reenvio continua se comportando igual: o PRIMEIRO envio manda no cadastro
--   e o reenvio so preenche o que estava vazio. Com os quatro exigidos isso
--   passa a quase nunca acontecer, mas a regra fica, porque lead antigo
--   incompleto ainda pode receber um reenvio completo.
--
--   E a funcao continua devolvendo SEMPRE true, nunca "ja existia": devolver a
--   diferenca transformaria o formulario publico num verificador de quais
--   e-mails ja se cadastraram.
--
-- POR QUE OS PARAMETROS MANTEM `default null`
--   Tirar o default faria quem omitisse receber "function does not exist", que
--   manda quem depura procurar a funcao em vez de procurar o campo. Com o
--   default e o raise, a resposta diz qual campo falta.

create or replace function public.capture_product_lead(
  p_email text,
  p_name text default null,
  p_office_name text default null,
  p_phone text default null,
  p_source text default 'lp-hausone',
  p_placement text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext;
  v_name text;
  v_office text;
  v_phone text;
begin
  v_email  := nullif(btrim(p_email), '')::extensions.citext;
  v_name   := nullif(btrim(p_name), '');
  v_office := nullif(btrim(p_office_name), '');
  v_phone  := nullif(btrim(p_phone), '');

  -- Um raise por campo, e nao um "preencha tudo": a edge function mapeia o
  -- texto para a frase da tela, e "informe o telefone" conserta mais rapido do
  -- que "faltam campos".
  if v_email is null then
    raise exception 'capture_product_lead: e-mail obrigatorio'
      using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'capture_product_lead: nome obrigatorio'
      using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'capture_product_lead: telefone obrigatorio'
      using errcode = '22023';
  end if;

  if v_office is null then
    raise exception 'capture_product_lead: nome do escritorio obrigatorio'
      using errcode = '22023';
  end if;

  insert into public.product_leads as l
    (email, name, office_name, phone, source, placement)
  values (
    v_email,
    v_name,
    v_office,
    v_phone,
    coalesce(nullif(btrim(p_source), ''), 'lp-hausone'),
    nullif(btrim(p_placement), '')
  )
  on conflict (email) do update
     set submission_count = l.submission_count + 1,
         -- O PRIMEIRO envio manda no cadastro; o reenvio so preenche o que
         -- estava vazio. Sem o coalesce, quem voltasse na pagina e enviasse de
         -- novo apagaria o que ja havia dado.
         name        = coalesce(l.name, excluded.name),
         office_name = coalesce(l.office_name, excluded.office_name),
         phone       = coalesce(l.phone, excluded.phone);

  return true;
end;
$$;

comment on function public.capture_product_lead(text, text, text, text, text, text) is
  'Grava um lead da landing page. Os QUATRO campos sao obrigatorios desde a migration 0124 (nome, telefone, e-mail e escritorio), a pedido do usuario; antes so o e-mail era. A recusa vive aqui E na edge function, de proposito: a porta de captura e publica e sem credencial, entao post direto no endereco ou pagina antiga em cache gravariam lead pela metade. As colunas seguem aceitando nulo porque lead gravado antes desta regra existe e um NOT NULL derrubaria a migration. Devolve SEMPRE true, nunca "ja existia": devolver a diferenca transformaria o formulario num verificador de quais e-mails ja se cadastraram. Reenvio soma submission_count e so preenche o que estava vazio.';
