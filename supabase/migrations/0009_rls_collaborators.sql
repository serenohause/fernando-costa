-- Modulo 1 (Fundacao) - RLS de collaborators.
--
-- Matriz de docs/SCHEMA-PLAN.md:
--   le: qualquer colaborador active do tenant | escreve: Diretor e Administrativo
--
-- A tabela e a raiz da autorizacao do sistema: e nela que mora a funcao de
-- negocio (role) e o status que public.is_active_collaborator() consulta. Por
-- isso ela precisa de mais do que "quem escreve e o gestor" - precisa que o
-- gestor nao consiga usar a propria permissao de escrita para virar outra
-- pessoa. Ver o trigger no fim do arquivo.

alter table public.collaborators enable row level security;

grant select, insert, update, delete on table public.collaborators to authenticated;

create policy collaborators_select_tenant
  on public.collaborators
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy collaborators_select_tenant on public.collaborators is
  'Todo colaborador active enxerga a equipe do proprio escritorio - a tela de Equipe e o seletor de coordenador/responsavel dependem disso. Colaborador em Ferias ou Afastado, e usuario logado sem colaborador (convite nao aceito), nao enxergam linha nenhuma: is_active_collaborator() e falso para os dois.';

create policy collaborators_insert_manager
  on public.collaborators
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
  );

comment on policy collaborators_insert_manager on public.collaborators is
  'WITH CHECK amarra tenant_id ao claim do JWT: sem isso, um Diretor legitimo poderia cadastrar colaborador no escritorio de outra pessoa mandando um tenant_id diferente no corpo do POST - escrita cruzada que a policy de SELECT nao pega, porque SELECT nao roda no INSERT.';

create policy collaborators_update_manager
  on public.collaborators
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

comment on policy collaborators_update_manager on public.collaborators is
  'USING define quais linhas podem ser alteradas (as do proprio escritorio); WITH CHECK define como elas podem ficar depois. Os dois sao obrigatorios: so com USING, um gestor poderia pegar uma linha do proprio tenant e reescrever tenant_id para outro escritorio, empurrando a linha para fora do alcance dele e para dentro do alcance de terceiros.';

create policy collaborators_delete_manager
  on public.collaborators
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
    and id is distinct from (select public.auth_collaborator_id())
  );

comment on policy collaborators_delete_manager on public.collaborators is
  'Gestor nao apaga a propria linha. Nao e zelo com o usuario: apagar a propria linha de colaborador cascateia collaborator_permissions e derruba is_active_collaborator(), deixando o escritorio potencialmente sem nenhum Diretor e sem caminho de volta pelo cliente. Remover o ultimo gestor passa a ser operacao server-side, consciente.';

-- Trigger anti-escalacao ----------------------------------------------------
--
-- A matriz diz "Diretor e Administrativo escrevem collaborators". Tomada ao pe
-- da letra, ela abre tres caminhos para um Administrativo virar Diretor sem
-- que ninguem aprove, todos usando apenas a permissao que ele ja tem:
--
--   1. UPDATE na propria linha trocando role para 'director'.
--   2. INSERT de uma linha nova com role='director' e user_id = o proprio uid.
--   3. UPDATE limpando o user_id da propria linha e, em seguida, colando esse
--      mesmo user_id na linha de um Diretor existente. Os dois passos sao
--      individualmente legitimos, e o unique parcial (tenant_id, user_id) nao
--      impede - ele so barra o atalho de fazer isso em um passo so.
--
-- Nenhum desses casos e expressavel em policy: WITH CHECK nao enxerga a linha
-- antiga, e USING nao enxerga a nova. A comparacao OLD x NEW exige trigger.
--
-- O trigger nao vale para service_role: as edge functions manage-collaborator
-- e approve-access-request precisam justamente promover e vincular gente, e
-- fazem isso depois de conferir quem esta chamando. A barreira aqui e contra o
-- cliente, que nao tem essa conferencia.

create or replace function public.guard_collaborator_self_service()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if current_user = 'service_role' then
    return new;
  end if;

  v_uid := (select auth.uid());

  if v_uid is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id = v_uid then
      raise exception 'collaborator_self_link_denied'
        using errcode = '42501',
              hint = 'Vincular um usuario a uma linha de colaborador e operacao server-side (edge function com service_role).';
    end if;
    return new;
  end if;

  if old.user_id = v_uid then
    if new.role is distinct from old.role then
      raise exception 'collaborator_self_role_change_denied'
        using errcode = '42501',
              hint = 'Ninguem altera a propria funcao de negocio pelo cliente, nem para cima nem para baixo.';
    end if;

    if new.user_id is distinct from old.user_id then
      raise exception 'collaborator_self_unlink_denied'
        using errcode = '42501',
              hint = 'Desvincular o proprio usuario e o primeiro passo do sequestro de outra linha de colaborador.';
    end if;
  elsif new.user_id = v_uid then
    raise exception 'collaborator_self_link_denied'
      using errcode = '42501',
            hint = 'Vincular um usuario a uma linha de colaborador e operacao server-side (edge function com service_role).';
  end if;

  return new;
end;
$$;

comment on function public.guard_collaborator_self_service() is
  'Fecha a escalacao de privilegio que a policy de escrita de collaborators nao consegue expressar: mudar a propria role, criar/apropriar-se de uma linha vinculando-a ao proprio auth.uid(), ou desvincular a propria linha para depois sequestrar a de um Diretor. Inerte para service_role e para conexao sem JWT (migration, SQL editor), porque ali a autorizacao e checada antes, no codigo da edge function. errcode 42501 para o PostgREST devolver 403 e a UI conseguir distinguir de erro de validacao.';

create trigger collaborators_guard_self_service
  before insert or update on public.collaborators
  for each row execute function public.guard_collaborator_self_service();
