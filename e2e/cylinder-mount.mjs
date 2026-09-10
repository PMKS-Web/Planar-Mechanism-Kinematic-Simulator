// A cylinder mount is an ordinary attachment point, driven through the app.
//
// Steps 1 to 5 of docs/cylinder-mount-joints-plan.md are model and service
// work, checked by the unit suite. This is the gate that asks the *app*: the
// menu rows a reader actually clicks, the ring that appears under a dragged
// joint, which body a click selects when two of them are drawn as one, and
// whether any of it survives undo, a paused pose, or a second machine on the
// same grid.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<url> node e2e/cylinder-mount.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-mount';

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
// One filmstrip for the whole run: `filmstrip()` clears its directory when it
// is made, so a second one on the same directory throws away the first one's
// frames.
const film = filmstrip(page, OUT);

/**
 * A fresh grid holding a ram with a bracket on its rod mount.
 *
 * Built through the same service calls the canvas makes — `addBarFrom`,
 * `weldJoint`, `toggleGround` off the selection — rather than by pushing
 * objects into the arrays, so a fixture cannot be assembled in a shape the
 * app itself could never reach.
 */
async function weldedMount(options = {}) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  return page.evaluate((how) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const S = 200;
    const far = (link, anchor) => link.joints.find((j) => j.id !== anchor.id);

    m.createCylinderFrom({ x: -4 * S, y: 0 }, { x: 2 * S, y: 0 });
    const ram = m.sealedStructures()[0];
    const mount = ram.rodFar;

    const bar = m.addBarFrom(mount, { x: mount.x + 2 * S, y: mount.y + 3 * S });
    const tip = far(bar, mount);
    if (how.weld !== false) {
      grid.activeObjService.updateSelectedObj(mount);
      m.weldJoint();
    }

    // A machine with exactly one freedom, and something to watch when it runs:
    // the ram is anchored at its barrel end, its rod mount carries the
    // bracket, and the bracket's far end rides a block. Four bodies and four
    // one-freedom joints, so extending the ram drives the block along its
    // slot -- and both the joint the weld brought in and an external block are
    // on screen the whole time.
    if (how.closed) {
      grid.activeObjService.updateSelectedObj(ram.barrelFar);
      m.toggleGround();
      grid.activeObjService.updateSelectedObj(tip);
      m.toggleSlider();
      // A fresh slot is neither anchored in the world nor riding a carrier --
      // it dangles until one of the two is given to it, and a dangling slot is
      // not solvable. Grounding pins the direction it is already pointing.
      m.toggleGround();
      m.toggleCylinderInput(m.sealedStructures()[0]);
    }

    // A joint on its own, parked clear, for the drag checks.
    let loose;
    if (how.loose) {
      loose = m.createRevJoint(String(mount.x + 5 * S), String(mount.y - 4 * S));
      m.mergeToJoints([loose]);
    }

    // A second chain well clear of the ram: its own machine, and the only
    // other joint a slider can be put on without touching the ram.
    let other;
    if (how.otherBar) {
      // Kept in clear canvas: further down the screen and the playback bar
      // is over it, and a right-click meant for a joint dismisses a menu
      // instead of opening one.
      const one = m.addBar(
        { x: mount.x + 2 * S, y: mount.y - 2 * S },
        { x: mount.x + 4 * S, y: mount.y - 2 * S }
      );
      const two = m.addBarFrom(one.joints[1], {
        x: mount.x + 4 * S,
        y: mount.y - 0.5 * S,
      });
      other = { near: one.joints[0].id, mid: one.joints[1].id, far: far(two, one.joints[1]).id };
      // A component that never reaches ground has no solvable position, so it
      // is not a machine yet and is not one of the partitions. Anchoring each
      // chain is what makes them two.
      if (how.groundBoth) {
        [one.joints[0], ram.barrelFar].forEach((j) => {
          grid.activeObjService.updateSelectedObj(j);
          m.toggleGround();
        });
      }
    }

    m.finishStructuralEdit(true);
    const compound = m.links.find((l) => (l.subset ?? []).length > 0);
    return {
      samples: m.masterMechanism()?.joints.length ?? 0,
      mount: mount.id,
      tip: tip.id,
      barrelFar: ram.barrelFar.id,
      pin: ram.pin.id,
      barrelNear: ram.barrelNear.id,
      slider: ram.slider.id,
      barrel: ram.barrel.id,
      compound: compound ? compound.id : undefined,
      loose: loose ? loose.id : undefined,
      other,
    };
  }, options);
}

