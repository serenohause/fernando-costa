-- Modulo 9 (Mapa) - map_properties (de PropriedadeMapa, 17 campos, dois deles
-- arrays), as duas tabelas que substituem esses arrays, e os OITO campos obra_*
-- que a 0032 adiou em projects.
--
-- OS DOIS LUGARES QUE GUARDAM ONDE A OBRA FICA
--   docs/SCHEMA-PLAN.md ("Decisao 1") registra o incomodo e este modulo o herda
--   inteiro, sem unificar:
--
--     projects.site_*    geocodificado a partir do endereco do CONTRATO, por
--                        components/utils/geocoding.jsx, chamando a Google
--                        Geocoding API. Aparece so em ProjectForm.jsx:666, como
--                        texto abaixo do endereco ("Localizacao: -16.6, -49.2").
--     map_properties     PIN, criado a mao clicando no mapa, com reverse
--                        geocoding pelo Nominatim (OpenStreetMap). E o que a tela
--                        de mapa consulta - MapaProjetos.jsx:165 lista
--                        PropriedadeMapa, e NAO le obra_lat/obra_lng de projeto
--                        nenhum.
--
--   Duas fontes, dois provedores de geocodificacao, nenhuma sincronia: vincular
--   um pin a um projeto (MapaProjetos.jsx:539) grava project_id na propriedade e
--   nao toca no projeto, e o comentario do proprio original diz o porque - "MODO
--   NAO-INTRUSIVO: apenas criar registro de pin. Sem criar projeto, sem alterar
--   projeto, sem alterar cliente" (:537). Arrastar o pin (:391) atualiza a
--   propriedade e deixa obra_lat do projeto onde estava.
--
--   UNIFICAR OS DOIS ESTA FORA DO ESCOPO DESTE MODULO: seria mudar o original, e
--   a instrucao para o modulo 9 e fidelidade. O que esta no escopo e nao deixar
--   quem chegar depois achar que a duplicacao foi desenhada aqui - por isso ela
--   esta escrita no COMMENT das colunas dos DOIS lados.
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. lat/lng continuam sendo dois numeric, e NAO geography(Point) do PostGIS.
--      Contraria docs/SCHEMA-PLAN.md, e o motivo esta escrito na 0056: as duas
--      justificativas do plano (agrupamento por proximidade e filtro por raio)
--      foram conferidas contra o original e nenhuma existe.
--
--   2. terreno_tipo e finalidade_projeto viram TABELA FILHA
--      (map_property_land_types e map_property_purposes), e nao array de enum
--      nativo. Ver o cabecalho de cada uma - a decisao e a mesma que a 0032 tomou
--      para os mesmos dois campos em Project, pelo mesmo motivo, e o motivo NAO e
--      "porque foi assim la".
--
--   3. project_label e client_label FICAM, e nao sao *_name disfarcado. A regra
--      de docs/SCHEMA-PLAN.md ("fora dos snapshots intencionais, *_name some e
--      vira join") vale para copia do nome de uma linha vinculada. Nao e o caso:
--      no combobox do original, escolher da lista grava o id e ZERA o label
--      (ProjectForm.jsx:174 e :216), e digitar texto livre grava o label e ZERA o
--      id (:199 e :228). Sao alternativas exclusivas, nao duplicatas - o label e
--      o nome de uma propriedade que nao corresponde a nenhum projeto cadastrado,
--      e sem ele o pin de um terreno ainda nao vendido perde o nome. A tela le
--      exatamente assim: `project?.name || prop.project_label || 'Sem nome'`
--      (MapaProjetos.jsx:283).
--
--      O que NAO fica e o client_name/project_name que viria de join: nenhum
--      deles existe nesta entidade, e docs/SCHEMA-PLAN.md nao lista nada deste
--      modulo em "Snapshots intencionais".
--
--   4. Os oito campos obra_* de Project entram como site_*, seguindo a grafia que
--      a 0032 ja deu ao nono (obra_endereco_texto -> site_address_text). Nome
--      diferente para o mesmo prefixo seria a divergencia que este projeto ja
--      evitou nos cinco prazo_* (0032, ponto 6).
--
--   5. Os checks que o original nao tem: faixa valida de latitude e longitude,
--      coordenada pela metade, areas nao positivas, rotulo em branco, vinculo e
--      rotulo preenchidos ao mesmo tempo, e geocodificacao "ok" sem coordenada.
--      Todos sao estados que o base44 aceita hoje.
--
-- O QUE FICOU ESTRANHO NO ORIGINAL E NAO FOI CORRIGIDO AQUI (esta reportado ao
-- usuario, e a decisao e dele):
--
--   a. obra_pin_manual nunca vira true. Ele existe para proteger um pino ajustado
--      a mao contra o recalculo automatico (geocoding.jsx:84), mas as unicas duas
--      escritas do sistema o poem em false (ProjectForm.jsx:63 e :127, e
--      geocoding.jsx:109). A protecao esta implementada e nunca liga. A coluna
--      entra como esta.
--   b. obra_pin_updated_by e obra_pin_updated_at nao sao escritos por tela
--      nenhuma. Entram porque a instrucao deste modulo os lista, e porque tem
--      significado proprio - diferente de fornecedores_cotados[].escolhido, que a
--      0049 recusou por ja ter quem respondesse por ele.
--   c. A tela recusa lat OU lng igual a zero como "Localizacao invalida"
--      (MapaProjetos.jsx:386 e :532). Latitude zero e a linha do Equador, que
--      corta o Amapa: a regra do original recusaria um pino legitimo em Macapa. O
--      check do banco recusa so o PAR (0,0), que e sentinela e nao coordenada -
--      ver o COMMENT da constraint. A validacao da tela nao e alterada.
--   d. status_visual e gravado sempre, inclusive em propriedade vinculada a
--      projeto (MapaProjetos.jsx:556), e nesse caso e ignorado na leitura
--      (:287, `project?.status || prop.status_visual`). Coluna com valor que
--      ninguem le em metade das linhas. Mantida como esta - ver o COMMENT.

-- map_properties ------------------------------------------------------------------

create table public.map_properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os dois unicos campos required da entidade.
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,

  -- Vinculo OU rotulo livre, nunca os dois. Ver o ponto 3 do cabecalho.
  project_id uuid,
  project_label text,
  client_id uuid,
  client_label text,

  address text,
  city text,
  state text,

  land_area_m2 numeric(12, 2),
  project_area_m2 numeric(12, 2),

  subdivision_name text,
  subdivision_block text,
  subdivision_lot text,

  visual_status public.map_visual_status not null default 'not_started',

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo das FK compostas de map_property_land_types e map_property_purposes.
  constraint map_properties_id_tenant_id_key unique (id, tenant_id),
  constraint map_properties_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  -- Faixa geografica valida. E a mesma validacao que a busca do original faz
  -- antes de aceitar coordenada digitada (MapaProjetos.jsx:583) e que nada faz
  -- antes de GRAVAR.
  constraint map_properties_lat_range_check check (lat >= -90 and lat <= 90),
  constraint map_properties_lng_range_check check (lng >= -180 and lng <= 180),

  -- (0,0) e sentinela, nao lugar. Ver o ponto (c) do cabecalho.
  constraint map_properties_not_null_island_check check (not (lat = 0 and lng = 0)),

  constraint map_properties_project_label_not_blank_check
    check (project_label is null or btrim(project_label) <> ''),
  constraint map_properties_client_label_not_blank_check
    check (client_label is null or btrim(client_label) <> ''),

  constraint map_properties_project_link_exclusive_check
    check (project_id is null or project_label is null),
  constraint map_properties_client_link_exclusive_check
    check (client_id is null or client_label is null),

  constraint map_properties_areas_positive_check
    check (
      (land_area_m2 is null or land_area_m2 > 0)
      and (project_area_m2 is null or project_area_m2 > 0)
    )
);

