-- Teste do modulo 7 (Financeiro) - as regras de dinheiro de accounts_receivable,
-- accounts_payable e financial_categories.
--
-- ESCOPO, E O QUE FICA DE FORA DE PROPOSITO
--   Os invariantes do padrao (RLS ligada, anon sem privilegio, quatro policies,
--   WITH CHECK, tenant_id not null, unique (id, tenant_id), indice por
--   tenant_id, isolamento entre escritorios, colaborador afastado sem leitura,
--   escrita presa ao menu) estao em supabase/tests/pattern-invariants.sql e
--   cobrem as tres tabelas desde que elas entraram em pattern_tables. NADA disso
--   se repete aqui.
--
--   A geracao de parcelas do contrato tem arquivo proprio,
--   supabase/tests/installments.sql (npm run test:installments), porque ela e o
--   ponto do modulo que mexe em soma de dinheiro e foi validada por injecao de
--   defeito.
--
--   Aqui fica o resto do que o padrao nao tem como conhecer, listado em
--   docs/SCHEMA-PLAN.md, secao "Modulo 7 - Regra de negocio para o teste
--   proprio".
--
-- POR QUE A SECAO 1 EXISTE
--   Este e o primeiro modulo com DUAS chaves de menu governando tabelas
--   diferentes do mesmo assunto (receivables e payables). A suite de padrao nao
--   consegue distinguir uma da outra: o editor dela recebe can_edit em TODO menu
--   do registro, entao uma policy de accounts_receivable que lesse 'payables'
--   por engano passaria nos 26 casos. Os casos 1.x usam duas pessoas, cada uma
--   com exatamente um dos dois menus, e afirmam os quatro cruzamentos.
--
-- COMO RODAR
--   npm run test:schema:financial
--
-- COMO LER
--   observed = 'OK:<n>'   a operacao passou e afetou/devolveu n linhas.
--   observed = 'ERR:<sqlstate>'  a operacao foi recusada. Os que importam:
--                         23514 check violado, 23503 FK violada,
--                         23505 unicidade violada, 42501 policy/privilegio.
--   Nas secoes 2 e 6 o observado e o VALOR devolvido, e nao contagem de linhas:
--   uma coluna calculada que responda errado devolve uma linha do mesmo jeito.
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. As fixtures vivem em tenants
--   proprios (slug financial-schema-test-*), e nenhuma contagem e absoluta sobre
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

-- Sonda de VALOR, para as colunas calculadas: pg_temp.try devolve contagem de
-- linhas, e uma coluna que responda errado devolve UMA linha do mesmo jeito.
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
-- exercitar a policy: postgres e dono da tabela e passa por cima da RLS.
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
  'a1111111-1111-4111-8111-111111111111'::uuid as tenant_a,
  'a2222222-2222-4222-8222-222222222222'::uuid as tenant_b,
  -- Duas pessoas com UM menu cada. E o par que a suite de padrao nao consegue
  -- montar, e sem ele "escrita presa ao menu" nao distingue os dois menus deste
  -- modulo.
  'a1000000-0000-4000-8000-000000000001'::uuid as u_recv,
  'a1000000-0000-4000-8000-000000000002'::uuid as u_pay,
  'a1100000-0000-4000-8000-000000000001'::uuid as c_recv,
  'a1100000-0000-4000-8000-000000000002'::uuid as c_pay,
  'a1200000-0000-4000-8000-000000000001'::uuid as r_overdue,
  'a1200000-0000-4000-8000-000000000002'::uuid as r_paid_late,
  'a1200000-0000-4000-8000-000000000003'::uuid as r_today,
  'a1200000-0000-4000-8000-000000000004'::uuid as r_future,
  'a1200000-0000-4000-8000-000000000005'::uuid as r_renegotiated,
  'a1300000-0000-4000-8000-000000000001'::uuid as p_parent,
  'a1300000-0000-4000-8000-000000000002'::uuid as p_child1,
  'a1300000-0000-4000-8000-000000000003'::uuid as p_child2,
  'a2300000-0000-4000-8000-000000000001'::uuid as p_parent_b;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select u_recv from ids) u, 'financial-recv@example.test' e
  union all select (select u_pay from ids), 'financial-pay@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Financial Schema Test A', 'financial-schema-test-a'),
  ((select tenant_b from ids), 'Financial Schema Test B', 'financial-schema-test-b');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select u_recv from ids), 'member'),
  ((select tenant_a from ids), (select u_pay from ids), 'member');

