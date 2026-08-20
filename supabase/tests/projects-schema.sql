-- Teste de schema do modulo 5 (Projetos) - projects, tasks, checklists e a view
-- project_progress.
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio, quatro policies,
--   WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios, colaborador afastado sem leitura,
--   escrita presa ao menu 'projects' ou 'project_flow') estao em
--   supabase/tests/pattern-invariants.sql e cobrem as seis tabelas desde que
--   elas entraram em pattern_tables. NADA disso se repete aqui.
--
--   Aqui fica somente a regra de negocio listada em docs/SCHEMA-PLAN.md, secao
--   "Modulo 5 - Regra de negocio para o teste proprio": as FK compostas de
--   contrato e dos dois responsaveis, tarefa que nunca esta em finished, data de
--   conclusao amarrada ao status, horas nao negativas, prazo nao anterior ao
--   inicio, item obrigatorio concluido com data, e a view project_progress -
--   inclusive o caso 8.3, que afirma que ela respeita a RLS de quem consulta.
--
--   A secao 10 acrescenta o status operacional da tarefa (migration 0074), e ela
--   afirma sobretudo o que o banco ACEITA: a decisao da fatia 3 foi nao escrever
--   o check de "so nestas fases", e ausencia de restricao precisa de teste para
--   nao ser "consertada" depois. Ver o cabecalho da secao.
--
-- COMO RODAR
--   npm run test:schema:projects
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23503 FK violada.
--   Nos casos 8.x o observado e o VALOR devolvido, e nao contagem de linhas:
--   view que devolve o numero errado devolve uma linha do mesmo jeito.
--   Casos marcados CONTROLE afirmam o que precisa CONTINUAR possivel. Sem eles,
--   um check escrito ao contrario - que recusasse tudo - passaria com nota
--   cheia, e nota cheia e o que faz ninguem reler o teste.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug projects-schema-test-*), e nenhuma contagem e absoluta sobre
--   tabela de negocio - o escritorio de teste do seed tem dado permanente.

begin;

-- Instrumentacao --------------------------------------------------------------

create temp table res (
  seq serial primary key, caso text, descricao text, expected text, observed text
) on commit drop;

create or replace function pg_temp.try(p_sql text)
returns text language plpgsql as $$
declare v_rows bigint; v_state text;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    return 'ERR:' || v_state;
  end;
end;
$$;

create or replace function pg_temp.chk(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
begin
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, pg_temp.try(p_sql));
end;
$$;

-- Sonda de VALOR, para os casos da view: pg_temp.try devolve contagem de linhas,
-- e uma view que calcule o percentual errado devolve UMA linha do mesmo jeito.
create or replace function pg_temp.val(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_state text;
begin
  begin
    execute p_sql into v_out;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v_out, '<null>'));
end;
$$;

