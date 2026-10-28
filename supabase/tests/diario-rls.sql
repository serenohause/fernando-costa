-- O isolamento do Diario do Projeto: todo mundo escreve, nem todo mundo apaga,
-- e ninguem atravessa a parede do escritorio.
--
-- POR QUE ESTE ARQUIVO NASCE AGORA
--   O modulo 11 tinha teste de SCHEMA (supabase/tests/diary-schema.sql) e
--   nenhum de RLS proprio: o isolamento das cinco tabelas vinha emprestado de
--   pattern-invariants.sql, que mede o PADRAO do sistema - leitura por
--   colaborador active, escrita por can_edit_menu. A migration 0123 tirou o
--   diario desse padrao: escrever virou vinculo (qualquer colaborador ativo) e
--   apagar continuou permissao (can_edit_menu('project_flow')). Regra que sai do
--   padrao precisa de suite propria, e o CLAUDE.md nao aceita policy sem teste
--   de isolamento.
--
-- O QUE ELE PROVA, e por que cada secao existe
--   1. ESCREVER (secao 1): o Financeiro e o Administrativo do escritorio - gente
--      sem nenhuma permissao no Fluxo do Projeto - registram visita, abrem
--      pendencia, anexam arquivo e escrevem na linha do tempo. E o pedido do
--      usuario, literal. O caso 1.5 e o que da sentido aos outros: ele mede que
--      essa pessoa NAO tem can_edit no fluxo, entao a escrita so pode ter
--      passado pela regra nova.
--   2. EDITAR (secao 2): o mesmo colaborador corrige o que registrou - e
--      tambem o que OUTRA pessoa registrou, que e desenho e nao descuido
--      (nenhuma policy do modulo pergunta quem criou a linha).
--   3. APAGAR (secao 3): a linha nova. O mesmo colaborador nao apaga NEM O QUE
--      ELE MESMO registrou. Se o desenho vazar - se alguem trocar a funcao do
--      DELETE pela da escrita, ou esquecer uma das seis policies -, esta secao
--      cai inteira. Cada negativa tem ao lado a prova de que a linha continua
--      no banco: negativa que passa porque a linha sumiu antes nao prova nada.
--   4. QUEM APAGA (secao 4): controle positivo da secao 3. O Arquiteto com
--      can_edit no fluxo apaga as cinco coisas. Sem ele, uma policy que negue
--      DELETE para todo mundo passaria na secao 3 com nota cheia.
--   5. O ATALHO DE DIRETOR (secao 5): Diretora sem UMA LINHA em
--      collaborator_permissions apaga, porque can_edit_menu tem atalho de cargo.
--      O caso 5.4 mede a ausencia das linhas de permissao dela.
--   6. STATUS (secao 6): Afastada e em Ferias nao escrevem nada, mesmo COM
--      can_edit no fluxo gravado na matriz - a recusa so pode ser o status,
--      porque a permissao elas tem e o colega ativo que escreve nao tem. O
--      filtro nao esta em policy nenhuma: vive dentro de is_active_collaborator().
--   7. ESCRITORIO (secao 7): a que nao pode falhar nunca. Um laco sobre as CINCO
--      tabelas, com a Diretora do escritorio B - o ator mais poderoso que existe
--      do outro lado da parede. Ela nao le, nao grava, nao move e nao apaga nada
--      de A, e cada uma dessas quatro negativas tem o controle positivo
--      equivalente no proprio escritorio dela, na mesma tabela e na mesma volta
--      do laco.
--   8. CLAIM FORJADO (secao 8): trocar o tenant_id do token nao abre porta
--      nenhuma, porque o vinculo de colaborador e conferido no escritorio DO
--      CLAIM. Quem forja deixa de ser colaborador de qualquer lugar.
--   9. anon (secao 9): a chave publicavel nao toca as cinco tabelas nem o bucket.
--  10. A LEITURA NAO MUDOU (secao 10): a 0123 nao encostou em policy de SELECT, e
--      esta secao e o que impede alguem de "aproveitar a viagem" depois.
--  11. O CATALOGO (secao 11): as seis policies de DELETE leem a funcao do apagar,
--      as doze de INSERT/UPDATE leem a da escrita, e nenhuma das duas listas
--      invade a outra. E a secao que pega o erro mais provavel desta mudanca:
--      uma policy esquecida para tras.
--
--   Cada negativa tem controle positivo ao lado. Negativa que passa porque a
--   linha nao existia, porque o GRANT recusou antes ou porque a operacao era
--   impossivel para todo mundo e asserçao vazia - este projeto ja produziu
--   varias, e quem as pegou foi o controle.
--
-- COMO RODAR
--   npm run test:rls:diario
--
-- COMO LER
--   observed = 'OK:<n>'    passou, n linhas. Em UPDATE e DELETE, 'OK:0' E a
--                          negativa: a policy nao enxerga a linha, o Postgres
--                          nao levanta erro, o comando so nao encontra o que
--                          mudar.
--   observed = 'ERR:RLS'   a POLICY recusou (violacao de WITH CHECK).
--   observed = 'ERR:GRANT' faltou privilegio de tabela - e o que anon recebe.
--                          Separar os dois importa: sao o mesmo 42501, e sem a
--                          distincao um caso de policy passaria com a policy
--                          apagada, porque o GRANT recusaria no lugar dela.
--   observed = 'ERR:<msg>' erro de negocio P0001 das funcoes do modulo.
--
-- O QUE ESTE ARQUIVO NAO CONSEGUE EXERCITAR, e fica declarado
--   O DELETE NO BUCKET. O Supabase pendura storage.protect_delete() em
--   storage.objects, que recusa DELETE direto por SQL antes de a RLS opinar;
--   toda remocao passa pela API de Storage. Entao o que a secao 3 afirma sobre o
--   bucket e de CATALOGO (a policy existe e le a funcao certa), e nao de
--   comportamento - escrever um chk esperando recusa ali seria afirmar que o
--   trigger do Supabase existe.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. Os dois escritorios, as seis
--   pessoas, os projetos e as linhas de diario nascem aqui. NENHUMA estrutura e
--   alterada - nenhuma policy, nenhuma funcao, nenhum grant -, entao rodar esta
--   suite nao abre janela nenhuma. Nenhuma contagem absoluta sobre tabela de
--   negocio: tudo e recortado pelos ids da propria fixture, para a suite nao
--   passar hoje e falhar no dia em que o escritorio real tiver diario cheio.

begin;

-- Instrumentacao ---------------------------------------------------------------

create temp table res (
  seq serial primary key, caso text, descricao text, expected text, observed text
) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

/* O claim no lugar em que o PostgREST o poe. `tenant` nulo = sessao de quem nao
   esta vinculado a escritorio nenhum (o claim sai do token, 0006). */
create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', case when p_tenant is null then '{}'::jsonb
                         else jsonb_build_object('tenant_id', p_tenant::text) end)
$$;

/* AS DUAS RECUSAS TEM O MESMO SQLSTATE. Privilegio de tabela ausente e violacao
   de policy sao os dois 42501. Sem separa-los, "a policy recusou" passaria
   identico com a policy apagada - o GRANT recusaria no lugar dela, e o caso
   continuaria verde. A terceira forma e o erro de negocio das funcoes do
   modulo, que carrega a razao na mensagem e nao no estado. */
