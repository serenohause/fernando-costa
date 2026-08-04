-- Modulo 6 (Atividades) - can_view no menu 'activities' passa a conceder leitura.
--
-- O DEFEITO QUE ESTA MIGRATION CORRIGE
--   A policy activities_select_own_or_activities_editor (0038) libera a leitura
--   ampla so para quem tem can_edit_menu('activities'). Quem tem can_view = true
--   e can_edit = false le apenas as atividades em que e o responsavel ou o
--   coordenador - ou seja, can_view no menu 'activities' NAO concede nada.
--
--   A 0038 assumiu por escrito que isso nao aconteceria: "Coordenador e
--   Administrativo recebem activities/can_edit no seed do modulo 1, entao a
--   visao gerencial do original continua de pe para eles". A premissa esta
--   errada. Em supabase/seed/01-foundation.mjs, PERMISSIONS_BY_ROLE da
--   'activities' em view E edit para coordinator, e so em view para admin_staff.
--
--   Efeito medido com login real ANTES desta migration: Marcos Tavares
--   (admin_staff, activities can_view = true / can_edit = false) ve o item
--   "Atividades" na sidebar, abre a tela e recebe ZERO de 11 linhas.
--
-- A DECISAO E DO USUARIO: fazer como no original
--   No base44 nao ha RLS. pode_visualizar faz a pessoa ver o menu E ler todas as
--   atividades, porque Atividade.list() devolve tudo e o recorte gerencial de
--   Atividades.jsx:210-230 acontece no navegador. Leitura parcial nao existe la.
--   pode_editar e o que separa quem escreve.
--
--   Predicado novo de SELECT: quem tem can_view OU can_edit no menu 'activities'
--   - mais o atalho de Diretor, que os dois helpers embutem - le todas as
--   atividades do escritorio. Quem nao tem nenhum dos dois continua lendo apenas
--   aquelas em que e o responsavel (collaborator_id) ou o coordenador
--   (coordinator_id). O recorte por pessoa continua existindo; o que muda e
--   quem escapa dele.
--
-- A ESCRITA NAO MUDA
--   INSERT e DELETE continuam exigindo can_edit_menu('activities'). UPDATE
--   continua no recorte da 0039 (menu OU responsavel OU coordenador da linha).
--   can_view nao escreve nada. Alargar leitura e a mudanca com maior chance de
--   escorregar para a escrita sem ninguem notar, e por isso o caso que mais
--   importa nos testes desta migration e a NEGACAO de escrita para quem so tem
--   can_view - com controle positivo ao lado (casos 1.8 a 1.12 e 9.6 a 9.8 de
--   supabase/tests/activities-schema.sql).
--
-- POR QUE UM HELPER NOVO, E NAO O PREDICADO DIRETO NA POLICY
--   A 0038 argumentou contra helper, e o argumento continua valido para o que
--   ela recusou: can_read_activity() seria o predicado INTEIRO desta policy, com
--   um unico chamador, e espalharia a regra de activities em dois arquivos sem
--   remover duplicacao nenhuma. Nao e o que se cria aqui.
--
--   can_view_menu(menu_key) e a outra metade da matriz de permissao, gemea de
--   can_edit_menu(menu_key) da 0017: mesma forma, mesma chave por parametro,
--   mesmas garantias de tenant e status. Tres motivos, e o primeiro sozinho ja
--   decide:
--
--   a) RECURSAO E ACOPLAMENTO. Ler collaborator_permissions direto na policy
--      significa ler como o usuario que consulta, e portanto passar pela RLS de
--      collaborator_permissions (0010), que por sua vez chama auth_tenant_id(),
--      auth_collaborator_id() e is_tenant_manager(). A autorizacao de LER
--      atividade passaria a depender de quem pode LER a linha de permissao -
--      dois conceitos que a 0017 ja separou de proposito. Apertar 0010 um dia
--      quebraria a leitura de activities em silencio. SECURITY DEFINER e o que
--      corta isso, e funcao e o unico lugar onde ele cabe.
--   b) CUSTO. Sem RLS no caminho, e um acesso a PK (collaborator_id, menu_key).
--   c) REUSO JA PREVISTO. docs/ARCHITECTURE.md registra tres decisoes em aberto
--      que caem exatamente aqui se o escritorio mudar de ideia: financeiro
--      (0042), orcamento (0050/0054) e mapa (0058) sao hoje de leitura larga, e
--      o lugar do recorte e a policy de SELECT daquelas tabelas.
--
--   can_view_menu NAO devolve true por causa de can_edit. E fidelidade a
--   usePermissions.jsx:76 do original, onde canView = pode_visualizar === true e
--   nada mais. Por isso a policy pergunta as duas coisas, em vez de confiar em
--   collaborator_permissions_edit_requires_view_check (0004) para fazer o
--   trabalho do predicado: a regra de acesso tem que se sustentar sozinha, sem
--   depender de um CHECK que existe por outro motivo.

create or replace function public.can_view_menu(p_menu_key text)
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
  -- Mesmo guarda de can_edit_menu, e pelo mesmo motivo: chave inexistente e bug
  -- de codigo, nao negativa de acesso. Sem ele, can_view_menu('activites') na
  -- policy de um modulo futuro viraria "ninguem le isso, nunca" em silencio.
  if not exists (select 1 from public.menus m where m.key = p_menu_key) then
    raise exception 'can_view_menu: menu_key inexistente (%)', p_menu_key
      using errcode = '22023',
            hint = 'A chave precisa existir em public.menus. Menu novo entra por migration, junto com a tela que ele representa.';
  end if;

  v_collaborator_id := public.auth_collaborator_id();
  if v_collaborator_id is null then
    return false;
  end if;
  v_tenant_id := public.auth_tenant_id();

  -- Atalho de Diretor, como na 0019. Depende de auth_collaborator_id(), que ja
  -- exigiu status active e o tenant do JWT - Diretor afastado nao le.
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
      and p.can_view
  );
