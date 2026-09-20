// What a welded mount looks like, in every shape the plan named.
//
// `cylinder-mount.mjs` asks whether the app *does* the right thing. This asks
// whether it *draws* it: that a ram welded to a bracket is **one body** with it
// -- one fill, one continuous outline, a fillet in the elbow, exactly as two
// ordinary welded links are (decision S16) -- that nothing inside the ram leaks
// onto the canvas, that no body is painted twice, and that the answer holds for
// both mounts, a mount two rams share, two blocks on one body, a short ram, an
// oblique slot, at either end of the stroke, at two zoom levels and on a narrow
// window.
//
// It used to ask the opposite of the first of those: that a compound must never
// cover a ram. The narrower truth it was standing in for survives -- a body may
// cover the member it *holds* and nothing else -- and is checked below.
//
// Structural facts are asserted. Everything else is what the contact sheets are
// for -- a seam, a bore showing through, a plate that vanished are not things a
// count can catch, so the sheets exist to be looked at.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<url> node e2e/cylinder-mount-render.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-mount-render';

const results = [];
const consoleErrors = [];
function check(label, ok, detail = '') {
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
const film = filmstrip(page, OUT);

/**
 * Draw one of the shapes, by name, through the service.
 *
 * One function rather than ten because every recipe needs the same three
 * helpers -- the far joint of a fresh bar, a weld through the selection, a
 * ground through the selection -- and passing those into the page once is
 * cheaper than repeating them in every evaluate.
 */
async function draw(recipe, options = {}) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  const drawn = await page.evaluate(
    ([which, opts]) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const m = grid.mechanismSrv;
      const S = 200;
      const far = (link, anchor) => link.joints.find((j) => j.id !== anchor.id);
      const pick = (j) => grid.activeObjService.updateSelectedObj(j);
      const weld = (j) => {
        pick(j);
        m.weldJoint();
      };
      const ground = (j) => {
        pick(j);
        m.toggleGround();
      };
      const block = (j) => {
        pick(j);
        m.toggleSlider();
      };
      const ram = (from, to, at) => {
        m.createCylinderFrom(from, to, undefined, at);
        return m.sealedStructures()[m.sealedStructures().length - 1];
      };
      /** Two ordinary bars welded at their shared joint, for the eye to compare. */
      const weldedPair = (ax, ay, bx, by, cx, cy) => {
        const first = m.addBar({ x: ax, y: ay }, { x: bx, y: by });
        const elbow = first.joints[1];
        m.addBarFrom(elbow, { x: cx, y: cy });
        weld(elbow);
        return m.links.find((l) => (l.subset ?? []).some((leaf) => leaf.id === first.id));
      };

      const note = {};
      if (which === 'rod-welded' || which === 'colors' || which === 'small-ram') {
        const span = which === 'small-ram' ? 1.6 : 6;
        const one = ram({ x: -4 * S, y: 0 }, { x: (-4 + span) * S, y: 0 });
        const bar = m.addBarFrom(one.mountB, { x: one.mountB.x + 2 * S, y: one.mountB.y + 3 * S });
        note.tip = far(bar, one.mountB).id;
        weld(one.mountB);
      } else if (which === 'barrel-welded') {
        const one = ram({ x: -1 * S, y: 0 }, { x: 5 * S, y: 0 });
        const bar = m.addBarFrom(one.mountA, {
          x: one.mountA.x - 2 * S,
          y: one.mountA.y + 3 * S,
        });
        note.tip = far(bar, one.mountA).id;
        weld(one.mountA);
      } else if (which === 'both-welded' || which === 'reference') {
        // The reference scene: a ram welded at both ends, beside two ordinary
        // welded bodies for the drawing to be read against.
        const angle = ((opts?.angle ?? 0) * Math.PI) / 180;
        const span = opts?.small ? 1.7 : 6;
        const from = { x: -3 * S, y: 1 * S };
        const to = {
          x: from.x + span * S * Math.cos(angle),
          y: from.y + span * S * Math.sin(angle),
        };
        const one = ram(from, to);
        const left = m.addBarFrom(one.mountA, {
          x: one.mountA.x - 2 * S,
          y: one.mountA.y - 2.5 * S,
        });
        const right = m.addBarFrom(one.mountB, {
          x: one.mountB.x + 2 * S,
          y: one.mountB.y + 2.5 * S,
        });
        note.tip = far(right, one.mountB).id;
        note.otherTip = far(left, one.mountA).id;
        weld(one.mountA);
        weld(one.mountB);
        if (which === 'reference') {
          note.pairs = [
            weldedPair(-6 * S, -4 * S, -4 * S, -1.5 * S, -0.5 * S, -3.5 * S)?.id,
            weldedPair(1.5 * S, -2 * S, 4 * S, -4.5 * S, 7 * S, -2 * S)?.id,
          ];
        }
      } else if (which === 'shared-mount') {
        // A boom and a stick: one ram's rod mount is the next one's barrel
        // mount, and the weld at it has to hold both.
        const boom = ram({ x: -5 * S, y: -1 * S }, { x: 0, y: 0 });
        const stick = ram({ x: 0, y: 0 }, { x: 4 * S, y: 3 * S }, boom.mountB);
        const bar = m.addBarFrom(boom.mountB, { x: -1 * S, y: 3 * S });
        note.tip = far(bar, boom.mountB).id;
        note.shared = boom.mountB.id;
        note.stickTip = stick.mountB.id;
        weld(boom.mountB);
      } else if (which === 'two-blocks') {
        const one = ram({ x: -4 * S, y: 0 }, { x: 2 * S, y: 0 });
        const bar = m.addBarFrom(one.mountB, { x: one.mountB.x + 2 * S, y: one.mountB.y + 3 * S });
        const tip = far(bar, one.mountB);
        note.tip = tip.id;
        weld(one.mountB);
        // Two external blocks on one welded body: one at the mount, one at the
        // bracket's far end, each with its own plate to draw.
        //
        // Re-fetched by letter between the two calls: gaining a slot exchanges
        // the joint for a `PrisJoint` keeping its id (Stage 1 of
        // `docs/joint-type-and-cylinder-plan.md`), so the object captured above
        // is not the one in the drawing any more and grounding it grounds
        // nothing at all -- which left the whole drawing unanchored and solving
        // as no machine.
        const live = (id) => m.joints.find((j) => j.id === id);
        const mountId = one.mountB.id;
        const tipId = tip.id;
        block(live(mountId));
        ground(live(mountId));
        block(live(tipId));
        ground(live(tipId));
      } else if (which === 'oblique-slot') {
        const one = ram({ x: -1 * S, y: 1 * S }, { x: 5 * S, y: 1 * S });
        const bar = m.addBarFrom(one.mountB, { x: one.mountB.x + 1 * S, y: one.mountB.y + 3 * S });
        note.tip = far(bar, one.mountB).id;
        weld(one.mountB);
        // A rail somewhere else in the drawing, running at 37 degrees to the
        // ram's own axis: an oblique guide rather than an axial one. It cannot
        // be the bracket -- a body the ram is already fixed to would only pull
        // the part shorter, and the drop refuses it.
        const rail = m.addBar({ x: -5 * S, y: -3 * S }, { x: 1 * S, y: 1.5 * S });
        note.cut = m.cutSlotOn(one.mountA, {
          carrier: rail,
          a: rail.joints[0],
          b: rail.joints[1],
          x: (rail.joints[0].x + rail.joints[1].x) / 2,
          y: (rail.joints[0].y + rail.joints[1].y) / 2,
        });
      } else if (which === 'running') {
        const one = ram({ x: -4 * S, y: 0 }, { x: 2 * S, y: 0 });
        const bar = m.addBarFrom(one.mountB, { x: one.mountB.x + 2 * S, y: one.mountB.y + 3 * S });
        const tip = far(bar, one.mountB);
        note.tip = tip.id;
        weld(one.mountB);
        ground(one.mountA);
        // By letter between the two, for the reason the `two-blocks` recipe
        // above gives: gaining a slot exchanges the joint for a `PrisJoint`
        // keeping its id, so grounding the object captured before it grounds
        // nothing at all.
        const tipId = tip.id;
        block(m.joints.find((j) => j.id === tipId));
        ground(m.joints.find((j) => j.id === tipId));
        // The drive is the seal's own, through the ordinary input door.
        pick(m.sealedStructures()[0].seal);
        m.adjustInput();
      }

      m.finishStructuralEdit(true);
      const rams = m.sealedStructures();
      const compound = m.links.find((l) => (l.subset ?? []).length > 0);
      return {
        ...note,
        rams: rams.length,
        mounts: rams.flatMap((r) => [r.mountA.id, r.mountB.id]),
        seals: rams.map((r) => r.seal.id),
        members: rams.flatMap((r) => [r.barrel.id, r.rod.id]),
        compound: compound?.id,
        compounds: m.links.filter((l) => (l.subset ?? []).length > 0).map((l) => l.id),
        samples: m.masterMechanism()?.joints.length ?? 0,
      };
    },
    [recipe, options]
  );
  // The service is done; the canvas is not. Every recipe draws at least one
  // ram, so its skin appearing is the signal that this pose has been painted
  // -- without it the facts below are read off the drawing before it exists,
  // and a shape comes back with nothing on it at all.
  await page.waitForFunction(
    (many) => document.querySelectorAll('.cylinder-mark').length >= many,
    recipe === 'shared-mount' ? 2 : 1
  );
  await page.waitForTimeout(150);
  return drawn;
}

