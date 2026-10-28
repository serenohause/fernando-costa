-- Escrever no Diario do Projeto passa a ser de qualquer colaborador em
-- atividade. APAGAR fica onde estava.
--
-- O PEDIDO
--   "O que nos queremos e que todos os colaboradores possam ter acesso a
--   registrar visita a obra."
--
--   Perguntado sobre o alcance, o usuario separou as duas coisas: criar e editar
--   para qualquer colaborador ativo, apagar continua restrito a quem tem edicao
--   no Fluxo do Projeto. A frase dele e o desenho inteiro: diario de obra e
--   registro, todo mundo escreve, nem todo mundo apaga.
--
-- A TERCEIRA REGRA DESTA FUNCAO, e as duas anteriores explicam esta
--   0070  `auth_collaborator_role() in ('director', 'coordinator')`. Porte
--         literal do canEdit() do base44, que decide por CARGO. A matriz de
--         permissao do escritorio nao era consultada.
--   0107  `can_edit_menu('project_flow')`, a pedido do escritorio ("todos os
--         usuarios podem ter acesso ao diario do projeto, desde que tenham
--         acesso ao modulo que aparece isso"). O eixo saiu de cargo e virou
--         permissao de menu, e o diario entrou no padrao do resto do sistema.
--   0123  colaborador ativo. O eixo da ESCRITA deixa de ser permissao e passa a
--         ser vinculo: quem trabalha no escritorio registra o que viu na obra.
--
--   O que a 0107 nao previu: `can_edit_menu('project_flow')` nao governa so o
--   diario. Ela governa tambem criar, editar e APAGAR tarefa do quadro, e os
--   objetivos do checklist. Conceder esse menu ao financeiro so para ele
--   registrar uma visita daria junto o poder de apagar tarefa. E por isso que a
--   regra se parte em duas aqui, em vez de a matriz de permissao ganhar mais
--   uma linha por pessoa.
--
-- O QUE NAO MUDA
--   A LEITURA. Ja era de qualquer colaborador ativo
--   (`*_select_active_collaborator`), e nenhuma policy de SELECT e tocada.
--   O EVENTO AUTOMATICO. `record_project_diary_event` continua conferindo
--   can_edit_menu('project_flow') por dentro, e isso e proposital: evento de
--   sistema nasce de um gesto no Fluxo do Projeto, e quem nao mexe no fluxo nao
--   gera nenhum. Os dois caminhos de escrita, que a 0107 tinha feito convergir,
--   voltam a ser regras diferentes - o manual alarga, o automatico nao.
--   O FILTRO DE ESCRITORIO. Cada policy continua comparando tenant_id com o
--   claim do JWT por conta propria; nenhuma das duas funcoes abaixo dispensa
--   isso.
--   O FILTRO DE STATUS. Quem esta em Ferias ou Afastado continua de fora, agora
--   por is_active_collaborator() em vez de auth_collaborator_id().
--
-- A ORDEM DESTE ARQUIVO E PARTE DA REGRA
--   A funcao do apagar nasce primeiro; as policies de DELETE passam a chama-la
--   em seguida; e so entao o corpo de is_project_diary_writer() alarga. Na ordem
--   inversa existiria um instante em que as policies de DELETE ja leriam
--   "qualquer colaborador ativo" - a tranca do apagar inteira aberta. A migration
--   roda dentro de uma transacao e ninguem veria esse instante; a ordem esta
--   escrita assim mesmo assim porque o invariante precisa estar visivel para
--   quem reler isto, e nao depender de uma propriedade do jeito de aplicar.
--
-- ALCANCE
--   Trocar o corpo da funcao alcanca de uma vez as 10 policies de INSERT e
--   UPDATE das cinco tabelas, mais as de INSERT e UPDATE do bucket (0071), sem
--   reescrever nenhuma delas - o mesmo movimento da 0107, pelo mesmo motivo: a
--   regra mora num lugar so.
--
--   As que precisam ser reescritas sao as de DELETE, e sao SEIS, nao cinco: as
--   cinco das tabelas MAIS a do bucket `project-diary-files`. Deixar a do bucket
--   de fora abriria exatamente o buraco que esta migration existe para nao
--   abrir: o colaborador nao apagaria a linha de project_diary_files e apagaria
--   o OBJETO que ela aponta, e a tela passaria a listar anexo que nao abre.
--
-- O NOME DAS SEIS POLICIES MUDA
--   De `*_delete_diary_writer` para `*_delete_flow_editor`. Policy de DELETE
--   chamada "diary_writer" que nao chama mais is_project_diary_writer() e um
--   nome que mente, e nome que mente em catalogo de RLS custa caro na proxima
--   auditoria - mais caro do que o churn de renomear seis linhas agora.
--
-- TESTE
--   supabase/tests/diario-rls.sql (npm run test:rls:diario) nasce com esta
--   migration: ate hoje o diario tinha teste de schema e nenhum de isolamento.

-- 1. A funcao do APAGAR, com a regra de hoje --------------------------------
--
-- Nasce ANTES das policies que a usam, e com o corpo que is_project_diary_writer()
-- tinha ate aqui. A regra nao mudou; mudou o alcance dela.

create or replace function public.can_delete_project_diary()
returns boolean
language sql
stable
security definer
set search_path = ''
as $BODY$
  select public.can_edit_menu('project_flow')
$BODY$;

comment on function public.can_delete_project_diary is
  'DECIDE: quem APAGA no Diario do Projeto - quem edita o menu project_flow, seja pelo atalho de Diretor que can_edit_menu tem, seja por can_edit gravado na matriz de permissao. Vale para as cinco tabelas do modulo 11 e para o bucket project-diary-files. NAO DECIDE: quem escreve (is_project_diary_writer, que desde a 0123 e qualquer colaborador ativo), quem le (is_active_collaborator, desde a 0070), nem o evento automatico (record_project_diary_event confere can_edit_menu por dentro, e segue conferindo). NAO dispensa o filtro de escritorio: cada policy compara tenant_id com o claim do JWT por conta propria. Status e escritorio ja vem embutidos, porque can_edit_menu depende de auth_collaborator_id(), que exige status active no tenant do JWT - Diretor Afastado nao apaga. Corpo identico ao que is_project_diary_writer() teve entre a 0107 e a 0123.';

revoke all on function public.can_delete_project_diary() from public, anon;
grant execute on function public.can_delete_project_diary() to authenticated, service_role;

-- 2. As seis policies de DELETE, antes de a outra funcao alargar -------------

drop policy project_diary_entries_delete_diary_writer on public.project_diary_entries;

create policy project_diary_entries_delete_flow_editor
  on public.project_diary_entries
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_delete_project_diary())
  );

