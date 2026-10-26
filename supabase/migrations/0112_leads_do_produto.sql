-- Captura de leads da landing page do produto (HausOne).
--
-- O QUE ESTE MODULO E, E O QUE ELE NAO E
--   Todas as tabelas anteriores sao de um ESCRITORIO: tem tenant_id, e quem le
--   e colaborador ativo daquele tenant. Esta nao. O dado aqui e de quem AINDA
--   NAO e cliente - o arquiteto que digitou o e-mail na pagina de venda. Ele
--   nao tem login, nao tem escritorio no sistema e por isso nao existe
--   tenant_id capaz de descrever a linha dele.
--
--   Quem le nao e colaborador de tenant nenhum: e quem faz o produto. Esse
--   papel nao existia no modelo (a matriz de permissao e toda por menu, dentro
--   de um escritorio), e e o que a tabela platform_admins introduz. Ele fica
--   DELIBERADAMENTE fora da matriz de menus: nao e permissao que um Diretor
--   possa conceder na tela de Colaboradores, porque nao e acesso dele para dar.
--
-- POR QUE NENHUMA DAS DUAS LEVA tenant_id
--   O CLAUDE.md exige tenant_id em toda tabela de NEGOCIO, e o precedente ja
--   esta registrado na 0027 (public_endpoint_hits): tabela que serve a porta
--   publica, de quem ainda nao tem sessao, nao tem escritorio a que pertencer.
--   O mesmo vale aqui, com uma diferenca que importa: ao contrario do contador
--   da 0027, ESTA TABELA GUARDA DADO PESSOAL (e-mail, nome, telefone). Por isso
--   ela nao fica so sem GRANT - ela tem policy de leitura, e a policy exige
--   is_platform_admin().
--
-- POR QUE NAO ENTRA EM pattern-invariants.sql
--   Aquela suite mede UM padrao: "tabela com tenant_id, leitura por colaborador
--   active do tenant, escrita por can_edit_menu('<menu>')". Nenhuma das tres
--   clausulas descreve este modulo, e registrar as duas tabelas la afirmaria o
--   contrario do desenho - igual as tres tabelas da integracao com o Google
--   (0085), que a propria suite documenta como fora. A cobertura vem de suite
--   propria: supabase/tests/leads.sql.
--
-- A ESCRITA VEM DE FORA, E POR ISSO NAO TEM POLICY DE INSERT
--   Mesmo raciocinio da 0011 (access_requests): quem escreve nao tem sessao,
--   logo nao existe policy de INSERT capaz de decidir nada sobre ele. Quem grava
--   e a edge function capture-lead com service_role, chamando
--   public.capture_product_lead - que recebe PARAMETRO NOMEADO, e nao jsonb:
--   status, submission_count e created_at nao tem caminho de entrada pelo corpo
--   da requisicao, nem por engano futuro.
--
-- O limite de requisicoes desta porta e o mesmo das outras portas publicas e
-- mora em public.hit_public_endpoint (migration 0027).

-- 1. Estado do lead -----------------------------------------------------------
--
-- Convencao de enum do projeto (0001): valor em ingles, rotulo em portugues so
-- na UI. docs/ENUM-MAP.md nao se aplica - nao ha de/para base44 aqui, porque o
-- original nunca teve pagina de venda nem fila de lead.

create type public.product_lead_status as enum ('new', 'contacted', 'qualified', 'discarded');

comment on type public.product_lead_status is
  'Situacao do lead na fila de contato. De/para da UI: new=Novo, contacted=Contatado, qualified=Qualificado, discarded=Descartado. Nao existe valor para "respondeu" nem para "virou cliente" - o primeiro e conversa, nao estado de fila, e o segundo passa a ser um tenant, que e outra tabela.';

-- 2. Quem pode ler a fila -----------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),

  constraint platform_admins_note_len check (note is null or char_length(note) <= 200)
);

comment on table public.platform_admins is
  'Quem faz o produto, e nao quem usa um escritorio. UNICA fonte da leitura da fila de leads. Nao tem RLS com policy e nao tem GRANT para anon nem authenticated: ninguem le esta tabela pela API, nem para descobrir quem esta nela. Quem precisa saber se E um admin da plataforma pergunta por public.is_platform_admin(), que responde sobre o proprio usuario e mais ninguem. Linha entra por migration ou pelo painel da Supabase, de proposito: nao existe tela que conceda este acesso, porque nao e acesso de escritorio a dar.';

comment on column public.platform_admins.note is
  'Quem e a pessoa, para o proximo que abrir a tabela nao precisar cruzar uuid com auth.users.';

alter table public.platform_admins enable row level security;