-- Sonda de valor EXECUTANDO COMO OUTRO PAPEL, com claims de JWT. Igual a de
-- supabase/tests/pattern-invariants.sql; existe aqui para o caso 8.3, que so faz
-- sentido com a RLS ligada - como postgres e dono das tabelas, ele passa por
-- cima dela e a view pareceria isolada mesmo se nao fosse.
create or replace function pg_temp.val_as(p_caso text, p_desc text, p_expected text,
                                          p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_out text; v_state text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql into v_out;
    perform set_config('role', 'postgres', true);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v_out, '<null>'));
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'd1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'd2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  'd1000000-0000-4000-8000-000000000001'::uuid as user_a,
  'd1100000-0000-4000-8000-000000000001'::uuid as commercial_a,
  'd1100000-0000-4000-8000-000000000002'::uuid as operational_a,
  'd2100000-0000-4000-8000-000000000001'::uuid as collaborator_b,
  'd1300000-0000-4000-8000-000000000001'::uuid as client_a,
  'd2300000-0000-4000-8000-000000000001'::uuid as client_b,
  'd1400000-0000-4000-8000-000000000001'::uuid as contract_a,
  'd2400000-0000-4000-8000-000000000001'::uuid as contract_b,
  -- Projeto sem tarefa nenhuma (caso 8.1) e projeto com tarefas (caso 8.2).
  'd1500000-0000-4000-8000-000000000001'::uuid as project_empty_a,
  'd1500000-0000-4000-8000-000000000002'::uuid as project_full_a,
  -- Projeto so para o caso do 'Aguardando Cliente' (8.5 a 8.8). Separado do
  -- project_full_a porque la a fase mais avancada e Projeto Legal, e 70 esconde
  -- se a fase de espera pontua ou nao.
  'd1500000-0000-4000-8000-000000000003'::uuid as project_waiting_a,
  'd2500000-0000-4000-8000-000000000001'::uuid as project_b,
  'd1600000-0000-4000-8000-000000000001'::uuid as task_legal_a,
  'd1600000-0000-4000-8000-000000000002'::uuid as task_briefing_a,
  'd1600000-0000-4000-8000-000000000003'::uuid as task_waiting_a,
  -- Tarefa SEM projeto, exclusiva da secao 7. Sem projeto, nenhuma linha de
  -- project_progress a soma — que e a unica forma de a secao 7 escrever a
  -- vontade sem mexer nos numeros que a secao 8 afirma.
  'd1600000-0000-4000-8000-000000000004'::uuid as task_checklist_a,
  -- As duas tarefas COM tag operacional da secao 10, uma em cada escritorio.
  -- Tambem sem projeto, pela mesma razao da de cima.
  'd1600000-0000-4000-8000-000000000005'::uuid as task_tag_a,
  'd2600000-0000-4000-8000-000000000001'::uuid as task_tag_b,
  -- As duas tarefas do projeto de espera (8.5 a 8.8).
  'd1600000-0000-4000-8000-000000000006'::uuid as task_waiting_only_a,
  'd1600000-0000-4000-8000-000000000007'::uuid as task_layout_a;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ((select user_a from ids), '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'projects-schema-a@example.test', now(), now());

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Projects Schema Test A', 'projects-schema-test-a'),
  ((select tenant_b from ids), 'Projects Schema Test B', 'projects-schema-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select user_a from ids), 'member');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select commercial_a from ids), (select tenant_a from ids), (select user_a from ids),
   'Fernando Costa', 'director', 'projects-schema-a@example.test', 'active'),
  ((select operational_a from ids), (select tenant_a from ids), null,
   'Larissa Andrade', 'architect', 'projects-schema-op@example.test', 'active'),
  ((select collaborator_b from ids), (select tenant_b from ids), null,
   'Rogerio Lemos', 'architect', 'projects-schema-b@example.test', 'active');

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select client_a from ids), (select tenant_a from ids), 'Helena Vasconcelos',
   '(62) 99811-3300', 'Goiania', 'GO'),
  ((select client_b from ids), (select tenant_b from ids), 'Otavio Bandeira',
   '(62) 99811-4400', 'Anapolis', 'GO');

insert into public.contracts (id, tenant_id, contract_number, contract_type, total_value, client_id) values
  ((select contract_a from ids), (select tenant_a from ids), 'CTR-2026-501', 'architecture',
   240000, (select client_a from ids)),
  ((select contract_b from ids), (select tenant_b from ids), 'CTR-2026-502', 'architecture',
   180000, (select client_b from ids));

-- Os tres projetos do cenario da view (secao 8): um sem tarefa nenhuma, um com
-- tres tarefas, e um no OUTRO escritorio.
insert into public.projects (id, tenant_id, name, project_type) values
  ((select project_empty_a from ids), (select tenant_a from ids), 'Casa sem tarefa', 'architecture'),
  ((select project_full_a from ids), (select tenant_a from ids), 'Residencia Portal do Sol', 'architecture'),
  ((select project_waiting_a from ids), (select tenant_a from ids), 'Casa em espera', 'architecture'),
  ((select project_b from ids), (select tenant_b from ids), 'Galpao Distrito Industrial', 'architecture');

-- Projeto Legal (70%), Briefing (12%) e Aguardando Cliente (sem percentual
-- proprio). Nenhuma concluida, de proposito - ver o comentario da secao 8.
insert into public.tasks (id, tenant_id, title, project_id, phase) values
  ((select task_legal_a from ids), (select tenant_a from ids), 'Aprovar projeto legal',
   (select project_full_a from ids), 'legal_permit'),
  ((select task_briefing_a from ids), (select tenant_a from ids), 'Levantar briefing',
   (select project_full_a from ids), 'briefing'),
  ((select task_waiting_a from ids), (select tenant_a from ids), 'Aguardar retorno do cliente',
   (select project_full_a from ids), 'awaiting_client'),
  ((select task_checklist_a from ids), (select tenant_a from ids), 'Tarefa avulsa da secao 7',
   null, 'briefing');

-- 1. contract_id: FK composta para contracts -----------------------------------
--
-- A ligacao contrato <-> projeto vive de um lado so, aqui (contracts nao tem
-- project_id). Referencia por id sozinho deixaria o projeto de um escritorio
-- apontar para o contrato de outro: a RLS filtra o que se le, nao o que se
-- aponta.

