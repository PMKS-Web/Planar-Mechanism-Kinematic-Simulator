/**
 * The right-click menu, in every mode and on every kind of part.
 *
 * The menu used to be one flat list of up to eight equally weighted rows with
 * Delete at the top, labels that rewrote themselves as the object changed, and
 * three different ways of saying no -- hidden here, grayed silently there,
 * clickable-and-then-refused somewhere else. What is checked here is the
 * promise the redesign makes instead: a fixed ladder, states written as states,
 * and one availability rule with the model's own reason on every grayed row.
 *
 * The reasons matter more than the rows. A row grayed for the wrong reason
 * sends a student to fix the wrong thing, so the assertions read the text in
 * the right-hand slot rather than just the disabled flag.
 *
 *   PMKS_BASE_URL=<origin> node e2e/context-menu.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';

/** A crank-rocker with a tracer on the coupler. */
const FOURBAR =
  '?2P.Ay,1E8.5,0.1011.4O,O,0,0,0.0A,A,72,MM,0.2C,C,pa,bW,0.4D,D,_W,0,0.0T,T,Wq,pa,0..YROA,OA,Fe,Fe,3X,BB,c5cae9,O,A,,.YRACT,ACT,Fe,Fe,UU,b9,303e9f,A,C,T,,.YRCD,CD,Fe,Fe,v2,Im,0d125a,C,D,,...N_3';
/** A sealed cylinder driving a rocker. */
const CYLINDER =
  '?2P.Ay,1E8.5,0.1011.4A,A,0_W,0,0.0B,B,07E,0,0.8C,C,0OE,0,0.0D,D,V4,0,0.6E,E,V4,ku,0.XP,P,0OE,0,0,AB,A,B..YRAB,AB,Fe,Fe,0Yt,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,3R,0,303e9f,C,D,,.YRDE,DE,Fe,Fe,V4,NS,0d125a,D,E,,.YPCP,CP,0,0,0,0,,C,P,,...N_h';
/** Three synthesis positions and nothing else drawn. */
const POSITIONS =
  '?2P.KB,1E8.5,0.1011....N_.SD~w3~1~9,SP~12a~eO~01DP8,SP~2w9~x2~05t0,SP~3xv~0vL~0bAtJ';

const checks = [];
const check = (what, ok, detail) => {
  checks.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** The open menu, read as data: rows, their state, and the slot on the right. */
const readMenu = () =>
  page.evaluate(() => {
    const card = document.querySelector('#contextMenu');
    if (!card || getComputedStyle(card).display === 'none') return null;
    const slot = (row) =>
      row.querySelector('.cm-row__reason')?.textContent?.trim() ??
      row.querySelector('.cm-row__hint')?.textContent?.trim() ??
      row.querySelector('.cm-row__key')?.textContent?.trim() ??
      (row.querySelector('.cm-row__check') ? 'check' : '');
    const cross = card.querySelector('.cm-cross');
    return {
      title: card.querySelector('.cm-header__title')?.textContent?.trim() ?? null,
      subtitle: card.querySelector('.cm-header__subtitle')?.textContent?.trim() ?? null,
      cross: cross ? (cross.classList.contains('cm-cross--off') ? 'off' : 'on') : null,
      // Upper-cased by the stylesheet, so the text node keeps its own case.
      groups: [...card.querySelectorAll('.cm-group__label')].map((one) =>
        one.textContent.trim().toUpperCase()
      ),
      rows: [...card.querySelectorAll('.cm-row')].map((one) => ({
        label: one.querySelector('.cm-row__label')?.textContent?.trim() ?? '',
        slot: slot(one),
        on: one.classList.contains('cm-row--on'),
        off: one.classList.contains('cm-row--off'),
        destructive: one.classList.contains('cm-row--destructive'),
      })),
    };
  });

const rowNamed = (menu, label) => menu?.rows.find((one) => one.label === label);

/**
 * Right-click a point that is actually on the element.
 *
 * Not simply its bounding-box center: the left card is 250px wide and 400px in
 * the analysis modes, and a part drawn near the left edge has its center under
 * that card — the click then lands on the panel and no menu opens at all,
 * which reads as the menu being broken rather than the aim being off.
 */
async function openOn(selector) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const at = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    const owns = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === node || node.contains(hit) || hit.closest(sel) === node);
    };
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (owns(center.x, center.y)) return center;
    for (const fx of [0.7, 0.3, 0.85, 0.15]) {
      for (const fy of [0.5, 0.3, 0.7]) {
        const spot = { x: box.x + box.width * fx, y: box.y + box.height * fy };
        if (owns(spot.x, spot.y)) return spot;
      }
    }
    return center;
  }, selector);
  if (!at) return null;
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(350);
  return readMenu();
}

