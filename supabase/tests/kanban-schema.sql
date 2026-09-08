-- O quadro configurável, e a escala de progresso que passou a morar nele.
--
-- O QUE ELE PROVA
--   A migration 0093 tirou a escala de percentual de dentro de
--   `project_progress` e a pôs numa tabela que o escritório edita. Isso troca
--   uma constante revisada em code review por uma linha de banco — e o modo de
--   falha novo é SILENCIOSO: fase sem linha em `kanban_columns` some do cálculo
--   sem erro nenhum, e o projeto exibe um número menor sem que nada acuse.
--
--   Por isso o caso 1 é o mais importante do arquivo: ele repete a escala da
--   0080 por extenso e confere valor por valor. É a segunda cópia de propósito
--   — é ela que acusa a divergência.
--
--   O caso 2 prova o outro lado: que o campo é MESMO a fonte, e não uma tabela
--   decorativa ao lado de um CASE que ficou para trás.
--
-- COMO RODAR
--   npm run test:kanban
--
-- RESIDUO
--   Nenhum. Uma transação terminada em ROLLBACK, com tenants próprios
--   (slug kanban-*).

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

/* Roda um comando COMO o usuário indicado e devolve quantas linhas ele atingiu,
   ou o SQLSTATE se o banco recusou. Distinguir os dois importa: policy de
   UPDATE que não casa não dá erro, dá ZERO LINHAS — e "zero linhas" é o
   resultado que a maioria dos casos negativos daqui espera. */
create or replace function pg_temp.exec_as(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return n::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

/* O mesmo, mas como postgres: para provar RESTRIÇÃO de tabela, que nenhum
   privilégio contorna, em comando que não tem policy nesta fatia. */
create or replace function pg_temp.exec_pg(p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    return n::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    return 'ERR:' || st;
  end;
end; $$;

create or replace function pg_temp.conta_as(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into n;
    perform set_config('role', 'postgres', true);
    return n::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    return 'ERR:' || st;
  end;
end; $$;

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'caaa0000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'caaa0000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'caaa0000-0000-4000-8000-00000000001a'::uuid as user_dir_a,
  'caaa0000-0000-4000-8000-00000000002a'::uuid as user_arq_a,
  'caaa0000-0000-4000-8000-00000000003a'::uuid as user_cfg_a,
  'caaa0000-0000-4000-8000-00000000004a'::uuid as col_dir_a,
  'caaa0000-0000-4000-8000-00000000005a'::uuid as col_arq_a,
  'caaa0000-0000-4000-8000-00000000006a'::uuid as col_cfg_a,
  'caaa0000-0000-4000-8000-00000000007a'::uuid as projeto_a,
  'caaa0000-0000-4000-8000-00000000008a'::uuid as tarefa_a;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_dir_a from ids) u, 'kanban-dir-a@example.test' e
  union all select (select user_arq_a from ids), 'kanban-arq-a@example.test'
  union all select (select user_cfg_a from ids), 'kanban-cfg-a@example.test'
) s;

/* Os dois escritórios nascem AQUI, e é o gatilho `tenants_seed_kanban` que lhes
   dá o quadro — nenhuma linha de kanban_* é inserida à mão neste arquivo. Ou
   seja: todo caso abaixo roda sobre o que o gatilho produziu, e o caso 6.1
   confere que ele produziu as quinze etapas. */
insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Kanban A', 'kanban-a'),
  ((select tenant_b from ids), 'Kanban B', 'kanban-b');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_dir_a from ids), (select tenant_a from ids), (select user_dir_a from ids),
   'Diretora A', 'dir@kanban-a.test', 'director', 'administrative', 'active'),
  /* Arquiteto SEM o menu Configurações: o negativo. */
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq@kanban-a.test', 'architect', 'projects', 'active'),
  /* Arquiteto COM can_edit em `settings`: sem ele, o positivo seria só a
     Diretora, e a Diretora passa pelo atalho de papel de `can_edit_menu` (0019)
     — o caso provaria privilégio de papel, não a policy. */
  ((select col_cfg_a from ids), (select tenant_a from ids), (select user_cfg_a from ids),
   'Arquiteta Config', 'cfg@kanban-a.test', 'architect', 'projects', 'active');

insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_arq_a from ids), 'projects', true, true),
  /* Escrever em `tasks` é `can_edit_menu('project_flow')`, e NÃO o menu
     Projetos: são recortes diferentes, e é essa diferença que o caso 4.2 usa
     para provar que a etapa criada recebe tarefa de verdade. */
  ((select tenant_a from ids), (select col_arq_a from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select col_arq_a from ids), 'settings', true, false),
  ((select tenant_a from ids), (select col_cfg_a from ids), 'settings', true, true);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select projeto_a from ids), (select tenant_a from ids), 'Projeto Kanban', 'architecture');

insert into public.tasks (id, tenant_id, project_id, title, phase, status) values
  ((select tarefa_a from ids), (select tenant_a from ids), (select projeto_a from ids),
   'Tarefa em Layout', 'layout', 'in_progress');

create or replace function pg_temp.fase_pct() returns text language sql as $$
  select phase_percent::text from public.project_progress
   where project_id = (select projeto_a from ids)
$$;

create or replace function pg_temp.pct(p_key text) returns text language sql as $$
  select coalesce(c.progress_percent::text, '(nulo)')
  from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
  where c.tenant_id = (select tenant_a from ids) and b.key = 'project_flow' and c.key = p_key
$$;

-- 1. A ESCALA FOI TRANSCRITA, e não reinventada -------------------------------
--
--    Os quinze valores abaixo são os do CASE da migration 0080, copiados um a
--    um. Se algum divergir do que a 0093 semeou, o progresso de projeto real
--    mudou de número — e este é o único lugar que acusa.

select pg_temp.rec('1.' || row_number() over (order by esperado_ordem),
  'escala: ' || fase || ' vale ' || esperado,
  esperado, pg_temp.pct(fase))
from (values
  ('not_started','0',1), ('briefing','12',2), ('preliminary_study','(nulo)',3),
  ('layout','26',4), ('preliminary_design','(nulo)',5), ('renderings','50',6),
  ('revision','55',7), ('legal_permit','70',8), ('hoa_approval','75',9),
  ('construction_docs','80',10), ('engineering_docs','90',11),
  ('building_permit','100',12), ('under_construction','100',13),
  ('awaiting_client','(nulo)',14), ('finished','100',15)
) as v(fase, esperado, esperado_ordem);

/* TODA fase que uma tarefa pode ter precisa de linha, senão ela some da escala
   em silêncio. `post_approval` fica de fora porque tarefa não a aceita
   (`tasks_phase_no_post_approval_check`, 0049). Quem acrescentar valor ao enum
   project_phase quebra ESTE caso — que é o ponto. */
/* Toda fase que o enum oferecia continua tendo etapa, senão o histórico já
   gravado ficaria sem rótulo e sem percentual. `post_approval` fica de fora
   porque nunca foi fase de tarefa - é só do checklist de orçamento (0049). */
select pg_temp.rec('1.16', 'toda fase do enum antigo virou etapa (menos post_approval)', '(nenhuma sobrando)',
  coalesce((
    select string_agg(f::text, ', ')
    from unnest(enum_range(null::public.project_phase)) f
    where f <> 'post_approval'
      and not exists (
        select 1 from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
        where c.tenant_id = (select tenant_a from ids) and b.key = 'project_flow' and c.key = f::text)
  ), '(nenhuma sobrando)'));

select pg_temp.rec('1.17', 'post_approval NÃO vira etapa: nenhuma tarefa pode alcançá-la', '0',
  (select count(*)::text from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
    where c.tenant_id = (select tenant_a from ids) and b.key = 'project_flow'
      and c.key = 'post_approval'));

-- 2. O CAMPO É MESMO A FONTE ---------------------------------------------------
--
--    Sem estes casos, tudo acima passaria com a tabela existindo ao lado de um
--    CASE que ficou para trás dentro da view.

select pg_temp.rec('2.1', 'CONTROLE: tarefa em Layout dá 26 ao projeto', '26', pg_temp.fase_pct());

update public.kanban_columns c set progress_percent = 33
from public.kanban_boards b
where b.id = c.board_id and c.tenant_id = (select tenant_a from ids)
  and b.key = 'project_flow' and c.key = 'layout';

select pg_temp.rec('2.2', 'mudar o percentual da etapa muda o progresso do projeto', '33', pg_temp.fase_pct());