select pg_temp.chk('1.1', 'contrato de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.projects (tenant_id, name, project_type, contract_id)
  values (%L, 'Residencia Alphaville', 'architecture', %L)
$q$, (select tenant_a from ids), (select contract_b from ids)));

select pg_temp.chk('1.2', 'CONTROLE: contrato do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.projects (tenant_id, name, project_type, contract_id)
  values (%L, 'Residencia Alphaville', 'architecture', %L)
$q$, (select tenant_a from ids), (select contract_a from ids)));

-- 2. Os dois responsaveis, cada um com sua FK composta ---------------------------
--
-- commercial_responsible_id (quem vendeu) e operational_responsible_id (quem
-- executa) sao papeis distintos e colunas distintas. Ambos apontam para
-- collaborators por (id, tenant_id).

select pg_temp.chk('2.1', 'responsavel comercial de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.projects (tenant_id, name, project_type, commercial_responsible_id)
  values (%L, 'Casa Jardim Botanico', 'architecture', %L)
$q$, (select tenant_a from ids), (select collaborator_b from ids)));

select pg_temp.chk('2.2', 'responsavel operacional de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.projects (tenant_id, name, project_type, operational_responsible_id)
  values (%L, 'Casa Jardim Botanico', 'architecture', %L)
$q$, (select tenant_a from ids), (select collaborator_b from ids)));

select pg_temp.chk('2.3', 'CONTROLE: os dois responsaveis do MESMO escritorio, e diferentes entre si', 'OK:1', format($q$
  insert into public.projects (tenant_id, name, project_type,
                               commercial_responsible_id, operational_responsible_id)
  values (%L, 'Casa Jardim Botanico', 'architecture', %L, %L)
$q$, (select tenant_a from ids), (select commercial_a from ids), (select operational_a from ids)));

-- 3. tasks.phase nunca recebe finished -----------------------------------------
--
-- O enum project_phase e compartilhado. Fase que nao existe no kanban de tarefas
-- esconderia a tarefa de todas as colunas: ela sumiria da tela sem ter sido
-- apagada.

select pg_temp.chk('3.1', 'tarefa em fase finished e recusada', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, title, phase)
  values (%L, 'Entrega final', 'finished')
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.2', 'CONTROLE: o PROJETO aceita a fase finished', 'OK:1', format($q$
  insert into public.projects (tenant_id, name, project_type, current_phase)
  values (%L, 'Sobrado Setor Bueno', 'architecture', 'finished')
$q$, (select tenant_a from ids)));

-- 4. completion_date amarrada ao status, nos dois sentidos ----------------------

select pg_temp.chk('4.1', 'data de conclusao em tarefa em andamento e recusada', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, title, status, completion_date)
  values (%L, 'Estudo de layout', 'in_progress', '2026-04-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.2', 'tarefa concluida SEM data de conclusao e recusada', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, title, status)
  values (%L, 'Estudo de layout', 'completed')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.3', 'CONTROLE: concluida COM data entra', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, status, completion_date)
  values (%L, 'Estudo de layout', 'completed', '2026-04-10')
$q$, (select tenant_a from ids)));

-- 5. Horas nao negativas --------------------------------------------------------
--
-- Hora negativa entraria no RelatorioProdutividade do modulo 6 abatendo hora
-- trabalhada de verdade.

select pg_temp.chk('5.1', 'horas gastas negativas sao recusadas', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, title, spent_hours)
  values (%L, 'Reuniao de briefing', -1)
$q$, (select tenant_a from ids)));

select pg_temp.chk('5.2', 'CONTROLE: zero horas gastas e estimativa positiva entram', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, estimated_hours, spent_hours)
  values (%L, 'Reuniao de briefing', 8, 0)
$q$, (select tenant_a from ids)));

-- 6. Prazo nao anterior ao inicio -----------------------------------------------

select pg_temp.chk('6.1', 'prazo anterior ao inicio e recusado', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, title, start_date, due_date)
  values (%L, 'Projeto legal', '2026-05-10', '2026-05-09')
$q$, (select tenant_a from ids)));

-- Comecar e entregar no mesmo dia e caso real: reuniao, revisao rapida.
select pg_temp.chk('6.2', 'CONTROLE: inicio e prazo no mesmo dia entram', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, start_date, due_date)
  values (%L, 'Projeto legal', '2026-05-10', '2026-05-10')
$q$, (select tenant_a from ids)));

