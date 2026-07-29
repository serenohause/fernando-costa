-- Modulo 1 (Fundacao) - raiz da hierarquia multitenant.
--
-- tenants nao tem tenant_id (e a propria raiz) e nao tem legacy_id: a tabela
-- nao existe no base44, que e single-tenant. O mesmo vale para tenant_users e
-- tenant_email_domains - sao estruturas novas da migracao, sem contraparte no
-- sistema de origem, entao nao ha id legado para reconciliar.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status public.tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_key unique (slug),
  constraint tenants_slug_format_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tenants_name_not_blank_check check (btrim(name) <> '')
);

comment on table public.tenants is
  'Um escritorio de arquitetura. Raiz da hierarquia multitenant: todo dado de negocio pertence a exatamente um tenant e nunca atravessa a fronteira.';
comment on column public.tenants.slug is
  'Identificador estavel usado em URL e em log. Formato kebab-case ASCII garantido por check, para nunca precisar de escape.';

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- tenant_users: relacao auth.users <-> tenants. E a UNICA tabela lida fora da
-- RLS - o hook de access token (migration 0006) le daqui para escrever o claim
-- tenant_id no JWT. Depois disso, nenhuma policy do sistema consulta esta
-- tabela: o claim e a fonte. Subquery em tenant_users dentro de policy geraria
-- N+1 dentro da propria RLS.

create table public.tenant_users (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_users_pkey primary key (tenant_id, user_id)
);

comment on table public.tenant_users is
  'Vinculo entre usuario do Supabase Auth e tenant. Lida apenas pelo hook custom_access_token_hook para popular o claim tenant_id no JWT; policies usam o claim, nunca esta tabela.';
comment on column public.tenant_users.role is
  'Papel de plataforma (owner/member). A funcao de negocio do usuario no escritorio esta em collaborators.role.';

-- PK e (tenant_id, user_id) para deixar a porta aberta a multiplos tenants por
-- usuario sem migration. O hook, porem, busca por user_id sozinho - dai o
-- indice dedicado, que a PK nao cobre.
create index tenant_users_user_id_idx on public.tenant_users (user_id);

create trigger tenant_users_set_updated_at
  before update on public.tenant_users
  for each row execute function public.set_updated_at();

-- tenant_email_domains: resolve o tenant no primeiro contato, antes de existir
-- qualquer vinculo. Quem faz login e ainda nao esta em tenant_users nao tem
-- tenant_id no JWT e, por isso, nao consegue nem gravar a solicitacao de
-- acesso. O dominio do e-mail e o que quebra esse ovo-e-galinha: a edge
-- function register-access-request (service_role) resolve o tenant por aqui e
-- grava a linha. E-mail de dominio desconhecido e recusado sem criar nada.

create table public.tenant_email_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  domain extensions.citext not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_email_domains_domain_key unique (domain),
  -- Regex case-insensitive de proposito: citext torna a IGUALDADE
  -- case-insensitive, mas nao os operadores de regex - com "~" o check
  -- recusaria "FernandoCosta.arq.br", que e o mesmo dominio que o indice
  -- unico ja considera duplicado.
  constraint tenant_email_domains_domain_format_check
    check (domain ~* '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

comment on table public.tenant_email_domains is
  'Mapeia dominio de e-mail -> tenant, para descobrir o escritorio de quem ainda nao tem claim no JWT.';
comment on column public.tenant_email_domains.domain is
  'Dominio sem @ (ex: fernandocosta.arq.br). Unico globalmente, e nao por tenant: um mesmo dominio resolvendo dois escritorios tornaria a descoberta ambigua e o roteamento do pedido de acesso, indefinido. citext porque dominio nao diferencia maiuscula.';

create index tenant_email_domains_tenant_id_domain_idx
  on public.tenant_email_domains (tenant_id, domain);

create trigger tenant_email_domains_set_updated_at
  before update on public.tenant_email_domains
  for each row execute function public.set_updated_at();