comment on policy project_diary_entries_delete_flow_editor on public.project_diary_entries is
  'Apagar registro do diario exige edicao no Fluxo do Projeto, que era a regra de escrever ate a 0123. Escrever alargou para qualquer colaborador ativo; apagar nao, porque registro de obra apagado nao volta e porque a linha do tempo e o que o escritorio mostra ao cliente. Vale tambem para registro automatico, de proposito (ver a 0070): a tela do original apenas esconde o botao, e virar isso policy criaria linha que ninguem no escritorio remove nunca. Os arquivos anexados vao junto por ON DELETE CASCADE; o objeto no Storage NAO vai, e depende da policy de DELETE do bucket, que carrega a mesma regra.';

drop policy project_site_visits_delete_diary_writer on public.project_site_visits;

create policy project_site_visits_delete_flow_editor
  on public.project_site_visits
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_delete_project_diary())
  );

comment on policy project_site_visits_delete_flow_editor on public.project_site_visits is
  'A visita e o caso que originou a 0123: registrar passou a ser de qualquer colaborador ativo, e APAGAR ficou aqui, com quem edita o Fluxo do Projeto. Nem o autor apaga a propria visita - a policy nao olha quem criou, de proposito: "so o autor apaga" daria a cada pessoa o poder de sumir com o que ela mesma registrou, que e o oposto do que um diario de obra serve. Quem registrou errado corrige pelo UPDATE, que continua largo.';

drop policy project_issues_delete_diary_writer on public.project_issues;

create policy project_issues_delete_flow_editor
  on public.project_issues
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_delete_project_diary())
  );

