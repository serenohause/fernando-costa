-- Modulo 1 (Fundacao) - aprovacao de solicitacao de acesso, em uma transacao.
--
-- Porta a segunda metade de base44/functions/aprovarColaborador. No original a
-- edge function faz quatro chamadas independentes ao SDK - cria o colaborador,
-- semeia as permissoes, atualiza a solicitacao, manda o e-mail - e qualquer uma
-- delas pode falhar sozinha. O resultado possivel la e o pior de todos:
-- colaborador criado, permissoes pela metade e solicitacao ainda pendente, com
-- a fila de aprovacao mostrando alguem que ja tem cadastro. A tela nao sabe
-- representar esse estado e nao ha caminho de volta pelo cliente.
--
-- Aqui os tres efeitos vivem em uma funcao, ou seja, em uma transacao: ou o
-- colaborador existe com as permissoes semeadas e a solicitacao aprovada, ou
-- nada aconteceu. A edge function approve-access-request faz uma unica chamada
-- a esta funcao.
--
-- SECURITY DEFINER por dois motivos, nao um:
--   1. le auth.users para descobrir se ja existe login com aquele e-mail. Nao
--      da para fazer isso pela Data API - o schema auth nao e exposto, e listar
--      usuarios pela admin API para achar um e-mail e varredura paginada.
--   2. escreve em access_requests, que tem RLS ligada e nenhuma policy de
--      escrita (migration 0011).
--
-- A autorizacao NAO fica a cargo do chamador. A edge function ja confere que
-- quem chama e Diretor ativo do mesmo tenant e devolve 403, mas a checagem e
-- repetida aqui dentro, depois do FOR UPDATE na solicitacao: entre a leitura da
-- edge function e a escrita, o Diretor pode ter sido rebaixado ou afastado.
-- Uma funcao SECURITY DEFINER que confia na autorizacao de quem a chama e uma
-- escalacao de privilegio esperando um bug do lado de fora.

