/*
  O UPLOAD DE PDF DO ORÇAMENTO — a parte que não toca no Supabase.

  O bucket `budget-files` é PRIVADO e criado pela migration 0052, com os dois
  limites do original aplicados NO SERVIDOR: `allowed_mime_types` só
  `application/pdf` e `file_size_limit` de 20 MB. O Storage os cobra antes de
  aceitar o corpo da requisição.

  ⚠ A VALIDAÇÃO DESTE ARQUIVO É CONVENIÊNCIA, NÃO SEGURANÇA. Ela existe para que
  quem escolher um .docx de 40 MB veja uma frase em português em vez de um erro
  de rede, e para não subir 40 MB antes de descobrir. Qualquer requisição montada
  fora da tela ignora tudo que está aqui — quem recusa de verdade é o bucket, e é
  por isso que os dois limites vivem lá. O original confere as mesmas duas coisas
  no navegador (PdfUploadButton.jsx:28-36) e NÃO tem a metade do servidor.
*/

export const MAX_FILE_SIZE_MB = 20
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const ACCEPTED_MIME_TYPE = 'application/pdf'

/** `null` quando o arquivo serve; a frase da recusa quando não. */
export function describeRejectedFile(file: File): string | null {
  /* As mesmas duas frases do original (PdfUploadButton.jsx:29 e :34). */
  if (file.type !== ACCEPTED_MIME_TYPE) return 'Apenas arquivos PDF são aceitos'
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE_MB}MB`
  }
  return null
}

/*
  O CAMINHO DO OBJETO: `<tenant_id>/<checklist_id>/<uuid>.pdf`.

  O PRIMEIRO SEGMENTO É O QUE ISOLA. As quatro policies de `storage.objects`
  (migration 0052) comparam `storage.foldername(name)[1]` com o claim do JWT —
  é o equivalente, no Storage, do `tenant_id = auth_tenant_id()` das tabelas. Por
  isso o `tenantId` que chega aqui vem SEMPRE da sessão, nunca de parâmetro da
  tela: caminho montado com tenant vindo de fora é escrita cruzada esperando
  acontecer, e a policy é a única coisa entre um e outro.

  O NOME DO ARQUIVO É UM UUID, e não o nome que a pessoa enviou: nome escolhido
  por quem envia não entra em caminho de storage (barra, ponto-ponto, unicode
  ambíguo, colisão). O nome de exibição vive no banco, em `*_file_name`.
*/
export function budgetFilePath(tenantId: string, checklistId: string): string {
  return `${tenantId}/${checklistId}/${crypto.randomUUID()}.pdf`
}

export const BUDGET_FILES_BUCKET = 'budget-files'

/*
  QUANTO TEMPO A URL ASSINADA VALE. Curta de propósito: ela existe para abrir o
  PDF agora, e não para virar link compartilhável — o endereço de um arquivo
  viaja em e-mail, WhatsApp, histórico e log de proxy, e é justamente isso que a
  migration 0052 tirou do sistema ao trocar o bucket público por um privado.
*/
export const SIGNED_URL_TTL_SECONDS = 300
