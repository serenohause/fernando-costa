-- Varios responsaveis por objetivo da tarefa, como os membros de um item do Trello.
--
-- O PEDIDO
--   "No card de fluxo de projeto, quero que seja possivel adicionar mais de um
--   responsavel no objetivo, assim como no Trello."
--
-- O QUE HAVIA
--   `task_checklist_items.assignee_id` (migration 0098): UM responsavel por
--   objetivo. Objetivo tocado por duas pessoas — o comum numa etapa de projeto —
--   so cabia escolhendo uma e deixando a outra de fora.
--
-- O QUE MUDA
--   Uma tabela de ligacao, e a coluna sai. Os vinculos que existem sao copiados
--   antes: nenhum responsavel ja escolhido se perde.
--
-- CASCADE DOS DOIS LADOS, e a diferenca para `tasks.responsible_id` e o ponto:
--   isto aqui nao e historico, e quem responde AGORA. Apagar o objetivo leva os
--   vinculos; desligar o colaborador do escritorio tira o nome dele dos
--   objetivos, sem impedir a exclusao e sem deixar linha apontando para ninguem.
--   O responsavel da TAREFA continua sendo `set null`, porque ele aparece no
--   diario e em relatorio.

create table public.task_checklist_item_assignees (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null,
  collaborator_id uuid not null,

  created_at timestamptz not null default now(),

  constraint task_checklist_item_assignees_pkey primary key (item_id, collaborator_id),
  constraint task_checklist_item_assignees_item_fkey
    foreign key (item_id, tenant_id)
    references public.task_checklist_items (id, tenant_id) on delete cascade,
  constraint task_checklist_item_assignees_collaborator_fkey
    foreign key (collaborator_id, tenant_id)
    references public.collaborators (id, tenant_id) on delete cascade
);

/* "O que esta com esta pessoa" — a pergunta que a lista pessoal fara quando
   existir; e tambem o caminho que a FK usa ao desligar um colaborador. */
create index task_checklist_item_assignees_tenant_id_collaborator_id_idx
  on public.task_checklist_item_assignees (tenant_id, collaborator_id);

comment on table public.task_checklist_item_assignees is
  'Quem responde por cada objetivo da tarefa (0103). Substitui task_checklist_items.assignee_id, que so cabia uma pessoa. Nao e historico: cascade dos dois lados.';

-- Os vinculos de hoje, antes de a coluna sair.
insert into public.task_checklist_item_assignees (tenant_id, item_id, collaborator_id)
select i.tenant_id, i.id, i.assignee_id
from public.task_checklist_items i
where i.assignee_id is not null;

alter table public.task_checklist_items
  drop column assignee_id;

-- RLS: a mesma de `task_checklist_items` (migration 0033). Le colaborador ativo,
-- escreve quem edita o Fluxo do Projeto.

alter table public.task_checklist_item_assignees enable row level security;

create policy task_checklist_item_assignees_select_active_collaborator
  on public.task_checklist_item_assignees for select
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

create policy task_checklist_item_assignees_insert_project_flow_editor
  on public.task_checklist_item_assignees for insert
  to authenticated
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('project_flow')));

create policy task_checklist_item_assignees_delete_project_flow_editor
  on public.task_checklist_item_assignees for delete
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('project_flow')));

/* Sem UPDATE de proposito: trocar o responsavel de um objetivo e tirar um e por
   outro, e e assim que a tela faz. Uma policy de UPDATE so daria um segundo
   caminho para a mesma coisa. */
grant select, insert, delete on table public.task_checklist_item_assignees to authenticated;
