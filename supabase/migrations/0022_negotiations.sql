-- Modulo 3 (Pipeline) - negotiations, vindo de Negociacao do base44 (25 campos),
-- mais as duas tabelas que substituem os campos-colecao daquela entidade.
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. tipo_servico (array de enum dentro da linha) vira negotiation_services.
--      A tela filtra o funil por tipo de servico (PipelineFilters.jsx), e o
--      original resolve isso baixando a lista inteira e fazendo flatMap no
--      navegador. Array em coluna atende consulta de igualdade so com indice
--      GIN e nao participa de join; tabela de juncao indexa, junta e ainda
--      impede o mesmo servico repetido na mesma negociacao - coisa que array
--      nao impede.
--
--   2. historico_responsavel (array de objeto dentro da linha) vira
--      negotiation_owner_history. E historico: cresce sem limite dentro de uma
--      linha que a tela le inteira a cada abertura, e o que se quer dele e
--      ordenar por data. Como coluna jsonb, toda troca de responsavel
--      reescreveria o array inteiro (read-modify-write no cliente, que perde
--      evento quando duas pessoas salvam junto).
--
--   3. As desnormalizacoes do base44 nao sao portadas (regra de
--      docs/ARCHITECTURE.md): cliente_name, cliente_cidade, cliente_estado,
--      responsavel_comercial_name, projeto_vinculado_name e
--      contrato_vinculado_number somem e viram join. Nenhuma delas e snapshot
--      intencional - a tela do funil quer o nome ATUAL do cliente, nao o que
--      valia quando a negociacao entrou.
--
--   4. projeto_vinculado_id e contrato_vinculado_id nao existem aqui. A ligacao
--      e invertida: contracts (modulo 4) e projects (modulo 5) e que apontam
--      para a negociacao, por (id, tenant_id). No original os dois lados sao
--      gravados a mao e podem discordar; com um lado so nao ha o que divergir,
--      e a cardinalidade correta (uma negociacao pode gerar mais de um
--      contrato) passa a ser representavel.
--
--   5. Os checks que o original nao tem. Negociacao "Ativa" com motivo de perda
--      preenchido, negociacao ativa com data de fechamento e probabilidade de
--      fechamento fora de 0-100 sao todos estados que o base44 aceita e que
--      nenhuma tela sabe exibir. Ficam impossiveis aqui.

create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  name text not null,

  -- Nullable como no original (Negociacao exige apenas nome_negociacao e
  -- responsavel_comercial_id): a oportunidade nasce antes de o lead virar
  -- cadastro no CRM. Quem exige cliente e a transicao para "Ganha"
  -- (Negociacoes.jsx:249), que e regra de tela, nao de linha.
  client_id uuid,

  -- not null porque o original marca responsavel_comercial_id como required.
  commercial_owner_id uuid not null,

  estimated_value numeric(14, 2),
  close_probability smallint,

  status public.negotiation_status not null default 'active',
  funnel_stage public.funnel_stage not null default 'lead_received',
  origin public.lead_origin,
  referrer_name text,

  funnel_entry_date date not null default current_date,
  expected_close_date date,
  closed_at date,

  loss_reason public.loss_reason,
  loss_notes text,

  generates_contract boolean not null default true,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo das FK compostas de negotiation_services e negotiation_owner_history
  -- aqui, e de contracts (modulo 4) e projects (modulo 5) depois.
  constraint negotiations_id_tenant_id_key unique (id, tenant_id),
  constraint negotiations_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint negotiations_name_not_blank_check check (btrim(name) <> ''),

  -- Motivo e observacao de perda so existem em negociacao perdida. Escrito
  -- como "status = lost OR os dois sao nulos" para valer nos dois sentidos:
  -- gravar perda em negociacao ativa e voltar uma perdida para ativa sem
  -- limpar o motivo sao a mesma violacao.
  constraint negotiations_loss_fields_require_lost_check
    check (status = 'lost' or (loss_reason is null and loss_notes is null)),

  -- Data de fechamento so em negociacao encerrada. Em um sentido so de
  -- proposito: encerrada SEM data e caso real (importacao do base44 tem
  -- negociacao Ganha sem data_fechamento), e derrubar a linha por isso jogaria
  -- dado historico no relatorio de pendencias sem ganho.
  constraint negotiations_closed_at_requires_closed_status_check
    check (closed_at is null or status in ('won', 'lost')),

  constraint negotiations_close_probability_range_check
    check (close_probability is null or (close_probability >= 0 and close_probability <= 100)),

  constraint negotiations_estimated_value_not_negative_check
    check (estimated_value is null or estimated_value >= 0)
);

