-- A fila de leads da landing page: quem escreve, quem le, e quem nao.
--
-- O QUE ELE PROVA
--   O modulo inverte duas premissas que todas as outras suites tomam como
--   dadas, e por isso nada aqui esta coberto por pattern-invariants.sql:
--
--   1. a tabela NAO tem tenant_id, e quem le nao e colaborador de escritorio
--      nenhum. A pergunta "um Diretor consegue ler isto?" passa a ter resposta
--      NAO — e e a resposta mais importante do arquivo, porque a fila guarda
--      e-mail e telefone de gente que nao e cliente de ninguem;
--   2. a escrita vem de fora, sem sessao. O que impede a tabela de virar porta
--      anonima e nao haver EXECUTE para anon em capture_product_lead.
--
--   Mais tres que, se estiverem erradas, ninguem descobre pela tela:
--     - e-mail repetido nao cria linha nem apaga o que a pessoa ja tinha dado;
--     - a funcao devolve true tambem para e-mail JA cadastrado (devolver a
--       diferenca transformaria a pagina publica em verificador de e-mail);
--     - nem um admin da plataforma reescreve o e-mail digitado — o privilegio
--       de UPDATE e de coluna, nao de tabela.
--
--   Cada negativa tem controle positivo ao lado: negativa que passa porque a
--   linha nem existia pareceria acerto.
--
-- COMO RODAR
--   npm run test:leads
--
-- RESIDUO
--   Nenhum: uma transacao terminada em ROLLBACK. Nenhuma contagem absoluta
--   sobre product_leads — tudo e recortado pelo dominio @leads.test, para a
--   suite nao passar hoje e falhar no dia em que a fila tiver lead de verdade.

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

/* Sessao SEM claim de tenant: e a do admin da plataforma, que nao e
   colaborador de escritorio nenhum. Existe para provar que a fila nao depende
   de tenant_id — se dependesse, este ator nao leria nada e o caso de controle
   denunciaria. */
create or replace function pg_temp.claims_sem_tenant(p_sub uuid)
returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_sub::text, 'role', 'authenticated',
                            'app_metadata', '{}'::jsonb)
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

create or replace function pg_temp.como(p_sub uuid, p_tenant uuid, p_sql text)
returns text language plpgsql as $$
declare v text; st text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      case when p_tenant is null then pg_temp.claims_sem_tenant(p_sub)::text
           else pg_temp.claims(p_sub, p_tenant)::text end, true);
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
    perform set_config('request.jwt.claims',
      case when p_tenant is null then pg_temp.claims_sem_tenant(p_sub)::text
           else pg_temp.claims(p_sub, p_tenant)::text end, true);
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

/* A porta publica de verdade e `anon`: e o papel da chave publicavel que vai
   no navegador. */
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

-- Fixtures ---------------------------------------------------------------------

create temp table ids on commit drop as select
  'fdfdfdfd-0000-4000-8000-00000000000a'::uuid as tenant_a,
  'fdfdfdfd-0000-4000-8000-00000000001a'::uuid as user_dir_a,
  'fdfdfdfd-0000-4000-8000-00000000002a'::uuid as user_arq_a,
  'fdfdfdfd-0000-4000-8000-0000000000f1'::uuid as user_plat,
  'fdfdfdfd-0000-4000-8000-00000000003a'::uuid as col_dir_a,
  'fdfdfdfd-0000-4000-8000-00000000004a'::uuid as col_arq_a;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select u, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', e, now(), now()
from (
  select (select user_dir_a from ids) u, 'leads-dir-a@example.test' e
  union all select (select user_arq_a from ids), 'leads-arq-a@example.test'
  union all select (select user_plat from ids), 'leads-plataforma@example.test'
) s;

insert into public.tenants (id, name, slug) values
  ((select tenant_a from ids), 'Leads A', 'leads-a');

insert into public.tenant_users (tenant_id, user_id, role) values
  ((select tenant_a from ids), (select user_dir_a from ids), 'owner'),
  ((select tenant_a from ids), (select user_arq_a from ids), 'member');

