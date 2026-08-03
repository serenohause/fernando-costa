-- Modulo 7 (Financeiro) - accounts_receivable, accounts_payable e
-- financial_categories, de AccountReceivable (17 campos), AccountPayable (21) e
-- FinancialCategory (3) do base44.
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. Os cinco *_name saem e viram join: client_name, contract_number,
--      project_name (nas duas tabelas) e responsible_name. Desnormalizacao pura
--      do base44, que nao tem join. O unico *_name que FICA e supplier_name, e
--      ele nao e copia de nada: no original "supplier" e texto digitado no
--      formulario ("Fornecedor / Destinatario"), e a tabela suppliers so nasce
--      no modulo 8. Ver o COMMENT da coluna.
--
--   2. installment_number deixa de ser TEXTO "1/12" e vira DOIS smallint:
--      installment_number e installment_total. O texto do original nao ordena
--      ("10/12" antes de "2/12"), nao soma e nao serve de chave - e e
--      exatamente sobre ele que a protecao contra parcela duplicada precisa
--      apoiar (unique (tenant_id, contract_id, installment_number), migration
--      0044). O rotulo "3/12" continua existindo, montado na tela a partir dos
--      dois numeros.
--
--   3. generated_count NAO e coluna. No original e um contador que a aplicacao
--      grava depois do bulkCreate (AccountsPayable.jsx:212) e que so esta certo
--      enquanto TODA criacao de ocorrencia passar pelo mesmo caminho - apagar
--      uma ocorrencia pela tela nao o decrementa, e o numero passa a mentir.
--      Vira contagem de filhos na view accounts_payable_status (0043). Mesmo
--      raciocinio que tirou progresso do projeto (0034) e tempo total de
--      atividade (0037) da mao do frontend.
--
--   4. "Em atraso" nao e coluna nem valor de enum: ver o cabecalho da 0040.
--
--   5. competence_month deixa de ser TEXTO "MM/YYYY" e vira date presa ao
--      primeiro dia do mes. Texto "MM/YYYY" ordena errado no banco e no PDF
--      ("01/2027" antes de "02/2026"), e o relatorio mensal e justamente o que
--      esta tela existe para produzir. Ver o COMMENT da coluna.
--
--   6. receipt_url NAO e portado, nas duas tabelas. Coluna morta: nenhuma tela
--      do original le ou escreve (mesmo criterio que deixou file_url de fora
--      dos contratos, migration 0029). O unico upload do sistema esta no modulo
--      8, e bucket e politica de arquivo serao desenhados uma vez, la.
--
--   7. responsible_id / responsible_name NAO sao portados. Sao declarados nas
--      duas entidades e nenhum formulario os preenche: em AccountsPayable.jsx
--      :254 eles so aparecem sendo repassados de `data`, que vem de
--      AccountPayableForm.jsx - formulario que nao tem campo de responsavel.
--      Coluna que nasce sempre nula e superficie sem dono. Quando a tela pedir
--      responsavel, ele entra como FK composta para collaborators, com a
--      decisao registrada.
--
--   8. Os checks que o original nao tem, listados em docs/SCHEMA-PLAN.md, secao
--      "Modulo 7 - Regra de negocio para o teste proprio". Valor zero ou
--      negativo, pagamento sem data, data de pagamento em conta prevista,
--      recorrencia com fim antes do inicio e ocorrencia apontando para mae de
--      outro escritorio sao todos estados que o base44 aceita.

-- financial_categories -------------------------------------------------------
--
-- Vem primeiro por ser a menor e por nao depender de ninguem.

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os dois campos que o original marca como required.
  name text not null,
  type public.financial_category_type not null,

  cost_center public.cost_center,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint financial_categories_id_tenant_id_key unique (id, tenant_id),
  constraint financial_categories_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint financial_categories_tenant_id_type_name_key unique (tenant_id, type, name),
  constraint financial_categories_name_not_blank_check check (btrim(name) <> '')
);

