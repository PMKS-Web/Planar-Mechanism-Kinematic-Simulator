/**
 * The phone layout, and the gesture that replaces the right button.
 *
 * PMKS+ used to greet a touch device with a dialog explaining what it could not
 * do. Everything that *makes* something is behind the right-click menu, so the
 * apology was accurate: without a right button the app could be panned and read
 * and never built in. This checks the three things that changed -- the page is
 * laid out at the size of the phone, a held finger opens the menu, and the mode
 * panel is a sheet that gets out of the way -- and, at the end, that a bar can
 * actually be drawn with nothing but taps.
 *
 *   PMKS_BASE_URL=http://127.0.0.1:4200 node e2e/mobile.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium, devices } = await import(playwright + '/node_modules/playwright/index.mjs');
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
// Everything below is about layout and gesture. The tutorial opening itself on
// a first visit is real and checked on its own, at the end, in a context that
// has never been here.
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** A finger held still on one spot, and lifted. */
async function hold(x, y, ms = 700) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(ms);
  const openWhileDown = await page.locator('#contextMenu').count();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(350);
  return { openWhileDown, openAfterLift: await page.locator('#contextMenu').count() };
}

/**
 * A finger that travels, which is a pan and never a press.
 *
 * Deliberately slower than the hold threshold: a swipe that finishes inside
 * half a second proves only that it was quick, and what wants proving is that
 * traveling is what stops it becoming a press.
 */
async function swipe(x, y, dx, dy, steps = 12, gap = 70) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let step = 1; step <= steps; step += 1) {
    await page.waitForTimeout(gap);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * step) / steps, y: y + (dy * step) / steps, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(350);
}

/** What pan/zoom is applying, so a gesture can be shown to have moved the view. */
const canvasTransform = () =>
  page.evaluate(() => document.querySelector('#canvas g')?.getAttribute('transform') ?? '');

/** Nothing is holding a gesture open. */
const gestureIdle = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    return grid.dragState.grid === 0 && grid.dragState.joint === 0 && grid.dragState.link === 0;
  });

const tap = async (x, y) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
};

const open = (query) =>
  page.goto(`${BASE}/${query ? '?' + query : ''}`, { waitUntil: 'domcontentloaded' });
const menuText = () =>
  page
    .locator('#contextMenu')
    .innerText()
    .catch(() => '');
const box = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { y: Math.round(rect.y), h: Math.round(rect.height), w: Math.round(rect.width) };
  }, selector);

// --- the page is laid out for the phone ------------------------------------
await open();
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(600);

const viewport = await page.evaluate(() => ({
  inner: window.innerWidth,
  scroll: document.body.scrollWidth,
}));
// Without the viewport meta a phone lays out at 980px and scales the result
// down, which is legible only in the sense that a photograph of an app is.
record('the page is laid out at the width of the phone', viewport.inner <= 440, viewport);
record('and nothing hangs off the side of it', viewport.scroll <= viewport.inner + 1, viewport);
record(
  'no dialog stands between the reader and the app',
  (await page.locator('app-touchscreen-warning').count()) === 0
);

/**
 * A spot on the canvas with no chrome over it.
 *
 * This used to be the literal point (200, 480), which was open grid for as long
 * as the phone's bottom stack was one card tall. Bringing the shared scrub row
 * back made the stack taller, which lifted the sheet's handle onto that exact
 * spot -- and three checks about long-press started failing on a long-press
 * that was landing on a grip. Asked of the page, it survives the next restyle
 * too.
 */
async function freeGrid() {
  return page.evaluate(() => {
    for (let y = 200; y < window.innerHeight - 40; y += 8) {
      const el = document.elementFromPoint(200, y);
      if (el && el.closest('svg#canvas') && !el.closest('[id^="joint_"]')) return { x: 200, y };
    }
    return { x: 200, y: 300 };
  });
}

// --- a held finger is the right button -------------------------------------
const bare = await freeGrid();
const onGrid = await hold(bare.x, bare.y);
record('a held finger on the grid opens the menu', onGrid.openWhileDown === 1, onGrid);
// The browser sends a compatibility click after every touch, and the overlay
// closes on an outside click: the menu used to appear and vanish on the lift.
record('and it is still open once the finger lifts', onGrid.openAfterLift === 1, onGrid);
record('the menu offers the verb that makes something', /Link/.test(await menuText()));
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(300);