/** The structural facts a drawing has to satisfy, whatever it is of. */
const renderFacts = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const rams = m.sealedStructures();
    const count = (id) => document.querySelectorAll(`[id="${id}"]`).length;
    // The buried barrel end alone. The seal used to be in this list; it is the
    // square a reader selects now (Stage 2c, decision S11), so it is checked
    // below as a joint that IS drawn, exactly once.
    const interiors = rams.map((r) => r.inner.id);
    // Only a RealLink gets a path carrying its own id; a block is drawn in the
    // block layer with no id of its own, so it is counted separately below.
    const bodies = m.links.filter((l) => grid.gridUtils.typeOfLink(l) === 'R');
    /** Which members a body has swallowed, by id. */
    const holds = (root) =>
      rams
        .flatMap((r) => [
          { member: r.barrel.id, root: r.barrelRoot.id, at: [r.mountA, r.inner] },
          { member: r.rod.id, root: r.rodRoot.id, at: [r.seal, r.mountB] },
        ])
        .filter((one) => one.root === root.id);
    /**
     * Every member a body is allowed to be painted over.
     *
     * Its own, and the other half of the same ram: a rod slides *inside* its
     * barrel, so a body that has swallowed one is over the other for as much of
     * the stroke as the part is retracted. That is the drawing working. Being
     * painted over a ram it has nothing to do with is the old double-painting.
     */
    const mayCover = (root) =>
      rams
        .filter((r) => r.barrelRoot.id === root.id || r.rodRoot.id === root.id)
        .flatMap((r) => [r.barrel.id, r.rod.id]);
    return {
      // Nothing hidden inside a ram is on the canvas: not as a joint, not as a
      // body.
      interiorsDrawn: interiors.filter((id) => count(`joint_${id}`) > 0 || count(id) > 0),
      // And the seal is, once: its hitbox is the square the skin draws.
      sealsMissing: rams.map((r) => r.seal.id).filter((id) => count(`joint_${id}`) !== 1),
      // Every root body is painted exactly once. A compound painted beside its
      // own leaves, or a leaf painted beside its compound, is the double-alpha
      // seam this is here to catch -- and a body a cylinder pass paints has to
      // be left out of the links layer, or its id is on two elements at once.
      bodiesDrawnTwice: bodies.filter((l) => count(l.id) > 1).map((l) => l.id),
      bodiesNotDrawn: bodies.filter((l) => count(l.id) === 0).map((l) => l.id),
      // One block on the canvas per block a reader put there. A ram's own
      // sliding pair is sealed inside it, so its bore must never be one.
      blocksDrawn: document.querySelectorAll('.slider-block').length,
      blocksExpected: m.joints.filter((j) => j.constructor?.name === 'PrisJoint' && !j.isSealed)
        .length,
      // A compound's leaves are never bodies of their own on the canvas.
      leavesDrawnAsBodies: m.links
        .flatMap((l) => l.subset ?? [])
        .filter((leaf) => count(leaf.id) > 0)
        .map((leaf) => leaf.id),
      // Every joint a reader can point at has exactly one marker.
      jointsDrawnTwice: m.joints
        .filter((j) => !interiors.includes(j.id) && count(`joint_${j.id}`) > 1)
        .map((j) => j.id),
      mountsDrawn: rams
        .flatMap((r) => [r.mountA.id, r.mountB.id])
        .filter((id) => count(`joint_${id}`) === 1),
      // The skin is still there to draw them: one mark per ram.
      skinsDrawn: document.querySelectorAll('.cylinder-mark').length,
      // A body may cover the member it *holds* -- that is what being one body
      // means -- and nothing else. Covering a ram it is not welded to is the
      // old double-painting this check was written for, and still wrong.
      coversAForeignRam: (() => {
        const over = [];
        const middle = (one, two) => new DOMPoint((one.x + two.x) / 2, (one.y + two.y) / 2);
        bodies
          .filter((l) => (l.subset ?? []).length > 0)
          .forEach((root) => {
            const drawn = document.querySelector(`[id="${root.id}"]`);
            if (!drawn?.isPointInFill) return;
            const mine = mayCover(root);
            rams.forEach((ram) => {
              [
                ['barrel', ram.barrel.id, middle(ram.mountA, ram.inner)],
                ['rod', ram.rod.id, middle(ram.seal, ram.mountB)],
              ].forEach(([what, id, point]) => {
                if (mine.includes(id)) return;
                if (drawn.isPointInFill(point)) over.push(`${root.id} covers a ${what}`);
              });
            });
          });
        return over;
      })(),
      // And the other half of the same rule: a body that HAS swallowed a member
      // must cover it, or the fusion is a claim nothing on screen supports.
      missesItsOwnMember: (() => {
        const missed = [];
        const middle = (one, two) => new DOMPoint((one.x + two.x) / 2, (one.y + two.y) / 2);
        bodies
          .filter((l) => (l.subset ?? []).length > 0)
          .forEach((root) => {
            const drawn = document.querySelector(`[id="${root.id}"]`);
            holds(root).forEach((one) => {
              const point = middle(one.at[0], one.at[1]);
              if (!drawn?.isPointInFill || !drawn.isPointInFill(point)) {
                missed.push(`${root.id} does not cover ${one.member}`);
              }
            });
          });
        return missed;
      })(),
      // Whether each body's own path has any geometry in it.
      //
      // `coversAForeignRam` and `bodiesNotDrawn` both go by id, and a Slide
      // suppresses the rider's own outline and draws the whole assembly in the
      // weld plate instead -- so for those shapes the element is present,
      // carries its id, and has nothing in it. Both of those checks then pass
      // on a shape they say nothing about, which is worth knowing rather than
      // assuming: this is what says the element really is the empty one.
      emptyBodies: bodies
        .filter((l) => {
          const el = document.querySelector(`[id="${l.id}"]`);
          return !!el && !(el.getAttribute('d') ?? '').trim();
        })
        .map((l) => l.id),
      rams: rams.length,
      links: bodies.map((l) => l.id),
    };
  });

