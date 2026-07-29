-- Modulo 1 (Fundacao) - collaborators, vindo de Collaborator do base44.
-- E o perfil de negocio da pessoa dentro do escritorio, separado do usuario
-- de autenticacao.
--
-- Nao portado do original, por decisao registrada em docs/ARCHITECTURE.md:
--   - senha_temporaria: o base44 guarda senha em texto puro. O onboarding
--     passa a ser convite por e-mail do Supabase Auth.
--   - user_auth_email: o vinculo de login passa a ser user_id; o e-mail de
--     autenticacao e o do auth.users.
--   - coordenador_name: desnormalizacao do base44 (que nao tem join). Vira
--     coordinator_id + join.

create table public.collaborators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  role public.collaborator_role not null,
  area public.collaborator_area,
  email extensions.citext not null,
  coordinator_id uuid,
  status public.collaborator_status not null default 'active',
  weekly_hours numeric(5, 2),
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint collaborators_id_tenant_id_key unique (id, tenant_id),
  constraint collaborators_tenant_id_email_key unique (tenant_id, email),
  constraint collaborators_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint collaborators_coordinator_not_self_check
    check (coordinator_id is null or coordinator_id <> id),
  constraint collaborators_name_not_blank_check check (btrim(name) <> ''),
  constraint collaborators_email_format_check
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint collaborators_weekly_hours_range_check
    check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 168))
);

alter table public.collaborators
  add constraint collaborators_coordinator_id_fkey
  foreign key (coordinator_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.collaborators is
  'Membro da equipe do escritorio. Perfil de negocio, distinto do usuario de autenticacao: existe colaborador sem login (convite ainda nao aceito) e a funcao de negocio vive aqui, nao em tenant_users.';

comment on column public.collaborators.user_id is
  'Usuario do Supabase Auth. Nullable de proposito: o colaborador e cadastrado pelo Diretor antes de aceitar o convite, e so ganha user_id quando aceita. Toda regra de acesso precisa tratar o caso "colaborador sem login".';

comment on column public.collaborators.coordinator_id is
  'Coordenador responsavel (auto-referencia). A FK e composta com tenant_id contra collaborators (id, tenant_id) para que seja impossivel apontar para um colaborador de outro escritorio - a RLS filtra leitura, mas nao impediria essa escrita cruzada. Sem ON DELETE: apagar um coordenador com liderados falha de proposito, forcando reatribuicao explicita em vez de orfanar a hierarquia em silencio.';

comment on column public.collaborators.email is
  'E-mail interno de contato, unico por tenant. Nao e necessariamente o e-mail de login: esse mora em auth.users, alcancado via user_id.';

comment on column public.collaborators.legacy_id is
  'Id da linha correspondente no base44. Preenchido so pela importacao (que roda no fim do projeto) e usado para refazer as ligacoes entre tabelas e para reimportar sem duplicar. Nulo em tudo que nasce no sistema novo.';

comment on column public.collaborators.weekly_hours is
  'Carga horaria semanal. Base do RelatorioProdutividade, que cruza este valor com as horas das atividades.';

create index collaborators_tenant_id_status_idx
  on public.collaborators (tenant_id, status);

create index collaborators_tenant_id_role_idx
  on public.collaborators (tenant_id, role);

create index collaborators_tenant_id_coordinator_id_idx
  on public.collaborators (tenant_id, coordinator_id);

-- Um usuario do Auth tem no maximo um colaborador por tenant, mas varios
-- colaboradores podem estar sem user_id ao mesmo tempo (convites pendentes) -
-- por isso o unique e parcial e nao uma constraint comum.
create unique index collaborators_tenant_id_user_id_key
  on public.collaborators (tenant_id, user_id)
  where user_id is not null;

create trigger collaborators_set_updated_at
  before update on public.collaborators
  for each row execute function public.set_updated_at();
