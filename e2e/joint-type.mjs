/**
 * A joint's type, as one choice of four.
 *
 * Stage 0 of `docs/joint-type-and-cylinder-plan.md` replaced the Slider and
 * Welded switches with one control: Revolute, Prismatic, Pin-in-slot, Welded.
 * What has to hold, and what this walks:
 *
 * - Every press lands the two facts the type is made of -- a sliding block, a
 *   weld -- and costs exactly one entry in the history, whether it changes one
 *   of them or both. One Undo takes it back whole.
 * - The panel draws what the type has: Slider Angle only on a grounded slot,
 *   Mass Settings wherever there is a block, the grounded glyph set while
 *   Grounded is on, and the one inline state for a block with nowhere to slide.
 * - Grounded is its own switch beside the choice, and a change of type keeps it.
 * - A type the joint cannot take is grayed, says why on hover, and says it where
 *   a reader who cannot point will hear it.
 * - Parked mid-cycle, a change is still one entry and leaves nothing staged.
 * - A group of joints takes a type in one press, as one entry.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/joint-type.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/joint-type';

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

/** The four bits of state a type is: what each type of joint must come out as. */
const FACTS = {
  Revolute: { slider: false, welded: false },
  Prismatic: { slider: true, welded: true },
  'Pin-in-slot': { slider: true, welded: false },
  Welded: { slider: false, welded: true },
};

/** The Edit panel's Joint Type choice, read as data. */
const choice = (host = 'app-edit-panel') =>
  page.evaluate((selector) => {
    const block = document.querySelector(`${selector} segmented-block`);
    if (!block) return null;
    const panel = document.querySelector(selector);
    return {
      label: block.querySelector('.row .label')?.textContent?.trim() ?? null,
      mixed: block.querySelector('.mixed-state')?.textContent?.trim() ?? null,
      options: [...block.querySelectorAll('.cell')].map((cell) => {
        const button = cell.querySelector('button');
        const reason = button.getAttribute('aria-describedby');
        return {
          label: cell.querySelector('.text')?.textContent?.trim() ?? null,
          icon: cell.querySelector('mat-icon.glyph')?.getAttribute('data-mat-icon-name') ?? null,
          chosen: button.getAttribute('aria-pressed') === 'true',
          off: button.disabled,
          invalid: button.classList.contains('invalid'),
          reason: reason ? (document.getElementById(reason)?.textContent?.trim() ?? null) : null,
        };
      }),
      // The sentence alone: the state's own `textContent` would carry the
      // Material glyph's ligature ("error_outline") in front of it.
      nowhere:
        panel.querySelector('.nowhereToSlide span')?.textContent.replace(/\s+/g, ' ').trim() ??
        null,
      sliderAngle: [...panel.querySelectorAll('input-block .label')].some(
        (label) => label.textContent.trim() === 'Slider Angle'
      ),
      mass: panel.textContent.includes('Mass Settings'),
    };
  }, host);

/** What the drawing says about a joint, and where the history stands. */
const state = (id) =>
  page.evaluate((jointId) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = grid.mechanismSrv;
    const joint = mech.joints.find((one) => one.id === jointId);
    return {
      slider: joint.connectedJoints.some((one) => one.constructor.name === 'PrisJoint'),
      welded: joint.isWelded === true,
      ground: (mech.sliderFor(joint)?.ground ?? joint.ground) === true,
      entries: grid.saveHistoryService.history.length,
      index: grid.saveHistoryService.index,
      staged: grid.mechanismSrv.seedFromDisplay ?? null,
      atStart: mech.isAtStartPose(),
    };
  }, id);

const select = async (id) => {
  await page.evaluate((jointId) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((j) => j.id === jointId));
  }, id);
  await page.waitForTimeout(400);
};

const pick = async (label, host = 'app-edit-panel') => {
  await page.locator(`${host} segmented-block button`, { hasText: label }).first().click();
  await page.waitForTimeout(700);
};

const history = (what) =>
  page
    .evaluate(
      (action) =>
        ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService[action](),
      what
    )
    .then(() => page.waitForTimeout(700));

const openFourBar = async () => {
  await openMechanism(page, `${BASE}/?${payloads['4-Bar']}`);
  await page.locator('.tabButton', { hasText: 'Edit' }).first().click();
  await page.waitForTimeout(500);
};

// ------------------------------------------------ 1. a floating pin, all four
console.log('\nevery type, one press and one entry each');
await openFourBar();
await select('B');

const named = await choice();
record(
  'the choice is named and offers the four types, in the plan’s order',
  named?.label === 'Joint Type' &&
    JSON.stringify(named.options.map((one) => one.label)) ===
      JSON.stringify(['Revolute', 'Prismatic', 'Pin-in-slot', 'Welded']),
  named
);

