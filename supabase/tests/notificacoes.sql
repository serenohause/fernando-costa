-- Os avisos do sino: a deduplicação do atraso, o episódio novo, o banco pausado,
-- quem NÃO é avisado e o aviso que sobrevive à tarefa.
--
-- O QUE ELE PROVA, e por que cada caso existe
--   O módulo tem duas peças que nenhuma tela mostra e nenhum teste de UI
--   alcança: um índice único que decide o que é repetição, e uma varredura que
--   não guarda marca d'água. Errar qualquer das duas não aparece na hora —
--   aparece como sino com quinze linhas iguais no dia em que o banco voltar de
--   uma pausa, ou como atraso que nunca avisou ninguém.
--
--   1. ATRIBUIÇÃO (seção 1): o aviso nasce do gatilho, copia quem atribuiu, e
--      NÃO nasce quando a pessoa se atribui a própria tarefa. Reatribuir de A
--      para B e de volta para A avisa A duas vezes de propósito — é fato novo,
--      não duplicata, e o caso 1.7 existe para que ninguém "conserte" isso
--      alargando o índice do episódio.
--   2. VARREDURA (seção 2): dedup no mesmo prazo, episódio novo em prazo
--      remarcado, e O BANCO PAUSADO — a varredura acha o que venceu há 40 dias
--      sem nunca ter rodado naquele intervalo. Cada negativa (concluída, sem
--      responsável, sem prazo, prazo futuro, vence hoje) tem controle positivo
--      ao lado: negativa que passa porque a linha nem existia pareceria acerto.
--   3. SOBREVIVÊNCIA (seção 3): apagar a tarefa, e depois o colaborador que
--      atribuiu, não pode tornar o aviso ilegível. É o precedente de
--      `impersonation_events` (0109) medido aqui.
--   4. AS DUAS BARREIRAS (seção 4): RLS ligada e GRANT fechado são coisas
--      separadas (achado da 0007). Esta seção mede o GRANT — ninguém insere,
--      ninguém apaga, e a única coluna gravável pela pessoa é `read_at`.
--
-- O QUE ELE NÃO COBRE, de propósito
--   As POLICIES. Elas não existem ainda: a migration 0120 liga a RLS e escreve
--   os GRANT, e quem escreve policy e teste de isolamento é o `rls-guardian`, na
--   etapa seguinte. Nenhum caso aqui afirma "não existe policy" — afirmação de
--   marcador de etapa é a que precisa ser invertida depois (o estrago está
--   registrado no README, casos 5.2-5.4 de crm-schema.sql).
--
-- COMO RODAR
--   npm run test:notificacoes
--
-- RESÍDUO
--   Nenhum: uma transação terminada em ROLLBACK. Os dois escritórios, as
--   pessoas e as tarefas nascem aqui. Nenhuma contagem absoluta sobre
--   `notifications` — tudo é recortado por tarefa ou por destinatário, para a
--   suíte não passar hoje e falhar no dia em que o sino tiver aviso de verdade.

begin;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))
$$;

create or replace function pg_temp.chk(p_sql text)
returns text language plpgsql as $$
declare st text;
begin
  begin
    execute p_sql;
    return 'OK';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    return 'ERR:' || st;
  end;
end; $$;

/* Lê um valor COMO a pessoa logada: papel `authenticated` e o claim de tenant
   no lugar em que o PostgREST o põe. */