-- FK compostas com tenant_id: referencia por id sozinho deixaria um pin apontar
-- para projeto ou cliente de OUTRO escritorio, porque a RLS filtra o que se le e
-- nao o que se aponta. SEM ON DELETE nos dois casos, como em todas as FK deste
-- projeto desde a 0022: apagar projeto ou cliente que tem pin no mapa falha, e a
-- tela precisa dizer isso. `on delete set null` seria o gesto obvio e nao existe
-- aqui - a FK e composta, e zerar os dois lados zeraria tenant_id, que e not null.
alter table public.map_properties
  add constraint map_properties_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id);

alter table public.map_properties
  add constraint map_properties_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

comment on table public.map_properties is
  'Propriedade marcada no mapa (um pino), de PropriedadeMapa do base44. E ESTA a tabela que a tela de mapa consulta - MapaProjetos.jsx:165 lista PropriedadeMapa e nao le a geolocalizacao de projeto nenhum. ATENCAO: o sistema guarda "onde a obra fica" em DOIS lugares, e o outro e projects.site_lat/site_lng (0057, mesma migration), alimentado por outro provedor de geocodificacao e nunca sincronizado com este. E heranca do original, esta registrada em docs/SCHEMA-PLAN.md ("Decisao 1") e NAO foi unificada de proposito: unificar mudaria o comportamento do original, e essa e decisao do usuario. Um pin pode existir sem projeto e sem cliente - e o caso do terreno que o escritorio esta de olho.';

