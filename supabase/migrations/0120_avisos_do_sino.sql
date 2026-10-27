-- O sino de notificacoes: as duas especies de aviso, e a varredura que grava o atraso.
--
-- O QUE O MODULO E
--   Duas especies, e so duas (prototypes/notificacoes-sino.html, aprovado):
--     task_assigned  alguem atribuiu uma tarefa a voce;
--     task_overdue   o prazo de uma tarefa sua venceu.
--
--   Cada aviso e uma LINHA PERSISTIDA, com data e estado de leitura. Isso nao e
--   detalhe de implementacao: e o que permite o painel agrupar por dia, marcar
--   uma a uma como lida e manter historico - e e o que faz caber, sem
--   reviravolta, um segundo canal no futuro (e-mail lendo a mesma linha).
--
-- DECISOES DO USUARIO QUE ESTA MIGRATION OBEDECE
--   1. A linha de "nova tarefa" MOSTRA quem atribuiu -> actor_id + actor_name.
--   2. O painel lista lidas e nao lidas juntas, por dia -> read_at nullable, e o
--      aviso lido continua na tabela; nada apaga linha.
--   3. O atraso vem de VARREDURA DIARIA que GRAVA -> public.scan_overdue_tasks().
--      Nao e calculo na hora. A regra de "em atraso" calculada na hora ja existe
--      no financeiro (public.is_overdue, 0043) e la ela e view de proposito; aqui
--      a decisao e a oposta, e o motivo e o aviso: nao existe "voce foi avisado"
--      sem linha gravada, e sem linha nao ha o que marcar como lido.
--   4. NAO existe tela "Ver todas" por enquanto -> nada aqui depende dela; o
--      painel le a propria tabela inteira com rolagem.
--   5. Atraso NAO repete a cada varredura: um aviso por tarefa por EPISODIO.
--
-- A CHAVE DE DEDUPLICACAO, e a correcao que ela recebeu
--   A sugestao era unica por (task_id, kind, due_date). Esta migration usa
--   (task_id, recipient_id, due_date) WHERE kind = 'task_overdue', e as duas
--   diferencas sao de proposito:
--
--   - `kind` sai da lista de colunas e entra como PREDICADO. Indice unico sobre
--     kind vigiaria tambem task_assigned, e atribuicao repetida e fato novo, nao
--     duplicata: passar a tarefa de A para B e de volta para A e para avisar A
--     duas vezes, porque aconteceram duas coisas.
--   - `recipient_id` ENTRA. Sem ele, tarefa atrasada que troca de responsavel no
--     meio do atraso nunca avisa o novo responsavel: a chave (task, due_date) ja
--     estaria ocupada pelo aviso do antigo, e a pessoa que herdou a tarefa
--     atrasada seria exatamente a que precisava saber.
--
--   O que a chave garante, e e o pedido: varredura repetida no mesmo prazo nao
--   grava nada; prazo remarcado e vencido de novo e EPISODIO NOVO, porque
--   due_date mudou.
--
--   O que ela deliberadamente NAO distingue: tarefa concluida e reaberta com o
--   MESMO prazo ja vencido nao gera segundo aviso. E o mesmo prazo, o mesmo
--   episodio, e a pessoa ja foi avisada dele.
--
-- O BANCO PODE TER FICADO PAUSADO, e a varredura nao pode depender de ter
-- rodado ontem
--   Projeto free da Supabase pausa por inatividade - aconteceu com o de dev. A
--   varredura, por isso, NAO guarda marca d'agua de "ultima execucao" e nao
--   pergunta "o que venceu ontem". Ela pergunta "o que esta vencido AGORA e
--   ainda nao foi avisado", e quem responde "ainda nao foi avisado" e o indice
--   unico. Consequencias, as duas desejadas:
--     - desligado um mes, a primeira varredura acha tudo o que venceu no mes, e
--       grava UM aviso por tarefa (nao trinta);
--     - rodando duas vezes no mesmo dia, a segunda grava zero.
--   Isso tambem torna a funcao segura de chamar a mao, a qualquer hora, quantas
--   vezes quiser.
--
-- A TAREFA PODE SER APAGADA DEPOIS, e o aviso tem que continuar legivel
--   Precedente do projeto: impersonation_events (0109) e task_events.actor_name
--   (0104) copiam o NOME do alvo para a linha. Aqui a copia e tripla - titulo da
--   tarefa, nome do projeto e nome de quem atribuiu - e a FK da tarefa e
--   ON DELETE SET NULL (e nao CASCADE, como em task_events): historico do cartao
--   morre com o cartao, aviso nao. "Voce foi avisado" continua sendo verdade
--   depois de a tarefa sumir, e o aviso que desaparece junto apaga a prova.
--
--   As copias NAO ganham check de tamanho, e isso tambem e decisao: tasks.title
--   nao tem limite declarado (0032), entao um check aqui poderia derrubar o
--   UPDATE da tarefa por causa do aviso - o mesmo defeito que record_task_event
--   (0104) evita ao desistir do evento em vez de quebrar a escrita.
--
-- CADA PESSOA VE SO AS DELA
--   O aviso carrega nome de tarefa e de projeto, ou seja e dado de escritorio: a
--   tabela tem tenant_id, como toda tabela de negocio, e indice composto
--   comecando por ele. Mas o recorte de leitura e mais estreito que o do
--   escritorio - e por recipient_id.
--
--   AS POLICIES NAO ESTAO AQUI. Esta migration liga a RLS e escreve os GRANT,
--   que sao barreiras SEPARADAS (achado da 0007: ENABLE ROW LEVEL SECURITY
--   sozinho nao protege nada se o GRANT estiver aberto). Com RLS ligada e
--   nenhuma policy, a tabela ja nasce fechada para authenticated - fail-closed.
--   AS POLICIES E O TESTE DE ISOLAMENTO SAO A ETAPA SEGUINTE, do rls-guardian:
--   notifications, hoje, nao devolve linha alguma pela Data API.
--
-- PRIMEIRO AGENDADOR DO PROJETO
--   Nenhuma migration usava agendador ate aqui. pg_cron esta disponivel e nao
--   instalado. A varredura e uma FUNCAO chamavel a mao e o agendamento so a
--   chama: testavel sem esperar meia-noite, e operavel a mao no dia em que o
--   cron falhar. Instalar extensao e agendar job podem faltar privilegio em
--   projeto hospedado, entao os dois seguem o idioma da 0007 - DO + EXCEPTION +
--   RAISE WARNING com o comando a rodar a mao. Falhar ali nao derruba o push, e
--   nao passa calado.

