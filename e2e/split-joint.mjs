/** Split Joint through the real panel, history, overlapping pins and phone layout. */
import { mkdirSync } from 'node:fs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism, waitForReady } from './app-ready.mjs';
import { contactSheet, filmstrip } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
// Published as “Four-bar with four equal sides” in docs/fixture-urls.md.
const FIXTURE =
  '?2v.Ay,1E8.5,0.1011.6A,A,0,0,0.0B,B,0,VG,0.0G,G,VG,VG,0.4H,H,VG,0,0..YRAB,AB,Fe,Fe,0,Fe,c5cae9,A,B,,.YRBG,BG,Fe,Fe,Fe,VG,303e9f,B,G,,.YRGH,GH,Fe,Fe,VG,Fe,0d125a,G,H,,...N_k*1vedFB';
// Published as “Shaper's quick-return drive” in docs/fixture-urls.md.
const FLOATING_SLOT_FIXTURE =
  '?2v.Ay,1E8.A,0.1011.6A,A,0,0,0.1B,B,Fe,0,0,CD,C,D.4C,C,0,0ku,0.0D,D,Oj,RF,0.5R,R,qW,si,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,CN,09q,303e9f,C,D,,.YRDR,DR,Fe,Fe,cd,e_,0d125a,D,R,,...N_6*3Bw7de';
const OUT = 'artifacts/split-joint';
mkdirSync(OUT, { recursive: true });

const checks = [];
function check(label, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await openMechanism(page, BASE + FIXTURE);
await page.locator('#joint_B').click();
const splitButton = page.getByRole('button', { name: 'Split Joint' });
await page.screenshot({ path: `${OUT}/panel-before.png` });
check('the panel offers Split Joint', await splitButton.isEnabled(), null);
const addInput = page.getByRole('button', { name: 'Add Input' });
const addBox = await addInput.boundingBox();
const splitAddBox = await splitButton.boundingBox();
await addInput.click();
const removeInput = page.getByRole('button', { name: 'Remove Input' });
const removeBox = await removeInput.boundingBox();
const splitRemoveBox = await splitButton.boundingBox();
check(
  'Add Input and Remove Input do not reflow either half of the action row',
  Math.abs(addBox.width - removeBox.width) < 0.5 &&
    Math.abs(addBox.x - removeBox.x) < 0.5 &&
    Math.abs(splitAddBox.width - splitRemoveBox.width) < 0.5 &&
    Math.abs(splitAddBox.x - splitRemoveBox.x) < 0.5,
  { addBox, removeBox, splitAddBox, splitRemoveBox }
);
const labelRoom = await page.evaluate(() => {
  const room = (name) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.getAttribute('aria-label') === name
    );
    const text = [...button.querySelectorAll('*')]
      .flatMap((element) => [...element.childNodes])
      .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === name);
    const range = document.createRange();
    range.selectNodeContents(text);
    return button.getBoundingClientRect().width - range.getBoundingClientRect().width;
  };
  return { remove: room('Remove Input'), split: room('Split Joint') };
});
check(
  'the two labels retain equal surrounding room',
  Math.abs(labelRoom.remove - labelRoom.split) < 1,
  labelRoom
);
await page.screenshot({ path: `${OUT}/stable-input-width.png` });
await removeInput.click();
const newsDismiss = page.locator('.mat-mdc-snack-bar-container button');
if (await newsDismiss.count()) {
  await newsDismiss.first().click();
  await page.locator('.mat-mdc-snack-bar-container').waitFor({ state: 'hidden' });
}
const beforeSplit = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((one) => one.id === 'B');
  return { x: joint.x, y: joint.y };
});
await splitButton.click();
await page.waitForTimeout(250);

const topology = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const at = (id) => {
      const joint = grid.mechanismSrv.joints.find((one) => one.id === id);
      return joint ? { x: joint.x, y: joint.y, links: joint.links.map((link) => link.id) } : null;
    };
    return { b: at('B'), i: at('I'), selected: grid.activeObjService.selectedJoint?.id };
  });
