-- Pessoas do cliente (conjuge, segundo titular, socio) e quem preencheu o briefing.
--
-- O RELATO
--   "Quando o cliente vai preencher o formulario, as vezes quem preenche e o
--   conjuge. Ai vem os dados da esposa e, no briefing, esta mudando o nome do
--   cliente e todas as informacoes pessoais. Eles precisam manter os dados do
--   conjuge para consultar no futuro."
--
-- POR QUE UMA TABELA, E NAO COLUNAS `conjuge_*` EM `clients`
--   O escritorio ja tem caso de segundo nome que nao e esposa ("Fernando e
--   Lucas"), e tem cliente PJ com socio. Colunas fixas resolveriam so o casal.
--
-- POR QUE NAO UM SEGUNDO CADASTRO DE CLIENTE
--   `clients` tem CPF unico por escritorio, telefone deduplicado (0076) e o
--   faturamento e por cliente: o conjuge viraria um cliente sem contrato, com o
--   mesmo telefone e o mesmo endereco, e o historico do titular se partiria em
--   dois.
--
-- O QUE MUDA
--   1. `client_people`: as pessoas ligadas ao cadastro. Escrita por quem edita o
--      CRM, lida por qualquer colaborador ativo, como `clients`.
--   2. `client_intakes.filled_by_relationship` / `filled_by_name`: quem preencheu
--      o formulario. Com isso a conferencia para de propor trocar o titular
--      quando quem respondeu foi o conjuge.
--   3. `submit_client_intake` passa a gravar os dois campos novos.
--
-- O QUE NAO MUDA
--   Nenhum cadastro existente e tocado. Briefing antigo fica sem a resposta, e a
--   tela trata isso pelo nome que veio diferente do cadastro.

create table public.client_people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null,

  name text not null,
  /* Texto com check, e nao enum: a lista deve crescer sem migration de tipo, e
     nenhuma regra do sistema depende do valor - ele e rotulo na ficha. */
  relationship text not null default 'other',
  tax_id text,
  tax_id_digits text generated always as (nullif(regexp_replace(coalesce(tax_id, ''), '[^0-9]', '', 'g'), '')) stored,
  birth_date date,
  email text,
  phone text,
  notes text,
  /* Assina o contrato junto com o titular. Hoje so informativo: o contrato
     continua com um titular (decisao do usuario). */
  is_contract_signer boolean not null default false,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_people_name_not_blank_check check (btrim(name) <> ''),
  constraint client_people_name_length_check check (length(name) <= 200),
  constraint client_people_relationship_check check (
    relationship in ('spouse', 'co_owner', 'partner', 'representative', 'child', 'other')
  ),
  constraint client_people_tax_id_length_check check (tax_id is null or length(tax_id) <= 30),
  constraint client_people_email_format_check check (
    email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint client_people_phone_length_check check (phone is null or length(phone) <= 50),
  constraint client_people_notes_length_check check (notes is null or length(notes) <= 2000),
  constraint client_people_id_tenant_id_key unique (id, tenant_id),
  constraint client_people_client_fkey
    foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete cascade
);

/* Duas linhas com o mesmo nome no mesmo cliente seriam o mesmo conjuge salvo
   duas vezes - e salvar do briefing e um botao que da para clicar de novo. */
create unique index client_people_client_id_name_key
  on public.client_people (client_id, lower(btrim(name)));

create index client_people_tenant_id_client_id_idx on public.client_people (tenant_id, client_id);
create index client_people_tenant_id_name_idx on public.client_people (tenant_id, lower(name));
create index client_people_tenant_id_tax_id_digits_idx
  on public.client_people (tenant_id, tax_id_digits) where tax_id_digits is not null;

create trigger client_people_set_updated_at
  before update on public.client_people
  for each row execute function public.set_updated_at();

comment on table public.client_people is
  'Pessoas ligadas ao cadastro do cliente: conjuge, segundo titular, socio, representante (0102). Existe porque o formulario publico as vezes e preenchido pelo conjuge, e esses dados precisam ser guardados sem sobrescrever o titular. A busca do CRM acha o cliente pelo nome ou CPF destas pessoas.';

alter table public.client_people enable row level security;

create policy client_people_select_active_collaborator
  on public.client_people for select
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.is_active_collaborator()));

create policy client_people_insert_crm_editor
  on public.client_people for insert
  to authenticated
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('crm')));

create policy client_people_update_crm_editor
  on public.client_people for update
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('crm')))
  with check (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('crm')));

create policy client_people_delete_crm_editor
  on public.client_people for delete
  to authenticated
  using (tenant_id = (select public.auth_tenant_id()) and (select public.can_edit_menu('crm')));

grant select, insert, update, delete on table public.client_people to authenticated;

-- Quem preencheu o briefing -----------------------------------------------------

alter table public.client_intakes
  add column filled_by_relationship text,
  add column filled_by_name text;

alter table public.client_intakes
  add constraint client_intakes_filled_by_relationship_check check (
    filled_by_relationship is null
    or filled_by_relationship in ('client', 'spouse', 'representative', 'other')
  );

alter table public.client_intakes
  add constraint client_intakes_filled_by_name_length_check check (
    filled_by_name is null or (btrim(filled_by_name) <> '' and length(filled_by_name) <= 200)
  );

comment on column public.client_intakes.filled_by_relationship is
  'Quem respondeu o formulario: o proprio cliente, conjuge, representante ou outro (0102). Nulo nos briefings anteriores a esta migration.';

comment on column public.client_intakes.filled_by_name is
  'Nome de quem respondeu, quando nao e o proprio cliente (0102).';

-- submit_client_intake: reconstruida a partir de pg_get_functiondef. Muda so a
-- gravacao dos dois campos novos; o resto e identico, inclusive a lista fechada
-- de chaves lidas do payload.

CREATE OR REPLACE FUNCTION public.submit_client_intake(p_token uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         filled_by_relationship = nullif(btrim(p_payload ->> 'filled_by_relationship'), ''),
         filled_by_name     = nullif(btrim(p_payload ->> 'filled_by_name'), ''),
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
$function$;