/** What the model says, in the shapes these checks ask about. */
const model = () =>
  page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return {
      joints: m.joints.map((j) => ({
        id: j.id,
        welded: !!j.isWelded,
        kind: j.constructor?.name,
        x: j.x,
        y: j.y,
      })),
      links: m.links.map((l) => ({ id: l.id, leaves: (l.subset ?? []).map((x) => x.id) })),
      rams: m.sealedStructures().length,
      partitions: m.partitions.length,
      valid: m.mechanisms.map((one) => !!one?.isMechanismValid()),
    };
  });

/** Open the real context menu on a joint, and read its rows. */
async function menuOnJoint(id) {
  // A menu left standing swallows the next right-click as a dismissal, so
  // every open starts from a closed one.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const box = await page.locator(`#joint_${id}`).boundingBox();
  if (!box) throw new Error(`joint ${id} is not on the canvas`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.locator('#contextMenu .cm-row').first().waitFor({ timeout: 5000 });
  return page.evaluate(() =>
    [...document.querySelectorAll('#contextMenu .cm-row')].map((row) => ({
      label: row.querySelector('.cm-row__label')?.textContent?.trim() ?? '',
      off: row.classList.contains('cm-row--off'),
      why: row.querySelector('.cm-row__reason')?.textContent?.trim() ?? '',
    }))
  );
}

async function clickMenuRow(label) {
  const row = page.locator('#contextMenu .cm-row', { hasText: label }).first();
  if ((await row.count()) === 0) {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#contextMenu .cm-row__label')].map((one) =>
        one.textContent.trim()
      )
    );
    throw new Error(`no "${label}" row; the menu offers ${JSON.stringify(rows)}`);
  }
  await row.click();
  await page.waitForTimeout(600);
}

/**
 * Drag one joint onto another, reading the ring at the moment of hover.
 *
 * The words are read off the rendered canvas rather than off the component,
 * because a reason the model knows and the drawing never says is the thing
 * this is here to catch.
 */
async function ringDuring(fromId, toId, shot) {
  const from = await page.locator(`#joint_${fromId}`).boundingBox();
  const to = await page.locator(`#joint_${toId}`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 });
  await page.waitForTimeout(250);
  const ring = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      accepted: grid.snapTargetJoint?.id ?? null,
      refused: grid.refusedTarget?.joint?.id ?? null,
      why: grid.refusedTarget?.refusal ?? null,
      rings: document.querySelectorAll('.snapRefused').length,
      said: document.querySelector('.snapRefusedReason')?.textContent?.trim() ?? '',
      notifications: [...document.querySelectorAll('.notificationText')].map((one) =>
        one.textContent.trim()
      ),
    };
  });
  if (shot) await shot();
  await page.mouse.up();
  await page.waitForTimeout(500);
  return ring;
}

// ---------------------------------------------------------------- 1. toggles
console.log('\nthe toggles a mount now offers');
let ids = await weldedMount();
let rows = await menuOnJoint(ids.mount);
check(
  'the mount offers Slider, Welded and Cylinder',
  ['Slider', 'Welded', 'Cylinder'].every((label) => {
    const row = rows.find((one) => one.label === label);
    return row && !row.off;
  }),
  JSON.stringify(rows.filter((r) => ['Slider', 'Welded', 'Cylinder'].includes(r.label)))
);

