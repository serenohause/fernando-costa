-- Documenta que 'urgent' E VALIDO em item de orcamento, e por que nao ha check.
--
-- O QUE ACONTECEU
--   O seed do modulo 8 evitou gravar 'urgent' em budget_checklist_items, porque
--   o comentario do tipo priority_level (0031) diz "urgent so existe em
--   Atividade no original". Reportou a folga: o enum permite, nenhum check
--   barra, e a intencao declarada exclui.
--
--   A folga e real, mas a leitura estava invertida. O original declara, em
--   projeto-original/base44/entities/ChecklistOrcamento.jsonc, o campo
--   itens[].prioridade com enum ['Urgente', 'Alta', 'Media', 'Baixa'] — os
--   quatro valores. Item de orcamento SEMPRE pode ser urgente.
--
--   Ou seja: o schema da 0049 esta certo ao nao barrar, e quem envelheceu foi o
--   comentario da 0031, escrito quando so existiam tasks e activities.
--
-- POR QUE ISSO MERECE MIGRATION
--   Porque a proxima pessoa que ler os dois comentarios lado a lado vai concluir
--   que falta um check em budget_checklist_items — e adicionar esse check
--   PROIBIRIA um estado que o dominio permite e que a importacao do base44 vai
--   trazer. Erro caro de achar depois: a linha nao entra, e o relatorio de
--   pendencias culpa o dado.
--
--   A 0031 ja esta aplicada e nao se edita (docs/ARCHITECTURE.md). COMMENT
--   substitui o texto; nada de estrutura muda aqui.

comment on type public.priority_level is
  'Prioridade. De/para: low=Baixa, medium=Media, high=Alta, urgent=Urgente. COMPARTILHADO por tasks.priority (modulo 5), activities.priority (modulo 6) e budget_checklist_items.priority (modulo 8). Quem barra urgent por check e SO tasks: no original, Task.prioridade tem tres valores. Atividade e item de orcamento aceitam os quatro — ChecklistOrcamento.itens[].prioridade declara Urgente. Ausencia de check em budget_checklist_items e deliberada, nao esquecimento.';

comment on column public.budget_checklist_items.priority is
  'Prioridade do item, de ChecklistOrcamento.itens[].prioridade. Aceita os QUATRO valores de priority_level, urgent inclusive — o enum do original lista Urgente. NAO adicionar check barrando urgent aqui: proibiria estado que o dominio permite e que a importacao do base44 vai trazer.';
