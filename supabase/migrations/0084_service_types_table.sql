-- Os tipos de servico do Pipeline saem do ENUM e viram TABELA, por escritorio.
--
-- O PEDIDO
--   Um modulo de Configuracoes onde o escritorio possa ACRESCENTAR tipos de
--   servico ao Pipeline. "Futuramente havera mais" opcoes; esta e a primeira.
--
-- POR QUE ISSO NAO CABIA NUMA TELA
--   `service_type` era um enum do Postgres com seis valores. Enum so cresce por
--   DDL (`alter type ... add value`), que a aplicacao nao executa e que nem pode
--   rodar na mesma transacao em que o valor novo e usado. Ou seja: com o enum, a
--   tela de configuracao seria impossivel de escrever honestamente — ela
--   ofereceria um botao "adicionar" que so um desenvolvedor conseguiria cumprir.
--
--   Entao o tipo de servico vira DADO, e nao mais estrutura.
--
-- POR ESCRITORIO, e nao global
--   E o pedido: cada escritorio acrescenta os seus. Os seis valores atuais sao
--   semeados para TODOS os tenants existentes, com as mesmas chaves de antes, de
--   modo que nada muda de comportamento no dia da migration.
--
-- A COLUNA `contract_group` EXISTE PARA UMA REGRA NAO MORRER EM SILENCIO
--   `mark_negotiation_won` deriva o TIPO DO CONTRATO do conjunto de servicos
--   (0067): interiores + complementar = full; so interiores =
--   architecture_interiors; so complementar = architecture_engineering; senao
--   architecture. Essa regra citava os valores do enum pelo nome.
--
--   Sem esta coluna, um tipo novo cairia sempre no ultimo ramo e o contrato
--   nasceria como "Arquitetura" — sem que ninguem tivesse escrito essa regra e
--   sem que a tela mostrasse por que. Com ela, quem cadastra o tipo diz a que
--   grupo ele pertence, e a derivacao passa a ler a TABELA em vez de uma lista
--   escrita dentro da funcao.
--
--   A semeadura reproduz exatamente o comportamento de hoje: interiors ->
--   interiors; structural, plumbing e electrical -> engineering; architecture e
--   consulting -> none.
--
-- O ENUM `service_type` FICA NO BANCO, sem uso
--   Apagar tipo e irreversivel e nao ganha nada: ele deixa de ser referenciado
--   por qualquer coluna nesta migration. Fica como registro do que existia, e
--   some numa limpeza futura se alguem quiser.

-- 1. A tabela ------------------------------------------------------------------

create type public.service_contract_group as enum ('none', 'interiors', 'engineering');

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- A chave e estavel e a etiqueta e editavel: renomear "Hidrossanitario" para
  -- "Hidraulica" nao pode reescrever o que ja foi gravado em negociacao.
  key text not null,
  label text not null,

  contract_group public.service_contract_group not null default 'none',

  -- Desativar em vez de apagar: tipo usado por negociacao antiga nao pode
  -- desaparecer do historico so porque o escritorio parou de vende-lo.
  is_active boolean not null default true,
  display_order smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo da FK composta de negotiation_services. Referencia por id sozinho
  -- deixaria gravar servico de um escritorio dentro do dado de outro.
  constraint service_types_id_tenant_id_key unique (id, tenant_id),
  constraint service_types_tenant_id_key_key unique (tenant_id, key),
  constraint service_types_key_format_check check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint service_types_label_not_blank_check check (btrim(label) <> ''),
  constraint service_types_label_length_check check (length(label) <= 60)
);

create index service_types_tenant_id_display_order_idx
  on public.service_types (tenant_id, display_order);

comment on table public.service_types is
  'Tipos de servico que o Pipeline oferece, por escritorio. Era o enum service_type (0021) e virou tabela na 0084, porque o escritorio precisa ACRESCENTAR tipos e enum so cresce por DDL. A chave e estavel e a etiqueta e editavel: renomear nao pode reescrever o que ja foi gravado. Tipo que sai de linha e DESATIVADO (is_active), nunca apagado - negociacao antiga continua mostrando o servico que foi vendido.';

