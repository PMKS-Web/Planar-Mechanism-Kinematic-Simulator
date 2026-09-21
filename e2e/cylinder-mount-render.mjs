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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-mount-render';
/** Where the Slide sheets go, which is what a reader of this fix looks at. */
const SLIDE_OUT = 'artifacts/slide-fusion';

/**
 * The reported drawing, read out of the spec's own source rather than copied.
 *
 * `src/test-utils/verification/slide-fusion-scene.ts` is the one place that
 * string lives, and the unit spec decodes the same characters this opens.
 * Anchored on the name because the comment above it is full of apostrophes.
 */
const SLIDE_FUSION_PAYLOAD = readFileSync(
  'src/test-utils/verification/slide-fusion-scene.ts',
  'utf8'
).match(/SLIDE_FUSION_PAYLOAD[^']*'([^']+)'/)[1];

const results = [];
const consoleErrors = [];
/**
 * Facts recorded rather than asserted: what the drawing does with a state the
 * model has not settled yet. Printed and kept in the report, so the evidence is
 * in the artifact rather than in somebody's memory.
 */
const notes = [];
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
      } else if (which === 'floating-slide') {
        // A barrel mount riding another bar's slot, held against it: a
        // *floating* Slide rather than a grounded one. The plate has the same
        // work to do there and is built in the same frame, so it is worth
        // seeing rather than assumed from the grounded case.
        const one = ram({ x: -1 * S, y: 1 * S }, { x: 5 * S, y: 1 * S });
        const rail = m.addBar({ x: -5 * S, y: -3 * S }, { x: 1 * S, y: 1.5 * S });
        note.cut = m.cutSlotOn(one.mountA, {
          carrier: rail,
          a: rail.joints[0],
          b: rail.joints[1],
          x: (rail.joints[0].x + rail.joints[1].x) / 2,
          y: (rail.joints[0].y + rail.joints[1].y) / 2,
        });
        const mountId = one.mountA.id;
        weld(m.joints.find((j) => j.id === mountId));
        note.slide = mountId;
      } else if (which === 'running-slide') {
        // A ram whose barrel mount is a grounded Slide, its rod mount a ground
        // pin on the same line, driven at the seal: the barrel slides out of
        // its own block as the part extends. The one arrangement of a Slide at
        // a cylinder end that actually runs -- a Slide fixes the member's
        // angle, so anything that would turn the part is over-constrained --
        // and it is what says the plate rides the member rather than being
        // rebuilt a frame behind it.
        const one = ram({ x: -4 * S, y: 0 }, { x: 2 * S, y: 0 });
        ground(one.mountB);
        const mountId = one.mountA.id;
        // By letter between the calls, for the reason `two-blocks` gives above.
        block(m.joints.find((j) => j.id === mountId));
        ground(m.joints.find((j) => j.id === mountId));
        weld(m.joints.find((j) => j.id === mountId));
        note.slide = mountId;
        pick(m.sealedStructures()[0].seal);
        m.adjustInput();
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
      } else if (
        which === 'two-rods' ||
        which === 'two-barrels' ||
        which === 'chain-forward' ||
        which === 'chain-back'
      ) {
        // The four shapes a shared body can take, each with an unwelded
        // cylinder and a plain bar beside it to be read against (decision S24).
        // Every head in the scene has to come out the same color as the lone
        // one's, whichever cylinders are sharing which body.
        const live = (id) => m.joints.find((j) => j.id === id);
        const joinUp = (from, to) => {
          const bar = m.addBarFrom(from, { x: to.x + 0.4 * S, y: to.y + 0.4 * S });
          m.mergeJoints(far(bar, from), to);
        };
        if (which === 'two-rods') {
          // Two rod ends welded to one bar: the body holds two rods, so it
          // belongs after both heads.
          const one = ram({ x: -6 * S, y: 2 * S }, { x: -2 * S, y: 2 * S });
          const two = ram({ x: -6 * S, y: -2 * S }, { x: -2 * S, y: -2 * S });
          joinUp(one.mountB, two.mountB);
          weld(live(one.mountB.id));
          weld(live(two.mountB.id));
        } else if (which === 'two-barrels') {
          // The mirror: one bracket holding two barrels, before both heads.
          const one = ram({ x: -2 * S, y: 2 * S }, { x: 2 * S, y: 2 * S });
          const two = ram({ x: -2 * S, y: -2 * S }, { x: 2 * S, y: -2 * S });
          joinUp(one.mountA, two.mountA);
          weld(live(one.mountA.id));
          weld(live(two.mountA.id));
        } else {
          // A chain: one cylinder's rod mount is the next one's barrel mount.
          // Drawn both ways round, because which of the two the canvas builds
          // first is exactly what used to decide whether the drawing was right
          // -- `chain-back` is the order that came out wrong.
          const first = ram({ x: -6 * S, y: 0 }, { x: -2 * S, y: 0 });
          const shared =
            which === 'chain-forward'
              ? ram({ x: -2 * S, y: 0 }, { x: 2 * S, y: 2 * S }, first.mountB)
              : undefined;
          if (!shared) {
            const second = ram({ x: -1.6 * S, y: 0.3 * S }, { x: 2 * S, y: 2 * S });
            m.mergeJoints(live(second.mountA.id), live(first.mountB.id));
          }
          m.addBarFrom(live(first.mountB.id), { x: -3 * S, y: 3 * S });
          weld(live(first.mountB.id));
        }
        // The control, clear of the welded pair and of the cards along the
        // bottom of the window: one cylinder nothing is welded to, and one
        // plain bar pinned to its rod end. Horizontal, so the plain bar's
        // drawn height is its own width and nothing else.
        const lone = ram({ x: 1 * S, y: 3.2 * S }, { x: 5 * S, y: 3.2 * S });
        const plain = m.addBarFrom(lone.mountB, {
          x: lone.mountB.x + 2 * S,
          y: lone.mountB.y,
        });
        note.control = lone.seal.id;
        // By its far joint rather than by the link's id, which is built from
        // the letters and so is not a name to hold on to across a rebuild.
        note.plainTip = far(plain, lone.mountB).id;
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
    recipe === 'shared-mount' ? 2 : /^(two-rods|two-barrels|chain-)/.test(recipe) ? 3 : 1
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
        // Which layer drew it: the links layer, or the skin's own paint order,
        // where a fused body is a step of its own (decision S24) rather than a
        // child of one cylinder's group.
        inCylinderLayer: !!el?.closest('.cylinder-fused'),
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

// ------------------------------- a Slide at a cylinder's end (decision S18)
//
// The same question one joint further out. A weld makes a member part of a
// bracket; a Slide at its end joint makes it part of that slider's weld plate,
// and the plate was built from the thin bar the member's two joints describe
// rather than from the part the skin draws. The maintainer's own drawing has
// all four cases on it left to right, so it is what this opens.
console.log('\na Slide at a cylinder’s end fuses with what is drawn there');
const slideFilm = filmstrip(page, `${SLIDE_OUT}/frames`);

/** What is painted at each reported joint, and whether anything is painted twice. */
const slideFacts = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    /** Every painted body of the drawing under one screen point, topmost first. */
    const paintedAt = (x, y) =>
      document
        .elementsFromPoint(x, y)
        .filter((el) => el.tagName === 'path' && el.closest('#linkHolder, #sliderHolder'))
        .filter((el) => {
          const fill = el.getAttribute('fill');
          return !!fill && fill !== 'none' && fill !== 'transparent';
        })
        .map((el) => ({
          id: el.id || null,
          cls: el.getAttribute('class'),
          fill: el.getAttribute('fill'),
        }));
    /**
     * A point on `selector` clear of the slider's own block.
     *
     * The block is painted black under its plate on purpose, so a point over it
     * counts two bodies and says nothing. Out along the member instead, at the
     * first spot where the browser's own hit test names the element asked for.
     */
    const spotOn = (selector, blockSelector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const block = document.querySelector(blockSelector)?.getBoundingClientRect();
      const spread = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
      for (const fy of spread) {
        for (const fx of spread) {
          const x = box.x + box.width * fx;
          const y = box.y + box.height * fy;
          if (block && x > block.x && x < block.right && y > block.y && y < block.bottom) continue;
          if (document.elementFromPoint(x, y) === el) return { x, y };
        }
      }
      return null;
    };
    const blockOf = (id) => `g[data-slider="${id}"] .slider-block path`;
    const shapeOf = (id) => {
      const el = document.querySelector(`[id="${id}"]`);
      const d = el?.getAttribute('d') ?? '';
      return {
        painted: document.querySelectorAll(`[id="${id}"]`).length,
        // One closed loop is one body; two is a part beside its block.
        rings: (d.match(/Z/g) ?? []).length,
        // A fillet is the one curve `buildCompoundPath` emits.
        fillets: (d.match(/Q/g) ?? []).length,
        fill: el?.getAttribute('fill') ?? null,
        // Which layer drew it: a plate the skin paints sits in both.
        inPlate: !!el?.closest('.slider-plate'),
        inCylinderLayer: !!el?.closest('.cylinder-fused'),
      };
    };
    const cylinderOf = (sealId) => grid.cylinderList.find((one) => one.id === sealId);
    const over = (selector, blockId) => {
      const spot = spotOn(selector, blockOf(blockId));
      return spot ? paintedAt(spot.x, spot.y) : null;
    };
    return {
      // D: the barrel's mount is a Prismatic slider. One plate, in the barrel's
      // own ink, and nothing else painted over the barrel.
      D: {
        ...shapeOf('DD1'),
        drawnInk: cylinderOf('F')?.barrelFill ?? null,
        over: over('.cylinder-member-hit[data-member="DD1"]', 'D'),
      },
      // K: the rod's end joint. Same again one layer up the stack.
      K: {
        ...shapeOf('KL'),
        drawnInk: cylinderOf('L')?.rodFill ?? null,
        over: over('.cylinder-member-hit[data-member="KL"]', 'K'),
      },
      // O: a rod welded into a body, whose end joint is a Slide. The plate is
      // the body fused with the block, and it is the body's light green.
      O: {
        ...shapeOf('NOP'),
        drawnInk: grid.mechanismSrv.links.find((l) => l.id === 'NOP')?.fill ?? null,
        over: over('.cylinder-member-hit[data-member="NO"]', 'O'),
      },
      // G: a Pin-in-slot fuses nothing. No plate, and no plain bar hoisted
      // above the block -- the bar that used to show through the barrel.
      G: {
        riders: document.querySelectorAll('[id="GG1__rider"]').length,
        plates: document.querySelectorAll('g[data-slider="G"] .slider-plate').length,
        barrelPainted: document.querySelectorAll('[data-cylinder="I"] .cylinder-barrel').length,
        over: over('[data-cylinder="I"] .cylinder-barrel', 'G'),
      },
      // Nothing anywhere carries two elements with the same id.
      idsTwice: grid.mechanismSrv.links
        .filter((l) => document.querySelectorAll(`[id="${l.id}"]`).length > 1)
        .map((l) => l.id),
    };
  });

/** Every reported joint cropped large, for the sheet a reader compares. */
async function shotEachJoint(tag) {
  const boxes = await page.evaluate(() =>
    ['D', 'G', 'K', 'O'].map((id) => {
      const el = document.querySelector(`[id="joint_${id}"]`);
      const box = el?.getBoundingClientRect();
      return box ? { id, x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    })
  );
  for (const at of boxes) {
    if (!at) continue;
    await page.screenshot({
      path: `${SLIDE_OUT}/frames/${tag}-${at.id}.png`,
      clip: {
        x: Math.max(0, at.x - 120),
        y: Math.max(0, at.y - 120),
        width: 240,
        height: 240,
      },
    });
  }
}

await page.goto(`${BASE}/?${SLIDE_FUSION_PAYLOAD}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(400);
let slide = await slideFacts();
await slideFilm.shot('reported');
await shotEachJoint('case');

for (const id of ['D', 'K', 'O']) {
  const one = slide[id];
  check(
    `${id}: one painted body, one closed outline, filleted onto the block`,
    one.painted === 1 && one.rings === 1 && one.fillets > 0,
    JSON.stringify(one)
  );
  check(
    `${id}: painted in the ink that part is drawn in, in the member's place in the stack`,
    one.fill === one.drawnInk && one.inPlate && one.inCylinderLayer,
    JSON.stringify({ fill: one.fill, drawn: one.drawnInk, plate: one.inPlate })
  );
  check(
    `${id}: nothing is painted twice over the part`,
    Array.isArray(one.over) && one.over.length === 1,
    JSON.stringify(one.over)
  );
}
check(
  'O’s plate is the body’s own light green, which is the whole of that report',
  slide.O.fill === '#B2DFDB',
  JSON.stringify({ fill: slide.O.fill })
);
check(
  'G fuses nothing: no plate, no inner bar, and the barrel drawn once by the skin',
  slide.G.riders === 0 &&
    slide.G.plates === 0 &&
    slide.G.barrelPainted === 1 &&
    Array.isArray(slide.G.over) &&
    slide.G.over.length === 1,
  JSON.stringify(slide.G)
);
check(
  'and no body in the drawing carries two elements with its id',
  slide.idsTwice.length === 0,
  JSON.stringify(slide.idsTwice)
);

// Selected: the member's own region still selects the member, and the joint is
// still reachable (decision S12, rule 4 of the package).
let picked = await selects('.cylinder-member-hit[data-member="KL"]');
check(
  'a click on the fused rod selects the rod, not the body under it',
  picked.type === 'Link' && picked.id === 'KL',
  JSON.stringify(picked)
);
await slideFilm.shot('member-selected');
await shotEachJoint('selected-member');
// A Slide's block is covered by its own plate and has been since plates
// existed -- that is what fusing the two means, and the short notes say so. The
// joint is reached on its own mark instead, which is where every joint is
// reached. A Pin-in-slot fuses nothing, so there the block is still the handle.
picked = await selects('[id="joint_K"]');
check(
  'the Slide’s own cream bar selects the slider',
  picked.type === 'Joint' && picked.id === 'K',
  JSON.stringify(picked)
);
picked = await selects('g[data-slider="G"] .slider-block path');
check(
  'and a Pin-in-slot’s block still grabs its slider',
  picked.type === 'Joint' && picked.id === 'G',
  JSON.stringify(picked)
);
await slideFilm.shot('slider-selected');

// Dragged: a plate is rebuilt from where its rider is now, so it has to follow
// the member through every pose rather than lagging the frame behind it.
const dragged = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((one) => one.id === 'E');
  const box = document.querySelector('[id="joint_E"]').getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, from: { x: joint.x, y: joint.y } };
});
await page.mouse.move(dragged.x, dragged.y);
await page.mouse.down();
for (let step = 1; step <= 12; step++) {
  await page.mouse.move(dragged.x + step * 9, dragged.y + step * 5);
  await page.waitForTimeout(30);
  await slideFilm.shot('drag');
}
await page.mouse.up();
await page.waitForTimeout(350);
slide = await slideFacts();
check(
  'after a drag the barrel’s plate is still one fused body in the barrel’s ink',
  slide.D.painted === 1 && slide.D.rings === 1 && slide.D.fill === slide.D.drawnInk,
  JSON.stringify(slide.D)
);
check(
  'and the drag opened no seam: still one painted body over each part',
  ['D', 'K', 'O'].every((id) => Array.isArray(slide[id].over) && slide[id].over.length === 1),
  JSON.stringify(['D', 'K', 'O'].map((id) => slide[id].over?.length ?? null))
);
await shotEachJoint('dragged');
await contactSheet(`${SLIDE_OUT}/frames/case-*.png`, `${SLIDE_OUT}/sheet-cases.png`, 4);
await contactSheet(`${SLIDE_OUT}/frames/dragged-*.png`, `${SLIDE_OUT}/sheet-dragged.png`, 4);
await contactSheet(
  `${SLIDE_OUT}/frames/selected-member-*.png`,
  `${SLIDE_OUT}/sheet-selected.png`,
  4
);
await contactSheet(`${SLIDE_OUT}/frames/*-drag.png`, `${SLIDE_OUT}/sheet-drag-film.png`, 4, 0.45);