-- 1. As duas especies ---------------------------------------------------------

create type public.notification_kind as enum ('task_assigned', 'task_overdue');

comment on type public.notification_kind is
  'Especie do aviso do sino. De/para da UI (prototypes/notificacoes-sino.html): task_assigned=Nova tarefa, task_overdue=Tarefa em atraso. Duas, e so duas: o escopo aprovado nao tem aviso de comentario, de mencao nem de prazo que esta chegando.';

-- 2. A tabela -----------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  /* De quem e o aviso. E o recorte de leitura do modulo: cada pessoa ve so as
     dela, e nao as do escritorio. */
  recipient_id uuid not null,

  kind public.notification_kind not null,

  /* A tarefa, enquanto ela existir. Nulo = apagada depois; o aviso continua
     legivel pelas copias abaixo. */
  task_id uuid,
  task_title text not null,
  project_name text,

  /* Quem atribuiu. Nulo em task_overdue (nao ha autor) e tambem quando a
     atribuicao vem sem sessao (seed, correcao no banco) - a tela diz "Sistema",
     igual ao historico do cartao (0104). */
  actor_id uuid,
  actor_name text,

  /* O prazo que venceu. So em task_overdue, e e a chave do episodio. */
  due_date date,

  /* Nulo = nao lida. O contador do sino e o ponto rosa da linha leem daqui. */
  read_at timestamptz,

  created_at timestamptz not null default now(),

  /* FK composta com tenant_id em todas: a RLS nao impede gravar referencia para
     linha de outro escritorio (convencao desde a 0032). */
  constraint notifications_recipient_fkey
    foreign key (recipient_id, tenant_id) references public.collaborators (id, tenant_id)
    on delete cascade,

  /*
    SET NULL COM LISTA DE COLUNAS nas duas que podem desaparecer: sem a lista,
    apagar a linha referenciada anularia tambem tenant_id, que e NOT NULL - o
    defeito documentado na 0073.
  */
  constraint notifications_task_fkey
    foreign key (task_id, tenant_id) references public.tasks (id, tenant_id)
    on delete set null (task_id),
  constraint notifications_actor_fkey
    foreign key (actor_id, tenant_id) references public.collaborators (id, tenant_id)
    on delete set null (actor_id),

  /* Os dois sentidos da mesma regra: atraso sem prazo nao tem episodio (e a
     linha ficaria fora do indice unico, voltando a repetir a cada varredura), e
     prazo em aviso de atribuicao seria dado que a tela aprovada nao mostra. */
  constraint notifications_due_date_matches_kind_check
    check ((kind = 'task_overdue') = (due_date is not null)),

  /* Atraso nao tem autor: quem avisa e a varredura. Sem isto, um aviso de
     atraso com nome de pessoa diria que alguem te cobrou - e ninguem cobrou. */
  constraint notifications_overdue_has_no_actor_check
    check (kind <> 'task_overdue' or (actor_id is null and actor_name is null))
);

