/** Shared menu availability and original-start preservation across modes. */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/context-menu-modes';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(String(error)));
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(detail)}`);
};
const snapshot = () =>
  page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const coords = (joints) => joints.map((j) => [j.id, j.x, j.y]);
    return {
      pose: coords(m.joints),
      start: m.mechanisms.map((one) => coords(one.joints[0])),
      seconds: m.mechanisms.map((_, i) => m.secondsOf(i)),
    };
  });
const openJoint = async () => {
  // Let the canvas paint whatever the step before this did -- a seek, a menu
  // dismissed -- before the joint is found. Pressed too soon, the press lands
  // where the joint was, on the menu still fading there, and the old rows come
  // back without a rebuild.
  await page.waitForTimeout(300);
  // Forced, because the plain click waits for the element to hold still, and
  // an animating joint never does. The position is still read at the moment
  // of the press, which a box measured a round trip earlier would not be.
  await page.locator('#joint_B').click({ button: 'right', force: true });
  await page.locator('#contextMenu.show').waitFor();
  await page.waitForTimeout(200);
};
const rows = () =>
  page.locator('.cm-row').evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.querySelector('.cm-row__label').textContent.trim(),
      disabled: node.classList.contains('cm-row--off'),
      reason: node.querySelector('.cm-row__reason')?.textContent.trim(),
    }))
  );
const menuRow = (label) =>
  page
    .locator('.cm-row')
    .filter({ has: page.locator('.cm-row__label', { hasText: new RegExp('^' + label + '$') }) });
let editRows;
for (const mode of ['Edit', 'Kinematic Analysis', 'Force Analysis']) {
  await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  // The library four-bar is massless; give it a load so reaction arrows have magnitude.
  await page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    m.links.forEach((link) => m.assignBodyMass(link, 1));
    m.updateMechanism(false);
  });
  await page.locator('.tabButton').filter({ hasText: mode }).click();
  await page.waitForTimeout(500); // Let the mode panel finish resizing the canvas.
  await page.locator('#joint_A').click({ force: true });
  await openJoint();
  check(
    `${mode}: right-click selects the named target`,
    await page.evaluate(
      () =>
        ng.getComponent(document.querySelector('app-new-grid')).activeObjService.selectedJoint
          .id === 'B'
    )
  );
  const startRows = await rows();
  if (!editRows) editRows = startRows.map((r) => r.label);
  check(
    `${mode}: identical menu rows`,
    JSON.stringify(startRows.map((r) => r.label)) === JSON.stringify(editRows),
    startRows
  );
  check(
    `${mode}: deletion available at start`,
    !startRows.find((r) => r.label.startsWith('Delete Joint')).disabled
  );
  await page.keyboard.press('Escape');
  // Exact seek is fixture setup; the actual menu actions below are pointer clicks.
  await page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    m.seekMechanism(0, m.mechanisms[0].cyclePeriod / 4);
  });
  const before = await snapshot();
  await openJoint();
  const pausedRows = await rows();
  check(
    `${mode}: topology changes disabled at paused pose`,
    pausedRows.filter((r) => !/Vectors$|^Trace path$|^Locked$|^Free to Move$/.test(r.label)).every((r) => r.disabled),
    pausedRows
  );
  check(
    `${mode}: trace path enabled at paused pose`,
    !pausedRows.find((r) => r.label === 'Trace path').disabled
  );
  await page.screenshot({ path: `${OUT}/${mode.split(' ')[0]}-paused-menu.png` });
  await menuRow('Trace path').click();
  const after = await snapshot();
  check(
    `${mode}: trace toggle preserves paused pose, clock, and original start`,
    JSON.stringify(before) === JSON.stringify(after),
    { before, after }
  );
  // Turn velocity on through the same menu and verify the actual canvas renders it.
  await openJoint();
  await menuRow('Velocity Vectors').click();
  check(
    `${mode}: velocity vectors render`,
    (await page.locator('#vectorTraceHolder path').count()) > 0
  );
  check(
    `${mode}: vectors preserve pose and original start`,
    JSON.stringify(before) === JSON.stringify(await snapshot())
  );
  await openJoint();
  await menuRow('Force Vectors').click();
  check(
    `${mode}: reaction vectors render`,
    await page.evaluate(() =>
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.vectorTracePaths()
        .some((p) => p.quantity === 'force')
    )
  );
  await page.locator('.transportCard .playButton').click();
  await openJoint();
  const playingRows = await rows();
  check(
    `${mode}: right-click pauses playback safely`,
    await page.evaluate(
      () => !ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isPlaying
    )
  );
  check(
    `${mode}: topology changes stay disabled after grab-to-pause`,
    playingRows.filter((r) => !/Vectors$|^Trace path$|^Locked$|^Free to Move$/.test(r.label)).every((r) => r.disabled),
    playingRows
  );
  await page.keyboard.press('Escape');
}
// Bulk fields use the same explanation and an actionable return-to-start link.
await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
await page.locator('#AB').click();
await page.locator('#BC').click({ modifiers: ['Meta'] });
const deleteFits = await page.getByRole('button', { name: 'Delete', exact: true }).evaluate(button => {
  const box = button.getBoundingClientRect();
  const label = button.querySelector('.mdc-button__label').getBoundingClientRect();
  return label.left >= box.left && label.right <= box.right;
});
check('bulk: short Delete label fits beside Lock', deleteFits);

await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  m.seekMechanism(0, m.mechanisms[0].cyclePeriod / 4);
});
const length = page.locator('app-multi-edit-panel input[data-field="length"]');
await page.waitForFunction(() => document.querySelector('app-multi-edit-panel input[data-field="length"]')?.disabled);
check(
  'bulk: paused numeric fields explain their refusal',
  (await length.isDisabled()) &&
    (await page.locator('app-multi-edit-panel .editBanner').isVisible())
);
await page.screenshot({ path: `${OUT}/bulk-paused-banner.png` });
await page.locator('app-multi-edit-panel .bannerAction').click();
await page.waitForFunction(() =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isAtStartPose()
);
check('bulk: return-to-start action enables numeric fields', await length.isEnabled());

// At a short phone viewport the combined menu must scroll, including its footer.
await page.setViewportSize({ width: 390, height: 600 });
await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
await openJoint();
const bounds = await page
  .locator('#contextMenu')
  .evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    client: el.clientHeight,
    scroll: el.scrollHeight,
    overflow: getComputedStyle(el).overflowY,
  }));
check(
  'mobile: combined menu fits the viewport and scrolls',
  bounds.height <= 584 && bounds.overflow === 'auto',
  bounds
);
await page.locator('#contextMenu').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
});
await page.screenshot({ path: `${OUT}/mobile-menu-footer.png` });
check('no browser errors', errors.length === 0, errors);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
