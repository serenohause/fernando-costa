-- Diretor edita sempre, sem depender da linha de permissao.
--
-- POR QUE
--   Fidelidade ao original, decidida pelo usuario. Em
--   projeto-original/src/components/shared/usePermissions.jsx:43 o Diretor
--   recebe canEdit = true sem que PermissoesUsuario seja consultada. A versao
--   anterior deste helper exigia a linha gravada para todo mundo, o que
--   divergia: um Diretor sem a linha veria o botao na tela (porque o frontend
--   porta a regra do original) e levaria 403 do banco. Frontend e banco
--   discordando sobre quem pode escrever e o pior dos dois mundos - a tela
--   promete e o banco recusa.
--
--   Vale registrar que a trava contra o Diretor era simbolica de qualquer
--   forma: Diretor e o unico papel que escreve collaborator_permissions
--   (migration 0012), entao ele podia se conceder crm/can_edit sozinho pela
--   tela de Controle de Acesso. O atalho torna explicito o que ja era possivel
--   em dois passos.
--
-- O QUE NAO MUDA
--   - Status continua mandando: auth_collaborator_id() retorna null para quem
--     esta em Ferias ou Afastado, e o atalho depende dele. Diretor afastado
--     NAO escreve.
--   - Escritorio continua mandando: o atalho le a funcao do colaborador do
--     tenant do JWT, nao de qualquer tenant.
--   - A chave de menu inexistente continua levantando 22023, antes de
--     qualquer atalho: erro de digitacao na policy de um modulo futuro precisa
--     falhar alto, e nao virar "Diretor escreve, mais ninguem".
--
-- ONDE ISSO MORDE SE MUDAR DE IDEIA
--   Este helper e a base da escrita dos modulos 2 a 9. Tirar o atalho depois
--   significa que todo Diretor de todo escritorio precisa ter as 16 linhas de
--   permissao gravadas, senao perde acesso de escrita em silencio.

create or replace function public.can_edit_menu(p_menu_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_collaborator_id uuid;
  v_tenant_id uuid;
begin
  -- Antes de qualquer atalho: chave inexistente e bug de codigo, nao negativa
  -- de acesso. Sem este guarda, can_edit_menu('contratcs') na policy do modulo
  -- 4 produziria "ninguem escreve contrato nunca" em silencio.
  if not exists (select 1 from public.menus m where m.key = p_menu_key) then
    raise exception 'can_edit_menu: menu_key inexistente (%)', p_menu_key
      using errcode = '22023',
            hint = 'A chave precisa existir em public.menus. Menu novo entra por migration, junto com a tela que ele representa.';
  end if;

  v_collaborator_id := public.auth_collaborator_id();
  if v_collaborator_id is null then
    return false;
  end if;
  v_tenant_id := public.auth_tenant_id();

  -- Atalho de Diretor. Depende de auth_collaborator_id(), que ja exigiu
  -- status active e o tenant do JWT - por isso Diretor afastado nao passa aqui.
  if exists (
    select 1
    from public.collaborators c
    where c.id = v_collaborator_id
      and c.tenant_id = v_tenant_id
      and c.role = 'director'
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.collaborator_permissions p
    where p.collaborator_id = v_collaborator_id
      and p.tenant_id = v_tenant_id
      and p.menu_key = p_menu_key
      and p.can_edit
  );
end;
$$;

comment on function public.can_edit_menu(text) is
  'Verdadeiro quando o usuario logado pode editar neste menu: e Diretor active do tenant do JWT, OU tem can_edit gravado para o menu em collaborator_permissions. Base da escrita de todos os modulos de negocio - a chave do menu e parametro justamente para que os modulos 3 a 9 nao clonem a subquery. O atalho de Diretor reproduz usePermissions.jsx:43 do original, onde Diretor recebe canEdit sem consultar a matriz; sem ele, o frontend mostraria o botao e o banco recusaria. Status e escritorio continuam mandando (Diretor em Ferias ou Afastado nao escreve, porque auth_collaborator_id() devolve null). SECURITY DEFINER porque le collaborator_permissions e collaborators, cujas RLS chamam estas mesmas funcoes. Levanta 22023 quando a chave nao existe em menus, antes de qualquer atalho: chave errada e bug de codigo, e negar em silencio e pior do que falhar alto.';
