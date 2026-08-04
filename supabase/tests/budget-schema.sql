-- Teste do modulo 8 (Fornecedores e Orcamento por Cliente) - o que e especifico
-- destas cinco tabelas, das duas views de total e do bucket de arquivos.
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio de tabela, quatro
--   policies, WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios nos dois sentidos, colaborador
--   afastado sem leitura, escrita presa ao menu) estao em
--   supabase/tests/pattern-invariants.sql e cobrem as cinco tabelas desde que
--   elas entraram em pattern_tables. NADA disso se repete aqui.
--
--   Aqui fica o resto: as duas chaves de menu (a suite de padrao nao as
--   distingue), a coluna gerada de comissao, as duas views de total, as FKs
--   aninhadas, o que a exclusao leva junto e o que ela recusa, os recortes de
--   dominio e - superficie nova neste modulo - as policies do Storage.
--
-- POR QUE A SECAO 1 EXISTE
--   Como no modulo 7, este modulo tem DUAS chaves de menu governando tabelas
--   diferentes (suppliers e client_budget). O editor da suite de padrao recebe
--   can_edit em TODO menu do registro, entao uma policy de budget_checklists que
--   lesse 'suppliers' por engano passaria nos 26 casos dela. Os casos 1.x usam
--   duas pessoas, cada uma com exatamente um dos dois menus.
--
-- POR QUE A SECAO 8 EXISTE
--   O bucket e a unica superficie de arquivo do sistema, e nao existe suite de
--   padrao para Storage: storage.objects nao e tabela do projeto, tem RLS ligada
--   pelo Supabase e concede TUDO a anon e a authenticated por padrao. Ou seja, ali
--   a policy nao e uma das duas metades da tranca - e a unica.
--
-- COMO RODAR
--   npm run test:schema:budget
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou/devolveu n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23503 FK violada,
--                         23505 unicidade violada, 42501 policy/privilegio,
--                         428C9 escrita em coluna gerada.
--   Nas secoes 2, 3 e 4 o observado e o VALOR devolvido, e nao contagem de
--   linhas: uma coluna ou view que responda errado devolve uma linha do mesmo
--   jeito.
--
--   TODO caso de negacao tem um CONTROLE ao lado. Este projeto ja teve teste de
--   negacao passar por falta de GRANT em vez de resultado vazio (migration 0036),
--   e quem acusou foi o controle.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug budget-schema-test-*) e os objetos de Storage sao inseridos na
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

-- Sonda de VALOR, para colunas calculadas e views: pg_temp.try devolve contagem
-- de linhas, e um total que responda errado devolve UMA linha do mesmo jeito.
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
  'b1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'b2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  -- Duas pessoas com UM menu cada, e uma afastada com os dois. E o trio que a
  -- suite de padrao nao consegue montar.
  'b1000000-0000-4000-8000-000000000001'::uuid as u_sup,
  'b1000000-0000-4000-8000-000000000002'::uuid as u_bud,
  'b1000000-0000-4000-8000-000000000003'::uuid as u_leave,
  'b2000000-0000-4000-8000-000000000001'::uuid as u_b,
  'b1100000-0000-4000-8000-000000000001'::uuid as c_sup,
  'b1100000-0000-4000-8000-000000000002'::uuid as c_bud,
  'b1100000-0000-4000-8000-000000000003'::uuid as c_leave,
  'b2100000-0000-4000-8000-000000000001'::uuid as c_b,
  'b1200000-0000-4000-8000-000000000001'::uuid as cli_a,
  'b2200000-0000-4000-8000-000000000001'::uuid as cli_b,
  'b1300000-0000-4000-8000-000000000001'::uuid as sup_a1,
  'b1300000-0000-4000-8000-000000000002'::uuid as sup_a2,
  'b1300000-0000-4000-8000-000000000003'::uuid as sup_a3,
  'b1300000-0000-4000-8000-000000000004'::uuid as sup_del,
  'b2300000-0000-4000-8000-000000000001'::uuid as sup_b1,
  'b1400000-0000-4000-8000-000000000001'::uuid as chk_a,
  'b1400000-0000-4000-8000-000000000002'::uuid as chk_empty,
  'b1400000-0000-4000-8000-000000000003'::uuid as chk_del,
  -- Alvo das escritas da secao 1. Existe para que os INSERTs de controle dela
  -- (que NAO sao desfeitos - chk_as nao usa subtransacao) nao entrem nos totais
  -- que a secao 3 confere. A primeira versao deste arquivo escrevia no chk_a e o
  -- progresso caiu de 33% para 25%: o caso 3.5 e quem acusou.
  'b1400000-0000-4000-8000-000000000004'::uuid as chk_scratch,
  'b2400000-0000-4000-8000-000000000001'::uuid as chk_b,
  'b1500000-0000-4000-8000-000000000001'::uuid as item1,
  'b1500000-0000-4000-8000-000000000002'::uuid as item2,
  'b1500000-0000-4000-8000-000000000003'::uuid as item3,
  'b1500000-0000-4000-8000-000000000004'::uuid as item_del,
  'b1500000-0000-4000-8000-000000000005'::uuid as item_del2,
  'b1500000-0000-4000-8000-000000000006'::uuid as item_scratch,
  'b2500000-0000-4000-8000-000000000001'::uuid as item_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_sup from ids) u, 'budget-sup@example.test' e
  union all select (select u_bud from ids), 'budget-bud@example.test'
  union all select (select u_leave from ids), 'budget-leave@example.test'
  union all select (select u_b from ids), 'budget-b@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Budget Schema Test A', 'budget-schema-test-a'),
  ((select tenant_b from ids), 'Budget Schema Test B', 'budget-schema-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_sup from ids), 'member'),
  ((select tenant_a from ids), (select u_bud from ids), 'member'),
  ((select tenant_a from ids), (select u_leave from ids), 'member'),
  ((select tenant_b from ids), (select u_b from ids), 'member');

-- Nenhum deles e Diretor, de proposito: can_edit_menu tem atalho de Diretor
-- (0019) e Diretor passaria nos cruzamentos da secao 1 sem provar nada.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_sup from ids), (select tenant_a from ids), (select u_sup from ids),
   'Bianca Rezende', 'admin_staff', 'budget-sup@example.test', 'active'),
  ((select c_bud from ids), (select tenant_a from ids), (select u_bud from ids),
   'Tiago Barbosa', 'coordinator', 'budget-bud@example.test', 'active'),
  ((select c_leave from ids), (select tenant_a from ids), (select u_leave from ids),
   'Marina Peixoto', 'architect', 'budget-leave@example.test', 'on_leave'),
  ((select c_b from ids), (select tenant_b from ids), (select u_b from ids),
   'Sergio Alencar', 'coordinator', 'budget-b@example.test', 'active');