-- Nenhum dos dois e Diretor, de proposito: can_edit_menu tem atalho de Diretor
-- (0019) e Diretor passaria nos quatro cruzamentos da secao 1 sem provar nada.
insert into public.collaborators (id, tenant_id, user_id, name, role, email, status) values
  ((select c_recv from ids), (select tenant_a from ids), (select u_recv from ids),
   'Helena Marques', 'finance', 'financial-recv@example.test', 'active'),
  ((select c_pay from ids), (select tenant_a from ids), (select u_pay from ids),
   'Otavio Nunes', 'admin_staff', 'financial-pay@example.test', 'active');

-- UM menu para cada, e a linha do outro menu existe com can_edit FALSO. A linha
-- precisa existir: sem ela, "nao escreve" nao distingue "permissao negada" de
-- "permissao ausente", e uma policy que lesse a chave errada seria negada pelos
-- dois motivos ao mesmo tempo.
insert into public.collaborator_permissions (tenant_id, collaborator_id, menu_key, can_view, can_edit) values
  ((select tenant_a from ids), (select c_recv from ids), 'receivables', true, true),
  ((select tenant_a from ids), (select c_recv from ids), 'payables', true, false),
  ((select tenant_a from ids), (select c_pay from ids), 'payables', true, true),
  ((select tenant_a from ids), (select c_pay from ids), 'receivables', true, false);

-- 1. Cada policy le a SUA chave de menu -----------------------------------------

select pg_temp.chk_as('1.1', 'CONTROLE: quem tem receivables CRIA recebivel', 'OK:1',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date)
  values (%L, 'Entrada do contrato', 5000, '2026-09-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk_as('1.2', 'quem tem SO payables NAO cria recebivel', 'ERR:42501',
  (select u_pay from ids), (select tenant_a from ids), format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date)
  values (%L, 'Entrada do contrato', 5000, '2026-09-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk_as('1.3', 'CONTROLE: quem tem payables CRIA despesa', 'OK:1',
  (select u_pay from ids), (select tenant_a from ids), format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date)
  values (%L, 'Imobiliaria Centro', 'Aluguel da sede', 'office', 8200, '2026-09-05')
$q$, (select tenant_a from ids)));

select pg_temp.chk_as('1.4', 'quem tem SO receivables NAO cria despesa', 'ERR:42501',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date)
  values (%L, 'Imobiliaria Centro', 'Aluguel da sede', 'office', 8200, '2026-09-05')
$q$, (select tenant_a from ids)));

-- financial_categories se pendura em payables. Sem estes dois, a chave dela
-- poderia ser qualquer uma das duas do modulo e nada acusaria.
select pg_temp.chk_as('1.5', 'CONTROLE: quem tem payables CRIA categoria financeira', 'OK:1',
  (select u_pay from ids), (select tenant_a from ids), format($q$
  insert into public.financial_categories (tenant_id, name, type, cost_center)
  values (%L, 'Softwares de projeto', 'expense', 'architecture')
$q$, (select tenant_a from ids)));

select pg_temp.chk_as('1.6', 'quem tem SO receivables NAO cria categoria financeira', 'ERR:42501',
  (select u_recv from ids), (select tenant_a from ids), format($q$
  insert into public.financial_categories (tenant_id, name, type)
  values (%L, 'Consultoria', 'expense')
$q$, (select tenant_a from ids)));

-- CONTROLE de leitura: a leitura deste modulo e LARGA, e o menu nao a recorta.
-- Sem este caso, uma policy de SELECT que exigisse can_edit passaria em tudo
-- acima e so apareceria na tela de quem so consulta.
select pg_temp.chk_as('1.7', 'CONTROLE: quem tem SO payables LE recebivel', 'OK:1',
  (select u_pay from ids), (select tenant_a from ids), $q$
  select 1 from public.accounts_receivable where description = 'Entrada do contrato'
$q$);

