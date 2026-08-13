import { format } from 'date-fns'
import { formatDateBR } from '@/lib/format'
import {
  DIARY_ENTRY_TYPE,
  PROJECT_ISSUE_CATEGORY,
  PROJECT_ISSUE_STATUS,
  PROJECT_PHASE,
  SITE_VISIT_STATUS,
  SITE_VISIT_TYPE,
  labelOf,
} from '@/lib/enums'
import { isRevisionEntry } from './resumo'
import type {
  DiaryEntryRow,
  DiaryProject,
  ProjectIssueRow,
  ReportAudience,
  ReportFormat,
  ReportOptions,
  ReportPhoto,
  ReportPhotoWithUrl,
  ReportSections,
  SiteVisitRow,
} from './types'

/*
  ═══════════════════════════════════════════════════════════════════════════
  O RELATÓRIO DO DIÁRIO — E O ACHADO ALTO QUE ESTE ARQUIVO EXISTE PARA FECHAR
  ═══════════════════════════════════════════════════════════════════════════

  DEFEITO 9 DO PLANO, classificado como ALTO e listado como não cortável.

  Na versão nova (RelatorioPDFModal.jsx:39-249) o documento é montado por
  concatenação de string, SEM ESCAPAR NADA, e entregue assim:

      const win = window.open('', '_blank');
      win.document.write(html);

  `window.open('')` devolve uma janela `about:blank` que HERDA A ORIGEM da
  aplicação. O que entra ali por `document.write` é documento da mesma origem: um
  `<script>` escrito dentro do nome de um projeto, do título de um registro ou da
  descrição de uma pendência roda com a SESSÃO DO SUPABASE de quem clicou em
  "Gerar Relatório" — `localStorage` com o token, e todo o alcance que aquele
  token tem. O texto vem de qualquer colaborador que escreva no diário: é XSS
  ARMAZENADO dentro do escritório, disparado por quem gera o relatório.

  As duas metades da correção, e nenhuma delas substitui a outra:

  1. ESCAPE EM TODA INTERPOLAÇÃO. Sem exceção, inclusive nos textos que hoje
     saem de enum ou de número — a regra "escapa tudo" é auditável de relance, e
     "escapa o que vem do usuário" depende de alguém acertar, a cada linha nova,
     de onde o valor veio. Ver `h()`.

  2. O DOCUMENTO NÃO É ENTREGUE POR `document.write` (ver `printReport`): ele vai
     para um `<iframe srcdoc>` com `sandbox` SEM `allow-scripts`. Script nenhum
     roda ali, tenha ou não passado pelo escape — é a rede embaixo da primeira
     metade, para o dia em que alguém acrescentar uma seção nova e esquecer o
     `h()`.

  O CSS FICA EM HEX, e isso não contradiz o CLAUDE.md: este documento é impresso
  em papel e não tem acesso a nenhuma folha de estilo da aplicação — ele precisa
  carregar as próprias cores. São as mesmas da versão nova, declaração por
  declaração, e nenhuma delas vem de dado.
*/

