// The atomic cylinder, end to end: created from the grid's right-click menu,
// re-posed by a parametric mount drag that holds collinearity by construction,
// grounded at a mount, driven through its hidden prismatic pin, sped up from
// the body panel, deleted as one part, and round-tripped through undo/redo.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-cylinder.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-cylinder';

const results = [];
const consoleErrors = [];

function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
// Dismiss the intro tour if it came up.
await page.waitForTimeout(300);

/** The model joints, read straight out of the running app (dev-mode ng). */
function model() {
  return page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: c.mechanismSrv.joints.map((j) => ({
        id: j.id,
        x: j.x,
        y: j.y,
        ground: !!j.ground,
        input: !!j.input,
        sealed: !!j.isSealed,
        kind: j.constructor?.name,
      })),
      links: c.mechanismSrv.links.map((l) => l.id),
      marks: document.querySelectorAll('.cylinder-mark').length,
    };
  });
}

/**
 * Which joint is which, asked of the model rather than assumed.
 *
 * A ram's five joints are not named A, B, C, D in creation order and have not
 * been for some time: the two mounts take ordinary letters and the three
 * hidden ones hang off the barrel mount's letter, numbered, so that the joints
 * nobody can see stop pushing the ones they can into punctuation. A suite that
 * spells the letters out is asserting the naming scheme by accident, and goes
 * red the next time it changes for a good reason.
 */
function cylinderRoles() {
  return page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const [sealed] = c.mechanismSrv.sealedStructures();
    if (!sealed) return null;
    return {
      barrelFar: sealed.barrelFar.id,
      barrelNear: sealed.barrelNear.id,
      pin: sealed.pin.id,
      slider: sealed.slider.id,
      rodFar: sealed.rodFar.id,
    };
  });
}

/** Screen center of a rendered joint circle. */
async function jointOnScreen(id) {
  return page.evaluate((jointId) => {
    const node = document.querySelector(`#joint_${jointId}`);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);
}

/** Perpendicular distance of P from the line through A and B, in model units. */
function offAxis(a, b, p) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return Infinity;
  return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

// ----------------------------------------- 0. the gesture can be aborted
console.log('\nan aborted gesture creates nothing, like link creation');
const abort = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const canvas = document.querySelector('#canvas').getBoundingClientRect();
  const start = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 - 120 };
  c.lastRightClickCoord.x = start.x;
  c.lastRightClickCoord.y = start.y;
  c.setLastRightClick('grid');
  c.cMenu.groups
    .flatMap((g) => g.rows)
    .find((r) => r.label === 'Cylinder')
    ?.action();
  return start;
});
await page.mouse.move(abort.x + 90, abort.y + 40);
await page.waitForTimeout(150);
checkThat(
  'the ghost appears once the gesture starts',
  (await page.locator('.cylinder-preview').count()) === 1
);
// Middle-click aborts, the same cancel path Add Link uses.
await page.mouse.click(abort.x + 90, abort.y + 40, { button: 'middle' });
await page.waitForTimeout(300);
checkThat(
  'canceling leaves no ghost and no mechanism',
  (await page.locator('.cylinder-preview').count()) === 0 && (await model()).joints.length === 0
);

// ----------------------------------------- 1. creation, two-point gesture
console.log('\ncreate a cylinder with the two-point gesture');
const gesture = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const canvas = document.querySelector('#canvas').getBoundingClientRect();
  const start = { x: canvas.x + canvas.width / 2 - 160, y: canvas.y + canvas.height / 2 };
  c.lastRightClickCoord.x = start.x;
  c.lastRightClickCoord.y = start.y;
  c.setLastRightClick('grid');
  const labels = c.cMenu.groups.flatMap((g) => g.rows).map((r) => r.label);
  c.cMenu.groups
    .flatMap((g) => g.rows)
    .find((r) => r.label === 'Cylinder')
    ?.action();
  return { labels, start, end: { x: start.x + 320, y: start.y } };
});
checkThat(
  'the grid menu offers Cylinder beside Link, under Add',
  gesture.labels.includes('Cylinder'),
  gesture.labels.join(', ')
);