comment on policy project_issues_delete_flow_editor on public.project_issues is
  'Apagar pendencia exige edicao no Fluxo do Projeto. Na pratica a tela nao oferece o botao a ninguem: pendencia se resolve ou se cancela, e isso e UPDATE, que qualquer colaborador ativo faz desde a 0123. A policy existe para o caminho de correcao (pendencia aberta por engano) e para nao deixar a tabela sem policy de DELETE - sem ela, o par GRANT/RLS da "permission denied" em vez de uma recusa que alguem consiga ler. O historico vai junto por ON DELETE CASCADE.';

drop policy project_issue_events_delete_diary_writer on public.project_issue_events;

create policy project_issue_events_delete_flow_editor
  on public.project_issue_events
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_delete_project_diary())
  );

comment on policy project_issue_events_delete_flow_editor on public.project_issue_events is
  'Apagar linha do historico da pendencia exige edicao no Fluxo do Projeto. E a mais restritiva das seis na intencao: historico escrito por trigger (0069/0072) nao deveria ser apagado a mao por ninguem, e a unica razao de a policy existir e nao deixar a tabela com GRANT e sem policy. Quem escreve no historico de verdade e o trigger, que e SECURITY DEFINER e nao passa por aqui.';

drop policy project_diary_files_delete_diary_writer on public.project_diary_files;

create policy project_diary_files_delete_flow_editor
  on public.project_diary_files
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_delete_project_diary())
  );

comment on policy project_diary_files_delete_flow_editor on public.project_diary_files is
  'Apagar o anexo exige edicao no Fluxo do Projeto, igual a entrada que o carrega. Anexar passou a ser de qualquer colaborador ativo (0123); remover o que ja esta anexado, nao. Esta policy e a metade de banco de uma remocao: o objeto no bucket depende de diary_files_delete_flow_editor em storage.objects, e as duas carregam a MESMA funcao justamente para nao divergirem - metade da remocao autorizada deixa linha sem arquivo ou arquivo sem linha.';

drop policy diary_files_delete_diary_writer on storage.objects;

create policy diary_files_delete_flow_editor
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-diary-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_delete_project_diary())
  );

comment on policy diary_files_delete_flow_editor on storage.objects is
  'A SEXTA policy de DELETE do modulo, e a que nao esta em public. Remover o objeto do bucket exige edicao no Fluxo do Projeto e a pasta do proprio escritorio (primeiro segmento do caminho). Entrou na 0123 junto com as cinco das tabelas: o bucket le as mesmas funcoes que elas (0071), entao alargar is_project_diary_writer() sem reescrever esta policy deixaria qualquer colaborador ativo apagar o ARQUIVO sem conseguir apagar a linha que o aponta. Enviar e substituir arquivo continuam em is_project_diary_writer(), e portanto alargaram - anexar foto da obra e o gesto que a 0123 quis liberar.';

-- 3. So agora a escrita alarga ------------------------------------------------
--
-- Com as seis policies de DELETE ja presas a can_delete_project_diary(), esta
-- troca alcanca apenas INSERT e UPDATE - as 10 policies das cinco tabelas e as
-- duas do bucket.

create or replace function public.is_project_diary_writer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $BODY$
  select public.is_active_collaborator()
$BODY$;

comment on function public.is_project_diary_writer is
  'DECIDE: quem ESCREVE no Diario do Projeto - qualquer colaborador com status active no escritorio do JWT (0123), a pedido do usuario ("todos os colaboradores possam ter acesso a registrar visita a obra"). Vale para o INSERT e o UPDATE das cinco tabelas do modulo 11 e para enviar/substituir arquivo no bucket project-diary-files. NAO DECIDE: o APAGAR, que ficou com can_delete_project_diary() e continua exigindo can_edit_menu(project_flow); a LEITURA, que sempre foi de is_active_collaborator() direto na policy de SELECT e nunca passou por aqui; o EVENTO AUTOMATICO, que record_project_diary_event autoriza por dentro com can_edit_menu(project_flow). NAO dispensa o filtro de escritorio nem o de autoria: cada policy compara tenant_id com o claim do JWT, e nenhuma pergunta quem criou a linha. Hoje e um alias de is_active_collaborator(), e o nome proprio continua existindo para que cada policy do modulo diga QUAL regra esta lendo - foi o que permitiu trocar a regra tres vezes (cargo na 0070, menu na 0107, vinculo na 0123) sem reescrever policy de INSERT ou UPDATE nenhuma.';