-- UM menu para cada, e a linha do outro menu existe com can_edit FALSO. A linha
-- precisa existir: sem ela, "nao escreve" nao distingue "permissao negada" de
-- "permissao ausente", e uma policy que lesse a chave errada seria negada pelos
-- dois motivos ao mesmo tempo.
--
-- A afastada recebe os DOIS com can_edit, de proposito: assim "afastada nao le o
-- arquivo" so pode ser por causa de is_active_collaborator().
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_sup from ids), 'suppliers', true, true),
  ((select tenant_a from ids), (select c_sup from ids), 'client_budget', true, false),
  ((select tenant_a from ids), (select c_bud from ids), 'client_budget', true, true),
  ((select tenant_a from ids), (select c_bud from ids), 'suppliers', true, false),
  ((select tenant_a from ids), (select c_leave from ids), 'suppliers', true, true),
  ((select tenant_a from ids), (select c_leave from ids), 'client_budget', true, true),
  ((select tenant_b from ids), (select c_b from ids), 'suppliers', true, true),
  ((select tenant_b from ids), (select c_b from ids), 'client_budget', true, true);

insert into public.clients (id, tenant_id, name, phone, address_city, address_state) values
  ((select cli_a from ids), (select tenant_a from ids), 'Familia Rocha', '(62) 98111-0001', 'Goiania', 'GO'),
  ((select cli_b from ids), (select tenant_b from ids), 'Familia Duarte', '(62) 98111-0002', 'Anapolis', 'GO');

insert into public.suppliers (id, tenant_id, name, category, contact_whatsapp, commission_percent) values
  ((select sup_a1 from ids), (select tenant_a from ids), 'Ceramica Centro-Oeste',
   'ceramics_porcelain', '(62) 3222-0001', 5),
  ((select sup_a2 from ids), (select tenant_a from ids), 'Marmoraria Serra Dourada',
   'natural_stone', '(62) 3222-0002', 10),
  ((select sup_a3 from ids), (select tenant_a from ids), 'Iluminacao Bueno',
   'indoor_lighting', '(62) 3222-0003', null),
  ((select sup_del from ids), (select tenant_a from ids), 'Vidracaria Oeste',
   'glass_mirrors', '(62) 3222-0004', null),
  ((select sup_b1 from ids), (select tenant_b from ids), 'Esquadrias Anapolis',
   'frames_openings', '(62) 3333-0001', 7);

insert into public.supplier_brands (tenant_id, supplier_id, name) values
  ((select tenant_a from ids), (select sup_a1 from ids), 'Portobello'),
  ((select tenant_a from ids), (select sup_del from ids), 'Blindex');

insert into public.budget_checklists (id, tenant_id, client_id, curation_percent, status) values
  ((select chk_a from ids), (select tenant_a from ids), (select cli_a from ids), 10, 'in_progress'),
  ((select chk_empty from ids), (select tenant_a from ids), (select cli_a from ids), 10, 'open'),
  ((select chk_del from ids), (select tenant_a from ids), (select cli_a from ids), null, 'open'),
  ((select chk_scratch from ids), (select tenant_a from ids), (select cli_a from ids), null, 'open'),
  ((select chk_b from ids), (select tenant_b from ids), (select cli_b from ids), 5, 'open');