record('a tap opens nothing', (await hold(bare.x, bare.y, 120)).openAfterLift === 0);
record('and leaves nothing holding a gesture', await gestureIdle());

const viewBefore = await canvasTransform();
await swipe(bare.x, bare.y, 120, 0);
record(
  'a swipe opens nothing, because it is a pan',
  (await page.locator('#contextMenu').count()) === 0
);
// The swipe above runs well past the half-second hold, so this is travel
// rejecting the press rather than the gesture merely being over quickly.
record('and it panned the canvas instead', (await canvasTransform()) !== viewBefore, {
  viewBefore,
  now: await canvasTransform(),
});

// --- the menu is about the part under the finger ----------------------------
await open(payloads['4-Bar']);
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(800);
const joint = await page.evaluate(() => {
  const rect = document.querySelector('[id^="joint_"]').getBoundingClientRect();
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
});
const onJoint = await hold(joint.x, joint.y);
record('a held finger on a joint opens that joint’s menu', onJoint.openWhileDown === 1, onJoint);
const jointRows = await menuText();
record('naming the joint', /Joint/.test(jointRows), jointRows.slice(0, 120));
record('and offering what can be done to it', /Grounded/.test(jointRows), jointRows.slice(0, 160));
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(300);

// --- the sheet ---------------------------------------------------------------
const collapsed = await box('.panel');
record('the mode panel starts out of the way', collapsed.h === 0, collapsed);
record('with a handle to pull it up by', (await page.locator('.sheetHandle').count()) === 1);

/**
 * How far the pill floats above whatever is directly beneath it.
 *
 * Beneath it is the sheet's card when the sheet is open and the controls row
 * when it is shut, and the number has to be the same either way: it is one
 * control, and a control that sits differently in its two states reads as two.
 * It drifted once already -- the pill was centered in its 44px target and the
 * sheet's frame carried 16px of shadow-room above its card, so it stood 12px
 * clear when shut and 28px clear when open.
 *
 * Measured off the pill rather than off the target around it, because the
 * target is deliberately much taller than the pill and it is the pill a reader
 * is looking at.
 */
const pillGap = () =>
  page.evaluate(() => {
    const grip = document.querySelector('.sheetGrip');
    const box = grip.getBoundingClientRect();
    const pillBottom = box.bottom - parseFloat(getComputedStyle(grip).paddingBottom);
    const card = document.querySelector('.panel .page1, .panel .page2, .panel .page3');
    const cardBox = card?.getBoundingClientRect();
    const below =
      cardBox && cardBox.height > 0
        ? cardBox.top
        : document.querySelector('.playbackRow').getBoundingClientRect().top;
    return Math.round(below - pillBottom);
  });

const gapShut = await pillGap();

// Tapped with a finger and off center, because the pill it draws is 5px tall
// and what has to be hittable is the box around it.
const grip = await page.evaluate(() => {
  const rect = document.querySelector('.sheetGrip').getBoundingClientRect();
  return { x: Math.round(rect.x + rect.width * 0.2), y: Math.round(rect.y + rect.height * 0.2) };
});
await tap(grip.x, grip.y);
await page.waitForTimeout(600);
const expanded = await box('.panel');
record('the handle takes a finger off the center of its pill', expanded.h > 100, {
  grip,
  expanded,
});
record('the handle opens it', expanded.h > 100, expanded);
record(
  'across the whole width, not in a desktop column',
  expanded.w >= viewport.inner - 1,
  expanded
);
record(
  'and never taking more than half the window',
  expanded.h <= Math.round(0.5 * (await page.evaluate(() => window.innerHeight))) + 2,
  expanded
);
const gapOpen = await pillGap();
record(
  'the handle sits the same distance off the thing below it in both states',
  gapShut === gapOpen,
  {
    shut: gapShut,
    open: gapOpen,
  }
);

/**
 * The gap the whole layout is built on, read off the top strip.
 *
 * Asked of the running app rather than written down, because the point is not
 * that these gaps are 12px -- it is that they are the *same* gap the cards
 * along the top keep from the window. A restyle that moved the top strip in or
 * out should either move all of this with it or fail here.
 */