// Running: the one arrangement of a Slide at a cylinder end that solves, taken
// through a whole cycle. A plate frozen at the design pose slides out from
// under the part over a revolution, and no still frame would show it.
const slideRun = await draw('running-slide');
check(
  'the running Slide-ended ram solves',
  slideRun.samples > 100,
  JSON.stringify({ samples: slideRun.samples, slide: slideRun.slide, members: slideRun.members })
);
const slideCycle = [];
// Cropped to the ram rather than the window: a twelfth of a 1600px frame is
// too small to see a seam in, which is the one thing this filmstrip is for.
const ramClip = await page.evaluate(() => {
  const skin = document.querySelector('.cylinder-mark').getBoundingClientRect();
  return { x: Math.max(0, skin.x - 130), y: Math.max(0, skin.y - 90), width: 700, height: 220 };
});
for (let frame = 0; frame < 12; frame++) {
  await page.evaluate(
    (at) => {
      const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      m.animate(Math.round((at.frame / 12) * at.samples), false);
    },
    { frame, samples: slideRun.samples }
  );
  await page.waitForTimeout(110);
  await page.screenshot({
    path: `${SLIDE_OUT}/frames/cycle-${String(frame).padStart(2, '0')}.png`,
    clip: ramClip,
  });
  slideCycle.push(
    await page.evaluate(
      (at) => {
        const el = document.querySelector(`[id="${at.body}"]`);
        const d = el?.getAttribute('d') ?? '';
        const box = el?.getBoundingClientRect();
        const block = document
          .querySelector(`g[data-slider="${at.slide}"] .slider-block path`)
          ?.getBoundingClientRect();
        return {
          painted: document.querySelectorAll(`[id="${at.body}"]`).length,
          rings: (d.match(/Z/g) ?? []).length,
          // The plate has to stay on the block it is fused to: one left at the
          // design pose walks away from it as the part travels, and no single
          // frame would show that.
          onItsBlock: !!box && !!block && box.x <= block.x + 2 && box.right >= block.right - 2,
        };
      },
      { body: slideRun.members[0], slide: slideRun.slide }
    )
  );
}
const seamless = (one) => one.painted === 1 && one.rings === 1 && one.onItsBlock;
check(
  'through a whole cycle the plate is one body, once, and never leaves its block',
  slideCycle.every(seamless),
  JSON.stringify(slideCycle.filter((one) => !seamless(one)))
);
await contactSheet(`${SLIDE_OUT}/frames/cycle-*.png`, `${SLIDE_OUT}/sheet-cycle.png`, 3);