comment on column public.map_properties.lat is
  'Latitude do pino, em graus decimais. numeric(9,6): seis casas e a precisao com que a tela grava (MapaProjetos.jsx:383 arredonda com toFixed(6)) e vale cerca de 11 cm no equador. NAO e geography(Point) do PostGIS, apesar do que diz docs/SCHEMA-PLAN.md - as duas razoes que o plano dava (agrupamento por proximidade e filtro por raio) nao existem no original; ver o cabecalho da 0056. NAO e o mesmo dado que projects.site_lat: aquele vem do endereco do contrato pela API do Google, este vem de um clique no mapa com reverse geocoding do Nominatim, e ninguem os concilia.';

comment on column public.map_properties.lng is
  'Longitude do pino, em graus decimais. Mesmo tratamento de lat. Par obrigatorio: as duas sao NOT NULL porque um pino sem coordenada nao tem o que desenhar - e o unico required da entidade do base44.';

comment on column public.map_properties.project_id is
  'Projeto vinculado a este pino, quando existe. EXCLUSIVO com project_label: escolher um projeto da lista zera o rotulo (ProjectForm.jsx:174) e digitar texto livre zera o vinculo (:199). Nullable porque o pin nao-intrusivo e o caso de uso principal da tela: marcar um terreno sem mexer em projeto nenhum (MapaProjetos.jsx:537). Quando preenchido, o nome e o status exibidos vem do PROJETO por join, e nao desta linha.';

comment on column public.map_properties.project_label is
  'Nome livre da propriedade, para o pino que NAO corresponde a um projeto cadastrado. NAO e desnormalizacao de projects.name e por isso nao vira join: e a alternativa ao vinculo, exclusiva com project_id, e sem ela o pin de um terreno ainda sem projeto perde o nome (a tela cai em "Sem nome", MapaProjetos.jsx:283). Nenhum campo deste modulo esta na lista de snapshots intencionais de docs/SCHEMA-PLAN.md, e este nao precisa estar - ele nao e copia de nada.';

comment on column public.map_properties.client_id is
  'Cliente vinculado a este pino. Mesma exclusividade de project_id com client_label. E por ele que a busca por cliente da tela recorta o mapa (MapaProjetos.jsx:298). Preenchido automaticamente quando um projeto e escolhido e o projeto tem cliente (ProjectForm.jsx:179-186).';

comment on column public.map_properties.client_label is
  'Nome livre do cliente, para o pino nao vinculado ao CRM. Mesmo raciocinio de project_label: alternativa, e nao copia.';

comment on column public.map_properties.address is
  'Endereco do pino, resultado do reverse geocoding do Nominatim no momento do clique (MapaProjetos.jsx:479). Guardado em DUAS LINHAS, com \n no meio - a tela o monta assim (formatCleanAddress, :433) e o exibe com whitespace-pre-line (:1202). Texto de exibicao, portanto, e nao endereco estruturado: cidade e estado tem coluna propria porque sao o que o filtro usa.';

comment on column public.map_properties.city is
  'Cidade do pino, extraida do reverse geocoding. E o filtro "Cidade (pins geocodificados)" da tela (MapaProjetos.jsx:306) - dai o indice por (tenant_id, city). Sem default, como suppliers.city (0049): o escritorio e de Goiania e cidade pre-preenchida e cidade errada gravada em silencio.';

