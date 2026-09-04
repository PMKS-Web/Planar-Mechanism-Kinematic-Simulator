/**
 * Multi-selection gestures/actions and the semantic DXF flow in a real browser.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/multi-select-and-dxf.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/multi-select-and-dxf';
const FOURBAR =
  '?2P.Ay,1E8.5,0.1011.4O,O,0,0,0.0A,A,72,MM,0.2C,C,pa,bW,0.4D,D,_W,0,0.0T,T,Wq,pa,0..YROA,OA,Fe,Fe,3X,BB,c5cae9,O,A,,.YRACT,ACT,Fe,Fe,UU,b9,303e9f,A,C,T,,.YRCD,CD,Fe,Fe,v2,Im,0d125a,C,D,,...N_3';

mkdirSync(OUT, { recursive: true });
const results = [];
const failures = [];
const check = (label, pass, detail = '') => {
  results.push({ label, pass, detail });
  if (!pass) failures.push(label);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await context.newPage();
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Linux x86_64' });
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const center = async (selector) => {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`No visible ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const selection = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.activeObjService.selectedPartRefs.map((ref) => `${ref.kind}:${ref.id}`);
  });

const joints = (ids) =>
  page.evaluate((wanted) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return Object.fromEntries(
      grid.mechanismSrv.joints
        .filter((joint) => wanted.includes(joint.id))
        .map((joint) => [joint.id, { x: joint.x, y: joint.y }])
    );
  }, ids);

const clickWith = async (selector, key) => {
  const at = await center(selector);
  const modifiers = key === 'Control' ? { ctrlKey: true } : { metaKey: true };
  await page.locator(selector).dispatchEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: at.x,
    clientY: at.y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...modifiers,
  });
  await page.locator(selector).dispatchEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 0,
    clientX: at.x,
    clientY: at.y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...modifiers,
  });
  await page.waitForTimeout(180);
};

const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 18; step++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 18,
      from.y + ((to.y - from.y) * step) / 18
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
};

const openProjectMenu = async () => {
  if ((await page.locator('#projectMenu').count()) === 0) {
    await page.getByRole('button', { name: 'Project menu' }).click();
  }
  await page.waitForSelector('#projectMenu');
};

const openDrawingDialog = async () => {
  await openProjectMenu();
  await page.getByRole('button', { name: 'CAD Export' }).click();
  await page.waitForSelector('#projectMenu', { state: 'detached' });
  await page.waitForSelector('app-drawing-export', { state: 'visible' });
  await page.waitForTimeout(250);
};

const openLibraryReference = async () => {
  await openProjectMenu();
  await page.getByRole('button', { name: 'Templates' }).click();
  await page.waitForSelector('#projectMenu', { state: 'detached' });
  await page.waitForSelector('#templates', { state: 'visible' });
  await page.waitForTimeout(250);
};

await openMechanism(page, BASE + FOURBAR);
await page.waitForTimeout(250);
const dismissTutorial = page.getByText('No thanks', { exact: true });

// A row of the open right-click menu, by its words. Scoped to the menu because
// the Edit panel deliberately says the same words for the same actions -- one
// action, two surfaces, one sentence -- so a bare text match finds both.
const menuRow = (label) => page.locator('#contextMenu').getByText(label, { exact: true });
if ((await dismissTutorial.count()) > 0 && (await dismissTutorial.isVisible())) {
  await dismissTutorial.click();
}

await page.click('#joint_A');
await clickWith('#joint_C', 'Control');
check(
  'Control-click adds a joint without replacing the first on Windows/Linux',
  JSON.stringify(await selection()) === JSON.stringify(['joint:A', 'joint:C']),
  JSON.stringify(await selection())
);
await clickWith('#joint_C', 'Control');
check(
  'Control-click toggles an existing member out',
  JSON.stringify(await selection()) === JSON.stringify(['joint:A']),
  JSON.stringify(await selection())
);

await clickWith('#ACT', 'Control');
check(
  'Control-click can add a link to make a typed mixed joint/link selection',
  JSON.stringify(await selection()) === JSON.stringify(['joint:A', 'link:ACT']),
  JSON.stringify(await selection())
);
check(
  'a mixed joint/link selection exposes shared actions without geometry fields',
  (await page.locator('app-multi-edit-panel').innerText()).includes('Joint and Link Selection') &&
    (await page.locator('app-multi-edit-panel [data-field="x"]').count()) === 0 &&
    (await page.locator('app-multi-edit-panel [data-field="length"]').count()) === 0
);
await page.click('#joint_C');
check(
  'an unmodified part click replaces the whole selection',
  JSON.stringify(await selection()) === JSON.stringify(['joint:C']),
  JSON.stringify(await selection())
);
await page.screenshot({ path: `${OUT}/desktop-single-edit-reference.png`, fullPage: true });

await page.click('#joint_A');
await clickWith('#joint_C', 'Control');
check(
  'differing joint coordinates render a clear Mixed state',
  (await page.locator('app-multi-edit-panel [data-field="x"]').getAttribute('placeholder')) ===
    'Mixed'
);
await page.keyboard.press('Escape');
check('Escape clears the selection', (await selection()).length === 0);
await page.click('#joint_A');
await clickWith('#joint_C', 'Control');
await page.mouse.click(1250, 780);
check('an unmodified blank-canvas click clears the selection', (await selection()).length === 0);

await page.click('#joint_A');
await clickWith('#joint_C', 'Control');
const beforeDrag = await joints(['A', 'C']);
const grab = await center('#joint_A');
await drag(grab, { x: grab.x + 90, y: grab.y - 55 });
const afterDrag = await joints(['A', 'C']);
const deltaA = { x: afterDrag.A.x - beforeDrag.A.x, y: afterDrag.A.y - beforeDrag.A.y };
const deltaC = { x: afterDrag.C.x - beforeDrag.C.x, y: afterDrag.C.y - beforeDrag.C.y };
check(
  'dragging any selected member translates the canonical group together',
  Math.hypot(deltaA.x, deltaA.y) > 1e-3 &&
    Math.abs(deltaA.x - deltaC.x) < 1e-6 &&
    Math.abs(deltaA.y - deltaC.y) < 1e-6,
  JSON.stringify({ deltaA, deltaC })
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(450);
const afterUndo = await joints(['A', 'C']);
check(
  'one Undo restores the complete group gesture',
  Math.abs(afterUndo.A.x - beforeDrag.A.x) < 1e-6 && Math.abs(afterUndo.C.y - beforeDrag.C.y) < 1e-6
);
await page.getByRole('button', { name: 'Redo' }).click();
await page.waitForTimeout(450);

const rotate = await center('[data-selection-handle="rotate"]');
const vectorBeforeRotate = await joints(['A', 'C']);
await drag(rotate, { x: rotate.x + 95, y: rotate.y + 50 });
const vectorAfterRotate = await joints(['A', 'C']);
const angleOf = (points) => Math.atan2(points.C.y - points.A.y, points.C.x - points.A.x);
check(
  'the rotation handle turns the selected geometry',
  Math.abs(angleOf(vectorAfterRotate) - angleOf(vectorBeforeRotate)) > 0.1
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(350);

// Eight grips now, four corners and four edge midpoints, so each is asked for
// by name. The box stands off the parts, which is what keeps a grip from
// landing on the very joint its position was derived from.
check(
  'the box carries a grip on every corner and every edge',
  (await page.locator('[data-selection-handle="scale"]').count()) === 8
);

const corner = await center('[data-selection-grip="ne"]');
const beforeScale = await joints(['A', 'C']);
await drag(corner, { x: corner.x + 100, y: corner.y - 65 });
const afterScale = await joints(['A', 'C']);
const distance = (points) => Math.hypot(points.C.x - points.A.x, points.C.y - points.A.y);
check('a corner grip changes the size of the group', distance(afterScale) > distance(beforeScale));
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(350);

// The half a single grip could never do: one dimension, with the other left
// exactly as it was.
const spread = async () => {
  const at = await joints(['A', 'C']);
  return { x: Math.abs(at.C.x - at.A.x), y: Math.abs(at.C.y - at.A.y) };
};
const east = await center('[data-selection-grip="e"]');
const beforeStretch = await spread();
await drag(east, { x: east.x + 110, y: east.y });
const afterStretch = await spread();
check(
  'an edge grip stretches one dimension and leaves the other alone',
  afterStretch.x > beforeStretch.x + 1 && Math.abs(afterStretch.y - beforeStretch.y) < 0.5,
  JSON.stringify({ beforeStretch, afterStretch })
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(350);

// Dragged back through the side that is holding still, the selection turns
// through it rather than stopping flat against it. Which side of A joint C is
// on is the thing that has to change.
const sideOfC = async () => {
  const at = await joints(['A', 'C']);
  return Math.sign(at.C.x - at.A.x);
};
const eastAgain = await center('[data-selection-grip="e"]');
const westAnchor = await center('[data-selection-grip="w"]');
const beforeFlip = await sideOfC();
await drag(eastAgain, { x: westAnchor.x - (eastAgain.x - westAnchor.x), y: eastAgain.y });
const afterFlip = await sideOfC();
check(
  'dragging a grip past the far side turns the selection through it',
  beforeFlip !== 0 && afterFlip === -beforeFlip,
  JSON.stringify({ beforeFlip, afterFlip })
);
await page.screenshot({ path: `${OUT}/flipped-selection.png` });
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(350);
check('one undo puts the flip back', (await sideOfC()) === beforeFlip);

// Arrows move what is selected, by one square of the drawn grid, or five with
// Option -- and one press is one thing to undo.
const cells = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return { minor: grid.svgGrid.minorCellSize, major: grid.svgGrid.majorCellSize };
});
const beforeNudge = await joints(['A', 'C', 'O']);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(250);
const nudged = await joints(['A', 'C', 'O']);
check(
  'an arrow moves the whole selection one grid square, and nothing else',
  Math.abs(nudged.A.x - beforeNudge.A.x - cells.minor) < 1e-6 &&
    Math.abs(nudged.C.x - beforeNudge.C.x - cells.minor) < 1e-6 &&
    Math.abs(nudged.O.x - beforeNudge.O.x) < 1e-6,
  JSON.stringify({ moved: nudged.A.x - beforeNudge.A.x, cell: cells.minor })
);
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(250);
const coarse = await joints(['A']);
check(
  'Option makes the step a coarse one',
  Math.abs(coarse.A.y - nudged.A.y - cells.major) < 1e-6,
  JSON.stringify({ moved: coarse.A.y - nudged.A.y, cell: cells.major })
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(400);
check('one press is one thing to undo', Math.abs((await joints(['A'])).A.y - nudged.A.y) < 1e-6);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(400);

// And with nothing selected they are the transport keys again.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const heard = await page.evaluate(async () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const seen = [];
  const sub = grid.shortcuts.pressed.subscribe((id) => seen.push(id));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  sub.unsubscribe();
  return seen;
});
check(
  'with nothing selected the arrows are the transport keys again',
  JSON.stringify(heard) === JSON.stringify(['playback.back', 'playback.forward']),
  JSON.stringify(heard)
);
// Put back the selection the Escape above cleared -- what follows is about
// what a Lock does to a group, and it needs a group.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const [a, c] = ['A', 'C'].map((id) => grid.mechanismSrv.joints.find((j) => j.id === id));
  grid.activeObjService.replacePartSelection(a);
  grid.activeObjService.togglePartSelection(c);
});
await page.waitForTimeout(250);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.joints.find((joint) => joint.id === 'C').locked = true;
  grid.mechanismSrv.updateMechanism(false);
});
const beforeLockedDrag = await joints(['A', 'C']);
const lockedGrab = await center('#joint_A');
await drag(lockedGrab, { x: lockedGrab.x + 80, y: lockedGrab.y + 30 });
check(
  'a Lock anywhere in the canonical closure refuses the whole transform',
  JSON.stringify(await joints(['A', 'C'])) === JSON.stringify(beforeLockedDrag)
);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.joints.find((joint) => joint.id === 'C').locked = false;
  grid.mechanismSrv.updateMechanism(false);
});

await page.screenshot({ path: `${OUT}/desktop-selection.png`, fullPage: true });

const inside = await center('#joint_A');
await page.mouse.click(inside.x, inside.y, { button: 'right' });
await page.waitForTimeout(200);
check(
  'right-click inside a selection opens count-aware group actions',
  (await page.locator('#contextMenu').innerText()).includes('Duplicate Selected (2)') &&
    (await page.locator('#contextMenu').innerText()).includes('Delete Selected (2)')
);
const jointCount = await page.locator('#jointHolder > svg').count();
await menuRow('Duplicate Selected (2)').click();
await page.waitForTimeout(450);
const copiedSelection = await selection();
check(
  'Duplicate Selected selects two collision-free unlocked copies',
  copiedSelection.length === 2 &&
    (await page.locator('#jointHolder > svg').count()) === jointCount + 2,
  JSON.stringify(copiedSelection)
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(450);
check(
  'one Undo removes the complete duplicate batch and reconciles its transient selection',
  (await page.locator('#jointHolder > svg').count()) === jointCount &&
    (await selection()).length === 0
);
await page.getByRole('button', { name: 'Redo' }).click();
await page.waitForTimeout(450);
check(
  'Redo restores geometry without serializing the removed selection into the URL',
  (await page.locator('#jointHolder > svg').count()) === jointCount + 2 &&
    (await selection()).length === 0
);

const copiedIds = copiedSelection.map((ref) => ref.split(':')[1]);
await page.click(`#joint_${copiedIds[0]}`);
await clickWith(`#joint_${copiedIds[1]}`, 'Control');
const copiedAt = await center(`#joint_${copiedIds[1]}`);
await page.mouse.click(copiedAt.x, copiedAt.y, { button: 'right' });
await menuRow('Delete Selected (2)').click();
await page.waitForTimeout(450);
check(
  'Delete Selected removes the batch atomically',
  (await page.locator('#jointHolder > svg').count()) === jointCount
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(450);
check(
  'one Undo restores the complete deletion batch',
  (await page.locator('#jointHolder > svg').count()) === jointCount + 2
);

// --- The switches a whole selection carries ---------------------------------
//
// A group edit that runs the one-part path once per part costs one press of
// Undo per part, which is not what the reader did. Each of these is one press
// of a switch, so each has to be one entry in the history -- and the panel and
// the right-click menu have to say the same thing about the same action.

const jointState = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return Object.fromEntries(
      grid.mechanismSrv.joints.map((joint) => [
        joint.id,
        { ground: joint.ground === true, welded: joint.isWelded === true },
      ])
    );
  });
const holds = () =>
  page.evaluate(() =>
    Object.fromEntries(
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.links.map((link) => [link.id, link.hold ?? null])
    )
  );

await openMechanism(page, BASE + FOURBAR);
await page.waitForTimeout(300);

await page.click('#joint_A');
await clickWith('#joint_C', 'Control');
await page.waitForTimeout(250);
const beforeGround = await jointState();
await page.locator('app-multi-edit-panel [data-action="ground"]').click();
await page.waitForTimeout(700);
const afterGround = await jointState();
check(
  'one press of Grounded grounds the whole selection',
  !beforeGround.A.ground && !beforeGround.C.ground && afterGround.A.ground && afterGround.C.ground,
  JSON.stringify({ beforeGround, afterGround })
);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(800);
const undoneGround = await jointState();
check(
  'and one press of Undo takes both back, not one of them',
  !undoneGround.A.ground && !undoneGround.C.ground,
  JSON.stringify(undoneGround)
);

// The menu says the same, and says Mixed when the group disagrees. O is ground
// and A is not; T is a tracer on one link, so there is nothing at it to fuse.
await page.click('#joint_O');
await clickWith('#joint_A', 'Control');
await clickWith('#joint_T', 'Control');
const atA = await center('#joint_A');
await page.mouse.click(atA.x, atA.y, { button: 'right' });
await page.waitForTimeout(400);
const groupRows = await page.evaluate(() =>
  [...document.querySelectorAll('#contextMenu .cm-row')].map((row) => ({
    label: row.querySelector('.cm-row__label')?.textContent.trim(),
    hint: row.querySelector('.cm-row__hint')?.textContent.trim() ?? '',
    off: row.className.includes('is-off') || row.getAttribute('aria-disabled') === 'true',
  }))
);
check(
  'the group menu carries the same four switches the one-joint menu does',
  ['Grounded', 'Slider', 'Welded', 'Trace Path'].every((label) =>
    groupRows.some((row) => row.label === label)
  ),
  JSON.stringify(groupRows.map((row) => row.label))
);
check(
  'and says Mixed where the group disagrees',
  groupRows.find((row) => row.label === 'Grounded')?.hint === 'Mixed',
  JSON.stringify(groupRows.find((row) => row.label === 'Grounded'))
);
check(
  'a group weld is grayed for the reason one joint would have been',
  groupRows.find((row) => row.label === 'Welded')?.off === true,
  JSON.stringify(groupRows.find((row) => row.label === 'Welded'))
);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

// Two bars, and the pair of held values a bar carries.
await page.click('#OA');
await clickWith('#CD', 'Control');
await page.waitForTimeout(250);
await page.locator('app-multi-edit-panel [data-action="fixedLength"]').click();
await page.waitForTimeout(700);
const heldLength = await holds();
check(
  'one press holds the length of every selected bar',
  heldLength.OA === 'length' && heldLength.CD === 'length' && heldLength.ACT === null,
  JSON.stringify(heldLength)
);
await page.locator('app-multi-edit-panel [data-action="fixedAngle"]').click();
await page.waitForTimeout(700);
const heldAngle = await holds();
check(
  'and a bar holds one value or the other, never both',
  heldAngle.OA === 'angle' && heldAngle.CD === 'angle',
  JSON.stringify(heldAngle)
);
await openMechanism(page, BASE + FOURBAR);
await page.waitForTimeout(300);

await openDrawingDialog();
check(
  'CAD Export explains its start-pose scope and opens on Build parts',
  (await page.locator('app-drawing-export').innerText()).includes('start pose') &&
    (await page.locator('app-drawing-export [data-preset="build"]').getAttribute('class')).includes(
      'on'
    ) &&
    (await page.locator('app-drawing-export [data-preset="custom"]').count()) === 0
);
// Every section says what it holds before it is opened, which is what lets a
// reader confirm the whole stack without opening any of it.
check(
  'each folded section carries its own summary',
  (await page.locator('app-drawing-export .sectionSummary').allInnerTexts()).every(
    (text) => text.trim().length > 0
  ),
  JSON.stringify(await page.locator('app-drawing-export .sectionSummary').allInnerTexts())
);
// The File section opens on a unit already chosen. It follows the project
// until a reader picks one, and showing none selected read as a required
// field nobody had filled in.
await page.locator('app-drawing-export [data-section="file"]').click();
await page.waitForTimeout(300);
const unitButtons = page
  .locator('app-drawing-export .field', { hasText: 'Units' })
  .locator('button');
// `segmented-block` says which segment is chosen through aria-pressed, which
// is the durable half of the contract -- the class it also carries has been
// renamed once already, and this check went on passing an empty list.
const unitClasses = await unitButtons.evaluateAll((nodes) =>
  nodes.map((node) => ({
    label: node.textContent.trim(),
    on: node.getAttribute('aria-pressed') === 'true',
  }))
);
check(
  'a unit is selected on arrival, matching the project',
  unitClasses.filter((unit) => unit.on).length === 1,
  JSON.stringify(unitClasses)
);
await page.screenshot({ path: `${OUT}/dxf-file-section.png` });
await page.locator('app-drawing-export [data-section="file"]').click();
await page.waitForTimeout(250);

await page.locator('app-drawing-export [data-section="layers"]').click();
await page.waitForTimeout(300);
const labelsRow = page.locator('app-drawing-export .checkRow', { hasText: 'Labels' }).first();
check(
  'labels are off by default, for a clean sketch',
  !(await labelsRow.locator('.check').getAttribute('class')).includes('on')
);
// The list names what the file will hold and nothing else. Exported as
// outlines there is no centerline layer and no shared joint layer, and both
// used to sit here ticked and captioned "Always included" over a file that
// contained neither.
const layerNames = await page.locator('app-drawing-export .checkRow .checkName').allInnerTexts();
check(
  'the layer list does not offer layers this export will not write',
  !layerNames.includes('Link centerlines') && !layerNames.includes('Joint centers'),
  layerNames.join(', ')
);
await page.screenshot({ path: `${OUT}/dxf-layers-section.png` });

// They come back for the preset that does write them -- and there they are
// ticked and unpressable, which has to *look* unpressable: a full-strength
// tick beside gray text reads as a control that simply stopped responding.
await page.locator('app-drawing-export [data-preset="reference"]').click();
await page.waitForTimeout(300);
const fixedRow = page
  .locator('app-drawing-export .checkRow', { hasText: 'Link centerlines' })
  .first();
const fixedCheck = await fixedRow.locator('.check').getAttribute('class');
check(
  'an always-on layer is ticked in the muted way, not at full strength',
  fixedCheck.includes('on') && fixedCheck.includes('off'),
  fixedCheck
);
await page.locator('app-drawing-export [data-preset="build"]').click();
await page.waitForTimeout(300);

// A grayed row explains itself on hover. The cursor already promised a
// tooltip; the native `title` never arrived, so this is the app's own.
await page.locator('app-drawing-export [data-section="layers"]').click();
await page.locator('app-drawing-export [data-section="geometry"]').click();
await page.waitForTimeout(300);
const tracedRow = page.locator('app-drawing-export [data-check="tracedPaths"]');
const tracedBlocked = (await tracedRow.getAttribute('class')).includes('blocked');
if (tracedBlocked) {
  await tracedRow.hover();
  await page.waitForTimeout(900);
  const tip = await page.locator('.mat-mdc-tooltip').allInnerTexts();
  check(
    'the grayed Traced paths row actually shows its reason on hover',
    tip.join(' ').includes('No joint is tracing a path'),
    JSON.stringify(tip)
  );
  await page.screenshot({ path: `${OUT}/dxf-blocked-tooltip.png` });
  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
} else {
  check('the grayed Traced paths row actually shows its reason on hover', false, 'row not blocked');
}
await page.locator('app-drawing-export [data-section="geometry"]').click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/desktop-dxf-dialog.png`, fullPage: true });

// Without the companion table, so the download is the drawing itself rather
// than the zip the two files would need. The zip has its own unit test.
await page.locator('app-drawing-export [data-section="data"]').click();
await page.waitForTimeout(300);
await page.locator('app-drawing-export .radioRow', { hasText: 'None' }).first().click();
await page.waitForTimeout(300);
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export DXF' }).click();
const download = await downloadPromise;
const downloadPath = await download.path();
const dxf = readFileSync(downloadPath, 'utf8');
check(
  'the download is ASCII R12 DXF with semantic layers and no SVG/UI artifacts',
  /\$ACADVER\r?\n1\r?\nAC1009/.test(dxf) &&
    dxf.includes('PMKS_LINK_CENTERLINES') &&
    !/<svg|selectionTransformOverlay|backgroundAndGrid/i.test(dxf)
);
check(
  'and carries nothing R12 predates, nor a bare POINT for CAD to mangle',
  !dxf.includes('AcDb') &&
    !dxf.includes('LWPOLYLINE') &&
    !/\r\n0\r\nPOINT\r\n/.test(dxf) &&
    !dxf.includes('PMKS_FORCES')
);
await page.waitForSelector('app-drawing-export', { state: 'detached' });

// Picking a unit converts the drawing into it. Naming a unit while the numbers
// stay in centimeters hands CAD a mechanism a hundred times too big under a
// label that looks right.
await openDrawingDialog();
await page.locator('app-drawing-export [data-section="file"]').click();
await page.waitForTimeout(300);
await page
  .locator('app-drawing-export .field', { hasText: 'Units' })
  .getByRole('button', { name: 'm', exact: true })
  .click();
const stillPreset = await page.locator('app-drawing-export [data-preset="custom"]').count();
await page.locator('app-drawing-export [data-section="data"]').click();
await page.waitForTimeout(300);
await page.locator('app-drawing-export .radioRow', { hasText: 'None' }).first().click();
await page.waitForTimeout(300);
const metricPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export DXF' }).click();
const metricDownload = await metricPromise;
const metric = readFileSync(await metricDownload.path(), 'utf8');
const extentOf = (text) => Number(/\$EXTMAX\r?\n10\r?\n([-\d.eE]+)/.exec(text)[1]);
check(
  'choosing meters converts the drawing rather than just relabeling it',
  Math.abs(extentOf(metric) - extentOf(dxf) / 100) < 1e-9,
  `cm ${extentOf(dxf)} -> m ${extentOf(metric)}`
);
// R12 has no header field for units, so the name is where the answer lives --
// and the import dialog asks for units at exactly the moment it is on screen.
check(
  'and says which unit in the name, where the import dialog will ask',
  metricDownload.suggestedFilename().includes('(m).dxf'),
  metricDownload.suggestedFilename()
);
await page.waitForSelector('app-drawing-export', { state: 'detached' });

// Millimeters, which is what every CAD importer defaults to -- and SVG, which
// is the same drawing written for a laser cutter rather than for CAD.
await openDrawingDialog();
await page.locator('app-drawing-export [data-section="file"]').click();
await page.waitForTimeout(300);
await page
  .locator('app-drawing-export .field', { hasText: 'Format' })
  .getByRole('button', { name: 'SVG', exact: true })
  .click();
await page
  .locator('app-drawing-export .field', { hasText: 'Units' })
  .getByRole('button', { name: 'mm', exact: true })
  .click();
await page.waitForTimeout(200);
check(
  'nothing on screen still says DXF once SVG is chosen',
  !(await page.locator('app-drawing-export').innerText())
    .replace(/\bDXF\b(?=\s*SVG)/, '')
    .includes('DXF only') &&
    (await page.locator('button[mat-flat-button]').innerText()).includes('SVG'),
  await page.locator('button[mat-flat-button]').innerText()
);
await page.locator('app-drawing-export [data-section="data"]').click();
await page.waitForTimeout(300);
await page.locator('app-drawing-export .radioRow', { hasText: 'None' }).first().click();
await page.waitForTimeout(300);
const svgPromise = page.waitForEvent('download');
await page.locator('button[mat-flat-button]').click();
const svgDownload = await svgPromise;
const svgText = readFileSync(await svgDownload.path(), 'utf8');
check(
  'the SVG comes down in millimeters, carrying its own physical size',
  svgDownload.suggestedFilename() === 'mechanism (mm).svg' &&
    /width="[\d.]+mm"/.test(svgText) &&
    svgText.includes('<svg') &&
    !/NaN|Infinity/.test(svgText),
  svgDownload.suggestedFilename()
);
check(
  'and keeps a layer per part, which is what one sketch per part depends on',
  /<g id="PMKS_LINK_[A-Za-z0-9_]+"/.test(svgText)
);
// And no preset has an opinion about units, so choosing one is not a deviation
// from it -- offering to "reset" would promise to undo something it would not.
check('choosing a unit does not drop the dialog into Custom', stillPreset === 0);
await page.waitForSelector('app-drawing-export', { state: 'detached' });

await page.setViewportSize({ width: 390, height: 844 });
await openDrawingDialog();
const dialogBox = await page
  .locator('.mat-mdc-dialog-surface:has(app-drawing-export)')
  .boundingBox();
check(
  'the CAD Export flow fits a narrow viewport',
  !!dialogBox &&
    dialogBox.x >= 0 &&
    dialogBox.x + dialogBox.width <= 390 &&
    dialogBox.height <= 844,
  JSON.stringify(dialogBox)
);
await page.screenshot({ path: `${OUT}/narrow-dxf-dialog.png`, fullPage: true });
await page.getByRole('button', { name: 'Close CAD Export' }).click();
await page.waitForSelector('app-drawing-export', { state: 'detached' });
await openLibraryReference();
await page.screenshot({ path: `${OUT}/narrow-library-reference.png`, fullPage: true });
await page.getByRole('button', { name: 'Close the library' }).click();
await page.waitForSelector('#templates', { state: 'detached' });

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === 'C');
  grid.activeObjService.replacePartSelection(joint);
});
if ((await page.getByRole('button', { name: 'Expand the panel' }).count()) > 0) {
  await page.getByRole('button', { name: 'Expand the panel' }).click();
  await page.waitForTimeout(450);
}
check(
  'the existing single-part editor remains usable in the narrow bottom sheet',
  (await page.locator('.panel').boundingBox())?.height > 100 &&
    (await page.locator('app-edit-panel').isVisible())
);
await page.screenshot({ path: `${OUT}/narrow-single-edit-reference.png`, fullPage: true });

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const first = grid.mechanismSrv.joints.find((candidate) => candidate.id === 'A');
  const second = grid.mechanismSrv.joints.find((candidate) => candidate.id === 'C');
  grid.activeObjService.replacePartSelection(first);
  grid.activeObjService.togglePartSelection(second);
});
await page.waitForTimeout(200);
const narrowMultiBox = await page.locator('app-multi-edit-panel').boundingBox();
check(
  'the multi-edit surface uses the same narrow bottom-sheet layout without horizontal overflow',
  !!narrowMultiBox &&
    narrowMultiBox.x >= 0 &&
    narrowMultiBox.x + narrowMultiBox.width <= 390 &&
    (await page.locator('app-multi-edit-panel').isVisible()),
  JSON.stringify(narrowMultiBox)
);
await page.screenshot({ path: `${OUT}/narrow-selection.png`, fullPage: true });

// A point that is actually on the canvas. In the narrow layout the multi-edit
// panel is a bottom sheet over the lower half of the grid, and joint A's center
// can sit behind it -- a finger held there presses the sheet, so no menu opens
// and the check reads as a broken long-press rather than an occluded one.
// Framed for the space that is actually free first. The narrow layout's bottom
// stack grew a row when the shared scrub card came back, and a drawing framed
// before that is a drawing whose lower half is now behind the sheet.
// On a phone the six view controls collapse behind one `visibility` button, so
// there is no Reset View to press: it is the sheet's "Fit to view" row.
await page.locator('.viewSheetButton').click();
await page.waitForTimeout(300);
// The row shuts the sheet itself. Escape would too -- and would also clear the
// selection the next check is about.
await page.locator('.viewRow', { hasText: 'Fit to view' }).click();
await page.waitForTimeout(900);

// Every selected joint, not two named ones. The phone's bottom stack grew a
// second row when the shared scrub card came back, which lifted the sheet and
// put both A and C behind it -- so the fallback pressed the sheet and the check
// failed as though the long-press were broken.
const heldSelected = await (async () => {
  const selected = await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    return grid.activeObjService.selectedParts
      .filter((part) => 'links' in part)
      .map((part) => part.id);
  });
  for (const id of [...selected, 'A', 'C']) {
    const at = await center(`#joint_${id}`);
    if (!at) continue;
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[id^="joint_"]')?.id ?? '',
      at
    );
    if (onTop === `joint_${id}`) return at;
  }
  return null;
})();
if (!heldSelected) throw new Error('no selected joint is reachable on the narrow layout');
const touch = await context.newCDPSession(page);
await touch.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: heldSelected.x, y: heldSelected.y, id: 1 }],
});
await page.waitForTimeout(700);
const longPressMenu = await page
  .locator('#contextMenu')
  .innerText()
  .catch(() => '');
await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await touch.detach();
await page.waitForTimeout(350);
check(
  'a narrow-layout long-press inside the selection preserves it and opens group actions',
  (await selection()).length === 2 &&
    longPressMenu.includes('2 Selected Parts') &&
    longPressMenu.includes('Delete Selected (2)'),
  longPressMenu.replaceAll('\n', ' | ')
);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

await page.setViewportSize({ width: 1500, height: 950 });
await openLibraryReference();
await page.screenshot({ path: `${OUT}/desktop-library-reference.png`, fullPage: true });
await page.getByRole('button', { name: 'Close the library' }).click();
await page.waitForSelector('#templates', { state: 'detached' });

const macPage = await context.newPage();
macPage.on('pageerror', (error) => errors.push(`macOS page: ${String(error)}`));
macPage.on('console', (message) => {
  if (message.type() === 'error') errors.push(`macOS console: ${message.text()}`);
});
await macPage.addInitScript(() => {
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
});
await openMechanism(macPage, BASE + FOURBAR);
const macCenter = async (selector) => {
  const box = await macPage.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
await macPage.click('#joint_A');
await macPage.keyboard.down('Meta');
await macPage.click('#joint_C');
await macPage.keyboard.up('Meta');
const macSelection = () =>
  macPage.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.activeObjService.selectedPartRefs.map((ref) => `${ref.kind}:${ref.id}`);
  });
check('Command-click toggles on macOS', (await macSelection()).length === 2);
const macA = await macCenter('#joint_A');
await macPage.keyboard.down('Control');
await macPage.mouse.move(macA.x, macA.y);
await macPage.mouse.down();
await macPage.dispatchEvent('#joint_A', 'contextmenu', {
  bubbles: true,
  cancelable: true,
  button: 2,
  ctrlKey: true,
  clientX: macA.x,
  clientY: macA.y,
});
await macPage.mouse.up();
await macPage.keyboard.up('Control');
check(
  'macOS Control-click opens the group menu without collapsing selection on release',
  (await macSelection()).length === 2 &&
    (await macPage.locator('#contextMenu').innerText()).includes('2 Selected Parts')
);

check('no browser errors were raised', errors.length === 0, errors.join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, errors }, null, 2));
await context.close();
await browser.close();

if (failures.length > 0 || errors.length > 0) process.exitCode = 1;
