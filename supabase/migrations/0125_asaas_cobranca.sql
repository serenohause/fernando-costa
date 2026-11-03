-- Integracao com o Asaas: a conta do escritorio, o espelho do cliente, a
-- cobranca da parcela e o diario dos avisos. Fase 1, camada de SCHEMA.
--
-- O QUE A FASE 1 FAZ
--   Emitir cobranca de UMA parcela de accounts_receivable (PIX e boleto),
--   mandar o link de pagamento ao cliente e deixar a parcela virar paga pelo
--   AVISO do Asaas, nunca pelo clique de alguem. Cartao fica para o link de
--   pagamento do proprio Asaas, fora desta fase.
--
-- UMA CONTA ASAAS POR ESCRITORIO (decisao de produto)
--   Cada escritorio liga a propria conta e recebe direto no caixa dele. Logo a
--   credencial e POR TENANT, e nao uma chave global em segredo de Edge
--   Function: nao existe um lugar onde a cobranca de todos os escritorios
--   possa ser emitida com a mesma chave.
--
-- ONDE MORA O SEGREDO, E POR QUE NAO NUMA COLUNA
--   Mesma arquitetura da 0085 (Google Agenda): o segredo vai para o Vault e a
--   tabela guarda so o ID dele. A API Key do Asaas emite cobranca, consulta
--   extrato e dispara transferencia - quem a tem, tem o caixa do escritorio.
--   Um SELECT na tabela, por engano, por bug de policy ou por backup vazado,
--   nao devolve credencial nenhuma, e a leitura do segredo nao passa pelo
--   PostgREST: as funcoes que o alcancam serao `security definer` com EXECUTE
--   apenas para service_role (camada seguinte).
--
-- O VOCABULARIO DO PROVEDOR FICA EM TEXTO, O NOSSO FICA EM ENUM
--   `status` e `billing_type` sao palavras do Asaas, e a documentacao avisa que
--   novos atributos podem aparecer sem aviso previo. Enum do Postgres (ou check
--   fechado) transformaria status novo DELES em erro de escrita NOSSO - o aviso
--   chegando e a parcela nao baixando, que e exatamente a falha que esta fase
--   existe para evitar. Ja o ambiente (sandbox/producao) e nosso e e enum.
--
-- O QUE ESTA MIGRATION NAO FAZ
--   - Nao cria policy de RLS. As quatro tabelas nascem com RLS habilitada e
--     sem policy: sem policy ninguem le nada. As policies sao do rls-guardian,
--     no commit seguinte. Tabela nova nasce fechada, de proposito.
--   - Nao toca em accounts_receivable. Receber valor diferente do previsto
--     (juros e multa) e decisao de fase 2, e e do usuario.

-- 0. O ambiente -----------------------------------------------------------------
--
--    ID DE SANDBOX NAO EXISTE EM PRODUCAO. O desenvolvimento acontece em
--    sandbox, e um `cus_` ou `pay_` de sandbox apontado contra producao nao e
--    "nao encontrado": e um espelho que parece valido e nunca fecha. Por isso o
--    ambiente entra na CHAVE UNICA do espelho de cliente, e nao so na linha.

create type public.asaas_environment as enum ('sandbox', 'production');

comment on type public.asaas_environment is
  'Qual ambiente do Asaas a conexao fala. Enum porque e vocabulario NOSSO e sao dois, para sempre - ao contrario de status e billingType, que sao do provedor e ficam em texto. Existe para id de sandbox nunca ser reaproveitado como se valesse em producao.';

-- 1. A conta do escritorio ------------------------------------------------------