comment on table public.financial_categories is
  'Cadastro de categorias de receita e despesa por centro de custo, de FinancialCategory do base44. ATENCAO: nenhuma tela do original le esta entidade - ela e declarada e nunca consultada, e a categoria que AccountPayable usa de fato e o enum expense_category, escrito na propria linha. A tabela entra porque esta no plano aprovado (docs/SCHEMA-PLAN.md, modulo 7) e porque e o lugar natural do plano de contas do escritorio; NAO ha FK de accounts_payable para ca, e criar uma seria decidir por conta propria que a categoria da despesa deixou de ser enum. Escrita presa ao menu payables: e cadastro de apoio das despesas, nao tem item proprio na sidebar.';

comment on column public.financial_categories.name is
  'Nome da categoria, digitado pelo escritorio. Unico por (escritorio, tipo): duas categorias "Marketing" de despesa deixam o seletor ambiguo e o agrupamento do relatorio dobrado. Receita e despesa podem ter o mesmo nome - "Comissao" existe dos dois lados.';

comment on column public.financial_categories.cost_center is
  'Centro de custo. Nullable como no original (so name e type sao required): categoria transversal, como "Impostos", nao pertence a um centro de custo so.';

comment on column public.financial_categories.legacy_id is
  'Id da linha de FinancialCategory no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

create index financial_categories_tenant_id_created_at_idx
  on public.financial_categories (tenant_id, created_at desc);

create trigger financial_categories_set_updated_at
  before update on public.financial_categories
  for each row execute function public.set_updated_at();

-- accounts_receivable --------------------------------------------------------

create table public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os tres campos que o original marca como required.
  description text not null,
  value numeric(14, 2) not null,
  due_date date not null,

  -- Todos nullable, como no original: recebivel avulso (reembolso, venda de
  -- projeto pronto) nao tem contrato nem projeto, e pode nem ter cliente do CRM.
  client_id uuid,
  contract_id uuid,
  project_id uuid,

  installment_number smallint,
  installment_total smallint,

  issue_date date,

  status public.financial_status not null default 'forecast',
  payment_date date,
  payment_method public.payment_method,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounts_receivable_id_tenant_id_key unique (id, tenant_id),
  constraint accounts_receivable_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  -- A PROTECAO CONTRA PARCELA DUPLICADA. Ver o COMMENT da constraint.
  -- Nome curto de proposito: o descritivo completo
  -- (accounts_receivable_tenant_id_contract_id_installment_number_key) passa dos
  -- 63 caracteres do identificador do Postgres e seria truncado em silencio, o
  -- que faz `alter table ... drop constraint <nome>` errar o alvo mais tarde.
  constraint accounts_receivable_contract_installment_key
    unique (tenant_id, contract_id, installment_number),

  constraint accounts_receivable_description_not_blank_check check (btrim(description) <> ''),

  -- Dinheiro: > 0, e nao >= 0. Parcela de zero real nao e cobranca, e entra na
  -- soma da carteira como se fosse.
  constraint accounts_receivable_value_positive_check check (value > 0),

  -- Os dois sentidos na mesma igualdade: pago exige data, e data de pagamento
  -- exige status pago.
  constraint accounts_receivable_payment_date_matches_status_check
    check ((status = 'paid') = (payment_date is not null)),

  -- Numero e total de parcela andam juntos, e 3/12 nunca e maior que 12/12.
  constraint accounts_receivable_installment_pair_check
    check ((installment_number is null) = (installment_total is null)),
  constraint accounts_receivable_installment_range_check
    check (
      installment_number is null
      or (installment_number >= 1 and installment_number <= installment_total)
    ),

  -- direct_debit e forma de PAGAR, nao de receber: a lista de
  -- AccountReceivable.payment_method do original termina em "Especie".
  constraint accounts_receivable_payment_method_domain_check
    check (payment_method is null or payment_method <> 'direct_debit')
);

