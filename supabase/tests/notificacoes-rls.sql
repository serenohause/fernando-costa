-- O isolamento do sino: o aviso é de uma pessoa, e de mais ninguém.
--
-- O QUE ELE PROVA, e por que cada caso existe
--   A 0121 escreveu duas policies, e só duas. O recorte delas é mais estreito
--   que o de qualquer outra tabela do sistema: não é o escritório, é a PESSOA.
--   Isso inverte um hábito que todas as outras suítes tomam como dado — em
--   `clients`, `tasks`, `projects` o Diretor lê tudo do escritório dele; aqui o
--   Diretor NÃO lê o sino da equipe, e o caso 1.6 é o que impede alguém de
--   "consertar" essa aparente falta de permissão depois.
--
--   1. LEITURA (seção 1): a pessoa vê o aviso dela; colega do mesmo escritório
--      não vê; pessoa de outro escritório não vê; Diretor do próprio escritório
--      não vê; claim de tenant forjado não alcança nada; sessão sem claim não
--      alcança nada; `anon` não toca a tabela.
--   2. MARCAR COMO LIDO (seção 2): funciona no próprio aviso e não funciona no
--      aviso alheio — e a tentativa frustrada não deixa o aviso do outro lido.
--   3. MOVER O AVISO (seção 3): é a seção que não dá para medir de fora, e a
--      que mais rodeio exige. Trocar `recipient_id` no mesmo UPDATE que marca
--      como lido é recusado por três coisas diferentes, e distingui-las é o
--      trabalho da seção: o GRANT de coluna, que opina primeiro; a RLS, quando o
--      GRANT sai do caminho; e — só aí — o `with check` ESCRITO, que se separa do
--      `using` apenas quando o `using` alarga. O cabeçalho da seção conta por
--      que a primeira versão destes casos não provava o que afirmava.
--   4. O GRANT DE COLUNA (seção 4): as policies não podem ter afrouxado o que a
--      0120 trancou. Título copiado e nome de quem atribuiu continuam fora de
--      alcance, e ninguém insere nem apaga aviso.
--   5. O CATÁLOGO (seção 5): exatamente duas policies, nos dois comandos certos,
--      a de UPDATE com `with check`, as duas comentadas, e nenhuma permissão
--      para `public`.
--   6. OS ESCRITORES (seção 6): gatilho e varredura são SECURITY DEFINER e
--      continuam gravando com a RLS ligada e as policies no lugar. Negativa de
--      escrita sem este controle positivo esconderia um sino que nunca enche.
--
--   Cada negativa tem controle positivo ao lado. Negativa que passa porque a
--   linha nem existia pareceria acerto — e aqui o risco é real, porque a tabela
--   nasceu fail-closed: antes da 0121 TODOS os casos negativos passavam.
--
-- COMO RODAR
--   npm run test:rls:notificacoes
--
-- RESÍDUO
--   Nenhum: uma transação terminada em ROLLBACK. Os dois escritórios, as
--   pessoas, as tarefas e os avisos nascem aqui. A seção 3 é a única que mexe em
--   ESTRUTURA: ela concede um privilégio de coluna e alarga o `using` das duas
--   policies, para medir o que não dá para medir de fora. Tudo volta ao lugar
--   na própria seção (casos 3.13 e 3.14 conferem a volta) e morreria no ROLLBACK
--   de qualquer jeito — mas rodar esta suíte contra PRODUÇÃO não é boa ideia:
--   entre o `alter policy` e o seguinte, uma requisição de verdade veria a
--   policy alargada.
--   Nenhuma contagem absoluta sobre `notifications`: tudo é recortado por
--   destinatário, para a suíte não passar hoje e falhar no dia em que o sino
--   tiver aviso de verdade.

begin;

/*
  TRAVA DE AMBIENTE, e não um aviso.

  A seção 3 desta suíte ALARGA as policies de propósito, para provar o que o
  `with check` segura quando o `using` deixa de segurar. Tudo volta ao lugar e o
  ROLLBACK desfaria de qualquer forma, mas entre um `alter policy` e o seguinte
  uma requisição de verdade veria a policy larga. Em produção isso é uma janela
  de leitura indevida, curta e real.

  O cabeçalho já dizia para não rodar aqui. Aviso em comentário não para
  ninguém: quem roda `npm run test:rls:notificacoes` com o ambiente trocado não
  leu o arquivo. Então a suíte recusa sozinha.

  O marcador é `accounts_receivable_status.client_name`, que existe SÓ em
  produção, fora de migration (está registrado como divergência conhecida, e o
  usuário decidiu não mexer). Medido hoje: dev tem zero. É o discriminador mais
  confiável que existe entre os dois bancos, porque não depende de nome de
  escritório nem de contagem de linha.
*/
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts_receivable_status'
      and column_name = 'client_name'
  ) then
    raise exception
      'ABORTADO: esta suite altera policy temporariamente e nao roda em producao. Rode com npm run env:dev.'
      using errcode = 'P0001';
  end if;
end
$$;

create temp table res (seq serial primary key, caso text, descricao text, expected text, observed text) on commit drop;

create or replace function pg_temp.rec(c text, d text, e text, o text)
returns void language plpgsql as $$
begin insert into res(caso,descricao,expected,observed) values (c,d,e,o); end; $$;

/* O claim no lugar em que o PostgREST o põe. `tenant` nulo = sessão de quem não
   está vinculado a escritório nenhum (o claim sai do token, 0006). */
