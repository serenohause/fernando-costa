-- Modulo 5 (Projetos) - RLS das seis tabelas da 0032.
--
-- Matriz de docs/SCHEMA-PLAN.md, secao "Modulo 5 - Projetos":
--   le: qualquer colaborador active do tenant, em todas as seis
--   escreve: colaborador active com can_edit no menu 'projects'
--            (projects, project_checklist_items, project_land_types,
--             project_purposes)
--            ou no menu 'project_flow' (tasks, task_checklist_items)
--
-- DOIS MENUS, E NAO UM. "Projetos" e "Fluxo do Projeto" sao itens separados na
-- sidebar do original, com permissao independente em PermissoesUsuario: quem
-- toca o cronograma nao e necessariamente quem cadastra projeto. O checklist e
-- as tags seguem o menu da tabela-mae, porque no original eles sao COLUNAS
-- daquela entidade - editar o checklist da tarefa e editar a tarefa, e nenhuma
-- tela pede permissao separada para isso.
--
-- Mesma forma da 0017 (clients), da 0024 (negotiations) e da 0030 (contracts),
-- trocando a chave do menu. O helper public.can_edit_menu(text) existe
-- justamente para isso, e levanta 22023 para chave inexistente - erro de
-- digitacao aqui nao vira "ninguem escreve, nunca". As duas chaves ('projects' e
-- 'project_flow') existem em public.menus desde a 0004.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS
-- sem GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela
-- inteira para a chave publicavel. anon NAO recebe nada - nenhuma tela deste
-- modulo e publica.
--
-- Toda chamada de helper vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha - o kanban carrega projeto, tarefa e checklist inteiros de uma vez.

-- projects ---------------------------------------------------------------------

alter table public.projects enable row level security;

grant select, insert, update, delete on table public.projects to authenticated;

create policy projects_select_active_collaborator
  on public.projects
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy projects_select_active_collaborator on public.projects is
  'Leitura larga, como em clients (0017), negotiations (0024) e contracts (0030): qualquer colaborador active do escritorio, sem exigir can_view no menu projects. O projeto alimenta o Fluxo, as atividades do modulo 6, os recebiveis do modulo 7, o mapa do modulo 9 e todos os paineis do modulo 10 - apertar aqui quebraria tela que o original nunca fechou. Quem esconde o item "Projetos" da sidebar e a permissao de menu, nao a RLS.';

create policy projects_insert_projects_editor
  on public.projects
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

comment on policy projects_insert_projects_editor on public.projects is
  'WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita projetos no proprio escritorio criaria projeto dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST - escrita cruzada que a policy de SELECT nao pega, porque SELECT nao roda no INSERT. Vale tambem para o projeto que nasce da aprovacao de um contrato: no original isso e uma chamada de create como qualquer outra, feita pelo navegador.';

create policy projects_update_projects_editor
  on public.projects
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

comment on policy projects_update_projects_editor on public.projects is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita projetos pegaria um projeto do proprio escritorio e reescreveria tenant_id para outro, empurrando a linha para fora do proprio alcance e para dentro do alcance de terceiros. Cobre tambem arrastar o card no kanban (current_phase) e a ordenacao da lista (display_order), que sao UPDATE.';

create policy projects_delete_projects_editor
  on public.projects
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

comment on policy projects_delete_projects_editor on public.projects is
  'Apagar projeto exige a mesma permissao de editar, como no original. As tarefas, o checklist e as tags vao junto por ON DELETE CASCADE; contrato e cliente NAO sao tocados, porque a FK e deste lado.';

-- tasks ------------------------------------------------------------------------

alter table public.tasks enable row level security;

grant select, insert, update, delete on table public.tasks to authenticated;

create policy tasks_select_active_collaborator
  on public.tasks
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy tasks_select_active_collaborator on public.tasks is
  'Qualquer colaborador active do escritorio le todas as tarefas, e nao apenas as proprias. E o que o original faz: "Minhas Atividades" e um FILTRO por responsavel na mesma lista, nunca um recorte de acesso, e o progresso do projeto depende de enxergar as tarefas dos outros. A view project_progress herda este recorte, porque e security_invoker.';

create policy tasks_insert_project_flow_editor
  on public.tasks
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  );

comment on policy tasks_insert_project_flow_editor on public.tasks is
  'Menu project_flow, e nao projects: sao itens separados na sidebar do original, e quem toca o cronograma nao e necessariamente quem cadastra projeto. WITH CHECK amarra tenant_id ao claim do JWT, pela mesma razao da policy de projects. Cobre as tarefas criadas na aprovacao do contrato, que no original saem do navegador de quem aprovou.';

