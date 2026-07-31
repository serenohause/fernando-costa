-- Teste do modulo 6 (Atividades) - o recorte de leitura por pessoa e as regras
-- de negocio de activities.
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio, quatro policies,
--   WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios, colaborador afastado sem leitura,
--   escrita presa ao menu 'activities') estao em
--   supabase/tests/pattern-invariants.sql e cobrem activities desde que ela
--   entrou em pattern_tables. NADA disso se repete aqui.
--
--   Aqui fica o que o padrao nao tem como conhecer, listado em
--   docs/SCHEMA-PLAN.md, secao "Modulo 6 - Regra de negocio para o teste
--   proprio": o recorte de leitura por pessoa (secao 1, a razao de existir deste
--   arquivo), o tempo total calculado pelo banco, a conclusao amarrada ao status,
--   a exclusao logica em par, a posicao unica dentro do responsavel e o prazo nao
--   invertido.
--
-- POR QUE A SECAO 1 EXISTE, E POR QUE ELA TEM TANTO CONTROLE
--   activities e a PRIMEIRA tabela do sistema cuja leitura nao e larga. Em todos
--   os modulos anteriores qualquer colaborador active le tudo, e uma policy
--   escrita apertada demais apareceria na hora. Aqui nao: uma policy que negue
--   tudo produz exatamente a mesma tela de quem simplesmente nao tem atividade
--   nenhuma. Por isso metade dos casos afirma o que precisa CONTINUAR possivel -
--   o Arquiteto sem permissao de menu LE as proprias atividades, e o coordenador
--   LE as de quem coordena. Sem eles, uma policy quebrada passa com nota cheia.
--
-- COMO RODAR
--   npm run test:schema:activities
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou/devolveu n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23505 unicidade violada,
--                         428C9 escrita em coluna gerada.
--   Nos casos 2.x o observado e o VALOR devolvido, e nao contagem de linhas: uma
--   coluna gerada que calcule errado devolve uma linha do mesmo jeito.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug activities-schema-test-*), e nenhuma contagem e absoluta sobre
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

-- Sonda de VALOR, para a coluna gerada: pg_temp.try devolve contagem de linhas, e
-- uma coluna que calcule o numero errado devolve UMA linha do mesmo jeito.
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

-- Sonda que EXECUTA COMO OUTRA PESSOA, com claims de JWT. E o unico jeito de
-- exercitar a policy: postgres e dono da tabela e passa por cima da RLS, entao
-- uma leitura feita daqui pareceria recortada mesmo se a policy nao existisse.
create or replace function pg_temp.chk_as(p_caso text, p_desc text, p_expected text,
                                          p_sub uuid, p_tenant uuid, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint; v_state text; v_out text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_sub::text, 'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant::text))::text, true);
    execute p_sql;
    get diagnostics v_rows = row_count;
    perform set_config('role', 'postgres', true);
    v_out := 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    v_out := 'ERR:' || v_state;
  end;
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'f1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'f2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  -- Usuarios do escritorio A, um por recorte que a secao 1 exercita.
  'f1000000-0000-4000-8000-000000000001'::uuid as u_arch,
  'f1000000-0000-4000-8000-000000000002'::uuid as u_other_arch,
  'f1000000-0000-4000-8000-000000000003'::uuid as u_coord,
  'f1000000-0000-4000-8000-000000000004'::uuid as u_editor,
  'f1000000-0000-4000-8000-000000000005'::uuid as u_director,
  'f1000000-0000-4000-8000-000000000006'::uuid as u_leave,
  'f1100000-0000-4000-8000-000000000001'::uuid as c_arch,
  'f1100000-0000-4000-8000-000000000002'::uuid as c_other_arch,
  'f1100000-0000-4000-8000-000000000003'::uuid as c_coord,
  'f1100000-0000-4000-8000-000000000004'::uuid as c_editor,
  'f1100000-0000-4000-8000-000000000005'::uuid as c_director,
  'f1100000-0000-4000-8000-000000000006'::uuid as c_leave,
  'f2100000-0000-4000-8000-000000000001'::uuid as c_arch_b,
  'f1200000-0000-4000-8000-000000000001'::uuid as act_arch,
  'f1200000-0000-4000-8000-000000000002'::uuid as act_other_arch,
  'f1200000-0000-4000-8000-000000000003'::uuid as act_leave,
  'f1200000-0000-4000-8000-000000000004'::uuid as act_timed;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_arch from ids) u, 'activities-arch@example.test' e
  union all select (select u_other_arch from ids), 'activities-other-arch@example.test'
  union all select (select u_coord from ids), 'activities-coord@example.test'
  union all select (select u_editor from ids), 'activities-editor@example.test'
  union all select (select u_director from ids), 'activities-director@example.test'
  union all select (select u_leave from ids), 'activities-leave@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Activities Schema Test A', 'activities-schema-test-a'),
  ((select tenant_b from ids), 'Activities Schema Test B', 'activities-schema-test-b');