comment on column public.map_properties.visual_status is
  'Status exibido no marcador de um pino SEM projeto vinculado. Quando ha projeto, a tela usa o status DELE e este valor e ignorado (MapaProjetos.jsx:287). Mesmo assim a coluna e NOT NULL com default, como no original, que grava o campo em toda criacao inclusive nas vinculadas (:556): o formulario simplesmente esconde o seletor quando ha vinculo (ProjectForm.jsx:355). Nao ha check amarrando o valor a ausencia de project_id - seria inventar regra que o original nao tem e travar a importacao de linha antiga.';

comment on column public.map_properties.subdivision_name is
  'Nome do loteamento. Mesma grafia de projects.subdivision_name (0032). A tela so mostra este bloco quando o pin tem a tag "Loteamento fechado" (MapaProjetos.jsx:1213), que agora e uma linha de map_property_land_types - a condicao vira um EXISTS, e nao some.';

comment on column public.map_properties.legacy_id is
  'Id da linha de PropriedadeMapa no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint map_properties_not_null_island_check on public.map_properties is
  'Recusa o par (0,0), que fica no Atlantico a 600 km da costa da Africa e no sistema significa "coordenada nao preenchida". O ORIGINAL E MAIS ESTRITO E MAIS ERRADO: ele recusa lat OU lng igual a zero (MapaProjetos.jsx:386 e :532), e latitude zero e a linha do Equador, que corta o Amapa - a regra dele recusaria um pino legitimo em Macapa. Aqui so o par cai. A validacao da tela NAO foi alterada; a divergencia esta reportada ao usuario.';

comment on constraint map_properties_project_link_exclusive_check on public.map_properties is
  'Vinculo e rotulo sao alternativas, nao complementos: o combobox do original zera um ao gravar o outro, nos dois sentidos (ProjectForm.jsx:174 e :199). Com os dois preenchidos, o rotulo digitado some da tela sem aviso (o join vence, MapaProjetos.jsx:283) e a linha passa a afirmar duas coisas diferentes sobre o mesmo pino. Linha do base44 que chegue com os dois cai no relatorio de pendencias da importacao, que e o desenho de docs/SCHEMA-PLAN.md.';

-- Indices. A tela carrega tudo de uma vez e filtra no navegador; os recortes que
-- viram consulta sao cidade (filtro), cliente (busca por cliente do CRM) e
-- projeto (o join que da nome e status ao pino).
create index map_properties_tenant_id_created_at_idx
  on public.map_properties (tenant_id, created_at desc);

create index map_properties_tenant_id_city_idx
  on public.map_properties (tenant_id, city)
  where city is not null;

create index map_properties_tenant_id_client_id_idx
  on public.map_properties (tenant_id, client_id)
  where client_id is not null;

create index map_properties_tenant_id_project_id_idx
  on public.map_properties (tenant_id, project_id)
  where project_id is not null;

create trigger map_properties_set_updated_at
  before update on public.map_properties
  for each row execute function public.set_updated_at();

-- map_property_land_types ----------------------------------------------------------
--
-- Substitui PropriedadeMapa.terreno_tipo (array de string).
--
-- POR QUE TABELA FILHA, E NAO ARRAY DE ENUM NATIVO
--   A pergunta so faria sentido se o conjunto fosse fechado, e ele NAO e. A tela
--   do mapa reusa o MESMO ProjectForm do modulo 5 (MapaProjetos.jsx:1285 passa
--   isMapMode), e o seletor de tipo de terreno de la sugere tres valores
--   ("Loteamento fechado", "Terreno", "Comercial") ao lado de um campo "Nova
--   categoria..." com botao "+ Adicionar" que empurra qualquer texto no array
--   (ProjectForm.jsx:270-276 e :502-513). Enum obrigaria uma migration a cada
--   categoria inventada na tela - e a tela foi feita para inventar.
--
--   Descartado o enum, sobra array de text contra tabela filha, e a tabela ganha
--   por tres coisas que o array nao da:
--     - unicidade. Array aceita a mesma tag duas vezes, e tag repetida dobra a
--       propriedade em qualquer contagem por tipo. O contador do filtro da tela
--       (MapaProjetos.jsx:1006) e exatamente uma contagem dessas.
--     - integridade por linha. tenant_id, FK composta e RLS propria valem para a
--       tag; dentro de um array nao ha o que amarrar.
--     - indice util sem GIN. (tenant_id, land_type, map_property_id) responde
--       "quais pinos sao loteamento fechado" direto.
--
--   E e o precedente do proprio projeto para estes DOIS campos: a 0032 fez
--   project_land_types e project_purposes de Project.terreno_tipo e
--   Project.finalidade_projeto, e a 0049 fez supplier_brands de
--   Fornecedor.marcas_representadas. Mesma forma, mesmos nomes de coluna.

