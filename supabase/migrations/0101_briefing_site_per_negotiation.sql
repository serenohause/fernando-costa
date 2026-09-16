-- Endereco da obra por projeto, e diferencas do briefing que se dispensam.
--
-- O RELATO (producao)
--   "Fernando tem dois projetos no sistema, com enderecos de obra diferentes.
--   Um fica puxando o outro. Tem um erro na data de nascimento que eu ja
--   corrigi, mas o erro permanece mesmo depois do ajuste."
--
-- O QUE ESTAVA ERRADO, confirmado nos dados
--   1. `clients` guarda UMA obra (site_*). Cada briefing do cliente trazia a sua,
--      a conferencia comparava as duas com a mesma coluna, e aplicar a de um
--      projeto fazia o briefing do outro divergir - para sempre.
--   2. A conferencia so aceitava "aplicar": o cadastro corrigido a mao (data de
--      nascimento 1990 no CRM, 2026 digitado no briefing) continuava acusado, e
--      a unica saida era gravar o valor errado por cima.
--   3. `mark_negotiation_won` copiava a obra do CADASTRO para o contrato - ou
--      seja, a obra do ultimo briefing aplicado, que podia ser a do outro
--      projeto.
--
-- O QUE MUDA
--   1. O contrato copia a obra do briefing enviado da propria negociacao.
--   2. `client_intakes.dismissed_fields`: as colunas cuja diferenca a equipe
--      decidiu manter como esta no cadastro. A tela deixa de acusa-las.
--   A conferencia deixa de comparar o endereco da obra com o cadastro: isso e
--   codigo de tela, nao esta aqui.
--
-- O QUE NAO MUDA
--   Nenhuma linha existente e tocada: contratos ja gerados continuam com a obra
--   que tem, e nenhum briefing nasce com campo dispensado.

alter table public.client_intakes
  add column dismissed_fields text[] not null default '{}';

/* Uma lista fechada, a mesma de ApplicableClientColumn (pipeline/types.ts): o
   que se dispensa e diferenca de COLUNA DO CADASTRO, e nome fora dela seria
   dispensa de nada. */
alter table public.client_intakes
  add constraint client_intakes_dismissed_fields_valid_check
  check (dismissed_fields <@ array['name', 'phone', 'email', 'client_type', 'tax_id', 'birth_date', 'address_zipcode', 'address_street', 'address_number', 'address_district', 'address_complement', 'address_city', 'address_state', 'address_country', 'site_zipcode', 'site_street', 'site_number', 'site_district', 'site_complement', 'site_city', 'site_state']::text[]);

comment on column public.client_intakes.dismissed_fields is
  'Colunas do cadastro do cliente cuja diferenca com este briefing a equipe decidiu manter como esta no cadastro ("Manter cadastro" na conferencia) (0101). Escrita por quem edita o Pipeline.';

-- mark_negotiation_won: reconstruida a partir de pg_get_functiondef de producao
-- (identica a de dev na data desta migration). Muda so a origem dos seis
-- campos site_* e acrescenta `siteFromBriefing` ao retorno.