update public.kanban_columns c set progress_percent = null
from public.kanban_boards b
where b.id = c.board_id and c.tenant_id = (select tenant_a from ids)
  and b.key = 'project_flow' and c.key = 'layout';

/* NULO é "não entra na conta", não "vale zero" — significado que a 0075 deu e a
   0093 preservou. Com a única tarefa do projeto numa etapa sem percentual, não
   sobra fase nenhuma e o coalesce final da view devolve 0. */
select pg_temp.rec('2.3', 'percentual nulo tira a etapa da conta (única tarefa: cai no coalesce)', '0',
  pg_temp.fase_pct());

update public.kanban_columns c set progress_percent = 26
from public.kanban_boards b
where b.id = c.board_id and c.tenant_id = (select tenant_a from ids)
  and b.key = 'project_flow' and c.key = 'layout';

/* O quadro do escritório vizinho NÃO pode entrar na conta do meu projeto: seria
   o vazamento mais discreto possível, porque o número continuaria plausível. */
update public.kanban_columns c set progress_percent = 99
from public.kanban_boards b
where b.id = c.board_id and c.tenant_id = (select tenant_b from ids)
  and b.key = 'project_flow' and c.key = 'layout';

select pg_temp.rec('2.4', 'a escala do escritório VIZINHO não afeta meu projeto', '26', pg_temp.fase_pct());

-- 3. Quem configura ------------------------------------------------------------

select pg_temp.rec('3.1', 'Arquiteto SEM can_edit em settings não renomeia etapa', '0',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set label = 'Invadido' where key = 'layout'$q$));

select pg_temp.rec('3.2', 'CONTROLE: Arquiteta COM can_edit em settings renomeia', '1',
  pg_temp.exec_as((select user_cfg_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set label = 'Layout renomeado' where key = 'layout'$q$));

select pg_temp.rec('3.3', 'CONTROLE: a Diretora também renomeia', '1',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set label = 'Layout da diretoria' where key = 'layout'$q$));

select pg_temp.rec('3.4', 'CONTROLE: e renomeia o quadro', '1',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_boards set name = 'Meu Fluxo' where key = 'project_flow'$q$));

/* A escrita de A não alcança B mesmo com o mesmo comando e a mesma chave. */
select pg_temp.rec('3.5', 'a Diretora de A não altera etapa de B', '0',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set label = 'Vizinho' where tenant_id = 'caaa0000-0000-4000-8000-00000000000b'$q$));

select pg_temp.rec('3.6', 'e não LÊ as etapas de B', '0',
  pg_temp.conta_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$select count(*) from public.kanban_columns where tenant_id = 'caaa0000-0000-4000-8000-00000000000b'$q$));

select pg_temp.rec('3.7', 'CONTROLE: lê as 15 do próprio escritório', '15',
  pg_temp.conta_as((select user_arq_a from ids), (select tenant_a from ids),
    $q$select count(*) from public.kanban_columns$q$));

/* A leitura é larga DE PROPÓSITO, e este caso é o que registra o porquê:
   `project_progress` é security invoker, então quem não lê kanban_columns vê o
   progresso cair para 0 SEM ERRO. O Arquiteto sem o menu Configurações precisa
   ler as etapas. */
select pg_temp.rec('3.8', 'Arquiteto sem o menu Configurações ainda vê o progresso certo', '26',
  pg_temp.conta_as((select user_arq_a from ids), (select tenant_a from ids),
    $q$select phase_percent from public.project_progress where project_id = 'caaa0000-0000-4000-8000-00000000007a'$q$));

-- 4. Criar e excluir etapa -------------------------------------------------------
--
--    Passaram a existir na 0094, quando `tasks.phase` deixou de ser o enum. O
--    que os torna seguros não é a policy: é a FK `tasks_phase_fkey` (restrict),
--    que recusa apagar etapa com tarefa dentro, e o gatilho que protege as duas
--    etapas estruturais.

select pg_temp.rec('4.1', 'a etapa criada pelo escritório recebe tarefa', '1',
  pg_temp.exec_as((select user_cfg_a from ids), (select tenant_a from ids),
    $q$insert into public.kanban_columns (tenant_id, board_id, key, label, color, display_order, progress_percent)
       select b.tenant_id, b.id, 'aprovacao_cliente', 'Aprovação do Cliente', 'rose', 20, 60
       from public.kanban_boards b
       where b.key = 'project_flow' and b.tenant_id = 'caaa0000-0000-4000-8000-00000000000a'$q$));