end;
$$;

comment on function public.can_view_menu(text) is
  'Verdadeiro quando o usuario logado pode VISUALIZAR este menu: e Diretor active do tenant do JWT, OU tem can_view gravado para o menu em collaborator_permissions. Gemea de can_edit_menu (0017/0019) - mesma forma, mesma chave por parametro, mesmas garantias: colaborador em Ferias ou Afastado, de outro escritorio ou sem colaborador devolve false, porque auth_collaborator_id() devolve null. NAO devolve true por causa de can_edit: canView no original (usePermissions.jsx:76) e pode_visualizar e nada mais, e quem quiser os dois pergunta os dois. SECURITY DEFINER porque le collaborator_permissions, cuja RLS chama estas mesmas funcoes - sem definer, a autorizacao de ler o dado passaria a depender de quem pode ler a linha de permissao. Levanta 22023 quando a chave nao existe em menus: negar em silencio e pior do que falhar alto. Primeiro uso: a leitura de activities (0059); e o lugar natural do recorte de leitura de financeiro, orcamento e mapa, se o escritorio decidir aperta-los.';

revoke all on function public.can_view_menu(text) from public, anon;
grant execute on function public.can_view_menu(text) to authenticated, service_role;

-- A policy de SELECT --------------------------------------------------------
--
-- O nome muda junto com o predicado: a antiga se chamava
-- ..._activities_editor e a leitura ampla deixou de ser so do editor.
--
-- Toda chamada de funcao continua dentro de (select ...) de proposito: assim o
-- planejador as trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha. Sao duas chamadas de permissao agora, e continuam sendo duas
-- avaliacoes por comando - o que sobra por linha e igualdade de uuid.

drop policy if exists activities_select_own_or_activities_editor on public.activities;

create policy activities_select_own_or_activities_viewer
  on public.activities
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
    and (
      (select public.can_view_menu('activities'))
      or (select public.can_edit_menu('activities'))
      or collaborator_id = (select public.auth_collaborator_id())
      or coordinator_id = (select public.auth_collaborator_id())
    )
  );

comment on policy activities_select_own_or_activities_viewer on public.activities is
  'Quem tem can_view OU can_edit no menu activities - ou e Diretor, pelo atalho que os dois helpers embutem - le todas as atividades do escritorio: e a visao gerencial de Atividades.jsx, e no original ela vem de pode_visualizar, nao de pode_editar. Substitui o predicado da 0038, que exigia can_edit e por isso deixava a tela vazia para o Administrativo, que no seed tem can_view e nao can_edit. Quem nao tem nenhum dos dois le SO as que sao dele (collaborator_id) ou de quem ele coordena (coordinator_id): e a tela Minhas Atividades, que no original e filtro de navegador e aqui e regra do banco. O CONTROLE importa tanto quanto a negacao - Arquiteto sem permissao de menu nenhuma PRECISA continuar lendo as proprias atividades, senao a tela dele nasce vazia e a policy apertada demais passa despercebida (casos 1.1 a 1.12 de supabase/tests/activities-schema.sql). is_active_collaborator() fecha todos os ramos: colaborador em Ferias ou Afastado nao le nem as proprias, nem com can_view gravado. LEITURA ALARGADA NAO E ESCRITA ALARGADA: INSERT e DELETE continuam presos a can_edit_menu(activities) e UPDATE ao recorte da 0039. ATIVIDADE EXCLUIDA CONTINUA LEGIVEL de proposito - deleted_at e filtro de consulta, nao de policy, porque quem administra precisa poder recuperar.';

-- Correcao de comentario que virou mentira ------------------------------------
--
-- O comentario da policy de INSERT ainda e o texto da 0038, e ele afirma que
-- "Arquiteto e Estagiario nao conseguem nem iniciar a propria atividade" e que
-- "o plano aprovado so redefiniu a LEITURA". A 0039 resolveu exatamente isso e
-- nao reescreveu este comentario. Some com a leitura alargada de agora, o texto
-- descreve um sistema que nao existe mais em dois pontos.
--
-- Migration aplicada nao se edita (docs/ARCHITECTURE.md): a correcao vem aqui.

comment on policy activities_insert_activities_editor on public.activities is
  'Criar atividade exige can_edit no menu activities, e continua exigindo depois que a 0059 alargou a LEITURA para quem tem can_view: ver o trabalho do escritorio nao e atribuir trabalho a ninguem. WITH CHECK amarra tenant_id ao claim do JWT - sem isso, quem edita atividades no proprio escritorio criaria atividade dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST, escrita cruzada que a policy de SELECT nao pega porque SELECT nao roda no INSERT. O texto anterior (0038) dizia que Arquiteto e Estagiario nao conseguiam iniciar a propria atividade e que a decisao sobre isso estava em aberto; a 0039 fechou a questao pelo UPDATE, restaurando Atividades.jsx:603, e nao reescreveu este comentario. Continua verdade so a parte da CRIACAO: quem nao tem o menu nao cria atividade nenhuma, nem para si (caso 9.4 de supabase/tests/activities-schema.sql).';
