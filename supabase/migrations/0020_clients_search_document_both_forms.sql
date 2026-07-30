-- A busca acha o documento nas DUAS formas: como digitado e só dígitos.
--
-- REGRESSAO QUE ISTO CONSERTA
--   A 0016 colocou o documento no search_text apenas em digitos, para que quem
--   digita 12345678900 ache quem esta gravado como 123.456.789-00. Resolveu esse
--   lado e quebrou o outro: colar o CPF FORMATADO passou a nao achar nada, e no
--   original achava (Clients.jsx:173 filtra por cpf_cnpj como digitado).
--
--   Colar o documento formatado, vindo de uma planilha ou de uma mensagem de
--   WhatsApp, e o gesto mais provavel de quem procura um cliente. E este projeto
--   decidiu que "procurei e nao achei" e a causa raiz da duplicata - deixar
--   justamente esse gesto sem resultado empurra a pessoa para cadastrar de novo.
--
--   Normalizar o termo digitado no frontend nao resolve: o telefone esta no
--   search_text COM pontuacao, e tirar pontuacao do termo quebraria a busca por
--   telefone formatado, que hoje funciona. O lugar do conserto e a coluna, que
--   pode conter as duas formas ao mesmo tempo.
--
--   Custo: search_text fica ~14 caracteres mais longo por linha com documento.
--   O indice de trigrama cresce na mesma proporcao. Irrelevante no volume de um
--   escritorio de arquitetura, e o alternativa e busca que nao acha.
--
-- POR QUE MIGRATION NOVA
--   A 0016 ja foi aplicada. Migration aplicada nao se edita (docs/ARCHITECTURE.md).

alter table public.clients
  drop column search_text;

alter table public.clients
  add column search_text text
    generated always as (
      btrim(
        name
        || ' ' || coalesce(email::text, '')
        || ' ' || phone
        || ' ' || coalesce(tax_id, '')
        || ' ' || coalesce(regexp_replace(tax_id, '[^0-9]', '', 'g'), '')
        || ' ' || address_city
      )
    ) stored;

comment on column public.clients.search_text is
  'Nome, e-mail, telefone, documento em DUAS formas (como digitado e so digitos) e cidade da residencia, concatenados para a busca livre da listagem: o filtro vira um unico ILIKE %termo% sobre esta coluna, em vez de seis OR que cada tela repetiria de forma diferente e perderia o indice. As duas formas do documento existem porque os dois gestos sao comuns e legitimos - digitar so numeros, e colar o CPF formatado de uma planilha. Cobrir so uma delas deixa metade das buscas sem resultado, e busca sem resultado e a causa raiz da duplicata neste dominio. Coluna gerada por consequencia: dado derivado de outras colunas desta linha segue a mesma regra dos campos de deduplicacao.';

create index clients_tenant_id_search_text_idx
  on public.clients
  using gin (tenant_id, search_text extensions.gin_trgm_ops);

comment on index public.clients_tenant_id_search_text_idx is
  'Busca livre da listagem de clientes. Trigrama porque a busca do original casa pedaco no meio da palavra (includes), e full-text nao acha "silv" em "Silva" nem trecho de telefone ou de documento.';
