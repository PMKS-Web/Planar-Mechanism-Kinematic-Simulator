/**
 * The transport row, rebuilt: two lines a machine, an end-of-cycle reading, and
 * a selection the row's own surface carries.
 *
 * Three things this has to hold that a screenshot alone will not. The reading
 * has to be right -- a crank comes round again, a driven ram turns back -- and
 * it has to be one sentence about the group when the machines are synced. The
 * handle has to get the card's whole width. And the selection has to sit under
 * the whole row without any control crossing its edge, which is the thing the
 * old filled chip could not do.
 *
 *   PMKS_BASE_URL=<origin> node e2e/playback-loop-indicator.mjs
 */

import { readFileSync, mkdirSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/playback-loop-indicator';
mkdirSync(OUT, { recursive: true });

const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

/** Two four-bars side by side, each with its own drive: one drawing, two clocks. */
const TWO_FOUR_BARS =
  '2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
  '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
  'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
  'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
  'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';

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

const kinematic = async () => {
  await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
  await page.waitForTimeout(900);
};

const rowText = () => page.locator('.scrubCard').innerText();

/** Every box the row draws, in page coordinates, for the geometry checks. */
const boxes = () =>
  page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
      };
    };
    return [...document.querySelectorAll('.mechRow')].map((row) => ({
      row: rect(row),
      head: rect(row.querySelector('.rowHead')),
      track: rect(row.querySelector('.rowScrubber')),
      readout: rect(row.querySelector('.rowReadout')),
      play: rect(row.querySelector('.rowPlay')),
      flip: rect(row.querySelector('.dirButton')),
      fill: getComputedStyle(row).backgroundColor,
      selected: row.classList.contains('selected'),
    }));
  });

// --- a continuously driven crank comes round again --------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

let text = await rowText();
record('a crank says it loops', /Loops/.test(text) && !/Reverses/.test(text), text);
await page.screenshot({
  path: `${OUT}/01-one-crank.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

let geometry = (await boxes())[0];
record(
  'the handle gets the card of the width the row does',
  geometry.track.width > geometry.row.width - 24 && geometry.track.top > geometry.head.bottom,
  geometry
);
record(
  'and the buttons sit inside the row rather than on its edge',
  geometry.flip.right <= geometry.row.right - 4 && geometry.flip.top >= geometry.row.top,
  geometry
);

// --- a driven ram turns round -----------------------------------------------
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

text = await rowText();
record('a driven ram says it reverses', /Reverses/.test(text) && !/Loops/.test(text), text);
await page.screenshot({
  path: `${OUT}/02-one-ram.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

// --- selection is the row's own surface -------------------------------------
await page.goto(`${BASE}/?${TWO_FOUR_BARS}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

record(
  'synced, the two machines collapse to one row',
  (await page.locator('.mechRow').count()) === 1,
  {
    rows: await rowText(),
  }
);
record(
  'and the row speaks for both at once, in one reading',
  (await rowText()).match(/Loops/g)?.length === 1,
  await rowText()
);
await page.screenshot({
  path: `${OUT}/03-synced.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

await page.locator('.syncToggle').click();
await page.waitForTimeout(700);
record('unsynced, the transport lists both', (await page.locator('.mechRow').count()) === 2);

const before = await boxes();
record(
  'nothing is filled until a machine is chosen',
  before.every((row) => !row.selected),
  before.map((row) => row.fill)
);
record(
  'and the two readout columns line up, whatever the numbers are',
  before[0].readout.left === before[1].readout.left,
  before.map((row) => row.readout)
);

await page.locator('.mechRow').first().click();
await page.waitForTimeout(500);
const after = await boxes();
record('clicking a row selects that machine', after[0].selected && !after[1].selected, {
  fills: after.map((row) => row.fill),
});
record(
  'the fill is the row and only the row',
  after[0].fill !== after[1].fill && after[0].row.left === before[0].row.left,
  { selected: after[0].fill, other: after[1].fill }
);
record(
  'and choosing it moved nothing on the line',
  after[0].readout.left === before[0].readout.left &&
    after[0].play.left === before[0].play.left &&
    after[0].flip.left === before[0].flip.left,
  { before: before[0], after: after[0] }
);
await page.screenshot({
  path: `${OUT}/04-selected.png`,
  clip: { x: 300, y: 700, width: 1180, height: 240 },
});

// The panel is what proves the click reached the mechanism, not just the CSS.
const panel = await page
  .locator('app-right-panel, app-analysis-panel')
  .first()
  .innerText()
  .catch(() => '');
record('the selection reaches the analysis panel', /Mechanism M1/.test(panel), panel.slice(0, 160));

// --- one drawing, two kinds of ending ---------------------------------------
// A driven ram beside a crank, so the combined row has two facts to carry and
// has to name which machines each one is about.
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

/**
 * Draw a four-bar beside the ram, using the app's own object model.
 *
 * Cloning the prototypes of the joints and links already on the grid rather
 * than importing the classes: this runs in the page, where the modules are not
 * addressable by name.
 */
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const seedJoint = srv.joints[0];
  const seedLink = srv.links.find((link) => link.joints.length === 2);
  const JointClass = Object.getPrototypeOf(seedJoint).constructor;
  const LinkClass = Object.getPrototypeOf(seedLink).constructor;
  const S = seedJoint.x === 0 ? 200 : Math.abs(seedJoint.x) / 3;

  const at = [
    [10, 0],
    [10, 1],
    [13, 2],
    [14, 0],
  ];
  const made = at.map(([x, y], i) => new JointClass('W' + i, x * S, y * S));
  made[0].ground = true;
  made[3].ground = true;
  made[0].input = true;

  const links = [0, 1, 2].map((i) => {
    const link = new LinkClass(made[i].id + made[i + 1].id, [made[i], made[i + 1]]);
    made[i].links.push(link);
    made[i + 1].links.push(link);
    made[i].connectedJoints.push(made[i + 1]);
    made[i + 1].connectedJoints.push(made[i]);
    return link;
  });

  srv.joints.push(...made);
  srv.links.push(...links);
  srv.updateMechanism(true);
});
await page.waitForTimeout(1400);
await kinematic();

const mixed = await rowText();
record(
  'synced over two kinds of machine, the row names which does which',
  /M1 reverses/.test(mixed) && /M2 loops/.test(mixed),
  mixed
);
await page.screenshot({
  path: `${OUT}/05-mixed.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