create table public.asaas_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  environment public.asaas_environment not null,

  -- O ID DO SEGREDO NO VAULT, e nao a chave.
  api_key_secret_id uuid not null,

  -- O TOKEN QUE AUTENTICA O AVISO, tambem no Vault.
  --
  -- Nullable porque a ordem do fluxo e: validar a chave, depois registrar o
  -- webhook. Nulo significa "cobranca pode ser emitida, mas aviso nenhum pode
  -- ser confiado" - e quem recebe o webhook precisa recusar o evento nesse
  -- estado, em vez de aceitar sem conferir.
  webhook_token_secret_id uuid,

  -- O id do webhook no Asaas, para poder alterar ou remover o que criamos.
  -- Sem ele, reconfigurar a integracao deixa webhook velho vivo apontando para
  -- uma URL que talvez nao exista mais, e o Asaas desativa o webhook por
  -- acumulo de falha.
  asaas_webhook_id text,

  -- Quem ligou. Mesma armadilha do SET NULL desarmada na 0085: ver a FK.
  connected_by_id uuid,
  connected_at timestamptz not null default now(),

  -- Diagnostico, igual ao record_result da 0085: quando a API do Asaas
  -- respondeu certo pela ultima vez, e qual foi o ultimo erro. Sem isso, "a
  -- cobranca nao foi emitida" nao tem por onde comecar.
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint asaas_connections_id_tenant_id_key unique (id, tenant_id),

  -- UMA CONEXAO POR ESCRITORIO. Duas contas ligadas seriam duas contas
  -- recebendo pelo mesmo contrato, sem nada dizendo qual vale.
  constraint asaas_connections_tenant_id_key unique (tenant_id),

  -- SET NULL COM LISTA DE COLUNAS: sem ela o SET NULL zera tambem o tenant_id,
  -- que e NOT NULL, e apagar o colaborador que conectou falharia com 23502.
  -- Mesma armadilha desarmada pela 0073 e repetida na 0085.
  constraint asaas_connections_connected_by_fkey
    foreign key (connected_by_id, tenant_id)
    references public.collaborators (id, tenant_id)
    on delete set null (connected_by_id),

  constraint asaas_connections_webhook_id_not_blank_check
    check (asaas_webhook_id is null or btrim(asaas_webhook_id) <> '')
);

create index asaas_connections_tenant_id_created_at_idx
  on public.asaas_connections (tenant_id, created_at);

create trigger asaas_connections_set_updated_at
  before update on public.asaas_connections
  for each row execute function public.set_updated_at();

comment on table public.asaas_connections is
  'A conta Asaas que o escritorio ligou para cobrar os clientes dele. Guarda METADADO: a API Key e o token do webhook vivem no Vault e as colunas *_secret_id so apontam para eles. Uma conexao por escritorio, porque cada escritorio recebe no caixa proprio.';

comment on column public.asaas_connections.api_key_secret_id is
  'ID no Vault da API Key do Asaas deste escritorio. A chave em si nunca passa por esta tabela nem pelo PostgREST: quem a le sao funcoes security definer com EXECUTE apenas para service_role. Ela emite cobranca e movimenta saldo - vazar essa coluna nao vaza nada, vazar a chave vaza o caixa.';

comment on column public.asaas_connections.webhook_token_secret_id is
  'ID no Vault do authToken do webhook. E o valor que o Asaas devolve no cabecalho `asaas-access-token` em CADA aviso, e e a unica coisa que distingue um aviso legitimo de alguem postando "parcela paga" na nossa URL publica. A doc exige de 32 a 255 caracteres sem espaco e mostra o valor UMA vez, no momento em que o webhook e criado - por isso ele e gerado por nos e guardado aqui antes de ser enviado. Nulo enquanto o webhook nao foi registrado, e nesse estado nenhum aviso pode ser aceito.';

comment on column public.asaas_connections.environment is
  'Sandbox ou producao. Esta na linha porque os ids do Asaas nao atravessam ambiente: trocar o ambiente de um escritorio invalida todo espelho (cus_, pay_) emitido antes. Ver o comentario de asaas_customers.';

comment on column public.asaas_connections.last_error is
  'Ultimo erro devolvido pela API do Asaas, no estilo do record_result da 0085. A tela de Configuracoes mostra isto; sem isto, chave vencida e chave de sandbox em producao tem o mesmo sintoma (nada acontece) e nenhum rastro.';

-- 2. O espelho do cliente -------------------------------------------------------
--
--    POR QUE ESTA TABELA EXISTE, EM UMA FRASE: a API do Asaas PERMITE criar
--    cliente duplicado (esta escrito na doc dela), entao a unicidade do lado de
--    CA e o que impede dois `cus_` para a mesma pessoa, cada um com metade do
--    historico de cobranca.

