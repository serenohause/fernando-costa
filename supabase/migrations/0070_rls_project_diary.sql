-- Modulo 11 (Diario do Projeto) - RLS das cinco tabelas da 0069, e a UNICA
-- excecao de permissao do sistema inteiro.
--
-- ================================================================
-- A EXCECAO: POR QUE ELA EXISTE, QUEM E O DONO DELA E ONDE ELA PARA
-- ================================================================
--
-- Todo modulo deste projeto tem a mesma forma: le quem e colaborador active do
-- escritorio; escreve quem tem can_edit no menu da tela. O modulo 11 e o
-- primeiro que foge disso, e foge por decisao do usuario: "mantem o fluxo como
-- veio". Na versao nova do base44 o diario NAO consulta permissao de menu em
-- lugar nenhum - as quatro telas do modulo perguntam a FUNCAO da pessoa
-- (ProjectDiaryDrawer.jsx:133, ObraTab.jsx:132, PendenciasTab.jsx:107):
--
--     canEdit = role === 'admin' || role === 'Diretor' || role === 'Coordenador'
--
-- Ou seja: so Diretor e Coordenador escrevem no diario. O 'admin' daquela
-- expressao e papel de PLATAFORMA do base44, cujo equivalente aqui e o
-- service_role, que nao passa por policy nenhuma - mesma leitura ja registrada
-- na 0012.
--
-- O PROBLEMA QUE ISSO CRIA, E ELE E SILENCIOSO
--   Os eventos automaticos do diario (mudanca de etapa, troca de responsavel,
--   tag ligada e desligada) nascem DENTRO de escritas que outra pessoa faz. Quem
--   arrasta cartao no Fluxo do Projeto e quem tem can_edit_menu('project_flow'),
--   e no escritorio real sao SETE Arquitetos. Se a policy de INSERT do diario
--   exigisse Diretor/Coordenador, o arraste do Arquiteto continuaria funcionando
--   (a tarefa muda de coluna) e o registro no diario seria recusado - o diario
--   ficaria com buracos exatamente nas acoes mais frequentes, e ninguem
--   perceberia, porque o original ja engole o erro em silencio
--   (diaryAutoEvents.js:32-35 faz console.error e segue).
--
-- A SAIDA, E ELA E A MESMA DA 0044
--   public.record_project_diary_event e SECURITY DEFINER e confere POR DENTRO a
--   permissao do FLUXO - can_edit_menu('project_flow') -, e nao a do diario.
--   Mesmo desenho de generate_contract_installments (0044) e de
--   mark_negotiation_won (0067): a funcao escreve numa tabela cuja policy
--   recusaria quem a chamou, e por isso a autorizacao e conferida dentro dela,
--   com o tenant lido do JWT.
--
--   O LIMITE DA EXCECAO, e ele e estreito de proposito: pela funcao so nasce
--   entrada AUTOMATICA (is_automatic verdadeiro, entry_type system), no projeto
--   do proprio escritorio. Registro manual, visita, pendencia e arquivo
--   continuam exigindo Diretor ou Coordenador. E a policy de INSERT de
--   project_diary_entries RECUSA is_automatic verdadeiro, o que fecha o outro
--   lado: nem mesmo um Diretor forja evento de sistema pela API. Os dois
--   caminhos sao disjuntos, e cada um so faz o que o outro nao faz.
--
--   DONO: quem move cartao no Fluxo do Projeto. A permissao que abre a excecao e
--   project_flow, e nao uma permissao nova; quem nao pode mexer na tarefa
--   tambem nao registra o evento dela.
--
-- LEITURA LARGA, PELA QUARTA VEZ
--   Qualquer colaborador active do escritorio le o diario inteiro - inclusive
--   anotacao marcada como interna e foto de obra da residencia do cliente.
--   Mesma decisao ja aceita no financeiro (modulo 7), no orcamento (modulo 8) e
--   no mapa (modulo 9), e coerente com o original, que nao checa permissao de
--   leitura em tela nenhuma. Fica registrado em docs/ARCHITECTURE.md junto das
--   outras tres. Se o escritorio quiser apertar, o lugar sao as policies de
--   SELECT desta migration MAIS a policy de SELECT do bucket (0071) - mexer so
--   numa das duas cria uma tela que lista o anexo e nao abre.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS
-- sem GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela
-- inteira para a chave publicavel. anon NAO recebe nada - nenhuma tela deste
-- modulo e publica.
--
-- Toda chamada de helper vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha - a gaveta carrega diario, visitas, pendencias e arquivos de uma vez.

