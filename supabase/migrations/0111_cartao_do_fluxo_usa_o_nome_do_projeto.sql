-- O cartao criado ao aprovar a proposta passa a se chamar pelo NOME DO PROJETO,
-- e nao pelo nome do cliente.
--
-- O RELATO
--   "Os projetos no sistema estao indo com o nome completo dos clientes e nao
--   com o nome do projeto." No quadro do Fluxo, o titulo em negrito do cartao
--   saia como "0739 - Rafael Augusto Pinheiro Martins" enquanto o projeto se
--   chama "Rafael Martins" — o nome certo aparecia so na linha cinza de baixo.
--
-- ISTO NAO FOI UMA MUDANCA: foi um pedido aplicado pela metade
--   A 0078 devolveu a criacao automatica de projeto e cartao ao aprovar, que
--   tinha ficado fora do porte do modulo 4, e copiou fielmente o titulo do
--   original (Contracts.jsx:579, `${contract_number} - ${client_name}`).
--
--   Um mes depois o escritorio pediu, com estas palavras: "por padrao devem ser
--   nomeados usando numero do contrato + nome do projeto". O pedido foi
--   atendido so no caminho MANUAL (src/features/projects/task-title.ts, o
--   titulo sugerido pelo formulario) e nao chegou ao caminho automatico. Desde
--   entao os dois caminhos nomeavam de formas diferentes, e a maioria dos
--   cartoes nasce pelo automatico.
--
-- A REGRA, AGORA EM UM LUGAR SO
--   `default_task_title` e a traducao da funcao de mesmo nome do frontend,
--   inclusive na parte que evita repetir o numero quando o nome do projeto ja
--   comeca por ele (ha projetos importados do base44 batizados assim).
--
--   ELA DEGRADA PARA O COMPORTAMENTO ANTIGO SEM PRECISAR DE EXCECAO: quando o
--   contrato nao informa nome de projeto, o proprio projeto ja nasce com o nome
--   do cliente (a cadeia de coalesce logo acima, que vem da Contracts.jsx:548).
--   Ou seja, contrato sem nome de projeto continua produzindo o cartao com o
--   nome do cliente — que era o certo nesses casos.
--
-- O QUE ESTA MIGRATION NAO FAZ
--   Nao renomeia cartao nenhum ja existente. Os que estao no ar sao corrigidos
--   a parte, comparando com o padrao exato antes de tocar, para nao reescrever
--   titulo que alguem editou a mao.

create or replace function public.default_task_title(
  p_contract_number text,
  p_project_name text
)
returns text
language sql
immutable
set search_path = ''
as $BODY$
  select case
    /* Sem nome de projeto sobra o numero. Estado improvavel: `projects.name` e
       not null e nasce de uma cadeia de coalesce. Defesa em profundidade. */
    when coalesce(btrim(p_project_name), '') = '' then coalesce(btrim(p_contract_number), '')
    /* Projeto sem contrato fica so com o nome, como no frontend. */
    when coalesce(btrim(p_contract_number), '') = '' then btrim(p_project_name)
    /* Nome que JA comeca pelo numero nao ganha o numero duas vezes. */
    when starts_with(lower(btrim(p_project_name)), lower(btrim(p_contract_number)))
      then btrim(p_project_name)
    else btrim(p_contract_number) || ' - ' || btrim(p_project_name)
  end;
$BODY$;

comment on function public.default_task_title(text, text) is
  'O titulo padrao do cartao do Fluxo do Projeto: numero do contrato + nome do projeto, a pedido do escritorio (0111). Traducao de src/features/projects/task-title.ts, que faz a mesma conta para o titulo SUGERIDO no formulario - as duas precisam concordar, senao criar pelo contrato e criar a mao voltam a nomear diferente. Nao repete o numero quando o nome do projeto ja comeca por ele.';

grant execute on function public.default_task_title(text, text) to authenticated, service_role;

-- A funcao da 0078, com UMA linha diferente -----------------------------------

