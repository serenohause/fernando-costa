import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useDiaryFileUrl } from '../hooks'
import type { DiaryFile } from '../types'

/*
  UMA FOTO DE OBRA JÁ GRAVADA.

  No original a foto é `<img src={foto.url}>` com uma URL PÚBLICA e eterna do
  `base44.app` (ObraTab.jsx:303): ela nunca falha, e qualquer pessoa que tenha o
  endereço vê a foto — que aqui é foto da obra da residência de um cliente. O
  bucket deste módulo é privado (migration 0071) e o endereço é assinado na hora,
  então carregar PODE falhar: objeto removido, sessão sem permissão, rede fora.

  Por isso existe o segundo estado, que o original não tem: um retângulo do mesmo
  tamanho, com o ícone de imagem indisponível. Ele NÃO fala nada por escrito — a
  miniatura tem 56 ou 64 pixels, e frase nenhuma cabe ali. Quem clicar cai no
  lightbox, que tem espaço para explicar.

  O CUSTO É UMA ASSINATURA POR FOTO, e ele é o mesmo do módulo 8: a chave da
  consulta é o CAMINHO, então a mesma foto pedida pela fita de miniaturas, pela
  galeria e pelo lightbox é uma requisição só, e ela vale minutos.
*/
export default function DiaryPhoto({
  file,
  className = 'w-full h-full object-cover',
}: {
  file: DiaryFile
  className?: string
}) {
  const urlQuery = useDiaryFileUrl(file.file_path)

  if (!urlQuery.data) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted`}>
        <ImageOff className="w-4 h-4 text-faint" />
      </div>
    )
  }

  return <img src={urlQuery.data} alt={file.file_name} className={className} />
}

/*
  UMA FOTO ESCOLHIDA E AINDA NÃO ENVIADA.

  No original não existe este estado: o `<input type="file">` sobe o arquivo na
  hora em que ele é escolhido e a prévia já é a URL do storage
  (SiteVisitForm.jsx:77-81) — inclusive quando a pessoa cancela o formulário
  depois, e aí o arquivo fica pago e órfão. Aqui o arquivo vai junto com o
  salvamento (regra do CLAUDE.md: nenhuma chamada ao Supabase dentro de
  componente), e a prévia sai do próprio arquivo, sem rede.

  A URL é REVOGADA ao desmontar: `createObjectURL` prende o arquivo na memória da
  aba até alguém soltar, e uma visita com dez fotos de celular são dezenas de MB.
*/
export function LocalPhotoPreview({
  file,
  className = 'w-full h-16 object-cover rounded-lg border border-border',
}: {
  file: File
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  if (!url) return <div className={`${className} bg-muted`} />

  return <img src={url} alt={file.name} className={className} />
}