comment on column public.service_types.contract_group is
  'A que grupo o servico pertence para a derivacao do TIPO DE CONTRATO em mark_negotiation_won: interiors, engineering (complementares) ou none (nao influencia). Sem esta coluna, um tipo novo cairia sempre em "Arquitetura" sem que ninguem tivesse escrito essa regra. A semeadura da 0084 reproduz o comportamento anterior: interiors=interiors; structural/plumbing/electrical=engineering; architecture/consulting=none.';

-- 2. Os seis valores de hoje, para cada escritorio -----------------------------

insert into public.service_types (tenant_id, key, label, contract_group, display_order)
select t.id, v.key, v.label, v.grupo::public.service_contract_group, v.ordem
from public.tenants t
cross join (values
  ('architecture', 'Arquitetura',      'none',        1),
  ('interiors',    'Interiores',       'interiors',   2),
  ('structural',   'Estrutural',       'engineering', 3),
  ('plumbing',     'Hidrossanitário',  'engineering', 4),
  ('electrical',   'Elétrico',         'engineering', 5),
  ('consulting',   'Consultoria',      'none',        6)
) as v(key, label, grupo, ordem);

-- 3. negotiation_services passa a apontar para a tabela ------------------------

alter table public.negotiation_services
  add column service_type_id uuid;

update public.negotiation_services ns
set service_type_id = st.id
from public.service_types st
where st.tenant_id = ns.tenant_id
  and st.key = ns.service_type::text;

alter table public.negotiation_services
  alter column service_type_id set not null;

alter table public.negotiation_services
  add constraint negotiation_services_service_type_id_fkey
    foreign key (service_type_id, tenant_id)
    references public.service_types (id, tenant_id);

-- A unicidade acompanha: um servico nao aparece duas vezes na mesma negociacao.
alter table public.negotiation_services
  drop constraint negotiation_services_negotiation_id_service_type_key;

alter table public.negotiation_services
  add constraint negotiation_services_negotiation_id_service_type_id_key
    unique (negotiation_id, service_type_id);

alter table public.negotiation_services
  drop column service_type;

-- O INDICE VAI JUNTO COM A COLUNA, e precisa voltar.
--
-- `negotiation_services_tenant_id_service_type_idx` (0022) era
-- (tenant_id, service_type, negotiation_id) e o DROP COLUMN acima o derrubou em
-- silencio — a tabela ficaria sem nenhum indice comecando por tenant_id, contra
-- a regra do CLAUDE.md e contra o filtro "negociacoes deste tipo de servico",
-- que e o unico jeito que esta tabela e lida em massa.
create index negotiation_services_tenant_id_service_type_id_idx
  on public.negotiation_services (tenant_id, service_type_id, negotiation_id);

comment on column public.negotiation_services.service_type_id is
  'O tipo de servico, agora uma linha de service_types e nao mais um valor de enum (0084). A FK e composta com tenant_id: sem isso daria para apontar para o tipo de outro escritorio.';

-- 4. O menu do modulo novo -----------------------------------------------------
--
--    sort_order 900: depois de tudo que e operacao, antes de nada. Configuracao
--    nao e uma tela que se usa todo dia, e a barra lateral e lida de cima para
--    baixo na ordem em que o trabalho acontece.

insert into public.menus (key, label_pt, sort_order, parent_key)
values ('settings', 'Configurações', 900, null);

-- Quem ja e Diretor nao precisa de linha: can_edit_menu devolve true para
-- director em qualquer menu. Esta insercao e para os demais ENXERGAREM a
-- ausencia de permissao como ausencia, e nao como menu inexistente.
comment on table public.service_types is
  'Tipos de servico que o Pipeline oferece, por escritorio. Era o enum service_type (0021) e virou tabela na 0084, porque o escritorio precisa ACRESCENTAR tipos e enum so cresce por DDL. A chave e estavel e a etiqueta e editavel: renomear nao pode reescrever o que ja foi gravado. Tipo que sai de linha e DESATIVADO (is_active), nunca apagado - negociacao antiga continua mostrando o servico que foi vendido. Escrita presa ao menu `settings` (0084); leitura larga, como o resto do modulo 3.';

