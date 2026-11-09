/*
  AS FOTOS DA PROPRIEDADE — a parte que não toca no Supabase.

  O bucket `map-property-photos` é PRIVADO e criado pela migration 0130, com os
  dois limites aplicados NO SERVIDOR: `allowed_mime_types` com os três formatos
  que a tela envia e `file_size_limit` de 10 MB. O Storage os cobra antes de
  aceitar o corpo da requisição.

  BUCKET PRÓPRIO, e não o `project-diary-files` do módulo 11 — ver o cabeçalho
  da 0130. Em duas frases: as policies daquele são gatilhadas por outra chave de
  permissão (o diário, hoje `can_edit_menu('project_flow')`), enquanto aqui a
  escrita é `can_edit_menu('map')`; e aquele aceita PDF e texto, que não têm o
  que fazer num carrossel de imagem.

  ⚠ A VALIDAÇÃO DESTE ARQUIVO É CONVENIÊNCIA, NÃO SEGURANÇA. Ela existe para que
  quem escolher um HEIC de 30 MB veja uma frase em português em vez de um erro
  de rede, e para não subir 30 MB antes de descobrir. Qualquer requisição
  montada fora da tela ignora tudo que está aqui — quem recusa de verdade é o
  bucket.
*/

export const MAP_PHOTOS_BUCKET = 'map-property-photos'

export const MAX_PHOTO_SIZE_MB = 10
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024

/*
  Os três tipos do bucket (migration 0130), e a extensão com que cada um é
  gravado. O de/para existe porque o nome do objeto é montado aqui: a extensão
  sai do TIPO informado pelo navegador, e não do nome que a pessoa enviou —
  nome escolhido por quem envia não entra em caminho de storage.

  Fora da lista, de propósito: HEIC e TIFF (que o navegador não desenha), GIF
  (ninguém pediu) e SVG, que é superfície de script servida do mesmo domínio
  assinado.
*/
const ACCEPTED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** O `accept` do seletor de arquivo. Conveniência, como o resto daqui. */
export const ACCEPT_PHOTO_ATTRIBUTE = Object.keys(ACCEPTED_MIME_TYPES).join(',')

/** Quantas fotos uma propriedade aceita. Teto de tela, não do banco. */
export const MAX_PHOTOS_PER_PROPERTY = 20

/** `null` quando o arquivo serve; a frase da recusa quando não. */
export function describeRejectedPhoto(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES[file.type]) {
    return 'Formato não aceito. Envie JPG, PNG ou WebP.'
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return `Foto muito grande. Máximo: ${MAX_PHOTO_SIZE_MB}MB`
  }
  return null
}

/*
  O CAMINHO DO OBJETO: `<tenant_id>/<id da propriedade>/<uuid>.<ext>`,
  exatamente a forma declarada no cabeçalho da migration 0130.

  O PRIMEIRO SEGMENTO É O QUE ISOLA. As quatro policies de `storage.objects`
  comparam `storage.foldername(name)[1]` com o claim do JWT — é o equivalente,
  no Storage, do `tenant_id = auth_tenant_id()` das tabelas. Por isso o
  `tenantId` que chega aqui vem SEMPRE da sessão, nunca de parâmetro da tela.

  O NOME DO ARQUIVO É UM UUID: nome escolhido por quem envia não entra em
  caminho de storage (barra, ponto-ponto, unicode ambíguo, colisão). O nome de
  exibição vive no banco, em `map_property_photos.file_name`.
*/
export function mapPhotoPath(tenantId: string, propertyId: string, file: File): string {
  const extension = ACCEPTED_MIME_TYPES[file.type] ?? 'bin'
  return `${tenantId}/${propertyId}/${crypto.randomUUID()}.${extension}`
}

/*
  QUANTO TEMPO A URL ASSINADA VALE. Curta de propósito: ela existe para desenhar
  o carrossel agora, e não para virar link compartilhável — endereço de arquivo
  viaja em e-mail, WhatsApp, histórico de navegador e log de proxy. Mesmo valor
  dos módulos 8 e 11.
*/
export const SIGNED_URL_TTL_SECONDS = 300