create table public.asaas_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  client_id uuid not null,

  environment public.asaas_environment not null,

  -- `id` da resposta de POST /v3/customers, no formato cus_...
  asaas_customer_id text not null,

  -- Quando o espelho foi conferido contra o Asaas pela ultima vez. Nome e
  -- documento mudam aqui e nao mudam la sozinhos.
  synced_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint asaas_customers_id_tenant_id_key unique (id, tenant_id),

  -- UM CLIENTE DO ASAAS POR CLIENTE NOSSO, POR AMBIENTE. O ambiente faz parte
  -- da chave, e nao e detalhe: sem ele, trocar de sandbox para producao ou
  -- colide com a linha antiga ou - pior - reaproveita um cus_ de sandbox que em
  -- producao nao existe.
  constraint asaas_customers_client_environment_key
    unique (tenant_id, client_id, environment),

  -- O caminho de volta: dado um cus_ que chegou num evento, qual cliente e.
  constraint asaas_customers_asaas_id_environment_key
    unique (tenant_id, environment, asaas_customer_id),

  -- FK composta, como no resto do sistema: referencia por id sozinho deixaria
  -- espelhar cliente de OUTRO escritorio, porque a RLS filtra o que se le, nao
  -- o que se aponta. CASCADE porque a linha so descreve o cliente - mantida sem
  -- ele, e um ponteiro orfao para um cus_ que ninguem mais sabe de quem era.
  constraint asaas_customers_client_fkey
    foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id)
    on delete cascade,

  constraint asaas_customers_asaas_id_format_check
    check (asaas_customer_id ~ '^cus_[A-Za-z0-9]+$')
);

create index asaas_customers_tenant_id_created_at_idx
  on public.asaas_customers (tenant_id, created_at);

comment on table public.asaas_customers is
  'Liga public.clients ao `customer` do Asaas (cus_...). Existe porque a API do Asaas ACEITA criar cliente duplicado - esta na doc dela - e sem unicidade do nosso lado o mesmo cliente ganharia dois cus_, cada um com parte do historico. O documento (cpfCnpj) exigido na criacao vem de clients.tax_id_digits; cliente sem documento nao pode ser espelhado, e essa recusa e de quem chama a API, nao desta tabela (nenhuma coluna nova foi criada em clients para isso).';

comment on column public.asaas_customers.environment is
  'Em qual ambiente este cus_ vale. Faz parte das duas chaves unicas de proposito: id de sandbox NAO existe em producao, e reaproveitar um por descuido produz o pior dos erros - cobranca emitida para um cliente que o Asaas de producao nunca viu.';

comment on column public.asaas_customers.synced_at is
  'Ultima vez que o cadastro foi conferido contra o Asaas. Nome, documento e telefone mudam no nosso banco e nao mudam la sozinhos; sem este carimbo nao ha como saber se o boleto vai sair com o dado velho.';

-- 3. A cobranca -----------------------------------------------------------------

