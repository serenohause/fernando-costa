-- Modulo 11 (Diario do Projeto) - as cinco tabelas.
--
-- DE ONDE VEM
--   Tres entidades novas do base44, que existem em nova-versao/ e nao em
--   projeto-original/ - o escritorio continuou evoluindo a plataforma depois do
--   ponto em que esta migracao comecou:
--
--     ProjectTimelineEntry  ->  project_diary_entries
--     ProjectSiteVisit      ->  project_site_visits
--     ProjectIssue          ->  project_issues
--     ProjectIssue.historico (array)                  -> project_issue_events
--     *.anexos / *.fotos / *.arquivos (tres arrays)   -> project_diary_files
--
--   Nao e feature especulativa: o escritorio ja usa. Sao 36 registros de diario
--   em 18 projetos, 5 deles anotacoes manuais que nao existem em nenhum outro
--   lugar, e que a importacao do dado real teve de deixar de fora por nao haver
--   destino (docs/IMPORT-PLAN.md, secao 7.1).
--
-- POR QUE AS CINCO NASCEM JUNTAS
--   project_diary_files tem ARCO EXCLUSIVO com FK para as tres maes. Criar duas
--   agora e a terceira depois obrigaria a mexer em constraint ja aplicada, coisa
--   que este projeto nao faz (docs/ARCHITECTURE.md, "Migration ja aplicada nao e
--   editada").
--
-- AS COLUNAS QUE EXISTEM PARA MATAR DEFEITO POR CONSTRUCAO
--   O plano lista quinze defeitos da versao nova. Seis deles deixam de ser
--   possiveis aqui, e cada um esta anotado na coluna ou na constraint que o mata:
--
--     defeito  5  event_key com unicidade REAL   (la e Date.now(), nunca dedup)
--     defeito  6  visibility vira coluna         (la o formulario coleta e a
--                                                 entidade nao tem o campo)
--     defeito  7  diary_entry_id vira FK         (la e string nunca gravada)
--     defeito  8  issue_number por trigger       (la e length + 1, duplica)
--     defeito 10  system_event/from_phase/to_phase/operational_tag em coluna
--                                                (la o relatorio deduz pelo
--                                                 texto do titulo)
--     defeito 12  historico vira tabela          (la e read-modify-write do
--                                                 cache do navegador)
--
-- O QUE NAO VIRA COLUNA, PELA REGRA DE SEMPRE
--   project_name, responsavel_name, criado_por_name, atualizado_por_name,
--   resolvida_por_name. Sao desnormalizacao do base44, que nao tem join
--   (docs/SCHEMA-PLAN.md). Viram join. Nenhum deles e retrato intencional como o
--   do cliente em contracts (0029): o diario quer o nome ATUAL da pessoa.
--
--   criado_por_id e resolvida_por_id apontam para COLABORADOR, e nao para
--   usuario do Auth como no base44 (la o valor vem de currentUser.id). E a mesma
--   escolha de todo o resto do sistema: quem responde por trabalho e colaborador,
--   e nem todo colaborador tem login.
--
-- RLS NAO EXISTE NESTAS CINCO TABELAS AINDA. A 0070 fecha - e ela tem uma
-- excecao de permissao que nenhum outro modulo tem. Ver o cabecalho de la.

-- project_diary_entries ---------------------------------------------------------

create table public.project_diary_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- required na entidade de origem.
  project_id uuid not null,
  entry_type public.diary_entry_type not null,
  title text not null,
  occurrence_date date not null,

  description text,
  occurrence_time time,
  responsible_id uuid,
  status public.diary_entry_status not null default 'in_progress',
  visibility public.diary_visibility not null default 'internal',

  is_automatic boolean not null default false,
  event_key text,
  system_event public.diary_system_event,
  from_phase public.project_phase,
  to_phase public.project_phase,
  operational_tag public.operational_tag,

  created_by_id uuid,
  updated_by_id uuid,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_diary_entries_id_tenant_id_key unique (id, tenant_id),
  constraint project_diary_entries_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  -- Defeito 5. A unicidade e a idempotencia; consulta previa nao e.
  constraint project_diary_entries_tenant_id_event_key_key unique (tenant_id, event_key),

  constraint project_diary_entries_title_not_blank_check check (btrim(title) <> ''),

  -- Os tres pares que amarram "automatico" a tudo que so vale para automatico.
  constraint project_diary_entries_system_type_matches_automatic_check
    check ((entry_type = 'system') = is_automatic),

  constraint project_diary_entries_system_event_matches_automatic_check
    check ((system_event is not null) = is_automatic),

  constraint project_diary_entries_event_key_requires_automatic_check
    check (event_key is null or is_automatic),

  -- Defeito 10: as colunas estruturadas so fazem sentido no evento que as gera.
  constraint project_diary_entries_phases_require_phase_change_check
    check ((from_phase is null and to_phase is null) or system_event = 'phase_change'),

  constraint project_diary_entries_operational_tag_requires_tag_event_check
    check (operational_tag is null or system_event in ('tag_on', 'tag_off')),

  constraint project_diary_entries_phase_change_needs_to_phase_check
    check (system_event is distinct from 'phase_change'
           or to_phase is not null
           or legacy_id is not null),

  constraint project_diary_entries_tag_event_needs_tag_check
    check (system_event not in ('tag_on', 'tag_off')
           or operational_tag is not null
           or legacy_id is not null)
);