create table public.map_property_land_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  map_property_id uuid not null,
  land_type text not null,
  created_at timestamptz not null default now(),

  constraint map_property_land_types_id_tenant_id_key unique (id, tenant_id),
  constraint map_property_land_types_property_id_land_type_key
    unique (map_property_id, land_type),
  constraint map_property_land_types_land_type_not_blank_check
    check (btrim(land_type) <> '')
);

alter table public.map_property_land_types
  add constraint map_property_land_types_map_property_id_fkey
  foreign key (map_property_id, tenant_id)
  references public.map_properties (id, tenant_id)
  on delete cascade;

comment on table public.map_property_land_types is
  'Tipo de terreno de uma propriedade do mapa, uma tag por linha. Substitui o array PropriedadeMapa.terreno_tipo. Texto livre de proposito - o formulario tem campo "Nova categoria..." e aceita qualquer valor (ProjectForm.jsx:270). ON DELETE CASCADE: e parte do pino. SEM legacy_id, como project_land_types (0032) e supplier_brands (0049) - no base44 estas tags vivem dentro da linha de PropriedadeMapa e nao tem id proprio; a chave natural (propriedade + tag) e o que torna a reimportacao idempotente. NAO e a mesma tabela que project_land_types, e nao ha garantia de que as tags de um pino batam com as do projeto vinculado - sao dois formularios gravando em duas entidades.';

comment on constraint map_property_land_types_property_id_land_type_key on public.map_property_land_types is
  'A mesma tag nao aparece duas vezes na mesma propriedade. O original nao impede: addCustomTerrenoTipo (ProjectForm.jsx:272) empurra no array sem olhar o que ja esta la, e o toggle dos tres valores sugeridos so cobre esses tres. Tag repetida dobra a propriedade no contador do filtro de finalidade/terreno da tela.';

create index map_property_land_types_tenant_id_land_type_idx
  on public.map_property_land_types (tenant_id, land_type, map_property_id);

-- map_property_purposes ------------------------------------------------------------
--
-- Substitui PropriedadeMapa.finalidade_projeto (array de string). Mesma forma e
-- mesma justificativa de map_property_land_types: o formulario sugere quatro
-- valores ("Moradia", "Investimento", "Comercial", "Hoteleiro") e aceita
-- qualquer outro digitado (ProjectForm.jsx:289 e :545-556).
--
-- Esta e a tabela que o filtro "Finalidade do Projeto" da tela consulta
-- (MapaProjetos.jsx:307 e :328-332): o original monta a lista do dropdown com o
-- DISTINCT das finalidades existentes, o que aqui e um select direto em vez de um
-- flatMap sobre todas as propriedades carregadas.

create table public.map_property_purposes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  map_property_id uuid not null,
  purpose text not null,
  created_at timestamptz not null default now(),

  constraint map_property_purposes_id_tenant_id_key unique (id, tenant_id),
  constraint map_property_purposes_property_id_purpose_key
    unique (map_property_id, purpose),
  constraint map_property_purposes_purpose_not_blank_check
    check (btrim(purpose) <> '')
);

alter table public.map_property_purposes
  add constraint map_property_purposes_map_property_id_fkey
  foreign key (map_property_id, tenant_id)
  references public.map_properties (id, tenant_id)
  on delete cascade;

comment on table public.map_property_purposes is
  'Finalidade do projeto de uma propriedade do mapa, uma tag por linha. Substitui o array PropriedadeMapa.finalidade_projeto. Texto livre de proposito, como no original. ON DELETE CASCADE: e parte do pino. SEM legacy_id, pelo mesmo motivo de map_property_land_types.';