// Floating, not grounded: the same plate on a slider riding another bar's slot.
const floating = await draw('floating-slide');
await slideFilm.shot('floating');
const afloat = await page.evaluate(
  (at) => {
    const el = document.querySelector(`[id="${at.body}"]`);
    const d = el?.getAttribute('d') ?? '';
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((one) => one.id === at.slide);
    return {
      painted: document.querySelectorAll(`[id="${at.body}"]`).length,
      rings: (d.match(/Z/g) ?? []).length,
      fillets: (d.match(/Q/g) ?? []).length,
      inPlate: !!el?.closest('.slider-plate'),
      floating: joint?.isFloating === true && joint?.ground !== true,
      prismatic: joint?.rotates === false,
    };
  },
  { body: floating.members[0], slide: floating.slide }
);
check(
  'a floating Slide at a barrel mount fuses the same way a grounded one does',
  afloat.painted === 1 && afloat.rings === 1 && afloat.fillets > 0 && afloat.inPlate,
  JSON.stringify(afloat)
);
check(
  'and it really is floating and really is Prismatic',
  afloat.floating && afloat.prismatic,
  JSON.stringify({ floating: afloat.floating, prismatic: afloat.prismatic })
);
await contactSheet(`${SLIDE_OUT}/frames/*floating*.png`, `${SLIDE_OUT}/sheet-floating.png`, 1);

