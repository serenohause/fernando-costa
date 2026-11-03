-- A TELA DE COBRANCA PRECISA SABER SE O AVISO DE PAGAMENTO ESTA DE PE.
--
-- O PROBLEMA, E ELE E DE DINHEIRO
--
-- `asaas-charge` devolve `webhookRegistered` porque existe um estado real em que
-- a cobranca pode ser emitida e nenhum aviso vai chegar: `webhook_token_hash`
-- nulo (0125). Nesse estado o cliente paga, o Asaas nao consegue avisar, e a
-- parcela fica aberta. O escritorio so descobre contando dinheiro no fim do mes.
--
-- Mas esse campo so existe NA RESPOSTA de uma emissao. Quem abre o painel de uma
-- cobranca que ja existe nao emite nada, e portanto nao recebe resposta nenhuma:
-- a tela volta a prometer "quando o cliente pagar, esta parcela vira paga
-- sozinha" sem ter como saber se isso e verdade.
--
-- O DADO EXISTE E A TELA NAO ALCANCA. Ele esta em `asaas_connections`, e a
-- policy da 0126 exige `can_view_menu('settings')` - de proposito, porque a
-- linha e infraestrutura de cobranca e interessa a quem configura. Quem usa
-- Contas a Receber e o financeiro, que nao tem `settings`, e recebe ZERO linhas.
--
-- POR QUE UMA FUNCAO, E NAO ALARGAR A POLICY
--
-- Alargar a policy para `receivables` entregaria a linha INTEIRA: o ponteiro do
-- Vault, o hash do token do webhook, o id do webhook, o ultimo erro, quem
-- conectou. A tela de cobranca precisa de DOIS campos, e um deles nem e campo,
-- e a resposta de "a coluna e nula?".
--
-- Entao o recorte vem por funcao, e o que sai dela e o minimo:
--
--   environment         decide se a cobranca e dinheiro de verdade. O botao de
--                       emitir precisa poder dizer isso antes de alguem clicar.
--   webhook_registered  BOOLEANO, nunca o hash. Quem ve Contas a Receber nao
--                       passa a ver o hash do token por causa desta migration.
--
-- O QUE ELA NAO DEVOLVE: `api_key_secret_id`, `asaas_webhook_id`, `last_error`,
-- `last_error_at`, `last_success_at`, `connected_by_id`. Nada disso tem leitor
-- na tela de cobranca, e `last_error` em especial continua sendo assunto de
-- Configuracoes, que e onde existe alguem com poder de consertar.
--
-- AUTORIZACAO: `receivables` OU `settings`
--
-- As duas, porque as duas telas fazem a mesma pergunta. Configuracoes ja le a
-- linha inteira pela policy, e por isso nao ganha nada de novo aqui; esta no
-- `or` para a funcao nao ter um buraco esquisito, em que quem configura a
-- integracao e a unica pessoa que nao consegue chamar a funcao sobre ela.
--
-- `security definer` com `search_path = ''` e o mesmo molde das seis funcoes da
-- 0128. A diferenca e o EXECUTE: esta tem `authenticated`, e PODE ter, porque
-- ela nao toca no cofre e nao devolve segredo. As da 0128 sao `service_role` e
-- continuam sendo.
--
-- UMA LINHA OU NENHUMA. Escritorio sem conexao Asaas recebe conjunto vazio, que
-- e o mesmo que a tela ja trata hoje: nao ha o que emitir, e o botao manda ligar
-- a conta em Configuracoes.

create or replace function public.asaas_connection_status()
returns table (
  environment public.asaas_environment,
  webhook_registered boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $BODY$
begin
  -- A pergunta de permissao vem antes de qualquer leitura, e as duas chaves
  -- existem: `can_view_menu` levanta erro para chave inexistente de proposito
  -- (0059), entao digitar errado aqui seria bug alto, nao acesso negado.
  if not (public.can_view_menu('receivables') or public.can_view_menu('settings')) then
    return;
  end if;

  -- O tenant vem do JWT, como em toda policy deste sistema, e nunca de
  -- parametro: funcao `security definer` que aceita tenant por parametro
  -- precisaria conferir o tenant de quem chama, e aqui nao ha o que conferir
  -- porque so existe um tenant possivel para a sessao.
  return query
  select c.environment, c.webhook_token_hash is not null
  from public.asaas_connections c
  where c.tenant_id = (select public.auth_tenant_id());
end;
$BODY$;

comment on function public.asaas_connection_status() is
  'O minimo que a tela de Contas a Receber precisa saber sobre a conexao Asaas do escritorio: em que ambiente ela fala e se o aviso de pagamento esta registrado. Existe porque `webhookRegistered` so chega na resposta de uma emissao, e quem abre o painel de uma cobranca que ja existe nao emite nada - sem isto a tela promete baixa automatica sem ter como saber se ela vai acontecer. Devolve BOOLEANO e nunca o hash do token, e nao devolve ponteiro do Vault, id de webhook nem last_error: a linha inteira continua sendo leitura de quem ve `settings` (0126). EXECUTE para authenticated, ao contrario das seis funcoes da 0128, porque esta nao toca no cofre e nao devolve segredo. Autoriza por can_view_menu(''receivables'') OU (''settings''), e devolve conjunto vazio para escritorio sem conexao.';

-- O `anon` PRECISA DE REVOKE PROPRIO, e `from public` NAO basta.
--
-- Medido neste projeto em 03/11/2026: depois de
-- `revoke all ... from public`, o ACL da funcao ficou
-- `postgres=X | anon=X | authenticated=X | service_role=X`. O `anon` tem grant
-- EXPLICITO, vindo do `alter default privileges` da plataforma, e revogar de
-- PUBLIC nao toca em grant explicito - tira apenas a entrada `=X`.
--
-- O efeito pratico era pequeno: sem JWT, `can_view_menu` devolve falso e a
-- funcao devolve conjunto vazio, entao `anon` chamando nao via nada. Mas "nao ve
-- nada porque a checagem interna recusa" e diferente de "nao pode chamar", e a
-- segunda e a que esta escrita no comentario desta funcao. Quando as duas
-- discordam, quem le acredita no comentario.
--
-- `can_view_menu` (0059) ja e `authenticated` apenas, e esta funcao passa a ser
-- igual.
revoke all on function public.asaas_connection_status() from public;
revoke all on function public.asaas_connection_status() from anon;
grant execute on function public.asaas_connection_status() to authenticated;
