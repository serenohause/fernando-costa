-- Modulo 11 - dois consertos que o teste proprio do modulo achou antes de
-- qualquer tela existir. As duas correcoes sao em objetos criados pela 0069, na
-- mesma etapa; nenhuma outra migration e tocada.
--
-- ================================================================
-- 1. ON DELETE SET NULL EM FK COMPOSTA APAGAVA O tenant_id JUNTO
-- ================================================================
--
--   project_site_visits.diary_entry_id e project_issues.visit_id foram
--   declaradas na 0069 como
--
--     foreign key (<coluna>, tenant_id) references <mae> (id, tenant_id)
--       on delete set null
--
--   SET NULL sem lista de colunas zera TODAS as colunas da referencia - e
--   tenant_id e uma delas. Como tenant_id e NOT NULL, o efeito real nao era
--   "solta o vinculo": era 23502, e o DELETE da linha-mae falhava inteiro.
--
--   Ou seja: apagar uma entrada de diario que uma visita reivindicou era
--   impossivel, e a mensagem falava de uma coluna que a pessoa nunca tocou. O
--   mesmo para apagar uma visita que revelou pendencia - que e o gesto que a
--   propria 0069 declara no COMMENT como preservado ("pendencia de obra continua
--   existindo depois que o registro da visita some").
--
--   O conserto e a lista de colunas de SET NULL, que existe no Postgres desde a
--   15 (aqui roda a 17): so a coluna do vinculo e zerada, e tenant_id fica onde
--   estava. Os casos 9.4 a 9.7 de supabase/tests/diary-schema.sql sao quem
--   acusa se isso voltar.
--
--   POR QUE DROP + ADD, SENDO QUE ESTE PROJETO NAO APAGA OBJETO DE MIGRATION
--   ANTERIOR: nao ha ALTER que troque a acao de uma FK - ALTER CONSTRAINT so
--   mexe em deferrability. As duas constraints sao desta mesma etapa (0069) e
--   sao recriadas imediatamente, com o mesmo nome e o mesmo alvo; nenhuma linha e
--   tocada e nenhuma outra migration depende delas.
--
-- ================================================================
-- 2. TODO EVENTO DO HISTORICO NASCIA COM O MESMO INSTANTE
-- ================================================================
--
--   project_issue_events.occurred_at usava default now(), que e o instante da
--   TRANSACAO. Duas escritas na mesma transacao - resolver uma pendencia dentro
--   de uma rotina, uma correcao em lote, um teste - produzem eventos com carimbo
--   identico, e a tela que ordena o historico por data passa a mostrar em ordem
--   arbitraria o que aconteceu em sequencia.
--
--   E um log: o carimbo precisa ser o do momento da LINHA, e nao o da transacao.
--   clock_timestamp() avanca dentro da transacao. Mesmo motivo pelo qual
--   supabase/tests/pattern-invariants.sql usa clock_timestamp() para
--   negotiation_owner_history.changed_at.
--
--   Nenhuma linha existente e alterada: so o default muda.

-- 1 -----------------------------------------------------------------------------

alter table public.project_site_visits
  drop constraint project_site_visits_diary_entry_id_fkey;

alter table public.project_site_visits
  add constraint project_site_visits_diary_entry_id_fkey
  foreign key (diary_entry_id, tenant_id)
  references public.project_diary_entries (id, tenant_id)
  on delete set null (diary_entry_id);

comment on constraint project_site_visits_diary_entry_id_fkey on public.project_site_visits is
  'Vinculo da visita com a entrada de diario que ela gerou (defeito 7 do plano). SET NULL COM LISTA DE COLUNAS, de proposito: sem a lista, o SET NULL zeraria tambem o tenant_id da FK composta, que e NOT NULL - e apagar a entrada falharia com 23502 em vez de soltar o vinculo. Apagar a entrada nao pode derrubar a visita: a entrada e o registro, a visita e o fato.';

alter table public.project_issues
  drop constraint project_issues_visit_id_fkey;

alter table public.project_issues
  add constraint project_issues_visit_id_fkey
  foreign key (visit_id, tenant_id)
  references public.project_site_visits (id, tenant_id)
  on delete set null (visit_id);

comment on constraint project_issues_visit_id_fkey on public.project_issues is
  'Visita que revelou a pendencia. SET NULL COM LISTA DE COLUNAS pelo mesmo motivo do vinculo da visita: sem a lista, apagar a visita tentaria zerar o tenant_id da pendencia e falharia com 23502. Pendencia de obra continua existindo depois que o registro da visita some.';

-- 2 -----------------------------------------------------------------------------

alter table public.project_issue_events
  alter column occurred_at set default clock_timestamp();

comment on column public.project_issue_events.occurred_at is
  'Quando o evento aconteceu. Default clock_timestamp(), e nao now(): now() e o instante da TRANSACAO e daria carimbo identico a dois eventos gravados na mesma, deixando o historico da pendencia em ordem arbitraria na tela. Log quer o instante da linha.';