// ------------------------------- one body holding BOTH members of one cylinder
//
// The maintainer's drawing: a ram from C to D with a bar at each mount, the two
// bars pinned at F. Weld F and the triangle becomes one rigid body holding the
// barrel *and* the rod. "It should still be allowed in the sense that it
// shouldn't visually break the app, even though it will never simulate."
//
// What is asked here is the drawing: every bar of the body painted, once, in
// the same place before and after, and the same again when the weld is taken
// back. The two things that are *not* asked are noted at the end -- they are a
// model decision, made a long way from anything that paints.
const BOTH_ENDS_OUT = 'artifacts/cylinder-both-ends';
const bothEnds = filmstrip(page, `${BOTH_ENDS_OUT}/frames`);
const BOTH_ENDS_PAYLOAD =
  '2v.2_,1E8.5,0.1011.8C,C,0e3,Y4,0.0C1,C1,0W8,ZA,0.8D,D,0N8,aQ,0.fE,E,0UR,ZP,0,CC1F,C,C1.0F,F,' +
  '0W8,RF,0..ARCC1F,CC1F,0,0,0a6,We,303e9f,C,C1,F,,CC1,CF.ARDEF,DEF,0,0,0RD,Xt,303e9f,E,D,F,,DE,' +
  'DF.aRCC1,CC1,0,0,0a6,Yd,303e9f,C,C1,,.aRCF,CF,0,0,0a5,Ug,c5cae9,C,F,,.aRDE,DE,0,0,0Qn,Zw,' +
  '303e9f,E,D,,.aRDF,DF,0,0,0Re,Vr,303e9f,D,F,,...N_D*3spB6m';

