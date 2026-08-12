/**
 * Two machines in one drawing, in the browser.
 *
 * The unit suite proves the model splits them and solves each on its own; this
 * proves the app in front of a person does the same — a row each in the
 * transport, a section each in the setup drawer, and a sync toggle that
 * actually decouples them.
 *
 *   PMKS_BASE_URL=<origin> node e2e/two-mechanisms.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

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

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

/**
 * Draw a second four-bar beside the first, using the app's own object model.
 *
 * Cloning the prototypes of the joints and links already on the grid rather
 * than importing the classes: this runs in the page, where the modules are not
 * addressable by name.
 */
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const seedJoint = srv.joints[0];
  const seedLink = srv.links[0];
  const JointClass = Object.getPrototypeOf(seedJoint).constructor;
  const LinkClass = Object.getPrototypeOf(seedLink).constructor;
  const S = seedJoint.x === 0 ? 200 : Math.abs(seedJoint.x) / 3;

  const at = [
    [10, 0],
    [10, 1],
    [13, 2],
    [14, 0],
  ];
  const made = at.map(([x, y], i) => new JointClass(String.fromCharCode(69 + i), x * S, y * S));
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
await page.waitForTimeout(1200);

const model = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return {
    count: srv.mechanisms.length,
    ids: srv.partitions.map((p) => p.id),
    dofs: srv.mechanisms.map((m) => m.dof),
    valid: srv.mechanisms.map((m) => m.isMechanismValid()),
  };
});
record(
  'a second four-bar becomes a second mechanism, each 1 DoF and valid',
  model.count === 2 &&
    model.dofs.every((d) => d === 1) &&
    model.valid.every(Boolean) &&
    model.ids.join(',') === 'M1,M2',
  model
);

await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(900);

// Synced, the machines move together and there is nothing to say about them
// separately, so the transport collapses to one line for all of them.
record(
  'synced, the transport shows one line for all of them',
  (await page.locator('.mechRow').count()) === 1,
  {
    rows: await page.locator('.mechRows').innerText(),
  }
);
record(
  'with no row play beside the transport play',
  (await page.locator('.rowPlay').count()) === 0
);
record('and offers to unsync them', (await page.locator('.syncToggle').count()) === 1);

// --- unsyncing gives each its own clock -------------------------------------
await page.locator('.syncToggle').click();
await page.waitForTimeout(500);
record('unsynced, the transport lists both', (await page.locator('.mechRow').count()) === 2, {
  rows: await page.locator('.mechRows').innerText(),
});
record('and each row gets its own play button', (await page.locator('.rowPlay').count()) === 2);
record(
  'one scrubber per line, never two for one motion',
  (await page.locator('.rowScrubber').count()) === 2 &&
    (await page.locator('.scrubber').count()) === 0
);

const seconds = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return srv.mechanisms.map((_, i) => srv.secondsOf(i));
  });

const before = await seconds();
await page.locator('.rowPlay').first().click();
await page.waitForTimeout(1200);
const after = await seconds();
record(
  'playing one machine moves only that one',
  Math.abs(after[0] - before[0]) > 0.05 && Math.abs(after[1] - before[1]) < 1e-6,
  { before, after }
);

// --- the setup drawer accounts for both -------------------------------------
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.joints.filter((j) => j.id === 'E').forEach((j) => (j.input = false));
  srv.updateMechanism();
});
await page.waitForTimeout(500);
await page.locator('.tabButton', { hasText: 'Force' }).click();
await page.waitForTimeout(700);
const drawer = await page.locator('app-analysis-setup').innerText();
record(
  'the drawer names both mechanisms and blames only the broken one',
  drawer.includes('Mechanism M1') &&
    drawer.includes('Mechanism M2') &&
    drawer.includes('Nothing drives this mechanism'),
  drawer
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
