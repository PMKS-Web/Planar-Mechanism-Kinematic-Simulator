/**
 * Make Circular on a crank, driven through the app.
 *
 * One of the two things brought over from PMKS-Refactor. The other was the
 * driver dyad, and the section that covered it used to live here: it set three
 * poses on the synthesis panel's model and expected a four-bar to appear on the
 * grid, which is what that mode did before the redesign. It does not any more
 * -- three positions are placed, an explicit search offers the four-bars that
 * pass through them, and one reaches the drawing when Insert says so -- and the
 * two panel members it drove, `synthesisBuilder` and `swapDrivePin`, no longer
 * exist. `synthesis-redesign.mjs` covers that flow against the API it has now,
 * driver and all, so the section was removed rather than rewritten twice.
 *
 *   PMKS_BASE_URL=http://127.0.0.1:4200 node e2e/circular-link.mjs
 */
const { chromium } = await import('/tmp/pmks-playwright/node_modules/playwright/index.mjs');
import { waitForReady } from './app-ready.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const SHOTS = new URL('../artifacts/screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
let stage = 'load';
const note = (text) => errors.push(`[${stage}] ${text.split('\n')[0].slice(0, 140)}`);
page.on('pageerror', (e) => note(String(e)));
page.on('console', (m) => m.type() === 'error' && note(m.text()));

const shot = (name) => page.screenshot({ path: `${SHOTS}circdrv-${name}.png` });

// ---------------------------------------------------------------- circular
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const linkState = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const crank = grid.mechanismSrv.links.find((l) => l.canBeCircular?.());
    const box = crank ? document.querySelector(`#linkHolder path#${crank.id}`) : null;
    const rect = box?.getBoundingClientRect();
    return {
      id: crank?.id,
      isCircle: crank?.isCircle,
      arcs: (crank?.d.match(/A /g) ?? []).length,
      // A bar has two arcs too (its end caps); only a disc has no straight edge.
      sides: (crank?.d.match(/ L /g) ?? []).length,
      edges: crank?.externalLines.length,
      box: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
      url: location.search,
    };
  });

stage = 'template-loaded';
const before = await linkState();
check('a grounded crank is eligible for a disc', !!before.id, `link ${before.id}`);

// What the right-click menu actually offers, which is the only way anyone
// reaches this feature.
const menuLabels = (linkId) =>
  page.evaluate((id) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.setLastRightClick(grid.mechanismSrv.links.find((l) => l.id === id));
    grid.updateContextMenuItems();
    return grid.cMenu.groups.flatMap((group) => group.rows).map((row) => row.label);
  }, linkId);

const coupler = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const free = grid.mechanismSrv.links.find((l) => !l.canBeCircular());
  return free ? { id: free.id, can: free.canBeCircular() } : null;
});
check('a coupler is not', coupler !== null && coupler.can === false, `link ${coupler?.id}`);

const crankMenu = await menuLabels(before.id);
const couplerMenu = await menuLabels(coupler.id);
// The row is a state now -- "Drawn as a Disc", ticked or not -- rather than a
// verb whose label flipped between Make Circular and Make Bar. And it is
// greyed with its reason on a link that cannot take one rather than hidden:
// the menu's one availability rule is that a reader is told why.
check('the crank is offered a disc', crankMenu.includes('Drawn as a Disc'), crankMenu.join(', '));
const couplerDisc = await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.setLastRightClick(grid.mechanismSrv.links.find((l) => l.id === id));
  return grid.cMenu.groups
    .flatMap((group) => group.rows)
    .filter((row) => row.label === 'Drawn as a Disc')
    .map((row) => ({ disabled: row.disabled, reason: row.refusal?.short ?? null }))[0];
}, coupler.id);
check(
  'the coupler is told why it cannot have one',
  couplerDisc?.disabled === true && couplerDisc?.reason === 'needs a fixed pin',
  JSON.stringify({ couplerDisc, menu: couplerMenu.join(', ') })
);
check(
  'and no label in either menu flips as it is used',
  ![...crankMenu, ...couplerMenu].some((label) => /^(Make|Add|Remove) /.test(label)),
  [...crankMenu, ...couplerMenu].join(', ')
);

await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.links.find((l) => l.id === id));
  grid.mechanismSrv.toggleLinkCircular();
}, before.id);
await page.waitForTimeout(500);

stage = 'made-circular';
const after = await linkState();
check(
  'the crank is drawn as a disc',
  after.isCircle === true && after.arcs === 2 && after.sides === 0,
  `${after.arcs} arcs, ${after.sides} straight edges`
);
check(
  'the disc is as tall as it is wide',
  after.box && Math.abs(after.box[0] - after.box[1]) <= 2,
  `${after.box}`
);
check('the disc has no edges to hang a joint on', after.edges === 0, `${after.edges} edges`);
check(
  'the disc is bigger than the bar it replaced',
  after.box[0] > before.box[0],
  `${before.box[0]} → ${after.box[0]}`
);
await shot('1-disc');

// The URL has to carry it, and reloading has to bring it back.
const shared = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return grid.saveHistoryService.urlGenerationService.generateUrlQuery();
});
stage = 'share-url';
if (shared) {
  await page.goto(`${BASE}/?${shared}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  const reopened = await linkState();
  check(
    'a shared URL reopens as a disc',
    reopened.isCircle === true && reopened.arcs === 2 && reopened.sides === 0
  );
} else {
  check('a shared URL reopens as a disc', false, 'could not reach the url generator');
}

// It has to survive being animated: every solved frame is a fresh copy.
await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  bar.togglePlay ? bar.togglePlay() : bar.play?.();
});
stage = 'animating';
await page.waitForTimeout(1200);
const running = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const crank = grid.mechanismSrv.links.find((l) => l.isCircle);
  return {
    arcs: (crank?.d.match(/A /g) ?? []).length,
    sides: (crank?.d.match(/ L /g) ?? []).length,
    d: crank?.d.slice(0, 40),
  };
});
check('it is still a disc while running', running.arcs === 2 && running.sides === 0, running.d);
await shot('2-running');

// The one error that used to be allowed here belonged to the synthesis poses,
// and went out with them, so nothing is excused any more.
check('no page errors', errors.length === 0, errors.slice(0, 6).join('\n        '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
