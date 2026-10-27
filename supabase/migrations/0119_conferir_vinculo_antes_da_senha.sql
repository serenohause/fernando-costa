-- A senha deixa de ser trocada ANTES da checagem que recusa o vinculo.
--
-- O ACHADO, CONFIRMADO POR LEITURA DO CODIGO
--   Em supabase/functions/create-collaborator-login/index.ts a ordem era:
--
--     126: find_auth_user_by_email      (select em auth.users, SEM recorte de tenant)
--     140: updateUserById({ password }) <- a senha ja foi trocada aqui
--     168: link_collaborator_login      <- a checagem que recusa com user_in_other_tenant
--
--   E `find_auth_user_by_email` (0108) varre auth.users inteiro: `where
--   lower(u.email) = lower(btrim(p_email))`, e nada mais.
--
--   Consequencia: um Diretor cadastra um colaborador no proprio escritorio com o
--   e-mail de alguem de OUTRO escritorio e pede "definir senha provisoria". A
--   senha da vitima e trocada, o metadado dela vira senha_provisoria, e so
--   DEPOIS a recusa chega. A vitima fica trancada fora da propria conta, e quem
--   pediu sabe a senha nova. A recusa aparece na tela, mas o estrago ja esta
--   feito no banco do Auth.
--
--   E barulhento, diferente do caminho de impersonacao corrigido na 0118, que
--   era silencioso. Barulhento nao e inofensivo: o barulho e a vitima
--   descobrindo que perdeu o acesso.
--
-- A CORRECAO, E POR QUE NAO E UMA CHECAGEM NOVA
--   As validacoes de vinculo saem de dentro de link_collaborator_login e passam
--   a morar em public.check_collaborator_login_link, que SO LE. A funcao de
--   vinculo chama ela antes de escrever, e a edge function chama ela antes de
--   tocar na senha.
--
--   Fonte unica de proposito. Reimplementar as mesmas regras em TypeScript
--   seria uma segunda copia da autorizacao para divergir, e o cabecalho da 0109
--   ja diz qual e a regra da casa: funcao security definer que confia em quem a
--   chama e escalacao de privilegio esperando um bug do lado de fora.
--
--   link_collaborator_login continua sendo a autoridade final, e continua
--   conferindo tudo na mesma transacao da escrita. A checagem antecipada nao a
--   substitui: entre a leitura e a escrita o mundo pode mudar, e e por isso que
--   ela nao sai de la.
--
-- O QUE NAO MUDA
--   Os nomes dos erros, um por um, entao o mapa de mensagens da edge function e
--   o que a tela mostra ficam identicos. Nenhum privilegio novo: EXECUTE so para
--   service_role, como a funcao de vinculo. E nenhum fluxo legitimo muda de
--   desfecho; o que muda e a recusa chegar antes do estrago.

create or replace function public.check_collaborator_login_link(
  p_collaborator_id uuid,
  p_auth_user_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator public.collaborators;
  v_actor public.collaborators;
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

  -- O login ja serve OUTRO escritorio. Ver o cabecalho da 0108, e o desta.
  if exists (
    select 1
    from public.tenant_users tu
    where tu.user_id = p_auth_user_id
      and tu.tenant_id <> v_collaborator.tenant_id
  ) then
    raise exception 'user_in_other_tenant' using errcode = 'P0001';
  end if;
end;
$BODY$;

comment on function public.check_collaborator_login_link is
  'SO LE, e levanta o mesmo erro que link_collaborator_login levantaria. Existe para que a edge function create-collaborator-login possa recusar ANTES de trocar a senha de uma conta: ate a migration 0119 a ordem era procurar o e-mail em auth.users (sem recorte de tenant), TROCAR A SENHA e so depois conferir o vinculo, entao um Diretor trancava fora da propria conta alguem de outro escritorio e ficava sabendo a senha nova. Nao substitui a conferencia de dentro de link_collaborator_login: entre a leitura e a escrita o mundo pode mudar, e lá ela acontece na mesma transacao da escrita.';

revoke execute on function public.check_collaborator_login_link(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_collaborator_login_link(uuid, uuid, uuid) to service_role;

/* A funcao de vinculo passa a usar a checagem extraida. Corpo de escrita
   inalterado, letra por letra. */
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
  v_previous uuid;
begin
  perform public.check_collaborator_login_link(
    p_collaborator_id, p_auth_user_id, p_actor_user_id
  );

  select * into v_collaborator
  from public.collaborators
  where id = p_collaborator_id;

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

revoke execute on function public.link_collaborator_login(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_collaborator_login(uuid, uuid, uuid) to service_role;