comment on table public.notifications is
  'Avisos do sino (0120): uma linha por aviso, por pessoa. Duas especies, task_assigned e task_overdue. Nascem de gatilho (atribuicao) e de public.scan_overdue_tasks (varredura diaria); NENHUMA tela insere aqui, e authenticated nao tem GRANT de INSERT nem de DELETE. O unico campo que a pessoa muda e read_at, por GRANT de coluna. Titulo da tarefa, nome do projeto e nome de quem atribuiu sao COPIAS: o aviso sobrevive a tarefa ser apagada e ao colaborador sair do escritorio (precedente de impersonation_events, 0109).';

comment on column public.notifications.recipient_id is
  'O colaborador avisado. ON DELETE CASCADE, e nao SET NULL: ele e o dono da linha e o unico leitor dela - aviso sem destinatario nao teria quem o lesse.';

comment on column public.notifications.task_id is
  'A tarefa que originou o aviso, e o destino do clique na linha. Nulo depois de a tarefa ser apagada: a linha fica, sem link.';

comment on column public.notifications.task_title is
  'Copia do titulo no momento do aviso. Sem check de tamanho de proposito: tasks.title nao tem limite, e um check aqui derrubaria a escrita da tarefa por causa do aviso.';

comment on column public.notifications.project_name is
  'Copia do nome do projeto no momento do aviso. Nulo quando a tarefa nao tem projeto, que e caso previsto desde a 0032.';

comment on column public.notifications.actor_name is
  'Copia do nome de quem atribuiu - a decisao 1 do usuario sobre o prototipo. Nulo com actor_id nulo significa sem sessao ("Sistema"); nome preenchido com actor_id nulo significa que a pessoa saiu do escritorio depois.';

comment on column public.notifications.due_date is
  'O prazo que venceu, e NAO a data da varredura (a tela mostra "venceu 21/10", porque o que interessa e ha quanto tempo a tarefa esta parada). E tambem a chave do episodio de atraso: prazo remarcado e vencido de novo e aviso novo.';

comment on column public.notifications.read_at is
  'Quando a pessoa marcou como lida. Nulo = nao lida, e e o que o contador do sino conta. Lida NAO sai da lista: o painel aprovado mostra lidas e nao lidas juntas, agrupadas por dia.';

comment on column public.notifications.created_at is
  'Quando o aviso foi gravado, e e por ele que a faixa de dia do painel agrupa ("Hoje", "Ontem", "23/10").';

-- 3. Indices ------------------------------------------------------------------

/* A leitura do painel, e o indice composto comecando por tenant_id que o
   CLAUDE.md exige. */