-- O helper de escrita ----------------------------------------------------------

create or replace function public.is_project_diary_writer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_collaborator_role() in ('director', 'coordinator');
$$;

comment on function public.is_project_diary_writer() is
  'Quem escreve no diario do projeto A MAO: Diretor e Coordenador, exatamente a expressao canEdit das quatro telas do modulo na versao nova do base44 (ProjectDiaryDrawer.jsx:133). E o UNICO recorte de escrita do sistema que nao passa por can_edit_menu, e isso e decisao do usuario ("mantem o fluxo como veio") - por isso o helper tem nome proprio, para que a excecao apareca em toda policy que a usa em vez de ficar diluida numa expressao repetida. Ja embute os filtros de status active e de tenant, porque auth_collaborator_role() embute: Diretor em Ferias ou Afastado nao escreve. Retorna null (nao false) quando nao ha colaborador - em policy null e tratado como falso, que e o resultado desejado. NAO cobre o evento automatico: esse nasce por public.record_project_diary_event, que confere can_edit_menu(project_flow).';

revoke all on function public.is_project_diary_writer() from public, anon;
grant execute on function public.is_project_diary_writer() to authenticated, service_role;

-- project_diary_entries ---------------------------------------------------------

alter table public.project_diary_entries enable row level security;

grant select, insert, update, delete on table public.project_diary_entries to authenticated;

create policy project_diary_entries_select_active_collaborator
  on public.project_diary_entries
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_diary_entries_select_active_collaborator on public.project_diary_entries is
  'Leitura larga, como em todo modulo desde a 0017: qualquer colaborador active do escritorio, sem exigir permissao de menu. E o que o original faz - a gaveta do diario carrega a linha do tempo inteira para quem abre o cartao, e so os BOTOES de escrever somem para quem nao e Diretor ou Coordenador. Inclui a anotacao marcada como interna: visibility recorta o RELATORIO para o cliente, nunca o acesso de quem trabalha no escritorio.';

create policy project_diary_entries_insert_diary_writer
  on public.project_diary_entries
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
    and not is_automatic
  );

comment on policy project_diary_entries_insert_diary_writer on public.project_diary_entries is
  'Registro MANUAL, por Diretor ou Coordenador - ver a excecao explicada no cabecalho desta migration. Duas metades: WITH CHECK amarra tenant_id ao claim do JWT (sem isso, quem escreve no proprio escritorio criaria registro dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST), e "not is_automatic" fecha o caminho de forjar evento de sistema pela API. Evento automatico entra SO por public.record_project_diary_event, que confere can_edit_menu(project_flow) por dentro - e por isso o Arquiteto que arrasta o cartao continua registrando no diario sem poder escrever nele a mao.';

create policy project_diary_entries_update_diary_writer
  on public.project_diary_entries
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
    and not is_automatic
  );

comment on policy project_diary_entries_update_diary_writer on public.project_diary_entries is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Sem o segundo, a linha seria empurrada para outro escritorio por UPDATE. O "not is_automatic" no WITH CHECK tem duas consequencias, as duas desejadas: registro de sistema nao e editavel a mao (a tela do original tambem esconde o lapis dele, ProjectDiaryDrawer.jsx:328), e registro manual nao pode ser PROMOVIDO a automatico depois de criado - sem isso, a recusa do INSERT seria contornavel em dois passos. USING nao filtra is_automatic de proposito: assim a tentativa recebe 42501 em vez de "zero linhas afetadas", que e silencio.';

create policy project_diary_entries_delete_diary_writer
  on public.project_diary_entries
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