-- 7. Item de checklist: o que a data de conclusao pode e nao pode ---------------
--
-- ESTA SECAO MUDOU DE SENTIDO NA MIGRATION 0060, e o motivo importa mais que os
-- casos: o check que exigia data em item obrigatorio concluido CAIU, porque o
-- base44 nao guarda essa data e 1.178 itens reais chegam so com a bandeira.
-- `completed_at` nulo passa a significar "concluido, e o quando nao foi
-- registrado". O caminho contrario continua proibido.
--
-- OS INSERTS DESTA SECAO USAM TAREFA PROPRIA E SEM PROJETO (`task_checklist_a`).
-- Antes usavam `task_legal_a`: enquanto 7.1 esperava RECUSA isso era inofensivo,
-- mas no instante em que ela passou a INSERIR, o progresso da secao 8 mudou
-- junto e 8.2 quebrou sem ter nada a ver com o assunto. Tarefa sem projeto nao
-- entra em project_progress, entao a secao 7 escreve a vontade. Foi o mesmo
-- acidente da suite de orcamento — secao que escreve no que outra conta.

select pg_temp.chk('7.1', 'item obrigatorio concluido SEM data entra (0060)', 'OK:1', format($q$
  insert into public.task_checklist_items (tenant_id, task_id, title, is_required, is_completed)
  values (%L, %L, 'Assinatura do responsavel tecnico', true, true)
$q$, (select tenant_a from ids), (select task_checklist_a from ids)));

-- O item OPCIONAL sempre pode. Sem este caso, 7.1 passaria igual se o check
-- tivesse sido derrubado por engano para todo item.
select pg_temp.chk('7.2', 'CONTROLE: item OPCIONAL concluido sem data entra', 'OK:1', format($q$
  insert into public.task_checklist_items (tenant_id, task_id, title, is_required, is_completed)
  values (%L, %L, 'Anexar foto do terreno', false, true)
$q$, (select tenant_a from ids), (select task_checklist_a from ids)));

-- O QUE A 0060 NAO AFROUXOU, e este caso e a razao de a secao continuar
-- existindo: data sem conclusao segue recusada. Item com `completed_at` e
-- `is_completed = false` seria uma linha que diz "nao concluido" e "concluido
-- em tal dia" ao mesmo tempo.
select pg_temp.chk('7.3', 'data de conclusao SEM conclusao continua recusada', 'ERR:23514', format($q$
  insert into public.task_checklist_items (tenant_id, task_id, title, is_required, is_completed, completed_at)
  values (%L, %L, 'Item incoerente', true, false, now())
$q$, (select tenant_a from ids), (select task_checklist_a from ids)));

-- CONTROLE do 7.3: a mesma linha, coerente, entra. Sem ele o ERR:23514 acima
-- passaria tambem se a tarefa nao existisse ou o tenant estivesse errado.
select pg_temp.chk('7.4', 'CONTROLE: concluido COM data entra', 'OK:1', format($q$
  insert into public.task_checklist_items (tenant_id, task_id, title, is_required, is_completed, completed_at)
  values (%L, %L, 'Item coerente', true, true, now())
$q$, (select tenant_a from ids), (select task_checklist_a from ids)));

-- 8. A view project_progress ----------------------------------------------------
--
-- A REGRA MUDOU DUAS VEZES, e os casos desta secao existem para nenhuma das
-- duas versoes antigas voltar sem derrubar teste:
--
--   0034  escala por fase MAIS o atalho "QUALQUER tarefa concluida vale 100".
--         Uma tarefa pronta levava o projeto inteiro a 100%.
--   0035  decisao do usuario: progress_percent virou tarefas concluidas sobre o
--         total, e a escala por fase foi morar em phase_percent. Matou o 100%
--         precoce - e junto matou a reacao ao cartao mudando de coluna, que era
--         o que as telas mostravam.
--   0075  progress_percent = 100 se TODAS as tarefas estiverem concluidas,
--         senao o percentual da fase mais avancada. Segue a etapa outra vez, e o
--         defeito da 0034 continua morto porque exige TODAS, e nao UMA.
--
-- Cenario: um projeto sem tarefa nenhuma, um com tres tarefas - Projeto Legal
-- (70%), Briefing (12%) e Aguardando Cliente (sem percentual proprio) - e um
-- terceiro so para a fase de espera. Nenhuma tarefa comeca concluida: sao os
-- casos que vao concluindo, uma de cada vez, e o numero de cada passo e o
-- assunto.

insert into public.task_checklist_items (tenant_id, task_id, title, is_required, is_completed, completed_at) values
  ((select tenant_a from ids), (select task_legal_a from ids), 'Protocolar na prefeitura', true, true, now()),
  ((select tenant_a from ids), (select task_legal_a from ids), 'Recolher taxas', true, false, null),
  ((select tenant_a from ids), (select task_legal_a from ids), 'Arquivar comprovante', false, false, null);

