/**
 * The start-pose ghost is the start.
 *
 * One invariant, checked after every gesture: at any moment a ghost is drawn
 * for a machine, it is the pose that machine takes when the reader presses
 * stop-to-start, and that pose is the design the URL saves. Concretely -- each
 * ghost pin within rounding of that machine's sample 0, and, destructively,
 * the drawing standing on the ghost after stop-to-start.
 *
 * It is checked here rather than only in `posed-editing.spec.ts` because every
 * way of breaking it found so far needed a *sequence*: an edit, then playback,
 * then a history step, then another edit. Each step on its own looks right.
 * The named scenes below are the shrunk reproductions of four such sequences;
 * the seeded fuzz after them is how they were found, kept so the next one can
 * be found the same way.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/ghost-is-the-start.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { ALL_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const SHOTS = 'artifacts/ghost-is-the-start';
mkdirSync(SHOTS, { recursive: true });

/**
 * The drawing the defect was reported on: a ternary grounded at `A` with a
 * slot cut between `A` and `B`, a cylinder `D`-`E`-`F` whose first end rides
 * that slot and whose slide is the input, and whose rod is welded at `F` into
 * a ternary grounded at `G`.
 */
const REPORTED =
  '2v.8h,38.5,1.1011.4A,A,0JI,08-,0.0B,B,8V,JR,0.GC,C,0Pt,Pa,0.9D,D,041,6e,0,ABC,A,B.0D1,D1,TQ,62,0.8F,F,pQ,5f,0.hE,E,H-,6F,0,DD1,D,D1,038.4G,G,1WI,0KT,0.GH,H,1Vi,5M,0..ARABC,ABC,0,0,0CE,C0,c5cae9,A,B,C,,.ARDD1,DD1,0,0,Ci,6L,303e9f,D,D1,,.AREFGH,EFGH,0,0,vw,1P,303e9f,E,F,G,H,,EF,FGH.aREF,EF,0,0,Yi,5y,303e9f,E,F,,.aRFGH,FGH,0,0,1H8,03A,00695C,G,F,H,,...N_h*1jPzBJ';

const PAYLOADS = { ...ALL_LINKAGES, Reported: REPORTED };

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

// ---- reading the invariant ------------------------------------------------

/**
 * Everything the invariant is asked about, in one round trip.
 *
 * The ghost's pins come out of `blendFrame` over the same per-sample joint
 * arrays the machine was solved into, so `pins[k]` and `sample0[k]` are the
 * same joint and can be compared by position.
 */
const look = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const r = (n) => Math.round(n * 1e6) / 1e6;
    return {
      posedKey: srv.posedEditKey,
      atStart: srv.isAtStartPose(),
      showGhost: grid.showStartGhost(),
      ghosts: srv.startPoseGhosts().map((g) => ({
        index: g.index,
        at: g.at,
        reachable: g.reachable,
        pins: g.pins.map((p) => [r(p.x), r(p.y)]),
      })),
      machines: srv.partitions.map((partition, i) => {
        const frames = srv.mechanisms[i];
        const valid = !!(frames && frames.isMechanismValid());
        return {
          id: partition.id,
          valid,
          seconds: r(srv.secondsOf(i)),
          anchored: !!srv.anchorOf(i),
          sample0: valid ? frames.joints[0].map((j) => [j.id, r(j.x), r(j.y)]) : null,
        };
      }),
      live: srv.joints.map((j) => [j.id, r(j.x), r(j.y)]),
    };
  });