comment on policy project_diary_entries_delete_diary_writer on public.project_diary_entries is
  'Apagar registro exige a mesma permissao de escrever. Vale tambem para registro automatico, de proposito: a tela do original apenas esconde o botao, e transformar isso em policy criaria uma linha que ninguem no escritorio consegue remover nunca - inclusive uma escrita errada de um evento de sistema. Os arquivos anexados vao junto por ON DELETE CASCADE; o objeto no Storage NAO vai (ver o COMMENT de project_diary_files).';

-- project_site_visits -----------------------------------------------------------

alter table public.project_site_visits enable row level security;

grant select, insert, update, delete on table public.project_site_visits to authenticated;

create policy project_site_visits_select_active_collaborator
  on public.project_site_visits
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_site_visits_select_active_collaborator on public.project_site_visits is
  'Mesmo recorte de leitura das entradas do diario: a aba Obra e visivel para quem abre o cartao, e so os botoes de registrar e editar somem.';

create policy project_site_visits_insert_diary_writer
  on public.project_site_visits
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

comment on policy project_site_visits_insert_diary_writer on public.project_site_visits is
  'Registrar visita e gesto de Diretor ou Coordenador (ObraTab.jsx:191 exige canEdit). Nao ha caminho automatico aqui: a visita e sempre digitada por alguem, e o evento de diario que ela gera e que passa pela funcao SECURITY DEFINER.';

create policy project_site_visits_update_diary_writer
  on public.project_site_visits
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

create policy project_site_visits_delete_diary_writer
  on public.project_site_visits
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

comment on policy project_site_visits_delete_diary_writer on public.project_site_visits is
  'Apagar visita exige a mesma permissao de registra-la. As pendencias que ela revelou NAO vao junto (FK com ON DELETE SET NULL): pendencia de obra continua existindo depois que o registro da visita some.';

-- project_issues ----------------------------------------------------------------

alter table public.project_issues enable row level security;

grant select, insert, update, delete on table public.project_issues to authenticated;

create policy project_issues_select_active_collaborator
  on public.project_issues
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_issues_select_active_collaborator on public.project_issues is
  'Leitura larga, como no resto do modulo. A aba Pendencias e os indicadores da aba Obra (abertas, em andamento, resolvidas) contam daqui, e sao mostrados a quem abre o cartao.';

create policy project_issues_insert_diary_writer
  on public.project_issues
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

create policy project_issues_update_diary_writer
  on public.project_issues
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

comment on policy project_issues_update_diary_writer on public.project_issues is
  'Cobre tambem o botao de resolver, que e UPDATE de status mais data e autor da resolucao (PendenciasTab.jsx:86). Cada UPDATE que passa por aqui gera uma linha em project_issue_events pelo trigger, e o trigger e SECURITY DEFINER: o historico nao depende da policy da tabela filha.';

create policy project_issues_delete_diary_writer
  on public.project_issues
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

-- project_issue_events ----------------------------------------------------------
--
-- As quatro policies existem porque o padrao deste projeto exige os quatro
-- comandos declarados - tabela com GRANT e sem policy e uma porta que ninguem
-- lembra de conferir depois (invariante A4 de pattern-invariants.sql). Na
-- pratica quem escreve aqui e o trigger, que e SECURITY DEFINER e nao passa por
-- policy nenhuma.

alter table public.project_issue_events enable row level security;

grant select, insert, update, delete on table public.project_issue_events to authenticated;

create policy project_issue_events_select_active_collaborator
  on public.project_issue_events
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_issue_events_select_active_collaborator on public.project_issue_events is
  'Mesmo recorte de leitura da pendencia: no original o historico E um campo dentro dela, e quem le a pendencia ja le o historico. Fechar mais aqui esconderia parte do cartao sem esconder o cartao.';

create policy project_issue_events_insert_diary_writer
  on public.project_issue_events
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

comment on policy project_issue_events_insert_diary_writer on public.project_issue_events is
  'Escrita direta de evento de historico, para o caso que o trigger nao cobre (uma anotacao com texto proprio). Mesma permissao da pendencia. O trigger project_issues_log_event NAO depende desta policy: e SECURITY DEFINER, de proposito - o registro do que aconteceu com a pendencia e consequencia da escrita, nao um segundo gesto que possa ser negado pela metade.';

