import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import type { TablesInsert } from '@/lib/database.types'
import { useCurrentCollaborator, useCurrentTenant } from '@/features/auth/hooks'
import {
  PROJECT_ISSUE_CATEGORY,
  SITE_VISIT_STATUS,
  SITE_VISIT_TYPE,
  type DiaryFileKind,
  type OperationalTag,
  type ProjectPhase,
} from '@/lib/enums'
import {
  diaryEntryInputSchema,
  projectIssueInputSchema,
  siteVisitInputSchema,
} from './schemas'
import {
  describeRejectedFile,
  diaryFilePath,
  DIARY_FILES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  type DiaryFileParent,
} from './files'
import { nowClockTime, todayISODate } from './obra'
import {
  buildReportHTML,
  printReport,
  reportLogText,
  REPORT_FALLBACK_AUTHOR,
} from './report'
import type {
  DiaryEntryInput,
  DiaryEntryRow,
  DiaryProject,
  ProjectIssueInput,
  ProjectIssueRow,
  ReportOptions,
  ReportPhoto,
  ReportPhotoWithUrl,
  SiteVisitInput,
  SiteVisitRow,
} from './types'

export const diaryKeys = {
  all: ['diary'] as const,
  entries: (projectId: string) => [...diaryKeys.all, 'entries', projectId] as const,
  visits: (projectId: string) => [...diaryKeys.all, 'visits', projectId] as const,
  issues: (projectId: string) => [...diaryKeys.all, 'issues', projectId] as const,
  /*
    FORA de `all` de propósito, como no módulo 8: a URL assinada não é dado do
    diário, é uma credencial temporária para um objeto do Storage. Invalidar o
    diário inteiro a cada gravação não deve derrubar o link que alguém está
    usando para abrir um anexo, e a URL expira sozinha.
  */
  fileUrl: (path: string) => ['diary-file-url', path] as const,
}

/*
  DEFEITO 15 DO PLANO: as consultas do diário na versão nova não têm teto —
  `ProjectTimelineEntry.filter({ project_id })` (ProjectDiaryDrawer.jsx:84) traz
  o que houver. Hoje são 36 registros no escritório inteiro; com os eventos
  automáticos da fatia 3, um projeto de dois anos passa a somar um registro por
  arraste de cartão. Mesmo teto do módulo 5.
*/
const LIST_LIMIT = 500

const DIARY_ERROR_MESSAGES: DatabaseErrorMessages = {
  /*
    O 42501 DESTE MÓDULO TEM DONO CERTO, e por isso ele sobrepõe o texto geral
    ("Você não tem permissão para executar esta ação").

    O diário é a ÚNICA superfície do sistema cuja escrita não passa por
    `can_edit_menu` (migration 0070): quem escreve é Diretor ou Coordenador, por
    função, e um Arquiteto com permissão de edição em Fluxo do Projeto — que os
    sete Arquitetos do escritório real têm — é recusado aqui. Dizer só "sem
    permissão" mandaria essa pessoa pedir uma permissão de menu que ela já tem.
  */
  '42501':
    'Só Diretor e Coordenador escrevem no Diário do Projeto. Você continua lendo o histórico inteiro.',

  '23503':
    'O projeto ou o responsável informado não existe mais neste escritório. Recarregue a página e tente de novo.',

  /*
    Os checks das migrations 0068-0069. O schema Zod normaliza antes de gravar,
    então chegar aqui significa gravação vinda de outro caminho — a frase existe
    para não virar nome de constraint na tela.
  */
  '23514':
    'O registro está num estado que o sistema não aceita. Confira o tipo, o título e a data.',

  /*
    ═══ OS CHECKS DA VISITA E DA PENDÊNCIA, um a um ═══

    O `23514` acima é rede de segurança; estas frases são o que a pessoa lê. O
    nome da constraint tem prioridade sobre o código (src/lib/db-errors.ts), e é
    por isso que as duas coisas convivem: a frase certa quando o banco diz qual
    regra foi violada, e a genérica quando ele não diz.

    NENHUMA DELAS DEVERIA APARECER com o formulário funcionando — `siteVisitInput
    Schema` e `projectIssueInputSchema` barram antes, com a mesma informação e
    apontando para o campo. Elas existem porque "não deveria" não é "não pode":
    requisição montada fora da tela, aba aberta enquanto outra pessoa muda a
    linha, e o dia em que alguém acrescentar um caminho de escrita novo.
  */
  project_site_visits_summary_not_blank_check:
    'A visita precisa de um resumo. Escreva o que foi verificado na obra.',

  project_issues_description_not_blank_check:
    'A pendência precisa de uma descrição. Escreva o que precisa ser corrigido.',

  project_issues_due_date_not_before_identified_check:
    'O prazo não pode ser anterior à data de identificação da pendência.',

  /*
    Os dois lados da resolução. Quem escolhe o status é a tela; quem preenche
    `resolved_at` e `resolved_by_id` é o hook, num lugar só (ver
    `resolutionFieldsFor`). Chegar aqui significa que os dois se separaram — e a
    frase fala do estado, não das colunas, porque quem lê não escolheu coluna
    nenhuma.
  */
  project_issues_resolved_at_matches_status_check:
    'A pendência ficou num estado incoerente: resolvida sem data de resolução, ou com data sem estar resolvida. Recarregue a página e tente de novo.',

  project_issues_resolved_by_requires_resolved_check:
    'Só pendência resolvida guarda quem a resolveu. Marque a pendência como resolvida antes de registrar o responsável pela solução.',

  /*
    O número da pendência é alocado pelo trigger `project_issues_assign_number`
    e nenhuma tela oferece o campo (defeito 8 do plano). Um número zero ou
    negativo só chega aqui por gravação vinda de fora da tela.
  */
  project_issues_issue_number_positive_check:
    'O número da pendência é gerado pelo sistema e precisa ser maior que zero. Recarregue a página e tente de novo.',

  /*
    Os dois de `project_issue_events`. O histórico é escrito por TRIGGER
    (migration 0069), que nunca produz nenhum dos dois estados — a frase é para
    a policy de INSERT que existe ao lado dele, para o caso de uma anotação com
    texto próprio.
  */
  project_issue_events_description_not_blank_check:
    'A anotação do histórico não pode ficar em branco.',

  project_issue_events_status_change_has_statuses_check:
    'O evento de criação da pendência não pode declarar um status anterior — ela não tinha nenhum antes de existir.',
}

