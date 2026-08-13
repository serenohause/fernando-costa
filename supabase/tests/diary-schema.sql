-- Teste do modulo 11 (Diario do Projeto) - o que e especifico destas cinco
-- tabelas, dos dois triggers, da funcao de gravacao automatica e do bucket.
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio de tabela, quatro
--   policies, WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios nos dois sentidos, colaborador
--   afastado sem leitura, escrita presa a quem pode escrever) estao em
--   supabase/tests/pattern-invariants.sql e cobrem as cinco tabelas desde que
--   elas entraram em pattern_tables. NADA disso se repete aqui.
--
-- POR QUE A SECAO 1 E A MAIS IMPORTANTE DO ARQUIVO
--   Este e o unico modulo do sistema cuja escrita NAO passa por can_edit_menu.
--   Decisao do usuario: so Diretor e Coordenador escrevem no diario, como na
--   versao nova do base44. Isso cria um modo de falha silencioso, e ele e o
--   motivo de a migration 0070 existir do jeito que existe: o evento automatico
--   (mover cartao, trocar responsavel, marcar tag) nasce dentro de uma escrita
--   que um ARQUITETO faz, e os sete Arquitetos do escritorio real tem
--   can_edit_menu('project_flow'). Se a policy do diario valesse para o evento
--   automatico, o arraste do Arquiteto pararia de registrar - e pararia em
--   silencio, porque o original ja engole o erro (diaryAutoEvents.js:32).
--
--   Os casos 1.1 a 1.4 sao o quadrado inteiro dessa decisao:
--     1.1  Arquiteto COM o menu do fluxo NAO escreve a mao
--     1.2  o MESMO Arquiteto grava o evento automatico pela funcao
--     1.3  Coordenador SEM permissao de menu nenhuma escreve a mao
--     1.4  o MESMO Coordenador NAO grava evento automatico pela funcao
--   Os quatro juntos afirmam que os dois caminhos sao disjuntos e que cada um le
--   a autorizacao que devia ler. Um sozinho nao afirma nada.
--
-- POR QUE A SECAO 10 EXISTE
--   Bucket novo, e nao existe suite de padrao para Storage: storage.objects nao
--   e tabela do projeto, tem RLS ligada pelo Supabase e concede TUDO a anon e a
--   authenticated por padrao. Ali a policy nao e uma das duas metades da tranca -
--   e a unica.
--
-- COMO RODAR
--   npm run test:schema:diary
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou/devolveu n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23503 FK violada,
--                         23505 unicidade violada, 42501 policy/privilegio.
--   Nas chamadas da funcao o observado e a MENSAGEM do erro P0001
--   ('ERR:not_authorized'), e nao o sqlstate: os quatro erros de negocio dela
--   compartilham o mesmo estado, e distinguir qual deles apareceu e o ponto.
--   Nas secoes de valor o observado e o que a consulta devolveu.
--
--   TODO caso de negacao tem um CONTROLE ao lado. Este projeto ja teve teste de
--   negacao passar por falta de GRANT em vez de resultado vazio (migration 0036),
--   e quem acusou foi o controle.
--
-- O QUE ESTE ARQUIVO NAO CONSEGUE EXERCITAR, e fica declarado
--   CONCORRENCIA DE VERDADE. O canal deste teste e a Management API: uma
--   requisicao, uma conexao, uma transacao. Duas sessoes simultaneas nao existem
--   aqui. O que a secao 5 poe no lugar sao as tres coisas que sustentam a
--   alocacao do numero da pendencia, cada uma verificavel sozinha: (a) a
--   sequencia sai certa e sem buraco; (b) o advisory lock e REALMENTE tomado, e
--   e por projeto - e ele que serializa duas transacoes concorrentes; (c) a
--   unicidade (project_id, issue_number) recusa o numero repetido mesmo quando o
--   lock nao entra na conversa, que e a garantia que nao depende de tempo. Mais
--   o caso 5.7, que reproduz sem concorrencia nenhuma o defeito do original:
--   contar linhas em vez de olhar o maior numero ja repete numero sozinho.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug diary-schema-test-*) e os objetos de Storage sao inseridos na
--   mesma transacao. Nenhuma contagem e absoluta sobre tabela de negocio.

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

-- Sonda de VALOR: pg_temp.try devolve contagem de linhas, e uma coluna que
-- responda errado devolve UMA linha do mesmo jeito.
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
-- exercitar a policy: postgres tem BYPASSRLS neste projeto e passa por cima da
-- RLS de qualquer tabela, inclusive storage.objects.
--
-- Ela LIMPA o claim ao sair, diferente da irma em budget-schema.sql. Aqui isso
-- importa: o trigger de historico de project_issues resolve o autor pelo claim
-- da sessao (0069/0072), e um claim esquecido faria a proxima escrita feita como
-- postgres gravar um autor que ninguem escolheu - e a secao 7 afirma exatamente
-- quando o autor e nulo.
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
    v_out := 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_out := 'ERR:' || v_state;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- A mesma coisa, devolvendo VALOR - e, no erro, a MENSAGEM em vez do sqlstate.
-- E o que a secao 1 precisa: os quatro erros de negocio de
-- record_project_diary_event sao todos P0001, e o que distingue "nao autorizado"
-- de "projeto nao existe" e a mensagem.
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
  exception when others then
    get stacked diagnostics v_state = message_text;
    v_out := 'ERR:' || v_state;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into res (caso, descricao, expected, observed)
  values (p_caso, p_desc, p_expected, coalesce(v_out, '<null>'));
end;
$$;