-- Projeto sem tarefa da 0 nos DOIS numeros, e nao nulo: painel que soma nulo
-- produz buraco em vez de zero. Este caso tambem guarda a guarda `tasks_total >
-- 0` da 0075 - sem ela, zero tarefas concluidas de zero tarefas satisfaz "todas
-- concluidas" e o projeto vazio apareceria com 100%.
select pg_temp.val('8.1', 'projeto SEM tarefa devolve 0, e nao nulo nem 100 nem ausencia de linha',
  '0|0|0|0', format($q$
  select progress_percent || '|' || phase_percent || '|' || required_items_total
      || '|' || required_items_completed
    from public.project_progress where project_id = %L
$q$, (select project_empty_a from ids)));

-- Nada concluido: manda a fase mais avancada, que e Projeto Legal (70).
-- 'Aguardando Cliente' nao tem percentual proprio e e ignorada na comparacao; se
-- ganhasse valor, este numero mudaria. Os dois percentuais coincidem enquanto
-- nenhuma tarefa esta concluida - e assim que a 0075 desenhou: progress_percent
-- E o phase_percent, ate todas fecharem.
select pg_temp.val('8.2', 'fase mais avancada manda quando nada esta concluido',
  '70|70|3|0|2|1', format($q$
  select progress_percent || '|' || phase_percent || '|' || tasks_total || '|'
      || tasks_completed || '|' || required_items_total || '|' || required_items_completed
    from public.project_progress where project_id = %L
$q$, (select project_full_a from ids)));

select pg_temp.chk('8.2b', 'conclui UMA das tres tarefas', 'OK:1', format($q$
  update public.tasks set status = 'completed', completion_date = current_date
   where id = %L
$q$, (select task_briefing_a from ids)));

-- O CASO QUE IMPEDE O DEFEITO DA 0034 DE VOLTAR. Com uma das tres concluida o
-- projeto continua valendo 70 (a fase de Projeto Legal), e NAO 100. Se alguem
-- devolver o atalho "qualquer concluida vale 100", este numero vira 100 e o caso
-- cai. Se alguem devolver a proporcao da 0035, vira 33 e o caso cai igual.
select pg_temp.val('8.2c', 'UMA de tres concluida NAO leva a 100 (o defeito da 0034)',
  '70|70', format($q$
  select progress_percent || '|' || phase_percent
    from public.project_progress where project_id = %L
$q$, (select project_full_a from ids)));

select pg_temp.chk('8.2d', 'conclui as outras duas', 'OK:2', format($q$
  update public.tasks set status = 'completed', completion_date = current_date
   where project_id = %L and status <> 'completed'
$q$, (select project_full_a from ids)));

-- TODAS concluidas: 100. E phase_percent CONTINUA 70 - concluir tarefa nao move
-- a fase, porque a fase descreve onde a entrega chegou e nao quanto fechou. Sao
-- os dois sinais separados que a 0035 criou, e a 0075 manteve.
select pg_temp.val('8.2e', 'TODAS concluidas dao 100, e phase_percent nao acompanha',
  '100|70', format($q$
  select progress_percent || '|' || phase_percent
    from public.project_progress where project_id = %L
$q$, (select project_full_a from ids)));

-- O caso que justifica security_invoker: sem ele a view roda como o DONO
-- (postgres), ignora a RLS das tabelas e entrega o progresso do projeto de outro
-- escritorio para qualquer colaborador autenticado.
select pg_temp.val_as('8.3', 'colaborador de A nao ve projeto de B PELA VIEW',
  '0', (select user_a from ids), (select tenant_a from ids), format($q$
  select count(*)::text from public.project_progress where project_id = %L
$q$, (select project_b from ids)));

-- CONTROLE do 8.3, e ele ja salvou este arquivo uma vez: entre a 0035 e a 0036
-- o GRANT sumiu junto com um `drop view`, e o 8.3 passou a devolver ERR:42501 em
-- vez de zero linhas - erro de privilegio LEMBRA sucesso num teste de negacao.
-- Quem acusou foi este caso. A 0075 usa `create or replace` justamente para o
-- GRANT nao ter como sumir.
select pg_temp.val_as('8.4', 'CONTROLE: colaborador de A ve o proprio projeto pela view',
  '1', (select user_a from ids), (select tenant_a from ids), format($q$
  select count(*)::text from public.project_progress where project_id = %L
$q$, (select project_full_a from ids)));

