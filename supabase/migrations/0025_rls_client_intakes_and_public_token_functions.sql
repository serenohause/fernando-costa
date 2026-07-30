-- Modulo 3 (Pipeline) - RLS de client_intakes e as duas funcoes que resolvem o
-- token do formulario publico.
--
-- DUAS SUPERFICIES, UMA TABELA
--
--   Lado autenticado: igual a todo o resto do modulo. Colaborador active do
--   escritorio le; quem tem can_edit no menu 'pipeline' escreve. E por aqui que
--   o escritorio gera o link, copia o link e invalida um link a mao.
--
--   Lado publico: NAO passa por esta tabela. anon nao recebe GRANT nenhum e nao
--   recebe EXECUTE nas funcoes abaixo. Quem chama e uma edge function com
--   service_role (fora do escopo desta migration), e o que ela pode fazer esta
--   limitado ao que as duas funcoes devolvem e aceitam.
--
-- POR QUE A RESOLUCAO DO TOKEN E FUNCAO DE BANCO, E NAO CODIGO DA EDGE FUNCTION
--
--   1. Atomicidade. "O token vale, nao expirou e ainda nao foi enviado" e a
--      gravacao que muda esse estado precisam acontecer sem ninguem no meio. Na
--      edge function isso seria ler pelo PostgREST e escrever depois: duas
--      viagens, e duas abas do cliente enviando junto passam as duas pela
--      leitura antes de qualquer escrita. Aqui e um SELECT ... FOR UPDATE
--      seguido do UPDATE na mesma transacao, e o segundo envio encontra o
--      status ja mudado. O caso 5 de supabase/tests/client-intake.sql e
--      exatamente esse.
--   2. O recorte da resposta vira contrato de tipo. A regra "a resposta nao
--      inclui id interno nem tenant_id" fica na assinatura da funcao, checavel
--      no catalogo, em vez de depender de quem escrever o mapeamento do JSON na
--      edge function. O vazamento do original nasceu de um `list()` que
--      devolvia a linha inteira; a defesa e nao ter, em lugar nenhum do
--      caminho publico, um objeto que contenha esses campos.
--   3. Mass assignment. submit_client_intake le do payload apenas as chaves do
--      briefing, uma a uma. Nao existe caminho em que 'status', 'token',
--      'tenant_id' ou 'client_id' vindos do corpo da requisicao cheguem a
--      tabela, mesmo que a edge function repasse o corpo inteiro.
--
--   O que fica na edge function, e por isso ela continua existindo: o limite de
--   requisicoes, o registro de abuso e a resposta HTTP. Nada disso o banco faz
--   bem, e e por isso que anon NAO ganha EXECUTE nestas funcoes - com EXECUTE
--   direto, qualquer navegador varreria tokens contra o endpoint /rest/v1/rpc na
--   velocidade da rede, sem nada no meio para barrar.

-- 1. Lado autenticado: RLS + GRANT ---------------------------------------------

alter table public.client_intakes enable row level security;

grant select, insert, update, delete on table public.client_intakes to authenticated;

create policy client_intakes_select_active_collaborator
  on public.client_intakes
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy client_intakes_select_active_collaborator on public.client_intakes is
  'Leitura pelo mesmo recorte das outras tabelas do modulo: colaborador active do escritorio. Vale registrar que esta e a tabela com mais dado pessoal por linha do sistema (nome, WhatsApp, e-mail, CPF/CNPJ, nascimento e dois enderecos), e que a leitura larga e a mesma decisao ja registrada para clients em docs/ARCHITECTURE.md - se um dia ela for apertada, e aqui e em clients ao mesmo tempo.';

create policy client_intakes_insert_pipeline_editor
  on public.client_intakes
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy client_intakes_insert_pipeline_editor on public.client_intakes is
  'Gerar link e escrita de pipeline: no original, o link nasce quando a negociacao e marcada como Ganha (Negociacoes.jsx:280). Quem cria a linha NAO escolhe o token - o default da coluna gera. WITH CHECK amarra tenant_id ao claim do JWT, senao um editor criaria briefing dentro do escritorio alheio e receberia de volta um token valido para uma linha que ele nao pode ler.';

create policy client_intakes_update_pipeline_editor
  on public.client_intakes
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

comment on policy client_intakes_update_pipeline_editor on public.client_intakes is
  'Permite ao escritorio invalidar um link (status = expired) ou corrigir o briefing recebido. NAO e por aqui que o envio publico grava: aquele caminho e submit_client_intake, com service_role, que nao passa por policy alguma.';

