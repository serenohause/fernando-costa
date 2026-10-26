// Quem está chamando, do ponto de vista das portas públicas.
//
// COMO RODAR
//   npm run test:identidade
//
// POR QUE ESTE ARQUIVO EXISTE
//   `clientKey` é a identidade que o limite de requisições conta, e ela ERRAVA:
//   lia o PRIMEIRO valor de `x-forwarded-for`, que é justamente o que o cliente
//   escreve (proxy acrescenta ao FIM da lista, nunca ao começo). Medido contra a
//   função local antes da correção: 25 requisições de um único host, cada uma
//   com um cabeçalho diferente, deram 25 baldes separados e ZERO recusas. O teto
//   de 10 por minuto nunca era alcançado.
//
//   Não é só do módulo de leads: o mesmo `clientKey` serve open-client-intake e
//   submit-client-intake, e as migrations 0025, 0026 e 0027 justificam decisões
//   apoiadas em "há limite de requisição na frente".
//
//   O que se afirma aqui é o que não dá para afirmar pela HTTP contra o stack
//   local: lá o kong não escreve `cf-connecting-ip`, então um cabeçalho forjado
//   ganharia e o teste provaria o contrário do que acontece em produção. A
//   função é pura; conferir a precedência direto é mais honesto.

import { clientKey } from '../supabase/functions/_shared/client-key.ts'

let passed = 0
let failed = 0
function eq(name, esperado, observado) {
  if (esperado === observado) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}\n        esperado=${JSON.stringify(esperado)}\n        observado=${JSON.stringify(observado)}`)
  }
}

const pedido = (headers) => new Request('https://exemplo.test/', { headers })

console.log('\nA precedência\n')

eq(
  '1  cf-connecting-ip ganha de tudo',
  'cf:203.0.113.7',
  clientKey(pedido({ 'cf-connecting-ip': '203.0.113.7', 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' })),
)
eq(
  '2  sem cf, x-real-ip ganha do x-forwarded-for',
  'xri:198.51.100.5',
  clientKey(pedido({ 'x-real-ip': '198.51.100.5', 'x-forwarded-for': '9.9.9.9' })),
)
eq(
  '3  sobrando só x-forwarded-for, vale o ÚLTIMO',
  'xff:198.51.100.20',
  clientKey(pedido({ 'x-forwarded-for': '9.9.9.9, 198.51.100.20' })),
)
eq('4  sem cabeçalho nenhum, balde único', 'desconhecido', clientKey(pedido({})))

console.log('\nO furo que isto fecha\n')

// Era aqui que o atacante escolhia a própria identidade.
eq(
  '1  cabeçalho forjado NÃO vira a identidade quando a borda informa',
  'cf:198.51.100.20',
  clientKey(pedido({ 'x-forwarded-for': '9.9.9.9', 'cf-connecting-ip': '198.51.100.20' })),
)
eq(
  '2  dois forjados seguidos caem no MESMO balde',
  clientKey(pedido({ 'x-forwarded-for': '1.1.1.1', 'cf-connecting-ip': '198.51.100.20' })),
  clientKey(pedido({ 'x-forwarded-for': '2.2.2.2', 'cf-connecting-ip': '198.51.100.20' })),
)
// O cliente pode encher a lista; o que o proxy acrescenta fica no fim.
eq(
  '3  lista inteira forjada, só o último conta',
  'xff:203.0.113.9',
  clientKey(pedido({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.9' })),
)
eq(
  '4  o primeiro valor NUNCA é a identidade',
  false,
  clientKey(pedido({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' })).endsWith('9.9.9.9'),
)

console.log('\nBorda\n')

eq('1  espaço em volta é aparado', 'cf:203.0.113.7', clientKey(pedido({ 'cf-connecting-ip': '  203.0.113.7  ' })))
eq('2  cabeçalho vazio não vale como identidade', 'desconhecido', clientKey(pedido({ 'x-forwarded-for': '' })))
eq('3  lista só com vírgulas e espaço cai no balde único', 'desconhecido', clientKey(pedido({ 'x-forwarded-for': ' , , ' })))
eq(
  '4  cf vazio não atropela o x-forwarded-for',
  'xff:203.0.113.9',
  clientKey(pedido({ 'cf-connecting-ip': '   ', 'x-forwarded-for': '203.0.113.9' })),
)
// IPv6 cabe no `left(p_client_key, 100)` da função de banco, com prefixo e tudo.
eq(
  '5  IPv6 passa inteiro',
  'cf:2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  clientKey(pedido({ 'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334' })),
)
eq(
  '6  e continua abaixo do teto de 100 caracteres da coluna',
  true,
  clientKey(pedido({ 'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334' })).length <= 100,
)

console.log('\nO prefixo diz de onde veio\n')

// Sem ele não há como saber, do ambiente hospedado, qual degrau está em uso —
// e chutar seria repetir o erro de documentar uma defesa sem conferir.
eq('1  três fontes, três prefixos distintos', 3,
  new Set([
    clientKey(pedido({ 'cf-connecting-ip': '1.1.1.1' })),
    clientKey(pedido({ 'x-real-ip': '1.1.1.1' })),
    clientKey(pedido({ 'x-forwarded-for': '1.1.1.1' })),
  ]).size)
eq('2  o MESMO endereço por fontes diferentes não se confunde', false,
  clientKey(pedido({ 'cf-connecting-ip': '1.1.1.1' })) === clientKey(pedido({ 'x-real-ip': '1.1.1.1' })))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