export function describeDiaryError(error: unknown): string {
  return describeError(error, DIARY_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/*
  QUEM ESCREVE NO DIÁRIO, do lado do cliente — e esta é a única regra de escrita
  do sistema que NÃO é permissão de menu.

  Ela reproduz `is_project_diary_writer()` (migration 0070) termo a termo:
  Diretor ou Coordenador, e `active`. O helper do banco embute o filtro de
  status porque `auth_collaborator_role()` embute (migration 0007) — Diretor em
  Férias ou Afastado não escreve, e aqui também não.

  POR QUE NÃO `useMenuPermissions('project_flow')`, que é o que o resto do Fluxo
  do Projeto usa: porque o banco não pergunta isso aqui. Tela e banco
  discordando sobre quem escreve é o defeito que o `ARCHITECTURE.md` já registra
  — a tela prometendo o botão e a RLS devolvendo 42501, ou o contrário. A
  decisão de manter o recorte por função é do usuário ("mantém o fluxo como
  veio", plano do módulo 11).

  O `role === 'admin'` da expressão do original (ProjectDiaryDrawer.jsx:133) não
  tem equivalente: é papel de PLATAFORMA do base44, e o correspondente aqui é o
  `service_role`, que não passa por policy nenhuma nem abre tela.

  LER É OUTRA COISA, e é largo: qualquer colaborador ativo lê o diário inteiro,
  inclusive registro marcado como interno. Não há hook para isso porque não há o
  que decidir — quem não pode ler recebe zero linha da RLS.
*/
export function useCanWriteProjectDiary(): boolean {
  const { data } = useCurrentCollaborator()
  if (!data || data.status !== 'active') return false
  return data.role === 'director' || data.role === 'coordinator'
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  Os três `*_name` do base44 (`responsavel_name`, `criado_por_name`,
  `atualizado_por_name`) saíram do schema (migration 0069) e voltam como embed: a
  linha do tempo quer o nome ATUAL da pessoa. O nome do relacionamento é o da
  CONSTRAINT porque as FK são compostas `(coluna, tenant_id)`.

  `atualizado_por_name` não é lido por tela nenhuma do original — a coluna
  `updated_by_id` é gravada e não exibida —, então não entra no select.

  Os anexos vêm juntos: no base44 eles são um array DENTRO da linha, e a tela
  desenha o clipe e a lista sem pedir mais nada. Uma consulta a mais por entrada
  seria uma requisição por cartão da linha do tempo.
*/
const ENTRIES_SELECT = `
  *,
  responsible:collaborators!project_diary_entries_responsible_id_fkey(id, name),
  created_by:collaborators!project_diary_entries_created_by_id_fkey(id, name),
  files:project_diary_files!project_diary_files_entry_id_fkey(*)
`

/*
  O diário de UM projeto, do mais recente para o mais antigo — a consulta que a
  gaveta faz ao abrir (ProjectDiaryDrawer.jsx:82-86), e o recorte exato do
  índice `project_diary_entries_tenant_id_project_id_occurrence_date_idx`.

  A SEGUNDA ORDEM (`created_at desc`) NÃO EXISTE NO ORIGINAL, e ela não muda o
  que a tela mostra: existe porque `occurrence_date` é DATE, vários registros do
  mesmo dia empatam, e empate sem critério deixa o banco livre para devolver o
  dia em ordem diferente a cada consulta. O agrupamento por dia preserva a ordem
  de chegada, então sem isto a lista se reembaralharia sozinha entre um refetch
  e outro.

  Leitura larga por decisão da migration 0070: qualquer colaborador ativo do
  escritório lê, inclusive o registro marcado como interno. `visibility` recorta
  o RELATÓRIO para o cliente, nunca o acesso de quem trabalha no escritório.
*/
export function useProjectDiaryEntries(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: diaryKeys.entries(projectId ?? ''),
    enabled: Boolean(projectId) && enabled,
    queryFn: async (): Promise<DiaryEntryRow[]> => {
      const { data, error } = await supabase
        .from('project_diary_entries')
        .select(ENTRIES_SELECT)
        .eq('project_id', projectId as string)
        .order('occurrence_date', { ascending: false })
        .order('created_at', { ascending: false })
        /* Os anexos na ordem em que foram enviados, que é a ordem em que o
           original os desenha (o array `anexos` cresce por concatenação,
           DiaryEntryForm.jsx:102). */
        .order('created_at', { referencedTable: 'files' })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as DiaryEntryRow[]
    },
  })
}

/* ── Escrita: o registro manual ────────────────────────────────────────── */

/*
  CRIAR UM REGISTRO (ProjectDiaryDrawer.jsx:94-102 e :129).

  O QUE O ORIGINAL MANDA E AQUI NÃO EXISTE: `project_name`, `criado_por_name` e
  `is_automatico: false`. Os dois primeiros são nome copiado (viram join,
  migration 0069) e o terceiro é o default da coluna — e a policy de INSERT
  recusaria o valor verdadeiro de qualquer forma.

  `created_by_id` APONTA PARA COLABORADOR, e não para o usuário do Auth como no
  base44 (`currentUser.id`): é a escolha de todo o sistema — quem responde por
  trabalho é colaborador, e nem todo colaborador tem login.

  OS ANEXOS ENTRAM DEPOIS DO REGISTRO, e não há como ser diferente: o caminho do
  objeto contém o id da mãe (migration 0071) e a linha de `project_diary_files`
  tem FK para ela. Se um anexo falhar, o registro JÁ ESTÁ GRAVADO e o erro sobe
  — a tela avisa que o anexo não subiu, e o que a pessoa escreveu não se perde.
*/
export function useCreateDiaryEntry() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      projectId,
      input,
      files,
    }: {
      projectId: string
      input: DiaryEntryInput
      files: File[]
    }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = diaryEntryInputSchema.parse(input)

      const { data, error } = await supabase
        .from('project_diary_entries')
        .insert({
          ...parsed,
          project_id: projectId,
          tenant_id: tenantId,
          created_by_id: collaborator?.id ?? null,
        })
        .select('id')
        .single()

      if (error) throw error

      await uploadDiaryFiles({
        tenantId,
        parent: 'entries',
        parentId: data.id,
        uploadedById: collaborator?.id ?? null,
        files,
      })

      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  EDITAR UM REGISTRO (ProjectDiaryDrawer.jsx:104-112 e :127).

  SÓ REGISTRO MANUAL chega aqui: o lápis não aparece no cartão de evento de
  sistema (:328) e, desde a migration 0070, o WITH CHECK da policy de UPDATE
  recusa `is_automatic` — o que também impede promover um registro manual a
  automático depois de criado.

  Os anexos são aplicados JUNTO COM O SALVAMENTO, e não a cada clique no
  formulário: quem remove um clipe e depois cancela não teve nada removido. É a
  diferença entre esta tela e o drawer do módulo 8, onde cada anexo é um gesto
  isolado fora de formulário.

  A ORDEM É REMOVER E DEPOIS ENVIAR, e não o contrário: se o envio falhar, o que
  a pessoa pediu para tirar já saiu, e o formulário reaberto mostra o estado
  real.