create or replace function pg_temp.valor_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.exec_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return 'OK:' || n;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.como_anon(p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

/* Volta a ser "sem sessão": é o seed, o script de correção, a varredura. Sem
   isto o claim do caso anterior ficaria pendurado e o gatilho atribuiria autor a
   uma escrita que não teve autor. */
create or replace function pg_temp.sem_sessao()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'b1110000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'b1110000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'b1110000-0000-4000-8000-00000000001a'::uuid as user_ana,
  'b1110000-0000-4000-8000-00000000001b'::uuid as user_bia,
  'b1110000-0000-4000-8000-00000000002a'::uuid as col_ana,
  'b1110000-0000-4000-8000-00000000003a'::uuid as col_bruno,
  'b1110000-0000-4000-8000-00000000004a'::uuid as col_caio,
  'b1110000-0000-4000-8000-00000000002b'::uuid as col_dir_b,
  'b1110000-0000-4000-8000-0000000000e1'::uuid as proj_a,
  'b1110000-0000-4000-8000-0000000000e2'::uuid as proj_b,
  'b1110000-0000-4000-8000-0000000000f1'::uuid as t_render,
  'b1110000-0000-4000-8000-0000000000f2'::uuid as t_sem_projeto,
  'b1110000-0000-4000-8000-0000000000f3'::uuid as t_sem_resp,
  'b1110000-0000-4000-8000-0000000000f4'::uuid as t_ontem,
  'b1110000-0000-4000-8000-0000000000f5'::uuid as t_pausado,
  'b1110000-0000-4000-8000-0000000000f6'::uuid as t_concluida,
  'b1110000-0000-4000-8000-0000000000f7'::uuid as t_sem_prazo,
  'b1110000-0000-4000-8000-0000000000f8'::uuid as t_futura,
  'b1110000-0000-4000-8000-0000000000f9'::uuid as t_hoje,
  'b1110000-0000-4000-8000-0000000000fb'::uuid as t_vizinha;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_ana from ids) u, 'sino-ana@example.test' e
  union all select (select user_bia from ids), 'sino-bia@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Sino A', 'sino-a'),
  ((select tenant_b from ids), 'Sino B', 'sino-b');

/* Bruno e Caio NÃO têm login: ser avisado não depende de ter conta, e a linha do
   aviso é do colaborador, não do usuário. */
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_ana from ids), (select tenant_a from ids), (select user_ana from ids),
   'Ana Coordenadora', 'coordinator', 'sino-ana@example.test', 'active'),
  ((select col_bruno from ids), (select tenant_a from ids), null,
   'Bruno Arquiteto', 'architect', 'sino-bruno@example.test', 'active'),
  ((select col_caio from ids), (select tenant_a from ids), null,
   'Caio Arquiteto', 'architect', 'sino-caio@example.test', 'active'),
  ((select col_dir_b from ids), (select tenant_b from ids), (select user_bia from ids),
   'Diretora B', 'director', 'sino-bia@example.test', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_ana from ids), 'project_flow', true, true);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select proj_a from ids), (select tenant_a from ids), 'Residência Alto da Boa Vista', 'architecture'),
  ((select proj_b from ids), (select tenant_b from ids), 'Projeto do Vizinho', 'architecture');

/* Quantos avisos de uma espécie uma tarefa gerou. */
create or replace function pg_temp.avisos(p_task uuid, p_kind text)
returns text language sql as $$
  select count(*)::text from public.notifications n
   where n.task_id = p_task and n.kind::text = p_kind
$$;

/* Quantos avisos de uma espécie uma PESSOA recebeu. */
create or replace function pg_temp.avisos_de(p_recipient uuid, p_kind text)
returns text language sql as $$
  select count(*)::text from public.notifications n
   where n.recipient_id = p_recipient and n.kind::text = p_kind
$$;

/* A linha do painel, em texto: espécie | tarefa | projeto | quem atribuiu | prazo.
   A ESPÉCIE É PARÂMETRO, e não é zelo: a mesma tarefa gera avisos das duas, e
   sem o filtro este leitor devolveria o aviso errado — foi o que aconteceu na
   primeira versão desta suíte, e os casos 2.2 e 2.4 passariam a medir o aviso de
   atribuição em vez do de atraso. */
create or replace function pg_temp.linha(p_task uuid, p_recipient uuid, p_kind text)
returns text language sql as $$
  select coalesce((
    select n.kind::text || '|' || n.task_title || '|' || coalesce(n.project_name, '<sem projeto>')
        || '|' || coalesce(n.actor_name, '<sem autor>') || '|' || coalesce(n.due_date::text, '<sem prazo>')
      from public.notifications n
     where n.task_id = p_task and n.recipient_id = p_recipient and n.kind::text = p_kind
     order by n.due_date desc nulls last
     limit 1), '(nenhum)')