-- FK compostas. Referencia por id sozinho deixaria uma negociacao apontar para
-- cliente ou responsavel de OUTRO escritorio: a RLS filtra o que se le, nao o
-- que se aponta. Sem ON DELETE nos dois casos - apagar cliente ou colaborador
-- com negociacao falha de proposito, forcando decisao explicita em vez de
-- orfanar o funil em silencio (mesmo desenho de collaborators.coordinator_id,
-- migration 0003, e o que a policy de DELETE de clients na 0017 ja antecipava).
alter table public.negotiations
  add constraint negotiations_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

alter table public.negotiations
  add constraint negotiations_commercial_owner_id_fkey
  foreign key (commercial_owner_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.negotiations is
  'Oportunidade comercial no funil, de Negociacao do base44. Uma linha por negociacao; os tipos de servico e o historico de responsavel, que no original sao arrays dentro desta linha, vivem em negotiation_services e negotiation_owner_history.';

comment on column public.negotiations.name is
  'Nome da negociacao (nome_negociacao). Texto livre digitado pelo usuario, e o que o card do kanban exibe.';

comment on column public.negotiations.client_id is
  'Cliente do CRM, quando ja existe. Nullable como no original. FK composta com tenant_id porque a RLS nao impede gravar referencia para o cliente de outro escritorio. E por esta coluna que "Criar Oportunidade" (Clients.jsx:137) liga as duas telas.';

comment on column public.negotiations.commercial_owner_id is
  'Responsavel comercial (responsavel_comercial_id). not null, como no original. FK composta com tenant_id. Trocar esta coluna e o evento que negotiation_owner_history registra.';

comment on column public.negotiations.origin is
  'Origem do lead. Quando a negociacao nasce a partir de um cliente do CRM, recebe clients.lead_source convertido por texto (lead_source::text::lead_origin): sao dois enums distintos porque o pipeline tem "event" e o CRM nao.';

comment on column public.negotiations.referrer_name is
  'Nome de quem indicou. Faz sentido apenas com origin = referral, e NAO ha check exigindo isso: o original tambem nao exige, e o campo continua preenchido quando o usuario troca a origem depois - apagar por check derrubaria a edicao inteira em vez de so limpar o campo.';

comment on column public.negotiations.close_probability is
  'Probabilidade de fechamento em pontos percentuais, 0 a 100 (o formulario do original comeca em 50). O original aceita qualquer numero, inclusive negativo e acima de 100, e o painel de negociacoes soma isso como percentual.';

comment on column public.negotiations.estimated_value is
  'Valor estimado do negocio em reais. numeric, nunca float: dinheiro somado em ponto flutuante desloca centavo no total do funil.';

comment on column public.negotiations.funnel_entry_date is
  'Data de entrada no funil (data_entrada_funil). not null com default de hoje, que e o que o formulario do original preenche sozinho.';

comment on column public.negotiations.generates_contract is
  'Se marcar a negociacao como Ganha deve gerar contrato (gera_contrato). Guardado aqui, mas quem age sobre ele e a tela: no original, Negociacoes.jsx cria o Contract no onSuccess da mutation. Nenhum trigger faz isso no banco - geracao de contrato e decisao de fluxo, e trigger que cria linha em outra tabela de negocio esconde efeito de quem le a chamada.';

comment on column public.negotiations.legacy_id is
  'Id da linha de Negociacao no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint negotiations_id_tenant_id_key on public.negotiations is
  'Existe para as FK compostas de negotiation_services e negotiation_owner_history, e para contracts (modulo 4) e projects (modulo 5), que apontam para (id, tenant_id) e nunca para id sozinho.';

comment on constraint negotiations_loss_fields_require_lost_check on public.negotiations is
  'Motivo e observacao de perda so em negociacao perdida. O original nao impede negociacao Ativa com motivo de perda preenchido, e o kanban exibe esse motivo no card - entao o estado invalido chega ate a tela.';

comment on constraint negotiations_closed_at_requires_closed_status_check on public.negotiations is
  'Data de fechamento so em negociacao Ganha ou Perdida. Nao exige o contrario (encerrada sem data continua valida), porque o dado historico do base44 tem esse caso e derruba-lo na importacao nao traz ganho.';

-- Indices ---------------------------------------------------------------------

-- Como a tela carrega o funil: Negociacao.list('-created_date').
create index negotiations_tenant_id_created_at_idx
  on public.negotiations (tenant_id, created_at desc);

-- O kanban mostra as colunas de etapa apenas das negociacoes que ainda estao
-- de pe, e as abas separam Ativa / Ganha / Perdida.
create index negotiations_tenant_id_status_funnel_stage_idx
  on public.negotiations (tenant_id, status, funnel_stage);

-- Historico do cliente na tela de CRM e "Criar Oportunidade".
create index negotiations_tenant_id_client_id_idx
  on public.negotiations (tenant_id, client_id);

-- Filtro por responsavel do PipelineFilters.jsx.
create index negotiations_tenant_id_commercial_owner_id_idx
  on public.negotiations (tenant_id, commercial_owner_id);

create trigger negotiations_set_updated_at
  before update on public.negotiations
  for each row execute function public.set_updated_at();

-- negotiation_services ---------------------------------------------------------
--
-- Substitui Negociacao.tipo_servico (array de enum).

create table public.negotiation_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  negotiation_id uuid not null,
  service_type public.service_type not null,
  created_at timestamptz not null default now(),

  constraint negotiation_services_id_tenant_id_key unique (id, tenant_id),
  constraint negotiation_services_negotiation_id_service_type_key
    unique (negotiation_id, service_type)
);