*/
export function useUpdateDiaryEntry() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      id,
      input,
      newFiles,
      removedFileIds,
    }: {
      id: string
      input: DiaryEntryInput
      newFiles: File[]
      removedFileIds: string[]
    }) => {
      const parsed = diaryEntryInputSchema.parse(input)

      const { data, error } = await supabase
        .from('project_diary_entries')
        .update({ ...parsed, updated_by_id: collaborator?.id ?? null })
        .eq('id', id)
        .select('id, tenant_id')

      if (error) throw error
      assertRowAffected(
        data,
        'O registro não foi alterado. Só Diretor e Coordenador escrevem no Diário do Projeto.',
      )

      await removeDiaryFiles(removedFileIds)

      await uploadDiaryFiles({
        tenantId: data[0].tenant_id,
        parent: 'entries',
        parentId: id,
        uploadedById: collaborator?.id ?? null,
        files: newFiles,
      })

      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  EXCLUIR UM REGISTRO (ProjectDiaryDrawer.jsx:114-121).

  DEFEITO 14 DO PLANO: no original a exclusão apaga o documento e os anexos
  ficam no storage do base44, pagos e alcançáveis por quem tiver a URL. Aqui as
  linhas de `project_diary_files` somem por cascade — e o cascade NÃO leva o
  objeto do bucket junto, porque Storage não tem FK (migration 0071). Por isso
  os caminhos são colhidos ANTES do DELETE: é a única hora em que ainda dá para
  saber quais eram.

  A remoção do Storage é o ÚLTIMO passo e não derruba a exclusão: a linha já
  saiu, e falhar aqui deixa arquivo órfão — o estado que o original já tem —, e
  não um registro meio apagado. Fechar de verdade pede faxina que compare bucket
  com banco, e isso está declarado na migration.
*/
export function useDeleteDiaryEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const paths = await collectDiaryFilePaths('entries', id)

      const { data, error } = await supabase
        .from('project_diary_entries')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O registro não foi excluído. Só Diretor e Coordenador escrevem no Diário do Projeto.',
      )

      await removeStorageObjects(paths)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/* ── O evento automático ───────────────────────────────────────────────── */

/*
  GRAVAR NA LINHA DO TEMPO O QUE O SISTEMA FEZ.

  Sete dos oito valores de `diary_system_event` passam por aqui. Três nascem nas
  abas de obra deste arquivo — `site_visit`, `issue_created` e `issue_resolved`
  (ObraTab.jsx:66/119 e PendenciasTab.jsx:96) — e quatro nascem no FLUXO DO
  PROJETO: `phase_change`, `responsible_change`, `tag_on` e `tag_off`, dentro de
  `useMoveTaskPhase`, `useChangeTaskResponsible` e `useSetTaskOperationalTag`
  (src/features/projects/hooks.ts). Por isso esta função é exportada: o gesto que
  gera o evento é de outro módulo, mas quem sabe conversar com
  `record_project_diary_event` é o diário — duas cópias desta chamada seriam duas
  chances de montar o `event_key` de jeitos diferentes.

  O oitavo, `report_generated`, é da fatia 4 e é o único cuja chave vai NULA: não
  há fato repetível em gerar relatório duas vezes.

  POR QUE UMA FUNÇÃO DO BANCO, E NÃO UM INSERT: a policy de INSERT de
  `project_diary_entries` RECUSA `is_automatic` para todo mundo, inclusive
  Diretor (migration 0070) — evento de sistema é justamente o que ninguém
  confere, porque se supõe que a máquina escreveu. O único caminho é
  `record_project_diary_event`, que é SECURITY DEFINER e confere por dentro a
  permissão do FLUXO.

  A CHAVE É DERIVADA DO FATO, e nunca do relógio. No original ela leva
  `Date.now()` (defeito 5 do plano): o campo se chama "idempotência" e a consulta
  prévia que deveria deduplicar nunca encontra nada, porque a chave é diferente a
  cada chamada. Aqui quem decide é a unicidade `(tenant_id, event_key)`, e o
  ON CONFLICT DO NOTHING de dentro da função devolve `already_recorded` sem
  gravar nada — dois cliques, duas abas ou um salvamento repetido produzem UM
  registro.

  FALHAR AQUI NÃO DESFAZ O QUE JÁ ACONTECEU, e não tem como: a visita, a
  pendência, o arraste do cartão e a troca de responsável já foram gravados, em
  transações que já fecharam. Mas também não é engolido em silêncio, que é o que
  o original faz (diaryAutoEvents.js:32-35 dá console.error e segue, e o
  resultado é um diário com buracos que ninguém percebe). O resultado volta como
  valor, e a tela avisa que o registro ficou de fora.
*/
export type DiaryEventOutcome = 'recorded' | 'already_recorded' | 'failed'

export type RecordedDiaryEvent = {
  outcome: DiaryEventOutcome
  entryId: string | null
}

/*
  O FATO, EM COLUNA — e o tipo é o que impede montar uma chamada incoerente.

  `project_diary_entries` tem quatro checks que amarram as colunas estruturadas
  ao evento que as gera (migration 0069): fase só em `phase_change`, tag só em
  `tag_on`/`tag_off`, `phase_change` EXIGE `to_phase` e evento de tag EXIGE a
  tag. Violar qualquer um deles não produz mensagem própria: a função é
  `security definer` e o check estoura por baixo dela, então o que volta é o
  `23514` cru, com nome de constraint — descoberto na auditoria desta fatia.

  Por isso a união discriminada: `phase_change` sem `to_phase` ou `tag_on` sem
  tag não compilam, e o erro deixa de ser um caso de execução. É a mesma ideia
  do `Omit<..., 'issue_number'>` de `useCreateProjectIssue` — escrever no tipo o
  que o banco cobra e o gerador não sabe.

  `from_phase` é anulável de propósito, e só nele: sair de lugar nenhum é
  possível (as 31 linhas importadas do base44 não têm a etapa de origem), chegar
  a lugar nenhum não é.
*/
export type DiaryEventFact =
  | {
      systemEvent:
        | 'site_visit'
        | 'issue_created'
        | 'issue_resolved'
        | 'responsible_change'
        | 'report_generated'
    }
  | { systemEvent: 'phase_change'; fromPhase: ProjectPhase | null; toPhase: ProjectPhase }
  | { systemEvent: 'tag_on' | 'tag_off'; operationalTag: OperationalTag }

export async function recordDiaryEvent(
  params: {
    projectId: string
    title: string
    description: string | null
    /*
      A CHAVE VAI NULA NUM CASO SÓ, e é o `report_generated`: gerar o relatório
      duas vezes são dois fatos, e não uma repetição a deduplicar. Nulo não
      colide com nulo em índice único, então os dois registros entram — é a
      decisão escrita no cabeçalho da migration 0070, e o contrário do
      `relatorio:<projeto>:${Date.now()}` do original, que finge uma chave de
      idempotência que nunca deduplica nada (defeito 5 do plano).
    */
    eventKey: string | null
    responsibleId: string | null
  } & DiaryEventFact,
): Promise<RecordedDiaryEvent> {
  const { data, error } = await supabase.rpc('record_project_diary_event', {
    p_project_id: params.projectId,
    p_system_event: params.systemEvent,
    p_title: params.title,
    p_description: params.description ?? undefined,
    p_event_key: params.eventKey ?? undefined,
    p_responsible_id: params.responsibleId ?? undefined,
    p_from_phase:
      params.systemEvent === 'phase_change' ? (params.fromPhase ?? undefined) : undefined,
    p_to_phase: params.systemEvent === 'phase_change' ? params.toPhase : undefined,
    p_operational_tag:
      params.systemEvent === 'tag_on' || params.systemEvent === 'tag_off'
        ? params.operationalTag
        : undefined,
    /*
      O CARIMBO É O DE AGORA, no relógio de QUEM ESTÁ USANDO — e não a data da
      visita nem a de identificação da pendência. É o que o original faz
      (diaryAutoEvents.js:28-29): o evento conta quando o registro foi feito, e é
      por essa data que a linha do tempo o agrupa. Passar o relógio do navegador
      em vez de deixar o banco resolver é deliberado; ver `nowClockTime`.
    */
    p_occurrence_date: todayISODate(),
    p_occurrence_time: nowClockTime(),
  })

  if (error) {
    console.error('[diary] evento automático não registrado:', error)
    return { outcome: 'failed', entryId: null }
  }

  const result = data as { outcome?: string; entryId?: string } | null
  return {
    outcome: result?.outcome === 'already_recorded' ? 'already_recorded' : 'recorded',
    entryId: result?.entryId ?? null,
  }
}

