-- Modulo 2 (CRM) - a busca livre passa a achar por documento e por cidade.
--
-- POR QUE ISTO EXISTE, E POR QUE E MIGRATION NOVA
--   A 0015 ja foi aplicada. Migration aplicada nao se edita (ver
--   docs/ARCHITECTURE.md, "Ambiente de banco"): o arquivo passaria a divergir
--   do que o banco recebeu, e a proxima maquina a aplicar do zero pegaria um
--   schema diferente do que esta em producao.
--
-- O QUE MUDA
--   search_text cobria nome, e-mail e telefone. Passa a cobrir tambem o
--   documento (so os digitos) e a cidade da residencia.
--
--   O documento entra por causa da decisao de produto sobre duplicata: quando
--   alguem esbarra em "esse CPF ja esta cadastrado", quase nunca e porque quis
--   criar duplicata - e porque procurou o cliente e nao achou. Sem o documento
--   na busca, procurar pelo CPF nao devolve nada e a duplicata e a saida
--   natural. Colocar o documento aqui ataca a causa; a mensagem de erro que
--   mostra o dono do documento trata o sintoma. As duas coisas juntas.
--
--   Sao os DIGITOS, nao o tax_id como digitado: quem procura digitando
--   "12345678900" precisa achar o cliente gravado como "123.456.789-00", e
--   vice-versa. Casar pontuacao contra pontuacao e justamente o que nao
--   funciona.
--
--   A cidade entra porque a busca do original tenta filtrar por ela
--   (Clients.jsx:172, `client.city`) e nunca funcionou: o campo em
--   Client.jsonc chama-se current_city, e `client.city` e sempre undefined.
--   Era intencao do original, quebrada por erro de nome - nao e recurso novo.
--
-- CUSTO
--   A coluna e regerada para as linhas existentes e o indice trigrama e
--   reconstruido. Com o volume de um escritorio de arquitetura (milhares de
--   clientes, nao milhoes) isso e instantaneo.

alter table public.clients
  drop column search_text;

alter table public.clients
  add column search_text text
    generated always as (
      btrim(
        name
        || ' ' || coalesce(email::text, '')
        || ' ' || phone
        || ' ' || coalesce(regexp_replace(tax_id, '[^0-9]', '', 'g'), '')
        || ' ' || address_city
      )
    ) stored;

comment on column public.clients.search_text is
  'Nome, e-mail, telefone, documento (so digitos) e cidade da residencia concatenados, so para a busca livre da listagem: o filtro vira um unico ILIKE %termo% sobre esta coluna, em vez de cinco OR que cada tela precisaria repetir igual para acertar o indice. O documento entra sem pontuacao de proposito - quem digita 12345678900 precisa achar quem esta gravado como 123.456.789-00. Coluna gerada por consequencia: dado derivado de outras colunas desta linha segue a mesma regra dos campos de deduplicacao.';

-- O indice caiu junto com a coluna. Mesma definicao da 0015: gin com trigrama,
-- comecando por tenant_id (btree_gin) para o filtro de escritorio entrar no
-- proprio indice em vez de sobrar como filtro depois da varredura.
create index clients_tenant_id_search_text_idx
  on public.clients
  using gin (tenant_id, search_text extensions.gin_trgm_ops);

comment on index public.clients_tenant_id_search_text_idx is
  'Busca livre da listagem de clientes. Trigrama porque a busca do original casa pedaco no meio da palavra (includes), e full-text nao acha "silv" em "Silva" nem trecho de telefone ou de documento.';