-- 'Aguardando Cliente' num projeto so dela: esperar o cliente nao avanca nem
-- retrocede, entao nao ha fase nenhuma pontuando e o coalesce devolve 0.
select pg_temp.chk('8.5', 'monta um projeto com UMA tarefa em Aguardando Cliente', 'OK:1', format($q$
  insert into public.tasks (id, tenant_id, title, project_id, phase)
  values (%L, %L, 'Aguardar aprovacao do cliente', %L, 'awaiting_client')
$q$, (select task_waiting_only_a from ids), (select tenant_a from ids),
     (select project_waiting_a from ids)));

select pg_temp.val('8.6', 'Aguardando Cliente sozinha nao pontua: nao tem percentual proprio',
  '0|0', format($q$
  select progress_percent || '|' || phase_percent
    from public.project_progress where project_id = %L
$q$, (select project_waiting_a from ids)));

select pg_temp.chk('8.7', 'acrescenta uma tarefa em Layout no mesmo projeto', 'OK:1', format($q$
  insert into public.tasks (id, tenant_id, title, project_id, phase)
  values (%L, %L, 'Estudo de layout', %L, 'layout')
$q$, (select task_layout_a from ids), (select tenant_a from ids),
     (select project_waiting_a from ids)));

-- CONTROLE do 8.6: o projeto passa a valer o Layout (26), e a tarefa em espera
-- nao interfere. Sem este caso, o 0 de cima nao distinguiria "a fase de espera e
-- ignorada" de "a view parou de pontuar qualquer fase".
--
-- O QUE ESTE PAR NAO CONSEGUE AFIRMAR, e vale registrar: mapear
-- 'awaiting_client' para 0 em vez de NULL daria os mesmos dois numeros, porque
-- max() ignora nulo e 0 perde para qualquer outra fase. A diferenca entre nulo e
-- zero aqui e de intencao, nao de resultado.
select pg_temp.val('8.8', 'CONTROLE: vale o Layout - a tarefa em espera nao puxa o numero',
  '26|26', format($q$
  select progress_percent || '|' || phase_percent
    from public.project_progress where project_id = %L
$q$, (select project_waiting_a from ids)));

-- 9. A fase "Em Obra" e a excecao da importacao --------------------------------
--
-- DUAS MUDANCAS DIFERENTES, e a diferenca entre elas e o assunto desta secao.
--
--   a) A migration 0061 acrescentou 'under_construction' a project_phase. Isso
--      NAO e excecao de importacao: e fase nova, e vale para qualquer tarefa,
--      importada ou nao. 14 tarefas do base44 estao la, mas quem criar uma
--      tarefa "Em Obra" pela tela amanha usa o mesmo valor.
--
--   b) A migration 0062 abriu excecao no completion_date x status para linha
--      com legacy_id preenchido. Essa sim so vale para o que veio do base44.
--
-- Os casos 9.3 e 9.4 sao o que impede (a) de virar afrouxamento: acrescentar
-- valor a um enum compartilhado nao pode abrir os recortes que cada tabela ja
-- fazia, e os dois valores que tasks nunca aceitou continuam recusados INCLUSIVE
-- em linha importada.

select pg_temp.chk('9.1', 'tarefa em fase Em Obra entra (sem legacy_id nenhum)', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, phase)
  values (%L, 'Acompanhamento de obra', 'under_construction')
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.2', 'CONTROLE: o PROJETO tambem aceita Em Obra', 'OK:1', format($q$
  insert into public.projects (tenant_id, name, project_type, current_phase)
  values (%L, 'Residencia em obra', 'architecture', 'under_construction')
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.3', 'tarefa IMPORTADA em fase finished continua recusada', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, legacy_id, title, phase)
  values (%L, 'b44-task-finished', 'Entrega final', 'finished')
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.4', 'tarefa IMPORTADA em fase post_approval continua recusada', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, legacy_id, title, phase)
  values (%L, 'b44-task-pos', 'Compra de acabamento', 'post_approval')
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.5', 'tarefa IMPORTADA concluida SEM data entra', 'OK:1', format($q$
  insert into public.tasks (tenant_id, legacy_id, title, status)
  values (%L, 'b44-task-sem-data', '0652 - Thiago e Alyssandra', 'completed')
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.6', 'CONTROLE: a MESMA tarefa sem legacy_id e recusada', 'ERR:23514', format($q$
  insert into public.tasks (tenant_id, title, status)
  values (%L, '0652 - Thiago e Alyssandra', 'completed')
$q$, (select tenant_a from ids)));

