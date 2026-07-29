-- Modulo 1 (Fundacao) - fecha a Data API e cria os helpers de autorizacao.
--
-- ACHADO QUE MOTIVA A PRIMEIRA METADE DESTA MIGRATION
--
-- A migration 0006 registrou que as tabelas da fundacao nasceriam
-- "inalcancaveis pela Data API de proposito - sem GRANT, nao ha o que vazar
-- antes de as policies existirem". Isso nao era verdade no projeto hospedado.
--
-- O bootstrap do Supabase deixa um DEFAULT PRIVILEGE pendurado no papel
-- postgres para o schema public:
--
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--
-- Como as migrations sao aplicadas pelo papel postgres, TODA tabela criada em
-- public por 0002-0005 recebeu automaticamente arwdDxtm (select, insert,
-- update, delete, truncate, references, trigger) para anon e authenticated.
-- Verificado no banco antes desta migration, com a chave publicavel:
--
--   GET  /rest/v1/tenants                  -> 200 []
--   GET  /rest/v1/collaborators            -> 200 []
--   GET  /rest/v1/menus                    -> 200 [18 linhas]
--   POST /rest/v1/tenants                  -> 23514 (check violado, ou seja,
--                                             o INSERT tinha privilegio)
--   DELETE /rest/v1/tenants                -> 204
--   PATCH  /rest/v1/menus                  -> 204
--
-- Ou seja: com a chave publicavel, que por definicao vive no bundle do
-- frontend, qualquer pessoa na internet podia ler e escrever em tenants,
-- tenant_email_domains, collaborators, menus, collaborator_permissions e
-- access_requests. Nada vazou apenas porque o banco ainda esta vazio. A unica
-- tabela protegida era tenant_users, e so porque a 0006 fez um revoke
-- explicito nela.
--
-- O conserto tem duas partes, e as duas importam:
--   1. Revogar o que ja foi concedido (privilegio existente nao some sozinho).
--   2. Desarmar o DEFAULT PRIVILEGE, para que a tabela do modulo 2 - e a do 3,
--      e a do 10 - nasca fechada de verdade, e a unica forma de expo-la seja um
--      GRANT escrito a mao ao lado da policy. Fail-closed: esquecer o grant
--      passa a dar "permission denied", que aparece no primeiro teste;
--      esquecer a policy passava a expor a tabela inteira, que nao aparece em
--      teste nenhum.

-- 1. Revoga o que ja foi concedido -----------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- 2. Desarma o default privilege para as proximas tabelas ------------------
--
-- Dentro de DO/EXECUTE porque ALTER DEFAULT PRIVILEGES FOR ROLE postgres exige
-- ser membro de postgres, e em projeto hospedado quem aplica a migration nem
-- sempre e. Falhar aqui nao pode derrubar o push - mas tambem nao pode passar
-- em silencio, dai o RAISE WARNING com o comando a rodar a mao.
do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated';
exception when insufficient_privilege then
  raise warning 'DEFAULT PRIVILEGES nao desarmado: tabela nova em public continuara nascendo com GRANT ALL para anon e authenticated. Rodar como postgres: alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;';
end
$$;

-- service_role mantem tudo de proposito: e o bypass server-side (Edge
-- Functions), e a chave dele nunca sai do servidor.

-- 3. Helpers de autorizacao ------------------------------------------------
--
-- Complementam public.auth_tenant_id() e public.is_active_collaborator() da
-- 0006. Todos SECURITY DEFINER pelo mesmo motivo daquelas: consultam
-- collaborators, e a RLS de collaborators chama estas funcoes - sem definer o
-- par vira recursao infinita. O dono (postgres) nao sofre RLS porque
-- collaborators NAO usa FORCE ROW LEVEL SECURITY, e nao pode passar a usar sem
-- quebrar isto.
--
-- Nenhum deles consulta tenant_users: o claim do JWT e a fonte do tenant.

create or replace function public.auth_collaborator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.collaborators c
  where c.user_id = (select auth.uid())
    and c.tenant_id = public.auth_tenant_id()
    and c.status = 'active'
  limit 1;
$$;

comment on function public.auth_collaborator_id() is
  'Id do colaborador do usuario logado, no tenant do JWT, e apenas se estiver active. Retorna null para quem nao tem colaborador, esta em outro tenant ou esta em Ferias/Afastado - e null nunca casa em igualdade, entao a policy que compara collaborator_id com este valor nao devolve linha alguma nesses casos. LIMIT 1 e seguro: collaborators tem unique parcial (tenant_id, user_id).';

create or replace function public.auth_collaborator_role()
returns public.collaborator_role
language sql
stable
security definer
set search_path = ''
as $$
  select c.role
  from public.collaborators c
  where c.user_id = (select auth.uid())
    and c.tenant_id = public.auth_tenant_id()
    and c.status = 'active'
  limit 1;
$$;

comment on function public.auth_collaborator_role() is
  'Funcao de negocio (director, coordinator, admin_staff, finance, architect, intern) do usuario logado, ou null se ele nao for colaborador active do tenant do JWT. Existe para os modulos seguintes, que recortam leitura por funcao (Financeiro ve recebiveis, Arquiteto ve so o que e dele).';

create or replace function public.is_tenant_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_collaborator_role() in ('director', 'admin_staff');
$$;

comment on function public.is_tenant_manager() is
  'Quem administra a equipe do escritorio: Diretor e Administrativo, conforme a matriz de RLS de docs/SCHEMA-PLAN.md. Ja embute o filtro de status active e de tenant, porque auth_collaborator_role() embute. Retorna null (nao false) quando nao ha colaborador - em policy null e tratado como falso, que e o resultado desejado.';

revoke all on function public.auth_collaborator_id() from public, anon;
revoke all on function public.auth_collaborator_role() from public, anon;
revoke all on function public.is_tenant_manager() from public, anon;

grant execute on function public.auth_collaborator_id() to authenticated, service_role;
grant execute on function public.auth_collaborator_role() to authenticated, service_role;
grant execute on function public.is_tenant_manager() to authenticated, service_role;
