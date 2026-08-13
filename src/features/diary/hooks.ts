import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { diaryEntryInputSchema } from './schemas'
import {
  describeRejectedFile,
  diaryFilePath,
  DIARY_FILES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  type DiaryFileParent,
} from './files'
import type { DiaryEntryInput, DiaryEntryRow } from './types'

export const diaryKeys = {
  all: ['diary'] as const,
  entries: (projectId: string) => [...diaryKeys.all, 'entries', projectId] as const,
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
      const paths = await collectEntryFilePaths(id)

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
  0069): a visita e a pendência da fatia 2 anexam pelo mesmo caminho, mudando só
  `parent` e `file_kind`. Enquanto só a entrada de diário existe, `file_kind` é
  sempre `attachment` — é o de/para do array `anexos` do base44, e `photo` é o do
  array `fotos`, que é da aba Obra.

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
  uploadedById,
  files,
}: {
  tenantId: string
  parent: DiaryFileParent
  parentId: string
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
      file_kind: 'attachment',
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

/* Todos os anexos de uma entrada, colhidos antes de ela ser apagada. */
async function collectEntryFilePaths(entryId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('project_diary_files')
    .select('file_path')
    .eq('entry_id', entryId)

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
