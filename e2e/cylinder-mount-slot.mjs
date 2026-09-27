/**
 * A cylinder's end joint is dropped onto a bar and rides the slot it cuts.
 *
 * Everything under the canvas already allowed it — `cutSlotOn` says in as many
 * words that a mount is not covered by its refusals — and the canvas threw the
 * slot candidate away on the line after it found one. Decision S22 stops that,
 * so the gesture a reader knows from every other pin works here too: the rod
 * end pushing a collar along a rail.
 *
 * Real mouse gestures throughout. The service calls are only for standing the
 * drawing up, because what is under test is the drag.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-mount-slot.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-mount-slot';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
mkdirSync(OUT, { recursive: true });
// One filmstrip for the whole run: `filmstrip()` clears its directory when it
// is made, so a second one on the same directory throws away the first's frames.
const film = filmstrip(page, OUT);

const results = [];
const check = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
  return ok;
};

/** Model-space point to screen, through the layer the mechanism is drawn in. */
const toScreen = (x, y) =>
  page.evaluate(
    ([modelX, modelY]) => {
      const m = document.querySelector('#linkHolder').getScreenCTM();
      return { x: modelX * m.a + modelY * m.c + m.e, y: modelX * m.b + modelY * m.d + m.f };
    },
    [x, y]
  );

const at = (id) =>
  page.evaluate((which) => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const joint = srv.joints.find((one) => one.id === which);
    return joint ? { x: joint.x, y: joint.y } : null;
  }, id);

const screenOf = async (id) => {
  const point = await at(id);
  return point && toScreen(point.x, point.y);
};

/**
 * What the drawing is, in the terms these checks are written in.
 *
 * Ids are read off `sealedStructures()` rather than spelled out: which letters
 * a drawing has spent depends on how many joints the parts before it took.
 */
const drawing = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const sealed = srv.sealedStructures()[0];
    const span = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const end = sealed && srv.joints.find((one) => one.id === sealed.mountB.id);
    // How far off the axis the interior stands: a cylinder drawn in two pieces
    // reads here as a number, whatever it looks like.
    const bend = sealed
      ? Math.abs(
          (sealed.inner.x - sealed.mountA.x) * (sealed.mountB.y - sealed.mountA.y) -
            (sealed.inner.y - sealed.mountA.y) * (sealed.mountB.x - sealed.mountA.x)
        ) / Math.max(1e-9, span(sealed.mountA, sealed.mountB))
      : null;
    return {
      rams: srv.sealedStructures().length,
      mountA: sealed?.mountA.id,
      mountB: sealed?.mountB.id,
      seal: sealed?.seal.id,
      endType: end?.constructor?.name ?? null,
      rotates: end?.rotates ?? null,
      floating: !!end?.isFloating,
      dangling: !!end?.isDangling,
      carrier: end?.carrier?.id ?? null,
      end: end ? { x: end.x, y: end.y } : null,
      barrel: sealed ? span(sealed.mountA, sealed.inner) : null,
      rod: sealed ? span(sealed.seal, sealed.mountB) : null,
      span: sealed ? span(sealed.mountA, sealed.mountB) : null,
      // The head has to stand between the barrel's two ends, or the part is
      // drawn with its seal outside its own bore.
      sealAlong: sealed
        ? ((sealed.seal.x - sealed.mountA.x) * (sealed.mountB.x - sealed.mountA.x) +
            (sealed.seal.y - sealed.mountA.y) * (sealed.mountB.y - sealed.mountA.y)) /
          Math.max(1e-9, span(sealed.mountA, sealed.mountB))
        : null,
      bend,
      blocks: srv.joints.filter((one) => one.constructor?.name === 'PrisJoint' && !one.isSealed)
        .length,
      joints: srv.joints.map((one) => one.id),
      links: srv.links.map((one) => one.id),
      history: grid.saveHistoryService.history.length,
      index: grid.saveHistoryService.index,
      url: grid.saveHistoryService.urlGenerationService.generateUrlQuery(),
      dof: srv.mechanisms[0]?.dof ?? null,
      failure: srv.mechanisms[0]?.failure ?? null,
      valid: srv.oneValidMechanismExists(),
    };
  });

/**
 * A grid holding one cylinder anchored at its barrel end, and a bar off to the
 * side for the rod end to be dropped on.
 *
 * `rail` slants across the ram's axis on purpose: a rail square to the axis
 * puts the machine on a dead centre, where the drive can no longer move the end
 * joint at all — true of the geometry, and nothing to do with this gesture.
 */