revoke all on table public.platform_admins from anon, authenticated;

-- 3. is_platform_admin() ------------------------------------------------------
--
-- security definer porque o chamador NAO tem privilegio sobre platform_admins
-- (ponto 2) - e nao deve ter. A funcao responde sobre auth.uid() e nada mais:
-- nao recebe parametro, entao nao existe forma de perguntar sobre terceiro.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.platform_admins pa
     where pa.user_id = auth.uid()
  );
$$;

comment on function public.is_platform_admin() is
  'Responde se o usuario da sessao faz parte da equipe do produto (public.platform_admins). Nao recebe parametro de proposito: nao ha como perguntar sobre outro usuario, so sobre si mesmo. security definer porque quem chama nao tem - e nao deve ter - privilegio de leitura sobre platform_admins. E a unica chave da fila de leads; sem ela a policy de SELECT de product_leads nao casa linha alguma.';

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- 4. A fila de leads ----------------------------------------------------------

create table public.product_leads (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  name text,
  office_name text,
  phone text,

  -- De onde veio. Hoje so a LP, mas o campo existe desde o inicio porque
  -- descobrir a origem depois de ter mil linhas e impossivel.
  source text not null default 'lp-hausone',
  -- QUAL bloco da pagina converteu. E a unica medida de conversao que o
  -- formulario consegue dar sem ferramenta de analytics, e ela decide o que
  -- reescrever na pagina.
  placement text,

  status public.product_lead_status not null default 'new',
  contacted_at timestamptz,
  notes text,

  -- Quantas vezes o MESMO e-mail enviou. Segundo envio nao cria linha (unique
  -- em email, que e citext), e sem este contador o reenvio sumiria - e reenvio
  -- e sinal de interesse, nao ruido.
  submission_count int not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_leads_email_unique unique (email),

  -- citext torna a IGUALDADE case-insensitive, mas nao os operadores de regex
  -- (ver 0001): check de formato sobre citext usa ~*, nunca ~.
  constraint product_leads_email_format
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint product_leads_email_len check (char_length(email) <= 254),
  constraint product_leads_name_len check (name is null or char_length(name) <= 120),
  constraint product_leads_office_len check (office_name is null or char_length(office_name) <= 160),
  constraint product_leads_phone_len check (phone is null or char_length(phone) <= 40),
  constraint product_leads_notes_len check (notes is null or char_length(notes) <= 2000),

  -- Origem e bloco sao escritos pela pagina, nao digitados por ninguem. Formato
  -- fechado para que um erro de digitacao no HTML nao crie em silencio uma
  -- origem nova e divida a contagem em duas.
  constraint product_leads_source_format check (source ~ '^[a-z0-9-]{1,40}$'),
  constraint product_leads_placement_format
    check (placement is null or placement ~ '^[a-z0-9-]{1,40}$'),

  constraint product_leads_submission_count_positive check (submission_count >= 1),

  -- Lead ainda na fila nao tem data de contato. Sem isto, "Novo" com
  -- contacted_at preenchido passaria a existir e a tela teria que escolher em
  -- qual dos dois acreditar.
  constraint product_leads_new_has_no_contact
    check (status <> 'new' or contacted_at is null)
);

comment on table public.product_leads is
  'E-mail deixado na landing page do produto por quem quer comprar o sistema. NAO e tabela de negocio de escritorio: nao tem tenant_id, porque quem digitou aqui nao tem login nem escritorio (mesmo precedente da 0027). Guarda dado pessoal, e por isso a leitura tem policy e a policy exige public.is_platform_admin() - Diretor de escritorio que descubra a URL do painel le zero linha. INSERT nao tem policy alguma: quem grava e a edge function capture-lead com service_role, via public.capture_product_lead. UPDATE e so de status, contacted_at e notes, por GRANT de coluna: nem um admin da plataforma reescreve o e-mail que a pessoa digitou.';

comment on column public.product_leads.email is
  'citext: o mesmo e-mail em caixa diferente e o mesmo lead, e o unique cuida disso sem lower() espalhado por query.';

comment on column public.product_leads.placement is
  'Bloco da pagina onde o formulario foi enviado (hero, cta-final, ...). E a medida de conversao por bloco que o formulario da de graca.';

comment on column public.product_leads.submission_count is
  'Quantas vezes este e-mail enviou. O segundo envio nao cria linha; incrementa aqui. Reenvio e sinal de interesse.';

comment on column public.product_leads.contacted_at is
  'Quando a equipe do produto falou com a pessoa. Preenchido na tela, nunca pela pagina publica.';

