-- Modulo 6 (Atividades) - activities, de Atividade do base44 (25 campos).
-- Tres telas leem esta tabela: Atividades (gerencial), MinhasAtividades e
-- RelatorioProdutividade.
--
-- O QUE MUDA EM RELACAO AO ORIGINAL, E POR QUE
--
--   1. Os quatro *_name saem e viram join: colaborador_name, coordenador_name,
--      projeto_name e cliente_name. Desnormalizacao pura do base44, que nao tem
--      join - a lista quer o nome ATUAL, e no original ele congela na hora em que
--      a atividade foi criada. Nada aqui precisa ficar congelado no tempo (o
--      snapshot INTENCIONAL do projeto e o de contracts, e existe para registrar
--      o que valia na assinatura).
--
--   2. A exclusao logica troca QUATRO campos por DOIS. O original tem
--      atividade_excluida (bandeira), data_exclusao, usuario_exclusao_id e
--      usuario_exclusao_name; nada garante que andem juntos, e bandeira levantada
--      sem data - ou data sem bandeira - e estado que a tela nao sabe ler. Aqui
--      sao deleted_at e deleted_by, amarrados por check: os dois nulos (viva) ou
--      os dois preenchidos (excluida).
--
--   3. tempo_total_minutos vira COLUNA GERADA (total_minutes). No original o
--      valor e calculado no navegador na hora de concluir (Atividades.jsx:205) e
--      gravado. Campo derivado escrito pela aplicacao so esta correto enquanto
--      TODA gravacao passar pelo mesmo caminho - importacao, correcao no painel
--      ou tela nova deixam o numero mentindo, e o RelatorioProdutividade soma
--      exatamente esse numero. Mesmo raciocinio que tirou os campos de
--      deduplicacao do CRM (0015) e o progresso do projeto (0034) da mao do
--      frontend.
--
--   4. ordem_execucao e unica DENTRO DO RESPONSAVEL, e nao globalmente:
--      ReordenarAtividades.jsx arrasta dentro da lista de UMA pessoa e grava
--      index+1. Por isso a chave e (tenant_id, collaborator_id, execution_order).
--      No original nada impede duas atividades da mesma pessoa na mesma posicao,
--      e a lista passa a depender do criterio de desempate.
--
--   5. Os checks que o original nao tem, listados em docs/SCHEMA-PLAN.md, secao
--      "Modulo 6 - Regra de negocio para o teste proprio".
--
--   6. iniciado_por, concluido_por e usuario_exclusao_id apontam para
--      COLABORADOR, e nao para usuario do Auth: apesar da descricao da entidade
--      dizer "ID do usuario", o que o original grava e currentCollaborator?.id
--      (Atividades.jsx:189, :206, :668). Viram started_by, completed_by e
--      deleted_by, todos FK composta para collaborators.

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Os quatro campos que o original marca como required: descricao,
  -- colaborador_id, prazo_inicio e prazo_termino.
  description text not null,
  collaborator_id uuid not null,
  start_date date not null,
  end_date date not null,

  coordinator_id uuid,

  -- Os dois opcionais no original, e continuam opcionais: atividade interna
  -- ("revisar contrato padrao") nao tem projeto nem cliente.
  project_id uuid,
  client_id uuid,

  status public.work_status not null default 'not_started',
  priority public.priority_level not null default 'medium',

  execution_order smallint,

  started_at timestamptz,
  completed_at timestamptz,

  -- Derivada, nunca escrita: ver o comentario 3 la em cima.
  total_minutes integer
    generated always as ((round(extract(epoch from (completed_at - started_at)) / 60.0))::integer) stored,

  started_by uuid,
  completed_by uuid,

  notes text,
  last_alert_on date,

  deleted_at timestamptz,
  deleted_by uuid,

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activities_id_tenant_id_key unique (id, tenant_id),
  constraint activities_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint activities_description_not_blank_check check (btrim(description) <> ''),

  -- Ordem de execucao unica POR PESSOA. DEFERRABLE INITIALLY DEFERRED de
  -- proposito: reordenar a fila e reescrever 1..n de uma vez, e com a checagem
  -- imediata a troca de duas posicoes colide no meio do caminho (o classico
  -- "update t set n = n + 1"). Diferida, a unicidade e conferida no commit e a
  -- tela grava a lista inteira em uma transacao, sem posicao temporaria
  -- inventada. Consequencia conhecida: constraint diferivel nao serve de arbitro
  -- de ON CONFLICT - o upsert da reordenacao tem que ser por id, que e a PK.
  -- Nulos nao colidem entre si, e atividade nunca arrastada nao tem posicao.
  constraint activities_tenant_id_collaborator_id_execution_order_key
    unique (tenant_id, collaborator_id, execution_order) deferrable initially deferred,

  constraint activities_execution_order_positive_check
    check (execution_order is null or execution_order > 0),

  -- Os dois sentidos na mesma igualdade: concluida exige data/hora de conclusao,
  -- e data/hora de conclusao exige status concluida.
  constraint activities_completed_at_matches_status_check
    check ((status = 'completed') = (completed_at is not null)),

  constraint activities_started_at_not_after_completed_check
    check (started_at is null or completed_at is null or started_at <= completed_at),

  constraint activities_end_date_not_before_start_date_check
    check (end_date >= start_date),

  -- Exclusao logica: viva (os dois nulos) ou excluida (os dois preenchidos).
  constraint activities_deleted_pair_check
    check ((deleted_at is null) = (deleted_by is null)),

  -- Atividade excluida sai da fila. Sem isto, a posicao 3 de uma atividade
  -- excluida continuaria ocupada e a proxima reordenacao da mesma pessoa
  -- colidiria com uma linha que a tela nem mostra - erro sem causa visivel.
  constraint activities_deleted_has_no_execution_order_check
    check (deleted_at is null or execution_order is null)
);