select pg_temp.rec('4.2', 'CONTROLE: e a tarefa realmente vai para ela', '1',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids),
    $q$update public.tasks set phase = 'aprovacao_cliente'
       where id = 'caaa0000-0000-4000-8000-00000000008a'$q$));

/* A PROVA DE QUE A ETAPA NOVA É ETAPA DE VERDADE: ela entra na escala de
   progresso como qualquer outra. Sem isto, criar etapa daria uma coluna
   decorativa que zera o progresso de quem entra nela. */
select pg_temp.rec('4.3', 'a etapa criada entra na escala de progresso', '60', pg_temp.fase_pct());

/* O gesto perigoso, barrado pelo BANCO e não pela tela. */
select pg_temp.rec('4.4', 'não se exclui etapa com tarefa dentro', 'ERR:23503',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$delete from public.kanban_columns where key = 'aprovacao_cliente'$q$));

select pg_temp.rec('4.5', 'CONTROLE: movida a tarefa, a etapa é excluída', '1',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$with movidas as (
         update public.tasks set phase = 'layout' where phase = 'aprovacao_cliente' returning 1)
       delete from public.kanban_columns
       where key = 'aprovacao_cliente' and (select count(*) from movidas) >= 0$q$));

/* As duas etapas estruturais: são o que calculateProjectPhase grava sozinho em
   projects.current_phase (projeto sem tarefas, projeto concluído). */
select pg_temp.rec('4.6', '"Não iniciado" não pode ser excluída', 'ERR:P0001',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$delete from public.kanban_columns where key = 'not_started'$q$));

select pg_temp.rec('4.7', '"Finalizado" também não', 'ERR:P0001',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$delete from public.kanban_columns where key = 'finished'$q$));

select pg_temp.rec('4.8', 'Arquiteto SEM can_edit em settings não cria etapa', 'ERR:42501',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids),
    $q$insert into public.kanban_columns (tenant_id, board_id, key, label, display_order)
       select b.tenant_id, b.id, 'invadida', 'Invadida', 30 from public.kanban_boards b
       where b.key = 'project_flow' and b.tenant_id = 'caaa0000-0000-4000-8000-00000000000a'$q$));

select pg_temp.rec('4.9', 'nem exclui', '0',
  pg_temp.exec_as((select user_arq_a from ids), (select tenant_a from ids),
    $q$delete from public.kanban_columns where key = 'revision'$q$));

/* A ETAPA E DO ESCRITORIO, e a FK e por (tenant_id, key): a tarefa de A nao
   pode apontar para uma etapa que so existe em B. */
select pg_temp.rec('4.10', 'tarefa não aponta para etapa inexistente no escritório', 'ERR:23503',
  pg_temp.exec_pg(
    $q$update public.tasks set phase = 'etapa_que_nao_existe'
       where id = 'caaa0000-0000-4000-8000-00000000008a'$q$));

select pg_temp.rec('4.11', 'quadro não se apaga: sem policy de DELETE', '0',
  (select count(*)::text from pg_policies
    where schemaname='public' and tablename='kanban_boards' and cmd='DELETE'));

-- 5. Invariantes de forma ------------------------------------------------------

/* Duas etapas com a mesma chave dividiriam as mesmas tarefas em dois lugares, e
   arrastar entre elas não mudaria nada — o cartão voltaria sozinho. Desde a 0094
   esta unicidade é também o ALVO da chave estrangeira de `tasks`. */
select pg_temp.rec('5.1', 'duas etapas com a mesma chave são recusadas', 'ERR:23505',
  pg_temp.exec_pg(
    $q$update public.kanban_columns c set key = 'briefing'
       from public.kanban_boards b
       where b.id = c.board_id and b.key = 'project_flow'
         and c.tenant_id = 'caaa0000-0000-4000-8000-00000000000a' and c.key = 'layout'$q$));

select pg_temp.rec('5.2', 'percentual fora de 0..100 é recusado', 'ERR:23514',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set progress_percent = 140 where key = 'layout'$q$));

select pg_temp.rec('5.3', 'rótulo em branco é recusado', 'ERR:23514',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set label = '   ' where key = 'layout'$q$));

