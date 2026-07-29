-- Modulo 1 (Fundacao) - RLS de menus e collaborator_permissions.
--
-- Matriz de docs/SCHEMA-PLAN.md:
--   menus                     le: qualquer autenticado | escreve: ninguem
--   collaborator_permissions  le: o colaborador ve as suas, Diretor e
--                                 Administrativo veem todas
--                             escreve: Diretor e Administrativo

-- menus ---------------------------------------------------------------------
--
-- Desvio consciente da matriz: "qualquer autenticado" vira "qualquer
-- colaborador active". A regra transversal do sistema - status <> active nao
-- le NADA em nenhum modulo - e mais forte do que a linha da matriz, e o
-- SCHEMA-PLAN a lista como teste obrigatorio ("colaborador Afastado nao le
-- nada"). Deixar menus de fora abriria a unica excecao a uma invariante que
-- todos os modulos seguintes vao herdar.
--
-- O desvio nao custa tela: quem nao e colaborador active nao renderiza
-- sidebar, renderiza a tela de acesso pendente. E aperta, nao afrouxa.

alter table public.menus enable row level security;

grant select on table public.menus to authenticated;

create policy menus_select_active_collaborator
  on public.menus
  for select
  to authenticated
  using ((select public.is_active_collaborator()));

comment on policy menus_select_active_collaborator on public.menus is
  'Catalogo de telas do produto, sem tenant_id e sem dado de cliente - o filtro aqui e so a regra transversal de colaborador active. Sem INSERT/UPDATE/DELETE: linha nova entra por migration, junto com a tela que ela representa. Antes desta migration a tabela estava com GRANT ALL para anon e sem RLS, ou seja, qualquer um podia reescrever os rotulos da sidebar de todos os escritorios.';

-- collaborator_permissions --------------------------------------------------

alter table public.collaborator_permissions enable row level security;

grant select, insert, update, delete on table public.collaborator_permissions to authenticated;

create policy collaborator_permissions_select_own_or_manager
  on public.collaborator_permissions
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (
      collaborator_id = (select public.auth_collaborator_id())
      or (select public.is_tenant_manager())
    )
  );

comment on policy collaborator_permissions_select_own_or_manager on public.collaborator_permissions is
  'Cada colaborador le as proprias permissoes (a sidebar depende disso); Diretor e Administrativo leem as de todo o escritorio (a tela de Controle de Acesso depende disso). O ramo "as minhas" nao precisa de checagem de status separada: auth_collaborator_id() ja retorna null para quem nao esta active, e igualdade com null nao devolve linha.';

create policy collaborator_permissions_insert_manager
  on public.collaborator_permissions
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
  );

create policy collaborator_permissions_update_manager
  on public.collaborator_permissions
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
  );

create policy collaborator_permissions_delete_manager
  on public.collaborator_permissions
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
  );

comment on policy collaborator_permissions_insert_manager on public.collaborator_permissions is
  'So Diretor e Administrativo escrevem permissao, e so dentro do proprio escritorio. Um Arquiteto nao consegue nem se auto-conceder can_view: a policy de escrita nao olha de quem e a linha, olha quem esta escrevendo. A FK composta (collaborator_id, tenant_id) fecha o resto - permissao para colaborador de outro escritorio nem chega a ser avaliada pela RLS, morre na integridade referencial.';

comment on policy collaborator_permissions_update_manager on public.collaborator_permissions is
  'WITH CHECK repete o predicado do USING por um motivo pratico: sem ele, um gestor poderia reescrever tenant_id da linha e joga-la para outro escritorio. A FK composta com collaborators barraria esse caso especifico, mas depender da FK para fazer o trabalho da RLS e fragil - a policy tem que se sustentar sozinha.';