create index notifications_tenant_id_recipient_id_created_at_idx
  on public.notifications (tenant_id, recipient_id, created_at desc);

/* O contador do sino, que roda em toda troca de tela. Parcial porque aviso lido
   nunca entra na conta - e, passado o uso, a maior parte da tabela esta lida. */
create index notifications_unread_idx
  on public.notifications (tenant_id, recipient_id)
  where read_at is null;

/* Apagar uma tarefa anula task_id nos avisos dela, e sem indice isso varre a
   tabela inteira a cada exclusao. Serve tambem para listar os avisos de uma
   tarefa. */
create index notifications_tenant_id_task_id_idx
  on public.notifications (tenant_id, task_id);

/* O EPISODIO DE ATRASO. E quem faz a varredura ser idempotente - ver o cabecalho.
   tenant_id nao entra: task_id e chave primaria global, logo ja determina o
   escritorio. */
create unique index notifications_overdue_episode_key
  on public.notifications (task_id, recipient_id, due_date)
  where kind = 'task_overdue'::public.notification_kind;

comment on index public.notifications_overdue_episode_key is
  'Um aviso de atraso por tarefa, por pessoa, por prazo. E o guarda da deduplicacao: a varredura insere com ON CONFLICT DO NOTHING e este indice e que decide o que e repeticao. kind e predicado e nao coluna porque atribuicao repetida e fato novo, nao duplicata; recipient_id e coluna para que quem herda uma tarefa ja atrasada seja avisado. Linha com task_id nulo (tarefa apagada) sai da unicidade, e nao faz falta: a tarefa nao existe mais para ser varrida.';

-- 4. As duas barreiras: RLS e GRANT -------------------------------------------
--
-- Separadas, e o achado da 0007 e justamente este: ligar a RLS nao protege nada
-- se o privilegio estiver aberto, e ter privilegio nao abre nada se a policy nao
-- casar. O revoke e redundante desde que a 0007 desarmou o DEFAULT PRIVILEGE,
-- e fica escrito porque redundancia barata em barreira de acesso e barata.

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;

grant select on table public.notifications to authenticated;

/* GRANT DE COLUNA, como em product_leads (0112): a unica escrita que a pessoa
   faz no proprio aviso e marcar como lido. Sem isto, a policy de UPDATE que o
   rls-guardian escrever daria, de carona, o direito de reescrever o titulo da
   tarefa e o nome de quem atribuiu - ou seja, de falsificar o aviso. */
grant update (read_at) on table public.notifications to authenticated;

-- 5. Especie 1: alguem te atribuiu uma tarefa ---------------------------------
--
-- POR QUE GATILHO, E NAO CHAMADA DA TELA
--   Mesmo argumento da 0104: a tarefa muda de responsavel por mais de um
--   caminho (formulario, arraste no kanban, script de correcao), e aviso que
--   depende de a tela lembrar de pedir e aviso que falta no caminho novo. O
--   gatilho registra a MUDANCA, venha de onde vier.

create function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_actor_id uuid;
  v_actor_name text;
begin
  /* Tarefa sem responsavel nao avisa ninguem, e tirar o responsavel tambem nao
     e aviso: nao existe "voce deixou de ser responsavel" no escopo aprovado. */
  if new.responsible_id is null then
    return new;
  end if;

  /* UPDATE que toca a coluna sem mudar o valor nao e atribuicao. O PostgREST
     manda o registro inteiro no PATCH, entao isto acontece a cada salvamento da
     tarefa. */
  if tg_op = 'UPDATE' and new.responsible_id is not distinct from old.responsible_id then
    return new;
  end if;

  /*
    O AUTOR SO VALE SE FOR DO MESMO ESCRITORIO DA TAREFA - e isto nao e zelo, e o
    que impede o aviso de derrubar a gravacao: auth_collaborator_id() le o JWT, e
    sessao de outro escritorio daria chave estrangeira invalida aqui e faria o
    UPDATE da tarefa falhar por causa da notificacao. Mesma precaucao de
    record_task_event (0104).
  */
  select c.id, c.name into v_actor_id, v_actor_name
  from public.collaborators c
  where c.id = public.auth_collaborator_id()
    and c.tenant_id = new.tenant_id;

  /* ATRIBUIR A SI MESMO NAO GERA AVISO. Quem pegou a tarefa para si acabou de
     ler o proprio gesto na tela; o sino existe para o que aconteceu enquanto a
     pessoa nao estava olhando. Sem sessao conhecida (v_actor_id nulo) nao ha
     como ser "si mesmo", e o aviso sai como Sistema. */
  if v_actor_id is not null and v_actor_id = new.responsible_id then
    return new;
  end if;

  insert into public.notifications (
    tenant_id, recipient_id, kind,
    task_id, task_title, project_name,
    actor_id, actor_name
  )
  values (
    new.tenant_id, new.responsible_id, 'task_assigned'::public.notification_kind,
    new.id, new.title,
    (select p.name from public.projects p
      where p.id = new.project_id and p.tenant_id = new.tenant_id),
    v_actor_id, v_actor_name
  );

  return new;