insert into public.tenant_users (tenant_id, user_id, role)
select (select tenant_a from ids), u, 'member' from (
  select (select u_arch from ids) u
  union all select (select u_other_arch from ids)
  union all select (select u_coord from ids)
  union all select (select u_editor from ids)
  union all select (select u_director from ids)
  union all select (select u_leave from ids)
) s;

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_coord from ids), (select tenant_a from ids), (select u_coord from ids),
   'Marina Rezende', 'coordinator', 'activities-coord@example.test', 'active'),
  ((select c_arch from ids), (select tenant_a from ids), (select u_arch from ids),
   'Tiago Barbosa', 'architect', 'activities-arch@example.test', 'active'),
  ((select c_other_arch from ids), (select tenant_a from ids), (select u_other_arch from ids),
   'Renata Peixoto', 'architect', 'activities-other-arch@example.test', 'active'),
  ((select c_editor from ids), (select tenant_a from ids), (select u_editor from ids),
   'Paulo Siqueira', 'admin_staff', 'activities-editor@example.test', 'active'),
  ((select c_director from ids), (select tenant_a from ids), (select u_director from ids),
   'Fernando Costa', 'director', 'activities-director@example.test', 'active'),
  ((select c_leave from ids), (select tenant_a from ids), (select u_leave from ids),
   'Camila Andrade', 'architect', 'activities-leave@example.test', 'on_leave'),
  ((select c_arch_b from ids), (select tenant_b from ids), null,
   'Rogerio Lemos', 'architect', 'activities-arch-b@example.test', 'active');

-- SO o editor recebe a linha de permissao. O Arquiteto e o Coordenador ficam sem
-- nenhuma, de proposito: e assim que o seed do modulo 1 os cria (architect e
-- intern recebem view: [] e edit: []), e e o que faz os casos 1.1 e 1.3 provarem
-- o RAMO NOVO da policy, e nao a permissao de menu. O Diretor tambem fica sem, e
-- passa pelo atalho da migration 0019.
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_editor from ids), 'activities', true, true);

-- Tres atividades no escritorio A: uma do Arquiteto (coordenada pela
-- Coordenadora), uma de OUTRA arquiteta (sem coordenador), e uma da colaboradora
-- afastada.
insert into public.activities
  (id, tenant_id, description, collaborator_id, coordinator_id, start_date, end_date) values
  ((select act_arch from ids), (select tenant_a from ids), 'Detalhar caixilhos da fachada',
   (select c_arch from ids), (select c_coord from ids), '2026-08-03', '2026-08-07'),
  ((select act_other_arch from ids), (select tenant_a from ids), 'Compatibilizar hidraulica',
   (select c_other_arch from ids), null, '2026-08-03', '2026-08-10'),
  ((select act_leave from ids), (select tenant_a from ids), 'Revisar memorial descritivo',
   (select c_leave from ids), null, '2026-08-03', '2026-08-12');

-- 1. O recorte de leitura por pessoa -------------------------------------------
--
-- Quem tem can_edit_menu('activities') le tudo; quem nao tem le so o que e dele
-- ou de quem coordena. Metade dos casos e CONTROLE - ver o cabecalho.

select pg_temp.chk_as('1.1', 'CONTROLE: Arquiteto SEM permissao de menu LE a PROPRIA atividade',
  'OK:1', (select u_arch from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where id = %L
$q$, (select act_arch from ids)));