$$;

-- 1. ESPÉCIE "NOVA TAREFA": o gatilho da atribuição ----------------------------

select pg_temp.rec('1.0', 'CONTROLE: Ana cria a tarefa e põe Bruno como responsável', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.tasks (id, tenant_id, project_id, title, phase, status, responsible_id)
       values (%L, %L, %L, 'Humanização: render externo da fachada', 'layout', 'in_progress', %L)$q$,
    (select t_render from ids), (select tenant_a from ids), (select proj_a from ids),
    (select col_bruno from ids))));

select pg_temp.rec('1.1', 'atribuir gera UM aviso para quem recebeu a tarefa', '1',
  pg_temp.avisos((select t_render from ids), 'task_assigned'));

/* A decisão 1 do usuário sobre o protótipo: a linha de "nova tarefa" MOSTRA
   quem atribuiu. Título e projeto são cópias, e o prazo não entra nesta
   espécie. */
select pg_temp.rec('1.2', 'o aviso copia espécie, tarefa, projeto e quem atribuiu',
  'task_assigned|Humanização: render externo da fachada|Residência Alto da Boa Vista|Ana Coordenadora|<sem prazo>',
  pg_temp.linha((select t_render from ids), (select col_bruno from ids), 'task_assigned'));

select pg_temp.rec('1.3', 'e nasce não lida', 'true',
  (select (read_at is null)::text from public.notifications
    where task_id = (select t_render from ids) and recipient_id = (select col_bruno from ids)));

/* O sino existe para o que aconteceu enquanto a pessoa não estava olhando.
   Quem pega a tarefa para si acabou de ler o próprio gesto. */
select pg_temp.rec('1.4', 'CONTROLE: Ana passa a tarefa para si mesma', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.tasks set responsible_id = %L where id = %L',
    (select col_ana from ids), (select t_render from ids))));

select pg_temp.rec('1.5', 'atribuir a SI MESMO não gera aviso', '0',
  pg_temp.avisos_de((select col_ana from ids), 'task_assigned'));

select pg_temp.rec('1.6', 'e não criou um segundo aviso para o responsável anterior', '1',
  pg_temp.avisos_de((select col_bruno from ids), 'task_assigned'));

select pg_temp.rec('1.7', 'CONTROLE: Ana passa a tarefa para Caio', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.tasks set responsible_id = %L where id = %L',
    (select col_caio from ids), (select t_render from ids))));

select pg_temp.rec('1.8', 'o novo responsável é avisado', '1',
  pg_temp.avisos_de((select col_caio from ids), 'task_assigned'));

/* O PATCH do PostgREST manda o registro inteiro: salvar a tarefa sem trocar o
   responsável acontece o tempo todo, e não é atribuição. */
select pg_temp.rec('1.9', 'CONTROLE: salvar de novo com o MESMO responsável', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.tasks set responsible_id = %L, priority = %L where id = %L',
    (select col_caio from ids), 'high', (select t_render from ids))));

select pg_temp.rec('1.10', 'salvar sem trocar o responsável NÃO gera aviso novo', '1',
  pg_temp.avisos_de((select col_caio from ids), 'task_assigned'));

/* De propósito: aconteceram duas coisas, e a pessoa precisa saber da segunda.
   Quem "consertar" isto alargando o índice do episódio derruba este caso. */
select pg_temp.rec('1.11', 'CONTROLE: a tarefa volta para Bruno', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    'update public.tasks set responsible_id = %L where id = %L',
    (select col_bruno from ids), (select t_render from ids))));

select pg_temp.rec('1.12', 'receber a MESMA tarefa de novo avisa de novo', '2',
  pg_temp.avisos_de((select col_bruno from ids), 'task_assigned'));

