-- `start_impersonation` escolhia o ator sem criterio quando havia mais de uma
-- linha possivel. Achado BAIXO-5 da auditoria de seguranca da feature.
--
-- O CASO
--   `collaborators` tem unique PARCIAL em (tenant_id, user_id) (0003), entao o
--   mesmo login pode ter linha de colaborador em mais de um escritorio. A versao
--   da 0109 fazia
--
--     select * into v_actor from public.collaborators
--      where user_id = p_actor_user_id and status = 'active' and role = 'director';
--
--   sem `order by` e sem `limit`. Com duas linhas, o Postgres devolve UMA
--   QUALQUER — na pratica a ordem fisica da tabela, que muda com qualquer
--   VACUUM ou UPDATE. O escritorio em que a acao acontece passava a depender
--   disso.
--
-- O QUE ISSO NAO ERA
--   Nao era furo de isolamento. A linha escolhida e sempre uma em que a pessoa E
--   Diretora ativa, e o alvo e comparado contra o tenant DELA — ninguem ganhava
--   acesso a escritorio onde nao e Diretor. O defeito era de previsibilidade:
--   um alvo legitimo podia receber `target_other_tenant` dependendo do dia.
--
-- POR QUE NAO `auth_tenant_id()`
--   Seria o criterio obvio — e nao funciona aqui. Quem chama esta funcao e a
--   edge function com a chave de SERVICO: dentro dela nao existe JWT de usuario,
--   entao `auth.jwt()` e nulo e `auth_tenant_id()` tambem. Amarrar a escolha a
--   ele faria a funcao recusar TODA chamada. O ator chega por parametro
--   justamente por isso (mesma forma da 0013 e da 0108).
--
-- O QUE FICA
--   Ordem explicita e `limit 1`: a linha mais antiga, desempatada por id. Mesma
--   regra que `custom_access_token_hook` (0006) ja usa para decidir o tenant do
--   JWT — ou seja, a funcao passa a agir no MESMO escritorio em que a sessao do
--   Diretor entrou, que e o unico resultado que nao surpreende ninguem.
--
--   Hoje o caso e inalcancavel pela aplicacao: `link_collaborator_login` (0108)
--   recusa ligar um login que ja serve outro escritorio, justamente porque o
--   hook do JWT escolhe um so. O criterio fica escrito aqui para o dia em que a
--   troca de escritorio na tela existir.

create or replace function public.start_impersonation(
  p_actor_user_id uuid,
  p_target_collaborator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_actor public.collaborators;
  v_target public.collaborators;
begin
  select * into v_actor
  from public.collaborators
  where user_id = p_actor_user_id
    and status = 'active'
    and role = 'director'
  order by created_at, id
  limit 1;

  if not found then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_target
  from public.collaborators
  where id = p_target_collaborator_id;

  if not found then
    raise exception 'target_not_found' using errcode = 'P0001';
  end if;

  /*
    MESMO ESCRITORIO, e esta e a barreira que nao pode falhar: sem ela um
    Diretor assumiria conta de qualquer tenant do banco. O id do alvo chega pelo
    corpo da requisicao, ou seja, e dado nao confiavel - quem decide o tenant e
    a linha do ATOR, lida aqui.
  */
  if v_target.tenant_id <> v_actor.tenant_id then
    raise exception 'target_other_tenant' using errcode = 'P0001';
  end if;

  if v_target.status <> 'active' then
    raise exception 'target_not_active' using errcode = 'P0001';
  end if;

  if v_target.user_id is null then
    raise exception 'target_without_login' using errcode = 'P0001';
  end if;

  /* `generateLink` e por e-mail: sem ele nao ha o que emitir. */
  if v_target.email is null then
    raise exception 'target_without_email' using errcode = 'P0001';
  end if;

  if v_target.user_id = p_actor_user_id then
    raise exception 'target_is_self' using errcode = 'P0001';
  end if;

  insert into public.impersonation_events (
    tenant_id,
    actor_collaborator_id, actor_user_id, actor_name,
    target_collaborator_id, target_user_id, target_name, target_role
  )
  values (
    v_actor.tenant_id,
    v_actor.id, p_actor_user_id, v_actor.name,
    v_target.id, v_target.user_id, v_target.name, v_target.role::text
  );

  return jsonb_build_object(
    'tenant_id', v_actor.tenant_id,
    'target_user_id', v_target.user_id,
    'target_email', v_target.email,
    'target_name', v_target.name,
    'target_role', v_target.role::text
  );
end;
$BODY$;

comment on function public.start_impersonation is
  'Autoriza e REGISTRA um "Acessar como" (0109, ator deterministico na 0110): confere que quem pede e Diretor ativo - a linha MAIS ANTIGA dele, mesmo criterio do hook do JWT -, que o alvo e colaborador ativo do MESMO escritorio com login e e-mail, grava a linha de auditoria e devolve o e-mail do alvo para a edge function emitir a sessao. O registro acontece na mesma transacao da validacao, antes de qualquer token existir.';

/* `create or replace` mantem os privilegios, mas repetir e barato e deixa o
   arquivo correto sozinho se alguem o aplicar fora de ordem. */
revoke execute on function public.start_impersonation(uuid, uuid) from public, anon, authenticated;