async function scene(how = {}) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  const ids = await page.evaluate((options) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    srv.createCylinderFrom({ x: -700, y: 300 }, { x: -100, y: 300 });
    const ram = srv.sealedStructures()[0];
    grid.activeObjService.updateSelectedObj(ram.mountA);
    srv.toggleGround();
    const rail = srv.addBar({ x: 100, y: -100 }, { x: 600, y: 400 });
    const ground = options.railEnds ?? 2;
    rail.joints.slice(0, ground).forEach((joint) => {
      grid.activeObjService.updateSelectedObj(joint);
      srv.toggleGround();
    });
    if (options.input) {
      grid.activeObjService.updateSelectedObj(ram.seal);
      srv.adjustInput();
    }
    srv.updateMechanism(true);
    const now = srv.sealedStructures()[0];
    return {
      mountA: now.mountA.id,
      mountB: now.mountB.id,
      seal: now.seal.id,
      railA: rail.joints[0].id,
      railB: rail.joints[1].id,
      rail: rail.id,
    };
  }, how);
  await page.waitForTimeout(200);
  // Where the middle of the rail is on screen, now. Recomputed per scene: the
  // camera frames what is drawn, and a scene with one ground mark instead of
  // two is framed a little differently.
  const middle = await page.evaluate(
    ([a, b]) => {
      const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const one = srv.joints.find((j) => j.id === a);
      const two = srv.joints.find((j) => j.id === b);
      return { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2 };
    },
    [ids.railA, ids.railB]
  );
  onRail = await toScreen(middle.x, middle.y);
  return ids;
}
/** The middle of the rail, on screen, for the scene standing now. */
let onRail;

/** Take hold of a joint and travel far enough that the canvas calls it a drag. */
async function grab(id) {
  const from = await screenOf(id);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 14, from.y + 8, { steps: 4 });
  await page.waitForTimeout(140);
  return from;
}

const live = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      slot: grid.slotCandidate
        ? {
            carrier: grid.slotCandidate.carrier.id,
            x: grid.slotCandidate.x,
            y: grid.slotCandidate.y,
          }
        : null,
      target: grid.snapTargetJoint?.id ?? null,
    };
  });

/**
 * Whether the part is still one straight, connected cylinder.
 *
 * Three statements, and between them they are what "drawn in one piece" means
 * here: the interior stands on the axis between the two end joints, the head
 * stands between them, and the rod spans from the head to the far end. A part
 * whose barrel was left the length it was while its mounts moved fails the
 * third by exactly the stretch. The head's own travel is a bound in R, which
 * only the model can state — `cylinder-mount-slot.spec.ts` asks it there.
 */
const assembled = (now) =>
  now.rams === 1 &&
  now.bend < 1e-3 &&
  now.sealAlong > 0 &&
  now.sealAlong < now.span &&
  Math.abs(now.span - (now.sealAlong + now.rod)) < 1e-3;

/** Pick a value of the Joint Type choice on a joint's own right-click card. */
async function chooseType(id, label) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const box = await page.locator(`#joint_${id}`).boundingBox();
  if (!box) throw new Error(`joint ${id} is not on the canvas`);
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y, { button: 'right' });
  try {
    await page.locator('#contextMenu .cm-choice__cell').first().waitFor({ timeout: 5000 });
  } catch (error) {
    await page.screenshot({ path: `${OUT}/no-card-for-${id}.png` });
    throw error;
  }
  const cell = page.locator('#contextMenu .cm-choice__cell', { hasText: label }).first();
  if ((await cell.count()) === 0) {
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll('#contextMenu .cm-choice__label')].map((one) =>
        one.textContent.trim()
      )
    );
    throw new Error(`no "${label}" in the Joint Type choice; it offers ${JSON.stringify(cells)}`);
  }
  await cell.click();
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

const history = (action) =>
  page.evaluate(
    (what) => ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService[what](),
    action
  );

// ------------------------------------------------------ 1. the drop
console.log('\ndropping a cylinder end onto a bar');

let ids = await scene();
const before = await drawing();
await film.shot('01-before');

await grab(ids.mountB);
await film.during(90, 6, '02-toward', async () => {
  await page.mouse.move(onRail.x, onRail.y, { steps: 26 });
});
await page.waitForTimeout(220);
const previewed = await live();
await film.shot('03-previewed');
check(
  'a channel previews in the bar while the end joint is held over it',
  previewed.slot?.carrier === ids.rail && previewed.target === null,
  previewed
);

