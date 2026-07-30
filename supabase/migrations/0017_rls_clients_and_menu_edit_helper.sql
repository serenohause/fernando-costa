-- Modulo 2 (CRM) - RLS de clients e o helper de permissao de menu.
--
-- Matriz de docs/SCHEMA-PLAN.md, secao "Modulo 2 - CRM (detalhado)":
--   le: qualquer colaborador active do tenant
--   escreve: colaborador active com can_edit no menu 'crm'
--
-- O QUE MUDA DE CONCEITO AQUI
--
-- Ate a 0016 a permissao de menu era enfeite: o Layout.jsx do original esconde
-- item da sidebar e Clients.jsx:50 esconde o botao "Novo Lead" com
-- usePermissions('CRM').canEdit, mas nada impedia a chamada direta a entidade -
-- exatamente o ponto cego registrado em docs/ARCHITECTURE.md ("Autorizacao hoje
-- e so frontend"). Desta migration em diante can_edit e regra do banco. Esconder
-- botao passa a ser cortesia com o usuario, nao a autorizacao.
--
-- POR QUE UM HELPER, E NAO A SUBQUERY REPETIDA NA POLICY
--
-- Os modulos 3 a 9 tem a mesma forma de regra, so trocando a chave do menu
-- (pipeline, contracts, projects, activities, receivables, payables, suppliers,
-- client_budget, map). Oito copias da mesma subquery em oito migrations
-- diferentes significa oito lugares para divergir - e divergencia em predicado
-- de autorizacao nao aparece como erro, aparece como acesso que ninguem pediu.
-- Uma funcao com a chave por parametro deixa a regra em um lugar so.

-- 1. Helper -------------------------------------------------------------------
--
-- SECURITY DEFINER por dois motivos independentes:
--
--   a) Recursao. A funcao le collaborator_permissions, e a RLS de
--      collaborator_permissions (0012) chama auth_tenant_id(),
--      auth_collaborator_id() e is_tenant_director(). Como SECURITY INVOKER, a
--      leitura aqui passaria pelas policies daquela tabela e o resultado da
--      autorizacao passaria a depender de quem pode LER a permissao - dois
--      conceitos que nao devem se cruzar. E o mesmo motivo pelo qual
--      is_active_collaborator() e definer desde a 0006.
--   b) Custo. Sem RLS no caminho, a consulta e um unico acesso a PK
--      (collaborator_id, menu_key).
--
-- O dono (postgres) nao sofre RLS porque nenhuma tabela usa FORCE ROW LEVEL
-- SECURITY - e continua nao podendo passar a usar sem quebrar isto.
--
-- auth_collaborator_id() ja embute tenant do JWT e status active, e retorna null
-- para quem nao e colaborador, esta em outro escritorio ou esta em Ferias /
-- Afastado. Igualdade com null nao casa com linha alguma, entao a regra
-- transversal do sistema ("status <> active nao escreve nada") vem de graca:
-- colaborador afastado COM can_edit gravado continua sem escrever. Ha caso de
-- teste para isso.
--
-- O tenant_id aparece de novo no predicado de proposito. A FK composta
-- (collaborator_id, tenant_id) da 0004 ja garante que a permissao pertence ao
-- mesmo escritorio do colaborador, mas depender da FK para fazer o trabalho da
-- autorizacao e fragil: o predicado tem que se sustentar sozinho.

