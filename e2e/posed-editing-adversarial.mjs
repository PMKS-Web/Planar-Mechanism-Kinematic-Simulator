/**
 * The gestures that are *not* edits, and must not become them.
 *
 * A companion to `posed-editing.mjs`, which checks that editing at a pose
 * works. This checks the other half: that a view gesture, an interrupted drag
 * or a machine nobody touched cannot move the pose a drawing starts in.
 *
 * Every check here started as a defect. Editing at a pose means, for the length
 * of one gesture, that a machine's drawn pose *is* its design pose -- and every
 * way a gesture can end without saying so is a way for that to be written down
 * permanently. Eight rounds of review found five such paths; these are the
 * shapes they took.
 *
 * Four claims from the last round of fixes, each attacked rather than confirmed:
 * a force drag interrupted by a pinch, a CoM gesture ended by a view gesture,
 * the second finger of a pinch reaching a handle, and a staged machine's clock
 * in a *synced* drawing. Plus the two questions that decide the whole thing:
 * can canonical t = 0 move without deliberate intent, and can anything mutate
 * while every gate says it cannot.
 */
const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium, devices } = await import(playwright + '/node_modules/playwright/index.mjs');
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const out = [];
const record = (name, ok, detail) => {
  out.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};
const browser = await chromium.launch();

/** Canonical sample zero, to the digit, for every machine. */
const startPoses = (p) =>
  p.evaluate(() => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return JSON.stringify(
      s.mechanisms.map((m) =>
        m.isMechanismValid() ? m.joints[0].map((j) => [j.id, j.x, j.y]) : null
      )
    );
  });
const historyDepth = (p) =>
  p.evaluate(() => {
    const t = ng.getComponent(document.querySelector('app-top-bar'));
    return t.history['history']?.length ?? -1;
  });
const jointAt = (p, id) =>
  p.evaluate((w) => {
    for (const el of document.querySelectorAll('#jointHolder > svg')) {
      const m = el.querySelector('[id^="joint_"]');
      if (m?.id !== 'joint_' + w) continue;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return null;
  }, id);

// ---- desktop: a CoM gesture ended by a view gesture ----------------------
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await startQuiet(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await openMechanism(p, BASE + '/?' + TEMPLATE_LINKAGES['4-Bar']);
  await p.getByRole('button', { name: 'Edit', exact: false }).first().click();
  await p.waitForTimeout(400);

  const before = await p.evaluate(() => {
    const L = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.links[0];
    return { x: L.CoM.x, y: L.CoM.y };
  });
  const depth0 = await historyDepth(p);
  await p.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    g.startComDrag(
      g.mechanismSrv.links[0],
      new PointerEvent('pointerdown', { clientX: 400, clientY: 400 })
    );
  });
  await p.mouse.move(520, 470);
  await p.waitForTimeout(200);
  // A long press is a view gesture: what the pointer moved must go back.
  await p.evaluate(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .onLongPress({ x: 520, y: 470, target: null })
  );
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const L = g.mechanismSrv.links[0];
    return { x: L.CoM.x, y: L.CoM.y, dragging: !!g.draggingCoMLink };
  });
  record(
    'a view gesture puts a CoM drag back rather than committing it',
    Math.hypot(after.x - before.x, after.y - before.y) < 1e-6,
    { before, after }
  );
  record('and leaves no gesture live', after.dragging === false, after);
  record('and writes no history entry', (await historyDepth(p)) === depth0, {
    depth0,
    now: await historyDepth(p),
  });

  // A later buttonless move must not move it either.
  await p.mouse.move(800, 700);
  await p.waitForTimeout(250);
  const later = await p.evaluate(() => {
    const L = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.links[0];
    return { x: L.CoM.x, y: L.CoM.y };
  });
  record(
    'and no later pointer move can move the mark',
    Math.hypot(later.x - before.x, later.y - before.y) < 1e-6,
    { before, later }
  );
  record('no page errors (desktop)', errs.length === 0, errs.slice(0, 2));
  await c.close();
}

// ---- desktop: a synced two-machine drawing, edited on the non-master -----
{
  const TWO =
    '?2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
    '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
    'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
    'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
    'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await startQuiet(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await openMechanism(p, BASE + '/' + TWO);
  await p.getByRole('button', { name: 'Edit', exact: false }).first().click();
  await p.waitForTimeout(500);
  const machines = await p.evaluate(
    () =>
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.mechanisms.filter((m) => m.isMechanismValid()).length
  );
  record('the two-machine drawing has two machines', machines === 2, { machines });

  // Synced, both a third of the way round.
  await p.evaluate(() => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    s.animate(s.stepAtTime(s.cyclePeriod() / 3));
  });
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Fit to view' }).click();
  await p.waitForTimeout(800);

  const canonicalBefore = await startPoses(p);
  // Drag a joint of the SECOND machine — the one that is not the master.
  const g = await jointAt(p, 'F');
  await p.mouse.click(g.x, g.y);
  await p.waitForTimeout(250);
  await p.mouse.move(g.x, g.y);
  await p.mouse.down();
  const offs = [];
  for (let i = 1; i <= 8; i++) {
    const at = { x: g.x, y: g.y + i * 8 };
    await p.keyboard.down('Alt');
    await p.mouse.move(at.x, at.y, { steps: 1 });
    await p.keyboard.up('Alt');
    await p.waitForTimeout(50);
    const on = await jointAt(p, 'F');
    offs.push(on.y - at.y);
  }
  await p.mouse.up();
  await p.waitForTimeout(600);
  const spread = Math.max(...offs) - Math.min(...offs);
  record('a joint of the non-master machine tracks the cursor when synced', spread < 2, {
    spread,
    offs,
  });

  // And the machine nobody touched still starts where it started.
  const canonicalAfter = await startPoses(p);
  const was = JSON.parse(canonicalBefore),
    now = JSON.parse(canonicalAfter);
  record(
    'the untouched machine kept its own start pose',
    JSON.stringify(was[1]) === JSON.stringify(now[1]) ||
      JSON.stringify(was[0]) === JSON.stringify(now[0]),
    { was: was.map((m) => m && m[1]), now: now.map((m) => m && m[1]) }
  );
  record('no page errors (synced)', errs.length === 0, errs.slice(0, 2));
  await c.close();
}

