-- O miolo de seguranca da integracao com o Asaas: onde mora a credencial, como
-- o aviso do provedor e autenticado, e onde o resultado fica registrado.
--
-- O QUE A 0125 E A 0126 DEIXARAM PARA CA
--   A 0125 criou as quatro tabelas e disse em voz alta que a API Key e o token
--   do webhook viveriam no Vault, com a tabela guardando so o ponteiro. A 0126
--   abriu LEITURA do estado da conexao para quem ve `settings` e fechou TODA
--   escrita pela tela, registrando que conectar e desconectar seriam funcoes
--   security definer "da camada seguinte, porque tocam o Vault". Esta e a
--   camada seguinte.
--
--   Depois desta migration, `authenticated` continua sem UM caminho de escrita
--   nas quatro tabelas e sem UM caminho ate a chave do Asaas: as seis funcoes
--   daqui tem EXECUTE apenas para service_role, e service_role e a Edge
--   Function, cuja chave nunca sai do servidor.
--
-- POR QUE A AUTORIZACAO PERGUNTA p_user_id, E NAO O JWT
--   `can_edit_menu` responde sobre o usuario do JWT, e quem chama estas funcoes
--   e Edge Function falando como service_role: nao ha JWT ali. A 0085 ja tomou
--   essa decisao e criou `collaborator_can_edit_menu(p_user_id, p_menu_key)`
--   exatamente para a autorizacao continuar morando no banco em vez de ser
--   reescrita em TypeScript dentro de cada funcao. Aqui ela e usada com um
--   aperto a mais que na 0085: como o tenant chega por parametro (e nao e
--   deduzido do usuario), o retorno da funcao e filtrado por
--   `tenant_id = p_tenant_id`. Sem esse filtro, quem edita Configuracoes no
--   escritorio B poderia ligar ou desligar a conta Asaas do escritorio A
--   passando o uuid dele.
--
-- 1. O TOKEN DO WEBHOOK PASSA A SER HASH, E NAO SEGREDO NO VAULT
--
--   DECISAO (usuario, 03/11/2026). O Asaas devolve esse token no cabecalho
--   `asaas-access-token` a CADA aviso, e a doc dele mostra o valor uma unica
--   vez, no momento em que o webhook e criado. Depois disso nos nunca
--   precisamos EXIBIR o token: so COMPARAR.
--
--   Hash serve para comparar. Nao ha o que vazar se a linha for lida, e o
--   indice unico sobre ele responde a pergunta mais dificil do fluxo: DE QUAL
--   ESCRITORIO E ESTE AVISO. Guardar no Vault obrigaria a decifrar o segredo de
--   TODOS os escritorios, um por um, para descobrir de quem e o evento - uma
--   varredura de segredos a cada requisicao de webhook, pelo prazer de guardar
--   cifrado um valor que nao precisa voltar em texto nunca.
--
--   A API Key continua no Vault, e a diferenca e o uso: ela PRECISA voltar em
--   texto para falar com a API do Asaas. O token do webhook nao.
--
-- 2. O GRANT: O HASH FICA DENTRO DO GRANT DE TABELA, COMO NA 0085
--
--   A 0126 deu `grant select` de TABELA em asaas_connections, logo uma coluna
--   nova entra automaticamente no que o colaborador de Configuracoes le. A
--   pergunta foi: a 0085 esconde `integration_api_keys.key_hash` de
--   `authenticated`?
--
--   NAO ESCONDE. A 0085 termina com `grant select on table
--   public.integration_api_keys to authenticated`, grant de tabela, key_hash
--   incluido, e o comentario da policy de la diz com todas as letras que "o que
--   ela le e nome, prefixo, datas e o hash". Nenhuma migration posterior
--   revogou isso. Entao aqui fica igual: grant de tabela, webhook_token_hash
--   dentro dele.
--
--   POR QUE ISSO E INOFENSIVO. Quem alcanca a linha e, pela policy da 0126,
--   quem ve `settings` NO PROPRIO ESCRITORIO - as mesmas pessoas que ja podem
--   desligar a integracao. O que elas passam a enxergar e o sha256 do token do
--   proprio escritorio, e sha256 nao volta. Para forjar um aviso e preciso o
--   token em TEXTO, no cabecalho; o hash nao serve de cabecalho.
--
--   E QUAL E A CONDICAO DESSA FRASE, porque ela tem uma: o token precisa vir de
--   gerador criptografico. Na 0085 isso e garantido pelo banco, que gera a
--   chave com `extensions.gen_random_bytes(32)`. Aqui o token e gerado FORA,
--   pela Edge Function, porque ele tem de ser enviado ao Asaas no corpo do POST
--   que cria o webhook - e o check desta migration consegue exigir tamanho (32
--   a 255 caracteres sem espaco, o que a doc do Asaas pede), nunca entropia.
--   Token previsivel teria hash previsivel, e hash legivel viraria confirmacao
--   de palpite. Quem escrever a Edge Function usa aleatorio de CSPRNG
--   (`crypto.getRandomValues`), e nada derivado de slug, data ou id de
--   escritorio. Isto esta sinalizado no relatorio desta camada, porque e
--   requisito da camada seguinte e nao da ser imposto por constraint.
--
-- 3. O QUE ESTA MIGRATION NAO FAZ
--   Nao cria policy nenhuma, nao concede escrita para authenticated e nao mexe
--   nas tres policies da 0126. A unica mudanca de superficie para a tela e uma
--   coluna que sai e outra que entra, as duas dentro do mesmo SELECT que a 0126
--   ja permitia.
--
--   O teste desta camada e supabase/tests/asaas-conexao.sql
--   (`npm run test:asaas:conexao`).