select pg_temp.chk_as('1.2', 'Arquiteto NAO le a atividade de outro arquiteto do mesmo escritorio',
  'OK:0', (select u_arch from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where id = %L
$q$, (select act_other_arch from ids)));

select pg_temp.chk_as('1.3', 'CONTROLE: coordenador SEM permissao de menu LE a atividade de quem coordena',
  'OK:1', (select u_coord from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where id = %L
$q$, (select act_arch from ids)));

-- Sem este caso, "or coordinator_id = auth_collaborator_id()" nao se distingue de
-- "coordenador enxerga tudo": a atividade da outra arquiteta nao tem coordenador.
select pg_temp.chk_as('1.4', 'coordenador NAO le atividade de quem ele NAO coordena',
  'OK:0', (select u_coord from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where id = %L
$q$, (select act_other_arch from ids)));

select pg_temp.chk_as('1.5', 'CONTROLE: quem tem can_edit no menu activities le as TRES atividades',
  'OK:3', (select u_editor from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where tenant_id = %L
$q$, (select tenant_a from ids)));

-- Atalho de Diretor da migration 0019, agora valendo tambem para LEITURA: sem
-- ele, a Diretora sem linha de permissao veria uma tela vazia.
select pg_temp.chk_as('1.6', 'CONTROLE: Diretor SEM linha de permissao le as TRES atividades',
  'OK:3', (select u_director from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where tenant_id = %L
$q$, (select tenant_a from ids)));

-- O ramo novo do OR nao pode furar a regra transversal do sistema. auth_collaborator_id()
-- devolve null para quem esta afastado, e null nao casa com collaborator_id nenhum.
select pg_temp.chk_as('1.7', 'colaboradora AFASTADA nao le nem a propria atividade',
  'OK:0', (select u_leave from ids), (select tenant_a from ids), format($q$
  select 1 from public.activities where id = %L
$q$, (select act_leave from ids)));

-- 2. total_minutes e calculado pelo banco ---------------------------------------
--
-- No original o numero e calculado no navegador no clique de Concluir
-- (Atividades.jsx:205) e gravado. Aqui e coluna gerada: qualquer caminho de
-- escrita produz o mesmo valor, e o RelatorioProdutividade soma exatamente isso.

-- Atividade concluida das 09:00 as 10:30. Nao e caso, e a montagem do cenario:
-- se este INSERT falhar, o arquivo inteiro aborta, que e o desfecho certo.
insert into public.activities
  (id, tenant_id, description, collaborator_id, start_date, end_date,
   status, started_at, completed_at)
values ((select act_timed from ids), (select tenant_a from ids), 'Compatibilizar estrutural',
        (select c_arch from ids), '2026-08-03', '2026-08-04',
        'completed', '2026-08-03 09:00:00-03', '2026-08-03 10:30:00-03');

select pg_temp.val('2.1', 'noventa minutos, calculados pelo banco', '90', format($q$
  select total_minutes::text from public.activities where id = %L
$q$, (select act_timed from ids)));

-- Coluna gerada nao aceita valor da aplicacao: 428C9 e o Postgres recusando a
-- escrita, e nao um check. E o que impede a conta do original voltar por uma
-- tela nova.
select pg_temp.chk('2.2', 'escrita direta em total_minutes e recusada', 'ERR:428C9', format($q$
  update public.activities set total_minutes = 5 where id = %L
$q$, (select act_timed from ids)));

-- 3. Conclusao amarrada ao status, nos dois sentidos ----------------------------

select pg_temp.chk('3.1', 'atividade concluida SEM data/hora de conclusao e recusada', 'ERR:23514', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date, status)
  values (%L, 'Enviar prancha para plotagem', %L, '2026-08-03', '2026-08-05', 'completed')
$q$, (select tenant_a from ids), (select c_arch from ids)));

select pg_temp.chk('3.2', 'data/hora de conclusao em atividade em andamento e recusada', 'ERR:23514', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date,
                                 status, completed_at)
  values (%L, 'Enviar prancha para plotagem', %L, '2026-08-03', '2026-08-05',
          'in_progress', '2026-08-04 12:00:00-03')