create or replace function pg_temp.claims(p_sub uuid, p_tenant uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_sub::text, 'role', 'authenticated',
    'app_metadata', case when p_tenant is null then '{}'::jsonb
                         else jsonb_build_object('tenant_id', p_tenant::text) end)
$$;

/*
  AS DUAS RECUSAS TÊM O MESMO SQLSTATE, e separá-las é o que dá sentido à seção 3.
  Privilégio ausente e violação de `with check` são os dois 42501. Sem esta
  classificação, o caso que afirma "a policy recusou" passaria igual com a policy
  apagada, porque o GRANT recusaria no lugar dela.
*/
create or replace function pg_temp.motivo(p_state text, p_msg text)
returns text language sql immutable as $$
  select case
    when p_msg like '%row-level security%' then 'ERR:RLS'
    when p_state = '42501' then 'ERR:GRANT'
    else 'ERR:' || p_state
  end
$$;

/* Lê um valor COMO a pessoa logada. */
create or replace function pg_temp.valor_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
    execute p_sql into v;
    perform set_config('role', 'postgres', true);
    return coalesce(v, '<null>');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform set_config('role', 'postgres', true);
    return pg_temp.motivo(st, msg);
  end;
end; $$;

/* Escreve COMO a pessoa logada, e devolve quantas linhas o comando alcançou.
   OK:0 é o resultado típico de RLS em UPDATE: a linha existe, a policy não a
   enxerga, e o comando não falha — simplesmente não encontra o que atualizar. */
create or replace function pg_temp.exec_como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare n int; st text; msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', pg_temp.claims(p_sub, p_tenant)::text, true);
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

create or replace function pg_temp.como_anon(p_sql text)
returns text language plpgsql as $$
declare n int; st text; msg text;
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

/* Volta a ser "sem sessão": é o seed, a varredura, o script de correção. Sem
   isto o claim do caso anterior fica pendurado e o gatilho atribui autor a uma
   escrita que não teve autor. */
create or replace function pg_temp.sem_sessao()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;

-- Fixtures ---------------------------------------------------------------------
--
-- Duas pessoas no mesmo escritório com sino cada uma (Bruno e Caio) são o par
-- que o caso central compara. Dalva é Diretora do MESMO escritório — é ela que
-- prova a ausência do atalho de Diretor. Elza está Afastada, e serve para medir
-- a regra que a policy NÃO escreve (o filtro de status vive dentro de
-- auth_collaborator_id). Fábio não tem login: ser avisado não depende de ter
-- conta, e o aviso dele existe para a seção 6.

create temp table ids on commit drop as select
  'c1210000-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'c1210000-0000-4000-8000-00000000000b'::uuid as tenant_b,
  'c1210000-0000-4000-8000-00000000001a'::uuid as user_ana,
  'c1210000-0000-4000-8000-00000000002a'::uuid as user_bruno,
  'c1210000-0000-4000-8000-00000000003a'::uuid as user_caio,
  'c1210000-0000-4000-8000-00000000004a'::uuid as user_dalva,
  'c1210000-0000-4000-8000-00000000005a'::uuid as user_elza,
  'c1210000-0000-4000-8000-00000000001b'::uuid as user_bia,
  'c1210000-0000-4000-8000-0000000000c1'::uuid as col_ana,
  'c1210000-0000-4000-8000-0000000000c2'::uuid as col_bruno,
  'c1210000-0000-4000-8000-0000000000c3'::uuid as col_caio,
  'c1210000-0000-4000-8000-0000000000c4'::uuid as col_dalva,
  'c1210000-0000-4000-8000-0000000000c5'::uuid as col_elza,
  'c1210000-0000-4000-8000-0000000000c6'::uuid as col_fabio,
  'c1210000-0000-4000-8000-0000000000d1'::uuid as col_bia,
  'c1210000-0000-4000-8000-0000000000e1'::uuid as proj_a,
  'c1210000-0000-4000-8000-0000000000e2'::uuid as proj_b,
  'c1210000-0000-4000-8000-0000000000f1'::uuid as t_render,
  'c1210000-0000-4000-8000-0000000000f2'::uuid as t_esquadrias,
  'c1210000-0000-4000-8000-0000000000f3'::uuid as t_vizinha,
  'c1210000-0000-4000-8000-0000000000f4'::uuid as t_nova,
  'c1210000-0000-4000-8000-0000000000f5'::uuid as t_atrasada,
  'c1210000-0000-4000-8000-0000000000a1'::uuid as n_bruno_1,
  'c1210000-0000-4000-8000-0000000000a2'::uuid as n_bruno_2,
  'c1210000-0000-4000-8000-0000000000a3'::uuid as n_caio,
  'c1210000-0000-4000-8000-0000000000a4'::uuid as n_dalva,
  'c1210000-0000-4000-8000-0000000000a5'::uuid as n_elza,
  'c1210000-0000-4000-8000-0000000000b1'::uuid as n_bia;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_ana from ids) u, 'rls-sino-ana@example.test' e
  union all select (select user_bruno from ids), 'rls-sino-bruno@example.test'
  union all select (select user_caio from ids), 'rls-sino-caio@example.test'
  union all select (select user_dalva from ids), 'rls-sino-dalva@example.test'
  union all select (select user_elza from ids), 'rls-sino-elza@example.test'
  union all select (select user_bia from ids), 'rls-sino-bia@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'RLS Sino A', 'rls-sino-a'),
  ((select tenant_b from ids), 'RLS Sino B', 'rls-sino-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select user_ana from ids), 'member'),
  ((select tenant_a from ids), (select user_bruno from ids), 'member'),
  ((select tenant_a from ids), (select user_caio from ids), 'member'),
  ((select tenant_a from ids), (select user_dalva from ids), 'owner'),
  ((select tenant_a from ids), (select user_elza from ids), 'member'),
  ((select tenant_b from ids), (select user_bia from ids), 'owner');

insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select col_ana from ids), (select tenant_a from ids), (select user_ana from ids),
   'Ana Coordenadora', 'coordinator', 'rls-sino-ana@example.test', 'active'),
  ((select col_bruno from ids), (select tenant_a from ids), (select user_bruno from ids),
   'Bruno Arquiteto', 'architect', 'rls-sino-bruno@example.test', 'active'),
  ((select col_caio from ids), (select tenant_a from ids), (select user_caio from ids),
   'Caio Arquiteto', 'architect', 'rls-sino-caio@example.test', 'active'),
  /* A DIRETORA DO PRÓPRIO ESCRITÓRIO. Em toda outra tabela ela lê tudo daqui. */
  ((select col_dalva from ids), (select tenant_a from ids), (select user_dalva from ids),
   'Dalva Diretora', 'director', 'rls-sino-dalva@example.test', 'active'),
  ((select col_elza from ids), (select tenant_a from ids), (select user_elza from ids),
   'Elza Afastada', 'architect', 'rls-sino-elza@example.test', 'on_leave'),
  /* Sem login, e é de propósito: o aviso é do colaborador, não do usuário. */
  ((select col_fabio from ids), (select tenant_a from ids), null,
   'Fábio Estagiário', 'intern', 'rls-sino-fabio@example.test', 'active'),
  ((select col_bia from ids), (select tenant_b from ids), (select user_bia from ids),
   'Bia Diretora', 'director', 'rls-sino-bia@example.test', 'active');