/* ── O escape ──────────────────────────────────────────────────────────── */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/*
  TODO valor interpolado passa por aqui. O nome é curto porque ele aparece em
  cada `${}` do documento, e uma chamada que se lê de relance é uma chamada cuja
  ausência também se lê de relance.

  Os cinco caracteres cobrem os dois contextos em que este arquivo interpola:
  texto de elemento (`<` e `&`) e valor de atributo entre aspas (`"`, `'` e
  `&`). `>` entra por hábito defensivo — ele não é obrigatório em nenhum dos
  dois, e escapá-lo custa nada.

  NÃO HÁ CONTEXTO DE SCRIPT NEM DE URL JAVASCRIPT neste documento: não existe
  `<script>` no template, e o único atributo que recebe endereço é o `src` da
  foto, cuja origem é uma URL assinada gerada pelo próprio Storage.
*/
function h(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

/* O `fmt` do original: data em dd/MM/yyyy, travessão quando não há data. */
const fmt = (value: string | null | undefined) => formatDateBR(value) || '—'

/* ── O que entra no relatório ──────────────────────────────────────────── */

/*
  DEFEITO 6 DO PLANO, e ele só pôde ser fechado aqui porque a coluna existe.

  Na versão nova a linha é

      isInternal ? entries : entries.filter(e => e.visibilidade !== 'Interno' || e.is_automatico)

  e `visibilidade` NÃO EXISTE em `ProjectTimelineEntry`: o formulário coleta o
  campo (DiaryEntryForm.jsx:219-227) e a entidade não o declara, então a
  propriedade chega `undefined` em toda linha, `undefined !== 'Interno'` é
  sempre verdadeiro e o relatório "para o cliente" não esconde nada. Toda
  anotação interna do escritório vai para o cliente.

  Aqui `visibility` é coluna (migration 0068) e o filtro passa a filtrar.

  ⚠ A REGRA É `client OR is_automatic`, E NÃO `client`. O original mantém TODO
  registro automático no relatório externo, independentemente da visibilidade —
  e o evento automático nasce sempre `internal` (`record_project_diary_event`,
  migration 0070). Filtrar só por `visibility = 'client'` deixaria o relatório do
  cliente sem nenhuma mudança de etapa, sem nenhuma visita e sem nenhuma
  pendência resolvida, que é a espinha do documento. Está escrito no COMMENT do
  enum `diary_visibility` na 0068, para quem chegar aqui pelo banco.
*/
export function entriesForAudience(
  entries: DiaryEntryRow[],
  audience: ReportAudience,
): DiaryEntryRow[] {
  if (audience === 'internal') return entries
  return entries.filter((entry) => entry.visibility === 'client' || entry.is_automatic)
}

/*
  AS FOTOS CANDIDATAS (RelatorioPDFModal.jsx:23-36): as das visitas e as das
  pendências, na ordem em que a versão nova as junta, todas marcadas.

  A entrada de diário não entra, como lá: no base44 ela tem `anexos` e não tem
  `fotos`, e a seção 6 do documento é a galeria da obra.
*/
export function collectReportPhotos(
  visits: SiteVisitRow[],
  issues: ProjectIssueRow[],
): ReportPhoto[] {
  const fromVisits = visits.flatMap((visit) =>
    visit.files
      .filter((file) => file.file_kind === 'photo')
      .map((file) => ({
        file,
        sourceLabel: visit.summary ?? SITE_VISIT_TYPE[visit.visit_type],
        sourceDate: visit.visit_date,
        selected: true,
      })),
  )

  const fromIssues = issues.flatMap((issue) =>
    issue.files
      .filter((file) => file.file_kind === 'photo')
      .map((file) => ({
        file,
        sourceLabel: `Pendência #${issue.issue_number} — ${PROJECT_ISSUE_CATEGORY[issue.category]}`,
        sourceDate: issue.identified_date,
        selected: true,
      })),
  )

  return [...fromVisits, ...fromIssues]
}

/*
  O TEXTO DO REGISTRO QUE FICA NO DIÁRIO a cada geração
  (RelatorioPDFModal.jsx:305-306), com as mesmas palavras.

  As chaves das seções aparecem cruas na descrição ("resumo, timeline,
  revisoes…") — é por isso que elas são as do original e estão em português (ver
  `ReportSectionKey`).
*/
const AUDIENCE_LOG_LABEL: Record<ReportAudience, string> = {
  internal: 'Interno',
  client: 'Para Cliente',
}

const FORMAT_LOG_LABEL: Record<ReportFormat, string> = {
  summary: 'resumido',
  complete: 'completo',
}

export function reportLogText(
  options: ReportOptions,
  photoCount: number,
): { title: string; description: string } {
  const sections = (Object.keys(options.sections) as (keyof ReportSections)[]).filter(
    (key) => options.sections[key],
  )

  return {
    title: `📄 Relatório gerado — ${AUDIENCE_LOG_LABEL[options.audience]} (${
      FORMAT_LOG_LABEL[options.format]
    })`,
    description: `Seções: ${sections.join(', ')}. Fotos: ${photoCount}.`,
  }
}

/* ── O documento ───────────────────────────────────────────────────────── */

/* O CSS da versão nova, sem uma declaração a mais nem a menos. */
const REPORT_CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 11px; line-height: 1.6; }
    .cover { page-break-after: always; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; text-align:center; padding: 60px; }
    .cover-logo { font-size:10px; letter-spacing:4px; color:#94a3b8; text-transform:uppercase; margin-bottom:60px; }
    .cover-title { font-size:28px; font-weight:700; color:#0f172a; margin-bottom:12px; line-height:1.2; }
    .cover-client { font-size:16px; color:#475569; margin-bottom:8px; }
    .cover-badge { display:inline-block; margin:8px 4px 0; padding:4px 14px; border-radius:20px; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; }
    .badge-interno { background:#dbeafe; color:#1d4ed8; }
    .badge-cliente { background:#d1fae5; color:#065f46; }
    .cover-meta { margin-top:60px; font-size:10px; color:#94a3b8; }
    .page { padding: 48px 56px; }
    .page-break { page-break-before: always; }
    h1 { font-size:16px; color:#0f172a; font-weight:700; letter-spacing:0.5px; }
    h2 { font-size:13px; font-weight:700; color:#0f172a; margin:28px 0 12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0; }
    h3 { font-size:11px; font-weight:700; color:#334155; margin:16px 0 8px; }
    .info-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9; }
    .info-label { color:#64748b; font-size:10px; }
    .info-value { font-weight:600; color:#0f172a; font-size:10px; text-align:right; }
    .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0; }
    .stat-card { border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; }
    .stat-num { font-size:22px; font-weight:700; color:#0f172a; line-height:1; }
    .stat-label { font-size:9px; color:#64748b; margin-top:4px; text-transform:uppercase; letter-spacing:0.5px; }
    .entry { margin:10px 0; padding:12px 16px; background:#f8fafc; border-left:3px solid #cbd5e1; border-radius:0 8px 8px 0; }
    .entry-type { font-size:9px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:4px; }
    .entry-title { font-size:11px; font-weight:600; color:#0f172a; margin-bottom:4px; }
    .entry-desc { font-size:10px; color:#475569; line-height:1.5; }
    .entry-meta { font-size:9px; color:#94a3b8; margin-top:6px; }
    .issue { margin:10px 0; padding:12px 16px; border:1px solid #e2e8f0; border-radius:8px; }
    .issue-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .issue-num { font-size:10px; font-weight:700; color:#94a3b8; font-family:monospace; }
    .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:9px; font-weight:600; }
    .badge-aberta { background:#ffe4e6; color:#be123c; }
    .badge-resolvida { background:#d1fae5; color:#065f46; }
    .badge-andamento { background:#fef3c7; color:#92400e; }
    .badge-cancelada { background:#f1f5f9; color:#64748b; }
    .photo-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0; }
    .photo-item { break-inside:avoid; }
    .photo-item img { width:100%; height:140px; object-fit:cover; border-radius:6px; }
    .photo-caption { font-size:9px; color:#64748b; margin-top:4px; text-align:center; }
    .footer { position:fixed; bottom:0; left:0; right:0; text-align:center; font-size:9px; color:#94a3b8; padding:12px; border-top:1px solid #f1f5f9; }
    @media print { .footer { position:fixed; } }
    .separator { height:1px; background:#f1f5f9; margin:20px 0; }
    .no-data { text-align:center; color:#94a3b8; font-size:10px; padding:20px; }
  `

/* O crachá de situação da pendência, classe por classe como no original
   (RelatorioPDFModal.jsx:192). */
const ISSUE_BADGE_CLASS: Record<ProjectIssueRow['status'], string> = {
  open: 'badge-aberta',
  in_progress: 'badge-andamento',
  resolved: 'badge-resolvida',
  cancelled: 'badge-cancelada',
}

/*
  A hora como a tela a mostra: `HH:mm`. A coluna é `time` e chega "14:30:00" do
  Postgres; no base44 o campo já é o texto de cinco caracteres. Mesmo corte que a
  linha do tempo faz no cartão.
*/
const clock = (value: string | null) => (value ? value.slice(0, 5) : '')

export function buildReportHTML({
  project,
  entries,
  visits,
  issues,
  authorName,
  options,
  photos,
  now = new Date(),
}: {
  project: DiaryProject
  entries: DiaryEntryRow[]
  visits: SiteVisitRow[]
  issues: ProjectIssueRow[]
  authorName: string
  options: ReportOptions
  photos: ReportPhotoWithUrl[]
  now?: Date
}): string {
  const isInternal = options.audience === 'internal'
  const isComplete = options.format === 'complete'
  const today = format(now, "dd/MM/yyyy 'às' HH:mm")

  const visible = entriesForAudience(entries, options.audience)

  const requests = visible.filter((entry) => entry.entry_type === 'client_request')
  const changes = visible.filter((entry) => entry.entry_type === 'project_change')
  const approvals = visible.filter((entry) => entry.entry_type === 'approval')
  /*
    MESMA REGRA DA ABA, que é o defeito 10 fechado: revisão é o que o banco diz
    em coluna, e não o que o título parece dizer (ver `isRevisionEntry`). A ORDEM
    é a que chegou — da mais recente para a mais antiga —, como no original, e é
    ela que numera "Revisão #1" na seção 3.
  */
  const revisions = visible.filter(isRevisionEntry)

  const openIssues = issues.filter((issue) => issue.status === 'open').length
  const resolvedIssues = issues.filter((issue) => issue.status === 'resolved').length

  const chosen = photos.filter((photo) => photo.selected)

  const parts: string[] = []

  parts.push(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório — ${h(
      project.name,
    )}</title><style>${REPORT_CSS}</style></head><body>`,
  )

  /* Capa */
  parts.push(`
    <div class="cover">
      <div class="cover-logo">Fernando Costa • Backoffice</div>
      <div class="cover-title">${h(project.name)}</div>
      <div class="cover-client">${h(project.client?.name) || '—'}</div>
      <div>
        <span class="cover-badge ${isInternal ? 'badge-interno' : 'badge-cliente'}">${
          isInternal ? 'Relatório Interno' : 'Relatório para Cliente'
        }</span>
        <span class="cover-badge" style="background:#f1f5f9;color:#475569;">${
          isComplete ? 'Completo' : 'Resumido'
        }</span>
      </div>
      <div class="cover-meta">
        Gerado em ${h(today)}<br>por ${h(authorName)}
      </div>
    </div>
  `)

  /* Seção 1 — Resumo */
  if (options.sections.resumo) {
    parts.push(`<div class="page">`)
    parts.push(`<h2>1. Resumo do Projeto</h2>`)
    parts.push(
      `<div class="info-row"><span class="info-label">Projeto</span><span class="info-value">${h(
        project.name,
      )}</span></div>`,
    )
    parts.push(
      `<div class="info-row"><span class="info-label">Cliente</span><span class="info-value">${
        h(project.client?.name) || '—'
      }</span></div>`,
    )
    if (isInternal) {
      parts.push(
        `<div class="info-row"><span class="info-label">Responsável</span><span class="info-value">${
          h(project.responsible?.name) || '—'
        }</span></div>`,
      )
    }
    parts.push(
      `<div class="info-row"><span class="info-label">Etapa atual</span><span class="info-value">${h(
        labelOf(PROJECT_PHASE, project.current_phase),
      )}</span></div>`,
    )
    parts.push(
      `<div class="info-row"><span class="info-label">Data de início</span><span class="info-value">${h(
        fmt(project.start_date),
      )}</span></div>`,
    )
    parts.push(`<h3>Indicadores</h3>`)
    parts.push(`<div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${h(visible.length)}</div><div class="stat-label">Total de registros</div></div>
      <div class="stat-card"><div class="stat-num">${h(requests.length)}</div><div class="stat-label">Solicitações</div></div>
      <div class="stat-card"><div class="stat-num">${h(changes.length)}</div><div class="stat-label">Alterações</div></div>
      <div class="stat-card"><div class="stat-num">${h(approvals.length)}</div><div class="stat-label">Aprovações</div></div>
      <div class="stat-card"><div class="stat-num">${h(visits.length)}</div><div class="stat-label">Visitas à obra</div></div>
      <div class="stat-card"><div class="stat-num">${h(issues.length)}</div><div class="stat-label">Pendências</div></div>
    </div>`)
    parts.push(`</div>`)
  }

  /* Seção 2 — Histórico cronológico (só no formato completo) */
  if (options.sections.timeline && isComplete) {
    parts.push(`<div class="page page-break">`)
    parts.push(`<h2>2. Histórico Cronológico</h2>`)

    const chronological = [...visible].sort((a, b) =>
      a.occurrence_date.localeCompare(b.occurrence_date),
    )

    if (chronological.length === 0) {
      parts.push(`<p class="no-data">Nenhum registro encontrado.</p>`)
    } else {
      for (const entry of chronological) {
        /*
          O CORTE VEM ANTES DO ESCAPE, e a ordem importa: cortar depois partiria
          uma entidade HTML no meio ("&amp;" virando "&am"), o que é justamente
          o tipo de emenda que reabre a porta que este arquivo fecha.
        */
        const description = entry.description ? entry.description.slice(0, 300) : ''
        const meta = [
          fmt(entry.occurrence_date),
          entry.occurrence_time ? ` às ${clock(entry.occurrence_time)}` : '',
          entry.responsible?.name && isInternal ? ` — ${entry.responsible.name}` : '',
        ].join('')

        parts.push(`<div class="entry">
          <div class="entry-type">${
            entry.is_automatic ? '⚙ Sistema' : h(DIARY_ENTRY_TYPE[entry.entry_type])
          }</div>
          <div class="entry-title">${h(entry.title)}</div>
          ${description ? `<div class="entry-desc">${h(description)}</div>` : ''}
          <div class="entry-meta">${h(meta)}</div>
        </div>`)
      }
    }
    parts.push(`</div>`)
  }

  /* Seção 3 — Revisões */
  if (options.sections.revisoes) {
    parts.push(`<div class="page page-break">`)
    parts.push(`<h2>3. Revisões</h2>`)

    if (revisions.length === 0) {
      parts.push(`<p class="no-data">Nenhuma revisão registrada.</p>`)
    } else {
      revisions.forEach((entry, index) => {
        parts.push(`<div class="entry" style="border-left-color:#38bdf8">
          <div class="entry-type">Revisão #${h(index + 1)}</div>
          <div class="entry-title">${h(entry.title)}</div>
          <div class="entry-meta">${h(fmt(entry.occurrence_date))}</div>
        </div>`)
      })
    }
    parts.push(`</div>`)
  }

  /* Seção 4 — Pendências */
  if (options.sections.pendencias && issues.length > 0) {
    parts.push(`<div class="page page-break">`)
    parts.push(`<h2>4. Pendências</h2>`)
    parts.push(`<div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${h(openIssues)}</div><div class="stat-label">Abertas</div></div>
      <div class="stat-card"><div class="stat-num">${h(resolvedIssues)}</div><div class="stat-label">Resolvidas</div></div>
      <div class="stat-card"><div class="stat-num">${h(
        Math.round((resolvedIssues / issues.length) * 100),
      )}%</div><div class="stat-label">Taxa de resolução</div></div>
    </div>`)

    for (const issue of issues) {
      const resolvedBy =
        issue.status === 'resolved' && issue.resolved_by?.name
          ? ` • Resolvida por ${issue.resolved_by.name}`
          : ''

      parts.push(`<div class="issue">
        <div class="issue-header">
          <span class="issue-num">#${h(issue.issue_number)}</span>
          <span class="badge ${ISSUE_BADGE_CLASS[issue.status]}">${h(
            PROJECT_ISSUE_STATUS[issue.status],
          )}</span>
        </div>
        <div style="font-size:11px;font-weight:600;margin-bottom:4px">${h(issue.description)}</div>
        <div style="font-size:9px;color:#64748b">${h(
          PROJECT_ISSUE_CATEGORY[issue.category],
        )} • Identificada em ${h(fmt(issue.identified_date))}${h(resolvedBy)}</div>
      </div>`)
    }
    parts.push(`</div>`)
  }

  /* Seção 5 — Visitas à obra */
  if (options.sections.visitas && visits.length > 0) {
    parts.push(`<div class="page page-break">`)
    parts.push(`<h2>5. Visitas à Obra</h2>`)

    for (const visit of visits) {
      const notes = visit.notes ? visit.notes.slice(0, 200) : ''
      const meta = [
        fmt(visit.visit_date),
        visit.visit_time ? ` às ${clock(visit.visit_time)}` : '',
        visit.responsible?.name && isInternal ? ` — ${visit.responsible.name}` : '',
      ].join('')

      parts.push(`<div class="entry" style="border-left-color:#f97316">
        <div class="entry-type">🏗️ ${h(SITE_VISIT_TYPE[visit.visit_type])} — ${h(
          SITE_VISIT_STATUS[visit.status],
        )}</div>
        <div class="entry-title">${h(visit.summary) || '—'}</div>
        ${notes ? `<div class="entry-desc">${h(notes)}</div>` : ''}
        <div class="entry-meta">${h(meta)}</div>
      </div>`)
    }
    parts.push(`</div>`)
  }

  /* Seção 6 — Fotos e documentos */
  if (options.sections.fotos && chosen.length > 0) {
    parts.push(`<div class="page page-break">`)
    parts.push(`<h2>6. Fotos e Documentos</h2>`)
    parts.push(`<div class="photo-grid">`)

    for (const photo of chosen) {
      if (!isImagePhoto(photo)) continue
      parts.push(`<div class="photo-item">
        <img src="${h(photo.url)}" alt="${h(photo.file.file_name)}" />
        <div class="photo-caption">${h(photo.sourceLabel)}<br>${h(fmt(photo.sourceDate))}</div>
      </div>`)
    }
    parts.push(`</div>`)

    const documents = chosen.filter((photo) => !isImagePhoto(photo))
    if (documents.length > 0) {
      parts.push(`<h3>Arquivos</h3>`)
      for (const document_ of documents) {
        parts.push(
          `<div style="font-size:10px;padding:6px 0;border-bottom:1px solid #f1f5f9">📎 ${h(
            document_.file.file_name,
          )} — ${h(document_.sourceLabel)}</div>`,
        )
      }
    }
    parts.push(`</div>`)
  }

  parts.push(
    `<div class="footer">Fernando Costa Arquitetura • Backoffice — Documento gerado em ${h(
      today,
    )}</div>`,
  )
  parts.push(`</body></html>`)

  return parts.join('')
}

/*
  Imagem ou documento (RelatorioPDFModal.jsx:226 e :236). `mime_type` é anulável
  na tabela (migration 0069), e "sem tipo declarado" cai como imagem — é o que o
  original faz (`!p.tipo || p.tipo.startsWith('image/')`), e a lista só contém
  arquivo com `file_kind = 'photo'`.
*/
export function isImagePhoto(photo: { file: { mime_type: string | null } }): boolean {
  return !photo.file.mime_type || photo.file.mime_type.startsWith('image/')
}

/* ── A entrega do documento ────────────────────────────────────────────── */

/*
  A SEGUNDA METADE DA CORREÇÃO DO DEFEITO 9 — ver o cabeçalho deste arquivo.

  O original faz `window.open('', '_blank')` + `document.write`, o que cria um
  documento NA MESMA ORIGEM da aplicação. Aqui o documento vai para um iframe com
  `sandbox` e SEM `allow-scripts`: nenhum script daquele documento executa, nem
  `<script>`, nem `onerror` de imagem, nem `javascript:` em link. Se um dia
  faltar um `h()` numa seção nova, o pior resultado é marcação estranha no papel
  — não uma sessão do Supabase entregue a quem escreveu o texto.

  AS DUAS PERMISSÕES QUE O SANDBOX MANTÉM, e por que cada uma:

  - `allow-same-origin`, para que a aplicação consiga chamar `print()` no
    documento. Sozinha ela não devolve nada de perigoso: sem `allow-scripts` não
    há código do documento para se aproveitar da origem.
  - `allow-modals`, porque a janela de impressão É um modal e o sandbox a
    bloqueia por padrão — sem ela, `print()` é ignorado em silêncio e o botão
    não faz nada.

  O QUE MUDA PARA QUEM USA: o original abre uma ABA com o relatório e manda
  imprimir depois de 600ms; aqui a janela de impressão abre direto, sem a aba
  intermediária, e o mesmo "Salvar como PDF" está lá. O documento é o mesmo,
  pixel por pixel. Registrado no relatório da fatia.

  O iframe é removido quando a impressão termina. O prazo é a rede para o
  navegador que não dispara `afterprint` — sem ele, cada relatório gerado
  deixaria um documento pendurado na página até a próxima navegação.
*/
const PRINT_FRAME_CLEANUP_MS = 60_000

export function printReport(html: string): void {
  const frame = document.createElement('iframe')

  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Relatório do projeto')

  /*
    Tamanho zero no canto da página, e NÃO `display:none` nem
    `visibility:hidden`: o documento precisa continuar sendo renderizado para
    poder ser impresso — quadro escondido dessas duas formas imprime em branco em
    parte dos navegadores. O que a pessoa vê é a janela de impressão, não o
    quadro.
  */
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'

  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    frame.remove()
  }

  frame.addEventListener('load', () => {
    const view = frame.contentWindow
    if (!view) {
      remove()
      return
    }

    view.addEventListener('afterprint', remove)
    view.print()
    window.setTimeout(remove, PRINT_FRAME_CLEANUP_MS)
  })

  frame.srcdoc = html
  document.body.appendChild(frame)
}

/*
  O NOME DE QUEM ASSINA O DOCUMENTO (RelatorioPDFModal.jsx:40).

  Lá são duas fontes com um nome fixo no fim: `currentUser.full_name`, o
  colaborador, e "Fernando Costa" quando nenhum dos dois responde. Aqui quem
  responde por trabalho é sempre o colaborador — o mesmo `created_by_id` do resto
  do módulo —, e o nome fixo continua como último recurso, palavra por palavra,
  para a sessão sem colaborador. Ela não chega a esta tela: quem gera relatório é
  Diretor ou Coordenador, e os dois são colaboradores.
*/
export const REPORT_FALLBACK_AUTHOR = 'Fernando Costa'