// ------------------------------------------------------------ 2. gray reason
// A grayed row says why in its own words, and the reason is the one actually
// true of this joint.
const driven = rows.find((one) => one.label === 'Driven Input');
check(
  'and grays Driven Input on a welded joint, with the reason',
  !!driven && driven.off && /weld/i.test(driven.why),
  JSON.stringify(driven)
);
check(
  'while the ram’s interior joints are not on the grid to be clicked at all',
  await page.evaluate(
    (inside) => inside.every((id) => !document.querySelector(`#joint_${id}`)),
    [ids.pin, ids.barrelNear, ids.slider]
  ),
  JSON.stringify([ids.pin, ids.barrelNear, ids.slider])
);

// A block, added and taken away again through the menu row.
await clickMenuRow('Slider');
let state = await model();
check(
  'Slider on a mount adds a block',
  state.joints.some((j) => j.kind === 'PrisJoint' && j.id !== ids.slider),
  JSON.stringify(state.joints.filter((j) => j.kind === 'PrisJoint').map((j) => j.id))
);
check('and the ram is still a ram', state.rams === 1, `rams=${state.rams}`);
await menuOnJoint(ids.mount);
await clickMenuRow('Slider');
state = await model();
check(
  'and taking it off again leaves the ram alone',
  state.joints.filter((j) => j.kind === 'PrisJoint').length === 1 && state.rams === 1,
  JSON.stringify({
    pris: state.joints.filter((j) => j.kind === 'PrisJoint').length,
    rams: state.rams,
  })
);

// ------------------------------------------------------- 3. the live ring
console.log('\nthe ring under a dragged joint');
ids = await weldedMount({ loose: true });
let ring = await ringDuring(ids.loose, ids.mount);
check(
  'a loose joint dragged onto a welded mount is offered the merge',
  ring.accepted === ids.mount && !ring.refused,
  JSON.stringify(ring)
);

// A ram folded onto itself gets no ring of either color: the drawing already
// says the two ends are one part, so `resolveDropCandidate` drops its own
// cylinder's joints rather than marking them red. What has to hold is that the
// ram survives the attempt.
ids = await weldedMount();
ring = await ringDuring(ids.barrelFar, ids.mount);
state = await model();
check(
  'a ram dragged onto its own mount is offered nothing, and stays a ram',
  !ring.accepted && !ring.refused && state.rams === 1 && state.joints.length === 6,
  JSON.stringify({ ring, rams: state.rams, joints: state.joints.length })
);

// The red ring itself, on a mount: two blocks cannot share one pin.
ids = await weldedMount({ otherBar: true });
await menuOnJoint(ids.mount);
await clickMenuRow('Slider');
await menuOnJoint(ids.other.near);
await clickMenuRow('Slider');
ring = await ringDuring(ids.other.near, ids.mount, () => film.shot('refused-live'));
check(
  'and a second block dragged onto a mount that has one is refused, live, with the reason',
  ring.refused === ids.mount && ring.why === 'two-sliders' && !ring.accepted,
  JSON.stringify({ refused: ring.refused, why: ring.why, accepted: ring.accepted })
);
check(
  'and the drawing says which rule while the drag is still live, not after it',
  ring.rings === 1 && ring.said === 'one block per pin',
  JSON.stringify({ rings: ring.rings, said: ring.said, notifications: ring.notifications })
);

// ------------------------------------------------------------ 4. slot drops
console.log('\nslot drops at a mount');

// A slot arrives dangling -- neither anchored in the world nor riding a
// carrier -- and the two ways out of that are the two flavors this has to
// cover: ground it, or drop it on a body.
ids = await weldedMount();
await menuOnJoint(ids.mount);
await clickMenuRow('Slider');
const slotStates = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const slot = () => m.joints.find((j) => j.constructor?.name === 'PrisJoint' && !j.isSealed);
  const say = () => ({
    ground: !!slot().ground,
    floating: !!slot().isFloating,
    carrier: slot().carrier?.id ?? null,
  });
  const fresh = say();
  grid.activeObjService.updateSelectedObj(
    m.joints.find(
      (j) => j.constructor?.name === 'RevJoint' && j.connectedJoints.some((c) => c === slot())
    )
  );
  m.toggleGround();
  return { fresh, grounded: say(), rams: m.sealedStructures().length };
});
check(
  'a block put on a mount arrives dangling, and grounding anchors its slot',
  !slotStates.fresh.ground &&
    !slotStates.fresh.floating &&
    slotStates.grounded.ground &&
    slotStates.rams === 1,
  JSON.stringify(slotStates)
);

