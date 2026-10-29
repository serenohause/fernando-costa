/*
  O RELATÓRIO DE UMA VISITA À OBRA — o documento que vai para o cliente.

  COMO RODAR
    npm run test:relatorio-visita

  POR QUE ESTE ARQUIVO EXISTE

    1. O ESCAPE, que é a parte com consequência. O documento é montado por
       concatenação de string e entregue a um iframe de MESMA ORIGEM. Sem
       escape, um `<script>` digitado no resumo de uma visita roda com a sessão
       do Supabase de quem clicou em gerar. O texto vem de qualquer colaborador
       que escreva no diário. O cabeçalho de src/features/diary/report.ts conta
       o defeito inteiro, que veio do sistema original e foi fechado na
       migração; estes casos são o que impede alguém de reabri-lo ao acrescentar
       uma seção e esquecer o `h()`.

    2. A NUMERAÇÃO DAS SEÇÕES, que não é cosmética: a seção de observações só
       existe quando há observação. Com número fixo, o documento pularia de "1."
       para "3." na frente do cliente.

    3. O VAZIO AFIRMADO. Relatório que cala sobre pendências deixa o cliente sem
       saber se não houve nenhuma ou se ninguém olhou.

  O QUE ELE NÃO COBRE
    Paginação e aparência. Isso é papel, e foi medido em A4 no protótipo
    aprovado (prototypes/relatorio-visita.html). Aqui é o conteúdo e o escape.
*/

import { buildVisitReportHTML } from '../src/features/diary/visit-report.ts'

let ok = 0
let falhas = 0
const caso = (nome, esperado, obtido) => {
  const a = JSON.stringify(esperado)
  const b = JSON.stringify(obtido)
  if (a === b) {
    console.log(`PASS  ${nome}`)
    ok++
  } else {
    console.log(`FAIL  ${nome}\n        esperado=${a}\n        obtido=${b}`)
    falhas++
  }
}

const AGORA = new Date('2026-10-29T16:42:00')

const projeto = {
  id: 'p1',
  name: 'Alfa Engenharia',
  client: { id: 'c1', name: 'Guilherme Saraiva' },
  responsible: null,
  current_phase: null,
  start_date: null,
}

const visita = (campos = {}) => ({
  id: 'v1',
  visit_date: '2026-10-28',
  visit_time: '09:30:00',
  visit_type: 'follow_up',
  status: 'no_issues',
  summary: 'Verificar a compatibilidade da execução com o projeto arquitetônico.',
  notes: null,
  responsible: { id: 'r1', name: 'Júlia Tomé' },
  files: [],
  ...campos,
})

const pendencia = (campos = {}) => ({
  id: 'i1',
  issue_number: 7,
  description: 'Vão da esquadria do estar com 4 cm a menos que o projeto.',
  category: 'other',
  status: 'open',
  identified_date: '2026-10-28',
  due_date: '2026-11-05',
  resolved_at: null,
  responsible: { id: 'r2', name: 'Mariana Lopes' },
  resolved_by: null,
  files: [],
  events: [],
  ...campos,
})

const montar = (campos = {}) =>
  buildVisitReportHTML({
    visit: visita(),
    project: projeto,
    issues: [],
    photos: [],
    attachments: [],
    officeName: 'Fernando Costa Arquitetura',
    authorName: 'Fernando Costa',
    now: AGORA,
    ...campos,
  })

/* ── O escape ──────────────────────────────────────────────────────────── */

console.log('\nO escape, que é a parte com consequência\n')

/*
  O CASO QUE DÁ NOME AO ARQUIVO. Se este falhar, o documento voltou a ser um
  vetor de XSS armazenado: o script rodaria com a sessão de quem gerou.
*/
{
  const html = montar({
    visit: visita({ summary: '<script>alert(document.cookie)</script>' }),
  })
  caso('1  script no resumo não sai como tag', 0, (html.match(/<script/g) ?? []).length)
  caso('2  ele sai escapado, e não some', true, html.includes('&lt;script&gt;'))
}

{
  const html = montar({
    visit: visita({ notes: '</div><img src=x onerror="alert(1)">' }),
  })
  caso('3  marcação na observação não fecha o bloco', 0, (html.match(/<img src=x/g) ?? []).length)
  caso('4  o onerror sai como texto', true, html.includes('onerror=&quot;alert(1)&quot;'))
}