/** What the fusion itself looks like: one ring, one fill, a filleted elbow. */
const fusionFacts = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const rams = m.sealedStructures();
    const welded = new Set();
    rams.forEach((r) => {
      if (r.barrelRoot.id !== r.barrel.id) welded.add(r.barrelRoot.id);
      if (r.rodRoot.id !== r.rod.id) welded.add(r.rodRoot.id);
    });
    const shapeOf = (id) => {
      const link = m.links.find((l) => l.id === id);
      const el = document.querySelector(`[id="${id}"]`);
      const d = el?.getAttribute('d') ?? '';
      return {
        id,
        painted: document.querySelectorAll(`[id="${id}"]`).length,
        // One closed loop is one body; two is a bracket beside a ram.
        rings: (d.match(/Z/g) ?? []).length,
        // A fillet is the one curve `roundedRingPath` emits.
        fillets: (d.match(/Q/g) ?? []).length,
        fill: el?.getAttribute('fill') ?? null,
        stored: link?.fill ?? null,
        // Which layer drew it: the links layer, or a cylinder's own pass.
        inCylinderLayer: !!el?.closest('.cylinder-mark'),
      };
    };
    // An ordinary welded pair in the same drawing, for the fused body to be
    // held against: "filleted" is a property of that drawing, not a number.
    const ordinary = m.links
      .filter((l) => (l.subset ?? []).length > 0 && !welded.has(l.id))
      .map((l) => shapeOf(l.id));
    return {
      fused: [...welded].map(shapeOf),
      ordinary,
      // One transparent hit region per member a fused body holds, so the member
      // is still the thing a click on it selects.
      memberHits: [...document.querySelectorAll('.cylinder-member-hit')].map((el) =>
        el.getAttribute('data-member')
      ),
      // And the skin does not paint a member its body has taken over.
      skinPaints: {
        barrels: document.querySelectorAll('.cylinder-mark .cylinder-barrel').length,
        rods: document.querySelectorAll('.cylinder-mark .cylinder-rod').length,
        blocks: document.querySelectorAll('.cylinder-mark .cylinder-seal').length,
        slides: document.querySelectorAll('.slideMark').length,
      },
    };
  });