// The ghost tracks the cursor from the start point to wherever the rod ends.
await page.mouse.move(gesture.start.x, gesture.start.y);
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(
    gesture.start.x + ((gesture.end.x - gesture.start.x) * i) / 12,
    gesture.start.y +
      ((gesture.end.y - gesture.start.y) * i) / 12 -
      Math.sin((i / 12) * Math.PI) * 60
  );
  await page.waitForTimeout(20);
  if (i === 6) {
    checkThat(
      'a ghost cylinder previews the assembly mid-gesture',
      (await page.locator('.cylinder-preview').count()) === 1
    );
    checkThat('nothing is committed while previewing', (await model()).joints.length === 0);
    await page.screenshot({ path: `${OUT}/00-creation-preview.png` });
  }
}
await page.mouse.move(gesture.end.x, gesture.end.y);
await page.waitForTimeout(100);
// The left-click commits, with the cursor as the rod's end.
await page.mouse.click(gesture.end.x, gesture.end.y);
await page.waitForTimeout(700);
checkThat(
  'the ghost is gone after the commit',
  (await page.locator('.cylinder-preview').count()) === 0
);

let state = await model();
const roles = await cylinderRoles();
checkThat('the model can name the ram’s five joints', !!roles, JSON.stringify(roles));
const { barrelFar, barrelNear, pin, rodFar } = roles ?? {};
const commitPoint = await page.evaluate(
  ({ start, end }) => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    // Coord serializes through structuredClone as private fields; hand back
    // plain numbers.
    const plain = (p) => ({ x: p.x, y: p.y });
    return {
      start: plain(c.svgGrid.screenToModelFromXY(start.x, start.y)),
      end: plain(c.svgGrid.screenToModelFromXY(end.x, end.y)),
    };
  },
  { start: gesture.start, end: gesture.end }
);
checkThat(
  'the start point is the barrel mount and the rod finishes at the cursor',
  (() => {
    const a = state.joints.find((j) => j.id === barrelFar);
    const d = state.joints.find((j) => j.id === rodFar);
    if (!a || !d) return false;
    return (
      Math.hypot(a.x - commitPoint.start.x, a.y - commitPoint.start.y) < 1 &&
      Math.hypot(d.x - commitPoint.end.x, d.y - commitPoint.end.y) < 1
    );
  })(),
  JSON.stringify({ commitPoint, roles, joints: state.joints.map((j) => j.id) })
);
checkThat(
  'the committed gesture built the complete assembly',
  state.joints.length === 5 && state.links.length === 3 && state.marks === 1,
  JSON.stringify({ joints: state.joints.map((j) => j.id), links: state.links, marks: state.marks })
);
const sealedSlider = state.joints.find((j) => j.kind === 'PrisJoint');
checkThat('the slider is sealed', !!sealedSlider?.sealed);
checkThat(
  'only the two mounts are selectable joints',
  !!(await jointOnScreen(barrelFar)) &&
    !!(await jointOnScreen(rodFar)) &&
    !(await jointOnScreen(barrelNear)) &&
    !(await jointOnScreen(pin)),
  'A,D visible; B,C hidden'
);
await page.screenshot({ path: `${OUT}/01-created.png` });

// ------------------------------------------- 2. parametric drag of a mount
console.log('\ndrag mount D through a rotation about mount A');
const before = await model();
const byId = (s, id) => s.joints.find((j) => j.id === id);
const lengthAB0 = Math.hypot(
  byId(before, barrelNear).x - byId(before, barrelFar).x,
  byId(before, barrelNear).y - byId(before, barrelFar).y
);
const lengthCD0 = Math.hypot(
  byId(before, rodFar).x - byId(before, pin).x,
  byId(before, rodFar).y - byId(before, pin).y
);
const angle0 = Math.atan2(
  byId(before, rodFar).y - byId(before, barrelFar).y,
  byId(before, rodFar).x - byId(before, barrelFar).x
);

