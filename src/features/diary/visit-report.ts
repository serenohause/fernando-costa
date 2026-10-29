import { format } from 'date-fns'
/* Caminho relativo com extensão, e não o apelido "@/": este módulo é importado
   direto pelo node em tests/relatorio-visita.mjs, e o node não conhece o apelido
   do Vite. Mesma solução de ./fila.ts e de ./task-events.ts. Importação de TIPO
   pode continuar sem extensão, porque ela é apagada antes de rodar. */
import { formatDateBR } from '../../lib/format.ts'
import {
  PROJECT_ISSUE_CATEGORY,
  PROJECT_ISSUE_STATUS,
  SITE_VISIT_STATUS,
  SITE_VISIT_TYPE,
} from '../../lib/enums.ts'
import { h } from '../../lib/html-escape.ts'
import type { DiaryFile, DiaryProject, ProjectIssueRow, SiteVisitRow } from './types'

/*
  ═══════════════════════════════════════════════════════════════════════════
  O RELATÓRIO DE UMA VISITA À OBRA — o documento que o escritório manda ao
  cliente depois de ir à obra.
  ═══════════════════════════════════════════════════════════════════════════

  POR QUE ELE NÃO É O RELATÓRIO DO PROJETO FILTRADO. O documento de ./report é
  do projeto inteiro: abre com capa, tem seis seções ligáveis e uma galeria que
  junta foto de visita com foto de pendência. Recortá-lo para uma visita daria
  um relatório de projeto quase todo vazio, com capa e tudo. Uma visita é um
  documento curto, de uma a três folhas, e o layout aprovado
  (prototypes/relatorio-visita.html) é desse formato.

  O QUE ELE COMPARTILHA COM O OUTRO, DE PROPÓSITO:

    - `h()`, o escape. Não é cuidado teórico: o documento é montado por
      concatenação de string e vai para um iframe de MESMA ORIGEM, então um
      `<script>` digitado no resumo de uma visita rodaria com a sessão de quem
      clicou em gerar. O cabeçalho de ./report conta o defeito inteiro. A regra
      aqui é a mesma e vale sem exceção: TODA interpolação passa por `h()`,
      inclusive rótulo de enum e número, porque "escapa tudo" se audita de
      relance e "escapa o que vem do usuário" depende de acertar linha a linha.
    - `printReport()`, a entrega por iframe com `sandbox` sem `allow-scripts`.
    - As cores. Nenhum hex novo: todos saem do REPORT_CSS do outro documento,
      para os dois parecerem o mesmo escritório.

  O QUE É DIFERENTE, E A MEDIDA POR TRÁS:

    A FOTO VEM EMBUTIDA, e não por URL assinada. No relatório do projeto a foto
    entra por endereço que o Storage assina e que vale cinco minutos: quem deixa
    a janela de impressão aberta e só então salva recebe quadros vazios. Para um
    relatório de projeto, lido na hora, é incômodo. Para este, cujo motivo de
    existir é virar arquivo e ser enviado ao cliente, seria entregar PDF furado.
    Aqui cada foto chega como `data:` já reduzida (ver ./photo-embed), e o
    documento salvo não depende de mais nada.

  SEM JAVASCRIPT NO DOCUMENTO. O iframe não roda script, então nada aqui pode
  depender de JS. Não há `<script>`, não há `onclick`, não há endereço `javascript:`.
*/

/* ── O CSS, igual ao protótipo aprovado ────────────────────────────────── */