select pg_temp.rec('1.13', 'CONTROLE: tarefa SEM projeto também é atribuível', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.tasks (id, tenant_id, title, phase, status, responsible_id)
       values (%L, %L, 'Levantamento no local', 'layout', 'not_started', %L)$q$,
    (select t_sem_projeto from ids), (select tenant_a from ids), (select col_caio from ids))));

select pg_temp.rec('1.14', 'tarefa sem projeto avisa, com o nome do projeto vazio',
  'task_assigned|Levantamento no local|<sem projeto>|Ana Coordenadora|<sem prazo>',
  pg_temp.linha((select t_sem_projeto from ids), (select col_caio from ids), 'task_assigned'));

select pg_temp.rec('1.15', 'CONTROLE: tarefa criada sem responsável', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.tasks (id, tenant_id, project_id, title, phase, status)
       values (%L, %L, %L, 'Compatibilização elétrica', 'layout', 'not_started')$q$,
    (select t_sem_resp from ids), (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('1.16', 'tarefa sem responsável não avisa ninguém', '0',
  pg_temp.avisos((select t_sem_resp from ids), 'task_assigned'));

/* Sem JWT: é o seed, ou a correção feita direto no banco. O aviso existe e fica
   sem autor — a tela diz "Sistema", igual ao histórico do cartão (0104). */
select pg_temp.sem_sessao();

update public.tasks set responsible_id = (select col_caio from ids)
 where id = (select t_sem_resp from ids);

select pg_temp.rec('1.17', 'atribuição sem sessão fica sem autor, e não sem aviso',
  'task_assigned|Compatibilização elétrica|Residência Alto da Boa Vista|<sem autor>|<sem prazo>',
  pg_temp.linha((select t_sem_resp from ids), (select col_caio from ids), 'task_assigned'));

/* Tirar o responsável não é aviso: não existe "você deixou de ser responsável"
   no escopo aprovado. */
update public.tasks set responsible_id = null where id = (select t_sem_resp from ids);

select pg_temp.rec('1.18', 'tirar o responsável não gera aviso', '1',
  pg_temp.avisos((select t_sem_resp from ids), 'task_assigned'));

-- 2. ESPÉCIE "TAREFA EM ATRASO": a varredura -----------------------------------
--
-- As tarefas abaixo nascem SEM sessão, de propósito: o que está sob teste é a
-- varredura, e os avisos de atribuição que elas geram ficam fora da conta porque
-- toda contagem desta seção filtra a espécie.

select pg_temp.sem_sessao();

insert into public.tasks (id, tenant_id, project_id, title, phase, status, responsible_id, due_date, completion_date) values
  ((select t_ontem from ids), (select tenant_a from ids), (select proj_a from ids),
   'Protocolar projeto legal', 'layout', 'in_progress', (select col_bruno from ids), current_date - 1, null),
  /* O BANCO PAUSADO: venceu há 40 dias e nenhuma varredura rodou nesse tempo. */
  ((select t_pausado from ids), (select tenant_a from ids), (select proj_a from ids),
   'Detalhamento de esquadrias', 'layout', 'not_started', (select col_bruno from ids), current_date - 40, null),
  ((select t_concluida from ids), (select tenant_a from ids), (select proj_a from ids),
   'Medição em obra', 'layout', 'completed', (select col_bruno from ids), current_date - 5, current_date - 4),
  ((select t_sem_prazo from ids), (select tenant_a from ids), (select proj_a from ids),
   'Estudo de mobiliário', 'layout', 'in_progress', (select col_bruno from ids), null, null),
  ((select t_futura from ids), (select tenant_a from ids), (select proj_a from ids),
   'Render interno', 'layout', 'in_progress', (select col_bruno from ids), current_date + 3, null),
  ((select t_hoje from ids), (select tenant_a from ids), (select proj_a from ids),
   'Reunião de aprovação', 'layout', 'in_progress', (select col_bruno from ids), current_date, null);

/* A tarefa sem responsável vencida: reaproveita t_sem_resp, que ficou sem
   responsável no caso 1.18. */
update public.tasks set due_date = current_date - 7 where id = (select t_sem_resp from ids);

select pg_temp.rec('2.1', 'CONTROLE: a primeira varredura cria exatamente os 2 avisos devidos', '2',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text));

select pg_temp.rec('2.2', 'o aviso guarda o prazo que venceu, e não tem autor',
  'task_overdue|Protocolar projeto legal|Residência Alto da Boa Vista|<sem autor>|' || (current_date - 1)::text,
  pg_temp.linha((select t_ontem from ids), (select col_bruno from ids), 'task_overdue'));

select pg_temp.rec('2.3', 'e foi gravado hoje, pela varredura de hoje', 'true',
  (select (created_at::date = current_date)::text from public.notifications
    where task_id = (select t_ontem from ids) and kind = 'task_overdue'));

/* O BANCO PAUSADO. A varredura não pergunta "o que venceu ontem": pergunta o
   que está vencido, e por isso acha o que venceu enquanto ela não rodava. */
select pg_temp.rec('2.4', 'a varredura acha o que venceu há 40 dias, sem ter rodado nesse tempo',
  'task_overdue|Detalhamento de esquadrias|Residência Alto da Boa Vista|<sem autor>|' || (current_date - 40)::text,
  pg_temp.linha((select t_pausado from ids), (select col_bruno from ids), 'task_overdue'));

select pg_temp.rec('2.5', 'A DEDUPLICAÇÃO: a segunda varredura do mesmo dia cria zero', '0',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text));