/**
 * How many painted bodies cover the middle of each bar, and where the seal's
 * furniture is standing.
 *
 * A count rather than a look, because the two ways this breaks are both counts:
 * a bar nothing draws reads 0 -- which is what the rod did, drawn neither by a
 * skin that had stopped resolving nor by the body that had swallowed it -- and
 * a bar two passes draw reads 2, which is the same part over itself at 0.7
 * alpha. Hit paths are transparent and are not bodies, so they are left out.
 */
const bodiesOverEachBar = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const joint = (id) => srv.joints.find((one) => one.id === id);
    const middle = (a, b) => {
      const [from, to] = [joint(a), joint(b)];
      const at = Object.assign(Object.create(Object.getPrototypeOf(from)), from, {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
      });
      const on = grid.svgGrid.modelToScreen(at);
      return { x: on.x, y: on.y };
    };
    const painted = (node) => {
      const fill = node.getAttribute('fill');
      return node.tagName === 'path' && fill !== null && fill !== 'none' && fill !== 'transparent';
    };
    const over = {};
    for (const [name, a, b] of [
      ['barrel', 'C', 'C1'],
      ['barrel-side bar', 'C', 'F'],
      ['rod-side bar', 'D', 'F'],
      ['rod', 'D', 'E'],
    ]) {
      const at = middle(a, b);
      over[name] = document.elementsFromPoint(at.x, at.y).filter(painted).length;
    }
    const box = (selector) => {
      const found = document.querySelector(selector)?.getBoundingClientRect();
      return found ? { x: Math.round(found.x), y: Math.round(found.y) } : null;
    };
    return {
      over,
      bodies: srv.getLinks().map((one) => one.id),
      cylinders: srv.sealedStructures().length,
      // The seal's own furniture: the black head and the cream bar that says
      // its riders cannot turn against the slot.
      block: box('.cylinder-seal') ?? box('.slider-block path'),
      slideBar: box('.slideMark'),
    };
  });

