-- O numero do contrato gerado passa a CONTINUAR A SERIE DO ESCRITORIO.
--
-- DECISAO DO USUARIO
--   "o numero do contrato deve ser sempre incrementado do ultimo criado".
--
-- O QUE ESTAVA ERRADO, E POR QUE ISSO IMPORTAVA
--   A 0067 numerava 'CTR-<milissegundos>', que e o formato do original
--   (`CTR-${Date.now()}`, Negociacoes.jsx:125). Aquela migration ja registrava a
--   divida em voz alta: "CTR-1786... nao e o numero que este escritorio escreve
--   em contrato", e a funcao ficou dormente porque o formato nao estava decidido.
--
--   O dado real fecha a questao. Os contratos do escritorio Fernando Costa sao
--   0722, 0724, 0725, 0726, 0727 — serie de quatro digitos, e o escritorio
--   CONTINUOU a serie dentro desta aplicacao (0726 e 0727 nasceram aqui, em
--   agosto/2026). Os outros dois escritorios usam 'MIR-2026-008' e 'FC-2026-018'.
--
--   Numero errado nao e detalhe cosmetico aqui: e o que vai escrito no contrato
--   que o cliente assina, e quem fecha negocio NAO CONSEGUE CORRIGIR depois —
--   renomear contrato exige o menu 'contracts', que o Perfil Comercial nao tem.
--
-- A REGRA, E O QUE ELA NAO TENTA ADIVINHAR
--   Pega o contrato MAIS RECENTEMENTE CRIADO do escritorio, acha o ULTIMO grupo
--   de digitos do numero dele e soma 1, preservando prefixo, sufixo e a
--   quantidade de digitos:
--
--     0727          ->  0728
--     MIR-2026-008  ->  MIR-2026-009
--     3566          ->  3567
--
--   ULTIMO CRIADO, e nao MAIOR NUMERO, porque foi o que o usuario pediu — e as
--   duas coisas divergem hoje: o contrato mais recente do escritorio e '3566',
--   fora da serie 0722..0727. Seguir o mais recente devolve 3567; seguir o maior
--   da serie devolveria 0728. A regra escolhida e a primeira, e esta escrita aqui
--   para que a diferenca seja uma escolha visivel e nao uma surpresa.
--
--   Nao ha adivinhacao de formato por escritorio, nem lista de padroes
--   conhecidos: a funcao copia a forma do numero anterior. Escritorio novo, ou
--   numero anterior sem digito algum, comeca em '0001'.
--
--   A UNICIDADE CONTINUA SENDO DO INDICE, e nao desta conta. Se o numero
--   calculado ja existir, contracts_tenant_id_contract_number_key acusa e a
--   funcao tenta o proximo, ate 25 vezes — que e o que sustenta a regra quando a
--   serie tem buracos ou quando duas transacoes correm juntas, sem enxergar a
--   linha nao commitada uma da outra.
--
-- O QUE NAO MUDA
--   Todo o resto da 0067: quando o contrato nasce, o que ele copia da
--   negociacao, o retrato do cliente, os outcomes devolvidos e a autorizacao por
--   dentro. Esta migration troca a numeracao e nada mais.
--
-- POR QUE MIGRATION NOVA
--   A 0067 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md).