create index map_property_purposes_tenant_id_purpose_idx
  on public.map_property_purposes (tenant_id, purpose, map_property_id);

-- A GEOLOCALIZACAO DA OBRA EM projects --------------------------------------------
--
-- Os oito campos que a 0032 adiou (docs/SCHEMA-PLAN.md, "Decisao 1"). O nono,
-- obra_endereco_texto, ja entrou la como site_address_text e e a ENTRADA disto
-- aqui: geocoding.jsx monta o endereco a partir do CONTRATO (buildObraAddress,
-- :51), grava o texto no projeto e geocodifica.
--
-- Prefixo site_, e nao obra_, pela mesma razao que o nono campo ja usa: a 0032
-- traduziu obra_endereco_texto para site_address_text, e schema em ingles e regra
-- do CLAUDE.md. Dois prefixos para o mesmo bloco de campos seria a divergencia
-- que a 0032 evitou nos cinco prazo_*.

alter table public.projects
  add column site_lat numeric(9, 6),
  add column site_lng numeric(9, 6),
  add column site_place_id text,
  add column site_geocode_status public.geocode_status not null default 'pending',
  add column site_geocode_updated_at timestamptz,
  add column site_pin_manual boolean not null default false,
  add column site_pin_updated_by uuid,
  add column site_pin_updated_at timestamptz;

