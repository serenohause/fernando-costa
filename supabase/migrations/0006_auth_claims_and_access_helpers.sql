-- Modulo 1 (Fundacao) - claim de tenant no JWT e helpers de autorizacao.
--
-- Ponto central do modelo multitenant: o tenant_id do usuario logado viaja no
-- JWT, escrito por este hook no momento em que o token e emitido. tenant_users
-- e lida UMA vez, aqui. Nenhuma policy do sistema consulta tenant_users -
-- fazer isso significaria uma subquery por linha avaliada, ou seja, N+1 dentro
-- da propria RLS.

-- 1. Leitura do claim ------------------------------------------------------

create or replace function public.auth_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

comment on function public.auth_tenant_id() is
  'tenant_id do usuario logado, lido do claim app_metadata.tenant_id do JWT. Retorna null para quem nao esta vinculado a nenhum escritorio - e null nunca casa com tenant_id (not null) em comparacao, entao esse usuario simplesmente nao enxerga linha alguma.';

-- 2. Hook que escreve o claim ---------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_app_metadata jsonb;
  v_tenant_id uuid;
  v_tenant_role public.tenant_role;
begin
  select tu.tenant_id, tu.role
    into v_tenant_id, v_tenant_role
  from public.tenant_users tu
  where tu.user_id = (event ->> 'user_id')::uuid
  order by tu.created_at
  limit 1;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_metadata := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  if v_tenant_id is null then
    v_app_metadata := (v_app_metadata - 'tenant_id') - 'tenant_role';
  else
    v_app_metadata := v_app_metadata || jsonb_build_object(
      'tenant_id', v_tenant_id,
      'tenant_role', v_tenant_role
    );
  end if;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_metadata);

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Auth Hook de custom access token: le tenant_users e grava tenant_id e tenant_role em app_metadata do JWT. Remove os dois claims quando o usuario nao tem vinculo, para que um token novo nunca herde tenant de um vinculo revogado. SECURITY DEFINER de proposito: precisa enxergar tenant_users mesmo depois de a RLS ser ligada nela, sem que o hook vire refem de uma policy. LIMIT 1 porque nesta fase um usuario pertence a um escritorio - a PK composta de tenant_users ja deixa a porta aberta para varios, e o dia em que isso acontecer este hook precisa ganhar um criterio de escolha explicito, nao "o mais antigo".';

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.tenant_users to supabase_auth_admin;
revoke all on table public.tenant_users from authenticated, anon;

-- 3. Helper de autorizacao usado por toda a RLS do sistema -----------------

create or replace function public.is_active_collaborator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.collaborators c
    where c.user_id = (select auth.uid())
      and c.tenant_id = public.auth_tenant_id()
      and c.status = 'active'
  );
$$;

comment on function public.is_active_collaborator() is
  'Regra transversal do sistema: so colaborador com status active, no tenant do JWT, le qualquer coisa. Usada por todas as policies de todos os modulos, nao so os da fundacao. SECURITY DEFINER e obrigatorio aqui - a funcao consulta collaborators, e a RLS de collaborators vai chamar esta funcao; sem definer o par vira recursao infinita. Colaborador em Ferias ou Afastado, e usuario sem colaborador (convite nao aceito), retornam false.';

grant execute on function public.auth_tenant_id() to authenticated, anon, service_role;
grant execute on function public.is_active_collaborator() to authenticated, anon, service_role;

-- ATENCAO, rls-guardian: esta migration NAO liga RLS e NAO concede privilegio
-- de tabela para anon/authenticated em nenhuma das tabelas da fundacao. Elas
-- nascem inalcancaveis pela Data API de proposito - sem GRANT, nao ha o que
-- vazar antes de as policies existirem. Ao escrever as policies, cada tabela
-- precisa das duas coisas: ALTER TABLE ... ENABLE ROW LEVEL SECURITY e os
-- GRANTs correspondentes. So policy, sem grant, resulta em "permission denied
-- for table"; so grant, sem policy e sem RLS, libera a tabela inteira.