-- Os tres itens do checklist A montam os totais esperados da secao 3:
--   estimado 8000 + 4000            = 12000,00
--   aprovado 10000                  = 10000,00
--   comissao 500 (item1) + 400 (item2) = 900,00   (calculada pelo banco)
--   comissao recebida               =   500,00   (so o item1 esta marcado)
--   finalizados 1 de 3              = 33%
--   curadoria 10% sobre o aprovado  =  1000,00
insert into public.budget_checklist_items
  (id, tenant_id, checklist_id, name, category, estimated_value, approved_value,
   commission_percent, chosen_supplier_id, status, commission_received) values
  ((select item1 from ids), (select tenant_a from ids), (select chk_a from ids),
   'Porcelanato sala de estar', 'ceramics_porcelain', 8000, 10000, 5,
   (select sup_a1 from ids), 'approved', true),
  ((select item2 from ids), (select tenant_a from ids), (select chk_a from ids),
   'Bancada da cozinha', 'natural_stone', 4000, null, 10,
   (select sup_a2 from ids), 'quoted', false),
  ((select item3 from ids), (select tenant_a from ids), (select chk_a from ids),
   'Luminarias do hall', 'indoor_lighting', null, null, null,
   null, 'pending', false),
  ((select item_del from ids), (select tenant_a from ids), (select chk_del from ids),
   'Item que sera apagado', 'glass_mirrors', null, null, null, null, 'pending', false),
  ((select item_del2 from ids), (select tenant_a from ids), (select chk_del from ids),
   'Item que cai com o checklist', 'other', null, null, null, null, 'pending', false),
  ((select item_scratch from ids), (select tenant_a from ids), (select chk_scratch from ids),
   'Item de rascunho da secao 1', 'other', null, null, null, null, 'pending', false),
  ((select item_b from ids), (select tenant_b from ids), (select chk_b from ids),
   'Esquadria da suite', 'frames_openings', 3000, null, null, null, 'pending', false);

insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value) values
  ((select tenant_a from ids), (select item1 from ids), (select sup_a1 from ids), 10000),
  ((select tenant_a from ids), (select item1 from ids), (select sup_a2 from ids), 11000),
  ((select tenant_a from ids), (select item_del from ids), (select sup_del from ids), 900);

-- Dois objetos no bucket, um por escritorio. O caminho comeca pelo tenant_id -
-- e esse primeiro segmento que a policy compara com o claim do JWT.
insert into storage.objects (bucket_id, name) values
  ('budget-files', 'b1111111-1111-4111-8111-111111111111/b1400000-0000-4000-8000-000000000001/aaaaaaaa.pdf'),
  ('budget-files', 'b2222222-2222-4222-8222-222222222222/b2400000-0000-4000-8000-000000000001/bbbbbbbb.pdf');

-- 1. Cada policy le a SUA chave de menu -----------------------------------------

select pg_temp.chk_as('1.1', 'CONTROLE: quem tem suppliers CRIA fornecedor', 'OK:1',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  insert into public.suppliers (tenant_id, name, category, contact_whatsapp)
  values (%L, 'Automacao Flamboyant', 'home_automation', '(62) 3222-9001')
$q$, (select tenant_a from ids)));

select pg_temp.chk_as('1.2', 'quem tem SO client_budget NAO cria fornecedor', 'ERR:42501',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  insert into public.suppliers (tenant_id, name, category, contact_whatsapp)
  values (%L, 'Automacao Flamboyant', 'home_automation', '(62) 3222-9001')
$q$, (select tenant_a from ids)));

select pg_temp.chk_as('1.3', 'CONTROLE: quem tem suppliers CRIA marca', 'OK:1',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  insert into public.supplier_brands (tenant_id, supplier_id, name)
  values (%L, %L, 'Eliane')
$q$, (select tenant_a from ids), (select sup_a1 from ids)));

select pg_temp.chk_as('1.4', 'quem tem SO client_budget NAO cria marca', 'ERR:42501',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  insert into public.supplier_brands (tenant_id, supplier_id, name)
  values (%L, %L, 'Eliane')
$q$, (select tenant_a from ids), (select sup_a1 from ids)));

select pg_temp.chk_as('1.5', 'CONTROLE: quem tem client_budget CRIA checklist', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  insert into public.budget_checklists (tenant_id, client_id) values (%L, %L)
$q$, (select tenant_a from ids), (select cli_a from ids)));

select pg_temp.chk_as('1.6', 'quem tem SO suppliers NAO cria checklist', 'ERR:42501',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  insert into public.budget_checklists (tenant_id, client_id) values (%L, %L)
$q$, (select tenant_a from ids), (select cli_a from ids)));

select pg_temp.chk_as('1.7', 'CONTROLE: quem tem client_budget CRIA item', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  insert into public.budget_checklist_items (tenant_id, checklist_id, name)
  values (%L, %L, 'Piso da varanda')
$q$, (select tenant_a from ids), (select chk_scratch from ids)));

select pg_temp.chk_as('1.8', 'quem tem SO suppliers NAO cria item', 'ERR:42501',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  insert into public.budget_checklist_items (tenant_id, checklist_id, name)
  values (%L, %L, 'Piso da varanda')
$q$, (select tenant_a from ids), (select chk_scratch from ids)));