await page.goto(`${BASE}/?${BOTH_ENDS_PAYLOAD}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(600);
await bothEnds.shot('before-weld');
const triangle = await bodiesOverEachBar();
check(
  'the maintainer’s triangle opens as two bodies with a ram down one side',
  triangle.cylinders === 1 && triangle.bodies.length === 2,
  JSON.stringify({ cylinders: triangle.cylinders, bodies: triangle.bodies })
);
check(
  'and every bar of it is painted exactly once',
  Object.values(triangle.over).every((count) => count === 1),
  JSON.stringify(triangle.over)
);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((one) => one.id === 'F'));
});
await page.waitForTimeout(400);
await page.locator('app-edit-panel segmented-block button', { hasText: 'Welded' }).first().click();
await page.waitForTimeout(900);
await bothEnds.shot('welded');
const fused = await bodiesOverEachBar();
check('welding F leaves one rigid body', fused.bodies.length === 1, JSON.stringify(fused.bodies));
check(
  'and it draws every bar it is made of, exactly once — the rod included',
  Object.values(fused.over).every((count) => count === 1),
  JSON.stringify(fused.over)
);
check(
  'the seal’s head and its cream bar stay where they were',
  !!fused.block &&
    !!fused.slideBar &&
    Math.abs(fused.block.x - triangle.block.x) <= 2 &&
    Math.abs(fused.block.y - triangle.block.y) <= 2 &&
    Math.abs(fused.slideBar.x - triangle.slideBar.x) <= 2,
  JSON.stringify({ was: triangle.block, now: fused.block })
);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((one) => one.id === 'F'));
});
await page.waitForTimeout(400);
await page
  .locator('app-edit-panel segmented-block button', { hasText: 'Revolute' })
  .first()
  .click();
await page.waitForTimeout(900);
await bothEnds.shot('unwelded');
const apart = await bodiesOverEachBar();
check(
  'taking the weld back gives the two bodies back',
  apart.bodies.length === 2 && apart.bodies.join(',') === triangle.bodies.join(','),
  JSON.stringify(apart.bodies)
);
check(
  'and every bar is still painted exactly once',
  Object.values(apart.over).every((count) => count === 1),
  JSON.stringify(apart.over)
);

// The weld, again, and then a reload of the URL it writes.
//
// These two were notes rather than checks while the drawing did not come back:
// welding F put the seal inside its own carrier, `isSlotWellFormed` said no,
// `reconcileSlots` detached a bore nothing can invent back, and the URL that
// then went out was one the codec refuses ("URL seals a joint that is not a
// floating slider"), so a reload, a share or an undo opened an empty grid. The
// question is asked of the bar the slot is cut in now -- a barrel never holds
// the seal -- so a welded triangle stays a cylinder and both of these are
// ordinary checks.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((one) => one.id === 'F'));
});
await page.waitForTimeout(400);
await page.locator('app-edit-panel segmented-block button', { hasText: 'Welded' }).first().click();
await page.waitForTimeout(900);
const weldedUrl = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
);
const before = consoleErrors.length;
await page.goto(`${BASE}/?${weldedUrl}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(700);
await bothEnds.shot('reloaded');
const reopened = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return {
    joints: srv.joints.length,
    bodies: srv.getLinks().length,
    cylinders: srv.sealedStructures().length,
  };
});
const whileReloading = consoleErrors.splice(before);
check(
  'the welded drawing’s own URL decodes again, as the cylinder it was',
  reopened.joints > 0 && reopened.cylinders === 1 && whileReloading.length === 0,
  JSON.stringify({ reopened, threw: whileReloading.slice(0, 1) })
);
check(
  'unwelding F gives the ram back',
  apart.cylinders === 1,
  `cylinders after the unweld: ${apart.cylinders}`
);
notes.forEach((one) => console.log(`  ${one.ok ? 'PASS' : 'NOTE'}  ${one.label} — ${one.detail}`));
// Whatever the URL carries, the app comes up: a drawing or a message about
// one, never a blank window. The canvas and the strip are asked for in the DOM
// rather than for visibility -- both are hosts whose own box is empty, because
// what they hold is positioned -- and the Edit tab is asked for on screen,
// which is the part a reader would be looking at.
check(
  'the app comes up either way, with its canvas and its strip',
  (await page.evaluate(
    () => !!document.querySelector('app-new-grid') && !!document.querySelector('app-top-bar')
  )) && (await page.locator('.tabButton', { hasText: 'Edit' }).first().isVisible())
);
await contactSheet(`${BOTH_ENDS_OUT}/frames/*.png`, `${BOTH_ENDS_OUT}/sheet.png`, 2);