/* ── Aba Obra: as visitas ──────────────────────────────────────────────── */

/*
  `responsavel_name` e `criado_por_name` não viraram coluna (migration 0069):
  voltam como embed, pelo nome da CONSTRAINT, porque as FK são compostas. Só o
  primeiro entra — o segundo não é lido por tela nenhuma do original.

  Os arquivos vêm juntos, e são UMA lista onde o base44 tem duas (`fotos` e
  `arquivos`): quem as separa é `file_kind`. Sem o embed, a fita de miniaturas
  pediria uma consulta por cartão.
*/
const VISITS_SELECT = `
  *,
  responsible:collaborators!project_site_visits_responsible_id_fkey(id, name),
  files:project_diary_files!project_diary_files_visit_id_fkey(*)
`

/*
  As visitas de UM projeto, da mais recente para a mais antiga — o recorte de
  ObraTab.jsx:47 e do índice
  `project_site_visits_tenant_id_project_id_visit_date_idx`.

  A SEGUNDA ORDEM (`created_at desc`) não existe no original e não muda o que a
  tela mostra: `visit_date` é DATE, duas visitas do mesmo dia empatam, e empate
  sem critério deixa o banco livre para devolver o dia em ordem diferente a cada
  consulta — a lista se reembaralharia sozinha entre um refetch e outro. Mesma
  decisão de `useProjectDiaryEntries`.
*/
export function useProjectSiteVisits(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: diaryKeys.visits(projectId ?? ''),
    enabled: Boolean(projectId) && enabled,
    queryFn: async (): Promise<SiteVisitRow[]> => {
      const { data, error } = await supabase
        .from('project_site_visits')
        .select(VISITS_SELECT)
        .eq('project_id', projectId as string)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })
        /* Fotos e anexos na ordem em que foram enviados, que é a ordem em que o
           original os desenha (os arrays crescem por concatenação). */
        .order('created_at', { referencedTable: 'files' })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as SiteVisitRow[]
    },
  })
}

/*
  O TEXTO DA ENTRADA DE DIÁRIO QUE A VISITA GERA (ObraTab.jsx:64-65), com os
  rótulos em português vindos de `src/lib/enums.ts` — no base44 a coluna já
  guarda o rótulo, aqui ela guarda o valor do enum.

  O que o original monta e aqui continua igual: o título com o tipo da visita, e
  a descrição com resumo, observações, o status quando ele não é "Sem
  pendências", e a contagem de fotos e de arquivos.
*/
function visitEventText(
  input: SiteVisitInput,
  counts: { photos: number; attachments: number },
): { title: string; description: string } {
  const parts = [input.summary]
  if (input.notes) parts.push(`\n\n${input.notes}`)
  if (input.status !== 'no_issues') parts.push(`\n\nStatus: ${SITE_VISIT_STATUS[input.status]}`)
  if (counts.photos > 0) parts.push(`\n📷 ${counts.photos} foto(s)`)
  if (counts.attachments > 0) parts.push(`\n📎 ${counts.attachments} arquivo(s)`)

  return {
    title: `🏗️ Visita à obra — ${SITE_VISIT_TYPE[input.visit_type]}`,
    description: parts.join(''),
  }
}

/* A chave do evento da visita, derivada do fato. Mesmo formato do original
   (`visita:<projeto>:<visita>`) e SEM o relógio — ver `recordDiaryEvent`. */
const visitEventKey = (projectId: string, visitId: string) => `visita:${projectId}:${visitId}`

/*
  REGISTRAR UMA VISITA À OBRA (ObraTab.jsx:57-82).

  A ORDEM DOS PASSOS: grava a visita, sobe as fotos e os arquivos, registra o
  evento na linha do tempo e GUARDA O VÍNCULO entre os dois.

  O VÍNCULO É O DEFEITO 7 DO PLANO. `ProjectSiteVisit` declara
  `timeline_entry_id` e ObraTab.jsx:58-68 cria a visita, cria a entrada e não
  grava o vínculo em lugar nenhum — o campo nasce e morre vazio, e por isso
  editar a visita nunca teve como corrigir a entrada que ela gerou (defeito 13).
  Aqui `diary_entry_id` é FK de verdade e é escrita aqui, no mesmo gesto.

  SE O UPLOAD FALHAR, A VISITA JÁ ESTÁ GRAVADA e o erro sobe — o mesmo desenho de
  `useCreateDiaryEntry`, e pelo mesmo motivo: o caminho do objeto contém o id da
  mãe, então não há como subir arquivo antes de a mãe existir. O que a pessoa
  escreveu não se perde por causa de uma foto.
*/
export function useCreateSiteVisit() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      projectId,
      input,
      photos,
      attachments,
    }: {
      projectId: string
      input: SiteVisitInput
      photos: File[]
      attachments: File[]
    }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = siteVisitInputSchema.parse(input)

      const { data, error } = await supabase
        .from('project_site_visits')
        .insert({
          ...parsed,
          project_id: projectId,
          tenant_id: tenantId,
          created_by_id: collaborator?.id ?? null,
        })
        .select('id')
        .single()

      if (error) throw error

      await uploadDiaryFiles({
        tenantId,
        parent: 'visits',
        parentId: data.id,
        kind: 'photo',
        uploadedById: collaborator?.id ?? null,
        files: photos,
      })

      await uploadDiaryFiles({
        tenantId,
        parent: 'visits',
        parentId: data.id,
        kind: 'attachment',
        uploadedById: collaborator?.id ?? null,
        files: attachments,
      })

      const event = await linkVisitDiaryEntry({
        projectId,
        visitId: data.id,
        input: parsed,
        counts: { photos: photos.length, attachments: attachments.length },
      })

      /* O status volta para a tela porque é ele que decide o passo seguinte:
         "Com pendências" abre o formulário de pendência já vinculado a esta
         visita (ObraTab.jsx:77). */
      return { id: data.id, status: parsed.status, event }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  EDITAR UMA VISITA (ObraTab.jsx:84-92).

  DEFEITO 13 DO PLANO, e é preciso dizer exatamente até onde ele foi corrigido.

  O que o original faz: editar a visita não toca na entrada de diário que ela
  gerou — e nem teria como, porque o vínculo nunca foi gravado (defeito 7). Se
  alguém salvar de novo por um caminho que registre o evento outra vez, nasce uma
  SEGUNDA entrada para a mesma visita, porque a chave lá carrega `Date.now()`.

  O que fica garantido aqui: NUNCA nasce uma segunda entrada. A chave é derivada
  da visita (`visita:<projeto>:<visita>`) e a unicidade é do banco; salvar dez
  vezes devolve `already_recorded` dez vezes.

  O QUE NÃO É FEITO, E POR QUÊ: o TEXTO da entrada já gravada não é reescrito. A
  entrada é `is_automatic`, e o WITH CHECK da policy de UPDATE (migration 0070)
  recusa qualquer gravação que a deixe automática — ou seja, nem Diretor edita
  evento de sistema pela API, por decisão explícita daquela migration. Reescrever
  exigiria uma função SECURITY DEFINER companheira, que é migration, e esta fatia
  não tem migration. Fica registrado no relatório da fatia.

  O que é feito: se a visita ainda não tem entrada (o evento falhou quando ela
  foi criada), salvar a visita CRIA a entrada que faltava, com o texto atual.