-- 1. A coluna: de ponteiro de Vault para hash ----------------------------------
--
-- A coluna que sai nunca foi usada: nada escreveu nela, porque a 0126 nao deu
-- escrita a ninguem e as funcoes que escreveriam sao as desta migration. Logo
-- nao ha migracao de dado a fazer, so a troca.

alter table public.asaas_connections
  drop column webhook_token_secret_id;

alter table public.asaas_connections
  add column webhook_token_hash text;

-- Mesmo idioma do key_hash da 0085: sha256 em hexadecimal, 64 caracteres.
-- Com o formato no check, "hash" truncado ou texto cru gravado por engano falha
-- na escrita em vez de virar um token que nunca casa e ninguem entende por que.
alter table public.asaas_connections
  add constraint asaas_connections_webhook_token_hash_format_check
    check (webhook_token_hash ~ '^[0-9a-f]{64}$');

-- O INDICE UNICO E PARTE DA AUTENTICACAO, e nao higiene de modelagem: e ele que
-- torna "de qual escritorio e este aviso" uma busca por igualdade, e e ele que
-- impede dois escritorios de compartilharem o mesmo token - estado em que um
-- aviso legitimo de um poderia baixar a parcela do outro. Nulo nao conta para
-- unicidade no Postgres, e isso e o que queremos: "ainda nao registrei webhook"
-- pode acontecer em muitos escritorios ao mesmo tempo.
alter table public.asaas_connections
  add constraint asaas_connections_webhook_token_hash_key unique (webhook_token_hash);

comment on column public.asaas_connections.webhook_token_hash is
  'SHA-256, em hexadecimal, do authToken do webhook. E o valor que o Asaas devolve no cabecalho `asaas-access-token` em CADA aviso, e e a unica coisa que distingue um aviso legitimo de alguem postando "parcela paga" na nossa URL publica. Guardado como HASH e nao no Vault (0128) porque este valor nunca precisa voltar em texto: a doc do Asaas o mostra uma vez, na criacao do webhook, e dali em diante so se COMPARA. O indice unico sobre ele e o que resolve o escritorio do aviso por igualdade, sem decifrar o segredo de todos. NULO enquanto o webhook nao foi registrado, e nesse estado NENHUM aviso pode ser aceito - asaas_resolve_webhook_token nao casa linha com hash nulo.';

