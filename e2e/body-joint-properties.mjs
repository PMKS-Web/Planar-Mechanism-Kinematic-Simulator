import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, bodyCenter, markCenter } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const out = 'artifacts/bodies-and-joints/S5/properties';
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
  for (const kind of ['Link', 'Cylinder'])
    for (const origin of ['grid', 'body', 'joint']) {
      await openNative(page, 'multiway');
      const before = await nativeState(page);
      const member = before.document.bodies.filter((b) => b.kind === 'material')[1];
      const from =
        origin === 'grid'
          ? { x: 920, y: 580 }
          : origin === 'body'
            ? await bodyCenter(page, member.id)
            : await markCenter(page, before.document.joints[0].id);
      await page.mouse.click(from.x, from.y, { button: 'right' });
      await page.getByRole('menuitem', { name: new RegExp(`^${kind}$`) }).click();
      const film = filmstrip(page, `${out}/${kind}-${origin}`);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await film.shot('grip');
      for (let i = 1; i <= 4; i++) {
        await page.mouse.move(
          from.x + ((1100 - from.x) * i) / 4,
          from.y + ((650 - from.y) * i) / 4
        );
        await film.shot(`drag-${i}`);
      }
      await page.mouse.up();
      await film.shot('release');
      const after = await nativeState(page);
      check(
        `${kind} from ${origin} is one complete creation`,
        after.history === before.history + 1 &&
          after.document.bodies.length === before.document.bodies.length + (kind === 'Link' ? 1 : 2)
      );
      if (origin !== 'grid')
        check(
          `${kind} attaches to the actual hit member`,
          after.document.joints.length === before.document.joints.length + (kind === 'Link' ? 1 : 2)
        );
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      check(
        `${kind} from ${origin} undoes without changing its neighbors`,
        JSON.stringify((await nativeState(page)).document) === JSON.stringify(before.document)
      );
      await contactSheet(
        `${out}/${kind}-${origin}/*.png`,
        `${out}/${kind}-${origin}-sheet.png`,
        3,
        0.5
      );
    }
  await openNative(page, 'multiway');
  const before = await nativeState(page),
    members = before.document.bodies.filter((b) => b.kind === 'material').slice(0, 2);
  for (const b of members) {
    const p = await bodyCenter(page, b.id);
    await page.keyboard.down('Shift');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up('Shift');
  }
  const mass = page.getByRole('textbox', { name: 'Mass Each', exact: true });
  const film = filmstrip(page, `${out}/bulk`);
  await film.shot('selected');
  await mass.fill('2');
  await mass.press('Tab');
  await film.shot('accepted');
  const changed = await nativeState(page);
  check(
    'Bulk mass writes every selected material in one history entry',
    changed.history === before.history + 1 &&
      members.every((m) => changed.document.bodies.find((b) => b.id === m.id).mass.mass.value === 2)
  );
  await mass.fill('-1');
  await mass.press('Tab');
  await film.shot('refused');
  const refused = await nativeState(page);
  check(
    'Invalid bulk mass changes no selected member and writes no history',
    JSON.stringify(refused.document) === JSON.stringify(changed.document) &&
      refused.history === changed.history &&
      refused.message.length > 0
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await film.shot('undo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await film.shot('redo');
  await contactSheet(`${out}/bulk/*.png`, `${out}/bulk-sheet.png`, 3, 0.5);
  check('No browser errors', errors.length === 0);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await page.screenshot({ path: `${out}/last.png` });
  await browser.close();
}
