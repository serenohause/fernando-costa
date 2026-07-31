-- Modulo 4 (Contratos) - enums de Contract.
--
-- Mesma estrutura da 0001, da 0014 e da 0021: o que e infraestrutura do modulo
-- (tipos) vem em migration propria, antes da tabela, para que a migration da
-- tabela seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secao Contratos.
-- Rotulo em portugues vive na UI (src/lib/enums.ts), nunca no banco.

-- contract_type e COMPARTILHADO com projects.project_type (modulo 5), como
-- registra docs/ENUM-MAP.md. Nenhum dos quatro tipos existia no banco ainda -
-- este e o ponto onde ele nasce, e o modulo 5 apenas o referencia.
create type public.contract_type as enum (
  'architecture',
  'architecture_engineering',
  'architecture_interiors',
  'full'
);

create type public.billing_type as enum (
  'by_phase',
  'monthly_installments',
  'upfront',
  'percent_of_construction'
);

create type public.contract_status as enum (
  'negotiating',
  'approved',
  'in_progress',
  'completed',
  'terminated'
);

create type public.installment_frequency as enum (
  'monthly',
  'biweekly',
  'weekly',
  'single'
);

comment on type public.contract_type is
  'Escopo contratado. De/para: architecture=Arquitetura, architecture_engineering=Arquitetura + Complementares, architecture_interiors=Arquitetura + Interiores, full=Todos. COMPARTILHADO com projects.project_type (modulo 5): no base44 sao duas listas com rotulo diferente para o mesmo conceito ("Projeto de Arquitetura" em Contract, "Arquitetura" em Project), e a importacao unifica. Renomear valor aqui muda o projeto tambem, de proposito.';

comment on type public.billing_type is
  'Forma de cobranca. De/para: by_phase=Por Fases, monthly_installments=Parcelado mensal, upfront=A vista, percent_of_construction=% sobre obra. Descritivo: quem determina se ha parcelamento sao as tres colunas de parcela de contracts, e nao este campo - no original os dois podem discordar (contrato "A vista" com 12 parcelas) e nenhuma tela avisa.';

comment on type public.contract_status is
  'Situacao do contrato. De/para: negotiating=Em negociacao, approved=Aprovado, in_progress=Em execucao, completed=Concluido, terminated=Rescindido. A transicao para approved e o gatilho que, no original (Contracts.jsx:416), cria projeto e tarefa - isso continua sendo decisao de fluxo na aplicacao, nunca trigger de banco.';

comment on type public.installment_frequency is
  'Periodicidade das parcelas. De/para: monthly=Mensal, biweekly=Quinzenal, weekly=Semanal, single=Unica. Quem gera as parcelas e accounts_receivable, no modulo 7; aqui o valor apenas descreve o plano acordado.';
