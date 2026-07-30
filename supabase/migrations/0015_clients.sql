-- Modulo 2 (CRM) - clients, vindo de Client do base44 (26 campos).
--
-- Tres decisoes estruturais desta tabela, todas registradas em COMMENT abaixo
-- para quem abrir o schema sem o repositorio na mao:
--
--   1. Os campos derivados de deduplicacao (documento sem pontuacao, e-mail
--      normalizado, chave do cliente) sao GENERATED ALWAYS ... STORED. No
--      original eles sao calculados no frontend, em ClientForm.jsx, a cada
--      gravacao - e por isso valem apenas enquanto TODA escrita passar por
--      aquele formulario. Contract.jsx e FormularioCliente.jsx ja recalculam os
--      mesmos campos por conta propria, com codigo duplicado, o que prova o
--      ponto. Como coluna gerada, a conta e do banco: importacao, correcao a mao
--      no Studio, edge function e tela nova nao tem como divergir nem esquecer.
--
--   2. As duas unicidades de deduplicacao passam a EXISTIR. O original calcula a
--      chave e nunca a usa para barrar duplicata - so para procurar antes de
--      gravar, varrendo a lista no cliente (Clients.jsx:69-83). Duas abas
--      abertas, dois cliques ou uma importacao gravam o mesmo CPF duas vezes.
--
--   3. Os dois blocos de endereco ficam achatados na mesma tabela.
--
-- Marcacoes para frente, que a tela do original faz e que este modulo nao
-- resolve (nao adiam o CRM, mas nao podem virar surpresa depois):
--   - "Criar Oportunidade" (Clients.jsx:137) cria uma negociacao a partir do
--     cliente: negotiations.client_id chega no MODULO 3, com FK composta contra
--     clients (id, tenant_id) - o unique correspondente ja esta declarado aqui.
--   - O historico do cliente (components/clients/ClientHistory.jsx) lista
--     projetos e recebiveis daquele cliente: MODULOS 5 e 7, pelo mesmo caminho.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  name text not null,
  phone text not null,
  email extensions.citext,
  client_type public.client_type,
  lead_source public.lead_source,
  tax_id text,
  birth_date date,
  notes text,

  -- Endereco de residencia (current_* no original; "country" vira
  -- address_country, o original nao prefixa esse campo).
  address_zipcode text,
  address_street text,
  address_number text,
  address_district text,
  address_complement text,
  address_city text not null,
  address_state text not null,
  address_country text not null default 'Brasil',

  -- Endereco da obra (construction_* no original). Todo nullable: existe
  -- cliente antes de existir terreno. Nao tem pais, como no original.
  site_zipcode text,
  site_street text,
  site_number text,
  site_district text,
  site_complement text,
  site_city text,
  site_state text,

  -- Campos derivados. Ver bloco 1 do cabecalho.
  --
  -- Cada expressao repete o calculo em vez de reaproveitar a coluna irma porque
  -- o Postgres 17 proibe coluna gerada referenciar outra coluna gerada
  -- (a checagem e do proprio banco: a DDL falha, nao passa errado).
  tax_id_digits text
    generated always as (nullif(regexp_replace(tax_id, '[^0-9]+', '', 'g'), '')) stored,

  email_normalized extensions.citext
    generated always as (nullif(btrim(lower(email::text)), '')::extensions.citext) stored,

  -- 'doc:' || null e null, entao o coalesce reproduz exatamente a precedencia do
  -- generateClientKey do original: documento manda, e-mail e o segundo, nulo
  -- quando nao ha nenhum dos dois.
  client_key extensions.citext
    generated always as (
      coalesce(
        'doc:' || nullif(regexp_replace(tax_id, '[^0-9]+', '', 'g'), ''),
        'email:' || nullif(btrim(lower(email::text)), '')
      )::extensions.citext
    ) stored,

  -- Alvo unico da busca livre da listagem. Ver comentario da coluna.
  search_text text
    generated always as (
      btrim(name || ' ' || coalesce(email::text, '') || ' ' || phone)
    ) stored,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo das FK compostas dos modulos 3, 4, 5, 6, 7 e 9. Referencia por id
  -- sozinho deixaria gravar cliente de um escritorio dentro do dado de outro: a
  -- RLS filtra o que se LE, nao o que se aponta.
  constraint clients_id_tenant_id_key unique (id, tenant_id),
  constraint clients_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  -- Coluna not null de texto sem este check aceita string vazia, e o formulario
  -- do original inicializa todo campo como '' - entao o caso nao e hipotetico.
  constraint clients_name_not_blank_check check (btrim(name) <> ''),
  constraint clients_phone_not_blank_check check (btrim(phone) <> ''),
  constraint clients_address_city_not_blank_check check (btrim(address_city) <> ''),
  constraint clients_address_state_not_blank_check check (btrim(address_state) <> ''),
  constraint clients_address_country_not_blank_check check (btrim(address_country) <> ''),

  -- ~* e nao ~: citext torna a IGUALDADE insensivel a caixa, mas nao os
  -- operadores de regex. Cuidado herdado da fundacao, onde um check de formato
  -- sobre citext ja recusou valor valido por isso.
  constraint clients_email_format_check
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.clients is
  'Cliente do escritorio, de Client do base44. Uma linha por pessoa ou empresa, com os dois enderecos (residencia e obra) achatados aqui mesmo. A deduplicacao por documento e por e-mail e garantida pelo banco, nao pelo frontend.';

