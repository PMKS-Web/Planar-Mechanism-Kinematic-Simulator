/**
 * What the app says when you press an analysis mode it cannot enter.
 *
 * The old answer was one sentence about the whole document, first blocker
 * wins — and for a mode that simply did nothing, often no answer at all. This
 * checks the replacement: that the refusal opens a list, that the list names
 * the mechanism at fault rather than the drawing, that each entry says the way
 * out behind "Show fixes", and that a part named in it is a link that goes
 * there.
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
/**
 * The drawer's text with every issue's fixes open, as a reader who pressed each
 * "Show fixes" sees it.
 */
async function openText() {
  const closed = page.locator('app-analysis-setup issue-block .issueToggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) {
    await closed.first().click();
    await page.waitForTimeout(60);
  }
  return drawerText();
}
/** A part the drawer names, as the link to it: "joint D", "link BD". */
const partLink = (label) =>
  page
    .locator('app-analysis-setup part-link button', { hasText: new RegExp(`^${label}$`) })
    .first();
/** Every fix listed, in order, once the fixes are open. */
const fixTexts = () => page.locator('app-analysis-setup .issueFix').allInnerTexts();
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
// A template arrives massless -- zero is the mass nobody chose, and every link
// starts there -- and with no force applied there is nothing for a reaction to
// balance, in Static or In-motion alike. Mass alone is a load (gravity weighs
// it, and the motion accelerates it even with gravity off), so the way out the
// drawer names is to give a link one.
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
  text.includes('Nothing loads the mechanism') && !text.includes('Mechanism 1'),
  text
);
// The one issue in the Force drawer opens with its fixes showing, and none is
// a button: the drawer says where the mass is typed rather than typing it.
record(
  'a lone issue opens with its fixes, none of them a button',
  text.includes('Type a mass in the Masses table') &&
    (await page.locator('app-analysis-setup button-block').count()) === 0,
  text
);
text = await openText();
record(
  'naming the way out rather than only the wall',
  text.includes('Needs a fix to run. Some options:') &&
    text.includes('Type a mass in the Masses table'),
  text
);
// A mass typed, by the same steps the mass field takes.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.links[0].mass = 1;
  grid.mechanismSrv.updateMechanism(true);
});
await page.waitForTimeout(600);
record(
  'and doing it lifts the blocker it was standing under',
  !(await drawerText()).includes('Nothing loads the mechanism'),
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
text = await openText();
record('which names a joint that could take the job', /Add Input to joint [A-Z]/.test(text), text);

const chip = await chipFor('Kinematic').textContent();
record('and the mode chip counts it', chip.trim() === '1 fix', { chip });

// --- a part the drawer names takes you there --------------------------------
const named = page.locator('app-analysis-setup part-link button').first();
record('the fix names the part as a link to it', (await named.count()) === 1);
const label = (await named.textContent()).trim();
await named.hover();
await page.waitForTimeout(200);
const pointed = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.linkedPart?.id
);
record('and pointing at it lights that part on the grid', label.endsWith(` ${pointed}`), {
  label,
  pointed,
});
await named.click();
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
  landed.tab === 1 && landed.selected === 'Joint' && label === `joint ${landed.id}`,
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
  'too many freedoms names the loose links',
  text.includes('3 degrees of freedom, needs 1') &&
    text.includes('link BC and link CD can still move'),
  text
);
text = await openText();
record('and the counted fix, behind Show fixes', text.includes('Ground joint D'), text);
const toD = partLink('joint D');
record('and names the joint the fix is about as a link to it', (await toD.count()) === 1);
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
text = await openText();
record(
  'too few freedoms finds the brace, and links to it',
  text.includes("Over-constrained, can't move") &&
    text.includes('Delete link BD') &&
    (await partLink('link BD').count()) === 1,
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
  text.includes("Input at joint A can't turn") &&
    text.includes('Link AB is also grounded at joint B') &&
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
const toB = partLink('joint B');
record('and names the ground that pins it as a link to it', (await toB.count()) === 1);
await toB.click();
await page.waitForTimeout(600);
await page
  .locator('app-edit-panel toggle-block', { hasText: 'Grounded' })
  .getByRole('switch')
  .click();
await page.waitForTimeout(600);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await openText();
record(
  'and ungrounding it lets the input turn, leaving the next thing to fix',
  !text.includes("can't turn") &&
    text.includes('2 degrees of freedom, needs 1') &&
    text.includes('Delete link BC') &&
    text.includes('Attach Link at joint C, then ground its far end'),
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
text = await openText();
record(
  'an input that cannot move is not called a dead position',
  text.includes("Input at joint A can't turn") &&
    text.includes('If the count still says 1') &&
    text.includes('Delete link CE') &&
    !text.includes('limit'),
  text
);
await partLink('link CE').click();
await page.waitForTimeout(600);
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await openText();
record(
  'and deleting that link frees it, leaving the dangling link to fix next',
  !text.includes("can't turn") &&
    text.includes('link HK can still move') &&
    text.includes('Delete link HK') &&
    text.includes('Attach Link at joint K, then ground its far end'),
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
text = await openText();
record(
  'a real dead center says which joint to drag',
  text.includes('Starts at a limit') && text.includes('Drag joint B a little way off the limit'),
  text
);
await partLink('joint B').click();
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
text = await openText();
record(
  'a pin welded by mistake is named, with the unweld counted',
  text.includes("Over-constrained, can't move") && text.includes('Set joint C to Revolute'),
  text
);
await partLink('joint C').click();
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
text = await openText();
record(
  'a joint dropped beside another is named as that, not as a count',
  text.includes("Joint E isn't joined to joint C") &&
    text.includes('Drag joint E onto joint C') &&
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
await partLink('joint E').click();
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
text = await openText();
record(
  'a bar from the input pivot is named, and the one to delete',
  text.includes('Joint A has 2 links to turn') && text.includes('Delete link AC'),
  text
);
await partLink('link AC').click();
await page.waitForTimeout(600);
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
machinesNow = await readinessNow();
record('and deleting it makes the four-bar run', allReady(machinesNow), machinesNow);

// --- several ways out, each for the reader to choose -------------------------
// A link left hanging is a mistake, an arm meant to turn with the crank, or the
// first bar of more linkage, and nothing in the drawing says which: all three
// are listed as suggestions, each naming its part as a link.
await open(galleryQuery('Crank with a dangling link'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
await openText();
const ways = await fixTexts();
record(
  'three ways out are listed, each naming its part',
  JSON.stringify(ways) ===
    JSON.stringify([
      'Delete link BC',
      'Set joint B to Welded',
      'Attach Link at joint C, then ground its far end',
    ]),
  ways
);
await page.locator('app-analysis-setup li.issueFix').nth(2).locator('part-link button').click();
await page.waitForTimeout(600);
const wentTo = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return grid.activeObjService.objType === 'Joint' ? grid.activeObjService.selectedJoint.id : null;
});
record('and the last one goes to its own part', wentTo === 'C', { wentTo });

// With joint C now selected, the next part a reader points at still lights: a
// list of fixes is followed one part after another.
await partLink('link BC').hover();
await page.waitForTimeout(250);
const litWhileSelected = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  return {
    bc: srv.getLinkCSSClass(srv.links.find((link) => link.id === 'BC')),
    c: srv.getJointCSSClass(srv.joints.find((joint) => joint.id === 'C')),
    painted: document.querySelectorAll('.link-pointed').length,
  };
});
record(
  'and pointing at another part lights it while joint C stays selected',
  litWhileSelected.bc.includes('link-pointed') &&
    litWhileSelected.c.includes('joint-selected') &&
    litWhileSelected.painted > 0,
  litWhileSelected
);
await page.mouse.move(5, 5);
await page.waitForTimeout(200);
const letGo = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.getLinkCSSClass(srv.links.find((link) => link.id === 'BC'));
});
record('and lets go of it when the pointer leaves', !letGo.includes('link-pointed'), letGo);

