-- Modulo 1 (Fundacao) - access_requests, vindo de SolicitacaoAcesso do base44.
-- Fila de quem tentou entrar e ainda nao e colaborador ativo.

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email extensions.citext not null,
  name text not null,
  status public.access_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  attempts integer not null default 1,
  source text,
  decided_by uuid,
  decided_at timestamptz,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint access_requests_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint access_requests_decided_by_fkey
    foreign key (decided_by, tenant_id)
    references public.collaborators (id, tenant_id),
  constraint access_requests_name_not_blank_check check (btrim(name) <> ''),
  constraint access_requests_email_format_check
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint access_requests_attempts_positive_check check (attempts >= 1),
  constraint access_requests_pending_has_no_decision_check
    check (status <> 'pending' or (decided_by is null and decided_at is null))
);

comment on table public.access_requests is
  'Solicitacao de acesso ao escritorio. Criada pela edge function register-access-request (service_role), que resolve o tenant pelo dominio do e-mail em tenant_email_domains - o solicitante ainda nao tem claim tenant_id no JWT e por isso nao pode escrever aqui pelo cliente.';

comment on column public.access_requests.email is
  'E-mail de quem pediu acesso. citext: o mesmo endereco digitado com maiuscula diferente e a mesma pessoa, e o indice de pendente unico depende disso para nao deixar passar duplicata.';

comment on column public.access_requests.source is
  'Origem da tentativa (signup, login_google, login_email). Fica text, e nao enum: no base44 e string livre, sem lista fechada declarada, e nao ha de/para em docs/ENUM-MAP.md que autorize fixar valores.';

comment on column public.access_requests.decided_by is
  'Colaborador que aprovou ou recusou. Substitui aprovado_por_id + aprovado_por_nome do original (o nome volta por join). FK composta com tenant_id para nao aceitar aprovador de outro escritorio.';

comment on constraint access_requests_pending_has_no_decision_check
  on public.access_requests is
  'Solicitacao pendente nao pode carregar decisao. Impede o estado meio-termo que o original permite: status Pendente com aprovado_por preenchido, que a tela de aprovacoes nao sabe exibir.';

comment on column public.access_requests.legacy_id is
  'Id da linha de SolicitacaoAcesso no base44, usado pela importacao no fim do projeto.';

-- Uma solicitacao pendente por e-mail, por escritorio. Aprovadas e recusadas
-- ficam no historico e podem repetir, por isso o indice e parcial.
-- No original isso e resolvido varrendo a lista inteira no cliente
-- (todasSolicitacoes.find(...)) antes de gravar: duas abas abertas ou dois
-- cliques rapidos criam duas linhas, e a fila de aprovacao passa a mostrar a
-- mesma pessoa duas vezes. Aqui a corrida morre no banco.
create unique index access_requests_tenant_id_email_pending_key
  on public.access_requests (tenant_id, email)
  where status = 'pending';

create index access_requests_tenant_id_status_requested_at_idx
  on public.access_requests (tenant_id, status, requested_at desc);

create trigger access_requests_set_updated_at
  before update on public.access_requests
  for each row execute function public.set_updated_at();