*/
export function useUpdateSiteVisit() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      input,
      newPhotos,
      newAttachments,
      removedFileIds,
    }: {
      id: string
      projectId: string
      input: SiteVisitInput
      newPhotos: File[]
      newAttachments: File[]
      removedFileIds: string[]
    }) => {
      const parsed = siteVisitInputSchema.parse(input)

      const { data, error } = await supabase
        .from('project_site_visits')
        .update(parsed)
        .eq('id', id)
        .select('id, tenant_id, diary_entry_id')

      if (error) throw error
      assertRowAffected(
        data,
        'A visita não foi alterada. Só Diretor e Coordenador escrevem no Diário do Projeto.',
      )

      /* Remover antes de enviar, como no formulário da linha do tempo: se o
         envio falhar, o que a pessoa pediu para tirar já saiu, e o formulário
         reaberto mostra o estado real. */
      await removeDiaryFiles(removedFileIds)

      await uploadDiaryFiles({
        tenantId: data[0].tenant_id,
        parent: 'visits',
        parentId: id,
        kind: 'photo',
        uploadedById: collaborator?.id ?? null,
        files: newPhotos,
      })

      await uploadDiaryFiles({
        tenantId: data[0].tenant_id,
        parent: 'visits',
        parentId: id,
        kind: 'attachment',
        uploadedById: collaborator?.id ?? null,
        files: newAttachments,
      })

      let event: RecordedDiaryEvent = { outcome: 'already_recorded', entryId: data[0].diary_entry_id }

      if (!data[0].diary_entry_id) {
        event = await linkVisitDiaryEntry({
          projectId,
          visitId: id,
          input: parsed,
          counts: await countVisitFiles(id),
        })
      }

      return { id, status: parsed.status, event }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  Quantas fotos e quantos arquivos a visita tem AGORA. Só é consultado no caminho
  em que a entrada de diário precisa ser criada depois do fato (ver
  `useUpdateSiteVisit`) — no caminho normal os números são o que acabou de subir,
  e uma consulta a mais por salvamento não se justificaria.
*/
async function countVisitFiles(visitId: string): Promise<{
  photos: number
  attachments: number
}> {
  const { data, error } = await supabase
    .from('project_diary_files')
    .select('file_kind')
    .eq('visit_id', visitId)

  if (error) throw error

  const rows = data ?? []
  return {
    photos: rows.filter((row) => row.file_kind === 'photo').length,
    attachments: rows.filter((row) => row.file_kind === 'attachment').length,
  }
}

/*
  O evento da visita e o vínculo, num gesto só — porque um sem o outro é
  exatamente o defeito 7.

  O UPDATE do vínculo é condicionado a `diary_entry_id is null`: se a linha já
  aponta para uma entrada, ela não é trocada. E ele NÃO usa `assertRowAffected`:
  zero linha aqui significa "o vínculo já estava lá", que é o resultado desejado,
  e não escrita negada.
*/
async function linkVisitDiaryEntry({
  projectId,
  visitId,
  input,
  counts,
}: {
  projectId: string
  visitId: string
  input: SiteVisitInput
  counts: { photos: number; attachments: number }
}): Promise<RecordedDiaryEvent> {
  const { title, description } = visitEventText(input, counts)

  const event = await recordDiaryEvent({
    projectId,
    systemEvent: 'site_visit',
    title,
    description,
    eventKey: visitEventKey(projectId, visitId),
    responsibleId: input.responsible_id,
  })

  if (event.entryId) {
    const { error } = await supabase
      .from('project_site_visits')
      .update({ diary_entry_id: event.entryId })
      .eq('id', visitId)
      .is('diary_entry_id', null)

    if (error) console.error('[diary] vínculo visita ↔ entrada não gravado:', error)
  }

  return event
}

/*
  EXCLUIR UMA VISITA (ObraTab.jsx:94-100).

  DEFEITO 14 DO PLANO: os caminhos das fotos e dos arquivos são colhidos ANTES do
  DELETE, porque o cascade leva as linhas de `project_diary_files` e NÃO leva os
  objetos do bucket — Storage não tem FK (migration 0071).

  O QUE NÃO VAI JUNTO, e é decisão de schema: as pendências que a visita revelou
  (FK com ON DELETE SET NULL — pendência de obra continua existindo depois que o
  registro da visita some) e a entrada de diário que ela gerou (o diário é a
  memória do escritório, não um espelho da tabela).
*/
export function useDeleteSiteVisit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const paths = await collectDiaryFilePaths('visits', id)

      const { data, error } = await supabase
        .from('project_site_visits')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A visita não foi excluída. Só Diretor e Coordenador escrevem no Diário do Projeto.',
      )

      await removeStorageObjects(paths)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/* ── Aba Pendências ────────────────────────────────────────────────────── */

/*
  A pendência com tudo que os dois lugares que a mostram precisam: a aba
  Pendências (cartão, resolução e histórico) e o bloco "N pendência(s) desta
  visita" da aba Obra.

  `events` É O HISTÓRICO, e ele vem por embed porque no base44 ele É um campo
  dentro da pendência — quem lê a pendência já lê o histórico, e a policy de
  SELECT da tabela filha tem exatamente o mesmo recorte (migration 0070). A
  diferença é que aqui ninguém REGRAVA: cada linha é escrita por trigger
  (defeito 12 do plano).
*/
const ISSUES_SELECT = `
  *,
  responsible:collaborators!project_issues_responsible_id_fkey(id, name),
  resolved_by:collaborators!project_issues_resolved_by_id_fkey(id, name),
  files:project_diary_files!project_diary_files_issue_id_fkey(*),
  events:project_issue_events!project_issue_events_issue_id_fkey(
    *,
    author:collaborators!project_issue_events_author_id_fkey(id, name)
  )
`