await page.mouse.up();
await page.waitForTimeout(600);
await film.shot('04-dropped');
const dropped = await drawing();
check(
  'and releasing leaves that joint riding a slot in that bar',
  dropped.endType === 'PrisJoint' && dropped.floating && dropped.carrier === ids.rail,
  dropped
);
check(
  'the preview was the result: the joint landed where the channel promised',
  Math.hypot(dropped.end.x - previewed.slot.x, dropped.end.y - previewed.slot.y) < 1e-6,
  { landed: dropped.end, previewed: previewed.slot }
);
check(
  'an unwelded end becomes Pin-in-slot, so the rod may still turn in the rail',
  dropped.rotates === true,
  dropped
);
check(
  'it is still one cylinder, with the same joints in the same roles',
  dropped.rams === 1 &&
    dropped.mountA === before.mountA &&
    dropped.mountB === before.mountB &&
    dropped.seal === before.seal &&
    dropped.blocks === 1,
  { before, dropped }
);
check(
  'the part is straight and assembled: one axis, and the rod reaching the head',
  assembled(dropped),
  dropped
);
check(
  'and the whole gesture is one undo entry',
  dropped.history === before.history + 1 && dropped.index === before.index + 1,
  { before: [before.history, before.index], after: [dropped.history, dropped.index] }
);

// ------------------------------------------------------ 2. undo, redo, reload
console.log('\nundo, redo and the URL');

const droppedUrl = dropped.url;
await history('undo');
await page.waitForTimeout(500);
const undone = await drawing();
check(
  'undo takes the slot back off and puts the end joint where it was',
  undone.endType === 'RevJoint' &&
    undone.carrier === null &&
    Math.hypot(undone.end.x - before.end.x, undone.end.y - before.end.y) < 1e-6 &&
    undone.rams === 1,
  { before, undone }
);
await history('redo');
await page.waitForTimeout(500);
const redone = await drawing();
check(
  'and redo puts it back: the slot, the carrier, the pose',
  redone.carrier === ids.rail &&
    redone.endType === 'PrisJoint' &&
    Math.hypot(redone.end.x - dropped.end.x, redone.end.y - dropped.end.y) < 0.5 &&
    assembled(redone),
  { dropped, redone }
);