-- A FASE NOVA ENTROU NA ESCALA NA 0075, VALENDO 100. A 0061 deixou o percentual
-- dela em aberto de proposito - "inventar um percentual para uma fase que o
-- original nunca teve mudaria o numero exibido de 14 projetos com base em
-- palpite" - e ficou esperando confirmacao. Ela veio de FASE_PERCENTUAIS em
-- nova-versao/src/components/utils/projectProgressCalculator.jsx, que declara
-- 'Em Obra': 100 ao lado de 'Alvara de Construcao' e 'Finalizado'.
--
-- Ate a 0075 a fase caia em NULL e sumia do max(): as 14 tarefas reais em Em
-- Obra zeravam o progresso do projeto delas, e nenhuma esta parada no comeco.
--
-- Usa o projeto sem tarefa da secao 8, que ja terminou de ser afirmada. O
-- CONTROLE VEM ANTES: primeiro so uma tarefa de Briefing (12), depois a de Em
-- Obra (100). Assim o 100 nao pode vir de outra coisa - nem de "todas as tarefas
-- concluidas" (nenhuma esta), nem de a escala inteira ter desabado para 100,
-- porque nesse caso o 12 do controle nao apareceria.
select pg_temp.chk('9.7', 'monta uma tarefa de Briefing no projeto vazio', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, project_id, phase)
  values (%L, 'Reuniao de briefing', %L, 'briefing')
$q$, (select tenant_a from ids), (select project_empty_a from ids)));

select pg_temp.val('9.8', 'CONTROLE: so Briefing, o projeto vale 12', '12|12', format($q$
  select progress_percent || '|' || phase_percent
    from public.project_progress where project_id = %L
$q$, (select project_empty_a from ids)));

select pg_temp.chk('9.9', 'acrescenta uma tarefa Em Obra no mesmo projeto', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, project_id, phase)
  values (%L, 'Visita de obra', %L, 'under_construction')
$q$, (select tenant_a from ids), (select project_empty_a from ids)));

-- Se alguem tirar 'under_construction' do CASE da view, ele volta a cair em NULL
-- e este numero vira 12 outra vez. E o unico lugar do projeto que cobra a fase
-- nova na escala.
select pg_temp.val('9.10', 'Em Obra vale 100 na escala (0075 fecha o que a 0061 deixou em aberto)',
  '100|100', format($q$
  select progress_percent || '|' || phase_percent
    from public.project_progress where project_id = %L
$q$, (select project_empty_a from ids)));

-- 10. O status operacional da tarefa (migration 0074) ---------------------------
--
-- A coluna nova: tasks.operational_tag, enum operational_tag (0068), ANULAVEL e
-- sem check de fase. As 13 tarefas reais que a importacao recusou por falta
-- dela sao 7 "Em Revisao" e 6 "Aguardando Cliente" (docs/IMPORT-PLAN.md 8.1).
--
-- O QUE ESTA SECAO EXISTE PARA AFIRMAR, e nao e o de sempre: aqui a maior parte
-- dos casos afirma que o banco ACEITA. A decisao da fatia 3 foi NAO escrever o
-- check de "so nestas fases" - o recorte fase<->tag do menu ('Layout' e
-- 'Perspectivas' com as duas, 'Projeto Legal' e 'Projeto Executivo' so
-- "Em Revisao", TaskKanban.jsx:42-44 da nova-versao) e oferta de tela, nao regra
-- de dominio. Um check ali faria um arraste legitimo virar erro de banco no dia
-- em que tela e check discordassem, e nao pegaria nada hoje porque as 13 tags
-- reais caem todas dentro do recorte.
--
-- Ausencia de restricao nao se prova sozinha: sem os casos 10.1 e 10.2, alguem
-- que acrescentasse o check "por seguranca" nao derrubaria teste nenhum, e a
-- quebra so apareceria no dia do arraste. Sao eles que tornam a decisao
-- executavel, e nao so escrita no comentario da migration.
--
-- O que continua fechado e o DOMINIO: valor fora do enum e recusado, inclusive o
-- rotulo em portugues que o CSV do base44 traz - rotulo vive na UI
-- (src/lib/enums.ts), nunca no banco.

select pg_temp.chk('10.1', 'tag entra em fase FORA do recorte do menu (Briefing)', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, phase, operational_tag)
  values (%L, 'Levantamento com o cliente', 'briefing', 'in_review')
$q$, (select tenant_a from ids)));