/*
  CSS EM HEX, E ISSO NÃO CONTRADIZ O CLAUDE.md, pela mesma razão que ./report
  registra: o documento é impresso e não alcança folha de estilo nenhuma da
  aplicação, então carrega as próprias cores. Todas elas já existem em
  REPORT_CSS.

  Os comentários de medida vêm do protótipo e ficam: cada um registra uma
  quebra de página que foi medida em A4, não suposta.
*/
const VISIT_REPORT_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 14px; line-height: 1.6; }
    @page { size: A4; margin: 10mm; }
    .page { padding: 32px 52px; }

    .doc-office { font-size: 13px; letter-spacing: 4px; color: #94a3b8; text-transform: uppercase; }
    .doc-rule { height: 2px; background: #e2e8f0; margin: 10px 0 18px; }
    .doc-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .doc-title { font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.2; letter-spacing: 0.2px; }
    .doc-subject { font-size: 16px; color: #475569; margin-top: 6px; }
    .doc-subject strong { color: #0f172a; font-weight: 600; }

    .ident { display: flex; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
    .ident-cell { flex: 1; padding: 10px 14px; border-left: 1px solid #e2e8f0; }
    .ident-cell:first-child { border-left: 0; }
    .ident-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; line-height: 1.4; }
    .ident-value { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; line-height: 1.4; }

    h2 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 14px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; break-after: avoid; page-break-after: avoid; }
    /* Recusa quebra depois de si pelo mesmo motivo do h2, e ATENÇÃO: nada de
       crase em comentário aqui dentro, porque este CSS mora num template
       literal e a crase fecha a string. Medido na prova do gerador: o título
       "Arquivos" terminava a página sozinho, com a lista já na seguinte. */
    h3 { font-size: 14px; font-weight: 700; color: #334155; margin: 16px 0 8px; break-after: avoid; page-break-after: avoid; }
    /* A linha de contagem logo abaixo do h2 TAMBÉM recusa quebra depois de si:
       sem isso "Registro fotográfico" termina a página sozinho, com a primeira
       foto já na seguinte. Medido em A4. */
    .section-note { font-size: 11px; color: #94a3b8; margin: -6px 0 12px; break-after: avoid; page-break-after: avoid; }

    .entry { margin: 10px 0; padding: 12px 16px; background: #f8fafc; border-left: 3px solid #cbd5e1; border-radius: 0 8px 8px 0; break-inside: avoid; page-break-inside: avoid; }
    .entry-visit { border-left-color: #f97316; }
    .entry-lead { font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
    .entry-desc { font-size: 13px; color: #475569; line-height: 1.7; }
    .notes { font-size: 13px; color: #475569; line-height: 1.7; }

    .issue { margin: 10px 0; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; break-inside: avoid; page-break-inside: avoid; }
    .issue-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .issue-num { font-size: 13px; font-weight: 700; color: #94a3b8; font-family: monospace; }
    .issue-desc { font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 4px; }
    .issue-meta { font-size: 11px; color: #64748b; line-height: 1.6; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-aberta,    .badge-visita-com-pendencias { background: #ffe4e6; color: #be123c; }
    .badge-resolvida, .badge-visita-sem-pendencias { background: #d1fae5; color: #065f46; }
    .badge-andamento, .badge-visita-aguardando     { background: #fef3c7; color: #92400e; }
    .badge-cancelada                               { background: #f1f5f9; color: #64748b; }
    .badge-visita-resolvido                        { background: #dbeafe; color: #1d4ed8; }

    .no-data { text-align: center; color: #94a3b8; font-size: 13px; padding: 20px; }
    .no-data strong { display: block; color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 2px; }

    /* TRÊS COLUNAS POR inline-block, E NÃO POR GRID: contêiner de grid não
       fragmenta entre páginas no Chromium, então a galeria inteira desce junto
       quando a primeira fileira não cabe. Com doze fotos isso é uma página
       quase vazia antes delas. O que protege a foto é o break-inside de cada
       item: foto cortada ao meio pela quebra é o defeito que não pode
       acontecer. O font-size zero mata o espaço que o inline-block herda das
       quebras de linha do HTML. */
    .photo-grid { font-size: 0; margin: 12px 0 4px; }
    .photo-item { display: inline-block; vertical-align: top; width: calc((100% - 16px) / 3); margin: 0 8px 8px 0; break-inside: avoid; page-break-inside: avoid; }
    .photo-item:nth-child(3n) { margin-right: 0; }
    .photo-item img { display: block; width: 100%; height: 124px; object-fit: cover; border-radius: 6px; background: #f1f5f9; }
    .photo-caption { font-size: 11px; color: #64748b; margin-top: 4px; text-align: center; }

    .file-row { font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; break-inside: avoid; page-break-inside: avoid; }
    .file-row span { color: #64748b; }

    /* break-before: avoid é o que impede a página com uma assinatura e mais
       nada. Medido: sem ele, a visita com doze fotos produzia uma terceira
       folha com só o fio e o nome. */
    .sign { margin-top: 20px; padding-bottom: 8px; break-inside: avoid; page-break-inside: avoid; break-before: avoid; page-break-before: avoid; }
    .sign-line { width: 260px; height: 1px; background: #94a3b8; margin: 0 auto 8px; }
    .sign-name { font-size: 14px; font-weight: 600; color: #0f172a; text-align: center; }
    .sign-role { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; text-align: center; margin-top: 3px; }

    .footer { text-align: center; font-size: 11px; color: #94a3b8; padding: 12px; border-top: 1px solid #f1f5f9; }
    @media print {
      .footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
      /* 48px = os 39,4px medidos do rodapé fixo mais folga. É a reserva que
         impede a última linha de passar por baixo dele. */
      .page { padding-bottom: 48px; }
    }
  `

/* ── Mapas de crachá ───────────────────────────────────────────────────── */

/* A situação da visita, nos mesmos quatro pares de cor de REPORT_CSS e na mesma
   ordem de gravidade que VISIT_STATUS_STYLE usa na tela. */
const VISIT_BADGE_CLASS: Record<SiteVisitRow['status'], string> = {
  no_issues: 'badge-visita-sem-pendencias',
  with_issues: 'badge-visita-com-pendencias',
  awaiting_execution: 'badge-visita-aguardando',
  resolved: 'badge-visita-resolvido',
}

/* Classe por classe como em ./report, para pendência ter a mesma cor nos dois
   documentos. */
const ISSUE_BADGE_CLASS: Record<ProjectIssueRow['status'], string> = {
  open: 'badge-aberta',
  in_progress: 'badge-andamento',
  resolved: 'badge-resolvida',
  cancelled: 'badge-cancelada',
}

/* ── O que o documento recebe ──────────────────────────────────────────── */

/*
  UMA FOTO PRONTA PARA O PAPEL: o endereço já é `data:`, reduzido por
  ./photo-embed. O tipo não aceita caminho de Storage de propósito — se aceitasse,
  alguém montaria o documento com URL assinada e o PDF salvo voltaria a vencer
  em cinco minutos.
*/
export type VisitReportPhoto = {
  file: DiaryFile
  dataUrl: string
}

/* A hora como a tela mostra. A coluna é `time` e o Postgres devolve "09:30:00". */
const clock = (value: string | null) => (value ? value.slice(0, 5) : '')

/* Célula de identificação vazia não fica em branco: diz que não há dado. Mesma
   decisão do `fmt` de ./report, que usa o travessão em dado ausente. */
const ou = (value: string | null | undefined, vazio = '—') => (value && value.trim()) || vazio

export function buildVisitReportHTML({
  visit,
  project,
  issues,
  photos,
  attachments,
  officeName,
  authorName,
  now = new Date(),
}: {
  visit: SiteVisitRow
  project: DiaryProject
  /* Só as pendências DESTA visita. O recorte por `visit_id` é de quem chama,
     porque a aba Obra já o faz para desenhar o cartão. */
  issues: ProjectIssueRow[]
  photos: VisitReportPhoto[]
  attachments: DiaryFile[]
  /*
    O NOME DO ESCRITÓRIO VEM DE FORA, e não escrito aqui. Mesmo motivo que
    ./report registra: com o nome fixo no código, um escritório manda ao cliente
    um documento com o nome de outra empresa no papel.
  */
  officeName: string
  authorName: string
  now?: Date
}): string {
  const parts: string[] = []

  const dataDaVisita = formatDateBR(visit.visit_date)
  const geradoEm = format(now, "dd/MM/yyyy 'às' HH:mm")

  parts.push(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">` +
      `<title>Relatório de Visita à Obra · ${h(project.name)}</title>` +
      `<style>${VISIT_REPORT_CSS}</style></head><body><div class="page">`,
  )

  /* ── Cabeçalho ───────────────────────────────────────────────────────── */

  parts.push(`
    <header>
      <div class="doc-office">${h(officeName)} • HausOne</div>
      <div class="doc-rule"></div>

      <div class="doc-title-row">
        <div>
          <div class="doc-title">Relatório de Visita à Obra</div>
          <p class="doc-subject">
            <strong>${h(project.name)}</strong>${
              project.client?.name ? ` · ${h(project.client.name)}` : ''
            }
          </p>
        </div>
        <span class="badge ${VISIT_BADGE_CLASS[visit.status]}">${h(
          SITE_VISIT_STATUS[visit.status],
        )}</span>
      </div>

      <div class="ident">
        <div class="ident-cell">
          <div class="ident-label">Data da visita</div>
          <div class="ident-value">${h(ou(dataDaVisita))}</div>
        </div>
        <div class="ident-cell">
          <div class="ident-label">Hora</div>
          <div class="ident-value">${h(ou(clock(visit.visit_time)))}</div>
        </div>
        <div class="ident-cell">
          <div class="ident-label">Tipo</div>
          <div class="ident-value">${h(SITE_VISIT_TYPE[visit.visit_type])}</div>
        </div>
        <div class="ident-cell">
          <div class="ident-label">Responsável</div>
          <div class="ident-value">${h(ou(visit.responsible?.name))}</div>
        </div>
      </div>
    </header>
  `)

  /*
    AS SEÇÕES SÃO NUMERADAS NA ORDEM EM QUE SAEM, e não com número fixo. A seção
    de observações só existe quando há observação, e com número fixo o documento
    pularia de "1." para "3." na frente do cliente.
  */
  let numero = 0
  const secao = (titulo: string) => `<h2>${++numero}. ${h(titulo)}</h2>`

  /* ── Resumo ──────────────────────────────────────────────────────────── */

  parts.push(secao('Resumo da visita'))
  parts.push(`
    <div class="entry entry-visit">
      <div class="entry-lead">${h(visit.summary)}</div>
    </div>
  `)

  /* ── Observações ─────────────────────────────────────────────────────── */

  if (visit.notes && visit.notes.trim()) {
    parts.push(secao('Observações'))
    parts.push(`<p class="notes">${h(visit.notes)}</p>`)
  }

  /* ── Pendências ──────────────────────────────────────────────────────── */

  parts.push(secao('Pendências identificadas nesta visita'))

  if (issues.length === 0) {
    /*
      O VAZIO É AFIRMADO, e não é a seção sumindo. Relatório que cala sobre
      pendências deixa o cliente sem saber se não houve nenhuma ou se ninguém
      olhou. A moldura de `.issue` fica, com o texto no lugar onde a pendência
      estaria.
    */
    parts.push(`
      <div class="issue no-data">
        <strong>Nenhuma pendência foi identificada nesta visita.</strong>
      </div>
    `)
  } else {
    parts.push(
      `<p class="section-note">${h(issues.length)} ${
        issues.length === 1 ? 'pendência vinculada' : 'pendências vinculadas'
      } a esta visita.</p>`,
    )

    for (const issue of issues) {
      /*
        A linha de dados da pendência é montada por pedaços e junta só os que
        existem: responsável e prazo são anuláveis, e "Responsável: " seguido de
        nada é pior do que a ausência da informação.
      */
      const meta: string[] = [
        h(PROJECT_ISSUE_CATEGORY[issue.category]),
        `Identificada em ${h(formatDateBR(issue.identified_date))}`,
      ]
      if (issue.responsible?.name) meta.push(`Responsável: ${h(issue.responsible.name)}`)
      if (issue.status === 'resolved' && issue.resolved_at) {
        meta.push(`Resolvida em ${h(formatDateBR(issue.resolved_at))}`)
      } else if (issue.due_date) {
        meta.push(`Prazo: ${h(formatDateBR(issue.due_date))}`)
      }

      parts.push(`
        <div class="issue">
          <div class="issue-header">
            <span class="issue-num">#${h(issue.issue_number)}</span>
            <span class="badge ${ISSUE_BADGE_CLASS[issue.status]}">${h(
              PROJECT_ISSUE_STATUS[issue.status],
            )}</span>
          </div>
          <div class="issue-desc">${h(issue.description)}</div>
          <div class="issue-meta">${meta.join(' • ')}</div>
        </div>
      `)
    }
  }

  /* ── Registro fotográfico ────────────────────────────────────────────── */

  if (photos.length > 0) {
    parts.push(secao('Registro fotográfico'))
    parts.push(
      `<p class="section-note">${h(photos.length)} ${
        photos.length === 1 ? 'foto registrada' : 'fotos registradas'
      } na visita de ${h(dataDaVisita)}.</p>`,
    )

    parts.push('<div class="photo-grid">')
    photos.forEach((photo, posicao) => {
      /*
        A LEGENDA É O NÚMERO DA FOTO, e não a origem. No relatório do projeto a
        legenda diz de onde a foto veio, porque lá ela pode ser de visita ou de
        pendência; aqui todas são da mesma visita, e repetir o resumo doze vezes
        é ruído na folha.
      */
      const legenda = `Foto ${posicao + 1}`
      parts.push(`
        <div class="photo-item">
          <img src="${h(photo.dataUrl)}" alt="${h(legenda)} da visita" />
          <div class="photo-caption">${h(legenda)}</div>
        </div>
      `)
    })
    parts.push('</div>')
  }

  /* ── Arquivos ────────────────────────────────────────────────────────── */

  if (attachments.length > 0) {
    /*
      O ARQUIVO É CITADO PELO NOME, SEM LINK, e isso é decisão e não limitação. O
      endereço do bucket é privado e assinado por minutos: um link no PDF
      enviado ao cliente estaria morto antes de ele clicar, e um link morto num
      documento formal é pior do que a menção simples. "Arquivos" é a mesma
      palavra que ./report usa.
    */
    parts.push('<h3>Arquivos</h3>')
    for (const file of attachments) {
      parts.push(`
        <div class="file-row">
          📎 ${h(file.file_name)} <span>• anexado à visita de ${h(dataDaVisita)}</span>
        </div>
      `)
    }
  }

  /* ── Assinatura e rodapé ─────────────────────────────────────────────── */

  parts.push(`
    <div class="sign">
      <div class="sign-line"></div>
      <div class="sign-name">${h(ou(visit.responsible?.name, authorName))}</div>
      <div class="sign-role">Responsável técnico pela visita</div>
    </div>
  `)

  parts.push(
    `</div><div class="footer">${h(officeName)} • HausOne • Documento gerado em ${h(
      geradoEm,
    )}</div></body></html>`,
  )

  return parts.join('')
}
