-- Integracao com o Google Agenda, e a chave que a automacao usa para ler dela.
--
-- O QUE O ESCRITORIO PEDIU
--   A agenda do diretor precisa chegar todo dia no WhatsApp dele, disparada por
--   uma automacao em n8n. O sistema e o lugar onde a conta Google e conectada;
--   a automacao consome o resultado ja pronto.
--
-- POR QUE OAUTH, E NAO CONTA DE SERVICO
--   Conta de servico com delegacao so existe em Google Workspace. O escritorio
--   pode ter Workspace ou Gmail comum, e o pedido foi suportar os dois — OAuth
--   e o unico caminho que atende os dois com o MESMO codigo.
--
-- ONDE MORA O SEGREDO, E POR QUE NAO NUMA COLUNA
--   O `refresh_token` do Google nao expira sozinho: quem o tem, tem a agenda do
--   diretor ate alguem revogar. Ele vai para o Vault (cifrado em repouso, chave
--   gerenciada pela plataforma) e a tabela guarda so o ID do segredo. Assim um
--   SELECT na tabela — por engano, por bug de policy, por backup vazado — nao
--   devolve credencial nenhuma.
--
--   A leitura do segredo nao passa pelo PostgREST: as funcoes que o alcancam
--   sao `security definer` com EXECUTE so para service_role, ou seja, so as
--   Edge Functions chegam nelas.
--
-- A CHAVE DA AUTOMACAO E GUARDADA COMO HASH
--   O n8n nao recebe credencial do Google: recebe uma chave DESTE sistema. Ela
--   e mostrada uma unica vez, na hora de gerar, e o banco guarda so o sha256.
--   Perdeu, gera outra — e a antiga morre sem tocar na conta Google. Guardar a
--   chave em texto para poder reexibi-la transformaria a tabela num molho de
--   chaves vivas.

-- 1. A conexao com o Google -----------------------------------------------------

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Qual conta Google autorizou. E o que a tela mostra ("Conectado como ...")
  -- e o que identifica a conexao errada antes de alguem depurar por horas.
  google_account_email text not null,

  -- A AGENDA LIDA, e o motivo de ela ser escolhivel.
  --
  -- `primary` e a agenda pessoal do dono da conta: aniversario, medico, viagem
  -- de familia. Mandar isso para um grupo de WhatsApp do escritorio seria um
  -- vazamento criado por padrao. A tela pede que se escolha uma agenda, e o
  -- default so existe para a conexao nascer valida.
  calendar_id text not null default 'primary',
  calendar_label text,

  -- Os escopos concedidos, como o Google os devolveu. Guardados para a tela
  -- saber dizer "esta conexao so le" quando um modulo futuro precisar escrever.
  granted_scopes text not null,

  -- O ID DO SEGREDO NO VAULT, e nao o segredo.
  refresh_token_secret_id uuid not null,

  connected_by_id uuid,
  connected_at timestamptz not null default now(),

  -- Diagnostico da automacao: quando a chave foi usada pela ultima vez com
  -- sucesso, e qual foi o ultimo erro do Google. Sem isso, "o WhatsApp parou de
  -- chegar" nao tem por onde comecar.
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint google_calendar_connections_id_tenant_id_key unique (id, tenant_id),

  -- UMA CONEXAO POR ESCRITORIO. Duas contas conectadas seriam duas agendas
  -- concorrendo pelo mesmo disparo diario, sem nada dizendo qual vale.
  constraint google_calendar_connections_tenant_id_key unique (tenant_id),

  constraint google_calendar_connections_connected_by_fkey
    foreign key (connected_by_id, tenant_id)
    references public.collaborators (id, tenant_id) on delete set null,

  constraint google_calendar_connections_email_not_blank_check
    check (btrim(google_account_email) <> ''),
  constraint google_calendar_connections_calendar_id_not_blank_check
    check (btrim(calendar_id) <> '')
);

create index google_calendar_connections_tenant_id_created_at_idx
  on public.google_calendar_connections (tenant_id, created_at);

create trigger google_calendar_connections_set_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

comment on table public.google_calendar_connections is
  'A conta Google que o escritorio autorizou a ler a agenda. Guarda METADADO: o refresh_token vive no Vault e a coluna refresh_token_secret_id so aponta para ele. Uma conexao por escritorio.';
comment on column public.google_calendar_connections.refresh_token_secret_id is
  'ID do segredo no Vault. O token em si nunca passa por esta tabela, nem pelo PostgREST: quem o le sao funcoes security definer com EXECUTE apenas para service_role.';
