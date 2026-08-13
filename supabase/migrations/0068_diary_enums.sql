-- Modulo 11 (Diario do Projeto) - os enums das tres entidades novas.
--
-- Mesma estrutura da 0001, 0014, 0021, 0028, 0031, 0040, 0048 e 0056: o que e
-- infraestrutura do modulo (tipos) vem em migration propria, antes das tabelas,
-- para que a migration das tabelas seja lida como o desenho do dado e nada mais.
--
-- ORIGEM DOS VALORES
--   nova-versao/base44/entities/ProjectTimelineEntry.jsonc,
--   ProjectSiteVisit.jsonc e ProjectIssue.jsonc - as tres entidades que o
--   escritorio criou no base44 DEPOIS do ponto em que esta migracao comecou, e
--   que a versao migrada nao tem. Rotulo em portugues vive na UI
--   (src/lib/enums.ts), nunca no banco, como em todo enum deste projeto.
--
-- DOIS TIPOS NAO SAEM DE UMA LISTA DECLARADA, E ISSO E DE PROPOSITO
--
--   1. diary_system_event. No base44 a natureza do evento automatico so existe
--      como PREFIXO de texto dentro de evento_chave ('fase:', 'responsavel:',
--      'tag-on:', 'tag-off:', 'relatorio:') e como palavra dentro do titulo. E
--      dai que vem o defeito 10 do plano: "Historico de Revisoes" e "Tempo por
--      Etapa" sao calculados com titulo.toLowerCase().includes('revisao')
--      (ResumoTab.jsx:128 e 157). Enquanto o tipo do evento for adivinhado a
--      partir de texto livre, renomear um titulo apaga um grafico. Aqui ele vira
--      coluna com dominio fechado. Os oito valores cobrem os cinco prefixos do
--      dado real e os tres eventos que as abas de obra gravam
--      (ObraTab.jsx:66/119 e PendenciasTab.jsx:54/96).
--
--   2. project_issue_event_type. No base44 o historico da pendencia e um array
--      de objeto cujo campo `descricao` recebe a frase pronta em portugues
--      ("Pendencia criada.", "Pendencia atualizada.", "Pendencia resolvida.",
--      PendenciasTab.jsx:45/85/103). Guardar frase de tela no banco e o mesmo
--      erro do menu de texto livre da 0004: renomear a copy invalida o
--      historico ja gravado. O tipo do evento vira enum e a frase fica na UI.
--
-- operational_tag NASCE AQUI E SO E USADO NA FATIA 3
--   A tag "Em Revisao"/"Aguardando Cliente" e da tarefa (tasks.operational_tag,
--   migration 0072 da fatia 3), mas o DIARIO precisa dela agora: a entrada
--   automatica de tag ligada/desligada guarda qual tag foi mexida em coluna, e
--   nao no texto do titulo. Criar o tipo aqui e usa-lo em duas tabelas de fatias
--   diferentes e o mesmo desenho de priority_level e work_status (0031), que
--   nascem no modulo 5 e sao compartilhados com o 6.

create type public.diary_entry_type as enum (
  'client_request',
  'project_change',
  'decision',
  'meeting',
  'approval',
  'correction',
  'delivery',
  'note',
  'other',
  'system'
);

create type public.diary_entry_status as enum (
  'in_progress',
  'completed',
  'cancelled'
);

create type public.diary_visibility as enum (
  'internal',
  'client'
);

create type public.diary_system_event as enum (
  'phase_change',
  'responsible_change',
  'tag_on',
  'tag_off',
  'site_visit',
  'issue_created',
  'issue_resolved',
  'report_generated'
);

create type public.diary_file_kind as enum (
  'photo',
  'attachment'
);

create type public.site_visit_type as enum (
  'follow_up',
  'verification',
  'inspection',
  'meeting',
  'measurement',
  'correction',
  'delivery',
  'survey',
  'other'
);

create type public.site_visit_status as enum (
  'no_issues',
  'with_issues',
  'awaiting_execution',
  'resolved'
);

create type public.project_issue_category as enum (
  'architecture',
  'interiors',
  'joinery',
  'frames',
  'electrical',
  'plumbing',
  'lighting',
  'structural',
  'landscaping',
  'finishing',
  'other'
);

create type public.project_issue_status as enum (
  'open',
  'in_progress',
  'resolved',
  'cancelled'
);

create type public.project_issue_event_type as enum (
  'created',
  'updated',
  'status_changed',
  'resolved',
  'reopened',
  'cancelled'
);

create type public.operational_tag as enum (
  'in_review',
  'awaiting_client'
);

comment on type public.diary_entry_type is
  'Tipo do registro do diario do projeto. De/para: client_request=Solicitacao do Cliente, project_change=Alteracao de Projeto, decision=Decisao, meeting=Reuniao, approval=Aprovacao, correction=Correcao, delivery=Entrega, note=Observacao, other=Outro, system=Sistema. O valor system e reservado ao registro AUTOMATICO: no original os dois andam sempre juntos (entry_type Sistema aparece nas mesmas 31 linhas em que is_automatico e verdadeiro), e project_diary_entries transforma isso em check.';