create or replace function pg_temp.motivo(p_state text, p_msg text)
returns text language sql immutable as $$
  select case
    when p_msg like '%row-level security%' then 'ERR:RLS'
    when p_state = '42501' then 'ERR:GRANT'
    when p_state = 'P0001' then 'ERR:' || p_msg
    else 'ERR:' || p_state
  end
$$;

/* COMO a pessoa logada, e o efeito FICA. E a sonda das secoes 1 a 5, que contam
   uma historia em ordem: o Financeiro registra a visita (secao 1), corrige a
   visita que registrou (secao 2), tenta apagar e nao consegue (secao 3), e o
   Arquiteto apaga aquela mesma visita (secao 4). Desfazer cada passo tiraria o
   sentido do seguinte. */
create or replace function pg_temp.como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n bigint; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'OK:' || n;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* COMO a pessoa logada, e o efeito e SEMPRE desfeito. E a sonda da secao 7:
   ali o que importa e se a operacao foi permitida, e uma escrita que porventura
   PASSE nao pode sobreviver para contaminar a volta seguinte do laco - ou,
   pior, para fazer o controle positivo do caso seguinte parecer verde.
   O retorno viaja dentro da mensagem de uma excecao de proposito: e o
   ROLLBACK da subtransacao que desfaz, e sair sem excecao nao desfaria. */
create or replace function pg_temp.tenta(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n bigint; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql;
    get diagnostics n = row_count;
    raise exception 'DIA_OK:%', n using errcode = 'RL001';
  exception
    when sqlstate 'RL001' then
      get stacked diagnostics msg = message_text;
      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
      return replace(msg, 'DIA_OK:', 'OK:');
    when others then
      get stacked diagnostics st = returned_sqlstate, msg = message_text;
      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
      return pg_temp.motivo(st, msg);
  end;
end; $$;

/* Sonda de VALOR: `como` devolve contagem de linhas, e uma consulta que
   responda `false` devolve UMA linha do mesmo jeito - usar `como` em
   can_edit_menu() produziria 'OK:1' nos dois resultados possiveis. */
create or replace function pg_temp.valor_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

create or replace function pg_temp.como_anon(p_sql text)
returns text language plpgsql as $$
declare n bigint; st text; msg text;
begin
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);
    execute p_sql;
    get diagnostics n = row_count;
    perform set_config('role', 'postgres', true);
    return 'OK:' || n;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* A verdade do banco, por cima da RLS: postgres tem BYPASSRLS neste projeto.
   E contra ela que as tentativas sao medidas - "a linha continua la". */
create or replace function pg_temp.verdade(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  execute p_sql into v;
  return coalesce(v, '<null>');
end; $$;

-- Fixtures ----------------------------------------------------------------------
--
-- AS PESSOAS, e o que cada uma existe para provar
--   Fernanda, FINANCEIRO, ativa, SEM uma linha de permissao: e o caso real do
--     escritorio, e a razao do pedido. Tudo que ela faz nas secoes 1 a 3 passa
--     por ser colaboradora ativa, e por mais nada.
--   Alex, ADMINISTRATIVO, ativo, tambem sem permissao: o segundo perfil que o
--     usuario citou, para a secao 1 nao depender de uma pessoa so.
--   Rodrigo, ARQUITETO, ativo, COM can_edit no fluxo: o controle positivo do
--     apagar (secao 4).
--   Diana, DIRETORA, ativa, SEM uma linha de permissao: o atalho de cargo
--     (secao 5).
--   Alice, ADMINISTRATIVO, AFASTADA, COM can_edit no fluxo; e Valter,
--     ARQUITETO, em FERIAS, COM can_edit no fluxo. As duas permissoes existem
--     de proposito: com elas, "nao escreve" so pode ser o status.
--   Bianca, DIRETORA do escritorio B: o ator mais poderoso do outro lado da
--     parede (secao 7).

create temp table ids on commit drop as select
  'd1230000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'd1230000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'd1230000-0000-4000-8000-00000000001a'::uuid as u_fin,
  'd1230000-0000-4000-8000-00000000002a'::uuid as u_adm,
  'd1230000-0000-4000-8000-00000000003a'::uuid as u_arch,
  'd1230000-0000-4000-8000-00000000004a'::uuid as u_dir,
  'd1230000-0000-4000-8000-00000000005a'::uuid as u_leave,
  'd1230000-0000-4000-8000-00000000006a'::uuid as u_vac,
  'd1230000-0000-4000-8000-00000000001b'::uuid as u_dir_b,
  'd1230000-0000-4000-8000-0000000000c1'::uuid as c_fin,
  'd1230000-0000-4000-8000-0000000000c2'::uuid as c_adm,
  'd1230000-0000-4000-8000-0000000000c3'::uuid as c_arch,
  'd1230000-0000-4000-8000-0000000000c4'::uuid as c_dir,
  'd1230000-0000-4000-8000-0000000000c5'::uuid as c_leave,
  'd1230000-0000-4000-8000-0000000000c6'::uuid as c_vac,
  'd1230000-0000-4000-8000-0000000000d1'::uuid as c_dir_b,
  'd1230000-0000-4000-8000-0000000000e1'::uuid as proj_a,
  'd1230000-0000-4000-8000-0000000000e2'::uuid as proj_b,
  -- Linhas que ja existem quando a suite comeca: e o diario que o escritorio
  -- ja tinha antes de a Fernanda abrir a gaveta.
  'd1230000-0000-4000-8000-0000000000a1'::uuid as entry_a,
  'd1230000-0000-4000-8000-0000000000a2'::uuid as entry_anexos_a,
  'd1230000-0000-4000-8000-0000000000a3'::uuid as visit_a,
  'd1230000-0000-4000-8000-0000000000a4'::uuid as issue_a,
  'd1230000-0000-4000-8000-0000000000a5'::uuid as file_a,
  -- As duas linhas que NINGUEM apaga nesta suite. A secao 5 apaga as de cima
  -- (e o que ela prova), e a secao 10 precisa de algo que sobreviva a isso para
  -- afirmar que a LEITURA continua em pe. O laco da secao 7 tambem pendura
  -- nelas o que precisa de mae.
  'd1230000-0000-4000-8000-0000000000a6'::uuid as issue_leitura,
  'd1230000-0000-4000-8000-0000000000a7'::uuid as visit_leitura,
  'd1230000-0000-4000-8000-0000000000b1'::uuid as entry_b,
  'd1230000-0000-4000-8000-0000000000b2'::uuid as entry_anexos_b,
  'd1230000-0000-4000-8000-0000000000b3'::uuid as visit_b,
  'd1230000-0000-4000-8000-0000000000b4'::uuid as issue_b,
  -- Linhas que a Fernanda cria na secao 1 e que as secoes 2 a 4 perseguem.
  'd1230000-0000-4000-8000-0000000000f1'::uuid as visit_fin,
  'd1230000-0000-4000-8000-0000000000f2'::uuid as issue_fin,
  'd1230000-0000-4000-8000-0000000000f3'::uuid as entry_fin,
  'd1230000-0000-4000-8000-0000000000f4'::uuid as file_fin,
  -- Um escritorio que nao existe, para o claim forjado da secao 8.
  'd1230000-0000-4000-8000-00000000dead'::uuid as tenant_fantasma;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_fin from ids) u, 'rls-diario-fin@example.test' e
  union all select (select u_adm from ids), 'rls-diario-adm@example.test'
  union all select (select u_arch from ids), 'rls-diario-arch@example.test'
  union all select (select u_dir from ids), 'rls-diario-dir@example.test'
  union all select (select u_leave from ids), 'rls-diario-leave@example.test'
  union all select (select u_vac from ids), 'rls-diario-vac@example.test'
  union all select (select u_dir_b from ids), 'rls-diario-dir-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'RLS Diario A', 'rls-diario-a'),
  ((select tenant_b from ids), 'RLS Diario B', 'rls-diario-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_fin from ids), 'member'),
  ((select tenant_a from ids), (select u_adm from ids), 'member'),
  ((select tenant_a from ids), (select u_arch from ids), 'member'),
  ((select tenant_a from ids), (select u_dir from ids), 'owner'),
  ((select tenant_a from ids), (select u_leave from ids), 'member'),
  ((select tenant_a from ids), (select u_vac from ids), 'member'),
  ((select tenant_b from ids), (select u_dir_b from ids), 'owner');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_fin from ids), (select tenant_a from ids), (select u_fin from ids),
   'Fernanda Financeiro', 'finance', 'rls-diario-fin@example.test', 'active'),
  ((select c_adm from ids), (select tenant_a from ids), (select u_adm from ids),
   'Alex Administrativo', 'admin_staff', 'rls-diario-adm@example.test', 'active'),
  ((select c_arch from ids), (select tenant_a from ids), (select u_arch from ids),
   'Rodrigo Arquiteto', 'architect', 'rls-diario-arch@example.test', 'active'),
  ((select c_dir from ids), (select tenant_a from ids), (select u_dir from ids),
   'Diana Diretora', 'director', 'rls-diario-dir@example.test', 'active'),
  ((select c_leave from ids), (select tenant_a from ids), (select u_leave from ids),
   'Alice Afastada', 'admin_staff', 'rls-diario-leave@example.test', 'on_leave'),
  ((select c_vac from ids), (select tenant_a from ids), (select u_vac from ids),
   'Valter de Ferias', 'architect', 'rls-diario-vac@example.test', 'vacation'),
  ((select c_dir_b from ids), (select tenant_b from ids), (select u_dir_b from ids),
   'Bianca Diretora', 'director', 'rls-diario-dir-b@example.test', 'active');