// The floating flavor: a mount dropped onto a body somewhere else in the
// drawing, which is the whole point of letting a mount take a slot.
ids = await weldedMount({ otherBar: true });
const slotDrop = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const mount = m.joints.find((j) => j.id === where.mount);
  const bar = m.links.find(
    (l) =>
      l.joints.some((j) => j.id === where.other.near) &&
      l.joints.some((j) => j.id === where.other.mid)
  );
  const [a, b] = bar.joints;
  const took = m.cutSlotOn(mount, {
    carrier: bar,
    a,
    b,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const slider = m.joints.find((j) => j.constructor?.name === 'PrisJoint' && !j.isSealed);
  return {
    took,
    floating: !!slider?.isFloating,
    carrier: slider?.carrier?.id ?? null,
    rams: m.sealedStructures().length,
  };
}, ids);
check(
  'and dropping one on an unrelated body makes it float on that body instead',
  slotDrop.took && slotDrop.floating && slotDrop.carrier === 'DE' && slotDrop.rams === 1,
  JSON.stringify(slotDrop)
);

// The body the ram is already fixed to is not one of them: dropping the barrel
// mount onto the bracket welded to the rod mount would pull the part shorter
// until it turned inside out. Refused in the preview and again at the commit,
// and the commit must not have written anything on its way to saying no.
ids = await weldedMount();
// First the preview: sweep the barrel mount across the middle of the bracket
// and no channel opens there.
const mountBox = await page.locator(`#joint_${ids.mount}`).boundingBox();
const tipJointBox = await page.locator(`#joint_${ids.tip}`).boundingBox();
const barrelBox = await page.locator(`#joint_${ids.barrelFar}`).boundingBox();
const middle = {
  x: (mountBox.x + tipJointBox.x) / 2 + mountBox.width / 2,
  y: (mountBox.y + tipJointBox.y) / 2 + mountBox.height / 2,
};
await page.mouse.move(barrelBox.x + barrelBox.width / 2, barrelBox.y + barrelBox.height / 2);
await page.mouse.down();
await page.mouse.move(middle.x, middle.y, { steps: 16 });
await page.waitForTimeout(200);
const previewed = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).slotCandidate?.carrier?.id ?? null
);
await page.mouse.up();
await page.waitForTimeout(400);

// Then the commit, which has to say the same thing with the same facts -- and
// must not have written anything on its way to saying no.
ids = await weldedMount();
const foldRefused = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const barrelFar = m.joints.find((j) => j.id === where.barrelFar);
  const mount = m.joints.find((j) => j.id === where.mount);
  const compound = m.links.find((l) => (l.subset ?? []).length > 0);
  const leaf = compound.subset.find((x) => x.joints.some((j) => j.id === where.tip));
  const [a, b] = leaf.joints;
  const before = { x: barrelFar.x, y: barrelFar.y };
  const was = Math.hypot(mount.x - barrelFar.x, mount.y - barrelFar.y);
  const took = m.cutSlotOn(barrelFar, {
    carrier: compound,
    a,
    b,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const ram = m.sealedStructures()[0];
  return {
    took,
    moved: barrelFar.x !== before.x || barrelFar.y !== before.y,
    stretched: Math.abs(Math.hypot(mount.x - barrelFar.x, mount.y - barrelFar.y) - was) > 1e-6,
    blocks: m.joints.filter((j) => j.constructor?.name === 'PrisJoint' && !j.isSealed).length,
    barrelFar: ram?.barrelFar.id,
    rams: m.sealedStructures().length,
  };
}, ids);
check(
  'a slot that would fold the ram is never previewed on the body it would fold onto',
  previewed === null,
  JSON.stringify({ previewed })
);
check(
  'and the commit says the same, before it writes anything',
  foldRefused.took === false &&
    !foldRefused.moved &&
    !foldRefused.stretched &&
    foldRefused.blocks === 0 &&
    foldRefused.barrelFar === ids.barrelFar &&
    foldRefused.rams === 1,
  JSON.stringify(foldRefused)
);