-- O comentario da policy da 0126 citava a coluna que acabou de sair. Comentario
-- de objeto que descreve coluna inexistente envelhece pior do que comentario
-- ausente: ele afirma com confianca um estado que o banco nao tem mais.
comment on policy asaas_connections_select_settings_viewer on public.asaas_connections is
  'DECIDE: quem enxerga Configuracoes le o ESTADO da conexao Asaas do proprio escritorio - ligada ou nao, qual ambiente, ultimo sucesso, ultimo erro. Molde da policy irma de google_calendar_connections (0085): nao e leitura larga como no resto do sistema, porque a linha e infraestrutura de cobranca e interessa a quem configura, nao ao escritorio inteiro. O menu e `settings`, e NAO `receivables`: a tela que liga a conta e Configuracoes. api_key_secret_id fica dentro do grant de tabela, como na 0085, porque e PONTEIRO para o Vault - uuid que nao decifra nada fora dele. webhook_token_hash tambem fica (0128), pelo mesmo motivo que o key_hash da 0085 fica: sha256 nao volta, e para forjar um aviso e preciso o token em TEXTO no cabecalho. NAO DECIDE ESCRITA: sem policy e sem grant de INSERT, UPDATE ou DELETE. Ligar e desligar sao as funcoes security definer da 0128 (asaas_connect, asaas_disconnect), com EXECUTE apenas para service_role.';

comment on table public.asaas_connections is
  'A conta Asaas que o escritorio ligou para cobrar os clientes dele. Guarda METADADO: a API Key vive no Vault e api_key_secret_id so aponta para ela; o token do webhook e guardado como SHA-256 em webhook_token_hash (0128), porque ele so precisa ser comparado, nunca exibido. Uma conexao por escritorio, porque cada escritorio recebe no caixa proprio. RLS (0126): leitura do estado por can_view_menu(''settings'') no tenant do JWT; NENHUMA escrita para authenticated - conectar, registrar webhook, carimbar resultado e desconectar sao as funcoes security definer da 0128, com EXECUTE apenas para service_role.';

-- 2. Ligar a conta, e ler a chave ----------------------------------------------

