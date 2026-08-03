-- "Em atraso" passa a ser tudo que nao foi pago e venceu, como no original.
--
-- POR QUE MUDA
--   Decisao do usuario, e corrige o plano — nao a implementacao. A 0043 seguiu
--   docs/SCHEMA-PLAN.md, que dizia `status = 'forecast' and due_date <
--   current_date`. O agente que a escreveu reportou que o original faz
--   diferente e nao corrigiu sozinho, que era o certo.
--
--   O original compara "nao esta pago E venceu":
--     AccountsReceivable.jsx:228  status !== 'Pago' && due_date < hoje
--     AccountsPayable.jsx:551     idem
--
--   Ou seja, parcela `renegotiated` vencida TAMBEM conta como atrasada. Faz
--   sentido no dominio: parcela renegociada cujo novo prazo tambem venceu
--   continua sendo dinheiro que nao entrou. Deixar de fora faria o cartao de
--   inadimplencia mostrar MENOS que o sistema atual, e a equipe estranharia sem
--   saber por que.
--
--   O predicado passa a ser "diferente de pago", e nao "igual a previsto". A
--   diferenca importa se um status novo entrar no enum um dia: com "diferente
--   de pago", ele ja nasce contando como atraso quando vence, que e o
--   comportamento seguro para dinheiro a receber.
--
-- POR QUE MIGRATION NOVA
--   A 0043 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md).
--
-- AS VIEWS NAO PRECISAM SER RECRIADAS
--   Elas chamam is_financial_overdue(status, due_date); trocar o corpo da
--   funcao muda as duas de uma vez. E exatamente por isso que a regra vive numa
--   funcao e nao repetida em cada view: a alternativa seria mudar o mesmo
--   predicado em dois lugares e descobrir a divergencia quando os numeros de
--   duas telas nao batessem.

create or replace function public.is_financial_overdue(
  p_status public.financial_status,
  p_due_date date
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_status <> 'paid' and p_due_date < current_date;
$$;

comment on function public.is_financial_overdue(public.financial_status, date) is
  'A regra de "Em atraso" do financeiro, em um lugar so: NAO PAGO e vencido. Nao e coluna gerada porque current_date nao e imutavel, e nao e coluna gravada porque isso exigiria um job diario que, no dia em que falhasse, faria o banco mentir sobre a inadimplencia. STABLE, e nao IMMUTABLE: o resultado muda quando o dia vira. Serve as views accounts_receivable_status / accounts_payable_status e o filtro "Em atraso" das telas. O predicado e "diferente de pago" e nao "igual a previsto" de proposito: e o comportamento do original (AccountsReceivable.jsx:228), inclui parcela renegociada que venceu de novo, e faz status novo no enum ja nascer contando como atraso quando vence - que e o lado seguro para dinheiro a receber.';
