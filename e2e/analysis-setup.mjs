/**
 * What the app says when you press an analysis mode it cannot enter.
 *
 * The old answer was one sentence about the whole document, first blocker
 * wins — and for a mode that simply did nothing, often no answer at all. This
 * checks the replacement: that the refusal opens a list, that the list names
 * the mechanism at fault rather than the drawing, that each entry says the way
 * out, and that the button offering to go to the part actually goes there.
 *
 *   PMKS_BASE_URL=<origin> node e2e/analysis-setup.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { readFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
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

const drawerText = () =>
  page
    .locator('app-analysis-setup')
    .innerText()
    .catch(() => '');
const tab = (name) => page.locator('.tabButton', { hasText: name });
// The chip is a plain label inside the mode button — one control per mode.
// The readiness chip is `chip-block` now, which draws itself on its own host.
const chipFor = (name) => page.locator('.tabButton', { hasText: name }).locator('chip-block');

async function open(payload) {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
}

// --- a mechanism that runs says so, and stays out of the way ----------------
await open(payloads['4-Bar']);
// Weight is a load: gravity hanging on links that have mass is a complete static
// problem. But a template arrives massless -- zero is the mass nobody chose, and
// every link starts there -- so a mass has to be given before gravity is worth
// switching off. That order is the whole point of what follows. The drawer only
// offers to turn gravity back on where doing so would settle the matter by
// itself, which means where something already has mass to be pulled on; with
// every link at zero, turning gravity on would fix nothing and the sentence says
// so instead ("turn gravity on in Settings *and give a link mass*").
//
// This used to skip the mass and expect the button anyway, on the strength of a
// comment claiming the four-bar arrives ready. It does not, and the button was
// correctly withheld.
//
// Set through the same three steps the Settings toggle and the mass field use,
// not by poking the subject alone: both are edits, and readiness is cached
// against the rebuild every edit funnels through. A bare `next()` leaves the
// cached readiness answering for the drawing as it was.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.links[0].mass = 1;
  grid.settings.isGravity.next(false);
  grid.mechanismSrv.updateMechanism(true);
});
await tab('Force').click();
await page.waitForTimeout(600);
let text = await drawerText();
record(
  'pressing a mode it cannot enter opens the list',
  text.includes('Force Analysis setup'),
  text
);
// Each mode has a drawer of its own: a reader refused by one should not have
// to read past the other mode's list to find out why.
record(
  'and the list answers the question that was asked, not the other one',
  text.includes('A load to react against') && !text.includes('Mechanism M1'),
  text
);
// The wall is "nothing loads this mechanism". The way out is named in the
// sentence either way, and here -- a body with mass drawn, one switch in another
// panel standing in the way -- the panel walks it for the reader.
record('naming the way out rather than only the wall', /Turn On Gravity/.test(text), text);
await page
  .locator('app-analysis-setup button-block', { hasText: 'Turn On Gravity' })
  .first()
  .click();
await page.waitForTimeout(600);
record(
  'and pressing it lifts the blocker it was standing under',
  !(await drawerText()).includes('A load to react against'),
  await drawerText()
);
await tab('Force').click();
await page.waitForTimeout(800);
// The drawer stays -- it carries the mass table, which force analysis reads
// from -- so what says the mode was entered is the analysis itself.
const entered = await page.evaluate(() => ({
  tab: ng.getComponent(document.querySelector('app-new-grid')).tabService.getCurrentTab(),
  graphs: !!document.querySelector('app-analysis-panel'),
}));
record(
  'so the mode that refused the reader now opens',
  entered.tab === 3 && entered.graphs,
  entered
);

// --- a mechanism with nothing driving it ------------------------------------
await open(payloads['4-Bar']);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.joints.forEach((joint) => (joint.input = false));
  srv.updateMechanism();
});
await page.waitForTimeout(400);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'an undriven mechanism is refused with its own reason',
  text.includes('No input is set'),
  text
);
record(
  'which names a joint that could take the job',
  /Right-click joint [A-Z] and set it as the input/.test(text),
  text
);

const chip = await chipFor('Kinematic').textContent();
record('and the mode chip counts it', chip.trim() === '1 fix', { chip });

// --- the button that offers to take you there, does -------------------------
const goTo = page.locator('app-analysis-setup button-block').first();
record('the check offers to go to the part', (await goTo.count()) === 1);
const label = await goTo.textContent();
await goTo.click();
await page.waitForTimeout(700);
const landed = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return {
    tab: grid.tabService.getCurrentTab(),
    selected: grid.activeObjService.getSelectedObjType(),
    id: grid.activeObjService.objType === 'Joint' ? grid.activeObjService.selectedJoint.id : null,
  };
});
record(
  'and pressing it lands in Edit with that joint selected',
  landed.tab === 1 && landed.selected === 'Joint' && label.includes(landed.id),
  { label, landed }
);

// Undo must not have been armed by looking at something.
const undoDisabled = await page.locator('.historyButton', { hasText: 'Undo' }).isDisabled();
record('going to a part is not an edit, so Undo stays where it was', undoDisabled === true);

// --- geometry that is in no mechanism ---------------------------------------
// The drawer opens when a mode refuses, so the mechanism is left undriven too:
// a valid one simply enters Kinematic and there is no drawer to read.
await open(payloads['4-Bar']);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  // A joint on its own, with no link: unassigned, and reported as such.
  const seed = srv.joints[0];
  const loose = Object.create(Object.getPrototypeOf(seed));
  Object.assign(loose, seed, {
    id: 'Z',
    name: 'Z',
    links: [],
    connectedJoints: [],
    ground: false,
    input: false,
  });
  srv.joints.push(loose);
  srv.joints.forEach((joint) => (joint.input = false));
  srv.updateMechanism();
});
await page.waitForTimeout(400);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'geometry in no mechanism gets its own section',
  text.includes('Not in any mechanism'),
  text
);

// --- the wrong number of degrees of freedom: which part, and what fixes it ---
// The count alone ("This mechanism has 3 degrees of freedom") is where the app
// used to stop. The drawer names the parts that move with the input held and
// the one edit it has counted, and following that advice has to make the
// mechanism run. The drawings are the fixture gallery's, published for exactly
// this; see `mobility-diagnosis.spec.ts`.
const galleryQuery = (name) => {
  const row = readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .find((line) => line.startsWith(`| [${name}](`));
  return row?.match(/\]\(https:\/\/[^)?]+\?([^)]*)\)/)?.[1];
};

await open(galleryQuery('Four-bar with an ungrounded pivot'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'too many freedoms names the loose links and the counted fix',
  text.includes('links BC and CD can still move') &&
    text.includes('Grounding joint D would leave one degree of freedom.'),
  text
);
const toD = page.getByRole('button', { name: 'Go To Joint D', exact: true });
record('and offers to go to the joint the fix is about', (await toD.count()) === 1);
await toD.click();
await page.waitForTimeout(600);
await page
  .locator('app-edit-panel toggle-block', { hasText: 'Grounded' })
  .getByRole('switch')
  .click();
await page.waitForTimeout(600);
const afterFix = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return { dof: srv.mechanisms.map((m) => m.dof), ready: srv.readinessOfEachMechanism()[0]?.ready };
});
record(
  'and grounding that joint in the Edit panel makes it run',
  afterFix.dof[0] === 1 && afterFix.ready === true,
  afterFix
);

await open(galleryQuery('Braced four-bar'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'too few freedoms finds the brace, and goes to the link',
  text.includes('Deleting link BD would leave one degree of freedom.') &&
    (await page.getByRole('button', { name: 'Go To Link BD', exact: true }).count()) === 1,
  text
);

// --- an input on a link that is grounded at both ends ------------------------
// The crank is frame, so the machine hanging off it was solved as if nothing
// drove it, and the drawer said "No input is set" beside the input's own arrow.
// The refusal is the actuator's: which ground pins the link down, and which to
// take away. Taking it away then leaves a crank with a link dangling off it,
// and the drawer moves on to that.
await open(galleryQuery('Crank grounded at both ends'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'an input on a grounded link says it cannot turn, not that there is none',
  text.includes('The input at joint A cannot turn') &&
    text.includes('Its link is also grounded at joint B') &&
    !text.includes('No input is set'),
  text
);
// The playback row said it too, from its own reading of the same drawing.
const row = await page.locator('app-playback-bar').innerText();
record(
  'and the playback row counts the fix rather than asking for an input',
  !row.includes('set one joint as an input') && /1 fix/.test(row),
  row
);
const toB = page.getByRole('button', { name: 'Go To Joint B', exact: true });
record('and offers to go to the ground that pins it', (await toB.count()) === 1);
await toB.click();
await page.waitForTimeout(600);
await page
  .locator('app-edit-panel toggle-block', { hasText: 'Grounded' })
  .getByRole('switch')
  .click();
await page.waitForTimeout(600);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'and ungrounding it lets the input turn, leaving the next thing to fix',
  !text.includes('cannot turn') &&
    text.includes('This mechanism has 2 degrees of freedom') &&
    text.includes('Any one of these would leave one degree of freedom:') &&
    text.includes('Delete link BC') &&
    text.includes('Attach a link from joint C to a new grounded joint'),
  text
);

// --- a count that reads one only because a link dangles ---------------------
// The four-bar with a bar across it counts zero and the link hanging off it
// counts one, so the total reads right and the solver cannot take a step. It
// used to be called a dead position, with advice to drag a joint off a limit;
// no drag frees it. The drawer names the rigid links, says what the one
// counted freedom really is, and offers the one deletion that frees the input.
await open(galleryQuery('Braced four-bar with a dangling link'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'an input that cannot move is not called a dead position',
  text.includes('The input at joint A cannot turn') &&
    text.includes('The one degree of freedom it counts is link HK') &&
    text.includes('Deleting link CE would let the input move them.') &&
    !text.includes('dead position'),
  text
);
await page.getByRole('button', { name: 'Go To Link CE', exact: true }).click();
await page.waitForTimeout(600);
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'and deleting that link frees it, leaving the dangling link to fix next',
  !text.includes('cannot turn') &&
    text.includes('link HK can still move') &&
    text.includes('Delete link HK') &&
    text.includes('Attach a link from joint K'),
  text
);

// --- a real dead center names the joint to drag, and dragging it works -------
// The Scotch yoke driven from its yoke starts at the end of the stroke. Off
// it, the walk still cannot start from a slider there, and the build hands the
// drawing to the simultaneous route -- so the advice is only true because both
// halves are in place, which is why it is followed here rather than read.
await open(payloads['Scotch_Yoke']);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.joints.forEach((joint) => (joint.input = joint.id === 'C'));
  srv.updateMechanism(true);
});
await page.waitForTimeout(400);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'a real dead center says which joint to drag',
  text.includes('starts at a dead position') && text.includes('Drag joint B a little'),
  text
);
await page.getByRole('button', { name: 'Go To Joint B', exact: true }).click();
await page.waitForTimeout(600);
const pinB = await page.evaluate(() => {
  for (const el of document.querySelectorAll('#jointHolder > svg')) {
    if (el.querySelector('[id^="joint_"]')?.id !== 'joint_B') continue;
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
  return null;
});
await page.mouse.move(pinB.x, pinB.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(pinB.x - i * 2, pinB.y - i * 6);
  await page.waitForTimeout(60);
}
await page.mouse.up();
await page.waitForTimeout(800);
const offTheCenter = await page.evaluate(() =>
  ng
    .getComponent(document.querySelector('app-new-grid'))
    .mechanismSrv.readinessOfEachMechanism()
    .map((one) => ({ ready: one.ready, titles: one.checks.map((check) => check.title) }))
);
record(
  'and dragging that joint a little takes it off the dead center, so it runs',
  offTheCenter.length > 0 && offTheCenter.every((one) => one.ready),
  offTheCenter
);

// --- an input the walk cannot start from, which the build solves anyway ------
// The scissor lift driven from its floor pivot was a "dead position" once.
await open(payloads['Scissor_Lift']);
const fromTheFloor = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.joints.forEach((joint) => (joint.input = joint.id === 'A'));
  srv.updateMechanism(true);
  return srv.readinessOfEachMechanism().map((one) => ({
    ready: one.ready,
    titles: one.checks.map((check) => check.title),
  }));
});
record(
  'a scissor lift driven from its floor pivot runs',
  fromTheFloor.length > 0 && fromTheFloor.every((one) => one.ready),
  fromTheFloor
);

// --- mistakes the student-mistakes sweep taught the drawer to name ----------
// Each is followed the way a reader would: the button, then the one edit the
// sentence asks for, with the control a reader would use for it.
const readinessNow = () =>
  page.evaluate(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.readinessOfEachMechanism()
      .map((one) => ({ ready: one.ready, titles: one.checks.map((check) => check.title) }))
  );
const allReady = (machines) => machines.length > 0 && machines.every((one) => one.ready);

await open(galleryQuery('Four-bar with a welded coupler pin'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'a pin welded by mistake is named, with the unweld counted',
  text.includes('Unwelding joint C would leave one degree of freedom.'),
  text
);
await page.getByRole('button', { name: 'Go To Joint C', exact: true }).click();
await page.waitForTimeout(600);
await page
  .locator('app-edit-panel segmented-block button', { hasText: 'Revolute' })
  .first()
  .click();
await page.waitForTimeout(700);
let machinesNow = await readinessNow();
record('and choosing Revolute for it makes the four-bar run', allReady(machinesNow), machinesNow);

await open(galleryQuery('Rocker dropped beside the coupler pin'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'a joint dropped beside another is named as that, not as a count',
  text.includes('Joint E is not joined to joint C') &&
    text.includes('Dragging joint E onto joint C') &&
    !text.includes('degrees of freedom'),
  text
);
// The part that is a machine only because of the stray joint used to get the
// generic setup hint in the playback row, beside the drawer's real answer.
const besideRow = await page.locator('app-playback-bar').innerText();
record(
  'and the playback row counts it rather than asking for an input',
  !besideRow.includes('set one joint as an input') && /1 fix/.test(besideRow),
  besideRow
);
await page.getByRole('button', { name: 'Go To Joint E', exact: true }).first().click();
await page.waitForTimeout(600);
const onScreen = (id) =>
  page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('#jointHolder > svg')) {
      if (el.querySelector('[id^="joint_"]')?.id !== `joint_${wanted}`) continue;
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  }, id);
const [fromE, toC] = [await onScreen('E'), await onScreen('C')];
await page.mouse.move(fromE.x, fromE.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(
    fromE.x + ((toC.x - fromE.x) * i) / 8,
    fromE.y + ((toC.y - fromE.y) * i) / 8
  );
  await page.waitForTimeout(40);
}
await page.mouse.up();
await page.waitForTimeout(800);
machinesNow = await readinessNow();
record('and dragging it onto the other joins them, and the four-bar runs', allReady(machinesNow), {
  machinesNow,
  joints: await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.map((j) => j.id)
  ),
});

await open(galleryQuery('Four-bar braced from its input pivot'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'a bar from the input pivot is named, and the one to delete',
  text.includes('The input at joint A has more than one link to turn') &&
    text.includes('Deleting link AC would leave one degree of freedom.'),
  text
);
await page.getByRole('button', { name: 'Go To Link AC', exact: true }).click();
await page.waitForTimeout(600);
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
machinesNow = await readinessNow();
record('and deleting it makes the four-bar run', allReady(machinesNow), machinesNow);

// --- several ways out, each for the reader to choose -------------------------
// A link left hanging is either a mistake or the first bar of more linkage,
// and nothing in the drawing says which: both are listed, each with a button.
await open(galleryQuery('Crank with a dangling link'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
const ways = await page.locator('app-analysis-setup .way').allInnerTexts();
record(
  'two ways out are listed, each with its own button',
  ways.length === 2 &&
    ways[0].includes('Delete link BC') &&
    ways[0].includes('Go To Link BC') &&
    ways[1].includes('Attach a link from joint C to a new grounded joint') &&
    ways[1].includes('Go To Joint C'),
  ways
);
await page.locator('app-analysis-setup .way').nth(1).locator('button-block').click();
await page.waitForTimeout(600);
const wentTo = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return grid.activeObjService.objType === 'Joint' ? grid.activeObjService.selectedJoint.id : null;
});
record('and the second button goes to its own part', wentTo === 'C', { wentTo });

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