-- 2. "Em atraso" e calculado, e so para previsto e vencido ----------------------
--
-- Ver o cabecalho da migration 0043: nao e coluna gravada (exigiria job diario) e
-- nao e coluna gerada (current_date nao e imutavel).

insert into public.accounts_receivable
  (id, tenant_id, description, value, due_date, status, payment_date) values
  ((select r_overdue from ids), (select tenant_a from ids), 'Parcela vencida em aberto',
   1000, current_date - 1, 'forecast', null),
  ((select r_paid_late from ids), (select tenant_a from ids), 'Parcela vencida e paga',
   1000, current_date - 1, 'paid', current_date - 1),
  ((select r_today from ids), (select tenant_a from ids), 'Parcela que vence hoje',
   1000, current_date, 'forecast', null),
  ((select r_future from ids), (select tenant_a from ids), 'Parcela futura',
   1000, current_date + 30, 'forecast', null),
  ((select r_renegotiated from ids), (select tenant_a from ids), 'Parcela renegociada e vencida',
   1000, current_date - 1, 'renegotiated', null);

-- A outra ponta, para o caso 2.6: a regra de atraso e uma so, e as duas views a
-- chamam. Sem esta linha, "vale para contas a pagar" nao teria o que observar.
insert into public.accounts_payable
  (tenant_id, supplier_name, description, category, value, due_date, status) values
  ((select tenant_a from ids), 'Prefeitura', 'Despesa vencida', 'taxes',
   1500, current_date - 1, 'forecast');

select pg_temp.val('2.1', 'previsto e vencido esta em atraso', 'true', format($q$
  select is_overdue::text from public.accounts_receivable_status where id = %L
$q$, (select r_overdue from ids)));

-- O caso que separa "atrasou" de "atrasou e continua em aberto". Uma regra
-- escrita so como due_date < hoje passaria em 2.1 e cairia aqui.
select pg_temp.val('2.2', 'pago com vencimento no passado NAO esta em atraso', 'false', format($q$
  select is_overdue::text from public.accounts_receivable_status where id = %L
$q$, (select r_paid_late from ids)));

-- O original compara new Date('YYYY-MM-DD') com new Date(), ou seja, meia-noite
-- UTC: em Brasilia a conta de hoje vira atraso as 21h de ONTEM. Aqui a
-- comparacao e entre datas.
select pg_temp.val('2.3', 'vencimento HOJE ainda nao esta em atraso', 'false', format($q$
  select is_overdue::text from public.accounts_receivable_status where id = %L
$q$, (select r_today from ids)));

select pg_temp.val('2.4', 'CONTROLE: vencimento futuro nao esta em atraso', 'false', format($q$
  select is_overdue::text from public.accounts_receivable_status where id = %L
$q$, (select r_future from ids)));

-- DIVERGENCIA REGISTRADA: no original renegotiated vencido APARECE em atraso
-- (status !== 'Pago'). O plano aprovado diz forecast. Este caso e o que vai
-- acusar se alguem mudar de ideia sem passar por migration.
select pg_temp.val('2.5', 'renegociado e vencido NAO esta em atraso (segue o plano, nao o original)', 'false', format($q$
  select is_overdue::text from public.accounts_receivable_status where id = %L
$q$, (select r_renegotiated from ids)));

-- A mesma regra vale para a outra ponta, e pela mesma funcao.
select pg_temp.val('2.6', 'a regra e a mesma em contas a pagar', 'true', format($q$
  select is_overdue::text from public.accounts_payable_status
   where tenant_id = %L and description = 'Despesa vencida'
$q$, (select tenant_a from ids)));

-- 3. Pagamento amarrado ao status, nos dois sentidos ----------------------------