-- A mesma coisa para anon, que nao tem claim nenhum.
create or replace function pg_temp.chk_anon(p_caso text, p_desc text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint; v_state text; v_out text;
begin
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_out := 'OK:' || v_rows;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_out := 'ERR:' || v_state;
  end;
  perform set_config('role', 'postgres', true);
  insert into res (caso, descricao, expected, observed) values (p_caso, p_desc, p_expected, v_out);
end;
$$;

-- Fixtures --------------------------------------------------------------------

create temp table ids on commit drop as select
  'd1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'd2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  -- O quadrado da secao 1: um Arquiteto COM o menu do fluxo, um Coordenador SEM
  -- permissao de menu nenhuma, e um Coordenador afastado COM o menu.
  'd1000000-0000-4000-8000-000000000001'::uuid as u_arch,
  'd1000000-0000-4000-8000-000000000002'::uuid as u_coord,
  'd1000000-0000-4000-8000-000000000003'::uuid as u_leave,
  'd2000000-0000-4000-8000-000000000001'::uuid as u_coord_b,
  'd1100000-0000-4000-8000-000000000001'::uuid as c_arch,
  'd1100000-0000-4000-8000-000000000002'::uuid as c_coord,
  'd1100000-0000-4000-8000-000000000003'::uuid as c_leave,
  'd2100000-0000-4000-8000-000000000001'::uuid as c_coord_b,
  'd1200000-0000-4000-8000-000000000001'::uuid as cli_a,
  'd2200000-0000-4000-8000-000000000001'::uuid as cli_b,
  -- proj_a e o projeto geral; proj_num e exclusivo da secao 5 (a contagem de
  -- pendencias precisa de um cenario que nenhuma outra secao toca); proj_never
  -- nunca recebe pendencia, e o controle negativo do advisory lock.
  'd1300000-0000-4000-8000-000000000001'::uuid as proj_a,
  'd1300000-0000-4000-8000-000000000002'::uuid as proj_num,
  'd1300000-0000-4000-8000-000000000003'::uuid as proj_never,
  'd2300000-0000-4000-8000-000000000001'::uuid as proj_b,
  -- entry_man e manual, entry_auto e automatica (gravada pela funcao mais
  -- adiante), entry_link e a que a visita reivindica, entry_files e a mae dos
  -- arquivos da secao 8.
  'd1400000-0000-4000-8000-000000000001'::uuid as entry_man,
  'd1400000-0000-4000-8000-000000000002'::uuid as entry_link,
  'd1400000-0000-4000-8000-000000000003'::uuid as entry_files,
  'd1400000-0000-4000-8000-000000000004'::uuid as entry_del,
  'd2400000-0000-4000-8000-000000000001'::uuid as entry_b,
  'd1500000-0000-4000-8000-000000000001'::uuid as visit_a,
  'd1500000-0000-4000-8000-000000000002'::uuid as visit_del,
  'd2500000-0000-4000-8000-000000000001'::uuid as visit_b,
  -- issue_hist e a da secao 7 (o historico dela e contado); issue_del cai junto
  -- com o teste de cascade.
  'd1600000-0000-4000-8000-000000000001'::uuid as issue_a,
  'd1600000-0000-4000-8000-000000000002'::uuid as issue_hist,
  'd1600000-0000-4000-8000-000000000003'::uuid as issue_del,
  'd2600000-0000-4000-8000-000000000001'::uuid as issue_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_arch from ids) u, 'diary-arch@example.test' e
  union all select (select u_coord from ids), 'diary-coord@example.test'
  union all select (select u_leave from ids), 'diary-leave@example.test'
  union all select (select u_coord_b from ids), 'diary-coord-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Diary Schema Test A', 'diary-schema-test-a'),
  ((select tenant_b from ids), 'Diary Schema Test B', 'diary-schema-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_arch from ids), 'member'),
  ((select tenant_a from ids), (select u_coord from ids), 'member'),
  ((select tenant_a from ids), (select u_leave from ids), 'member'),
  ((select tenant_b from ids), (select u_coord_b from ids), 'member');

-- Nenhum deles e Diretor, de proposito: Diretor tem atalho em can_edit_menu
-- (0019) E passa em is_project_diary_writer(), entao ele passaria em tudo por
-- duas razoes ao mesmo tempo e o teste nao saberia dizer qual funciona.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_arch from ids), (select tenant_a from ids), (select u_arch from ids),
   'Camila Nogueira', 'architect', 'diary-arch@example.test', 'active'),
  ((select c_coord from ids), (select tenant_a from ids), (select u_coord from ids),
   'Rafael Andrade', 'coordinator', 'diary-coord@example.test', 'active'),
  ((select c_leave from ids), (select tenant_a from ids), (select u_leave from ids),
   'Juliana Prado', 'coordinator', 'diary-leave@example.test', 'on_leave'),
  ((select c_coord_b from ids), (select tenant_b from ids), (select u_coord_b from ids),
   'Sergio Alencar', 'coordinator', 'diary-coord-b@example.test', 'active');

-- A MATRIZ DE PERMISSAO E O CORACAO DA SECAO 1, e ela e assimetrica de proposito:
--
--   Camila (Arquiteta)  tem can_edit em project_flow  -> move cartao, e a razao
--                       de a funcao SECURITY DEFINER existir
--   Rafael (Coordenador) NAO tem linha nenhuma        -> escreve no diario so
--                       pela FUNCAO dele, e nao consegue gravar evento automatico
--   Juliana (Coordenadora AFASTADA) tem can_edit      -> "nao escreve" so pode
--                       ser por causa do status
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_arch from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select c_leave from ids), 'project_flow', true, true);

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cli_a from ids), (select tenant_a from ids), 'Familia Rocha', '(62) 98111-0001', 'Goiania', 'GO'),
  ((select cli_b from ids), (select tenant_b from ids), 'Familia Duarte', '(62) 98111-0002', 'Anapolis', 'GO');

insert into public.projects (id, tenant_id, name, project_type, client_id) values
  ((select proj_a from ids), (select tenant_a from ids), 'Residencia Rocha', 'architecture', (select cli_a from ids)),
  ((select proj_num from ids), (select tenant_a from ids), 'Residencia da secao 5', 'architecture', null),
  ((select proj_never from ids), (select tenant_a from ids), 'Projeto sem pendencia', 'architecture', null),
  ((select proj_b from ids), (select tenant_b from ids), 'Residencia Duarte', 'architecture', (select cli_b from ids));

insert into public.project_diary_entries
  (id, tenant_id, project_id, entry_type, title, description, occurrence_date, visibility) values
  ((select entry_man from ids), (select tenant_a from ids), (select proj_a from ids),
   'client_request', 'Cliente pediu bancada maior', 'Conversa por telefone.', current_date, 'client'),
  ((select entry_link from ids), (select tenant_a from ids), (select proj_a from ids),
   'note', 'Entrada que a visita reivindica', null, current_date, 'internal'),
  ((select entry_files from ids), (select tenant_a from ids), (select proj_a from ids),
   'note', 'Entrada com anexos', null, current_date, 'internal'),
  ((select entry_del from ids), (select tenant_a from ids), (select proj_a from ids),
   'note', 'Entrada que sera apagada', null, current_date, 'internal'),
  ((select entry_b from ids), (select tenant_b from ids), (select proj_b from ids),
   'note', 'Entrada do escritorio B', null, current_date, 'internal');

insert into public.project_site_visits
  (id, tenant_id, project_id, visit_date, visit_type, summary, status) values
  ((select visit_a from ids), (select tenant_a from ids), (select proj_a from ids),
   current_date, 'follow_up', 'Acompanhamento de alvenaria', 'with_issues'),
  ((select visit_del from ids), (select tenant_a from ids), (select proj_a from ids),
   current_date, 'inspection', 'Visita que sera apagada', 'no_issues'),
  ((select visit_b from ids), (select tenant_b from ids), (select proj_b from ids),
   current_date, 'follow_up', 'Visita do escritorio B', 'no_issues');

-- As pendencias nascem SEM issue_number: quem o preenche e o trigger da 0069.
insert into public.project_issues
  (id, tenant_id, project_id, visit_id, description, category, identified_date) values
  ((select issue_a from ids), (select tenant_a from ids), (select proj_a from ids),
   (select visit_a from ids), 'Rodape fora da especificacao', 'finishing', current_date),
  ((select issue_hist from ids), (select tenant_a from ids), (select proj_a from ids),
   null, 'Pendencia da secao 7', 'electrical', current_date),
  ((select issue_del from ids), (select tenant_a from ids), (select proj_a from ids),
   null, 'Pendencia que sera apagada', 'other', current_date),
  ((select issue_b from ids), (select tenant_b from ids), (select proj_b from ids),
   null, 'Pendencia do escritorio B', 'other', current_date);