create policy tasks_update_project_flow_editor
  on public.tasks
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  );

comment on policy tasks_update_project_flow_editor on public.tasks is
  'USING para quais linhas, WITH CHECK para como elas ficam depois - sem o segundo, a linha seria empurrada para outro escritorio por UPDATE. Cobre arrastar o card entre etapas, concluir a tarefa e lancar horas.';

create policy tasks_delete_project_flow_editor
  on public.tasks
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  );

comment on policy tasks_delete_project_flow_editor on public.tasks is
  'Apagar tarefa exige a mesma permissao de editar. O checklist dela vai junto por ON DELETE CASCADE.';

-- project_checklist_items -------------------------------------------------------

alter table public.project_checklist_items enable row level security;

grant select, insert, update, delete on table public.project_checklist_items to authenticated;

create policy project_checklist_items_select_active_collaborator
  on public.project_checklist_items
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_checklist_items_select_active_collaborator on public.project_checklist_items is
  'Mesmo recorte de leitura da tabela-mae: no original estes itens SAO uma coluna de Project, e quem le o projeto ja le o checklist dentro dele. Fechar mais aqui esconderia parte do card sem esconder o card.';

create policy project_checklist_items_insert_projects_editor
  on public.project_checklist_items
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

create policy project_checklist_items_update_projects_editor
  on public.project_checklist_items
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

comment on policy project_checklist_items_update_projects_editor on public.project_checklist_items is
  'Marcar um item como concluido e UPDATE, e e a acao mais frequente do kanban de projetos. Segue o menu projects porque editar o checklist do projeto e editar o projeto - no original e literalmente a mesma chamada de update.';

create policy project_checklist_items_delete_projects_editor
  on public.project_checklist_items
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

-- task_checklist_items ----------------------------------------------------------

alter table public.task_checklist_items enable row level security;

grant select, insert, update, delete on table public.task_checklist_items to authenticated;

create policy task_checklist_items_select_active_collaborator
  on public.task_checklist_items
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy task_checklist_items_select_active_collaborator on public.task_checklist_items is
  'Mesmo recorte de leitura de tasks. A view project_progress conta os itens obrigatorios daqui, e como ela e security_invoker, colaborador que nao le a linha nao a soma no progresso - por isso a leitura precisa ser tao larga quanto a da tarefa.';

create policy task_checklist_items_insert_project_flow_editor
  on public.task_checklist_items
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  );

comment on policy task_checklist_items_insert_project_flow_editor on public.task_checklist_items is
  'Menu project_flow, como tasks. No original o kanban CRIA os itens da etapa sozinho ao arrastar o card, na mesma chamada que muda a fase - separar a permissao deixaria metade da acao passar e a outra metade falhar.';

create policy task_checklist_items_update_project_flow_editor
  on public.task_checklist_items
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  );

create policy task_checklist_items_delete_project_flow_editor
  on public.task_checklist_items
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('project_flow'))
  );

-- project_land_types ------------------------------------------------------------

alter table public.project_land_types enable row level security;

grant select, insert, update, delete on table public.project_land_types to authenticated;

create policy project_land_types_select_active_collaborator
  on public.project_land_types
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_land_types_select_active_collaborator on public.project_land_types is
  'Mesmo recorte de leitura de projects: no original a tag e um array dentro da linha do projeto. O filtro por tipo de terreno do mapa (modulo 9) le daqui.';

create policy project_land_types_insert_projects_editor
  on public.project_land_types
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

-- A tela nunca edita uma tag: ela adiciona e remove (o botao de alternar do
-- ProjectForm). A policy de UPDATE existe porque o padrao deste projeto exige os
-- quatro comandos declarados - tabela sem policy de UPDATE, com GRANT de UPDATE,
-- e uma porta que ninguem lembra de conferir depois.
create policy project_land_types_update_projects_editor
  on public.project_land_types
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

create policy project_land_types_delete_projects_editor
  on public.project_land_types
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

-- project_purposes --------------------------------------------------------------

alter table public.project_purposes enable row level security;

grant select, insert, update, delete on table public.project_purposes to authenticated;

create policy project_purposes_select_active_collaborator
  on public.project_purposes
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

create policy project_purposes_insert_projects_editor
  on public.project_purposes
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

create policy project_purposes_update_projects_editor
  on public.project_purposes
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );

create policy project_purposes_delete_projects_editor
  on public.project_purposes
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('projects'))
  );