/* A Ana precisa de permissão de edição do Fluxo do Projeto para o caso 6.1 —
   quem cria tarefa é o editor por menu (0033). Nenhuma policy de notifications
   olha permissão de menu: isto é fixture da tabela vizinha, não do sino. */
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select col_ana from ids), 'project_flow', true, true);

insert into public.projects (id, tenant_id, name, project_type) values
  ((select proj_a from ids), (select tenant_a from ids), 'Residência Alto da Boa Vista', 'architecture'),
  ((select proj_b from ids), (select tenant_b from ids), 'Projeto do Vizinho', 'architecture');

/* AS TAREFAS NASCEM SEM RESPONSÁVEL, e isso não é descuido: com responsável, o
   gatilho da 0120 gravaria avisos aqui e as contagens das seções 1 e 2 passariam
   a medir fixture em vez de policy. Os avisos abaixo são inseridos à mão, um por
   pessoa, e a tarefa ganha responsável só na seção 6. */
insert into public.tasks (id, tenant_id, project_id, title, phase, status, responsible_id) values
  ((select t_render from ids), (select tenant_a from ids), (select proj_a from ids),
   'Humanização: render externo da fachada', 'layout', 'in_progress', null),
  ((select t_esquadrias from ids), (select tenant_a from ids), (select proj_a from ids),
   'Detalhamento de esquadrias', 'layout', 'in_progress', null),
  ((select t_vizinha from ids), (select tenant_b from ids), (select proj_b from ids),
   'Tarefa do vizinho', 'layout', 'in_progress', null);

/* Um aviso para cada pessoa que tem sessão, mais o da pessoa sem login. Todos
   não lidos, todos da espécie de atribuição (due_date fica nulo por causa do
   check notifications_due_date_matches_kind_check). */
insert into public.notifications (id, tenant_id, recipient_id, kind, task_id, task_title, project_name, actor_id, actor_name) values
  ((select n_bruno_1 from ids), (select tenant_a from ids), (select col_bruno from ids),
   'task_assigned', (select t_render from ids),
   'Humanização: render externo da fachada', 'Residência Alto da Boa Vista',
   (select col_ana from ids), 'Ana Coordenadora'),
  /* O SEGUNDO AVISO DO BRUNO existe para a seção 3: lá o primeiro já está lido, e
     o controle positivo precisa de uma linha ainda não lida para mexer. */
  ((select n_bruno_2 from ids), (select tenant_a from ids), (select col_bruno from ids),
   'task_assigned', (select t_esquadrias from ids),
   'Detalhamento de esquadrias', 'Residência Alto da Boa Vista',
   (select col_ana from ids), 'Ana Coordenadora'),
  ((select n_caio from ids), (select tenant_a from ids), (select col_caio from ids),
   'task_assigned', (select t_esquadrias from ids),
   'Detalhamento de esquadrias', 'Residência Alto da Boa Vista',
   (select col_ana from ids), 'Ana Coordenadora'),
  ((select n_dalva from ids), (select tenant_a from ids), (select col_dalva from ids),
   'task_assigned', (select t_render from ids),
   'Humanização: render externo da fachada', 'Residência Alto da Boa Vista',
   (select col_ana from ids), 'Ana Coordenadora'),
  ((select n_elza from ids), (select tenant_a from ids), (select col_elza from ids),
   'task_assigned', (select t_render from ids),
   'Humanização: render externo da fachada', 'Residência Alto da Boa Vista',
   (select col_ana from ids), 'Ana Coordenadora'),
  ((select n_bia from ids), (select tenant_b from ids), (select col_bia from ids),
   'task_assigned', (select t_vizinha from ids),
   'Tarefa do vizinho', 'Projeto do Vizinho', null, null);

/* Quantas linhas um ator alcança, no recorte que a suíte criou. Recortado pelos
   seis avisos do fixture, e nunca a tabela inteira. */