select pg_temp.rec('2.6', 'e a terceira também, e a linha continua sendo uma só', '0|1',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text
          || '|' || pg_temp.avisos((select t_ontem from ids), 'task_overdue')));

select pg_temp.rec('2.7', 'tarefa concluída e vencida não gera aviso', '0',
  pg_temp.avisos((select t_concluida from ids), 'task_overdue'));

select pg_temp.rec('2.8', 'tarefa vencida SEM responsável não gera aviso', '0',
  pg_temp.avisos((select t_sem_resp from ids), 'task_overdue'));

select pg_temp.rec('2.9', 'tarefa sem prazo não gera aviso', '0',
  pg_temp.avisos((select t_sem_prazo from ids), 'task_overdue'));

select pg_temp.rec('2.10', 'prazo no futuro não gera aviso', '0',
  pg_temp.avisos((select t_futura from ids), 'task_overdue'));

/* A régua é a de public.is_overdue (0043): o dia do vencimento ainda não
   acabou. */
select pg_temp.rec('2.11', 'tarefa que vence HOJE ainda não está atrasada', '0',
  pg_temp.avisos((select t_hoje from ids), 'task_overdue'));

/* O EPISÓDIO NOVO. Prazo remarcado e vencido de novo é outro fato, e a pessoa
   precisa ser avisada outra vez. */
update public.tasks set due_date = current_date - 3 where id = (select t_ontem from ids);

select pg_temp.rec('2.12', 'prazo REMARCADO e vencido de novo: a varredura cria aviso novo', '1',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text));

select pg_temp.rec('2.13', 'e a tarefa passa a ter dois avisos, um por prazo',
  '2|' || (current_date - 3)::text || ',' || (current_date - 1)::text,
  (select pg_temp.avisos((select t_ontem from ids), 'task_overdue') || '|' ||
          (select string_agg(n.due_date::text, ',' order by n.due_date)
             from public.notifications n
            where n.task_id = (select t_ontem from ids) and n.kind = 'task_overdue')));

select pg_temp.rec('2.14', 'e a varredura seguinte volta a criar zero', '0',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text));

/* QUEM HERDA UMA TAREFA JÁ ATRASADA É A PESSOA QUE MAIS PRECISA SABER. É por
   isto que recipient_id entra na chave do episódio. */
update public.tasks set responsible_id = (select col_caio from ids)
 where id = (select t_pausado from ids);

select pg_temp.rec('2.15', 'trocar o responsável no meio do atraso avisa o novo', '1',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text));