create table public.asaas_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- A parcela que esta cobranca cobra.
  receivable_id uuid not null,

  environment public.asaas_environment not null,

  -- `id` da resposta, no formato pay_...
  asaas_payment_id text not null,

  -- `externalReference`: o id da parcela, mandado por nos na criacao.
  --
  -- POR QUE ELE E GUARDADO, E NAO SO ENVIADO: o POST de cobranca do Asaas NAO
  -- tem cabecalho de idempotencia. Depois de um timeout, a unica forma de saber
  -- se a cobranca ja nasceu antes de tentar de novo e consultar o Asaas por
  -- esta referencia. Sem ela, "a resposta nao chegou" e indistinguivel de "a
  -- cobranca nao foi criada", e repetir cobra o cliente duas vezes.
  external_reference text,

  -- VOCABULARIO DO ASAAS, EM TEXTO. Ver o comentario de cada coluna.
  status text not null,
  billing_type text not null,

  -- Dinheiro: numeric(14,2), igual a accounts_receivable.value.
  value numeric(14, 2) not null,
  net_value numeric(14, 2),
  original_value numeric(14, 2),
  interest_value numeric(14, 2),

  due_date date not null,
  original_due_date date,

  -- Tres datas que NAO sao a mesma coisa, e e por isso que sao tres colunas.
  payment_date date,
  client_payment_date date,
  credit_date date,
  estimated_credit_date date,

  -- Os links que o Asaas hospeda.
  invoice_url text,
  bank_slip_url text,
  transaction_receipt_url text,

  invoice_number text,

  -- `deleted`: o Asaas nao tem status de cancelamento. Remover a cobranca e
  -- este booleano, e e ele que o indice unico parcial consulta.
  deleted boolean not null default false,

  -- `installment` e `installmentNumber` do Asaas: o parcelamento DELE, que nao
  -- e o nosso. Ver o comentario da coluna.
  asaas_installment_id text,
  asaas_installment_number smallint,

  -- PIX: so o copia e cola e a validade. Ver o comentario da coluna.
  pix_payload text,
  pix_expires_at timestamptz,

  -- Ultima vez que esta linha foi atualizada a partir do Asaas (resposta de
  -- consulta ou evento aplicado). Distingue "espelho fresco" de "espelho que
  -- paramos de receber aviso", que na cobranca e a diferenca entre conferir e
  -- adivinhar.
  synced_at timestamptz not null default now(),

  created_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint asaas_charges_id_tenant_id_key unique (id, tenant_id),

  -- O id do Asaas e unico de verdade: um pay_ nao se repete.
  constraint asaas_charges_asaas_payment_id_key unique (asaas_payment_id),

  constraint asaas_charges_receivable_fkey
    foreign key (receivable_id, tenant_id)
    references public.accounts_receivable (id, tenant_id),

  constraint asaas_charges_created_by_fkey
    foreign key (created_by_id, tenant_id)
    references public.collaborators (id, tenant_id)
    on delete set null (created_by_id),

  constraint asaas_charges_asaas_payment_id_format_check
    check (asaas_payment_id ~ '^pay_[A-Za-z0-9]+$'),

  -- Os tres campos de vocabulario do provedor so recusam VAZIO e tamanho
  -- absurdo. Nenhuma lista de valores: ver o cabecalho.
  constraint asaas_charges_status_not_blank_check
    check (btrim(status) <> '' and length(status) <= 60),
  constraint asaas_charges_billing_type_not_blank_check
    check (btrim(billing_type) <> '' and length(billing_type) <= 60),

  -- Dinheiro: > 0, e nao >= 0, pelo mesmo motivo de accounts_receivable.value -
  -- cobranca de zero real nao e cobranca. Os derivados do Asaas aceitam zero
  -- (sem juros e zero) mas nunca negativo.
  constraint asaas_charges_value_positive_check check (value > 0),
  constraint asaas_charges_net_value_not_negative_check
    check (net_value is null or net_value >= 0),
  constraint asaas_charges_original_value_positive_check
    check (original_value is null or original_value > 0),
  constraint asaas_charges_interest_value_not_negative_check
    check (interest_value is null or interest_value >= 0),

  -- PIX: copia e cola sem validade e um codigo que ninguem sabe se ainda vale,
  -- e validade sem codigo nao paga nada. Andam juntos.
  constraint asaas_charges_pix_pair_check
    check ((pix_payload is null) = (pix_expires_at is null)),
  constraint asaas_charges_pix_payload_not_blank_check
    check (pix_payload is null or btrim(pix_payload) <> ''),

  constraint asaas_charges_installment_number_positive_check
    check (asaas_installment_number is null or asaas_installment_number >= 1)
);

-- UMA COBRANCA ATIVA POR PARCELA, e nao uma cobranca por parcela.
--
-- Unique simples em (tenant_id, receivable_id) impediria o caso legitimo:
-- cobranca emitida com vencimento errado e REMOVIDA (deleted) e outra emitida
-- no lugar. O indice e PARCIAL, e vale so para a cobranca viva - e o que
-- impede duas cobrancas abertas para a mesma parcela, que e cobrar o cliente
-- duas vezes.
create unique index asaas_charges_one_active_per_receivable_idx
  on public.asaas_charges (tenant_id, receivable_id)
  where not deleted;

create index asaas_charges_tenant_id_created_at_idx
  on public.asaas_charges (tenant_id, created_at);

-- O caminho de volta do evento: chega um pay_ ou uma externalReference e e
-- preciso achar a linha antes de aplicar o aviso.
create index asaas_charges_tenant_id_external_reference_idx
  on public.asaas_charges (tenant_id, external_reference)
  where external_reference is not null;

create trigger asaas_charges_set_updated_at
  before update on public.asaas_charges
  for each row execute function public.set_updated_at();

comment on table public.asaas_charges is
  'Liga uma parcela de accounts_receivable a uma cobranca (`payment`) do Asaas. Espelho do que o provedor diz, nao fonte: quem decide se a parcela esta paga continua sendo accounts_receivable, atualizada a partir do aviso do Asaas. Uma cobranca ATIVA por parcela, garantida pelo indice unico parcial asaas_charges_one_active_per_receivable_idx.';