-- A cotacao aponta para um fornecedor, e mesmo assim a permissao que vale e a do
-- orcamento: quem cuida do cadastro de fornecedores nao mexe no orcamento de um
-- cliente. Sem 1.10, uma policy que lesse 'suppliers' aqui passaria despercebida.
select pg_temp.chk_as('1.9', 'CONTROLE: quem tem client_budget CRIA cotacao', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value)
  values (%L, %L, %L, 9500)
$q$, (select tenant_a from ids), (select item_scratch from ids), (select sup_a1 from ids)));

select pg_temp.chk_as('1.10', 'quem tem SO suppliers NAO cria cotacao', 'ERR:42501',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value)
  values (%L, %L, %L, 9500)
$q$, (select tenant_a from ids), (select item_scratch from ids), (select sup_a1 from ids)));

-- CONTROLES de leitura: a leitura deste modulo e LARGA, e o menu nao a recorta.
-- Sem estes dois, uma policy de SELECT que exigisse can_edit passaria em tudo
-- acima e so apareceria na tela de quem consulta.
select pg_temp.chk_as('1.11', 'CONTROLE: quem tem SO suppliers LE o checklist', 'OK:1',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  select 1 from public.budget_checklists where id = %L
$q$, (select chk_a from ids)));

select pg_temp.chk_as('1.12', 'CONTROLE: quem tem SO client_budget LE o fornecedor', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  select 1 from public.suppliers where id = %L
$q$, (select sup_a1 from ids)));

-- 2. commission_value e calculada pelo banco --------------------------------------
--
-- No original a conta e feita no formulario (ItemOrcamentoForm.jsx:79-83) e
-- gravada como campo solto. Aqui e coluna gerada: qualquer caminho de escrita
-- produz o mesmo valor.

select pg_temp.val('2.1', 'usa o valor APROVADO quando existe: 10000 x 5%', '500.00', format($q$
  select commission_value::text from public.budget_checklist_items where id = %L
$q$, (select item1 from ids)));

-- O caso que separa "aprovado" de "estimado". Uma formula escrita so sobre
-- valor_estimado passaria em 2.1 (8000 x 5% = 400) e cairia aqui... e vice-versa:
-- e por isso que os dois itens tem valores diferentes.
select pg_temp.val('2.2', 'cai para o ESTIMADO quando nao ha aprovado: 4000 x 10%', '400.00', format($q$
  select commission_value::text from public.budget_checklist_items where id = %L
$q$, (select item2 from ids)));

select pg_temp.val('2.3', 'sem percentual acordado a comissao e NULA, e nao zero', '<null>', format($q$
  select commission_value::text from public.budget_checklist_items where id = %L
$q$, (select item3 from ids)));

-- Coluna gerada nao aceita valor da aplicacao: 428C9 e o Postgres recusando a
-- escrita, e nao um check. E o que impede a conta do original voltar por uma tela
-- nova.
select pg_temp.chk('2.4', 'escrita direta em commission_value e recusada', 'ERR:428C9', format($q$
  update public.budget_checklist_items set commission_value = 1 where id = %L
$q$, (select item1 from ids)));

-- O caso que o campo gravado do original erra: mudar o valor aprovado sem passar
-- pelo formulario deixa a comissao antiga no lugar.
select pg_temp.chk('2.5', 'muda o valor aprovado do item', 'OK:1', format($q$
  update public.budget_checklist_items set approved_value = 20000 where id = %L
$q$, (select item1 from ids)));

select pg_temp.val('2.6', 'a comissao se recalcula sozinha: 20000 x 5%', '1000.00', format($q$
  select commission_value::text from public.budget_checklist_items where id = %L
$q$, (select item1 from ids)));

-- Devolve o cenario da secao 3, que espera 10000 no item1.
select pg_temp.chk('2.7', 'volta o valor aprovado para o cenario da secao 3', 'OK:1', format($q$
  update public.budget_checklist_items set approved_value = 10000 where id = %L
$q$, (select item1 from ids)));

-- Dinheiro arredonda a centavo, e nao carrega tres casas para dentro da soma.
select pg_temp.val('2.8', 'arredonda a centavo: 1234.56 x 7.5% = 92.59', '92.59', format($q$
  with novo as (
    insert into public.budget_checklist_items
      (tenant_id, checklist_id, name, approved_value, commission_percent)
    values (%L, %L, 'Item de arredondamento', 1234.56, 7.5)
    returning commission_value
  )
  select commission_value::text from novo
$q$, (select tenant_a from ids), (select chk_empty from ids)));

-- E desfaz, para nao sujar os totais do checklist vazio da secao 3.
select pg_temp.chk('2.9', 'remove o item de arredondamento', 'OK:1', format($q$
  delete from public.budget_checklist_items
   where checklist_id = %L and name = 'Item de arredondamento'
$q$, (select chk_empty from ids)));

-- 3. budget_checklist_totals ---------------------------------------------------
--
-- Os quatro totais do original sao campos gravados que a tela recalcula a cada
-- mexida - e nem sempre os quatro (ChecklistDetalhe.jsx:198 manda so a comissao).