/* A MATRIZ DE PERMISSAO, e quem NAO aparece nela.
   Rodrigo tem can_edit no fluxo e e o controle do apagar. Alice e Valter tambem
   tem - e esse e o ponto da secao 6: a unica diferenca entre eles e o colega que
   escreve e o STATUS. Fernanda, Alex e Diana nao tem uma linha sequer: na
   Fernanda e no Alex isso e o que da sentido a secao 1, e na Diana e o que da
   sentido a secao 5. Bianca tambem nao tem, e apaga em B pelo mesmo atalho. */
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_arch from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select c_leave from ids), 'project_flow', true, true),
  ((select tenant_a from ids), (select c_vac from ids), 'project_flow', true, true),
  /* can_view SEM can_edit para a Fernanda: a leitura do diario nunca dependeu
     de permissao de menu (e is_active_collaborator direto na policy), e esta
     linha existe para que "ela nao edita o fluxo" seja uma AUSENCIA de can_edit,
     e nao uma ausencia de linha - que e o estado em que a tela real a deixa. */
  ((select tenant_a from ids), (select c_fin from ids), 'project_flow', true, false);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select proj_a from ids), (select tenant_a from ids), 'Residencia Alto da Boa Vista', 'architecture'),
  ((select proj_b from ids), (select tenant_b from ids), 'Projeto do Vizinho', 'architecture');

insert into public.project_diary_entries (id, tenant_id, project_id, entry_type, title, occurrence_date) values
  ((select entry_a from ids), (select tenant_a from ids), (select proj_a from ids),
   'note', 'Cliente pediu bancada maior', current_date),
  ((select entry_anexos_a from ids), (select tenant_a from ids), (select proj_a from ids),
   'note', 'Entrada que carrega os anexos de A', current_date),
  ((select entry_b from ids), (select tenant_b from ids), (select proj_b from ids),
   'note', 'Anotacao do vizinho', current_date),
  ((select entry_anexos_b from ids), (select tenant_b from ids), (select proj_b from ids),
   'note', 'Entrada que carrega os anexos de B', current_date);

insert into public.project_site_visits (id, tenant_id, project_id, visit_date, visit_type, summary) values
  ((select visit_a from ids), (select tenant_a from ids), (select proj_a from ids),
   current_date, 'follow_up', 'Visita antiga do escritorio A'),
  ((select visit_leitura from ids), (select tenant_a from ids), (select proj_a from ids),
   current_date, 'measurement', 'Visita que ninguem apaga'),
  ((select visit_b from ids), (select tenant_b from ids), (select proj_b from ids),
   current_date, 'follow_up', 'Visita do vizinho');

insert into public.project_issues (id, tenant_id, project_id, description, category, identified_date) values
  ((select issue_a from ids), (select tenant_a from ids), (select proj_a from ids),
   'Rejunte fora do especificado', 'finishing', current_date),
  ((select issue_leitura from ids), (select tenant_a from ids), (select proj_a from ids),
   'Pendencia que ninguem apaga', 'other', current_date),
  ((select issue_b from ids), (select tenant_b from ids), (select proj_b from ids),
   'Pendencia do vizinho', 'finishing', current_date);

insert into public.project_diary_files (id, tenant_id, entry_id, file_kind, file_path, file_name) values
  ((select file_a from ids), (select tenant_a from ids), (select entry_anexos_a from ids),
   'photo', 'd1230000-0000-4000-8000-00000000000a/entry/fixture/a.jpg', 'fachada.jpg');

/* O bucket. Um objeto em cada pasta de escritorio, para a leitura da secao 10 e
   para a travessia da secao 7 terem o que alcancar. */
insert into storage.objects (bucket_id, name) values
  ('project-diary-files', 'd1230000-0000-4000-8000-00000000000a/entry/fixture/a.jpg'),
  ('project-diary-files', 'd1230000-0000-4000-8000-00000000000b/entry/fixture/b.jpg');

-- 1. ESCREVER e de qualquer colaborador ativo -----------------------------------
--
-- O pedido do usuario, medido. A Fernanda e do FINANCEIRO e nao edita o Fluxo do
-- Projeto; ate a 0123 nada do que esta aqui era possivel para ela.

select pg_temp.rec('1.1', 'FINANCEIRO sem edicao no fluxo REGISTRA visita a obra', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    insert into public.project_site_visits (id, tenant_id, project_id, visit_date, visit_type, summary)
    values (%L, %L, %L, current_date, 'inspection', 'Fui a obra e conferi o rejunte')
  $q$, (select visit_fin from ids), (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('1.2', 'o MESMO financeiro ABRE pendencia', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    insert into public.project_issues (id, tenant_id, project_id, description, category, identified_date, visit_id)
    values (%L, %L, %L, 'Rodape solto na sala', 'finishing', current_date, %L)
  $q$, (select issue_fin from ids), (select tenant_a from ids), (select proj_a from ids),
       (select visit_fin from ids))));