ids = await weldedMount();
const interiorDrop = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const pin = m.joints.find((j) => j.id === where.pin);
  const compound = m.links.find((l) => (l.subset ?? []).length > 0);
  const leaf = compound.subset.find((x) => x.joints.some((j) => j.id === where.tip));
  const before = { x: pin.x, y: pin.y };
  const took = m.cutSlotOn(pin, {
    carrier: compound,
    a: leaf.joints[0],
    b: leaf.joints[1],
    x: leaf.joints[0].x,
    y: leaf.joints[0].y,
  });
  return {
    took,
    moved: pin.x !== before.x || pin.y !== before.y,
    rams: m.sealedStructures().length,
  };
}, ids);
check(
  'and the ram’s inside refuses one, without moving first',
  !interiorDrop.took && !interiorDrop.moved && interiorDrop.rams === 1,
  JSON.stringify(interiorDrop)
);

// ------------------------------------------------- 5. skin versus its leaves
console.log('\nclicking a body that is drawn as one');
ids = await weldedMount();
const clickAt = async (selector) => {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const active = ng.getComponent(document.querySelector('app-new-grid')).activeObjService;
    return { type: active.objType, link: active.selectedLink?.id ?? null };
  });
};
const onBody = await clickAt(`#${ids.compound}`);
check(
  'clicking the welded body selects the body, not one of its leaves',
  onBody.type === 'Link' && onBody.link === ids.compound,
  JSON.stringify(onBody)
);
check(
  'and draws its leaves inside it as outlines rather than as things to click',
  await page.evaluate((where) => {
    const group = document.querySelector(`#${where.compound}__components`);
    if (!group) return false;
    const leaves = group.querySelectorAll('path');
    return (
      leaves.length === 2 &&
      group.getAttribute('pointer-events') === 'none' &&
      [...leaves].every((one) => one.id.endsWith('__component'))
    );
  }, ids),
  JSON.stringify(
    await page.evaluate(
      (where) =>
        [...(document.querySelector(`#${where.compound}__components`)?.children ?? [])].map(
          (one) => one.id
        ),
      ids
    )
  )
);
const onBarrel = await clickAt(`#${ids.barrel}`);
check(
  'while the ram beside it is still its own body to click',
  onBarrel.type === 'Link' && onBarrel.link !== ids.compound,
  JSON.stringify(onBarrel)
);

// ----------------------------------------------------------- 6. undo / redo
console.log('\nundo and redo across a weld');
ids = await weldedMount({ weld: false });
await menuOnJoint(ids.mount);
await clickMenuRow('Welded');
state = await model();
const weldedNow = state.links.some((l) => l.leaves.length > 1);
await page.click('text=Undo');
await page.waitForTimeout(800);
const afterUndo = await model();
await page.click('text=Redo');
await page.waitForTimeout(800);
const afterRedo = await model();
check(
  'a weld at a mount is one undo entry, and redo puts it back',
  weldedNow &&
    !afterUndo.links.some((l) => l.leaves.length > 1) &&
    afterRedo.links.some((l) => l.leaves.length > 1),
  JSON.stringify({
    welded: weldedNow,
    undo: afterUndo.links.map((l) => l.id),
    redo: afterRedo.links.map((l) => l.id),
  })
);
check(
  'and the ram is intact at every step of that',
  afterUndo.rams === 1 && afterRedo.rams === 1,
  JSON.stringify({ undo: afterUndo.rams, redo: afterRedo.rams })
);