comment on column public.clients.phone is
  'Telefone, que na pratica e o WhatsApp - canal principal do escritorio. not null como no original. Guardado como a pessoa digitou, com pontuacao, porque a tela exibe e o WhatsApp e aberto a partir deste texto.';

comment on column public.clients.email is
  'E-mail de contato. citext: o mesmo endereco com caixa diferente e o mesmo contato. Nullable, mas o check de formato RECUSA string vazia e recusa espaco nas pontas - a camada de dados precisa mandar null quando o campo vier vazio do formulario (nao "") e aplicar trim antes de enviar. Recusar e proposital: o valor cru e o que a tela exibe e o que vira mailto, entao nao interessa guardar " x@y.com " e depender do derivado para limpar.';

comment on column public.clients.tax_id is
  'CPF ou CNPJ exatamente como a pessoa digitou, com pontuacao (cpf_cnpj no original). Nao ha check de tamanho nem de digito verificador de proposito: o original aceita qualquer texto e a importacao do dado real nao pode ser derrubada por documento parcial. A comparacao acontece sempre por tax_id_digits.';

comment on column public.clients.tax_id_digits is
  'tax_id sem nada que nao seja digito, calculado pelo banco. Substitui cpf_cnpj_norm, que no original e escrito pelo frontend a cada gravacao: campo derivado escrito pela aplicacao so esta correto enquanto toda escrita passar pelo mesmo caminho, e importacao, correcao a mao ou tela nova o deixam desalinhado sem ninguem perceber - e ai a deduplicacao para de ver duplicata que existe. Como coluna gerada nao pode ser escrita nem esquecida. Nulo quando tax_id e nulo ou nao tem digito algum (ex: "-"), e nesse caso a chave de cliente cai no e-mail.';

comment on column public.clients.email_normalized is
  'email em minusculas e sem espaco nas pontas, calculado pelo banco (era email_norm, escrito pelo frontend). citext mesmo ja estando normalizado: consulta que esqueca de normalizar o termo ainda encontra a linha, em vez de concluir em silencio que nao existe duplicata. O btrim e redundante hoje - o check de formato de email ja recusa espaco nas pontas - e fica de proposito, para a normalizacao nao depender de o check continuar tao restrito.';

comment on column public.clients.client_key is
  'Chave de deduplicacao do cliente: "doc:<digitos>" quando ha documento, senao "email:<email normalizado>", senao nulo. Mesma regra do generateClientKey do original (ClientForm.jsx:95), agora no banco. E o que a tela de contratos usa para reconhecer um cliente ja cadastrado.';

comment on column public.clients.search_text is
  'Nome, e-mail e telefone concatenados, so para a busca livre da listagem: o filtro vira um unico ILIKE %termo% sobre esta coluna, em vez de tres OR que cada tela precisaria repetir igual para acertar o indice. Coluna gerada por consequencia - dado derivado de outras colunas desta linha segue a mesma regra dos campos de deduplicacao.';

comment on column public.clients.address_country is
  'Pais da residencia (country no original, sem prefixo la). not null com default Brasil, como o original, que exige o campo.';

comment on column public.clients.site_city is
  'Cidade da obra (construction_city). Todo o bloco site_* e nullable: o cliente entra no CRM antes de haver terreno definido, e o formulario do original mostra a secao da obra como opcional.';

comment on column public.clients.legacy_id is
  'Id da linha de Client no base44, preenchido so pela importacao (que roda no fim do projeto) e usado para refazer as ligacoes entre tabelas e para reimportar sem duplicar. Nulo em tudo que nasce no sistema novo.';

comment on constraint clients_id_tenant_id_key on public.clients is
  'Existe para os modulos seguintes: negotiations, contracts, projects, activities, accounts_receivable e map_properties referenciam (id, tenant_id), nunca id sozinho.';