select pg_temp.rec('1.3', 'o MESMO financeiro escreve na linha do tempo', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    insert into public.project_diary_entries (id, tenant_id, project_id, entry_type, title, occurrence_date, description)
    values (%L, %L, %L, 'note', 'Resumo da visita de hoje', current_date, 'Rejunte e rodape')
  $q$, (select entry_fin from ids), (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('1.4', 'o MESMO financeiro ANEXA arquivo a visita', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    insert into public.project_diary_files (id, tenant_id, visit_id, file_kind, file_path, file_name)
    values (%L, %L, %L, 'photo', 'd1230000-0000-4000-8000-00000000000a/visit/fin/foto.jpg', 'rejunte.jpg')
  $q$, (select file_fin from ids), (select tenant_a from ids), (select visit_fin from ids))));

/* O OBJETO no bucket, que e a outra metade de anexar: sem esta policy a linha
   de project_diary_files existiria apontando para arquivo nenhum. */
select pg_temp.rec('1.5', 'o MESMO financeiro ENVIA a foto para o bucket', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), $q$
    insert into storage.objects (bucket_id, name)
    values ('project-diary-files', 'd1230000-0000-4000-8000-00000000000a/visit/fin/foto.jpg')
  $q$));

/* O CASO QUE DA SENTIDO AOS CINCO ACIMA. Sem ele, "o financeiro escreveu"
   poderia ser apenas "alguem concedeu can_edit a ele na fixture". */
select pg_temp.rec('1.6', 'CONTROLE: esse financeiro NAO edita o Fluxo do Projeto', 'false',
  pg_temp.valor_como((select u_fin from ids), (select tenant_a from ids),
    $q$select public.can_edit_menu('project_flow')::text$q$));

select pg_temp.rec('1.7', 'ADMINISTRATIVO sem edicao no fluxo tambem registra visita', 'OK:1',
  pg_temp.como((select u_adm from ids), (select tenant_a from ids), format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type, summary)
    values (%L, %L, current_date, 'follow_up', 'Acompanhamento do administrativo')
  $q$, (select tenant_a from ids), (select proj_a from ids))));

/* O EVENTO AUTOMATICO NAO ALARGOU, e isso e desenho: ele nasce de um gesto no
   Fluxo do Projeto (arrastar o cartao), e quem nao mexe no fluxo nao gera
   nenhum. record_project_diary_event continua conferindo can_edit_menu por
   dentro - a 0123 nao a tocou. */
select pg_temp.rec('1.8', 'o financeiro NAO grava evento automatico pela funcao', 'ERR:not_authorized',
  pg_temp.valor_como((select u_fin from ids), (select tenant_a from ids), format($q$
    select public.record_project_diary_event(
      %L, 'phase_change', 'Tarefa movida', null, 'phase:x:a->b', 'layout', 'renderings') ->> 'outcome'
  $q$, (select proj_a from ids))));

select pg_temp.rec('1.9', 'CONTROLE: quem edita o fluxo GRAVA o evento automatico', 'recorded',
  pg_temp.valor_como((select u_arch from ids), (select tenant_a from ids), format($q$
    select public.record_project_diary_event(
      %L, 'phase_change', 'Tarefa movida', null, 'phase:x:a->b', 'layout', 'renderings') ->> 'outcome'
  $q$, (select proj_a from ids))));

/* A escrita alargou; a FRONTEIRA do escritorio nao. */
select pg_temp.rec('1.10', 'o financeiro NAO grava visita com tenant_id de outro escritorio', 'ERR:RLS',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'follow_up')
  $q$, (select tenant_b from ids), (select proj_b from ids))));

-- 2. EDITAR o que foi registrado -------------------------------------------------
--
-- Corrigir e escrita, e escrita alargou junto. Vale para o que a pessoa
-- registrou e para o que o colega registrou: nenhuma policy do modulo pergunta
-- quem criou a linha, e isso e decisao - o diario e do escritorio, nao de quem
-- digitou.

select pg_temp.rec('2.1', 'o financeiro CORRIGE a visita que ele mesmo registrou', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    update public.project_site_visits set summary = 'Conferi o rejunte e o rodape' where id = %L
  $q$, (select visit_fin from ids))));

select pg_temp.rec('2.2', 'o financeiro EDITA a pendencia que ele abriu', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    update public.project_issues set description = 'Rodape solto na sala e no corredor' where id = %L
  $q$, (select issue_fin from ids))));

select pg_temp.rec('2.3', 'o financeiro EDITA a entrada de diario que escreveu', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    update public.project_diary_entries set title = 'Resumo da visita de hoje (revisado)' where id = %L
  $q$, (select entry_fin from ids))));

select pg_temp.rec('2.4', 'o financeiro edita a visita que OUTRA pessoa registrou', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    update public.project_site_visits set notes = 'Corrigido pelo financeiro' where id = %L
  $q$, (select visit_a from ids))));

/* A edicao nao e caminho para mudar de escritorio: e o WITH CHECK que separa
   "quais linhas posso mexer" de "como elas podem ficar depois". */
select pg_temp.rec('2.5', 'o financeiro NAO move a propria visita para outro escritorio', 'ERR:RLS',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    update public.project_site_visits set tenant_id = %L where id = %L
  $q$, (select tenant_b from ids), (select visit_fin from ids))));

select pg_temp.rec('2.6', 'o financeiro RESOLVE a pendencia (status e escrita, nao apagar)', 'OK:1',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    update public.project_issues set status = 'resolved', resolved_at = now(), resolved_by_id = %L
     where id = %L
  $q$, (select c_fin from ids), (select issue_fin from ids))));

-- 3. APAGAR NAO E DELE, nem o que ele mesmo registrou ----------------------------
--
-- A linha nova da 0123, e a unica coisa nesta suite que nao existia como
-- pergunta antes. Cinco negativas, e ao lado de cada uma a prova de que a linha
-- continua no banco - negativa que passa porque a linha ja tinha sumido e
-- asserçao vazia.
--
-- 'OK:0' e a forma da recusa em DELETE: a policy nao enxerga a linha, o comando
-- nao falha, so nao encontra o que apagar.

select pg_temp.rec('3.1', 'o financeiro NAO apaga a visita QUE ELE MESMO registrou', 'OK:0',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    delete from public.project_site_visits where id = %L
  $q$, (select visit_fin from ids))));

select pg_temp.rec('3.2', 'CONTROLE: a visita continua no banco', '1',
  pg_temp.verdade(format($q$
    select count(*)::text from public.project_site_visits where id = %L
  $q$, (select visit_fin from ids))));

select pg_temp.rec('3.3', 'o financeiro NAO apaga a pendencia que ele abriu', 'OK:0',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    delete from public.project_issues where id = %L
  $q$, (select issue_fin from ids))));

select pg_temp.rec('3.4', 'CONTROLE: a pendencia continua no banco', '1',
  pg_temp.verdade(format($q$
    select count(*)::text from public.project_issues where id = %L
  $q$, (select issue_fin from ids))));

