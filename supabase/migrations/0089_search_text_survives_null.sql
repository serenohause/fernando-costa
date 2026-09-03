-- Cliente sem cidade sumia de TODA busca do CRM.
--
-- O QUE ACONTECIA
--   `search_text` (0020) concatena com `||`, e em SQL qualquer NULL numa
--   concatenacao anula a expressao INTEIRA. A expressao protegia com coalesce o
--   e-mail e o documento — os campos que eram anulaveis quando ela foi escrita —
--   e deixou `phone` e `address_city` crus, porque os dois eram NOT NULL.
--
--   A 0064 tornou `address_city` anulavel: 1 cliente do base44 nao tem NENHUM
--   campo de endereco preenchido, e inventar "Goiania" porque e onde o
--   escritorio fica seria gravar endereco que ninguem informou. A decisao esta
--   certa; o que ficou para tras foi esta coluna.
--
--   Resultado: quem nao tem cidade fica com `search_text` NULO, e `ILIKE` contra
--   NULO nao casa NUNCA. O cliente aparece na lista sem filtro e desaparece ao
--   digitar qualquer letra — inclusive a primeira letra do proprio nome.
--
--   Relatado em producao com "Alencar Maquinas". Medido no banco real: 3 dos
--   146 clientes, os tres sem cidade.
--
-- POR QUE ISSO E PIOR DO QUE PARECE
--   Este projeto decidiu, na 0020, que "procurei e nao achei" e a causa raiz da
--   duplicata: quem nao acha, cadastra de novo. Um cliente invisivel para a
--   busca e exatamente o caminho para a segunda ficha da mesma empresa.
--
-- O CONSERTO
--   `coalesce` em TODOS os campos, inclusive nos que sao NOT NULL hoje. Nao e
--   excesso de zelo: `phone` esta cru pelo mesmo motivo que `address_city`
--   estava, e a proxima migration que o tornar anulavel repete este bug sem que
--   nada acuse. O `btrim` externo ja cuida do espaco que sobra.
--
--   `name` fica sem coalesce de proposito: e NOT NULL e tem check de nao-branco
--   desde a 0015. Cliente sem nome nao existe, e envolve-lo em coalesce
--   sugeriria que pode existir.
--
-- POR QUE DROP + ADD
--   Nao ha ALTER que troque a expressao de uma coluna gerada. A coluna e
--   derivada: recria-la nao perde dado nenhum, so recalcula. O indice cai junto
--   e volta logo abaixo, identico ao da 0020.

alter table public.clients
  drop column search_text;

alter table public.clients
  add column search_text text
    generated always as (
      btrim(
        name
        || ' ' || coalesce(email::text, '')
        || ' ' || coalesce(phone, '')
        || ' ' || coalesce(tax_id, '')
        || ' ' || coalesce(regexp_replace(tax_id, '[^0-9]', '', 'g'), '')
        || ' ' || coalesce(address_city, '')
      )
    ) stored;

comment on column public.clients.search_text is
  'Nome, e-mail, telefone, documento em DUAS formas (como digitado e so digitos) e cidade da residencia, concatenados para a busca livre da listagem: o filtro vira um unico ILIKE %termo% sobre esta coluna, em vez de seis OR que cada tela repetiria de forma diferente e perderia o indice. TODO campo anulavel passa por coalesce, e desde a 0089 tambem os que sao NOT NULL hoje: concatenacao com NULL anula a expressao inteira, e foi assim que cliente sem cidade (anulavel desde a 0064) sumiu de toda busca do CRM enquanto continuava na lista. So `name` fica cru, porque e NOT NULL com check de nao-branco desde a 0015.';

create index clients_tenant_id_search_text_idx
  on public.clients
  using gin (tenant_id, search_text extensions.gin_trgm_ops);

comment on index public.clients_tenant_id_search_text_idx is
  'Busca livre da listagem de clientes. Trigrama porque a busca do original casa pedaco no meio da palavra (includes), e full-text nao acha "silv" em "Silva" nem trecho de telefone ou de documento.';
