/**
 * Every way to edit a linkage while it is parked away from its start, tried.
 *
 * The plan (docs/edit-mode-playback-plan.md §7) says what each action does at
 * a displaced pose: some are refused with words, some apply to the design
 * without needing the pose (identity-addressed), some capture the pose and
 * are staged and settled back onto the machine's anchor like a drag. This
 * suite does not decide which is which; it checks that whatever an action did,
 * the drawing is left in a state that can be trusted:
 *
 *   - nothing is left staged, and the pill that narrates a gesture is gone;
 *   - the clocks agree with each other about whether the machine is at its
 *     start -- the shared step, every machine's own seconds, and the answer
 *     `isAtStartPose()` gives;
 *   - an identity-addressed edit leaves the start pose byte-identical for
 *     every joint that survives it;
 *   - a capturing edit keeps the machine's anchor, or says that the start moved;
 *   - and Undo puts the design back exactly, at its start.
 *
 * Every context-menu row on a joint, a link, a force and the canvas; every
 * field of the Edit panel; the keys; the transport. Rows and fields that are
 * refused are recorded as refused *with a reason*, which is the other legal
 * answer. Three of the capturing rows -- a tracer point, a force, a slider --
 * used to rebuild directly and left the new part half a mechanism off the body
 * it was drawn on; this is the sweep that would have caught them.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/posed-edit-audit.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const playwright = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const { chromium } = playwright;
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/posed-edit-audit';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};
/** One line per action, for the table at the end. */
const ledger = [];

// ---- the drawing, and how it is read --------------------------------------

const grid = () => ng.getComponent(document.querySelector('app-new-grid'));

/** Everything the invariants are judged from, read in one evaluate. */
const look = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const s = g.mechanismSrv;
    const frames = s.mechanisms[0];
    const valid = !!frames?.isMechanismValid();
    const round = (v) => Math.round(v * 1e6) / 1e6;
    return {
      atStart: s.isAtStartPose(),
      step: s.mechanismTimeStep,
      seconds: s.mechanisms.map((_, i) => s.secondsOf(i)),
      playing: s.isPlaying,
      staged: s.posedEditKey,
      pill: document.querySelectorAll('.startGhostTag').length,
      amber: document.querySelectorAll('.startGhost.unreachable').length,
      valid,
      failure: frames?.failure ?? null,
      machines: s.mechanisms.length,
      joints: s.joints
        .map((j) => j.id)
        .sort()
        .join(''),
      // The design: every joint at t = 0, when there is a cycle to read it from.
      start: valid
        ? Object.fromEntries(frames.joints[0].map((j) => [j.id, [round(j.x), round(j.y)]]))
        : null,
      // What is drawn right now, for the states with no cycle.
      shown: Object.fromEntries(s.joints.map((j) => [j.id, [round(j.x), round(j.y)]])),
      // Whether every link body is drawn where its pins are. A solved sample's
      // outline used to be realized from the source link *after* the display
      // had moved it, so after a seek the bodies stayed at the pose before
      // while the pins went on: a delete at a displaced pose left the linkage
      // visibly in two places at once.
      linksAdrift: s.links
        .filter((l) => typeof l.d === 'string' && l.d.length > 0 && l.joints.length >= 2)
        .filter((l) => {
          const numbers = (l.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
          if (numbers.length < 4) return false;
          const xs = numbers.filter((_, i) => i % 2 === 0);
          const ys = numbers.filter((_, i) => i % 2 === 1);
          const box = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
          const margin = Math.max(80, 0.3 * Math.hypot(box[1] - box[0], box[3] - box[2]));
          return l.joints.some(
            (j) =>
              j.x < box[0] - margin ||
              j.x > box[1] + margin ||
              j.y < box[2] - margin ||
              j.y > box[3] + margin
          );
        })
        .map((l) => l.id),
      forces: s.forces
        .map((f) => f.id)
        .sort()
        .join(','),
      anchor: s.anchorOf(0)?.coordinate ?? null,
      // What the design is made of and how it is flagged -- the things a URL
      // would carry, less the pose. A trace is a view of the mechanism and is
      // left out on purpose: turning one on mints no entry.
      design: [
        s.joints
          .map((j) => `${j.id}${j.ground ? 'g' : ''}${j.input ? 'i' : ''}${j.constructor.name[0]}`)
          .sort()
          .join(' '),
        s.links
          .map(
            (l) =>
              `${l.id}:${l.mass}:${l.massMoI ?? ''}:${l.subset?.length ?? 0}:${l.isCircular ? 'o' : ''}`
          )
          .sort()
          .join(' '),
        s.forces
          .map((f) => `${f.id}:${f.mag}:${f.local}`)
          .sort()
          .join(' '),
        [...s.joints, ...s.links, ...s.forces]
          .filter((part) => s.isLockedTarget(part))
          .map((part) => part.id)
          .sort()
          .join(','),
      ].join(' | '),
      startMoved: s.startMovedOn,
      history: [g.saveHistoryService.index, g.saveHistoryService.history.length],
    };
  });