// Reloaded from the address the gesture wrote, which is also what undo replays.
// Compared as a drawing rather than as a string: a cylinder's member centres of
// mass are derived from its joints, and the joints come back at the URL's own
// precision, so a cylinder's URL has never re-encoded byte for byte — a plain
// one, created and reloaded with nothing else done to it, drifts the same way.
await page.goto(`${BASE}/?${droppedUrl}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(700);
const reloaded = await drawing();
check(
  'the URL reloads to the same drawing: one cylinder, its end riding the same bar',
  reloaded.rams === 1 &&
    reloaded.carrier === ids.rail &&
    reloaded.endType === 'PrisJoint' &&
    reloaded.rotates === true &&
    reloaded.blocks === 1 &&
    assembled(reloaded),
  { redone, reloaded }
);
check(
  'at the same pose, to within the precision the address carries',
  Math.hypot(reloaded.end.x - dropped.end.x, reloaded.end.y - dropped.end.y) < 0.5 &&
    Math.abs(reloaded.barrel - dropped.barrel) < 0.5 &&
    Math.abs(reloaded.rod - dropped.rod) < 0.5,
  { dropped, reloaded }
);

// ------------------------------------------------------ 3. riding the slot
console.log('\nriding the slot, and coming off it');

ids = await scene();
await grab(ids.mountB);
await page.mouse.move(onRail.x, onRail.y, { steps: 20 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(500);
const seated = await drawing();

// Along the slot, past its far end: the block stops at the channel's end
// rather than running off the bar.
const railEnd = await screenOf(ids.railB);
await grab(ids.mountB);
await film.during(90, 6, '05-sliding', async () => {
  await page.mouse.move(railEnd.x + 60, railEnd.y - 60, { steps: 24 });
});
await page.waitForTimeout(200);
const atEnd = await drawing();
await page.mouse.up();
await page.waitForTimeout(500);
const slidFar = await drawing();

const railA = await at(ids.railA);
const railB = await at(ids.railB);
const alongRail = (point) => {
  const dx = railB.x - railA.x;
  const dy = railB.y - railA.y;
  const length = Math.hypot(dx, dy);
  return ((point.x - railA.x) * dx + (point.y - railA.y) * dy) / (length * length);
};
check(
  'dragged past the end of the channel, the block stops inside the bar',
  alongRail(slidFar.end) > alongRail(seated.end) && alongRail(slidFar.end) < 1,
  { seated: alongRail(seated.end), slid: alongRail(slidFar.end) }
);
check(
  'it stayed on the slot line the whole way, and the part stayed straight',
  slidFar.carrier === ids.rail && slidFar.bend < 1e-6 && atEnd.bend < 1e-6,
  { atEnd, slidFar }
);

// Across the slot, far enough to pull the block out of the bar.
await grab(ids.mountB);
const away = await screenOf(ids.railA);
await film.during(80, 6, '06-pulling-out', async () => {
  await page.mouse.move(away.x - 40, away.y - 260, { steps: 22 });
});
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(600);
await film.shot('07-dangling');
const pulled = await drawing();
check(
  'pulled clear across the bar, the block comes off and dangles',
  pulled.endType === 'PrisJoint' && pulled.dangling && pulled.carrier === null && pulled.rams === 1,
  pulled
);
const marked = await page.evaluate(() => document.querySelectorAll('.dangling-block').length);
check('and the drawing says so, in the mark an orphan block wears', marked === 1, { marked });

// And back on again.
await grab(ids.mountB);
await page.mouse.move(onRail.x, onRail.y, { steps: 24 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(600);
const reseated = await drawing();
check(
  'dropping it back on the bar gives it the slot again',
  reseated.carrier === ids.rail && reseated.floating && reseated.rams === 1 && reseated.bend < 1e-6,
  reseated
);

// ------------------------------------------------------ 4. when the carrier moves
console.log('\nthe carrier moves and the cylinder follows');

ids = await scene();
await grab(ids.mountB);
await page.mouse.move(onRail.x, onRail.y, { steps: 20 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(500);

const bends = [];
const offTheLine = (point, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return Math.abs(((point.x - a.x) * dy - (point.y - a.y) * dx) / length);
};
const sample = async () => {
  const now = await drawing();
  const ends = await page.evaluate(
    ([one, two]) => {
      const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const pick = (id) => srv.joints.find((j) => j.id === id);
      const a = pick(one);
      const b = pick(two);
      return [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
    },
    [ids.railA, ids.railB]
  );
  bends.push({
    ok: assembled(now),
    bend: now.bend,
    carrier: now.carrier,
    onLine: offTheLine(now.end, ends[0], ends[1]),
  });
};

// The bar itself, taken well clear of the block: the block is sitting at the
// bar's midpoint, and a press there grabs the joint rather than the body.
const barBody = await toScreen(
  railA.x + (railB.x - railA.x) * 0.2,
  railA.y + (railB.y - railA.y) * 0.2
);
await page.mouse.move(barBody.x, barBody.y);
await page.mouse.down();
await page.mouse.move(barBody.x + 20, barBody.y - 10, { steps: 4 });
await page.waitForTimeout(140);
await film.during(90, 6, '08-carrier-drag', async () => {
  for (const step of [60, 120, 180, 240]) {
    await page.mouse.move(barBody.x + step, barBody.y - step * 0.4, { steps: 8 });
    await page.waitForTimeout(90);
    await sample();
  }
});
await page.mouse.up();
await page.waitForTimeout(500);
await film.shot('09-carrier-moved');
const carried = await drawing();
check(
  'the cylinder stays straight and assembled through every frame of a carrier drag',
  bends.length > 0 && bends.every((one) => one.ok && one.onLine < 1 && one.carrier === ids.rail),
  bends
);
check(
  'and its end joint is still on the rail when the drag ends',
  carried.carrier === ids.rail && assembled(carried),
  carried
);

// One of the two joints that define the slot, which turns the channel under
// the block rather than translating it.
const slotJoint = await screenOf(ids.railB);
await page.mouse.move(slotJoint.x, slotJoint.y);
await page.mouse.down();
await page.mouse.move(slotJoint.x + 14, slotJoint.y + 8, { steps: 4 });
await page.waitForTimeout(140);
bends.length = 0;
for (const step of [60, 140, 220]) {
  await page.mouse.move(slotJoint.x + step * 0.3, slotJoint.y + step, { steps: 10 });
  await page.waitForTimeout(110);
  await sample();
}
await page.mouse.up();
await page.waitForTimeout(500);
await film.shot('10-slot-joint-moved');
check(
  'and through every frame of a drag of one of the joints that define the slot',
  bends.length > 0 && bends.every((one) => one.ok && one.onLine < 1 && one.carrier === ids.rail),
  bends
);

// ------------------------------------------------------ 5. it simulates
console.log('\nit runs');

async function runScene(options, tag) {
  ids = await scene({ input: true, ...options });
  await grab(ids.mountB);
  await page.mouse.move(onRail.x, onRail.y, { steps: 22 });
  await page.waitForTimeout(220);
  await page.mouse.up();
  await page.waitForTimeout(600);
  // Through the Joint Type choice on the joint's own card, which is the door a
  // reader has: Pin-in-slot to Prismatic is "the rod may not turn in the rail".
  if (options.prismatic) await chooseType(ids.mountB, 'Prismatic');
  const state = await drawing();
  await film.shot(`${tag}-built`);
  return state;
}

const sceneA = await runScene({}, '11-scene-a');
check(
  'scene (a): a fixed rail, one input on the slide — one degree of freedom, and it runs',
  sceneA.dof === 1 && sceneA.valid && sceneA.failure === null,
  sceneA
);

const offRail = [];
if (sceneA.valid) {
  const steps = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const bar = ng.getComponent(document.querySelector('app-playback-bar'));
    return bar?.maxStep ?? grid.mechanismSrv.mechanisms[0]?.joints?.[0]?.length ?? 0;
  });
  await film.during(160, 8, '12-playing', async () => {
    await page.evaluate(() => {
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(0, true);
    });
    await page.waitForTimeout(1200);
  });
  await page.evaluate(() => {
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(0, false);
  });
  for (const fraction of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const step = Math.max(0, Math.round((steps - 1) * fraction));
    await page.evaluate((which) => {
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(which, false);
    }, step);
    await page.waitForTimeout(120);
    const now = await drawing();
    const a = railA;
    const b = railB;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    offRail.push({
      step,
      off: Math.abs(((now.end.x - a.x) * dy - (now.end.y - a.y) * dx) / length),
      bend: now.bend,
      barrel: now.barrel,
      rod: now.rod,
    });
  }
  await page.evaluate(() => {
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(0, false);
  });
}
check(
  'and its end joint never leaves the rail, at any sample of the cycle',
  offRail.length > 0 && offRail.every((one) => one.off < 1 && one.bend < 1),
  offRail
);
check(
  'while both members keep the length they were built at',
  offRail.length > 0 &&
    offRail.every(
      (one) =>
        Math.abs(one.barrel - offRail[0].barrel) < 1 && Math.abs(one.rod - offRail[0].rod) < 1
    ),
  offRail
);

const sceneB = await runScene({ railEnds: 1, prismatic: true }, '13-scene-b');
check(
  'scene (b): the rail pinned at one end and the end joint made Prismatic — one freedom, and it runs',
  sceneB.dof === 1 && sceneB.valid && sceneB.failure === null && sceneB.rotates === false,
  sceneB
);

// ------------------------------------------------------ 6. what is not offered
console.log('\nwhat the gesture does not offer');

ids = await scene();
const onOwnBarrel = await page.evaluate((where) => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const sealed = srv.sealedStructures()[0];
  return { x: (sealed.mountA.x + sealed.inner.x) / 2, y: (sealed.mountA.y + sealed.inner.y) / 2 };
}, ids);
const barrelPoint = await toScreen(onOwnBarrel.x, onOwnBarrel.y);
await grab(ids.mountB);
await page.mouse.move(barrelPoint.x, barrelPoint.y, { steps: 24 });
await page.waitForTimeout(220);
const overOwnBarrel = await live();
await film.shot('14-over-own-barrel');
await page.mouse.up();
await page.waitForTimeout(500);
const afterBarrel = await drawing();
check(
  'a cylinder is never a carrier: no channel opens in the part being dragged',
  overOwnBarrel.slot === null,
  overOwnBarrel
);
check(
  'and the release cuts nothing',
  afterBarrel.blocks === 0 && afterBarrel.rams === 1,
  afterBarrel
);

// -------------------------------------------- 7. it reopens the way it was saved
console.log('\nreopened from its own URL');

/**
 * The maintainer's own drawing, from the session it was drawn in (decision S27).
 *
 * A cylinder whose barrel end rides a slot cut in a grounded ternary, driven at
 * its slide, its rod welded into a second grounded ternary. It ran when it was
 * drawn and would not run when it was reopened: the URL stores a coordinate on
 * a grain of about a thousandth of a user unit, which left the riding joint
 * 7.6e-2 model units off its own slot line, and the coupled solver's admission
 * gate -- a millionth of the mechanism's size -- refused the whole drawing for
 * it. Worse than a reload, because undo replays a URL: every undo landed on the
 * same refusal.
 */
const REOPENED =
  '2v.8h,38.5,1.1011.4A,A,0JI,08-,0.0B,B,8V,JR,0.GC,C,0Pt,Pa,0.9D,D,041,6e,0,ABC,A,B.0D1,D1,TQ,62,0.8F,F,pQ,5f,0.hE,E,H-,6F,0,DD1,D,D1,038.4G,G,1WI,0KT,0.GH,H,1Vi,5M,0..ARABC,ABC,0,0,0CE,C0,c5cae9,A,B,C,,.ARDD1,DD1,0,0,Ci,6L,303e9f,D,D1,,.AREFGH,EFGH,0,0,vw,1P,303e9f,E,F,G,H,,EF,FGH.aREF,EF,0,0,Yi,5y,303e9f,E,F,,.aRFGH,FGH,0,0,1H8,03A,00695C,G,F,H,,...N_h*1jPzBJ';

/** How far the riding end joint stands off the slot line it rides. */
const offItsSlot = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const ram = srv.sealedStructures()[0];
    const d = ram.mountA;
    if (!d.slotJointA || !d.slotJointB) return null;
    const a = d.slotJointA;
    const b = d.slotJointB;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.abs((d.x - a.x) * (b.y - a.y) - (d.y - a.y) * (b.x - a.x)) / len;
  });

await page.goto(`${BASE}/?${REOPENED}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(500);
const reopened = await drawing();
await film.shot('15-reopened');
check(
  'a drawing saved a hair off its slot line still runs when it is reopened',
  reopened.valid && reopened.failure === null && reopened.dof === 1,
  reopened
);

const chipsRead = await page.evaluate(() =>
  [...document.querySelectorAll('.tabButton')].map((one) => one.innerText.replace(/\n/g, ' | '))
);
check(
  'and neither analysis chip asks for a fix',
  !chipsRead.some((one) => /to fix/.test(one)),
  chipsRead.join(' // ')
);

const seatedAtLoad = await offItsSlot();
check(
  'the riding end joint is seated on its slot at load',
  seatedAtLoad !== null && seatedAtLoad < 1e-2,
  { seatedAtLoad }
);

// It plays, and the end joint stays on its slot all the way round.
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(600);
let worstOff = seatedAtLoad ?? 0;
await film.during(140, 8, '16-reopened-playing', async () => {
  await page.locator('button.playButton').click();
  await page.waitForTimeout(1200);
});
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(160);
  worstOff = Math.max(worstOff, (await offItsSlot()) ?? 0);
}
await page.locator('button.playButton').click();
await page.waitForTimeout(300);
check('and it stays on that slot through the cycle', worstOff < 1e-2, { worstOff });