select pg_temp.rec('3.5', 'o financeiro NAO apaga a entrada de diario que escreveu', 'OK:0',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_entries where id = %L
  $q$, (select entry_fin from ids))));

select pg_temp.rec('3.6', 'CONTROLE: a entrada continua no banco', '1',
  pg_temp.verdade(format($q$
    select count(*)::text from public.project_diary_entries where id = %L
  $q$, (select entry_fin from ids))));

select pg_temp.rec('3.7', 'o financeiro NAO apaga o anexo que ele mesmo subiu', 'OK:0',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_files where id = %L
  $q$, (select file_fin from ids))));

select pg_temp.rec('3.8', 'CONTROLE: o anexo continua no banco', '1',
  pg_temp.verdade(format($q$
    select count(*)::text from public.project_diary_files where id = %L
  $q$, (select file_fin from ids))));

/* O historico da pendencia: escrito por trigger, e nao apagavel a mao por quem
   so escreve. O evento existe porque a Fernanda abriu a pendencia no caso 1.2 -
   o trigger da 0069 o gravou. */
select pg_temp.rec('3.9', 'o financeiro NAO apaga linha do historico da pendencia', 'OK:0',
  pg_temp.como((select u_fin from ids), (select tenant_a from ids), format($q$
    delete from public.project_issue_events where issue_id = %L
  $q$, (select issue_fin from ids))));

select pg_temp.rec('3.10', 'CONTROLE: o historico da pendencia continua la', 'true',
  pg_temp.verdade(format($q$
    select (count(*) > 0)::text from public.project_issue_events where issue_id = %L
  $q$, (select issue_fin from ids))));

/* O DELETE do bucket nao e exercitavel por SQL - storage.protect_delete() recusa
   antes de a RLS opinar (ver o cabecalho). Entao o que se afirma aqui e de
   catalogo: a policy do objeto le a MESMA funcao que a da linha. Se as duas
   divergirem, uma remocao fica pela metade. */
select pg_temp.rec('3.11', 'a policy de DELETE do bucket le escritorio E a funcao do apagar', 'true',
  pg_temp.verdade($q$
    select (qual like '%auth_tenant_id%' and qual like '%can_delete_project_diary%')::text
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'diary_files_delete_flow_editor'
  $q$));

-- 4. QUEM EDITA O FLUXO APAGA (controle positivo da secao 3) ---------------------
--
-- Sao as MESMAS linhas que a secao 3 nao conseguiu apagar, e o mesmo comando. A
-- unica coisa que muda e quem esta logado. Sem esta secao, uma policy de DELETE
-- que negasse para todo mundo passaria na secao 3 inteira.

select pg_temp.rec('4.1', 'ARQUITETO com edicao no fluxo apaga o anexo', 'OK:1',
  pg_temp.como((select u_arch from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_files where id = %L
  $q$, (select file_fin from ids))));

select pg_temp.rec('4.2', 'o MESMO arquiteto apaga a visita do financeiro', 'OK:1',
  pg_temp.como((select u_arch from ids), (select tenant_a from ids), format($q$
    delete from public.project_site_visits where id = %L
  $q$, (select visit_fin from ids))));

select pg_temp.rec('4.3', 'o MESMO arquiteto apaga a entrada de diario do financeiro', 'OK:1',
  pg_temp.como((select u_arch from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_entries where id = %L
  $q$, (select entry_fin from ids))));

select pg_temp.rec('4.4', 'o MESMO arquiteto apaga linha do historico da pendencia', 'OK:1',
  pg_temp.como((select u_arch from ids), (select tenant_a from ids), format($q$
    delete from public.project_issue_events
     where issue_id = %L
       and id = (select e.id from public.project_issue_events e where e.issue_id = %L limit 1)
  $q$, (select issue_fin from ids), (select issue_fin from ids))));

/* Por ultimo, porque leva o resto do historico junto por ON DELETE CASCADE. */
select pg_temp.rec('4.5', 'o MESMO arquiteto apaga a pendencia do financeiro', 'OK:1',
  pg_temp.como((select u_arch from ids), (select tenant_a from ids), format($q$
    delete from public.project_issues where id = %L
  $q$, (select issue_fin from ids))));

-- 5. O ATALHO DE DIRETOR ----------------------------------------------------------
--
-- can_edit_menu tem atalho de cargo desde a 0019 (reproduz usePermissions.jsx:43
-- do original), e can_delete_project_diary o herda. Diana nao tem UMA linha em
-- collaborator_permissions, e o caso 5.4 e quem mede isso.

select pg_temp.rec('5.1', 'DIRETORA apaga visita, sem permissao gravada na matriz', 'OK:1',
  pg_temp.como((select u_dir from ids), (select tenant_a from ids), format($q$
    delete from public.project_site_visits where id = %L
  $q$, (select visit_a from ids))));

select pg_temp.rec('5.2', 'a MESMA diretora apaga entrada de diario', 'OK:1',
  pg_temp.como((select u_dir from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_entries where id = %L
  $q$, (select entry_a from ids))));

select pg_temp.rec('5.3', 'a MESMA diretora apaga a pendencia antiga', 'OK:1',
  pg_temp.como((select u_dir from ids), (select tenant_a from ids), format($q$
    delete from public.project_issues where id = %L
  $q$, (select issue_a from ids))));

select pg_temp.rec('5.4', 'CONTROLE: a diretora nao tem NENHUMA linha de permissao', '0',
  pg_temp.verdade(format($q$
    select count(*)::text from public.collaborator_permissions where collaborator_id = %L
  $q$, (select c_dir from ids))));

-- 6. AFASTADA E EM FERIAS nao escrevem ---------------------------------------------
--
-- As duas TEM can_edit no fluxo gravado na matriz (ver as fixtures), e o colega
-- que escreve nao tem. Entao "nao escreve" so pode ser o status. O filtro nao
-- esta em policy nenhuma: vive dentro de is_active_collaborator(), que e onde a
-- 0123 foi buscar a regra da escrita.

select pg_temp.rec('6.1', 'colaboradora AFASTADA nao registra visita', 'ERR:RLS',
  pg_temp.tenta((select u_leave from ids), (select tenant_a from ids), format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'inspection')
  $q$, (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('6.2', 'colaborador em FERIAS nao registra visita', 'ERR:RLS',
  pg_temp.tenta((select u_vac from ids), (select tenant_a from ids), format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'inspection')
  $q$, (select tenant_a from ids), (select proj_a from ids))));

/* A MESMA linha, o MESMO comando, a pessoa ATIVA. E o que separa "o status
   recusou" de "essa escrita nao era possivel para ninguem". */