insert into public.project_diary_files
  (tenant_id, entry_id, file_kind, file_path, file_name) values
  ((select tenant_a from ids), (select entry_del from ids), 'attachment',
   'd1111111-1111-4111-8111-111111111111/entry/del/anexo.pdf', 'anexo-da-entrada.pdf');

-- Dois objetos no bucket, um por escritorio. O caminho comeca pelo tenant_id -
-- e esse primeiro segmento que a policy compara com o claim do JWT.
insert into storage.objects (bucket_id, name) values
  ('project-diary-files', 'd1111111-1111-4111-8111-111111111111/visit/x/foto.jpg'),
  ('project-diary-files', 'd2222222-2222-4222-8222-222222222222/visit/y/foto.jpg');

-- 1. A permissao: a policy le a FUNCAO, e a funcao le a permissao do FLUXO -------
--
-- Ver "POR QUE A SECAO 1 E A MAIS IMPORTANTE DO ARQUIVO", no cabecalho. Os
-- quatro primeiros casos sao um quadrado: cada um so significa alguma coisa
-- junto dos outros tres.

select pg_temp.chk_as('1.1', 'ARQUITETO com can_edit no fluxo NAO escreve no diario a mao', 'ERR:42501',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  insert into public.project_diary_entries (tenant_id, project_id, entry_type, title, occurrence_date)
  values (%L, %L, 'note', 'Anotacao do arquiteto', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- O caso que a decisao de permissao do usuario cria, e o modo de falha que a
-- migration 0070 existe para impedir. Sem ele, tudo o mais nesta secao poderia
-- estar certo e o diario ficaria mudo justamente nas acoes mais frequentes.
select pg_temp.val_as('1.2', 'CONTROLE: o MESMO arquiteto GRAVA evento automatico pela funcao', 'recorded',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(
    %L, 'phase_change', 'Tarefa movida de Layout para Perspectivas',
    'Arraste no Fluxo do Projeto', 'phase:t1:layout->renderings',
    'layout', 'renderings') ->> 'outcome'
$q$, (select proj_a from ids)));

select pg_temp.chk_as('1.3', 'CONTROLE: COORDENADOR sem permissao de menu nenhuma escreve a mao', 'OK:1',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  insert into public.project_diary_entries (tenant_id, project_id, entry_type, title, occurrence_date)
  values (%L, %L, 'note', 'Anotacao do coordenador', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- O outro lado do quadrado: quem escreve a mao nao consegue forjar evento de
-- sistema pela funcao. Os dois caminhos sao disjuntos, e cada um le a
-- autorizacao que devia ler.
select pg_temp.val_as('1.4', 'o MESMO coordenador NAO grava evento automatico (nao tem o menu do fluxo)',
  'ERR:not_authorized',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(
    %L, 'responsible_change', 'Responsavel alterado', null, null) ->> 'outcome'
$q$, (select proj_a from ids)));

-- A mesma regra alcanca as outras quatro tabelas do modulo.
select pg_temp.chk_as('1.5', 'arquiteto nao registra visita', 'ERR:42501',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
  values (%L, %L, current_date, 'follow_up')
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk_as('1.6', 'arquiteto nao cria pendencia', 'ERR:42501',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  insert into public.project_issues (tenant_id, project_id, description, category, identified_date)
  values (%L, %L, 'Pendencia do arquiteto', 'other', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk_as('1.7', 'arquiteto nao anexa arquivo', 'ERR:42501',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  insert into public.project_diary_files (tenant_id, entry_id, file_kind, file_path, file_name)
  values (%L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/entry/z/arch.jpg', 'x.jpg')
$q$, (select tenant_a from ids), (select entry_files from ids)));

select pg_temp.chk_as('1.8', 'arquiteto nao resolve pendencia (UPDATE)', 'OK:0',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  update public.project_issues set status = 'resolved', resolved_at = now() where id = %L
$q$, (select issue_a from ids)));

-- Leitura larga, pela quarta vez no sistema (financeiro, orcamento, mapa, e
-- agora o diario). Sem estes dois controles, uma policy de SELECT presa a
-- is_project_diary_writer() passaria em tudo acima e so apareceria na tela de
-- quem so consulta.
-- Nenhuma contagem absoluta: os casos acima ja gravaram no mesmo projeto (chk_as
-- nao desfaz o que passa), e contagem sobre o projeto inteiro mudaria de
-- resultado a cada caso novo desta secao.
select pg_temp.chk_as('1.9', 'CONTROLE: arquiteto LE o registro do diario', 'OK:1',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select 1 from public.project_diary_entries where id = %L
$q$, (select entry_man from ids)));

select pg_temp.chk_as('1.10', 'CONTROLE: arquiteto LE o historico da pendencia', 'OK:1',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select 1 from public.project_issue_events where issue_id = %L
$q$, (select issue_a from ids)));

-- Coordenadora AFASTADA, com can_edit no fluxo: "nao escreve" so pode ser por
-- causa do status, porque a funcao dela e a mesma do Rafael, que escreve.
select pg_temp.chk_as('1.11', 'coordenadora AFASTADA nao escreve no diario', 'ERR:42501',
  (select u_leave from ids), (select tenant_a from ids), format($q$
  insert into public.project_diary_entries (tenant_id, project_id, entry_type, title, occurrence_date)
  values (%L, %L, 'note', 'Anotacao da afastada', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk_as('1.12', 'coordenadora AFASTADA nao le o diario', 'OK:0',
  (select u_leave from ids), (select tenant_a from ids), format($q$
  select 1 from public.project_diary_entries where id = %L
$q$, (select entry_man from ids)));

-- A funcao le o tenant do JWT, e nao o do parametro: um projeto do escritorio B
-- simplesmente nao existe para quem esta em A.
select pg_temp.val_as('1.13', 'a funcao nao grava evento em projeto de OUTRO escritorio',
  'ERR:project_not_found',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(%L, 'phase_change', 'Invasao', null, null) ->> 'outcome'
$q$, (select proj_b from ids)));

-- 2. is_automatic e do sistema, e nao da mao ------------------------------------
--
-- A metade que fecha a excecao da 0070: a funcao SECURITY DEFINER e o UNICO
-- caminho ate um evento de sistema. Sem estes casos, quem escreve no diario
-- forjaria "o sistema registrou" - e evento de sistema e exatamente o que
-- ninguem confere depois.

select pg_temp.chk_as('2.1', 'coordenador NAO cria registro marcado como automatico', 'ERR:42501',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event)
  values (%L, %L, 'system', 'Evento forjado', current_date, true, 'phase_change')
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk_as('2.2', 'CONTROLE: o mesmo registro SEM a marca de automatico entra', 'OK:1',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date)
  values (%L, %L, 'note', 'Registro honesto', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- Sem este caso, a recusa de 2.1 seria contornavel em dois passos.
select pg_temp.chk_as('2.3', 'coordenador NAO promove registro manual a automatico', 'ERR:42501',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  update public.project_diary_entries
     set is_automatic = true, entry_type = 'system', system_event = 'phase_change'
   where id = %L
$q$, (select entry_man from ids)));

select pg_temp.chk_as('2.4', 'coordenador NAO edita registro automatico', 'ERR:42501',
  (select u_coord from ids), (select tenant_a from ids), $q$
  update public.project_diary_entries set title = 'reescrito'
   where is_automatic and event_key = 'phase:t1:layout->renderings'
$q$);

select pg_temp.chk_as('2.5', 'CONTROLE: coordenador edita registro manual', 'OK:1',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  update public.project_diary_entries set title = 'Cliente pediu bancada ainda maior' where id = %L
$q$, (select entry_man from ids)));

-- Apagar registro automatico CONTINUA possivel, de proposito: a tela do original
-- apenas esconde o botao, e virar policy criaria uma linha que ninguem no
-- escritorio consegue remover nunca. O DELETE aqui e desfeito pelo ROLLBACK do
-- arquivo, mas nao pelo chk_as - por isso ele vem depois de 2.4.
select pg_temp.chk_as('2.6', 'CONTROLE: coordenador APAGA registro automatico', 'OK:1',
  (select u_coord from ids), (select tenant_a from ids), $q$
  delete from public.project_diary_entries where event_key = 'phase:t1:layout->renderings'
$q$);

-- 3. event_key: idempotencia de verdade (defeito 5) -----------------------------
--
-- No base44 o campo se chama evento_chave, a entidade o descreve como "chave de
-- idempotencia (evita duplicatas)" e diaryAutoEvents.js:39 o monta com
-- Date.now() - a chave e diferente a cada chamada e a consulta previa da linha 13
-- nunca acha nada. Aqui a unicidade e do banco.

select pg_temp.chk('3.1', 'duas entradas com a MESMA chave no mesmo escritorio e recusado', 'ERR:23505', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event, event_key)
  values
    (%L, %L, 'system', 'Primeira', current_date, true, 'site_visit', 'k-dup'),
    (%L, %L, 'system', 'Segunda', current_date, true, 'issue_created', 'k-dup')
$q$, (select tenant_a from ids), (select proj_a from ids),
     (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('3.2', 'CONTROLE: a chave e por ESCRITORIO - a mesma em A e em B entra', 'OK:2', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event, event_key,
     operational_tag)
  values
    (%L, %L, 'system', 'Em A', current_date, true, 'tag_on', 'k-mesmo', 'in_review'),
    (%L, %L, 'system', 'Em B', current_date, true, 'tag_on', 'k-mesmo', 'in_review')
$q$, (select tenant_a from ids), (select proj_a from ids),
     (select tenant_b from ids), (select proj_b from ids)));

-- Nulo nao colide com nulo em indice unico, e e por isso que o registro manual e
-- o log de geracao de relatorio (que nao tem fato repetivel) convivem a vontade.
select pg_temp.chk('3.3', 'CONTROLE: duas entradas SEM chave entram', 'OK:2', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date)
  values
    (%L, %L, 'note', 'Sem chave 1', current_date),
    (%L, %L, 'note', 'Sem chave 2', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids),
     (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('3.4', 'chave sem a marca de automatico e recusada', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, event_key)
  values (%L, %L, 'note', 'Manual com chave', current_date, 'k-manual')
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- A idempotencia pela FUNCAO: duas chamadas com a mesma chave gravam uma linha.
-- E o gesto real (dois cliques, duas abas, um efeito que roda duas vezes).
select pg_temp.val_as('3.5', 'CONTROLE: a primeira chamada da funcao grava', 'recorded',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(%L, 'tag_on', 'Marcado como Em Revisao', null,
    'tag-on:t9:in_review', null, null, 'in_review') ->> 'outcome'
$q$, (select proj_a from ids)));

select pg_temp.val_as('3.6', 'a SEGUNDA chamada com a mesma chave nao grava', 'already_recorded',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(%L, 'tag_on', 'Marcado como Em Revisao', null,
    'tag-on:t9:in_review', null, null, 'in_review') ->> 'outcome'
$q$, (select proj_a from ids)));

-- Escopado pelo mesmo motivo do 3.9: `event_key` e unico POR ESCRITORIO, entao
-- outro escritorio pode ter a mesma chave sem nada de errado.
select pg_temp.val('3.6b', 'e uma linha so ficou no banco', '1', format($q$
  select count(*)::text from public.project_diary_entries
   where event_key = 'tag-on:t9:in_review' and tenant_id = %L
$q$, (select tenant_a from ids)));

-- O outro lado: onde a idempotencia NAO existe, a chave vai nula e duas chamadas
-- gravam duas linhas. Fingir chave (o Date.now() do original) da o mesmo
-- resultado por acidente, e por isso este caso e o par obrigatorio do 3.5.
select pg_temp.val_as('3.7', 'a funcao chamada duas vezes SEM chave grava as duas', 'recorded',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(%L, 'report_generated', 'Relatorio gerado', null, null)
         ->> 'outcome'
$q$, (select proj_a from ids)));