create policy project_issue_events_update_diary_writer
  on public.project_issue_events
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

create policy project_issue_events_delete_diary_writer
  on public.project_issue_events
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

-- project_diary_files -----------------------------------------------------------

alter table public.project_diary_files enable row level security;

grant select, insert, update, delete on table public.project_diary_files to authenticated;

create policy project_diary_files_select_active_collaborator
  on public.project_diary_files
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy project_diary_files_select_active_collaborator on public.project_diary_files is
  'A linha do banco guarda o CAMINHO do objeto; quem autoriza abrir o arquivo e a policy de SELECT do bucket (0071), com o mesmo recorte. As duas precisam concordar: apertar so uma cria uma tela que lista o anexo e nao abre, ou o contrario.';

create policy project_diary_files_insert_diary_writer
  on public.project_diary_files
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

create policy project_diary_files_update_diary_writer
  on public.project_diary_files
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

create policy project_diary_files_delete_diary_writer
  on public.project_diary_files
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_project_diary_writer())
  );

comment on policy project_diary_files_delete_diary_writer on public.project_diary_files is
  'Apagar a linha exige a mesma permissao de anexar. Quem apaga a linha precisa apagar o objeto do bucket tambem: nao ha cascade entre banco e Storage - mesma pendencia declarada na 0052 e no COMMENT de project_diary_files.';

-- A gravacao automatica --------------------------------------------------------
--
-- Ver a secao "A EXCECAO" no cabecalho: e esta funcao que permite ao Arquiteto
-- que arrasta um cartao registrar o evento num diario onde ele nao escreve a
-- mao. Sem ela, a decisao de permissao do usuario (so Diretor e Coordenador
-- escrevem) produziria um diario com buracos nas acoes mais frequentes, e o
-- buraco seria silencioso.
--
-- O QUE ELA NAO FAZ, E E DECISAO REGISTRADA
--   Nao monta o titulo nem a descricao. O rotulo em portugues de fase, de tag e
--   de pessoa vive na UI (src/lib/enums.ts), como em todo enum deste projeto -
--   montar a frase aqui poria copy de tela dentro do banco. O que o banco guarda
--   e o FATO, em coluna: system_event, from_phase, to_phase, operational_tag.
--
--   Nao inventa event_key. Quem conhece a unidade de trabalho e o hook que move
--   o cartao. A regra vale: a chave e DERIVADA DO FATO (o que mudou, em qual
--   tarefa, de onde para onde) e nunca do relogio - foi o relogio que fez a
--   "idempotencia" do original nunca deduplicar nada (defeito 5). Onde nao ha
--   fato repetivel, como o log de geracao de relatorio, a chave vai NULA em vez
--   de fingir: nulo nao colide com nulo em indice unico, e duas geracoes de
--   relatorio sao dois fatos.
--
--   Nao decide a data pelo relogio do servidor quando o chamador informa. O
--   banco roda em UTC e a pessoa nao: as 21h de Goiania ja e o dia seguinte em
--   UTC, e o agrupamento por dia da gaveta mostraria o evento no dia errado. O
--   original usa o relogio do NAVEGADOR (diaryAutoEvents.js:28), e por isso data
--   e hora sao parametro. current_date so entra como ultimo recurso.

