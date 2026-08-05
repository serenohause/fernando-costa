import { cn } from '@/lib/utils'
import { useCurrentTenant } from '../hooks'

/*
  O nome do escritório, para ir dentro do título de quem o exibe (a barra
  lateral e a tela de entrada). Ele não impõe tipografia nenhuma: herda a do
  elemento em volta, que continua sendo a do original.

  ENQUANTO O NOME NÃO CHEGOU, NENHUM NOME. Nada de "Fernando Costa" como valor
  provisório: num sistema multitenant isso é o nome de OUTRO escritório piscando
  na tela de quem abriu o sistema. No lugar do texto vai um bloco da altura de
  uma linha.

  O bloco é medido em `em`, e não em pixel, porque os dois pontos de uso têm
  corpos diferentes (text-lg na barra lateral, text-3xl na tela de entrada) — em
  `em` ele acompanha os dois sem número mágico em cada tela. `h-[1em]` é MENOR
  que a caixa da linha (font-size × line-height), então o esqueleto cabe dentro
  da altura que o texto vai ocupar: nada salta quando o nome chega.

  SEM TENANT (vínculo ainda não aprovado, ou revogado) o espaçador continua, sem
  pulsar e sem largura: segura a altura da linha, para o que vem embaixo não
  subir, e não finge que ainda está carregando algo que não vem. Na prática o
  AppLayout barra essa pessoa antes da barra lateral existir — isto é a rede.
*/
export default function TenantName() {
  const { data, isLoading } = useCurrentTenant()

  if (data?.name) return <>{data.name}</>

  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-[1em] max-w-full align-middle',
        isLoading ? 'w-[8em] animate-pulse rounded-md bg-primary/10' : 'w-0',
      )}
    />
  )
}
