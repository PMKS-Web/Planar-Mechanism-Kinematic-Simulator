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

/**
 * What one printed page holds, measured rather than guessed.
 *
 * A Letter page at half-inch margins leaves 960px of content at 96dpi; the
 * heading and the footer take about 88 of them. A table row is set in 8.5px
 * type with a pixel of padding either side, which measures 12px.
 */
const BODY_HEIGHT = 860;
const ROW_HEIGHT = 13;
const BODY_WIDTH = 720;
/**
 * How wide the characters of a number are in this type, measured at 8.5px.
 *
 * A digit, a point and a minus sign are three different widths, and counting
 * characters instead of measuring them over-estimates a signed decimal by about
 * a tenth — which is the difference between fifteen columns on a page and
 * fourteen, and so between six pages of table and twelve.
 */
const DIGIT_WIDTH = 4.46;
const POINT_WIDTH = 2.2;
const SIGN_WIDTH = 2.7;
/** Padding either side of a cell, and a little over on the measurement. */
const COLUMN_PADDING = 4;
const WIDTH_MARGIN = 1.04;
/** However narrow the numbers are, a head needs room to be read. */
const MOST_COLUMNS = 24;
/**
 * How many graphs a page carries.
 *
 * Four on the first page, in two columns, beside the drawing and the settings —
 * the size the design draws them at. Six is what fits when they are set three
 * across, which is what a first page holds when that is all of them; eight is
 * what a page of nothing but graphs holds.
 */
const GRAPHS_ON_FIRST_PAGE = 4;
const GRAPHS_ON_FIRST_PAGE_TIGHT = 6;
const GRAPHS_PER_PAGE = 8;

const rowsPerPage = (): number => Math.floor(BODY_HEIGHT / ROW_HEIGHT);

/**
 * How many columns fit across the page, measured off the numbers themselves.
 *
 * Two decimals is a much narrower column than six, and a reading in the tens is
 * narrower than one in the thousands. Estimating from the setting alone split
 * every table into the same number of chunks whatever it held — and each chunk
 * is another pass over every row, which is where the pages went.
 */
function columnsPerPage(rows: string[][]): number {
  // A floor low enough that it never decides the answer for a real table, and
  // only stops an empty one dividing by nothing.
  let widest = 4 * DIGIT_WIDTH;
  rows.forEach((row) => row.forEach((cell) => (widest = Math.max(widest, cellWidth(cell)))));
  const width = (widest + COLUMN_PADDING) * WIDTH_MARGIN;
  // One fewer, because the time column rides every page beside these. Capped,
  // because a column narrower than its own head sets that head wrapping down
  // the page a letter at a time.
  return Math.min(MOST_COLUMNS, Math.max(3, Math.floor(BODY_WIDTH / width) - 1));
}

function cellWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    width += character === '.' ? POINT_WIDTH : character === '-' ? SIGN_WIDTH : DIGIT_WIDTH;
  }
  return width;
}

/**
 * Split into pages that are as full as each other rather than as full as
 * possible.
 *
 * Nine pages of forty rows and a tenth holding one is the same paper as six
 * pages of sixty and a seventh holding one; balanced, it is six pages of sixty
 * and no orphan at all.
 */
