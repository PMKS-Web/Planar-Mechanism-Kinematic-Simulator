/** Paused context-menu attachments and property edits preserve the authored start pose. */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/posed-menu/browser';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(String(error)));
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(detail)}`);
};
const snapshot = (target = page) =>
  target.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const points = (joints) => Object.fromEntries(joints.map((j) => [j.id, [j.x, j.y]]));
    return {
      pose: points(m.joints),
      start: points(m.mechanisms.flatMap((one) => one.joints[0] ?? [])),
      seconds: m.mechanisms.map((_, i) => m.secondsOf(i)),
      links: m.links.map((l) => ({ id: l.id, hold: l.hold, disc: l.isCircle })),
      locked: m.joints.filter((j) => j.locked).map((j) => j.id),
      forces: m.forces.map((f) => ({
        id: f.id,
        local: f.local,
        mag: f.mag,
        angle: f.angleRad,
        start: [f.startCoord.x, f.startCoord.y],
        end: [f.endCoord.x, f.endCoord.y],
      })),
    };
  });
const distance = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity);
const drift = (before, after) =>
  Math.max(0, ...Object.entries(before).map(([id, point]) => distance(point, after[id])));
const preserves = (name, before, after) => {
  const measured = {
    start: drift(before.start, after.start),
    pose: drift(before.pose, after.pose),
    seconds: Math.max(...before.seconds.map((t, i) => Math.abs(t - after.seconds[i]))),
  };
  check(
    `${name}: authored coordinates, paused pose and clocks preserved`,
    measured.start < 1e-8 && measured.pose < 0.002 && measured.seconds < 1e-8,
    measured
  );
};
const row = (label) =>
  page.locator('.cm-row').filter({
    has: page.locator('.cm-row__label', { hasText: new RegExp('^' + label + '$') }),
  });
const rowState = (label) =>
  row(label).evaluate((node) => ({
    disabled: node.classList.contains('cm-row--off'),
    checked: node.classList.contains('cm-row--on'),
    reason: node.querySelector('.cm-row__reason')?.textContent.trim(),
  }));
const screenPoint = (a, b = a, fraction = 0) =>
  page.evaluate(
    ({ a, b, fraction }) => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const first = g.mechanismSrv.joints.find((j) => j.id === a);
      const second = g.mechanismSrv.joints.find((j) => j.id === b);
      const model = {
        x: first.x + fraction * (second.x - first.x),
        y: first.y + fraction * (second.y - first.y),
      };
      const screen = g.svgGrid.modelToScreen(model);
      return { x: screen.x, y: screen.y, model: [model.x, model.y] };
    },
    { a, b, fraction }
  );
const openAt = async (point) => {
  await page.keyboard.down('Alt');
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.keyboard.up('Alt');
  await page.locator('#contextMenu.show').waitFor();
};
const openLink = async (a = 'B', b = 'C') => {
  const point = await screenPoint(a, b, 0.45);
  await openAt(point);
  // MouseEvent coordinates are integer CSS pixels; use the event the app
  // received, not the fractional screen coordinate requested by Playwright.
  point.model = await page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const p = g.svgGrid.screenToModel(g.lastRightClickCoord);
    return [p.x, p.y];
  });
  return point;
};
const clickEnabled = async (label) => {
  const state = await rowState(label);
  check(`${label}: enabled while paused`, !state.disabled, state);
  if (state.disabled) {
    await page.keyboard.press('Escape');
    return false;
  }
  await row(label).click();
  await page.waitForTimeout(120);
  return true;
};
const loadPaused = async () => {
  await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  // The library four-bar is massless; give Force Analysis something to solve
  // so its tab opens rather than showing a setup drawer in Kinematic mode.
  await page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    g.mechanismSrv.links.forEach((link) => g.mechanismSrv.assignBodyMass(link, 1));
    g.settings.isGravity.next(true);
    g.mechanismSrv.updateMechanism(false);
  });
  await page.locator('.tabButton').filter({ hasText: 'Kinematic Analysis' }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    m.seekMechanism(0, m.mechanisms[0].cyclePeriod / 4);
  });
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await page.waitForTimeout(500);
};
const roundtrip = async (name, before) => {
  const query = await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
  );
  preserves(`${name} URL encoding`, before, await snapshot());
  const reopened = await context.newPage();
  reopened.on('pageerror', (error) => errors.push(String(error)));
  await openMechanism(reopened, `${BASE}/?${query}`);
  const after = await snapshot(reopened);
  check(
    `${name}: URL restores existing authored coordinates`,
    drift(
      Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [id, before.start[id]])),
      after.start
    ) < 1e-8,
    { before: before.start, after: after.start }
  );
  await reopened.close();
  return after;
};
const section = async (name, work) => {
  if (process.env.PMKS_ONLY && process.env.PMKS_ONLY !== name) return;
  try {
    await work();
  } catch (error) {
    check(`${name}: completed`, false, String(error));
    await page.screenshot({ path: `${OUT}/${name}-failure.png` }).catch(() => {});
  }
};

await section('tracer', async () => {
  await loadPaused();
  const before = await snapshot();
  const point = await openLink();
  const deletion = page
    .locator('.cm-row')
    .filter({ has: page.locator('.cm-row__label', { hasText: /^Delete Link/ }) });
  check(
    'constraint-bearing link deletion stays disabled away from start',
    await deletion.evaluate((node) => node.classList.contains('cm-row--off'))
  );
  await deletion.click({ force: true });
  preserves('disabled destructive click', before, await snapshot());
  if (!(await clickEnabled('Tracer Point'))) return;
  const after = await snapshot();
  const tracer = Object.keys(after.pose).find((id) => !(id in before.pose));
  check(
    'tracer was attached at the pointer',
    !!tracer && distance(after.pose[tracer], point.model) < 0.002,
    { tracer, point: point.model, pose: after.pose[tracer] }
  );
  preserves('tracer attachment', before, after);
  const decoded = await roundtrip('tracer', after);
  check('tracer survives URL roundtrip on its body', Object.keys(decoded.pose).length === 5);
  await page.screenshot({ path: `${OUT}/tracer-paused.png` });
  if (!tracer) return;
  await openAt(await screenPoint(tracer));
  const deleteLabel = await page
    .locator('.cm-row__label')
    .filter({ hasText: /^Delete Joint/ })
    .innerText();
  if (!(await clickEnabled(deleteLabel))) return;
  const removed = await snapshot();
  check(
    'body-only tracer deletion removes just that point',
    !(tracer in removed.pose) && Object.keys(removed.pose).length === 4
  );
  preserves('tracer deletion', before, removed);
});

await section('force', async () => {
  await loadPaused();
  const before = await snapshot();
  const point = await openLink();
  if (!(await clickEnabled('Force'))) return;
  const film = filmstrip(page, `${OUT}/force-creation`);
  await film.shot('preview-start');
  await film.during(25, 7, 'placing', async () => {
    await page.mouse.move(point.x + 95, point.y - 85, { steps: 8 });
    await page.mouse.click(point.x + 95, point.y - 85);
  });
  console.log(
    await contactSheet(
      `${OUT}/force-creation/*.png`,
      `${OUT}/force-creation-filmstrip.png`,
      3,
      0.45
    )
  );
  const added = await snapshot();
  const gesture = await page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const source = g.mouseDownNow.toString();
    const at = source.indexOf('createCylinder');
    return {
      grid: g.dragState.grid,
      force: g.dragState.force,
      ghost: !!g.forceGhost,
      on: g.forceCreateOn?.id,
      last: g.lastLeftClickType,
      source: source.slice(at, at + 900),
    };
  });
  check('pointer gesture creates one force in Analysis', added.forces.length === 1, {
    forces: added.forces,
    gesture,
  });
  preserves('force attachment', before, added);
  if (added.forces.length !== 1) return;
  const [b, c] = [before.pose.B, before.pose.C];
  const dx = c[0] - b[0],
    dy = c[1] - b[1];
  const t = Math.max(
    0,
    Math.min(1, ((point.model[0] - b[0]) * dx + (point.model[1] - b[1]) * dy) / (dx * dx + dy * dy))
  );
  const projected = [b[0] + t * dx, b[1] + t * dy];
  check(
    'new force tail stays at the projected pointer point',
    distance(added.forces[0].start, projected) < 0.002,
    { actual: added.forces[0].start, expected: projected }
  );
  const openForce = async () => {
    const point = await page.evaluate(() => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const f = g.mechanismSrv.forces[0];
      const screen = g.svgGrid.modelToScreen({
        x: (f.startCoord.x + f.endCoord.x) / 2,
        y: (f.startCoord.y + f.endCoord.y) / 2,
      });
      return { x: screen.x, y: screen.y };
    });
    await openAt(point);
  };
  await openForce();
  if (!(await clickEnabled('Reverse Direction'))) return;
  const reversed = await snapshot();
  check(
    'force reversal turns the displayed arrow around',
    Math.cos(reversed.forces[0].angle - added.forces[0].angle) < -0.999999 &&
      distance(reversed.forces[0].start, added.forces[0].start) < 0.002,
    { added: added.forces, reversed: reversed.forces }
  );
  preserves('force reversal', before, reversed);
  await openForce();
  if (!(await clickEnabled('Global Frame'))) return;
  const local = await snapshot();
  check(
    'frame toggle preserves displayed arrow direction and magnitude',
    local.forces[0].local &&
      Math.cos(local.forces[0].angle - reversed.forces[0].angle) > 0.999999 &&
      Math.abs(local.forces[0].mag - reversed.forces[0].mag) < 1e-8,
    { before: reversed.forces, after: local.forces }
  );
  preserves('force frame toggle', before, local);
  const decoded = await roundtrip('local force', local);
  check(
    'force frame survives URL roundtrip',
    decoded.forces.length === 1 && decoded.forces[0].local
  );
  await openForce();
  if (!(await clickEnabled('Delete Force'))) return;
  const deleted = await snapshot();
  check('force deletion removes only the force', deleted.forces.length === 0);
  preserves('force deletion', before, deleted);
});

await section('properties', async () => {
  await loadPaused();
  const before = await snapshot();
  for (const label of ['Drawn as a Disc', 'Fixed Length', 'Fixed Angle']) {
    await openLink('A', 'B');
    if (!(await clickEnabled(label))) continue;
    const after = await snapshot();
    preserves(label, before, after);
    const crank = after.links.find((link) => link.id === 'AB');
    check(
      `${label}: state persisted`,
      label === 'Drawn as a Disc'
        ? crank.disc
        : crank.hold === (label === 'Fixed Length' ? 'length' : 'angle'),
      crank
    );
  }
  await openAt(await screenPoint('C'));
  if (!(await clickEnabled('Locked'))) return;
  const locked = await snapshot();
  preserves('lock joint', before, locked);
  check('joint is locked', locked.locked.includes('C'));
  for (const mode of ['Edit', 'Kinematic Analysis', 'Force Analysis']) {
    await page.locator('.tabButton').filter({ hasText: mode }).click();
    await page.waitForTimeout(450);
    check(
      `${mode}: requested mode is active`,
      await page
        .locator('.tabButton')
        .filter({ hasText: mode })
        .evaluate((node) => node.classList.contains('active'))
    );
    // Each drag must be attempted at a displaced pose. A mode change is a
    // separate navigation action, so reseek if that transition rewound.
    await page.evaluate(() => {
      const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      m.seekMechanism(0, m.mechanisms[0].cyclePeriod / 4);
    });
    await page.getByRole('button', { name: 'Fit to view' }).click();
    await page.waitForTimeout(350);
    const glyph = await page
      .locator('#joint_C')
      .evaluate((node) => !!node.closest('svg').querySelector('.lockBadge'));
    check(`${mode}: lock glyph visible on locked joint`, glyph);
    const at = await screenPoint('C');
    const start = await snapshot();
    const film = filmstrip(page, `${OUT}/locked-${mode.split(' ')[0]}`);
    await film.during(25, 4, 'drag-refused', async () => {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x - 70, at.y + 35, { steps: 6 });
      await page.mouse.up();
    });
    preserves(`${mode} locked drag`, start, await snapshot());
    console.log(
      await contactSheet(
        `${OUT}/locked-${mode.split(' ')[0]}/*.png`,
        `${OUT}/locked-${mode.split(' ')[0]}-filmstrip.png`,
        2,
        0.4
      )
    );
  }
  const shared = await snapshot();
  const decoded = await roundtrip('disc, hold and lock', shared);
  const crank = decoded.links.find((link) => link.id === 'AB');
  check(
    'disc, angle hold and lock survive URL roundtrip',
    crank.disc && crank.hold === 'angle' && decoded.locked.includes('C'),
    decoded
  );
});

check('no browser errors', errors.length === 0, errors);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(`${results.filter((result) => result.ok).length}/${results.length} checks passed`);
process.exit(results.every((result) => result.ok) ? 0 : 1);
