// O endereço em uma linha, como a ficha do cliente mostra.
//
// COMO RODAR
//   npm run test:client-address
//
// POR QUE EXISTE
//   A ficha montava o endereço sem o complemento. Em condomínio é o complemento
//   que diz qual casa é — "Alphaville Ceará 1, Quadra K1 - Lote 11" —, e sem ele
//   o endereço levava à portaria, não à obra. O pedido veio de produção.

import { formatAddress } from '../src/features/crm/address.ts'

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

console.log('\nEndereço da ficha do cliente\n')

/* O caso real do relato, com os dados da obra do Fernando. */
eq(
  '1.1  complemento entra logo depois do número',
  'Alameda Noruega, 11, Alphaville Ceará 1, Quadra K1 - Lote 11, Cidade Alpha, Eusébio, CE, 61765-865',
  formatAddress({
    street: 'Alameda Noruega',
    number: '11',
    complement: 'Alphaville Ceará 1, Quadra K1 - Lote 11',
    district: 'Cidade Alpha',
    city: 'Eusébio',
    state: 'CE',
    zipcode: '61765-865',
  }),
)

eq(
  '1.2  sem número, o complemento segue o logradouro',
  'Rua das Flores, Bloco B, Centro',
  formatAddress({ street: 'Rua das Flores', complement: 'Bloco B', district: 'Centro' }),
)

eq(
  '1.3  país fecha a linha quando existe',
  'Rua A, 10, Fortaleza, CE, Brasil',
  formatAddress({ street: 'Rua A', number: '10', city: 'Fortaleza', state: 'CE', country: 'Brasil' }),
)

/* Número sem rua não é endereço, e no começo da linha pareceria CEP. */
eq(
  '2.1  número sem logradouro é descartado',
  'Apto 302, Fortaleza',
  formatAddress({ number: '123', complement: 'Apto 302', city: 'Fortaleza' }),
)

eq(
  '2.2  parte em branco não deixa vírgula dupla',
  'Rua B, 5, Fortaleza',
  formatAddress({ street: 'Rua B', number: '5', complement: '   ', district: '', city: 'Fortaleza' }),
)

eq('2.3  nulos não viram "null"', 'Fortaleza, CE', formatAddress({ street: null, city: 'Fortaleza', state: 'CE' }))

/* Vazio é o sinal para a ficha esconder o bloco — não pode sobrar espaço nem
   vírgula, senão o bloco aparece com uma linha em branco. */
eq('2.4  sem parte nenhuma devolve vazio', '', formatAddress({}))

console.log(`\n${passed}/${passed + failed} casos passaram.`)
if (failed > 0) process.exit(1)
