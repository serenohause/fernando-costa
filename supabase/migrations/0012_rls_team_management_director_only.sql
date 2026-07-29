-- Modulo 1 (Fundacao) - gestao de equipe passa a ser exclusiva do Diretor.
--
-- CORRECAO DE UMA REGRA ERRADA, NAO DE UMA IMPLEMENTACAO ERRADA
--
-- As migrations 0009-0011 implementaram fielmente a matriz de
-- docs/SCHEMA-PLAN.md, que dizia "escreve: Diretor e Administrativo". A matriz
-- e que estava errada em relacao ao sistema de origem.
--
-- Em projeto-original/src/pages/Collaborators.jsx:61 o guarda e:
--
--   const isAdmin = currentUser?.role === 'admin'
--                || currentCollaborator?.role === 'Diretor';
--
-- O 'admin' desse OU e o papel de PLATAFORMA do base44 (o dono da conta), nao
-- o 'Administrativo' do escritorio - sao coisas de niveis diferentes que o
-- nome parecido confundiu. Na linha 318 a pagina inteira e bloqueada para quem
-- nao passa nesse teste, com a mensagem "Apenas Admin e Diretor podem
-- gerenciar colaboradores", e toda escrita ainda passa pela edge function
-- gerenciarColaborador, que tambem exige Diretor.
--
-- O equivalente do 'admin' de plataforma no modelo novo e o service_role, que
-- ja tem bypass. Sobra o Diretor. Administrativo nunca foi gestor de equipe.
--
-- ALCANCE DA CORRECAO
--
-- Escrita (collaborators, collaborator_permissions): Diretor, so.
--
-- Leitura, revista tabela a tabela contra o original:
--
--   collaborators             INALTERADA - qualquer colaborador active do
--                             tenant. A pagina Equipe e Diretor-only, mas a
--                             lista de colaboradores alimenta seletor de
--                             coordenador e de responsavel no sistema inteiro
--                             (modulos 5 e 6). Fechar aqui quebraria tela que
--                             o original nunca fechou. O que esconde a tela
--                             Equipe de quem nao e Diretor e a permissao de
--                             menu, nao a RLS.
--
--   collaborator_permissions  APERTADA - as proprias, ou todas se Diretor.
--                             PermissoesManager.jsx (a matriz de permissoes de
--                             terceiros) so e renderizado em
--                             Collaborators.jsx:380, dentro da pagina
--                             Diretor-only. usePermissions.jsx:55 filtra por
--                             colaborador_id do proprio usuario. Ninguem alem
--                             do Diretor le permissao alheia no original.
--
--   access_requests           APERTADA - so Diretor. AprovacoesAcesso.jsx:153
--                             repete o mesmo bloqueio, com a mensagem "Apenas
--                             Admin e Diretor podem gerenciar aprovacoes".
--                             Mesma linha errada da mesma matriz.
--
-- O que o Administrativo perde: escrever colaborador, escrever permissao, ler
-- permissao alheia, ler a fila de aprovacao.
-- O que ele mantem: ler a equipe do escritorio e ler as proprias permissoes.

-- 1. Helper novo -------------------------------------------------------------

create or replace function public.is_tenant_director()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_collaborator_role() = 'director';
$$;

comment on function public.is_tenant_director() is
  'Quem gerencia equipe e permissao no escritorio: apenas Diretor, como em projeto-original/src/pages/Collaborators.jsx. Ja embute os filtros de status active e de tenant, porque auth_collaborator_role() embute. O "Admin" que o original aceita ao lado do Diretor e o papel de plataforma do base44, cujo equivalente aqui e o service_role - que nao passa por policy nenhuma.';

revoke all on function public.is_tenant_director() from public, anon;
grant execute on function public.is_tenant_director() to authenticated, service_role;

-- 2. collaborators -----------------------------------------------------------
-- SELECT segue como esta: nao ha drop/create da policy de leitura.

drop policy collaborators_insert_manager on public.collaborators;
drop policy collaborators_update_manager on public.collaborators;
drop policy collaborators_delete_manager on public.collaborators;

create policy collaborators_insert_director
  on public.collaborators
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  );

create policy collaborators_update_director
  on public.collaborators
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  );

create policy collaborators_delete_director
  on public.collaborators
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
    and id is distinct from (select public.auth_collaborator_id())
  );

comment on policy collaborators_insert_director on public.collaborators is
  'Cadastro de colaborador e exclusivo do Diretor. WITH CHECK amarra tenant_id ao claim do JWT: sem ele, um Diretor legitimo poderia cadastrar gente no escritorio de outra pessoa mandando outro tenant_id no corpo do POST - escrita cruzada que a policy de SELECT nao pega, porque SELECT nao roda no INSERT.';

comment on policy collaborators_update_director on public.collaborators is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, um Diretor pegaria uma linha do proprio escritorio e reescreveria tenant_id para outro, empurrando a linha para fora do alcance dele e para dentro do de terceiros.';

