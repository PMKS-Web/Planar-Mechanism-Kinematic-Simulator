/** Regression coverage for the interaction audit, findings 1–26. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/bug-fixes-2';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const results = [];
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
page.on('console', async (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const check = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`, ok ? '' : detail);
};
const grid = (fn, arg) =>
  page.evaluate(
    ({ source, arg }) =>
      new Function('g', 'arg', `return (${source})(g,arg)`)(
        ng.getComponent(document.querySelector('app-new-grid')),
        arg
      ),
    { source: fn.toString(), arg }
  );
const load = async (id) => {
  await openMechanism(page, `${BASE}/?${payloads[id] ?? id}`);
};
const field = (name) => page.getByRole('textbox', { name, exact: true });
const enter = async (name, value) => {
  await field(name).fill(value);
  await field(name).press('Tab');
};
const settings = async () => {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
};
try {
  await load('4-Bar');
  await settings();
  await page.getByRole('button', { name: 'Radian', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
  await page.getByRole('button', { name: /Motion — 3 positions/ }).click();
  for (const [n, v] of [
    ['Position 1 X', '2'],
    ['Position 1 Y', '1'],
    ['Position 1 angle', '1.57 rad'],
  ])
    await enter(n, v);
  const angle = await grid((g) => g.synthesisBuilder.getAllPoses()[0]?.thetaDegrees).catch(() =>
    page.evaluate(
      () =>
        ng.getComponent(document.querySelector('app-synthesis-panel')).design.getAllPoses()[0]
          ?.thetaDegrees
    )
  );
  check(
    'synthesis converts radian input to the intended pose',
    Math.abs(angle - 89.954) < 0.1,
    angle
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await settings();
  const unitsFilm = filmstrip(page, `${OUT}/units`);
  await unitsFilm.during(80, 10, 'si', () =>
    page.getByRole('button', { name: 'SI (m)', exact: true }).click()
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
} catch (e) {
  console.error(e);
  results.push({ label: 'suite completion', ok: false, detail: String(e) });
} finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
await contactSheet(`${OUT}/units/*.png`, `${OUT}/unit-film.png`, 5, 0.3);
if (results.some((x) => !x.ok)) process.exitCode = 1;