// ------------------------------ one paint order for the whole drawing (S24)
//
// The stack is barrel, black head, rod, and the rod over the head at 0.7 alpha
// is what makes the head read as the darker band that says how much rod is
// still in the bore. Painted per cylinder, a body two cylinders share landed
// inside one of their stacks and outside the other's: the reported scene came
// out with one head bare `#000`. So the order is asked of the whole drawing,
// and every head in a scene has to read exactly as the lone cylinder's does.

/**
 * Where each piece of each cylinder is painted, as an index into the skin
 * layer's own document order, plus a point on each head that is black rather
 * than cream.
 *
 * A member's paint is its own path when nothing has swallowed it, and the
 * fused body's otherwise -- found through the member's hit path, which is the
 * one thing inside a fused group that names the member it stands in for.
 */
const skinLayout = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const painted = [
      ...document.querySelectorAll(
        '#sliderHolder .cylinder-barrel, #sliderHolder .cylinder-seal,' +
          ' #sliderHolder .cylinder-rod, #sliderHolder .cylinder-body'
      ),
    ];
    const bodyHolding = (memberId) =>
      document
        .querySelector(`.cylinder-member-hit[data-member="${memberId}"]`)
        ?.closest('.cylinder-fused')
        ?.querySelector('.cylinder-body');
    return grid.cylinderList.map((cyl) => {
      const group = document.querySelector(`.cylinder-mark[data-cylinder="${cyl.id}"]`);
      const own = (selector) => group?.querySelector(selector);
      const head = own('.cylinder-seal');
      const rodPaint = own('.cylinder-rod') ?? bodyHolding(cyl.rodId);
      // Past the seal's own cream mark and short of the end cap: the middle of
      // a head is the mark in every scene and says nothing.
      const at = head
        ? new DOMPoint(cyl.headAlongHalf * 0.8, 0).matrixTransform(head.getScreenCTM())
        : null;
      return {
        id: cyl.id,
        barrel: painted.indexOf(own('.cylinder-barrel') ?? bodyHolding(cyl.barrelId)),
        head: painted.indexOf(head),
        rod: painted.indexOf(rodPaint),
        // The ink whatever paints this rod is painted in, which is what the
        // head underneath has to read as once the skin's alpha is applied.
        rodInk: rodPaint?.getAttribute('fill') ?? null,
        x: at ? at.x : null,
        y: at ? at.y : null,
      };
    });
  });

/** The pixel actually on the glass at each point, as `#rrggbb`. */
async function pixelsAt(spots) {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, points]) => {
      const img = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${data}`)).blob()
      );
      const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d');
      ctx.drawImage(img, 0, 0);
      return points.map((point) => {
        if (point.x === null) return null;
        const [r, g, b] = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
        return `#${[r, g, b].map((one) => one.toString(16).padStart(2, '0')).join('')}`;
      });
    },
    [shot, spots]
  );
}

