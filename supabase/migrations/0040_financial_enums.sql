-- Modulo 7 (Financeiro) - enums de AccountReceivable, AccountPayable e
-- FinancialCategory.
--
-- Mesma estrutura da 0001, 0014, 0021, 0028 e 0031: o que e infraestrutura do
-- modulo (tipos) vem em migration propria, antes das tabelas, para que a
-- migration das tabelas seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secao Financeiro.
-- Rotulo em portugues vive na UI (src/lib/enums.ts), nunca no banco.
--
-- O QUE NAO ENTRA NO ENUM, E POR QUE
--   "Em atraso" existe no enum do base44 (AccountReceivable.status e
--   AccountPayable.status) e NAO entra aqui. Nao e correcao nossa: o proprio
--   original ja ignora o valor gravado e calcula o estado na tela
--   (AccountsReceivable.jsx:228 e AccountsPayable.jsx:551,
--   `status !== 'Pago' && due_date < hoje`). Gravar atraso exigiria um job
--   diario e, no minuto em que ele falhasse, o banco passaria a mentir sobre a
--   inadimplencia da carteira. E a convencao registrada na 0001, ponto 3.
--
--   Onde isso vive agora: funcao public.is_financial_overdue(status, due_date)
--   e as views accounts_receivable_status / accounts_payable_status
--   (migration 0043).

-- Comum as duas tabelas. Sem 'overdue': ver o bloco acima.
create type public.financial_status as enum (
  'forecast',
  'paid',
  'renegotiated'
);

-- Enum UNICO com os seis valores, e nao dois enums quase iguais. O base44 tem
-- duas listas: a de receber termina em "Especie" e a de pagar em "Debito
-- automatico". Dois tipos separados obrigariam toda funcao/relatorio que
-- somasse as duas pontas a converter texto; um tipo so, com check por tabela,
-- resolve no lugar certo. Mesmo desenho de priority_level (urgent so em
-- activities) e de project_phase (finished so em projects).
create type public.payment_method as enum (
  'pix',
  'boleto',
  'card',
  'ted',
  'cash',
  'direct_debit'
);

create type public.expense_category as enum (
  'payroll',
  'taxes',
  'office',
  'software',
  'marketing',
  'travel',
  'contractors',
  'materials',
  'equipment',
  'other'
);

create type public.recurrence_frequency as enum (
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual'
);

create type public.recurrence_status as enum (
  'active',
  'paused',
  'ended'
);

create type public.financial_category_type as enum (
  'revenue',
  'expense'
);

create type public.cost_center as enum (
  'architecture',
  'interiors',
  'construction',
  'mentoring',
  'administrative'
);

comment on type public.financial_status is
  'Situacao do lancamento financeiro, a receber e a pagar. De/para: forecast=Previsto, paid=Pago, renegotiated=Negociado. "Em atraso" do base44 NAO virou valor: e estado derivado (previsto com vencimento no passado), calculado por public.is_financial_overdue e exposto pelas views de status. Linha que chegar da importacao com "Em atraso" e gravada como forecast.';

comment on type public.payment_method is
  'Forma de pagamento/recebimento. De/para: pix=PIX, boleto=Boleto, card=Cartao, ted=TED, cash=Especie, direct_debit=Debito automatico. Enum unico para as duas tabelas, com check por tabela restringindo o dominio: cash so aparece a receber e direct_debit so a pagar, como nas duas listas do original. O formulario de cada tela oferece so os seus.';

comment on type public.expense_category is
  'Categoria da despesa (AccountPayable.category, campo required no original). De/para: payroll=Folha, taxes=Impostos, office=Escritorio, software=Softwares, marketing=Marketing, travel=Viagens, contractors=Prestadores, materials=Materiais, equipment=Equipamentos, other=Outros. Independente da tabela financial_categories, que e cadastro livre do escritorio - ver o COMMENT daquela tabela.';

comment on type public.recurrence_frequency is
  'Periodicidade da despesa recorrente. De/para: monthly=Mensal, bimonthly=Bimestral, quarterly=Trimestral, semiannual=Semestral, annual=Anual. Todas as cinco sao multiplos de mes, como no monthsMap de AccountsPayable.jsx:162.';

comment on type public.recurrence_status is
  'Situacao da recorrencia, gravada na linha-MAE (a que tem is_recurring). De/para: active=Ativa, paused=Pausada, ended=Encerrada. Pausar nao apaga as ocorrencias ja geradas; encerrar impede gerar novas.';

comment on type public.financial_category_type is
  'Natureza da categoria financeira. De/para: revenue=Receita, expense=Despesa.';

comment on type public.cost_center is
  'Centro de custo da categoria financeira. De/para: architecture=Arquitetura, interiors=Interiores, construction=Obra, mentoring=Mentoria, administrative=Administrativo.';