// ------------------------------------------------------- 7. a second machine
console.log('\na second machine on the same grid');
ids = await weldedMount({ otherBar: true, groundBoth: true });
const before = await model();
const twoMachines = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  m.unWeldJoint(m.joints.find((j) => j.id === where.mount));
  return true;
}, ids);
const after = await model();
const others = [ids.other.near, ids.other.mid, ids.other.far];
check(
  'editing one machine leaves the other exactly where it was',
  before.partitions >= 2 &&
    twoMachines &&
    others.every((id) => {
      const was = before.joints.find((j) => j.id === id);
      const now = after.joints.find((j) => j.id === id);
      return was && now && was.x === now.x && was.y === now.y;
    }),
  JSON.stringify({ partitions: before.partitions, ids: others })
);
check(
  'and the unweld took the weld off, and only that',
  !after.links.some((l) => l.leaves.length > 1) && after.rams === 1,
  JSON.stringify({ links: after.links.map((l) => l.id), rams: after.rams })
);

// ------------------------------------------------------- 8. a paused pose
console.log('\nediting at a paused pose');
ids = await weldedMount({ closed: true });
let running = await model();
check(
  'the welded-mount machine is a machine',
  running.valid.some(Boolean) && running.partitions === 1,
  JSON.stringify({ partitions: running.partitions, valid: running.valid })
);

const paused = await page.evaluate((where) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const at = (id) => {
    const j = m.joints.find((one) => one.id === id);
    return { x: j.x, y: j.y };
  };
  const compounds = () => m.links.filter((l) => (l.subset ?? []).length > 0).length;
  const mount = () => m.joints.find((one) => one.id === where.mount);

  const start = at(where.mount);
  // animate() takes a sample index, not a fraction of the cycle.
  m.animate(Math.max(1, Math.round(where.samples * 0.35)), false);
  const displaced = at(where.mount);

  m.unWeldJoint(mount());
  const afterEdit = at(where.mount);
  const loose = compounds();

  grid.activeObjService.updateSelectedObj(mount());
  m.weldJoint();
  return {
    start,
    displaced,
    afterEdit,
    loose,
    rewelded: compounds(),
    moved: Math.hypot(displaced.x - start.x, displaced.y - start.y) > 1,
    backOnItsAnchor: Math.hypot(afterEdit.x - start.x, afterEdit.y - start.y) < 1e-6,
    valid: m.mechanisms.some((one) => !!one?.isMechanismValid()),
    rams: m.sealedStructures().length,
  };
}, ids);
check(
  'the mount really is somewhere else mid-cycle',
  paused.moved,
  JSON.stringify({ start: paused.start, displaced: paused.displaced })
);
check(
  'an unweld there commits, and puts the drawing back on its anchor',
  paused.loose === 0 && paused.backOnItsAnchor,
  JSON.stringify({ compounds: paused.loose, afterEdit: paused.afterEdit })
);
check(
  'and welding it again gives the machine back',
  paused.rewelded === 1 && paused.valid && paused.rams === 1,
  JSON.stringify({ compounds: paused.rewelded, valid: paused.valid, rams: paused.rams })
);

// ------------------------------------------------------------- 9. filmstrips
console.log('\nfilmstrips: a compound drag, and the part running');
ids = await weldedMount();
const tipBox = await page.locator(`#joint_${ids.tip}`).boundingBox();
await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2);
await page.mouse.down();
await film.during(60, 6, 'compound-drag', async () => {
  await page.mouse.move(tipBox.x + 170, tipBox.y - 130, { steps: 20 });
});
await page.mouse.up();
await page.waitForTimeout(400);
await film.shot('compound-drag-settled');
await contactSheet(`${OUT}/*compound-drag*.png`, `${OUT}/sheet-compound-drag.png`, 4);

// The part running: the joint the weld brought in and the block the bracket
// drives are both on screen for every frame.
ids = await weldedMount({ closed: true });
running = await model();
check(
  'the ram drives a block through its welded bracket',
  running.valid.some(Boolean) && running.rams === 1,
  JSON.stringify({ valid: running.valid, rams: running.rams })
);
await film.shot('running-start');
await page.click('.playButton');
await film.during(150, 6, 'running', async () => {
  await page.waitForTimeout(1000);
});
await page.click('.playButton');
await page.waitForTimeout(300);
await contactSheet(`${OUT}/*running*.png`, `${OUT}/sheet-running.png`, 4);

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