-- 5. RLS -----------------------------------------------------------------------
--
--    LEITURA LARGA, como o resto do modulo 3: qualquer colaborador ativo do
--    escritorio le os tipos de servico — o formulario de negociacao precisa
--    deles, e escondê-los quebraria a tela de quem vende sem dar seguranca
--    nenhuma (o nome de um servico nao e segredo).
--
--    ESCRITA PRESA AO MENU `settings`, e nao ao `pipeline`: acrescentar tipo de
--    servico e configurar o sistema, nao trabalhar no funil. Quem vende usa a
--    lista; quem a define e outra pessoa.

alter table public.service_types enable row level security;

create policy service_types_select_active_collaborator
  on public.service_types for select
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy service_types_select_active_collaborator on public.service_types is
  'Qualquer colaborador ativo do escritorio le. Recorte largo, igual ao do resto do modulo 3: o formulario de negociacao precisa da lista para desenhar os checkboxes, e esconde-la quebraria a tela de quem vende sem proteger nada.';

create policy service_types_insert_settings_editor
  on public.service_types for insert
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

create policy service_types_update_settings_editor
  on public.service_types for update
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

comment on policy service_types_update_settings_editor on public.service_types is
  'Editar rotulo, grupo, ordem e a bandeira de ativo. Tirar um tipo de linha e DESATIVAR (is_active = false), nao apagar: e o gesto que a tela oferece, e o unico que preserva o que ja foi vendido.';

-- APAGAR EXISTE, MAS SO ALCANCA TIPO QUE NUNCA FOI USADO.
--
-- A primeira versao desta migration nao criava policy de delete, para que
-- historico nenhum sumisse. So que quem protege o historico ja e a FK de
-- negotiation_services (sem `on delete`, portanto NO ACTION): apagar tipo que
-- alguma negociacao usa devolve 23503, venha o DELETE de onde vier. Sem a
-- policy, o unico caso que sobrava — tipo criado errado, ainda sem uso — ficava
-- preso para sempre na lista, desativado, sem jeito de limpar.
create policy service_types_delete_settings_editor
  on public.service_types for delete
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('settings'))
  );

comment on policy service_types_delete_settings_editor on public.service_types is
  'Apagar tipo de servico. Quem impede que isso apague historico e a FK de negotiation_services: tipo em uso devolve 23503. Sobra o caso legitimo — tipo cadastrado errado e nunca usado.';

-- SEM ISTO A TABELA NAO EXISTE PARA O APLICATIVO.
--
-- RLS decide QUAIS LINHAS, o grant decide SE O COMANDO CHEGA A SER TENTADO. A
-- primeira versao desta migration criou as policies e esqueceu o grant, e o
-- resultado era 42501 em toda leitura pelo PostgREST — inclusive a do Diretor,
-- que passa por cima de permissao de menu mas nao por cima de privilegio do
-- Postgres. Mesma linha de 0009_rls_collaborators.
grant select, insert, update, delete on table public.service_types to authenticated;

-- 6. A derivacao do tipo de contrato passa a ler a TABELA -----------------------
--
--    Antes ela citava os valores do enum pelo nome, dentro da funcao. Agora
--    pergunta ao tipo de servico a que grupo ele pertence — que e o que permite
--    um tipo NOVO participar da regra em vez de cair calado em "Arquitetura".

