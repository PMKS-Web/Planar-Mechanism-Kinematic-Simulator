import { escapeXml } from './xml';

export interface ReportPlot {
  title: string;
  unit: string;
  /** The chart itself, without a title of its own — the page supplies one. */
  svg: string;
  legend: { name: string; color: string }[];
}

/** One mechanism's worth of report: its drawing, its graphs and its table. */
export interface ReportSection {
  title: string;
  subtitle: string;
  /** The drawing, as it stands at the start of the cycle. */
  drawing: string;
  facts: { label: string; value: string }[];
  shareUrl: string;
  plots: ReportPlot[];
  heads: string[];
  rows: string[][];
  /** `Four-bar test · M1` — what every page of this section is footed with. */
  footer: string;
  /** What the data pages are headed with: `Data — M1`. */
  dataTitle: string;
  /** What the graph pages after the first are headed with. */
  graphsTitle: string;
}

export interface ReportContext {
  logoUrl: string;
  sections: ReportSection[];
}

/** How much one printed page holds, at the size these are set in. */
const ROWS_PER_PAGE = 40;
const COLUMNS_PER_PAGE = 7;
const GRAPHS_ON_FIRST_PAGE = 4;
const GRAPHS_PER_PAGE = 6;

/**
 * The Report format: the mechanism, what it was solved under, its graphs, and
 * every row the CSV would have held.
 *
 * Written as a printable HTML document rather than assembled with a PDF
 * library. The browser already has a typesetter and a PDF writer in it, the
 * pages are laid out here rather than left to reflow, and a reader who wanted
 * paper instead of a file gets that from the same command.
 */
export function reportHtml(context: ReportContext): string {
  const bodies: { body: string; footer: string }[] = [];
  context.sections.forEach((section) => {
    const graphs = chunkGraphs(section.plots);
    bodies.push({
      body: firstPageBody(context, section, graphs[0] ?? []),
      footer: section.footer,
    });
    graphs.slice(1).forEach((page) => {
      bodies.push({
        body: `${sectionHead(context, section.graphsTitle, section.subtitle)}
          <div class="graphs">${page.map(graphBlock).join('')}</div>`,
        footer: section.footer,
      });
    });
    tablePages(section).forEach((page) => {
      bodies.push({ body: dataPageBody(context, section, page), footer: section.footer });
    });
  });

  const pages = bodies.map((entry, at) => page(entry.body, entry.footer, at + 1, bodies.length));
  const title = context.sections[0]?.title ?? 'PMKS+ report';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>${styles()}</style></head><body>${pages.join('')}</body></html>`;
}

/**
 * How long the report will be, before anyone waits for it to be built.
 *
 * The table is every row the CSV would hold, which is the point of the format
 * and also how a wide selection becomes two hundred pages. Counted here so the
 * drawer can say so while there is still time to choose fewer parts.
 */
export function reportPages(section: { plots: number; rows: number; columns: number }): number {
  const graphPages = Math.max(
    0,
    Math.ceil((section.plots - GRAPHS_ON_FIRST_PAGE) / GRAPHS_PER_PAGE)
  );
  const dataPages =
    Math.ceil(section.columns / COLUMNS_PER_PAGE) * Math.ceil(section.rows / ROWS_PER_PAGE);
  return 1 + graphPages + dataPages;
}

function chunkGraphs(plots: ReportPlot[]): ReportPlot[][] {
  if (plots.length === 0) return [[]];
  return [
    plots.slice(0, GRAPHS_ON_FIRST_PAGE),
    ...chunk(plots.slice(GRAPHS_ON_FIRST_PAGE), GRAPHS_PER_PAGE),
  ];
}

/** Which rows and which columns land on each data page, in reading order. */
function tablePages(section: ReportSection): { columns: number[]; rows: string[][] }[] {
  const rowPages = chunk(section.rows, ROWS_PER_PAGE);
  // Time rides every chunk: a column of numbers with nothing to line it up
  // against is not data anyone can use.
  const columnChunks = chunk(
    section.heads.slice(1).map((_, at) => at + 1),
    COLUMNS_PER_PAGE
  );
  return columnChunks.flatMap((columns) => rowPages.map((rows) => ({ columns, rows })));
}

function sectionHead(context: ReportContext, title: string, subtitle: string): string {
  return `<div class="head"><div><div class="title">${escapeHtml(
    title
  )}</div><div class="subtitle">${escapeHtml(
    subtitle
  )}</div></div><img class="logo" src="${escapeHtml(context.logoUrl)}" alt="PMKS+"></div>`;
}

function graphBlock(plot: ReportPlot): string {
  return `<div class="graph"><div class="graphTitle">${escapeHtml(
    plot.title
  )}</div><div class="graphLegend">${plot.legend
    .map(
      (entry) =>
        `<span><span class="swatch" style="background:${entry.color}"></span>${escapeHtml(
          entry.name
        )}</span>`
    )
    .join('')}<span class="spacer"></span><span class="graphUnit">${escapeHtml(
    plot.unit
  )}</span></div>${plot.svg}</div>`;
}

function firstPageBody(
  context: ReportContext,
  section: ReportSection,
  plots: ReportPlot[]
): string {
  const facts = section.facts
    .map(
      (fact) =>
        `<span class="factLabel">${escapeHtml(fact.label)}</span><span class="factValue">${escapeHtml(
          fact.value
        )}</span>`
    )
    .join('');
  return `${sectionHead(context, section.title, section.subtitle)}
    <div class="topRow"><div class="drawing">${section.drawing}</div>
    <div class="solvedUnder"><div class="panelTitle">Solved under</div><div class="factGrid">${facts}</div>
    <div class="shareNote">Every graph and every row below comes from this one solve. Reopen the mechanism at <span class="shareUrl">${escapeHtml(
      section.shareUrl
    )}</span></div></div></div>
    ${
      plots.length > 0
        ? `<div class="panelTitle graphsTitle">Graphs</div><div class="graphs">${plots
            .map(graphBlock)
            .join('')}</div>`
        : ''
    }`;
}

function dataPageBody(
  context: ReportContext,
  section: ReportSection,
  table: { columns: number[]; rows: string[][] }
): string {
  const heads = [0, ...table.columns]
    .map((at) => `<th>${escapeHtml(section.heads[at])}</th>`)
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${[0, ...table.columns].map((at) => `<td>${escapeHtml(row[at])}</td>`).join('')}</tr>`
    )
    .join('');
  const split = section.heads.length - 1 > COLUMNS_PER_PAGE;
  const note = split
    ? `<div class="tableNote">Columns ${table.columns[0]}–${
        table.columns[table.columns.length - 1]
      } of ${section.heads.length - 1}. The rest are on their own pages.</div>`
    : '';
  return `${sectionHead(
    context,
    section.dataTitle,
    `${section.heads.length - 1} columns, ${section.rows.length} rows, one row per solved position`
  )}
    <table class="dataTable"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table>${note}`;
}