const dScreen = await jointOnScreen(rodFar);
const aScreen = await jointOnScreen(barrelFar);
let worstOffAxis = 0;
if (checkThat('both mounts are on screen to drag', !!dScreen && !!aScreen)) {
  // Swing D about A by ~55 degrees (screen y grows downward, so this rotates
  // the model counter-clockwise), sampling collinearity the whole way.
  const radius = Math.hypot(dScreen.x - aScreen.x, dScreen.y - aScreen.y);
  const start = Math.atan2(dScreen.y - aScreen.y, dScreen.x - aScreen.x);
  await page.mouse.move(dScreen.x, dScreen.y);
  await page.mouse.down();
  const steps = 26;
  for (let i = 1; i <= steps; i++) {
    const theta = start - (0.96 * i) / steps;
    await page.mouse.move(
      aScreen.x + radius * Math.cos(theta),
      aScreen.y + radius * Math.sin(theta)
    );
    await page.waitForTimeout(12);
    const during = await model();
    worstOffAxis = Math.max(
      worstOffAxis,
      offAxis(byId(during, barrelFar), byId(during, rodFar), byId(during, barrelNear)),
      offAxis(byId(during, barrelFar), byId(during, rodFar), byId(during, pin))
    );
    if (i === Math.floor(steps / 2)) {
      await page.screenshot({ path: `${OUT}/02-mid-rotation.png` });
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const after = await model();
worstOffAxis = Math.max(
  worstOffAxis,
  offAxis(byId(after, barrelFar), byId(after, rodFar), byId(after, barrelNear)),
  offAxis(byId(after, barrelFar), byId(after, rodFar), byId(after, pin))
);
const angle1 = Math.atan2(
  byId(after, rodFar).y - byId(after, barrelFar).y,
  byId(after, rodFar).x - byId(after, barrelFar).x
);
checkThat(
  'the drag actually rotated the cylinder',
  Math.abs(angle1 - angle0) > 0.35,
  `${(((angle1 - angle0) * 180) / Math.PI).toFixed(1)} deg`
);
checkThat(
  'collinearity held through every sampled frame (by construction)',
  worstOffAxis < 1e-3,
  `worst off-axis ${worstOffAxis.toExponential(2)} model units`
);
const lengthAB1 = Math.hypot(
  byId(after, barrelNear).x - byId(after, barrelFar).x,
  byId(after, barrelNear).y - byId(after, barrelFar).y
);
const lengthCD1 = Math.hypot(
  byId(after, rodFar).x - byId(after, pin).x,
  byId(after, rodFar).y - byId(after, pin).y
);
checkThat(
  'barrel and rod stayed rigid through the rotation',
  Math.abs(lengthAB1 - lengthAB0) < 1e-3 && Math.abs(lengthCD1 - lengthCD0) < 1e-3,
  `dAB ${(lengthAB1 - lengthAB0).toExponential(2)}, dCD ${(lengthCD1 - lengthCD0).toExponential(2)}`
);
checkThat(
  'mount A did not move',
  (() => {
    const a0 = byId(before, barrelFar);
    const a1 = byId(after, barrelFar);
    return Math.hypot(a1.x - a0.x, a1.y - a0.y) < 1e-6;
  })()
);
await page.screenshot({ path: `${OUT}/03-rotated.png` });

// -------------------------------- 2b. fast flood drag cannot tear the part
console.log('\nflood the mount drag with big jumps, through the anchor and back');
const floodD = await jointOnScreen(rodFar);
const floodA = await jointOnScreen(barrelFar);
let floodWorst = 0;
if (checkThat('mounts on screen for the flood', !!floodD && !!floodA)) {
  await page.mouse.move(floodD.x, floodD.y);
  await page.mouse.down();
  const waypoints = [];
  for (let lap = 0; lap < 3; lap++) {
    waypoints.push(
      { x: floodA.x - 300, y: floodA.y - 40 }, // straight through the anchor, out the far side
      { x: floodA.x + 30, y: floodA.y + 200 }, // deep retraction beside the anchor
      { x: floodD.x + 150, y: floodD.y - 250 }, // flung far out
      { x: floodA.x - 80, y: floodA.y + 20 } // and through again
    );
  }
  for (const p of waypoints) {
    await page.mouse.move(p.x, p.y, { steps: 2 }); // big jumps, many per frame
    const during = await model();
    floodWorst = Math.max(
      floodWorst,
      offAxis(byId(during, barrelFar), byId(during, rodFar), byId(during, barrelNear)),
      offAxis(byId(during, barrelFar), byId(during, rodFar), byId(during, pin))
    );
  }
  // Park the mount somewhere sane before releasing, so later steps have room.
  await page.mouse.move(floodA.x + 260, floodA.y - 160, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const floodAfter = await model();
floodWorst = Math.max(
  floodWorst,
  offAxis(byId(floodAfter, barrelFar), byId(floodAfter, rodFar), byId(floodAfter, barrelNear)),
  offAxis(byId(floodAfter, barrelFar), byId(floodAfter, rodFar), byId(floodAfter, pin))
);
checkThat(
  'the flood never bent the assembly, even mid-frame',
  floodWorst < 1e-3,
  `worst off-axis ${floodWorst.toExponential(2)} model units`
);
checkThat(
  'the skin survived the flood',
  (await page.locator('.cylinder-mark').count()) === 1 && floodAfter.joints.length === 5
);

// -------------------------------------------------------- 3. ground a mount
console.log('\nground mount A from its context menu');
await page.evaluate((mountId) => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const mount = c.mechanismSrv.joints.find((j) => j.id === mountId);
  c.setLastRightClick(mount);
  c.cMenu.groups
    .flatMap((g) => g.rows)
    .find((r) => r.label === 'Grounded')
    ?.action();
}, barrelFar);
await page.waitForTimeout(500);
state = await model();
checkThat('mount A is grounded', !!byId(state, barrelFar).ground);
const mountMenu = await page.evaluate((mountId) => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.setLastRightClick(c.mechanismSrv.joints.find((j) => j.id === mountId));
  return c.cMenu.groups
    .flatMap((g) => g.rows)
    .map((r) => ({ label: r.label, disabled: r.disabled }));
}, barrelFar);
checkThat(
  // The deletion names what it takes rather than saying only "Delete Joint".
  // Slider is *offered*: a block on a mount is a carriage, and a mount is an
  // ordinary attachment point. What is sealed is the ram's inside, and none of
  // those three joints can be right-clicked at all.
  'the mount menu names the cylinder in its Delete, and offers Slider',
  mountMenu.some((i) => i.label.startsWith('Delete Joint (and Cylinder')) &&
    mountMenu.some((i) => i.label === 'Slider' && !i.disabled),
  JSON.stringify(mountMenu)
);

// -------------------------------------- 4. drive it through the body's menu
console.log('\nmake the cylinder the input from the body menu');
const bodyMenu = await page.evaluate((mountId) => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const barrel = c.mechanismSrv.links.find((l) => l.joints.some((j) => j.id === mountId));
  c.setLastRightClick(barrel);
  const labels = c.cMenu.groups.flatMap((g) => g.rows).map((r) => r.label);
  c.cMenu.groups
    .flatMap((g) => g.rows)
    .find((r) => r.label === 'Driven Input')
    ?.action();
  return labels;
}, barrelFar);
await page.waitForTimeout(500);
checkThat(
  // No Attach group at all: a sealed assembly takes no third body. What it
  // does carry has grown since -- a hold on its angle, the vector switches --
  // so the claim is about what must be there and what must not, rather than
  // an exact list that goes red every time the menu gains a row.
  'the body menu offers the part’s own states and no way to attach to it',
  ['Driven Input', 'Locked', 'Delete Cylinder'].every((row) => bodyMenu.includes(row)) &&
    ['Link', 'Cylinder', 'Force', 'Tracer Point'].every((row) => !bodyMenu.includes(row)),
  bodyMenu.join(', ')
);
state = await model();
checkThat(
  'the hidden prismatic pin is the input joint',
  !!state.joints.find((j) => j.kind === 'PrisJoint')?.input
);
checkThat(
  'the skin shows the driven arrows',
  (await page.locator('.cylinder-mark line').count()) >= 2
);

// ------------------------------------------- 5. set the speed from the panel
console.log('\nset the expansion speed on the body panel');
await page.evaluate((mountId) => {
  // Select the body, as a click on the skin would.
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const barrel = c.mechanismSrv.links.find((l) => l.joints.some((j) => j.id === mountId));
  c.setLastLeftClick(barrel);
}, barrelFar);
await page.waitForTimeout(500);
checkThat(
  'selecting the body opens the Edit Cylinder panel',
  (await page.getByText('Edit Cylinder').count()) >= 1
);
const speedInput = page
  .locator('input-block')
  .filter({ hasText: 'Input Speed' })
  .locator('input')
  .first();
if (checkThat('the panel offers an Input Speed field', (await speedInput.count()) === 1)) {
  await speedInput.fill('25');
  await speedInput.blur();
  await page.waitForTimeout(400);
  // Onto the driven joint, not into settings: a drawing can hold several
  // machines, so a speed belongs to the thing being driven rather than to the
  // document. The magnitude is the claim -- the sign is the direction button's
  // business, and it is asserted where that button is.
  const speed = await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const driven = srv.joints.find((joint) => joint.input);
    return driven?.driveSpeed;
  });
  checkThat(
    'the speed reaches the joint that is driven',
    Math.abs(speed) === 25,
    `driveSpeed=${speed}`
  );
}
await page.screenshot({ path: `${OUT}/04-driven-body-panel.png` });

