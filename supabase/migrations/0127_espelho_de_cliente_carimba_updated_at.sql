-- O TRIGGER QUE FALTOU NO ESPELHO DE CLIENTE DO ASAAS.
--
-- A 0125 criou quatro tabelas. Tres delas ficaram certas: `asaas_connections` e
-- `asaas_charges` tem a coluna `updated_at` E o trigger que a carimba, e
-- `asaas_webhook_events` nao tem nem a coluna, porque aviso recebido nao se
-- altera. `asaas_customers` ficou no meio: tem a coluna e nao tinha o trigger.
--
-- POR QUE ISSO IMPORTA, mesmo a tabela sendo pequena. A coluna com valor
-- default `now()` e sem trigger nao fica vazia nem acusa erro: ela congela na
-- hora em que a linha nasceu e continua parecendo informacao. Quem olhar vai
-- ler "espelho atualizado em" e receber a data do primeiro espelhamento, que e
-- justamente a pergunta que a coluna existe para responder. Erro que se parece
-- com dado e pior do que coluna ausente.
--
-- Hoje ninguem foi enganado ainda: `authenticated` nao escreve nesta tabela
-- (0126 deu apenas `select`), e quem escreve e a Edge Function como
-- `service_role`, que ainda nao existe. O conserto vem antes de existir alguem
-- para confiar no valor errado.
--
-- Por que migration nova e nao conserto na 0125: a 0125 ja esta aplicada e
-- registrada no banco de dev. Editar arquivo ja aplicado deixa o repositorio
-- afirmando um estado que nenhum banco tem.

create trigger asaas_customers_set_updated_at
  before update on public.asaas_customers
  for each row execute function public.set_updated_at();
