-- O numero do contrato vira UMA regra, usada tambem pelo formulario manual.
--
-- O PEDIDO
--   "apos a primeira nomeacao de contrato pelo escritorio os novos contratos
--   devem seguir o modelo mudando apenas o numero final com auto incremento".
--
--   Metade disso ja existia: a 0077 fez a funcao mark_negotiation_won continuar
--   a serie do escritorio. Mas ela vale so para o contrato que nasce do
--   briefing; quem cria contrato PELO FORMULARIO ainda digitava o numero do
--   zero, sem nada sugerindo o proximo — e digitar a serie a mao e como a serie
--   ganha buracos e grafias novas.
--
-- POR QUE UMA FUNCAO PURA, E NAO copiar a conta no frontend
--   A regra ja existia dentro da 0077. Repeti-la em TypeScript criaria duas
--   definicoes do que e "o proximo numero", e elas divergiriam no primeiro dia
--   em que uma fosse ajustada. Aqui a conta sai de dentro da 0077 e vira funcao;
--   os dois caminhos passam a chamar a MESMA.
--
--   O ganho aparece de imediato no laco de colisao da 0077: antes ele carregava
--   prefixo, largura e proximo em tres variaveis para poder incrementar de novo;
--   agora e uma linha — "tente o seguinte" e o seguinte tem uma definicao so.
--
-- A REGRA (inalterada, so mudou de lugar)
--   Pega o ULTIMO grupo de digitos e soma 1, preservando prefixo, sufixo e a
--   quantidade de digitos:
--     0727 -> 0728    MIR-2026-008 -> MIR-2026-009    3566 -> 3567
--   Sem numero anterior, ou numero sem digito algum, comeca em '0001'.

create or replace function public.increment_contract_number(p_atual text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
begin
  -- Separa o ULTIMO grupo de digitos do que vem antes e depois dele. O sufixo
  -- sem digitos no fim e o que garante "ultimo grupo": 'MIR-2026-008' quebra em
  -- ('MIR-2026-', '008', ''), e nao no ano.
  v_parts := regexp_match(coalesce(p_atual, ''), '^(.*?)([0-9]+)([^0-9]*)$');

  -- Limite de 15 digitos para o cast nao estourar bigint com numero digitado a
  -- mao. Acima disso, ou sem digito algum, comeca a serie.
  if v_parts is null or length(v_parts[2]) > 15 then
    return '0001';
  end if;

  -- greatest, e nao so a largura original: lpad TRUNCA quando o texto e maior
  -- que a largura pedida, entao '9999' + 1 viraria '0000' em vez de '10000'.
  return v_parts[1]
    || lpad(
         (v_parts[2]::bigint + 1)::text,
         greatest(length(v_parts[2]), length((v_parts[2]::bigint + 1)::text)),
         '0'
       )
    || v_parts[3];
end;
$$;

comment on function public.increment_contract_number(text) is
  'Devolve o proximo numero de contrato a partir de um numero existente: soma 1 no ULTIMO grupo de digitos, preservando prefixo, sufixo e quantidade de digitos (0727 vira 0728; MIR-2026-008 vira MIR-2026-009). Sem numero anterior, ou numero sem digito algum, devolve 0001. IMMUTABLE e pura: nao le tabela, nao sabe de escritorio. Existe para que a regra tenha UMA definicao — ela nasceu dentro de mark_negotiation_won (0077) e saiu de la na 0083, quando o formulario manual de contrato passou a precisar da mesma conta.';

-- A sugestao para a TELA: o proximo numero do escritorio de quem esta pedindo.
create or replace function public.suggest_contract_number()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_last text;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null or not public.can_edit_menu('contracts') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Mesma leitura de mark_negotiation_won: o ultimo CRIADO, com id desempatando
  -- duas linhas gravadas no mesmo instante.
  select c.contract_number into v_last
  from public.contracts c
  where c.tenant_id = v_tenant_id
  order by c.created_at desc, c.id desc
  limit 1;

  return public.increment_contract_number(v_last);
end;
$$;

comment on function public.suggest_contract_number() is
  'O proximo numero de contrato do escritorio de quem chama, para o formulario manual sugerir em vez de deixar o campo vazio. SUGESTAO, e nao reserva: nada e gravado, dois formularios abertos ao mesmo tempo recebem o mesmo numero, e quem decide de verdade e o indice unico contracts_tenant_id_contract_number_key na hora de gravar. SECURITY DEFINER com can_edit_menu(contracts) conferido por dentro: quem nao pode criar contrato nao precisa saber qual seria o proximo numero da serie do escritorio.';

revoke all on function public.suggest_contract_number() from public, anon;
grant execute on function public.suggest_contract_number() to authenticated;

-- mark_negotiation_won passa a usar a funcao, em vez da conta inline ----------

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

  -- Numero do contrato: O ULTIMO CRIADO, INCREMENTADO.
  --
  -- Ultimo CRIADO, e nao maior numero: e a regra que o usuario definiu, e as
  -- duas divergem no dado real deste escritorio (o mais recente e '3566', fora
  -- da serie 0722..0727). Ordena por created_at e desempata por id para a
  -- resposta nao depender de duas linhas gravadas no mesmo instante.
  --
  -- A CONTA saiu daqui para public.increment_contract_number (0083), porque o
  -- formulario manual de contrato precisa dela tambem — e a mesma regra escrita
  -- em dois lugares e duas regras esperando para divergir.
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

      -- A MESMA funcao que gerou o primeiro palpite gera o proximo: colisao e
      -- so "tente o seguinte", e o seguinte e definido num lugar so.
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
    'clientSnapshot', v_snapshot
  );
end;
$$;