// -------------------------------------------------- 6. delete the whole part
console.log('\ndelete the cylinder as one part, then undo/redo');
await page.evaluate((mountId) => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const barrel = c.mechanismSrv.links.find((l) => l.joints.some((j) => j.id === mountId));
  c.setLastRightClick(barrel);
  c.cMenu.groups
    .flatMap((g) => g.rows)
    .find((r) => r.label === 'Delete Cylinder')
    ?.action();
}, barrelFar);
// The action above ran via evaluate — outside Angular's zone — so nothing
// schedules change detection. A real user reaches this through a menu click,
// which is in-zone; the test nudges the pointer across the canvas (the svg's
// own pointermove listener enters the zone) so the DOM settles before it is
// read. Without this the check raced whatever zone event happened next.
await page.mouse.move(900, 300);
await page.mouse.move(905, 305);
await page.waitForTimeout(600);
state = await model();
checkThat(
  'the whole assembly is gone in one step',
  state.joints.length === 0 && state.links.length === 0 && state.marks === 0,
  JSON.stringify({ joints: state.joints.length, links: state.links.length })
);
await page.screenshot({ path: `${OUT}/05-deleted.png` });

// ------------------------------------------------------------ 7. undo / redo
await page.click('text=Undo');
await page.waitForTimeout(700);
state = await model();
checkThat(
  'one undo brings the whole cylinder back',
  state.joints.length === 5 && state.links.length === 3 && state.marks === 1,
  JSON.stringify({ joints: state.joints.length, marks: state.marks })
);
checkThat(
  'the restored cylinder is still sealed and still driven',
  (() => {
    const slider = state.joints.find((j) => j.kind === 'PrisJoint');
    return !!slider?.sealed && !!slider?.input;
  })(),
  JSON.stringify(state.joints.find((j) => j.kind === 'PrisJoint'))
);
checkThat('the restored mount is still grounded', !!byId(state, barrelFar)?.ground);

await page.click('text=Redo');
await page.waitForTimeout(700);
state = await model();
checkThat('redo deletes it again', state.joints.length === 0 && state.marks === 0);

await page.click('text=Undo');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/06-restored.png` });

await browser.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
);
console.log(`\nconsole errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 6).forEach((e) => console.log(`  ${e}`));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