alter table public.negotiation_services
  add constraint negotiation_services_negotiation_id_fkey
  foreign key (negotiation_id, tenant_id)
  references public.negotiations (id, tenant_id)
  on delete cascade;

comment on table public.negotiation_services is
  'Tipos de servico de uma negociacao, um por linha. Substitui o array Negociacao.tipo_servico. ON DELETE CASCADE de proposito: e parte da negociacao, nao entidade propria - apagar a negociacao apaga os servicos dela, e nao ha nada a decidir sobre isso.';

comment on constraint negotiation_services_negotiation_id_service_type_key on public.negotiation_services is
  'O mesmo servico nao aparece duas vezes na mesma negociacao. Array nao impede a repeticao (o checkbox do original evita, mas so o checkbox), e servico repetido dobraria a negociacao em qualquer contagem por tipo. Serve tambem para a importacao ser idempotente: reimportar a mesma negociacao nao multiplica os servicos.';

comment on constraint negotiation_services_id_tenant_id_key on public.negotiation_services is
  'Nao ha tabela apontando para negotiation_services hoje. O unique existe porque toda tabela de negocio deste projeto o tem (invariante A7 de supabase/tests/pattern-invariants.sql): a alternativa e descobrir que falta no dia em que um modulo precisar referenciar, com a tabela ja cheia.';

create index negotiation_services_tenant_id_service_type_idx
  on public.negotiation_services (tenant_id, service_type, negotiation_id);

