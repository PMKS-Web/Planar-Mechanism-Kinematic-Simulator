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
  check(
    'synthesis Undo is enabled',
    await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled()
  );
  await page.getByRole('switch', { name: 'Ground pins inside a region', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await settings();
  const unitsFilm = filmstrip(page, `${OUT}/units`);
  await unitsFilm.during(80, 10, 'si', () =>
    page.getByRole('button', { name: 'SI (m)', exact: true }).click()
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
  await enter('Region X', '-0.02');
  check(
    'region edits preserve sub-unit dimensions',
    parseFloat(await field('Region width').inputValue()) < 0.1,
    await field('Region width').inputValue()
  );
  await page.screenshot({ path: `${OUT}/synthesis-si.png` });
  await load('4-Bar');
  errors.length = 0;
  // Actual context-menu action, including Angular's subsequent verification pass.
  await grid((g) => {
    const j = g.mechanismSrv.joints.find((j) => j.id === 'B');
    g.mechanismSrv.toggleVectorTrace(j, 'velocity');
    g.setLastRightClick(j);
    g.updateContextMenuItems();
    const row = g.cMenu.groups.flatMap((x) => x.rows).find((x) => x.label === 'Delete Joint');
    row.action();
  });
  await page.waitForTimeout(300);
  check(
    'deleting a joint raises no Angular change-detection error',
    !errors.some((e) => e?.includes('NG0100')),
    errors
  );
  await load('4-Bar');
  await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
  await page.getByRole('button', { name: /Motion — 3 positions/ }).click();
  const length = field('End-effector Link length');
  const validLength = await length.inputValue();
  for (const bad of ['-2', '0']) {
    await length.fill(bad);
    await length.press('Tab');
    check(`synthesis rejects length ${bad}`, (await length.inputValue()) === validLength);
  }
  await load('4-Bar');
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  const center = await grid((g) => {
    const b = g.mechanismSrv.joints.find((j) => j.id === 'B'),
      c = g.mechanismSrv.joints.find((j) => j.id === 'C');
    const p = g.svgGrid.modelToScreen({ x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 });
    return { x: p.x, y: p.y };
  });
  const dragFilm = filmstrip(page, `${OUT}/drag`);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  check(
    'holding a selection click does not flash drag traces',
    (await page.locator('#dragTraceHolder path').count()) === 0
  );
  await dragFilm.during(50, 10, 'drag', async () => {
    await page.mouse.move(center.x + 35, center.y + 20, { steps: 12 });
  });
  check(
    'actual drag shows temporary motion traces',
    (await page.locator('#dragTraceHolder path').count()) > 0
  );
  await page.mouse.up();
  check(
    'release removes temporary drag traces',
    (await page.locator('#dragTraceHolder path').count()) === 0
  );
  await page.getByRole('button', { name: 'Export Data', exact: true }).click();
  const exportPanel = page.locator('app-export-panel');
  await exportPanel.getByRole('button', { name: 'Next', exact: true }).click();
  await exportPanel.getByRole('button', { name: 'Select None', exact: true }).click();
  check(
    'empty export quantities stay on the explained quantity step',
    (await exportPanel.getByRole('button', { name: 'Next', exact: true }).isDisabled()) &&
      (await exportPanel.locator('.quantityHint').isVisible())
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await grid((g) => {
    const link = g.mechanismSrv.links.find((l) => l.id === 'BC');
    link.name = 'Luffing crank';
    g.activeObjService.updateSelectedObj(link);
  });
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check('existing multiword names can be saved unchanged', (await field('Name').count()) === 0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(getComputedStyle(document.querySelector('editable-title-block .row')).opacity) < 0.7
  );
  const frozen = await page
    .locator('editable-title-block .row')
    .evaluate((n) => getComputedStyle(n).opacity);
  check('animation visibly fades inactive header actions', Number(frozen) < 0.7, frozen);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.stopButton').click();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('button', { name: 'CAD Export', exact: true }).click();
  await page.getByRole('button', { name: /^Geometry / }).click();
  const pin = page.getByRole('spinbutton', { name: 'Pin diameter' });
  await pin.fill('');
  await pin.pressSequentially('-1');
  await pin.press('Tab');
  check(
    'negative CAD diameter stays negative and is refused',
    Number(await pin.inputValue()) === -1 &&
      (await page.locator('.drawingExport button[mat-flat-button]').isDisabled())
  );
  await page.getByRole('button', { name: 'Close CAD Export' }).click();
  await load('4-Bar');
  await grid((g) =>
    g.activeObjService.updateSelectedObj(g.mechanismSrv.joints.find((j) => j.input))
  );
  const speed = page.getByRole('textbox', { name: 'Input Speed', exact: true });
  await speed.fill('0');
  await speed.press('Tab');
  check(
    'zero Input Speed explains its refusal',
    await page
      .getByText('Input Speed must be a nonzero number. Use Pause to stop the animation.', {
        exact: true,
      })
      .isVisible()
  );
  await page.setViewportSize({ width: 760, height: 680 });
  await page.waitForTimeout(450);
  const gap = await page.evaluate(() => {
    const panel = document.querySelector('app-left-tabs .panel'),
      card = panel.querySelector('#normalPanel');
    const bottom = Math.min(
      card.getBoundingClientRect().bottom,
      panel.getBoundingClientRect().bottom - parseFloat(getComputedStyle(panel).paddingBottom)
    );
    const controls = [...document.querySelectorAll('.transportCard,.scrubCard')]
      .map((x) => x.getBoundingClientRect())
      .filter((r) => r.width > 0);
    return Math.min(...controls.map((r) => r.top)) - bottom;
  });
  check('narrow desktop panel keeps the standard 12px card gap', Math.abs(gap - 12) < 2, gap);
  await page.screenshot({ path: `${OUT}/narrow-panel-gap.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await load('Slotted_Tool_Drive');
  await grid((g) => g.activeObjService.updateSelectedObj(g.mechanismSrv.forces[0]));
  const forcePanelText = await page.locator('app-edit-panel').innerText();
  check(
    'force reference frame precedes global components',
    forcePanelText.indexOf('Reference Frame') < forcePanelText.indexOf('Force Components')
  );
  await page.screenshot({ path: `${OUT}/force-frame-order.png` });

  await contactSheet(`${OUT}/drag/*.png`, `${OUT}/drag-film.png`, 5, 0.3);
} catch (e) {
  console.error(e);
  results.push({ label: 'suite completion', ok: false, detail: String(e) });
} finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
await contactSheet(`${OUT}/units/*.png`, `${OUT}/unit-film.png`, 5, 0.3);
if (results.some((x) => !x.ok)) process.exitCode = 1;
