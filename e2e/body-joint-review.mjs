import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, bodyCenter, markCenter } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const out = 'artifacts/bodies-and-joints/S5/review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
const checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
};
try {
  await openNative(page, 'multiway');
  let before = await nativeState(page);
  const pin = before.document.junctions[0],
    p = await markCenter(page, pin.joints[0]);
  const from = { x: p.x + 2, y: p.y + 2 };
  await page.mouse.click(from.x, from.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Link', exact: true }).click();
  const film = filmstrip(page, `${out}/attach`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await film.shot('grip');
  await page.mouse.move(1060, 600, { steps: 5 });
  await film.shot('drag');
  await page.mouse.up();
  await film.shot('release');
  let after = await nativeState(page);
  check(
    'An off-center pin grip adds a member to the same pin, with no second pin',
    after.document.junctions.length === 1 &&
      after.document.junctions[0].id === pin.id &&
      after.document.junctions[0].attachments.length === 4 &&
      after.document.attachments.filter((a) =>
        before.document.bodies.some((b) => b.id === a.bodyId)
      ).length === before.document.attachments.length
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.mouse.click(from.x, from.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Add Ground', exact: true }).click();
  after = await nativeState(page);
  const world = after.document.bodies.find((b) => b.kind === 'world').id;
  check(
    'Grounding an off-center pin click extends its existing junction',
    after.document.junctions.length === 1 &&
      after.document.junctions[0].attachments.length === 4 &&
      after.document.attachments.filter((a) => a.bodyId !== world).length ===
        before.document.attachments.length
  );
  await page.mouse.click(from.x, from.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove Ground', exact: true }).click();
  after = await nativeState(page);
  check(
    'Remove Ground preserves all original pin members',
    after.document.junctions[0].attachments.length === 3 &&
      JSON.stringify(after.document.joints) === JSON.stringify(before.document.joints)
  );

  await openNative(page, 'multiway');
  before = await nativeState(page);
  const target = before.document.bodies.filter((b) => b.kind === 'material')[1],
    end = await bodyCenter(page, target.id);
  await page.mouse.click(1050, 600, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Link', exact: true }).click();
  await page.mouse.move(1050, 600);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await film.shot('drop-preview');
  await page.mouse.up();
  after = await nativeState(page);
  const added = after.document.bodies.find(
    (b) => !before.document.bodies.some((old) => old.id === b.id)
  );
  check(
    'Dropping over a material body ignores the new link preview and connects the target',
    after.document.joints.some(
      (j) => [j.bodyA, j.bodyB].includes(added.id) && [j.bodyA, j.bodyB].includes(target.id)
    )
  );

  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(150);
  check(
    'Native keyboard paste creates one undoable copy',
    (await nativeState(page)).document.bodies.length === after.document.bodies.length + 1
  );
  await page.keyboard.press('ControlOrMeta+z');
  check(
    'Native keyboard Undo removes only the copy',
    (await nativeState(page)).document.bodies.length === after.document.bodies.length
  );

  for (const kind of ['Prismatic', 'Pin-in-slot']) {
    await openNative(page, 'multiway');
    before = await nativeState(page);
    const joint = before.document.joints[0],
      pinPoint = await markCenter(page, joint.id);
    await page.mouse.click(pinPoint.x, pinPoint.y);
    await page.getByRole('button', { name: kind, exact: true }).click();
    after = await nativeState(page);
    check(
      `${kind} releases the selected pair and retains the other pin edge`,
      after.document.junctions[0].attachments.length === 2 &&
        after.document.joints.filter((j) => j.kind === 'revolute').length === 1 &&
        after.history === before.history + 1
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    check(
      `${kind} undo restores the original multiway pin`,
      JSON.stringify((await nativeState(page)).document) === JSON.stringify(before.document)
    );
  }
  await openNative(page, 'multiway');
  before = await nativeState(page);
  const pinPoint = await markCenter(page, before.document.joints[0].id);
  await page.mouse.click(pinPoint.x, pinPoint.y);
  await page.getByRole('button', { name: 'Weld', exact: true }).click();
  await page.mouse.click(pinPoint.x + 2, pinPoint.y + 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Add Ground', exact: true }).click();
  await page.mouse.click(pinPoint.x, pinPoint.y);
  const pair = page.getByRole('combobox', { name: 'Connection Pair' });
  const groundPair = await pair
    .locator('option')
    .evaluateAll((options) => options.find((o) => o.textContent.includes('Ground')).value);
  await pair.selectOption(groundPair);
  await page.getByRole('button', { name: 'Weld', exact: true }).click();
  const groupPoint = await bodyCenter(
    page,
    before.document.bodies.filter((b) => b.kind === 'material')[0].id
  );
  await page.mouse.click(groupPoint.x, groupPoint.y);
  check(
    'A grounded welded group stays selected with its full canonical membership',
    (await nativeState(page)).selection[0].members.includes('WORLD')
  );
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('');
  await name.press('Enter');
  check('An empty rename is refused without losing the name editor', await name.isVisible());
  await name.fill('Grounded Bracket');
  await name.press('Enter');
  await page.locator('input[aria-label="Group Color"]').fill('#987654');
  await page.locator('input[aria-label="Group Color"]').dispatchEvent('change');
  after = await nativeState(page);
  check(
    'Grounded group rename and color use the same material membership',
    after.document.groups.some(
      (g) => g.label === 'Grounded Bracket' && g.presentation.fill === '#987654'
    )
  );
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  check(
    'Deleting the grounded group preserves the third material and WORLD',
    (await nativeState(page)).document.bodies.length === 2
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check(
    'Undo restores the grounded group presentation',
    (await nativeState(page)).document.groups.some((g) => g.label === 'Grounded Bracket')
  );

  await openNative(page, 'four-bar');
  before = await nativeState(page);
  const crank = before.document.bodies.find((b) => b.label === 'crank'),
    center = await bodyCenter(page, crank.id);
  await page.mouse.click(center.x, center.y);
  const x = page.getByRole('textbox', { name: 'X', exact: true });
  const entered = Number.parseFloat(await x.inputValue()) + 0.2;
  await x.fill(String(entered));
  await x.press('Enter');
  after = await nativeState(page);
  check(
    'An impossible typed crank coordinate is refused rather than projected',
    JSON.stringify(after.document) === JSON.stringify(before.document) &&
      after.history === before.history &&
      after.message.length > 0
  );
  const toast = page.locator('app-notification-stack');
  await toast
    .getByRole('button', { name: /Dismiss/ })
    .first()
    .click();
  await x.fill(String(entered));
  await x.press('Enter');
  check(
    'Repeating the same refused action speaks again after dismissal',
    (await toast.locator('[role="status"], [role="alert"]').count()) > 0
  );
  await contactSheet(`${out}/attach/*.png`, `${out}/attach-sheet.png`, 3, 0.5);
  check('No browser errors', errors.length === 0);
} finally {
  await page.screenshot({ path: `${out}/last.png` });
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