const layoutGap = await page.evaluate(() =>
  // The strip, not a card inside it: the cards carry their own 6px of padding,
  // so a button's edge is 18px from the window where the strip's is 12.
  Math.round(document.querySelector('.topStrip').getBoundingClientRect().left)
);
record('and it is the gap the top strip keeps from the window', gapOpen === layoutGap, {
  gapOpen,
  layoutGap,
});

// The three cards stacked up the bottom of the window, and the gap between each
// pair of them. All one number, or the stack reads as a stack of accidents.
const stack = await page.evaluate(() => {
  const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
  const card = r('.panel .page1, .panel .page2, .panel .page3');
  const row = r('.playbackRow');
  const rowCard = r('.playbackRow > *');
  const strip = r('app-bottombar > *');
  // The cards actually in the bottom row, whichever mode is open: the
  // transport is only there in the two analyses, the view controls always.
  const inRow = [...document.querySelector('.playbackRow').children].map((child) =>
    child.getBoundingClientRect()
  );
  return {
    cardLeft: Math.round(card.left),
    cardRight: Math.round(window.innerWidth - card.right),
    cardToRow: Math.round(row.top - card.bottom),
    // The strip is at the top of the window on a phone now, so what stands off
    // what has changed: the controls row is the last thing before the window's
    // own bottom edge, and the strip is the first thing before the mode cards.
    rowToWindow: Math.round(window.innerHeight - rowCard.bottom),
    stripToTopStrip: Math.round(r('.topStrip').top - strip.bottom),
    bottomLeft: Math.round(Math.min(...inRow.map((b) => b.left))),
    bottomRight: Math.round(window.innerWidth - Math.max(...inRow.map((b) => b.right))),
  };
});
record('the sheet is inset like the cards above it', stack.cardLeft === layoutGap, stack);
record('on both sides', stack.cardRight === layoutGap, stack);
record(
  'the controls row stands off the sheet by the same gap',
  stack.cardToRow === layoutGap,
  stack
);
// The mode strip took the top of the window, so the controls row is measured
// against the window's own bottom edge and the strip against the cards below it.
record(
  'the controls row stands off the window by the same gap',
  stack.rowToWindow === layoutGap,
  stack
);
record('and the mode cards off the strip above them', stack.stripToTopStrip === layoutGap, stack);
// It is flush to the window's edges rather than inset like the floating cards,
// which is what makes it read as the window's own edge instead of a fourth card.
record(
  'the strip is flush to the window, not inset like a card',
  await page.evaluate(() => {
    const b = document.querySelector('app-bottombar > *').getBoundingClientRect();
    return (
      Math.round(b.left) === 0 &&
      Math.round(b.top) === 0 &&
      Math.round(window.innerWidth - b.right) === 0
    );
  })
);
// The bottom row used to be centered inside an 8px padding, so its cards sat
// 23px from the window against the top strip's 12 and the two ends of the
// screen disagreed about where the margin was.
record(
  'the bottom row starts on the same line as the top strip',
  stack.bottomLeft === layoutGap,
  stack
);
record('and ends on it', stack.bottomRight === layoutGap, stack);
await page.locator('.sheetHandle').click();
await page.waitForTimeout(600);
record('and shuts again', (await box('.panel')).h === 0);

// The transport and the view controls dock to the bottom too, so they have to
// stand on the sheet rather than inside it.
await page.locator('.tabButton').nth(2).click({ force: true });
await page.waitForTimeout(1200);
await page.locator('.sheetHandle').click();
await page.waitForTimeout(700);
const sheet = await box('.panel');
const cluster = await box('.playbackRow');
const stripBottom = await page.evaluate(() =>
  Math.round(document.querySelector('.topStrip').getBoundingClientRect().bottom)
);
// The other way round from the way this started: the controls are fixed to the
// bottom and the sheet opens over the canvas above them. A control that changes
// place when a panel opens is a control the reader has to find twice.
record('the sheet opens above the controls, not under them', sheet.y + sheet.h <= cluster.y + 2, {
  cluster,
  sheet,
});
record('and the controls are on screen, below the top strip', cluster.y >= stripBottom, {
  cluster,
  stripBottom,
});
// Two lines now, not one: the scrub card came back on phones because parking
// precisely mid-cycle is what editing at a pose is built on, and a phone
// without it is a phone without the feature. What it does *not* carry is a row
// per machine -- the shared row only -- so the stack stays two lines deep
// however many machines the drawing holds.
record('the controls are two rows, no more', cluster.h <= 140, { cluster });
record(
  'with the shared scrubber on the upper one',
  (await page.locator('.scrubCard:visible').count()) === 1
);
record(
  'and one row on it, whatever the drawing holds',
  (await page.locator('.mechRow').count()) === 1,
  await page.locator('.mechRow').count()
);
record('and no control that would produce more', (await page.locator('.syncToggle').count()) === 0);