comment on type public.diary_entry_status is
  'Situacao do registro do diario, independente do projeto. De/para: in_progress=Em andamento, completed=Concluido, cancelled=Cancelado. Nao reusa public.work_status (0031) porque aquele nao tem cancelled e tem not_started, que nao existe aqui - dois dominios parecidos e diferentes.';

comment on type public.diary_visibility is
  'Quem pode ver o registro no relatorio. De/para: internal=Interno, client=Cliente. EXISTE PARA MATAR O DEFEITO 6 do plano: DiaryEntryForm.jsx:219-227 coleta a visibilidade no formulario e ProjectTimelineEntry NAO declara o campo, entao o relatorio "para o cliente" filtra por uma propriedade que nunca chega a ser gravada e nao esconde nada. ATENCAO A QUEM FOR ESCREVER O RELATORIO: a regra do original inclui TODO registro automatico no relatorio externo, independente da visibilidade (RelatorioPDFModal.jsx:45), ou seja, o filtro fiel e "visibility = client OR is_automatic" e nao "visibility = client".';

comment on type public.diary_system_event is
  'Natureza do evento automatico do diario. De/para com os prefixos de evento_chave do base44: phase_change=fase:, responsible_change=responsavel:, tag_on=tag-on:, tag_off=tag-off:, report_generated=relatorio:; e com os eventos das abas de obra: site_visit=visita:, issue_created=issue-created:, issue_resolved=issue-resolved:. Existe para que "Historico de Revisoes" e "Tempo por Etapa" deixem de ser heuristica sobre o texto do titulo (defeito 10 do plano). Nulo em registro manual - o check de project_diary_entries amarra os dois.';

comment on type public.diary_file_kind is
  'Natureza do arquivo anexado. De/para: photo=item do array fotos, attachment=item dos arrays anexos e arquivos. A distincao NAO e decorativa: a aba Fotos e o lightbox do original agregam so as fotos (FotosTab.jsx), e o restante aparece como clipe de papel. Como as tres listas viram UMA tabela, o que as separava (o nome do array) precisa virar coluna.';

comment on type public.site_visit_type is
  'Tipo da visita a obra. De/para: follow_up=Acompanhamento, verification=Conferencia, inspection=Fiscalizacao, meeting=Reuniao, measurement=Medicao, correction=Correcao, delivery=Entrega, survey=Vistoria, other=Outro.';

comment on type public.site_visit_status is
  'Resultado da visita. De/para: no_issues=Sem pendencias, with_issues=Com pendencias, awaiting_execution=Aguardando execucao, resolved=Resolvido. with_issues e o valor que abre o formulario de pendencia vinculada a visita (ObraTab.jsx:77), fluxo que a fatia 2 precisa preservar.';

comment on type public.project_issue_category is
  'Categoria da pendencia de obra. De/para: architecture=Arquitetura, interiors=Interiores, joinery=Marcenaria, frames=Esquadrias, electrical=Eletrica, plumbing=Hidraulica, lighting=Iluminacao, structural=Estrutura, landscaping=Paisagismo, finishing=Acabamento, other=Outro. Nao reusa public.supplier_category (0048): la a lista descreve o que um FORNECEDOR vende, aqui descreve a disciplina de uma pendencia de obra, e as listas so se parecem em parte.';

comment on type public.project_issue_status is
  'Situacao da pendencia. De/para: open=Aberta, in_progress=Em andamento, resolved=Resolvida, cancelled=Cancelada. resolved e o unico valor que exige resolved_at, e a igualdade e nos dois sentidos (ver o check de project_issues).';

comment on type public.project_issue_event_type is
  'O que aconteceu com a pendencia, em cada linha do historico. De/para com as frases que o original grava dentro do array historico: created="Pendencia criada.", updated="Pendencia atualizada.", resolved="Pendencia resolvida.". status_changed, reopened e cancelled nao existem la porque o original so registra tres gestos - aqui o historico e escrito por trigger e enxerga toda mudanca de status, inclusive a que reabre uma pendencia ja resolvida. A frase em portugues fica na UI.';

comment on type public.operational_tag is
  'Status operacional da tarefa. De/para: in_review=Em Revisao, awaiting_client=Aguardando Cliente. COMPARTILHADO por project_diary_entries.operational_tag (0069, o diario registrando qual tag foi ligada ou desligada) e por tasks.operational_tag (migration 0072, fatia 3). Sem recorte de fase de proposito: o pareamento fase-tag do menu da versao nova ("Layout" e "Perspectivas" tem as duas, "Projeto Legal" e "Projeto Executivo" so Em Revisao) e oferta de tela, nao regra de dominio - virar check faria um arraste legitimo virar erro de banco no dia em que tela e check discordassem.';