create or replace function public.record_project_diary_event(
  p_project_id uuid,
  p_system_event public.diary_system_event,
  p_title text,
  p_description text default null,
  p_event_key text default null,
  p_from_phase public.project_phase default null,
  p_to_phase public.project_phase default null,
  p_operational_tag public.operational_tag default null,
  p_responsible_id uuid default null,
  p_occurrence_date date default null,
  p_occurrence_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_collaborator_id uuid;
  v_entry_id uuid;
begin
  v_tenant_id := public.auth_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- A permissao do FLUXO, e nao a do diario. Conferida ANTES de qualquer leitura
  -- de projeto: quem nao pode mexer no fluxo tambem nao precisa descobrir, pela
  -- mensagem de erro, se um determinado id de projeto existe.
  if not public.can_edit_menu('project_flow') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_system_event is null then
    raise exception 'system_event_required' using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'title_required' using errcode = 'P0001';
  end if;

  -- tenant_id explicito porque SECURITY DEFINER nao passa pela RLS de projects.
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.tenant_id = v_tenant_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;

  v_collaborator_id := public.auth_collaborator_id();

  -- A deduplicacao vem do INDICE, e nao de uma consulta previa. Consultar e
  -- depois gravar nao impede nada: dois cliques rapidos, ou duas abas, passam os
  -- dois pelo teste e gravam os dois - foi exatamente o que a "idempotencia" do
  -- original fez (diaryAutoEvents.js:13). Chave nula nunca conflita, e e assim
  -- que o evento sem fato repetivel entra sempre.
  insert into public.project_diary_entries (
    tenant_id, project_id, entry_type, title, description,
    occurrence_date, occurrence_time, status, visibility,
    is_automatic, event_key, system_event,
    from_phase, to_phase, operational_tag,
    responsible_id, created_by_id
  ) values (
    v_tenant_id, p_project_id, 'system', p_title, p_description,
    coalesce(p_occurrence_date, current_date), p_occurrence_time,
    'completed', 'internal',
    true, p_event_key, p_system_event,
    p_from_phase, p_to_phase, p_operational_tag,
    p_responsible_id, v_collaborator_id
  )
  on conflict on constraint project_diary_entries_tenant_id_event_key_key
    do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select e.id into v_entry_id
    from public.project_diary_entries e
    where e.tenant_id = v_tenant_id
      and e.event_key = p_event_key;

    return jsonb_build_object(
      'outcome', 'already_recorded',
      'entryId', v_entry_id,
      'projectId', p_project_id,
      'systemEvent', p_system_event::text
    );
  end if;

  return jsonb_build_object(
    'outcome', 'recorded',
    'entryId', v_entry_id,
    'projectId', p_project_id,
    'systemEvent', p_system_event::text
  );
end;
$$;

comment on function public.record_project_diary_event(uuid, public.diary_system_event, text, text, text, public.project_phase, public.project_phase, public.operational_tag, uuid, date, time) is
  'Registra um evento AUTOMATICO no diario do projeto: entry_type system, is_automatic verdadeiro, status completed e visibility internal, com o fato em coluna (system_event, from_phase, to_phase, operational_tag) em vez de dentro do texto do titulo. Devolve jsonb com outcome recorded | already_recorded e entryId; ja existir NAO e erro. A deduplicacao e a unicidade (tenant_id, event_key) do banco, e nao consulta previa - chave nula entra sempre, para o evento que nao tem fato repetivel. SECURITY DEFINER, e ESTA E A UNICA EXCECAO DE PERMISSAO DO SISTEMA: a policy de INSERT de project_diary_entries exige Diretor ou Coordenador e recusa is_automatic, mas o evento automatico nasce dentro do arraste de cartao de um ARQUITETO - sem esta funcao, o diario perderia em silencio as acoes mais frequentes do Fluxo do Projeto. Por isso ela confere can_edit_menu(project_flow) - a permissao de quem move a tarefa - e o tenant do JWT POR DENTRO, como generate_contract_installments (0044) e mark_negotiation_won (0067). O que ela pode fazer para de pe: so entrada automatica, so no proprio escritorio, so em projeto que existe. Erros de negocio saem como P0001 com mensagem estavel: not_authorized, system_event_required, title_required, project_not_found.';

-- anon NAO executa: nenhuma tela publica escreve no diario. service_role tambem
-- nao ganha nada de util - a funcao le o tenant do JWT, e chamada sem sessao
-- autenticada morre em not_authorized. Fica de fora para nao sugerir um caminho
-- de servidor que nao existe.
revoke all on function public.record_project_diary_event(uuid, public.diary_system_event, text, text, text, public.project_phase, public.project_phase, public.operational_tag, uuid, date, time) from public, anon;
grant execute on function public.record_project_diary_event(uuid, public.diary_system_event, text, text, text, public.project_phase, public.project_phase, public.operational_tag, uuid, date, time) to authenticated;
