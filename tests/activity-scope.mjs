// O escopo da tela de Atividades: por padrão, o próprio trabalho.
//
// COMO RODAR
//   npm run test:activity-scope
//
// POR QUE ESTE ARQUIVO EXISTE
//   O bug que ele guarda chegou ao escritório: todos os funcionários viam as
//   atividades de todos, o tempo todo. A causa não foi uma policy errada — foi
//   a AUSÊNCIA do recorte de tela. A lista que chega do banco já vem aberta
//   para quem tem o menu "Atividades", e a importação do base44 trouxe esse
//   menu para 13 dos 16 colaboradores. No original, ter o menu dava a TELA; o
//   interruptor "Visão Gerencial", desligado por padrão, é que dava a lista
//   inteira.
//
//   Nada mais cobra isto: o TypeScript aceita, o banco responde, a tela
//   renderiza. O sintoma é uma lista grande demais, que só quem conhece a
//   equipe percebe.

import { scopeActivitiesToPerson } from '../src/features/activities/list.ts'

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

const EU = 'col-eu'
const COLEGA = 'col-colega'
const SUBORDINADO = 'col-subordinado'

const atividade = (id, collaborator_id, coordinator_id = null) => ({
  id,
  collaborator_id,
  coordinator_id,
})

const lista = [
  atividade('minha', EU),
  atividade('do-colega', COLEGA),
  atividade('do-colega-que-outro-coordena', COLEGA, 'col-outro-coordenador'),
  atividade('de-quem-eu-coordeno', SUBORDINADO, EU),
  atividade('minha-com-coordenador', EU, 'col-outro-coordenador'),
]

console.log('\nEscopo da tela de Atividades\n')

// 1. O padrão: só o que é meu ------------------------------------------------
{
  const ids = scopeActivitiesToPerson(lista, EU).map((a) => a.id)

  check('1.1 as minhas aparecem', ids.includes('minha'), ids.join(','))
  check(
    '1.2 a do colega NÃO aparece',
    !ids.includes('do-colega'),
    ids.join(','),
  )
  check(
    '1.3 a de quem eu coordeno aparece',
    ids.includes('de-quem-eu-coordeno'),
    ids.join(','),
  )
  /* Minha atividade continua minha mesmo quando outra pessoa a coordena — o
     recorte é uma OU, não uma E. */
  check(
    '1.4 a minha coordenada por outro continua aparecendo',
    ids.includes('minha-com-coordenador'),
    ids.join(','),
  )
  check(
    '1.5 a do colega coordenada por outro NÃO aparece',
    !ids.includes('do-colega-que-outro-coordena'),
    ids.join(','),
  )
}

// 2. Quem não coordena ninguém vê só as suas ----------------------------------
{
  const ids = scopeActivitiesToPerson(lista, COLEGA).map((a) => a.id)
  check(
    '2.1 quem não coordena ninguém vê apenas as próprias',
    ids.length === 2 && ids.every((id) => id.startsWith('do-colega')),
    ids.join(','),
  )
}

// 3. O caso que produziu o bug ------------------------------------------------
{
  /* Uma equipe inteira numa lista, como a que o banco devolve para quem tem o
     menu. Sem o recorte, era isto que cada pessoa via. */
  const equipe = Array.from({ length: 40 }, (_, i) =>
    atividade(`a${i}`, i === 0 ? EU : `col-${i}`),
  )
  const ids = scopeActivitiesToPerson(equipe, EU).map((a) => a.id)
  check('3.1 de 40 atividades da equipe, sobra 1', ids.length === 1 && ids[0] === 'a0', ids.join(','))
}

// 4. Sessão ainda não resolvida ------------------------------------------------
{
  /* Enquanto o colaborador não carregou, não há "minhas" a calcular. Devolver
     vazio esconderia o trabalho de quem está esperando a tela — e o estado dura
     milissegundos. */
  check(
    '4.1 sem colaborador identificado, a lista não é recortada',
    scopeActivitiesToPerson(lista, null).length === lista.length,
    String(scopeActivitiesToPerson(lista, null).length),
  )
}

console.log(`\n${passed}/${passed + failed} casos passaram.`)
process.exit(failed > 0 ? 1 : 0)
