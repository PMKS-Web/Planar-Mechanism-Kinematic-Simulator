/** Choosing groups through the real Edit panel, including both kinds of slider. */
import { readFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism, waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/split-joint-selection';
mkdirSync(OUT, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const example = (name) => {
  const row = gallery.split('\n').find((line) => line.startsWith(`| [${name}](`));
  if (!row) throw new Error('Published example missing: ' + name);
  return BASE + new URL(row.slice(row.indexOf('](') + 2, row.indexOf(') |'))).search;
};
const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(detail)}`);
};
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await startQuiet(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const state = () =>
    page.evaluate(() => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      return {
        joints: grid.mechanismSrv.joints.map((one) => ({
          id: one.id,
          x: one.x,
          y: one.y,
          kind: one.constructor.name,
          ground: one.ground,
          rotates: one.rotates,
          floating: one.isFloating,
          dangling: one.isDangling,
          carrier: one.carrier?.id,
          links: one.links.map((link) => link.id).sort(),
        })),
        links: grid.mechanismSrv.links.map((link) => link.id).sort(),
      };
    });
  const open = async (name) => {
    await openMechanism(page, example(name));
    await page.locator('#joint_B').click();
    await page.getByRole('button', { name: 'Split Joint', exact: true }).click();
    await page.locator('app-split-joint').waitFor();
  };
  const panel = page.locator('app-split-joint');
  const apply = panel.getByRole('button', { name: 'Separate', exact: true });
  const joint = (snapshot, id) => snapshot.joints.find((one) => one.id === id);

  await open('Split a three-link joint');
  const draft = await state();
  check(
    'opening the checklist leaves all three links on B',
    joint(draft, 'B').links.length === 3,
    draft
  );
  await panel.getByRole('checkbox', { name: 'Link BD', exact: true }).uncheck();
  check(
    'an empty selection refuses Separate with a visible reason',
    (await apply.isDisabled()) && (await panel.innerText()).includes('Choose at least one link'),
    null
  );
  for (const name of ['AB', 'BC', 'BD'])
    await panel.getByRole('checkbox', { name: 'Link ' + name, exact: true }).check();
  check(
    'selecting everything explains Separate All',
    (await apply.isDisabled()) && (await panel.innerText()).includes('Separate All'),
    null
  );
  await panel.getByRole('checkbox', { name: 'Link AB', exact: true }).uncheck();
  await panel.getByRole('checkbox', { name: 'Link BC', exact: true }).uncheck();
  await page.screenshot({ path: `${OUT}/three-links-chooser.png` });
  await apply.click();
  let result = await state();
  check(
    'Separate keeps AB and BC at B and gives BD a new pin E',
    JSON.stringify(joint(result, 'B').links) === JSON.stringify(['AB', 'BC']) &&
      JSON.stringify(joint(result, 'E').links) === JSON.stringify(['DE']),
    result
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForReady(page);
  result = await state();
  check(
    'one Undo restores all three links and removes E',
    joint(result, 'B').links.length === 3 && !joint(result, 'E'),
    result
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitForReady(page);
  result = await state();
  check(
    'Redo restores the chosen partition',
    joint(result, 'B').links.length === 2 && !!joint(result, 'E'),
    result
  );
  const beforeDrag = result;
  const film = filmstrip(page, `${OUT}/independent-drag`);
  await film.shot('before');
  const pinBox = await page.locator('#joint_E').boundingBox();
  await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2);
  await page.mouse.down();
  await film.shot('take-hold');
  await film.during(50, 5, 'moving', () =>
    page.mouse.move(pinBox.x + pinBox.width / 2 + 80, pinBox.y + pinBox.height / 2 + 65, {
      steps: 20,
    })
  );
  await page.mouse.up();
  await film.shot('released');
  result = await state();
  check(
    'the new pin drags independently of the retained joint',
    joint(beforeDrag, 'B').x === joint(result, 'B').x &&
      joint(beforeDrag, 'B').y === joint(result, 'B').y &&
      Math.hypot(
        joint(beforeDrag, 'E').x - joint(result, 'E').x,
        joint(beforeDrag, 'E').y - joint(result, 'E').y
      ) > 0.01,
    result
  );

  await open('Split a four-link joint into groups');
  await panel.getByRole('checkbox', { name: 'Link BD', exact: true }).check();
  await page.screenshot({ path: `${OUT}/four-links-group.png` });
  await apply.click();
  result = await state();
  check(
    'two chosen links share a single new Revolute pin',
    result.joints.length === 6 &&
      JSON.stringify(joint(result, 'F').links) === JSON.stringify(['DF', 'EF']) &&
      joint(result, 'B').links.length === 2,
    result
  );

  for (const [name, rotates, grounded, dangling = false] of [
    ['Split links off a pin-in-slot joint', true, false],
    ['Split links off a prismatic joint', false, false],
    ['Split links off a grounded prismatic joint', false, true],
    ['Split a detached pin-in-slot joint', true, false, true],
    ['Split a detached prismatic joint', false, false, true],
  ]) {
    await open(name);
    const before = await state();
    check(
      name + ': both riders can be chosen',
      (await panel.getByRole('checkbox').count()) === 2,
      await panel.innerText()
    );
    const tag = `${dangling ? 'detached-' : ''}${rotates ? 'pin-in-slot' : grounded ? 'grounded-prismatic' : 'prismatic'}`;
    await page.screenshot({ path: `${OUT}/${tag}-chooser.png`, animations: 'disabled' });
    await apply.click();
    result = await state();
    const kept = joint(result, 'B');
    const created = result.joints.find((one) => !before.joints.some((old) => old.id === one.id));
    check(
      name + ': the retained joint keeps its type, slot state and position',
      kept.kind === 'PrisJoint' &&
        kept.rotates === rotates &&
        kept.ground === grounded &&
        kept.floating === (!grounded && !dangling) &&
        kept.dangling === dangling &&
        kept.x === joint(before, 'B').x &&
        kept.y === joint(before, 'B').y &&
        kept.links.length === 1,
      result
    );
    check(
      name + ': the detached body receives a free Revolute pin',
      created?.kind === 'RevJoint' && !created.ground && created.links.length === 1,
      created
    );
    await page.screenshot({ path: `${OUT}/${tag}-after.png`, animations: 'disabled' });
    if (dangling) {
      const split = page.getByRole('button', { name: 'Split Joint', exact: true });
      check(
        name + ': one remaining link uses the ordinary one-link refusal',
        (await split.isDisabled()) &&
          (await split.getAttribute('aria-description')) ===
            'Only one link is on this joint, so there is nothing to split.',
        await split.getAttribute('aria-description')
      );
      await page.locator('#joint_B').click({ button: 'right' });
      const row = page.locator('#contextMenu .cm-row').filter({ hasText: 'Split Joint' });
      check(
        name + ': the menu says needs 2 links',
        (await row.innerText()).includes('needs 2 links'),
        await row.innerText()
      );
      await page.screenshot({ path: `${OUT}/${tag}-needs-two-links.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await waitForReady(page);
    result = await state();
    check(
      name + ': one Undo restores the original slider assembly',
      JSON.stringify(result.links) === JSON.stringify(before.links) &&
        result.joints.length === before.joints.length,
      result
    );
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await waitForReady(page);
    result = await state();
    check(
      name + ': Redo preserves the retained slider',
      joint(result, 'B').kind === 'PrisJoint' &&
        joint(result, 'B').rotates === rotates &&
        result.joints.length === before.joints.length + 1,
      result
    );
  }

  await open('Split links off a prismatic joint');
  await panel.getByRole('button', { name: 'Slot Carrier', exact: true }).click();
  check(
    'disconnecting the guide is explicit and explains the missing guide',
    (await panel.innerText()).includes('need a new slot'),
    await panel.innerText()
  );
  await panel.getByRole('button', { name: 'Disconnect Guide', exact: true }).click();
  result = await state();
  check(
    'Disconnect Guide preserves the slider and adds no pin',
    joint(result, 'B').dangling && result.joints.length === 5,
    result
  );

  await open('Split a three-link joint');
  const beforeCancel = await state();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  check(
    'Cancel leaves the drawing unchanged',
    JSON.stringify(await state()) === JSON.stringify(beforeCancel),
    null
  );
  await page.locator('#joint_B').click({ button: 'right' });
  await page.locator('#contextMenu').getByText('Split Joint', { exact: true }).click();
  check('the right-click action opens the same chooser', await panel.isVisible(), null);
  await panel.getByRole('button', { name: 'Separate All', exact: true }).click();
  result = await state();
  check(
    'Separate All remains available for ordinary pins',
    result.joints.filter((one) => one.links.length === 1).length === 6,
    result
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await open('Split links off a prismatic joint');
  await apply.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/phone.png` });
  const phoneBox = await apply.boundingBox();
  check(
    'the chooser action fits the phone sheet',
    phoneBox.x >= 0 &&
      phoneBox.x + phoneBox.width <= 390 &&
      phoneBox.y >= 0 &&
      phoneBox.y + phoneBox.height <= 844,
    phoneBox
  );
  await apply.click();
  result = await state();
  check(
    'phone Separate preserves the prismatic joint',
    joint(result, 'B').kind === 'PrisJoint' &&
      joint(result, 'B').rotates === false &&
      result.joints.length === 6,
    result
  );
  check('nothing threw', errors.length === 0, errors);
} finally {
  await browser.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
if (checks.some((ok) => !ok)) process.exitCode = 1;