-- FK compostas. Referencia por id sozinho deixaria a parcela apontar para
-- cliente, contrato ou projeto de OUTRO escritorio: a RLS filtra o que se le,
-- nao o que se aponta. Sem ON DELETE, como nas migrations 0022, 0029, 0032 e
-- 0037 - apagar contrato que ja tem parcela gerada falha de proposito, forcando
-- decisao explicita em vez de orfanar o recebivel em silencio.
alter table public.accounts_receivable
  add constraint accounts_receivable_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

alter table public.accounts_receivable
  add constraint accounts_receivable_contract_id_fkey
  foreign key (contract_id, tenant_id)
  references public.contracts (id, tenant_id);

alter table public.accounts_receivable
  add constraint accounts_receivable_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id);

comment on table public.accounts_receivable is
  'Parcela a receber, de AccountReceivable do base44. Nasce de duas portas: a geracao em lote a partir do plano de parcelamento do contrato (public.generate_contract_installments, migration 0044) e o lancamento avulso da tela. O estado "Em atraso" NAO esta aqui - e calculado, ver a view accounts_receivable_status (0043).';

comment on column public.accounts_receivable.value is
  'Valor da parcela em reais. numeric(14,2), nunca float: dinheiro somado em ponto flutuante desloca centavo no total da carteira. A soma das parcelas geradas de um contrato e EXATAMENTE contracts.total_value - a divisao acontece em centavos inteiros e o resto vai na primeira parcela (ver 0044).';

comment on column public.accounts_receivable.contract_id is
  'Contrato que originou a parcela, quando houve um. Nullable: recebivel avulso nao tem contrato. FK composta com tenant_id porque a RLS nao impede gravar referencia para o contrato de outro escritorio. O NUMERO do contrato sai de join com contracts - no original ele e copiado para ca (contract_number) e envelhece sozinho.';

comment on column public.accounts_receivable.project_id is
  'Projeto ao qual a parcela pertence. Preenchido pela geracao de parcelas quando o contrato tem EXATAMENTE UM projeto: a ligacao contrato-projeto foi invertida no modulo 4 (projects e que aponta para contracts) e um contrato pode gerar mais de um projeto, entao com dois ou mais nao ha escolha correta e a coluna fica nula, para a tela preencher.';

comment on column public.accounts_receivable.installment_number is
  'Numero da parcela dentro do contrato (1, 2, 3...). No original e o TEXTO "1/12", que nao ordena, nao soma e nao serve de chave. Nulo em recebivel avulso. E a segunda metade da chave que impede parcela duplicada.';

comment on column public.accounts_receivable.installment_total is
  'Quantidade total de parcelas do plano, para a tela montar o rotulo "3/12". Coluna propria, e nao join com contracts.installment_count, porque o formulario de recebivel tambem parcela sem contrato nenhum (AccountReceivableForm.jsx:138) e porque alterar o plano do contrato depois nao pode reescrever o rotulo de parcela ja emitida.';

comment on column public.accounts_receivable.issue_date is
  'Data de emissao. A geracao de parcelas grava a data corrente, como no original (Contracts.jsx:702, format(new Date())).';

comment on column public.accounts_receivable.payment_date is
  'Data do recebimento efetivo. Amarrada a status nos DOIS sentidos por check: pago sem data nao entra em relatorio por periodo, e data em parcela prevista a faz aparecer como recebida na conciliacao. Mesmo desenho de activities.completed_at (0037) e tasks.completion_date (0032).';

