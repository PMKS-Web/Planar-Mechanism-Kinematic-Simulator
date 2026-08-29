/**
 * Export every template through the real dialog, parse each file back, and
 * leave the drawings where a stricter tool can be pointed at them.
 *
 * The unit round-trip in `src/app/services/export/dxf/gallery-round-trip.spec.ts`
 * covers the builder against fixtures. This covers the parts of the pipeline a
 * fixture cannot reach: the solved slot travels, the origin shift the dialog
 * chooses, the zip, and the file names a reader actually receives.
 *
 * The DXFs land in `artifacts/dxf-sweep/`. To check them against something
 * stricter than a lenient parser -- which is how the old R2000 output went a
 * long time with tables an importer silently repaired -- see the ezdxf audit
 * snippet in `docs/tips-and-tricks.md`.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/dxf-sweep.mjs
 *   ONLY=Slider_Crank PMKS_BASE_URL=http://localhost:4200 node e2e/dxf-sweep.mjs
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_IDS, TEMPLATE_LINKAGES, assertTemplatesParsed } from './template-payloads.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const required = createRequire(import.meta.url)('dxf-parser');
const DxfParser = required.default ?? required;

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/dxf-sweep';
const ONLY = process.env.ONLY;

assertTemplatesParsed();
mkdirSync(OUT, { recursive: true });

const wanted = ONLY ? [ONLY] : TEMPLATE_IDS;
const failures = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures.push(label);
  if (!pass) console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

for (const id of wanted) {
  const payload = TEMPLATE_LINKAGES[id];
  if (!payload) {
    check(`${id} has a payload`, false);
    continue;
  }
  await openMechanism(page, `${BASE}?${payload}`);
  await page.waitForTimeout(250);
  const skip = page.getByText('No thanks', { exact: true });
  if ((await skip.count()) > 0 && (await skip.first().isVisible())) await skip.first().click();

  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'CAD Export' }).click();
  await page.waitForSelector('app-drawing-export', { state: 'visible' });
  // The drawing on its own, so the file on disk is the thing being checked
  // rather than a zip that has to be unpacked first.
  await page.locator('app-drawing-export [data-section="data"]').click();
  await page.waitForTimeout(200);
  await page.locator('app-drawing-export .radioRow', { hasText: 'None' }).first().click();
  await page.waitForTimeout(200);
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export DXF/ }).click();
  const download = await wait;
  const text = readFileSync(await download.path(), 'utf8');
  writeFileSync(`${OUT}/${id}.dxf`, text);
  await page.waitForSelector('app-drawing-export', { state: 'detached' });

  check(`${id} is R12`, /\$ACADVER\r?\n1\r?\nAC1009/.test(text));
  check(`${id} carries nothing R12 predates`, !/AcDb|LWPOLYLINE/.test(text));
  check(
    `${id} names its unit in the file name`,
    /\((cm|m|in)\)\.dxf$/.test(download.suggestedFilename()),
    download.suggestedFilename()
  );
  check(`${id} has no non-finite coordinate`, !/NaN|Infinity/.test(text));

  const parsed = new DxfParser().parseSync(text);
  check(`${id} parses`, parsed !== null && parsed.entities.length > 0);
  if (!parsed) continue;

  const declared = new Set(Object.keys(parsed.tables.layer.layers));
  const stray = parsed.entities.map((entity) => entity.layer).filter((name) => !declared.has(name));
  check(
    `${id} draws only on layers it declared`,
    stray.length === 0,
    [...new Set(stray)].join(', ')
  );

  // A closed loop is what an importer offers as a face; an open one is a path
  // somebody has to stitch. The build preset's whole point is the former.
  const loops = parsed.entities.filter((entity) => entity.type === 'POLYLINE');
  const bodies = loops.filter((entity) => /^PMKS_LINK_/.test(entity.layer));
  check(
    `${id} gives every link a closed body`,
    bodies.length > 0 && bodies.every((one) => one.shape),
    `${bodies.length} bodies`
  );

  const holes = parsed.entities.filter(
    (entity) => entity.type === 'CIRCLE' && /^PMKS_LINK_/.test(entity.layer)
  );
  check(`${id} cuts a hole in the parts`, holes.length > 0, `${holes.length} holes`);
  console.log(
    `  ok   ${id.padEnd(28)} ${bodies.length} bodies · ${holes.length} holes · ${declared.size} layers`
  );
}

check('no browser errors were raised', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();

console.log(
  failures.length
    ? `\n${failures.length} failed check(s). Files in ${OUT}/`
    : `\nAll checks passed across ${wanted.length} mechanisms. Files in ${OUT}/`
);
process.exit(failures.length ? 1 : 0);
