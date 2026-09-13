import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, bodyCenter, markCenter } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const base = process.env.PMKS_BASE_URL || 'http://localhost:4307';
const out = 'artifacts/bodies-and-joints/S5/editing';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 850 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};
async function drag(from, to, film) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (film) await film.shot('grip');
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6, {
      steps: 2,
    });
    if (film) await film.shot(`drag-${i}`);
  }
  await page.mouse.up();
  if (film) await film.shot('release');
}
async function measure(id) {
  const state = await nativeState(page),
    body = state.drawing.bodies.find((b) => b.id === id),
    [a, b] = body.geometry.vertices;
  const length = Number.parseFloat(
    await page.getByRole('textbox', { name: 'Length', exact: true }).inputValue()
  );
  const angle = Number.parseFloat(
    await page.getByRole('textbox', { name: 'Angle', exact: true }).inputValue()
  );
  assert.ok(
    Math.abs(length - Math.hypot(b.x - a.x, b.y - a.y)) < 1e-6,
    'Length reads the displayed material'
  );
  assert.ok(
    Math.abs(angle - ((body.pose.angle + Math.atan2(b.y - a.y, b.x - a.x)) * 180) / Math.PI) < 1e-5,
    'Angle reads the displayed material'
  );
}
try {
  await page.goto(`${base}/?editor=native`);
  await page.locator('#bootSplash').waitFor({ state: 'detached' });
  const creation = filmstrip(page, `${out}/creation`);
  await page.getByRole('button', { name: 'Add Link', exact: true }).click();
  await drag({ x: 440, y: 490 }, { x: 780, y: 300 }, creation);
  let state = await nativeState(page);
  check(
    'One grid gesture creates one body and one history entry',
    state.document.bodies.length === 2 && state.history === 1
  );
  check(
    'The created link is selected',
    state.selection.length === 1 && state.selection[0].kind === 'body'
  );
  const id = state.document.bodies.find((b) => b.kind === 'material').id;
  await measure(id);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check(
    'Undo removes the complete creation',
    (await nativeState(page)).document.bodies.length === 1
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  check(
    'Redo restores its stable identity',
    (await nativeState(page)).document.bodies.some((b) => b.id === id)
  );
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  const locked = await nativeState(page),
    center = await bodyCenter(page, id);
  await drag(center, { x: center.x + 55, y: center.y - 20 });
  state = await nativeState(page);
  check(
    'A refused locked drag changes neither placement nor history',
    JSON.stringify(state.document) === JSON.stringify(locked.document) &&
      state.history === locked.history
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Project Menu', exact: true }).click();
  const size = page.locator('[data-field="native-object-size"]');
  await size.fill('0.27 cm');
  await size.press('Enter');
  const before = await bodyCenter(page, id);
  await page.getByRole('combobox', { name: 'Length Unit', exact: true }).selectOption('m');
  check(
    'A small converted object size stays meaningful',
    (await size.inputValue()).includes('0.0027')
  );
  const converted = await bodyCenter(page, id);
  check(
    'Unit conversion preserves screen framing',
    Math.hypot(converted.x - before.x, converted.y - before.y) < 0.3
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check('Undo restores the source unit', (await nativeState(page)).document.units.length === 'cm');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  check(
    'Redo preserves the converted marker size',
    Math.abs((await nativeState(page)).document.settings.objectScale - 0.0027) < 1e-12
  );
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await page.locator('[data-body-id]').nth(1).waitFor();
  check(
    'Platform clipboard paste creates a separate body',
    (await nativeState(page)).document.bodies.length === 3
  );
  await contactSheet(`${out}/creation/*.png`, `${out}/creation-sheet.png`, 3, 0.5);

  await openNative(page, 'multiway');
  state = await nativeState(page);
  const pin = state.document.junctions[0];
  const at = await markCenter(page, state.document.joints[0].id);
  await page.mouse.click(at.x, at.y);
  const pair = page.getByRole('combobox', { name: 'Connection Pair', exact: true });
  check('Every pair at a three-way pin is offered', (await pair.locator('option').count()) === 3);
  await pair.selectOption({ index: 2 });
  await page.getByRole('button', { name: 'Weld', exact: true }).click();
  state = await nativeState(page);
  check(
    'Only the requested pair is welded',
    state.document.joints.filter((j) => j.kind === 'weld').length === 1
  );
  const weld = state.document.joints.find((j) => j.kind === 'weld');
  const member = await bodyCenter(page, weld.bodyB);
  await page.mouse.click(member.x, member.y);
  state = await nativeState(page);
  check(
    'A welded member selects its two-member group',
    state.selection[0].kind === 'group' && state.selection[0].members.length === 2
  );
  const history = state.history;
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  state = await nativeState(page);
  check(
    'Delete Welded Group leaves the third material member',
    state.document.bodies.length === 2 && state.history === history + 1
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check('Undo restores all three members', (await nativeState(page)).document.bodies.length === 4);

  await openNative(page, 'four-bar');
  state = await nativeState(page);
  const coupler = state.document.bodies.find((b) => b.label === 'coupler');
  const midpoint = await bodyCenter(page, coupler.id);
  await page.mouse.click(midpoint.x, midpoint.y);
  await measure(coupler.id);
  const slider = page.getByRole('slider', { name: 'M1 Animation Position' });
  await slider.fill('45');
  await measure(coupler.id);
  const angleField = page.getByRole('textbox', { name: 'Angle', exact: true });
  await angleField.fill('unfinished');
  await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
  check(
    'An unchanged pose preserves unfinished input',
    (await angleField.inputValue()) === 'unfinished'
  );
  await slider.fill('60');
  await measure(coupler.id);
  const paused = filmstrip(page, `${out}/paused-edit`);
  await paused.shot('paused');
  await page.getByRole('button', { name: 'Kinematic', exact: true }).click();
  const current = await nativeState(page);
  const endpointJoint = current.document.joints.find(
    (j) => j.bodyA === coupler.id || j.bodyB === coupler.id
  );
  const grab = await markCenter(page, endpointJoint.id),
    old = await nativeState(page);
  await drag(grab, { x: grab.x + 22, y: grab.y - 14 }, paused);
  await measure(coupler.id);
  state = await nativeState(page);
  check(
    `A paused drag commits once (history ${old.history} → ${state.history}; ${state.message})`,
    state.history === old.history + 1
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await measure(coupler.id);
  await paused.shot('undo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await measure(coupler.id);
  await paused.shot('redo');
  await page.getByRole('button', { name: 'Rewind', exact: true }).click();
  await measure(coupler.id);
  await contactSheet(`${out}/paused-edit/*.png`, `${out}/paused-edit-sheet.png`, 3, 0.5);
  check('No page or console errors', errors.length === 0);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await page.screenshot({ path: `${out}/last.png` });
  await browser.close();
}