select pg_temp.val('3.1', 'total estimado: 8000 + 4000', '12000.00', format($q$
  select estimated_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

select pg_temp.val('3.2', 'total aprovado: so o item aprovado conta', '10000.00', format($q$
  select approved_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

select pg_temp.val('3.3', 'total de comissao prevista: 500 + 400', '900.00', format($q$
  select commission_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

-- Sem este caso, uma soma que ignorasse o filtro de comissao_recebida passaria em
-- 3.3 e mostraria toda a comissao prevista como se ja tivesse entrado no caixa.
select pg_temp.val('3.4', 'comissao RECEBIDA: so o item marcado', '500.00', format($q$
  select commission_received_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

select pg_temp.val('3.5', 'progresso: 1 finalizado de 3 itens', '33', format($q$
  select progress_percent::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

select pg_temp.val('3.6', 'curadoria: 10% sobre o total APROVADO', '1000.00', format($q$
  select curation_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

-- Checklist recem-criado, sem item nenhum. E o estado mais comum da tela logo
-- depois do "Novo Checklist", e soma de conjunto vazio e NULL em SQL - a tela
-- mostraria "R$ -" e a barra de progresso quebraria.
select pg_temp.val('3.7', 'checklist SEM item devolve UMA linha', '1', format($q$
  select count(*)::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_empty from ids)));

select pg_temp.val('3.8', 'checklist SEM item: contagem zero, e nao nulo', '0', format($q$
  select item_count::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_empty from ids)));

select pg_temp.val('3.9', 'checklist SEM item: total estimado zero, e nao nulo', '0.00', format($q$
  select estimated_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_empty from ids)));

select pg_temp.val('3.10', 'checklist SEM item: comissao zero, e nao nulo', '0.00', format($q$
  select commission_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_empty from ids)));

select pg_temp.val('3.11', 'checklist SEM item: progresso zero, e nao nulo nem divisao por zero', '0', format($q$
  select progress_percent::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_empty from ids)));

select pg_temp.val('3.12', 'checklist SEM item: curadoria zero, e nao nulo', '0.00', format($q$
  select curation_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_empty from ids)));

-- Checklist do escritorio B, que nao tem curadoria informada.
select pg_temp.val('3.13', 'sem percentual de curadoria o valor e zero, e nao nulo', '0.00', format($q$
  select curation_total::text from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_del from ids)));

-- A view e SECURITY INVOKER: a RLS das duas tabelas vale para quem consulta.
-- O CONTROLE ao lado e obrigatorio - view sem GRANT devolve ERR:42501, que num
-- teste de negacao parece sucesso (foi o que aconteceu na migration 0036).
select pg_temp.chk_as('3.14', 'colaborador de B nao ve os totais do checklist de A', 'OK:0',
  (select u_b from ids), (select tenant_b from ids), format($q$
  select 1 from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

select pg_temp.chk_as('3.15', 'CONTROLE: colaborador de A VE os totais do checklist de A', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), format($q$
  select 1 from public.budget_checklist_totals where checklist_id = %L
$q$, (select chk_a from ids)));

-- 4. supplier_commission_totals --------------------------------------------------
--
-- Substitui Fornecedor.total_comissao_recebida, campo que o drawer exibe e que
-- nenhuma tela do original preenche.

select pg_temp.val('4.1', 'comissao prevista do fornecedor escolhido no item1', '500.00', format($q$
  select commission_total::text from public.supplier_commission_totals where supplier_id = %L
$q$, (select sup_a1 from ids)));

select pg_temp.val('4.2', 'comissao RECEBIDA do mesmo fornecedor', '500.00', format($q$
  select commission_received_total::text from public.supplier_commission_totals where supplier_id = %L
$q$, (select sup_a1 from ids)));

-- O fornecedor do item2 tem comissao prevista e nao recebida. Sem este caso, uma
-- view que ignorasse o filtro passaria em 4.1 e 4.2.
select pg_temp.val('4.3', 'fornecedor com comissao prevista e nao recebida: zero recebido', '0.00', format($q$
  select commission_received_total::text from public.supplier_commission_totals where supplier_id = %L
$q$, (select sup_a2 from ids)));

select pg_temp.val('4.4', 'fornecedor nunca escolhido: zero, e nao nulo', '0.00', format($q$
  select commission_total::text from public.supplier_commission_totals where supplier_id = %L
$q$, (select sup_a3 from ids)));

select pg_temp.chk_as('4.5', 'colaborador de B nao ve o total do fornecedor de A', 'OK:0',
  (select u_b from ids), (select tenant_b from ids), format($q$
  select 1 from public.supplier_commission_totals where supplier_id = %L
$q$, (select sup_a1 from ids)));

select pg_temp.chk_as('4.6', 'CONTROLE: colaborador de A VE o total do fornecedor de A', 'OK:1',
  (select u_sup from ids), (select tenant_a from ids), format($q$
  select 1 from public.supplier_commission_totals where supplier_id = %L
$q$, (select sup_a1 from ids)));

-- 5. As FKs aninhadas sao COMPOSTAS -------------------------------------------------
--
-- Duas camadas de aninhamento (checklist > item > cotacao) e duas referencias
-- laterais (fornecedor escolhido, fornecedor cotado). Referencia por id sozinho
-- deixaria a linha apontar para fora do escritorio: a RLS filtra o que se le, nao
-- o que se aponta.

select pg_temp.chk('5.1', 'item apontando para checklist de OUTRO escritorio e recusado', 'ERR:23503', format($q$
  insert into public.budget_checklist_items (tenant_id, checklist_id, name)
  values (%L, %L, 'Item invasor')
$q$, (select tenant_a from ids), (select chk_b from ids)));

select pg_temp.chk('5.2', 'CONTROLE: item apontando para checklist do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.budget_checklist_items (tenant_id, checklist_id, name)
  values (%L, %L, 'Item legitimo')
$q$, (select tenant_a from ids), (select chk_empty from ids)));

select pg_temp.chk('5.3', 'cotacao apontando para item de OUTRO escritorio e recusada', 'ERR:23503', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id)
  values (%L, %L, %L)
$q$, (select tenant_a from ids), (select item_b from ids), (select sup_a1 from ids)));

select pg_temp.chk('5.4', 'cotacao apontando para fornecedor de OUTRO escritorio e recusada', 'ERR:23503', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id)
  values (%L, %L, %L)
$q$, (select tenant_a from ids), (select item3 from ids), (select sup_b1 from ids)));

select pg_temp.chk('5.5', 'CONTROLE: cotacao com item e fornecedor do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id)
  values (%L, %L, %L)
$q$, (select tenant_a from ids), (select item3 from ids), (select sup_a1 from ids)));