select pg_temp.rec('6.3', 'CONTROLE: o financeiro ATIVO registra a MESMA visita', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'inspection')
  $q$, (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('6.4', 'a AFASTADA nao escreve na linha do tempo', 'ERR:RLS',
  pg_temp.tenta((select u_leave from ids), (select tenant_a from ids), format($q$
    insert into public.project_diary_entries (tenant_id, project_id, entry_type, title, occurrence_date)
    values (%L, %L, 'note', 'Anotacao da afastada', current_date)
  $q$, (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('6.5', 'a AFASTADA nao abre pendencia', 'ERR:RLS',
  pg_temp.tenta((select u_leave from ids), (select tenant_a from ids), format($q$
    insert into public.project_issues (tenant_id, project_id, description, category, identified_date)
    values (%L, %L, 'Pendencia da afastada', 'other', current_date)
  $q$, (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('6.6', 'a AFASTADA nao anexa arquivo', 'ERR:RLS',
  pg_temp.tenta((select u_leave from ids), (select tenant_a from ids), format($q$
    insert into public.project_diary_files (tenant_id, entry_id, file_kind, file_path, file_name)
    values (%L, %L, 'photo', 'd1230000-0000-4000-8000-00000000000a/entry/afastada.jpg', 'x.jpg')
  $q$, (select tenant_a from ids), (select entry_anexos_a from ids))));

select pg_temp.rec('6.7', 'a AFASTADA nao envia arquivo para o bucket', 'ERR:RLS',
  pg_temp.tenta((select u_leave from ids), (select tenant_a from ids), $q$
    insert into storage.objects (bucket_id, name)
    values ('project-diary-files', 'd1230000-0000-4000-8000-00000000000a/entry/afastada.jpg')
  $q$));

select pg_temp.rec('6.8', 'a AFASTADA nao LE o diario', 'OK:0',
  pg_temp.como((select u_leave from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('6.9', 'a AFASTADA nao apaga (nem pela permissao que ela tem)', 'OK:0',
  pg_temp.tenta((select u_leave from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('6.10', 'CONTROLE: a afastada TEM can_edit no fluxo gravado na matriz', 'true',
  pg_temp.verdade(format($q$
    select can_edit::text from public.collaborator_permissions
     where collaborator_id = %L and menu_key = 'project_flow'
  $q$, (select c_leave from ids))));

-- 7. ISOLAMENTO ENTRE ESCRITORIOS, nas cinco tabelas -------------------------------
--
-- A secao que nao pode falhar nunca. O ator do outro lado e a DIRETORA de B: o
-- cargo que tem atalho em can_edit_menu e que, no proprio escritorio, pode tudo
-- nas cinco tabelas. Se existe alguem capaz de atravessar a parede, e ela.
--
-- Sete casos por tabela, em laco, e cada negativa com o controle positivo
-- equivalente na MESMA volta - mesma tabela, mesmo comando, mesma pessoa, so
-- mudando de que lado da parede esta a linha. Sem isso, "a diretora de B nao
-- apagou a linha de A" valeria igual num banco onde ninguem apaga nada.
--
-- A sonda e pg_temp.tenta, que DESFAZ o que porventura passe: aqui uma escrita
-- que vaze nao pode sobreviver para a volta seguinte do laco.

create temp table iso (
  ord int, tabela text, cols text, vals_a text, vals_b text
) on commit drop;

insert into iso (ord, tabela, cols, vals_a, vals_b) values
  (1, 'project_diary_entries', 'project_id, entry_type, title, occurrence_date',
   $$'d1230000-0000-4000-8000-0000000000e1', 'note', 'Linha do laco', current_date$$,
   $$'d1230000-0000-4000-8000-0000000000e2', 'note', 'Linha do laco', current_date$$),

  (2, 'project_site_visits', 'project_id, visit_date, visit_type',
   $$'d1230000-0000-4000-8000-0000000000e1', current_date, 'follow_up'$$,
   $$'d1230000-0000-4000-8000-0000000000e2', current_date, 'follow_up'$$),

  (3, 'project_issues', 'project_id, description, category, identified_date',
   $$'d1230000-0000-4000-8000-0000000000e1', 'Pendencia do laco', 'other', current_date$$,
   $$'d1230000-0000-4000-8000-0000000000e2', 'Pendencia do laco', 'other', current_date$$),

  -- issue_number fica de fora: ele e alocado pelo trigger da 0069, e o laco grava
  -- a mesma linha duas vezes no mesmo projeto. Com valor fixo, o controle
  -- positivo receberia 23505 da unicidade (project_id, issue_number) e passaria a
  -- afirmar que a unicidade existe, e nao que a policy deixou gravar.
  -- As maes sao as pendencias que ninguem apaga: a secao 5 ja removeu a
  -- pendencia antiga de A quando este laco roda, e uma FK quebrada aqui
  -- derrubaria o laco inteiro em vez de medir policy nenhuma.
  (4, 'project_issue_events', 'issue_id, event_type',
   $$'d1230000-0000-4000-8000-0000000000a6', 'updated'$$,
   $$'d1230000-0000-4000-8000-0000000000b4', 'updated'$$),

  -- O caminho sai de um contador pelo mesmo motivo: project_diary_files tem
  -- unique (tenant_id, file_path), e a linha minima valida e gravada mais de uma
  -- vez no mesmo escritorio.
  (5, 'project_diary_files', 'entry_id, file_kind, file_path, file_name',
   $$'d1230000-0000-4000-8000-0000000000a2', 'photo',
     'd1230000-0000-4000-8000-00000000000a/entry/laco/'
       || (select count(*) from public.project_diary_files f
           where f.entry_id = 'd1230000-0000-4000-8000-0000000000a2') || '.jpg',
     'foto.jpg'$$,
   $$'d1230000-0000-4000-8000-0000000000b2', 'photo',
     'd1230000-0000-4000-8000-00000000000b/entry/laco/'
       || (select count(*) from public.project_diary_files f
           where f.entry_id = 'd1230000-0000-4000-8000-0000000000b2') || '.jpg',
     'foto.jpg'$$);

do $$
declare
  t record;
  i record;
  v_row_a uuid;
  v_row_b uuid;
  v_pref text;
begin
  select * into i from ids;

  for t in select * from iso order by ord loop
    v_pref := '7.' || t.ord || ' ' || t.tabela;

    -- Uma linha em cada escritorio, gravadas sem sessao (postgres), para que a
    -- existencia delas nao dependa de nenhuma policy.
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    execute format('insert into public.%I (tenant_id, %s) values (%L, %s) returning id',
                   t.tabela, t.cols, i.tenant_a, t.vals_a) into v_row_a;
    execute format('insert into public.%I (tenant_id, %s) values (%L, %s) returning id',
                   t.tabela, t.cols, i.tenant_b, t.vals_b) into v_row_b;

    perform pg_temp.rec(v_pref || '/1', 'diretora de B nao LE a linha de A', 'OK:0',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('select 1 from public.%I where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/2', 'CONTROLE: diretora de B LE a linha de B', 'OK:1',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('select 1 from public.%I where id = %L', t.tabela, v_row_b)));

    perform pg_temp.rec(v_pref || '/3', 'financeiro de A nao LE a linha de B', 'OK:0',
      pg_temp.tenta(i.u_fin, i.tenant_a,
        format('select 1 from public.%I where id = %L', t.tabela, v_row_b)));

    perform pg_temp.rec(v_pref || '/4', 'diretora de B nao GRAVA com tenant_id de A', 'ERR:RLS',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('insert into public.%I (tenant_id, %s) values (%L, %s)',
               t.tabela, t.cols, i.tenant_a, t.vals_a)));

    perform pg_temp.rec(v_pref || '/5', 'CONTROLE: diretora de B GRAVA no proprio escritorio', 'OK:1',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('insert into public.%I (tenant_id, %s) values (%L, %s)',
               t.tabela, t.cols, i.tenant_b, t.vals_b)));

    perform pg_temp.rec(v_pref || '/6', 'diretora de B nao EDITA a linha de A', 'OK:0',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('update public.%I set tenant_id = tenant_id where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/7', 'diretora de B nao MOVE a propria linha para A', 'ERR:RLS',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('update public.%I set tenant_id = %L where id = %L', t.tabela, i.tenant_a, v_row_b)));

    perform pg_temp.rec(v_pref || '/8', 'diretora de B nao APAGA a linha de A', 'OK:0',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('delete from public.%I where id = %L', t.tabela, v_row_a)));

    perform pg_temp.rec(v_pref || '/9', 'CONTROLE: diretora de B APAGA a propria linha', 'OK:1',
      pg_temp.tenta(i.u_dir_b, i.tenant_b,
        format('delete from public.%I where id = %L', t.tabela, v_row_b)));
  end loop;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end
$$;

/* O bucket tem a mesma parede, e ela e o primeiro segmento do caminho. */
select pg_temp.rec('7.6 bucket/1', 'diretora de B nao LE o objeto da pasta de A', 'OK:0',
  pg_temp.tenta((select u_dir_b from ids), (select tenant_b from ids), $q$
    select 1 from storage.objects
     where bucket_id = 'project-diary-files'
       and name like 'd1230000-0000-4000-8000-00000000000a/%'
  $q$));

select pg_temp.rec('7.6 bucket/2', 'CONTROLE: diretora de B LE o objeto da pasta de B', 'OK:1',
  pg_temp.tenta((select u_dir_b from ids), (select tenant_b from ids), $q$
    select 1 from storage.objects
     where bucket_id = 'project-diary-files'
       and name like 'd1230000-0000-4000-8000-00000000000b/%'
  $q$));

select pg_temp.rec('7.6 bucket/3', 'diretora de B nao ENVIA para a pasta de A', 'ERR:RLS',
  pg_temp.tenta((select u_dir_b from ids), (select tenant_b from ids), $q$
    insert into storage.objects (bucket_id, name)
    values ('project-diary-files', 'd1230000-0000-4000-8000-00000000000a/entry/invasao.jpg')
  $q$));

select pg_temp.rec('7.6 bucket/4', 'CONTROLE: diretora de B ENVIA para a pasta dela', 'OK:1',
  pg_temp.tenta((select u_dir_b from ids), (select tenant_b from ids), $q$
    insert into storage.objects (bucket_id, name)
    values ('project-diary-files', 'd1230000-0000-4000-8000-00000000000b/entry/propria.jpg')
  $q$));

-- 8. CLAIM DE TENANT FORJADO --------------------------------------------------------
--
-- Trocar o tenant_id do token e o ataque mais barato que existe contra um
-- sistema multitenant, e aqui ele nao rende nada: o vinculo de colaborador e
-- conferido NO ESCRITORIO DO CLAIM (auth_collaborator_id e
-- is_active_collaborator comparam user_id com tenant_id). Quem forja deixa de
-- ser colaborador de qualquer lugar - inclusive do proprio.

select pg_temp.rec('8.1', 'financeiro de A com claim de B nao LE nada de B', 'OK:0',
  pg_temp.tenta((select u_fin from ids), (select tenant_b from ids), format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_b from ids))));

select pg_temp.rec('8.2', 'financeiro de A com claim de B nao GRAVA em B', 'ERR:RLS',
  pg_temp.tenta((select u_fin from ids), (select tenant_b from ids), format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'inspection')
  $q$, (select tenant_b from ids), (select proj_b from ids))));

select pg_temp.rec('8.3', 'com o claim forjado ele tambem deixa de ler o PROPRIO escritorio', 'OK:0',
  pg_temp.tenta((select u_fin from ids), (select tenant_b from ids), format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('8.4', 'CONTROLE: com o claim CERTO ele le o proprio escritorio', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('8.5', 'claim de escritorio que NAO EXISTE nao alcanca nada', 'OK:0',
  pg_temp.tenta((select u_fin from ids), (select tenant_fantasma from ids), format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('8.6', 'sessao SEM claim de escritorio nao le', 'OK:0',
  pg_temp.tenta((select u_fin from ids), null, format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('8.7', 'sessao SEM claim de escritorio nao escreve', 'ERR:RLS',
  pg_temp.tenta((select u_fin from ids), null, format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'inspection')
  $q$, (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('8.8', 'diretora de B com claim de A nao APAGA nada de A', 'OK:0',
  pg_temp.tenta((select u_dir_b from ids), (select tenant_a from ids), format($q$
    delete from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

-- 9. anon nao toca nenhuma das cinco, nem o bucket -------------------------------
--
-- A chave publicavel vai no bundle do frontend. Nas cinco tabelas ela nao tem
-- GRANT nenhum (ERR:GRANT, e nao ERR:RLS: a recusa vem antes da policy); no
-- bucket ela tem privilegio de tabela e nenhuma policy, e por isso le zero.

select pg_temp.rec('9.1', 'anon nao le project_diary_entries', 'ERR:GRANT',
  pg_temp.como_anon('select 1 from public.project_diary_entries'));

select pg_temp.rec('9.2', 'anon nao le project_site_visits', 'ERR:GRANT',
  pg_temp.como_anon('select 1 from public.project_site_visits'));

select pg_temp.rec('9.3', 'anon nao le project_issues', 'ERR:GRANT',
  pg_temp.como_anon('select 1 from public.project_issues'));

select pg_temp.rec('9.4', 'anon nao le project_issue_events', 'ERR:GRANT',
  pg_temp.como_anon('select 1 from public.project_issue_events'));

select pg_temp.rec('9.5', 'anon nao le project_diary_files', 'ERR:GRANT',
  pg_temp.como_anon('select 1 from public.project_diary_files'));

select pg_temp.rec('9.6', 'anon nao registra visita', 'ERR:GRANT',
  pg_temp.como_anon(format($q$
    insert into public.project_site_visits (tenant_id, project_id, visit_date, visit_type)
    values (%L, %L, current_date, 'inspection')
  $q$, (select tenant_a from ids), (select proj_a from ids))));

select pg_temp.rec('9.7', 'anon nao apaga visita', 'ERR:GRANT',
  pg_temp.como_anon(format($q$
    delete from public.project_site_visits where id = %L
  $q$, (select visit_b from ids))));

select pg_temp.rec('9.8', 'anon nao le objeto nenhum do bucket', 'OK:0',
  pg_temp.como_anon($q$
    select 1 from storage.objects where bucket_id = 'project-diary-files'
  $q$));

select pg_temp.rec('9.9', 'anon nao envia arquivo para o bucket', 'ERR:RLS',
  pg_temp.como_anon($q$
    insert into storage.objects (bucket_id, name)
    values ('project-diary-files', 'd1230000-0000-4000-8000-00000000000a/entry/anon.jpg')
  $q$));

-- 10. A LEITURA NAO MUDOU -----------------------------------------------------------
--
-- A 0123 nao encostou em policy de SELECT. Esta secao e o que impede alguem de
-- "aproveitar a viagem" num ajuste futuro: quem consulta a obra nunca precisou
-- de permissao de escrita para ver o que foi registrado, e o financeiro sem
-- can_edit continua lendo as cinco.

select pg_temp.rec('10.1', 'colaborador ativo LE a entrada de diario', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_diary_entries where id = %L
  $q$, (select entry_anexos_a from ids))));

select pg_temp.rec('10.2', 'colaborador ativo LE a visita a obra', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_site_visits where id = %L
  $q$, (select visit_leitura from ids))));

select pg_temp.rec('10.3', 'colaborador ativo LE a pendencia', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_issues where id = %L
  $q$, (select issue_leitura from ids))));

/* O historico desta pendencia existe porque o trigger da 0069 o gravou quando a
   fixture nasceu - ninguem o escreveu a mao. */
select pg_temp.rec('10.4', 'colaborador ativo LE o historico da pendencia', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_issue_events where issue_id = %L limit 1
  $q$, (select issue_leitura from ids))));

select pg_temp.rec('10.5', 'colaborador ativo LE o anexo', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), format($q$
    select 1 from public.project_diary_files where id = %L
  $q$, (select file_a from ids))));

/* O objeto da fixture, e nao a pasta inteira: a secao 1 enviou mais um arquivo
   para a mesma pasta, e contar a pasta faria este caso mudar de resultado a
   cada caso novo la em cima. */
select pg_temp.rec('10.6', 'colaborador ativo LE o objeto no bucket', 'OK:1',
  pg_temp.tenta((select u_fin from ids), (select tenant_a from ids), $q$
    select 1 from storage.objects
     where bucket_id = 'project-diary-files'
       and name = 'd1230000-0000-4000-8000-00000000000a/entry/fixture/a.jpg'
  $q$));

select pg_temp.rec('10.7', 'as cinco policies de SELECT continuam em is_active_collaborator', '5',
  pg_temp.verdade($q$
    select count(*)::text from pg_policies
     where schemaname = 'public'
       and tablename in ('project_diary_entries','project_diary_files','project_issue_events',
                         'project_issues','project_site_visits')
       and cmd = 'SELECT'
       and qual like '%is_active_collaborator%'
  $q$));

-- 11. O CATALOGO: as duas listas, e nenhuma invadindo a outra ----------------------
--
-- A secao que pega o erro mais provavel desta mudanca: uma policy esquecida para
-- tras. Sao 18 policies no modulo - 15 nas cinco tabelas e 3 no bucket -, e o
-- que as separa e qual funcao cada uma chama.

select pg_temp.rec('11.1', 'as 5 policies de DELETE das tabelas leem a funcao do APAGAR', '5',
  pg_temp.verdade($q$
    select count(*)::text from pg_policies
     where schemaname = 'public'
       and tablename in ('project_diary_entries','project_diary_files','project_issue_events',
                         'project_issues','project_site_visits')
       and cmd = 'DELETE' and qual like '%can_delete_project_diary%'
  $q$));

select pg_temp.rec('11.2', 'NENHUMA policy de DELETE do modulo le a funcao da ESCRITA', '0',
  pg_temp.verdade($q$
    select count(*)::text from pg_policies
     where ((schemaname = 'public'
             and tablename in ('project_diary_entries','project_diary_files','project_issue_events',
                               'project_issues','project_site_visits'))
            or (schemaname = 'storage' and tablename = 'objects' and policyname like 'diary_files_%'))
       and cmd = 'DELETE' and qual like '%is_project_diary_writer%'
  $q$));

select pg_temp.rec('11.3', 'as 10 policies de INSERT/UPDATE das tabelas leem a funcao da ESCRITA', '10',
  pg_temp.verdade($q$
    select count(*)::text from pg_policies
     where schemaname = 'public'
       and tablename in ('project_diary_entries','project_diary_files','project_issue_events',
                         'project_issues','project_site_visits')
       and cmd in ('INSERT','UPDATE')
       and coalesce(with_check,'') like '%is_project_diary_writer%'
  $q$));

select pg_temp.rec('11.4', 'NENHUMA policy de INSERT/UPDATE do modulo le a funcao do APAGAR', '0',
  pg_temp.verdade($q$
    select count(*)::text from pg_policies
     where ((schemaname = 'public'
             and tablename in ('project_diary_entries','project_diary_files','project_issue_events',
                               'project_issues','project_site_visits'))
            or (schemaname = 'storage' and tablename = 'objects' and policyname like 'diary_files_%'))
       and cmd in ('INSERT','UPDATE')
       and (coalesce(with_check,'') || coalesce(qual,'')) like '%can_delete_project_diary%'
  $q$));

select pg_temp.rec('11.5', 'as 2 policies de escrita do bucket (INSERT e UPDATE) leem a funcao da ESCRITA', '2',
  pg_temp.verdade($q$
    select count(*)::text from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'diary_files_%'
       and cmd in ('INSERT','UPDATE')
       and coalesce(with_check,'') like '%is_project_diary_writer%'
  $q$));

/* A funcao do apagar e SECURITY DEFINER com search_path vazio, como toda funcao
   que uma policy chama neste projeto: sem definer ela nao leria
   collaborator_permissions (cuja RLS chama estas mesmas funcoes), e sem
   search_path vazio um schema no caminho de busca do chamador poderia
   sequestrar o nome de uma tabela. */
select pg_temp.rec('11.6', 'can_delete_project_diary e SECURITY DEFINER', 'true',
  pg_temp.verdade($q$
    select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_delete_project_diary'
  $q$));

select pg_temp.rec('11.7', 'can_delete_project_diary tem search_path preso', 'search_path=""',
  pg_temp.verdade($q$
    select array_to_string(proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_delete_project_diary'
  $q$));

select pg_temp.rec('11.8', 'anon NAO executa a funcao do apagar', 'false',
  pg_temp.verdade($q$
    select has_function_privilege('anon', 'public.can_delete_project_diary()', 'execute')::text
  $q$));

select pg_temp.rec('11.9', 'CONTROLE: authenticated executa a funcao do apagar', 'true',
  pg_temp.verdade($q$
    select has_function_privilege('authenticated', 'public.can_delete_project_diary()', 'execute')::text
  $q$));

/* As duas funcoes nao podem ter o mesmo corpo: se alguem "simplificar" uma delas
   para a outra, tudo acima continua verde e a separacao desaparece. */
select pg_temp.rec('11.10', 'as duas funcoes do modulo tem corpos DIFERENTES', 'false',
  pg_temp.verdade($q$
    select (
      (select btrim(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_project_diary_writer')
      =
      (select btrim(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'can_delete_project_diary')
    )::text
  $q$));

select pg_temp.rec('11.11', 'as duas funcoes estao comentadas', '2',
  pg_temp.verdade($q$
    select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_project_diary_writer','can_delete_project_diary')
       and obj_description(p.oid, 'pg_proc') is not null
  $q$));

select pg_temp.rec('11.12', 'as 6 policies de DELETE do modulo estao comentadas', '6',
  pg_temp.verdade($q$
    select count(*)::text from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where pol.polcmd = 'd'
       and ((n.nspname = 'public'
             and c.relname in ('project_diary_entries','project_diary_files','project_issue_events',
                               'project_issues','project_site_visits'))
            or (n.nspname = 'storage' and c.relname = 'objects' and pol.polname like 'diary_files_%'))
       and obj_description(pol.oid, 'pg_policy') is not null
  $q$));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
