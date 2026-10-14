-- Buscar cliente sem depender do acento.
--
-- O RELATO
--   "Teria como atualizar a questao dos acentos nos nomes dos clientes? Para
--   quando eu for fazer pesquisa de nomes utilizando ou nao o acento o sistema
--   puxar todos eles."
--
-- O QUE ACONTECE HOJE
--   A busca e um `ilike` sobre `clients.search_text` (0015/0016), que guarda o
--   nome como foi digitado. "Junior" nao acha "Júnior", e o caso real tem os
--   dois: ha duas empresas cadastradas, "Junior Sintonia" e "Júnior Sintonia".
--   Quem procura por uma nunca ve a outra.
--
-- O QUE MUDA
--   Uma coluna a mais, com o mesmo conteudo de `search_text` porem sem acento e
--   em minusculas, e a tela passa a comparar o termo tambem sem acento. Nada do
--   que ja existe muda de valor: `search_text` continua igual, para quem depende
--   dela.
--
-- POR QUE A EXPRESSAO E COPIADA, E NAO REAPROVEITADA
--   Coluna gerada nao pode ler outra coluna gerada (Postgres recusa), entao
--   `search_plain` repete a expressao de `search_text` por dentro do unaccent.
--   As duas precisam andar juntas: mexeu numa, mexe na outra.
--
-- POR QUE UM EMBRULHO EM VOLTA DO `unaccent`
--   `unaccent(text)` e STABLE, e coluna gerada exige IMMUTABLE. A forma de dois
--   argumentos, que recebe o dicionario explicito, e IMMUTABLE — e e nela que o
--   embrulho abaixo se apoia.

create extension if not exists unaccent with schema extensions;

create function public.unaccent_imm(p_texto text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $BODY$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_texto)
$BODY$;

comment on function public.unaccent_imm is
  'Tira os acentos de um texto, em forma IMMUTABLE para uso em coluna gerada e indice (0105).';

-- Clientes ----------------------------------------------------------------------

alter table public.clients
  add column search_plain text generated always as (
    public.unaccent_imm(lower(btrim(
      name || ' ' ||
      coalesce(email::text, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(tax_id, '') || ' ' ||
      coalesce(regexp_replace(tax_id, '[^0-9]', '', 'g'), '') || ' ' ||
      coalesce(address_city, '')
    )))
  ) stored;

comment on column public.clients.search_plain is
  'O mesmo que search_text, sem acento e em minusculas (0105). A tela compara o termo digitado tambem sem acento, para "Junior" achar "Júnior" e vice-versa.';

/* Trigrama, e nao btree: a busca e `%termo%`, e btree nao serve para o que
   comeca no meio. `pg_trgm` ja esta instalado desde a 0016. */
create index clients_tenant_id_search_plain_idx
  on public.clients using gin (search_plain extensions.gin_trgm_ops);

-- Pessoas do cadastro (0102) -------------------------------------------------------

alter table public.client_people
  add column name_plain text generated always as (public.unaccent_imm(lower(name))) stored;

comment on column public.client_people.name_plain is
  'O nome da pessoa sem acento e em minusculas, para a busca do CRM encontrar o cliente pelo conjuge ou socio sem depender do acento (0105).';

create index client_people_tenant_id_name_plain_idx
  on public.client_people using gin (name_plain extensions.gin_trgm_ops);