create or replace function public.asaas_connect(
  p_tenant_id uuid,
  p_user_id uuid,
  p_api_key text,
  p_environment public.asaas_environment
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_existing public.asaas_connections%rowtype;
  v_secret_id uuid;
  v_connection_id uuid;
begin
  /*
    A AUTORIZACAO VEM PRIMEIRO, antes de qualquer validacao de formato: quem nao
    pode conectar nao tem direito nem a saber se a chave que mandou era aceita.
    E ela confere DUAS coisas: que a pessoa pode editar em `settings` e que ela
    e DESTE escritorio. O tenant chega por parametro, e sem o filtro por
    tenant_id quem edita Configuracoes em B ligaria a conta de A.
  */
  select a.collaborator_id into v_collaborator_id
  from public.collaborator_can_edit_menu(p_user_id, 'settings') a
  where a.tenant_id = p_tenant_id
  limit 1;

  if v_collaborator_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if btrim(coalesce(p_api_key, '')) = '' then
    /*
      Chave em branco gravada e integracao que parece ligada na tela de
      Configuracoes e falha em toda emissao, com a mesma cara de chave vencida.
      Falha alto aqui.
    */
    raise exception 'api_key do Asaas em branco'
      using errcode = '22023',
            hint = 'A chave vem de Integracoes > API Key na conta Asaas do escritorio.';
  end if;

  select * into v_existing
  from public.asaas_connections c
  where c.tenant_id = p_tenant_id;

  if found then
    /* Reconexao: o segredo e o MESMO registro do Vault, com valor novo. Criar
       outro deixaria o anterior vivo e sem dono, que e a pior forma de
       credencial esquecida (0085). */
    perform vault.update_secret(v_existing.api_key_secret_id, p_api_key);

    update public.asaas_connections c
    set environment = p_environment,
        connected_by_id = v_collaborator_id,
        connected_at = now(),
        last_error = null,
        last_error_at = null,
        /*
          TROCAR DE AMBIENTE DERRUBA O WEBHOOK REGISTRADO, e isso nao e zelo
          excessivo. O webhook e os ids do Asaas nao atravessam ambiente (0125):
          um webhook criado no sandbox nao existe em producao, e manter o hash
          do token dele deixaria um aviso de sandbox autenticando como se fosse
          do escritorio em producao. Nulo aqui significa "registre o webhook de
          novo", e nesse estado nenhum aviso e aceito - que e exatamente o
          estado correto depois de mudar de ambiente.
        */
        asaas_webhook_id = case when c.environment = p_environment then c.asaas_webhook_id else null end,
        webhook_token_hash = case when c.environment = p_environment then c.webhook_token_hash else null end
    where c.tenant_id = p_tenant_id;

    return v_existing.id;
  end if;

  v_secret_id := vault.create_secret(
    p_api_key,
    'asaas_api_key:' || p_tenant_id::text,
    'API Key do Asaas, escritorio ' || p_tenant_id::text
  );

  /* UNIQUE (tenant_id) da 0125: o caminho de cima cobre o escritorio que ja
     tinha conexao, e este cobre o primeiro vinculo. Duas contas ligadas seriam
     duas contas recebendo pelo mesmo contrato, sem nada dizendo qual vale. */
  insert into public.asaas_connections
    (tenant_id, environment, api_key_secret_id, connected_by_id)
  values (p_tenant_id, p_environment, v_secret_id, v_collaborator_id)
  returning id into v_connection_id;

  return v_connection_id;
end;
$BODY$;

comment on function public.asaas_connect(uuid, uuid, text, public.asaas_environment) is
  'Liga (ou renova) a conta Asaas do escritorio: a API Key vai para o Vault e a tabela guarda so o ponteiro. Autoriza por collaborator_can_edit_menu(p_user_id, ''settings'') FILTRADO pelo tenant recebido, porque quem chama e Edge Function como service_role e nao ha JWT - sem o filtro, quem edita Configuracoes em outro escritorio ligaria a conta deste. Levanta 42501 para quem nao pode e 22023 para chave em branco. Reconexao atualiza o MESMO segredo do Vault; trocar o AMBIENTE zera asaas_webhook_id e webhook_token_hash, porque webhook de sandbox nao existe em producao e o token dele nao pode seguir autenticando aviso.';

create or replace function public.asaas_api_key(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_secret_id uuid;
  v_key text;
begin
  select c.api_key_secret_id into v_secret_id
  from public.asaas_connections c
  where c.tenant_id = p_tenant_id;

  if v_secret_id is null then
    return null;
  end if;

  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.id = v_secret_id;

  return v_key;
end;
$BODY$;

comment on function public.asaas_api_key(uuid) is
  'Devolve a API Key do Asaas do escritorio, decifrada do Vault, ou NULO quando nao ha conexao. Unica porta para esse segredo, e ela nao tem EXECUTE para authenticated nem anon: so a Edge Function chega aqui, antes de falar com a API do Asaas. Essa chave emite cobranca, consulta extrato e movimenta saldo - quem a tem, tem o caixa do escritorio.';

-- 3. Registrar o webhook, e autenticar o aviso que chega ------------------------

create or replace function public.asaas_set_webhook(
  p_tenant_id uuid,
  p_webhook_id text,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_rows int;
begin
  /*
    O QUE A DOC DO ASAAS EXIGE DO authToken: de 32 a 255 caracteres, sem espaco.
    A validacao fica aqui, e nao so no check da coluna, porque o check ve o HASH
    (que tem sempre 64 caracteres) e nunca o token. Sem esta checagem, token de
    tres letras produziria um hash perfeitamente valido para a coluna.

    O PISO DE 32 TAMBEM E DEFESA: ele impede que o hash de uma string curta -
    inclusive de string vazia - fique guardado e passe a casar com um "token"
    que qualquer um adivinha. Entropia, porem, nao da para exigir em SQL: quem
    gera o token e a Edge Function, e ela usa CSPRNG (ver cabecalho).
  */
  if p_token is null
     or length(p_token) < 32
     or length(p_token) > 255
     or p_token ~ '\s' then
    raise exception 'authToken do webhook invalido'
      using errcode = '22023',
            hint = 'O Asaas exige de 32 a 255 caracteres sem espaco. Gere com CSPRNG.';
  end if;

  update public.asaas_connections c
  set asaas_webhook_id = p_webhook_id,
      webhook_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  where c.tenant_id = p_tenant_id;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$BODY$;

comment on function public.asaas_set_webhook(uuid, text, text) is
  'Guarda o webhook que a Edge Function criou no Asaas: o id dele (para poder alterar ou remover depois) e o SHA-256 do authToken. Recusa com 22023 token fora de 32 a 255 caracteres ou com espaco, que e o que a doc do Asaas exige - o check da coluna ve o hash, nunca o token, e por isso a validacao do VALOR mora aqui. Devolve false quando o escritorio nao tem conexao. O token em texto nao e guardado em lugar nenhum: dali em diante so se compara.';

create or replace function public.asaas_resolve_webhook_token(p_token text)
returns table (tenant_id uuid, environment public.asaas_environment)
language plpgsql
stable
security definer
set search_path = ''
as $BODY$
begin
  /*
    ESTA FUNCAO E A AUTENTICACAO DO AVISO. A URL do webhook e publica, e o
    cabecalho `asaas-access-token` e a unica coisa que separa um aviso do Asaas
    de alguem postando "parcela paga" nela. A Edge Function RECUSA o evento
    quando isto vem vazio.

    A COMPARACAO E POR HASH, e o hash do token apresentado e calculado aqui -
    mesmo idioma de resolve_integration_api_key (0085). Nenhuma linha quando nao
    casa: a funcao nao devolve "nao autenticado", devolve NADA, e quem chama nao
    tem como confundir uma coisa com a outra.

    HASH NULO NAO CASA COM TOKEN NENHUM, e isso e o ponto mais importante do
    arquivo. Nulo significa "ainda nao registrei webhook", e nesse estado
    nenhum aviso pode ser confiado. O `is not null` e redundante em SQL (nulo
    nunca e igual a nada) e esta escrito de proposito: ele e a frase que diz
    que a ausencia de token e recusa, e nao caso nao pensado.
  */
  return query
  select c.tenant_id, c.environment
  from public.asaas_connections c
  where c.webhook_token_hash is not null
    and c.webhook_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
end;
$BODY$;

comment on function public.asaas_resolve_webhook_token(text) is
  'Traduz o cabecalho `asaas-access-token` de um aviso no escritorio dono dele, e no ambiente em que aquela conexao fala. Devolve NENHUMA LINHA quando o token nao casa, e a Edge Function recusa o evento nesse caso - a URL do webhook e publica, e este token e a unica coisa que distingue o aviso do Asaas de alguem postando "parcela paga" nela. Compara por SHA-256, e conexao com webhook_token_hash NULO nao casa com token nenhum: nulo e "webhook ainda nao registrado", estado em que nenhum aviso pode ser aceito. O indice unico sobre o hash e o que faz esta resolucao ser uma busca por igualdade, e nao uma varredura decifrando o segredo de cada escritorio.';

-- 4. Registrar o resultado ------------------------------------------------------

create or replace function public.asaas_record_result(
  p_tenant_id uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  /*
    p_error NULO E SUCESSO: carimba last_success_at e LIMPA last_error e
    last_error_at. Erro antigo que sobrevive ao sucesso seguinte e pior do que
    erro nenhum: a tela de Configuracoes passa a mostrar um problema que nao
    existe mais, e quem olha para de acreditar no campo.
  */
  update public.asaas_connections c
  set last_success_at = case when p_error is null then now() else c.last_success_at end,
      last_error = p_error,
      last_error_at = case when p_error is null then null else now() end
  where c.tenant_id = p_tenant_id;
end;
$BODY$;

comment on function public.asaas_record_result(uuid, text) is
  'Carimba o resultado da ultima conversa com o Asaas. p_error nulo e SUCESSO: grava last_success_at e LIMPA last_error e last_error_at, porque erro que sobrevive ao sucesso seguinte faz a tela mostrar problema que nao existe. SEGUNDO USO, DECIDIDO PELO USUARIO EM 03/11/2026, E NAO E ACESSORIO: quando o PROCESSAMENTO DE UM AVISO do Asaas falhar, e por aqui que o escritorio fica sabendo. last_error e a unica coluna deste modulo que a tela de Configuracoes le - asaas_webhook_events nao tem policy nem grant, por decisao da 0126 - entao chamar esta funcao com o erro do processamento e o unico caminho entre uma falha de webhook e um humano. NAO "limpe" esse uso achando que a funcao e so para erro de conexao.';

-- 5. Desligar a conta ----------------------------------------------------------

create or replace function public.asaas_disconnect(
  p_tenant_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_secret_id uuid;
begin
  /* Mesma autorizacao do connect, e pelo mesmo motivo: desligar a cobranca de
     um escritorio e tao grave quanto ligar. Filtrada pelo tenant recebido. */
  select a.collaborator_id into v_collaborator_id
  from public.collaborator_can_edit_menu(p_user_id, 'settings') a
  where a.tenant_id = p_tenant_id
  limit 1;

  if v_collaborator_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  /*
    A COBRANCA E O ESPELHO FICAM, e isso e decisao (usuario, 03/11/2026):

      asaas_charges   - cobranca emitida existe no Asaas independente da nossa
                        conexao. O cliente continua com o boleto e o PIX na mao,
                        e apagar a linha faria o sistema deixar de saber a quem
                        o dinheiro que entrar depois pertence.
      asaas_customers - apagar o espelho faria o sistema ESQUECER que ja criou
                        aquele cliente no Asaas. Na reconexao ele criaria um
                        segundo `cus_` para a mesma pessoa, com metade do
                        historico em cada - exatamente o duplicado que a chave
                        unica da 0125 existe para impedir.

    Nenhuma das duas tem FK para esta tabela, entao nao ha cascade escondido: o
    DELETE abaixo alcanca uma linha e so.
  */
  delete from public.asaas_connections c
  where c.tenant_id = p_tenant_id
  returning c.api_key_secret_id into v_secret_id;

  if v_secret_id is null then
    return false;
  end if;

  /*
    O SEGREDO VAI JUNTO, cuidado copiado do google_calendar_disconnect (0085):
    apagar so a linha deixaria a API Key viva no Vault, sem dono e sem nada que
    a mencione. Quem remove o webhook do lado do Asaas e a Edge Function, antes
    de chamar esta funcao - e ela precisa do asaas_webhook_id, que esta na linha
    que este DELETE apaga.

    O hash do token nao precisa de faxina: ele morre com a linha.
  */
  delete from vault.secrets s where s.id = v_secret_id;

  return true;
end;
$BODY$;

comment on function public.asaas_disconnect(uuid, uuid) is
  'Desliga a conta Asaas do escritorio: apaga a linha de conexao E a API Key do Vault, sem deixar segredo orfao. Mesma autorizacao do connect (can_edit em `settings`, filtrado pelo tenant recebido), porque desligar a cobranca e tao grave quanto ligar. NAO APAGA asaas_charges NEM asaas_customers, de proposito: cobranca emitida existe no Asaas independente da nossa conexao, e apagar o espelho faria o sistema esquecer que ja criou aquele cliente la, criando um segundo cus_ na reconexao. Remover o webhook do lado do Asaas e da Edge Function, ANTES desta chamada, porque o asaas_webhook_id morre com a linha.';

-- 6. Quem executa: service_role, e mais ninguem --------------------------------
--
-- As seis tocam credencial ou autenticacao de aviso. Nenhuma tem EXECUTE para
-- authenticated ou anon, e e por isso que a tela nao alcanca a chave do Asaas
-- por nenhum caminho: nao ha funcao intermediaria, nao ha coluna com o valor e
-- nao ha grant.
--
-- O revoke e redundante desde que a 0007 desarmou o DEFAULT PRIVILEGE de
-- EXECUTE, e fica escrito porque redundancia barata em barreira de acesso e
-- barata - e porque este e o arquivo em que um grant esquecido custaria o caixa
-- do escritorio.

revoke all on function public.asaas_connect(uuid, uuid, text, public.asaas_environment) from public, anon, authenticated;
revoke all on function public.asaas_api_key(uuid) from public, anon, authenticated;
revoke all on function public.asaas_set_webhook(uuid, text, text) from public, anon, authenticated;
revoke all on function public.asaas_resolve_webhook_token(text) from public, anon, authenticated;
revoke all on function public.asaas_record_result(uuid, text) from public, anon, authenticated;
revoke all on function public.asaas_disconnect(uuid, uuid) from public, anon, authenticated;

grant execute on function public.asaas_connect(uuid, uuid, text, public.asaas_environment) to service_role;
grant execute on function public.asaas_api_key(uuid) to service_role;
grant execute on function public.asaas_set_webhook(uuid, text, text) to service_role;
grant execute on function public.asaas_resolve_webhook_token(text) to service_role;
grant execute on function public.asaas_record_result(uuid, text) to service_role;
grant execute on function public.asaas_disconnect(uuid, uuid) to service_role;