create trigger product_leads_set_updated_at
  before update on public.product_leads
  for each row execute function public.set_updated_at();

-- A fila e lida em ordem de chegada invertida, e e a unica leitura que existe.
create index product_leads_created_at_idx on public.product_leads (created_at desc);

-- 5. A escrita, que vem de fora -----------------------------------------------

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
begin
  v_email := nullif(btrim(p_email), '')::extensions.citext;

  if v_email is null then
    raise exception 'capture_product_lead: e-mail obrigatorio'
      using errcode = '22023';
  end if;

  insert into public.product_leads as l
    (email, name, office_name, phone, source, placement)
  values (
    v_email,
    nullif(btrim(p_name), ''),
    nullif(btrim(p_office_name), ''),
    nullif(btrim(p_phone), ''),
    coalesce(nullif(btrim(p_source), ''), 'lp-hausone'),
    nullif(btrim(p_placement), '')
  )
  on conflict (email) do update
     set submission_count = l.submission_count + 1,
         -- O PRIMEIRO envio manda no cadastro; o reenvio so preenche o que
         -- estava vazio. Sem o coalesce, quem voltasse na pagina e enviasse so
         -- o e-mail apagaria o nome e o escritorio que ja havia dado.
         name        = coalesce(l.name, excluded.name),
         office_name = coalesce(l.office_name, excluded.office_name),
         phone       = coalesce(l.phone, excluded.phone);

  -- SEMPRE true, e nunca "ja existia". A pagina e publica: devolver a diferenca
  -- transformaria o formulario em um verificador de quais e-mails ja se
  -- cadastraram. Quem precisa saber que houve reenvio le submission_count na
  -- tela, com sessao.
  return true;
end;
$$;

comment on function public.capture_product_lead(text, text, text, text, text, text) is
  'Grava o lead da landing page. PARAMETRO NOMEADO, e nao jsonb, de proposito: status, submission_count, created_at e id nao tem caminho de entrada pelo corpo da requisicao - nem hoje, nem no dia em que alguem acrescentar um campo no formulario. E-mail repetido nao cria linha: incrementa submission_count e preenche apenas os campos que estavam vazios (o primeiro envio manda no cadastro). Devolve SEMPRE true, inclusive para e-mail ja cadastrado - a diferenca transformaria uma pagina publica em verificador de e-mail cadastrado. E-mail em branco levanta 22023; formato invalido e recusado pelo check da tabela (23514). So service_role executa: com EXECUTE para anon, a tabela viraria porta de escrita anonima sem o limite de requisicoes na frente.';

revoke all on function public.capture_product_lead(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.capture_product_lead(text, text, text, text, text, text)
  to service_role;

-- 6. RLS da fila --------------------------------------------------------------
--
-- Os dois lados da tranca, escritos a mao (docs/ARCHITECTURE.md: GRANT sem RLS
-- entrega a tabela, RLS sem GRANT ja nega, e o bootstrap do Supabase ja
-- concedeu por tras uma vez neste projeto - migration 0007).

alter table public.product_leads enable row level security;

revoke all on table public.product_leads from anon, authenticated;

grant select on table public.product_leads to authenticated;

-- GRANT DE COLUNA, e nao de tabela: RLS nao tem granularidade de coluna, e sem
-- isto a policy de UPDATE deixaria um admin da plataforma reescrever o e-mail,
-- a origem e o contador. O que a tela mexe sao tres campos, e e isso que o
-- privilegio descreve.
grant update (status, contacted_at, notes) on table public.product_leads to authenticated;

create policy product_leads_select_platform
  on public.product_leads
  for select
  to authenticated
  using ((select public.is_platform_admin()));

comment on policy product_leads_select_platform on public.product_leads is
  'A fila e da equipe do produto. Colaborador de escritorio - inclusive Diretor - nao casa esta clausula e le zero linha, mesmo com a URL do painel na mao. E-mail de arquiteto que nao e cliente de ninguem nao e dado de escritorio.';

create policy product_leads_update_platform
  on public.product_leads
  for update
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

comment on policy product_leads_update_platform on public.product_leads is
  'Marcar como contatado e anotar o que foi conversado. O WITH CHECK repete a condicao para a linha nao poder sair do alcance de quem a editou. Quais COLUNAS podem mudar nao e assunto de policy: isso esta no grant update (status, contacted_at, notes).';

-- INSERT e DELETE nao tem policy, e isso nao e omissao: com RLS ligada, comando
-- sem policy e negado. INSERT e da edge function, com service_role. DELETE nao
-- existe de proposito - lead some por pedido de exclusao da pessoa, que e ato
-- deliberado no painel da Supabase, e nao por clique numa tela.