insert into public.collaborators (id, tenant_id, user_id, name, email, role, area, status) values
  ((select col_dir_a from ids), (select tenant_a from ids), (select user_dir_a from ids),
   'Diretora A', 'dir-a@leads.example', 'director', 'administrative', 'active'),
  ((select col_arq_a from ids), (select tenant_a from ids), (select user_arq_a from ids),
   'Arquiteto A', 'arq-a@leads.example', 'architect', 'projects', 'active');

/* O admin da plataforma NAO e colaborador e NAO tem tenant. E de proposito:
   e o unico ator do sistema que existe fora de escritorio. */
insert into public.platform_admins (user_id, note) values
  ((select user_plat from ids), 'suite de teste');

-- 1. A porta publica -----------------------------------------------------------

select pg_temp.rec('1.1', 'CONTROLE: capture_product_lead grava um lead novo', 'OK',
  pg_temp.chk($$select public.capture_product_lead(
    'Ana@Leads.Test', 'Ana Prado', 'Prado Arquitetura', '11999990000', 'lp-hausone', 'hero')$$));

select pg_temp.rec('1.2', 'o lead nasce como new, com contador 1 e sem data de contato',
  'new|1|<null>',
  (select l.status::text || '|' || l.submission_count::text || '|' ||
          coalesce(l.contacted_at::text, '<null>')
     from public.product_leads l where l.email = 'ana@leads.test'));

/* citext: a MESMA pessoa em caixa diferente e o mesmo lead. Sem isto a fila
   encheria de duplicata e a contagem de conversao mentiria. */
select pg_temp.rec('1.3', 'CONTROLE: reenvio em outra caixa devolve true', 'true',
  (select public.capture_product_lead('ANA@leads.test', 'Ana Outra Vez', 'Outro Escritorio',
                                      '11888880000', 'lp-hausone', 'cta-final')::text));

select pg_temp.rec('1.4', 'reenvio NAO cria segunda linha; incrementa o contador', '1|2',
  (select count(*)::text || '|' || max(l.submission_count)::text
     from public.product_leads l where l.email = 'ana@leads.test'));

/* O PRIMEIRO ENVIO MANDA NO CADASTRO, e estes dois casos mudaram de sentido com
   a migration 0124. Antes diziam "reenvio SEM nome nao apaga o nome": com os
   quatro campos obrigatorios, reenvio sem nome deixou de existir. O que eles
   provam agora e mais forte: reenvio com nome DIFERENTE tambem nao substitui.
   Quem ja esta na fila foi cadastrado uma vez, e a equipe fala com aquele
   cadastro. */
select pg_temp.rec('1.5', 'reenvio com outro nome NAO substitui o primeiro',
  'Ana Prado',
  (select l.name from public.product_leads l where l.email = 'ana@leads.test'));

select pg_temp.rec('1.6', 'nem com outro escritorio', 'Prado Arquitetura',
  (select l.office_name from public.product_leads l where l.email = 'ana@leads.test'));

select pg_temp.rec('1.6b', 'nem com outro telefone', '11999990000',
  (select l.phone from public.product_leads l where l.email = 'ana@leads.test'));

select pg_temp.rec('1.7', 'e-mail em branco e recusado pela funcao', 'ERR:22023',
  pg_temp.chk($$select public.capture_product_lead('   ')$$));

select pg_temp.rec('1.8', 'e-mail sem forma de e-mail e recusado pelo check', 'ERR:23514',
  pg_temp.chk($$select public.capture_product_lead(
    'nao-e-email', 'Nome', 'Escritorio', '11999990000')$$));

/* OS QUATRO CAMPOS, migration 0124. A pagina e publica e sem credencial: a
   recusa nao pode viver so no navegador, senao post direto no endereco ou
   pagina antiga em cache gravam lead pela metade. Um caso por campo, porque a
   frase que a pessoa le sai do campo que faltou. */
select pg_temp.rec('1.8a', 'nome em branco e recusado', 'ERR:22023',
  pg_temp.chk($$select public.capture_product_lead(
    'faltanome@leads.test', '  ', 'Escritorio', '11999990000')$$));

select pg_temp.rec('1.8b', 'telefone em branco e recusado', 'ERR:22023',
  pg_temp.chk($$select public.capture_product_lead(
    'faltafone@leads.test', 'Nome', 'Escritorio', '  ')$$));