/**
 * Build the menu for a part the pointer cannot reliably land on.
 *
 * A force is drawn as a thin arrow: its bounding box is large but almost none
 * of it is the stroke, so sampling points inside the box hits the canvas
 * behind it. The gesture is covered by every other case here; what this is
 * for is what the menu *says* about a force.
 */
async function openOnForce(id) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return page.evaluate((forceId) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const force = grid.mechanismSrv.forces.find((one) => (one.id ?? one.name) === forceId);
    if (!force) return null;
    grid.setLastRightClick(force);
    const rows = grid.cMenu.groups.flatMap((group) =>
      group.rows.map((row) => ({
        label: row.label,
        slot: row.refusal?.short ?? (row.checked ? 'check' : (row.hint ?? row.shortcut ?? '')),
        on: row.checked && !row.disabled,
        off: row.disabled,
        destructive: row.destructive,
      }))
    );
    return {
      title: grid.cMenu.header?.title ?? null,
      subtitle: grid.cMenu.header?.subtitle ?? null,
      cross: grid.cMenu.header?.crossing ? 'on' : null,
      groups: grid.cMenu.groups.map((group) => group.label).filter(Boolean),
      rows,
    };
  }, id);
}

async function openAt(x, y) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.mouse.click(x, y, { button: 'right' });
  await page.waitForTimeout(350);
  return readMenu();
}

// ---------------------------------------------------------------- Edit mode

await openMechanism(page, BASE + FOURBAR);

/**
 * The row that deletes the part itself.
 *
 * In Edit mode the ladder now ends with two destructive rows — the part's own
 * Delete, and below it the whole-mechanism delete, which takes the machine. So the
 * part's Delete is the last row only where the machine-wide one is not offered.
 */
const ownDelete = (menu) => {
  const rows = menu?.rows ?? [];
  const last = rows.at(-1);
  return last?.label.startsWith('Delete entire mechanism') ? rows.at(-2) : last;
};

const jointA = await openOn('#joint_A');
check('a joint menu names the joint it is about', jointA?.title === 'Joint A', jointA?.title);
check('and what it is made of', jointA?.subtitle === 'Pin · Links OA, ACT', jointA?.subtitle);
check(
  'the ladder is Attach, State, Traces',
  JSON.stringify(jointA?.groups) === JSON.stringify(['ATTACH', 'STATE', 'TRACES']),
  jointA?.groups
);
check(
  'the deletions are the last rows, and the only red ones',
  jointA?.rows.at(-1)?.destructive === true &&
    ownDelete(jointA)?.destructive === true &&
    // Red belongs to the foot of the ladder and nowhere above it.
    jointA?.rows.filter((one) => one.destructive).length === 2 &&
    jointA?.rows.slice(0, -2).every((one) => !one.destructive),
  jointA?.rows.map((one) => one.label)
);
check(
  'states are states, not verbs that rewrite themselves',
  ['Grounded', 'Driven Input', 'Slider', 'Welded', 'Trace path', 'Locked'].every((label) =>
    rowNamed(jointA, label)
  ) && !jointA?.rows.some((one) => /^(Add|Remove) /.test(one.label)),
  jointA?.rows.map((one) => one.label)
);
check(
  'a load will not anchor where two links share the pin',
  rowNamed(jointA, 'Force')?.off === true && rowNamed(jointA, 'Force')?.slot === '2 links share it',
  rowNamed(jointA, 'Force')
);
check(
  'the destructive row names what goes with it',
  ownDelete(jointA)?.label === 'Delete Joint (and Link OA)',
  ownDelete(jointA)?.label
);
check(
  'and carries its key from the registry',
  ownDelete(jointA)?.slot === 'Delete' && rowNamed(jointA, 'Locked')?.slot === 'K',
  { del: ownDelete(jointA)?.slot, lock: rowNamed(jointA, 'Locked')?.slot }
);