select pg_temp.chk('5.6', 'fornecedor ESCOLHIDO de outro escritorio e recusado', 'ERR:23503', format($q$
  update public.budget_checklist_items set chosen_supplier_id = %L where id = %L
$q$, (select sup_b1 from ids), (select item3 from ids)));

select pg_temp.chk('5.7', 'CONTROLE: fornecedor escolhido do MESMO escritorio entra', 'OK:1', format($q$
  update public.budget_checklist_items set chosen_supplier_id = %L where id = %L
$q$, (select sup_a3 from ids), (select item3 from ids)));

-- Limpa o que 5.5 e 5.7 criaram, para nao mexer nos totais das secoes acima.
select pg_temp.chk('5.8', 'desfaz o cenario da secao 5', 'OK:1', format($q$
  update public.budget_checklist_items set chosen_supplier_id = null where id = %L
$q$, (select item3 from ids)));

-- 6. O que a exclusao leva junto, e o que ela recusa ------------------------------

select pg_temp.chk('6.1', 'apagar fornecedor que ja cotou um item e RECUSADO', 'ERR:23503', format($q$
  delete from public.suppliers where id = %L
$q$, (select sup_del from ids)));

-- Sem este controle, "recusa" nao distingue "a FK segurou" de "o DELETE nao
-- alcancou linha nenhuma".
select pg_temp.chk('6.2', 'CONTROLE: apagar fornecedor SEM cotacao entra', 'OK:1', format($q$
  delete from public.suppliers where id = %L
$q$, (select sup_a3 from ids)));

select pg_temp.chk('6.3', 'apagar o item que tinha a cotacao', 'OK:1', format($q$
  delete from public.budget_checklist_items where id = %L
$q$, (select item_del from ids)));

select pg_temp.val('6.4', 'a cotacao caiu junto com o item (cascade)', '0', format($q$
  select count(*)::text from public.budget_item_quotes where item_id = %L
$q$, (select item_del from ids)));

-- E agora o mesmo fornecedor de 6.1 pode ser apagado: era a cotacao que segurava,
-- e nao outra coisa.
select pg_temp.chk('6.5', 'CONTROLE: sem cotacao, o fornecedor de 6.1 e apagado', 'OK:1', format($q$
  delete from public.suppliers where id = %L
$q$, (select sup_del from ids)));

select pg_temp.val('6.6', 'as marcas cairam junto com o fornecedor (cascade)', '0', format($q$
  select count(*)::text from public.supplier_brands where supplier_id = %L
$q$, (select sup_del from ids)));

select pg_temp.chk('6.7', 'apagar o checklist', 'OK:1', format($q$
  delete from public.budget_checklists where id = %L
$q$, (select chk_del from ids)));

select pg_temp.val('6.8', 'os itens cairam junto com o checklist (cascade)', '0', format($q$
  select count(*)::text from public.budget_checklist_items where checklist_id = %L
$q$, (select chk_del from ids)));

-- 7. Os recortes de dominio e as unicidades -----------------------------------------

-- supplier_category e um enum so para fornecedor e item, com quatro valores que
-- so valem para item (ver 0048).
select pg_temp.chk('7.1', 'fornecedor com categoria que so existe em item e recusado', 'ERR:23514', format($q$
  insert into public.suppliers (tenant_id, name, category, contact_whatsapp)
  values (%L, 'Impermeabilizadora', 'waterproofing', '(62) 3222-9002')
$q$, (select tenant_a from ids)));