end;
$BODY$;

comment on function public.notify_task_assigned is
  'Gatilho que grava o aviso "alguem te atribuiu uma tarefa" (0120), com o nome de quem atribuiu lido do JWT e COPIADO para a linha. Nao avisa quem se atribuiu a propria tarefa, nem repete quando o salvamento manda o mesmo responsavel de novo. Reatribuir de A para B e de volta para A avisa A duas vezes de proposito: aconteceram duas coisas.';

revoke all on function public.notify_task_assigned() from public, anon, authenticated;

create trigger tasks_notify_assigned
  after insert or update of responsible_id on public.tasks
  for each row execute function public.notify_task_assigned();

comment on trigger tasks_notify_assigned on public.tasks is
  'AFTER, e nao BEFORE: o aviso so existe se a tarefa existir. UPDATE OF responsible_id para nao acordar a cada edicao de titulo ou de hora.';

-- 6. Especie 2: a varredura do atraso -----------------------------------------
--
-- A REGUA DO "VENCEU": due_date < current_date, a mesma expressao de
-- public.is_overdue (0043) no financeiro. Tarefa que vence HOJE nao esta
-- atrasada - e o dia dela ainda nao acabou.
--
--   ISTO DIVERGE, por algumas horas, do crachao vermelho do kanban.
--   isTaskOverdue (src/features/projects/list.ts) compara `new Date(due_date)`,
--   que e meia-noite em UTC, com o agora local, e por isso marca a tarefa que
--   vence hoje como atrasada desde as 21h de ontem em Goiania. Aquele
--   comportamento esta no ar desde o modulo 5 e a correcao dele e decisao do
--   usuario, registrada no relatorio do modulo 10. A varredura NAO copia o
--   defeito: avisar "seu prazo venceu" na vespera do vencimento seria mentira
--   gravada em linha, que e pior do que crachao adiantado na tela.
--
-- O FUSO ENTRA PELA HORA DO AGENDAMENTO, e nao por conta:
--   o banco roda em UTC e o cron da Supabase tambem. Agendada as 09:00 UTC, a
--   varredura acorda as 06:00 em Goiania, e nesse instante current_date (UTC) e
--   a data local - os dois so divergem entre 21h e meia-noite, e a varredura
--   nunca roda nessa faixa. Chamada A MAO depois das 21h, ela adianta em um dia
--   o aviso das tarefas que vencem hoje.

