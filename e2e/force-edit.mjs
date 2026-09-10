/**
 * Editing a force: picking it up, where its anchor may go, and drawing a new one.
 *
 * A force says "this load, at this point, on this body". Two of those three are
 * only editable by dragging, so the rules about where the anchor may land are
 * the rules about what a force can mean:
 *
 *   - the arrow itself is the handle — the little square at its tail is not the
 *     only way to pick one up;
 *   - a pin where several links meet is refused, because a force there does not
 *     say which body it acts on;
 *   - a joint on one link only is fine, and the anchor snaps onto it — that is
 *     how a load goes on the hook at the end of a boom;
 *   - and a snapped anchor has to leave the joint visible, or the two read as
 *     one object.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/force-edit.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
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

const force = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const held = grid.mechanismSrv.forces[0];
    if (!held) return undefined;
    return {
      start: [Math.round(held.startCoord.x), Math.round(held.startCoord.y)],
      end: [Math.round(held.endCoord.x), Math.round(held.endCoord.y)],
      snapped: grid.forceSnappedJoint(held)?.id,
      link: held.link.id,
    };
  });

const jointAt = (id) =>
  page.evaluate((jointId) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === jointId);
    return joint ? { x: joint.x, y: joint.y, links: joint.links.length } : undefined;
  }, id);

await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const start = await force();
record('the crane opens carrying its hook load', !!start, start);
record('and the load reads as snapped to the hook', start?.snapped === 'T', start);

// The anchor mark has to leave the joint it sits on visible, which is why it
// is drawn at half a joint's radius rather than at the same size.
const anchorMark = await page.evaluate(() => {
  const disc = document.querySelector('circle.forceAnchor');
  const joint = document.querySelector('#joint_T');
  if (!disc || !joint) return undefined;
  return {
    anchor: Math.round(disc.getBoundingClientRect().width),
    joint: Math.round(joint.getBoundingClientRect().width),
  };
});
record(
  'the anchor mark is smaller than the joint under it, so the joint still reads',
  !!anchorMark && anchorMark.anchor < anchorMark.joint,
  anchorMark
);

// --- the arrow itself is the handle ---------------------------------------
const middle = await toScreen(
  (start.start[0] + start.end[0]) / 2,
  (start.start[1] + start.end[1]) / 2
);
const boomFoot = await jointAt('O');
const hook = await jointAt('T');
const alongBoom = await toScreen(
  boomFoot.x + (hook.x - boomFoot.x) * 0.45,
  boomFoot.y + (hook.y - boomFoot.y) * 0.45
);
await page.mouse.move(middle.x, middle.y);
await page.mouse.down();
await page.mouse.move(alongBoom.x, alongBoom.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);

const moved = await force();
record(
  'grabbing the arrow carries the whole force',
  moved.start[0] !== start.start[0] || moved.start[1] !== start.start[1],
  { start, moved }
);
const lengthOf = (f) => Math.hypot(f.end[0] - f.start[0], f.end[1] - f.start[1]);
record('and the arrow keeps its length', Math.abs(lengthOf(moved) - lengthOf(start)) < 3, {
  start,
  moved,
});
record('and it is no longer snapped to anything', moved.snapped === undefined, moved);

// --- a pin where two links meet is refused ---------------------------------
const shared = await jointAt('C');
record('joint C is the shared pin', shared.links === 2, shared);
const onShared = await toScreen(shared.x, shared.y);
const grabAt = await toScreen(moved.start[0], moved.start[1]);
await page.mouse.move(grabAt.x, grabAt.y);
await page.mouse.down();
await page.mouse.move(onShared.x, onShared.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);

const refused = await force();
record(
  'the anchor will not sit on a pin two links share',
  Math.hypot(refused.start[0] - shared.x, refused.start[1] - shared.y) > 1,
  { refused, shared: [Math.round(shared.x), Math.round(shared.y)] }
);

// --- a single-link joint takes it ------------------------------------------
const onHook = await toScreen(hook.x, hook.y);
const grabAgain = await toScreen(refused.start[0], refused.start[1]);
await page.mouse.move(grabAgain.x, grabAgain.y);
await page.mouse.down();
await page.mouse.move(onHook.x, onHook.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);

const snapped = await force();
record('and snaps onto a joint only one link holds', snapped.snapped === 'T', snapped);

// --- drawing a new one previews the real arrow -----------------------------
const onBoom = await toScreen(
  boomFoot.x + (hook.x - boomFoot.x) * 0.3,
  boomFoot.y + (hook.y - boomFoot.y) * 0.3
);
await page.mouse.move(onBoom.x, onBoom.y);
await page.mouse.click(onBoom.x, onBoom.y, { button: 'right' });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu .cm-row')].find(
    (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === 'Force'
  );
  item?.click();
});
await page.waitForTimeout(300);
// Away from the hook, where the first force now hangs: its anchor is held
// off the shared pin along the boom rather than refused outright, so the
// arrow it ends up with reaches into the spot the old click used.
await page.mouse.move(onBoom.x - 120, onBoom.y - 90, { steps: 8 });
await page.waitForTimeout(200);

const ghost = await page.evaluate(() => {
  const holder = document.querySelector('#forceTempHolder');
  if (!holder) return undefined;
  const paths = [...holder.querySelectorAll('path')].map((node) => node.getAttribute('d') ?? '');
  return { paths: paths.length, drawn: paths.filter((d) => d.length > 4).length };
});
record('drawing a force previews the arrow it will make', !!ghost && ghost.drawn >= 2, ghost);

await page.mouse.click(onBoom.x - 120, onBoom.y - 90);
await page.waitForTimeout(800);
const built = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces.length
);
record('and the click makes it', built === 2, built);
record(
  'the preview is gone once it is made',
  !(await page.evaluate(() => !!document.querySelector('#forceTempHolder')))
);

// --- the arrow is laid at a fifteen-degree bearing unless Option is held ---
// The cursor sat about thirty-seven degrees off a multiple of fifteen from
// the click, and the anchor was then held off the shared pin along the boom;
// the placed arrow should still read a multiple of fifteen. Held free, it
// reads wherever the cursor was.
const bearingOf = (held) =>
  ((Math.atan2(held.end[1] - held.start[1], held.end[0] - held.start[0]) * 180) / Math.PI + 360) %
  360;
const offGrid = (degrees) => Math.abs(degrees / 15 - Math.round(degrees / 15)) * 15;
const latest = await page.evaluate(() => {
  const held = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces.at(-1);
  return { start: [held.startCoord.x, held.startCoord.y], end: [held.endCoord.x, held.endCoord.y] };
});
const snappedBearing = bearingOf(latest);
record('a placed force points at a fifteen-degree bearing', offGrid(snappedBearing) < 0.05, {
  bearing: snappedBearing,
});

// Further along the boom, clear of the arrow that now hangs at the old spot.
const farAlongBoom = await toScreen(
  boomFoot.x + (hook.x - boomFoot.x) * 0.55,
  boomFoot.y + (hook.y - boomFoot.y) * 0.55
);
await page.mouse.move(farAlongBoom.x, farAlongBoom.y);
await page.mouse.click(farAlongBoom.x, farAlongBoom.y, { button: 'right' });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu .cm-row')].find(
    (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === 'Force'
  );
  item?.click();
});
await page.waitForTimeout(300);
await page.keyboard.down('Alt');
await page.mouse.move(farAlongBoom.x - 120, farAlongBoom.y - 90, { steps: 8 });
await page.waitForTimeout(200);
await page.mouse.click(farAlongBoom.x - 120, farAlongBoom.y - 90);
await page.keyboard.up('Alt');
await page.waitForTimeout(800);
const freed = await page.evaluate(() => {
  const forces = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces;
  const held = forces.at(-1);
  return {
    count: forces.length,
    start: [held.startCoord.x, held.startCoord.y],
    end: [held.endCoord.x, held.endCoord.y],
  };
});
const freeBearing = bearingOf(freed);
record(
  'held with Option, it points where the cursor was',
  freed.count === 3 && offGrid(freeBearing) > 1,
  { bearing: freeBearing, count: freed.count }
);

// --- a welded joint refuses a cylinder -------------------------------------
await page.goto(`${BASE}/?${payloads['Scotch_Yoke']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const welded = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((candidate) => candidate.isWelded);
  return joint ? { id: joint.id, x: joint.x, y: joint.y } : undefined;
});
record('the yoke has a welded joint', !!welded, welded);
const onWeld = await toScreen(welded.x, welded.y);
await page.mouse.move(onWeld.x, onWeld.y);
await page.mouse.click(onWeld.x, onWeld.y, { button: 'right' });
await page.waitForTimeout(600);
const weldMenu = await page.evaluate(() =>
  [...document.querySelectorAll('#contextMenu .cm-row')].map((item) => ({
    label: item.querySelector('.cm-row__label')?.textContent?.trim() ?? '',
    disabled: item.classList.contains('cm-row--off'),
  }))
);
const cylinderItem = weldMenu.find((item) => item.label === 'Cylinder');
// A welded joint takes a cylinder now, and the ram joins the body it lands on
// -- a weld says every body meeting there is rigid, and the ram arriving is one
// more of them. This used to be refused, on the grounds that the model had no
// answer for a third body inside one rigid statement; it has one.
record(
  'a welded joint takes a cylinder, which joins its body',
  !!cylinderItem && !cylinderItem.disabled,
  weldMenu.map((item) => `${item.label}${item.disabled ? ' (off)' : ''}`)
);

// ---------------------------------------------------------------------------
// Every template that ships a force, dragged by hand.
//
// Three of the four worked while the punch press did not, which is the kind of
// difference no unit test finds: its rod's SVG path carries an empty `d`, so
// the hit test that asked the *drawing* whether a point was on the link said no
// everywhere, and its load could not be moved at all.
// ---------------------------------------------------------------------------

for (const template of ['Punch_Press', 'Derrick_Crane', 'Toggle_Clamp', 'Offset_Load_Rocker']) {
  await page.goto(`${BASE}/?${payloads[template]}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  const held = await force();
  if (!held) {
    record(`${template}: opens carrying its load`, false, held);
    continue;
  }
  const arrow = await toScreen(
    (held.start[0] + held.end[0]) / 2,
    (held.start[1] + held.end[1]) / 2
  );
  await page.mouse.click(arrow.x, arrow.y);
  await page.waitForTimeout(400);

  const tail = await toScreen(held.start[0], held.start[1]);
  // Plain numbers: a Joint carries its links, which carry their joints, and
  // that does not cross the page boundary.
  const ends = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joints = grid.mechanismSrv.forces[0].link.joints;
    const first = joints[0];
    const last = joints[joints.length - 1];
    return { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  });
  const middle = await toScreen(ends.x, ends.y);
  await page.mouse.move(tail.x, tail.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const dragged = await force();
  record(
    `${template}: the load's tail can be dragged along its link`,
    dragged.start[0] !== held.start[0] || dragged.start[1] !== held.start[1],
    { held, dragged }
  );
  // The tail alone: the head is the direction, and it stays where it was put.
  record(
    `${template}: and the head stays where it was`,
    dragged.end[0] === held.end[0] && dragged.end[1] === held.end[1],
    {
      held,
      dragged,
    }
  );
}

// ---------------------------------------------------------------------------
// The marks a force wears are sized from its own arrow.
//
// Arrow thickness is how a force shows its magnitude, so a mark drawn at a
// fixed size beside a heavy one reads as belonging to something else.
// ---------------------------------------------------------------------------

await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const anchorAt = async (width) => {
  await page.evaluate((visual) => {
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces[0].setVisualWidth(
      visual
    );
  }, width);
  // A real pointer event, so Angular runs change detection over the change.
  await page.mouse.move(700, 500);
  await page.mouse.move(701, 501);
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const disc = document.querySelector('circle.forceAnchor');
    return disc ? Number(disc.getAttribute('r')) : null;
  });
};
const thinMark = await anchorAt(0.075);
const thickMark = await anchorAt(0.15);
record('the anchor mark grows with the arrow', thickMark > thinMark, { thinMark, thickMark });
record(
  'and in proportion to it, rather than by some amount of its own',
  Math.abs(thickMark / thinMark - 2) < 1e-6,
  { thinMark, thickMark }
);

// Selection handles are round, like everything else that marks a point here.
const held = await force();
const arrowMid = await toScreen(
  (held.start[0] + held.end[0]) / 2,
  (held.start[1] + held.end[1]) / 2
);
await page.mouse.click(arrowMid.x, arrowMid.y);
await page.waitForTimeout(500);
const handles = await page.evaluate(() => ({
  circles: document.querySelectorAll('#startForceEndpoint circle, #endForceEndpoint circle').length,
  rects: document.querySelectorAll('#startForceEndpoint rect, #endForceEndpoint rect').length,
}));
record('the selector ends are circles', handles.circles === 2 && handles.rects === 0, handles);

// ---------------------------------------------------------------------------
// A drag that moves nothing is not an edit.
//
// The anchor is refused off its own link, so the gesture can end with the force
// exactly where it began — and crediting it anyway put an identical URL on the
// undo stack. Undo then looked broken: it was enabled, and pressing it changed
// nothing, because there was nothing between the two states to see.
// ---------------------------------------------------------------------------

await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const undoEnabled = () =>
  page.evaluate(() => {
    const undo = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
    return undo ? !undo.disabled : null;
  });
record('nothing is on the undo stack yet', (await undoEnabled()) === false);

const restingForce = await force();
const restingMid = await toScreen(
  (restingForce.start[0] + restingForce.end[0]) / 2,
  (restingForce.start[1] + restingForce.end[1]) / 2
);
await page.mouse.move(restingMid.x, restingMid.y);
await page.mouse.down();
// Well off the boom, where the anchor may not go.
await page.mouse.move(restingMid.x + 380, restingMid.y + 120, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(700);

const unmoved = await force();
record(
  'a drag off the link leaves the force where it was',
  unmoved.start[0] === restingForce.start[0] && unmoved.start[1] === restingForce.start[1],
  { restingForce, unmoved }
);
record('and does not arm Undo', (await undoEnabled()) === false);

// --- a body grab after a handle press still carries the whole arrow --------
// Pressing the base leaves that end selected; grabbing the arrow afterwards
// used to keep it, and the base jumped to the pointer instead of the arrow
// coming along whole.
await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const resting = await force();
const baseAt = await toScreen(resting.start[0], resting.start[1]);
await page.mouse.click(baseAt.x, baseAt.y);
await page.waitForTimeout(300);
const grabMid = await toScreen(
  (resting.start[0] + resting.end[0]) / 2,
  (resting.start[1] + resting.end[1]) / 2
);
const foot = await jointAt('O');
const tip = await jointAt('T');
const carryTo = await toScreen(foot.x + (tip.x - foot.x) * 0.5, foot.y + (tip.y - foot.y) * 0.5);
await page.mouse.move(grabMid.x, grabMid.y);
await page.mouse.down();
await page.mouse.move(carryTo.x, carryTo.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);
const carried = await force();
const lengthBefore = Math.hypot(
  resting.end[0] - resting.start[0],
  resting.end[1] - resting.start[1]
);
const lengthAfter = Math.hypot(
  carried.end[0] - carried.start[0],
  carried.end[1] - carried.start[1]
);
record(
  'after a press on the base, grabbing the arrow still carries both ends together',
  Math.abs(lengthAfter - lengthBefore) < 1 &&
    (carried.start[0] !== resting.start[0] || carried.start[1] !== resting.start[1]),
  { resting, carried, lengthBefore, lengthAfter }
);

// --- the anchor refuses a pin several links meet at, and says so ---------
const sharedPin = await jointAt('C');
const grabBase = await toScreen(carried.start[0], carried.start[1]);
const ontoShared = await toScreen(sharedPin.x, sharedPin.y);
await page.mouse.move(grabBase.x, grabBase.y);
await page.mouse.down();
await page.mouse.move(ontoShared.x, ontoShared.y, { steps: 14 });
await page.waitForTimeout(200);
const whileOver = await page.evaluate(() => ({
  ring: !!document.querySelector('circle.snapRefused'),
  said: ng
    .getComponent(document.querySelector('app-new-grid'))
    .notify.live.map((one) => one.text)
    .find((text) => /cannot sit on joint C/.test(text)),
}));
await page.mouse.up();
await page.waitForTimeout(400);
const heldShort = await force();
record('dragged onto a pin two links share, the pin is ringed red', whileOver.ring, whileOver);
record('and the refusal is said', !!whileOver.said, whileOver);
record(
  'and the anchor stops short of the pin',
  Math.hypot(heldShort.start[0] - sharedPin.x, heldShort.start[1] - sharedPin.y) > 1,
  { heldShort, sharedPin }
);
// Pushed hard past the pin, along the boom and beyond its end: the anchor
// still stops short of it.
const pastShared = await toScreen(
  sharedPin.x + (sharedPin.x - carried.start[0]) * 3,
  sharedPin.y + (sharedPin.y - carried.start[1]) * 3
);
const grabAgainBase = await toScreen(heldShort.start[0], heldShort.start[1]);
await page.mouse.move(grabAgainBase.x, grabAgainBase.y);
await page.mouse.down();
await page.mouse.move(pastShared.x, pastShared.y, { steps: 20 });
await page.mouse.up();
await page.waitForTimeout(400);
const pushed = await force();
record(
  'pushed past the pin, the anchor still stops short of it',
  Math.hypot(pushed.start[0] - sharedPin.x, pushed.start[1] - sharedPin.y) > 1,
  { pushed, sharedPin }
);
record(
  'the ring goes with the drag',
  !(await page.evaluate(() => !!document.querySelector('circle.snapRefused')))
);

// --- a plate's anchor stays inside the triangle its joints make -------------
// The rocker with the offset load is a three-joint plate. Its load can be
// dragged anywhere inside the triangle of joint centers and nowhere past it:
// out at the drawn edge is the skin, not the linkage. And a joint dragged
// out from under the load takes the load with it.
await page.goto(`${BASE}/?${payloads['Offset_Load_Rocker']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const plate = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const held = grid.mechanismSrv.forces[0];
  return {
    corners: held.link.joints.map((joint) => [joint.x, joint.y]),
    ids: held.link.joints.map((joint) => joint.id),
    start: [held.startCoord.x, held.startCoord.y],
  };
});
const insideTriangle = ([px, py], [[ax, ay], [bx, by], [cx, cy]], slack) => {
  const sign = (x1, y1, x2, y2) => (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  const d1 = sign(ax, ay, bx, by);
  const d2 = sign(bx, by, cx, cy);
  const d3 = sign(cx, cy, ax, ay);
  const negative = Math.min(d1, d2, d3) < -slack;
  const positive = Math.max(d1, d2, d3) > slack;
  return !(negative && positive);
};
record('the offset-load rocker is a three-joint plate', plate.corners.length === 3, plate);
const centroid = [
  (plate.corners[0][0] + plate.corners[1][0] + plate.corners[2][0]) / 3,
  (plate.corners[0][1] + plate.corners[1][1] + plate.corners[2][1]) / 3,
];
// Far past the corner furthest from the centroid, where the drawn plate
// has long since ended.
const far = plate.corners.reduce((best, corner) =>
  Math.hypot(corner[0] - centroid[0], corner[1] - centroid[1]) >
  Math.hypot(best[0] - centroid[0], best[1] - centroid[1])
    ? corner
    : best
);
const beyond = [
  centroid[0] + (far[0] - centroid[0]) * 2.5,
  centroid[1] + (far[1] - centroid[1]) * 2.5,
];
await page.evaluate(() =>
  ng
    .getComponent(document.querySelector('app-new-grid'))
    .activeObjService.updateSelectedObj(
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces[0]
    )
);
await page.waitForTimeout(200);
const grabPlate = await toScreen(plate.start[0], plate.start[1]);
const dropBeyond = await toScreen(beyond[0], beyond[1]);
await page.mouse.move(grabPlate.x, grabPlate.y);
await page.mouse.down();
await page.mouse.move(dropBeyond.x, dropBeyond.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);
const pulled = await force();
record(
  'dragged far past a corner, the load stops inside the triangle of joint centers',
  insideTriangle(pulled.start, plate.corners, 1e-6),
  { pulled, corners: plate.corners }
);
record(
  'and not at the drawn edge beyond it',
  Math.hypot(pulled.start[0] - beyond[0], pulled.start[1] - beyond[1]) > 0.5,
  { pulled, beyond }
);

// Drag the far corner in past the load: the load has to come with the plate.
const farId = plate.ids[plate.corners.indexOf(far)];
const farNow = await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((one) => one.id === id);
  return { x: joint.x, y: joint.y, ground: joint.ground };
}, farId);
if (!farNow.ground) {
  const grabCorner = await toScreen(farNow.x, farNow.y);
  const dropCorner = await toScreen(
    centroid[0] + (farNow.x - centroid[0]) * 0.3,
    centroid[1] + (farNow.y - centroid[1]) * 0.3
  );
  await page.mouse.move(grabCorner.x, grabCorner.y);
  await page.mouse.down();
  await page.mouse.move(dropCorner.x, dropCorner.y, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const settled = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const held = grid.mechanismSrv.forces[0];
    return {
      corners: held.link.joints.map((joint) => [joint.x, joint.y]),
      start: [held.startCoord.x, held.startCoord.y],
    };
  });
  record(
    'a corner dragged in past the load takes the load with it',
    insideTriangle(settled.start, settled.corners, 1e-6),
    settled
  );
}

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