create or replace function pg_temp.ve(p_sub uuid, p_tenant uuid)
returns text language sql as $$
  select pg_temp.valor_como(p_sub, p_tenant, format(
    $q$select count(*)::text from public.notifications where id in (%L,%L,%L,%L,%L,%L)$q$,
    (select n_bruno_1 from ids), (select n_bruno_2 from ids), (select n_caio from ids),
    (select n_dalva from ids), (select n_elza from ids), (select n_bia from ids)))
$$;

/* De quem é a linha, e se está lida — lido como postgres, por cima da RLS: é a
   verdade do banco contra a qual as tentativas são medidas. */
create or replace function pg_temp.linha(p_id uuid)
returns text language sql as $$
  select coalesce((select n.recipient_id::text || '|' ||
                          case when n.read_at is null then 'nao lida' else 'lida' end
                     from public.notifications n where n.id = p_id), '(nenhuma)')
$$;

-- 1. LEITURA: o aviso é de uma pessoa ------------------------------------------

select pg_temp.rec('1.1', 'CONTROLE: Bruno vê os dois avisos dele', '2',
  pg_temp.valor_como((select user_bruno from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_bruno from ids))));

/* O CASO CENTRAL. Caio é colega de escritório, tem a mesma função do Bruno, e o
   aviso carrega o nome de uma tarefa que os dois poderiam ver no Fluxo. O que
   ele não pode ver é o SINO do outro. */
select pg_temp.rec('1.2', 'colega do MESMO escritório não vê o aviso do Bruno', '0',
  pg_temp.valor_como((select user_caio from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_bruno from ids))));

select pg_temp.rec('1.3', 'CONTROLE: e o Caio vê o aviso dele', '1',
  pg_temp.valor_como((select user_caio from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_caio from ids))));

/*
  AQUI NÃO HÁ ATALHO DE DIRETOR, e esta é a diferença entre esta tabela e todo o
  resto do sistema. Se este caso virar '1' algum dia, não foi melhoria: foi
  alguém aplicando o padrão das outras policies sem ler o cabeçalho da 0121.
*/
select pg_temp.rec('1.4', 'a DIRETORA do próprio escritório não vê o aviso do Bruno', '0',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_bruno from ids))));

select pg_temp.rec('1.5', 'nem o do Caio, nem o da pessoa sem login', '0',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id in (%L,%L)',
    (select col_caio from ids), (select col_fabio from ids))));

select pg_temp.rec('1.6', 'CONTROLE: a Diretora vê o aviso DELA', '1',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_dalva from ids))));

select pg_temp.rec('1.7', 'pessoa de OUTRO escritório não vê nenhum aviso do escritório A', '0',
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.notifications where tenant_id = %L',
    (select tenant_a from ids))));

select pg_temp.rec('1.8', 'CONTROLE: e ela vê o aviso dela, no escritório dela', '1',
  pg_temp.valor_como((select user_bia from ids), (select tenant_b from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_bia from ids))));

/*
  CLAIM DE TENANT FORJADO: a sessão é da Bia (colaboradora de B) e o claim diz
  tenant A. É o cenário de um token manipulado, e é por isso que o claim sozinho
  não pode decidir nada: auth_collaborator_id() procura a Bia DENTRO do tenant do
  claim, não acha, devolve null, e null não casa com recipient_id em igualdade.
*/
select pg_temp.rec('1.9', 'claim de tenant forjado (colaboradora de B dizendo-se de A) não alcança nada', '0',
  pg_temp.ve((select user_bia from ids), (select tenant_a from ids)));

/* O mesmo pelo outro lado: pessoa de A com claim de B. */
select pg_temp.rec('1.10', 'e o inverso também não (colaborador de A dizendo-se de B)', '0',
  pg_temp.ve((select user_bruno from ids), (select tenant_b from ids)));