function page(body: string, footer: string, number: number, total: number): string {
  return `<section class="page"><div class="pageBody">${body}</div><div class="pageFoot"><span>PMKS+ · app.pmksplus.com</span><span class="spacer"></span><span>${escapeHtml(
    footer
  )}</span><span class="pageNumber">Page ${number} of ${total}</span></div></section>`;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

function escapeHtml(text: string): string {
  return escapeXml(text ?? '');
}

function styles(): string {
  return `
@page { size: letter; margin: 0.5in; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2c2c2c; }
.page { width: 7.5in; height: 10in; display: flex; flex-direction: column; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.pageBody { flex: 1 1 auto; min-height: 0; }
.head { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid #eceef5; }
.title { font-size: 19px; font-weight: 500; }
.subtitle { font-size: 12px; color: rgba(0,0,0,0.55); }
.logo { margin-left: auto; height: 34px; }
.topRow { display: flex; gap: 18px; padding: 14px 0; }
.drawing { flex: 0 0 auto; }
.solvedUnder { flex: 1 1 auto; min-width: 0; }
.panelTitle { font-size: 12px; font-weight: 500; color: #5f6368; text-transform: uppercase; letter-spacing: 0.06em; }
.factGrid { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; padding-top: 6px; font-size: 12px; }
.factLabel { color: rgba(0,0,0,0.55); }
.factValue { color: #2c2c2c; }
.shareNote { padding-top: 10px; font-size: 11px; line-height: 15px; color: rgba(0,0,0,0.55); }
.shareUrl { font-family: 'Roboto Mono', Menlo, monospace; word-break: break-all; color: #3f51b5; }
.graphsTitle { padding-top: 6px; }
.graphs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-top: 8px; }
.graph { border: 1px solid #eceef5; border-radius: 4px; padding: 6px; }
.graph svg { width: 100%; height: auto; }
.graphTitle { font-size: 12px; font-weight: 500; }
.graphLegend { display: flex; align-items: center; gap: 10px; font-size: 11px; color: rgba(0,0,0,0.55); padding: 2px 0 4px; }
.graphLegend .spacer { flex: 1 1 auto; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
.dataTable { width: 100%; border-collapse: collapse; font-size: 9px; font-variant-numeric: tabular-nums; margin-top: 10px; }
.dataTable th { text-align: right; font-weight: 500; color: #5f6368; border-bottom: 1px solid #d5d7e0; padding: 3px 4px; }
.dataTable td { text-align: right; padding: 2px 4px; border-bottom: 1px solid #f4f5f9; }
.tableNote { padding-top: 8px; font-size: 10px; color: rgba(0,0,0,0.5); }
.pageFoot { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid #eceef5; font-size: 10px; color: rgba(0,0,0,0.5); }
.pageFoot .spacer { flex: 1 1 auto; }
.pageNumber { font-variant-numeric: tabular-nums; }
`;
}
