// O recorte da foto de perfil: a janela nunca mostra vazio.
//
// COMO RODAR
//   npm run test:avatar-crop
//
// POR QUE ESTE ARQUIVO EXISTE
//   Erro de recorte não quebra nada visível: a foto sai deslocada, ou com uma
//   faixa transparente na borda, e isso passa por "ficou torto" em vez de bug.
//   Nada mais no projeto cobra essa conta — nem o TypeScript, nem o banco.
//
//   O caso que motivou o arredondamento em `cropRect` é o pior deles: com
//   `scale` exatamente no mínimo, o float produz sx = -1e-7, e o `drawImage`
//   devolve uma coluna de pixels transparentes na borda. Um pixel, e visível
//   num avatar redondo.

import { clampOffset, cropRect, maxOffset, minScale } from '../src/features/profile/image.ts'

let passed = 0
let failed = 0

function check(name, ok, detail) {
  if (ok) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name} — ${detail}`)
  }
}

const VIEWPORT = 280
const paisagem = { naturalWidth: 4000, naturalHeight: 3000 }
const retrato = { naturalWidth: 1200, naturalHeight: 1600 }
const quadrada = { naturalWidth: 800, naturalHeight: 800 }

console.log('\nRecorte da foto de perfil\n')

// 1. A escala mínima cobre a janela -------------------------------------------
for (const [nome, imagem] of [
  ['paisagem', paisagem],
  ['retrato', retrato],
  ['quadrada', quadrada],
]) {
  const scale = minScale(imagem, VIEWPORT)
  const cobre =
    imagem.naturalWidth * scale >= VIEWPORT - 1e-9 &&
    imagem.naturalHeight * scale >= VIEWPORT - 1e-9
  check(`1.${nome} a escala mínima cobre a janela`, cobre, `scale=${scale}`)
}

// 2. Arrastar não descobre a janela -------------------------------------------
{
  const scale = minScale(paisagem, VIEWPORT)
  /* Um arraste absurdo, muito além do que o mouse alcança: o limite tem de
     segurar sozinho, e não depender de a tela mandar valores razoáveis. */
  const state = clampOffset(paisagem, VIEWPORT, { scale, offsetX: 99999, offsetY: -99999 })
  const limit = maxOffset(paisagem, VIEWPORT, scale)

  check(
    '2.1 o deslocamento é preso ao limite do eixo',
    Math.abs(state.offsetX - limit.x) < 1e-9 && Math.abs(state.offsetY + limit.y) < 1e-9,
    `${state.offsetX} vs ${limit.x}`,
  )

  const { sx, sy, size } = cropRect(paisagem, VIEWPORT, {
    scale,
    offsetX: 99999,
    offsetY: -99999,
  })
  check(
    '2.2 mesmo com arraste absurdo o recorte fica DENTRO da imagem',
    sx >= 0 && sy >= 0 && sx + size <= paisagem.naturalWidth + 1e-9 && sy + size <= paisagem.naturalHeight + 1e-9,
    `sx=${sx} sy=${sy} size=${size}`,
  )
}

// 3. Imagem quadrada no zoom mínimo não se move --------------------------------
{
  const scale = minScale(quadrada, VIEWPORT)
  const limit = maxOffset(quadrada, VIEWPORT, scale)
  check(
    '3.1 foto quadrada só se move depois de ampliada',
    limit.x === 0 && limit.y === 0,
    `${limit.x},${limit.y}`,
  )
}

// 4. Sem deslocamento, o recorte é o quadrado central --------------------------
{
  const scale = minScale(paisagem, VIEWPORT)
  const { sx, sy, size } = cropRect(paisagem, VIEWPORT, { scale, offsetX: 0, offsetY: 0 })

  /* Paisagem 4000x3000: o quadrado central tem o lado da MENOR dimensão, e sobra
     metade da diferença de cada lado na maior. */
  check('4.1 o lado do recorte é a menor dimensão', Math.abs(size - 3000) < 1e-6, String(size))
  check('4.2 sobra igual dos dois lados', Math.abs(sx - 500) < 1e-6, String(sx))
  check('4.3 e nada sobra na vertical', Math.abs(sy) < 1e-6, String(sy))
}

// 5. A borda no zoom mínimo — o caso do float ---------------------------------
{
  /* Dimensões escolhidas para `viewport / scale` cair em dízima: é onde o
     -1e-7 aparecia. */
  const irregular = { naturalWidth: 1234, naturalHeight: 987 }
  const scale = minScale(irregular, VIEWPORT)
  const { sx, sy, size } = cropRect(irregular, VIEWPORT, { scale, offsetX: 0, offsetY: 0 })

  check(
    '5.1 nenhuma coordenada negativa no zoom mínimo',
    sx >= 0 && sy >= 0,
    `sx=${sx} sy=${sy}`,
  )
  check(
    '5.2 e o recorte não passa da borda oposta',
    sx + size <= irregular.naturalWidth + 1e-9 && sy + size <= irregular.naturalHeight + 1e-9,
    `sx+size=${sx + size} de ${irregular.naturalWidth}`,
  )
}

// 6. Ampliar aumenta a resolução do recorte ------------------------------------
{
  const base = minScale(retrato, VIEWPORT)
  const semZoom = cropRect(retrato, VIEWPORT, { scale: base, offsetX: 0, offsetY: 0 })
  const comZoom = cropRect(retrato, VIEWPORT, { scale: base * 2, offsetX: 0, offsetY: 0 })

  /* Ampliar mostra MENOS imagem, e é isso que o `size` mede — quem confunde os
     dois inverte o slider de zoom sem perceber. */
  check('6.1 ampliar diminui a área recortada', comZoom.size < semZoom.size, `${comZoom.size} vs ${semZoom.size}`)
}

console.log(`\n${passed}/${passed + failed} casos passaram.`)
process.exit(failed > 0 ? 1 : 0)