select pg_temp.chk('3.1', 'recebivel pago SEM data de pagamento e recusado', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date, status)
  values (%L, 'Parcela 1', 1000, '2026-09-10', 'paid')
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.2', 'data de pagamento em recebivel PREVISTO e recusada', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date, status, payment_date)
  values (%L, 'Parcela 1', 1000, '2026-09-10', 'forecast', '2026-09-09')
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.3', 'CONTROLE: pago COM data entra', 'OK:1', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date, status, payment_date)
  values (%L, 'Parcela 1', 1000, '2026-09-10', 'paid', '2026-09-09')
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.4', 'despesa paga SEM data de pagamento e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date, status)
  values (%L, 'Copel', 'Energia', 'office', 900, '2026-09-10', 'paid')
$q$, (select tenant_a from ids)));

select pg_temp.chk('3.5', 'CONTROLE: despesa paga COM data entra', 'OK:1', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       status, payment_date)
  values (%L, 'Copel', 'Energia', 'office', 900, '2026-09-10', 'paid', '2026-09-08')
$q$, (select tenant_a from ids)));

-- 4. Valor positivo nas duas tabelas ---------------------------------------------
--
-- > 0, e nao >= 0: parcela de zero real nao e cobranca e entra na soma da
-- carteira como se fosse.

select pg_temp.chk('4.1', 'recebivel com valor zero e recusado', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date)
  values (%L, 'Parcela vazia', 0, '2026-09-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.2', 'recebivel com valor negativo e recusado', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date)
  values (%L, 'Estorno', -100, '2026-09-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.3', 'despesa com valor zero e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date)
  values (%L, 'Fornecedor', 'Despesa vazia', 'other', 0, '2026-09-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk('4.4', 'CONTROLE: um centavo entra', 'OK:1', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date)
  values (%L, 'Ajuste de centavo', 0.01, '2026-09-10')
$q$, (select tenant_a from ids)));

-- 5. Recorrencia -----------------------------------------------------------------

insert into public.accounts_payable
  (id, tenant_id, supplier_name, description, category, value, due_date,
   is_recurring, recurrence_frequency, recurrence_start_date, recurrence_status) values
  ((select p_parent from ids), (select tenant_a from ids), 'Imobiliaria Centro',
   'Aluguel mensal', 'office', 8200, '2026-09-05',
   true, 'monthly', '2026-09-05', 'active');

insert into public.accounts_payable
  (id, tenant_id, supplier_name, description, category, value, due_date, recurrence_parent_id) values
  ((select p_child1 from ids), (select tenant_a from ids), 'Imobiliaria Centro',
   'Aluguel mensal', 'office', 8200, '2026-10-05', (select p_parent from ids)),
  ((select p_child2 from ids), (select tenant_a from ids), 'Imobiliaria Centro',
   'Aluguel mensal', 'office', 8200, '2026-11-05', (select p_parent from ids));

-- Mae no OUTRO escritorio. FK composta: sem tenant_id na referencia, esta linha
-- entraria e o "editar todos os futuros" atravessaria a fronteira sem violar
-- policy nenhuma (a RLS filtra o que se le, nao o que se aponta).
insert into public.accounts_payable
  (id, tenant_id, supplier_name, description, category, value, due_date,
   is_recurring, recurrence_frequency, recurrence_start_date) values
  ((select p_parent_b from ids), (select tenant_b from ids), 'Outra Imobiliaria',
   'Aluguel do outro escritorio', 'office', 5000, '2026-09-05',
   true, 'monthly', '2026-09-05');

select pg_temp.chk('5.1', 'ocorrencia apontando para mae de OUTRO escritorio e recusada', 'ERR:23503', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       recurrence_parent_id)
  values (%L, 'Outra Imobiliaria', 'Aluguel', 'office', 5000, '2026-10-05', %L)
$q$, (select tenant_a from ids), (select p_parent_b from ids)));

select pg_temp.chk('5.2', 'CONTROLE: ocorrencia apontando para mae do MESMO escritorio entra', 'OK:1', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       recurrence_parent_id)
  values (%L, 'Imobiliaria Centro', 'Aluguel mensal', 'office', 8200, '2026-12-05', %L)
$q$, (select tenant_a from ids), (select p_parent from ids)));

