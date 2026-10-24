/** Focused browser regressions for the PR 33 visual and copy follow-ups. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/pr33-followups';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}
const field = (name) => page.getByRole('textbox', { name, exact: true });
async function enter(name, value) {
  await field(name).fill(value);
  await field(name).press('Tab');
}
async function settings() {
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
}
async function openExport() {
  await page.locator('.historyButton', { hasText: 'Export Data' }).click();
}

await openMechanism(page, BASE);
await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
await page.getByRole('button', { name: /Motion — 3 positions/ }).click();
await enter('Position 1 X', '1 cm');
await enter('Position 1 Y', '1 cm');
await enter('Position 1 angle', '0 deg');
await page.getByRole('button', { name: 'Duplicate Last Position' }).click();
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await settings();
const unitFilm = filmstrip(page, `${OUT}/meter-film`);
await unitFilm.during(70, 8, 'switch', () =>
  page.getByRole('button', { name: 'SI (m)', exact: true }).click()
);
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page.locator('#settingsWrapper').waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
await page.locator('#synthesisPanel').waitFor({ state: 'visible' });
await page.waitForTimeout(450); // Let the panel slide finish before taking the static evidence image.
const outlines = await page.locator('.synthChipDot').evaluateAll((dots) =>
  dots.map((dot) => {
    const matrix = dot.getScreenCTM();
    return Number(dot.getAttribute('stroke-width')) * Math.hypot(matrix.a, matrix.b);
  })
);
check(
  'synthesis position outlines remain about one pixel in meters',
  outlines.length === 2 && outlines.every((px) => px > 0.7 && px < 1.4),
  outlines
);
await page.screenshot({ path: `${OUT}/meter-positions.png` });
await contactSheet(`${OUT}/meter-film/*-switch.png`, `${OUT}/meter-film.png`, 4);

check('no browser errors', errors.length === 0, errors);
await context.close();
await browser.close();
console.log(`${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
