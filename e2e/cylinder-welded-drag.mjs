/**
 * Dragging a cylinder that has something welded to it, with a real mouse.
 *
 * The maintainer's two drawings and decision S21 — **only a body drag carries**
 * — driven through the browser's own input pipeline rather than through the
 * service, because what was reported was what the joints did under a hand:
 *
 * > *"In image 1, dragging joint B shouldn't move the location of joint J.
 * > Similar to how a standard compound link moves when dragged. In image 2,
 * > dragging joint A causes B to stay in place but E to move. It should be
 * > consistent and it should not move E. E should behave exactly like B. Also,
 * > when you drag joint E, joint B shouldn't move in the second image again."*
 *
 * Both scenes are read out of `src/test-utils/verification/welded-cylinder-fixtures.ts`,
 * which is the one place those two strings live, and whose own spec encodes the
 * fixtures and compares — so this suite and the unit suite cannot end up
 * arguing about different drawings. Every id is read off `sealedStructures()`
 * rather than spelled out here, because the letters a cylinder wears are the
 * reader's business and have been renumbered once already (S9).
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-welded-drag.mjs
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-welded-drag';
mkdirSync(OUT, { recursive: true });

/** One of the two payloads, by the name of the constant that holds it. */
function scene(name) {
  const source = readFileSync('src/test-utils/verification/welded-cylinder-fixtures.ts', 'utf8');
  const found = source.match(new RegExp(`${name}[^']*'([^']+)'`));
  if (!found) throw new Error(`no ${name} in welded-cylinder-fixtures.ts`);
  return found[1];
}

const IMAGE_ONE = scene('WELDED_BRACKET_PAYLOAD');
const IMAGE_TWO = scene('TWO_CYLINDERS_PAYLOAD');

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-weldeddrag', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const checks = [];
const record = (what, ok, detail = {}) => checks.push({ what, ok: !!ok, ...detail });

