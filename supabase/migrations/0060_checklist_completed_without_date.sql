-- Item de checklist obrigatorio pode estar concluido SEM data de conclusao.
--
-- POR QUE MUDA, E POR QUE AGORA
--   Decisao do usuario, tomada na etapa de importacao do dado real do base44.
--
--   O check exigia que item obrigatorio e concluido tivesse `completed_at`. A
--   intencao era boa e continua valendo para dado que NASCE aqui: "concluido"
--   sem data e um fato sem quando, e relatorio por periodo perde a linha.
--
--   Mas o base44 nao guarda data de conclusao de item de checklist. Ele guarda
--   so a bandeira. Sao 1.178 itens marcados como concluidos pela equipe, ao
--   longo de meses de uso real, cuja data nunca existiu em lugar nenhum.
--
--   As tres saidas eram: recusar as linhas, inventar uma data, ou admitir que a
--   data se perdeu. Recusar faria 1.178 itens que a equipe concluiu voltarem a
--   aparecer como pendentes, e o progresso de 73 projetos ficaria errado para
--   baixo na primeira tela que o escritorio abrisse. Inventar (usar
--   `updated_date` da tarefa como se fosse a conclusao do item) gravaria como
--   FATO uma data que ninguem registrou — e dado inventado nao se distingue de
--   dado verdadeiro depois de gravado.
--
--   Fica a terceira: `completed_at` nulo passa a significar exatamente o que e —
--   "concluido, e o quando nao foi registrado". E honesto, e e reversivel: se um
--   dia alguem descobrir as datas, e um update.
--
-- O QUE NAO MUDA
--   `task_checklist_items_completed_at_requires_completed_check` continua de pe:
--   data sem conclusao segue proibida. O par que restava proibido era o
--   contrario, e e ele que a importacao precisa.
--
--   A TELA continua exigindo a data: quem marca um item como concluido pela
--   interface o faz agora, e `agora` e a data. O que este banco deixa de fazer e
--   recusar a linha VELHA que chega sem ela. Se a tela um dia parar de gravar a
--   data, isso vira defeito silencioso — e por isso esta escrito aqui.
--
-- POR QUE MIGRATION NOVA
--   A 0032 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md).

alter table public.task_checklist_items
  drop constraint task_checklist_items_required_completed_needs_date_check;

comment on column public.task_checklist_items.completed_at is
  'Quando o item foi concluido. NULO com is_completed = true significa "concluido, e o quando nao foi registrado" — e o estado dos 1.178 itens importados do base44, que guarda a bandeira e nao a data. O check que exigia a data em item obrigatorio caiu na 0060, com o motivo escrito la. O caminho contrario continua proibido (data sem conclusao) pelo check completed_at_requires_completed. Item criado pela TELA sempre grava a data: quem marca conclui agora.';