create function public.scan_overdue_tasks(p_tenant_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $BODY$
declare
  v_created integer;
begin
  insert into public.notifications (
    tenant_id, recipient_id, kind,
    task_id, task_title, project_name,
    due_date
  )
  select t.tenant_id, t.responsible_id, 'task_overdue'::public.notification_kind,
         t.id, t.title, p.name,
         t.due_date
    from public.tasks t
    left join public.projects p
      on p.id = t.project_id and p.tenant_id = t.tenant_id
   where t.due_date is not null
     and t.due_date < current_date
     and t.status <> 'completed'
     /* Tarefa sem responsavel nao tem a quem avisar. Ela continua aparecendo em
        vermelho no quadro, que e onde esse caso se resolve. */
     and t.responsible_id is not null
     and (p_tenant_id is null or t.tenant_id = p_tenant_id)
  /*
    AQUI MORA A IDEMPOTENCIA, e com ela a resposta ao banco pausado: a consulta
    nao pergunta "o que venceu desde a ultima vez", pergunta "o que esta vencido",
    e o indice descarta o que ja foi avisado. Funciona depois de um mes
    desligada, duas vezes no mesmo dia, e no primeiro dia de um banco novo.
  */
  on conflict (task_id, recipient_id, due_date)
    where kind = 'task_overdue'::public.notification_kind
  do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$BODY$;

comment on function public.scan_overdue_tasks is
  'A varredura diaria do atraso (0120): grava um aviso por tarefa vencida e nao concluida, para o responsavel dela, e devolve quantos avisos criou. Idempotente - nao guarda marca d''agua de ultima execucao e nao olha "ontem", olha o que esta vencido agora, deixando o indice notifications_overdue_episode_key descartar o que ja foi avisado. Por isso acha tudo o que venceu enquanto o banco estava pausado, e rodar duas vezes no mesmo dia cria zero. p_tenant_id nulo (o caso do agendamento) varre todos os escritorios; preenchido, recorta um. Chamavel a mao: e o plano B do dia em que o cron falhar, e e como o teste a exercita sem esperar meia-noite.';

/*
  PARAMETRO NOMEADO, E NAO jsonb (convencao de 0112 e 0118): com jsonb, qualquer
  coluna de notifications passaria a ter caminho de entrada pelo corpo da
  requisicao - inclusive read_at, kind e os nomes copiados. Aqui entra UM uuid, e
  mais nada.

  E SO service_role: a funcao escreve avisos de qualquer pessoa de qualquer
  escritorio (e o que o agendamento precisa). Ao alcance de authenticated seria
  uma porta para encher o sino de terceiros.
*/
revoke all on function public.scan_overdue_tasks(uuid) from public, anon, authenticated;
grant execute on function public.scan_overdue_tasks(uuid) to service_role;

-- 7. O agendamento ------------------------------------------------------------
--
-- Primeiro uso de agendador no projeto. Nada abaixo pode derrubar o db push: a
-- varredura ja existe e e chamavel a mao, e o agendamento e conveniencia. O que
-- nao pode e falhar em silencio - dai o RAISE WARNING com o comando pronto,
-- idioma da 0007.

do $$
begin
  execute 'create extension if not exists pg_cron';
exception when insufficient_privilege or feature_not_supported or undefined_file then
  raise warning 'pg_cron NAO instalado: a varredura de atraso nao sera agendada. Rodar no SQL Editor do projeto, como postgres: create extension if not exists pg_cron;';
end
$$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron ausente: nenhum job criado. Depois de instalar a extensao, rodar: select cron.schedule(''scan-overdue-tasks'', ''0 9 * * *'', ''select public.scan_overdue_tasks()'');';
    return;
  end if;

  /* Idempotente de proposito: se o job ja existir (migration reaplicada em
     banco novo, ou job criado a mao antes desta migration), o antigo sai e fica
     um so. Dois jobs com o mesmo comando nao criariam aviso duplicado - o
     indice do episodio barra - mas dobrariam a varredura sem motivo. */
  if exists (select 1 from cron.job where jobname = 'scan-overdue-tasks') then
    perform cron.unschedule('scan-overdue-tasks');
  end if;

  /* 09:00 UTC = 06:00 em Goiania. A hora faz parte da regua: ver a nota de fuso
     no item 6. */
  perform cron.schedule('scan-overdue-tasks', '0 9 * * *', 'select public.scan_overdue_tasks()');
exception when insufficient_privilege or invalid_schema_name or undefined_table or undefined_function then
  raise warning 'Job de varredura NAO agendado (sem privilegio no schema cron). Rodar como postgres: select cron.schedule(''scan-overdue-tasks'', ''0 9 * * *'', ''select public.scan_overdue_tasks()'');';
end
$$;