// Revolute to Pin-in-slot and Welded to Revolute change one fact; Revolute to
// Prismatic and back change both, and must still be one press and one entry.
const WALK = ['Pin-in-slot', 'Prismatic', 'Welded', 'Revolute', 'Prismatic', 'Revolute'];
for (const type of WALK) {
  const before = await state('B');
  await pick(type);
  const after = await state('B');
  record(
    `${type}: the joint is what the choice says, in one entry`,
    after.slider === FACTS[type].slider &&
      after.welded === FACTS[type].welded &&
      after.entries - before.entries === 1 &&
      after.staged === null,
    { before, after }
  );
  const shown = await choice();
  record(
    `${type}: and the choice shows it chosen`,
    shown.options.find((one) => one.chosen)?.label === type,
    shown.options
  );
}

// One press, one Undo: the two-fact change is taken back whole.
const beforeUndo = await state('B');
await history('undo');
const undone = await state('B');
record(
  'one Undo takes back a change of both facts',
  undone.slider === true && undone.welded === true && undone.index === beforeUndo.index - 1,
  { beforeUndo, undone }
);
await history('redo');
record('and Redo puts it back', (await state('B')).slider === false, await state('B'));

// --------------------------------------------- 2. the rows each type carries
console.log('\nwhat the panel draws for each type');
await openFourBar();
await select('B');
await pick('Pin-in-slot');
const dangling = await choice();
record(
  'a block with nowhere to slide says so, once, under the choice',
  dangling.nowhere === 'Nowhere to slide. Drag it onto a link to cut its slot, or ground it.' &&
    dangling.options.find((one) => one.invalid)?.label === 'Pin-in-slot',
  dangling
);
record(
  'and the block has a mass to set, while a floating slot has no angle to type',
  dangling.mass === true && dangling.sliderAngle === false,
  { mass: dangling.mass, sliderAngle: dangling.sliderAngle }
);
await page.screenshot({ path: `${OUT}/1-nowhere-to-slide.png` });

await select('D');
await pick('Pin-in-slot');
const groundedSlot = await choice();
record(
  'a grounded slot has an angle of its own, and no complaint',
  groundedSlot.sliderAngle === true && groundedSlot.nowhere === null && groundedSlot.mass === true,
  groundedSlot
);
record(
  'and Grounded swaps every glyph for the set that stands on the frame',
  groundedSlot.options.every((one) => one.icon?.endsWith('_grounded')),
  groundedSlot.options.map((one) => one.icon)
);
await page.screenshot({ path: `${OUT}/2-grounded-slot.png` });

// The choice draws Revolute on the frame while Grounded is on, so it has to
// hand back a ground pin: taking the block away used to drop the ground.
await pick('Revolute');
const stillGrounded = await state('D');
record(
  'a change of type keeps the joint grounded',
  stillGrounded.ground === true && stillGrounded.slider === false,
  stillGrounded
);

// ------------------------------------------------------------ 3. the refusals
console.log('\nwhat a joint cannot be, and why');
await select('A');
const driven = await choice();
const refusedOn = (label) => driven.options.find((one) => one.label === label);
record(
  'a driven pin can be nothing else, and every grayed type carries the model’s reason',
  ['Prismatic', 'Pin-in-slot', 'Welded'].every(
    (label) =>
      refusedOn(label)?.off === true && /Remove the input first/.test(refusedOn(label).reason ?? '')
  ) && refusedOn('Revolute')?.off === false,
  driven.options
);

await page.hover('app-edit-panel segmented-block .cell:nth-child(5)');
await page.waitForTimeout(900);
const tip = await page.locator('.mat-mdc-tooltip').first().textContent();
record('and pointing at one says the same thing', /Remove the input first/.test(tip ?? ''), tip);
await page.screenshot({ path: `${OUT}/3-refused.png` });

// ----------------------------------------------------- 4. parked mid-cycle
console.log('\nthe same change, parked away from the start');
await openFourBar();
await page.evaluate(() => ng.getComponent(document.querySelector('app-playback-bar')).stepBy(40));
await page.waitForTimeout(700);
await select('B');
const parked = await state('B');
const wasDisplaced = parked.atStart === false;
await pick('Prismatic');
const changed = await state('B');
record(
  'parked mid-cycle, a change of both facts is still one entry and leaves nothing staged',
  wasDisplaced &&
    changed.slider &&
    changed.welded &&
    changed.entries - parked.entries === 1 &&
    changed.staged === null,
  { parked, changed }
);
await history('undo');
record('and Undo takes it back', (await state('B')).slider === false, await state('B'));