create or replace function public.can_edit_menu(p_menu_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Chave inexistente e bug de codigo, nao negativa de acesso. Sem este guarda,
  -- um erro de digitacao em can_edit_menu('contratcs') na policy do modulo 4
  -- produziria "ninguem escreve contrato nunca" em silencio - falha que nao
  -- levanta erro, nao aparece em log e so aparece como tela quebrada. Barulho
  -- aqui e mais barato do que investigacao depois.
  if not exists (select 1 from public.menus m where m.key = p_menu_key) then
    raise exception 'can_edit_menu: menu_key inexistente (%)', p_menu_key
      using errcode = '22023',
            hint = 'A chave precisa existir em public.menus. Menu novo entra por migration, junto com a tela que ele representa.';
  end if;

  return exists (
    select 1
    from public.collaborator_permissions p
    where p.collaborator_id = public.auth_collaborator_id()
      and p.tenant_id = public.auth_tenant_id()
      and p.menu_key = p_menu_key
      and p.can_edit
  );
end;
$$;

comment on function public.can_edit_menu(text) is
  'Verdadeiro quando o usuario logado e colaborador active do tenant do JWT E tem can_edit gravado para este menu em collaborator_permissions. Base da escrita de todos os modulos de negocio, comecando por clients no modulo 2 - a chave do menu e parametro justamente para que os modulos 3 a 9 nao clonem a subquery. SECURITY DEFINER porque le collaborator_permissions, cuja RLS chama estas mesmas funcoes de autorizacao. Levanta 22023 quando a chave nao existe em menus: chave errada e bug de codigo, e negar tudo em silencio e pior do que falhar alto. NAO tem atalho por funcao de negocio: Diretor sem a linha de permissao nao escreve (ver a nota de fidelidade na policy de INSERT de clients).';

revoke all on function public.can_edit_menu(text) from public, anon;
grant execute on function public.can_edit_menu(text) to authenticated, service_role;

-- 2. clients: RLS + GRANT -----------------------------------------------------
--
-- Os dois, escritos a mao, como a 0007 deixou registrado: RLS sem GRANT da
-- "permission denied for table"; GRANT sem RLS entrega a tabela inteira para a
-- chave publicavel. anon NAO recebe nada - nenhuma tela de CRM e publica.
-- (A superficie publica por token do modulo 3, client_intakes, e outra tabela e
-- tera policy propria.)

alter table public.clients enable row level security;

grant select, insert, update, delete on table public.clients to authenticated;

-- 3. Policies -----------------------------------------------------------------
--
-- Toda chamada de helper vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, em vez de uma
-- vez por linha avaliada. Com a listagem carregando o escritorio inteiro
-- (Client.list('name', 500) no original), a diferenca e entre uma chamada e
-- quinhentas.

create policy clients_select_active_collaborator
  on public.clients
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy clients_select_active_collaborator on public.clients is
  'Leitura larga de proposito: qualquer colaborador active do escritorio, sem exigir can_view no menu crm. Mesma decisao tomada para collaborators na 0012 e pelo mesmo motivo - a lista de clientes alimenta seletor de cliente em contrato (modulo 4), projeto (5), atividade (6), orcamento (8) e recebivel (7). Apertar aqui por can_view quebraria tela que o original nunca fechou, e o que esconde o item CRM da sidebar de quem nao deve ve-lo e a permissao de menu, nao a RLS. Colaborador em Ferias ou Afastado e usuario logado sem colaborador nao leem nada: is_active_collaborator() e falso para os dois.';

create policy clients_insert_crm_editor
  on public.clients
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('crm'))
  );

comment on policy clients_insert_crm_editor on public.clients is
  'Primeira escrita do sistema controlada por permissao de menu. WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem tem can_edit no proprio escritorio cadastraria cliente dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST - escrita cruzada que a policy de SELECT nao pega, porque SELECT nao roda no INSERT. DIVERGENCIA CONSCIENTE DE FIDELIDADE: em projeto-original/src/components/shared/usePermissions.jsx:43 o Diretor recebe canEdit=true sem consultar PermissoesUsuario. Aqui nao ha atalho por funcao - Diretor sem a linha (crm, can_edit) nao grava cliente. O seed do modulo 1 ja da todos os menus com edit para director, entao a tela funciona; o que precisa ser resolvido antes da UI e o hook do frontend, que se portar o atalho literal vai mostrar o botao "Novo Lead" para um Diretor que o banco recusa.';

create policy clients_update_crm_editor
  on public.clients
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('crm'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('crm'))
  );

comment on policy clients_update_crm_editor on public.clients is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita CRM pegaria um cliente do proprio escritorio e reescreveria tenant_id para outro, empurrando a linha para fora do proprio alcance e para dentro do alcance de terceiros. Com o WITH CHECK, essa tentativa e 42501.';

create policy clients_delete_crm_editor
  on public.clients
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('crm'))
  );

comment on policy clients_delete_crm_editor on public.clients is
  'Apagar cliente exige a mesma permissao de editar, como no original, onde o botao de excluir de Clients.jsx vive atras do mesmo canEdit. Nao ha trava extra contra apagar cliente com historico: quando negotiations, contracts, projects e accounts_receivable existirem (modulos 3 a 7), quem barra e a FK daquelas tabelas - restricao de integridade, e nao policy, e o lugar certo dessa regra.';