select pg_temp.rec('1.11', 'CONTROLE: com o claim certo, cada um dos dois alcança o próprio aviso', '2|1',
  pg_temp.ve((select user_bruno from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve((select user_bia from ids), (select tenant_b from ids)));

/* Sessão SEM claim de tenant: quem não está vinculado a escritório nenhum (o
   hook da 0006 remove o claim nesse caso). */
select pg_temp.rec('1.12', 'sessão SEM claim de tenant não alcança aviso algum', '0',
  pg_temp.ve((select user_bruno from ids), null));

/* A regra que a policy NÃO escreve: o filtro de status vive dentro de
   auth_collaborator_id(). Se ele sair de lá, este caso é o que denuncia. */
select pg_temp.rec('1.13', 'colaboradora AFASTADA não lê nem o próprio aviso', '0',
  pg_temp.valor_como((select user_elza from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where recipient_id = %L',
    (select col_elza from ids))));

select pg_temp.rec('1.14', 'anon não lê a tabela', 'ERR:GRANT',
  pg_temp.como_anon('select count(*) from public.notifications'));

/* Nenhum ator alcança os seis avisos do fixture. O caso existe para pegar a
   policy larga de uma vez: `using (true)` passaria em todos os controles acima
   e morreria aqui. */
select pg_temp.rec('1.15', 'ninguém alcança os seis avisos do fixture', '2|1|1|0|0|1',
  pg_temp.ve((select user_bruno from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve((select user_caio from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve((select user_dalva from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve((select user_elza from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve((select user_ana from ids), (select tenant_a from ids)) || '|' ||
  pg_temp.ve((select user_bia from ids), (select tenant_b from ids)));

-- 2. MARCAR COMO LIDO ----------------------------------------------------------
--
-- As tentativas frustradas vêm ANTES do controle positivo, de propósito: assim o
-- caso 2.5 pode afirmar que o aviso do Bruno continuava não lido depois de
-- quatro pessoas tentarem marcá-lo, e não apenas que "ninguém mexeu".
--
-- OK:0 é o resultado esperado e não é erro: a linha existe, a policy de UPDATE
-- não a enxerga, e o comando atualiza zero linhas. É assim que a RLS recusa
-- UPDATE — recusa silenciosa, e é por isso que o estado da linha precisa ser
-- conferido depois.

select pg_temp.rec('2.1', 'o colega não marca como lido o aviso do Bruno', 'OK:0',
  pg_temp.exec_como((select user_caio from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_1 from ids))));

select pg_temp.rec('2.2', 'a Diretora do próprio escritório também não', 'OK:0',
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_1 from ids))));

select pg_temp.rec('2.3', 'a pessoa de outro escritório não', 'OK:0',
  pg_temp.exec_como((select user_bia from ids), (select tenant_b from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_1 from ids))));

select pg_temp.rec('2.4', 'e a sessão de claim forjado não', 'OK:0',
  pg_temp.exec_como((select user_bia from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_1 from ids))));

select pg_temp.rec('2.5', 'depois das quatro tentativas, o aviso do Bruno continua dele e não lido',
  (select col_bruno::text from ids) || '|nao lida',
  pg_temp.linha((select n_bruno_1 from ids)));

select pg_temp.rec('2.6', 'CONTROLE: o Bruno marca o PRÓPRIO aviso como lido', 'OK:1',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_1 from ids))));

select pg_temp.rec('2.7', 'e agora ele está lido, e continua sendo dele',
  (select col_bruno::text from ids) || '|lida',
  pg_temp.linha((select n_bruno_1 from ids)));

/* UPDATE em massa: o jeito pelo qual a tela faz "marcar todas como lidas". Ele
   alcança as linhas da própria pessoa e nenhuma outra — a policy recorta o
   comando sem WHERE do mesmo jeito que recorta o comando com WHERE. */
select pg_temp.rec('2.8', '"marcar todas como lidas" sem WHERE alcança só as do Caio', 'OK:1',
  pg_temp.exec_como((select user_caio from ids), (select tenant_a from ids),
    'update public.notifications set read_at = now() where read_at is null'));

select pg_temp.rec('2.9', 'e o segundo aviso do Bruno segue não lido depois disso',
  (select col_bruno::text from ids) || '|nao lida',
  pg_temp.linha((select n_bruno_2 from ids)));

select pg_temp.rec('2.10', 'a colaboradora AFASTADA não marca nem o próprio aviso', 'OK:0',
  pg_temp.exec_como((select user_elza from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_elza from ids))));

select pg_temp.rec('2.11', 'anon não atualiza nada', 'ERR:GRANT',
  pg_temp.como_anon('update public.notifications set read_at = now()'));

-- 3. Marcar como lido não move o aviso -----------------------------------------
--
-- A SEÇÃO QUE PRECISA DE RODEIO PARA PROVAR O QUE AFIRMA, e que foi reescrita
-- depois de um teste de mutação mostrar que a primeira versão não provava.
--
-- O ataque é um UPDATE que, no mesmo comando, marca como lido e troca
-- `recipient_id`: ele passa pelo `using` (a linha era sua) e gravaria o aviso no
-- sino de outra pessoa.
--
-- TRÊS COISAS O RECUSAM, e elas não são a mesma coisa:
--   a) o GRANT de coluna da 0120 — `authenticated` só tem UPDATE de `read_at`, e
--      é ele que opina primeiro (caso 3.1);
--   b) com o GRANT fora do caminho, a RLS (casos 3.5 e 3.6);
--   c) mas (b) NÃO prova que o `with check` escrito está fazendo o trabalho:
--      policy de UPDATE sem `with check` reaproveita o `using` como check da
--      linha de saída, e o mutante sem a cláusula passa nos casos 3.5 e 3.6
--      exatamente igual. Isso foi medido, não suposto.
--
-- Então 3.9-3.13 fazem o que falta: ALARGAM o `using` dentro desta transação —
-- o pedido plausível, "o Diretor marca como lido pela equipe" — mantendo o
-- `with check` como está. Nesse estado, a Diretora alcança o aviso do Bruno
-- (controle) e continua sem poder mandá-lo para o Caio. Com a cláusula
-- implícita, aquele alargamento teria levado o check junto e a última linha
-- passaria. É esse o caso que distingue os dois desenhos.
--
-- A seção inteira concede, altera e devolve; tudo morre no ROLLBACK, e os casos
-- 3.8, 3.13 e 3.14 conferem a devolução mesmo assim.

select pg_temp.rec('3.1', 'mover o aviso para o colega é recusado pelo GRANT de coluna', 'ERR:GRANT',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now(), recipient_id = %L where id = %L',
    (select col_caio from ids), (select n_bruno_2 from ids))));

select pg_temp.rec('3.2', 'CONTROLE: a coluna recipient_id não é gravável por quem está logado', 'false',
  has_column_privilege('authenticated', 'public.notifications', 'recipient_id', 'update')::text);

/* A partir daqui o GRANT sai do caminho. Morre no ROLLBACK, e o caso 3.6
   confere a volta mesmo assim. */
grant update (recipient_id, tenant_id) on table public.notifications to authenticated;

select pg_temp.rec('3.3', 'CONTROLE: com o GRANT aberto, o privilégio realmente mudou', 'true|true',
  has_column_privilege('authenticated', 'public.notifications', 'recipient_id', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'tenant_id', 'update')::text);

