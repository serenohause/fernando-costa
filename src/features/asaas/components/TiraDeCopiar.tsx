import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { CobrancaDaParcela } from '../cobranca'

/*
  A TIRA DE COPIAR: o elemento de assinatura do painel (seção 11 do protótipo).

  Três linhas de mesma geometria: rótulo curto em caixa alta, valor em largura
  fixa, botão de copiar na ponta. A primeira, o link de pagamento, é a única com
  botão CHEIO, e isso não é enfeite: o que vai para o WhatsApp é o link, e é por
  ele que o cliente paga PIX, boleto ou cartão na mesma página do Asaas. Boleto e
  PIX são alternativas que algum cliente vai pedir.

  A TERCEIRA LINHA É A RAZÃO DE A TIRA EXISTIR COMO PADRÃO: o copia e cola do PIX
  pode simplesmente NÃO VIR, e não existe no backend caminho para buscar esse
  código depois. Num formato fixo a ausência tem um lugar para ser dita, em vez
  de virar um botão que não funciona. A linha não desaparece: quem conhece a tela
  ficaria procurando o PIX e achando que carregou errado.

  "copiado" APARECE AO LADO DO RÓTULO e some em dois segundos. Não é toast: a
  confirmação precisa estar onde o dedo acabou de encostar.
*/

type LinhaDaTira = {
  chave: string
  rotulo: string
  valor: string | null
  /* A frase que ocupa o lugar do valor quando ele não veio. Sem ela, linha sem
     valor não é desenhada. */
  ausente?: string
  heroi?: boolean
  /* Boleto costuma ser impresso ou anexado, não colado em conversa, então ele
     ganha um segundo botão. No celular ele sai (seção 18). */
  abrirEmOutraAba?: boolean
  rotuloDoBotao: string
}

const EM_TELA = 2000

export default function TiraDeCopiar({
  cobranca,
  somenteOLink = false,
}: {
  cobranca: CobrancaDaParcela
  /* A seção 13, da cobrança que já existia, mostra só o link: o resultado é
     exatamente o que a pessoa queria, e ela tem o link. */
  somenteOLink?: boolean
}) {
  const [copiada, setCopiada] = useState<string | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (relogio.current !== null) clearTimeout(relogio.current)
    },
    [],
  )

  const copiar = async (chave: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor)
    } catch {
      /*
        Área de transferência negada (contexto sem HTTPS, permissão recusada).
        Sem isto o botão não daria sinal nenhum e a pessoa colaria o valor
        antigo no WhatsApp do cliente.
      */
      toast.error('Não foi possível copiar. Selecione o texto e copie à mão.')
      return
    }

    setCopiada(chave)
    if (relogio.current !== null) clearTimeout(relogio.current)
    relogio.current = setTimeout(() => setCopiada(null), EM_TELA)
  }

  const linhas: LinhaDaTira[] = [
    {
      chave: 'link',
      rotulo: 'Link de pagamento',
      valor: cobranca.invoice_url,
      heroi: true,
      rotuloDoBotao: 'Copiar o link de pagamento',
    },
    {
      chave: 'boleto',
      rotulo: 'Boleto em PDF',
      valor: cobranca.bank_slip_url,
      abrirEmOutraAba: true,
      rotuloDoBotao: 'Copiar o endereço do boleto',
    },
    {
      chave: 'pix',
      rotulo: 'PIX copia e cola',
      valor: cobranca.pix_payload,
      ausente:
        'Esta cobrança não trouxe o código. Mande o link de pagamento: nele o cliente paga por PIX, boleto ou cartão.',
      rotuloDoBotao: 'Copiar o código PIX',
    },
  ]

  const visiveis = (somenteOLink ? linhas.slice(0, 1) : linhas).filter(
    (linha) => linha.valor !== null || linha.ausente !== undefined,
  )

  if (visiveis.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {visiveis.map((linha, indice) => (
        <div
          key={linha.chave}
          className={`flex items-center gap-3 p-3 ${indice > 0 ? 'border-t border-border' : ''} ${
            linha.heroi ? 'bg-card max-sm:flex-wrap' : 'bg-elevated'
          }`}
        >
          <div className="min-w-0 flex-1">
            <span
              className={`block text-[0.6875rem] uppercase tracking-wider ${
                linha.heroi ? 'font-semibold text-muted-foreground' : 'text-faint'
              }`}
            >
              {linha.rotulo}
              {copiada === linha.chave ? (
                <span className="ml-2 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="size-3" />
                  copiado
                </span>
              ) : null}
            </span>

            {linha.valor !== null ? (
              <span
                className={`mt-[0.1875rem] block break-all font-mono ${
                  linha.heroi ? 'text-[0.8125rem] text-foreground' : 'text-xs text-soft'
                }`}
              >
                {linha.valor}
              </span>
            ) : (
              <span className="mt-[0.1875rem] block text-[0.8125rem] text-muted-foreground">
                {linha.ausente}
              </span>
            )}
          </div>

          {linha.valor === null ? null : linha.heroi ? (
            <Button
              type="button"
              size="sm"
              className="max-sm:h-11 max-sm:w-full max-sm:px-4 max-sm:text-sm sm:[&_svg]:size-3.5"
              onClick={() => void copiar(linha.chave, linha.valor as string)}
            >
              <Copy />
              Copiar link
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={linha.rotuloDoBotao}
                onClick={() => void copiar(linha.chave, linha.valor as string)}
              >
                <Copy />
              </Button>
              {linha.abrirEmOutraAba ? (
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="hidden sm:inline-flex"
                  aria-label="Abrir o boleto em outra aba"
                >
                  <a href={linha.valor} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