function pageSize(total: number, most: number): number {
  const pages = Math.max(1, Math.ceil(total / most));
  return Math.ceil(total / pages);
}

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
      body: firstPageBody(context, section, graphs[0]),
      footer: section.footer,
    });
    graphs.slice(1).forEach((page) => {
      bodies.push({
        body: `${sectionHead(context, section.graphsTitle, section.subtitle)}
          <div class="graphs across${page.across}">${page.plots.map(graphBlock).join('')}</div>`,
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
export function reportPages(section: { plots: number; rows: string[][]; columns: number }): number {
  const graphPages = graphChunkCount(section.plots);
  const perPage = pageSize(section.columns, columnsPerPage(section.rows));
  const dataPages =
    Math.ceil(section.columns / perPage) *
    Math.ceil(section.rows.length / pageSize(section.rows.length, rowsPerPage()));
  return 1 + graphPages + dataPages;
}

/** How many pages of graphs follow the first one. */
function graphChunkCount(plots: number): number {
  if (plots <= GRAPHS_ON_FIRST_PAGE_TIGHT) return 0;
  return Math.ceil((plots - GRAPHS_ON_FIRST_PAGE) / GRAPHS_PER_PAGE);
}

/**
 * Which graphs land on which page, and how many across.
 *
 * A fifth graph used to go on a page of its own, nine tenths of it white. Set
 * three across instead, the first page takes six — so a report with no more
 * graphs than that has no graph page at all.
 */
function chunkGraphs(plots: ReportPlot[]): { plots: ReportPlot[]; across: 2 | 3 }[] {
  if (plots.length === 0) return [{ plots: [], across: 2 }];
  if (plots.length <= GRAPHS_ON_FIRST_PAGE) return [{ plots, across: 2 }];
  if (plots.length <= GRAPHS_ON_FIRST_PAGE_TIGHT) return [{ plots, across: 3 }];
  const rest = plots.slice(GRAPHS_ON_FIRST_PAGE);
  // Spread over as many pages as they need, evenly: nine graphs are better as
  // two pages of five and four than as a full page and one nearly empty.
  return [
    { plots: plots.slice(0, GRAPHS_ON_FIRST_PAGE), across: 2 as const },
    ...chunk(rest, pageSize(rest.length, GRAPHS_PER_PAGE)).map((page) => ({
      plots: page,
      across: 2 as const,
    })),
  ];
}

/** Which rows and which columns land on each data page, in reading order. */
function tablePages(section: ReportSection): { columns: number[]; rows: string[][] }[] {
  const rowPages = chunk(section.rows, pageSize(section.rows.length, rowsPerPage()));
  // Time rides every chunk: a column of numbers with nothing to line it up
  // against is not data anyone can use.
  const columns = section.heads.slice(1).map((_, at) => at + 1);
  const columnChunks = chunk(columns, pageSize(columns.length, columnsPerPage(section.rows)));
  return columnChunks.flatMap((chunkOfColumns) =>
    rowPages.map((rows) => ({ columns: chunkOfColumns, rows }))
  );
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
  graphs: { plots: ReportPlot[]; across: 2 | 3 }
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
      graphs.plots.length > 0
        ? `<div class="panelTitle graphsTitle">Graphs</div><div class="graphs across${
            graphs.across
          }">${graphs.plots.map(graphBlock).join('')}</div>`
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
  const split = table.columns.length < section.heads.length - 1;
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
.page {
  width: 7.5in;
  /* A shade under the 10in a Letter page leaves at half-inch margins. A block
     exactly the height of the printable area rounds over it in some printers
     and lays a blank page after every real one, which is where the empty pages
     in the first cut of this came from. */
  height: 9.85in;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
}
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
.graphs { display: grid; gap: 8px; padding-top: 8px; }
.graphs.across2 { grid-template-columns: 1fr 1fr; }
.graphs.across3 { grid-template-columns: 1fr 1fr 1fr; }
.graph { border: 1px solid #eceef5; border-radius: 4px; padding: 6px; }
.graph svg { width: 100%; height: auto; }
.graphTitle { font-size: 12px; font-weight: 500; }
.graphLegend { display: flex; align-items: center; gap: 10px; font-size: 11px; color: rgba(0,0,0,0.55); padding: 2px 0 4px; }
.graphLegend .spacer { flex: 1 1 auto; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
.dataTable { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5px; font-variant-numeric: tabular-nums; margin-top: 8px; }
/* A head is several words and a column is one number wide, so the head wraps
   rather than setting the width of everything under it. */
.dataTable th { text-align: right; font-weight: 500; color: #5f6368; border-bottom: 1px solid #d5d7e0; padding: 2px; line-height: 11px; word-break: break-word; }
.dataTable td { text-align: right; padding: 1px 2px; border-bottom: 1px solid #f7f8fc; line-height: 10px; }
/* Time is the column every page repeats, and the one a reader scans down. */
.dataTable th:first-child, .dataTable td:first-child { text-align: left; }
.tableNote { padding-top: 8px; font-size: 10px; color: rgba(0,0,0,0.5); }
.pageFoot { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid #eceef5; font-size: 10px; color: rgba(0,0,0,0.5); }
.pageFoot .spacer { flex: 1 1 auto; }
.pageNumber { font-variant-numeric: tabular-nums; }
`;
}