select pg_temp.val_as('3.8', 'CONTROLE: a segunda geracao de relatorio tambem grava', 'recorded',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(%L, 'report_generated', 'Relatorio gerado', null, null)
         ->> 'outcome'
$q$, (select proj_a from ids)));

-- CONTA DENTRO DO ESCRITORIO DA FIXTURE, e o recorte nao e zelo: sem ele este
-- caso passava so enquanto a tabela estivesse vazia fora daqui. A importacao
-- dos 36 registros historicos trouxe DOIS relatorios gerados do escritorio
-- real, a conta virou 4 e o caso caiu — acusando um defeito que nao existe.
-- Contagem sem tenant, num sistema multitenant, e asserção que depende de o
-- banco estar vazio.
select pg_temp.val('3.9', 'CONTROLE: as duas geracoes estao no banco', '2', format($q$
  select count(*)::text from public.project_diary_entries
   where system_event = 'report_generated' and tenant_id = %L
$q$, (select tenant_a from ids)));

-- 4. As colunas estruturadas (defeito 10) ----------------------------------------
--
-- ResumoTab.jsx:128 e 157 calculam "Historico de Revisoes" com
-- titulo.toLowerCase().includes('revisao'), e a 164 monta "Tempo por Etapa"
-- procurando a seta do titulo. O que estes casos afirmam e que o fato esta em
-- coluna, e que a coluna so aceita o fato a que pertence.