/* CONTROLE do controle: com o GRANT aberto, o UPDATE legítimo continua passando.
   Sem este caso, as recusas abaixo poderiam estar vindo de qualquer outra coisa
   que tivesse quebrado junto. */
select pg_temp.rec('3.4', 'CONTROLE: com o GRANT aberto, marcar o próprio como lido ainda funciona', 'OK:1',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_2 from ids))));

/* Sem o GRANT no caminho, quem recusa é a RLS: ERR:RLS, e não ERR:GRANT. Qual
   das duas cláusulas recusou, este caso NÃO distingue — é o que 3.9-3.13 fazem. */
select pg_temp.rec('3.5', 'e trocar recipient_id no mesmo UPDATE é recusado pela RLS', 'ERR:RLS',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now(), recipient_id = %L where id = %L',
    (select col_caio from ids), (select n_bruno_2 from ids))));

/* Trocar o ESCRITÓRIO da linha é o mesmo ataque um passo mais longe. A FK
   composta (recipient_id, tenant_id) também barraria, mas por outro motivo e com
   outro código — o que este caso afirma é que a policy chega primeiro. */
select pg_temp.rec('3.6', 'e mudar o tenant_id da linha também', 'ERR:RLS',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now(), tenant_id = %L where id = %L',
    (select tenant_b from ids), (select n_bruno_2 from ids))));

select pg_temp.rec('3.7', 'o aviso continua sendo do Bruno',
  (select col_bruno::text from ids) || '|lida',
  pg_temp.linha((select n_bruno_2 from ids)));

/* CONTROLE da seção inteira: hoje a Diretora não alcança a linha nem com o GRANT
   aberto, porque o `using` é estreito. É o estado "antes" do alargamento. */
select pg_temp.rec('3.8', 'CONTROLE: com o using estreito, a Diretora não alcança o aviso do Bruno', 'OK:0',
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_2 from ids))));

/*
  O ALARGAMENTO PLAUSÍVEL, aplicado à mão: "o Diretor marca como lido pela
  equipe". Só os `using` mudam; o `with check` fica o que a 0121 escreveu — e é
  justamente essa independência que a cláusula explícita compra.

  AS DUAS POLICIES PRECISAM ALARGAR, e isso foi medido: alargar só a de UPDATE
  deixa o caso 3.9 em OK:0. Um `update ... where id = x` LÊ a linha, e a policy
  de SELECT também vale nessa leitura. É mais um lugar em que a policy de leitura
  está protegendo a escrita de carona — e é por isso que não dá para raciocinar
  sobre a de UPDATE isolada.
*/
alter policy notifications_select_own_recipient on public.notifications
  using (tenant_id = (select public.auth_tenant_id()));

alter policy notifications_update_own_recipient on public.notifications
  using (tenant_id = (select public.auth_tenant_id()));

select pg_temp.rec('3.9', 'CONTROLE: com os using alargados, a Diretora PASSA a ler o aviso do Bruno', '1',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where id = %L',
    (select n_bruno_2 from ids))));

/*
  O CASO QUE A SEÇÃO EXISTE PARA FAZER, e ele mede MAIS do que se esperava.
  Com o `with check` implícito, o alargamento acima teria levado o check junto e
  a Diretora passaria a poder gravar na linha do Bruno — inclusive mandá-la para
  um terceiro, no caso 3.11.
  Escrito, o check não se mexeu: ele exige que a linha GRAVADA seja dela, e a
  linha do Bruno não é. Então nem o UPDATE inocente passa.
  ISSO É FALHAR FECHADO, e é a propriedade que se quer: quem alargar o `using`
  um dia tropeça aqui e tem que decidir de propósito o que fazer com a linha de
  saída, em vez de ganhar o direito de mover avisos sem ter pedido.
*/
select pg_temp.rec('3.10', 'mas o WITH CHECK escrito recusa até o UPDATE inocente dela', 'ERR:RLS',
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_2 from ids))));

select pg_temp.rec('3.11', 'e muito menos manda o aviso do Bruno para o Caio', 'ERR:RLS',
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now(), recipient_id = %L where id = %L',
    (select col_caio from ids), (select n_bruno_2 from ids))));

select pg_temp.rec('3.12', 'o aviso continua sendo do Bruno',
  (select col_bruno::text from ids) || '|lida',
  pg_temp.linha((select n_bruno_2 from ids)));

alter policy notifications_select_own_recipient on public.notifications
  using (tenant_id = (select public.auth_tenant_id())
         and recipient_id = (select public.auth_collaborator_id()));

alter policy notifications_update_own_recipient on public.notifications
  using (tenant_id = (select public.auth_tenant_id())
         and recipient_id = (select public.auth_collaborator_id()));

select pg_temp.rec('3.13', 'restaurados os using, a Diretora volta a não ler nem alcançar a linha', '0|OK:0',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    'select count(*)::text from public.notifications where id = %L',
    (select n_bruno_2 from ids))) || '|' ||
  pg_temp.exec_como((select user_dalva from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now() where id = %L',
    (select n_bruno_2 from ids))));

revoke update (recipient_id, tenant_id) on table public.notifications from authenticated;

/* O estado voltou ao da 0120: só read_at é gravável, e o ataque volta a morrer
   no GRANT. */
select pg_temp.rec('3.14', 'revogado o GRANT extra, a recusa volta a ser do privilégio', 'false|ERR:GRANT',
  has_column_privilege('authenticated', 'public.notifications', 'recipient_id', 'update')::text || '|' ||
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'update public.notifications set read_at = now(), recipient_id = %L where id = %L',
    (select col_caio from ids), (select n_bruno_2 from ids))));