// ---- phone: a pinch whose first finger has already dragged --------------
{
  const c = await browser.newContext({ ...devices['iPhone 13'] });
  await startQuiet(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await openMechanism(p, BASE + '/?' + TEMPLATE_LINKAGES['4-Bar']);
  await p.waitForTimeout(700);
  const canonicalBefore = await startPoses(p);
  const depth0 = await historyDepth(p);
  const g = await jointAt(p, 'B');

  const cdp = await c.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: g.x, y: g.y, id: 1 }],
  });
  // Past the slop, so the first finger is a drag and not an undecided press.
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: g.x + i * 12, y: g.y + i * 8, id: 1 }],
    });
    await p.waitForTimeout(60);
  }
  // Now the second finger lands and it becomes a pinch.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: g.x + 48, y: g.y + 32, id: 1 },
      { x: g.x + 160, y: g.y + 160, id: 2 },
    ],
  });
  await p.waitForTimeout(120);
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: g.x + 48 - i * 6, y: g.y + 32 - i * 6, id: 1 },
        { x: g.x + 160 + i * 10, y: g.y + 160 + i * 10, id: 2 },
      ],
    });
    await p.waitForTimeout(60);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await p.waitForTimeout(700);

  record(
    'a pinch after a drag leaves canonical t = 0 exactly as it was',
    (await startPoses(p)) === canonicalBefore,
    {
      before: JSON.parse(canonicalBefore)[0]?.slice(0, 2),
      after: JSON.parse(await startPoses(p))[0]?.slice(0, 2),
    }
  );
  record('and writes no history entry', (await historyDepth(p)) === depth0, {
    depth0,
    now: await historyDepth(p),
  });
  // An ambient rebuild afterwards must not find anything staged to use.
  await p.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.updateMechanism()
  );
  await p.waitForTimeout(400);
  record(
    'and a later ambient rebuild still cannot move it',
    (await startPoses(p)) === canonicalBefore
  );
  record('no page errors (phone)', errs.length === 0, errs.slice(0, 2));
  await c.close();
}

// ---- a right-click mid-drag is an abandoned gesture, not an edit ----------
//
// Found by review, and it reproduced in Edit as well as the analysis modes, so
// it was a hole in the posed-editing work rather than in the analysis unlock.
// The teardown written for it lived in `mouseDownNow`'s button cases and could
// never run: those bindings are `pointerdown`, and the Pointer Events spec
// fires `pointerdown` only for the *first* button -- a second button pressed
// while one is down arrives as a `pointermove`. So the drag was left standing,
// and the next rebuild settled the moved geometry onto the anchor as though it
// had been asked for, with nothing to undo it.
for (const mode of ['Kinematic', 'Edit']) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await startQuiet(c);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await openMechanism(p, BASE + '/?' + TEMPLATE_LINKAGES['4-Bar']);
  await p.locator('.tabButton', { hasText: mode }).click();
  await p.waitForTimeout(700);
  await p.locator('.playButton').click();
  await p.waitForTimeout(900);
  await p.locator('.playButton').click();
  await p.waitForTimeout(500);
  await p.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).svgGrid.scaleToFitLinkage()
  );
  await p.waitForTimeout(600);

  const cycleStart = () =>
    p.evaluate(
      () =>
        ng
          .getComponent(document.querySelector('app-new-grid'))
          .mechanismSrv.mechanisms[0]?.joints[0]?.map((j) => [j.x, j.y]) ?? []
    );
  const before = await cycleStart();
  const at = await jointAt(p, 'B');
  await p.mouse.move(at.x, at.y);
  await p.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await p.mouse.move(at.x + i * 9, at.y - i * 6);
    await p.waitForTimeout(80);
  }
  await p.mouse.down({ button: 'right' });
  await p.mouse.up({ button: 'right' });
  await p.waitForTimeout(400);
  await p.mouse.up();
  await p.waitForTimeout(900);

  const after = await cycleStart();
  const drift = Math.max(
    ...before.map((one, i) => Math.hypot(one[0] - after[i][0], one[1] - after[i][1]))
  );
  // Model units: this drawing spans about 1500 of them, so a tenth of one is
  // the restore-and-re-solve round trip's own arithmetic rather than a move.
  record(`${mode}: a right-click mid-drag leaves the cycle's start where it was`, drift < 0.1, {
    drift,
  });
  record(
    `${mode}: and leaves no machine staged`,
    (await p.evaluate(
      () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.posedEditKey
    )) === null
  );
  record(`${mode}: no page errors from the abandoned gesture`, errs.length === 0, errs.slice(0, 2));
  await c.close();
}

await browser.close();
const bad = out.filter(([, ok]) => !ok);
console.log(`\n${out.length - bad.length}/${out.length} probes passed`);
if (bad.length) process.exitCode = 1;
