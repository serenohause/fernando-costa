// A ordem padrão da lista de Projetos: do mais recente para o mais antigo.
//
// COMO RODAR
//   npm run test:project-order
//
// POR QUE ESTE ARQUIVO EXISTE
//   O critério antigo era o NÚMERO DO CONTRATO em ordem decrescente, e ele tinha
//   um efeito que ninguém pediu: projeto SEM contrato cai com número 0 e vai
//   para o fim da lista. Ou seja, o projeto recém-criado — que é o que se quer
//   ver primeiro — era o último. O pedido do usuário foi exatamente esse:
//   "deve ser exibido por padrão pelo último criado".
//
//   Ordem não quebra teste de banco nem typecheck: ela erra em silêncio, e só
//   quem conhece a lista percebe. Daí este arquivo.
//
// O QUE ELE GUARDA
//   1. mais recente primeiro;
//   2. projeto ARRASTADO continua vencendo a data — desfazer em silêncio uma
//      ordenação montada à mão seria pior do que a ordem padrão errada;
//   3. empate de instante (importação em lote grava tudo no mesmo `now()`) tem
//      desempate ESTÁVEL, senão a lista troca de ordem sozinha entre releituras.

import { sortProjects } from '../src/features/projects/list.ts'

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

const project = (id, createdAt, displayOrder = null) => ({
  id,
  created_at: createdAt,
  display_order: displayOrder,
})

console.log('\nOrdem da lista de Projetos\n')

// 1. Mais recente primeiro ---------------------------------------------------
{
  const ordered = sortProjects([
    project('antigo', '2026-01-10T12:00:00Z'),
    project('novo', '2026-09-01T12:00:00Z'),
    project('meio', '2026-05-05T12:00:00Z'),
  ])
  check(
    '1.1 o mais recente vem primeiro',
    ordered.map((p) => p.id).join(',') === 'novo,meio,antigo',
    ordered.map((p) => p.id).join(','),
  )
}

// 2. O arraste vence a data --------------------------------------------------
{
  const ordered = sortProjects([
    project('novo', '2026-09-01T12:00:00Z'),
    project('arrastado', '2020-01-01T12:00:00Z', 1),
  ])
  check(
    '2.1 projeto arrastado fica acima de um mais recente',
    ordered[0].id === 'arrastado',
    ordered.map((p) => p.id).join(','),
  )
}

{
  const ordered = sortProjects([
    project('segundo', '2026-09-01T12:00:00Z', 2),
    project('primeiro', '2020-01-01T12:00:00Z', 1),
  ])
  check(
    '2.2 entre arrastados vale a ordem do arraste, não a data',
    ordered.map((p) => p.id).join(',') === 'primeiro,segundo',
    ordered.map((p) => p.id).join(','),
  )
}

// 3. Empate estável ----------------------------------------------------------
{
  const mesmoInstante = '2026-08-27T18:00:00Z'
  const entrada = [
    project('ccc', mesmoInstante),
    project('aaa', mesmoInstante),
    project('bbb', mesmoInstante),
  ]

  const primeira = sortProjects(entrada).map((p) => p.id).join(',')
  /* A MESMA lista em outra ordem de entrada: se o desempate não fosse estável,
     as duas leituras devolveriam sequências diferentes — que é como a lista
     "troca de ordem sozinha" na tela de quem só apertou F5. */
  const segunda = sortProjects([...entrada].reverse()).map((p) => p.id).join(',')

  check('3.1 empate de instante devolve sempre a mesma ordem', primeira === segunda, `${primeira} vs ${segunda}`)
}

console.log(`\n${passed}/${passed + failed} casos passaram.`)
process.exit(failed > 0 ? 1 : 0)
