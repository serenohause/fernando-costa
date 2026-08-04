-- Tira curation_total da view: era formula inventada, e nao ha original para ela.
--
-- POR QUE SAI
--   Decisao do usuario: fiel ao original. A 0051 criou curation_total como
--   "total APROVADO x curation_percent" e o proprio comentario dela dizia que
--   era decisao a conferir, porque no original curadoria_valor_total e campo
--   DECLARADO que nenhuma tela preenche nem calcula. Conferido: o original
--   exibe so o PERCENTUAL (ChecklistDetalhe.jsx:110), nunca um valor em reais.
--
--   A tela migrada ja esta fiel — mostra "Curadoria: X%" e nada mais, o numero
--   nunca chegou a aparecer. O problema e ele existir: valor de dinheiro sentado
--   numa view, com aparencia de dado oficial, e armadilha. Alguem liga num
--   cartao daqui a tres meses e o escritorio passa a ver um numero que ninguem
--   combinou, calculado por uma regra que este projeto inventou.
--
--   curation_percent continua na tabela, gravavel pelo formulario e exibido,
--   exatamente como no original. O que sai e so a conta que ninguem pediu.
--
-- POR QUE DROP + CREATE, E O CUIDADO QUE ISSO EXIGE
--   CREATE OR REPLACE nao remove coluna de view (42P16); so aceita acrescentar
--   no fim. Entao aqui precisa ser drop + create.
--
--   E DROP VIEW LEVA O GRANT JUNTO. Foi exatamente isso que aconteceu com
--   project_progress entre a 0035 e a 0036: a view existia, ninguem podia ler, e
--   o teste de negacao passou porque recebeu erro de permissao no lugar de
--   resultado vazio — parecia isolamento funcionando. O GRANT e os COMMENTs sao
--   reescritos abaixo por causa disso. Nada mais muda: as outras colunas, o
--   security_invoker e os joins sao identicos aos da 0054.

drop view public.budget_checklist_totals;

create view public.budget_checklist_totals
with (security_invoker = true) as
select
  c.id as checklist_id,
  c.tenant_id,

  coalesce(count(i.id), 0)::int as item_count,

  coalesce(count(i.id) filter (where i.status in ('approved', 'cancelled')), 0)::int
    as completed_item_count,

  case
    when count(i.id) = 0 then 0
    else round(
      count(i.id) filter (where i.status in ('approved', 'cancelled')) * 100.0
      / count(i.id)
    )::int
  end as progress_percent,

  coalesce(sum(i.estimated_value), 0)::numeric(14, 2) as estimated_total,
  coalesce(sum(i.approved_value), 0)::numeric(14, 2) as approved_total,
  coalesce(sum(i.commission_value), 0)::numeric(14, 2) as commission_total,
  coalesce(sum(i.commission_value) filter (where i.commission_received), 0)::numeric(14, 2)
    as commission_received_total,

  coalesce(sum(f.attachment_count), 0)::int as attachment_count

from public.budget_checklists c
left join public.budget_checklist_items i
  on i.checklist_id = c.id and i.tenant_id = c.tenant_id
left join public.budget_item_attachments f
  on f.item_id = i.id and f.tenant_id = i.tenant_id
group by c.id, c.tenant_id;

grant select on public.budget_checklist_totals to authenticated;

comment on view public.budget_checklist_totals is
  'Os totais e o progresso de cada checklist de orcamento, somados dos itens. E daqui que os cartoes da listagem, o rodape do detalhe e os paineis do modulo 10 leem - assim o numero da lista e o numero do rodape sao literalmente a mesma conta. Devolve UMA linha por checklist, inclusive para checklist sem item: tudo zero, nunca nulo. SECURITY INVOKER - a RLS das duas tabelas vale para quem consulta. NAO tem valor de curadoria: o original so exibe o percentual, e a formula que a 0051 inventou saiu na 0055.';

comment on column public.budget_checklist_totals.progress_percent is
  'Itens finalizados sobre itens totais, arredondado, 0 a 100. Finalizado e status approved ou cancelled, como no original (ChecklistDetalhe.jsx:50). Zero para checklist sem item, e nao nulo nem divisao por zero.';

comment on column public.budget_checklist_totals.commission_total is
  'Soma da comissao prevista dos itens. Cada parcela ja e calculada pelo banco (budget_checklist_items.commission_value e coluna gerada), entao o total nao depende de a tela ter feito a conta certa antes de gravar.';

comment on column public.budget_checklist_totals.commission_received_total is
  'Soma da comissao dos itens marcados como recebida. Corresponde ao "Comissao Recebida" do rodape do original (ChecklistDetalhe.jsx:55), que la e calculado no navegador e nao existe como campo.';

comment on column public.budget_checklist_totals.attachment_count is
  'Total de PDFs do checklist: as cotacoes com arquivo mais os PDFs de aprovacao, somados sobre todos os itens. E o numero do clipe do cartao da listagem, que o original calcula no navegador com um reduce (OrcamentoCliente.jsx:200). Zero para checklist sem item, e nao nulo. NAO conta budget_checklist_items.budget_file_path - ver o cabecalho da 0054.';

comment on column public.budget_checklists.curation_percent is
  'Percentual de curadoria acordado com o cliente, de ChecklistOrcamento.curadoria_percentual. E EXIBIDO como percentual e nada mais ("Curadoria: X%", ChecklistDetalhe.jsx:110). NAO existe valor de curadoria em reais em lugar nenhum do original - se alguem quiser um, e regra de negocio nova e precisa de decisao do escritorio, nao de uma formula deduzida.';
