-- Modulo 1 (Fundacao) - RLS de tenants, tenant_users e tenant_email_domains.
--
-- Matriz de docs/SCHEMA-PLAN.md:
--   tenants               le: membros do tenant   | escreve: so service_role
--   tenant_users          le: a propria linha     | escreve: so service_role
--   tenant_email_domains  nao esta na matriz      | so service_role, ver abaixo
--
-- Padrao usado em todas as policies deste modulo, e que vale para os proximos:
--   - `to authenticated` explicito. Policy sem papel alvo vale para PUBLIC, o
--     que inclui anon; se um GRANT indevido aparecer amanha, a policy nao vira
--     a porta de entrada.
--   - Chamada de funcao embrulhada em (select ...) para o planejador avaliar
--     uma vez por query (InitPlan) e nao uma vez por linha.
--   - Nenhuma subquery em tenant_users. O claim app_metadata.tenant_id do JWT,
--     lido por public.auth_tenant_id(), e a unica fonte de tenant.
--   - Ausencia de policy e uma decisao, nao um esquecimento: com RLS ligada,
--     tabela sem policy para um comando nega aquele comando para todo mundo
--     que nao seja service_role.

-- tenants -------------------------------------------------------------------

alter table public.tenants enable row level security;

grant select on table public.tenants to authenticated;

create policy tenants_select_own_tenant
  on public.tenants
  for select
  to authenticated
  using (
    id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy tenants_select_own_tenant on public.tenants is
  'O escritorio so e visivel para quem e colaborador active dele. Sem INSERT/UPDATE/DELETE: criar, suspender ou renomear escritorio e operacao de plataforma, feita server-side com service_role, nunca pelo cliente.';

-- tenant_users --------------------------------------------------------------
--
-- A 0006 revogou os privilegios desta tabela e concedeu SELECT so ao
-- supabase_auth_admin, para o hook de access token. A RLS ligada aqui nao
-- atrapalha o hook: custom_access_token_hook e SECURITY DEFINER com dono
-- postgres, e o dono nao sofre RLS enquanto a tabela nao usar FORCE ROW LEVEL
-- SECURITY - que ela nao usa, e nao pode passar a usar sem quebrar o login.

alter table public.tenant_users enable row level security;

grant select on table public.tenant_users to authenticated;

create policy tenant_users_select_self
  on public.tenant_users
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy tenant_users_select_self on public.tenant_users is
  'A propria linha de vinculo, e nada mais - nem as dos colegas do mesmo escritorio, que revelariam quem tem papel owner. O SCHEMA-PLAN diz "o proprio usuario ve a sua linha"; aqui isso vem com o filtro de colaborador active por causa da regra transversal do sistema (status <> active nao le nada). E restricao a mais, nao a menos, e nao custa funcionalidade: tenant_id e tenant_role ja viajam no proprio JWT, entao o cliente nunca precisa desta tabela para saber a que escritorio pertence.';

-- tenant_email_domains ------------------------------------------------------
--
-- RLS ligada e ZERO policy, de proposito. A tabela existe para a edge function
-- register-access-request (service_role) resolver o tenant pelo dominio do
-- e-mail de quem ainda nao tem claim no JWT. Expo-la ao cliente entregaria de
-- graca a lista de dominios corporativos atendidos pela plataforma - insumo
-- direto para enumerar escritorios e para phishing dirigido - sem habilitar
-- nenhuma tela. Quem precisa dela roda server-side.

alter table public.tenant_email_domains enable row level security;

comment on table public.tenant_email_domains is
  'Mapeia dominio de e-mail -> tenant, para descobrir o escritorio de quem ainda nao tem claim no JWT. RLS ligada sem nenhuma policy e sem grant para anon/authenticated: alcancavel apenas por service_role, dentro da edge function register-access-request.';