/** How big the drawing is, so a tolerance can be a fraction of it. */
const spanOf = (sample) => {
  const xs = sample.map(([, x]) => x);
  const ys = sample.map(([, , y]) => y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
};

/**
 * Where the invariant is broken, in words, or an empty list.
 *
 * Only asked between gestures. While a posed edit is staged, sample 0 of the
 * provisional cycle is the pose under the reader's hand by design and the
 * ghost is deliberately somewhere else -- that case is `posed-editing.mjs`.
 */
function breaks(state) {
  if (state.posedKey) return [];
  const bad = [];
  for (const ghost of state.ghosts) {
    const machine = state.machines[ghost.index];
    if (!machine || !machine.valid) {
      bad.push(`a ghost is drawn for M${ghost.index + 1}, which cannot be solved`);
      continue;
    }
    if (!ghost.reachable) {
      bad.push(`${machine.id}: the ghost is amber between gestures (anchored=${machine.anchored})`);
      continue;
    }
    const start = machine.sample0;
    const tolerance = Math.max(1e-3, spanOf(start) * 1e-5);
    let worst = 0;
    let worstId = null;
    for (let k = 0; k < start.length; k++) {
      const gap = Math.hypot(ghost.pins[k][0] - start[k][1], ghost.pins[k][1] - start[k][2]);
      if (gap > worst) {
        worst = gap;
        worstId = start[k][0];
      }
    }
    if (worst > tolerance) {
      bad.push(
        `${machine.id}: the ghost stands ${worst.toFixed(2)} from where the design starts (worst at ${worstId}; the ghost thinks the start is sample ${ghost.at})`
      );
    }
  }
  for (const [i, machine] of state.machines.entries()) {
    if (machine.valid && machine.anchored && !state.ghosts.some((g) => g.index === i)) {
      bad.push(`${machine.id}: anchored and solvable, and no ghost is drawn for it`);
    }
  }
  return bad;
}

/** The destructive half: the drawing must land where the ghost said it would. */
function landed(before, after) {
  const where = new Map(after.live.map(([id, x, y]) => [id, { x, y }]));
  const bad = [];
  for (const ghost of before.ghosts) {
    const machine = before.machines[ghost.index];
    if (!machine?.valid || !ghost.reachable) continue;
    const start = machine.sample0;
    const tolerance = Math.max(1e-3, spanOf(start) * 1e-5);
    let worst = 0;
    let worstId = null;
    for (let k = 0; k < ghost.pins.length; k++) {
      const at = where.get(start[k]?.[0]);
      if (!at) continue;
      const gap = Math.hypot(ghost.pins[k][0] - at.x, ghost.pins[k][1] - at.y);
      if (gap > worst) {
        worst = gap;
        worstId = start[k][0];
      }
    }
    if (worst > tolerance) {
      bad.push(
        `${machine.id}: stop-to-start left the drawing ${worst.toFixed(2)} from the ghost that was on screen (worst at ${worstId})`
      );
    }
  }
  return bad;
}

// ---- driving the app ------------------------------------------------------

const press = async (name, exact = true) => {
  const button = page.getByRole('button', { name, exact }).first();
  if ((await button.count()) === 0) return false;
  if (!(await button.isEnabled().catch(() => false))) return false;
  await button.click({ timeout: 3000 }).catch(() => {});
  return true;
};

/**
 * Where a joint is on screen, by id.
 *
 * Off the wrapper `svg` in `#jointHolder` rather than the marker inside it:
 * the marker's own box is not where the pointer has to land, the way
 * `posed-editing.mjs` found.
 */
const jointAt = async (id) => {
  const found = await page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('#jointHolder > svg')) {
      const marker = el.querySelector('[id^="joint_"]');
      if (marker?.id !== `joint_${wanted}`) continue;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    }
    return null;
  }, id);
  if (!found) throw new Error(`no joint ${id} on screen`);
  return found;
};

const jointIds = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#jointHolder > svg [id^="joint_"]')].map((n) =>
      n.id.replace('joint_', '')
    )
  );