// A phone can arrive at an unsynced drawing without ever having been offered
// the control that unsyncs one -- from a URL, or from a desktop window being
// narrowed. Filtering the per-machine rows down to the one marked `master`
// looked right and was not: it handed back the *first machine's* private row,
// labeled M1 and moving only M1, with nothing on screen saying the others
// existed.
{
  /** Two four-bars side by side, each with its own drive. */
  const twoFourBars =
    '?2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
    '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
    'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
    'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
    'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';
  await page.goto(BASE + '/' + twoFourBars, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    srv.setSyncMechanisms(false);
  });
  await page.waitForTimeout(400);
  const unsynced = await page.evaluate(() => {
    const bar = window.ng.getComponent(document.querySelector('app-playback-bar'));
    return {
      shown: bar.shownRows.map((row) => ({ id: row.id, index: row.index })),
      machines: bar.mechanism.mechanisms.filter((one) => one.isMechanismValid()).length,
    };
  });
  record(
    'an unsynced drawing still shows one row on a phone',
    unsynced.shown.length === 1,
    unsynced
  );
  record(
    'and it stands for every machine rather than the first',
    unsynced.machines < 2 || unsynced.shown[0].index === -1,
    unsynced
  );
}

const rowWhileOpen = cluster.y;
await page.locator('.sheetHandle').click();
await page.waitForTimeout(700);
const rowWhileShut = (await box('.playbackRow')).y;
record('and they stay put when it shuts', rowWhileOpen === rowWhileShut, {
  rowWhileOpen,
  rowWhileShut,
});
await page.locator('.sheetHandle').click();
await page.waitForTimeout(700);

// --- and a bar can be drawn with nothing but taps ---------------------------
await open();
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(700);
const before = await page.evaluate(
  () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length
);
await hold(150, 380);
await page.locator('#contextMenu').getByText('Link', { exact: false }).first().click();
await page.waitForTimeout(500);
// The far end follows the pointer and is set by the next press.
await tap(300, 300);
await page.waitForTimeout(800);
const after = await page.evaluate(
  () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length
);
record('a link can be drawn with two taps and a hold', after - before === 2, { before, after });
record('and the canvas is not left holding the gesture', await gestureIdle());

// --- the gestures the press has to share the canvas with --------------------
await open(payloads['4-Bar']);
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(800);

const jointModel = (id) =>
  page.evaluate((which) => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === which);
    return { x: joint.x, y: joint.y };
  }, id);
const jointScreen = (id) =>
  page.evaluate((which) => {
    const rect = document.getElementById('joint_' + which).getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  }, id);

/** A finger that takes hold of something and moves it. */
async function dragFinger(from, dx, dy) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dx * step) / 8, y: from.y + (dy * step) / 8, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(700);
}

const beforeDrag = await jointModel('B');
await dragFinger(await jointScreen('B'), 48, -32);
const afterDrag = await jointModel('B');
record(
  'a finger still drags a joint',
  Math.hypot(afterDrag.x - beforeDrag.x, afterDrag.y - beforeDrag.y) > 0.05,
  { beforeDrag, afterDrag }
);
record('and the drag opened no menu', (await page.locator('#contextMenu').count()) === 0);

// The suppressor that keeps the lift from closing the menu is armed for exactly
// one lift. Left armed it would make the canvas untappable ever after.
await hold(120, 250);
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(400);
const beforeSecond = await jointModel('B');
await dragFinger(await jointScreen('B'), -48, 32);
const afterSecond = await jointModel('B');
record(
  'and the canvas still answers a finger after a long press',
  Math.hypot(afterSecond.x - beforeSecond.x, afterSecond.y - beforeSecond.y) > 0.05,
  { beforeSecond, afterSecond }
);