create or replace function public.mark_negotiation_won(p_negotiation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_tenant_id uuid;
  v_negotiation public.negotiations;
  v_client public.clients;
  v_contract_id uuid;
  v_contract_number text;
  v_status_changed boolean := false;
  v_contract_type public.contract_type;
  v_has_interiors boolean;
  v_has_engineering boolean;
  v_snapshot boolean;
  v_last_number text;
  v_number text;
  v_constraint text;
  i integer;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if not public.can_edit_menu('pipeline') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_negotiation
  from public.negotiations
  where id = p_negotiation_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'negotiation_not_found' using errcode = 'P0001';
  end if;

  if v_negotiation.status = 'lost' then
    raise exception 'negotiation_lost' using errcode = 'P0001';
  end if;

  if v_negotiation.client_id is null then
    raise exception 'client_required' using errcode = 'P0001';
  end if;

  if v_negotiation.status <> 'won' then
    update public.negotiations
    set status = 'won',
        closed_at = current_date
    where id = v_negotiation.id;

    v_status_changed := true;
  end if;

  if not v_negotiation.generates_contract then
    return jsonb_build_object(
      'outcome', 'not_requested',
      'negotiationId', v_negotiation.id,
      'statusChanged', v_status_changed,
      'contractId', null,
      'contractNumber', null,
      'clientSnapshot', null
    );
  end if;

  select c.id, c.contract_number
  into v_contract_id, v_contract_number
  from public.contracts c
  where c.negotiation_id = v_negotiation.id
    and c.tenant_id = v_tenant_id
  order by c.created_at, c.id
  limit 1;

  if found then
    return jsonb_build_object(
      'outcome', 'already_exists',
      'negotiationId', v_negotiation.id,
      'statusChanged', v_status_changed,
      'contractId', v_contract_id,
      'contractNumber', v_contract_number,
      'clientSnapshot', null
    );
  end if;

  -- A REGRA E A MESMA DA 0067; o que mudou e de onde vem a classificacao. Antes
  -- os quatro valores estavam escritos aqui dentro; agora cada tipo de servico
  -- diz a que grupo pertence (service_types.contract_group, 0084), e um tipo
  -- criado pelo escritorio participa em vez de cair calado no ultimo ramo.
  select bool_or(st.contract_group = 'interiors'),
         bool_or(st.contract_group = 'engineering')
  into v_has_interiors, v_has_engineering
  from public.negotiation_services s
  join public.service_types st
    on st.id = s.service_type_id and st.tenant_id = s.tenant_id
  where s.negotiation_id = v_negotiation.id
    and s.tenant_id = v_tenant_id;

  v_contract_type := case
    when coalesce(v_has_interiors, false) and coalesce(v_has_engineering, false)
      then 'full'
    when coalesce(v_has_interiors, false)
      then 'architecture_interiors'
    when coalesce(v_has_engineering, false)
      then 'architecture_engineering'
    else 'architecture'
  end;

  select * into v_client
  from public.clients
  where id = v_negotiation.client_id
    and tenant_id = v_tenant_id;

  v_snapshot := found
    and btrim(coalesce(v_client.name, '')) <> ''
    and btrim(coalesce(v_client.phone, '')) <> ''
    and btrim(coalesce(v_client.address_city, '')) <> ''
    and btrim(coalesce(v_client.address_state, '')) <> ''
    and btrim(coalesce(v_client.site_zipcode, '')) <> ''
    and btrim(coalesce(v_client.site_street, '')) <> ''
    and btrim(coalesce(v_client.site_city, '')) <> ''
    and btrim(coalesce(v_client.site_state, '')) <> '';

  select c.contract_number
  into v_last_number
  from public.contracts c
  where c.tenant_id = v_tenant_id
  order by c.created_at desc, c.id desc
  limit 1;

  v_number := public.increment_contract_number(v_last_number);

  for i in 1..25 loop
    begin
      insert into public.contracts (
        tenant_id, negotiation_id, client_id,
        contract_number, contract_type, total_value,
        project_name, status, signature_date, start_date, notes,
        installments_generated,
        origin, referrer_name,
        client_legal_name, client_email, client_tax_id, client_birth_date,
        client_address_zipcode, client_address_street, client_address_number,
        client_address_complement, client_address_city, client_address_state,
        site_zipcode, site_street, site_number, site_complement,
        site_city, site_state
      ) values (
        v_tenant_id, v_negotiation.id, v_negotiation.client_id,
        v_number, v_contract_type, coalesce(v_negotiation.estimated_value, 0),
        v_negotiation.name, 'negotiating', current_date, current_date,
        'Contrato criado automaticamente a partir da negociação: ' || v_negotiation.name,
        false,
        v_negotiation.origin, v_negotiation.referrer_name,
        case when v_snapshot then v_client.name end,
        case when v_snapshot then v_client.email::text end,
        case when v_snapshot then v_client.tax_id end,
        case when v_snapshot then v_client.birth_date end,
        case when v_snapshot then v_client.address_zipcode end,
        case when v_snapshot then v_client.address_street end,
        case when v_snapshot then v_client.address_number end,
        case when v_snapshot then v_client.address_complement end,
        case when v_snapshot then v_client.address_city end,
        case when v_snapshot then v_client.address_state end,
        case when v_snapshot then v_client.site_zipcode end,
        case when v_snapshot then v_client.site_street end,
        case when v_snapshot then v_client.site_number end,
        case when v_snapshot then v_client.site_complement end,
        case when v_snapshot then v_client.site_city end,
        case when v_snapshot then v_client.site_state end
      )
      returning id, contract_number into v_contract_id, v_contract_number;

      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      if v_constraint is distinct from 'contracts_tenant_id_contract_number_key' then
        raise;
      end if;

      v_number := public.increment_contract_number(v_number);
    end;
  end loop;

  if v_contract_id is null then
    raise exception 'contract_number_conflict' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'outcome', 'created',
    'negotiationId', v_negotiation.id,
    'statusChanged', v_status_changed,
    'contractId', v_contract_id,
    'contractNumber', v_contract_number,
    'clientSnapshot', v_snapshot
  );