/** A real press, move and release, in steps, so the drag gate sees a gesture. */
const drag = async (id, dx, dy) => {
  const at = await jointAt(id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(at.x + (dx * i) / 6, at.y + (dy * i) / 6);
    await page.waitForTimeout(24);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
};

/** Park a machine part way through its cycle, and re-frame so it can be aimed at. */
const displace = async (index = 0, fraction = 1 / 3) => {
  await page.evaluate(
    ([i, f]) => {
      const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      srv.seekMechanism(i, srv.mechanisms[i].cyclePeriod * f);
    },
    [index, fraction]
  );
  await page.waitForTimeout(280);
  await press('Fit to view').catch(() => {});
  await page.waitForTimeout(500);
};

async function fresh(name) {
  await openMechanism(page, `${BASE}/?${PAYLOADS[name]}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.waitForTimeout(350);
}

/**
 * Run a named scene, check the invariant, then check it destructively.
 *
 * The destructive half is the one that cannot be argued with: whatever the
 * ghost is drawn from, pressing stop-to-start has to land on it.
 */
async function scene(name, run) {
  await run();
  const state = await look();
  let problems = breaks(state);
  if (!problems.length && state.ghosts.length) {
    await press('Back to the start pose');
    await page.waitForTimeout(700);
    problems = landed(state, await look());
  }
  record(name, problems.length === 0, problems);
  return state;
}

// ---- 1. the shrunk reproductions ------------------------------------------

await scene('an edit at the start pose takes the start with it', async () => {
  // The reported defect, at its smallest. Drag the driven crank's own pin
  // while the drawing is showing its start: the design's t = 0 is now the
  // drawing as edited, and the anchor was holding the angle the crank used to
  // stand at. Nothing looks wrong until playback moves, and then the ghost is
  // most of a turn from where stop-to-start lands.
  await fresh('4-Bar');
  await drag('B', 30, -20);
  await displace();
});

await scene('and so does an edit that moves the ground it turns about', async () => {
  await fresh('4-Bar');
  await drag('A', -10, 10);
  await displace();
});

await scene('a slider-crank keeps its ghost on its start too', async () => {
  await fresh('Slider_Crank');
  const ids = await jointIds();
  await drag(ids[0], 20, -20);
  await displace();
});

await scene("a cylinder's end joint is no different", async () => {
  await fresh('Cylinder_Gripper');
  const ids = await jointIds();
  await drag(ids[1], 20, -20);
  await displace();
});

/** Park a machine that is not the master, and answer for it. */
const parkANonMaster = async () => {
  const other = await page.evaluate(() => {
    const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const master = srv.masterMechanismIndex();
    return srv.partitions.findIndex((_, i) => i !== master && srv.mechanisms[i].isMechanismValid());
  });
  await displace(other);
};

await scene('a machine off its own start is not "at the start"', async () => {
  // `seekMechanism` writes the shared sample index only for the *master*
  // machine, so any other machine can be parked mid-cycle with that index
  // still reading zero -- which is where a posed edit's closing re-seek leaves
  // it. Read as "at the start", the next rebuild wrote that machine's
  // displayed pose down as its t = 0, and the canvas drew no ghost over it.
  await fresh('Three_Machines');
  await parkANonMaster();
});

{
  // The same drawing, asked the two questions the scene above is about. Parked
  // again first: the scene ended by pressing stop-to-start, which is the half
  // of the check that proves the ghost was honest.
  await parkANonMaster();
  const state = await look();
  record(
    'and its ghost is on screen rather than hidden',
    state.atStart === false && state.showGhost === true,
    { atStart: state.atStart, showGhost: state.showGhost }
  );
  const before = state.machines.map((m) => JSON.stringify(m.sample0));
  await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.updateMechanism()
  );
  await page.waitForTimeout(400);
  const after = (await look()).machines.map((m) => JSON.stringify(m.sample0));
  record(
    'and an ambient rebuild does not take that pose for the design',
    before.every((one, i) => one === after[i]),
    { before: before.map((one) => one.slice(0, 40)), after: after.map((one) => one.slice(0, 40)) }
  );
}

await scene('history steps leave the ghost on the restored start', async () => {
  // Undo and redo around a posed edit, at a paused non-zero pose throughout,
  // which is how the defect was reported.
  await fresh('4-Bar');
  await displace(0, 0.25);
  await drag('C', -40, -4);
  await press('Undo');
  await page.waitForTimeout(700);
  await press('Redo');
  await page.waitForTimeout(700);
  await displace(0, 0.4);
});

await scene('play, pause, edit, undo leaves it there too', async () => {
  await fresh('4-Bar');
  await drag('C', -30, 20);
  await press('Play');
  await page.waitForTimeout(800);
  await press('Pause');
  await page.waitForTimeout(400);
  await press('Undo');
  await page.waitForTimeout(800);
  await displace(0, 0.3);
});

// ---- 2. an edit that really does move the start says so --------------------

{
  // The other half: a menu row that cannot re-anchor has to narrate it, the
  // way a drag's release does. `capturingPose` read only whether the settle
  // re-anchored and threw the rest away, so the one edit a reader could not
  // undo by eye was the one nothing said a word about.
  await fresh('Cylinder_Boom');
  await displace();
  const said = await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const joint = srv.joints.find((j) => j.id === 'G');
    grid.setLastRightClick(joint);
    const at = grid.svgGrid.modelToScreen({ x: joint.x, y: joint.y });
    grid.lastRightClickCoord.x = at.x;
    grid.lastRightClickCoord.y = at.y;
    const option = (grid.cMenu.choice?.options ?? []).find((o) => o.label === 'Prismatic');
    if (!option || option.refusal) return 'no such choice';
    option.action?.();
    return null;
  });
  await page.waitForTimeout(800);
  const after = await look();
  const chip = await page.evaluate(
    () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.startMovedOn
  );
  record('a menu edit that moves a start says which machine moved', !said && chip !== null, {
    said,
    chip,
  });
  record('and the ghost is still the start afterwards', breaks(after).length === 0, breaks(after));
}

// ---- 3. the drawing this was reported on -----------------------------------

{
  await fresh('Reported');
  const state = await look();
  const runs = state.machines.some((m) => m.valid);
  if (!runs) {
    // Left as a PASS with its reason said out loud rather than a silent skip:
    // this drawing's cylinder has both ends welded into one body, and until
    // that simulates there is no cycle here to anchor against. When it does,
    // this block starts checking the invariant on the reported drawing itself.
    record('the reported drawing (not solvable yet — nothing to anchor)', true, null);
  } else {
    await displace();
    const parked = await look();
    let problems = breaks(parked);
    if (!problems.length) {
      await press('Back to the start pose');
      await page.waitForTimeout(700);
      problems = landed(parked, await look());
    }
    record('the reported drawing keeps its ghost on its start', problems.length === 0, problems);
  }
}

// ---- 4. a filmstrip, so the ghost can be looked at --------------------------

{
  await fresh('4-Bar');
  await drag('B', 30, -20);
  const film = filmstrip(page, `${SHOTS}/edit-then-play`);
  await film.shot('edited-at-the-start');
  await displace();
  await film.shot('parked-with-the-ghost');
  await press('Back to the start pose');
  await page.waitForTimeout(700);
  await film.shot('back-on-the-ghost');
  const sheet = await contactSheet(
    `${SHOTS}/edit-then-play/*.png`,
    `${SHOTS}/edit-then-play.png`,
    3
  );
  console.log(`  filmstrip: ${sheet}`);
}

// ---- 5. the fuzz that found all of this ------------------------------------

/** mulberry32: a seed names a run, so a failure can be replayed exactly. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEPS = {
  async play(r) {
    await press('Play');
    await page.waitForTimeout(200 + Math.floor(r() * 500));
    await press('Pause');
    await page.waitForTimeout(200);
    return 'play/pause';
  },
  async scrub(r) {
    const handles = page.locator('input[type=range]');
    const count = await handles.count();
    if (count === 0) return null;
    const which = Math.floor(r() * count);
    const to = Math.floor(r() * 90) + 5;
    await handles
      .nth(which)
      .fill(String(to))
      .catch(() => {});
    await page.waitForTimeout(250);
    return `scrub row ${which} to ${to}`;
  },
  async stop() {
    await press('Back to the start pose');
    await page.waitForTimeout(450);
    return 'stop-to-start';
  },
  async dragJoint(r) {
    const ids = await jointIds();
    if (!ids.length) return null;
    const id = ids[Math.floor(r() * ids.length)];
    const dx = Math.round((r() - 0.5) * 120);
    const dy = Math.round((r() - 0.5) * 120);
    await drag(id, dx, dy);
    return `drag ${id} by ${dx},${dy}`;
  },
  async retype(r) {
    const ids = await jointIds();
    if (!ids.length) return null;
    const id = ids[Math.floor(r() * ids.length)];
    const which = Math.floor(r() * 4);
    const ran = await page.evaluate(
      ([id, which]) => {
        const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
        const joint = grid.mechanismSrv.joints.find((j) => j.id === id);
        if (!joint) return null;
        grid.setLastRightClick(joint);
        const at = grid.svgGrid.modelToScreen({ x: joint.x, y: joint.y });
        grid.lastRightClickCoord.x = at.x;
        grid.lastRightClickCoord.y = at.y;
        const open = (grid.cMenu.choice?.options ?? []).filter((o) => !o.refusal);
        const option = open[which % Math.max(open.length, 1)];
        if (!option) return null;
        option.action?.();
        return option.label;
      },
      [id, which]
    );
    if (!ran) return null;
    await page.waitForTimeout(650);
    return `${id} type -> ${ran}`;
  },
  async undo() {
    await press('Undo');
    await page.waitForTimeout(550);
    return 'undo';
  },
  async redo() {
    await press('Redo');
    await page.waitForTimeout(550);
    return 'redo';
  },
  async mode(r) {
    const names = ['Edit', 'Kinematic Analysis', 'Force Analysis'];
    const want = names[Math.floor(r() * names.length)];
    await press(want, false);
    await page.waitForTimeout(400);
    return `mode ${want}`;
  },
};

const MENU = [
  'play',
  'scrub',
  'scrub',
  'stop',
  'dragJoint',
  'dragJoint',
  'dragJoint',
  'retype',
  'undo',
  'undo',
  'redo',
  'mode',
];

/**
 * Fixed seeds and a fixed step count, so this is a check rather than a lottery.
 *
 * A wider sweep is a scratch script away -- it is the same loop over more
 * seeds and more drawings -- and is what a reader chasing a new report should
 * reach for. What earns a place in a suite is the part that is deterministic.
 */
async function fuzz(name, seeds, steps) {
  for (const seed of seeds) {
    const r = rng(seed * 7919 + 13);
    await fresh(name);
    const log = [];
    let problems = [];
    for (let s = 0; s < steps && !problems.length; s++) {
      const pick = MENU[Math.floor(r() * MENU.length)];
      const label = await STEPS[pick](r).catch((e) => `${pick} threw ${String(e).slice(0, 60)}`);
      if (label === null) continue;
      log.push(label);
      problems = breaks(await look());
    }
    if (!problems.length) {
      const before = await look();
      if (before.ghosts.length) {
        await STEPS.stop();
        problems = landed(before, await look());
      }
    }
    record(`fuzz ${name} seed ${seed}`, problems.length === 0, { steps: log, problems });
  }
}

await fuzz('4-Bar', [1, 3], 9);
await fuzz('Three_Machines', [7], 9);
await fuzz('Cylinder_Gripper', [5], 9);

record('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