const groundO = await openOn('#joint_O');
check(
  'a ground pivot reads as one, with its state ticked',
  groundO?.subtitle === 'Ground pin · Link OA' && rowNamed(groundO, 'Grounded')?.on === true,
  { subtitle: groundO?.subtitle, grounded: rowNamed(groundO, 'Grounded') }
);
check(
  'a weld with nothing to fuse is grayed with the reason',
  rowNamed(groundO, 'Welded')?.slot === 'needs 2 links',
  rowNamed(groundO, 'Welded')
);

const tracerT = await openOn('#joint_T');
check(
  'a tracer cannot be driven, and the model says why',
  rowNamed(tracerT, 'Driven Input')?.slot === 'needs 2 bodies',
  rowNamed(tracerT, 'Driven Input')
);
check(
  'a joint that orphans nothing says plain Delete Joint',
  ownDelete(tracerT)?.label === 'Delete Joint',
  ownDelete(tracerT)?.label
);

const link = await openOn('[id="OA"]');
check(
  'a link menu offers the four attachments and a copy',
  ['Link', 'Cylinder', 'Tracer Point', 'Force', 'Duplicate Link'].every((label) =>
    rowNamed(link, label)
  ),
  link?.rows.map((one) => one.label)
);
check(
  'and counts the joints its deletion would sweep up',
  ownDelete(link)?.label === 'Delete Link (and Joint O)',
  ownDelete(link)?.label
);

const canvas = await openAt(1150, 780);
check(
  'the canvas menu says Add rather than Attach',
  JSON.stringify(canvas?.groups) === JSON.stringify(['ADD', 'MECHANISM']),
  canvas?.groups
);
check(
  'and counts what Lock All and Unlock All would touch',
  rowNamed(canvas, 'Lock All')?.slot === '5 open' &&
    rowNamed(canvas, 'Unlock All')?.slot === 'nothing locked' &&
    rowNamed(canvas, 'Unlock All')?.off === true,
  { lock: rowNamed(canvas, 'Lock All'), unlock: rowNamed(canvas, 'Unlock All') }
);

// A lock, set from the menu, and read back from it.
await openOn('#joint_A');
await page.click('.cm-row:has(.cm-row__label:text-is("Locked"))');
await page.waitForTimeout(700);
const locked = await openOn('#joint_A');
check(
  'a locked joint ticks its own switch',
  rowNamed(locked, 'Locked')?.on === true,
  rowNamed(locked, 'Locked')
);
check(
  'still offers to delete it -- a lock is about position, not existence',
  ownDelete(locked)?.off === false && ownDelete(locked)?.slot !== 'unlock first',
  ownDelete(locked)
);
check(
  'and offers attachments for the same reason again',
  rowNamed(locked, 'Link')?.off === false && rowNamed(locked, 'Link')?.slot !== 'unlock first',
  rowNamed(locked, 'Link')
);
check(
  'while the switch that frees it stays live',
  rowNamed(locked, 'Locked')?.off === false,
  rowNamed(locked, 'Locked')
);

// ------------------------------------------------------------ analysis mode

await page.keyboard.press('Escape');
const editJoint = await openOn('#joint_T');
await page.keyboard.press('Escape');
await page.click('text=Kinematic Analysis');
await page.waitForTimeout(900);
const analysisJoint = await openOn('#joint_T');
check(
  'analysis offers the same rows as Edit at the start pose',
  JSON.stringify(analysisJoint?.rows.map((one) => one.label)) ===
    JSON.stringify(editJoint?.rows.map((one) => one.label)),
  analysisJoint?.rows.map((one) => one.label)
);
check('and the way back into Edit rides the header', analysisJoint?.cross === 'on', analysisJoint);

