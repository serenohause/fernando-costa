-- Modulo 1 (Fundacao) - catalogo de menus e matriz de permissoes.
--
-- Vem de PermissoesUsuario do base44, reestruturado. No original o menu e
-- texto livre: 27 rotulos para 16 menus, com duplicatas semanticas
-- (Clientes vs CRM, Contratos vs Contratos & Propostas, Tarefas vs Fluxo do
-- Projeto) e dois valores corrompidos - "Negoциações" com caracteres
-- cirilicos e "Aprova​ções de Acesso" com zero-width space. Comparar permissao
-- por string assim e fragil por construcao: basta alguem renomear um item de
-- menu na tela para que a permissao de todo mundo deixe de casar em silencio.
-- Aqui a chave e um slug ASCII estavel e o rotulo em portugues e so dado.

create table public.menus (
  key text primary key,
  label_pt text not null,
  sort_order integer not null,
  parent_key text references public.menus (key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menus_key_format_check check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint menus_parent_not_self_check check (parent_key is null or parent_key <> key),
  constraint menus_label_pt_not_blank_check check (btrim(label_pt) <> '')
);

-- Por que menus NAO tem tenant_id (unica excecao da fundacao):
-- e catalogo do produto, nao dado do cliente. A lista de telas do sistema e a
-- mesma para todo escritorio, porque decorre do codigo do frontend, nao da
-- operacao de ninguem. Dar tenant_id aqui significaria copiar 17 linhas
-- identicas por escritorio e, pior, permitir que um tenant ficasse com o
-- catalogo desatualizado depois de um deploy que adiciona tela - o menu novo
-- existiria no codigo e nao na tabela daquele tenant. O que e por escritorio e
-- a permissao (collaborator_permissions), nao a existencia da tela. Linha nova
-- aqui entra por migration, junto com a tela que ela representa.
comment on table public.menus is
  'Catalogo de itens de menu do produto. Sem tenant_id de proposito: a lista de telas decorre do codigo, e igual para todo escritorio e so muda por migration. O que varia por escritorio e a permissao sobre cada item, em collaborator_permissions.';

comment on column public.menus.key is
  'Slug ASCII estavel, usado como chave de permissao. Substitui o texto livre do base44. Renomear o rotulo da sidebar nunca invalida uma permissao gravada.';
comment on column public.menus.label_pt is
  'Rotulo exibido na sidebar. Copia inicial vem de docs/ENUM-MAP.md; a UI nao escreve esse texto a mao.';
comment on column public.menus.parent_key is
  'Agrupador da sidebar. Hoje so "financial" agrupa (recebiveis e pagamentos), reproduzindo o Layout.jsx do original.';

create index menus_parent_key_sort_order_idx on public.menus (parent_key, sort_order);

create trigger menus_set_updated_at
  before update on public.menus
  for each row execute function public.set_updated_at();

-- Catalogo inicial: as 17 chaves de docs/ENUM-MAP.md, na ordem em que o
-- Layout.jsx do original renderiza a sidebar. "financial" e o unico agrupador
-- e nao existe como texto no base44 - la o agrupamento e so estrutura de
-- componente, sem permissao propria; quem manda sao os dois filhos.
-- "Minhas Atividades" aparece na navegacao do original mas nao entra aqui:
-- e liberado por funcao (Arquiteto, Estagiario, Coordenador) e nunca e
-- checado contra PermissoesUsuario.
insert into public.menus (key, label_pt, sort_order, parent_key) values
  ('dashboard_overview',   'Visão Geral',           10, null),
  ('dashboard_executive',  'Painel Executivo',      20, null),
  ('dashboard_commercial', 'Painel Comercial',      30, null),
  ('crm',                  'CRM',                   40, null),
  ('pipeline',             'Pipeline',              50, null),
  ('contracts',            'Contratos & Propostas', 60, null),
  ('projects',             'Projetos',              70, null),
  ('map',                  'Mapa de Projetos',      80, null),
  ('project_flow',         'Fluxo do Projeto',      90, null),
  ('activities',           'Atividades',           100, null),
  ('suppliers',            'Fornecedores',         110, null),
  ('client_budget',        'Orçamento por Cliente',120, null),
  ('financial',            'Financeiro',           130, null),
  ('receivables',          'Recebíveis',           140, 'financial'),
  ('payables',             'Pagamentos',           150, 'financial'),
  ('team',                 'Equipe',               160, null),
  ('access_control',       'Controle de Acesso',   170, null);

-- collaborator_permissions: matriz colaborador x menu.

create table public.collaborator_permissions (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  collaborator_id uuid not null,
  menu_key text not null references public.menus (key) on update cascade,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint collaborator_permissions_pkey primary key (collaborator_id, menu_key),
  constraint collaborator_permissions_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint collaborator_permissions_collaborator_id_fkey
    foreign key (collaborator_id, tenant_id)
    references public.collaborators (id, tenant_id)
    on delete cascade,
  constraint collaborator_permissions_edit_requires_view_check
    check (can_view or not can_edit)
);

comment on table public.collaborator_permissions is
  'Permissao de um colaborador sobre um item de menu. Vem de PermissoesUsuario do base44, com o texto livre do menu trocado por FK para menus.key.';

comment on constraint collaborator_permissions_edit_requires_view_check
  on public.collaborator_permissions is
  'can_edit exige can_view. No original nada impede gravar permissao de editar um menu que a pessoa nem consegue ver - estado que a tela nao sabe representar e que so aparece como bug depois.';

comment on column public.collaborator_permissions.collaborator_id is
  'FK composta com tenant_id contra collaborators (id, tenant_id): impede gravar permissao para colaborador de outro escritorio. ON DELETE CASCADE porque permissao sem colaborador nao significa nada.';

comment on column public.collaborator_permissions.legacy_id is
  'Id da linha de PermissoesUsuario no base44. Ver docs/SCHEMA-PLAN.md: colaboradores com rotulos duplicados (Clientes e CRM) que divirjam em can_view/can_edit vao para conferencia humana na importacao, aplicando o mais permissivo.';

-- A PK comeca por collaborator_id (e o acesso natural: "as permissoes desta
-- pessoa"), entao ela nao serve de indice para varredura por tenant.
create index collaborator_permissions_tenant_id_collaborator_id_idx
  on public.collaborator_permissions (tenant_id, collaborator_id);

create index collaborator_permissions_tenant_id_menu_key_idx
  on public.collaborator_permissions (tenant_id, menu_key)
  where can_view;

create trigger collaborator_permissions_set_updated_at
  before update on public.collaborator_permissions
  for each row execute function public.set_updated_at();