/** Click a thing on the canvas and say what got selected. */
async function selects(selector) {
  // A point that actually hits the shape, not the middle of its box. A bar
  // bent round a corner, and every weld plate, has a bounding box whose center
  // is outside the fill -- so aiming there clicks whatever lies beneath and
  // reports the wrong answer, or none.
  const spot = await page.evaluate((css) => {
    const el = document.querySelector(css);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    // Outward from the middle, not inward from a corner: a point a fortieth in
    // from the top-left of a rounded bar's box is on its stroke, where a
    // dispatched click can land a device pixel outside the shape the browser's
    // own hit test just named.
    const spread = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];
    for (const fy of spread) {
      for (const fx of spread) {
        const x = r.x + r.width * fx;
        const y = r.y + r.height * fy;
        if (document.elementFromPoint(x, y) === el) return { x, y };
      }
    }
    // No point on the shape answered. Falling back to the box center is what
    // the note above says never to do -- it clicks whatever lies beneath and
    // reports that -- so it fails loudly instead.
    return null;
  }, selector);
  if (!spot) return { type: 'unhittable', id: null };
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const active = ng.getComponent(document.querySelector('app-new-grid')).activeObjService;
    // Both fields keep their last value, so the type is what says which one to
    // read; taking whichever is set answers with the previous selection.
    return {
      type: active.objType,
      id:
        active.objType === 'Link'
          ? (active.selectedLink?.id ?? null)
          : (active.selectedJoint?.id ?? null),
    };
  });
}

