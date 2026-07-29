-- Modulo 1 (Fundacao) - extensoes, convencoes de enum e trigger de updated_at.
--
-- Convencao de enums do projeto (vale para todos os modulos):
--   1. O valor gravado e sempre em ingles; o rotulo em portugues vive na UI
--      (src/lib/enums.ts). Trocar o texto da tela nunca invalida dado gravado.
--   2. O de/para base44 -> Postgres esta em docs/ENUM-MAP.md e e a fonte da
--      verdade da importacao. Valor que chegar da importacao e nao estiver la
--      derruba a linha para o relatorio de pendencias; nunca vira 'other'.
--   3. Estado DERIVADO nao vira valor de enum. O caso canonico e o financeiro:
--      "Em atraso" existe como rotulo na tela, mas nao existe no enum
--      financial_status (modulo 7). "Em atraso" e apenas
--      `status = 'forecast' and due_date < current_date` - calculado na leitura.
--      Gravar esse estado exigiria um job diario e, no minuto em que o job
--      falhasse, o banco passaria a mentir sobre a inadimplencia.

-- Registrado no proprio banco, e nao so na doc, para quem abrir o schema pelo
-- psql/Studio achar a convencao sem precisar do repositorio. Vai dentro de um
-- DO porque em projeto hospedado o schema public nem sempre pertence ao papel
-- que aplica a migration - e perder o comentario nao pode derrubar o push.
do $$
begin
  comment on schema public is
    'Backoffice Fernando Costa Arquitetura. Multitenant por linha (tenant_id), com o tenant_id do usuario vindo de claim no JWT. Convencao de enum: valor em ingles conforme docs/ENUM-MAP.md, rotulo em portugues so na UI, e estado derivado nunca vira valor de enum - "Em atraso" do financeiro e status forecast com vencimento no passado, calculado na leitura, nao gravado.';
exception when insufficient_privilege then
  raise notice 'Sem privilegio para comentar o schema public; convencao segue em docs/SCHEMA-PLAN.md.';
end
$$;

create schema if not exists extensions;

-- citext cobre e-mail e dominio: comparacao case-insensitive sem lower()
-- espalhado por query e por indice. Instaladas em "extensions" (nunca em
-- public, por recomendacao do Supabase); os tipos aparecem qualificados como
-- extensions.citext nas migrations, para nao depender do search_path de quem
-- aplica. Cuidado herdado: citext torna a igualdade case-insensitive, mas nao
-- os operadores de regex - check de formato sobre citext usa ~*, nao ~.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Enums da fundacao. Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md.

create type public.tenant_status as enum ('active', 'suspended');

create type public.tenant_role as enum ('owner', 'member');

create type public.collaborator_role as enum (
  'director',
  'coordinator',
  'admin_staff',
  'finance',
  'architect',
  'intern'
);

create type public.collaborator_area as enum (
  'commercial',
  'projects',
  'operations',
  'administrative',
  'finance'
);

create type public.collaborator_status as enum ('active', 'vacation', 'on_leave');

create type public.access_request_status as enum ('pending', 'approved', 'rejected');

comment on type public.tenant_status is 'Status do escritorio na plataforma. Nao tem relacao com status de colaborador.';
comment on type public.tenant_role is 'Papel de plataforma (owner/member), grosso, usado so para controle de acesso ao tenant. A funcao de negocio (Diretor, Coordenador, Arquiteto...) vive em collaborators.role e nao deve ser fundida com esta.';
comment on type public.collaborator_role is 'Funcao de negocio dentro do escritorio. De/para: director=Diretor, coordinator=Coordenador, admin_staff=Administrativo, finance=Financeiro, architect=Arquiteto, intern=Estagiario.';
comment on type public.collaborator_area is 'Area do colaborador. De/para: commercial=Comercial, projects=Projetos, operations=Operacional, administrative=Administrativo, finance=Financeiro.';
comment on type public.collaborator_status is 'De/para: active=Ativo, vacation=Ferias, on_leave=Afastado. Apenas active enxerga dado do sistema (ver public.is_active_collaborator()).';
comment on type public.access_request_status is 'De/para: pending=Pendente, approved=Aprovada, rejected=Recusada.';

-- Trigger compartilhado de updated_at. Toda tabela com updated_at usa este.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE compartilhado: mantem updated_at coerente no banco, para o valor nao depender de o cliente lembrar de mandar.';