select pg_temp.rec('2.16', 'o mesmo prazo, dois destinatários, e nenhum aviso perdido', '2|2',
  (select pg_temp.avisos((select t_pausado from ids), 'task_overdue') || '|' ||
          (select count(distinct n.recipient_id)::text from public.notifications n
            where n.task_id = (select t_pausado from ids) and n.kind = 'task_overdue')));

/* Concluir e reabrir com o MESMO prazo não gera segundo aviso: é o mesmo prazo,
   o mesmo episódio, e a pessoa já foi avisada dele. Comportamento documentado no
   cabeçalho da 0120 — se mudar de ideia, muda aqui também. */
update public.tasks set status = 'completed', completion_date = current_date
 where id = (select t_ontem from ids);
update public.tasks set status = 'in_progress', completion_date = null
 where id = (select t_ontem from ids);

select pg_temp.rec('2.17', 'concluir e reabrir com o mesmo prazo não repete o aviso', '0|2',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text
          || '|' || pg_temp.avisos((select t_ontem from ids), 'task_overdue')));

/* O RECORTE POR ESCRITÓRIO. O agendamento chama sem parâmetro e varre todos; a
   chamada com tenant recorta um, e não encosta no vizinho. */
insert into public.tasks (id, tenant_id, project_id, title, phase, status, responsible_id, due_date) values
  ((select t_vizinha from ids), (select tenant_b from ids), (select proj_b from ids),
   'Tarefa do vizinho', 'layout', 'in_progress', (select col_dir_b from ids), current_date - 2);

select pg_temp.rec('2.18', 'varredura recortada no escritório A não cria aviso no B', '0|0',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text
          || '|' || pg_temp.avisos((select t_vizinha from ids), 'task_overdue')));

/* Dois casos, e nao um: a ordem em que o Postgres avalia os dois lados de um
   `||` nao e garantida, e aqui o primeiro lado PRECISA rodar antes do segundo. */
select pg_temp.rec('2.19', 'CONTROLE: a varredura sem parâmetro (a do agendamento) cria avisos', 'true',
  (select (public.scan_overdue_tasks() >= 1)::text));

select pg_temp.rec('2.20', 'e ela alcança o escritório vizinho', '1',
  pg_temp.avisos((select t_vizinha from ids), 'task_overdue'));

/* A unicidade é do ÍNDICE, e não da consulta da varredura: quem gravar por outro
   caminho bate na mesma parede. */
select pg_temp.rec('2.21', 'inserir à mão um aviso de atraso repetido é recusado', 'ERR:23505',
  pg_temp.chk(format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title, due_date)
       values (%L, %L, 'task_overdue', %L, 'Protocolar projeto legal', %L)$q$,
    (select tenant_a from ids), (select col_bruno from ids), (select t_ontem from ids), current_date - 3)));

/* E o índice NÃO vigia a atribuição: `kind` é predicado, não coluna. */
select pg_temp.rec('2.22', 'CONTROLE: dois avisos de atribuição iguais são aceitos', 'OK',
  pg_temp.chk(format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title)
       values (%L, %L, 'task_assigned', %L, 'Protocolar projeto legal')$q$,
    (select tenant_a from ids), (select col_bruno from ids), (select t_ontem from ids))));

/* Os dois sentidos do check: atraso exige prazo, atribuição não o aceita. */
select pg_temp.rec('2.23', 'aviso de atraso sem prazo é recusado', 'ERR:23514',
  pg_temp.chk(format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title)
       values (%L, %L, 'task_overdue', %L, 'Sem prazo')$q$,
    (select tenant_a from ids), (select col_caio from ids), (select t_sem_prazo from ids))));

select pg_temp.rec('2.24', 'aviso de atraso COM autor é recusado: ninguém te cobrou', 'ERR:23514',
  pg_temp.chk(format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title, due_date, actor_id, actor_name)
       values (%L, %L, 'task_overdue', %L, 'Com autor', %L, %L, 'Ana Coordenadora')$q$,
    (select tenant_a from ids), (select col_caio from ids), (select t_sem_prazo from ids),
    current_date - 9, (select col_ana from ids))));

