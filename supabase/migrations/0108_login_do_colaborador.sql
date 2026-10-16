-- Criar o login do colaborador junto com o cadastro, com senha provisoria.
--
-- O PEDIDO
--   "Deveria ter como setar uma senha provisoria nesse campo e ja criar o login
--   do colaborador."
--
-- O QUE EXISTIA
--   O modulo Equipe grava uma linha em `collaborators` e so. `user_id` fica nulo
--   ate alguem ligar um login, e o unico caminho de ligacao era a aprovacao de
--   solicitacao de acesso (0013), que depende de a pessoa JA ter conta no Auth.
--   Quem nunca entrou ficava como cadastro de equipe sem acesso nenhum, e a
--   criacao da conta era feita por script, fora do sistema.
--
--   O original resolvia isso com a coluna `Collaborator.senha_temporaria`, em
--   TEXTO PURO. Isso esta fora de escopo desde o docs/ARCHITECTURE.md e continua
--   fora: a senha digitada aqui vai para o Auth do Supabase, que guarda hash, e
--   nao encosta em `collaborators`.
--
-- A DIVISAO DE TRABALHO
--   Criar usuario com senha exige a Admin API (o hash e feito la), que nao tem
--   equivalente em SQL. Entao a edge function `create-collaborator-login` cria
--   ou atualiza o usuario no Auth, e esta funcao faz a parte do banco: conferir
--   quem pediu, ligar o login ao colaborador e abrir o vinculo de escritorio.
--   E a mesma divisao da 0013 — e, como la, a AUTORIZACAO E CONFERIDA AQUI
--   DENTRO, depois de a edge function ja ter conferido do lado dela: uma funcao
--   SECURITY DEFINER que confia em quem a chama e escalacao de privilegio
--   esperando um bug do lado de fora.
--
-- POR QUE RECUSAR LOGIN QUE JA SERVE A OUTRO ESCRITORIO
--   `custom_access_token_hook` (0006) escreve no JWT o vinculo MAIS ANTIGO de
--   `tenant_users`. Uma conta ligada a dois escritorios entraria sempre no
--   primeiro e nunca veria o segundo — e a pessoa veria uma tela vazia sem
--   entender por que. Enquanto nao houver troca de escritorio na tela, o caso e
--   recusado com mensagem, e nao criado pela metade.

create or replace function public.link_collaborator_login(
  p_collaborator_id uuid,
  p_auth_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator public.collaborators;
  v_actor public.collaborators;
  v_previous uuid;
begin
  select * into v_collaborator
  from public.collaborators
  where id = p_collaborator_id;

  if not found then
    raise exception 'collaborator_not_found' using errcode = 'P0001';
  end if;

  select * into v_actor
  from public.collaborators
  where tenant_id = v_collaborator.tenant_id
    and user_id = p_actor_user_id;

  if not found or v_actor.status <> 'active' or v_actor.role <> 'director' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_collaborator.email is null then
    raise exception 'collaborator_without_email' using errcode = 'P0001';
  end if;

  -- O login ja serve outra pessoa DESTE escritorio.
  if exists (
    select 1
    from public.collaborators c
    where c.tenant_id = v_collaborator.tenant_id
      and c.user_id = p_auth_user_id
      and c.id <> v_collaborator.id
  ) then
    raise exception 'user_already_linked' using errcode = 'P0001';
  end if;

  -- O login ja serve OUTRO escritorio. Ver o cabecalho.
  if exists (
    select 1
    from public.tenant_users tu
    where tu.user_id = p_auth_user_id
      and tu.tenant_id <> v_collaborator.tenant_id
  ) then
    raise exception 'user_in_other_tenant' using errcode = 'P0001';
  end if;

  v_previous := v_collaborator.user_id;

  update public.collaborators
     set user_id = p_auth_user_id
   where id = v_collaborator.id;

  -- Sem linha em tenant_users o proximo JWT sai sem app_metadata.tenant_id
  -- (0006) e a RLS nao devolve nada: a pessoa entraria e veria o sistema vazio.
  -- Papel de plataforma nasce 'member', como na 0013.
  insert into public.tenant_users (tenant_id, user_id, role)
  values (v_collaborator.tenant_id, p_auth_user_id, 'member')
  on conflict (tenant_id, user_id) do nothing;

  -- A matriz de permissoes nasce TODA em falso, como na aprovacao de acesso: ter
  -- login nao e ter acesso a tela nenhuma, e quem libera e o Diretor na tela de
  -- permissoes. Agrupador nao recebe linha (criterio estrutural, igual a 0013).
  insert into public.collaborator_permissions (
    tenant_id, collaborator_id, menu_key, can_view, can_edit
  )
  select v_collaborator.tenant_id, v_collaborator.id, m.key, false, false
  from public.menus m
  where not exists (select 1 from public.menus child where child.parent_key = m.key)
  on conflict (collaborator_id, menu_key) do nothing;

  return jsonb_build_object(
    'collaborator_id', v_collaborator.id,
    'tenant_id', v_collaborator.tenant_id,
    'outcome', case when v_previous is null then 'linked' else 'relinked' end
  );
end;
$BODY$;

comment on function public.link_collaborator_login is
  'Liga um login do Auth a um colaborador e abre o vinculo de escritorio, conferindo que quem pediu e Diretor ativo do mesmo tenant (0108). Chamada pela edge function create-collaborator-login, que e quem cria a conta com a senha provisoria.';

revoke execute on function public.link_collaborator_login(uuid, uuid, uuid) from public, anon, authenticated;

-- Achar o login pelo e-mail, sem expor o schema auth -----------------------------
--
-- A edge function precisa saber se ja existe conta com aquele e-mail para
-- decidir entre criar e redefinir a senha. A Admin API do Supabase nao tem busca
-- por e-mail — listar usuarios e varredura paginada —, e o schema `auth` nao e
-- exposto pela Data API. Mesma saida da 0013: uma funcao SECURITY DEFINER que le
-- auth.users e devolve SO o id.

create or replace function public.find_auth_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $BODY$
  select u.id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and u.deleted_at is null
  order by u.created_at
  limit 1
$BODY$;

comment on function public.find_auth_user_by_email is
  'Id do login do Auth com este e-mail, ou nulo. Existe porque a Admin API nao busca por e-mail e o schema auth nao e exposto (0108). Devolve apenas o id — nunca senha, metadado ou data de acesso.';

revoke execute on function public.find_auth_user_by_email(text) from public, anon, authenticated;