/*
  As pendências de UM projeto, da mais recente para a mais antiga
  (PendenciasTab.jsx:33 ordena por `-data_identificacao`).

  UMA CONSULTA SÓ PARA AS DUAS ABAS: a aba Obra também as usa, para os
  indicadores e para o bloco de pendências de cada visita — no original são duas
  chamadas iguais em dois componentes (ObraTab.jsx:51 e PendenciasTab.jsx:31),
  com a mesma chave de cache. Aqui a chave é a mesma e o hook é um.

  O histórico vem em ordem cronológica, que é a ordem em que o array do base44
  cresce e a que o índice `project_issue_events_tenant_id_issue_id_occurred_at_idx`
  já entrega.
*/
export function useProjectIssues(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: diaryKeys.issues(projectId ?? ''),
    enabled: Boolean(projectId) && enabled,
    queryFn: async (): Promise<ProjectIssueRow[]> => {
      const { data, error } = await supabase
        .from('project_issues')
        .select(ISSUES_SELECT)
        .eq('project_id', projectId as string)
        .order('identified_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'files' })
        .order('occurred_at', { referencedTable: 'events' })
        .limit(LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as ProjectIssueRow[]
    },
  })
}

/*
  AS DUAS COLUNAS DA RESOLUÇÃO, resolvidas num lugar só.

  O check `(status = 'resolved') = (resolved_at is not null)` amarra os dois
  sentidos (migration 0069, mesma forma de `completion_date` em `tasks`):
  pendência resolvida sem data não entra em contagem por período, e data em
  pendência aberta a faz aparecer como resolvida em qualquer relatório que conte
  por data. Por isso a tela escolhe o STATUS e nunca as colunas.

  A DATA JÁ GRAVADA É PRESERVADA: salvar de novo uma pendência que já estava
  resolvida não move a data da resolução para hoje nem troca quem a resolveu — o
  fato aconteceu quando aconteceu.
*/
function resolutionFieldsFor(
  status: ProjectIssueInput['status'],
  current: { resolved_at: string | null; resolved_by_id: string | null } | null,
  collaboratorId: string | null,
): { resolved_at: string | null; resolved_by_id: string | null } {
  if (status !== 'resolved') return { resolved_at: null, resolved_by_id: null }
  if (current?.resolved_at) {
    return { resolved_at: current.resolved_at, resolved_by_id: current.resolved_by_id }
  }
  return { resolved_at: new Date().toISOString(), resolved_by_id: collaboratorId }
}

/*
  ABRIR UMA PENDÊNCIA (ObraTab.jsx:102-130 e PendenciasTab.jsx:37-65).

  O NÚMERO NÃO É CALCULADO AQUI, e este é o defeito 8 do plano. No original ele é
  `issues.length + 1` sobre a lista que o navegador tem em memória: duas abas
  abertas produzem duas pendências #3 sem nenhuma concorrência real, e a lista
  filtrada por status produziria número repetido sozinha. Aqui a coluna vai FORA
  do INSERT, o trigger `project_issues_assign_number` a preenche sob advisory
  lock por projeto, e a unicidade `(project_id, issue_number)` é quem decide no
  fim. O número volta no `select` — é dele que sai o título do evento.

  O HISTÓRICO TAMBÉM NÃO É MONTADO AQUI (defeito 12): o trigger
  `project_issues_log_event` escreve a linha `created` sozinho.

  `visit_id` VEM DA VISITA QUE ABRIU O FORMULÁRIO, e não de um campo: é o fluxo
  que a visita "Com pendências" dispara.
*/
export function useCreateProjectIssue() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      projectId,
      visitId,
      input,
      photos,
      attachments,
    }: {
      projectId: string
      visitId: string | null
      input: ProjectIssueInput
      photos: File[]
      attachments: File[]
    }) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      const parsed = projectIssueInputSchema.parse(input)

      /*
        `issue_number` FICA FORA DO PAYLOAD, e o tipo gerado não sabe disso: o
        gerador lê a coluna como NOT NULL sem default e a exige no Insert, porque
        nenhum tipo enxerga um trigger BEFORE INSERT. O `Omit` é onde essa
        diferença fica escrita — e mandar o número daqui seria voltar ao
        `length + 1` do original.
      */
      const payload: Omit<TablesInsert<'project_issues'>, 'issue_number'> = {
        ...parsed,
        ...resolutionFieldsFor(parsed.status, null, collaborator?.id ?? null),
        project_id: projectId,
        visit_id: visitId,
        tenant_id: tenantId,
      }

      const { data, error } = await supabase
        .from('project_issues')
        .insert(payload as TablesInsert<'project_issues'>)
        .select('id, issue_number')
        .single()

      if (error) throw error

      await uploadDiaryFiles({
        tenantId,
        parent: 'issues',
        parentId: data.id,
        kind: 'photo',
        uploadedById: collaborator?.id ?? null,
        files: photos,
      })

      await uploadDiaryFiles({
        tenantId,
        parent: 'issues',
        parentId: data.id,
        kind: 'attachment',
        uploadedById: collaborator?.id ?? null,
        files: attachments,
      })

      const event = await recordDiaryEvent({
        projectId,
        systemEvent: 'issue_created',
        title: `🔴 Pendência #${data.issue_number} criada — ${PROJECT_ISSUE_CATEGORY[parsed.category]}`,
        description: parsed.description,
        eventKey: `issue-created:${projectId}:${data.id}`,
        responsibleId: parsed.responsible_id,
      })

      return { id: data.id, event }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  EDITAR UMA PENDÊNCIA (PendenciasTab.jsx:101-105).

  NÃO EXIGE PROJETO EM OBRA, e isso é metade do defeito 11 do plano: só o botão
  de CRIAR passou a exigir. Pendência aberta enquanto a obra corria precisa poder
  ser editada e resolvida depois que o projeto sai da fase de obra — senão ela
  fica presa para sempre.

  NÃO GRAVA EVENTO NA LINHA DO TEMPO, nem mesmo quando o status vira "Resolvida":
  é o comportamento do original, onde só o botão de um clique registra
  (PendenciasTab.jsx:91-97 contra :101-105). E nada se perde por isso — a
  transição de status vira linha em `project_issue_events` pelo trigger, com
  carimbo e autor, aconteça ela por qual caminho for.