select pg_temp.chk('4.1', 'registro automatico SEM system_event e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic)
  values (%L, %L, 'system', 'Automatico sem evento', current_date, true)
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('4.2', 'registro MANUAL com system_event e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, system_event)
  values (%L, %L, 'note', 'Manual com evento', current_date, 'phase_change')
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('4.3', 'tipo Sistema sem a marca de automatico e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date)
  values (%L, %L, 'system', 'Sistema sem marca', current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('4.4', 'fase em evento que nao e de mudanca de etapa e recusada', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event,
     from_phase, to_phase, operational_tag)
  values (%L, %L, 'system', 'Tag com fase', current_date, true, 'tag_on', 'layout', 'renderings', 'in_review')
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('4.5', 'mudanca de etapa SEM a fase de destino e recusada', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event)
  values (%L, %L, 'system', 'Mudou de etapa, nao diz para onde', current_date, true, 'phase_change')
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- A EXCECAO DA IMPORTACAO, e ela e a razao de o check ter "or legacy_id is not
-- null": as 31 linhas automaticas do base44 nao guardam a fase em lugar nenhum
-- senao no texto do titulo, e adivinha-la seria gravar heuristica como fato.
select pg_temp.chk('4.6', 'CONTROLE: a mesma linha COM legacy_id entra (a excecao da importacao)', 'OK:1', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event, legacy_id)
  values (%L, %L, 'system', 'Projeto movido de Perspectivas para Layout', current_date, true,
          'phase_change', 'b44-timeline-1')
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- E o segundo caso do par, o que impede a excecao de virar afrouxamento geral.
select pg_temp.chk('4.7', 'CONTROLE: a MESMA linha SEM legacy_id continua recusada', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event)
  values (%L, %L, 'system', 'Projeto movido de Perspectivas para Layout', current_date, true, 'phase_change')
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('4.8', 'tag em evento que nao e de tag e recusada', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event,
     to_phase, operational_tag)
  values (%L, %L, 'system', 'Mudanca de etapa com tag', current_date, true, 'phase_change',
          'renderings', 'in_review')
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('4.9', 'evento de tag SEM dizer qual tag e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_entries
    (tenant_id, project_id, entry_type, title, occurrence_date, is_automatic, system_event)
  values (%L, %L, 'system', 'Marcado como alguma coisa', current_date, true, 'tag_on')
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- E o que a funcao grava de verdade: o fato em coluna, e nao no titulo. Duas
-- instrucoes, e nao uma: a linha que uma funcao volatil grava DENTRO da consulta
-- nao e visivel para a propria consulta - o snapshot dela e anterior.
select pg_temp.val_as('4.10', 'CONTROLE: a funcao grava a mudanca de etapa', 'recorded',
  (select u_arch from ids), (select tenant_a from ids), format($q$
  select public.record_project_diary_event(
    %L, 'phase_change', 'Tarefa movida', null, 'phase:t2:renderings->construction_docs',
    'renderings', 'construction_docs') ->> 'outcome'
$q$, (select proj_a from ids)));

select pg_temp.val('4.11', 'o evento, a fase de origem e a de destino ficaram em COLUNA',
  'phase_change|renderings|construction_docs', $q$
  select e.system_event || '|' || e.from_phase || '|' || e.to_phase
    from public.project_diary_entries e
   where e.event_key = 'phase:t2:renderings->construction_docs'
$q$);

-- E o titulo NAO e a fonte da informacao: ele nem menciona as fases.
select pg_temp.val('4.12', 'CONTROLE: o titulo do mesmo evento nao diz as fases', 'Tarefa movida', $q$
  select title from public.project_diary_entries
   where event_key = 'phase:t2:renderings->construction_docs'
$q$);

-- 5. O numero da pendencia (defeito 8) --------------------------------------------
--
-- Ver "O QUE ESTE ARQUIVO NAO CONSEGUE EXERCITAR" no cabecalho: concorrencia de
-- verdade nao cabe numa conexao so. O que esta secao afirma sao as tres coisas
-- que sustentam a alocacao, cada uma sozinha.

select pg_temp.val('5.1', 'a primeira pendencia do projeto e a numero 1', '1', format($q$
  with novo as (
    insert into public.project_issues (tenant_id, project_id, description, category, identified_date)
    values (%L, %L, 'Primeira', 'other', current_date) returning issue_number
  ) select issue_number::text from novo
$q$, (select tenant_a from ids), (select proj_num from ids)));

select pg_temp.val('5.2', 'a segunda e a numero 2', '2', format($q$
  with novo as (
    insert into public.project_issues (tenant_id, project_id, description, category, identified_date)
    values (%L, %L, 'Segunda', 'other', current_date) returning issue_number
  ) select issue_number::text from novo
$q$, (select tenant_a from ids), (select proj_num from ids)));

-- A numeracao e POR PROJETO, e nao global: em outro projeto ela recomeca.
select pg_temp.val('5.3', 'em outro projeto a numeracao recomeca do 1', '1', format($q$
  with novo as (
    insert into public.project_issues (tenant_id, project_id, description, category, identified_date)
    values (%L, %L, 'Primeira de outro projeto', 'other', current_date) returning issue_number
  ) select issue_number::text from novo
$q$, (select tenant_a from ids), (select proj_never from ids)));

-- A GARANTIA QUE NAO DEPENDE DE TEMPO: numero repetido passado a mao e recusado
-- pelo indice, e nao pelo trigger.
select pg_temp.chk('5.4', 'numero repetido no mesmo projeto e recusado', 'ERR:23505', format($q$
  insert into public.project_issues
    (tenant_id, project_id, issue_number, description, category, identified_date)
  values (%L, %L, 2, 'Numero repetido', 'other', current_date)
$q$, (select tenant_a from ids), (select proj_num from ids)));

select pg_temp.chk('5.5', 'CONTROLE: o mesmo numero em OUTRO projeto entra', 'OK:1', format($q$
  insert into public.project_issues
    (tenant_id, project_id, issue_number, description, category, identified_date)
  values (%L, %L, 2, 'Numero 2 de outro projeto', 'other', current_date)
$q$, (select tenant_a from ids), (select proj_never from ids)));

-- O MECANISMO QUE SERIALIZA DUAS TRANSACOES: o advisory lock e tomado de
-- verdade, e a chave e o projeto. Sem esta asserção, "a sequencia sai certa"
-- passaria igual num trigger sem lock nenhum - e ai duas transacoes simultaneas
-- leriam o mesmo max e a unicidade recusaria uma pendencia legitima.
select pg_temp.val('5.6', 'a alocacao TOMA advisory lock com a chave do projeto', '1', format($q$
  select count(*)::text from pg_locks
   where locktype = 'advisory'
     and pid = pg_backend_pid()
     and objsubid = 2
     and classid = ((hashtext('public.project_issues')::bigint) & 4294967295)::oid
     and objid   = ((hashtext(%L)::bigint) & 4294967295)::oid
$q$, (select proj_num from ids)));

select pg_temp.val('5.7', 'CONTROLE: projeto onde ninguem alocou nao tem lock com a chave dele', '0', $q$
  select count(*)::text from pg_locks
   where locktype = 'advisory'
     and pid = pg_backend_pid()
     and objsubid = 2
     and classid = ((hashtext('public.project_issues')::bigint) & 4294967295)::oid
     and objid   = ((hashtext('d1300000-0000-4000-8000-000000000009')::bigint) & 4294967295)::oid
$q$);

-- O DEFEITO DO ORIGINAL, REPRODUZIDO SEM CONCORRENCIA NENHUMA. ObraTab.jsx:104
-- usa issues.length + 1. Com uma pendencia apagada no meio, contar linhas devolve
-- um numero que ja existe - duas abas nem precisam estar abertas.
select pg_temp.chk('5.8', 'apaga a pendencia do meio (prepara os dois casos seguintes)', 'OK:1', format($q$
  delete from public.project_issues where project_id = %L and issue_number = 1
$q$, (select proj_num from ids)));

select pg_temp.val('5.9', 'a conta do original (length + 1) devolveria um numero JA USADO', '2', format($q$
  select (count(*) + 1)::text from public.project_issues where project_id = %L
$q$, (select proj_num from ids)));

select pg_temp.val('5.10', 'a alocacao do banco devolve 3, e nao o 2 que ja existe', '3', format($q$
  with novo as (
    insert into public.project_issues (tenant_id, project_id, description, category, identified_date)
    values (%L, %L, 'Depois do buraco', 'other', current_date) returning issue_number
  ) select issue_number::text from novo
$q$, (select tenant_a from ids), (select proj_num from ids)));

-- Numero explicito passa direto, para uma importacao futura preservar a
-- numeracao de origem.
select pg_temp.val('5.11', 'CONTROLE: numero explicito e respeitado, e nao sobrescrito', '77', format($q$
  with novo as (
    insert into public.project_issues
      (tenant_id, project_id, issue_number, description, category, identified_date)
    values (%L, %L, 77, 'Importada', 'other', current_date) returning issue_number
  ) select issue_number::text from novo
$q$, (select tenant_a from ids), (select proj_num from ids)));

-- 6. Coerencia de resolucao e prazo ------------------------------------------------

select pg_temp.chk('6.1', 'pendencia resolvida SEM data de resolucao e recusada', 'ERR:23514', format($q$
  update public.project_issues set status = 'resolved' where id = %L
$q$, (select issue_a from ids)));

select pg_temp.chk('6.2', 'data de resolucao em pendencia ABERTA e recusada', 'ERR:23514', format($q$
  update public.project_issues set resolved_at = now() where id = %L
$q$, (select issue_a from ids)));

select pg_temp.chk('6.3', 'CONTROLE: status e data juntos passam', 'OK:1', format($q$
  update public.project_issues set status = 'resolved', resolved_at = now() where id = %L
$q$, (select issue_a from ids)));

-- E o caminho de volta: reabrir precisa limpar a data, senao a pendencia aberta
-- carrega a data em que foi resolvida da vez anterior.
select pg_temp.chk('6.4', 'reabrir sem limpar a data e recusado', 'ERR:23514', format($q$
  update public.project_issues set status = 'in_progress' where id = %L
$q$, (select issue_a from ids)));

select pg_temp.chk('6.5', 'CONTROLE: reabrir limpando a data passa', 'OK:1', format($q$
  update public.project_issues set status = 'in_progress', resolved_at = null, resolved_by_id = null
   where id = %L
$q$, (select issue_a from ids)));

select pg_temp.chk('6.6', 'quem resolveu sem quando resolveu e recusado', 'ERR:23514', format($q$
  update public.project_issues set resolved_by_id = %L where id = %L
$q$, (select c_coord from ids), (select issue_a from ids)));

select pg_temp.chk('6.7', 'prazo ANTES da data de identificacao e recusado', 'ERR:23514', format($q$
  insert into public.project_issues
    (tenant_id, project_id, description, category, identified_date, due_date)
  values (%L, %L, 'Nasce vencida', 'other', current_date, current_date - 1)
$q$, (select tenant_a from ids), (select proj_a from ids)));

select pg_temp.chk('6.8', 'CONTROLE: prazo no MESMO dia da identificacao passa', 'OK:1', format($q$
  insert into public.project_issues
    (tenant_id, project_id, description, category, identified_date, due_date)
  values (%L, %L, 'Para hoje', 'other', current_date, current_date)
$q$, (select tenant_a from ids), (select proj_a from ids)));

-- 7. O historico escrito por trigger (defeito 12) ------------------------------------
--
-- No original, PendenciasTab.jsx:69-72 le o array do CACHE DO NAVEGADOR, empurra
-- um item e regrava o campo inteiro: duas pessoas mexendo na mesma pendencia
-- perdem o registro uma da outra. Aqui cada evento e uma linha.
--
-- A ORDEM DESTA SECAO IMPORTA: as contagens acompanham as escritas, e os casos
-- de pg_temp.chk que passam NAO sao desfeitos.

select pg_temp.val('7.1', 'criar a pendencia ja escreveu UM evento, do tipo created', 'created', format($q$
  select event_type::text from public.project_issue_events where issue_id = %L
$q$, (select issue_hist from ids)));

select pg_temp.val('7.2', 'e o evento de criacao guarda o status inicial', 'open', format($q$
  select to_status::text from public.project_issue_events where issue_id = %L
$q$, (select issue_hist from ids)));

select pg_temp.chk('7.3', 'atualizar sem mexer no status', 'OK:1', format($q$
  update public.project_issues set notes = 'Observacao nova' where id = %L
$q$, (select issue_hist from ids)));

-- O "ultimo evento" e o de maior occurred_at, e por isso a coluna usa
-- clock_timestamp() e nao now() (0073): com now(), todos os eventos gravados na
-- mesma transacao teriam carimbo identico e "o ultimo" seria arbitrario - que foi
-- exatamente como este caso falhou na primeira execucao.
select pg_temp.val('7.4', 'gerou um evento updated', 'updated', format($q$
  select event_type::text from public.project_issue_events
   where issue_id = %L order by occurred_at desc limit 1
$q$, (select issue_hist from ids)));

select pg_temp.chk('7.5', 'resolver a pendencia', 'OK:1', format($q$
  update public.project_issues set status = 'resolved', resolved_at = now(), resolved_by_id = %L
   where id = %L
$q$, (select c_coord from ids), (select issue_hist from ids)));

select pg_temp.val('7.6', 'gerou um evento resolved, com a transicao em coluna', 'resolved|open|resolved', format($q$
  select event_type || '|' || from_status || '|' || to_status
    from public.project_issue_events
   where issue_id = %L order by occurred_at desc limit 1
$q$, (select issue_hist from ids)));

select pg_temp.chk('7.7', 'reabrir a pendencia', 'OK:1', format($q$
  update public.project_issues set status = 'open', resolved_at = null, resolved_by_id = null
   where id = %L
$q$, (select issue_hist from ids)));

-- reopened NAO existe no original: la o historico so conhece tres frases, e a
-- reabertura de uma pendencia ja resolvida passa como "Pendencia atualizada.".
select pg_temp.val('7.8', 'gerou um evento reopened - que o original nao sabe registrar', 'reopened', format($q$
  select event_type::text from public.project_issue_events
   where issue_id = %L order by occurred_at desc limit 1
$q$, (select issue_hist from ids)));

-- A asserção que o read-modify-write do original nao sustenta: nada foi
-- regravado, tudo foi acrescentado.
select pg_temp.val('7.9', 'os quatro eventos convivem - nenhum foi regravado por cima', '4', format($q$
  select count(*)::text from public.project_issue_events where issue_id = %L
$q$, (select issue_hist from ids)));

-- O autor sai do claim da sessao, e so quando a sessao e do MESMO escritorio da
-- pendencia (0072). Escrita feita como postgres, sem claim, deixa o autor nulo.
select pg_temp.val('7.10', 'sem sessao identificavel, o autor do evento fica NULO', '4', format($q$
  select count(*)::text from public.project_issue_events
   where issue_id = %L and author_id is null
$q$, (select issue_hist from ids)));

select pg_temp.chk_as('7.11', 'coordenador resolve a pendencia pela sessao dele', 'OK:1',
  (select u_coord from ids), (select tenant_a from ids), format($q$
  update public.project_issues set status = 'resolved', resolved_at = now() where id = %L
$q$, (select issue_hist from ids)));

select pg_temp.val('7.12', 'CONTROLE: agora o evento tem autor, e e ele', 'Rafael Andrade', format($q$
  select c.name from public.project_issue_events e
    join public.collaborators c on c.id = e.author_id
   where e.issue_id = %L order by e.occurred_at desc limit 1
$q$, (select issue_hist from ids)));

-- Duas instrucoes, e nao uma com CTE: o efeito de um DELETE dentro de WITH nao e
-- visivel para a consulta externa, que le o snapshot anterior. Um caso escrito
-- assim passaria mesmo sem cascade nenhum.
select pg_temp.chk('7.13', 'apaga a pendencia', 'OK:1', format($q$
  delete from public.project_issues where id = %L
$q$, (select issue_del from ids)));

select pg_temp.val('7.14', 'o historico dela foi junto', '0', format($q$
  select count(*)::text from public.project_issue_events where issue_id = %L
$q$, (select issue_del from ids)));

-- 8. O arco exclusivo dos anexos ----------------------------------------------------
--
-- Uma tabela para tres arrays. A integridade "exatamente uma mae" nao vem da FK -
-- FK diz "aponta para uma entrada valida", nunca "aponta para exatamente uma
-- coisa" - e por isso ela e um check, e por isso ele tem os dois lados.

select pg_temp.chk('8.1', 'arquivo SEM mae nenhuma e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_files (tenant_id, file_kind, file_path, file_name)
  values (%L, 'photo', 'd1111111-1111-4111-8111-111111111111/orfao.jpg', 'orfao.jpg')
$q$, (select tenant_a from ids)));

select pg_temp.chk('8.2', 'arquivo com DUAS maes e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_files
    (tenant_id, entry_id, visit_id, file_kind, file_path, file_name)
  values (%L, %L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/duas.jpg', 'duas.jpg')
$q$, (select tenant_a from ids), (select entry_files from ids), (select visit_a from ids)));

select pg_temp.chk('8.3', 'arquivo com as TRES maes e recusado', 'ERR:23514', format($q$
  insert into public.project_diary_files
    (tenant_id, entry_id, visit_id, issue_id, file_kind, file_path, file_name)
  values (%L, %L, %L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/tres.jpg', 'tres.jpg')
$q$, (select tenant_a from ids), (select entry_files from ids), (select visit_a from ids),
     (select issue_a from ids)));

select pg_temp.chk('8.4', 'CONTROLE: uma mae so - a entrada de diario', 'OK:1', format($q$
  insert into public.project_diary_files (tenant_id, entry_id, file_kind, file_path, file_name)
  values (%L, %L, 'attachment', 'd1111111-1111-4111-8111-111111111111/entry/1.txt', 'conversa.txt')
$q$, (select tenant_a from ids), (select entry_files from ids)));

select pg_temp.chk('8.5', 'CONTROLE: uma mae so - a visita', 'OK:1', format($q$
  insert into public.project_diary_files (tenant_id, visit_id, file_kind, file_path, file_name)
  values (%L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/visit/1.jpg', 'obra.jpg')
$q$, (select tenant_a from ids), (select visit_a from ids)));

select pg_temp.chk('8.6', 'CONTROLE: uma mae so - a pendencia', 'OK:1', format($q$
  insert into public.project_diary_files (tenant_id, issue_id, file_kind, file_path, file_name)
  values (%L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/issue/1.jpg', 'rodape.jpg')
$q$, (select tenant_a from ids), (select issue_a from ids)));

-- FK composta: a RLS filtra o que se le, nao o que se aponta.
select pg_temp.chk('8.7', 'arquivo de A nao aponta para entrada de B', 'ERR:23503', format($q$
  insert into public.project_diary_files (tenant_id, entry_id, file_kind, file_path, file_name)
  values (%L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/entry/cruzado.jpg', 'x.jpg')
$q$, (select tenant_a from ids), (select entry_b from ids)));

select pg_temp.chk('8.8', 'dois registros no MESMO caminho de objeto e recusado', 'ERR:23505', format($q$
  insert into public.project_diary_files (tenant_id, entry_id, file_kind, file_path, file_name)
  values (%L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/visit/1.jpg', 'copia.jpg')
$q$, (select tenant_a from ids), (select entry_files from ids)));

select pg_temp.chk('8.9', 'CONTROLE: o mesmo caminho em OUTRO escritorio entra', 'OK:1', format($q$
  insert into public.project_diary_files (tenant_id, entry_id, file_kind, file_path, file_name)
  values (%L, %L, 'photo', 'd1111111-1111-4111-8111-111111111111/visit/1.jpg', 'homonimo.jpg')
$q$, (select tenant_b from ids), (select entry_b from ids)));

select pg_temp.chk('8.10', 'apaga a entrada de diario', 'OK:1', format($q$
  delete from public.project_diary_entries where id = %L
$q$, (select entry_del from ids)));

select pg_temp.val('8.11', 'os arquivos dela foram junto', '0', format($q$
  select count(*)::text from public.project_diary_files where entry_id = %L
$q$, (select entry_del from ids)));

-- 9. O vinculo visita <-> entrada de diario (defeito 7) -------------------------------
--
-- ProjectSiteVisit declara timeline_entry_id e ObraTab.jsx:58-68 nunca o grava:
-- o campo nasce e morre vazio, e por isso editar a visita nao tem como corrigir a
-- entrada que ela gerou (defeito 13).

select pg_temp.chk('9.1', 'CONTROLE: a visita reivindica a entrada que a gerou', 'OK:1', format($q$
  update public.project_site_visits set diary_entry_id = %L where id = %L
$q$, (select entry_link from ids), (select visit_a from ids)));

select pg_temp.chk('9.2', 'uma SEGUNDA visita na mesma entrada e recusada', 'ERR:23505', format($q$
  update public.project_site_visits set diary_entry_id = %L where id = %L
$q$, (select entry_link from ids), (select visit_del from ids)));

select pg_temp.chk('9.3', 'visita de A nao aponta para entrada de B', 'ERR:23503', format($q$
  update public.project_site_visits set diary_entry_id = %L where id = %L
$q$, (select entry_b from ids), (select visit_del from ids)));

-- Apagar a entrada NAO apaga a visita: o vinculo some, o fato fica. Duas
-- instrucoes pelo mesmo motivo da secao 7: o efeito de um DELETE dentro de WITH
-- nao e visivel para a consulta externa.
select pg_temp.chk('9.4', 'apaga a entrada de diario da visita', 'OK:1', format($q$
  delete from public.project_diary_entries where id = %L
$q$, (select entry_link from ids)));

select pg_temp.val('9.5', 'a visita continua de pe, com o vinculo solto', '1|<null>', format($q$
  select count(*)::text || '|' || coalesce(min(diary_entry_id::text), '<null>')
    from public.project_site_visits where id = %L
$q$, (select visit_a from ids)));

-- E apagar a visita NAO apaga a pendencia que ela revelou.
select pg_temp.chk('9.6', 'apaga a visita', 'OK:1', format($q$
  delete from public.project_site_visits where id = %L
$q$, (select visit_a from ids)));

select pg_temp.val('9.7', 'a pendencia continua de pe, com o vinculo solto', '1|<null>', format($q$
  select count(*)::text || '|' || coalesce(min(visit_id::text), '<null>')
    from public.project_issues where id = %L
$q$, (select issue_a from ids)));

-- 10. O bucket ------------------------------------------------------------------------
--
-- Superficie nova, e sem suite de padrao que a cubra. Duas metades: o que esta
-- configurado NO BUCKET (privacidade, tamanho, tipo) e o que as policies fazem.

select pg_temp.val('10.1', 'o bucket e PRIVADO', 'false', $q$
  select public::text from storage.buckets where id = 'project-diary-files'
$q$);

select pg_temp.val('10.2', 'o limite de 20 MB esta no bucket', '20971520', $q$
  select file_size_limit::text from storage.buckets where id = 'project-diary-files'
$q$);

-- Validacao de cliente nao e validacao: IssueForm.jsx usa accept="image/*", que
-- qualquer requisicao montada a mao ignora.
select pg_temp.val('10.3', 'os cinco tipos aceitos estao no bucket',
  'image/jpeg,image/png,image/webp,application/pdf,text/plain', $q$
  select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'project-diary-files'
$q$);

select pg_temp.chk_anon('10.4', 'anon nao le objeto nenhum do bucket', 'OK:0', $q$
  select 1 from storage.objects where bucket_id = 'project-diary-files'
$q$);

select pg_temp.chk_anon('10.5', 'anon nao grava no bucket', 'ERR:42501', $q$
  insert into storage.objects (bucket_id, name)
  values ('project-diary-files', 'd1111111-1111-4111-8111-111111111111/x/anon.jpg')
$q$);

select pg_temp.chk_as('10.6', 'CONTROLE: colaborador de A LE o arquivo da pasta de A', 'OK:1',
  (select u_arch from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'project-diary-files'
     and name like 'd1111111-1111-4111-8111-111111111111/%'
$q$);

select pg_temp.chk_as('10.7', 'colaborador de A nao le o arquivo da pasta de B', 'OK:0',
  (select u_arch from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'project-diary-files'
     and name like 'd2222222-2222-4222-8222-222222222222/%'
$q$);

select pg_temp.chk_as('10.8', 'colaborador de B nao le o arquivo da pasta de A', 'OK:0',
  (select u_coord_b from ids), (select tenant_b from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'project-diary-files'
     and name like 'd1111111-1111-4111-8111-111111111111/%'
$q$);

select pg_temp.chk_as('10.9', 'colaboradora AFASTADA nao le o arquivo', 'OK:0',
  (select u_leave from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'project-diary-files'
     and name like 'd1111111-1111-4111-8111-111111111111/%'
$q$);

-- A mesma assimetria da secao 1, agora no Storage: o Arquiteto LE a foto da obra
-- e nao ENVIA nenhuma. Anexar arquivo e sempre gesto manual, entao a excecao da
-- funcao SECURITY DEFINER nao se estende ate aqui.
select pg_temp.chk_as('10.10', 'ARQUITETO com o menu do fluxo NAO envia arquivo', 'ERR:42501',
  (select u_arch from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('project-diary-files', 'd1111111-1111-4111-8111-111111111111/visit/z/arch.jpg')
$q$);

select pg_temp.chk_as('10.11', 'CONTROLE: coordenador envia na pasta do PROPRIO escritorio', 'OK:1',
  (select u_coord from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('project-diary-files', 'd1111111-1111-4111-8111-111111111111/visit/z/coord.jpg')
$q$);

-- O equivalente, no Storage, do WITH CHECK sobre tenant_id nas tabelas.
select pg_temp.chk_as('10.12', 'coordenador nao envia na pasta de OUTRO escritorio', 'ERR:42501',
  (select u_coord from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('project-diary-files', 'd2222222-2222-4222-8222-222222222222/visit/z/invasor.jpg')
$q$);

select pg_temp.chk_as('10.13', 'coordenadora AFASTADA nao envia arquivo', 'ERR:42501',
  (select u_leave from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('project-diary-files', 'd1111111-1111-4111-8111-111111111111/visit/z/afastada.jpg')
$q$);

-- A POLICY DE DELETE NAO E EXERCITAVEL POR SQL, e o motivo nao e nosso: o
-- Supabase pendura um trigger storage.protect_delete() em storage.objects que
-- recusa qualquer DELETE direto ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead."), antes de a RLS opinar. Toda remocao
-- passa pela API de Storage, que age com privilegio proprio e AI SIM avalia a
-- policy. Entao o que da para afirmar aqui e que a policy existe e le as duas
-- coisas certas - o escritorio e a funcao -, e nao o comportamento.
--
-- Escrito assim, e nao com um chk_as esperando ERR:42501: um caso de negacao que
-- passa porque OUTRA coisa negou antes e o tipo de asserção vazia que este
-- projeto ja produziu cinco vezes.
select pg_temp.val('10.14', 'existe policy de DELETE no bucket, e ela le escritorio E funcao', 'true', $q$
  select (qual like '%auth_tenant_id%' and qual like '%is_project_diary_writer%')::text
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'diary_files_delete_diary_writer'
$q$);

select pg_temp.val('10.15', 'CONTROLE: nenhuma das quatro policies do bucket vale para anon', '0', $q$
  select count(*)::text from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'diary_files_%'
     and 'anon' = any (roles)
$q$);

select pg_temp.val('10.16', 'CONTROLE: as quatro policies do bucket existem', 'DELETE,INSERT,SELECT,UPDATE', $q$
  select string_agg(distinct cmd, ',' order by cmd) from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'diary_files_%'
$q$);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