-- Enderecos: 1:1 com o cliente, sempre preenchidos junto, e o formulario do
-- original mostra os dois lado a lado na mesma tela. Tabela separada
-- (addresses com tipo residencia/obra) exigiria join em TODA consulta de CRM,
-- de contrato e de projeto para devolver o que a tela sempre mostra junto, e
-- pagaria isso para ganhar apenas a possibilidade de um terceiro endereco, que
-- o dominio nao pede. Fica achatado. Se um dia o cliente tiver N obras, o lugar
-- certo do endereco da obra e projects, nao uma tabela de enderecos.
comment on column public.clients.address_street is
  'Logradouro da residencia (current_address). O bloco de endereco fica achatado nesta tabela, e nao normalizado: e 1:1 com o cliente e a tela sempre mostra residencia e obra juntas.';

comment on column public.clients.site_street is
  'Logradouro da obra (construction_address). Mesmo motivo de address_street para estar achatado aqui.';

-- Deduplicacao ------------------------------------------------------------
--
-- Parciais (WHERE ... IS NOT NULL) porque cliente sem documento e sem e-mail e
-- caso normal: o passo 1 do cadastro do original pede so nome, telefone e
-- cidade. Em unique comum o Postgres ja trataria cada null como distinto, mas o
-- indice parcial deixa a intencao explicita e nao indexa linha que nao participa
-- da regra.
--
-- Os dois se sobrepoem quando ha documento (client_key e "doc:" || digitos), e
-- ainda assim os dois ficam: e por tax_id_digits que a busca de duplicata por
-- documento entra no indice sem precisar montar o prefixo, e e ele que a
-- importacao vai usar para reconciliar. Manter os dois tambem e o que o plano
-- pede.
create unique index clients_tenant_id_tax_id_digits_key
  on public.clients (tenant_id, tax_id_digits)
  where tax_id_digits is not null;

create unique index clients_tenant_id_client_key_key
  on public.clients (tenant_id, client_key)
  where client_key is not null;

comment on index public.clients_tenant_id_tax_id_digits_key is
  'Um documento por escritorio. Faz "123.456.789-00" e "12345678900" colidirem, que era o objetivo declarado do cpf_cnpj_norm do original e que o original nao chega a impedir. Por escritorio, e nao global: dois escritorios podem atender o mesmo cliente. Serve tambem de indice de leitura: por decisao do usuario, ao esbarrar nesta restricao (23505) a mutacao consulta quem ocupa aquele tax_id_digits e a tela mostra o cliente existente com link, porque o erro quase sempre significa "procurei e nao achei", nao "quis duplicar".';

comment on index public.clients_tenant_id_client_key_key is
  'Um cliente por escritorio pela chave de deduplicacao: mesmo documento, ou - quando nao ha documento - mesmo e-mail, inclusive digitado com outra caixa. LIMITE HERDADO DO ORIGINAL: como o documento tem precedencia na chave, duas linhas com o MESMO e-mail convivem se uma delas tiver documento (pessoa fisica e a empresa dela, por exemplo). Fechar isso pediria unique sobre email_normalized, que o dominio nao autoriza - casal que compartilha e-mail e cadastro normal no escritorio.';

-- Indices de leitura -------------------------------------------------------

-- Listagem ordenada por nome: e como o original carrega a tela
-- (Client.list('name', 500)).
create index clients_tenant_id_name_idx on public.clients (tenant_id, name);

create index clients_tenant_id_created_at_idx
  on public.clients (tenant_id, created_at desc);

-- Busca livre da listagem. Comeca por tenant_id (btree_gin) para varrer so os
-- trigramas do escritorio de quem consultou; gin_trgm_ops e o que faz
-- ILIKE '%termo%' usar indice. Termo com menos de 3 caracteres nao tem trigrama
-- e cai em varredura - aceitavel, e o volume por escritorio e pequeno.
create index clients_tenant_id_search_text_idx
  on public.clients
  using gin (tenant_id, search_text extensions.gin_trgm_ops);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- RLS AINDA NAO EXISTE NESTA TABELA.
--
-- Esta migration nao cria policy nem GRANT - e trabalho do rls-guardian, e o
-- modulo nao esta pronto sem ele. Como a 0007 desarmou o DEFAULT PRIVILEGE do
-- papel postgres, clients nasce sem privilegio algum para anon e authenticated,
-- ou seja, invisivel pela chave publicavel. Isso NAO substitui a policy: sem RLS
-- ligada, basta um GRANT distraido para a tabela inteira ficar exposta. Precisa
-- dos dois, e do teste que prove com a chave publicavel que a tabela nao
-- responde antes de a policy existir.
--
-- Recorte esperado (docs/SCHEMA-PLAN.md): colaborador active do tenant le;
-- escrita para quem tem can_edit no menu 'crm'. E o primeiro modulo em que a
-- permissao de menu vira regra de escrita no banco, e nao so item escondido na
-- sidebar.