comment on column public.accounts_receivable.legacy_id is
  'Id da linha de AccountReceivable no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint accounts_receivable_contract_installment_key on public.accounts_receivable is
  'A PROTECAO CONTRA PARCELA DUPLICADA, e ela precisa ser esta e nao uma consulta previa. O original tenta se proteger listando os recebiveis do contrato antes de gravar (Contracts.jsx:655) - consultar-e-depois-gravar de dois lugares ao mesmo tempo, ou de dois cliques rapidos no mesmo botao, deixa as duas chamadas passarem pelo teste e as duas gravarem. Aqui a segunda chamada recebe 23505 do proprio indice, e generate_contract_installments (0044) a traduz para installments_already_generated. Recebivel avulso tem contract_id nulo e nulo nunca colide com nulo, entao lancamento manual nao e afetado.';

comment on constraint accounts_receivable_payment_date_matches_status_check on public.accounts_receivable is
  'Os dois sentidos da mesma regra. O original grava status e data em chamadas independentes e aceita as duas metades soltas: parcela "Paga" sem data fica fora de todo relatorio por periodo, e parcela "Prevista" com data de pagamento aparece recebida para quem le a data e prevista para quem le o status.';

comment on constraint accounts_receivable_payment_method_domain_check on public.accounts_receivable is
  'payment_method e enum unico para as duas tabelas (ver 0040). Este check devolve o dominio da tela de RECEBER, que no original termina em "Especie" e nao oferece debito automatico. Mesmo desenho do check que impede tasks.phase = finished (0032).';

-- Indices ---------------------------------------------------------------------

-- Como a tela carrega a lista.
create index accounts_receivable_tenant_id_created_at_idx
  on public.accounts_receivable (tenant_id, created_at desc);

-- O recorte real das duas telas do financeiro: o mes selecionado, e o painel de
-- atraso. due_date e por onde tudo e filtrado e somado.
create index accounts_receivable_tenant_id_due_date_idx
  on public.accounts_receivable (tenant_id, due_date);

create index accounts_receivable_tenant_id_status_due_date_idx
  on public.accounts_receivable (tenant_id, status, due_date);

-- Parcelas de um cliente: historico do CRM e a ficha do cliente.
create index accounts_receivable_tenant_id_client_id_idx
  on public.accounts_receivable (tenant_id, client_id)
  where client_id is not null;

-- A carteira de um contrato ja sai do indice da constraint de unicidade, que
-- comeca por (tenant_id, contract_id).

create trigger accounts_receivable_set_updated_at
  before update on public.accounts_receivable
  for each row execute function public.set_updated_at();

-- accounts_payable -----------------------------------------------------------

