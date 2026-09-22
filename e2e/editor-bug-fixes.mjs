/** Regression checks for the editor bug collection stacked on Split Joint. */
import { mkdirSync, readFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/editor-bug-fixes';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('tutorialSeen', '1');
  localStorage.setItem('whatsNewSeen', '2026.09');
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const results = [];
function check(label, ok, details) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' ' + JSON.stringify(details)}`);
}
const grid = (fn, arg) =>
  page.evaluate(
    ({ source, arg }) => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      return new Function('g', 'arg', `return (${source})(g, arg)`)(g, arg);
    },
    { source: fn.toString(), arg }
  );
const load = (payload = TEMPLATE_LINKAGES['4-Bar']) => openMechanism(page, `${BASE}/?${payload}`);
const fixture = (name) => {
  const line = readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .find((line) => line.includes(`[${name}](`));
  if (!line) throw new Error(`Missing published fixture ${name}`);
  return line.match(/\]\(https?:\/\/[^?]+\?([^)]*)/)[1];
};
const point = (id) =>
  grid((g, id) => {
    const j = g.mechanismSrv.joints.find((j) => j.id === id);
    const p = g.svgGrid.modelToScreen(j);
    return { x: p.x, y: p.y };
  }, id);
const menu = async (at, label) => {
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.locator('#contextMenu').waitFor({ state: 'visible' });
  await page
    .locator('.cm-row')
    .filter({ has: page.locator('.cm-row__label', { hasText: new RegExp(`^${label}$`) }) })
    .click();
};
try {
  await load();
  await page.locator('#joint_B').click();
  check(
    'binary bars omit Distance to Joints',
    !(await page.getByRole('button', { name: 'Distance to Joints', exact: true }).count())
  );
  const input = page.getByRole('textbox', { name: 'Joint Position X', exact: true });
  const before = await grid((g) => g.mechanismSrv.joints.find((j) => j.id === 'B').x);
  const box = await page
    .locator('dual-input-block')
    .filter({ has: input })
    .locator('.number-drag-label')
    .first()
    .boundingBox();
  const film = filmstrip(page, `${OUT}/number-drag`, { x: 0, y: 65, width: 700, height: 520 });
  await film.shot('before');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await film.during(35, 8, 'drag', async () => {
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 5);
      await page.waitForTimeout(45);
    }
    await page.mouse.up();
  });
  await film.shot('released');
  const after = await grid((g) => g.mechanismSrv.joints.find((j) => j.id === 'B').x);
  check('dragging a label changes the model on release', after > before, {
    before,
    after,
    text: await input.inputValue(),
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = await grid((g) => g.mechanismSrv.joints.find((j) => j.id === 'B').x);
  check('one undo restores the whole numeric drag', Math.abs(undone - before) < 0.001, {
    before,
    undone,
  });
  await contactSheet(`${OUT}/number-drag/*.png`, `${OUT}/number-drag.png`, 4, 0.65);

  await load();
  await grid((g) => {
    const bar = g.mechanismSrv.links.find((l) => l.id === 'BC');
    const start = bar.CoM.clone();
    const end = start.clone();
    end.y += 150;
    g.mechanismSrv.createForce(start, end, bar);
  });
  const forceBefore = await grid((g) => {
    const f = g.mechanismSrv.forces[0];
    const p = g.svgGrid.modelToScreen({
      x: (f.startCoord.x + f.endCoord.x) / 2,
      y: (f.startCoord.y + f.endCoord.y) / 2,
    });
    return {
      start: [f.startCoord.x, f.startCoord.y],
      end: [f.endCoord.x, f.endCoord.y],
      fy: f.yComp,
      at: { x: p.x, y: p.y },
    };
  });
  await menu(forceBefore.at, 'Flip Force');
  const forceAfter = await grid((g) => {
    const f = g.mechanismSrv.forces[0];
    return {
      start: [f.startCoord.x, f.startCoord.y],
      end: [f.endCoord.x, f.endCoord.y],
      fy: f.yComp,
      outward: f.arrowOutward,
    };
  });
  check(
    'Flip Force swaps its marks and reverses its vector in place',
    !forceAfter.outward &&
      Math.abs(forceAfter.fy + forceBefore.fy) < 1e-7 &&
      forceAfter.start.every((v, i) => Math.abs(v - forceBefore.start[i]) < 1e-7) &&
      forceAfter.end.every((v, i) => Math.abs(v - forceBefore.end[i]) < 1e-7),
    { forceBefore, forceAfter }
  );
  await page.screenshot({ path: `${OUT}/flipped-force.png` });

  await load(fixture('Bell crank'));
  const bodyPoint = await grid((g) => {
    const root = g.mechanismSrv.links.find((l) => l.id === 'CDE');
    const leaf = root.subset.find((l) => l.id === 'CD');
    const p = g.svgGrid.modelToScreen(leaf.CoM);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(bodyPoint.x, bodyPoint.y);
  check(
    'first click selects the compound',
    await grid((g) => g.activeObjService.selectedLink.id === 'CDE')
  );
  await page.mouse.click(bodyPoint.x, bodyPoint.y);
  check(
    'second click selects the primitive under the pointer',
    await grid((g) => g.activeObjService.selectedLink.id === 'CD')
  );
  check(
    'compound settings and Unweld All are absent',
    !(await page.getByText('Compound Link Settings', { exact: true }).count()) &&
      !(await page.getByRole('button', { name: /Un.?weld All/i }).count())
  );
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  check(
    'the first link graph starts expanded',
    (await page.locator('.graphHeader').first().getAttribute('aria-expanded')) === 'true'
  );
  await page.locator('app-view-button[data-switch="traces"] button').click();
  check(
    'a massless primitive link has a CoM path and mark',
    await grid((g) => {
      const link = g.activeObjService.selectedLink;
      return (
        link.mass === 0 &&
        g.linkTraces.paths(g.mechanismSrv).some((t) => t.id === link.id && t.d.length > 30) &&
        g.showsCoM(link)
      );
    })
  );
  await page.screenshot({ path: `${OUT}/link-trace.png` });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#joint_D').click();
  check(
    'a grounded welded joint offers Add Input',
    await page.getByRole('button', { name: 'Add Input', exact: true }).isEnabled()
  );
  await page.getByRole('button', { name: 'Add Input', exact: true }).click();
  check(
    'the welded input remains grounded, welded, and solves',
    await grid((g) => {
      const j = g.mechanismSrv.joints.find((j) => j.id === 'D');
      return j.ground && j.isWelded && j.input && g.mechanismSrv.oneValidMechanismExists();
    })
  );

  const weldedPayload = readFileSync(
    'src/test-utils/verification/welded-cylinder-fixtures.ts',
    'utf8'
  ).match(/WELDED_BRACKET_PAYLOAD[^']*'([^']+)'/)[1];
  await load(weldedPayload);
  const member = await grid((g) => {
    const c = g.mechanismSrv.sealedStructures()[0];
    const p = g.svgGrid.modelToScreen({
      x: (c.mountA.x + c.seal.x) / 2,
      y: (c.mountA.y + c.seal.y) / 2,
    });
    return { x: p.x, y: p.y, root: c.barrelRoot.id, leaf: c.barrel.id };
  });
  await page.mouse.click(member.x, member.y);
  check(
    'a welded cylinder first selects its whole body',
    await grid((g, id) => g.activeObjService.selectedLink.id === id, member.root)
  );
  await page.mouse.click(member.x, member.y);
  check(
    'a welded cylinder second selects its barrel primitive',
    await grid((g, id) => g.activeObjService.selectedLink.id === id, member.leaf)
  );

  check(
    'selected cylinder primitive uses its skin for the yellow outline',
    await page
      .locator('#primitiveSelection path')
      .evaluate((el) => el.getAttribute('d').length > 10 && getComputedStyle(el).stroke !== 'none')
  );
  await page.screenshot({ path: `${OUT}/cylinder-primitive-selection.png` });

  await load(fixture('Two four-bars'));
  await grid((g) => {
    g.mechanismSrv.joints.find((j) => j.id === 'E').input = false;
    g.mechanismSrv.updateMechanism();
  });
  await page.locator('#joint_B').click();
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  const positions = await grid((g) => g.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]));
  const inert = await point('F');
  check(
    'an inert joint uses the default cursor',
    (await page
      .locator('#joint_F')
      .evaluate((el) => getComputedStyle(el.closest('svg')).cursor)) === 'default'
  );
  await page.mouse.move(inert.x, inert.y);
  await page.mouse.down();
  await page.mouse.move(inert.x + 45, inert.y + 35, { steps: 8 });
  await page.mouse.up();
  const untouched = await grid((g) => g.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]));
  check(
    'dragging an inert joint moves no joint',
    JSON.stringify(positions) === JSON.stringify(untouched)
  );
  await page.screenshot({ path: `${OUT}/inert-joint.png` });

  await load();
  const start = { x: 900, y: 600 };
  await menu(start, 'Link');
  const onto = await point('C');
  await page.mouse.move(onto.x, onto.y, { steps: 8 });
  check(
    'placement on a joint previews the yellow merge ring',
    (await page.locator('.snapTarget').count()) === 1
  );
  const mergeFilm = filmstrip(page, `${OUT}/placement-merge`);
  await mergeFilm.shot('preview');
  await mergeFilm.during(25, 8, 'merge', async () => {
    await page.mouse.click(onto.x, onto.y);
    check(
      'placement plays the existing joint merge animation',
      (await page.locator('.jointPop').count()) > 0
    );
  });
  check(
    'placing the link reuses the joint',
    await grid((g) => g.mechanismSrv.joints.length === 5 && g.mechanismSrv.links.length === 4)
  );
  await contactSheet(`${OUT}/placement-merge/*.png`, `${OUT}/placement-merge.png`, 3, 0.4);

  await page.setViewportSize({ width: 480, height: 900 });
  await load();
  await grid((g) => {
    g.mechanismSrv.joints.forEach((j) => (j.input = false));
    g.mechanismSrv.updateMechanism();
  });
  await page.getByRole('button', { name: 'Project menu' }).click();
  check(
    'Export Data is disabled in the narrow hamburger menu without analysis',
    await page.getByRole('button', { name: /Export Data/i, exact: true }).isDisabled()
  );
  await page.screenshot({ path: `${OUT}/narrow-export.png` });
  await page.keyboard.press('Escape');
  check(
    'the setup sentence uses input',
    (await page.locator('app-playback-bar').innerText()).includes(
      'Ground a joint and set one joint as an input.'
    )
  );
  check('no runtime errors', errors.length === 0, errors);
} catch (error) {
  check('suite completed', false, String(error));
  await page.screenshot({ path: `${OUT}/failure.png` });
} finally {
  await browser.close();
}
process.exitCode = results.every(Boolean) ? 0 : 1;