comment on column public.asaas_charges.status is
  'Status da cobranca, como o Asaas escreve (PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, RECEIVED_IN_CASH, REFUND_REQUESTED, REFUND_IN_PROGRESS, CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE, AWAITING_CHARGEBACK_REVERSAL, DUNNING_REQUESTED, DUNNING_RECEIVED, AWAITING_RISK_ANALYSIS - 14 hoje). TEXTO, E NAO ENUM NEM CHECK FECHADO, DE PROPOSITO: a doc avisa que novos atributos podem aparecer sem aviso previo, e dominio fechado transformaria status novo DELES em erro de escrita NOSSO - o aviso chegando e a parcela nao baixando. Nao "arrume" isto virando enum. Para ler: CONFIRMED e pago com saldo ainda nao liberado, RECEIVED e saldo disponivel; cancelamento nao e status, e a coluna deleted.';

comment on column public.asaas_charges.billing_type is
  'Forma de cobranca (billingType), como o Asaas escreve. Texto pelo mesmo motivo do status, e aqui a divergencia ja existe hoje: a CRIACAO aceita UNDEFINED, BOLETO, CREDIT_CARD e PIX, a RESPOSTA pode trazer DEBIT_CARD, TRANSFER e DEPOSIT, e o texto do webhook menciona RECEIVED_IN_CASH, que nao esta no enum da resposta. A fase 1 emite PIX e BOLETO; o resto aparece quando o cliente paga por outro caminho.';

comment on column public.asaas_charges.value is
  'Valor cobrado (value). Nao substitui accounts_receivable.value: a parcela continua dizendo quanto o escritorio tem a receber, e esta coluna diz quanto foi pedido ao cliente naquela cobranca.';

comment on column public.asaas_charges.net_value is
  'Valor liquido (netValue): o que cai na conta depois da tarifa do Asaas. Guardado porque a diferenca com value NAO e desconto nem erro de cobranca, e e a unica forma de conciliar o extrato sem recalcular tarifa por fora.';

comment on column public.asaas_charges.original_value is
  'originalValue: o valor ORIGINAL, preenchido pelo Asaas quando a cobranca e paga com juros e multa (nesse caso value traz o valor efetivo). O que fazer com a diferenca - lancar o acrescimo no financeiro ou ignorar - e decisao de fase 2, do usuario; esta coluna existe para o dado nao ser perdido enquanto isso.';

comment on column public.asaas_charges.interest_value is
  'interestValue: juros e multa aplicados. Mesma situacao de originalValue - registrado agora, tratado no financeiro na fase 2.';

comment on column public.asaas_charges.original_due_date is
  'originalDueDate: o vencimento com que a cobranca nasceu. due_date muda quando o vencimento e prorrogado; este nao. Serve para saber que houve prorrogacao, que no boleto muda o documento que o cliente tem em maos.';

comment on column public.asaas_charges.payment_date is
  'paymentDate: quando o Asaas LIQUIDOU a cobranca. Nao e a data em que o cliente pagou (essa e client_payment_date) nem quando o dinheiro fica disponivel (credit_date). Sao tres datas porque sao tres fatos, e usar uma pela outra da baixa no dia errado.';

comment on column public.asaas_charges.client_payment_date is
  'clientPaymentDate: quando o CLIENTE pagou. E esta a data que interessa ao cliente e ao contrato - boleto pago na sexta e liquidado na segunda continua tendo sido pago na sexta.';

comment on column public.asaas_charges.credit_date is
  'creditDate: quando o valor ficou disponivel na conta Asaas do escritorio. Com estimated_credit_date ao lado, e o que explica ao escritorio por que a cobranca esta paga e o saldo ainda nao.';

comment on column public.asaas_charges.invoice_url is
  'invoiceUrl: a pagina de pagamento hospedada pelo Asaas. E ESTE o link que vai ao cliente por WhatsApp - ele serve PIX, boleto e cartao na mesma pagina, entao nao e preciso escolher a forma de pagamento pelo cliente.';

comment on column public.asaas_charges.bank_slip_url is
  'bankSlipUrl: o PDF do boleto. Guardado para quem pede "manda o boleto" e nao a pagina; o link principal continua sendo invoice_url.';

