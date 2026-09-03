-- O contrato gerado por negociacao ganha nascia sem os dados do cliente.
--
-- O CASO, RELATADO EM PRODUCAO
--   "Ao clicar em editar, o contrato nao vem com as informacoes preenchidas."
--   Medido na tela: dos quatro contratos abertos, os tres IMPORTADOS abriram
--   completos e o unico GERADO PELO SISTEMA abriu com 23 de 27 campos vazios,
--   incluindo os dois selects de parcelamento.
--
-- A CAUSA
--   `mark_negotiation_won` copia um retrato do cliente para o contrato — nome
--   legal, documento, e-mail, nascimento, endereco da residencia e endereco da
--   obra, catorze colunas. A copia era TUDO-OU-NADA: so acontecia se OITO
--   campos do cadastro estivessem preenchidos, reproduzindo o `crmCompleto` do
--   original (Negociacoes.jsx:113-121).
--
--   Quatro desses oito sao not null com check de nao-vazio desde a 0015, entao
--   quem decidia de verdade eram os QUATRO do endereco da OBRA. Faltando um
--   deles, o contrato nascia sem nenhum dos catorze — inclusive sem o documento
--   e o e-mail, que nada tem a ver com o endereco da obra e que estavam ali, no
--   cadastro.
--
--   Medido no escritorio: 72 dos 135 clientes nao tem o endereco da obra
--   completo, e 26 desses tem documento, e-mail ou endereco da residencia.
--
-- FIEL AO ORIGINAL NAO INCLUI REPRODUZIR ISSO
--   A regra do projeto e ser fiel ao original e nao reproduzir bug. Aqui o
--   original perde dado que ele proprio tem: e defeito, nao decisao de produto.
--   O conserto e copiar CAMPO A CAMPO. Campo vazio no cadastro continua vazio
--   no contrato; o que muda e que a falta de um deixa de apagar os outros treze.
--
-- O QUE NAO MUDA
--   O numero do contrato, o tipo derivado dos servicos, a idempotencia por
--   negociacao, a autorizacao por dentro e o desfecho devolvido. `clientSnapshot`
--   no retorno passa a significar "havia cliente para copiar" — o aviso que a
--   tela da com ele continua certo.
--
-- CONTRATOS JA GERADOS nao sao corrigidos por esta migration: reescrever um
-- contrato assinado a partir do cadastro ATUAL do cliente seria trocar o retrato
-- do dia da assinatura pelo de hoje, que e justamente o que um snapshot existe
-- para nao fazer. Quem quiser completar um contrato antigo faz pela tela.

create or replace function public.mark_negotiation_won(p_negotiation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
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
        case when v_client_found then v_client.site_zipcode end,
        case when v_client_found then v_client.site_street end,
        case when v_client_found then v_client.site_number end,
        case when v_client_found then v_client.site_complement end,
        case when v_client_found then v_client.site_city end,
        case when v_client_found then v_client.site_state end
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
        'clientSnapshot', v_client_found
  );
end;
$BODY$;

comment on function public.mark_negotiation_won(uuid) is
  'Marca a negociacao como Ganha e, quando ela pede contrato, cria um a partir dela: numero seguindo a serie do escritorio, tipo derivado dos servicos e um RETRATO do cliente copiado campo a campo (0090). Idempotente por negociacao. Confere a autorizacao por dentro (can_edit_menu(''pipeline'')), porque e security definer.';