-- 4. O GRANT DE COLUNA CONTINUA DE PÉ ------------------------------------------
--
-- As policies não podem ter afrouxado o que a 0120 trancou. São duas barreiras
-- separadas (achado da 0007), e a da 0121 é sobre LINHA — a de coluna é a que
-- impede o aviso de ser falsificado por quem o recebeu.

select pg_temp.rec('4.1', 'reescrever o título copiado é recusado, mesmo no próprio aviso', 'ERR:GRANT',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    $q$update public.notifications set task_title = 'Outra coisa' where id = %L$q$,
    (select n_bruno_1 from ids))));

/* O mais grave dos dois: `actor_name` é o que a tela mostra como "quem te
   atribuiu". Gravável, ele viraria prova de uma cobrança que ninguém fez. */
select pg_temp.rec('4.2', 'reescrever o nome de quem atribuiu também', 'ERR:GRANT',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    $q$update public.notifications set actor_name = 'Dalva Diretora' where id = %L$q$,
    (select n_bruno_1 from ids))));

select pg_temp.rec('4.3', 'e a espécie do aviso', 'ERR:GRANT',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    $q$update public.notifications set kind = 'task_overdue' where id = %L$q$,
    (select n_bruno_1 from ids))));

select pg_temp.rec('4.4', 'o aviso do Bruno não mudou uma letra',
  'Humanização: render externo da fachada|Ana Coordenadora|task_assigned',
  (select task_title || '|' || coalesce(actor_name, '<sem autor>') || '|' || kind::text
     from public.notifications where id = (select n_bruno_1 from ids)));

select pg_temp.rec('4.5', 'quem está logado NÃO insere aviso, nem para si mesmo', 'ERR:GRANT',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title)
       values (%L, %L, 'task_assigned', %L, 'Aviso forjado')$q$,
    (select tenant_a from ids), (select col_bruno from ids), (select t_render from ids))));

select pg_temp.rec('4.6', 'nem apaga o próprio aviso', 'ERR:GRANT',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    'delete from public.notifications where id = %L', (select n_bruno_1 from ids))));

select pg_temp.rec('4.7', 'anon não insere', 'ERR:GRANT',
  pg_temp.como_anon(format(
    $q$insert into public.notifications (tenant_id, recipient_id, kind, task_id, task_title)
       values (%L, %L, 'task_assigned', %L, 'Aviso anônimo')$q$,
    (select tenant_a from ids), (select col_bruno from ids), (select t_render from ids))));

select pg_temp.rec('4.8', 'o aviso do Bruno continua lá depois de tudo isso', '1',
  (select count(*)::text from public.notifications where id = (select n_bruno_1 from ids)));

-- 5. O CATÁLOGO: duas policies, e só duas --------------------------------------

select pg_temp.rec('5.1', 'RLS está ligada em notifications', 'true',
  (select relrowsecurity::text from pg_class
    where relname = 'notifications' and relnamespace = 'public'::regnamespace));

/*
  SEM FORCE: o gatilho e a varredura são SECURITY DEFINER do dono da tabela, e é
  por não haver FORCE ROW LEVEL SECURITY que eles gravam. Ligar FORCE "para
  endurecer" pararia o sino de encher — mesma dependência dos helpers da 0007.
*/
select pg_temp.rec('5.2', 'e NÃO está em modo FORCE, que é o que deixa os escritores gravarem', 'false',
  (select relforcerowsecurity::text from pg_class
    where relname = 'notifications' and relnamespace = 'public'::regnamespace));

select pg_temp.rec('5.3', 'exatamente duas policies, uma de SELECT e uma de UPDATE', 'SELECT,UPDATE',
  (select string_agg(cmd, ',' order by cmd) from pg_policies
    where schemaname = 'public' and tablename = 'notifications'));

/* Nenhuma de INSERT, nenhuma de DELETE, e nenhuma de ALL. Policy de ALL é a que
   mais engana: ela cobriria os quatro comandos de uma vez e ainda assim o 5.3
   mostraria só 'ALL'. */
select pg_temp.rec('5.4', 'nenhuma policy de INSERT, DELETE ou ALL', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and cmd in ('INSERT', 'DELETE', 'ALL')));

select pg_temp.rec('5.5', 'a de UPDATE declara WITH CHECK, e não só USING', '1',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and cmd = 'UPDATE' and with_check is not null));

/* As duas são `to authenticated`. Policy em `public` alcançaria também `anon` —
   hoje sem GRANT, mas é a combinação que já foi ao ar errada uma vez (0007). */
select pg_temp.rec('5.6', 'as duas são para authenticated, e nenhuma para public ou anon', '{authenticated},{authenticated}',
  (select string_agg(roles::text, ',' order by cmd) from pg_policies
    where schemaname = 'public' and tablename = 'notifications'));

select pg_temp.rec('5.7', 'as duas são PERMISSIVE e as duas têm USING', 'true',
  (select (count(*) = 2)::text from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and permissive = 'PERMISSIVE' and qual is not null));

/*
  O RECORTE É A PESSOA, e este caso guarda a frase. As duas expressões têm que
  mencionar auth_collaborator_id: uma policy reescrita só com tenant_id passaria
  em 5.3, 5.5 e 5.6 e abriria o sino do escritório inteiro.
*/
select pg_temp.rec('5.8', 'as duas expressões recortam por colaborador, e não só por escritório', '2|2|1',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and qual like '%auth_collaborator_id%' and qual like '%auth_tenant_id%')
  || '|' ||
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and qual like '%auth_tenant_id%')
  || '|' ||
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and cmd = 'UPDATE'
      and with_check like '%auth_collaborator_id%' and with_check like '%auth_tenant_id%'));