{
  /* O nome do projeto e o do cliente vêm de outra tela, e também são texto que
     alguém digitou. */
  const html = montar({
    project: { ...projeto, name: '<b>Alfa</b>', client: { id: 'c', name: "O'Brien & Filhos" } },
  })
  caso('5  nome do projeto escapa', true, html.includes('&lt;b&gt;Alfa&lt;/b&gt;'))
  caso('6  aspas e e-comercial do cliente escapam', true, html.includes('O&#39;Brien &amp; Filhos'))
}

{
  const html = montar({
    issues: [pendencia({ description: '"><script>x</script>', responsible: null })],
  })
  caso('7  descrição de pendência escapa', 0, (html.match(/<script/g) ?? []).length)
}

{
  /* Nome de arquivo também é texto de quem subiu o anexo. */
  const html = montar({
    attachments: [{ id: 'f1', file_name: '<svg onload=alert(1)>.pdf', file_kind: 'attachment' }],
  })
  caso('8  nome de arquivo escapa', 0, (html.match(/<svg/g) ?? []).length)
}

{
  /* Varredura de fecho: com TODO campo hostil ao mesmo tempo, nenhuma tag nova
     pode nascer no documento além das que o modelo escreve. */
  const hostil = '<script>a</script><iframe></iframe><img onerror=1>'
  const html = montar({
    visit: visita({ summary: hostil, notes: hostil }),
    project: { ...projeto, name: hostil, client: { id: 'c', name: hostil } },
    issues: [pendencia({ description: hostil })],
    attachments: [{ id: 'f1', file_name: hostil, file_kind: 'attachment' }],
    officeName: hostil,
    authorName: hostil,
  })
  const proibidas = (html.match(/<(script|iframe|img|svg|object|embed)[\s>]/gi) ?? []).length
  caso('9  nenhuma tag perigosa nasce com todos os campos hostis', 0, proibidas)
  caso('10 e nenhum endereço javascript:', 0, (html.match(/javascript:/gi) ?? []).length)
}

/* ── As seções ─────────────────────────────────────────────────────────── */

console.log('\nAs seções e a numeração\n')

{
  const semObs = montar()
  caso(
    '1  sem observação, a numeração não pula',
    ['1. Resumo da visita', '2. Pendências identificadas nesta visita'],
    [...semObs.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]),
  )
}

{
  const comObs = montar({ visit: visita({ notes: 'Reforçar a proteção das esquadrias.' }) })
  caso(
    '2  com observação, ela entra como seção 2',
    ['1. Resumo da visita', '2. Observações', '3. Pendências identificadas nesta visita'],
    [...comObs.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]),
  )
  caso('3  o texto da observação sai', true, comObs.includes('Reforçar a proteção'))
}

{
  /* Observação só de espaço é o mesmo que não ter observação: seção vazia num
     documento formal parece defeito. */
  const html = montar({ visit: visita({ notes: '   ' }) })
  caso('4  observação em branco não cria seção', false, html.includes('Observações'))
}