end;
$BODY$;

-- 7. Escritorio novo nasce com os tipos padrao ---------------------------------
--
--    A semeadura da secao 2 alcanca so os escritorios que EXISTIAM quando esta
--    migration rodou. Sem o gatilho, o proximo escritorio nasceria com a lista
--    vazia e o formulario de negociacao dele sairia sem um unico checkbox — uma
--    falha muda, que so aparece na hora de vender.
--
--    `security definer` porque quem cria o escritorio ainda nao tem vinculo com
--    ele: `auth_tenant_id()` nao devolveria o tenant recem-criado e a policy de
--    insert barraria a propria semeadura.
--
--    `on conflict do nothing` na chave (tenant_id, key): o gatilho nao e a unica
--    porta (a secao 2 e um insert direto), e semear duas vezes o mesmo tipo tem
--    de ser inofensivo.

create or replace function public.seed_default_service_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
begin
  insert into public.service_types (tenant_id, key, label, contract_group, display_order)
  select new.id, v.key, v.label, v.grupo::public.service_contract_group, v.ordem
  from (values
    ('architecture', 'Arquitetura',      'none',        1),
    ('interiors',    'Interiores',       'interiors',   2),
    ('structural',   'Estrutural',       'engineering', 3),
    ('plumbing',     'Hidrossanitário',  'engineering', 4),
    ('electrical',   'Elétrico',         'engineering', 5),
    ('consulting',   'Consultoria',      'none',        6)
  ) as v(key, label, grupo, ordem)
  on conflict (tenant_id, key) do nothing;

  return new;
end;
$BODY$;

comment on function public.seed_default_service_types is
  'Da a um escritorio recem-criado os seis tipos de servico padrao — os mesmos que eram o enum service_type ate a 0084. Sem isto o Pipeline do escritorio novo abriria sem nenhum tipo para marcar.';

create trigger tenants_seed_service_types
  after insert on public.tenants
  for each row execute function public.seed_default_service_types();