// Undo and redo replay URLs, which is the path that used to land on the
// refusal. A drag first, so there is something to undo.
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(500);
const dragged = await drawing();
await grab(dragged.mountB);
await page.mouse.move(onRail ? onRail.x : 700, 420, { steps: 12 });
await page.waitForTimeout(180);
await page.mouse.up();
await page.waitForTimeout(600);
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService.undo();
});
await page.waitForTimeout(700);
const undoneReopened = await drawing();
check(
  'undo replays the URL and the drawing still runs',
  undoneReopened.valid && undoneReopened.failure === null,
  undoneReopened
);
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService.redo();
});
await page.waitForTimeout(700);
const redoneReopened = await drawing();
check('and so does redo', redoneReopened.valid && redoneReopened.failure === null, redoneReopened);
await film.shot('17-after-undo-redo');
await contactSheet(`${OUT}/*16-reopened-playing*.png`, `${OUT}/sheet-reopened.png`, 4, 0.5);

await contactSheet(`${OUT}/*02-toward*.png`, `${OUT}/sheet-drop.png`, 3, 0.5);
await contactSheet(`${OUT}/*05-sliding*.png`, `${OUT}/sheet-slide.png`, 3, 0.5);
await contactSheet(`${OUT}/*08-carrier-drag*.png`, `${OUT}/sheet-carrier.png`, 3, 0.5);
await contactSheet(`${OUT}/*12-playing*.png`, `${OUT}/sheet-playing.png`, 4, 0.5);

check('nothing threw', errors.length === 0, errors.slice(0, 3));
console.log(`\nframes in ${OUT}: ${film.frames}`);
await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
