import { Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { describeDiaryError, useDiaryFileUrl } from '../hooks'
import type { DiaryFile } from '../types'

/*
  UM CLIPE DA LINHA DO TEMPO (ProjectDiaryDrawer.jsx:372-382).

  A geometria, as cores e o truncamento em 120px são os do original. O que muda
  é o que está atrás do clique: lá o `href` é uma URL PÚBLICA do `base44.app`
  gravada no documento — o link nunca falha, e quem tiver o endereço abre o
  arquivo. Aqui o bucket é privado e o endereço é assinado na hora
  (`useDiaryFileUrl`), então abrir PODE falhar: objeto removido do Storage,
  sessão sem permissão de leitura, rede fora.

  Por isso o clipe tem dois comportamentos, e nenhum deles é silêncio:

  - com o endereço em mãos, é o mesmo `<a target="_blank">` do original;
  - sem ele, o clique mostra o motivo em toast e tenta assinar de novo.

  A assinatura é pedida ao montar, e não no clique: abrir janela depois de uma
  resposta assíncrona é o que o bloqueador de pop-up barra. O custo é uma
  requisição por anexo visível, e o volume real do escritório é de poucos
  anexos por projeto — mesmo desenho de `PdfOpenButton` no módulo 8.
*/
export default function DiaryAttachmentLink({ file }: { file: DiaryFile }) {
  const urlQuery = useDiaryFileUrl(file.file_path)

  const className =
    'flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated hover:bg-muted border border-border rounded-lg text-xs text-soft transition-colors'

  const content = (
    <>
      <Paperclip className="w-3 h-3 text-faint" />
      <span className="max-w-[120px] truncate">{file.file_name}</span>
    </>
  )

  if (urlQuery.data) {
    return (
      <a href={urlQuery.data} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      className={className}
      disabled={urlQuery.isFetching}
      onClick={() => {
        toast.error('Não foi possível abrir o arquivo. ' + describeDiaryError(urlQuery.error))
        void urlQuery.refetch()
      }}
    >
      {content}
    </button>
  )
}