create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os cinco campos que o original marca como required.
  supplier_name text not null,
  description text not null,
  category public.expense_category not null,
  value numeric(14, 2) not null,
  due_date date not null,

  project_id uuid,

  status public.financial_status not null default 'forecast',
  payment_date date,
  payment_method public.payment_method,

  competence_month date,

  -- Recorrencia. A linha-MAE e o modelo (is_recurring); cada ocorrencia e uma
  -- linha com recurrence_parent_id apontando para ela e is_recurring falso,
  -- exatamente como AccountsPayable.jsx:204-205 grava.
  is_recurring boolean not null default false,
  recurrence_frequency public.recurrence_frequency,
  recurrence_start_date date,
  recurrence_end_date date,
  recurrence_count smallint,
  recurrence_parent_id uuid,
  recurrence_status public.recurrence_status,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounts_payable_id_tenant_id_key unique (id, tenant_id),
  constraint accounts_payable_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint accounts_payable_supplier_name_not_blank_check check (btrim(supplier_name) <> ''),
  constraint accounts_payable_description_not_blank_check check (btrim(description) <> ''),

  constraint accounts_payable_value_positive_check check (value > 0),

  constraint accounts_payable_payment_date_matches_status_check
    check ((status = 'paid') = (payment_date is not null)),

  -- cash e forma de RECEBER: a lista de AccountPayable.payment_method do
  -- original termina em "Debito automatico" e nao oferece especie.
  constraint accounts_payable_payment_method_domain_check
    check (payment_method is null or payment_method <> 'cash'),

  -- Competencia e um MES, e nao um dia: guardar 15/03 e 01/03 como competencias
  -- diferentes rebentaria o agrupamento do relatorio mensal.
  constraint accounts_payable_competence_month_is_first_day_check
    check (competence_month is null or competence_month = date_trunc('month', competence_month)::date),

  -- Recorrencia declarada exige o minimo para gerar: com que frequencia, e a
  -- partir de quando. O original cai num fallback silencioso (usa due_date
  -- quando recurrence_start_date falta, AccountsPayable.jsx:152) e trata
  -- frequencia desconhecida como mensal (:171) - dois palpites que produzem
  -- lancamento em data que ninguem pediu.
  constraint accounts_payable_recurrence_plan_check
    check (
      is_recurring = false
      or (recurrence_frequency is not null and recurrence_start_date is not null)
    ),

  constraint accounts_payable_recurrence_end_not_before_start_check
    check (
      recurrence_end_date is null
      or recurrence_start_date is null
      or recurrence_end_date >= recurrence_start_date
    ),

  constraint accounts_payable_recurrence_count_positive_check
    check (recurrence_count is null or recurrence_count >= 1),

  -- A mae nao aponta para si mesma. Sem isto, a contagem de ocorrencias da view
  -- inclui a propria mae e o "excluir todos os futuros" entra em ciclo.
  constraint accounts_payable_recurrence_parent_not_self_check
    check (recurrence_parent_id is null or recurrence_parent_id <> id),

  -- Ocorrencia nao e mae. Cadeia de recorrencia (filho que tambem gera) e
  -- estado que nenhuma tela do original sabe ler: AccountsPayable.jsx:419
  -- resolve o grupo com `recurrence_parent_id || id`, ou seja, assume UM nivel.
  constraint accounts_payable_occurrence_is_not_recurring_check
    check (recurrence_parent_id is null or is_recurring = false)
);

alter table public.accounts_payable
  add constraint accounts_payable_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id);

-- Auto-referencia COMPOSTA: sem tenant_id, uma ocorrencia poderia apontar para
-- a linha-mae de outro escritorio, e o "editar todos os futuros" atravessaria a
-- fronteira sem que nenhuma policy fosse violada (a RLS filtra o que se le, nao
-- o que se aponta). ON DELETE nao: apagar a mae com ocorrencias vivas precisa
-- ser decisao explicita da tela, que ja oferece "excluir todos os futuros".
alter table public.accounts_payable
  add constraint accounts_payable_recurrence_parent_id_fkey
  foreign key (recurrence_parent_id, tenant_id)
  references public.accounts_payable (id, tenant_id);

comment on table public.accounts_payable is
  'Despesa a pagar, de AccountPayable do base44, com recorrencia em duas camadas: a linha-MAE (is_recurring) e o modelo, e cada ocorrencia e uma linha com recurrence_parent_id apontando para ela. generated_count NAO e coluna - e a contagem de filhos, na view accounts_payable_status (0043). O estado "Em atraso" tambem nao esta aqui, pelo mesmo motivo.';

comment on column public.accounts_payable.supplier_name is
  'Fornecedor ou destinatario do pagamento, TEXTO LIVRE como no original (o rotulo do formulario e "Fornecedor / Destinatario"). NAO e desnormalizacao de suppliers: a tabela de fornecedores so nasce no modulo 8, e boa parte das despesas do escritorio nao tem fornecedor cadastrado (folha, impostos, aluguel). Se o modulo 8 decidir ligar os dois, entra supplier_id ao lado, e este campo continua valendo para o que nao esta no cadastro.';

comment on column public.accounts_payable.category is
  'Categoria da despesa, enum expense_category, gravada na propria linha - required no original. Independente da tabela financial_categories, que nenhuma tela do base44 consulta.';