comment on column public.asaas_charges.transaction_receipt_url is
  'transactionReceiptUrl: o comprovante hospedado pelo Asaas, que so existe depois do pagamento. E o que se manda quando o cliente pede recibo, e evita que alguem do escritorio precise fabricar um.';

comment on column public.asaas_charges.invoice_number is
  'invoiceNumber: o numero que o Asaas da a cobranca e que aparece no boleto e na pagina de pagamento. E por ele que o cliente se refere a cobranca ao telefone, e sem guardar nao ha como achar a parcela a partir do que ele le em voz alta.';

comment on column public.asaas_charges.deleted is
  'A cobranca foi removida no Asaas. Existe porque o Asaas NAO tem status de cancelamento: remover e este booleano. E a coluna que o indice unico parcial consulta - cobranca removida libera a parcela para uma nova emissao, cobranca viva nao.';

comment on column public.asaas_charges.external_reference is
  'externalReference que mandamos na criacao: o id da parcela. O POST de cobranca do Asaas NAO aceita cabecalho de idempotencia, entao depois de um timeout esta e a unica forma de perguntar ao Asaas se a cobranca ja nasceu antes de tentar outra vez. Sem ela, repetir uma chamada que na verdade funcionou cobra o cliente duas vezes.';

comment on column public.asaas_charges.asaas_installment_id is
  'installment: o id do parcelamento DO ASAAS, quando a cobranca nasceu dentro de um. A fase 1 emite cobranca avulsa por parcela nossa - o parcelamento ja esta em accounts_receivable - entao normalmente e nulo. Fica registrado para cobranca criada por fora (pelo painel do Asaas) nao virar um espelho que mente.';

comment on column public.asaas_charges.pix_payload is
  'payload do QR Code: o copia e cola, que e o que vai em texto para o cliente. A imagem (encodedImage, base64) NAO e guardada em coluna de proposito - sao dezenas de KB por linha, inflam a tabela e o backup, e a imagem e so uma renderizacao deste mesmo payload, refazivel na hora ou buscavel de novo na API.';

comment on column public.asaas_charges.pix_expires_at is
  'expirationDate do QR Code. O QR Code do Asaas e DINAMICO: vence e so pode ser pago uma vez. Sem esta data o sistema mostraria para sempre um codigo que o banco do cliente recusa, e o cliente concluiria que o erro e dele.';

comment on index public.asaas_charges_one_active_per_receivable_idx is
  'Uma cobranca VIVA por parcela. Parcial (where not deleted) e nao unique simples porque remover a cobranca e emitir outra e caso legitimo - vencimento errado, valor corrigido. O que ele impede e o caso grave: duas cobrancas abertas para a mesma parcela, ou seja, cobrar o cliente duas vezes.';

-- 4. O diario dos avisos do Asaas -----------------------------------------------
--
--    ESTA E A TABELA QUE IMPEDE PAGAMENTO CONTADO DUAS VEZES.
--
--    A entrega do webhook e AT LEAST ONCE: a doc do Asaas diz, com essas
--    palavras, que o mesmo evento pode chegar mais de uma vez, e manda usar o
--    `id` do evento para idempotencia. Entao o id do evento e UNIQUE aqui, e e
--    essa constraint - nao um `if` no codigo - que faz a segunda entrega do
--    mesmo aviso falhar na gravacao em vez de baixar a parcela de novo.
--
--    RECEBIDO E PROCESSADO SAO DUAS COISAS, EM DUAS COLUNAS. A doc manda
--    responder HTTP 200 SO DEPOIS de persistir o evento, e processar em
--    seguida. Quem recebe grava a linha (received_at) e responde 200; o
--    processamento carimba processed_at ou processing_error. Uma coluna so
--    forcaria escolher entre responder antes de gravar (evento perdido, fila do
--    Asaas parada) ou processar dentro do request (timeout vira reentrega).