// ------------------------------------------------- every shape the plan named
const shapes = [
  'rod-welded',
  'barrel-welded',
  'both-welded',
  'shared-mount',
  'two-blocks',
  'oblique-slot',
  'small-ram',
];
console.log('\nevery shape, drawn once and only once');
const drawn = {};
for (const shape of shapes) {
  const ids = await draw(shape);
  drawn[shape] = ids;
  const facts = await renderFacts();
  check(
    `${shape}: the buried barrel end is off the canvas and the seal is on it, once`,
    facts.interiorsDrawn.length === 0 &&
      facts.sealsMissing.length === 0 &&
      facts.jointsDrawnTwice.length === 0 &&
      facts.rams === (shape === 'shared-mount' ? 2 : 1),
    JSON.stringify({
      interiors: facts.interiorsDrawn,
      seals: facts.sealsMissing,
      twice: facts.jointsDrawnTwice,
      rams: facts.rams,
    })
  );
  check(
    `${shape}: every body is painted once, and no leaf is painted beside its compound`,
    facts.bodiesDrawnTwice.length === 0 &&
      facts.bodiesNotDrawn.length === 0 &&
      facts.leavesDrawnAsBodies.length === 0,
    JSON.stringify({
      twice: facts.bodiesDrawnTwice,
      missing: facts.bodiesNotDrawn,
      leaves: facts.leavesDrawnAsBodies,
      links: facts.links,
    })
  );
  check(
    `${shape}: a body covers the members it holds and no others`,
    facts.coversAForeignRam.length === 0 && facts.missesItsOwnMember.length === 0,
    JSON.stringify({
      foreign: facts.coversAForeignRam,
      missed: facts.missesItsOwnMember,
      // Named beside it, because a body whose path is empty is one those
      // checks cannot fail on: `isPointInFill` is false everywhere for it.
      empty: facts.emptyBodies,
    })
  );
  check(
    `${shape}: the skin still draws each ram`,
    facts.skinsDrawn === facts.rams,
    JSON.stringify({ skins: facts.skinsDrawn, rams: facts.rams })
  );
  check(
    `${shape}: one block on the canvas per block a reader put there`,
    facts.blocksDrawn === facts.blocksExpected,
    JSON.stringify({ drawn: facts.blocksDrawn, expected: facts.blocksExpected })
  );
  check(
    `${shape}: both mounts are on the canvas, once each`,
    facts.mountsDrawn.length === facts.rams * 2 && facts.jointsDrawnTwice.length === 0,
    JSON.stringify({ mounts: facts.mountsDrawn, twice: facts.jointsDrawnTwice })
  );
  await film.shot(`shape-${shape}`);
}
await contactSheet(`${OUT}/*shape-*.png`, `${OUT}/sheet-shapes.png`, 3);

// ------------------------------------------------------- one body, both ends
console.log('\na welded end is one body with the bracket on it');
for (const end of ['rod-welded', 'barrel-welded']) {
  await draw(end);
  const fusion = await fusionFacts();
  const body = fusion.fused[0];
  check(
    `${end}: the fused body is one painted shape, with one closed outline`,
    !!body && body.painted === 1 && body.rings === 1,
    JSON.stringify(body)
  );
  check(
    `${end}: painted in the body's own color, in the cylinder's own layer`,
    !!body && body.fill === body.stored && body.inCylinderLayer,
    JSON.stringify({ fill: body?.fill, stored: body?.stored, layer: body?.inCylinderLayer })
  );
  check(
    `${end}: the skin paints the other member and not this one`,
    fusion.skinPaints.blocks === 1 &&
      fusion.skinPaints.barrels === (end === 'barrel-welded' ? 0 : 1) &&
      fusion.skinPaints.rods === (end === 'rod-welded' ? 0 : 1),
    JSON.stringify(fusion.skinPaints)
  );
  check(
    `${end}: and the member it swallowed still has a region of its own`,
    fusion.memberHits.length === 1,
    JSON.stringify(fusion.memberHits)
  );
}

// The fillet, read against an ordinary welded pair standing beside it.
const reference = await draw('reference');
let fusion = await fusionFacts();
check(
  'the reference scene holds two fused bodies and two ordinary welded pairs',
  fusion.fused.length === 2 && fusion.ordinary.length === 2,
  JSON.stringify({ fused: fusion.fused.map((f) => f.id), pairs: fusion.ordinary.map((f) => f.id) })
);
check(
  'each fused body is one ring, filleted at least as much as an ordinary weld',
  fusion.fused.every((body) => body.rings === 1 && body.fillets >= 1) &&
    fusion.ordinary.every((pair) => pair.rings === 1 && pair.fillets >= 1) &&
    fusion.fused.every(
      (body) => body.fillets >= Math.min(...fusion.ordinary.map((pair) => pair.fillets))
    ),
  JSON.stringify({
    fused: fusion.fused.map((b) => [b.id, b.rings, b.fillets]),
    ordinary: fusion.ordinary.map((b) => [b.id, b.rings, b.fillets]),
  })
);
check(
  'both members of the ram are held, so the skin paints neither',
  fusion.skinPaints.barrels === 0 &&
    fusion.skinPaints.rods === 0 &&
    fusion.skinPaints.blocks === 1 &&
    fusion.memberHits.length === 2,
  JSON.stringify({ paints: fusion.skinPaints, hits: fusion.memberHits })
);
await film.shot('reference-idle');