CREATE OR REPLACE FUNCTION public.mark_negotiation_won(p_negotiation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant_id uuid;
  v_negotiation public.negotiations;
  v_client public.clients;
  v_contract_id uuid;
  v_contract_number text;
  v_status_changed boolean := false;
  v_contract_type public.contract_type;
  v_has_interiors boolean;
  v_has_engineering boolean;
  v_client_found boolean;
  v_intake public.client_intakes;
  v_site_from_intake boolean := false;
  v_last_number text;
  v_number text;
  v_constraint text;
  i integer;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if not public.can_edit_menu('pipeline') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_negotiation
  from public.negotiations
  where id = p_negotiation_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'negotiation_not_found' using errcode = 'P0001';
  end if;

  if v_negotiation.status = 'lost' then
    raise exception 'negotiation_lost' using errcode = 'P0001';
  end if;

  if v_negotiation.client_id is null then
    raise exception 'client_required' using errcode = 'P0001';
  end if;

  if v_negotiation.status <> 'won' then
    update public.negotiations
    set status = 'won',
        closed_at = current_date
    where id = v_negotiation.id;

    v_status_changed := true;
  end if;

  if not v_negotiation.generates_contract then
    return jsonb_build_object(
      'outcome', 'not_requested',
      'negotiationId', v_negotiation.id,
      'statusChanged', v_status_changed,
      'contractId', null,
      'contractNumber', null,
      'clientSnapshot', null
    );
  end if;

  select c.id, c.contract_number
  into v_contract_id, v_contract_number
  from public.contracts c
  where c.negotiation_id = v_negotiation.id
    and c.tenant_id = v_tenant_id
  order by c.created_at, c.id
  limit 1;

  if found then
    return jsonb_build_object(
      'outcome', 'already_exists',
      'negotiationId', v_negotiation.id,
      'statusChanged', v_status_changed,
      'contractId', v_contract_id,
      'contractNumber', v_contract_number,
      'clientSnapshot', null
    );
  end if;

  -- A REGRA E A MESMA DA 0067; o que mudou e de onde vem a classificacao. Antes
  -- os quatro valores estavam escritos aqui dentro; agora cada tipo de servico
  -- diz a que grupo pertence (service_types.contract_group, 0084), e um tipo
  -- criado pelo escritorio participa em vez de cair calado no ultimo ramo.
  select bool_or(st.contract_group = 'interiors'),
         bool_or(st.contract_group = 'engineering')
  into v_has_interiors, v_has_engineering
  from public.negotiation_services s
  join public.service_types st
    on st.id = s.service_type_id and st.tenant_id = s.tenant_id
  where s.negotiation_id = v_negotiation.id
    and s.tenant_id = v_tenant_id;

  v_contract_type := case
    when coalesce(v_has_interiors, false) and coalesce(v_has_engineering, false)
      then 'full'
    when coalesce(v_has_interiors, false)
      then 'architecture_interiors'
    when coalesce(v_has_engineering, false)
      then 'architecture_engineering'
    else 'architecture'
  end;

  select * into v_client
  from public.clients
  where id = v_negotiation.client_id
    and tenant_id = v_tenant_id;

  /*
    O RETRATO E COPIADO CAMPO A CAMPO, e nao tudo-ou-nada.

    Ate aqui a copia so acontecia quando OITO campos do cadastro estivessem
    preenchidos (`crmCompleto` do original, Negociacoes.jsx:113-121) — e, como
    quatro deles sao not null desde a 0015, quem decidia de verdade eram os
    quatro do endereco da OBRA. Faltando um deles, o contrato nascia sem NENHUM
    dos catorze campos: sem nome legal, sem documento, sem e-mail, sem o
    endereco da residencia. Tudo isso estava no cadastro, a um clique.

    Copiar o que existe nao inventa fato nenhum: campo vazio no cadastro
    continua vazio no contrato. O que muda e que a falta de um campo deixa de
    apagar os outros treze.

    `v_client_found` guarda a unica pergunta que sobra: existe cliente
    vinculado? Sem cliente nao ha o que copiar.
  */
  v_client_found := found;

  /*
    O ENDERECO DA OBRA E DO PROJETO, e nao do cliente (0101).

    O cadastro do cliente guarda UMA obra. O cliente com dois projetos tem duas,
    e o contrato copiava a que estivesse no cadastro na hora de gerar - a do
    outro projeto, se alguem tivesse aplicado o briefing dele por ultimo. Caso
    real de producao: dois projetos do mesmo cliente no Alphaville, um na
    Alameda Grecia e outro na Alameda Noruega.

    A obra agora vem do briefing ENVIADO desta negociacao, o mais recente. O
    endereco vem INTEIRO de um lado so: misturar a rua do briefing com o
    complemento do cadastro montaria uma obra que nao existe. Sem briefing, ou
    com briefing sem nenhum campo de obra, vale o cadastro, como antes.
  */
  select ci.* into v_intake
  from public.client_intakes ci
  where ci.negotiation_id = v_negotiation.id
    and ci.tenant_id = v_tenant_id
    and ci.status = 'submitted'
  order by ci.submitted_at desc nulls last, ci.id desc
  limit 1;

  v_site_from_intake := found and coalesce(
    nullif(btrim(v_intake.site_zipcode), ''),
    nullif(btrim(v_intake.site_street), ''),
    nullif(btrim(v_intake.site_number), ''),
    nullif(btrim(v_intake.site_complement), ''),
    nullif(btrim(v_intake.site_city), ''),
    nullif(btrim(v_intake.site_state), '')
  ) is not null;

  select c.contract_number
  into v_last_number
  from public.contracts c
  where c.tenant_id = v_tenant_id
  order by c.created_at desc, c.id desc
  limit 1;

  v_number := public.increment_contract_number(v_last_number);

  for i in 1..25 loop
    begin
      insert into public.contracts (
        tenant_id, negotiation_id, client_id,
        contract_number, contract_type, total_value,
        project_name, status, signature_date, start_date, notes,
        installments_generated,
        origin, referrer_name,
        client_legal_name, client_email, client_tax_id, client_birth_date,
        client_address_zipcode, client_address_street, client_address_number,
        client_address_complement, client_address_city, client_address_state,
        site_zipcode, site_street, site_number, site_complement,
        site_city, site_state
      ) values (
        v_tenant_id, v_negotiation.id, v_negotiation.client_id,
        v_number, v_contract_type, coalesce(v_negotiation.estimated_value, 0),
        v_negotiation.name, 'negotiating', current_date, current_date,
        'Contrato criado automaticamente a partir da negociação: ' || v_negotiation.name,
        false,
        v_negotiation.origin, v_negotiation.referrer_name,
        case when v_client_found then v_client.name end,
        case when v_client_found then v_client.email::text end,
        case when v_client_found then v_client.tax_id end,
        case when v_client_found then v_client.birth_date end,
        case when v_client_found then v_client.address_zipcode end,
        case when v_client_found then v_client.address_street end,
        case when v_client_found then v_client.address_number end,
        case when v_client_found then v_client.address_complement end,
        case when v_client_found then v_client.address_city end,
        case when v_client_found then v_client.address_state end,
        case when v_site_from_intake then v_intake.site_zipcode when v_client_found then v_client.site_zipcode end,
        case when v_site_from_intake then v_intake.site_street when v_client_found then v_client.site_street end,
        case when v_site_from_intake then v_intake.site_number when v_client_found then v_client.site_number end,
        case when v_site_from_intake then v_intake.site_complement when v_client_found then v_client.site_complement end,
        case when v_site_from_intake then v_intake.site_city when v_client_found then v_client.site_city end,
        case when v_site_from_intake then v_intake.site_state when v_client_found then v_client.site_state end
      )
      returning id, contract_number into v_contract_id, v_contract_number;

      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      if v_constraint is distinct from 'contracts_tenant_id_contract_number_key' then
        raise;
      end if;

      v_number := public.increment_contract_number(v_number);
    end;
  end loop;

  if v_contract_id is null then
    raise exception 'contract_number_conflict' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'outcome', 'created',
    'negotiationId', v_negotiation.id,
    'statusChanged', v_status_changed,
    'contractId', v_contract_id,
    'contractNumber', v_contract_number,
    /* Passa a significar "havia cliente para copiar", e nao "o cadastro estava
           completo". O aviso que a tela da com ele continua certo. */
        'clientSnapshot', v_client_found,
        /* A obra veio do briefing desta negociacao (0101). */
        'siteFromBriefing', v_site_from_intake
  );
end;
$function$;