comment on column public.accounts_payable.competence_month is
  'Mes de competencia da despesa. DIVERGE do original de proposito: la e texto "MM/YYYY" (AccountPayableForm.jsx:218), que ordena errado em qualquer lugar que ordene texto - "01/2027" vem antes de "02/2026" - e o relatorio mensal e exatamente o que esta tela produz. Aqui e date presa ao primeiro dia do mes por check. A importacao converte "MM/YYYY" em date(YYYY-MM-01); a tela continua exibindo MM/YYYY.';

comment on column public.accounts_payable.is_recurring is
  'Marca a linha-MAE da recorrencia: e dela que as ocorrencias sao geradas. Falso nas ocorrencias, como o original grava (AccountsPayable.jsx:205). Check impede que uma ocorrencia tambem seja mae - a tela resolve o grupo com um unico nivel.';

comment on column public.accounts_payable.recurrence_parent_id is
  'Linha-mae desta ocorrencia. Nulo na propria mae e nas despesas avulsas. FK COMPOSTA com tenant_id: sem isso, "editar/excluir todos os futuros" alcancaria linhas de outro escritorio.';

comment on column public.accounts_payable.recurrence_status is
  'Situacao da recorrencia, gravada na linha-MAE. Pausada para de gerar novas ocorrencias sem apagar as existentes; Encerrada e o estado final que a exclusao em lote deixa (AccountsPayable.jsx:331). Nullable, e SEM default, ao contrario do original, que traz "Ativa" na propria entidade: com default, toda despesa avulsa nasceria com situacao de recorrencia que nao existe.';

comment on column public.accounts_payable.legacy_id is
  'Id da linha de AccountPayable no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint accounts_payable_recurrence_plan_check on public.accounts_payable is
  'Recorrencia declarada precisa dizer com que frequencia e a partir de quando. O original nao exige: quando recurrence_start_date falta ele usa due_date (AccountsPayable.jsx:152) e quando a frequencia nao bate com o mapa ele assume mensal (:171). Sao dois palpites que geram lancamento financeiro em data que ninguem pediu, e ninguem descobre ate a conta vencer.';

comment on constraint accounts_payable_occurrence_is_not_recurring_check on public.accounts_payable is
  'Ocorrencia nao pode ser mae de outra. A tela resolve o grupo da recorrencia com `recurrence_parent_id || id` (AccountsPayable.jsx:419), ou seja, assume exatamente um nivel; uma cadeia deixaria ocorrencias fora de todo "editar/excluir todos os futuros" e faria generated_count contar so o primeiro nivel.';

-- Indices ---------------------------------------------------------------------

create index accounts_payable_tenant_id_created_at_idx
  on public.accounts_payable (tenant_id, created_at desc);

create index accounts_payable_tenant_id_due_date_idx
  on public.accounts_payable (tenant_id, due_date);

create index accounts_payable_tenant_id_status_due_date_idx
  on public.accounts_payable (tenant_id, status, due_date);

create index accounts_payable_tenant_id_category_idx
  on public.accounts_payable (tenant_id, category);

-- O grupo da recorrencia, e a contagem de filhos da view accounts_payable_status.
-- Parcial: a maioria das despesas nao pertence a recorrencia nenhuma.
create index accounts_payable_tenant_id_recurrence_parent_id_idx
  on public.accounts_payable (tenant_id, recurrence_parent_id)
  where recurrence_parent_id is not null;

create trigger accounts_payable_set_updated_at
  before update on public.accounts_payable
  for each row execute function public.set_updated_at();

-- RLS AINDA NAO EXISTE NESTAS TRES TABELAS.
--
-- Esta migration nao cria policy nem GRANT. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, elas nascem sem privilegio algum para anon e
-- authenticated, ou seja, invisiveis pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela ficar exposta.
-- Precisa dos dois. A 0042 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades, por tabela.
--
-- Recorte esperado (docs/SCHEMA-PLAN.md, modulo 7): colaborador active do tenant
-- le; escrita por can_edit_menu('receivables') em accounts_receivable e
-- can_edit_menu('payables') em accounts_payable e financial_categories.