comment on column public.google_calendar_connections.calendar_id is
  'Qual agenda e lida. `primary` e a agenda PESSOAL do dono da conta — a tela pede que se escolha a agenda do escritorio, para compromisso de familia nao acabar num grupo de WhatsApp corporativo.';

-- 2. A chave que a automacao usa ------------------------------------------------

create type public.integration_scope as enum ('calendar_agenda');

comment on type public.integration_scope is
  'O que uma chave de integracao alcanca. Enum com um valor so hoje (a agenda do dia); existe para a segunda integracao nao virar uma chave que abre tudo.';

create table public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Nome dado por quem gerou ("n8n - agenda diaria"). Chave sem nome vira chave
  -- que ninguem ousa revogar, porque ninguem lembra o que ela alimenta.
  name text not null,

  scope public.integration_scope not null default 'calendar_agenda',

  -- SO O HASH. A chave em texto existe uma vez, na resposta da funcao que a
  -- gerou, e nunca mais.
  key_hash text not null,

  -- Os primeiros caracteres, para a tela identificar a chave sem poder usa-la.
  key_prefix text not null,

  created_by_id uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,

  -- REVOGAR E CARIMBAR, NAO APAGAR: a linha revogada e o registro de que aquela
  -- chave existiu e deixou de valer, com a data.
  revoked_at timestamptz,
  revoked_by_id uuid,

  updated_at timestamptz not null default now(),

  constraint integration_api_keys_id_tenant_id_key unique (id, tenant_id),
  constraint integration_api_keys_key_hash_key unique (key_hash),

  constraint integration_api_keys_created_by_fkey
    foreign key (created_by_id, tenant_id)
    references public.collaborators (id, tenant_id) on delete set null,
  constraint integration_api_keys_revoked_by_fkey
    foreign key (revoked_by_id, tenant_id)
    references public.collaborators (id, tenant_id) on delete set null,

  constraint integration_api_keys_name_not_blank_check check (btrim(name) <> ''),
  constraint integration_api_keys_name_length_check check (length(name) <= 80),
  constraint integration_api_keys_key_hash_format_check check (key_hash ~ '^[0-9a-f]{64}$'),

  -- Quem revogou e quando andam juntos: uma coluna sem a outra e um registro
  -- que nao explica nada.
  constraint integration_api_keys_revoked_coherent_check
    check ((revoked_at is null) = (revoked_by_id is null))
);

create index integration_api_keys_tenant_id_created_at_idx
  on public.integration_api_keys (tenant_id, created_at);

create trigger integration_api_keys_set_updated_at
  before update on public.integration_api_keys
  for each row execute function public.set_updated_at();

comment on table public.integration_api_keys is
  'Chaves que automacoes externas (n8n) usam para chamar as Edge Functions deste sistema. Guarda o SHA-256, nunca a chave: ela e exibida uma unica vez, na geracao. Revogar carimba revoked_at e mantem a linha.';
comment on column public.integration_api_keys.key_hash is
  'SHA-256 da chave, em hexadecimal. Guardar a chave em texto para poder reexibi-la transformaria a tabela num molho de chaves vivas.';

-- 3. O `state` do OAuth ---------------------------------------------------------
--
--    O callback do Google chega SEM SESSAO: e o navegador seguindo um redirect,
--    sem o JWT do usuario. Sem o `state`, qualquer um poderia disparar o
--    callback com um `code` proprio e ligar a conta Google DELE ao escritorio
--    (CSRF de login). O `state` amarra o retorno a quem comecou o fluxo.
--
--    Guardado como HASH pelo mesmo motivo da chave: quem lesse a tabela nao
--    ganha um state utilizavel.

create table public.google_oauth_states (
  state_hash text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  collaborator_id uuid not null,
  created_at timestamptz not null default now(),

  -- Dez minutos: o tempo de escolher a conta e clicar em Permitir. Janela maior
  -- e state velho esperando ser usado.
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,

  constraint google_oauth_states_collaborator_fkey
    foreign key (collaborator_id, tenant_id)
    references public.collaborators (id, tenant_id) on delete cascade,
  constraint google_oauth_states_hash_format_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint google_oauth_states_expires_after_created_check check (expires_at > created_at)
);

create index google_oauth_states_tenant_id_created_at_idx
  on public.google_oauth_states (tenant_id, created_at);

