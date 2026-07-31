-- Modulo 4 (Contratos) - contracts, vindo de Contract do base44 (40 campos
-- declarados na entidade, mais um que a tela escreve sem declarar).
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. client_name sai e vira join com clients. E desnormalizacao pura: a lista
--      de contratos quer o nome ATUAL do cadastro. O que congela o nome na
--      assinatura e client_legal_name, que e outra coluna e tem outra razao de
--      existir (ver o bloco de snapshot mais abaixo).
--
--   2. project_id sai. A ligacao entre contrato e projeto foi INVERTIDA neste
--      projeto: projects (modulo 5) e que aponta para contracts por
--      (id, tenant_id). No original os dois lados sao gravados a mao e podem
--      discordar - Contracts.jsx grava contract.project_id depois de criar o
--      projeto, e uma falha entre as duas chamadas deixa contrato apontando
--      para projeto que nao existe. Com um lado so nao ha o que divergir, e a
--      cardinalidade correta (um contrato pode gerar mais de um projeto) passa
--      a ser representavel.
--
--   3. project_name FICA, e nao e desnormalizacao. E um campo de texto que o
--      usuario digita no formulario ("Projeto", ContractForm.jsx:228), antes de
--      qualquer projeto existir; e dele que o nome do projeto sai quando o
--      contrato e aprovado (Contracts.jsx:161).
--
--   4. file_url NAO e portado. Coluna morta: nenhuma tela do original le ou
--      escreve. O unico upload do sistema esta no modulo 8, e o bucket e a
--      politica de arquivo serao desenhados uma vez, la.
--
--   5. negotiation_id entra, e nao existe no original. E o outro lado do
--      contrato_vinculado_id que a 0022 deliberadamente nao criou em
--      negotiations. No original, Negociacoes.jsx cria o contrato e DEPOIS
--      atualiza a negociacao com o id dele: duas escritas, e uma falha no meio
--      deixa contrato orfao de negociacao ou negociacao apontando para contrato
--      que nao nasceu.
--
--   6. Os checks que o original nao tem, listados em docs/SCHEMA-PLAN.md,
--      secao "Modulo 4". Numero de contrato repetido, valor total negativo,
--      parcelamento pela metade, bandeira de parcelas geradas sem parcelamento
--      definido, vigencia comecando antes da assinatura e prazo de fase igual a
--      zero sao todos estados que o base44 aceita.

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os tres campos que o original marca como required.
  contract_number text not null,
  contract_type public.contract_type not null,
  total_value numeric(14, 2) not null,

  -- Nullable como no original: o contrato pode nascer antes de o cliente virar
  -- cadastro no CRM, e Contracts.jsx:353 trata explicitamente o contrato sem
  -- client_id, preenchendo-o depois.
  client_id uuid,

  -- Negociacao que originou o contrato. Nullable: contrato lancado direto na
  -- tela de Contratos nao veio de negociacao nenhuma.
  negotiation_id uuid,

  project_name text,

  billing_type public.billing_type,
  status public.contract_status not null default 'negotiating',
  signature_date date,
  start_date date,
  notes text,

  -- Parcelamento. Descreve o plano acordado; quem GERA as parcelas e
  -- accounts_receivable, no modulo 7.
  installment_count smallint,
  first_due_date date,
  installment_frequency public.installment_frequency,
  installments_generated boolean not null default false,

  -- Prazos por fase, em dias uteis. Alimentam o cronograma do modulo 5.
  layout_study_days smallint,
  renderings_days smallint,
  legal_permit_days smallint,
  construction_docs_days smallint,
  engineering_docs_days smallint,

  -- COPIA CONGELADA DO CLIENTE - INTENCIONAL, NAO E DESNORMALIZACAO.
  -- Ver o COMMENT de cada coluna antes de considerar remover qualquer uma.
  client_legal_name text,
  client_tax_id text,
  client_birth_date date,
  client_email text,
  client_address_zipcode text,
  client_address_street text,
  client_address_number text,
  client_address_complement text,
  client_address_city text,
  client_address_state text,

  -- COPIA CONGELADA DO LOCAL DA OBRA - mesma razao do bloco acima.
  site_zipcode text,
  site_street text,
  site_number text,
  site_complement text,
  site_city text,
  site_state text,

  -- Copia congelada da atribuicao comercial, vinda da negociacao.
  origin public.lead_origin,
  referrer_name text,

  display_order smallint,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo das FK compostas de projects (modulo 5) e accounts_receivable
  -- (modulo 7).
  constraint contracts_id_tenant_id_key unique (id, tenant_id),
  constraint contracts_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint contracts_tenant_id_contract_number_key unique (tenant_id, contract_number),
  constraint contracts_contract_number_not_blank_check check (btrim(contract_number) <> ''),

  constraint contracts_total_value_not_negative_check check (total_value >= 0),

  constraint contracts_installment_count_positive_check
    check (installment_count is null or installment_count >= 1),

  -- Ou os tres campos de parcelamento estao preenchidos, ou nenhum deles esta.
  constraint contracts_installment_plan_all_or_none_check
    check (num_nonnulls(installment_count, first_due_date, installment_frequency) in (0, 3)),

  constraint contracts_installments_generated_requires_plan_check
    check (installments_generated = false or installment_count is not null),

  constraint contracts_start_date_not_before_signature_check
    check (start_date is null or signature_date is null or start_date >= signature_date),

  constraint contracts_phase_days_positive_check
    check (
      (layout_study_days is null or layout_study_days > 0)
      and (renderings_days is null or renderings_days > 0)
      and (legal_permit_days is null or legal_permit_days > 0)
      and (construction_docs_days is null or construction_docs_days > 0)
      and (engineering_docs_days is null or engineering_docs_days > 0)
    )
);

