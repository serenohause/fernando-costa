-- Modulo 3 (Pipeline) - marcar negociacao como Ganha gera o contrato, em UMA
-- transacao.
--
-- A DIVIDA QUE ESTA MIGRATION PAGA
--   src/features/pipeline/hooks.ts (useMarkNegotiationWon) registra em comentario:
--   "O QUE FALTA, E ESPERA O MODULO 4: o original tambem cria o Contract quando a
--   negociacao vira Ganha e gera_contrato esta marcado (Negociacoes.jsx:99-179)".
--   O modulo 4 subiu na 0029 e ninguem voltou aqui: hoje marcar Ganha nao gera
--   contrato nenhum, e foi isso que o cliente reportou em teste.
--
-- A REGRA REPRODUZIDA, de projeto-original/src/pages/Negociacoes.jsx
--   handleMarcarComoGanha (247-302) marca Ganha e exige cliente vinculado (249).
--   O onSuccess da mutation (81-85) chama handleCreateContractOnly (99-179)
--   quando status vira 'Ganha' E gera_contrato E !contrato_vinculado_id. O
--   contrato nasce na hora - NAO espera o formulario publico, que e coleta
--   paralela e continua sendo criado pela tela.
--
-- POR QUE A FUNCAO MARCA GANHA TAMBEM, E NAO SO CRIA O CONTRATO
--   No original sao duas gravacoes soltas do navegador (marcar Ganha; criar o
--   contrato) e uma terceira para escrever o vinculo de volta na negociacao
--   (167-169). Falha no meio deixa negociacao Ganha sem contrato, ou contrato
--   criado sem o vinculo - e ai o proximo clique passa pelo teste
--   !contrato_vinculado_id e cria um SEGUNDO contrato para a mesma negociacao.
--   E o mesmo tipo de estado pela metade que a 0044/0045 tirou do financeiro.
--
--   Aqui as duas escritas que restam (status da negociacao e linha de contrato)
--   sao a mesma transacao, porque sao a mesma funcao. A terceira gravacao do
--   original simplesmente NAO EXISTE neste schema: o vinculo e
--   contracts.negotiation_id (0029), gravado na mesma linha que nasce - a 0022
--   registra que negotiations nao aponta para contrato, e e por isso que "ja tem
--   contrato" se descobre procurando contrato que aponta para a negociacao.
--
--   O que continua fora daqui e o briefing (client_intakes), que o original cria
--   mesmo quando gera_contrato e falso e cuja falha nao pode desfazer o fechamento
--   do negocio. Segue na tela, depois desta chamada.
--
-- POR QUE SECURITY DEFINER, E POR QUE A AUTORIZACAO E CONFERIDA POR DENTRO
--   Quem fecha negocio precisa criar contrato SEM ter permissao de editar
--   contrato. Isso nao e conveniencia, e o desenho de permissao do original:
--   o preset "Perfil Comercial" de PermissoesManager.jsx:59-66 da
--   Pipeline com editar=true e "Contratos & Propostas" com editar=false. Exigir
--   can_edit_menu('contracts') aqui travaria exatamente o time para quem o fluxo
--   existe.
--
--   Entao a funcao escreve em contracts, cuja policy de INSERT (0030) pede o menu
--   'contracts', em nome de quem so tem 'pipeline'. SECURITY DEFINER resolve isso
--   e, ao resolver, passa por cima de TODA a RLS - por isso a autorizacao e
--   conferida aqui dentro (can_edit_menu('pipeline'), a MESMA regra da policy de
--   UPDATE de negotiations na 0024) e a negociacao e buscada com
--   tenant_id = auth_tenant_id() explicito. Mesmo desenho de
--   generate_contract_installments (0044) e de approve_access_request (0013).
--
--   A excecao tem dono e tem limite: o unico contrato que o menu 'pipeline'
--   consegue criar por aqui e UM, para uma negociacao ganha do proprio
--   escritorio, com os campos que a negociacao ja carrega. Editar, aprovar ou
--   apagar contrato continua exigindo o menu 'contracts'.
--
--   FOR UPDATE na negociacao serializa duas chamadas simultaneas - dois cliques,
--   ou duas abas. E ele que torna real o teste de "ja existe contrato", que no
--   original e uma leitura solta do estado em memoria do navegador.
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. NUMERO DO CONTRATO. O original usa `CTR-${Date.now()}` (linha 125), sem
--      unicidade nenhuma no base44. O formato fica (nao e decisao de banco trocar
--      a numeracao do escritorio), mas a colisao deixa de ser improvavel e passa a
--      ser impossivel: o sufixo e o maior entre o relogio em milissegundos e
--      (maior sufixo CTR- ja usado no escritorio + 1), e o INSERT ainda tenta de
--      novo, incrementando, se a unicidade
--      contracts_tenant_id_contract_number_key acusar - o que so acontece com
--      duas transacoes concorrentes, que nao enxergam a linha nao commitada uma
--      da outra. Quem decide, no fim, e o indice, e nao uma consulta previa.
--
--      REGISTRADO PARA QUEM DECIDE: CTR-1786... nao e o numero que este
--      escritorio escreve em contrato. O dado real do base44 usa serie sequencial
--      de quatro digitos ('0724') e o seed usa 'FC-2026-018'. Ninguem do
--      comercial consegue corrigir isso depois, porque renomear contrato exige o
--      menu 'contracts'. A proposta esta no relatorio; trocar o formato e decisao
--      do usuario, nao desta migration.
--
--   2. TIPO DE CONTRATO. O original grava
--      `tipo_servico.join(', ')` (130) num campo que o base44 declara como lista
--      fechada - e o resultado disso esta documentado em docs/ENUM-MAP.md: 18 dos
--      73 projetos reais carregam "a lista de servicos serializada com virgula,
--      em 8 grafias que descrevem 4 conjuntos". Aqui contract_type e enum not
--      null, entao a derivacao usa o CRITERIO QUE JA ESTA REGISTRADO naquele
--      documento para ler exatamente esse dado (secao "Project.project_type com
--      lista de servicos"): Interiores + complementar = full; so Interiores =
--      architecture_interiors; so complementar = architecture_engineering; senao
--      architecture. Nao e criterio novo - e o que a importacao usa.
--
--      Negociacao sem servico algum cai no ultimo ramo (architecture). O
--      formulario do original permite salvar com tipo_servico vazio, mas as 113
--      negociacoes reais tem servico, e as 113 incluem Arquitetura.
--
--   3. VALOR TOTAL. contracts.total_value e not null; negotiations.estimated_value
--      e nullable. Negociacao sem valor gera contrato de 0,00, que e o que o
--      original produz (undefined vira vazio no base44) e o que o check
--      total_value >= 0 aceita. Recusar o fechamento do negocio por causa disso
--      seria inventar regra que o original nao tem.
--
--   4. RETRATO DO CLIENTE. Mesmo criterio do original (crmCompleto, 113-121):
--      os oito campos precisam estar preenchidos, senao o contrato nasce sem o
--      retrato. Quatro deles (name, phone, address_city, address_state) sao not
--      null com check de nao-vazio desde a 0015, entao na pratica quem decide sao
--      os quatro campos da obra - a conferencia dos oito fica escrita assim mesmo,
--      porque e a regra que se esta reproduzindo, e nao um efeito do schema atual.
--      As colunas copiadas sao as do bloco SNAPSHOT INTENCIONAL da 0029.
--
--      O original grava '' (string vazia) no que estiver faltando dentro de um
--      cliente completo (144-159). Aqui o valor vai como esta, inclusive nulo:
--      nenhum check de contracts exige texto nao-vazio nessas colunas, e '' num
--      complemento de endereco e so um nulo disfarcado que toda tela precisa
--      tratar duas vezes.
--
--   5. NEGOCIACAO PERDIDA nao vira Ganha por aqui. Nao e zelo: com loss_reason
--      preenchido, o UPDATE violaria
--      negotiations_loss_fields_require_lost_check (0022) e o usuario receberia
--      um 23514 com nome de constraint. Vira erro proprio, com mensagem estavel.
--
-- ESTA MIGRATION NAO CRIA TABELA. Nenhuma RLS nova e necessaria, e nenhuma
-- policy existente muda: a funcao le e escreve como dono e confere a autorizacao
-- por conta propria, que e o unico motivo pelo qual isso e aceitavel.

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
  v_suffix bigint;
  v_last_suffix bigint;
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

  -- Numero do contrato. Ver o item 1 do cabecalho. O regexp limita o sufixo a 15
  -- digitos para o cast nao estourar bigint com um numero digitado a mao.
  select coalesce(max(substring(c.contract_number from 5)::bigint), 0)
  into v_last_suffix
  from public.contracts c
  where c.tenant_id = v_tenant_id
    and c.contract_number ~ '^CTR-[0-9]{1,15}$';

  v_suffix := greatest(
    (extract(epoch from clock_timestamp()) * 1000)::bigint,
    v_last_suffix + 1
  );

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
        'CTR-' || v_suffix, v_contract_type, coalesce(v_negotiation.estimated_value, 0),
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

      v_suffix := v_suffix + 1;
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
  'Marca a negociacao como Ganha e cria o contrato dela em UMA transacao (gesto de Negociacoes.jsx:99-179 e 247-302 do original). Cria o contrato so quando negotiations.generates_contract, e so quando ainda nao ha contrato apontando para a negociacao - o vinculo mora em contracts.negotiation_id (0029), nao o contrario. Devolve jsonb com outcome created | already_exists | not_requested, negotiationId, statusChanged, contractId, contractNumber e clientSnapshot; ja existir contrato NAO e erro. O contrato nasce em negotiating, com data de assinatura e inicio de hoje, valor total = estimated_value, tipo derivado do conjunto de negotiation_services pelo criterio de docs/ENUM-MAP.md, origem e indicador copiados, e o retrato do cliente apenas quando o cadastro do CRM esta completo (crmCompleto, Negociacoes.jsx:113-121). Numero no formato CTR-<milissegundos> do original, com colisao impossivel: sufixo = maior entre o relogio e o ultimo CTR- do escritorio + 1, e nova tentativa quando contracts_tenant_id_contract_number_key acusa. SECURITY DEFINER porque escreve em contracts em nome de quem tem o menu pipeline e NAO tem o menu contracts - que e o Perfil Comercial do original (PermissoesManager.jsx:59) e a razao de a funcao existir; por isso confere can_edit_menu(pipeline) e o tenant do JWT POR DENTRO, como generate_contract_installments (0044). Erros de negocio saem como P0001 com mensagem estavel: not_authorized, negotiation_not_found, negotiation_lost, client_required, contract_number_conflict.';

-- anon NAO executa: nenhuma tela publica fecha negocio. service_role tambem nao
-- ganha nada de util - a funcao le o tenant do JWT, e chamada sem sessao
-- autenticada morre em not_authorized. Fica de fora para nao sugerir um caminho
-- de servidor que nao existe.
revoke all on function public.mark_negotiation_won(uuid) from public, anon;
grant execute on function public.mark_negotiation_won(uuid) to authenticated;
