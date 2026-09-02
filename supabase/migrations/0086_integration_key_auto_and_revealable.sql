-- A chave da automacao passa a nascer sozinha, e a poder ser lida de novo.
--
-- O QUE MUDA, E POR QUE
--   Na 0085 a chave era guardada so como SHA-256 e aparecia uma unica vez, na
--   geracao. Isso e o padrao correto para chave de API publica — e aqui estava
--   custando caro pelo motivo errado: cada escritorio novo dependia de alguem
--   lembrar de clicar em "Gerar chave" e de copiar o valor ANTES de fechar o
--   dialogo, e quem perdesse precisaria gerar outra, quebrando a automacao que
--   ja estivesse configurada com a anterior.
--
--   A decisao (usuario, 01/09/2026): a chave nasce junto com a conexao do
--   Google e pode ser revelada depois por quem edita Configuracoes.
--
-- POR QUE ISSO NAO AFROUXA O QUE IMPORTA
--   O Vault DESTE MESMO ESCRITORIO ja guarda o refresh_token do Google, que e
--   estritamente mais poderoso: ele da a agenda inteira, com qualquer recorte,
--   enquanto a chave da so o que a Edge Function devolve. Guardar a chave ao
--   lado dele nao acrescenta classe de segredo nenhuma ao sistema.
--
--   E quem revela e exatamente quem ja podia desconectar o Google e revogar a
--   chave: `can_edit_menu('settings')`. Ninguem ganha poder novo.
--
-- O HASH CONTINUA SENDO O QUE AUTENTICA. `resolve_integration_api_key` nao
-- muda: ela compara SHA-256. O valor no Vault existe para ser MOSTRADO, nunca
-- para ser comparado — se um dia o segredo sumir, a chave continua funcionando
-- e apenas deixa de poder ser reexibida.

alter table public.integration_api_keys
  add column key_secret_id uuid;

comment on column public.integration_api_keys.key_secret_id is
  'ID no Vault do valor da chave, guardado para poder reexibi-la (0086). NULO em chave criada antes da 0086 e em chave revogada — nos dois casos a tela diz que o valor nao pode mais ser mostrado. Quem autentica continua sendo key_hash.';

-- 1. Emitir chave, sem perguntar quem esta chamando -----------------------------
--
--    Extraida de create_integration_api_key para ter DOIS chamadores com regras
--    de autorizacao diferentes: a funcao da tela (que exige can_edit) e a
--    conexao do Google (que roda como service_role, dentro do callback do
--    OAuth, quando nao ha usuario logado do lado do banco).
--
--    Ela propria nao autoriza nada — quem chama e que autoriza. Por isso nao
--    tem EXECUTE para ninguem alem de service_role.

create or replace function public.issue_integration_api_key(
  p_tenant_id uuid,
  p_collaborator_id uuid,
  p_name text,
  p_scope public.integration_scope default 'calendar_agenda'
)
returns table (id uuid, api_key text)
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_id uuid := gen_random_uuid();
  v_key text;
  v_secret_id uuid;
begin
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'nome obrigatorio' using errcode = '22023';
  end if;

  /* 32 bytes do CSPRNG. O prefixo legivel existe para a chave ser reconhecida
     num campo de configuracao do n8n e num log — e para nao ser confundida com
     a anon key, que e um JWT. */
  v_key := 'fc_int_' || encode(extensions.gen_random_bytes(32), 'hex');

  v_secret_id := vault.create_secret(
    v_key,
    'integration_api_key:' || v_id::text,
    'chave de integracao ' || btrim(p_name) || ', escritorio ' || p_tenant_id::text
  );

  insert into public.integration_api_keys
    (id, tenant_id, name, scope, key_hash, key_prefix, key_secret_id, created_by_id)
  values (
    v_id,
    p_tenant_id,
    btrim(p_name),
    p_scope,
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    left(v_key, 14),
    v_secret_id,
    p_collaborator_id
  );

  return query select v_id, v_key;
end;
$BODY$;

comment on function public.issue_integration_api_key(uuid, uuid, text, public.integration_scope) is
  'Emite uma chave de integracao para o escritorio indicado e devolve o valor em texto. NAO autoriza nada: quem chama e que autoriza. Existe porque a chave tem dois nascedouros — a tela (create_integration_api_key, que exige can_edit em settings) e a conexao do Google (que roda no callback do OAuth, sem usuario logado do lado do banco).';

revoke all on function public.issue_integration_api_key(uuid, uuid, text, public.integration_scope) from public, anon, authenticated;
grant execute on function public.issue_integration_api_key(uuid, uuid, text, public.integration_scope) to service_role;

-- 2. A funcao da tela passa a delegar -------------------------------------------

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
begin
  v_collaborator_id := public.auth_collaborator_id();
  v_tenant_id := public.auth_tenant_id();

  if v_collaborator_id is null or not public.can_edit_menu('settings') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select k.id, k.api_key
  from public.issue_integration_api_key(v_tenant_id, v_collaborator_id, p_name, p_scope) k;
end;
$BODY$;