/* A cor é NOME, nunca classe do Tailwind: classe vinda do banco não entra no CSS
   e a cor sumiria sem erro nenhum. O check é o que impede alguém de gravar
   'bg-blue-100' aqui achando que funciona. */
select pg_temp.rec('5.4', 'classe do Tailwind na cor é recusada', 'ERR:23514',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set color = 'bg-blue-100' where key = 'layout'$q$));

select pg_temp.rec('5.5', 'CONTROLE: nome de cor é aceito', '1',
  pg_temp.exec_as((select user_dir_a from ids), (select tenant_a from ids),
    $q$update public.kanban_columns set color = 'rose' where key = 'layout'$q$));

-- 6. O escritório novo nasce com o quadro --------------------------------------
--
--    Sem o gatilho, o quadro dele abriria sem coluna nenhuma e todo projeto dele
--    exibiria 0% — porque a escala mudou de lugar na 0093.

select pg_temp.rec('6.1', 'escritório novo nasce com as 15 etapas', '15',
  (select count(*)::text from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
    where c.tenant_id = (select tenant_b from ids) and b.key = 'project_flow'));

select pg_temp.rec('6.2', 'e com as 10 desenhadas no quadro', '10',
  (select count(*)::text from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
    where c.tenant_id = (select tenant_b from ids) and b.key = 'project_flow' and c.is_active));

/* A semeadura da migration e a do gatilho de escritório novo são duas cópias da
   mesma lista de quinze linhas. Este caso é o que impede que uma seja corrigida
   e a outra não — divergência que só apareceria no primeiro escritório criado
   depois da mudança, ou seja, tarde.

   `layout` fica de fora da comparação porque os casos 2, 3 e 5 mexem nela de
   propósito (percentual, rótulo e cor) no escritório A. Compará-la aqui faria
   este caso falhar por causa do próprio teste. As outras quatorze bastam: a
   lista é uma só, e um erro de transcrição não escolheria justamente a linha
   excluída. */
select pg_temp.rec('6.3', 'a escala do escritório novo é idêntica à do antigo', 'idênticas',
  case when (
    select count(*) from (
      select c.key, c.label, c.color, c.display_order, c.progress_percent, c.is_active
      from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
      where c.tenant_id = (select tenant_b from ids) and b.key = 'project_flow' and c.key <> 'layout'
      except
      select c.key, c.label, c.color, c.display_order, c.progress_percent, c.is_active
      from public.kanban_columns c join public.kanban_boards b on b.id = c.board_id
      where c.tenant_id = (select tenant_a from ids) and b.key = 'project_flow' and c.key <> 'layout') d) = 0
  then 'idênticas' else 'divergem' end);

-- 7. Quem alcança as tabelas ---------------------------------------------------

select pg_temp.rec('7.1', 'anon não lê o quadro', 'false',
  has_table_privilege('anon', 'public.kanban_columns', 'select')::text);

select pg_temp.rec('7.2', 'CONTROLE: authenticated lê', 'true',
  has_table_privilege('authenticated', 'public.kanban_columns', 'select')::text);

/* O grant é o que decide se o comando chega a ser TENTADO; a policy decide
   quais linhas. A 0084 criou as policies e esqueceu o grant, e o sintoma foi
   42501 para todo mundo. */
select pg_temp.rec('7.3', 'authenticated tem o grant de UPDATE (a policy é que filtra)', 'true',
  has_table_privilege('authenticated', 'public.kanban_columns', 'update')::text);

select pg_temp.rec('7.4', 'authenticated tem o grant de INSERT (a policy é que filtra)', 'true',
  has_table_privilege('authenticated', 'public.kanban_columns', 'insert')::text);

select pg_temp.rec('7.6', 'tasks.phase é texto, e não mais o enum', 'text',
  (select data_type from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='phase'));

select pg_temp.rec('7.7', 'a chave estrangeira da etapa existe e é RESTRICT', 'r',
  (select confdeltype::text from pg_constraint where conname = 'tasks_phase_fkey'));

select pg_temp.rec('7.5', 'RLS ligada nas duas', 'true',
  ((select relrowsecurity from pg_class where oid = 'public.kanban_columns'::regclass)
   and (select relrowsecurity from pg_class where oid = 'public.kanban_boards'::regclass))::text);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
