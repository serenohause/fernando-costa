-- Cada objetivo da tarefa pode ter um responsável e um prazo — como no Trello.
--
-- O PEDIDO
--   "Assim como no Trello, cada objetivo da tarefa deve permitir adicionar um
--   usuário responsável e um prazo, com botões ao lado do objetivo, e se houver
--   prazo ou usuário deve ser exibido."
--
-- O QUE MUDA
--   Duas colunas opcionais em `task_checklist_items`. Nada é semeado e nada muda
--   para os itens que já existem: objetivo sem responsável e sem prazo é o caso
--   normal, e é assim que todos os 1.962 itens de produção continuam.
--
-- O QUE DE PROPÓSITO NÃO MUDA
--   O responsável do objetivo NÃO substitui o da tarefa, e o prazo do objetivo
--   NÃO mexe no prazo da tarefa nem na regra de atraso do quadro
--   (`isTaskOverdue`). É o desenho do Trello: o item tem dono e data próprios,
--   dentro do cartão que tem os seus. Somar os dois — por exemplo, marcar a tarefa
--   atrasada porque um objetivo venceu — seria uma regra nova de atraso que
--   ninguém pediu e que mudaria os números do Painel Executivo.
--
--   Também não há RLS nova: gravar responsável e prazo do objetivo é UPDATE em
--   `task_checklist_items`, e a policy de update desta tabela já exige
--   `can_edit_menu('project_flow')` (migration 0033).

alter table public.task_checklist_items
  add column assignee_id uuid,
  add column due_date date;

/*
  CHAVE COMPOSTA, e com a LISTA DE COLUNAS no `set null` — que não é enfeite.

  A FK é (assignee_id, tenant_id) -> collaborators (id, tenant_id), como todas as
  deste projeto, para o objetivo nunca apontar para alguém de outro escritório.
  Um `on delete set null` sem lista anularia AS DUAS colunas, e `tenant_id` é NOT
  NULL: apagar um colaborador quebraria com 23502 em vez de só soltar o objetivo.
  É o defeito documentado na 0073, e a forma `set null (assignee_id)` é a
  correção dele.
*/
alter table public.task_checklist_items
  add constraint task_checklist_items_assignee_id_fkey
  foreign key (assignee_id, tenant_id)
  references public.collaborators (id, tenant_id)
  on delete set null (assignee_id);

/*
  Índice começando por tenant_id, como manda a convenção do projeto, e parcial:
  a maioria dos objetivos não tem responsável, e indexar os nulos seria indexar
  quase a tabela inteira para nada. Serve a FK (apagar colaborador procura os
  objetivos dele) e a pergunta futura "o que está com esta pessoa".
*/
create index task_checklist_items_tenant_id_assignee_id_idx
  on public.task_checklist_items (tenant_id, assignee_id)
  where assignee_id is not null;

comment on column public.task_checklist_items.assignee_id is
  'Quem responde por este objetivo, se alguém responde. Independente do responsável da tarefa (tasks.responsible_id): é o dono do item dentro do cartão, como no Trello. Vira nulo se o colaborador for apagado (0098).';

comment on column public.task_checklist_items.due_date is
  'Prazo deste objetivo, se houver. Não altera o prazo da tarefa nem a regra de atraso do quadro (isTaskOverdue): a tarefa não fica atrasada porque um objetivo venceu. Atraso do objetivo é mostrado só no próprio objetivo.';