await page.keyboard.press('Escape');
await page.click('text=Force Analysis');
await page.waitForTimeout(900);
const forceJoint = await openOn('#joint_T');
// The reason lives on the vector toggle now. "Graph Joint Force" used to sit
// beside it and did nothing a left click does not already do -- it selected the
// joint -- so the reader who wanted the arrows was offered the panel instead,
// one row under the switch that draws them.
check(
  'a tracer is not offered force arrows, and the row says why',
  rowNamed(forceJoint, 'Force Vectors')?.off === true &&
    !!rowNamed(forceJoint, 'Force Vectors')?.slot,
  rowNamed(forceJoint, 'Force Vectors')
);
check(
  'and nothing offers to graph what a click already opens',
  rowNamed(forceJoint, 'Graph Joint Force') === undefined,
  forceJoint?.rows?.map((one) => one.label)
);
check(
  'while the trace stays live: it is a view, not geometry',
  rowNamed(forceJoint, 'Trace path')?.off === false,
  rowNamed(forceJoint, 'Trace path')
);

// ---------------------------------------------------------------- cylinder

await openMechanism(page, BASE + CYLINDER);
const cylinderJoint = await openOn('#joint_A');
check(
  'a cylinder joint says which end of which cylinder it is',
  cylinderJoint?.subtitle?.startsWith('Barrel joint · Cylinder'),
  cylinderJoint?.subtitle
);
check(
  'a sealed part cannot be welded into a neighbor',
  rowNamed(cylinderJoint, 'Welded')?.slot === 'part is sealed',
  rowNamed(cylinderJoint, 'Welded')
);
check(
  'and the deletion says it takes the whole part',
  ownDelete(cylinderJoint)?.label === 'Delete Joint (and Cylinder)',
  ownDelete(cylinderJoint)?.label
);
// Grayed, not absent: the joint menu is one menu, and a row that is there on
// one joint and gone on the next is a row a reader cannot learn the place of.
check(
  'a cylinder joint takes no block: the row is there and grayed with the reason',
  rowNamed(cylinderJoint, 'Slider')?.slot === 'part of a cylinder',
  rowNamed(cylinderJoint, 'Slider')
);
check(
  'and Free to Move is on every joint, on and grayed where nothing holds it',
  rowNamed(jointA, 'Free to Move')?.slot === 'nothing holds it' &&
    rowNamed(cylinderJoint, 'Free to Move')?.slot === 'nothing holds it',
  [rowNamed(jointA, 'Free to Move'), rowNamed(cylinderJoint, 'Free to Move')]
);

const cylinderBody = await openOn('[id="AB"]');
check(
  'a cylinder is described as one part, not as how it is built',
  /^Barrel and rod · Joints /.test(cylinderBody?.subtitle ?? '') &&
    !/assembly|sealed/i.test(cylinderBody?.subtitle ?? ''),
  cylinderBody?.subtitle
);

// Duplicate on a link with three joints: the case that used to accept the
// click and silently do nothing.
await openMechanism(page, BASE + FOURBAR);
const linksBefore = await page.$$eval('path[id]', (nodes) => nodes.map((one) => one.id));
await openOn('[id="ACT"]');
await page.click('.cm-row:has(.cm-row__label:text-is("Duplicate Link"))');
await page.waitForTimeout(1000);
const linksAfter = await page.$$eval('path[id]', (nodes) => nodes.map((one) => one.id));
const copyMade = await page.evaluate((known) => {
  const service = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const source = service.links.find((one) => one.id === 'ACT');
  const copy = service.links.find((one) => !known.includes(one.id));
  if (!copy || !source) return null;
  const gap = Math.hypot(
    copy.joints[0].x - source.joints[0].x,
    copy.joints[0].y - source.joints[0].y
  );
  return {
    joints: copy.joints.length,
    sharesAJoint: copy.joints.some((one) => source.joints.some((other) => other.id === one.id)),
    gap: Math.round(gap),
    // The copy is set aside by a fixed share of the object scale, and the
    // object scale follows the zoom the canvas settles at -- so the distance
    // in model units is not a constant, and asserting one made this check
    // depend on how much room the chrome happened to leave the canvas.
    expectedGap: Math.round(0.9 * service.settingsService.objectScale),
    mass: copy.mass,
    sourceMass: source.mass,
  };
}, linksBefore);
check(
  'Duplicate copies a three-joint link, free-standing and clear of the original',
  copyMade?.joints === 3 &&
    copyMade?.sharesAJoint === false &&
    Math.abs((copyMade?.gap ?? 0) - (copyMade?.expectedGap ?? -1)) <= 1,
  copyMade
);
check(
  'and copies the body with it, not just its outline',
  copyMade?.mass === copyMade?.sourceMass,
  copyMade
);