select pg_temp.rec('1.8c', 'escritorio em branco e recusado', 'ERR:22023',
  pg_temp.chk($$select public.capture_product_lead(
    'faltaesc@leads.test', 'Nome', '  ', '11999990000')$$));

select pg_temp.rec('1.8d', 'e nenhum dos tres recusados gravou linha', '0',
  (select count(*)::text from public.product_leads
    where email in ('faltanome@leads.test', 'faltafone@leads.test', 'faltaesc@leads.test')));

/* A pagina e publica. Se a resposta distinguisse "gravei" de "ja existia", o
   formulario viraria um verificador de quais e-mails ja se cadastraram. */
select pg_temp.rec('1.9', 'e-mail JA cadastrado devolve true, igual a um novo', 'true|true',
  (select public.capture_product_lead('nova@leads.test', 'Nova', 'Escritorio Novo', '11777770000')::text
          || '|' ||
          public.capture_product_lead('nova@leads.test', 'Nova', 'Escritorio Novo', '11777770000')::text));

select pg_temp.rec('1.10', 'anon NAO executa capture_product_lead', 'ERR:42501',
  pg_temp.como_anon($$select public.capture_product_lead('invasor@leads.test')::text$$));

select pg_temp.rec('1.11', 'colaborador logado tambem NAO executa capture_product_lead',
  'ERR:42501',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    $$select public.capture_product_lead('pelo-diretor@leads.test')::text$$));

select pg_temp.rec('1.12', 'anon nao escreve direto na tabela', 'ERR:42501',
  pg_temp.como_anon($$insert into public.product_leads (email) values ('direto@leads.test') returning '1'$$));

-- 2. Quem le a fila ------------------------------------------------------------

/* DOIS, e nao tres: bloco@leads.test so nasce no caso 4.4. A contagem e
   recortada pelo dominio @leads.test de proposito — contagem absoluta sobre
   product_leads passaria hoje e falharia no dia em que a fila tiver lead de
   verdade. */
select pg_temp.rec('2.1', 'CONTROLE: admin da plataforma le a fila, SEM claim de tenant', '2',
  pg_temp.como((select user_plat from ids), null,
    $$select count(*)::text from public.product_leads where email like '%@leads.test'$$));

select pg_temp.rec('2.2', 'Diretora do escritorio NAO le lead nenhum', '0',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    $$select count(*)::text from public.product_leads where email like '%@leads.test'$$));

select pg_temp.rec('2.3', 'Arquiteto NAO le lead nenhum', '0',
  pg_temp.como((select user_arq_a from ids), (select tenant_a from ids),
    $$select count(*)::text from public.product_leads where email like '%@leads.test'$$));

select pg_temp.rec('2.4', 'anon nao tem GRANT para ler a fila', 'ERR:42501',
  pg_temp.como_anon($$select count(*)::text from public.product_leads$$));

select pg_temp.rec('2.5', 'is_platform_admin: true para a equipe do produto', 'true',
  pg_temp.como((select user_plat from ids), null,
    $$select public.is_platform_admin()::text$$));

select pg_temp.rec('2.6', 'is_platform_admin: false para a Diretora do escritorio', 'false',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    $$select public.is_platform_admin()::text$$));

/* Nem para descobrir quem esta nela. O caminho de quem precisa saber se E um
   admin e a funcao, que responde so sobre o proprio usuario. */
select pg_temp.rec('2.7', 'platform_admins nao e legivel por quem esta logado', 'ERR:42501',
  pg_temp.como((select user_plat from ids), null,
    $$select count(*)::text from public.platform_admins$$));

select pg_temp.rec('2.8', 'platform_admins nao e legivel por anon', 'ERR:42501',
  pg_temp.como_anon($$select count(*)::text from public.platform_admins$$));

select pg_temp.rec('2.9', 'anon NAO executa is_platform_admin', 'ERR:42501',
  pg_temp.como_anon($$select public.is_platform_admin()::text$$));

/* Entrar na tabela e ato de migration ou do painel da Supabase. Um admin da
   plataforma nao se multiplica pela API. */