/**
 * The drawings the sweep runs over, and what to press on each.
 *
 * A four-bar for the pins and bars; a slider-crank for the block and the
 * grounded guide; a cylinder for its own panel and its own rows. `forceOn` is
 * where a force is drawn at the start pose so that a force's rows and fields
 * are on the table; `spot` is a joint a second press can be aimed near when a
 * row begins a creation gesture.
 */
const MECHANISMS = [
  {
    name: '4-Bar',
    forceOn: 'BC',
    spot: 'C',
    menu: [
      ['joint', 'B'],
      ['joint', 'A'],
      ['link', 'BC'],
      ['link', 'AB'],
      ['force', 'F1'],
      ['canvas', null],
    ],
    panel: [
      ['joint', 'B', 'joint'],
      ['link', 'BC', 'link'],
      ['force', 'F1', 'force'],
    ],
    key: 'B',
  },
  {
    name: 'Slider_Crank',
    forceOn: 'BC',
    spot: 'B',
    menu: [
      ['joint', 'C'],
      ['joint', 'D'],
      ['link', 'BC'],
      ['link', 'CD'],
      ['canvas', null],
    ],
    // The block CD is not a selectable part -- a press on it selects its pin --
    // so the panel is never showing it and its fields are not on this table.
    panel: [
      ['joint', 'C', 'joint'],
      ['joint', 'D', 'joint'],
      ['link', 'BC', 'link'],
    ],
    key: 'C',
  },
  {
    name: 'Cylinder_Boom',
    forceOn: 'GN',
    spot: 'N',
    menu: [
      ['joint', 'S'],
      ['joint', 'P'],
      ['joint', 'C'],
      ['link', 'PC'],
      ['link', 'PS'],
      ['link', 'OC'],
    ],
    panel: [
      ['joint', 'S', 'cylinder'],
      ['joint', 'P', 'joint'],
      ['link', 'OC', 'link'],
    ],
    key: 'C',
  },
];
let current = MECHANISMS[0];