-- FK compostas. Referencia por id sozinho deixaria um contrato apontar para
-- cliente ou negociacao de OUTRO escritorio: a RLS filtra o que se le, nao o
-- que se aponta. Sem ON DELETE nos dois casos - apagar cliente ou negociacao
-- com contrato falha de proposito, forcando decisao explicita em vez de orfanar
-- o contrato em silencio (mesmo desenho das FK do modulo 3, migration 0022).
alter table public.contracts
  add constraint contracts_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

alter table public.contracts
  add constraint contracts_negotiation_id_fkey
  foreign key (negotiation_id, tenant_id)
  references public.negotiations (id, tenant_id);

comment on table public.contracts is
  'Contrato/proposta do escritorio, de Contract do base44. Guarda o plano de parcelamento acordado (o modulo 7 e que gera as parcelas em accounts_receivable) e os prazos por fase (o modulo 5 e que monta o cronograma). Contem DE PROPOSITO uma copia congelada dos dados do cliente e do local da obra - ver os COMMENT das colunas client_* e site_* antes de considerar remove-las.';

comment on column public.contracts.contract_number is
  'Numero do contrato, digitado pelo usuario (o original sugere CTR-<timestamp> quando o contrato nasce de uma negociacao ganha). Unico por escritorio: no base44 nada impede dois contratos com o mesmo numero, e o numero e o que aparece no titulo das tarefas geradas e na busca da tela.';

comment on column public.contracts.client_id is
  'Cliente do CRM. Nullable como no original. FK composta com tenant_id porque a RLS nao impede gravar referencia para o cliente de outro escritorio. E por aqui que a tela mostra o nome ATUAL do cliente - o nome congelado na assinatura e client_legal_name.';

comment on column public.contracts.negotiation_id is
  'Negociacao que originou o contrato, quando houve uma. Nao existe no original: la e a negociacao que guarda contrato_vinculado_id, gravado numa segunda chamada depois de o contrato ser criado (Negociacoes.jsx:167). Aqui o vinculo vive de um lado so, gravado na mesma linha, e uma negociacao pode ter gerado mais de um contrato.';

comment on column public.contracts.project_name is
  'Nome do projeto, texto livre digitado no formulario (ContractForm.jsx:228). NAO e copia de projects.name: quando o contrato e preenchido o projeto ainda nao existe - e deste campo que o nome do projeto sai, na aprovacao do contrato (Contracts.jsx:161). Continua editavel depois, e o original propaga a mudanca para o titulo das tarefas.';

comment on column public.contracts.total_value is
  'Valor total do contrato em reais. numeric, nunca float: dinheiro somado em ponto flutuante desloca centavo no total da carteira. not null, como no original.';

comment on column public.contracts.billing_type is
  'Forma de cobranca acordada. Descritivo: quem determina se ha parcelamento sao installment_count / first_due_date / installment_frequency. Nao ha check amarrando os dois - o original aceita contrato "A vista" com 12 parcelas, e transformar isso em erro derrubaria a importacao do dado historico sem que ninguem saiba qual dos dois lados esta certo.';

