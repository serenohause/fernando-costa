-- A credencial de "Acessar como" para de sair de um campo que o Diretor edita.
--
-- DOIS ACHADOS CRITICOS DA REAUDITORIA, os dois fechados aqui. A reauditoria
-- rodou com a premissa corrigida: a feature ESTA em producao (0109 e 0110 estao
-- em main), e nao so em desenvolvimento como o cabecalho da 0109 afirma. O
-- usuario decidiu manter ligado e corrigir.
--
-- CRITICO 1: O E-MAIL DECIDIA QUEM ENTRA, A LINHA DECIDIA QUEM AUTORIZA
--   A 0110 valida a LINHA do alvo (mesmo tenant, ativo, com user_id) e devolve
--   `v_target.email`. A edge function emite a sessao com esse e-mail, por
--   `generateLink`. Mas `collaborators.email` NAO e o e-mail de login, e o
--   comment da coluna na 0003 diz isso em voz alta: "Nao e necessariamente o
--   e-mail de login: esse mora em auth.users, alcancado via user_id".
--
--   Nada sincroniza os dois. E `authenticated` tem GRANT UPDATE na coluna
--   (medido: has_column_privilege = true) com a policy collaborators_update_director,
--   ou seja o Diretor edita o campo pela tela Equipe > Editar. A unicidade e
--   por tenant, entao o e-mail de OUTRO escritorio nao colide.
--
--   A cadeia, medida: Diretor de A edita o "e-mail interno" de um colaborador
--   ativo dele, poe o endereco de uma conta de outro escritorio (ou de um
--   platform admin, que le a fila inteira de product_leads), salva, clica
--   Acessar como. Todas as validacoes continuam passando, porque elas olham a
--   linha, que segue no tenant A, ativa, com o user_id antigo. A sessao que
--   volta e da conta estrangeira. A RLS funciona perfeitamente: o JWT e
--   legitimo, foi o sistema que o emitiu para a pessoa errada. E a trilha grava
--   o target_user_id do colaborador original, ou seja `impersonation_events`
--   afirma ativamente uma coisa que nao aconteceu.
--
--   O teste de 34 casos nao pegava porque ele prova o isolamento da LINHA, e o
--   furo nao estava na linha.
--
--   CORRECAO: o e-mail passa a vir de auth.users, buscado pelo user_id do alvo.
--   `collaborators.email` deixa de participar da autenticacao e volta a ser o
--   que o comment dele sempre disse que era: contato interno. Nao e uma
--   conferencia a mais sobre o caminho antigo; e o caminho antigo deixando de
--   existir. A edge function ganha uma segunda barreira, comparando o
--   `link.user.id` que o generateLink devolve com o target_user_id daqui.
--
-- CRITICO 3: DIRETOR ASSUMIA DIRETOR, E O ENCADEAMENTO SO ESTAVA BARRADO NO NAVEGADOR
--   Nao havia checagem do PAPEL do alvo. O unico bloqueio de "assumir a partir
--   de uma sessao assumida" era `if (lerEstado()) throw`, no navegador, e a
--   funcao nao tem como distinguir sessao assumida de login real.
--
--   A cadeia: Diretor A assume o Diretor B, apaga a chave do localStorage (ou
--   chama a funcao por curl com o JWT de B, que e legitimo e satisfaz
--   verify_jwt) e assume C. A trilha registra que B pediu. B nao fez nada. A
--   autoria fica lavavel sem apagar uma linha.
--
--   CORRECAO: alvo com role = 'director' e recusado AQUI, no servidor. Isso
--   fecha o encadeamento de graca e sem heuristica: so Diretor pode ser ator, e
--   nenhum Diretor pode ser alvo, entao nao existe segunda volta. O navegador
--   continua barrando tambem, mas deixa de ser a unica barreira.
--
-- O QUE NAO MUDA
--   Ator continua sendo o Diretor ativo mais antigo (mesmo critario do hook do
--   JWT). Alvo continua precisando ser do mesmo tenant, ativo e com login. O
--   registro continua acontecendo na mesma transacao da validacao, antes de
--   qualquer token existir. Nenhum privilegio novo.

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
  v_login_email text;
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

  /* Antes da checagem de papel, para que assumir a si mesmo continue dizendo
     'target_is_self' e nao 'target_is_director'. A tela mapeia os dois. */
  if v_target.user_id = p_actor_user_id then
    raise exception 'target_is_self' using errcode = 'P0001';
  end if;

  /*
    ALVO DIRETOR E RECUSADO (critico 3). Nao e restricao de conveniencia: e o
    que fecha o encadeamento no servidor. Se nenhum Diretor pode ser alvo, e so
    Diretor pode ser ator, uma sessao assumida nunca tem permissao para pedir a
    proxima - e isso vale mesmo quando ela chama a funcao por fora do navegador,
    onde `lerEstado()` nao existe.
  */
  if v_target.role = 'director' then
    raise exception 'target_is_director' using errcode = 'P0001';
  end if;

  /*
    O E-MAIL DA CREDENCIAL VEM DE auth.users, PELO user_id (critico 1).
    `collaborators.email` e contato interno, editavel pelo Diretor na tela
    Equipe, e nao pode decidir qual conta recebe a sessao.
  */
  select u.email into v_login_email
  from auth.users u
  where u.id = v_target.user_id;

  if v_login_email is null or btrim(v_login_email) = '' then
    raise exception 'target_without_email' using errcode = 'P0001';
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
    'target_email', v_login_email,
    'target_name', v_target.name,
    'target_role', v_target.role::text
  );
end;
$BODY$;

comment on function public.start_impersonation is
  'Autoriza e REGISTRA um "Acessar como" (0109, ator deterministico na 0110, credencial amarrada ao user_id na 0118): confere que quem pede e Diretor ativo - a linha MAIS ANTIGA dele, mesmo criterio do hook do JWT -, que o alvo e colaborador ativo do MESMO escritorio, com login, que NAO e Diretor, grava a linha de auditoria e devolve o e-mail para a edge function emitir a sessao. DOIS PONTOS QUE A 0118 CORRIGIU, os dois criticos: o e-mail devolvido vem de auth.users pelo user_id do alvo, e nao de collaborators.email, que e contato interno e o Diretor edita pela tela (com o campo editavel, um Diretor obtinha sessao de outro escritorio ou de platform admin, e a trilha registrava o alvo errado); e alvo Diretor e recusado, o que fecha no servidor o encadeamento que so estava barrado no navegador. O registro acontece na mesma transacao da validacao, antes de qualquer token existir.';

/* `create or replace` mantem os privilegios, mas repetir e barato e deixa o
   arquivo correto sozinho se alguem o aplicar fora de ordem. */
revoke execute on function public.start_impersonation(uuid, uuid) from public, anon, authenticated;