$q$, (select tenant_a from ids), (select c_arch from ids)));

select pg_temp.chk('3.3', 'CONTROLE: concluida COM data/hora entra', 'OK:1', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date,
                                 status, completed_at)
  values (%L, 'Enviar prancha para plotagem', %L, '2026-08-03', '2026-08-05',
          'completed', '2026-08-04 12:00:00-03')
$q$, (select tenant_a from ids), (select c_arch from ids)));

-- Conclusao antes do inicio daria tempo total NEGATIVO, abatendo hora trabalhada
-- de verdade na soma do relatorio.
select pg_temp.chk('3.4', 'inicio posterior a conclusao e recusado', 'ERR:23514', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date,
                                 status, started_at, completed_at)
  values (%L, 'Revisar planta de cobertura', %L, '2026-08-03', '2026-08-05',
          'completed', '2026-08-04 15:00:00-03', '2026-08-04 09:00:00-03')
$q$, (select tenant_a from ids), (select c_arch from ids)));

-- 4. Exclusao logica: deleted_at e deleted_by andam juntos ----------------------

select pg_temp.chk('4.1', 'data de exclusao SEM autor e recusada', 'ERR:23514', format($q$
  update public.activities set deleted_at = now() where id = %L
$q$, (select act_other_arch from ids)));

select pg_temp.chk('4.2', 'autor da exclusao SEM data e recusado', 'ERR:23514', format($q$
  update public.activities set deleted_by = %L where id = %L
$q$, (select c_editor from ids), (select act_other_arch from ids)));

select pg_temp.chk('4.3', 'CONTROLE: os dois juntos excluem', 'OK:1', format($q$
  update public.activities set deleted_at = now(), deleted_by = %L where id = %L
$q$, (select c_editor from ids), (select act_other_arch from ids)));

-- 5. A posicao na fila e unica DENTRO do responsavel ----------------------------
--
-- A constraint e DEFERRABLE INITIALLY DEFERRED, para que reordenar a lista
-- inteira (1..n) em uma transacao nao colida no meio do caminho. Diferida, ela so
-- falaria no COMMIT - e este arquivo termina em ROLLBACK. Por isso a checagem e
-- adiantada aqui: sem esta linha, os dois casos abaixo observariam OK:1 e o
-- teste passaria a afirmar nada.
set constraints public.activities_tenant_id_collaborator_id_execution_order_key immediate;

-- Montagem: a atividade do Arquiteto ocupa a posicao 1 da fila DELE.
update public.activities set execution_order = 1 where id = (select act_arch from ids);

select pg_temp.chk('5.1', 'mesma posicao para o MESMO responsavel e recusada', 'ERR:23505', format($q$
  update public.activities set execution_order = 1 where id = %L
$q$, (select act_timed from ids)));

-- O contrario do que uma chave (tenant_id, execution_order) faria. A fila e por
-- pessoa: duas pessoas tem, cada uma, a sua posicao 1.
select pg_temp.chk('5.2', 'CONTROLE: mesma posicao para OUTRO responsavel entra', 'OK:1', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date, execution_order)
  values (%L, 'Levantar as built', %L, '2026-08-03', '2026-08-06', 1)
$q$, (select tenant_a from ids), (select c_other_arch from ids)));

-- 6. Prazo nao invertido ---------------------------------------------------------

select pg_temp.chk('6.1', 'termino anterior ao inicio e recusado', 'ERR:23514', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date)
  values (%L, 'Reuniao de alinhamento', %L, '2026-08-10', '2026-08-09')
$q$, (select tenant_a from ids), (select c_arch from ids)));

-- Comecar e terminar no mesmo dia e o caso mais comum da tela: reuniao, revisao
-- rapida. Sem este controle, um check escrito com > em vez de >= passaria em 6.1.
select pg_temp.chk('6.2', 'CONTROLE: inicio e termino no mesmo dia entram', 'OK:1', format($q$
  insert into public.activities (tenant_id, description, collaborator_id, start_date, end_date)
  values (%L, 'Reuniao de alinhamento', %L, '2026-08-10', '2026-08-10')
$q$, (select tenant_a from ids), (select c_arch from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