// A pinch is two fingers holding still for as long as it takes to zoom.
const pinch = await context.newCDPSession(page);
await pinch.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: 150, y: 250, id: 1 }],
});
await page.waitForTimeout(120);
await pinch.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: 150, y: 250, id: 1 },
    { x: 280, y: 400, id: 2 },
  ],
});
await page.waitForTimeout(800);
const duringPinch = await page.locator('#contextMenu').count();
await pinch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await pinch.detach();
await page.waitForTimeout(400);
record('two fingers open no menu', duringPinch === 0, { duringPinch });

record(
  'and nothing is left holding a gesture',
  await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    return grid.dragState.grid === 0 && grid.dragState.joint === 0 && grid.dragState.link === 0;
  })
);

// --- synthesis places by tapping, and still opens a menu on a hold ----------
// The one place in the app where a plain tap on the canvas *makes* something,
// so it is the one place a press and a tap could be confused for each other.
await open();
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(700);
await page.locator('.tabButton').first().click({ force: true });
await page.waitForTimeout(900);
await page.locator('.sheetHandle').click();
await page.waitForTimeout(600);
await page.locator('#synthesisPanel .kindCard--on').click({ force: true });
await page.waitForTimeout(700);
await page.locator('#synthesisPanel .pill').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('.sheetHandle').click();
await page.waitForTimeout(600);

const poseCount = () =>
  page.evaluate(
    () =>
      Object.keys(
        window.ng.getComponent(document.querySelector('app-synthesis-panel')).design.poses
      ).length
  );
await tap(200, 260);
await page.waitForTimeout(600);
record('a tap drops a synthesis position', (await poseCount()) === 1);

const inSynthesis = await hold(300, 400);
record('and a hold there opens the menu instead', inSynthesis.openWhileDown === 1, inSynthesis);
record('without dropping a second position', (await poseCount()) === 1);
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(300);

// --- the ways a press used to move the mechanism behind the reader's back ---
await open(payloads['4-Bar']);
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(800);

const jointB = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === 'B');
    return { x: joint.x, y: joint.y };
  });
const jointBOnScreen = () =>
  page.evaluate(() => {
    const rect = document.getElementById('joint_B').getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  });
const moved = (a, c) => Math.hypot(c.x - a.x, c.y - a.y);

// A finger is never perfectly still. The drag is held off for 100ms or ten
// pixels, which is a mouse's rule, and a press outlives it by four hundred
// milliseconds -- so every tremor was moving the joint the reader was trying
// to open a menu on, before the menu appeared to explain itself.
{
  const target = await jointBOnScreen();
  const before = await jointB();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: target.x, y: target.y, id: 1 }],
  });
  await page.waitForTimeout(160);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: target.x + 8, y: target.y, id: 1 }],
  });
  await page.waitForTimeout(600);
  const openedMenu = await page.locator('#contextMenu').count();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(500);
  const after = await jointB();
  record('a press that wobbles still opens the menu', openedMenu === 1);
  record('and moves nothing while it decides', moved(before, after) < 0.001, { before, after });
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(400);
}

// A finger laid on a moving part stops it, at the frame it was showing --
// exactly as a mouse press does. This is the whole of Gate 3's touch half: one
// rule on both pointers, and the gesture that follows classifies as a tap, a
// drag or a long press against a machine that is now standing still.
{
  // Slowed right down first, because aiming at where a joint *was* is a press
  // on empty canvas -- a fact about moving targets, not about the app.
  await page.evaluate(() => {
    const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const driven = srv.joints.find((joint) => joint.input);
    driven.driveSpeed = 0.5;
    srv.updateMechanism();
    srv.setAllPlaying(true);
  });
  await page.waitForTimeout(900);
  const running = await page.evaluate(
    () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isPlaying
  );
  record('the mechanism is running before the grab', running);

  const target = await jointBOnScreen();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: target.x, y: target.y, id: 1 }],
  });
  await page.waitForTimeout(200);
  const held = await page.evaluate(
    () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isPlaying
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
  record('a finger on a moving joint stops it', held === false, { held });
  record('and no drag has begun', await gestureIdle());
}