/** A `#rrggbb` ink at the skin's own 0.7 fill alpha, laid on the black head. */
function overBlack(ink) {
  const channels = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(ink ?? '');
  if (!channels) return null;
  return (
    '#' +
    channels
      .slice(1)
      .map((one) =>
        Math.round(parseInt(one, 16) * 0.7)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

/** The largest per-channel difference between two `#rrggbb` inks. */
function channelGap(saw, want) {
  if (!saw || !want) return 255;
  const of = (ink) => [1, 3, 5].map((at) => parseInt(ink.slice(at, at + 2), 16));
  return Math.max(...of(saw).map((one, at) => Math.abs(one - of(want)[at])));
}

const ORDER_OUT = 'artifacts/cylinder-paint-order';
mkdirSync(`${ORDER_OUT}/frames`, { recursive: true });
let lastScene;
for (const scene of ['two-rods', 'two-barrels', 'chain-forward', 'chain-back']) {
  const drawn = await draw(scene);
  lastScene = drawn;
  await page.screenshot({ path: `${ORDER_OUT}/frames/${scene}.png` });
  const layout = await skinLayout();
  const inks = await pixelsAt(layout);
  const wrongWay = layout.filter((one) => !(one.barrel < one.head && one.head < one.rod));
  check(
    `${scene}: every cylinder paints barrel, then head, then rod`,
    layout.length === 3 && wrongWay.length === 0,
    JSON.stringify(layout.map(({ id, barrel, head, rod }) => ({ id, barrel, head, rod })))
  );
  // Exactly one 0.7 layer of that rod's own ink over the black head -- which
  // is the band, and is what the lone cylinder beside them reads as. A head
  // nothing covers comes out `#000`, and one covered twice comes out pale.
  const reading = layout.map((one, at) => ({
    id: one.id,
    saw: inks[at],
    want: overBlack(one.rodInk),
  }));
  const off = reading.filter((one) => channelGap(one.saw, one.want) > 4);
  check(
    `${scene}: every head is its own rod's ink at the skin's alpha`,
    layout.length === 3 && off.length === 0,
    JSON.stringify(reading)
  );

  // And a click still reaches what it visibly lands on. Reordering the layer
  // moved the seal's hit area and the member hits into a pass of their own,
  // so the four things a reader can pick are asked for by name.
  const targets = await page.evaluate(() => {
    const withBarrel = [...document.querySelectorAll('.cylinder-mark')].find((group) =>
      group.querySelector('.cylinder-barrel')
    );
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const seal = withBarrel?.getAttribute('data-cylinder') ?? null;
    return {
      seal,
      barrel: grid.cylinderList.find((one) => one.id === seal)?.barrelId ?? null,
      body: document.querySelector('.cylinder-fused')?.getAttribute('data-body') ?? null,
      member: document.querySelector('.cylinder-member-hit')?.getAttribute('data-member') ?? null,
    };
  });
  const picked = {
    barrel: await selects(`.cylinder-mark[data-cylinder="${targets.seal}"] .cylinder-barrel`),
    seal: await selects(`.cylinder-overlay[data-cylinder="${targets.seal}"] .cylinder-seal-hit`),
    body: await selects(`.cylinder-fused[data-body="${targets.body}"] .cylinder-body`),
    member: await selects(`.cylinder-member-hit[data-member="${targets.member}"]`),
  };
  check(
    `${scene}: a click still selects what it lands on`,
    picked.barrel.id === targets.barrel &&
      picked.seal.type === 'Joint' &&
      picked.seal.id === targets.seal &&
      picked.body.id === targets.body &&
      picked.member.id === targets.member,
    JSON.stringify({ targets, picked })
  );
}

// And the one width, measured where the maintainer sees it: an ordinary bar
// pinned to a rod's end joint, both horizontal, both drawn with the same
// stroke -- so the two screen heights are the two half-widths and nothing else
// (decision S23).
const widths = await page.evaluate(
  ([tip, control]) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const bar = grid.mechanismSrv.links.find(
      (link) => link.joints.length === 2 && link.joints.some((joint) => joint.id === tip)
    );
    const height = (el) => (el ? +el.getBoundingClientRect().height.toFixed(2) : null);
    return {
      bar: height(document.querySelector(`#linkHolder [id="${bar?.id}"]`)),
      rod: height(
        document.querySelector(`.cylinder-mark[data-cylinder="${control}"] .cylinder-rod`)
      ),
    };
  },
  [lastScene.plainTip, lastScene.control]
);
check(
  'a bar is drawn exactly as thick as a cylinder’s rod',
  widths.bar !== null && widths.rod !== null && Math.abs(widths.bar - widths.rod) <= 0.1,
  JSON.stringify(widths)
);
// The frames sit in their own directory, as the Slide section's do: the sheet
// lands beside them, and a second run would otherwise tile the first's sheet.
await contactSheet(`${ORDER_OUT}/frames/*.png`, `${ORDER_OUT}/sheet.png`, 2, 0.6);

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, notes, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