// In an analysis mode a machine that cannot run is drawn gray, and those are
// exactly the parts a setup drawer names: pointing lights them all the same.
// The crank runs; the rocker beside it, with its coupler never drawn, does not.
// Arriving opens the drawer on its own: one of the two cannot run.
await open(galleryQuery('Four-bar with its coupler missing'));
await tab('Kinematic').click();
await page.waitForTimeout(900);
record(
  'arriving in a mode with a machine that cannot run opens its list',
  (await drawerText()).includes("Link CD isn't joined to link AB"),
  await drawerText()
);
await partLink('link CD').hover();
await page.waitForTimeout(250);
const litWhileInert = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  return {
    tab: grid.tabService.getCurrentTab(),
    cd: srv.getLinkCSSClass(srv.links.find((link) => link.id === 'CD')),
  };
});
record(
  'and lights a part of a machine the analysis mode draws gray',
  litWhileInert.tab === 2 && litWhileInert.cd.includes('link-pointed'),
  litWhileInert
);
await page.mouse.move(5, 5);

// --- more than one thing wrong, said at once ---------------------------------
// The solver stops at the count; a missing input does not wait on it, so the
// drawer says both, and every count of fixes says two.
await open(galleryQuery('Four-bar with a hanging link and no input'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'a count that is wrong and a missing input are said together',
  text.includes('2 degrees of freedom, needs 1') && text.includes('No input is set'),
  text
);
const bothChip = (
  await chipFor('Kinematic')
    .innerText()
    .catch(() => '')
).trim();
const bothRow = await page.locator('app-playback-bar').innerText();
record(
  'and the mode chip and the playback row both count two fixes',
  /2 fixes/.test(bothChip) && /2 fixes/.test(bothRow) && !bothRow.includes('set one joint'),
  { bothChip, bothRow }
);
await openText();
await partLink('link CE').click();
await page.waitForTimeout(400);
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
text = await drawerText();
record(
  'and deleting the hanging link leaves only the input to set',
  !text.includes('degrees of freedom') && text.includes('No input is set'),
  text
);

// A bent coupler drawn as two links, the weld at its knee left off: welding the
// knee is listed first, and the joint's own type is where a reader welds it.
await open(galleryQuery('Four-bar with the weld at its knee left off'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
await openText();
const kneeWays = await fixTexts();
record(
  'a weld left off is offered first, before the fixes that change another link',
  kneeWays.length === 3 && kneeWays[0] === 'Set joint C to Welded',
  kneeWays
);
await page.locator('app-analysis-setup li.issueFix').first().locator('part-link button').click();
await page.waitForTimeout(600);
await page.locator('app-edit-panel segmented-block button', { hasText: 'Welded' }).first().click();
await page.waitForTimeout(700);
machinesNow = await readinessNow();
record('and welding C makes the four-bar run', allReady(machinesNow), machinesNow);

// A Scotch yoke whose guide was left a Pin-in-slot: the yoke turns as well as
// slides, and Prismatic is one choice away in the same control.
await open(galleryQuery('Scotch yoke on a Pin-in-slot guide'));
await tab('Kinematic').click();
await page.waitForTimeout(600);
await openText();
const yokeWays = await fixTexts();
record(
  "a yoke's guide left free to turn is offered Prismatic first",
  // The only one: B rides a slot in the moving yoke, and a Prismatic joint on
  // a moving carrier is a shape the solver refuses, so it is not offered.
  yokeWays.length === 1 && yokeWays[0] === 'Set joint C to Prismatic',
  yokeWays
);
await page.locator('app-analysis-setup .issueFix').first().locator('part-link button').click();
await page.waitForTimeout(600);
await page
  .locator('app-edit-panel segmented-block button', { hasText: 'Prismatic' })
  .first()
  .click();
await page.waitForTimeout(700);
machinesNow = await readinessNow();
record('and making C Prismatic makes the yoke run', allReady(machinesNow), machinesNow);

// --- the mode tabs lead the way in -------------------------------------------
// A fresh browser: the invitation lasts until Kinematic Analysis has been
// opened once, and this page's earlier visits already opened it.
const fresh = await browser.newPage({ viewport: { width: 1500, height: 950 } });
fresh.on('pageerror', (error) => errors.push(String(error)));
const freshTab = (name) => fresh.locator('.tabButton', { hasText: name });
const classesOf = (name) => freshTab(name).getAttribute('class');
async function freshOpen(query) {
  await fresh.goto(`${BASE}/?${query}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(fresh);
  await fresh.waitForTimeout(400);
}

// Nothing runs: Force Analysis is shut, and pressing it does nothing.
await freshOpen(galleryQuery('Four-bar with a welded coupler pin'));
record(
  'Force Analysis is shut until a mechanism runs',
  (await classesOf('Force')).includes('locked') &&
    (await freshTab('Force').getAttribute('aria-disabled')) === 'true',
  await classesOf('Force')
);
// Forced: Playwright will not press an aria-disabled button, and a reader can.
await freshTab('Force').click({ force: true });
await fresh.waitForTimeout(500);
const afterShut = await fresh.evaluate(() => ({
  tab: ng.getComponent(document.querySelector('app-new-grid')).tabService.getCurrentTab(),
  drawer: !!document.querySelector('app-analysis-setup'),
}));
record(
  'and pressing it neither switches nor opens a drawer',
  afterShut.tab === 1 && !afterShut.drawer,
  afterShut
);

// A mechanism that runs, never analyzed: nothing on the tab, until the first
// Play in Edit drops a card from it saying what the mode is for.
const invite = () => fresh.locator('.analysisInvite');
const play = () => fresh.locator('app-playback-bar button[aria-label*="Play" i]').first();
await freshOpen(payloads['4-Bar']);
record(
  'a mechanism that runs leaves the Kinematic tab as it is, with no card yet',
  !(await classesOf('Kinematic')).includes('invite') && (await invite().count()) === 0,
  await classesOf('Kinematic')
);
record(
  'and Force Analysis opens again',
  !(await classesOf('Force')).includes('locked'),
  await classesOf('Force')
);
await play().click();
await fresh.waitForTimeout(600);
record(
  'the first Play in Edit drops the card from the tab',
  (await invite().count()) === 1 &&
    (await invite().innerText()).includes('Your mechanism runs') &&
    (await invite().innerText()).includes('Open Kinematic Analysis'),
  await invite()
    .innerText()
    .catch(() => '')
);
await invite().locator('button', { hasText: 'Not Now' }).click();
await fresh.waitForTimeout(300);
record('Not Now puts it away', (await invite().count()) === 0);
await freshOpen(payloads['4-Bar']);
await play().click();
await fresh.waitForTimeout(600);
record('for good: the next Play says nothing', (await invite().count()) === 0);

// And its action is the mode itself.
await fresh.evaluate(() => localStorage.removeItem('analysisInviteSeen'));
await freshOpen(payloads['4-Bar']);
await play().click();
await fresh.waitForTimeout(600);
await invite().locator('button', { hasText: 'Open Kinematic Analysis' }).click();
await fresh.waitForTimeout(700);
const arrived = await fresh.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).tabService.getCurrentTab()
);
record(
  'Open Kinematic Analysis opens it, and the card goes',
  arrived === 2 && (await invite().count()) === 0,
  arrived
);
await fresh.close();

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