comment on column public.contracts.installment_count is
  'Quantidade de parcelas do plano acordado (quantidade_parcelas). smallint: contrato de arquitetura nao passa de algumas dezenas de parcelas, e o teto de 32767 e folga de sobra.';

comment on column public.contracts.installment_frequency is
  'Periodicidade das parcelas. SEM default, ao contrario do original, que traz "Mensal" na propria entidade: com default, todo contrato sem parcelamento nasceria com um terco do plano preenchido e violaria contracts_installment_plan_all_or_none_check. O "Mensal" pre-selecionado continua existindo, mas como valor inicial do formulario, que e onde ele sempre foi de fato.';

comment on column public.contracts.installments_generated is
  'Bandeira de "as parcelas deste contrato ja foram geradas uma vez", para o botao do modulo 7 nao duplicar recebiveis. Quem a levanta e o modulo 7, e ela precisa ser escrita NA MESMA TRANSACAO que cria as parcelas: no original sao duas chamadas separadas (Contracts.jsx:659-710), e uma falha no meio deixa parcelas criadas com a bandeira apagada, ou bandeira levantada sem parcela nenhuma.';

comment on column public.contracts.layout_study_days is
  'Prazo do Estudo de Layout em DIAS UTEIS, como no original. Alimenta o cronograma do projeto (modulo 5); nenhuma tela do modulo 4 calcula data a partir dele.';

comment on column public.contracts.renderings_days is
  'Prazo das Perspectivas em dias uteis. Ver layout_study_days.';

comment on column public.contracts.legal_permit_days is
  'Prazo do Projeto Legal em dias uteis. Ver layout_study_days.';

comment on column public.contracts.construction_docs_days is
  'Prazo do Projeto Executivo em dias uteis. Ver layout_study_days.';

comment on column public.contracts.engineering_docs_days is
  'Prazo dos Projetos Complementares em dias uteis. Ver layout_study_days.';

comment on column public.contracts.client_legal_name is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Nome completo / razao social do cliente COMO CONSTOU NO CONTRATO ASSINADO (client_full_name no original). Nao e a desnormalizacao *_id + *_name que este projeto vem removendo: se o cliente corrigir o nome no CRM amanha, o contrato assinado continua descrevendo o que foi assinado. O nome atual sai de um join com clients por client_id; este aqui e outro dado, com outra vida.';

comment on column public.contracts.client_tax_id is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. CPF / CNPJ do cliente na assinatura (client_cpf_cnpj no original). Mesma razao de client_legal_name: documento corrigido no cadastro nao reescreve o contrato ja assinado.';

comment on column public.contracts.client_birth_date is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Data de nascimento do cliente na assinatura. Ver client_legal_name.';

comment on column public.contracts.client_email is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. E-mail do cliente na assinatura. Ver client_legal_name. Sem o dominio citext/validacao de clients.email de proposito: o que vale aqui e o texto que foi impresso no contrato, inclusive se hoje ele nao passaria na validacao.';

comment on column public.contracts.client_address_zipcode is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. CEP do endereco do cliente na assinatura (client_cep no original). O bloco client_address_* inteiro congela o endereco que constou no contrato; o endereco atual vive em clients.address_*.';

comment on column public.contracts.client_address_street is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver client_address_zipcode.';

comment on column public.contracts.client_address_number is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver client_address_zipcode.';

comment on column public.contracts.client_address_complement is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver client_address_zipcode.';

comment on column public.contracts.client_address_city is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver client_address_zipcode.';

comment on column public.contracts.client_address_state is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver client_address_zipcode.';

comment on column public.contracts.site_zipcode is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. CEP do local da obra COMO CONSTOU NO CONTRATO (local_cep no original). O bloco site_* inteiro congela o endereco da obra na assinatura; o endereco atual vive em clients.site_*. Contrato e obra em lote diferente do que foi contratado e assunto de aditivo, nao de correcao de cadastro.';

comment on column public.contracts.site_street is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver site_zipcode.';

comment on column public.contracts.site_number is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver site_zipcode.';

comment on column public.contracts.site_complement is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver site_zipcode.';

comment on column public.contracts.site_city is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver site_zipcode.';

comment on column public.contracts.site_state is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Ver site_zipcode.';