// ------------------------------------------------------------- who answers
console.log('\nwhat each part of the fused drawing answers to');
const barrelBody = await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const ram = m.sealedStructures()[0];
  return { barrel: ram.barrel.id, rod: ram.rod.id, root: ram.barrelRoot.id, seal: ram.seal.id };
});
const onMember = await selects(`.cylinder-member-hit[data-member="${barrelBody.barrel}"]`);
check(
  'a click on the barrel still selects the barrel, not the body holding it',
  onMember.type === 'Link' && onMember.id === barrelBody.barrel,
  JSON.stringify({ got: onMember, wanted: barrelBody.barrel })
);
await film.shot('reference-member-selected');
const onBody = await selects(`[id="${barrelBody.root}"]`);
check(
  'and a click on the bracket selects the body it is part of',
  onBody.type === 'Link' && onBody.id === barrelBody.root,
  JSON.stringify({ got: onBody, wanted: barrelBody.root })
);
await film.shot('reference-body-selected');
const onSeal = await selects('.cylinder-seal-hit');
check(
  'the seal’s square still answers as the seal',
  onSeal.type === 'Joint' && onSeal.id === barrelBody.seal,
  JSON.stringify(onSeal)
);
const onTip = await selects(`#joint_${reference.tip}`);
check(
  'and the bracket’s far end answers as itself, not as the body it is on',
  onTip.type === 'Joint' && onTip.id === reference.tip,
  JSON.stringify(onTip)
);

// ------------------------------------------------- what the body is called
//
// A link's id is the concatenated ids of its joints, and a body welded to a
// barrel mount holds N -- the buried inner end, which has no marker, no letter
// and no hitbox (D14, S11). It was tagged `AA1D` on the canvas, headed
// `Edit Link AA1D` in the panel and `Link AA1D` in the menu: three surfaces
// naming a joint the drawing never shows. Nothing a reader sees has a digit in
// it here, because no visible joint on this grid does.
console.log('\nwhat a body welded to a barrel mount is called');
const named = await page.evaluate((where) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const part = m.sealedStructures()[0];
  const body = m.links.find((link) => link.id === where.root);
  grid.activeObjService.updateSelectedObj(body);
  const tags = [...document.querySelectorAll('#linkTagHolder text')].map((one) =>
    one.textContent.trim()
  );
  return {
    id: body.id,
    inner: part.inner.id,
    wanted: m.visibleBodyName(body),
    tags,
    mounts: [part.mountA.id, part.mountB.id],
  };
}, barrelBody);
await page.waitForTimeout(350);
const panelTitle = await page.evaluate(
  () => document.querySelector('app-edit-panel')?.innerText.split('\n')[0] ?? ''
);
const headerSpot = await page.evaluate((css) => {
  const el = document.querySelector(css);
  const r = el?.getBoundingClientRect();
  if (!r?.width) return null;
  const spread = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of spread)
    for (const fx of spread) {
      const x = r.x + r.width * fx;
      const y = r.y + r.height * fy;
      if (document.elementFromPoint(x, y) === el) return { x, y };
    }
  return null;
}, `[id="${barrelBody.root}"]`);
await page.mouse.click(headerSpot.x, headerSpot.y, { button: 'right' });
await page.locator('#contextMenu .cm-row').first().waitFor({ timeout: 5000 });
const card = await page.evaluate(() => ({
  header: document.querySelector('#contextMenu .cm-header')?.innerText.split('\n')[0] ?? '',
  subtitle: document.querySelector('#contextMenu .cm-header')?.innerText.split('\n')[1] ?? '',
}));
await film.shot('named-card');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check(
  'the id still holds the buried end, and nothing a reader sees does',
  named.id.includes(named.inner) &&
    named.wanted === `${named.mounts[0]}${reference.otherTip}`.split('').sort().join('') &&
    !/\d/.test(named.wanted),
  JSON.stringify({ id: named.id, inner: named.inner, shown: named.wanted })
);
check(
  'the canvas tag, the panel title and the menu card all read the visible letters',
  named.tags.includes(named.wanted) &&
    panelTitle === `Edit Link ${named.wanted}` &&
    card.header === `Link ${named.wanted}` &&
    [...named.tags, panelTitle, card.header, card.subtitle].every((one) => !/\d/.test(one)),
  JSON.stringify({ tags: named.tags, panel: panelTitle, card })
);
await film.shot('named-panel');