create policy client_intakes_delete_pipeline_editor
  on public.client_intakes
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('pipeline'))
  );

-- 2. Abertura do formulario publico --------------------------------------------

create or replace function public.open_client_intake(p_token uuid)
returns table (client_name text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.client_intake_status;
  v_expires timestamptz;
begin
  -- FOR UPDATE porque a linha pode ser marcada como expirada logo abaixo, e
  -- porque a abertura pode correr junto com um envio.
  select ci.id, ci.status, ci.expires_at
    into v_id, v_status, v_expires
    from public.client_intakes ci
   where ci.token = p_token
     for update;

  -- Token inexistente: zero linhas, sem erro. Erro distinto por caso e o que
  -- transforma o endpoint em oraculo de "este token existe?".
  if v_id is null then
    return;
  end if;

  -- Expiracao e decidida aqui, no servidor. No original quem compara a data e o
  -- navegador (FormularioCliente.jsx:70), e navegador nao e autoridade: relogio
  -- atrasado, ou requisicao montada a mao, reabrem um link vencido.
  if v_status = 'active' and v_expires <= now() then
    update public.client_intakes
       set status = 'expired',
           last_access_at = now(),
           last_validation_status = 'expired'
     where id = v_id;
    return;
  end if;

  update public.client_intakes
     set last_access_at = now(),
         last_validation_status = case v_status
                                    when 'submitted' then 'already_submitted'::public.client_intake_validation_status
                                    when 'expired'   then 'expired'::public.client_intake_validation_status
                                    else 'ok'::public.client_intake_validation_status
                                  end
   where id = v_id;

  if v_status <> 'active' then
    return;
  end if;

  return query
    select c.name, ci.expires_at
      from public.client_intakes ci
      join public.clients c
        on c.id = ci.client_id
       and c.tenant_id = ci.tenant_id
     where ci.id = v_id;
end;
$$;

comment on function public.open_client_intake(uuid) is
  'Resolve o token do formulario publico e devolve APENAS o nome do cliente (que a tela publica exibe no titulo, como no original) e o fim da validade. Zero linhas significa recusa, e a recusa e a MESMA para token inexistente, expirado e ja enviado - quem chama nao consegue distinguir os tres, entao nao consegue usar o endpoint para descobrir se um token existe. O que NAO sai daqui, por desenho da assinatura: id, tenant_id, client_id, negotiation_id, status e os campos do briefing ja preenchidos. Marca a linha como expirada quando o prazo venceu, e registra a tentativa em last_access_at/last_validation_status; nada disso muda a resposta. LIMITE CONHECIDO: token inexistente nao escreve nada e token existente escreve, o que deixa uma diferenca de tempo entre os dois casos - fechar isso pediria escrita para token desconhecido, que seria uma tabela que qualquer um faz crescer. O limite de requisicoes que torna essa diferenca inexplorevel e da edge function.';

-- 3. Envio do formulario publico -----------------------------------------------

create or replace function public.submit_client_intake(p_token uuid, p_payload jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.client_intake_status;
  v_expires timestamptz;
  v_name text;
  v_phone text;
  v_email text;
begin
  select ci.id, ci.status, ci.expires_at
    into v_id, v_status, v_expires
    from public.client_intakes ci
   where ci.token = p_token
     for update;

  if v_id is null then
    return false;
  end if;

  if v_status <> 'active' then
    update public.client_intakes
       set last_access_at = now(),
           last_validation_status = case v_status
                                      when 'submitted' then 'already_submitted'::public.client_intake_validation_status
                                      else 'expired'::public.client_intake_validation_status
                                    end
     where id = v_id;
    return false;
  end if;

  -- Revalidacao da validade DENTRO da transacao do envio. Entre abrir o
  -- formulario e enviar podem passar horas: conferir so na abertura deixa o
  -- envio passar com o link ja vencido.
  if v_expires <= now() then
    update public.client_intakes
       set status = 'expired',
           last_access_at = now(),
           last_validation_status = 'expired_on_submit',
           last_link_error = 'Tentativa de envio apos a expiracao do link'
     where id = v_id;
    return false;
  end if;

  v_name  := nullif(btrim(p_payload ->> 'full_name'), '');
  v_phone := nullif(btrim(p_payload ->> 'phone'), '');
  v_email := nullif(btrim(p_payload ->> 'email'), '');

  -- Minimo do original (FormularioCliente.jsx:195): nome, e ao menos um canal de
  -- contato. Levanta erro em vez de devolver false de proposito: false e a
  -- recusa do TOKEN, e precisa continuar significando so isso. Dado incompleto e
  -- problema do formulario, e a tela precisa poder dizer qual campo falta.
  if v_name is null or (v_phone is null and v_email is null) then
    raise exception 'submit_client_intake: informe o nome e ao menos um contato'
      using errcode = '22023',
            hint = 'Campos minimos: full_name, e phone ou email.';
  end if;

  -- Cada chave e lida uma a uma, de proposito. Aplicar o payload inteiro
  -- (jsonb_populate_record ou equivalente) deixaria 'status', 'token',
  -- 'tenant_id' e 'client_id' entrarem pelo corpo da requisicao de quem nao tem
  -- sessao nenhuma.
  update public.client_intakes ci
     set full_name          = v_name,
         phone              = v_phone,
         email              = v_email::extensions.citext,
         city               = nullif(btrim(p_payload ->> 'city'), ''),
         state              = nullif(btrim(p_payload ->> 'state'), ''),
         country            = nullif(btrim(p_payload ->> 'country'), ''),
         client_type        = nullif(btrim(p_payload ->> 'client_type'), '')::public.client_type,
         tax_id             = nullif(btrim(p_payload ->> 'tax_id'), ''),
         birth_date         = nullif(btrim(p_payload ->> 'birth_date'), '')::date,
         address_zipcode    = nullif(btrim(p_payload ->> 'address_zipcode'), ''),
         address_street     = nullif(btrim(p_payload ->> 'address_street'), ''),
         address_number     = nullif(btrim(p_payload ->> 'address_number'), ''),
         address_district   = nullif(btrim(p_payload ->> 'address_district'), ''),
         address_complement = nullif(btrim(p_payload ->> 'address_complement'), ''),
         address_city       = nullif(btrim(p_payload ->> 'address_city'), ''),
         address_state      = nullif(btrim(p_payload ->> 'address_state'), ''),
         site_zipcode       = nullif(btrim(p_payload ->> 'site_zipcode'), ''),
         site_street        = nullif(btrim(p_payload ->> 'site_street'), ''),
         site_number        = nullif(btrim(p_payload ->> 'site_number'), ''),
         site_district      = nullif(btrim(p_payload ->> 'site_district'), ''),
         site_complement    = nullif(btrim(p_payload ->> 'site_complement'), ''),
         site_city          = nullif(btrim(p_payload ->> 'site_city'), ''),
         site_state         = nullif(btrim(p_payload ->> 'site_state'), ''),
         status             = 'submitted',
         submitted_at       = now(),
         last_access_at     = now(),
         last_validation_status = 'submitted',
         last_link_error    = null
   where ci.id = v_id;

  return true;
end;
$$;

comment on function public.submit_client_intake(uuid, jsonb) is
  'Grava o briefing enviado pelo cliente final e encerra o link. Devolve true quando aceitou e false quando recusou; a recusa e a mesma para token inexistente, expirado e ja enviado. Revalida validade e status DENTRO da transacao, com a linha travada por FOR UPDATE: dois envios simultaneos com o mesmo token nao passam os dois, e o envio de um link que ja tinha aberto antes de vencer e recusado. Le do payload somente as chaves do briefing, uma a uma - status, token, tenant_id e client_id nao tem caminho de entrada pelo corpo da requisicao. Dado incompleto levanta 22023, e nao false, para nao se confundir com recusa de token.
NAO PORTADO, E PRECISA DE DECISAO DO USUARIO ANTES DA UI: o original, no mesmo passo, sobrescreve o cadastro do CRM com o que o cliente digitou (FormularioCliente.jsx:148, Client.update). Aqui o briefing fica guardado em client_intakes e NADA e escrito em clients. Deixar um envio sem sessao sobrescrever nome, documento e enderecos de um cadastro que a equipe curou e escrita anonima em dado de negocio, e a decisao de aplicar (tudo, alguns campos, ou mediante conferencia na tela) e do usuario, nao do banco.';

-- 4. Quem pode chamar -----------------------------------------------------------
--
-- service_role e mais ninguem. Nem anon (seria a varredura de tokens direta
-- contra /rest/v1/rpc, sem limite de requisicoes no meio), nem authenticated (o
-- colaborador logado alcanca a tabela pela RLS; nao tem por que passar pela
-- porta publica).

revoke all on function public.open_client_intake(uuid) from public, anon, authenticated;
revoke all on function public.submit_client_intake(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.open_client_intake(uuid) to service_role;
grant execute on function public.submit_client_intake(uuid, jsonb) to service_role;