select pg_temp.chk('7.2', 'CONTROLE: ITEM com a mesma categoria entra', 'OK:1', format($q$
  insert into public.budget_checklist_items (tenant_id, checklist_id, name, category)
  values (%L, %L, 'Impermeabilizacao do terraco', 'waterproofing')
$q$, (select tenant_a from ids), (select chk_empty from ids)));

select pg_temp.chk('7.3', 'fase de projeto fora das quatro do orcamento e recusada', 'ERR:23514', format($q$
  insert into public.budget_checklists (tenant_id, client_id, project_phase)
  values (%L, %L, 'briefing')
$q$, (select tenant_a from ids), (select cli_a from ids)));

select pg_temp.chk('7.4', 'CONTROLE: pos-aprovacao entra', 'OK:1', format($q$
  insert into public.budget_checklists (tenant_id, client_id, project_phase)
  values (%L, %L, 'post_approval')
$q$, (select tenant_a from ids), (select cli_a from ids)));

-- O vazamento que extender um enum compartilhado abre: sem o check da 0049,
-- projeto e tarefa passariam a aceitar uma fase que so existe para orcamento.
select pg_temp.chk('7.5', 'projeto com fase de orcamento (post_approval) e recusado', 'ERR:23514', format($q$
  insert into public.projects (tenant_id, name, project_type, current_phase)
  values (%L, 'Residencia Rocha', 'architecture', 'post_approval')
$q$, (select tenant_a from ids)));

select pg_temp.chk('7.6', 'CONTROLE: projeto com fase propria entra', 'OK:1', format($q$
  insert into public.projects (tenant_id, name, project_type, current_phase)
  values (%L, 'Residencia Rocha', 'architecture', 'briefing')
$q$, (select tenant_a from ids)));

select pg_temp.chk('7.7', 'percentual de comissao acima de 100 e recusado', 'ERR:23514', format($q$
  update public.budget_checklist_items set commission_percent = 120 where id = %L
$q$, (select item2 from ids)));

select pg_temp.chk('7.8', 'valor cotado negativo e recusado', 'ERR:23514', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value)
  values (%L, %L, %L, -1)
$q$, (select tenant_a from ids), (select item3 from ids), (select sup_a2 from ids)));

-- >= 0, e nao > 0 como no dinheiro do modulo 7: cotacao de cortesia com valor
-- zero e informacao legitima, e nao uma cobranca vazia.
select pg_temp.chk('7.9', 'CONTROLE: cotacao com valor zero entra', 'OK:1', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value)
  values (%L, %L, %L, 0)
$q$, (select tenant_a from ids), (select item3 from ids), (select sup_a2 from ids)));

select pg_temp.chk('7.10', 'data de aprovacao em item que o cliente nao aprovou e recusada', 'ERR:23514', format($q$
  update public.budget_checklist_items set approval_date = current_date where id = %L
$q$, (select item2 from ids)));

-- Um sentido so, de proposito: o original marca aprovado_cliente e nunca
-- preenche data_aprovacao.
select pg_temp.chk('7.11', 'CONTROLE: aprovado pelo cliente SEM data entra', 'OK:1', format($q$
  update public.budget_checklist_items set client_approved = true where id = %L
$q$, (select item2 from ids)));

select pg_temp.chk('7.12', 'arquivo com caminho e sem nome e recusado', 'ERR:23514', format($q$
  update public.budget_item_quotes set quote_file_path = 'x/y/z.pdf'
   where item_id = %L and supplier_id = %L
$q$, (select item1 from ids), (select sup_a1 from ids)));

select pg_temp.chk('7.13', 'CONTROLE: caminho e nome juntos entram', 'OK:1', format($q$
  update public.budget_item_quotes
     set quote_file_path = 'b1111111-1111-4111-8111-111111111111/x/z.pdf',
         quote_file_name = 'orcamento-ceramica.pdf'
   where item_id = %L and supplier_id = %L
$q$, (select item1 from ids), (select sup_a1 from ids)));

select pg_temp.chk('7.14', 'a mesma marca duas vezes no mesmo fornecedor e recusada', 'ERR:23505', format($q$
  insert into public.supplier_brands (tenant_id, supplier_id, name)
  values (%L, %L, 'Portobello')
$q$, (select tenant_a from ids), (select sup_a1 from ids)));

select pg_temp.chk('7.15', 'CONTROLE: a mesma marca em OUTRO fornecedor entra', 'OK:1', format($q$
  insert into public.supplier_brands (tenant_id, supplier_id, name)
  values (%L, %L, 'Portobello')
$q$, (select tenant_a from ids), (select sup_a2 from ids)));

select pg_temp.chk('7.16', 'o mesmo fornecedor cotando o mesmo item duas vezes e recusado', 'ERR:23505', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value)
  values (%L, %L, %L, 12000)
$q$, (select tenant_a from ids), (select item1 from ids), (select sup_a1 from ids)));

select pg_temp.chk('7.17', 'CONTROLE: o mesmo fornecedor cotando OUTRO item entra', 'OK:1', format($q$
  insert into public.budget_item_quotes (tenant_id, item_id, supplier_id, value)
  values (%L, %L, %L, 12000)
$q$, (select tenant_a from ids), (select item2 from ids), (select sup_a1 from ids)));