// ------------------------------------------------------------------ unweld
console.log('\nunwelding puts both back');
const freed = await page.evaluate((where) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const mount = m.joints.find(
    (j) => j.id === m.sealedStructures()[0].mountA.id || j.id === where.seal
  );
  grid.activeObjService.updateSelectedObj(m.sealedStructures()[0].mountA);
  m.unweldSelectedJoint();
  m.finishStructuralEdit(true);
  const ram = m.sealedStructures()[0];
  return {
    mount: mount?.id ?? null,
    barrelRoot: ram.barrelRoot.id,
    barrel: ram.barrel.id,
    rodRoot: ram.rodRoot.id,
  };
}, barrelBody);
await page.waitForTimeout(350);
const afterUnweld = await fusionFacts();
const looseFacts = await renderFacts();
check(
  'the barrel is its own body again and the skin paints it',
  freed.barrelRoot === freed.barrel &&
    afterUnweld.skinPaints.barrels === 1 &&
    afterUnweld.fused.length === 1,
  JSON.stringify({
    freed,
    paints: afterUnweld.skinPaints,
    fused: afterUnweld.fused.map((f) => f.id),
  })
);
check(
  'and the bracket it left is drawn once, in the links layer',
  looseFacts.bodiesDrawnTwice.length === 0 && looseFacts.bodiesNotDrawn.length === 0,
  JSON.stringify({ twice: looseFacts.bodiesDrawnTwice, missing: looseFacts.bodiesNotDrawn })
);
await film.shot('reference-unwelded');

// ------------------------------------------ the scene at three angles, and small
console.log('\nthe same scene turned, and at the smallest ram there is');
for (const angle of [0, 35, 90]) {
  await draw('reference', { angle });
  const turned = await renderFacts();
  const shapes = await fusionFacts();
  check(
    `at ${angle}°: still one painted ring per fused body, covering its own members`,
    shapes.fused.length === 2 &&
      shapes.fused.every((body) => body.painted === 1 && body.rings === 1) &&
      turned.missesItsOwnMember.length === 0 &&
      turned.coversAForeignRam.length === 0,
    JSON.stringify({
      fused: shapes.fused.map((b) => [b.id, b.painted, b.rings]),
      missed: turned.missesItsOwnMember,
      foreign: turned.coversAForeignRam,
    })
  );
  await film.shot(`angle-${String(angle).padStart(2, '0')}`);
}
await draw('reference', { small: true });
const smallest = await fusionFacts();
const smallFacts = await renderFacts();
check(
  'a ram at its smallest still fuses into one ring per body',
  smallest.fused.length === 2 &&
    smallest.fused.every((body) => body.rings === 1) &&
    smallFacts.interiorsDrawn.length === 0 &&
    smallFacts.missesItsOwnMember.length === 0,
  JSON.stringify({
    fused: smallest.fused.map((b) => [b.id, b.rings]),
    interiors: smallFacts.interiorsDrawn,
    missed: smallFacts.missesItsOwnMember,
  })
);
await film.shot('angle-min-ram');
await contactSheet(`${OUT}/*reference-*.png`, `${OUT}/sheet-reference.png`, 2);
await contactSheet(`${OUT}/*angle-*.png`, `${OUT}/sheet-angles.png`, 2);

// ------------------------------------------------ both ends of the stroke
console.log('\neither end of the stroke');
let ids = await draw('running');
const stroke = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const mount = () => m.joints.find((j) => j.id === where.mounts[1]);
  m.animate(0, false);
  // Asked here rather than carried from the fixture: the sample count is only
  // settled once the machine has been built, and it changes with input speed.
  return {
    retracted: { x: mount().x, y: mount().y },
    samples: m.masterMechanism()?.joints.length ?? 0,
    valid: m.mechanisms.some((one) => !!one?.isMechanismValid()),
  };
}, ids);
await film.shot('stroke-retracted');
// A cylinder's cycle runs out and back, so the last sample is the first one
// again; full extension is the sample furthest from the start, not the last.
const extended = await page.evaluate(
  (where) => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const mount = () => m.joints.find((j) => j.id === where.mounts[1]);
    const start = { x: mount().x, y: mount().y };
    let best = { step: 0, x: start.x, y: start.y, away: 0 };
    for (let step = 0; step < where.samples; step += Math.ceil(where.samples / 24)) {
      m.animate(step, false);
      const away = Math.hypot(mount().x - start.x, mount().y - start.y);
      if (away > best.away) best = { step, x: mount().x, y: mount().y, away };
    }
    m.animate(best.step, false);
    return best;
  },
  { ...ids, samples: stroke.samples }
);
await film.shot('stroke-extended');
let facts = await renderFacts();
check(
  'the ram is the same drawing at either end of its stroke',
  Math.hypot(extended.x - stroke.retracted.x, extended.y - stroke.retracted.y) > 1 &&
    facts.interiorsDrawn.length === 0 &&
    facts.sealsMissing.length === 0 &&
    facts.bodiesDrawnTwice.length === 0 &&
    facts.leavesDrawnAsBodies.length === 0 &&
    facts.missesItsOwnMember.length === 0,
  JSON.stringify({
    retracted: stroke.retracted,
    extended,
    samples: stroke.samples,
    valid: stroke.valid,
    missed: facts.missesItsOwnMember,
  })
);