select pg_temp.rec('2.10', 'admin da plataforma NAO cadastra outro admin', 'ERR:42501',
  pg_temp.exec_como((select user_plat from ids), null,
    format('insert into public.platform_admins (user_id) values (%L)', (select user_arq_a from ids))));

-- 3. O que a tela da plataforma pode mexer -------------------------------------

select pg_temp.rec('3.1', 'CONTROLE: admin marca o lead como contatado', 'OK:1',
  pg_temp.exec_como((select user_plat from ids), null,
    $$update public.product_leads
         set status = 'contacted', contacted_at = now(), notes = 'ligou, quer demo'
       where email = 'ana@leads.test'$$));

select pg_temp.rec('3.2', 'Diretora do escritorio nao alcanca linha para atualizar', 'OK:0',
  pg_temp.exec_como((select user_dir_a from ids), (select tenant_a from ids),
    $$update public.product_leads set status = 'discarded' where email = 'ana@leads.test'$$));

/* O privilegio de UPDATE e de COLUNA (status, contacted_at, notes). RLS nao
   tem granularidade de coluna, e sem o grant recortado a policy deixaria a
   equipe reescrever o e-mail que a pessoa digitou. */
select pg_temp.rec('3.3', 'admin NAO reescreve o e-mail digitado', 'ERR:42501',
  pg_temp.exec_como((select user_plat from ids), null,
    $$update public.product_leads set email = 'outro@leads.test' where email = 'ana@leads.test'$$));

select pg_temp.rec('3.4', 'admin NAO mexe no contador de envios', 'ERR:42501',
  pg_temp.exec_como((select user_plat from ids), null,
    $$update public.product_leads set submission_count = 99 where email = 'ana@leads.test'$$));

select pg_temp.rec('3.5', 'admin NAO mexe na origem do lead', 'ERR:42501',
  pg_temp.exec_como((select user_plat from ids), null,
    $$update public.product_leads set source = 'inventada' where email = 'ana@leads.test'$$));

select pg_temp.rec('3.6', 'admin NAO insere lead pela API', 'ERR:42501',
  pg_temp.exec_como((select user_plat from ids), null,
    $$insert into public.product_leads (email) values ('na-mao@leads.test')$$));

select pg_temp.rec('3.7', 'admin NAO apaga lead (DELETE nao tem policy)', 'ERR:42501',
  pg_temp.exec_como((select user_plat from ids), null,
    $$delete from public.product_leads where email = 'ana@leads.test'$$));

-- 4. Invariantes da propria linha ----------------------------------------------

/* "Novo" com data de contato preenchida deixaria a tela escolher em qual dos
   dois acreditar. */
select pg_temp.rec('4.1', 'lead new nao pode ter data de contato', 'ERR:23514',
  pg_temp.chk($$update public.product_leads set contacted_at = now()
                 where email = 'nova@leads.test'$$));

select pg_temp.rec('4.2', 'CONTROLE: voltar para new exige limpar a data de contato', 'OK',
  pg_temp.chk($$update public.product_leads set status = 'new', contacted_at = null
                 where email = 'ana@leads.test'$$));

/* Origem e bloco sao escritos pela pagina, nunca digitados. Formato fechado
   para que um erro de digitacao no HTML nao crie em silencio uma origem nova e
   divida a contagem de conversao em duas. */
/* Os quatro campos vao preenchidos nestes tres de proposito: desde a migration
   0124 a funcao recusa lead incompleto ANTES de chegar ao check que cada caso
   quer medir, e sem isto todos eles passariam a observar 22023 e deixariam de
   provar o que dizem provar. */
select pg_temp.rec('4.3', 'bloco da pagina com espaco e maiuscula e recusado', 'ERR:23514',
  pg_temp.chk($$select public.capture_product_lead('bloco@leads.test', 'Nome', 'Escritorio',
                                                   '11999990000', 'lp-hausone', 'CTA Final')$$));

select pg_temp.rec('4.4', 'CONTROLE: bloco em caixa baixa com hifen e aceito', 'OK',
  pg_temp.chk($$select public.capture_product_lead('bloco@leads.test', 'Nome', 'Escritorio',
                                                   '11999990000', 'lp-hausone', 'cta-final')$$));