-- 3. O AVISO SOBREVIVE ---------------------------------------------------------

create temp table guardados on commit drop as
  select id, kind, task_title, project_name, actor_name, due_date
    from public.notifications
   where task_id in ((select t_ontem from ids), (select t_render from ids));

select pg_temp.rec('3.0', 'CONTROLE: há avisos das duas espécies para as tarefas que vão ser apagadas',
  'true', (select (count(distinct kind) = 2 and count(*) >= 4)::text from guardados));

delete from public.tasks where id in ((select t_ontem from ids), (select t_render from ids));

select pg_temp.rec('3.1', 'apagar a tarefa NÃO apaga o aviso', 'true',
  (select (count(*) = (select count(*) from guardados))::text
     from public.notifications n where n.id in (select id from guardados)));

select pg_temp.rec('3.2', 'o aviso perde o link da tarefa e mantém título, projeto e autor',
  'true',
  (select bool_and(n.task_id is null
                   and n.task_title = g.task_title
                   and n.project_name is not distinct from g.project_name
                   and n.actor_name is not distinct from g.actor_name
                   and n.due_date is not distinct from g.due_date)::text
     from public.notifications n join guardados g on g.id = n.id));

select pg_temp.rec('3.3', 'e continua legível: a linha do painel ainda se monta',
  'task_assigned|Humanização: render externo da fachada|Residência Alto da Boa Vista|Ana Coordenadora',
  (select n.kind::text || '|' || n.task_title || '|' || coalesce(n.project_name, '<sem projeto>')
          || '|' || coalesce(n.actor_name, '<sem autor>')
     from public.notifications n join guardados g on g.id = n.id
    where n.recipient_id = (select col_bruno from ids) and n.kind = 'task_assigned'
      /* PELO TÍTULO, e não só `limit 1`: Bruno tem avisos de atribuição de duas
         tarefas diferentes guardados aqui, e sem este filtro o caso mediria uma
         linha sorteada - foi uma mutação da migration que revelou isso. O
         `limit 1` fica porque ele recebeu a MESMA tarefa duas vezes (caso 1.12),
         e as duas linhas dizem a mesma coisa. */
      and n.task_title = 'Humanização: render externo da fachada'
    limit 1));

/* Quem atribuiu sai do escritório. Mesmo critério de task_events.actor_name
   (0104) e de impersonation_events (0109): o id morre com o cadastro, o nome
   fica. */
select pg_temp.rec('3.4', 'CONTROLE: Ana é desligada do escritório', 'OK',
  pg_temp.chk(format('delete from public.collaborators where id = %L', (select col_ana from ids))));

select pg_temp.rec('3.5', 'o aviso perde o id de quem atribuiu e mantém o nome', 'true|Ana Coordenadora',
  (select bool_and(n.actor_id is null)::text || '|' || max(n.actor_name)
     from public.notifications n
    where n.actor_name = 'Ana Coordenadora'));

select pg_temp.rec('3.6', 'e o tenant_id do aviso continua de pé', '0',
  (select count(*)::text from public.notifications where tenant_id is null));

/* O destinatário é dono da linha: aviso sem quem o leia não fica. */
update public.tasks set responsible_id = null where responsible_id = (select col_caio from ids);

select pg_temp.rec('3.7', 'CONTROLE: Caio tem aviso antes de ser desligado', 'true',
  (pg_temp.avisos_de((select col_caio from ids), 'task_assigned')::int > 0)::text);

select pg_temp.rec('3.8', 'CONTROLE: Caio é desligado do escritório', 'OK',
  pg_temp.chk(format('delete from public.collaborators where id = %L', (select col_caio from ids))));

select pg_temp.rec('3.9', 'apagar o DESTINATÁRIO leva os avisos dele', '0',
  (select count(*)::text from public.notifications
    where recipient_id = (select col_caio from ids)));

