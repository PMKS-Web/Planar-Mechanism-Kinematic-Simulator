import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, bodyCenter, markCenter } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const out = 'artifacts/bodies-and-joints/S5/gestures';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1280, height: 850 } }),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};
async function drag(from, to, film) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await film.shot('grip');
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 5, from.y + ((to.y - from.y) * i) / 5);
    await film.shot(`move-${i}`);
  }
  await page.mouse.up();
  await film.shot('release');
}
try {
  for (const key of ['axial', 'rotating-p-drive']) {
    await openNative(page, key);
    const before = await nativeState(page),
      assembly = before.document.assemblies[0],
      id = assembly.internalJoint;
    const start = await markCenter(page, id),
      point = await page.locator(`[data-mark-id="${id}"]`).evaluate((el) => {
        const m = el.getScreenCTM();
        return { x: m.a / Math.hypot(m.a, m.b), y: m.b / Math.hypot(m.a, m.b) };
      });
    const film = filmstrip(page, `${out}/${key}`);
    await drag(start, { x: start.x + 35 * point.x, y: start.y + 35 * point.y }, film);
    const after = await nativeState(page);
    check(`${key}: P travel is one undoable gesture`, after.history === before.history + 1);
    check(
      `${key}: travel never reshapes the barrel or rod`,
      before.document.bodies
        .filter((b) => b.kind === 'material')
        .every(
          (b) =>
            JSON.stringify(b.geometry) ===
            JSON.stringify(after.document.bodies.find((n) => n.id === b.id).geometry)
        )
    );
    if (key === 'axial') {
      const station = await markCenter(page, id);
      check(
        'The cylinder head follows the rod while the barrel keeps its shape',
        Math.hypot(station.x - start.x, station.y - start.y) > 20
      );
    }
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await film.shot('undo');
    check(
      `${key}: Undo restores the entire authored drawing`,
      JSON.stringify((await nativeState(page)).document) === JSON.stringify(before.document)
    );
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await film.shot('redo');
    await contactSheet(`${out}/${key}/*.png`, `${out}/${key}-sheet.png`, 3, 0.5);
  }
  await openNative(page, 'axial');
  {
    const before = await nativeState(page),
      assembly = before.document.assemblies[0];
    const mouth = await markCenter(page, assembly.internalJoint);
    const axis = await page.locator(`[data-mark-id="${assembly.internalJoint}"]`).evaluate((el) => {
      const m = el.getScreenCTM();
      return { x: m.a / Math.hypot(m.a, m.b), y: m.b / Math.hypot(m.a, m.b) };
    });
    const film = filmstrip(page, `${out}/stop-return`);
    await page.mouse.move(mouth.x, mouth.y);
    await page.mouse.down();
    await film.shot('grip');
    for (const distance of [50, 100, 150, 200, 250, 300]) {
      await page.mouse.move(mouth.x + axis.x * distance, mouth.y + axis.y * distance);
      await film.shot(`out-${distance}`);
    }
    const stopped = await nativeState(page);
    check('A P drag names the refused continuation at a travel stop', stopped.message.length > 0);
    check('A draft at a stop has not written history', stopped.history === before.history);
    for (const distance of [200, 100, 30]) {
      await page.mouse.move(mouth.x + axis.x * distance, mouth.y + axis.y * distance);
      await film.shot(`back-${distance}`);
    }
    await page.mouse.up();
    await film.shot('release');
    const returned = await nativeState(page);
    check(
      'Reentering the travel range resumes the same gesture',
      returned.history === before.history + 1 && returned.message === ''
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    check(
      'A clamped-and-returned gesture undoes completely',
      JSON.stringify((await nativeState(page)).document) === JSON.stringify(before.document)
    );
    await contactSheet(`${out}/stop-return/*.png`, `${out}/stop-return-sheet.png`, 3, 0.5);
  }
  await openNative(page, 'welded-axial');
  const original = await nativeState(page),
    assembly = original.document.assemblies[0];
  for (const mount of [assembly.barrelMount, assembly.rodMount]) {
    const joint = original.document.joints.find(
      (j) => j.kind === 'weld' && [j.frameA.attachmentId, j.frameB.attachmentId].includes(mount)
    );
    assert.ok(joint, 'Both cylinder mounts have explicit weld edges');
    const point = await bodyCenter(page, assembly.barrel),
      film = filmstrip(page, `${out}/mount-${mount}`);
    await page.mouse.click(point.x, point.y);
    const section = page.getByRole('button', { name: 'Connection', exact: true });
    if (!(await section.locator('mat-icon.rotate180').count())) await section.click();
    await page.getByRole('combobox', { name: 'Connection Pair' }).selectOption(joint.id);
    await film.shot('pair');
    await page.getByRole('button', { name: 'Revolute', exact: true }).click();
    check(
      'The mount changes to a revolute without deleting material',
      (await nativeState(page)).document.joints.find((j) => j.id === joint.id)?.kind ===
        'revolute' &&
        (await nativeState(page)).document.bodies.length === original.document.bodies.length
    );
    await film.shot('unweld');
    await page.getByRole('button', { name: 'Weld', exact: true }).click();
    await film.shot('reweld');
    check(
      'The same mount can be welded again',
      (await nativeState(page)).document.joints.find((j) => j.id === joint.id)?.kind === 'weld'
    );
    await contactSheet(`${out}/mount-${mount}/*.png`, `${out}/mount-${mount}-sheet.png`, 3, 0.5);
  }
  await openNative(page, 'multiway');
  const before = await nativeState(page),
    body = before.document.bodies.filter((b) => b.kind === 'material')[1],
    point = await bodyCenter(page, body.id);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('menuitem', { name: /^Force$/ }).click();
  const withForce = await nativeState(page),
    force = withForce.document.forces[0];
  check('Context-menu force ownership follows the clicked member', force.bodyId === body.id);
  const handles = page.locator(`[data-force-id="${force.id}"] .force-handle`),
    box = await handles.last().boundingBox();
  const film = filmstrip(page, `${out}/force`);
  await drag(
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2 + 20, y: box.y + box.height / 2 - 35 },
    film
  );
  const turned = (await nativeState(page)).document.forces[0];
  check(
    'Turning a force handle keeps force magnitude and material ownership',
    Math.abs(Math.hypot(turned.vector.x, turned.vector.y) - 10) < 1e-8 &&
      turned.bodyId === body.id &&
      Math.abs(turned.vector.y) > 0.1
  );
  await contactSheet(`${out}/force/*.png`, `${out}/force-sheet.png`, 3, 0.5);
  check('No browser errors', errors.length === 0);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await page.screenshot({ path: `${out}/last.png` });
  await browser.close();
}