/* Regra da casa: policy sem COMMENT é policy cuja intenção mora na cabeça de
   quem a escreveu. */
select pg_temp.rec('5.9', 'as duas policies têm COMMENT', '2',
  (select count(*)::text from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'notifications' and c.relnamespace = 'public'::regnamespace
     and obj_description(p.oid, 'pg_policy') is not null));

select pg_temp.rec('5.10', 'e o GRANT de tabela continua o da 0120: só SELECT', 'SELECT',
  (select string_agg(distinct privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'notifications'
      and grantee = 'authenticated'));

select pg_temp.rec('5.11', 'anon não tem privilégio nenhum na tabela', '<null>',
  coalesce((select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'notifications'
      and grantee = 'anon'), '<null>'));

/* O GRANT DE COLUNA DEPOIS DO VAIVÉM DA SEÇÃO 3: read_at continua gravável e
   mais nada. O revoke de lá era de coluna, e um revoke de coluna errado teria
   levado read_at junto — o sino pararia de marcar como lido e nenhum outro caso
   desta suíte perceberia. */
select pg_temp.rec('5.12', 'o UPDATE de authenticated continua sendo só de read_at',
  'true|false|false|false|false',
  has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'recipient_id', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'tenant_id', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'task_title', 'update')::text || '|' ||
  has_column_privilege('authenticated', 'public.notifications', 'actor_name', 'update')::text);

/* O bypass de service_role é server-side e é de propósito: é quem o agendamento
   e as Edge Functions usam, e a chave dele nunca vai para o navegador. Policy
   nenhuma se aplica a ele, porque as duas são `to authenticated`. */
select pg_temp.rec('5.13', 'service_role segue com os quatro privilégios (é o bypass server-side)',
  'true|true|true|true',
  has_table_privilege('service_role', 'public.notifications', 'select')::text || '|' ||
  has_table_privilege('service_role', 'public.notifications', 'insert')::text || '|' ||
  has_table_privilege('service_role', 'public.notifications', 'update')::text || '|' ||
  has_table_privilege('service_role', 'public.notifications', 'delete')::text);

-- 6. OS ESCRITORES CONTINUAM ESCREVENDO ----------------------------------------
--
-- A seção que impede o conjunto de passar por estar tudo trancado. Com RLS
-- ligada e policies que só falam de leitura e de read_at, o gatilho e a
-- varredura não poderiam ter parado de gravar — e se tivessem, nada acima
-- denunciaria: todos os casos negativos continuariam verdes.
--
-- Esta seção cria avisos novos, e por isso vem no fim: as contagens das seções
-- anteriores são do fixture.

select pg_temp.rec('6.1', 'CONTROLE: a Ana atribui uma tarefa e o gatilho grava o aviso', 'OK:1',
  pg_temp.exec_como((select user_ana from ids), (select tenant_a from ids), format(
    $q$insert into public.tasks (id, tenant_id, project_id, title, phase, status, responsible_id)
       values (%L, %L, %L, 'Prancha de apresentação', 'layout', 'in_progress', %L)$q$,
    (select t_nova from ids), (select tenant_a from ids), (select proj_a from ids),
    (select col_fabio from ids))));

select pg_temp.rec('6.2', 'o aviso nasceu, para quem não tem login, com as policies no lugar', '1',
  (select count(*)::text from public.notifications
    where task_id = (select t_nova from ids) and recipient_id = (select col_fabio from ids)
      and kind = 'task_assigned'));

select pg_temp.sem_sessao();

insert into public.tasks (id, tenant_id, project_id, title, phase, status, responsible_id, due_date) values
  ((select t_atrasada from ids), (select tenant_a from ids), (select proj_a from ids),
   'Protocolar projeto legal', 'layout', 'in_progress', (select col_bruno from ids), current_date - 3);

select pg_temp.rec('6.3', 'CONTROLE: a varredura grava o aviso de atraso', '1',
  (select public.scan_overdue_tasks(p_tenant_id => (select tenant_a from ids))::text));

select pg_temp.rec('6.4', 'e o Bruno LÊ o aviso de atraso que a varredura criou para ele', '1',
  pg_temp.valor_como((select user_bruno from ids), (select tenant_a from ids), format(
    $q$select count(*)::text from public.notifications
        where task_id = %L and kind = 'task_overdue'$q$,
    (select t_atrasada from ids))));

/* E ninguém mais lê. É o fecho do arquivo: o aviso que acabou de nascer já nasce
   recortado. */
select pg_temp.rec('6.5', 'e mais ninguém o lê — nem a Diretora, nem o colega', '0|0',
  pg_temp.valor_como((select user_dalva from ids), (select tenant_a from ids), format(
    $q$select count(*)::text from public.notifications
        where task_id = %L and kind = 'task_overdue'$q$,
    (select t_atrasada from ids))) || '|' ||
  pg_temp.valor_como((select user_caio from ids), (select tenant_a from ids), format(
    $q$select count(*)::text from public.notifications
        where task_id = %L and kind = 'task_overdue'$q$,
    (select t_atrasada from ids))));

select pg_temp.rec('6.6', 'e o Bruno marca esse aviso novo como lido', 'OK:1',
  pg_temp.exec_como((select user_bruno from ids), (select tenant_a from ids), format(
    $q$update public.notifications set read_at = now()
        where task_id = %L and kind = 'task_overdue'$q$,
    (select t_atrasada from ids))));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