// A pinch that happens to start on a joint is about the view, not the joint.
{
  const target = await jointBOnScreen();
  const before = await jointB();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: target.x, y: target.y, id: 1 }],
  });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: target.x, y: target.y, id: 1 },
      { x: target.x + 120, y: target.y + 120, id: 2 },
    ],
  });
  for (let step = 1; step <= 6; step += 1) {
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: target.x - step * 8, y: target.y - step * 8, id: 1 },
        { x: target.x + 120 + step * 8, y: target.y + 120 + step * 8, id: 2 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(600);
  record('a pinch begun on a joint leaves the joint alone', moved(before, await jointB()) < 0.001, {
    before,
    after: await jointB(),
  });
}

// A plain tap must not leave the canvas believing the joint is still held. The
// browser's compatibility mousedown after a touch used to be read as a press
// with no pointerdown, and answered with a synthetic one nothing ever released.
{
  const target = await jointBOnScreen();
  await tap(target.x, target.y);
  await page.waitForTimeout(500);
  record('a tap on a joint lets go of it', await gestureIdle());
}

// Opening the sheet takes half the window; the drawing has to come out from
// under it rather than sit behind it.
//
// From a fresh load, and that matters. Once a reader has panned or pinched, the
// canvas remembers the view they chose and holds it against chrome moving --
// which is right, and is why this cannot be asserted after the gestures above.
{
  await open(payloads['4-Bar']);
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.locator('.sheetHandle').click();
  const lowestJoint = () =>
    page.evaluate(() =>
      Math.round(
        Math.max(
          ...[...document.querySelectorAll('[id^="joint_"]')].map(
            (el) => el.getBoundingClientRect().bottom
          )
        )
      )
    );
  // Polled until the drawing stops moving rather than waited out on the clock.
  // The re-frame eases, and how long it takes depends on how far the drawing
  // has to travel -- which grew when the phone's bottom stack did. A flat
  // second used to be enough and then was not, by two pixels.
  let lowest = await lowestJoint();
  let still = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(100);
    const next = await lowestJoint();
    // Four readings the same, not one: the sheet's own slide runs before the
    // re-frame does, so a single match taken early is the drawing holding
    // still in the moment *before* it starts moving.
    still = next === lowest ? still + 1 : 0;
    lowest = next;
    // Not before the slide has even begun: the sheet takes a moment to publish
    // its height, and the drawing holds perfectly still until it does. Twelve
    // ticks is past that and still well inside the ease.
    if (i > 12 && still >= 4) break;
  }
  const sheetTop = (await box('.panel')).y;
  record('opening the sheet reframes the drawing above it', lowest <= sheetTop, {
    lowest,
    sheetTop,
  });
  await page.locator('.sheetHandle').click();
  await page.waitForTimeout(700);
}

// --- the cases a second review found the first fixes still let through ------
await open(payloads['4-Bar']);
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(800);

const modelOf = (id) =>
  page.evaluate((which) => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === which);
    return { x: joint.x, y: joint.y };
  }, id);
const screenOf = (id) =>
  page.evaluate((which) => {
    const rect = document.getElementById('joint_' + which).getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  }, id);

// Canceling the first finger's grip is not enough: the second finger has a
// pointerdown of its own, and landing on a part takes hold of *that* one.
{
  const first = await screenOf('B');
  const second = await screenOf('C');
  const beforeB = await modelOf('B');
  const beforeC = await modelOf('C');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: first.x, y: first.y, id: 1 }],
  });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: first.x, y: first.y, id: 1 },
      { x: second.x, y: second.y, id: 2 },
    ],
  });
  for (let step = 1; step <= 6; step += 1) {
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: first.x - step * 10, y: first.y - step * 10, id: 1 },
        { x: second.x + step * 10, y: second.y + step * 10, id: 2 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(700);
  const movedB = Math.hypot((await modelOf('B')).x - beforeB.x, (await modelOf('B')).y - beforeB.y);
  const movedC = Math.hypot((await modelOf('C')).x - beforeC.x, (await modelOf('C')).y - beforeC.y);
  record(
    'a pinch whose second finger lands on a part moves neither',
    movedB < 0.001 && movedC < 0.001,
    {
      movedB,
      movedC,
    }
  );
}

// The suppression belongs to the finger that opened the menu. Another finger
// lifting used to spend it, and this finger's own lift then closed the menu.
{
  await open();
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(700);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 150, y: 250, id: 1 }],
  });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 150, y: 250, id: 1 },
      { x: 300, y: 450, id: 2 },
    ],
  });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: 150, y: 250, id: 1 }],
  });
  await page.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(500);
  record(
    'the menu survives a different finger lifting first',
    (await page.locator('#contextMenu').count()) === 1
  );
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);
}