-- 8. O bucket de arquivos -----------------------------------------------------------
--
-- Superficie nova, e sem suite de padrao que a cubra. Duas metades: o que esta
-- configurado NO BUCKET (privacidade, tamanho, tipo) e o que as policies fazem.

select pg_temp.val('8.1', 'o bucket e PRIVADO', 'false', $q$
  select public::text from storage.buckets where id = 'budget-files'
$q$);

-- Validacao de cliente nao e validacao: PdfUploadButton.jsx confere tipo e
-- tamanho ANTES de enviar, e qualquer requisicao montada a mao ignora os dois.
select pg_temp.val('8.2', 'o limite de 20 MB esta no bucket', '20971520', $q$
  select file_size_limit::text from storage.buckets where id = 'budget-files'
$q$);

select pg_temp.val('8.3', 'so PDF e aceito, e isso esta no bucket', 'application/pdf', $q$
  select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'budget-files'
$q$);

select pg_temp.val('8.4', 'storage.objects tem RLS ligada', 'true', $q$
  select relrowsecurity::text from pg_class where oid = 'storage.objects'::regclass
$q$);

-- anon TEM privilegio de tabela em storage.objects (o Supabase concede tudo por
-- padrao, e nao ha migration que revogue sem quebrar o servico de Storage). Logo,
-- aqui a policy e a UNICA tranca - e nenhuma das quatro e "to anon".
select pg_temp.chk_anon('8.5', 'anon nao le objeto nenhum do bucket', 'OK:0', $q$
  select 1 from storage.objects where bucket_id = 'budget-files'
$q$);

select pg_temp.chk_anon('8.6', 'anon nao grava no bucket', 'ERR:42501', $q$
  insert into storage.objects (bucket_id, name)
  values ('budget-files', 'b1111111-1111-4111-8111-111111111111/x/anon.pdf')
$q$);

select pg_temp.chk_as('8.7', 'CONTROLE: colaborador de A LE o arquivo da pasta de A', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'budget-files'
     and name like 'b1111111-1111-4111-8111-111111111111/%'
$q$);

select pg_temp.chk_as('8.8', 'colaborador de A nao le o arquivo da pasta de B', 'OK:0',
  (select u_bud from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'budget-files'
     and name like 'b2222222-2222-4222-8222-222222222222/%'
$q$);

select pg_temp.chk_as('8.9', 'colaborador de B nao le o arquivo da pasta de A', 'OK:0',
  (select u_b from ids), (select tenant_b from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'budget-files'
     and name like 'b1111111-1111-4111-8111-111111111111/%'
$q$);

select pg_temp.chk_as('8.10', 'CONTROLE: colaborador de B LE o arquivo da pasta de B', 'OK:1',
  (select u_b from ids), (select tenant_b from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'budget-files'
     and name like 'b2222222-2222-4222-8222-222222222222/%'
$q$);

-- A regra transversal do sistema alcanca o arquivo tambem, e ela e a UNICA razao
-- possivel aqui: a afastada tem can_edit nos DOIS menus.
select pg_temp.chk_as('8.11', 'colaboradora AFASTADA (com os dois menus) nao le o arquivo', 'OK:0',
  (select u_leave from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'budget-files'
     and name like 'b1111111-1111-4111-8111-111111111111/%'
$q$);

-- Leitura larga tambem no arquivo: quem so tem suppliers ainda le o PDF do
-- orcamento. Sem este controle, uma policy de SELECT presa a can_edit_menu
-- passaria em tudo acima.
select pg_temp.chk_as('8.12', 'CONTROLE: quem tem SO suppliers LE o arquivo', 'OK:1',
  (select u_sup from ids), (select tenant_a from ids), $q$
  select 1 from storage.objects
   where bucket_id = 'budget-files'
     and name like 'b1111111-1111-4111-8111-111111111111/%'
$q$);

select pg_temp.chk_as('8.13', 'CONTROLE: editor de orcamento grava na pasta do PROPRIO escritorio', 'OK:1',
  (select u_bud from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('budget-files', 'b1111111-1111-4111-8111-111111111111/pasta/novo.pdf')
$q$);

-- O equivalente, no Storage, do WITH CHECK sobre tenant_id nas tabelas.
select pg_temp.chk_as('8.14', 'editor de orcamento nao grava na pasta de OUTRO escritorio', 'ERR:42501',
  (select u_bud from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('budget-files', 'b2222222-2222-4222-8222-222222222222/pasta/invasor.pdf')
$q$);

select pg_temp.chk_as('8.15', 'quem tem SO suppliers nao grava arquivo de orcamento', 'ERR:42501',
  (select u_sup from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('budget-files', 'b1111111-1111-4111-8111-111111111111/pasta/sem-permissao.pdf')
$q$);

select pg_temp.chk_as('8.16', 'colaboradora AFASTADA (com os dois menus) nao grava arquivo', 'ERR:42501',
  (select u_leave from ids), (select tenant_a from ids), $q$
  insert into storage.objects (bucket_id, name)
  values ('budget-files', 'b1111111-1111-4111-8111-111111111111/pasta/afastada.pdf')
$q$);

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