*/
export function useUpdateProjectIssue() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      issue,
      input,
      newPhotos,
      newAttachments,
      removedFileIds,
    }: {
      issue: ProjectIssueRow
      input: ProjectIssueInput
      newPhotos: File[]
      newAttachments: File[]
      removedFileIds: string[]
    }) => {
      const parsed = projectIssueInputSchema.parse(input)

      const { data, error } = await supabase
        .from('project_issues')
        .update({
          ...parsed,
          ...resolutionFieldsFor(parsed.status, issue, collaborator?.id ?? null),
        })
        .eq('id', issue.id)
        .select('id, tenant_id')

      if (error) throw error
      assertRowAffected(
        data,
        'A pendência não foi alterada. Só Diretor e Coordenador escrevem no Diário do Projeto.',
      )

      await removeDiaryFiles(removedFileIds)

      await uploadDiaryFiles({
        tenantId: data[0].tenant_id,
        parent: 'issues',
        parentId: issue.id,
        kind: 'photo',
        uploadedById: collaborator?.id ?? null,
        files: newPhotos,
      })

      await uploadDiaryFiles({
        tenantId: data[0].tenant_id,
        parent: 'issues',
        parentId: issue.id,
        kind: 'attachment',
        uploadedById: collaborator?.id ?? null,
        files: newAttachments,
      })

      return issue.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  RESOLVER EM UM CLIQUE (PendenciasTab.jsx:83-99).

  Três coisas num gesto: o status, a data e quem resolveu. As duas últimas saem
  de `resolutionFieldsFor`, e não de campos da tela.

  O HISTÓRICO NÃO É EMPURRADO AQUI. No original, resolver lê o array `historico`
  do CACHE DO NAVEGADOR, empurra um item e regrava o campo inteiro
  (PendenciasTab.jsx:69-72): duas pessoas mexendo na mesma pendência perdem o
  registro uma da outra, e quem chegou depois vence sem que nada acuse (defeito
  12). Aqui o trigger escreve a linha `resolved`, com a transição de status e o
  autor resolvidos dentro do banco.

  CONTINUA LIBERADO COM O PROJETO FORA DE OBRA — ver `useUpdateProjectIssue`.
*/
export function useResolveProjectIssue() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({ issue, projectId }: { issue: ProjectIssueRow; projectId: string }) => {
      const { data, error } = await supabase
        .from('project_issues')
        .update({
          status: 'resolved',
          ...resolutionFieldsFor('resolved', null, collaborator?.id ?? null),
        })
        .eq('id', issue.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A pendência não foi resolvida. Só Diretor e Coordenador escrevem no Diário do Projeto.',
      )

      /*
        A CHAVE NÃO LEVA O RELÓGIO, ao contrário do original
        (`issue-resolved:...:${Date.now()}`, PendenciasTab.jsx:96). O fato é "a
        pendência #N foi resolvida"; resolver, reabrir e resolver de novo grava
        UM registro na linha do tempo — e as três transições continuam inteiras
        no histórico da pendência, que é o lugar que existe para contá-las.
      */
      const event = await recordDiaryEvent({
        projectId,
        systemEvent: 'issue_resolved',
        title: `✅ Pendência #${issue.issue_number} resolvida`,
        description: issue.description,
        eventKey: `issue-resolved:${projectId}:${issue.id}`,
        responsibleId: issue.responsible_id,
      })

      return { id: issue.id, event }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/* ── Aba Resumo: o relatório ───────────────────────────────────────────── */

/*
  GERAR O RELATÓRIO (RelatorioPDFModal.jsx:282-322).

  TRÊS PASSOS NUM GESTO: assinar as fotos escolhidas, montar o documento e
  mandá-lo para a impressão, e registrar no diário que o relatório foi gerado.

  POR QUE ISTO É UM HOOK E NÃO UM `onClick`: os dois primeiros passos tocam no
  Supabase (Storage) e o terceiro escreve no banco. A montagem do HTML e a
  entrega ao navegador ficam em `./report`, que não conhece o Supabase — o
  componente só junta as escolhas da tela e chama.

  AS FOTOS PRECISAM DE ENDEREÇO, e é aqui que o bucket privado cobra o preço. No
  base44 cada foto já é uma URL pública e eterna do `base44.app`, que o documento
  usa direto; aqui a linha guarda o CAMINHO (migration 0071) e o endereço é
  assinado na hora, por poucos minutos. Uma assinatura só para todas as fotos
  (`createSignedUrls`), e não uma por foto: um relatório de obra pode levar
  dezenas.

  ⚠ O QUE ISSO SIGNIFICA PARA O PAPEL: a URL vale cinco minutos. Quem imprimir ou
  salvar como PDF na hora tem as fotos no documento; quem deixar a janela de
  impressão aberta por meia hora e só então imprimir pode receber quadros vazios.
  É consequência direta de a foto de obra da casa de um cliente não ser mais
  pública, e é a troca que a migration 0071 registra.

  FOTO QUE NÃO ASSINA FICA DE FORA, em vez de virar quadro quebrado — e a
  contagem que vai para o registro do diário conta o que ENTROU no documento, não
  o que foi marcado na tela.

  O REGISTRO NO DIÁRIO É O ÚLTIMO PASSO e não derruba o relatório: o documento já
  está na tela de impressão, e falhar aqui não o desfaz. No original o `await` do
  log está dentro do mesmo `try` do `window.open`, então uma falha ao gravar o
  registro mostra "Erro ao gerar relatório" para quem acabou de receber o
  relatório. Aqui o resultado volta como valor e a tela avisa o que aconteceu de
  verdade.

  ⚠ E HÁ UM CASO EM QUE ELE FALHA POR DESENHO, e ele é conhecido: quem GERA
  relatório é Diretor ou Coordenador (`is_project_diary_writer`), e quem grava
  evento automático é quem tem `can_edit_menu('project_flow')`
  (`record_project_diary_event`, migration 0070) — os dois recortes não são o
  mesmo. Diretor passa nos dois (atalho da 0019); um Coordenador SEM permissão de
  edição em Fluxo do Projeto gera o relatório e não consegue registrá-lo, e a
  tela diz isso em vez de fingir que registrou. Somar uma segunda regra de
  permissão aqui para "consertar" seria inventar autorização que nenhuma
  migration declara.
*/
export function useGenerateDiaryReport() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()
  /* A capa e o rodape do relatorio levam o nome do ESCRITORIO, lido do tenant —
     ver o comentario de `officeName` em report.ts. */
  const { data: tenant } = useCurrentTenant()

  return useMutation({
    mutationFn: async ({
      project,
      entries,
      visits,
      issues,
      options,
      photos,
    }: {
      project: DiaryProject
      entries: DiaryEntryRow[]
      visits: SiteVisitRow[]
      issues: ProjectIssueRow[]
      options: ReportOptions
      photos: ReportPhoto[]
    }) => {
      const chosen = await signReportPhotos(photos.filter((photo) => photo.selected))

      const html = buildReportHTML({
        officeName: tenant?.name ?? '',
        project,
        entries,
        visits,
        issues,
        authorName: collaborator?.name ?? REPORT_FALLBACK_AUTHOR,
        options,
        photos: chosen,
      })

      printReport(html)

      const { title, description } = reportLogText(options, chosen.length)

      const event = await recordDiaryEvent({
        projectId: project.id,
        systemEvent: 'report_generated',
        title,
        description,
        eventKey: null,
        responsibleId: null,
      })

      return { event, photoCount: chosen.length }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.all })
    },
  })
}

