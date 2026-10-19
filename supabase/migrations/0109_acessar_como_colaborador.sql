-- "Acessar como": o Diretor assume a sessao de um colaborador do escritorio.
--
-- O PEDIDO
--   "No login de admin, eu poder acessar a visao dos demais usuarios com outras
--   permissoes, e tambem poder usar como se fosse aquele usuario" - o "view as"
--   que a plataforma base44 oferece.
--
-- POR QUE SESSAO DE VERDADE, E NAO SIMULACAO NA TELA
--   A tentacao e trocar o colaborador em `useCurrentCollaborator` e deixar o
--   frontend desenhar os menus do alvo. Isso responde "o que ele consegue
--   clicar" e MENTE sobre "o que ele consegue ler": `can_view_menu` e
--   `can_edit_menu` (0014) tem atalho de Diretor, e `auth_collaborator_id()`
--   continuaria devolvendo o Diretor. A tela mostraria o menu da pessoa com os
--   dados de quem esta olhando - exatamente o engano que a feature existe para
--   desfazer.
--
--   Com sessao real, quem responde e a RLS, uma vez so, para todo o sistema.
--   Nao ha segunda copia da regra de autorizacao para divergir.
--
-- SO NO AMBIENTE DE DESENVOLVIMENTO, com tres fechaduras independentes:
--   1. esta migration e aplicada so no projeto de dev;
--   2. a edge function `impersonate-collaborator` e publicada so em dev;
--   3. o gatilho na tela so renderiza com VITE_IMPERSONATION, que so existe no
--      .env.dev.
--   Qualquer uma sozinha ja desliga a feature. As tres juntas significam que um
--   merge distraido para main nao a liga.
--
--   Em producao isto seria uma porta de escalacao de privilegio: quem assume a
--   sessao PASSA A SER a pessoa para todos os efeitos, inclusive de escrita.
--
-- A DIVISAO DE TRABALHO, a mesma da 0013 e da 0108
--   Emitir sessao para outro usuario exige a Admin API (`generateLink`), que
--   nao tem equivalente em SQL. A edge function faz essa parte; esta funcao faz
--   a do banco: conferir quem pede, conferir quem e o alvo e REGISTRAR o evento
--   antes de qualquer token existir.
--
--   E, como la, a AUTORIZACAO E CONFERIDA AQUI DENTRO mesmo que a edge function
--   ja tenha conferido do lado dela. Funcao SECURITY DEFINER que confia em quem
--   a chama e escalacao de privilegio esperando um bug do lado de fora - e esta
--   aqui e a que entrega a conta de outra pessoa.
--
-- POR QUE O REGISTRO VEM ANTES DO TOKEN
--   A linha de auditoria e gravada DENTRO desta funcao, na mesma transacao que
--   valida. Se ela fosse escrita depois, pela edge function, uma falha no meio
--   deixaria uma sessao assumida sem rastro - e o rastro e a unica coisa que
--   sabe a verdade, porque dali em diante o sistema inteiro registra a pessoa
--   assumida como autora.

create table public.impersonation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  /*
    OS DOIS LADOS, EM ID E EM NOME. O id morre com o cadastro; o nome fica.
    Mesmo criterio de `task_events.actor_name` (0104): historico que deixa de
    ser legivel quando alguem sai do escritorio nao e historico.
  */
  actor_collaborator_id uuid,
  actor_user_id uuid not null,
  actor_name text not null,

  target_collaborator_id uuid,
  target_user_id uuid not null,
  target_name text not null,
  target_role text not null,

  created_at timestamptz not null default now(),

  /*
    SET NULL COM LISTA DE COLUNAS: sem a lista, apagar o colaborador anularia
    tambem `tenant_id`, que e NOT NULL - o defeito documentado na 0073.
  */
  constraint impersonation_events_actor_fkey
    foreign key (actor_collaborator_id, tenant_id) references public.collaborators (id, tenant_id)
    on delete set null (actor_collaborator_id),
  constraint impersonation_events_target_fkey
    foreign key (target_collaborator_id, tenant_id) references public.collaborators (id, tenant_id)
    on delete set null (target_collaborator_id),

  constraint impersonation_events_not_self_check check (actor_user_id <> target_user_id)
);

create index impersonation_events_tenant_id_created_at_idx
  on public.impersonation_events (tenant_id, created_at desc);

comment on table public.impersonation_events is
  'Registro de "Acessar como" (0109): quem assumiu a sessao de quem, e quando. Escrita so por start_impersonation (service_role, via edge function); nenhuma tela insere aqui. Depois de assumida a sessao, TODO o resto do sistema registra a pessoa assumida como autora - esta tabela e o unico lugar que sabe quem estava de fato ao teclado.';

alter table public.impersonation_events enable row level security;

/*
  LE SO O DIRETOR DO PROPRIO ESCRITORIO, e nao `is_tenant_manager()`: a lista diz
  quem entrou na conta de quem, e so quem pode usar a feature deveria poder
  auditar o uso dela. NINGUEM escreve pela API - sem policy de INSERT, com RLS
  ligada, o comando e negado a qualquer papel que nao seja service_role.
*/
create policy impersonation_events_select_director
  on public.impersonation_events for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.auth_collaborator_role()) = 'director'
  );

comment on policy impersonation_events_select_director on public.impersonation_events is
  'A trilha de "Acessar como" e do Diretor do proprio escritorio. INSERT, UPDATE e DELETE nao tem policy alguma e por isso sao negados - trilha que a tela pode reescrever nao e trilha.';

grant select on table public.impersonation_events to authenticated;

-- A funcao que autoriza e registra ------------------------------------------

create function public.start_impersonation(
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
    and role = 'director';

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
  'Autoriza e REGISTRA um "Acessar como" (0109): confere que quem pede e Diretor ativo, que o alvo e colaborador ativo do MESMO escritorio com login e e-mail, grava a linha de auditoria e devolve o e-mail do alvo para a edge function emitir a sessao. O registro acontece na mesma transacao da validacao, antes de qualquer token existir.';

/*
  SO service_role. Esta funcao devolve o e-mail de um colaborador e e o primeiro
  passo para entrar na conta dele; deixa-la ao alcance de `authenticated` seria
  publicar a propria escalacao que ela existe para controlar.
*/
revoke execute on function public.start_impersonation(uuid, uuid) from public, anon, authenticated;