comment on table public.google_oauth_states is
  'Estados em voo do consentimento OAuth do Google. Amarra o callback (que chega sem sessao) a quem iniciou o fluxo; sem isso um terceiro poderia ligar a conta Google dele ao escritorio. Guarda o hash do state, expira em 10 minutos e e consumido uma unica vez.';

-- 4. Autorizacao para quem chega SEM sessao -------------------------------------
--
--    `can_edit_menu` responde sobre o usuario do JWT, e as Edge Functions falam
--    com o banco como service_role — nao ha JWT ali. Esta funcao e a MESMA regra
--    (Diretor ativo, ou can_edit gravado para o menu) perguntada por id de
--    usuario, para a autorizacao continuar morando no banco e nao ser
--    reescrita em TypeScript dentro de cada funcao.

create or replace function public.collaborator_can_edit_menu(p_user_id uuid, p_menu_key text)
returns table (collaborator_id uuid, tenant_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $BODY$
begin
  if not exists (select 1 from public.menus m where m.key = p_menu_key) then
    raise exception 'collaborator_can_edit_menu: menu_key inexistente (%)', p_menu_key
      using errcode = '22023';
  end if;

  return query
  select c.id, c.tenant_id
  from public.collaborators c
  where c.user_id = p_user_id
    and c.status = 'active'
    and (
      c.role = 'director'
      or exists (
        select 1
        from public.collaborator_permissions p
        where p.collaborator_id = c.id
          and p.tenant_id = c.tenant_id
          and p.menu_key = p_menu_key
          and p.can_edit
      )
    );
end;
$BODY$;

comment on function public.collaborator_can_edit_menu(uuid, text) is
  'Mesma regra de can_edit_menu, perguntada por user_id em vez de pelo JWT: devolve o colaborador e o escritorio quando aquele usuario pode editar naquele menu, e nenhuma linha quando nao pode. Existe para as Edge Functions (que falam como service_role, sem JWT) nao reimplementarem a autorizacao em TypeScript. Um usuario com vinculo em mais de um escritorio devolve uma linha por escritorio - quem chama decide, e hoje ninguem tem dois.';

revoke all on function public.collaborator_can_edit_menu(uuid, text) from public, anon, authenticated;
grant execute on function public.collaborator_can_edit_menu(uuid, text) to service_role;

-- 5. O `state` do consentimento -------------------------------------------------

create or replace function public.google_oauth_state_issue(p_user_id uuid, p_state_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_tenant_id uuid;
begin
  select a.collaborator_id, a.tenant_id into v_collaborator_id, v_tenant_id
  from public.collaborator_can_edit_menu(p_user_id, 'settings') a
  limit 1;

  if v_collaborator_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  /*
    Faxina oportunista: state expirado nao serve para nada e nao ha cron neste
    projeto. Apagar os vencidos DESTE escritorio a cada emissao mantem a tabela
    do tamanho do que esta em voo.
  */
  delete from public.google_oauth_states s
  where s.tenant_id = v_tenant_id
    and s.expires_at < now();

  insert into public.google_oauth_states (state_hash, tenant_id, collaborator_id)
  values (p_state_hash, v_tenant_id, v_collaborator_id);

  return v_tenant_id;
end;
$BODY$;

comment on function public.google_oauth_state_issue(uuid, text) is
  'Abre um consentimento OAuth: confere que o usuario pode editar em `settings`, guarda o hash do state e devolve o escritorio. Levanta 42501 para quem nao pode.';

create or replace function public.google_oauth_state_consume(p_state_hash text)
returns table (tenant_id uuid, collaborator_id uuid)
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  /*
    UM CONSUMO SO, e a garantia e do UPDATE, nao de um SELECT seguido de UPDATE:
    `consumed_at is null` dentro do proprio WHERE faz o segundo callback com o
    mesmo state nao alcancar linha nenhuma, mesmo em corrida.
  */
  return query
  update public.google_oauth_states s
  set consumed_at = now()
  where s.state_hash = p_state_hash
    and s.consumed_at is null
    and s.expires_at > now()
  returning s.tenant_id, s.collaborator_id;
end;
$BODY$;

comment on function public.google_oauth_state_consume(text) is
  'Consome o state do callback do Google: devolve escritorio e colaborador se o state existe, nao venceu e nunca foi usado; nenhuma linha caso contrario. O consumo e o proprio UPDATE, para dois callbacks simultaneos nao passarem os dois.';

revoke all on function public.google_oauth_state_issue(uuid, text) from public, anon, authenticated;
revoke all on function public.google_oauth_state_consume(text) from public, anon, authenticated;
grant execute on function public.google_oauth_state_issue(uuid, text) to service_role;
grant execute on function public.google_oauth_state_consume(text) to service_role;

-- 6. A conexao: gravar, ler e desfazer ------------------------------------------
--
--    As tres tocam o Vault, e por isso nenhuma delas tem EXECUTE para
--    authenticated: o token do Google so e alcancavel por service_role, ou seja,
--    de dentro das Edge Functions.

create or replace function public.google_calendar_connect(
  p_tenant_id uuid,
  p_collaborator_id uuid,
  p_email text,
  p_refresh_token text,
  p_scopes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_existing public.google_calendar_connections%rowtype;
  v_secret_id uuid;
  v_connection_id uuid;
begin
  if btrim(coalesce(p_refresh_token, '')) = '' then
    /*
      O Google SO devolve refresh_token no primeiro consentimento de cada
      aplicativo, a menos que se peca `prompt=consent`. Reconectar sem ele
      gravaria uma conexao que autentica hoje e morre em uma hora, quando o
      access_token vencer — e o erro apareceria dias depois, no WhatsApp que
      nao chegou. Falha alto aqui.
    */
    raise exception 'refresh_token ausente na resposta do Google'
      using errcode = '22023',
            hint = 'A URL de autorizacao precisa levar access_type=offline e prompt=consent.';
  end if;

  select * into v_existing
  from public.google_calendar_connections c
  where c.tenant_id = p_tenant_id;

  if found then
    /* Reconexao: o segredo e o mesmo registro do Vault, com valor novo. Criar
       outro deixaria o anterior vivo e sem dono. */
    perform vault.update_secret(v_existing.refresh_token_secret_id, p_refresh_token);

    update public.google_calendar_connections c
    set google_account_email = p_email,
        granted_scopes = p_scopes,
        connected_by_id = p_collaborator_id,
        connected_at = now(),
        last_error = null,
        last_error_at = null,
        /* A agenda escolhida SO e reiniciada quando a conta muda: reconectar a
           mesma conta para renovar o consentimento nao pode devolver o disparo
           diario para a agenda pessoal sem ninguem perceber. */
        calendar_id = case when c.google_account_email = p_email then c.calendar_id else 'primary' end,
        calendar_label = case when c.google_account_email = p_email then c.calendar_label else null end
    where c.tenant_id = p_tenant_id;

    return v_existing.id;
  end if;

  v_secret_id := vault.create_secret(
    p_refresh_token,
    'google_calendar_refresh_token:' || p_tenant_id::text,
    'refresh_token do Google Agenda, escritorio ' || p_tenant_id::text
  );

  insert into public.google_calendar_connections
    (tenant_id, google_account_email, granted_scopes, refresh_token_secret_id, connected_by_id)
  values (p_tenant_id, p_email, p_scopes, v_secret_id, p_collaborator_id)
  returning id into v_connection_id;

  return v_connection_id;
end;
$BODY$;

comment on function public.google_calendar_connect(uuid, uuid, text, text, text) is
  'Grava (ou renova) a conexao do escritorio com o Google Agenda: o refresh_token vai para o Vault e a tabela guarda so o ponteiro. Recusa token vazio, porque conexao sem refresh_token funciona por uma hora e falha calada depois.';

create or replace function public.google_calendar_refresh_token(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_secret_id uuid;
  v_token text;
begin
  select c.refresh_token_secret_id into v_secret_id
  from public.google_calendar_connections c
  where c.tenant_id = p_tenant_id;

  if v_secret_id is null then
    return null;
  end if;

  select s.decrypted_secret into v_token
  from vault.decrypted_secrets s
  where s.id = v_secret_id;

  return v_token;
end;
$BODY$;

comment on function public.google_calendar_refresh_token(uuid) is
  'Devolve o refresh_token do escritorio, decifrado do Vault, ou nulo quando nao ha conexao. Unica porta para o segredo, e ela nao tem EXECUTE para authenticated: so as Edge Functions chegam aqui.';

create or replace function public.google_calendar_disconnect(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_secret_id uuid;
begin
  delete from public.google_calendar_connections c
  where c.tenant_id = p_tenant_id
  returning c.refresh_token_secret_id into v_secret_id;

  if v_secret_id is null then
    return false;
  end if;

  /* O SEGREDO VAI JUNTO. Apagar so a linha deixaria o refresh_token vivo no
     Vault, sem dono e sem nada que o mencione — a pior forma de credencial
     esquecida. Quem revoga do lado do Google e a Edge Function, antes de
     chamar esta funcao. */
  delete from vault.secrets s where s.id = v_secret_id;

  return true;
end;
$BODY$;

comment on function public.google_calendar_disconnect(uuid) is
  'Desfaz a conexao: apaga a linha E o segredo do Vault. A revogacao do lado do Google acontece na Edge Function, antes desta chamada.';

create or replace function public.google_calendar_record_result(
  p_tenant_id uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  update public.google_calendar_connections c
  set last_success_at = case when p_error is null then now() else c.last_success_at end,
      last_error = p_error,
      last_error_at = case when p_error is null then null else now() end
  where c.tenant_id = p_tenant_id;
end;
$BODY$;

comment on function public.google_calendar_record_result(uuid, text) is
  'Carimba o resultado da ultima leitura da agenda. Sem isto, "o WhatsApp parou de chegar" nao tem por onde comecar: a tela mostra quando funcionou pela ultima vez e qual foi o erro do Google.';

revoke all on function public.google_calendar_connect(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.google_calendar_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.google_calendar_disconnect(uuid) from public, anon, authenticated;
revoke all on function public.google_calendar_record_result(uuid, text) from public, anon, authenticated;

grant execute on function public.google_calendar_connect(uuid, uuid, text, text, text) to service_role;
grant execute on function public.google_calendar_refresh_token(uuid) to service_role;
grant execute on function public.google_calendar_disconnect(uuid) to service_role;
grant execute on function public.google_calendar_record_result(uuid, text) to service_role;

-- 7. As chaves da automacao -----------------------------------------------------

create or replace function public.create_integration_api_key(
  p_name text,
  p_scope public.integration_scope default 'calendar_agenda'
)
returns table (id uuid, api_key text)
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_tenant_id uuid;
  v_key text;
  v_id uuid;
begin
  v_collaborator_id := public.auth_collaborator_id();
  v_tenant_id := public.auth_tenant_id();

  if v_collaborator_id is null or not public.can_edit_menu('settings') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'nome obrigatorio' using errcode = '22023';
  end if;

  /*
    32 bytes de aleatorio do CSPRNG, em hexadecimal. O prefixo legivel existe
    para a chave ser reconhecida num campo de configuracao do n8n e num log —
    e para nao ser confundida com a anon key, que e um JWT.
  */
  v_key := 'fc_int_' || encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.integration_api_keys
    (tenant_id, name, scope, key_hash, key_prefix, created_by_id)
  values (
    v_tenant_id,
    btrim(p_name),
    p_scope,
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    left(v_key, 14),
    v_collaborator_id
  )
  returning integration_api_keys.id into v_id;

  /*
    A UNICA VEZ que a chave existe em texto. Quem chamou mostra na tela; o banco
    ficou com o hash. Nao ha caminho de leitura depois disto — de proposito.
  */
  return query select v_id, v_key;
end;
$BODY$;

comment on function public.create_integration_api_key(text, public.integration_scope) is
  'Gera uma chave de integracao para o escritorio de quem chama e devolve o valor em texto UMA unica vez; o banco fica so com o SHA-256. Exige can_edit em `settings`.';

create or replace function public.revoke_integration_api_key(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_tenant_id uuid;
  v_rows int;
begin
  v_collaborator_id := public.auth_collaborator_id();
  v_tenant_id := public.auth_tenant_id();

  if v_collaborator_id is null or not public.can_edit_menu('settings') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.integration_api_keys k
  set revoked_at = now(),
      revoked_by_id = v_collaborator_id
  where k.id = p_id
    and k.tenant_id = v_tenant_id
    and k.revoked_at is null;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$BODY$;

comment on function public.revoke_integration_api_key(uuid) is
  'Carimba a chave como revogada. A linha fica: e o registro de que aquela chave existiu e deixou de valer. Exige can_edit em `settings`, e so alcanca chave do proprio escritorio.';

create or replace function public.resolve_integration_api_key(
  p_key text,
  p_scope public.integration_scope
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
begin
  /*
    A COMPARACAO E POR HASH, e o hash da chave apresentada e calculado aqui —
    a chave em texto nunca e guardada, entao nao ha o que comparar diretamente.
    Chave revogada nao resolve: `revoked_at is null` faz parte do WHERE, e nao
    de uma checagem depois.
  */
  update public.integration_api_keys k
  set last_used_at = now()
  where k.key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
    and k.scope = p_scope
    and k.revoked_at is null
  returning k.tenant_id into v_tenant_id;

  return v_tenant_id;
end;
$BODY$;

comment on function public.resolve_integration_api_key(text, public.integration_scope) is
  'Traduz a chave apresentada por uma automacao no escritorio dono dela, ou nulo. Compara por SHA-256, ignora chave revogada e carimba o ultimo uso. Sem EXECUTE para anon ou authenticated: quem a chama e a Edge Function.';

revoke all on function public.create_integration_api_key(text, public.integration_scope) from public, anon;
revoke all on function public.revoke_integration_api_key(uuid) from public, anon;
revoke all on function public.resolve_integration_api_key(text, public.integration_scope) from public, anon, authenticated;

grant execute on function public.create_integration_api_key(text, public.integration_scope) to authenticated;
grant execute on function public.revoke_integration_api_key(uuid) to authenticated;
grant execute on function public.resolve_integration_api_key(text, public.integration_scope) to service_role;

-- 8. RLS ------------------------------------------------------------------------
--
--    LEITURA MAIS ESTREITA QUE A DO RESTO DO SISTEMA, e desta vez com motivo.
--    Os outros modulos liberam leitura para qualquer colaborador ativo porque o
--    dado e o trabalho do escritorio. Aqui a linha diz QUAL CONTA GOOGLE do
--    diretor esta ligada e QUAIS chaves de automacao existem — informacao de
--    infraestrutura, util so para quem configura. Entao a leitura pede
--    can_view_menu('settings').
--
--    ESCRITA: nenhuma policy de INSERT ou DELETE, em nenhuma das tres tabelas.
--    Conectar, desconectar e gerar chave passam pelas funcoes das secoes 5 a 7,
--    que conferem a permissao por dentro e sao as unicas que tocam no Vault.
--    O unico UPDATE que a tela faz e a escolha da agenda, e ele e limitado por
--    GRANT DE COLUNA — nem a policy precisa saber disso.

alter table public.google_calendar_connections enable row level security;
alter table public.integration_api_keys enable row level security;
alter table public.google_oauth_states enable row level security;

create policy google_calendar_connections_select_settings_viewer
  on public.google_calendar_connections for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_view_menu('settings'))
  );

comment on policy google_calendar_connections_select_settings_viewer on public.google_calendar_connections is
  'Quem enxerga Configuracoes ve o estado da conexao. Nao e leitura larga como no resto do sistema: a linha diz qual conta Google do diretor esta ligada, e isso interessa a quem configura, nao ao escritorio inteiro. O refresh_token nao esta aqui — esta no Vault.';

create policy google_calendar_connections_update_calendar_choice
  on public.google_calendar_connections for update
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

comment on policy google_calendar_connections_update_calendar_choice on public.google_calendar_connections is
  'Existe para UMA coisa: escolher qual agenda e lida. O recorte nao esta na policy (RLS nao filtra coluna) e sim no GRANT UPDATE, que alcanca apenas calendar_id e calendar_label. Sem esse grant de coluna, esta policy permitiria trocar o ponteiro do segredo pela tela.';

create policy integration_api_keys_select_settings_viewer
  on public.integration_api_keys for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_view_menu('settings'))
  );

comment on policy integration_api_keys_select_settings_viewer on public.integration_api_keys is
  'A tela lista as chaves para poder revogar. O que ela le e nome, prefixo, datas e o hash — a chave em si nao esta na tabela.';

comment on table public.integration_api_keys is
  'Chaves que automacoes externas (n8n) usam para chamar as Edge Functions deste sistema. Guarda o SHA-256, nunca a chave: ela e exibida uma unica vez, na geracao. Revogar carimba revoked_at e mantem a linha. Sem policy de escrita: gerar e revogar sao funcoes security definer que conferem can_edit_menu(''settings'') por dentro.';

-- `google_oauth_states` fica SEM POLICY NENHUMA e sem grant, de proposito: ela
-- so e tocada pelas duas funcoes do OAuth, como service_role. Nada na tela
-- precisa dela, e um state legivel e um state sequestravel.

grant select on table public.google_calendar_connections to authenticated;
grant update (calendar_id, calendar_label) on table public.google_calendar_connections to authenticated;
grant select on table public.integration_api_keys to authenticated;