// A full cycle, frame by frame: the fused body rides the rigid move every
// solved frame gets, so no seam may open between it and the rest of the skin.
const cycle = [];
for (let frame = 0; frame < 12; frame++) {
  await page.evaluate(
    (at) => {
      const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      m.animate(Math.round((at.frame / 12) * at.samples), false);
    },
    { frame, samples: stroke.samples }
  );
  await page.waitForTimeout(90);
  const each = await renderFacts();
  cycle.push({
    frame,
    missed: each.missesItsOwnMember.length,
    foreign: each.coversAForeignRam.length,
    twice: each.bodiesDrawnTwice.length,
    leaks: each.interiorsDrawn.length,
  });
  await film.shot(`cycle-${String(frame).padStart(2, '0')}`);
}
check(
  'through a whole cycle the fused body never lets go of its member',
  cycle.every((one) => one.missed === 0 && one.foreign === 0 && one.twice === 0 && one.leaks === 0),
  JSON.stringify(cycle.filter((one) => one.missed || one.foreign || one.twice || one.leaks))
);
await contactSheet(`${OUT}/*cycle-*.png`, `${OUT}/sheet-cycle.png`, 4);
await contactSheet(`${OUT}/*stroke-*.png`, `${OUT}/sheet-stroke.png`, 2);

// ------------------------------------------------- two zooms, one narrow window
console.log('\ntwo zoom levels and a narrow window');
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.svgGrid.zoomIn();
  grid.svgGrid.zoomIn();
});
await page.waitForTimeout(400);
await film.shot('zoom-in');
facts = await renderFacts();
check(
  'zoomed in, nothing has doubled and nothing hidden has appeared',
  facts.interiorsDrawn.length === 0 &&
    facts.sealsMissing.length === 0 &&
    facts.bodiesDrawnTwice.length === 0,
  JSON.stringify(facts.interiorsDrawn.concat(facts.sealsMissing, facts.bodiesDrawnTwice))
);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.svgGrid.zoomOut();
  grid.svgGrid.zoomOut();
  grid.svgGrid.zoomOut();
  grid.svgGrid.zoomOut();
});
await page.waitForTimeout(400);
await film.shot('zoom-out');
facts = await renderFacts();
check(
  'zoomed out, the same',
  facts.interiorsDrawn.length === 0 &&
    facts.sealsMissing.length === 0 &&
    facts.bodiesDrawnTwice.length === 0,
  JSON.stringify(facts.interiorsDrawn.concat(facts.sealsMissing, facts.bodiesDrawnTwice))
);

await page.setViewportSize({ width: 420, height: 900 });
await page.waitForTimeout(600);
await film.shot('narrow');
facts = await renderFacts();
check(
  'and on a narrow window the drawing is still one of everything',
  facts.interiorsDrawn.length === 0 &&
    facts.sealsMissing.length === 0 &&
    facts.bodiesDrawnTwice.length === 0 &&
    facts.bodiesNotDrawn.length === 0,
  JSON.stringify(facts)
);
await page.setViewportSize({ width: 1600, height: 1000 });
await contactSheet(`${OUT}/*zoom-*.png`, `${OUT}/sheet-zoom.png`, 2);

// ------------------------------------------------------------ bracket colors
console.log('\nthe bracket’s own color');
ids = await draw('colors');
for (const [name, fill] of [
  ['teal', '#1f8a80'],
  ['amber', '#c47f18'],
]) {
  await page.evaluate(
    (paint) => {
      const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const compound = m.links.find((l) => (l.subset ?? []).length > 0);
      compound.fill = paint.fill;
      m.updateMechanism(false);
    },
    { fill }
  );
  await page.waitForTimeout(400);
  await film.shot(`color-${name}`);
}
const colored = await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const compound = m.links.find((l) => (l.subset ?? []).length > 0);
  const ram = m.sealedStructures()[0];
  const skin = document.querySelector(`[id="${compound.id}"]`);
  const barrel = document.querySelector('.cylinder-mark .cylinder-barrel');
  return {
    compound: compound.fill,
    // The rod is the welded member here, so the body's color is what it wears.
    welded: ram.rodRoot.id === compound.id,
    painted: skin?.getAttribute('fill') ?? null,
    barrelPainted: barrel?.getAttribute('fill') ?? null,
    barrelStored: ram.barrel.fill,
  };
});
check(
  'a repainted bracket carries the member welded into it, and nothing else',
  colored.compound === '#c47f18' &&
    colored.welded &&
    colored.painted === '#c47f18' &&
    colored.barrelPainted === colored.barrelStored &&
    colored.barrelPainted !== '#c47f18',
  JSON.stringify(colored)
);
await contactSheet(`${OUT}/*color-*.png`, `${OUT}/sheet-colors.png`, 2);

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
