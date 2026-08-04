-- Modulo 8 - os totais do checklist de orcamento, calculados.
--
-- POR QUE VIEW, E NAO COLUNA
--   docs/SCHEMA-PLAN.md (modulo 8) ja decidiu: valor_total_estimado,
--   valor_total_aprovado, valor_total_comissao e curadoria_valor_total sao
--   derivados dos itens. No original sao campos soltos, recalculados no navegador
--   e regravados junto com o documento inteiro - e a tela nem sempre regrava os
--   quatro: o botao "comissao recebida" (ChecklistDetalhe.jsx:198) manda so
--   valor_total_comissao, e curadoria_valor_total nao e calculado em lugar
--   nenhum, nasce nulo e fica.
--
--   Coluna derivada gravada pela aplicacao so esta certa enquanto TODA mudanca
--   passar pelo mesmo caminho. Mesmo raciocinio que tirou a deduplicacao do CRM
--   (0015), o progresso do projeto (0034), o tempo de atividade (0037) e o
--   contador de recorrencia (0043) da mao do frontend.
--
-- SECURITY INVOKER: as policies da 0050 valem para quem consulta. Sem isso a view
-- rodaria como o dono (postgres, que nao sofre RLS) e devolveria os totais de
-- todos os escritorios para qualquer um com SELECT nela.
--
-- ATENCAO A QUEM FOR MEXER NESTAS VIEWS DEPOIS: `drop view` LEVA O GRANT JUNTO.
-- Foi o que aconteceu com project_progress entre a 0035 e a 0036 - a view existia
-- e ninguem podia ler, e quem acusou foi o caso de CONTROLE do teste, porque o
-- caso de negacao ao lado passou a devolver ERR:42501, que parece sucesso num
-- teste de negacao. Se precisar recriar, REGRANTE na mesma migration.

-- budget_checklist_totals ----------------------------------------------------------
--
-- Uma linha por checklist, sempre - inclusive para checklist sem item nenhum, que
-- e o caso normal logo depois de criar. Por isso LEFT JOIN e coalesce em tudo:
-- soma de conjunto vazio e NULL em SQL, e a tela mostraria "R$ -" ou quebraria a
-- barra de progresso.

create view public.budget_checklist_totals
with (security_invoker = true) as
select
  c.id as checklist_id,
  c.tenant_id,

  coalesce(count(i.id), 0)::int as item_count,

  -- "Finalizado" para a barra de progresso e status in (approved, cancelled) -
  -- ChecklistDetalhe.jsx:50 e OrcamentoCliente.jsx:194. NAO e o campo concluido
  -- da entidade, que nenhuma tela usa e que nao foi portado (ver 0049).
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

  round(
    coalesce(sum(i.approved_value), 0) * coalesce(c.curation_percent, 0) / 100, 2
  )::numeric(14, 2) as curation_total

from public.budget_checklists c
left join public.budget_checklist_items i
  on i.checklist_id = c.id and i.tenant_id = c.tenant_id
group by c.id, c.tenant_id, c.curation_percent;

comment on view public.budget_checklist_totals is
  'Os totais e o progresso de cada checklist de orcamento, somados dos itens. E daqui que os cartoes da listagem, o rodape do detalhe e os paineis do modulo 10 leem - assim o numero da lista e o numero do rodape sao literalmente a mesma conta. Devolve UMA linha por checklist, inclusive para checklist sem item: tudo zero, nunca nulo. SECURITY INVOKER - a RLS das duas tabelas vale para quem consulta.';

comment on column public.budget_checklist_totals.progress_percent is
  'Itens finalizados sobre itens totais, arredondado, 0 a 100. Finalizado e status approved ou cancelled, como no original (ChecklistDetalhe.jsx:50). Zero para checklist sem item, e nao nulo nem divisao por zero.';

comment on column public.budget_checklist_totals.commission_total is
  'Soma da comissao prevista dos itens. Cada parcela ja e calculada pelo banco (budget_checklist_items.commission_value e coluna gerada), entao o total nao depende de a tela ter feito a conta certa antes de gravar.';

comment on column public.budget_checklist_totals.commission_received_total is
  'Soma da comissao dos itens marcados como recebida. Corresponde ao "Comissao Recebida" do rodape do original (ChecklistDetalhe.jsx:55), que la e calculado no navegador e nao existe como campo.';

comment on column public.budget_checklist_totals.curation_total is
  'Valor de curadoria a receber do cliente: o total APROVADO vezes curation_percent. DECISAO TOMADA AQUI, e ela precisa ser conferida pelo usuario: no original curadoria_valor_total e um campo declarado que nenhuma tela preenche nem calcula, entao nao havia formula a copiar - so o percentual e exibido (ChecklistDetalhe.jsx:110). Aplicar sobre o aprovado, e nao sobre o estimado, e o que faz a curadoria acompanhar o que o cliente de fato comprou. Percentual nulo da zero, nao nulo: nada combinado, nada a cobrar.';

-- supplier_commission_totals -------------------------------------------------------
--
-- DECISAO TOMADA NESTE MODULO, e registrada para conferencia.
--
-- Fornecedor.total_comissao_recebida e um campo da entidade que o drawer EXIBE
-- (FornecedorDrawer.jsx:107, secao Metricas) e que formulario nenhum preenche -
-- ou seja, hoje ele nasce nulo e a linha simplesmente nunca aparece na tela.
--
-- Nao virou coluna porque coluna que ninguem escreve e superficie sem dono
-- (mesmo criterio que deixou responsible_id fora do modulo 7, 0041), e porque
-- agora existe de onde deriva-la exatamente: e a soma da comissao dos itens de
-- orcamento em que este fornecedor foi o escolhido e a comissao ja entrou. E a
-- mesma conta que o rodape do checklist faz, recortada por fornecedor em vez de
-- por checklist.

create view public.supplier_commission_totals
with (security_invoker = true) as
select
  s.id as supplier_id,
  s.tenant_id,
  coalesce(count(i.id), 0)::int as chosen_item_count,
  coalesce(sum(i.commission_value), 0)::numeric(14, 2) as commission_total,
  coalesce(sum(i.commission_value) filter (where i.commission_received), 0)::numeric(14, 2)
    as commission_received_total
from public.suppliers s
left join public.budget_checklist_items i
  on i.chosen_supplier_id = s.id and i.tenant_id = s.tenant_id
group by s.id, s.tenant_id;

comment on view public.supplier_commission_totals is
  'Quanto de comissao cada fornecedor ja rendeu ao escritorio, derivado dos itens de orcamento em que ele foi o escolhido. Substitui Fornecedor.total_comissao_recebida, campo que o drawer exibe e que nenhuma tela do original preenche. DECISAO DESTE MODULO, nao do plano: ver o cabecalho da migration 0051. Uma linha por fornecedor, zero para quem nunca foi escolhido - nunca nulo. SECURITY INVOKER.';

comment on column public.supplier_commission_totals.commission_total is
  'Comissao prevista somada, recebida ou nao. Serve para a negociacao com o fornecedor; o que o drawer chama de "Total Comissao Recebida" e a coluna ao lado.';

-- anon NAO recebe nada: nenhuma tela deste modulo e publica.
grant select on public.budget_checklist_totals to authenticated;
grant select on public.supplier_commission_totals to authenticated;