alter table public.project_diary_entries
  add constraint project_diary_entries_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

alter table public.project_diary_entries
  add constraint project_diary_entries_responsible_id_fkey
  foreign key (responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.project_diary_entries
  add constraint project_diary_entries_created_by_id_fkey
  foreign key (created_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.project_diary_entries
  add constraint project_diary_entries_updated_by_id_fkey
  foreign key (updated_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.project_diary_entries is
  'Linha do tempo do projeto, de ProjectTimelineEntry do base44. Guarda o registro MANUAL (o que a equipe anota) e o AUTOMATICO (o que o sistema registra ao mover cartao, trocar responsavel ou marcar tag). Os dois se distinguem por is_automatic, e a 0070 amarra cada um a um caminho de escrita diferente: manual so por Diretor/Coordenador pela policy; automatico SO pela funcao record_project_diary_event, que confere a permissao do FLUXO. ON DELETE CASCADE para projects: o diario e do projeto e nao sobrevive a ele.';

comment on column public.project_diary_entries.entry_type is
  'Tipo do registro. O valor system e reservado ao automatico, e o check amarra os dois - no original os dois campos sao escritos juntos por convencao (diaryAutoEvents.js:24) e nada garante que continuem juntos: uma tela nova que gravasse entry_type Sistema sem is_automatico produziria um registro que o filtro do relatorio trata como manual e o cartao desenha como automatico.';

comment on column public.project_diary_entries.visibility is
  'Quem ve o registro no relatorio. DEFEITO 6 DO PLANO: DiaryEntryForm.jsx:219-227 coleta o campo e ProjectTimelineEntry nao o declara, entao hoje o relatorio "para o cliente" nao filtra nada - todo registro interno vai para o cliente. Default internal, como o valor inicial do formulario. A regra FIEL do relatorio externo e "visibility = client OR is_automatic" (RelatorioPDFModal.jsx:45 mantem todo automatico), e nao "visibility = client".';

comment on column public.project_diary_entries.is_automatic is
  'Registro gerado pelo sistema, e nao digitado. E o discriminador de permissao deste modulo: a policy de INSERT da 0070 recusa is_automatic verdadeiro, e o unico caminho que o grava e public.record_project_diary_event. Sem essa separacao, quem tem permissao de escrever no diario poderia forjar um evento de sistema - e evento de sistema e exatamente o que ninguem confere, porque se supoe que a maquina escreveu.';

comment on column public.project_diary_entries.event_key is
  'Chave de idempotencia do evento automatico. DEFEITO 5 DO PLANO: no base44 o campo se chama evento_chave e "evita duplicatas" segundo a propria entidade, mas diaryAutoEvents.js:39 monta a chave com Date.now() - ou seja, ela e diferente a cada chamada e a deduplicacao (uma consulta previa, na linha 13) nunca encontra nada. Aqui a unicidade e (tenant_id, event_key) no banco, e quem decide e o indice, nao consulta previa. Nulo onde a idempotencia nao existe (o log de geracao de relatorio) - fingir chave e pior do que nao ter.';

comment on column public.project_diary_entries.system_event is
  'Natureza do evento automatico, em coluna. DEFEITO 10 DO PLANO: ResumoTab.jsx:128 e 157 calculam "Historico de Revisoes" com titulo.toLowerCase().includes(revisao) e a linha 164 monta "Tempo por Etapa" procurando a seta do titulo. Heuristica sobre texto livre: renomear um titulo apaga um grafico, e um registro manual chamado "Revisao do layout" entra na conta de revisoes automaticas. Nulo em registro manual, e o check amarra isso a is_automatic.';

comment on column public.project_diary_entries.from_phase is
  'Etapa de onde a tarefa saiu, no evento phase_change. Nula nas 31 linhas importadas do base44, DE PROPOSITO: extrair a fase do texto do titulo ("Projeto movido de Perspectivas -> Layout") seria plantar no dado historico exatamente a heuristica que o defeito 10 manda remover. O check que exige to_phase abre excecao para legacy_id justamente por isso.';

comment on column public.project_diary_entries.to_phase is
  'Etapa para onde a tarefa foi, no evento phase_change. Ver from_phase.';

comment on column public.project_diary_entries.operational_tag is
  'Qual tag foi ligada ou desligada, nos eventos tag_on e tag_off. No original a tag so aparece dentro do titulo ("Marcado como Em Revisao"), o que impede contar tag por periodo sem reler texto.';

comment on column public.project_diary_entries.legacy_id is
  'Id da linha de ProjectTimelineEntry no base44, preenchido so pela importacao. As 36 linhas reais entram por aqui. Nulo em tudo que nasce nesta aplicacao.';

comment on constraint project_diary_entries_tenant_id_event_key_key on public.project_diary_entries is
  'A deduplicacao de evento automatico, de verdade. Nulos nao colidem entre si em indice unico, entao registro manual (sem chave) e o log de relatorio (que nao tem fato repetivel) convivem a vontade. E por escritorio: dois escritorios podem gerar a mesma chave para projetos diferentes.';

comment on constraint project_diary_entries_system_type_matches_automatic_check on public.project_diary_entries is
  'Os dois sentidos da mesma regra: registro automatico e do tipo Sistema, e registro do tipo Sistema e automatico. No dado real do base44 os dois coincidem em 31 de 31 linhas, mas por convencao do codigo que escreve - nao por regra. A tela desenha o cartao por is_automatico e o relatorio filtra por entry_type: discordancia entre os dois produz um registro que aparece de um jeito e e contado de outro.';

comment on constraint project_diary_entries_phase_change_needs_to_phase_check on public.project_diary_entries is
  'Evento de mudanca de etapa precisa dizer para ONDE foi. A excecao por legacy_id existe porque as 31 linhas importadas nao tem essa informacao em lugar nenhum senao no texto do titulo, e adivinha-la seria gravar como fato o resultado de uma heuristica. Linha nascida nesta aplicacao nunca usa a excecao: a funcao record_project_diary_event sempre recebe a fase de destino.';

comment on constraint project_diary_entries_tag_event_needs_tag_check on public.project_diary_entries is
  'Mesma forma do check de fase, para a tag operacional. Evento de tag sem dizer qual tag e um evento que nenhum relatorio consegue somar.';

create index project_diary_entries_tenant_id_created_at_idx
  on public.project_diary_entries (tenant_id, created_at desc);

-- A consulta da gaveta: o diario de UM projeto, do mais recente para o mais
-- antigo (ProjectDiaryDrawer.jsx:84 ordena por -data_ocorrencia).
create index project_diary_entries_tenant_id_project_id_occurrence_date_idx
  on public.project_diary_entries (tenant_id, project_id, occurrence_date desc);

-- "Tempo por Etapa" e "Historico de Revisoes": so evento automatico entra.
-- Parcial porque registro manual e a minoria hoje e nunca entra nessa conta.
create index project_diary_entries_tenant_id_system_event_idx
  on public.project_diary_entries (tenant_id, project_id, system_event)
  where system_event is not null;

create trigger project_diary_entries_set_updated_at
  before update on public.project_diary_entries
  for each row execute function public.set_updated_at();

-- project_site_visits -----------------------------------------------------------

create table public.project_site_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- required na entidade de origem.
  project_id uuid not null,
  visit_date date not null,
  visit_type public.site_visit_type not null,

  visit_time time,
  responsible_id uuid,
  summary text,
  notes text,
  status public.site_visit_status not null default 'no_issues',

  -- Defeito 7.
  diary_entry_id uuid,

  created_by_id uuid,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_site_visits_id_tenant_id_key unique (id, tenant_id),
  constraint project_site_visits_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint project_site_visits_tenant_id_diary_entry_id_key unique (tenant_id, diary_entry_id),

  constraint project_site_visits_summary_not_blank_check
    check (summary is null or btrim(summary) <> '')
);

alter table public.project_site_visits
  add constraint project_site_visits_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

alter table public.project_site_visits
  add constraint project_site_visits_responsible_id_fkey
  foreign key (responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.project_site_visits
  add constraint project_site_visits_created_by_id_fkey
  foreign key (created_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

-- ON DELETE SET NULL, e nao cascade: apagar a entrada de diario nao pode apagar
-- a visita, que e o fato. O contrario tambem vale - apagar a visita deixa a
-- entrada de pe, porque o diario e a memoria do escritorio e nao um espelho.
alter table public.project_site_visits
  add constraint project_site_visits_diary_entry_id_fkey
  foreign key (diary_entry_id, tenant_id)
  references public.project_diary_entries (id, tenant_id)
  on delete set null;

comment on table public.project_site_visits is
  'Visita a obra, de ProjectSiteVisit do base44. Cada visita gera uma entrada automatica no diario, e o vinculo entre as duas e diary_entry_id - coluna que no original existe (timeline_entry_id) e NUNCA e gravada.';

comment on column public.project_site_visits.diary_entry_id is
  'Entrada do diario gerada por esta visita. DEFEITO 7 DO PLANO: ProjectSiteVisit declara timeline_entry_id e ObraTab.jsx:58-68 cria a visita, cria a entrada e NAO grava o vinculo em lugar nenhum - o campo nasce e morre vazio. A consequencia esta no defeito 13: editar a visita nao tem como corrigir a entrada que ela gerou, porque ninguem sabe qual e. Aqui e FK de verdade, com unicidade por escritorio para que duas visitas nao reivindiquem a mesma entrada.';

comment on column public.project_site_visits.summary is
  'Resumo da visita. Nullable como na entidade (que so exige project_id, data e tipo), embora SiteVisitForm.jsx:112 o exija na tela - o formulario e mais estrito que o dado, e recusar aqui inviabilizaria importacao futura de visita sem resumo.';

comment on constraint project_site_visits_tenant_id_diary_entry_id_key on public.project_site_visits is
  'Uma entrada de diario pertence a no maximo uma visita. Sem isso, o vinculo do defeito 7 seria de mao unica e util pela metade: dada a entrada, nao haveria como saber de qual visita ela veio.';

create index project_site_visits_tenant_id_created_at_idx
  on public.project_site_visits (tenant_id, created_at desc);

-- A aba Obra: as visitas de UM projeto, da mais recente para a mais antiga
-- (ObraTab.jsx:47 ordena por -data_visita).
create index project_site_visits_tenant_id_project_id_visit_date_idx
  on public.project_site_visits (tenant_id, project_id, visit_date desc);

create trigger project_site_visits_set_updated_at
  before update on public.project_site_visits
  for each row execute function public.set_updated_at();

-- project_issues ----------------------------------------------------------------

create table public.project_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- required na entidade de origem.
  project_id uuid not null,
  description text not null,
  category public.project_issue_category not null,
  identified_date date not null,

  -- Defeito 8. Preenchido pelo trigger quando vem nulo.
  issue_number integer not null,

  visit_id uuid,
  responsible_id uuid,
  due_date date,
  status public.project_issue_status not null default 'open',
  notes text,

  resolved_by_id uuid,
  resolved_at timestamptz,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_issues_id_tenant_id_key unique (id, tenant_id),
  constraint project_issues_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint project_issues_project_id_issue_number_key unique (project_id, issue_number),

  constraint project_issues_description_not_blank_check check (btrim(description) <> ''),

  constraint project_issues_issue_number_positive_check check (issue_number > 0),

  -- Os dois sentidos da mesma igualdade, como em tasks (0032): pendencia
  -- resolvida exige data, e data de resolucao exige pendencia resolvida.
  constraint project_issues_resolved_at_matches_status_check
    check ((status = 'resolved') = (resolved_at is not null)),

  constraint project_issues_resolved_by_requires_resolved_check
    check (resolved_by_id is null or resolved_at is not null),

  constraint project_issues_due_date_not_before_identified_check
    check (due_date is null or due_date >= identified_date)
);

alter table public.project_issues
  add constraint project_issues_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;

-- SET NULL, e nao cascade: apagar a visita nao pode apagar a pendencia que ela
-- revelou. A pendencia continua existindo na obra depois que o registro da
-- visita some.
alter table public.project_issues
  add constraint project_issues_visit_id_fkey
  foreign key (visit_id, tenant_id)
  references public.project_site_visits (id, tenant_id)
  on delete set null;

alter table public.project_issues
  add constraint project_issues_responsible_id_fkey
  foreign key (responsible_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.project_issues
  add constraint project_issues_resolved_by_id_fkey
  foreign key (resolved_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.project_issues is
  'Pendencia de obra, de ProjectIssue do base44. O numero sequencial por projeto e alocado por trigger com advisory lock (defeito 8), e o historico de alteracoes e tabela propria escrita por trigger (defeito 12) - no original as duas coisas sao calculadas no navegador a partir do que a aba tem em memoria.';

comment on column public.project_issues.issue_number is
  'Numero sequencial da pendencia DENTRO do projeto (#1, #2, ...). DEFEITO 8 DO PLANO: no original o numero e issues.length + 1 (ObraTab.jsx:104 e PendenciasTab.jsx:39), contado sobre a lista que o navegador tem em memoria - duas abas abertas ja produzem duas pendencias #3, sem nenhuma concorrencia real, e a lista filtrada por status produziria numero repetido sozinha. Aqui a alocacao e do banco, sob advisory lock por projeto, e a unicidade (project_id, issue_number) e quem decide no fim. Aceita valor explicito para que uma importacao futura preserve a numeracao de origem.';

comment on column public.project_issues.visit_id is
  'Visita que revelou a pendencia. Opcional: PendenciasTab cria pendencia sem visita nenhuma, e e o caso comum fora da obra.';

comment on column public.project_issues.resolved_at is
  'Quando a pendencia foi resolvida. Amarrada a status pelos dois sentidos, como completion_date em tasks (0032): pendencia resolvida sem data nao entra em nenhuma contagem por periodo, e data em pendencia aberta a faz aparecer como resolvida em qualquer relatorio que conte por data.';

comment on constraint project_issues_project_id_issue_number_key on public.project_issues is
  'Nao existem duas pendencias #3 no mesmo projeto. E a metade que o trigger sozinho nao garante: duas transacoes que aloquem ao mesmo tempo sao serializadas pelo advisory lock, mas um numero passado a mao pela API so e barrado aqui.';

comment on constraint project_issues_due_date_not_before_identified_check on public.project_issues is
  'Prazo anterior a identificacao nasce vencido no dia em que e digitado, e a lista o marcaria em vermelho na hora (PendenciasTab.jsx:126). Exigido apenas quando o prazo existe: prazo e opcional no original.';

create index project_issues_tenant_id_created_at_idx
  on public.project_issues (tenant_id, created_at desc);

-- A aba Pendencias: as pendencias de UM projeto, com os filtros rapidos por
-- status (PendenciasTab.jsx:139).
create index project_issues_tenant_id_project_id_status_idx
  on public.project_issues (tenant_id, project_id, status);

-- As pendencias de uma visita (o bloco "N pendencia(s) desta visita",
-- ObraTab.jsx:241). Parcial: pendencia sem visita e o caso comum.
create index project_issues_tenant_id_visit_id_idx
  on public.project_issues (tenant_id, visit_id)
  where visit_id is not null;

create trigger project_issues_set_updated_at
  before update on public.project_issues
  for each row execute function public.set_updated_at();

-- project_issue_events ----------------------------------------------------------
--
-- Substitui o array ProjectIssue.historico. Sem legacy_id, como
-- project_checklist_items (0032) e negotiation_services (0022): no base44 estes
-- itens vivem dentro da linha da pendencia e nao tem id proprio.

create table public.project_issue_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  issue_id uuid not null,

  event_type public.project_issue_event_type not null,
  from_status public.project_issue_status,
  to_status public.project_issue_status,
  description text,
  author_id uuid,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint project_issue_events_id_tenant_id_key unique (id, tenant_id),

  constraint project_issue_events_description_not_blank_check
    check (description is null or btrim(description) <> ''),

  constraint project_issue_events_status_change_has_statuses_check
    check (event_type <> 'created' or from_status is null)
);

alter table public.project_issue_events
  add constraint project_issue_events_issue_id_fkey
  foreign key (issue_id, tenant_id)
  references public.project_issues (id, tenant_id)
  on delete cascade;

alter table public.project_issue_events
  add constraint project_issue_events_author_id_fkey
  foreign key (author_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.project_issue_events is
  'Historico de alteracoes de uma pendencia, uma linha por evento. Substitui o array ProjectIssue.historico. DEFEITO 12 DO PLANO: no original a atualizacao le o array do CACHE DO NAVEGADOR, empurra um item e regrava o campo inteiro (PendenciasTab.jsx:69-72) - duas pessoas mexendo na mesma pendencia perdem o registro uma da outra, e quem chegou depois vence sem que nada acuse. Aqui cada evento e uma linha, escrita por trigger, e ninguem regrava historico. ON DELETE CASCADE: e parte da pendencia.';

comment on column public.project_issue_events.event_type is
  'O que aconteceu. A frase em portugues que o original grava dentro do array ("Pendencia criada.") fica na UI: copy de tela dentro do banco envelhece no primeiro ajuste de texto e leva junto o historico ja gravado.';

comment on column public.project_issue_events.description is
  'Texto livre opcional do evento. Existe para o caso que o enum nao cobre e para uma importacao futura do array historico, cujos itens sao frase pronta. Nulo no que o trigger escreve.';

comment on column public.project_issue_events.author_id is
  'Quem provocou o evento, resolvido por auth_collaborator_id() dentro do trigger. Nulo quando a escrita nao vem de sessao autenticada - importacao, service_role ou correcao no painel -, e nulo e a resposta honesta: inventar autor num historico e pior do que nao ter autor.';

create index project_issue_events_tenant_id_issue_id_occurred_at_idx
  on public.project_issue_events (tenant_id, issue_id, occurred_at);

-- O trigger que escreve o historico -------------------------------------------
--
-- SECURITY DEFINER para que o historico NAO dependa da policy de escrita de
-- project_issue_events: o registro do que aconteceu com a pendencia e
-- consequencia da propria escrita, e nao um segundo gesto que possa ser negado
-- pela metade. O tenant vem da linha, nunca do JWT.
--
-- TODA atualizacao gera evento, inclusive a que so mexe em texto. E o que o
-- original faz (as duas telas que atualizam pendencia sempre empurram um item no
-- historico, PendenciasTab.jsx:85 e 103) e e o comportamento util: "alguem mexeu
-- nisto" e informacao, mesmo quando o campo mexido nao aparece no historico.

create or replace function public.project_issues_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.project_issue_event_type;
  v_from public.project_issue_status;
  v_to public.project_issue_status;
begin
  if tg_op = 'INSERT' then
    v_type := 'created';
    v_to := new.status;
  elsif new.status is distinct from old.status then
    v_from := old.status;
    v_to := new.status;
    v_type := case
                when new.status = 'resolved' then 'resolved'
                when new.status = 'cancelled' then 'cancelled'
                when old.status in ('resolved', 'cancelled') then 'reopened'
                else 'status_changed'
              end;
  else
    v_type := 'updated';
  end if;

  insert into public.project_issue_events
    (tenant_id, issue_id, event_type, from_status, to_status, author_id)
  values
    (new.tenant_id, new.id, v_type, v_from, v_to, public.auth_collaborator_id());

  return null;
end;
$$;

comment on function public.project_issues_log_event() is
  'Escreve uma linha em project_issue_events a cada INSERT ou UPDATE de pendencia. Substitui o read-modify-write do array historico feito no navegador (defeito 12 do plano). Distingue resolved, cancelled e reopened pela transicao de status - reopened nao existe no original, que so registra tres frases e nunca a de reabertura. AFTER e nao BEFORE porque o evento descreve o que ja foi gravado. SECURITY DEFINER porque o historico nao pode depender da policy de escrita da tabela filha; o tenant vem da linha, nao do JWT.';

create trigger project_issues_log_event
  after insert or update on public.project_issues
  for each row execute function public.project_issues_log_event();

-- O trigger que aloca o numero da pendencia -------------------------------------
--
-- Defeito 8. O advisory lock e por PROJETO e por transacao: duas pendencias
-- criadas ao mesmo tempo no mesmo projeto sao serializadas, e duas em projetos
-- diferentes nao esperam uma pela outra. Ele NAO e a protecao final - a
-- unicidade (project_id, issue_number) e -, do mesmo jeito que o FOR UPDATE da
-- 0044 nao e a protecao contra parcela duplicada.
--
-- SECURITY DEFINER porque o max() precisa enxergar TODAS as pendencias do
-- projeto. Sob a RLS de leitura atual isso ja aconteceria (a leitura e larga por
-- escritorio), mas depender disso significaria que apertar a policy de SELECT um
-- dia passaria a repetir numero - efeito colateral a distancia, do tipo que
-- ninguem liga a causa.

create or replace function public.project_issues_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.issue_number is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('public.project_issues'),
    hashtext(new.project_id::text)
  );

  select coalesce(max(i.issue_number), 0) + 1
  into new.issue_number
  from public.project_issues i
  where i.project_id = new.project_id;

  return new;
end;
$$;

comment on function public.project_issues_assign_number() is
  'Aloca project_issues.issue_number quando ele vem nulo: maior numero do projeto + 1, sob pg_advisory_xact_lock por projeto. Substitui o issues.length + 1 do original (ObraTab.jsx:104), que conta a lista carregada no navegador - duas abas abertas produzem duas pendencias com o mesmo numero sem nenhuma concorrencia real. O lock serializa; quem garante mesmo e a unicidade (project_id, issue_number). Valor explicito passa direto, para que uma importacao futura preserve a numeracao de origem. SECURITY DEFINER para que o max enxergue o projeto inteiro independente da policy de SELECT.';

create trigger project_issues_assign_number
  before insert on public.project_issues
  for each row execute function public.project_issues_assign_number();

-- project_diary_files -----------------------------------------------------------
--
-- UMA tabela com ARCO EXCLUSIVO, e nao tres tabelas. Os tres arrays de arquivo
-- do modulo (ProjectTimelineEntry.anexos, ProjectSiteVisit.fotos/arquivos,
-- ProjectIssue.fotos/arquivos) guardam exatamente a mesma coisa - nome, endereco
-- e tipo -, e sao consumidos JUNTOS: a aba Fotos agrega as fotos de visita e de
-- pendencia numa galeria so (FotosTab.jsx), e o lightbox navega entre elas sem
-- saber de onde vieram. Tres tabelas obrigariam a um UNION em toda leitura, a
-- tres policies de storage e a tres caminhos de faxina de arquivo orfao.
--
-- O que a tabela unica custa: a integridade "exatamente uma mae" nao vem da FK,
-- vem de um check. Por isso ele e num_nonnulls = 1, e nao "pelo menos uma".

create table public.project_diary_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  entry_id uuid,
  visit_id uuid,
  issue_id uuid,

  file_kind public.diary_file_kind not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,
  display_order smallint,
  uploaded_by_id uuid,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_diary_files_id_tenant_id_key unique (id, tenant_id),
  constraint project_diary_files_tenant_id_legacy_id_key unique (tenant_id, legacy_id),
  constraint project_diary_files_tenant_id_file_path_key unique (tenant_id, file_path),

  constraint project_diary_files_exactly_one_parent_check
    check (num_nonnulls(entry_id, visit_id, issue_id) = 1),

  constraint project_diary_files_file_path_not_blank_check check (btrim(file_path) <> ''),
  constraint project_diary_files_file_name_not_blank_check check (btrim(file_name) <> ''),
  constraint project_diary_files_byte_size_positive_check
    check (byte_size is null or byte_size > 0)
);

alter table public.project_diary_files
  add constraint project_diary_files_entry_id_fkey
  foreign key (entry_id, tenant_id)
  references public.project_diary_entries (id, tenant_id)
  on delete cascade;

alter table public.project_diary_files
  add constraint project_diary_files_visit_id_fkey
  foreign key (visit_id, tenant_id)
  references public.project_site_visits (id, tenant_id)
  on delete cascade;

alter table public.project_diary_files
  add constraint project_diary_files_issue_id_fkey
  foreign key (issue_id, tenant_id)
  references public.project_issues (id, tenant_id)
  on delete cascade;

alter table public.project_diary_files
  add constraint project_diary_files_uploaded_by_id_fkey
  foreign key (uploaded_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.project_diary_files is
  'Arquivo anexado a uma entrada de diario, a uma visita ou a uma pendencia. Substitui os tres arrays de arquivo do modulo. ARCO EXCLUSIVO: exatamente uma das tres colunas de mae e nao nula, e o check num_nonnulls = 1 e quem garante - com FK e possivel dizer "aponta para uma entrada valida", nao "aponta para exatamente uma coisa". LIMITACAO CONHECIDA, e ela e a mesma da 0052: Storage nao tem FK. Apagar a linha-mae leva a linha desta tabela por cascade, e NAO apaga o objeto do bucket - ele fica orfao, pago e alcancavel por caminho dentro do proprio escritorio. Os hooks varrem os caminhos antes do DELETE (defeito 14 do plano), o que e best-effort; fechar de verdade pede faxina que compare bucket com banco.';

comment on column public.project_diary_files.file_path is
  'CAMINHO do objeto no bucket project-diary-files, nunca URL. Comeca pelo tenant_id, que e o segmento que as policies de storage.objects comparam com o claim do JWT (0071). A tela pede URL assinada de curta duracao na hora de abrir, como no modulo 8. No original o campo guarda uma URL PUBLICA do base44.app, que funciona para qualquer pessoa que a tenha - e o que este modulo poe atras dessa URL e foto da obra da residencia de um cliente.';

comment on column public.project_diary_files.file_kind is
  'Foto ou anexo. Vem do NOME DO ARRAY de origem (fotos vs anexos/arquivos), que e a unica coisa que os distingue no base44 e que se perde ao virar uma tabela so. A aba Fotos e o lightbox mostram apenas photo; o resto aparece como clipe. Nao ha check amarrando o tipo a mae de proposito: no original a entrada de diario so tem anexo, mas nada no dominio impede anexar foto a uma anotacao, e inventar essa proibicao aqui criaria uma recusa que nenhuma tela sabe explicar.';

comment on column public.project_diary_files.legacy_id is
  'Chave sintetica da importacao, no formato <legacy_id da mae>:<array>:<indice>, como em budget_item_quotes (0066). O item do array nao tem id proprio no base44, entao sem ela a reimportacao dos 5 anexos reais duplicaria a cada rodada.';

comment on constraint project_diary_files_exactly_one_parent_check on public.project_diary_files is
  'Exatamente uma mae: nem zero (arquivo que nenhuma tela mostra e que ninguem apaga), nem duas (a mesma foto contada duas vezes na galeria e apagada por dois caminhos). E o preco da tabela unica, e o unico lugar onde a integridade do arco vive.';

comment on constraint project_diary_files_tenant_id_file_path_key on public.project_diary_files is
  'Duas linhas apontando para o mesmo objeto fariam a remocao de uma apagar o arquivo da outra. Mesma regra de budget_item_approval_files (0054).';

create index project_diary_files_tenant_id_created_at_idx
  on public.project_diary_files (tenant_id, created_at desc);

-- Os tres caminhos de leitura, um por mae. Parciais porque cada linha tem
-- exatamente uma das tres preenchidas - indice cheio guardaria dois nulos por
-- linha em cada um dos tres.
create index project_diary_files_tenant_id_entry_id_idx
  on public.project_diary_files (tenant_id, entry_id, display_order)
  where entry_id is not null;

create index project_diary_files_tenant_id_visit_id_idx
  on public.project_diary_files (tenant_id, visit_id, display_order)
  where visit_id is not null;

create index project_diary_files_tenant_id_issue_id_idx
  on public.project_diary_files (tenant_id, issue_id, display_order)
  where issue_id is not null;

create trigger project_diary_files_set_updated_at
  before update on public.project_diary_files
  for each row execute function public.set_updated_at();
