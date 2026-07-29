-- Modulo 1 (Fundacao) - RLS de access_requests.
--
-- Matriz de docs/SCHEMA-PLAN.md:
--   le: Diretor e Administrativo | escreve: so service_role (via edge function)
--
-- Esta e a tabela mais delicada da fundacao, porque o dado dela e sobre gente
-- que ainda NAO tem acesso: nome, e-mail e quantas vezes tentou entrar. E, ao
-- mesmo tempo, e a tabela que mais tenta ser gravada de fora - o solicitante
-- nao tem claim tenant_id no JWT, entao nao existe policy de INSERT capaz de
-- decidir o tenant dele. Quem decide e a edge function
-- register-access-request, que resolve o tenant pelo dominio do e-mail em
-- tenant_email_domains e grava com service_role.
--
-- Por isso aqui ha policy de SELECT e mais nada. Nao e omissao: com RLS
-- ligada, comando sem policy e negado. Se um dia aparecer necessidade de
-- INSERT pelo cliente, a resposta certa continua sendo a edge function - o
-- tenant tem que ser deduzido server-side, nunca aceito do corpo do request.
--
-- Antes desta migration a tabela estava com GRANT ALL para anon e sem RLS:
-- qualquer um com a chave publicavel podia inundar a fila de aprovacao com
-- solicitacoes falsas, ou ler a fila inteira e descobrir quem trabalha (ou
-- tentou trabalhar) no escritorio.

alter table public.access_requests enable row level security;

grant select on table public.access_requests to authenticated;

create policy access_requests_select_manager
  on public.access_requests
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_tenant_manager())
  );

comment on policy access_requests_select_manager on public.access_requests is
  'A fila de aprovacao e da tela Controle de Acesso, que so Diretor e Administrativo abrem. Um Arquiteto do mesmo escritorio nao le nada aqui - e-mail de terceiro que nem entrou no sistema nao e dado de equipe.';

comment on table public.access_requests is
  'Solicitacao de acesso ao escritorio. Criada pela edge function register-access-request (service_role), que resolve o tenant pelo dominio do e-mail em tenant_email_domains - o solicitante ainda nao tem claim tenant_id no JWT e por isso nao pode escrever aqui pelo cliente. RLS: leitura so para Diretor/Administrativo do proprio tenant; INSERT, UPDATE e DELETE nao tem policy alguma e portanto sao negados a qualquer papel que nao seja service_role (aprovar/recusar passa por approve-access-request).';