// A position is dragged by a gesture of its own, outside DragStateService, so
// it had to be told about the pending press separately.
{
  await open();
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(700);
  await page.locator('.tabButton').first().click({ force: true });
  await page.waitForTimeout(900);
  await page.locator('.sheetHandle').click();
  await page.waitForTimeout(600);
  await page.locator('#synthesisPanel .kindCard--on').click({ force: true });
  await page.waitForTimeout(700);
  await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-synthesis-panel')).design.applyDecoded({
      length: 1000,
      reference: 'CENTER',
      endsOnly: true,
      allowDefect: false,
      constrain: false,
      stage: 'working',
      poses: [
        { at: { x: 0, y: 0 }, thetaDegrees: 0 },
        { at: { x: 800, y: 400 }, thetaDegrees: 25 },
        { at: { x: 1400, y: 1400 }, thetaDegrees: 50 },
      ],
    })
  );
  await page.waitForTimeout(900);
  await page.locator('.sheetHandle').click();
  await page.waitForTimeout(700);
  const posePos = () =>
    page.evaluate(() => {
      const design = window.ng.getComponent(document.querySelector('app-synthesis-panel')).design;
      const first = Object.keys(design.poses)[0];
      return { x: design.poses[first].position.x, y: design.poses[first].position.y };
    });
  const on = await page.evaluate(() => {
    const rect = document.querySelector('.synthPose').getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  });
  const before = await posePos();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: on.x, y: on.y, id: 1 }],
  });
  await page.waitForTimeout(160);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: on.x + 8, y: on.y, id: 1 }],
  });
  await page.waitForTimeout(600);
  const opened = await page.locator('#contextMenu').count();
  const stillDragging = await page.evaluate(
    () => window.ng.getComponent(document.querySelector('app-new-grid')).synthCanvas.dragging
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(600);
  const after = await posePos();
  record('a press on a synthesis position opens its menu', opened === 1);
  record(
    'without dragging the position under it',
    Math.hypot(after.x - before.x, after.y - before.y) < 0.001,
    {
      before,
      after,
    }
  );
  record('and lets go of it', stillDragging === false);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);
}