// -------------------------------------------------------- synthesis positions

await openMechanism(page, BASE + POSITIONS);
await page.click('text=Synthesis');
await page.waitForTimeout(900);
const synthCanvas = await openAt(1250, 830);
check(
  'Synthesis offers the positions and nothing else',
  JSON.stringify(synthCanvas?.rows.map((one) => one.label)) ===
    JSON.stringify(['Delete 3 Synthesis Positions']),
  synthCanvas?.rows.map((one) => one.label)
);

// --------------------------------------------------- one grid, two machines

/** Two four-bars side by side, each with its own drive. */
const TWO_FOUR_BARS =
  '?2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
  '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
  'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
  'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
  'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';

await openMechanism(page, BASE + TWO_FOUR_BARS);
const bothFine = await openOn('#joint_F');
check(
  'a part of a machine that runs offers the way into analysis',
  bothFine?.cross === 'on',
  bothFine
);

// Take the input off the second machine only.
await openOn('#joint_E');
await page.click('.cm-row:has(.cm-row__label:text-is("Driven Input"))');
await page.waitForTimeout(900);
const broken = await openOn('#joint_F');
check('a part of a machine that cannot run does not', broken?.cross === 'off', broken);
const stillFine = await openOn('#joint_C');
check(
  'while the machine beside it still does — the question is per part',
  stillFine?.cross === 'on',
  stillFine
);

// -------------------------------------------- a slider, and a load on a bar

/** An inverted slider-crank carrying a force: a floating slider and an F1. */
const SLIDER_AND_LOAD =
  '?2P.Ay,1E8.5,0.1011.6A,A,0,0,0.0B,B,0,Fe,0.4C,C,ku,0,0.0D,D,0RF,Oj,0.1P,P,0,Fe,0,CD,C,D..' +
  'YRAB,AB,Fe,Fe,0,7q,c5cae9,A,B,,.YRCD,CD,Fe,Fe,9q,CN,303e9f,C,D,,.YPBP,BP,0,0,0,0,,B,P,,..' +
  '2F1,CD,F1,0RF,Oj,0RF,95,2SG..N_M';

await openMechanism(page, BASE + SLIDER_AND_LOAD);
const sliderPin = await openOn('#joint_B');
check(
  'a slider pin says it is one, and its Slider switch is on',
  /^Slider pin · /.test(sliderPin?.subtitle ?? '') && rowNamed(sliderPin, 'Slider')?.on === true,
  sliderPin
);
check(
  // Offered rather than hidden: the model has no rule against welding a slider
  // pin, and the panel offers it, so the menu does too and the refusal comes
  // with its reason if the fuse cannot stand.
  'and keeps its Weld row, as the panel does',
  rowNamed(sliderPin, 'Welded')?.off === false,
  sliderPin?.rows.map((one) => one.label)
);

const forceTarget = await openOnForce('F1');
check(
  'a force menu names the frame it is in and offers the state, not a verb',
  /frame$/.test(forceTarget?.subtitle ?? '') && !!rowNamed(forceTarget, 'Global Frame'),
  forceTarget
);
check(
  'and reversing it is a verb, under Set',
  rowNamed(forceTarget, 'Reverse Direction')?.off === false,
  forceTarget?.groups
);

// The floating slider's carrier is deliberately not one of its `links`, so a
// menu that counted links called this "one part meets it" while the force
// solver was generating a reaction against two.
await page.keyboard.press('Escape');
await page.click('text=Force Analysis');
await page.waitForTimeout(900);
const sliderForce = await openOn('#joint_B');
check(
  'a slider pin is not told it has no force to draw',
  rowNamed(sliderForce, 'Force Vectors')?.off === false,
  rowNamed(sliderForce, 'Force Vectors')
);

check('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
