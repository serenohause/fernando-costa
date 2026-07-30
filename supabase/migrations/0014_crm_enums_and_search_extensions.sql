-- Modulo 2 (CRM) - enums de Client e extensoes usadas pela busca da listagem.
--
-- Mesma estrutura da 0001: o que e infraestrutura do modulo (tipos e extensoes)
-- vem em uma migration propria, antes da tabela, para que a migration da tabela
-- seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secao CRM. Rotulo em
-- portugues vive na UI (src/lib/enums.ts), nunca no banco.

create type public.client_type as enum ('individual', 'company');

create type public.lead_source as enum (
  'instagram',
  'referral',
  'website',
  'other'
);

comment on type public.client_type is
  'Natureza juridica do cliente. De/para: individual=Pessoa Fisica, company=Pessoa Juridica. Nao determina o formato do documento em clients.tax_id: o original nao amarra os dois e ha cadastro de Pessoa Fisica com CNPJ de empresa familiar.';

comment on type public.lead_source is
  'Canal por onde o cliente chegou. De/para: instagram=Instagram, referral=Indicacao, website=Site, other=Outros. O valor e copiado para negotiations.origin quando a oportunidade e criada a partir do cliente (modulo 3).';

-- Extensoes da busca livre da listagem de CRM.
--
-- pg_trgm: a tela de clientes tem campo de busca que casa PEDACO de palavra no
-- meio do texto (no original, `name.toLowerCase().includes(query)` no cliente,
-- sobre a lista inteira baixada). O equivalente no banco e ILIKE '%termo%', que
-- nenhum indice btree atende - so indice de trigrama. Busca full-text
-- (to_tsvector) foi descartada: ela indexa palavra inteira com radical de
-- idioma, entao nao acha "silv" dentro de "Silva" nem trecho de telefone, que e
-- exatamente o uso da tela.
--
-- btree_gin: para o indice de trigrama poder COMECAR por tenant_id, como manda a
-- regra de multitenancy do CLAUDE.md. GIN nao sabe indexar uuid sozinho; com
-- btree_gin sabe, e a busca passa a varrer apenas as postagens do escritorio de
-- quem consultou, em vez de varrer os trigramas de todos os escritorios e
-- descartar depois.
--
-- Em "extensions", nunca em public, seguindo a 0001.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gin with schema extensions;