// --- tapping a part shows the panel about it --------------------------------
// On the release, and only for a press that neither traveled nor became a
// menu: selecting happens on press, so opening on selection raised the sheet
// over the very joint the finger was still resting on.
{
  await open(payloads['4-Bar']);
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(900);
  const sheetHeight = async () => (await box('.panel')).h;
  const jointPoint = await page.evaluate(() => {
    const rect = document.getElementById('joint_B').getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  });
  record('the sheet starts shut', (await sheetHeight()) === 0);
  await tap(jointPoint.x, jointPoint.y);
  await page.waitForTimeout(700);
  record('tapping a joint opens it', (await sheetHeight()) > 100);

  await page.locator('.sheetHandle').click();
  await page.waitForTimeout(700);
  // Derived from where the drawing actually is rather than scanned for: the
  // scan kept landing on a link, and a tap on a link is a tap on a part.
  const bare = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('[id^="joint_"], [id^="link_"]')].map((el) =>
      el.getBoundingClientRect()
    );
    const strip = document.querySelector('.topStrip').getBoundingClientRect();
    const top = Math.min(...parts.map((r) => r.top));
    const y = Math.round((strip.bottom + top) / 2);
    for (let x = 20; x < window.innerWidth - 20; x += 6) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('[id^="joint_"], [id^="link_"]') && el.closest('#canvas')) {
        return { x, y };
      }
    }
    return null;
  });
  record('a patch of bare canvas can be found to tap', bare !== null, { bare });
  if (bare) {
    await tap(bare.x, bare.y);
    await page.waitForTimeout(700);
    record('tapping bare canvas does not', (await sheetHeight()) === 0, {
      bare,
      selected: await page.evaluate(
        () =>
          window.ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType
      ),
    });
  }

  // A drag is not a tap. Shut the sheet first, whatever the step above left.
  if ((await sheetHeight()) > 0) {
    await page.locator('.sheetHandle').click();
    await page.waitForTimeout(700);
  }
  const dragFrom = await page.evaluate(() => {
    const rect = document.getElementById('joint_B').getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: dragFrom.x, y: dragFrom.y, id: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: dragFrom.x + step * 7, y: dragFrom.y - step * 5, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(800);
  record('dragging a joint does not', (await sheetHeight()) === 0, {
    height: await sheetHeight(),
  });
}

// --- the library, which used to be a column of chips with a box over them ----
{
  await open();
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(700);
  await page.locator('.iconButton').first().click();
  await page.waitForTimeout(400);
  await page.locator('#templatesButton').click();
  await page.waitForTimeout(1400);
  const bars = await page.evaluate(() => {
    const chips = document.querySelector('.chipRow').getBoundingClientRect();
    const search = document.querySelector('.searchBox').getBoundingClientRect();
    const overlapping = !(
      search.bottom <= chips.top ||
      search.top >= chips.bottom ||
      search.right <= chips.left ||
      search.left >= chips.right
    );
    return {
      overlapping,
      chipRows: Math.round(chips.height),
      searchHeight: Math.round(search.height),
      searchAbove: search.bottom <= chips.top,
    };
  });
  record('the library search does not sit over the categories', !bars.overlapping, bars);
  record('it is above them, at its own height', bars.searchAbove && bars.searchHeight < 60, bars);
  record('and the categories are one scrolling row', bars.chipRows < 60, bars);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(600);
}

// --- the transport line is a row of controls, not a way to select a machine --
//
// On a phone the transport, the machine's rail and the view drawer all sit on
// the row that selects the machine when it is pressed. Selecting a machine
// clears whatever parts the reader had picked, so play, stop, speed and the
// visibility button were each undoing a selection on their way past.
{
  await open(payloads['4-Bar']);
  const selection = () =>
    page.evaluate(() => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      return {
        parts: grid.activeObjService.selectedPartRefs.map((ref) => ref.kind + ':' + ref.id),
        type: grid.activeObjService.getSelectedObjType(),
      };
    });
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const [first, second] = ['A', 'B'].map((id) =>
      grid.mechanismSrv.joints.find((joint) => joint.id === id)
    );
    grid.activeObjService.replacePartSelection(first);
    grid.activeObjService.togglePartSelection(second);
  });
  await page.waitForTimeout(300);
  const picked = await selection();

  await page.locator('.viewSheetButton').click();
  await page.waitForTimeout(400);
  const afterDrawer = await selection();
  await page.locator('.viewRow', { hasText: 'Fit to view' }).click();
  await page.waitForTimeout(700);
  const afterFit = await selection();
  await page.locator('.playButton').click();
  await page.waitForTimeout(400);
  const afterPlay = await selection();
  await page.locator('.playButton').click();
  await page.waitForTimeout(300);

  record(
    'the view drawer, Fit to view and Play all leave the selection alone',
    picked.parts.length === 2 &&
      [afterDrawer, afterFit, afterPlay].every((state) => state.parts.length === 2),
    { picked, afterDrawer, afterFit, afterPlay }
  );

  // And the row still does what the row is for.
  await page.locator('.mechChip').first().click();
  await page.waitForTimeout(400);
  const afterChip = await selection();
  record(
    'while the machine chip still picks the machine',
    afterChip.type === 'Mechanism',
    afterChip
  );
}

record('nothing threw', errors.length === 0, errors.slice(0, 3));

// --- the first visit ---------------------------------------------------------
// Its own context, because every other check above seeds the flag that says
// this reader has been here before.
{
  const newcomer = await browser.newContext({ ...devices['iPhone 13'] });
  const firstTime = await newcomer.newPage();
  await firstTime.goto(BASE, { waitUntil: 'domcontentloaded' });
  await firstTime.waitForTimeout(3000);
  record(
    'a first visit opens the tutorial',
    (await firstTime.locator('app-tutorial-panel').count()) === 1
  );
  await firstTime.close();

  const shared = await newcomer.newPage();
  await shared.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await shared.waitForTimeout(3000);
  // Arriving by a shared link means arriving to look at that, and a tutorial
  // about drawing your first bar is an interruption rather than a welcome.
  record(
    'but not over a mechanism someone sent you',
    (await shared.locator('app-tutorial-panel').count()) === 0
  );
  await shared.close();
  await newcomer.close();
}

console.log(`\n${results.filter(([, ok]) => ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