comment on column public.contracts.origin is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Origem do lead copiada da negociacao no momento em que o contrato nasceu (origem_lead no original, Negociacoes.jsx:138). Congela a atribuicao comercial: trocar a origem da negociacao depois nao reescreve a quem o contrato foi creditado. Mesmo enum de negotiations.origin.';

comment on column public.contracts.referrer_name is
  'SNAPSHOT INTENCIONAL - NAO REMOVER. Nome de quem indicou, copiado da negociacao (nome_indicador no original). Ver origin. Como em negotiations, NAO ha check exigindo origin = referral: o original tambem nao exige, e o campo continua preenchido quando alguem troca a origem depois.';

comment on column public.contracts.display_order is
  'Ordem manual da lista de contratos, definida arrastando a linha na tela (Contracts.jsx:761). NAO esta declarada em Contract.jsonc: o base44 aceita campo nao declarado, e a tela grava este ai mesmo assim - por isso a entidade tem 40 campos e a tela usa 41. Nullable de proposito: contrato nunca arrastado nao tem ordem, e a lista cai no criterio seguinte (numero do contrato, decrescente).';

comment on column public.contracts.legacy_id is
  'Id da linha de Contract no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint contracts_id_tenant_id_key on public.contracts is
  'Existe para as FK compostas de projects (modulo 5) e accounts_receivable (modulo 7), que apontam para (id, tenant_id) e nunca para id sozinho.';

comment on constraint contracts_tenant_id_contract_number_key on public.contracts is
  'Numero de contrato e unico DENTRO do escritorio, nunca globalmente - dois escritorios chegam ao mesmo CTR-001 sem nenhum conflito real. O original nao impede repeticao, e numero repetido quebra a busca da tela e o titulo das tarefas geradas, que sao identificados por ele.';

comment on constraint contracts_installment_plan_all_or_none_check on public.contracts is
  'Parcelamento definido pela metade gera parcela errada no modulo 7: quantidade sem data de vencimento nao tem por onde comecar, data sem quantidade nao tem onde parar. Ou os tres campos estao preenchidos, ou nenhum. Vale nos dois sentidos - preencher parcialmente e apagar parcialmente sao a mesma violacao.';

comment on constraint contracts_installments_generated_requires_plan_check on public.contracts is
  'Bandeira de parcelas geradas sem plano de parcelamento e um estado que nenhuma tela sabe explicar: diz que as parcelas ja sairam de um plano que nao existe, e bloqueia a geracao para sempre.';

comment on constraint contracts_start_date_not_before_signature_check on public.contracts is
  'Vigencia comecando antes da assinatura. Exigido apenas quando as DUAS datas existem: contrato sem data de assinatura e caso real na importacao do base44, e derrubar a linha por isso jogaria dado historico no relatorio de pendencias sem ganho. Igualdade e valida - assinar e comecar no mesmo dia e o caso comum, e e o que o original preenche sozinho.';

comment on constraint contracts_phase_days_positive_check on public.contracts is
  'Prazo de fase e contado em dias uteis; zero ou negativo nao descreve prazo nenhum e viraria data de entrega igual ou anterior ao inicio no cronograma do modulo 5. Nulo continua valido: fase nao contratada nao tem prazo.';

-- Indices ---------------------------------------------------------------------

-- Como a tela carrega a lista: Contract.list('-created_date').
create index contracts_tenant_id_created_at_idx
  on public.contracts (tenant_id, created_at desc);

-- Filtro por status da tela de Contratos (Contracts.jsx:737).
create index contracts_tenant_id_status_idx
  on public.contracts (tenant_id, status);

-- Contratos de um cliente: historico do CRM e a checagem de contrato existente.
create index contracts_tenant_id_client_id_idx
  on public.contracts (tenant_id, client_id);

-- Contrato gerado por uma negociacao, que e o que a coluna "Contrato" do funil
-- mostra. Parcial porque a maioria dos contratos nao vem de negociacao.
create index contracts_tenant_id_negotiation_id_idx
  on public.contracts (tenant_id, negotiation_id)
  where negotiation_id is not null;

create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

-- RLS AINDA NAO EXISTE NESTA TABELA.
--
-- Esta migration nao cria policy nem GRANT. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, ela nasce sem privilegio algum para anon e
-- authenticated, ou seja, invisivel pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela inteira ficar
-- exposta. Precisa dos dois. A 0030 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades.
--
-- Recorte esperado (docs/SCHEMA-PLAN.md, modulo 4): colaborador active do
-- tenant le; escrita para quem tem can_edit no menu 'contracts'.
