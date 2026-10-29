/*
  ═══════════════════════════════════════════════════════════════════════════
  A FOTO QUE VAI DENTRO DO DOCUMENTO
  ═══════════════════════════════════════════════════════════════════════════

  POR QUE EMBUTIR, E NÃO APONTAR. O relatório do projeto (./report) põe no `src`
  da foto um endereço que o Storage assina e que vale cinco minutos: o bucket é
  privado desde a migration 0071, e foto de obra da casa de um cliente não é
  pública. Para um documento lido na hora isso basta. O relatório de visita
  existe para virar arquivo e ser ENVIADO ao cliente, e aí a troca muda de lado:
  quem salva o PDF meia hora depois receberia quadros vazios, e o PDF com buracos
  já estaria no WhatsApp do cliente antes de alguém notar. Embutida, a foto fica
  no arquivo e não depende de mais nada.

  POR QUE REDUZIR, E ESTA É A PARTE QUE NÃO DÁ PARA PULAR. Base64 engorda o
  conteúdo em cerca de um terço. Foto de celular hoje tem de 3 a 6 MB; doze
  delas, embutidas cruas, dariam um documento de dezenas de megabytes. O
  resultado não é "um arquivo grande": é a janela de impressão travando, o
  navegador engasgando no `srcdoc` e, se chegar a sair, um PDF que não passa em
  anexo de e-mail. Reduzir não é economia, é o que faz a função funcionar.

  OS NÚMEROS, E DE ONDE SAEM. `LARGURA_MAXIMA` é 1600px porque a foto ocupa um
  terço da largura útil de uma folha A4 — cerca de 5,5cm — e a 300dpi isso pede
  por volta de 650px. 1600 dá folga de sobra para impressão e para quem abrir o
  PDF e der zoom. `QUALIDADE` 0,82 é o ponto em que JPEG para de mostrar
  artefato visível em foto de obra, que é imagem de textura e não de gradiente.
  Juntos, deixam cada foto em algumas centenas de KB.

  O QUE ACONTECE COM A FOTO QUE FALHA. Ela sai do documento, e o documento sai
  com as outras. Mesma decisão que `signReportPhotos` já tomou em ./hooks: um
  relatório quase completo é melhor do que nenhum relatório. Quem chama recebe a
  contagem do que ENTROU, não do que foi pedido, e a tela avisa quando os dois
  números não batem.
*/

const LARGURA_MAXIMA = 1600
const QUALIDADE = 0.82

/*
  QUANTAS FOTOS SÃO CONVERTIDAS AO MESMO TEMPO.

  Uma a uma é lento numa visita com trinta fotos; todas de uma vez põe trinta
  imagens decodificadas na memória ao mesmo tempo, e em celular isso derruba a
  aba. Quatro é o meio que mantém a conversão ocupada sem segurar mais do que um
  punhado de imagens de cada vez.
*/
const EM_PARALELO = 4

export type FotoParaEmbutir = {
  /* O endereço assinado, válido por poucos minutos. Ele é usado AQUI e não
     chega ao documento: o que chega é o `data:` resultante. */
  url: string
}

/*
  Converte uma imagem já baixada em `data:` reduzido.

  `createImageBitmap` e não `new Image()`: ele decodifica fora da thread
  principal e não depende de o elemento estar no documento. O canvas é criado e
  descartado aqui; nada é anexado à página.
*/
async function reduzir(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)

  try {
    const escala = Math.min(1, LARGURA_MAXIMA / bitmap.width)
    const largura = Math.max(1, Math.round(bitmap.width * escala))
    const altura = Math.max(1, Math.round(bitmap.height * escala))

    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas sem contexto 2d')

    ctx.drawImage(bitmap, 0, 0, largura, altura)

    /*
      SEMPRE JPEG, inclusive quando a origem é PNG. Foto de obra é fotografia, e
      PNG de fotografia é duas a cinco vezes maior sem ganho nenhum de qualidade
      visível. O fundo branco é desenhado antes porque JPEG não tem
      transparência: sem ele, uma origem com canal alfa sai com o fundo preto.
    */
    const comFundo = document.createElement('canvas')
    comFundo.width = largura
    comFundo.height = altura
    const ctxFundo = comFundo.getContext('2d')
    if (!ctxFundo) throw new Error('canvas sem contexto 2d')
    ctxFundo.fillStyle = '#ffffff'
    ctxFundo.fillRect(0, 0, largura, altura)
    ctxFundo.drawImage(canvas, 0, 0)

    return comFundo.toDataURL('image/jpeg', QUALIDADE)
  } finally {
    bitmap.close()
  }
}

/*
  Baixa e reduz, em lotes.

  A ORDEM É PRESERVADA e isso importa: a legenda do documento é "Foto 1", "Foto
  2", pela posição na lista. Uma conversão que devolvesse na ordem de chegada
  embaralharia as legendas de uma visita para a outra sem ninguém perceber.

  O retorno traz `null` no lugar da foto que falhou, para quem chama decidir. A
  alternativa, levantar erro, trocaria um relatório com onze fotos por nenhum.
*/
export async function embutirFotos(fotos: FotoParaEmbutir[]): Promise<(string | null)[]> {
  const saida: (string | null)[] = Array.from({ length: fotos.length }, () => null)

  for (let inicio = 0; inicio < fotos.length; inicio += EM_PARALELO) {
    const lote = fotos.slice(inicio, inicio + EM_PARALELO)

    await Promise.all(
      lote.map(async (foto, posicaoNoLote) => {
        const posicao = inicio + posicaoNoLote
        try {
          const resposta = await fetch(foto.url)
          if (!resposta.ok) return
          saida[posicao] = await reduzir(await resposta.blob())
        } catch {
          /*
            Engolir é deliberado, e é a mesma decisão de `signReportPhotos`: a
            foto que não converte sai do documento e as outras ficam. Quem chama
            compara a contagem e avisa a pessoa.
          */
        }
      }),
    )
  }

  return saida
}