comment on function public.create_integration_api_key(text, public.integration_scope) is
  'Gera uma chave de integracao para o escritorio de quem chama e devolve o valor em texto. Exige can_edit em `settings`. Desde a 0086 a emissao em si e de issue_integration_api_key, compartilhada com a conexao do Google.';

-- 3. Revelar ---------------------------------------------------------------------

create or replace function public.reveal_integration_api_key(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
  v_secret_id uuid;
  v_key text;
begin
  v_tenant_id := public.auth_tenant_id();

  if public.auth_collaborator_id() is null or not public.can_edit_menu('settings') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  /* O RECORTE POR ESCRITORIO ESTA NO WHERE, e nao numa checagem depois: pedir
     o id de uma chave de outro escritorio devolve nada, e nao o valor dela. */
  select k.key_secret_id into v_secret_id
  from public.integration_api_keys k
  where k.id = p_id
    and k.tenant_id = v_tenant_id
    and k.revoked_at is null;

  if v_secret_id is null then
    return null;
  end if;

  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.id = v_secret_id;

  return v_key;
end;
$BODY$;

comment on function public.reveal_integration_api_key(uuid) is
  'Devolve o valor de uma chave de integracao do proprio escritorio, para quem edita Configuracoes. Nulo quando a chave nao existe, e de outro escritorio, foi revogada, ou nasceu antes da 0086 (quando so o hash era guardado). Quem AUTENTICA continua sendo o hash: este valor existe para ser mostrado.';

revoke all on function public.reveal_integration_api_key(uuid) from public, anon;
grant execute on function public.reveal_integration_api_key(uuid) to authenticated;

-- 4. Revogar apaga o valor guardado ---------------------------------------------
--
--    Chave revogada nao precisa mais ser lida por ninguem, e um segredo que nao
--    serve para nada e superficie de graca. A LINHA fica, com o carimbo — some
--    so o valor.

create or replace function public.revoke_integration_api_key(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_tenant_id uuid;
  v_secret_id uuid;
  v_rows int;
begin
  v_collaborator_id := public.auth_collaborator_id();
  v_tenant_id := public.auth_tenant_id();

  if v_collaborator_id is null or not public.can_edit_menu('settings') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  /* O ponteiro e lido ANTES do UPDATE: `returning` devolve o valor NOVO, que
     aqui e justamente o nulo que estamos gravando. */
  select k.key_secret_id into v_secret_id
  from public.integration_api_keys k
  where k.id = p_id
    and k.tenant_id = v_tenant_id
    and k.revoked_at is null;

  update public.integration_api_keys k
  set revoked_at = now(),
      revoked_by_id = v_collaborator_id,
      key_secret_id = null
  where k.id = p_id
    and k.tenant_id = v_tenant_id
    and k.revoked_at is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  if v_secret_id is not null then
    delete from vault.secrets s where s.id = v_secret_id;
  end if;

  return true;
end;
$BODY$;

comment on function public.revoke_integration_api_key(uuid) is
  'Carimba a chave como revogada e APAGA o valor guardado no Vault (0086) - chave revogada nao precisa mais ser lida, e segredo que nao serve para nada e superficie de graca. A linha fica, com quem revogou e quando. Exige can_edit em `settings`, e so alcanca chave do proprio escritorio.';

-- 5. A conexao do Google ja traz a chave ----------------------------------------
--
--    ANTES: o escritorio conectava a conta e a automacao so funcionava depois
--    de alguem lembrar de clicar em "Gerar chave". Um passo manual por
--    escritorio, e um passo que so quem conhece o n8n sabe que existe.
--
--    A chave nasce SO SE nao houver nenhuma ativa daquele escopo: reconectar
--    para renovar o consentimento nao pode emitir chave nova, senao cada
--    reconexao deixaria uma chave viva a mais no escritorio.

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
      access_token vencer - e o erro apareceria dias depois, no WhatsApp que
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

    v_connection_id := v_existing.id;
  else
    v_secret_id := vault.create_secret(
      p_refresh_token,
      'google_calendar_refresh_token:' || p_tenant_id::text,
      'refresh_token do Google Agenda, escritorio ' || p_tenant_id::text
    );

    insert into public.google_calendar_connections
      (tenant_id, google_account_email, granted_scopes, refresh_token_secret_id, connected_by_id)
    values (p_tenant_id, p_email, p_scopes, v_secret_id, p_collaborator_id)
    returning id into v_connection_id;
  end if;

  if not exists (
    select 1
    from public.integration_api_keys k
    where k.tenant_id = p_tenant_id
      and k.scope = 'calendar_agenda'
      and k.revoked_at is null
  ) then
    perform public.issue_integration_api_key(
      p_tenant_id, p_collaborator_id, 'Automacao - agenda do dia', 'calendar_agenda');
  end if;

  return v_connection_id;
end;
$BODY$;

comment on function public.google_calendar_connect(uuid, uuid, text, text, text) is
  'Grava (ou renova) a conexao do escritorio com o Google Agenda: o refresh_token vai para o Vault e a tabela guarda so o ponteiro. Recusa token vazio, porque conexao sem refresh_token funciona por uma hora e falha calada depois. Desde a 0086 tambem emite a chave da automacao quando o escritorio ainda nao tem nenhuma ativa - era o unico passo manual que sobrava por escritorio.';