create or replace function public.approve_contract_proposal(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_contract public.contracts;
  v_client_name text;
  v_project public.projects;
  v_project_id uuid;
  v_project_name text;
  v_status_changed boolean := false;
  v_project_created boolean := false;
  v_task_created boolean := false;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Autorizacao ANTES de qualquer leitura: quem nao pode aprovar tambem nao
  -- precisa descobrir, pela mensagem de erro, se um id de contrato existe.
  if not public.can_edit_menu('contracts') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;

  -- Contracts.jsx:420. O projeto nasce vinculado ao cliente; sem ele nao ha o
  -- que criar.
  if v_contract.client_id is null then
    raise exception 'client_required' using errcode = 'P0001';
  end if;

  select c.name into v_client_name
  from public.clients c
  where c.id = v_contract.client_id
    and c.tenant_id = v_tenant_id;

  if v_contract.status <> 'approved' then
    update public.contracts set status = 'approved' where id = v_contract.id;
    v_status_changed := true;
  end if;

  -- Anti-duplicidade (Contracts.jsx:437-441), pelo lado certo: quem aponta e o
  -- PROJETO. Sem ordenacao arbitraria - o mais antigo e o que a tela mostraria
  -- como "o projeto deste contrato".
  select * into v_project
  from public.projects
  where contract_id = v_contract.id
    and tenant_id = v_tenant_id
  order by created_at, id
  limit 1;

  if found then
    -- Reaproveita: volta a aparecer na lista e recebe os prazos e a localizacao
    -- do contrato, como no original (443-455).
    update public.projects
    set visible_in_list = true,
        status = 'in_development',
        city = coalesce(v_contract.site_city, city),
        state = coalesce(v_contract.site_state, state),
        layout_study_days = coalesce(v_contract.layout_study_days, layout_study_days),
        renderings_days = coalesce(v_contract.renderings_days, renderings_days),
        legal_permit_days = coalesce(v_contract.legal_permit_days, legal_permit_days),
        construction_docs_days = coalesce(v_contract.construction_docs_days, construction_docs_days),
        engineering_docs_days = coalesce(v_contract.engineering_docs_days, engineering_docs_days)
    where id = v_project.id;

    v_project_id := v_project.id;
    v_project_name := v_project.name;
  else
    insert into public.projects (
      tenant_id, name, client_id, contract_id, project_type,
      city, state,
      layout_study_days, renderings_days, legal_permit_days,
      construction_docs_days, engineering_docs_days,
      status, current_phase, visible_in_list, start_date
    ) values (
      v_tenant_id,
      -- Contracts.jsx:548: o nome informado no contrato, e o do cliente como
      -- reserva. nullif porque o formulario grava '' quando o campo fica vazio.
      coalesce(nullif(btrim(v_contract.project_name), ''), v_client_name, v_contract.contract_number),
      v_contract.client_id,
      v_contract.id,
      -- Item 1 do cabecalho: mesmo enum nos dois lados, copia direta.
      v_contract.contract_type,
      v_contract.site_city,
      v_contract.site_state,
      v_contract.layout_study_days,
      v_contract.renderings_days,
      v_contract.legal_permit_days,
      v_contract.construction_docs_days,
      v_contract.engineering_docs_days,
      'in_development',
      'not_started',
      true,
      coalesce(v_contract.start_date, v_contract.signature_date)
    )
    returning id, name into v_project_id, v_project_name;

    v_project_created := true;
  end if;

  -- O CARTAO DO FLUXO DO PROJETO. Uma tarefa por projeto neste gesto, como no
  -- original (472-476): se ja ha qualquer tarefa, nenhuma nasce.
  if not exists (
    select 1 from public.tasks
    where project_id = v_project_id and tenant_id = v_tenant_id
  ) then
    insert into public.tasks (
      tenant_id, title, project_id, phase, status, priority, description
    ) values (
      v_tenant_id,
      -- A UNICA LINHA QUE MUDA EM RELACAO A 0078. Era
      -- `contract_number || ' - ' || client_name`; passa a ser o nome do
      -- PROJETO, a pedido do escritorio. Ver o cabecalho.
      public.default_task_title(v_contract.contract_number, v_project_name),
      v_project_id,
      'not_started',
      'not_started',
      'high',
      'Contrato: ' || v_contract.contract_number
    );

    v_task_created := true;
  end if;

  return jsonb_build_object(
    'outcome', case when v_project_created then 'created' else 'reused' end,
    'contractId', v_contract.id,
    'statusChanged', v_status_changed,
    'projectId', v_project_id,
    'projectName', v_project_name,
    'taskCreated', v_task_created
  );
end;
$$;

comment on function public.approve_contract_proposal(uuid) is
  'Aprova a proposta e cria, na MESMA transacao, o projeto em Projetos e o cartao inicial no Fluxo do Projeto (gesto de Contracts.jsx:416-599 do original, que ficou fora do porte do modulo 4). Exige cliente vinculado. Reaproveita o projeto que ja aponta para o contrato em vez de criar um segundo, e cria a tarefa apenas quando o projeto ainda nao tem nenhuma. O titulo do cartao sai de default_task_title (numero do contrato + nome do projeto, 0111) - ate a 0110 era o nome do CLIENTE, copiado do original. Devolve jsonb com outcome created | reused, contractId, statusChanged, projectId, projectName e taskCreated. IDEMPOTENTE: chamar duas vezes nao duplica nada e nao reescreve o status de contrato ja aprovado. NAO rebobina tarefa existente para "nao iniciado", que e o que o original faz ao reaprovar e apagaria o andamento de um cartao ja em Layout ou em Obra. project_type e copiado direto porque projects.project_type e contracts.contract_type usam o mesmo enum. SECURITY DEFINER porque escreve em projects e tasks em nome de quem tem o menu contracts e pode nao ter projects nem project_flow - por isso confere can_edit_menu(contracts) e o tenant do JWT por dentro. Erros P0001 com mensagem estavel: not_authorized, contract_not_found, client_required.';

revoke all on function public.approve_contract_proposal(uuid) from public, anon;
grant execute on function public.approve_contract_proposal(uuid) to authenticated;