create table public.asaas_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- O `id` do evento, como ele vem: 'evt_05b708f961d739ea7eba7e4db318f621&368604920'.
  asaas_event_id text not null,

  -- `event`: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, ... Texto, nao enum.
  event_name text not null,

  -- O corpo inteiro, como chegou.
  payload jsonb not null,

  -- `dateCreated` do evento, segundo o Asaas. Nao e received_at: evento criado
  -- as 9h e reentregue as 14h tem as duas datas diferentes, e a ordem que
  -- importa para aplicar e a do provedor.
  --
  -- SEM FUSO, E DE PROPOSITO. O exemplo da doc traz "2024-06-12 16:45:03", sem
  -- offset e sem nenhuma frase dizendo em que fuso isso esta. Em `timestamptz`
  -- o Postgres completaria o que falta com o fuso da sessao (UTC no Supabase),
  -- e se o Asaas estiver mandando hora de Sao Paulo o valor nasceria tres horas
  -- deslocado, com aparencia de dado exato. `timestamp` guarda o relogio do
  -- provedor como ele falou, que e o que sabemos de fato. Serve para ordenar
  -- eventos da mesma cobranca, que e o uso; o texto cru continua no payload. No
  -- dia em que o fuso for confirmado com eles, converte-se.
  event_created_at timestamp,

  -- `account.id`: a conta Asaas a que o evento pertence. Extraido do corpo para
  -- flagrar o caso em que o aviso de um escritorio chega pela URL de outro.
  --
  -- O CAMINHO E DENTRO DO OBJETO, e isto foi conferido na doc em 03/11/2026. O
  -- exemplo de https://docs.asaas.com/docs/webhook-para-cobrancas traz
  -- "account": {"id": "47ed0d25-...", "ownerId": null}, ou seja um objeto, e o
  -- id dele e um UUID, nao um 'acc_'. Com `payload ->> 'account'` a coluna
  -- guardaria o objeto inteiro serializado e a comparacao com a conta do
  -- escritorio nunca casaria, sem erro nenhum aparecer.
  --
  -- NULO E ESPERADO: a pagina de recebimento de eventos nao lista `account` nos
  -- campos da notificacao; ele aparece so no exemplo de cobrancas. Quem compara
  -- trata ausencia como "nao da para conferir", nao como "nao casou".
  asaas_account_id text
    generated always as (nullif(btrim(payload -> 'account' ->> 'id'), '')) stored,

  -- O pay_ do evento, extraido do corpo pelo banco. Coluna gerada pelo mesmo
  -- motivo dos derivados de clients (0015): derivado escrito pela aplicacao so
  -- esta certo enquanto toda escrita passar pelo mesmo caminho.
  asaas_payment_id text
    generated always as (nullif(btrim(payload -> 'payment' ->> 'id'), '')) stored,

  received_at timestamptz not null default now(),

  processed_at timestamptz,
  processing_error text,
  processing_attempts smallint not null default 0,

  constraint asaas_webhook_events_id_tenant_id_key unique (id, tenant_id),

  -- A CONSTRAINT QUE GARANTE A IDEMPOTENCIA. Global, e nao por tenant: o
  -- evento chega ANTES de sabermos de quem ele e (o tenant sai do authToken), e
  -- se a resolucao errar o escritorio a deduplicacao ainda tem que valer.
  constraint asaas_webhook_events_asaas_event_id_key unique (asaas_event_id),

  constraint asaas_webhook_events_event_id_not_blank_check
    check (btrim(asaas_event_id) <> ''),
  constraint asaas_webhook_events_event_name_not_blank_check
    check (btrim(event_name) <> '' and length(event_name) <= 80),

  -- O corpo e um objeto JSON, nao um array nem um escalar. Payload que nao e
  -- objeto e entrega quebrada, e e melhor saber na gravacao.
  constraint asaas_webhook_events_payload_is_object_check
    check (jsonb_typeof(payload) = 'object'),

  constraint asaas_webhook_events_processed_after_received_check
    check (processed_at is null or processed_at >= received_at),

  -- Erro de processamento sem tentativa nenhuma e um registro que nao explica
  -- nada.
  constraint asaas_webhook_events_error_needs_attempt_check
    check (processing_error is null or processing_attempts > 0)
);

create index asaas_webhook_events_tenant_id_received_at_idx
  on public.asaas_webhook_events (tenant_id, received_at);

-- A FILA. O processamento le exatamente isto: o que chegou e ainda nao foi
-- aplicado. Parcial porque a tabela cresce para sempre e a fila e sempre curta.
create index asaas_webhook_events_pending_idx
  on public.asaas_webhook_events (tenant_id, received_at)
  where processed_at is null;