/*
  O endereço temporário de cada foto escolhida, numa chamada só.

  `createSignedUrls` devolve uma linha por caminho, cada uma com o seu próprio
  erro: a que falhar sai da lista, e o documento sai com as outras. Recusar o
  relatório inteiro porque uma foto sumiu do bucket seria trocar um relatório
  quase completo por nenhum.
*/
async function signReportPhotos(photos: ReportPhoto[]): Promise<ReportPhotoWithUrl[]> {
  if (photos.length === 0) return []

  const { data, error } = await supabase.storage
    .from(DIARY_FILES_BUCKET)
    .createSignedUrls(
      photos.map((photo) => photo.file.file_path),
      SIGNED_URL_TTL_SECONDS,
    )

  if (error) throw error

  const urlByPath = new Map<string, string>()
  for (const signed of data ?? []) {
    if (signed.error || !signed.signedUrl || !signed.path) continue
    urlByPath.set(signed.path, signed.signedUrl)
  }

  return photos.flatMap((photo) => {
    const url = urlByPath.get(photo.file.file_path)
    if (!url) {
      console.error('[diary] foto sem endereço assinado, fora do relatório:', photo.file.file_path)
      return []
    }
    return [{ ...photo, url }]
  })
}

/* ── Os anexos: bucket privado `project-diary-files` ───────────────────── */

/*
  A URL PARA ABRIR O ANEXO, ASSINADA NA HORA.

  O banco guarda o CAMINHO do objeto, nunca uma URL (migration 0071): assinatura
  expira, e link morto gravado no banco é pior que nenhum link. No base44 a
  coluna guarda uma URL PÚBLICA do `base44.app`, que funciona para qualquer
  pessoa que a tenha — e o que este módulo põe atrás dela é foto de obra da
  residência de um cliente.

  `staleTime` fica ABAIXO do tempo de expiração de propósito: uma URL guardada
  em cache até o último segundo é uma URL que falha justamente quando alguém
  clica.

  Quem autoriza a assinatura é `diary_files_select_active_collaborator`
  (migration 0071) — colaborador ativo do escritório dono do caminho.
*/
export function useDiaryFileUrl(path: string | null | undefined) {
  const filePath = path ?? ''

  return useQuery({
    queryKey: diaryKeys.fileUrl(filePath),
    enabled: filePath !== '',
    staleTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    gcTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(DIARY_FILES_BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

      if (error) throw error
      return data.signedUrl
    },
  })
}

/*
  ENVIAR ARQUIVOS E PENDURÁ-LOS NUMA DAS TRÊS MÃES.

  Parametrizado por mãe porque a tabela é UMA com arco exclusivo (migration
  0069): a visita e a pendência anexam pelo mesmo caminho, mudando só `parent` e
  `kind`. `attachment` é o de/para dos arrays `anexos` e `arquivos` do base44, e
  `photo` é o do array `fotos` — o que separava as duas listas lá era o NOME do
  array, e aqui é a coluna `file_kind` (migration 0068). A entrada de diário só
  usa `attachment`; a visita e a pendência usam os dois, num campo cada.

  A ORDEM DOS PASSOS É O QUE IMPEDE ARQUIVO ÓRFÃO, e ela é a mesma do módulo 8:
  sobe o objeto, grava a linha, e se a gravação falhar APAGA o objeto que acabou
  de subir e levanta o erro — senão sobraria um arquivo pago que ninguém alcança.

  UM DE CADA VEZ, e não `Promise.all` como no original (DiaryEntryForm.jsx:96):
  em série a primeira recusa (tipo, tamanho, permissão) interrompe o resto, em
  vez de subir cinco arquivos para descobrir que nenhum podia ser gravado.

  `byte_size` VAI NULO QUANDO O ARQUIVO TEM ZERO BYTE: a coluna tem
  `byte_size is null or byte_size > 0` (migration 0069), e um arquivo vazio é
  legítimo do ponto de vista de quem envia. Nulo diz "não há tamanho a
  registrar", que é a verdade, em vez de derrubar o anexo por um check.
*/
async function uploadDiaryFiles({
  tenantId,
  parent,
  parentId,
  kind = 'attachment',
  uploadedById,
  files,
}: {
  tenantId: string
  parent: DiaryFileParent
  parentId: string
  kind?: DiaryFileKind
  uploadedById: string | null
  files: File[]
}): Promise<void> {
  for (const file of files) {
    const rejected = describeRejectedFile(file)
    if (rejected) throw new WriteError(rejected)

    const path = diaryFilePath(tenantId, parent, parentId, file)

    const { error: uploadError } = await supabase.storage
      .from(DIARY_FILES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })

    if (uploadError) throw uploadError

    const { error } = await supabase.from('project_diary_files').insert({
      tenant_id: tenantId,
      entry_id: parent === 'entries' ? parentId : null,
      visit_id: parent === 'visits' ? parentId : null,
      issue_id: parent === 'issues' ? parentId : null,
      file_kind: kind,
      file_path: path,
      file_name: file.name,
      mime_type: file.type,
      byte_size: file.size > 0 ? file.size : null,
      uploaded_by_id: uploadedById,
    })

    if (error) {
      await removeStorageObjects([path])
      throw error
    }
  }
}

/*
  REMOVER ANEXOS: a linha primeiro, o objeto depois.

  Banco antes do Storage, como no módulo 8, e pelo mesmo motivo: exclusão negada
  pela RLS não alcança linha nenhuma, e aí o arquivo continua lá — que é a
  verdade que a tela segue mostrando. Se o Storage falhar depois, sobra um
  órfão, que é o estado que o original já tem hoje.
*/
async function removeDiaryFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const { data: existing, error: readError } = await supabase
    .from('project_diary_files')
    .select('file_path')
    .in('id', ids)

  if (readError) throw readError

  const { data, error } = await supabase
    .from('project_diary_files')
    .delete()
    .in('id', ids)
    .select('id')

  if (error) throw error
  assertRowAffected(
    data,
    'O anexo não foi removido. Só Diretor e Coordenador escrevem no Diário do Projeto.',
  )

  await removeStorageObjects((existing ?? []).map((row) => row.file_path))
}

/*
  Todos os arquivos de uma mãe, colhidos ANTES de ela ser apagada — é a única
  hora em que ainda dá para saber quais eram (defeito 14 do plano).

  Parametrizado pela mesma chave de `uploadDiaryFiles`: a coluna de arco
  exclusivo muda, o gesto não.
*/
const PARENT_COLUMN: Record<DiaryFileParent, 'entry_id' | 'visit_id' | 'issue_id'> = {
  entries: 'entry_id',
  visits: 'visit_id',
  issues: 'issue_id',
}

async function collectDiaryFilePaths(
  parent: DiaryFileParent,
  parentId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('project_diary_files')
    .select('file_path')
    .eq(PARENT_COLUMN[parent], parentId)

  if (error) throw error
  /* `file_path` é NOT NULL: a linha só existe porque há arquivo. */
  return (data ?? []).map((row) => row.file_path)
}

/*
  Apagar objeto do bucket é sempre EFEITO SECUNDÁRIO: quando isto roda, a linha
  do banco já foi gravada ou já sumiu. Falhar aqui deixa um arquivo órfão — o
  mesmo estado que o original tem hoje, e que a migration 0071 registra como
  pendência declarada do módulo — e não pode desfazer o que já aconteceu no
  banco. Por isso vai para o console e não sobe.

  A única remoção que NÃO passa por aqui é a do passo de compensação do upload,
  que precisa falhar junto com a gravação.
*/
async function removeStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(DIARY_FILES_BUCKET).remove(paths)
  if (error) console.error('[diary] falha ao remover anexo do Storage:', error)
}
