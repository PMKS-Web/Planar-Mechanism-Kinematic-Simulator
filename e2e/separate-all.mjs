/** Separate All is an action: one activation, one history entry, one pin per link. */
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism, waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/separate-all';
mkdirSync(OUT, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const urlFor = (name) => {
  const row = gallery.split('\n').find((line) => line.startsWith(`| [${name}](`));
  if (!row) throw new Error('Published example missing: ' + name);
  return BASE + new URL(row.slice(row.indexOf('](') + 2, row.indexOf(') |'))).search;
};
const checks = [];
const check = (label, ok, detail) => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ': ' + JSON.stringify(detail)}`);
};
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  await startQuiet(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const state = () =>
    page.evaluate(() => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      return {
        joints: grid.mechanismSrv.joints.map((joint) => ({
          id: joint.id,
          kind: joint.constructor.name,
          x: joint.x,
          y: joint.y,
          links: joint.links.map((link) => link.id).sort(),
        })),
        links: grid.mechanismSrv.links.map((link) => ({
          id: link.id,
          joints: link.joints.map((joint) => joint.id),
        })),
      };
    });
  for (const [tag, name, count, phone, keyboard] of [
    ['three-links', 'Split a three-link joint', 3, false, false],
    ['four-links-keyboard', 'Split a four-link joint into groups', 4, false, true],
    ['phone', 'Split a three-link joint', 3, true, false],
  ]) {
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 980 });
    await openMechanism(page, urlFor(name));
    const before = await state();
    await page.locator('#joint_B').click();
    await page.getByRole('button', { name: 'Split Joint', exact: true }).click();
    const panel = page.locator('app-split-joint');
    const all = panel.getByRole('button', { name: 'Separate All', exact: true });
    // The action should ignore the current group selection, even when it is empty.
    for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.uncheck();
    await all.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${tag}-before.png`, animations: 'disabled' });
    const film = filmstrip(page, `${OUT}/${tag}-activation`);
    await film.during(40, 5, 'activate', async () => {
      if (keyboard) {
        await all.focus();
        await page.keyboard.press('Enter');
      } else await all.click();
    });
    await waitForReady(page);
    const result = await state();
    const separated =
      result.joints.length === count * 2 &&
      result.joints.every((joint) => joint.links.length === 1);
    check(`${tag}: one activation gives every link its own pin`, separated, result);
    check(
      `${tag}: the chooser closes without requiring Separate`,
      (await panel.count()) === 0,
      await panel.count()
    );
    await page.screenshot({ path: `${OUT}/${tag}-after.png`, animations: 'disabled' });
    if (!separated) continue;
    const pins = result.joints.filter(
      (joint) => joint.id === 'B' || !before.joints.some((old) => old.id === joint.id)
    );
    check(
      `${tag}: every released pin has a distinct position`,
      new Set(pins.map((joint) => `${joint.x},${joint.y}`)).size === count,
      pins
    );
    const boxes = await Promise.all(
      pins.map((pin) => page.locator(`#joint_${pin.id}`).boundingBox())
    );
    check(
      `${tag}: released pin targets do not overlap`,
      boxes.every((a, index) =>
        boxes
          .slice(index + 1)
          .every(
            (b) =>
              a &&
              b &&
              (a.x + a.width <= b.x ||
                b.x + b.width <= a.x ||
                a.y + a.height <= b.y ||
                b.y + b.height <= a.y)
          )
      ),
      boxes
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await waitForReady(page);
    const undone = await state();
    check(
      `${tag}: one Undo restores the shared joint`,
      JSON.stringify(undone.links) === JSON.stringify(before.links) &&
        undone.joints.length === before.joints.length,
      undone
    );
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await waitForReady(page);
    const redone = await state();
    check(
      `${tag}: Redo restores every independent pin`,
      redone.joints.length === count * 2 &&
        redone.joints.every((joint) => joint.links.length === 1),
      redone
    );
    if (tag === 'three-links') {
      const pin = pins[pins.length - 1];
      const box = await page.locator(`#joint_${pin.id}`).boundingBox();
      const drag = filmstrip(page, `${OUT}/independent-drag`);
      await drag.shot('before');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await drag.shot('take-hold');
      await drag.during(40, 5, 'moving', () =>
        page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 70, { steps: 20 })
      );
      await page.mouse.up();
      await drag.shot('released');
      const dragged = await state();
      check(
        'dragging one released pin leaves every other pin in place',
        redone.joints.every((old) => {
          const now = dragged.joints.find((joint) => joint.id === old.id);
          const distance = Math.hypot(now.x - old.x, now.y - old.y);
          return now.kind === old.kind && (old.id === pin.id ? distance > 1 : distance < 1e-8);
        }),
        dragged
      );
    }
  }
  check('nothing threw', errors.length === 0, errors);
} finally {
  await browser.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
if (checks.some((ok) => !ok)) process.exitCode = 1;