{
  const comFotos = montar({
    photos: [
      { file: { id: 'a' }, dataUrl: 'data:image/jpeg;base64,AAA' },
      { file: { id: 'b' }, dataUrl: 'data:image/jpeg;base64,BBB' },
    ],
  })
  caso(
    '5  a galeria entra como seção própria',
    ['1. Resumo da visita', '2. Pendências identificadas nesta visita', '3. Registro fotográfico'],
    [...comFotos.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]),
  )
  caso(
    '6  legenda é o número da foto',
    ['Foto 1', 'Foto 2'],
    [...comFotos.matchAll(/<div class="photo-caption">([^<]+)<\/div>/g)].map((m) => m[1]),
  )
  caso('7  a foto vai embutida, e não por endereço', 2, (comFotos.match(/src="data:image/g) ?? []).length)
  caso('8  contagem no plural', true, comFotos.includes('2 fotos registradas'))
}

{
  const umaFoto = montar({ photos: [{ file: { id: 'a' }, dataUrl: 'data:image/jpeg;base64,A' }] })
  caso('9  contagem no singular', true, umaFoto.includes('1 foto registrada'))
}

{
  /*
    Confere os TÍTULOS DE SEÇÃO, e não a frase solta no documento: ela também
    aparece dentro de um comentário do CSS, e a primeira versão deste caso
    passava por isso em vez de pelo que queria provar.
  */
  const titulos = [...montar().matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1])
  caso('10 sem foto, não existe seção de registro fotográfico', false,
    titulos.some((titulo) => titulo.includes('Registro fotográfico')))
}

/* ── Pendências ────────────────────────────────────────────────────────── */

console.log('\nPendências\n')

{
  const vazio = montar()
  caso('1  o vazio é AFIRMADO, não é a seção sumindo', true,
    vazio.includes('Nenhuma pendência foi identificada nesta visita.'))
  caso('2  e a seção continua existindo', true,
    vazio.includes('Pendências identificadas nesta visita'))
}

{
  const uma = montar({ issues: [pendencia()] })
  caso('3  uma pendência, texto no singular', true, uma.includes('1 pendência vinculada'))
  caso('4  número da pendência sai', true, uma.includes('#7'))
  caso('5  prazo sai quando a pendência está aberta', true, uma.includes('Prazo: 05/11/2026'))
}

{
  const duas = montar({ issues: [pendencia(), pendencia({ id: 'i2', issue_number: 8 })] })
  caso('6  duas pendências, texto no plural', true, duas.includes('2 pendências vinculadas'))
}

{
  /*
    PENDÊNCIA RESOLVIDA MOSTRA A DATA DA RESOLUÇÃO, E NÃO O PRAZO. Mostrar
    "Prazo: 05/11" numa pendência já resolvida é informar o que não importa mais,
    e num documento que vai ao cliente parece cobrança de algo já feito.
  */
  const resolvida = montar({
    issues: [pendencia({ status: 'resolved', resolved_at: '2026-11-02' })],
  })
  caso('7  resolvida mostra a data da resolução', true, resolvida.includes('Resolvida em 02/11/2026'))
  caso('8  e não mostra o prazo', false, resolvida.includes('Prazo:'))
}

{
  /* Responsável é anulável; "Responsável: " seguido de nada é pior que a
     ausência da linha. */
  const semResp = montar({ issues: [pendencia({ responsible: null })] })
  caso('9  pendência sem responsável não imprime rótulo órfão', false,
    semResp.includes('Responsável:'))
}

/* ── Identificação e assinatura ────────────────────────────────────────── */

console.log('\nIdentificação e assinatura\n')

{
  const html = montar()
  caso('1  a data da visita sai em formato brasileiro', true, html.includes('28/10/2026'))
  caso('2  a hora sai sem os segundos', true, html.includes('>09:30<'))
  caso('3  o escritório vai no cabeçalho, e não um nome fixo', true,
    html.includes('Fernando Costa Arquitetura • HausOne'))
  caso('4  assina quem fez a visita', true, html.includes('>Júlia Tomé<'))
}

{
  /* Sem responsável na visita, assina quem gerou o documento: folha de
     assinatura em branco num relatório formal não serve para nada. */
  const html = montar({ visit: visita({ responsible: null }) })
  caso('5  sem responsável, assina quem gerou', true, html.includes('>Fernando Costa<'))
}

{
  const html = montar({ visit: visita({ visit_time: null, responsible: null }) })
  caso('6  hora ausente não deixa a célula vazia', 2, (html.match(/—/g) ?? []).length)
}

{
  const html = montar()
  caso('7  o rodapé diz quando o documento foi gerado', true,
    html.includes('Documento gerado em 29/10/2026 às 16:42'))
  /*
    O TIPO DA VISITA SAI PELO RÓTULO, e não pela chave do banco. A prova no
    navegador pegou a célula "Tipo" vazia, e a causa era a fixture usando uma
    chave que não existe no enum. O caso fica para a célula não voltar a sair
    muda sem ninguém notar.
  */
  caso('8  o tipo da visita sai traduzido', true, html.includes('>Acompanhamento<'))
}

console.log(`\n${ok}/${ok + falhas} casos passaram.`)
process.exit(falhas ? 1 : 0)