let state = await topology();
check(
  'one click moves both pins apart and keeps the original selected',
  state.b &&
    state.i &&
    Math.hypot(state.b.x - beforeSplit.x, state.b.y - beforeSplit.y) > 0 &&
    Math.hypot(state.i.x - beforeSplit.x, state.i.y - beforeSplit.y) > 0 &&
    Math.hypot(state.b.x - state.i.x, state.b.y - state.i.y) > 0 &&
    state.selected === 'B',
  state
);
await page.screenshot({ path: `${OUT}/panel-after-separated.png` });
check('the split action now explains its one-link refusal', !(await splitButton.isEnabled()), null);
check(
  'and exposes the exact refusal to assistive technology',
  (await splitButton.getAttribute('aria-description')) ===
    'Only one link is on this joint, so there is nothing to split.',
  await splitButton.getAttribute('aria-description')
);
await page.mouse.move(800, 700);
await splitButton.locator('xpath=..').hover();
await page.waitForTimeout(900);
const tooltip = page.locator('.mat-mdc-tooltip').first();
check(
  'the disabled action shows its refusal on hover',
  (await tooltip.count()) > 0 &&
    (await tooltip.textContent()).trim() ===
      'Only one link is on this joint, so there is nothing to split.',
  (await tooltip.count()) > 0 ? await tooltip.textContent() : null
);
await page.screenshot({ path: `${OUT}/disabled-tooltip.png` });
await page.locator('#joint_I').click({ button: 'right' });
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/menu-actions.png` });
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Undo' }).click();
await waitForReady(page);
state = await topology();
check('Undo restores the shared joint', state.b?.links.length === 2 && state.i === null, state);
await page.getByRole('button', { name: 'Redo' }).click();
await waitForReady(page);
state = await topology();
check(
  'Redo restores both separated split pins',
  state.b?.links.length === 1 &&
    state.i?.links.length === 1 &&
    Math.hypot(state.b.x - state.i.x, state.b.y - state.i.y) > 0,
  state
);
const beforeDrag = state;

const film = filmstrip(page, `${OUT}/drag`);
await film.shot('00-separated');
const box = await page.locator('#joint_B').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await film.shot('01-take-hold');
await film.during(55, 5, '02-mid-drag', () =>
  page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 + 70, { steps: 24 })
);
await page.mouse.up();
await film.shot('03-released');
await page.waitForTimeout(350);
await film.shot('04-settled');
const moved = await topology();
const stayed = (before, after) =>
  before && after && Math.hypot(before.x - after.x, before.y - after.y) < 1e-9;
check(
  'dragging one split pin moves it without moving the other',
  moved.b &&
    moved.i &&
    stayed(beforeDrag.b, moved.b) !== stayed(beforeDrag.i, moved.i) &&
    (moved.b.x !== moved.i.x || moved.b.y !== moved.i.y),
  { beforeDrag, moved }
);
await contactSheet(`${OUT}/drag/*.png`, `${OUT}/drag-contact-sheet.png`, 3, 0.45);

await page.setViewportSize({ width: 390, height: 844 });
await openMechanism(page, BASE + FIXTURE);
await page.locator('#joint_B').click();
await splitButton.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/phone.png`, fullPage: true });
const phone = await splitButton.boundingBox();
check(
  'the paired actions fit the phone panel',
  phone && phone.x >= 0 && phone.x + phone.width <= 390 && phone.y >= 0 && phone.y < 844,
  phone
);
await splitButton.click();
state = await topology();
check(
  'Split Joint activates and separates pins from the phone panel',
  state.b && state.i && Math.hypot(state.b.x - state.i.x, state.b.y - state.i.y) > 0,
  state
);

await page.setViewportSize({ width: 1280, height: 800 });
await openMechanism(page, BASE + FLOATING_SLOT_FIXTURE);
const floatingBefore = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find(
    (candidate) => candidate.constructor.name === 'PrisJoint' && candidate.isFloating
  );
  return {
    id: joint.id,
    x: joint.x,
    y: joint.y,
    count: grid.mechanismSrv.joints.length,
    riders: joint.links.map((link) => link.id).sort(),
  };
});
await page.locator(`#joint_${floatingBefore.id}`).click();
await page.getByRole('button', { name: 'Split Joint' }).click();
const floatingState = () =>
  page.evaluate((id) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === id);
    return {
      kind: joint?.constructor.name,
      dangling: joint?.isDangling,
      floating: joint?.isFloating,
      x: joint?.x,
      y: joint?.y,
      count: grid.mechanismSrv.joints.length,
      riders: joint?.links.map((link) => link.id).sort(),
    };
  }, floatingBefore.id);
let floating = await floatingState();
check(
  'a floating slot split keeps one slider and its riders while detaching the carrier',
  floating.kind === 'PrisJoint' &&
    floating.dangling === true &&
    floating.count === floatingBefore.count &&
    JSON.stringify(floating.riders) === JSON.stringify(floatingBefore.riders) &&
    Math.hypot(floating.x - floatingBefore.x, floating.y - floatingBefore.y) > 0,
  { floatingBefore, floating }
);
await page.screenshot({ path: `${OUT}/floating-slot-detached.png` });
await page.getByRole('button', { name: 'Undo' }).click();
await waitForReady(page);
floating = await floatingState();
check('Undo restores the floating slot carrier', floating.floating === true, floating);
await page.getByRole('button', { name: 'Redo' }).click();
await waitForReady(page);
floating = await floatingState();
check(
  'Redo restores the same dangling slider without adding a joint',
  floating.kind === 'PrisJoint' &&
    floating.dangling === true &&
    floating.count === floatingBefore.count,
  floating
);
check('nothing threw', errors.length === 0, errors);

await browser.close();
console.log(`\n${checks.filter(Boolean).length}/${checks.length} checks passed`);
if (checks.some((ok) => !ok)) process.exitCode = 1;