select pg_temp.chk('5.3', 'mae apontando para si mesma e recusada', 'ERR:23514', format($q$
  update public.accounts_payable set recurrence_parent_id = id where id = %L
$q$, (select p_parent from ids)));

select pg_temp.chk('5.4', 'fim da recorrencia antes do inicio e recusado', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       is_recurring, recurrence_frequency,
                                       recurrence_start_date, recurrence_end_date)
  values (%L, 'Adobe', 'Assinatura', 'software', 400, '2026-09-10',
          true, 'monthly', '2026-09-10', '2026-08-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk('5.5', 'CONTROLE: inicio e fim no mesmo dia entram', 'OK:1', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       is_recurring, recurrence_frequency,
                                       recurrence_start_date, recurrence_end_date)
  values (%L, 'Adobe', 'Assinatura', 'software', 400, '2026-09-10',
          true, 'monthly', '2026-09-10', '2026-09-10')
$q$, (select tenant_a from ids)));

-- O original cai em fallback silencioso quando falta start_date (usa due_date) e
-- quando a frequencia nao bate com o mapa (assume mensal). Dois palpites que
-- geram lancamento em data que ninguem pediu.
select pg_temp.chk('5.6', 'recorrencia SEM frequencia e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       is_recurring, recurrence_start_date)
  values (%L, 'Adobe', 'Assinatura', 'software', 400, '2026-09-10', true, '2026-09-10')
$q$, (select tenant_a from ids)));

select pg_temp.chk('5.7', 'recorrencia SEM data de inicio e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       is_recurring, recurrence_frequency)
  values (%L, 'Adobe', 'Assinatura', 'software', 400, '2026-09-10', true, 'monthly')
$q$, (select tenant_a from ids)));

-- A tela resolve o grupo com `recurrence_parent_id || id`: um nivel so.
select pg_temp.chk('5.8', 'ocorrencia que tambem e mae (cadeia) e recusada', 'ERR:23514', format($q$
  update public.accounts_payable
     set is_recurring = true, recurrence_frequency = 'monthly', recurrence_start_date = '2026-10-05'
   where id = %L
$q$, (select p_child1 from ids)));

select pg_temp.chk('5.9', 'quantidade de repeticoes zero e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       is_recurring, recurrence_frequency, recurrence_start_date,
                                       recurrence_count)
  values (%L, 'Adobe', 'Assinatura', 'software', 400, '2026-09-10',
          true, 'monthly', '2026-09-10', 0)
$q$, (select tenant_a from ids)));

-- 6. generated_count e DERIVADO ---------------------------------------------------
--
-- No original e coluna que a aplicacao incrementa depois do bulkCreate
-- (AccountsPayable.jsx:212) e que ninguem decrementa quando uma ocorrencia e
-- apagada. Aqui e contagem de filhos, na view.

select pg_temp.val('6.1', 'a mae conta as tres ocorrencias que existem', '3', format($q$
  select generated_count::text from public.accounts_payable_status where id = %L
$q$, (select p_parent from ids)));

-- O caso que o contador gravado do original erra. Sem ele, uma coluna gravada
-- passaria em 6.1 e mentiria a partir da primeira exclusao.
select pg_temp.chk('6.2', 'apagar uma ocorrencia', 'OK:1', format($q$
  delete from public.accounts_payable where id = %L
$q$, (select p_child2 from ids)));

select pg_temp.val('6.3', 'a contagem cai sozinha depois da exclusao', '2', format($q$
  select generated_count::text from public.accounts_payable_status where id = %L
$q$, (select p_parent from ids)));

select pg_temp.val('6.4', 'ocorrencia nao gera ninguem: zero, e nao nulo', '0', format($q$
  select generated_count::text from public.accounts_payable_status where id = %L
$q$, (select p_child1 from ids)));

-- 7. Competencia e um MES ---------------------------------------------------------

select pg_temp.chk('7.1', 'competencia no meio do mes e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       competence_month)
  values (%L, 'Contabilidade', 'Honorarios', 'contractors', 1200, '2026-09-10', '2026-09-15')
$q$, (select tenant_a from ids)));