async function open(query) {
  await page.goto(`${BASE}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  await page.waitForTimeout(300);
}

/** Every joint's model position, by id. The model, not the picture (README). */
const pose = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return Object.fromEntries(grid.mechanismSrv.joints.map((one) => [one.id, [one.x, one.y]]));
  });

/**
 * Who the cylinders are, in the drawing's own words.
 *
 * `visibleJoints` leaves out the buried inner end, which is the one joint that
 * has no mark to grab and no letter to name, so anything this suite asserts on
 * is something a reader could point at.
 */
const structures = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const visible = new Set(srv.visibleJoints().map((one) => one.id));
    return srv.sealedStructures().map((one) => ({
      a: one.mountA.id,
      b: one.mountB.id,
      seal: one.seal.id,
      inner: one.inner.id,
      barrelRoot: one.barrelRoot.id,
      // Everything the barrel's body holds that the cylinder itself is not:
      // the welded bracket's own joints.
      bracket: one.barrelRoot.joints
        .map((joint) => joint.id)
        .filter(
          (id) =>
            visible.has(id) &&
            id !== one.mountA.id &&
            id !== one.seal.id &&
            id !== one.mountB.id &&
            id !== one.inner.id
        ),
    }));
  });

/** Where a joint's mark is on screen, or null when nothing draws it. */
const markAt = (id) =>
  page.evaluate((jointId) => {
    const node = document.querySelector(`#joint_${jointId}`);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);

/**
 * A point on the cylinder's own skin, to take hold of the body by.
 *
 * Between the barrel's end joint and the slide, which is the middle of the
 * barrel whatever the part is doing. Not the bounding box of a shape: a barrel
 * welded to a bar draws as **one L-shaped outline** (S16), and the center of
 * that box is in the elbow, off the ink — a press there lands on the grid and
 * pans the canvas instead of dragging anything.
 *
 * Verified against what is actually under the point, so a scene this rule does
 * not suit says so here rather than as a drag that did nothing.
 */
async function bodyGrip(part) {
  const a = await markAt(part.a);
  const seal = await markAt(part.seal);
  const at = { x: (a.x + seal.x) / 2, y: (a.y + seal.y) / 2 };
  const on = await page.evaluate(
    (point) => document.elementFromPoint(point.x, point.y)?.getAttribute('class') ?? '',
    at
  );
  if (!/cylinder/.test(on)) throw new Error(`nothing of the cylinder under the grip: "${on}"`);
  return { ...at, on };
}

/** One press-move-release, in steps, the way a hand moves. */
async function dragFrom(from, dx, dy, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + (dx * step) / steps, from.y + (dy * step) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** The same, filmed: a drag is a motion, and a motion needs frames (README). */
async function filmedDrag(tag, from, dx, dy) {
  const film = filmstrip(page, `${OUT}/${tag}`);
  await film.shot('grab');
  await film.during(60, 10, 'drag', () => dragFrom(from, dx, dy));
  await film.shot('released');
  await contactSheet(`${OUT}/${tag}/*.png`, `${OUT}/${tag}-sheet.png`, 4, 0.5);
}

/** Which ids are somewhere new, and by how far. */
function movedBetween(was, now, tolerance = 1e-3) {
  return Object.keys(now)
    .filter((id) => {
      const from = was[id];
      return from && Math.hypot(now[id][0] - from[0], now[id][1] - from[1]) > tolerance;
    })
    .sort();
}

const spanOf = (at, from, to) => Math.hypot(at[from][0] - at[to][0], at[from][1] - at[to][1]);

// --- image 1: a bar welded to the barrel's end joint -----------------------

await open(IMAGE_ONE);
{
  const [part] = await structures();
  const bracketTip = part.bracket[0];
  record('image 1 is one cylinder with a bar welded to its barrel end joint', !!bracketTip, {
    part,
  });

  // 1 · drag the far end. The report's first sentence.
  let was = await pose();
  await filmedDrag('drag-far-end', await markAt(part.b), 110, -150);
  let now = await pose();
  record(
    'dragging the far end leaves the welded bar where it was',
    !movedBetween(was, now).includes(bracketTip),
    {
      moved: movedBetween(was, now),
      bracketTip,
    }
  );
  record(
    'and the cylinder kept both of its member lengths',
    Math.abs(spanOf(now, part.a, part.inner) - spanOf(was, part.a, part.inner)) < 1e-3 &&
      Math.abs(spanOf(now, part.seal, part.b) - spanOf(was, part.seal, part.b)) < 1e-3,
    {
      barrel: [spanOf(was, part.a, part.inner), spanOf(now, part.a, part.inner)],
      rod: [spanOf(was, part.seal, part.b), spanOf(now, part.seal, part.b)],
    }
  );

  // 2 · drag the welded end joint itself. The body changes shape round it.
  await open(IMAGE_ONE);
  was = await pose();
  await filmedDrag('drag-welded-end', await markAt(part.a), -60, 120);
  now = await pose();
  record(
    'dragging the welded end joint moves that joint and not the bar’s far end',
    movedBetween(was, now).includes(part.a) && !movedBetween(was, now).includes(bracketTip),
    {
      moved: movedBetween(was, now),
    }
  );

  // 3 · drag the body. The one gesture that still carries everything.
  await open(IMAGE_ONE);
  was = await pose();
  const grip = await bodyGrip(part);
  // Selected first, then dragged: the canvas decides what a press carries from
  // what is selected, which is how a reader does it too.
  await page.mouse.click(grip.x, grip.y);
  await page.waitForTimeout(400);
  await filmedDrag('drag-body', grip, 140, 90);
  now = await pose();
  const shifts = Object.keys(now).map((id) => [now[id][0] - was[id][0], now[id][1] - was[id][1]]);
  const [dx, dy] = shifts[0];
  record(
    'dragging the body translates every joint, the welded bar included',
    shifts.length > 0 &&
      Math.hypot(dx, dy) > 1e-3 &&
      shifts.every(([x, y]) => Math.hypot(x - dx, y - dy) < 1e-2),
    {
      shifts,
    }
  );

  // 4 · and one undo puts the whole drawing back, in one step.
  const undoEnabled = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
    return button ? !button.disabled : null;
  });
  record('the body drag is in the history', undoEnabled === true, { undoEnabled });
  if (undoEnabled === true) {
    await page.click('text=Undo');
    await page.waitForTimeout(900);
    const back = await pose();
    record('one undo puts every joint back', movedBetween(was, back, 5e-3).length === 0, {
      stillMoved: movedBetween(was, back, 5e-3),
    });
  }
}

// --- image 2: two cylinders welded at one end joint ------------------------

await open(IMAGE_TWO);
{
  const parts = await structures();
  record(
    'image 2 is two cylinders sharing one welded end joint',
    parts.length === 2 && parts[0].a === parts[1].a && parts[0].barrelRoot === parts[1].barrelRoot,
    { parts }
  );
  const shared = parts[0].a;
  const [first, second] = parts;

  // 1 · drag the shared end joint. Both far ends stay.
  let was = await pose();
  await filmedDrag('drag-shared-end', await markAt(shared), -90, 110);
  let now = await pose();
  const movedByShared = movedBetween(was, now);
  record(
    'dragging the shared end joint leaves both far ends where they were',
    !movedByShared.includes(first.b) && !movedByShared.includes(second.b),
    { moved: movedByShared, ends: [first.b, second.b] }
  );
  record('and the joint the hand was on did move', movedByShared.includes(shared), {
    moved: movedByShared,
  });

  // 2 · drag one far end. The other cylinder is untouched.
  await open(IMAGE_TWO);
  was = await pose();
  await filmedDrag('drag-one-far-end', await markAt(second.b), 120, 90);
  now = await pose();
  const movedBySecond = movedBetween(was, now);
  record('dragging one far end leaves the other one alone', !movedBySecond.includes(first.b), {
    moved: movedBySecond,
  });
  record('and leaves the shared end joint alone too', !movedBySecond.includes(shared), {
    moved: movedBySecond,
  });

  // 3 · and the other one, which the report says must behave the same way.
  await open(IMAGE_TWO);
  was = await pose();
  await filmedDrag('drag-other-far-end', await markAt(first.b), 90, 130);
  now = await pose();
  const movedByFirst = movedBetween(was, now);
  record(
    'dragging the other far end is the same gesture in reverse',
    !movedByFirst.includes(second.b) && movedByFirst.includes(first.b),
    { moved: movedByFirst }
  );

  // 4 · the body drag still takes both parts.
  await open(IMAGE_TWO);
  was = await pose();
  const grip = await bodyGrip(first);
  await page.mouse.click(grip.x, grip.y);
  await page.waitForTimeout(400);
  await filmedDrag('drag-two-cylinder-body', grip, -120, 80);
  now = await pose();
  const shifts = Object.keys(now).map((id) => [now[id][0] - was[id][0], now[id][1] - was[id][1]]);
  const [dx, dy] = shifts[0];
  record(
    'a body drag still translates both cylinders and the bracket',
    Math.hypot(dx, dy) > 1e-3 && shifts.every(([x, y]) => Math.hypot(x - dx, y - dy) < 1e-2),
    { shifts }
  );
}

record('nothing threw', errors.length === 0, { errors });

writeFileSync(`${OUT}/report.json`, JSON.stringify({ checks, errors }, null, 2));
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.what}`);
console.log(`\nframes and sheets in ${OUT}/`);
await ctx.close();
process.exit(checks.every((check) => check.ok) ? 0 : 1);