-- FK compostas. Referencia por id sozinho deixaria a atividade apontar para
-- colaborador, projeto ou cliente de OUTRO escritorio: a RLS filtra o que se le,
-- nao o que se aponta. Sem ON DELETE, como nas migrations 0022, 0029 e 0032 -
-- apagar o que tem atividade vinculada falha de proposito, forcando decisao
-- explicita em vez de orfanar a linha em silencio.
alter table public.activities
  add constraint activities_collaborator_id_fkey
  foreign key (collaborator_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.activities
  add constraint activities_coordinator_id_fkey
  foreign key (coordinator_id, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.activities
  add constraint activities_project_id_fkey
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id);

alter table public.activities
  add constraint activities_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

alter table public.activities
  add constraint activities_started_by_fkey
  foreign key (started_by, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.activities
  add constraint activities_completed_by_fkey
  foreign key (completed_by, tenant_id)
  references public.collaborators (id, tenant_id);

alter table public.activities
  add constraint activities_deleted_by_fkey
  foreign key (deleted_by, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.activities is
  'Atividade atribuida a um colaborador, de Atividade do base44. Base do RelatorioProdutividade. EXCLUSAO E LOGICA: deleted_at/deleted_by no lugar da bandeira mais data mais dois campos de autor do original - atividade excluida continua contando na auditoria de quem fez o que. Quem filtra a excluida da listagem e a CONSULTA, nao a policy: quem administra precisa poder recuperar.';

comment on column public.activities.collaborator_id is
  'Responsavel pela atividade. Not null, como no original (colaborador_id e required). Nao e so uma FK: e ele que decide QUEM enxerga a linha - a policy de SELECT (migration 0038) devolve a atividade a quem nao tem can_edit no menu activities apenas quando ele e o responsavel ou o coordenador.';

comment on column public.activities.coordinator_id is
  'Coordenador do responsavel NO MOMENTO DA ATRIBUICAO, copiado de collaborators.coordinator_id pelo formulario (AtividadeForm.jsx:88 e :130), como no original. Nao e derivado de proposito: trocar o coordenador de uma pessoa nao reescreve o historico de quem acompanhou cada atividade. Consequencia aceita, e que a tela precisa conhecer: coordenador novo NAO passa a enxergar as atividades antigas de quem ele coordena, porque a policy le esta coluna.';

comment on column public.activities.start_date is
  'Prazo de inicio (prazo_inicio). Not null, como no original. E prazo planejado, e nao execucao: quem registra execucao e started_at.';

comment on column public.activities.end_date is
  'Prazo de termino (prazo_termino). Not null, como no original. E por ele que a lista ordena (Atividade.list("-prazo_termino")) e que AlertasAtividades decide o que esta atrasado.';

comment on column public.activities.started_at is
  'Data/hora real do inicio da execucao (data_inicio_real), gravada pelo botao Comecar. Entrada do calculo de total_minutes.';

comment on column public.activities.completed_at is
  'Data/hora real da conclusao (data_conclusao_real), gravada pelo botao Concluir. Amarrada a status por check nos DOIS sentidos - o que obriga a tela a gravar os dois juntos. No original o seletor de status marca "Concluida" sem tocar em data_conclusao_real (Atividades.jsx:175), e a atividade concluida por ali fica fora de qualquer relatorio por periodo e sem tempo total.';

comment on column public.activities.total_minutes is
  'Tempo de execucao em minutos, CALCULADO pelo banco a partir de started_at e completed_at. Nulo enquanto faltar um dos dois. Coluna gerada, e nao gravada: e a soma que o RelatorioProdutividade apresenta (:127 e :162), e no original ela e calculada no navegador uma unica vez, no clique de Concluir. Escrita direta e recusada pelo Postgres (428C9).';

comment on column public.activities.execution_order is
  'Posicao da atividade na fila do responsavel (ordem_execucao), definida arrastando em ReordenarAtividades.jsx. Nullable de proposito: atividade nunca arrastada nao tem posicao e cai no criterio seguinte de ordenacao (prazo de termino).';

comment on column public.activities.started_by is
  'Colaborador que clicou em Comecar (iniciado_por). E colaborador, e nao usuario do Auth: o original grava currentCollaborator?.id, apesar da descricao da entidade dizer "usuario".';

comment on column public.activities.completed_by is
  'Colaborador que clicou em Concluir (concluido_por). Pode ser diferente do responsavel: coordenador conclui atividade de quem esta de ferias.';

comment on column public.activities.last_alert_on is
  'Dia do ultimo alerta enviado (ultimo_alerta_em). AlertasAtividades.jsx a usa para nao repetir o mesmo aviso duas vezes no mesmo dia.';

comment on column public.activities.deleted_at is
  'Quando a atividade foi excluida. Nula significa viva - nao ha bandeira separada. Amarrada a deleted_by por check.';

comment on column public.activities.deleted_by is
  'Quem excluiu. Substitui usuario_exclusao_id + usuario_exclusao_name; o nome sai por join.';

comment on column public.activities.legacy_id is
  'Id da linha de Atividade no base44, preenchido so pela importacao (que roda no fim do projeto). Nulo em tudo que nasce no sistema novo.';

comment on constraint activities_tenant_id_collaborator_id_execution_order_key on public.activities is
  'A fila e POR PESSOA: duas atividades de responsaveis diferentes podem ocupar a posicao 1, duas do mesmo responsavel nao. E o recorte que ReordenarAtividades.jsx aplica na tela e que o original nao garante no dado. DEFERRABLE INITIALLY DEFERRED para que reescrever a lista inteira (1..n) em uma transacao nao colida no meio do caminho.';

comment on constraint activities_completed_at_matches_status_check on public.activities is
  'Os dois sentidos da mesma regra: atividade concluida sem data/hora nao entra em relatorio por periodo e fica sem tempo total, e data de conclusao em atividade em andamento a faz aparecer como entregue. A igualdade entre os dois booleanos cobre os dois casos em uma expressao. Mesmo desenho de tasks.completion_date (0032).';

comment on constraint activities_deleted_pair_check on public.activities is
  'deleted_at e deleted_by andam juntos. O original tem quatro campos para isto e nenhuma amarracao: bandeira levantada sem data nao diz quando, e autor sem bandeira e linha viva com dono de exclusao. Nulo/nulo e o estado normal.';

create index activities_tenant_id_created_at_idx
  on public.activities (tenant_id, created_at desc);

-- A listagem: por prazo de termino, sem as excluidas. Parcial porque excluida
-- nao aparece em nenhuma das tres telas.
create index activities_tenant_id_end_date_idx
  on public.activities (tenant_id, end_date desc)
  where deleted_at is null;

-- O outro ramo da policy de leitura (e a lista do coordenador). Parcial: a maior
-- parte das atividades nao tem coordenador.
create index activities_tenant_id_coordinator_id_idx
  on public.activities (tenant_id, coordinator_id)
  where coordinator_id is not null;

-- O RelatorioProdutividade agrupa por projeto. Parcial: atividade interna nao
-- tem projeto.
create index activities_tenant_id_project_id_idx
  on public.activities (tenant_id, project_id)
  where project_id is not null;

-- "Minhas Atividades" e o primeiro ramo da policy de leitura ja saem do indice
-- da constraint de unicidade, que comeca por (tenant_id, collaborator_id).

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- RLS AINDA NAO EXISTE NESTA TABELA.
--
-- Esta migration nao cria policy nem GRANT. Como a 0007 desarmou o DEFAULT
-- PRIVILEGE do papel postgres, a tabela nasce sem privilegio algum para anon e
-- authenticated, ou seja, invisivel pela chave publicavel. Isso NAO substitui a
-- policy: sem RLS ligada, basta um GRANT distraido para a tabela ficar exposta.
-- Precisa dos dois. A 0038 fecha, e as 26 asserçoes de
-- supabase/tests/pattern-invariants.sql cobram as duas metades.
--
-- Recorte esperado (docs/SCHEMA-PLAN.md, modulo 6, ponto 1), e ele NAO e o dos
-- modulos anteriores: quem tem can_edit_menu('activities') le todas as
-- atividades do escritorio; quem nao tem le apenas aquelas em que e o
-- responsavel ou o coordenador. Escrita por can_edit_menu('activities').