comment on policy collaborators_delete_director on public.collaborators is
  'Diretor nao apaga a propria linha: isso cascatearia as permissoes dele e derrubaria is_active_collaborator(), podendo deixar o escritorio sem nenhum Diretor e sem caminho de volta pelo cliente. Remover o ultimo Diretor passa a ser operacao server-side, consciente.';

-- 3. collaborator_permissions ------------------------------------------------

drop policy collaborator_permissions_select_own_or_manager on public.collaborator_permissions;
drop policy collaborator_permissions_insert_manager on public.collaborator_permissions;
drop policy collaborator_permissions_update_manager on public.collaborator_permissions;
drop policy collaborator_permissions_delete_manager on public.collaborator_permissions;

create policy collaborator_permissions_select_own_or_director
  on public.collaborator_permissions
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (
      collaborator_id = (select public.auth_collaborator_id())
      or (select public.is_tenant_director())
    )
  );

create policy collaborator_permissions_insert_director
  on public.collaborator_permissions
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  );

create policy collaborator_permissions_update_director
  on public.collaborator_permissions
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  );

create policy collaborator_permissions_delete_director
  on public.collaborator_permissions
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  );

comment on policy collaborator_permissions_select_own_or_director on public.collaborator_permissions is
  'Cada colaborador le as proprias permissoes - a sidebar depende disso, e e exatamente o que usePermissions.jsx faz no original, filtrando por colaborador_id do proprio usuario. Permissao alheia so o Diretor le, porque a unica tela que mostra isso (PermissoesManager) vive dentro da pagina Equipe, que e Diretor-only. O ramo "as minhas" dispensa checagem de status: auth_collaborator_id() ja volta null para quem nao esta active, e igualdade com null nao devolve linha.';

comment on policy collaborator_permissions_insert_director on public.collaborator_permissions is
  'So o Diretor concede permissao. Um Administrativo nao consegue mais se auto-conceder can_view de um menu financeiro, que era o efeito colateral pratico da matriz antiga: ele tinha escrita sobre a propria linha de permissao.';

-- 4. access_requests ---------------------------------------------------------

drop policy access_requests_select_manager on public.access_requests;

create policy access_requests_select_director
  on public.access_requests
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_director())
  );

comment on policy access_requests_select_director on public.access_requests is
  'A fila de aprovacao e da tela AprovacoesAcesso, que no original bloqueia todo mundo que nao seja Diretor ("Apenas Admin e Diretor podem gerenciar aprovacoes"). E-mail e nome de gente que nem entrou no sistema nao e dado de equipe. INSERT, UPDATE e DELETE continuam sem policy alguma: quem grava aqui e a edge function, com service_role.';

-- 5. Aposenta o helper antigo ------------------------------------------------
--
-- is_tenant_manager() nasceu na 0007 com a semantica errada (Diretor OU
-- Administrativo). Nenhuma policy, funcao ou edge function referencia mais ele
-- - conferido antes do drop. Nao fica para tras: helper de autorizacao orfao,
-- com nome plausivel e regra frouxa, e exatamente o que alguem reaproveita sem
-- ler no modulo 2.

drop function if exists public.is_tenant_manager();

-- 6. Trigger anti-escalacao: mantido, e agora com alcance menor --------------
--
-- collaborators_guard_self_service continua valendo, sem afrouxar. Com o
-- Administrativo fora da escrita, dois dos tres caminhos que ele fechava
-- deixam de ser alcancaveis por aquele papel - mas o Diretor continua podendo
-- escrever, e para ele os tres seguem abertos e ruins:
--
--   - auto-rebaixar-se (role para 'intern') e perder o escritorio sem querer,
--     sem ninguem para desfazer pelo cliente;
--   - criar linha ja vinculada ao proprio user_id, duplicando a propria
--     identidade no escritorio;
--   - desvincular a propria linha e colar o user_id em outra, trocando de
--     identidade dentro do tenant.
--
-- Defesa em profundidade tambem conta: se um dia a matriz voltar a abrir a
-- escrita para outro papel, o trigger ja esta la. A trava e barata - um
-- BEFORE trigger em tabela que muda raramente.

comment on function public.guard_collaborator_self_service() is
  'Fecha a escalacao de privilegio que a policy de escrita de collaborators nao consegue expressar, porque exige comparar OLD com NEW: mudar a propria role, criar ou apropriar-se de uma linha vinculando-a ao proprio auth.uid(), e desvincular a propria linha para depois sequestrar a de outro. Desde a 0012 so o Diretor escreve nesta tabela, e o trigger continua valendo para ele - trocar de identidade dentro do escritorio ou se auto-rebaixar sem volta sao caminhos ruins independentemente de quem tenta. Inerte para service_role e para conexao sem JWT (migration, SQL editor), onde a autorizacao e checada antes, no codigo da edge function.';
