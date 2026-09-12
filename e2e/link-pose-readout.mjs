/** Selected link fields follow seeks and playback without overwriting an unfinished edit. */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await startQuiet(context);
const page = await context.newPage(),
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(String(e)));
const record = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(detail)}`);
};
await openMechanism(page, `${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
const selected = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const link = grid.mechanismSrv.links.find((l) => l.id === 'AB');
  grid.activeObjService.updateSelectedObj(link);
  return link.id;
});
const angle = page.getByRole('textbox', { name: 'Angle', exact: true });
const check = async (name) => {
  const values = await page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const link = g.activeObjService.selectedLink;
    const [a, b] = link.joints;
    return {
      id: link.id,
      degrees: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      text: document.querySelector('input[aria-label="Angle"]')?.value,
    };
  });
  const shown = Number.parseFloat(await angle.inputValue());
  const difference = Math.abs(((shown - values.degrees + 540) % 360) - 180);
  record(name, values.id === selected && difference <= 0.51, { ...values, shown, difference });
};
await check('selected link initially reads its rendered angle');
await page.getByRole('button', { name: 'Fix length', exact: true }).click();
await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  m.seekMechanism(0, 0.47);
});
await page.waitForTimeout(500);
await check('a seek updates the already selected link');
await page.getByRole('button', { name: 'Back to the start pose', exact: true }).first().click();
await page.waitForTimeout(500);
await check('returning to start updates the field without reselecting');
await page.getByRole('button', { name: 'Fit full motion', exact: true }).click();
await page.waitForTimeout(600);
const film = filmstrip(page, 'artifacts/link-pose-readout/frames');
await film.shot('start');
await page.getByRole('button', { name: 'Play', exact: true }).click();
const clocks = [];
for (let i = 0; i < 32; i++) {
  await film.shot('play');
  clocks.push(
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.secondsOf(0)
    )
  );
  await page.waitForTimeout(180);
}
record(
  'the observed playback crosses a complete cycle',
  clocks.some((time, i) => i > 0 && time < clocks[i - 1]),
  clocks
);
await page.getByRole('button', { name: 'Pause', exact: true }).click();
await check('pausing retains a truthful selected-link angle');
await film.shot('pause');
await page.getByRole('button', { name: 'Back to the start pose', exact: true }).first().click();
await page.waitForTimeout(500);
await check('the second rewind also refreshes the angle');
await film.shot('rewind');
await page.getByRole('button', { name: 'Undo', exact: true }).click();
await check('Undo retains the displayed angle');
record(
  'Undo releases only the test hold',
  (await page.getByRole('button', { name: 'Fix length', exact: true }).count()) === 1
);
const savedText = await angle.inputValue();
await angle.fill('12.');
await page.mouse.move(700, 700);
await page.waitForTimeout(500);
record('ordinary change detection retains unfinished typing', (await angle.inputValue()) === '12.');
await angle.fill(savedText);
await contactSheet(
  'artifacts/link-pose-readout/frames/*.png',
  'artifacts/link-pose-readout/sheet.png',
  4
);
record('no page errors', errors.length === 0, errors);
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
