/*
  O ANEXO DO DIÁRIO — a parte que não toca no Supabase.

  O bucket `project-diary-files` é PRIVADO e criado pela migration 0071, com os
  dois limites aplicados NO SERVIDOR: `allowed_mime_types` com os cinco tipos
  que as telas do módulo enviam e `file_size_limit` de 20 MB. O Storage os cobra
  antes de aceitar o corpo da requisição.

  BUCKET PRÓPRIO, e não o `budget-files` do módulo 8 — ver o cabeçalho da 0071.
  Em duas frases: aquele aceita só `application/pdf`, e ampliar a lista
  afrouxaria um controle do módulo 8 por causa do 11; e as policies dele são
  gatilhadas por `can_edit_menu('client_budget')`, enquanto aqui a escrita é por
  FUNÇÃO (Diretor ou Coordenador).

  ⚠ A VALIDAÇÃO DESTE ARQUIVO É CONVENIÊNCIA, NÃO SEGURANÇA. Ela existe para que
  quem escolher um .docx de 40 MB veja uma frase em português em vez de um erro
  de rede, e para não subir 40 MB antes de descobrir. Qualquer requisição montada
  fora da tela ignora tudo que está aqui — quem recusa de verdade é o bucket. A
  versão nova não confere nada no anexo do diário (DiaryEntryForm.jsx:91-108
  manda qualquer arquivo) e também não tem a metade do servidor.
*/

export const DIARY_FILES_BUCKET = 'project-diary-files'

export const MAX_FILE_SIZE_MB = 20
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

/*
  Os cinco tipos do bucket (migration 0071), e a extensão com que cada um é
  gravado. O de/para existe porque o nome do objeto é montado aqui: a extensão
  sai do TIPO informado pelo navegador, e não do nome que a pessoa enviou —
  nome escolhido por quem envia não entra em caminho de storage.
*/
const ACCEPTED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
}

/** O `accept` do seletor de arquivo. Conveniência, como o resto deste arquivo. */
export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED_MIME_TYPES).join(',')

/*
  O `accept` do seletor de FOTO, que é um recorte do de cima.

  Os campos de foto do original mandam `accept="image/*"` (SiteVisitForm.jsx:215),
  o que oferece HEIC, TIFF, GIF e SVG — três que o bucket recusa e um que é
  superfície de script. A lista aqui é a interseção do que o bucket aceita com o
  que é imagem: os três formatos que um celular ou um navegador produzem.
*/
export const ACCEPT_IMAGE_ATTRIBUTE = Object.keys(ACCEPTED_MIME_TYPES)
  .filter((type) => type.startsWith('image/'))
  .join(',')

/** `null` quando o arquivo serve; a frase da recusa quando não. */
export function describeRejectedFile(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES[file.type]) {
    return 'Tipo de arquivo não aceito. Envie imagem (JPG, PNG ou WebP), PDF ou texto.'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE_MB}MB`
  }
  return null
}

/*
  A mesma conferência, no campo que só aceita FOTO.

  Por que uma frase própria em vez da de cima: quem escolheu um PDF no campo de
  fotos não precisa saber que o sistema aceita PDF — precisa saber que ali vai
  imagem. A recusa por tamanho é a mesma e é reaproveitada.
*/
export function describeRejectedPhoto(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Este campo aceita só foto. Use "Adicionar arquivo" para PDF e texto.'
  }
  return describeRejectedFile(file)
}

/** As três mães possíveis de um anexo (arco exclusivo, migration 0069). */
export type DiaryFileParent = 'entries' | 'visits' | 'issues'

/*
  O CAMINHO DO OBJETO: `<tenant_id>/<mãe>/<id da mãe>/<uuid>.<ext>`, exatamente
  a forma declarada no cabeçalho da migration 0071.

  O PRIMEIRO SEGMENTO É O QUE ISOLA. As quatro policies de `storage.objects`
  comparam `storage.foldername(name)[1]` com o claim do JWT — é o equivalente,
  no Storage, do `tenant_id = auth_tenant_id()` das tabelas. Por isso o
  `tenantId` que chega aqui vem SEMPRE da sessão, nunca de parâmetro da tela:
  caminho montado com tenant vindo de fora é escrita cruzada esperando
  acontecer, e a policy é a única coisa entre um e outro.

  O NOME DO ARQUIVO É UM UUID: nome escolhido por quem envia não entra em
  caminho de storage (barra, ponto-ponto, unicode ambíguo, colisão). O nome de
  exibição vive no banco, em `project_diary_files.file_name`.
*/
export function diaryFilePath(
  tenantId: string,
  parent: DiaryFileParent,
  parentId: string,
  file: File,
): string {
  const extension = ACCEPTED_MIME_TYPES[file.type] ?? 'bin'
  return `${tenantId}/${parent}/${parentId}/${crypto.randomUUID()}.${extension}`
}

/*
  QUANTO TEMPO A URL ASSINADA VALE. Curta de propósito: ela existe para abrir o
  arquivo agora, e não para virar link compartilhável — o endereço de um arquivo
  viaja em e-mail, WhatsApp, histórico e log de proxy, e é justamente isso que a
  migration 0071 tirou do sistema ao trocar a URL pública do base44 por um
  bucket privado. Mesmo valor do módulo 8.
*/
export const SIGNED_URL_TTL_SECONDS = 300
