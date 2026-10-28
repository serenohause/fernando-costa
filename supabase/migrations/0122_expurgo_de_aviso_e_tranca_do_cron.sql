-- O modulo de notificacoes ganha caminho de limpeza, e o pg_cron perde os
-- privilegios que ele concede de fabrica.
--
-- Achados M2, M3 e B6 da auditoria do modulo. Nenhum critico, nenhum alto; estes
-- sao os dois buracos que valia fechar antes de o modulo ir ao ar.
--
-- ============================================================================
-- PARTE 1: EXPURGO (M2 e M3)
-- ============================================================================
--
-- A 0120 e a 0121 nao dao DELETE a ninguem logado, de proposito: ninguem apaga o
-- proprio historico de avisos. A consequencia e que o modulo subia SEM NENHUM
-- caminho de limpeza escrito, e aviso e linha que guarda COPIA de texto livre.
--
-- Os tres casos que chegam na pratica:
--
--   1. Tarefa criada com o titulo errado, e o titulo carrega dado pessoal
--      ("Fulano CPF 000... laudo medico"). Renomear a tarefa limpa a tarefa; o
--      sino de quem recebeu continua mostrando a frase antiga, para sempre.
--      Pedido de apagamento nao tem por onde ser atendido.
--   2. Quem tem `can_edit_menu('project_flow')` escreve `responsible_id`, e o
--      gatilho avisa a cada MUDANCA de valor, de proposito. Um laco alternando o
--      responsavel entre duas pessoas grava centenas de avisos no sino da
--      vitima. Nao e escalacao (fica dentro do escritorio e `task_events`
--      registra quem mexeu), mas e irreversivel pela aplicacao.
--   3. Retencao. Aviso lido de um ano atras nao serve a ninguem e so faz a
--      tabela crescer.
--
-- POR QUE FUNCAO, E NAO POLICY DE DELETE: policy daria o apagamento a QUEM
-- RECEBEU, e aviso que o destinatario apaga deixa de ser registro. O expurgo e
-- operacao de OPERADOR, com a chave de servico, igual a
-- public.grant_platform_admin (0114).
--
-- ============================================================================
-- PARTE 2: O QUE NAO DA PARA TRANCAR NO CRON, E QUEM VIGIA (B6)
-- ============================================================================
--
-- Esta parte ia ser um `revoke`. NAO DA, e a medicao e que diz:
--
--   schema cron     supabase_admin=UC/supabase_admin  postgres=U*/supabase_admin
--   cron.job        supabase_admin=arwdDxtm  =r/supabase_admin  postgres=r*
--   cron.schedule   acl nula, que para funcao significa EXECUTE para PUBLIC
--   dono de tudo    supabase_admin
--
-- Ou seja: quem concedeu a PUBLIC foi o `supabase_admin`, e migration roda como
-- `postgres`, que nao e dono. `postgres` so tem opcao de repasse sobre o que
-- recebeu, e com isso revoga o que ELE concedeu, nao o que o dono concedeu.
-- Um `revoke ... from public` aqui levanta insufficient_privilege. E
-- `revoke ... from anon, authenticated` e pior: passa VERDE e nao faz nada,
-- porque nao existe grant nominal para essas roles; o privilegio vem de PUBLIC.
--
-- A primeira versao deste arquivo fazia exatamente isso, dentro de DO/EXCEPTION.
-- Aplicada em dev, medida depois: `cron.job` continuava legivel e
-- `cron.schedule` continuava executavel para `authenticated`. Trava que nao pode
-- disparar e decoracao, entao ela saiu.
--
-- O QUE DE FATO PROTEGE HOJE, medido: PUBLIC nao tem USAGE no schema `cron`, e
-- sem usage nao da nem para nomear a funcao. Alem disso `cron.job` tem RLS por
-- `username = CURRENT_USER`, o job e de `postgres`, e o PostgREST expoe so
-- `public` e `graphql_public` (supabase/config.toml).
--
-- O RISCO, ENTAO, E UMA LINHA FUTURA: no dia em que alguem escrever
-- `grant usage on schema cron to authenticated` para um modulo de agendamento,
-- todo usuario logado passa a poder, de uma vez e sem mais nenhuma defesa,
-- chamar `cron.unschedule` e apagar a varredura de atraso, ou agendar job
-- proprio. Nao e teorico: e uma linha, e ela pareceria inofensiva na revisao.
--
-- NUNCA CONCEDA USAGE NO SCHEMA `cron` A ROLE DE APLICACAO (anon,
-- authenticated). Se um modulo futuro precisar agendar, o caminho e uma funcao
-- `security definer` em `public`, como esta migration faz com o expurgo.
--
-- E como comentario nao impede ninguem, quem vigia e o teste: os casos 7.6 e 7.7
-- de supabase/tests/notificacoes.sql afirmam que anon e authenticated NAO tem
-- usage em `cron`, e quebram no dia em que alguem conceder.

-- ---------------------------------------------------------------- expurgo ---

create or replace function public.delete_notification(p_notification_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $BODY$
declare
  v_apagou boolean;
begin
  delete from public.notifications where id = p_notification_id;
  get diagnostics v_apagou = row_count;
  return v_apagou;
end;
$BODY$;

comment on function public.delete_notification(uuid) is
  'Apaga UM aviso, pelo id. Caminho de OPERADOR, com a chave de servico: anon e authenticated nao tem EXECUTE, e nao existe policy de DELETE em notifications, entao ninguem apaga o proprio historico pela tela. Existe porque a linha guarda COPIA de texto livre (titulo da tarefa, nome do projeto) e a copia nao acompanha correcao na origem: titulo renomeado na tarefa continua antigo no sino de quem recebeu, e pedido de apagamento de dado pessoal precisava de alguma porta. Devolve false quando o id nao existia, em vez de levantar erro.';

create or replace function public.purge_notifications(
  p_before timestamptz,
  p_only_read boolean default true
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $BODY$
declare
  v_apagados integer;
begin
  if p_before is null then
    raise exception 'purge_notifications: informe a data de corte'
      using errcode = '22023';
  end if;

  delete from public.notifications
   where created_at < p_before
     and (not p_only_read or read_at is not null);

  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$BODY$;

comment on function public.purge_notifications(timestamptz, boolean) is
  'Expurgo por idade, para OPERADOR com a chave de servico. `p_only_read` nasce TRUE de proposito: o caminho seguro e o padrao, e aviso ainda nao lido e justamente o que a pessoa nao viu. Passar false alcanca tambem os nao lidos, e e o que serve para limpar enxurrada (alguem alternando o responsavel de uma tarefa em laco grava centenas de avisos no sino da vitima, e o gatilho avisa a cada mudanca de proposito). Data de corte nula levanta 22023, em vez de apagar a tabela inteira por um parametro esquecido. Devolve quantos saiu.';

revoke all on function public.delete_notification(uuid) from public, anon, authenticated;
revoke all on function public.purge_notifications(timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.delete_notification(uuid) to service_role;
grant execute on function public.purge_notifications(timestamptz, boolean) to service_role;

-- Sem DDL na parte 2, e de proposito: ver o cabecalho. Nao ha o que esta
-- migration consiga revogar, e o invariante que importa vive no teste.