select pg_temp.chk('7.2', 'CONTROLE: competencia no primeiro dia do mes entra', 'OK:1', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       competence_month)
  values (%L, 'Contabilidade', 'Honorarios', 'contractors', 1200, '2026-09-10', '2026-09-01')
$q$, (select tenant_a from ids)));

-- 8. Forma de pagamento: um enum, dois dominios -------------------------------------

select pg_temp.chk('8.1', 'debito automatico em recebivel e recusado', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date,
                                          status, payment_date, payment_method)
  values (%L, 'Parcela 2', 1000, '2026-09-10', 'paid', '2026-09-10', 'direct_debit')
$q$, (select tenant_a from ids)));

select pg_temp.chk('8.2', 'CONTROLE: especie em recebivel entra', 'OK:1', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date,
                                          status, payment_date, payment_method)
  values (%L, 'Parcela 2', 1000, '2026-09-10', 'paid', '2026-09-10', 'cash')
$q$, (select tenant_a from ids)));

select pg_temp.chk('8.3', 'especie em despesa e recusada', 'ERR:23514', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       status, payment_date, payment_method)
  values (%L, 'Cartorio', 'Reconhecimento de firma', 'other', 80, '2026-09-10',
          'paid', '2026-09-10', 'cash')
$q$, (select tenant_a from ids)));

select pg_temp.chk('8.4', 'CONTROLE: debito automatico em despesa entra', 'OK:1', format($q$
  insert into public.accounts_payable (tenant_id, supplier_name, description, category, value, due_date,
                                       status, payment_date, payment_method)
  values (%L, 'Copel', 'Energia', 'office', 900, '2026-09-10',
          'paid', '2026-09-10', 'direct_debit')
$q$, (select tenant_a from ids)));

-- 9. Numero da parcela: par e faixa --------------------------------------------------
--
-- No original installment_number e o texto "1/12", que nao ordena nem soma. Aqui
-- sao dois numeros, e eles precisam descrever uma parcela possivel.

select pg_temp.chk('9.1', 'numero de parcela SEM total e recusado', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date, installment_number)
  values (%L, 'Parcela solta', 1000, '2026-09-10', 3)
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.2', 'total de parcelas SEM numero e recusado', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date, installment_total)
  values (%L, 'Parcela solta', 1000, '2026-09-10', 12)
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.3', 'parcela 13 de 12 e recusada', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date,
                                          installment_number, installment_total)
  values (%L, 'Parcela impossivel', 1000, '2026-09-10', 13, 12)
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.4', 'parcela zero e recusada', 'ERR:23514', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date,
                                          installment_number, installment_total)
  values (%L, 'Parcela impossivel', 1000, '2026-09-10', 0, 12)
$q$, (select tenant_a from ids)));

select pg_temp.chk('9.5', 'CONTROLE: parcela 12 de 12 entra', 'OK:1', format($q$
  insert into public.accounts_receivable (tenant_id, description, value, due_date,
                                          installment_number, installment_total)
  values (%L, 'Ultima parcela', 1000, '2026-09-10', 12, 12)
$q$, (select tenant_a from ids)));

-- 10. Categoria financeira: nome unico por tipo -----------------------------------------

select pg_temp.chk('10.1', 'CONTROLE: categoria de despesa entra', 'OK:1', format($q$
  insert into public.financial_categories (tenant_id, name, type, cost_center)
  values (%L, 'Comissao', 'expense', 'architecture')
$q$, (select tenant_a from ids)));

select pg_temp.chk('10.2', 'mesmo nome no mesmo tipo e recusado', 'ERR:23505', format($q$
  insert into public.financial_categories (tenant_id, name, type)
  values (%L, 'Comissao', 'expense')
$q$, (select tenant_a from ids)));

-- "Comissao" existe dos dois lados: e receita para quem indica e despesa para
-- quem paga. Sem este controle, uma chave (tenant_id, name) passaria em 10.2.
select pg_temp.chk('10.3', 'CONTROLE: mesmo nome no OUTRO tipo entra', 'OK:1', format($q$
  insert into public.financial_categories (tenant_id, name, type)
  values (%L, 'Comissao', 'revenue')
$q$, (select tenant_a from ids)));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