comment on index public.negotiation_services_tenant_id_service_type_idx is
  'Filtro do funil por tipo de servico. Comeca por tenant_id, como manda a regra de multitenancy, e termina em negotiation_id para o filtro se resolver dentro do indice, sem visitar a tabela.';

-- negotiation_owner_history ----------------------------------------------------
--
-- Substitui Negociacao.historico_responsavel (array de objeto).

create table public.negotiation_owner_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  negotiation_id uuid not null,

  previous_owner_id uuid,
  new_owner_id uuid not null,
  changed_by_id uuid,
  changed_at timestamptz not null default now(),

  constraint negotiation_owner_history_id_tenant_id_key unique (id, tenant_id),
  constraint negotiation_owner_history_negotiation_id_changed_at_key
    unique (negotiation_id, changed_at),
  constraint negotiation_owner_history_owner_changed_check
    check (previous_owner_id is null or previous_owner_id <> new_owner_id)
);

alter table public.negotiation_owner_history
  add constraint negotiation_owner_history_negotiation_id_fkey
  foreign key (negotiation_id, tenant_id)
  references public.negotiations (id, tenant_id)
  on delete cascade;

alter table public.negotiation_owner_history
  add constraint negotiation_owner_history_previous_owner_id_fkey
  foreign key (previous_owner_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.negotiation_owner_history
  add constraint negotiation_owner_history_new_owner_id_fkey
  foreign key (new_owner_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.negotiation_owner_history
  add constraint negotiation_owner_history_changed_by_id_fkey
  foreign key (changed_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.negotiation_owner_history is
  'Trocas de responsavel comercial de uma negociacao, uma por linha. Substitui o array Negociacao.historico_responsavel. Os tres nomes que o original guardava junto (responsavel_anterior_name, novo_responsavel_name, alterado_por_name) somem e viram join - relatorio de historico que mostra nome congelado de quem depois mudou de nome no cadastro confunde mais do que ajuda.';

comment on column public.negotiation_owner_history.previous_owner_id is
  'Responsavel antes da troca. Nullable: a primeira atribuicao nao tem anterior, e a importacao do base44 pode trazer evento sem ele.';

comment on column public.negotiation_owner_history.changed_by_id is
  'Quem fez a troca. Nullable porque o autor nao existe em evento vindo da importacao nem em troca feita por rotina do servidor. Sem ON DELETE, como todas as FK para collaborators deste modulo.';

comment on constraint negotiation_owner_history_negotiation_id_changed_at_key on public.negotiation_owner_history is
  'Duas trocas da mesma negociacao no mesmo instante sao o mesmo evento gravado duas vezes. Faz as vezes do legacy_id que esta tabela nao tem: o historico vive dentro da linha de Negociacao no base44 e nao possui id proprio la, entao a chave natural (negociacao + instante) e o que torna a reimportacao idempotente.';

comment on constraint negotiation_owner_history_owner_changed_check on public.negotiation_owner_history is
  'Evento de troca em que o responsavel nao mudou e ruido: aparece na timeline como uma troca que ninguem fez.';

create index negotiation_owner_history_tenant_id_negotiation_id_changed_at_idx
  on public.negotiation_owner_history (tenant_id, negotiation_id, changed_at desc);

comment on index public.negotiation_owner_history_tenant_id_negotiation_id_changed_at_idx is
  'A timeline de uma negociacao, na ordem em que a tela mostra (mais recente primeiro). Comeca por tenant_id, como manda a regra de multitenancy.';

-- RLS AINDA NAO EXISTE NESTAS TRES TABELAS.
--
-- Esta migration nao cria policy nem GRANT. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, as tres nascem sem privilegio algum para anon e
-- authenticated, ou seja, invisiveis pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela inteira ficar
-- exposta. Precisa dos dois. A 0024 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades.
--
-- Recorte esperado (docs/SCHEMA-PLAN.md, modulo 3): colaborador active do
-- tenant le; escrita para quem tem can_edit no menu 'pipeline'.