const fresh = async () => {
  await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES[current.name]}`);
  await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
  await page.waitForTimeout(400);
  // A force on a bar, made at the start pose so it is part of the design.
  await page.evaluate((onLink) => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const s = g.mechanismSrv;
    const link = s.links.find((l) => l.id === onLink);
    const [b, c] = link.joints;
    const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    s.createForce(mid, { x: mid.x, y: mid.y + 100 }, link);
    s.updateMechanism(true);
  }, current.forceOn);
  await page.waitForTimeout(300);
};

const displace = async () => {
  await page.evaluate(() => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    s.seekMechanism(0, s.mechanisms[0].cyclePeriod / 3);
  });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await page.waitForTimeout(500);
};

const select = (kind, id) =>
  page.evaluate(
    ([kind, id]) => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const s = g.mechanismSrv;
      const part =
        kind === 'joint'
          ? s.joints.find((j) => j.id === id)
          : kind === 'link'
            ? s.links.find((l) => l.id === id)
            : s.forces.find((f) => f.id === id);
      g.activeObjService.updateSelectedObj(part);
      return !!part;
    },
    [kind, id]
  );

const undo = async () => {
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService.undo()
  );
  await page.waitForTimeout(500);
};

/** Undo until the history stands where it stood before the action, if it moved. */
const undoToBefore = async (before) => {
  for (let i = 0; i < 8 && (await look()).history[0] > before.history[0]; i++) await undo();
};

// ---- the invariants ----------------------------------------------------------

/** The rows that read the pose they are made at (§6.2: capturing). */
const CAPTURING = /^(Link|Cylinder|Force|Tracer Point|Welded|Slider|Duplicate)/;

const clocksAgree = (state) =>
  state.atStart ===
  (!state.playing && state.step === 0 && state.seconds.every((seconds) => seconds === 0));

/**
 * Judge one action from the states before and after it, and after undoing it.
 * `kind` is 'identity' or 'capturing'; `changed` says whether the action was
 * expected to change anything at all.
 */
function judge(what, kind, before, after, afterUndo, followUps = []) {
  const problems = [];
  if (after.staged !== null) problems.push(`left staged: ${after.staged}`);
  if (after.linksAdrift.length) {
    problems.push(`links drawn away from their pins: ${after.linksAdrift}`);
  }
  for (const [step, state] of followUps) {
    if (state.staged !== null) problems.push(`${step}: left staged`);
    if (state.pill || state.amber) problems.push(`${step}: warning left up`);
    if (!clocksAgree(state)) {
      problems.push(
        `${step}: clocks disagree ${JSON.stringify({ atStart: state.atStart, step: state.step, seconds: state.seconds })}`
      );
    }
    if (state.linksAdrift.length) {
      problems.push(`${step}: links drawn away from their pins: ${state.linksAdrift}`);
    }
    if (state.errors?.length) problems.push(`${step}: page errors ${state.errors.join(' | ')}`);
  }
  if (after.pill || after.amber)
    problems.push(`warning left up: pill ${after.pill} amber ${after.amber}`);
  if (!clocksAgree(after))
    problems.push(
      `clocks disagree: ${JSON.stringify({ atStart: after.atStart, step: after.step, seconds: after.seconds, playing: after.playing })}`
    );
  if (kind === 'identity' && after.valid && before.valid) {
    // Every surviving joint's t = 0 is what it was.
    for (const [id, was] of Object.entries(before.start)) {
      const now = after.start[id];
      if (now && (now[0] !== was[0] || now[1] !== was[1])) {
        problems.push(`start pose of ${id} moved from ${was} to ${now}`);
      }
    }
  }
  if (kind === 'capturing' && after.valid && before.anchor !== null && after.anchor !== null) {
    if (Math.abs(after.anchor - before.anchor) > 0.05 && !after.startMoved) {
      problems.push(`anchor moved from ${before.anchor} to ${after.anchor} without saying so`);
    }
  }
  // An edit that changed the design minted an entry, and Undo puts the design
  // back exactly, at its start. One that changed nothing minted none, and the
  // drawing simply stays where it was. (The follow-ups may have minted more
  // entries of their own; the walk back went to the entry before the edit.)
  const undone = after.history[1] > before.history[1];
  if (after.design !== before.design && !undone) {
    problems.push(
      `changed the design without an entry to undo it: ${before.design} -> ${after.design}`
    );
  }
  if (undone) {
    if (afterUndo.joints !== before.joints)
      problems.push(`undo: joints ${afterUndo.joints} vs ${before.joints}`);
    if (!afterUndo.atStart) problems.push('undo: not at the start');
    if (afterUndo.design !== before.design)
      problems.push(`undo: design ${afterUndo.design} rather than ${before.design}`);
    if (before.valid && afterUndo.valid) {
      for (const [id, was] of Object.entries(before.start)) {
        const now = afterUndo.start[id];
        if (!now || Math.abs(now[0] - was[0]) > 1e-4 || Math.abs(now[1] - was[1]) > 1e-4) {
          problems.push(`undo: ${id} at ${now} rather than ${was}`);
        }
      }
    }
  }
  if (errors.length) problems.push(`page errors: ${errors.splice(0).join(' | ')}`);
  record(what, problems.length === 0, problems);
  ledger.push([what, kind, problems.length === 0 ? 'ok' : problems[0]]);
}

/**
 * What a reader does next, after an edit that landed at a displaced pose:
 * runs it, deletes the thing the edit made, and walks the history back and
 * forward. Each is a place a stale piece of state has shown up -- a link body
 * left where the pins were, a clock that stopped agreeing with the pose, a
 * design that a redo could not put back.
 */
async function followUps(before, after) {
  const states = [];
  const snapshot = async (label) => {
    const state = await look();
    state.errors = errors.splice(0);
    states.push([label, state]);
    return state;
  };
  // Run it, then stop: the display has to draw the new cycle from where it is.
  if (after.valid) {
    await page.locator('.playButton').click();
    await page.waitForTimeout(350);
    await page.locator('.playButton').click();
    await page.waitForTimeout(250);
    await snapshot('played');
  }
  // Delete what the edit made, while still parked away from the start.
  const newJoints = [...after.joints].filter((id) => !before.joints.includes(id));
  const newForces = after.forces
    .split(',')
    .filter((id) => id && !before.forces.split(',').includes(id));
  for (const id of newForces) {
    await page.evaluate((id) => {
      const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const force = s.forces.find((f) => f.id === id);
      if (force) s.deleteForce(force);
    }, id);
    await page.waitForTimeout(400);
  }
  for (const id of newJoints) {
    const present = await page.evaluate((id) => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const joint = g.mechanismSrv.joints.find((j) => j.id === id);
      if (!joint) return false;
      g.activeObjService.updateSelectedObj(joint);
      g.mechanismSrv.deleteJoint();
      return true;
    }, id);
    if (present) await page.waitForTimeout(400);
  }
  if (newJoints.length || newForces.length) await snapshot('deleted what it made');
  // Back through the history to before the edit, and forward again.
  const back = await look();
  for (let i = 0; i < 6 && (await look()).history[0] > before.history[0]; i++) await undo();
  await snapshot('undone to before');
  for (let i = 0; i < 6 && (await look()).history[0] < back.history[0]; i++) {
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService.redo()
    );
    await page.waitForTimeout(500);
  }
  await snapshot('redone');
  return states;
}

// ---- 1. every context-menu row -----------------------------------------------

/** The menu as the app builds it for a part, with each row's index. */
const rowsFor = (kind, id) =>
  page.evaluate(
    ([kind, id]) => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const s = g.mechanismSrv;
      let part;
      if (kind === 'joint') part = s.joints.find((j) => j.id === id);
      else if (kind === 'link') part = s.links.find((l) => l.id === id);
      else if (kind === 'force') part = s.forces.find((f) => f.id === id);
      if (kind === 'canvas') g.setLastRightClick(undefined);
      else g.setLastRightClick(part);
      return g.cMenu.groups.flatMap((group, gi) =>
        group.rows.map((row, ri) => ({
          gi,
          ri,
          label: row.label,
          refused: row.refusal ? row.refusal.short || row.refusal.long || 'refused' : null,
          disabled: !!row.disabled,
        }))
      );
    },
    [kind, id]
  );

const runRow = (kind, id, gi, ri) =>
  page.evaluate(
    ([kind, id, gi, ri]) => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const s = g.mechanismSrv;
      let part;
      if (kind === 'joint') part = s.joints.find((j) => j.id === id);
      else if (kind === 'link') part = s.links.find((l) => l.id === id);
      else if (kind === 'force') part = s.forces.find((f) => f.id === id);
      if (kind === 'canvas') g.setLastRightClick(undefined);
      else g.setLastRightClick(part);
      // Where the press was, for the rows that place something there.
      const target = part
        ? part.joints
          ? part.joints[0]
          : part.startCoord
            ? part.startCoord
            : part
        : null;
      if (target) {
        const at = g.svgGrid.modelToScreen({ x: target.x ?? 0, y: target.y ?? 0 });
        g.lastRightClickCoord.x = at.x;
        g.lastRightClickCoord.y = at.y;
      }
      const row = g.cMenu.groups[gi].rows[ri];
      row.action?.();
      return g.dragState.grid;
    },
    [kind, id, gi, ri]
  );

const SKIP_ROWS = /Background Image|Delete entire mechanism|Delete Selected|Duplicate Selected/;

for (const mechanism of MECHANISMS) {
  current = mechanism;
  for (const [kind, id] of mechanism.menu) {
    await fresh();
    await displace();
    const rows = await rowsFor(kind, id);
    for (const row of rows) {
      const what = `menu · ${mechanism.name} · ${kind} ${id ?? ''} · ${row.label}`.replace(
        /\s+/g,
        ' '
      );
      if (row.refused) {
        record(`${what} — refused: "${row.refused}"`, true);
        ledger.push([what, 'refused', row.refused]);
        continue;
      }
      if (SKIP_ROWS.test(row.label)) {
        ledger.push([what, 'skipped', 'opens a dialog or removes the whole machine']);
        continue;
      }
      await fresh();
      await displace();
      if (kind !== 'canvas') await select(kind, id);
      const before = await look();
      const state = await runRow(kind, id, row.gi, row.ri);
      await page.waitForTimeout(300);
      // A row that began a creation gesture wants a second press on the canvas.
      if (state !== 0 && state !== 'waiting') {
        const spot = await page.evaluate((near) => {
          const g = ng.getComponent(document.querySelector('app-new-grid'));
          const c = g.mechanismSrv.joints.find((j) => j.id === near);
          const at = g.svgGrid.modelToScreen({ x: c.x, y: c.y });
          return { x: at.x + 140, y: at.y - 90 };
        }, mechanism.spot);
        await page.mouse.click(spot.x, spot.y);
        await page.waitForTimeout(500);
      }
      const after = await look();
      const kindOfEdit = CAPTURING.test(row.label) ? 'capturing' : 'identity';
      const later = after.history[1] > before.history[1] ? await followUps(before, after) : [];
      // One entry per edit; a row that changed nothing minted none.
      await undoToBefore(before);
      const afterUndo = await look();
      judge(what, kindOfEdit, before, after, afterUndo, later);
    }
  }
}

// ---- 2. every field of the Edit panel ----------------------------------------

const FORMS = {
  joint: [
    'xPos',
    'yPos',
    'prisAngle',
    'ground',
    'input',
    'inputSpeed',
    'slider',
    'weld',
    'curve',
    'sliderMass',
  ],
  link: ['length', 'angle', 'mass', 'massMoI', 'comX', 'comY'],
  force: ['magnitude', 'angle', 'xComp', 'yComp', 'isGlobal'],
  cylinder: ['travel', 'start', 'angle', 'barrelMass', 'rodMass', 'headMass'],
};
const POSE_FIELDS =
  /^(xPos|yPos|prisAngle|length|angle|comX|comY|magnitude|xComp|yComp|isGlobal|inputSpeed|travel|start)$/;
const CAPTURING_FIELDS = /^(slider|weld)$/;

for (const mechanism of MECHANISMS) {
  current = mechanism;
  for (const [kind, id, form] of mechanism.panel) {
    // What the panel disables for this part at the *start* pose, which is not
    // the pose's doing: a field disabled there too is disabled for a reason of
    // its own (a uniform body, a floating slot) and is not asked for a banner.
    await fresh();
    await select(kind, id);
    await page.waitForTimeout(300);
    const disabledAtStart = await page.evaluate((form) => {
      const panel = ng.getComponent(document.querySelector('app-edit-panel'));
      const controls = panel[form + 'Form']?.controls ?? {};
      return Object.keys(controls).filter((name) => controls[name].disabled);
    }, form);
    for (const field of FORMS[form]) {
      if (disabledAtStart.includes(field)) {
        ledger.push([
          `panel · ${mechanism.name} · ${kind} ${id} · ${field}`,
          'n/a',
          'disabled at the start pose too',
        ]);
        continue;
      }
      await fresh();
      await displace();
      await select(kind, id);
      await page.waitForTimeout(300);
      const what = `panel · ${mechanism.name} · ${kind} ${id} · ${field}`;
      const control = await page.evaluate(
        ([form, field]) => {
          const panel = ng.getComponent(document.querySelector('app-edit-panel'));
          const c = panel[form + 'Form']?.get(field);
          if (!c) return null;
          return { disabled: c.disabled, value: c.value };
        },
        [form, field]
      );
      if (!control) {
        ledger.push([what, 'absent', 'no such control']);
        continue;
      }
      if (control.disabled) {
        // The strip's words, less the icon ligature innerText puts first.
        const banner = (
          await page
            .locator('app-edit-banner')
            .innerText()
            .catch(() => '')
        )
          .replace(/^\s*[a-z_]+\s*/, '')
          .replace(/\s+/g, ' ')
          .trim();
        record(`${what} — frozen, with the banner saying why`, banner.length > 0, banner);
        ledger.push([what, 'refused', banner.slice(0, 60)]);
        continue;
      }
      const before = await look();
      await page.evaluate(
        ([form, field, value]) => {
          const panel = ng.getComponent(document.querySelector('app-edit-panel'));
          const c = panel[form + 'Form'].get(field);
          let next;
          if (typeof value === 'boolean') next = !value;
          else if (typeof value === 'number') next = value + 0.25;
          else if (typeof value === 'string' && value !== '' && !isNaN(Number(value)))
            next = String(Number(value) + 0.25);
          else next = value;
          c.setValue(next);
        },
        [form, field, control.value]
      );
      await page.waitForTimeout(500);
      const after = await look();
      const kindOfEdit = CAPTURING_FIELDS.test(field) ? 'capturing' : 'identity';
      const later = after.history[1] > before.history[1] ? await followUps(before, after) : [];
      await undoToBefore(before);
      const afterUndo = await look();
      // A pose-bound field that is *enabled* here is a finding in itself.
      if (POSE_FIELDS.test(field)) {
        record(`${what} — a pose-bound field is live while displaced`, false, control);
        ledger.push([what, 'live', 'pose-bound field enabled while displaced']);
        continue;
      }
      judge(what, kindOfEdit, before, after, afterUndo, later);
    }
  }
}

// ---- 3. the keys ---------------------------------------------------------------

for (const [key, kindOfEdit] of [
  ['Delete', 'identity'],
  ['k', 'identity'],
  ['ArrowRight', 'capturing'],
  ['ArrowUp', 'capturing'],
]) {
  current = MECHANISMS[0];
  await fresh();
  await displace();
  await select('joint', current.key);
  await page.mouse.click(1200, 120); // focus the canvas, away from any part
  await page.waitForTimeout(200);
  await select('joint', current.key);
  const before = await look();
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
  const after = await look();
  await undoToBefore(before);
  const afterUndo = await look();
  judge(`key · ${key}`, kindOfEdit, before, after, afterUndo);
}

// ---- 4. the transport ------------------------------------------------------------

current = MECHANISMS[0];
await fresh();
await displace();
{
  const before = await look();
  await page.locator('.playButton').click();
  await page.waitForTimeout(400);
  const playing = await look();
  record(
    'transport · play: clocks agree while running',
    clocksAgree(playing) && playing.playing,
    playing
  );
  await page.locator('.playButton').click();
  await page.waitForTimeout(300);
  const paused = await look();
  record(
    'transport · pause: clocks agree, design untouched',
    clocksAgree(paused) &&
      JSON.stringify(paused.start) === JSON.stringify(before.start) &&
      paused.staged === null,
    paused
  );
  await page
    .locator('.dirButton')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(400);
  const flipped = await look();
  record(
    'transport · direction flip: clocks agree, design untouched',
    clocksAgree(flipped) && JSON.stringify(flipped.start) === JSON.stringify(before.start),
    flipped
  );
}

// ---- the table -------------------------------------------------------------------

const table = [
  '| Action | Kind | Outcome |',
  '| --- | --- | --- |',
  ...ledger.map(([a, k, o]) => `| ${a} | ${k} | ${o} |`),
].join('\n');
writeFileSync(`${OUT}/matrix.md`, table + '\n');
console.log(`\n${table}`);
await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed; matrix in ${OUT}/matrix.md`
);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
process.exit(failed.length ? 1 : 0);