select pg_temp.rec('4.5', 'e-mail acima de 254 caracteres e recusado', 'ERR:23514',
  pg_temp.chk(format($$select public.capture_product_lead(%L, 'Nome', 'Escritorio', '11999990000')$$,
    repeat('a', 250) || '@leads.test')));

-- 5. Conceder e retirar o acesso (migration 0114) ------------------------------
--
-- A 0112 fechou platform_admins para todo mundo, inclusive para service_role:
-- tabela nova neste projeto nao e auto-exposta as roles da Data API (padrao
-- novo do Supabase, registrado em supabase/config.toml). Medido: PostgREST
-- devolve 42501 ate com a chave de servico. Por isso conceder passou a ser uma
-- funcao security definer, como a 0013 e a propria 0112 ja fazem para escrita
-- que a RLS nao pode decidir.
--
-- O que estes casos afirmam e a fronteira dela: operador alcanca, navegador
-- nao. Se um dia alguem conceder EXECUTE para authenticated, 5.6 e 5.7 acusam -
-- e a consequencia seria qualquer pessoa logada em qualquer escritorio poder se
-- promover e ler e-mail e telefone de quem nao e cliente de ninguem.

select pg_temp.rec('5.1', 'conceder a usuario que nao existe levanta erro', 'ERR:22023',
  pg_temp.chk(format($$select public.grant_platform_admin(%L)$$,
    '00000000-0000-4000-8000-000000000000')));

select pg_temp.rec('5.2', 'CONTROLE: conceder ao Arquiteto devolve true', 'true',
  (select public.grant_platform_admin((select user_arq_a from ids), 'posto pela suite')::text));

select pg_temp.rec('5.3', 'e agora ele le a fila', '3',
  pg_temp.como((select user_arq_a from ids), (select tenant_a from ids),
    $$select count(*)::text from public.product_leads where email like '%@leads.test'$$));

/* Rodar de novo e inofensivo, e nao apaga a anotacao de quem a tinha: o comando
   existe para ser repetido sem medo em ambiente novo. */
select pg_temp.rec('5.4', 'CONTROLE: conceder de novo passa, sem erro', 'true',
  (select public.grant_platform_admin((select user_arq_a from ids))::text));

select pg_temp.rec('5.4b', 'e a segunda concessao, sem anotacao, NAO apagou a primeira',
  'posto pela suite',
  (select note from public.platform_admins where user_id = (select user_arq_a from ids)));

select pg_temp.rec('5.5', 'retirar devolve true, e false na segunda vez', 'true|false',
  (select public.revoke_platform_admin((select user_arq_a from ids))::text || '|' ||
          public.revoke_platform_admin((select user_arq_a from ids))::text));

select pg_temp.rec('5.6', 'e ele volta a nao ler lead nenhum', '0',
  pg_temp.como((select user_arq_a from ids), (select tenant_a from ids),
    $$select count(*)::text from public.product_leads where email like '%@leads.test'$$));

/* A fronteira. Ninguem logado no sistema se promove, nem promove outro. */
select pg_temp.rec('5.7', 'Diretora do escritorio NAO concede a si mesma', 'ERR:42501',
  pg_temp.como((select user_dir_a from ids), (select tenant_a from ids),
    format($$select public.grant_platform_admin(%L)::text$$, (select user_dir_a from ids))));

select pg_temp.rec('5.8', 'admin da plataforma tambem NAO concede a outro', 'ERR:42501',
  pg_temp.como((select user_plat from ids), null,
    format($$select public.grant_platform_admin(%L)::text$$, (select user_arq_a from ids))));

select pg_temp.rec('5.9', 'anon NAO concede', 'ERR:42501',
  pg_temp.como_anon(format($$select public.grant_platform_admin(%L)::text$$,
    (select user_arq_a from ids))));

select pg_temp.rec('5.10', 'anon NAO retira', 'ERR:42501',
  pg_temp.como_anon(format($$select public.revoke_platform_admin(%L)::text$$,
    (select user_plat from ids))));

select case when observed = expected then 'PASS' else 'FAIL' end as status,
       caso, descricao, expected, observed
from res order by seq;

rollback;
