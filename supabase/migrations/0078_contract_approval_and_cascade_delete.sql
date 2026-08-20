-- Modulo 4/5 - aprovar proposta cria o projeto e o cartao do Fluxo; excluir
-- contrato leva junto o que nasceu dele, e SO isso.
--
-- A DIVIDA QUE ESTA MIGRATION PAGA
--   src/features/contracts/components/Contracts.tsx registra em comentario:
--   "A criacao automatica de projeto e tarefa ao aprovar (Contracts.jsx:416-599)
--   -> MODULO 5, junto com projects e tasks. Aprovar aqui muda o status e nada
--   mais." O modulo 5 subiu e ninguem voltou aqui: hoje aprovar uma proposta nao
--   cria projeto nenhum, e nenhum cartao aparece no Fluxo do Projeto. Nao e
--   feature nova - e comportamento do original que ficou para tras.
--
--   A exclusao em cascata idem: Contracts.jsx:682-720 apaga parcelas, tarefas e
--   projeto antes de apagar o contrato. Aqui a exclusao do contrato simplesmente
--   FALHA quando existe qualquer um deles, porque as FK sao no action.
--
-- POR QUE FUNCAO NO BANCO, E NAO TRES CHAMADAS DA TELA
--   O original faz de 3 a 5 gravacoes soltas do navegador em cada gesto, e a
--   falha no meio de qualquer uma deixa estado pela metade: contrato aprovado sem
--   projeto, projeto criado sem o cartao, contrato apagado com as parcelas ja
--   apagadas. E o mesmo motivo da 0044, da 0067 e da 0045 - aqui as escritas sao
--   uma transacao porque sao uma funcao.
--
-- POR QUE SECURITY DEFINER
--   Quem aprova proposta tem o menu 'contracts' e NAO precisa ter 'projects' nem
--   'project_flow'. Exigir os tres travaria o gesto para o time comercial, que e
--   justamente quem aprova. Mesmo desenho de mark_negotiation_won (0067):
--   SECURITY DEFINER passa por cima de TODA a RLS, entao a autorizacao e
--   conferida AQUI DENTRO (can_edit_menu('contracts')) e todo acesso a linha usa
--   tenant_id = auth_tenant_id() explicito.
--
-- ============================================================================
-- 1. APROVAR PROPOSTA
-- ============================================================================
--
-- A REGRA REPRODUZIDA, de projeto-original/src/pages/Contracts.jsx:416-599
--   Ao mudar o status para Aprovado (e so quando ele ainda NAO era Aprovado):
--   exige cliente vinculado (420); reaproveita o projeto que ja aponta para o
--   contrato, se houver, em vez de criar um segundo (437-441); senao cria o
--   projeto com o nome do contrato ou o do cliente (548); e cria UMA tarefa
--   chamada "<numero> - <cliente>" na fase inicial (577-585).
--
-- O QUE MUDA, E POR QUE
--
--   1. project_type NAO E DERIVADO DE TEXTO. O original traduz o rotulo do
--      contrato para o rotulo do projeto com uma cadeia de ternarios (553-556).
--      Aqui as duas colunas usam o MESMO enum (`contract_type`), entao a copia e
--      direta e nao ha grafia para errar.
--
--   2. TAREFA EXISTENTE NAO E REBOBINADA. O original, ao reaprovar, forca a
--      tarefa de volta para "Nao iniciado" (485-490 e 528-533) - o que apagaria o
--      andamento de um cartao que ja esta em Layout ou em Obra. Aqui a tarefa que
--      ja existe fica como esta, e a funcao devolve `taskCreated: false` para a
--      tela dizer o que aconteceu. Fiel ao original em criar; nao fiel em
--      desfazer trabalho.
--
--   3. total_value NAO E COPIADO para o projeto, porque o original tambem nao
--      copia. A coluna existe em projects e continua nula: preenche-la aqui faria
--      o valor do projeto nascer de uma regra que ninguem escreveu.
--
--   4. IDEMPOTENTE. Chamar duas vezes nao cria dois projetos nem duas tarefas, e
--      nao reescreve o status de um contrato que ja estava Aprovado. FOR UPDATE
--      no contrato serializa dois cliques ou duas abas, que e o que torna real a
--      conferencia de "ja existe projeto".
--
-- ============================================================================
-- 2. EXCLUIR CONTRATO
-- ============================================================================
--
-- O RECORTE, DECIDIDO PELO USUARIO
--   "deve deletar apenas os projetos relacionados ao contrato e nao todos os
--   projetos". A funcao so alcanca projects.contract_id = o contrato em questao,
--   e o LEAD nao e tocado: cliente e negociacao ficam de pe, por pedido explicito
--   ("menos o lead").
--
--   VAI JUNTO (nasceu do contrato ou do projeto dele):
--     - as parcelas do contrato (accounts_receivable.contract_id);
--     - o projeto e, por cascade ja existente, tasks, project_checklist_items,
--       project_diary_entries, project_site_visits, project_issues,
--       project_land_types e project_purposes.
--
--   NAO VAI, E BLOQUEIA A EXCLUSAO (decisao do usuario: "bloquear se houver
--   algum"): atividade da equipe, conta a pagar, orcamento do cliente e pino do
--   mapa. Sao registros de trabalho e de dinheiro com valor proprio, que nao
--   nasceram do contrato - e as FK deles ja sao `no action` de proposito. Em vez
--   de apagar em silencio ou estourar um 23503 com nome de constraint, a funcao
--   RECUSA e devolve a lista do que impede, para a tela dizer o que precisa ser
--   resolvido antes.
--
--   PARCELA JA PAGA BLOQUEIA (decisao do usuario). O original apaga todas as
--   parcelas do contrato sem olhar o status (686-690). No dado real deste
--   escritorio sao 185 parcelas pagas somando R$ 1.888.979,83: seguir o original
--   deixaria um clique apagar pagamento ja recebido, sem recuperacao. Para apagar
--   assim mesmo, a parcela precisa ser desfeita antes, na mao.
--
-- LIMITE DECLARADO: ARQUIVO NO STORAGE
--   Apagar o projeto apaga as LINHAS de project_diary_files por cascade, mas nao
--   os objetos no bucket project-diary-files - banco nao alcanca Storage. Mesma
--   limitacao ja registrada na 0074. Quem varre e a tela, antes de chamar esta
--   funcao; o que sobrar fica orfao no bucket e nao e alcancavel por nenhuma
--   tela, porque o caminho comeca pelo tenant_id e o indice dele morreu junto.
--
-- CONFERIR ANTES DE APAGAR
--   `p_confirm => false` (o padrao) NAO APAGA NADA: devolve o que seria apagado e
--   o que impede. E o que alimenta o dialogo de confirmacao, para a pessoa ver o
--   tamanho do estrago antes de decidir. So `p_confirm => true` escreve.

-- ============================================================================

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
      v_contract.contract_number || ' - ' || coalesce(v_client_name, 'Cliente'),
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
  'Aprova a proposta e cria, na MESMA transacao, o projeto em Projetos e o cartao inicial no Fluxo do Projeto (gesto de Contracts.jsx:416-599 do original, que ficou fora do porte do modulo 4). Exige cliente vinculado. Reaproveita o projeto que ja aponta para o contrato em vez de criar um segundo, e cria a tarefa apenas quando o projeto ainda nao tem nenhuma. Devolve jsonb com outcome created | reused, contractId, statusChanged, projectId, projectName e taskCreated. IDEMPOTENTE: chamar duas vezes nao duplica nada e nao reescreve o status de contrato ja aprovado. NAO rebobina tarefa existente para "nao iniciado", que e o que o original faz ao reaprovar e apagaria o andamento de um cartao ja em Layout ou em Obra. project_type e copiado direto porque projects.project_type e contracts.contract_type usam o mesmo enum. SECURITY DEFINER porque escreve em projects e tasks em nome de quem tem o menu contracts e pode nao ter projects nem project_flow - por isso confere can_edit_menu(contracts) e o tenant do JWT por dentro. Erros P0001 com mensagem estavel: not_authorized, contract_not_found, client_required.';

revoke all on function public.approve_contract_proposal(uuid) from public, anon;
grant execute on function public.approve_contract_proposal(uuid) to authenticated;

-- ============================================================================

create or replace function public.delete_contract_cascade(
  p_contract_id uuid,
  p_confirm boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_contract public.contracts;
  v_project_ids uuid[];
  v_paid_count integer;
  v_paid_total numeric;
  v_activities integer;
  v_payables integer;
  v_budgets integer;
  v_map_pins integer;
  v_other_receivables integer;
  v_blocks jsonb := '[]'::jsonb;
  v_receivables integer;
  v_tasks integer;
  v_diary integer;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

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

  -- SO OS PROJETOS DESTE CONTRATO. O recorte e este e nao ha outro: nenhuma
  -- consulta desta funcao varre projects por cliente, por nome ou por periodo.
  select coalesce(array_agg(id), '{}')
  into v_project_ids
  from public.projects
  where contract_id = v_contract.id
    and tenant_id = v_tenant_id;

  -- O que seria apagado, para o dialogo de confirmacao mostrar antes.
  select count(*) into v_receivables
  from public.accounts_receivable
  where contract_id = v_contract.id and tenant_id = v_tenant_id;

  select count(*) into v_tasks
  from public.tasks
  where project_id = any(v_project_ids) and tenant_id = v_tenant_id;

  select count(*) into v_diary
  from public.project_diary_entries
  where project_id = any(v_project_ids) and tenant_id = v_tenant_id;

  -- BLOQUEIO 1: parcela ja paga. Ver o cabecalho.
  select count(*), coalesce(sum(value), 0)
  into v_paid_count, v_paid_total
  from public.accounts_receivable
  where contract_id = v_contract.id
    and tenant_id = v_tenant_id
    and status = 'paid';

  if v_paid_count > 0 then
    v_blocks := v_blocks || jsonb_build_object(
      'kind', 'paid_receivables', 'count', v_paid_count, 'total', v_paid_total);
  end if;

  -- BLOQUEIO 2: o que tem valor proprio e nao nasceu do contrato.
  select count(*) into v_activities
  from public.activities
  where project_id = any(v_project_ids) and tenant_id = v_tenant_id;

  select count(*) into v_payables
  from public.accounts_payable
  where project_id = any(v_project_ids) and tenant_id = v_tenant_id;

  select count(*) into v_budgets
  from public.budget_checklists
  where project_id = any(v_project_ids) and tenant_id = v_tenant_id;

  select count(*) into v_map_pins
  from public.map_properties
  where project_id = any(v_project_ids) and tenant_id = v_tenant_id;

  -- Parcela que aponta para o PROJETO mas nasceu de outro contrato (ou de
  -- nenhum): e dinheiro que esta exclusao nao tem mandato para apagar.
  select count(*) into v_other_receivables
  from public.accounts_receivable
  where project_id = any(v_project_ids)
    and tenant_id = v_tenant_id
    and (contract_id is distinct from v_contract.id);

  if v_activities > 0 then
    v_blocks := v_blocks || jsonb_build_object('kind', 'activities', 'count', v_activities);
  end if;
  if v_payables > 0 then
    v_blocks := v_blocks || jsonb_build_object('kind', 'payables', 'count', v_payables);
  end if;
  if v_budgets > 0 then
    v_blocks := v_blocks || jsonb_build_object('kind', 'budgets', 'count', v_budgets);
  end if;
  if v_map_pins > 0 then
    v_blocks := v_blocks || jsonb_build_object('kind', 'map_pins', 'count', v_map_pins);
  end if;
  if v_other_receivables > 0 then
    v_blocks := v_blocks || jsonb_build_object(
      'kind', 'other_receivables', 'count', v_other_receivables);
  end if;

  if jsonb_array_length(v_blocks) > 0 then
    return jsonb_build_object(
      'outcome', 'blocked',
      'contractId', v_contract.id,
      'blocks', v_blocks,
      'projects', coalesce(array_length(v_project_ids, 1), 0),
      'receivables', v_receivables,
      'tasks', v_tasks,
      'diaryEntries', v_diary
    );
  end if;

  if not p_confirm then
    return jsonb_build_object(
      'outcome', 'preview',
      'contractId', v_contract.id,
      'blocks', v_blocks,
      'projects', coalesce(array_length(v_project_ids, 1), 0),
      'receivables', v_receivables,
      'tasks', v_tasks,
      'diaryEntries', v_diary
    );
  end if;

  -- A ORDEM E A DO ORIGINAL (682-720), e ela importa: as parcelas e os projetos
  -- apontam para o contrato, entao o contrato so pode cair depois deles.
  delete from public.accounts_receivable
  where contract_id = v_contract.id and tenant_id = v_tenant_id;

  -- O cascade de projects leva tasks, project_checklist_items,
  -- project_diary_entries, project_site_visits, project_issues,
  -- project_land_types e project_purposes.
  delete from public.projects
  where id = any(v_project_ids) and tenant_id = v_tenant_id;

  delete from public.contracts
  where id = v_contract.id and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'outcome', 'deleted',
    'contractId', v_contract.id,
    'blocks', '[]'::jsonb,
    'projects', coalesce(array_length(v_project_ids, 1), 0),
    'receivables', v_receivables,
    'tasks', v_tasks,
    'diaryEntries', v_diary
  );
end;
$$;

comment on function public.delete_contract_cascade(uuid, boolean) is
  'Exclui o contrato e o que nasceu dele, em UMA transacao (gesto de Contracts.jsx:682-720 do original). Alcanca APENAS os projetos com contract_id = este contrato - decisao explicita do usuario - e NAO toca no lead: cliente e negociacao ficam de pe. Vai junto: as parcelas do contrato, o projeto e o que ja cascateia dele (tasks, checklist, diario, visitas, pendencias, tipos de terreno e finalidades). RECUSA, devolvendo outcome blocked com a lista do que impede, quando ha parcela ja PAGA (o original apaga sem olhar o status, e neste banco sao 185 parcelas pagas somando quase R$ 1,9 mi) ou quando o projeto tem atividade da equipe, conta a pagar, orcamento do cliente, pino do mapa ou parcela de outro contrato - registros de trabalho e de dinheiro com valor proprio, cujas FK ja sao no action de proposito. p_confirm = false (padrao) NAO APAGA NADA: devolve outcome preview com as contagens, que e o que alimenta o dialogo de confirmacao. Devolve jsonb com outcome preview | blocked | deleted, contractId, blocks, projects, receivables, tasks e diaryEntries. LIMITE: os objetos do bucket project-diary-files nao caem junto - banco nao alcanca Storage (mesma limitacao da 0074). SECURITY DEFINER porque apaga em projects, tasks e accounts_receivable em nome de quem tem o menu contracts; confere can_edit_menu(contracts) e o tenant do JWT por dentro. Erros P0001: not_authorized, contract_not_found.';

revoke all on function public.delete_contract_cascade(uuid, boolean) from public, anon;
grant execute on function public.delete_contract_cascade(uuid, boolean) to authenticated;
