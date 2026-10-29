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
  ALTURA TAMBÉM TEM TETO, e não só a largura. Achado de auditoria: a escala
  olhava apenas a largura, então uma imagem de 1600x100000 passava com escala 1
  e produzia um canvas de 160 milhões de pixels. Com os dois tetos, o maior
  resultado possível é 1600x1600, ou 2,56 milhões de pixels, caiba o que couber
  na origem.
*/
const ALTURA_MAXIMA = 1600

/*
  E A ORIGEM TEM TETO DE PIXEL, não só de bytes.

  O limite do bucket é 20 MB de BYTES (ver ./files), e PNG comprime muito: um
  arquivo de 1 MB pode decodificar para 30000x30000, que são 3,6 GB de bitmap. O
  teto de bytes não protege de nada aqui.

  60 milhões de pixels passa folgado em qualquer câmera real, inclusive celular
  de 48 MP (8000x6000 = 48 milhões), e barra o que só existe para derrubar a
  aba.

  LIMITAÇÃO HONESTA: a conferência acontece DEPOIS de `createImageBitmap`, que
  já alocou. Saber o tamanho antes exigiria ler o cabeçalho do arquivo à mão,
  formato por formato. O que este teto evita é o trabalho seguinte, que é o caro:
  canvas, pintura e serialização em base64. O bitmap é liberado no `finally`.
*/
const PIXELS_MAXIMOS_NA_ORIGEM = 60_000_000

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
    if (bitmap.width * bitmap.height > PIXELS_MAXIMOS_NA_ORIGEM) {
      throw new Error(`imagem grande demais: ${bitmap.width}x${bitmap.height}`)
    }

    const escala = Math.min(1, LARGURA_MAXIMA / bitmap.width, ALTURA_MAXIMA / bitmap.height)
    const largura = Math.max(1, Math.round(bitmap.width * escala))
    const altura = Math.max(1, Math.round(bitmap.height * escala))

    /*
      UM CANVAS SÓ, e isto veio de auditoria. A primeira versão desenhava num
      canvas e copiava para um segundo só para ter fundo branco: dois canvas do
      tamanho cheio vivos ao mesmo tempo, dobrando o pico de memória, e isso
      vezes quatro em paralelo. Pintar o branco ANTES e desenhar a foto em cima
      dá o mesmo resultado com metade do custo, porque o branco fica embaixo do
      canal alfa.

      SEMPRE JPEG, inclusive quando a origem é PNG: foto de obra é fotografia, e
      PNG de fotografia é várias vezes maior sem ganho visível. O fundo existe
      porque JPEG não tem transparência, e sem ele origem com alfa sai com fundo
      preto.
    */
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas sem contexto 2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largura, altura)
    ctx.drawImage(bitmap, 0, 0, largura, altura)

    const dataUrl = canvas.toDataURL('image/jpeg', QUALIDADE)

    /*
      CONFERIR O QUE SAIU, e este é o dente que a auditoria achou. Canvas que
      estoura a área máxima do navegador não lança: no Chromium ele fica
      inutilizável e `toDataURL` devolve a string "data:,", que é TRUTHY. Ela
      passava pela checagem de nulo do hook, entrava no documento como quadro
      quebrado E ERA CONTADA COMO FOTO QUE ENTROU, então nem o aviso de "foto
      não entrou" disparava. O PDF saía furado na frente do cliente, que é
      exatamente o defeito que esta função existe para evitar.
    */
    if (!dataUrl.startsWith('data:image/jpeg')) {
      throw new Error('o navegador não conseguiu serializar a imagem')
    }

    return dataUrl
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