create or replace function public.approve_access_request(
  p_request_id uuid,
  p_approver_user_id uuid,
  p_name text,
  p_role public.collaborator_role,
  p_area public.collaborator_area default null,
  p_coordinator_id uuid default null,
  p_weekly_hours numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.access_requests;
  v_approver public.collaborators;
  v_collaborator public.collaborators;
  v_auth_user_id uuid;
  v_created boolean;
  v_permissions_seeded integer;
begin
  -- FOR UPDATE serializa duas aprovacoes simultanas da mesma solicitacao: a
  -- segunda espera, encontra status <> 'pending' e para. Sem ele, as duas
  -- passariam pelo teste de status e a segunda reescreveria o colaborador.
  select * into v_request
  from public.access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = 'P0001';
  end if;

  select * into v_approver
  from public.collaborators
  where tenant_id = v_request.tenant_id
    and user_id = p_approver_user_id;

  if not found or v_approver.status <> 'active' or v_approver.role <> 'director' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Vinculo com o login, quando ele ja existe. E o caso de quem se cadastrou,
  -- caiu na tela de acesso pendente e so agora foi aprovado: o usuario do Auth
  -- ja esta la, esperando a linha de colaborador.
  select u.id into v_auth_user_id
  from auth.users u
  where lower(u.email) = lower(v_request.email::text)
    and u.deleted_at is null
  order by u.created_at
  limit 1;

  if v_auth_user_id is not null and exists (
    select 1
    from public.collaborators c
    where c.tenant_id = v_request.tenant_id
      and c.user_id = v_auth_user_id
      and c.email <> v_request.email
  ) then
    raise exception 'user_already_linked' using errcode = 'P0001';
  end if;

  select * into v_collaborator
  from public.collaborators
  where tenant_id = v_request.tenant_id
    and email = v_request.email;

  if found then
    -- Reativacao. Os campos vem inteiros do formulario, como no original
    -- (spread de collaboratorData + status Ativo): area, coordenador e carga
    -- horaria sao sobrescritos pelo que a tela mandou, inclusive para nulo.
    -- coalesce apenas em user_id, porque desvincular um login em silencio
    -- deixaria a pessoa sem acesso sem ninguem pedir isso.
    update public.collaborators
    set name = p_name,
        role = p_role,
        area = p_area,
        coordinator_id = p_coordinator_id,
        weekly_hours = p_weekly_hours,
        status = 'active',
        user_id = coalesce(v_auth_user_id, user_id)
    where id = v_collaborator.id
    returning * into v_collaborator;

    v_created := false;
  else
    insert into public.collaborators (
      tenant_id, user_id, name, role, area, email, coordinator_id, status, weekly_hours
    )
    values (
      v_request.tenant_id, v_auth_user_id, p_name, p_role, p_area, v_request.email,
      p_coordinator_id, 'active', p_weekly_hours
    )
    returning * into v_collaborator;

    v_created := true;
  end if;

  -- Sem linha em tenant_users o proximo JWT sai sem app_metadata.tenant_id
  -- (migration 0006) e a RLS nao devolve nada: o colaborador aprovado entraria
  -- e veria o sistema vazio. Papel de plataforma nasce 'member'.
  if v_auth_user_id is not null then
    insert into public.tenant_users (tenant_id, user_id, role)
    values (v_request.tenant_id, v_auth_user_id, 'member')
    on conflict (tenant_id, user_id) do nothing;
  end if;

  -- Semeia a matriz de permissoes em falso, como o original. A diferenca e a
  -- origem da lista: la sao 14 rotulos escritos a mao dentro da funcao, que
  -- ficam desatualizados no dia em que uma tela nova entra e ninguem lembra de
  -- editar a edge function. Aqui a lista sai da propria tabela menus.
  --
  -- Agrupador nao recebe permissao: e a linha referenciada como parent_key por
  -- alguma outra ('financial' e 'team_group' hoje). A sidebar exibe o grupo
  -- quando algum filho tem can_view, entao dar permissao a ele seria um estado
  -- que nenhuma tela le. O criterio e estrutural de proposito - chave nova que
  -- vire agrupador amanha ja entra certa, sem tocar nesta funcao.
  insert into public.collaborator_permissions (
    tenant_id, collaborator_id, menu_key, can_view, can_edit
  )
  select v_request.tenant_id, v_collaborator.id, m.key, false, false
  from public.menus m
  where not exists (
    select 1 from public.menus child where child.parent_key = m.key
  )
  on conflict (collaborator_id, menu_key) do nothing;

  get diagnostics v_permissions_seeded = row_count;

  update public.access_requests
  set status = 'approved',
      decided_by = v_approver.id,
      decided_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'collaboratorId', v_collaborator.id,
    'tenantId', v_collaborator.tenant_id,
    'created', v_created,
    'linkedUserId', v_collaborator.user_id,
    'permissionsSeeded', v_permissions_seeded,
    'decidedBy', v_approver.id
  );
end;
$$;

comment on function public.approve_access_request(uuid, uuid, text, public.collaborator_role, public.collaborator_area, uuid, numeric) is
  'Aprova uma solicitacao de acesso em uma unica transacao: cria ou reativa o colaborador, vincula o usuario do Auth quando ja existe login com aquele e-mail, garante o vinculo em tenant_users, semeia collaborator_permissions em falso para todo menu que nao seja agrupador e marca a solicitacao como approved com decided_by/decided_at. Reconfere a autorizacao (Diretor active do mesmo tenant) por dentro, depois do FOR UPDATE, para nao depender de quem chama. Executavel apenas por service_role, a partir da edge function approve-access-request. Erros de negocio saem como P0001 com mensagem estavel: request_not_found, request_not_pending, not_authorized, user_already_linked.';

revoke all on function public.approve_access_request(uuid, uuid, text, public.collaborator_role, public.collaborator_area, uuid, numeric) from public, anon, authenticated;
grant execute on function public.approve_access_request(uuid, uuid, text, public.collaborator_role, public.collaborator_area, uuid, numeric) to service_role;