create or replace function public.mark_negotiation_won(p_negotiation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  v_snapshot boolean;
  v_last_number text;
  v_parts text[];
  v_prefix text;
  v_tail text;
  v_width integer;
  v_next bigint;
  v_number text;
  v_constraint text;
  i integer;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Autorizacao ANTES de qualquer leitura da negociacao: quem nao pode fechar
  -- negocio tambem nao precisa descobrir, pela mensagem de erro, se um
  -- determinado id de negociacao existe.
  if not public.can_edit_menu('pipeline') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- tenant_id explicito porque SECURITY DEFINER nao passa pela RLS de
  -- negotiations. FOR UPDATE serializa duas chamadas simultaneas para a mesma
  -- negociacao, e e o que sustenta a conferencia de contrato ja existente
  -- logo abaixo.
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

  -- Negociacoes.jsx:249. Regra de tela no original, e continua sendo (o hook
  -- recusa antes de chegar aqui, com a frase do original); aqui ela existe
  -- porque a funcao e chamavel sem passar pela tela.
  if v_negotiation.client_id is null then
    raise exception 'client_required' using errcode = 'P0001';
  end if;

  -- Ja ganha: nao reescreve a data de fechamento. O original regrava
  -- data_fechamento a cada clique (259), o que move para hoje o fechamento de
  -- um negocio fechado mes passado.
  if v_negotiation.status <> 'won' then
    update public.negotiations
    set status = 'won',
        closed_at = current_date
    where id = v_negotiation.id;

    v_status_changed := true;
  end if;

  -- gera_contrato desmarcado: o negocio fecha e nenhum contrato nasce, como no
  -- original (66 e 82). Nao e erro, e a tela precisa distinguir isso de "criei".
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

  -- O `!contrato_vinculado_id` do original (83), pelo lado certo: quem aponta e
  -- o contrato. Sob o FOR UPDATE acima, dois cliques simultaneos nao passam os
  -- dois por aqui. Sem ordenacao arbitraria - a mais antiga e a que a tela
  -- mostraria como "o contrato desta negociacao".
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

  -- Tipo de contrato pelo conjunto de servicos. Ver o item 2 do cabecalho.
  select bool_or(s.service_type = 'interiors'),
         bool_or(s.service_type in ('structural', 'plumbing', 'electrical'))
  into v_has_interiors, v_has_engineering
  from public.negotiation_services s
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

  -- crmCompleto, Negociacoes.jsx:113-121. Ver o item 4 do cabecalho.
  v_snapshot := found
    and btrim(coalesce(v_client.name, '')) <> ''
    and btrim(coalesce(v_client.phone, '')) <> ''
    and btrim(coalesce(v_client.address_city, '')) <> ''
    and btrim(coalesce(v_client.address_state, '')) <> ''
    and btrim(coalesce(v_client.site_zipcode, '')) <> ''
    and btrim(coalesce(v_client.site_street, '')) <> ''
    and btrim(coalesce(v_client.site_city, '')) <> ''
    and btrim(coalesce(v_client.site_state, '')) <> '';

  -- Numero do contrato: O ULTIMO CRIADO, INCREMENTADO. Ver o cabecalho da 0077.
  --
  -- Ultimo CRIADO, e nao maior numero: e a regra que o usuario definiu, e as
  -- duas divergem no dado real deste escritorio (o mais recente e '3566', fora
  -- da serie 0722..0727). Ordena por created_at e desempata por id para a
  -- resposta nao depender de duas linhas gravadas no mesmo instante.
  select c.contract_number
  into v_last_number
  from public.contracts c
  where c.tenant_id = v_tenant_id
  order by c.created_at desc, c.id desc
  limit 1;

  -- Separa o ULTIMO grupo de digitos do que vem antes e depois dele. O sufixo
  -- sem digitos no fim e o que garante "ultimo grupo": 'MIR-2026-008' quebra em
  -- ('MIR-2026-', '008', ''), e nao no ano.
  v_parts := regexp_match(coalesce(v_last_number, ''), '^(.*?)([0-9]+)([^0-9]*)$');

  -- Limite de 15 digitos para o cast nao estourar bigint com numero digitado a
  -- mao. Acima disso, ou sem digito algum, cai no comeco de serie.
  if v_parts is null or length(v_parts[2]) > 15 then
    v_prefix := '';
    v_tail := '';
    v_width := 4;
    v_next := 1;
  else
    v_prefix := v_parts[1];
    v_tail := v_parts[3];
    v_width := length(v_parts[2]);
    v_next := v_parts[2]::bigint + 1;
  end if;

  for i in 1..25 loop
    begin
      -- greatest, e nao so v_width: lpad TRUNCA quando o texto e maior que a
      -- largura pedida, entao '9999' + 1 viraria '0000' em vez de '10000'.
      v_number := v_prefix
        || lpad(v_next::text, greatest(v_width, length(v_next::text)), '0')
        || v_tail;

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
        case when v_snapshot then v_client.name end,
        case when v_snapshot then v_client.email::text end,
        case when v_snapshot then v_client.tax_id end,
        case when v_snapshot then v_client.birth_date end,
        case when v_snapshot then v_client.address_zipcode end,
        case when v_snapshot then v_client.address_street end,
        case when v_snapshot then v_client.address_number end,
        case when v_snapshot then v_client.address_complement end,
        case when v_snapshot then v_client.address_city end,
        case when v_snapshot then v_client.address_state end,
        case when v_snapshot then v_client.site_zipcode end,
        case when v_snapshot then v_client.site_street end,
        case when v_snapshot then v_client.site_number end,
        case when v_snapshot then v_client.site_complement end,
        case when v_snapshot then v_client.site_city end,
        case when v_snapshot then v_client.site_state end
      )
      returning id, contract_number into v_contract_id, v_contract_number;

      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      -- Colisao de OUTRA unicidade nao e numero repetido e nao se resolve
      -- tentando de novo: sobe como esta.
      if v_constraint is distinct from 'contracts_tenant_id_contract_number_key' then
        raise;
      end if;

      v_next := v_next + 1;
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
    'clientSnapshot', v_snapshot
  );
end;
$$;

comment on function public.mark_negotiation_won(uuid) is
  'Marca a negociacao como Ganha e cria o contrato dela em UMA transacao (gesto de Negociacoes.jsx:99-179 e 247-302 do original). Cria o contrato so quando negotiations.generates_contract, e so quando ainda nao ha contrato apontando para a negociacao - o vinculo mora em contracts.negotiation_id (0029), nao o contrario. Devolve jsonb com outcome created | already_exists | not_requested, negotiationId, statusChanged, contractId, contractNumber e clientSnapshot; ja existir contrato NAO e erro. O contrato nasce em negotiating, com data de assinatura e inicio de hoje, valor total = estimated_value, tipo derivado do conjunto de negotiation_services pelo criterio de docs/ENUM-MAP.md, origem e indicador copiados, e o retrato do cliente apenas quando o cadastro do CRM esta completo (crmCompleto, Negociacoes.jsx:113-121). Numero: o do contrato MAIS RECENTEMENTE CRIADO do escritorio com o ultimo grupo de digitos somado em 1, preservando prefixo, sufixo e quantidade de digitos (0727 vira 0728; MIR-2026-008 vira MIR-2026-009) - regra da 0077, que substituiu o CTR-<milissegundos> do original; escritorio sem contrato, ou numero anterior sem digito, comeca em 0001, e a unicidade continua sendo do indice contracts_tenant_id_contract_number_key, com nova tentativa a cada colisao. SECURITY DEFINER porque escreve em contracts em nome de quem tem o menu pipeline e NAO tem o menu contracts - que e o Perfil Comercial do original (PermissoesManager.jsx:59) e a razao de a funcao existir; por isso confere can_edit_menu(pipeline) e o tenant do JWT POR DENTRO, como generate_contract_installments (0044). Erros de negocio saem como P0001 com mensagem estavel: not_authorized, negotiation_not_found, negotiation_lost, client_required, contract_number_conflict.';