-- O caso mais direto contra o check que NAO foi escrito: em Projeto Legal o menu
-- so oferece "Em Revisao", e o banco aceita "Aguardando Cliente" do mesmo jeito.
select pg_temp.chk('10.2', 'tag que o menu NAO oferece naquela coluna entra assim mesmo', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, phase, operational_tag)
  values (%L, 'Aguardar documento do cliente', 'legal_permit', 'awaiting_client')
$q$, (select tenant_a from ids)));

-- Nulo e o caso NORMAL: 13 tags em 130 tarefas do export. Sem este caso, uma
-- coluna marcada not null por engano so apareceria na primeira tarefa criada
-- pela tela.
select pg_temp.chk('10.3', 'CONTROLE: tarefa SEM tag entra (nulo e o caso normal)', 'OK:1', format($q$
  insert into public.tasks (tenant_id, title, phase)
  values (%L, 'Tarefa sem status operacional', 'briefing')
$q$, (select tenant_a from ids)));

select pg_temp.chk('10.4', 'valor inventado fora do enum e recusado', 'ERR:22P02', format($q$
  insert into public.tasks (tenant_id, title, operational_tag)
  values (%L, 'Tarefa pausada', 'pausada')
$q$, (select tenant_a from ids)));

-- O rotulo EXATO que o CSV do base44 traz em tag_operacional. Ele nao entra: o
-- de/para acontece na importacao e na UI, e o banco guarda so a chave.
select pg_temp.chk('10.5', 'o rotulo em portugues do base44 e recusado', 'ERR:22P02', format($q$
  insert into public.tasks (tenant_id, title, operational_tag)
  values (%L, 'Revisao do layout', 'Em Revisão')
$q$, (select tenant_a from ids)));

select pg_temp.chk('10.6', 'CONTROLE: a chave do enum entra', 'OK:1', format($q$
  insert into public.tasks (id, tenant_id, title, phase, operational_tag)
  values (%L, %L, 'Revisao do layout', 'layout', 'in_review')
$q$, (select task_tag_a from ids), (select tenant_a from ids)));

-- A limpeza da tag ao mudar de coluna e UM SO UPDATE, e nao dois. No original
-- sao duas escritas (TaskKanban.jsx:218-219 zera a tag antes de mover) e a
-- primeira acontece mesmo quando a segunda e barrada - a tarefa fica sem tag na
-- coluna de onde nunca saiu.
select pg_temp.chk('10.7', 'muda de fase e limpa a tag no MESMO update', 'OK:1', format($q$
  update public.tasks set phase = 'renderings', operational_tag = null where id = %L
$q$, (select task_tag_a from ids)));

select pg_temp.chk('10.8', 'CONTROLE: devolve a tag para os casos de isolamento', 'OK:1', format($q$
  update public.tasks set operational_tag = 'in_review' where id = %L
$q$, (select task_tag_a from ids)));

-- Isolamento, com a coluna nova no meio. A RLS de tasks nao mudou, mas a
-- consulta que a tela do status operacional faz e nova ("o que esta parado
-- esperando alguem"), e e ela que precisa continuar presa ao escritorio.
select pg_temp.chk('10.9', 'tarefa com tag no escritorio B', 'OK:1', format($q$
  insert into public.tasks (id, tenant_id, title, phase, operational_tag)
  values (%L, %L, 'Aguardando retorno do cliente B', 'layout', 'awaiting_client')
$q$, (select task_tag_b from ids), (select tenant_b from ids)));

select pg_temp.val_as('10.10', 'colaborador de A nao ve a tarefa com tag de B',
  '0', (select user_a from ids), (select tenant_a from ids), format($q$
  select count(*)::text from public.tasks where id = %L
$q$, (select task_tag_b from ids)));

select pg_temp.val_as('10.11', 'CONTROLE: colaborador de A ve a propria tarefa com tag',
  '1', (select user_a from ids), (select tenant_a from ids), format($q$
  select count(*)::text from public.tasks where id = %L
$q$, (select task_tag_a from ids)));

-- A consulta REAL da tela, e a que o indice parcial
-- tasks_tenant_id_operational_tag_idx serve: filtra por tag e nao por id.
-- Recortada nas duas linhas da secao para nao depender do dado permanente do
-- escritorio de seed. Se o filtro por tag escapasse do tenant, viriam as duas.
select pg_temp.val_as('10.12', 'a consulta POR TAG so devolve a do proprio escritorio',
  'in_review', (select user_a from ids), (select tenant_a from ids), format($q$
  select string_agg(operational_tag::text, ',' order by operational_tag::text)
    from public.tasks
   where operational_tag is not null and id in (%L, %L)
$q$, (select task_tag_a from ids), (select task_tag_b from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