alter table public.projects
  add constraint projects_site_pin_updated_by_fkey
  foreign key (site_pin_updated_by, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.projects
  add constraint projects_site_lat_range_check
  check (site_lat is null or (site_lat >= -90 and site_lat <= 90));

alter table public.projects
  add constraint projects_site_lng_range_check
  check (site_lng is null or (site_lng >= -180 and site_lng <= 180));

-- Coordenada e par, e nao dois campos soltos.
alter table public.projects
  add constraint projects_site_coordinates_pair_check
  check ((site_lat is null) = (site_lng is null));

alter table public.projects
  add constraint projects_site_geocode_ok_requires_coordinates_check
  check (site_geocode_status <> 'ok' or site_lat is not null);

-- O COMMENT da tabela mentia a partir de agora: ele afirmava que os oito campos
-- "ficaram para o MODULO 9", no futuro. Migration aplicada nao se edita
-- (docs/ARCHITECTURE.md), entao a correcao e esta - mesmo caminho da 0018 e da
-- 0047.
comment on table public.projects is
  'Projeto em execucao, de Project do base44. GEOLOCALIZACAO DA OBRA ESTA AQUI desde a 0057 (modulo 9), nas oito colunas site_* - o texto anterior deste COMMENT dizia que elas "ficaram para o modulo 9" e a partir da 0057 isso deixou de ser verdade. ATENCAO: elas NAO sao o que o mapa desenha. A tela de mapa le public.map_properties, tabela separada, alimentada por outro provedor de geocodificacao e nunca sincronizada com estas colunas - duplicacao herdada do base44 e registrada em docs/SCHEMA-PLAN.md ("Decisao 1"), mantida de proposito. PROGRESSO CONTINUA FORA DAQUI: progresso_percentual, tarefas_total_obrigatorias e tarefas_concluidas_obrigatorias sao derivados das tarefas e vivem na view public.project_progress.';

-- Pelo mesmo motivo: o COMMENT desta coluna dizia que as coordenadas "sao do
-- modulo 9", no futuro.
comment on column public.projects.site_address_text is
  'Endereco da obra em texto livre, normalizado (obra_endereco_texto no original). E a ENTRADA da geocodificacao: components/utils/geocoding.jsx monta este texto a partir dos campos de local do CONTRATO (buildObraAddress) e so entao chama a API. O RESULTADO sao as colunas site_lat, site_lng, site_place_id e site_geocode_status, que entraram na 0057 - o texto anterior deste COMMENT dizia que elas eram "do modulo 9", e o modulo 9 chegou.';

comment on column public.projects.site_lat is
  'Latitude da obra (obra_lat no original), resultado da geocodificacao do endereco do contrato pela Google Geocoding API (components/utils/geocoding.jsx:104). numeric(9,6), e NAO geography(Point) - ver o cabecalho da 0056. NAO E O QUE O MAPA DESENHA: a tela de mapa le map_properties.lat, que vem de um clique com reverse geocoding do Nominatim, e nada concilia os dois valores. Sao dois lugares guardando onde a obra fica, e a duplicacao e heranca do base44, nao desenho deste schema.';

comment on column public.projects.site_lng is
  'Longitude da obra (obra_lng no original). Mesmo tratamento e mesma ressalva de site_lat. Par obrigatorio com ela por check: coordenada pela metade nao aponta para lugar nenhum, e o original aceita (geocoding.jsx grava as duas juntas, mas nada impede o resto).';

comment on column public.projects.site_place_id is
  'Place ID do Google Maps devolvido junto com a coordenada (obra_place_id). Guardado para reconsultar o mesmo lugar sem gastar uma geocodificacao nova. Nenhuma tela do original o le - so geocoding.jsx:106 o escreve.';

comment on column public.projects.site_geocode_status is
  'Resultado da ultima geocodificacao (obra_geocode_status). NOT NULL com default pending, como a entidade do base44 declara: pending significa "endereco ainda nao foi geocodificado", que e a verdade de todo projeto ate a primeira tentativa. geocoding.jsx so escreve ok (:107) e failed (:117); pending nunca e escrito por ninguem, e por isso e default e nao valor de aplicacao. ProjectForm.jsx:62 inicializa o campo com STRING VAZIA no original - aqui isso nao existe, e a coluna cai no default.';

comment on column public.projects.site_geocode_updated_at is
  'Instante da ultima tentativa de geocodificacao, com sucesso ou sem (obra_geocode_updated_at). E o par de site_geocode_status: sem ele, "failed" nao diz se a falha foi ontem ou ha um ano.';

comment on column public.projects.site_pin_manual is
  'O pino da obra foi ajustado a mao e nao deve ser sobrescrito pelo recalculo automatico (obra_pin_manual). ATENCAO: no original ele NUNCA VIRA TRUE. A protecao esta implementada - geocoding.jsx:84 sai fora quando o campo e verdadeiro - mas as tres escritas que existem o poem em false (ProjectForm.jsx:63 e :127, geocoding.jsx:109). A coluna entra como esta, sem inventar quem a ligue; a UI nova e quem decide se a tela de projeto ganha o ajuste de pino que a 0032 registrou como ausente.';

comment on column public.projects.site_pin_updated_by is
  'Quem ajustou o pino a mao pela ultima vez (obra_pin_updated_by). Declarado na entidade do base44 e escrito por tela nenhuma. FK composta para collaborators, e nao para auth.users: no original o campo guarda o id do usuario da plataforma, e neste projeto quem responde por trabalho e o colaborador (mesmo criterio de projects.operational_responsible_id, 0032) - inclusive quem nunca fez login.';

comment on column public.projects.site_pin_updated_at is
  'Instante do ultimo ajuste manual do pino (obra_pin_updated_at). Como site_pin_updated_by, declarado na entidade e escrito por ninguem. Sem check amarrando os dois: nada os escreve hoje, e inventar a regra aqui travaria a importacao de linha antiga.';

comment on constraint projects_site_geocode_ok_requires_coordinates_check on public.projects is
  'Status ok exige coordenada. E como geocoding.jsx grava (:104-108, as duas coordenadas e o status ok na mesma chamada), e o inverso nao e exigido: pin ajustado a mao teria coordenada com status pending, e failed grava so o status (:117). O que se impede e o projeto que se declara geocodificado e nao tem para onde apontar.';

-- RLS AINDA NAO EXISTE NAS TRES TABELAS NOVAS.
--
-- Esta migration nao cria policy nem GRANT para map_properties,
-- map_property_land_types e map_property_purposes. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, elas nascem sem privilegio algum para anon e
-- authenticated, ou seja, invisiveis pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela ficar exposta.
-- Precisa dos dois. A 0058 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades, por tabela.
--
-- Recorte esperado: colaborador active do tenant le; escrita por
-- can_edit_menu('map'). A chave e item proprio da sidebar do original
-- (Layout.jsx:339, 'Mapa de Projetos') e existe em menus desde a 0004.
--
-- As oito colunas novas de projects NAO precisam de policy: RLS e por tabela, e
-- as policies de projects (0033, menu 'projects') ja as governam.