-- O caminho do evento para a cobranca, para aplicar o aviso na linha certa.
create index asaas_webhook_events_tenant_id_payment_id_idx
  on public.asaas_webhook_events (tenant_id, asaas_payment_id)
  where asaas_payment_id is not null;

comment on table public.asaas_webhook_events is
  'Diario dos avisos do Asaas, gravado antes de qualquer efeito. E a tabela que impede pagamento contado duas vezes: a entrega e at least once (a doc diz que o mesmo evento pode chegar mais de uma vez e manda deduplicar pelo id), e o unique em asaas_event_id e o que faz a reentrega falhar na gravacao em vez de baixar a parcela de novo. Grava-se e responde-se 200; o processamento vem depois e carimba processed_at ou processing_error.';

comment on column public.asaas_webhook_events.asaas_event_id is
  'O `id` do evento, exatamente como o Asaas manda - por exemplo evt_05b708f961d739ea7eba7e4db318f621&368604920. TEXTO, nao uuid: tem `&` no meio e a doc nao promete formato. UNIQUE, e essa constraint e a idempotencia do modulo inteiro: nao ha segundo lugar onde a duplicata seja barrada.';

comment on column public.asaas_webhook_events.event_name is
  'Nome do evento (`event`). Sao 30 eventos de cobranca; a fase 1 trata PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED e PAYMENT_REFUNDED. Texto, e nao enum, pelo mesmo motivo do status da cobranca: evento novo do provedor nao pode virar erro de escrita nosso e devolver 500 para o Asaas, que entao reentrega em loop.';

comment on column public.asaas_webhook_events.payload is
  'O corpo do aviso como chegou, sem recorte. O primeiro nivel traz id, event, dateCreated, account e payment. Guardado inteiro porque e a prova do que o provedor disse: quando o espelho da cobranca divergir, e aqui que se confere quem errou, e e daqui que um reprocessamento parte sem precisar pedir o evento de novo (o Asaas nao reenvia a pedido).';

comment on column public.asaas_webhook_events.received_at is
  'Quando o aviso entrou na nossa porta. Separado de processed_at de proposito: a doc do Asaas manda responder 200 somente DEPOIS de persistir, e processar em seguida. Esta coluna e o carimbo do 200.';

comment on column public.asaas_webhook_events.processed_at is
  'Quando o aviso foi efetivamente aplicado (parcela baixada, cobranca atualizada). Nulo e a FILA, nao um erro - evento recem-chegado esperando processamento. Nulo antigo com processing_error preenchido e o que precisa de gente.';

comment on column public.asaas_webhook_events.processing_error is
  'Por que o processamento falhou, quando falhou. Existe para o evento problematico ficar visivel em vez de desaparecer: o 200 ja foi dado, entao o Asaas nao vai reentregar, e sem esta coluna a parcela ficaria aberta sem nada explicando.';

comment on column public.asaas_webhook_events.asaas_account_id is
  '`account` do corpo, extraido pelo banco. Serve para flagrar aviso que chegou pela URL do escritorio errado - com uma conta Asaas por escritorio, evento de conta diferente da conexao daquele tenant e sinal de configuracao trocada, e nao de pagamento.';

comment on column public.asaas_webhook_events.asaas_payment_id is
  'O pay_ do evento (payload.payment.id), extraido pelo banco. Coluna gerada e nao escrita pela aplicacao pelo mesmo motivo dos derivados de clients (0015): derivado que a aplicacao preenche so esta correto enquanto toda escrita passar pelo mesmo caminho. Nulo em evento cujo corpo nao traz cobranca.';

-- 5. RLS: habilitada, SEM POLICY --------------------------------------------------
--
--    De proposito. Sem policy, ninguem le e ninguem escreve nada nestas quatro
--    tabelas - nem authenticated, nem anon. As policies sao escritas pelo
--    rls-guardian no commit seguinte, com o teste de isolamento ao lado
--    (CLAUDE.md: nenhuma policy e aceita sem teste de isolamento).
--
--    Tabela nova nasce fechada: habilitar RLS depois de a tabela existir e o
--    intervalo em que uma cobranca de um escritorio e legivel por outro.

alter table public.asaas_connections enable row level security;
alter table public.asaas_customers enable row level security;
alter table public.asaas_charges enable row level security;
alter table public.asaas_webhook_events enable row level security;
