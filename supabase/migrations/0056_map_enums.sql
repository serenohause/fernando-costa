-- Modulo 9 (Mapa) - enums de PropriedadeMapa e da geolocalizacao da obra.
--
-- Mesma estrutura da 0001, 0014, 0021, 0028, 0031, 0040 e 0048: o que e
-- infraestrutura do modulo (tipos) vem em migration propria, antes das tabelas,
-- para que a migration das tabelas seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secoes "Mapa"
-- (map_visual_status) e "Projetos" (geocode_status). Rotulo em portugues vive na
-- UI (src/lib/enums.ts), nunca no banco.
--
-- geocode_status E A DIVIDA QUE A 0031 DECLAROU
--   A migration 0031 registrou por escrito: "NAO entra aqui geocode_status. Os
--   oito campos obra_* de Project foram adiados para o modulo 9
--   (docs/SCHEMA-PLAN.md, 'Decisao 1'), junto com map_properties, e o enum deles
--   nasce la - criar o tipo agora seria deixar tipo sem coluna." E aqui.
--
-- SEM POSTGIS, E A DECISAO E DESTE MODULO
--   docs/SCHEMA-PLAN.md (secao "Modulo 9 - Mapa") afirma que lat/lng viram
--   geography(Point) "porque a tela agrupa marcadores por proximidade
--   (react-leaflet-cluster) e filtra por raio". As duas justificativas foram
--   conferidas contra o original e sao FALSAS:
--
--     - react-leaflet-cluster NAO e importado em lugar nenhum. MapaProjetos.jsx
--       renderiza um <Marker> por propriedade, sem agrupamento
--       (MapaProjetos.jsx:1172-1276).
--     - Nao existe filtro por raio. Os filtros da tela sao cliente, nome, status,
--       cidade e finalidade, todos por igualdade ou substring, todos no navegador
--       (MapaProjetos.jsx:297-311).
--     - O UNICO calculo de distancia do sistema inteiro e
--       `currentCenter.distanceTo(center) / 1000` em MapaProjetos.jsx:50, e o
--       resultado nao filtra nada: entra na formula que decide se a animacao de
--       voo do mapa dura 900ms ou 1800ms.
--
--   Entao lat e lng ficam como no original: dois numeric. Instrucao do usuario
--   para este modulo e fidelidade ao original, e PostGIS aqui seria uma extensao
--   inteira, um tipo que o PostgREST serializa em WKB e um indice GiST a servico
--   da duracao de uma animacao. Se um dia entrar busca por raio ou agrupamento no
--   servidor, a migracao numeric -> geography e trivial e tem quem a peca.
--
-- O QUE FOI ACRESCENTADO A docs/ENUM-MAP.md NESTA MIGRATION
--   Nada de valor novo: map_visual_status e geocode_status ja estavam mapeados.
--   O que entrou la foi a nota de onde cada um passou a viver como coluna.

create type public.geocode_status as enum (
  'pending',
  'ok',
  'failed'
);

create type public.map_visual_status as enum (
  'not_started',
  'in_development',
  'paused',
  'completed'
);

comment on type public.geocode_status is
  'Resultado da ultima tentativa de geocodificar o endereco da obra. De/para: pending=PENDING, ok=OK, failed=FAILED. Usado por projects.site_geocode_status (0057). O original tem um quarto estado que a entidade nao declara: ProjectForm.jsx:62 inicializa obra_geocode_status com string vazia, e o base44 aceita. Aqui string vazia nao e valor de enum, e a coluna cai no default pending - que e exatamente o que "" significava.';

comment on type public.map_visual_status is
  'Status exibido no marcador de uma propriedade do mapa que NAO esta vinculada a um projeto. De/para: not_started=Nao iniciado, in_development=Em desenvolvimento, paused=Pausado, completed=Concluido. NAO e project_status, apesar de dois valores coincidirem: "Pausado" aqui e "Suspenso" la, e a tela le project.status quando ha projeto vinculado e cai neste enum so quando nao ha (MapaProjetos.jsx:287). Enum separado de proposito, como registra docs/ENUM-MAP.md.';