-- 4. AS DUAS BARREIRAS: RLS LIGADA E GRANT FECHADO -----------------------------
--
-- Separadas de propósito, e é o achado da 0007: ENABLE ROW LEVEL SECURITY não
-- protege nada se o privilégio estiver aberto. As policies são da etapa
-- seguinte; o que esta seção mede é o privilégio, que não muda quando elas
-- chegarem.

select pg_temp.rec('4.1', 'RLS ligada em notifications', 'true',
  (select relrowsecurity::text from pg_class
    where relname = 'notifications' and relnamespace = 'public'::regnamespace));

select pg_temp.rec('4.2', 'anon não tem privilégio algum', 'false|false|false|false',
  has_table_privilege('anon', 'public.notifications', 'select')::text || '|' ||
  has_table_privilege('anon', 'public.notifications', 'insert')::text || '|' ||
  has_table_privilege('anon', 'public.notifications', 'update')::text || '|' ||
  has_table_privilege('anon', 'public.notifications', 'delete')::text);

select pg_temp.rec('4.3', 'authenticated lê, e não insere nem apaga', 'true|false|false',
  has_table_privilege('authenticated', 'public.notifications', 'select')::text || '|' ||
  has_table_privilege('authenticated', 'public.notifications', 'insert')::text || '|' ||
  has_table_privilege('authenticated', 'public.notifications', 'delete')::text);

/* O UPDATE é de COLUNA: marcar como lido não é licença para reescrever o aviso. */
select pg_temp.rec('4.4', 'o UPDATE de authenticated é só de read_at', 'false|true|false|false',
  has_table_privilege('authenticated', 'public.notifications', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'task_title', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'actor_name', 'update')::text);

select pg_temp.rec('4.5', 'ninguém logado insere aviso pela API', 'ERR:42501',
  pg_temp.exec_como((select user_bia from ids), (select tenant_b from ids), format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title)
       values (%L, %L, 'task_assigned', %L, 'Aviso forjado')$q$,
    (select tenant_b from ids), (select col_dir_b from ids), (select t_vizinha from ids))));

select pg_temp.rec('4.6', 'nem apaga aviso', 'ERR:42501',
  pg_temp.exec_como((select user_bia from ids), (select tenant_b from ids),
    'delete from public.notifications'));

select pg_temp.rec('4.7', 'nem reescreve o título copiado', 'ERR:42501',
  pg_temp.exec_como((select user_bia from ids), (select tenant_b from ids),
    $q$update public.notifications set task_title = 'outra coisa'$q$));

select pg_temp.rec('4.8', 'anon não alcança a tabela', 'ERR:42501',
  pg_temp.como_anon('select count(*)::text from public.notifications'));

/* A varredura escreve aviso de qualquer pessoa de qualquer escritório: é o que o
   agendamento precisa, e é por isso que ela não fica ao alcance de quem está
   logado. */
select pg_temp.rec('4.9', 'quem está logado NÃO executa a varredura', 'ERR:42501',
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids),
    'select public.scan_overdue_tasks()::text'));

select pg_temp.rec('4.10', 'anon também não', 'ERR:42501',
  pg_temp.como_anon('select public.scan_overdue_tasks()::text'));

select pg_temp.rec('4.11', 'service_role executa (é quem o agendamento usa), authenticated e anon não',
  'true|false|false',
  has_function_privilege('service_role', 'public.scan_overdue_tasks(uuid)', 'execute')::text || '|' ||
  has_function_privilege('authenticated', 'public.scan_overdue_tasks(uuid)', 'execute')::text || '|' ||
  has_function_privilege('anon', 'public.scan_overdue_tasks(uuid)', 'execute')::text);

select pg_temp.rec('4.12', 'o gatilho da atribuição não é chamável por quem está logado', 'false|false',
  has_function_privilege('authenticated', 'public.notify_task_assigned()', 'execute')::text || '|' ||
  has_function_privilege('anon', 'public.notify_task_assigned()', 'execute')::text);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
