-- O cadastro de cliente passa a guardar os dados da EMPRESA.
--
-- O CASO
--   `client_type` distingue Pessoa Fisica de Juridica desde a 0014, e `tax_id`
--   guarda CPF ou CNPJ no mesmo campo. Era tudo. Um cliente PJ ficava com o
--   NOME DE UMA PESSOA no campo `name` e um CNPJ ao lado — e o contrato, que
--   precisa da razao social e do endereco da sede, nao tinha de onde tirar.
--
--   Medido no dado real do escritorio: ha clientes marcados como Pessoa
--   Juridica cujo `name` e o nome do socio, porque nao havia campo para a
--   empresa.
--
--   Nem o base44 tem isso: a exportacao de Client nao traz nenhuma coluna de
--   empresa. Nao e porte de campo existente, e sim campo novo pedido pelo
--   escritorio.
--
-- O CNPJ NAO GANHA COLUNA PROPRIA
--   Ele ja e `tax_id` quando o cliente e PJ, e a deduplicacao do CRM (0015,
--   0065) trabalha sobre `tax_id_digits`. Uma segunda coluna com o mesmo
--   documento seria duas verdades sobre o mesmo fato — e a primeira a divergir
--   quebraria a deduplicacao sem que nada acusasse.
--
-- POR QUE UM ENDERECO PROPRIO DA SEDE
--   O cliente ja tem dois enderecos: o dele (`address_*`) e o da obra
--   (`site_*`). A sede e um TERCEIRO, e nao se confunde com nenhum: a pessoa
--   mora num lugar, a obra fica em outro, e a empresa que assina o contrato tem
--   endereco proprio. Reaproveitar `address_*` para a sede faria o cadastro de
--   um PJ perder o endereco de quem responde por ele.
--
-- SITUACAO CADASTRAL E CNAE NAO SAO GRAVADOS, de proposito. A consulta ao CNPJ
-- mostra os dois na tela para quem esta cadastrando, e eles ENVELHECEM: uma
-- empresa ativa hoje pode estar baixada no ano que vem, e um contrato afirmando
-- "ATIVA" com base numa consulta de 2026 seria uma mentira com data. Quem
-- precisa do estado atual consulta de novo.

alter table public.clients
  add column company_legal_name text,
  add column company_trade_name text,
  add column company_state_registration text,
  add column company_address_zipcode text,
  add column company_address_street text,
  add column company_address_number text,
  add column company_address_complement text,
  add column company_address_district text,
  add column company_address_city text,
  add column company_address_state text;

/*
  Tetos iguais aos dos campos irmaos do mesmo cadastro (0015): e o mesmo tipo de
  dado, digitado no mesmo formulario, e limites diferentes para campos iguais
  viram surpresa na hora de salvar.

  NAO ha check exigindo que estes campos so existam com client_type = 'company'.
  Mesma decisao (e mesmo motivo) de `referrer_name` na 0082: quem trocar o tipo
  de um cadastro antigo receberia um erro de gravacao em vez de um campo
  limpo. Quem exige o vinculo e a TELA, que so habilita a aba de empresa quando
  o tipo e Pessoa Juridica.
*/
alter table public.clients
  add constraint clients_company_legal_name_length_check
    check (company_legal_name is null or length(company_legal_name) <= 200),
  add constraint clients_company_trade_name_length_check
    check (company_trade_name is null or length(company_trade_name) <= 200),
  add constraint clients_company_state_registration_length_check
    check (company_state_registration is null or length(company_state_registration) <= 30),
  add constraint clients_company_address_state_length_check
    check (company_address_state is null or length(company_address_state) <= 2);

comment on column public.clients.company_legal_name is
  'Razao social. Vem da consulta ao CNPJ (BrasilAPI) ou e digitada. O `name` do cadastro continua sendo como o escritorio chama o cliente - que num PJ costuma ser o nome do socio.';
comment on column public.clients.company_trade_name is
  'Nome fantasia. A consulta ao CNPJ devolve vazio para boa parte das empresas, e isso e um fato sobre a empresa, nao uma falha da busca.';
comment on column public.clients.company_address_city is
  'Cidade da SEDE - o terceiro endereco do cadastro, ao lado do da pessoa (address_*) e do da obra (site_*). Sao tres lugares diferentes e nenhum substitui o outro.';