// ------------------------------------------------------------- 5. a group
console.log('\na group of joints takes a type in one press');
await openFourBar();
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const active = grid.activeObjService;
  const joints = grid.mechanismSrv.joints;
  active.replacePartSelection(joints.find((one) => one.id === 'B'));
  active.togglePartSelection(joints.find((one) => one.id === 'C'));
});
await page.waitForTimeout(600);
const groupChoice = await choice('app-multi-edit-panel');
record(
  'the group panel offers the same choice, chosen where they agree',
  groupChoice?.label === 'Joint Type' &&
    groupChoice.options.find((one) => one.chosen)?.label === 'Revolute',
  groupChoice
);

const beforeGroup = await state('B');
await pick('Welded', 'app-multi-edit-panel');
const afterB = await state('B');
const afterC = await state('C');
record(
  'and one press welds every joint in it, in one entry',
  afterB.welded && afterC.welded && afterB.entries - beforeGroup.entries === 1,
  { beforeGroup, afterB, afterC }
);
await page.screenshot({ path: `${OUT}/4-group.png` });

// ------------------------------------------------------------- 6. the menu
console.log('\nthe same choice at the top of the joint’s card');
await openFourBar();
const atB = await page.locator('#joint_B').boundingBox();
await page.mouse.click(atB.x + atB.width / 2, atB.y + atB.height / 2, { button: 'right' });
await page.locator('#contextMenu.show').waitFor();
await page.waitForTimeout(250);
const card = await page.evaluate(() => {
  const grid = document.querySelector('#contextMenu .cm-choice');
  return {
    label: grid?.getAttribute('aria-label') ?? null,
    // A menu item, so the arrow keys reach it: a plain button in a CDK menu is
    // reachable by nothing at all.
    roles: [...(grid?.querySelectorAll('.cm-choice__cell') ?? [])].map((cell) =>
      cell.getAttribute('role')
    ),
    cells: [...(grid?.querySelectorAll('.cm-choice__cell') ?? [])].map((cell) => ({
      label: cell.querySelector('.cm-choice__label')?.textContent?.trim(),
      chosen: cell.classList.contains('cm-choice__cell--chosen'),
    })),
    rows: [...document.querySelectorAll('#contextMenu .cm-row__label')].map((one) =>
      one.textContent.trim()
    ),
  };
});
record(
  'the card opens with the choice, as menu items, and State has lost the two rows',
  card.label === 'Joint Type' &&
    card.roles.every((role) => role === 'menuitemradio') &&
    card.cells.find((one) => one.chosen)?.label === 'Revolute' &&
    !card.rows.some((label) => /^(Slider|Welded)$/.test(label)),
  card
);

// The reason the cells are menu items rather than the panel's control: inside
// a CDK menu the arrow keys reach nothing else, so a grid of plain buttons
// would be a choice no keyboard could make. The card opens with its first
// value focused and Down walks to the next -- with the card still standing,
// which is the half that was broken: a right-click selects what it opened on,
// so the arrows were a nudge that moved the joint behind the card and closed
// the card on the shortcut it had just fired.
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
const reached = await page.evaluate(() => {
  const on = document.activeElement;
  return {
    role: on?.getAttribute('role') ?? null,
    cell: on?.classList.contains('cm-choice__cell') === true,
    text: on?.textContent?.trim().slice(0, 20) ?? null,
    standing: !!document.querySelector('#contextMenu.show'),
  };
});
record(
  'and the arrow keys walk its values, leaving the card standing',
  reached.cell === true && reached.role === 'menuitemradio' && reached.standing === true,
  reached
);
await page.locator('#contextMenu').screenshot({ path: `${OUT}/5-menu-keyboard.png` });

const beforeMenu = await state('B');
await page.locator('#contextMenu .cm-choice__cell', { hasText: 'Welded' }).first().click();
await page.waitForTimeout(700);
const fromMenu = await state('B');
record(
  'and a type chosen there lands, in one entry, like the panel’s',
  fromMenu.welded === true &&
    fromMenu.slider === false &&
    fromMenu.entries - beforeMenu.entries === 1,
  { beforeMenu, fromMenu }
);
await page.screenshot({ path: `${OUT}/5-menu.png` });

// --------------------------------------------------------- 7. the pill moves
console.log('\nthe pill slides between the rows it is chosen on');
await openFourBar();
await select('B');
// Its own directory: `filmstrip` clears the one it is given, and handed `OUT`
// it took the five screenshots the sections above had just made with it.
const film = filmstrip(page, `${OUT}/pill`, { x: 0, y: 60, width: 260, height: 300 });
await film.shot('pill-before');
await film.during(30, 8, 'pill', () => pick('Welded'));
await contactSheet(`${OUT}/pill/*pill*.png`, `${OUT}/sheet-pill.png`, 3);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
console.log(`\n${results.filter(([, ok]) => ok).length}/${results.length} checks passed`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
