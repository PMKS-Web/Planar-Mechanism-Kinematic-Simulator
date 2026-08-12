/**
 * Synthesis adds a machine rather than replacing the drawing.
 *
 * It used to empty the joint and link arrays before writing its four-bar, which
 * was the only sensible thing to do when a drawing held one mechanism. It holds
 * as many as are drawn now, so the linkage it produces joins them.
 *
 *   PMKS_BASE_URL=<origin> node e2e/synthesis-adds-mechanism.mjs
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

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const model = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return {
      joints: srv.joints.map((j) => j.id),
      links: srv.links.map((l) => l.id),
      mechanisms: srv.partitions.map((p) => p.id),
      valid: srv.mechanisms.map((m) => m.isMechanismValid()),
    };
  });

/** Place the three poses the panel needs, then let it synthesise. */
const drawPoses = (spread) =>
  page.evaluate((spread) => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const builder = panel.synthesisBuilder;
    const at = [
      [-4, 3, 0.2],
      [0, 4, 0.5],
      [4, 3, 0.9],
    ];
    at.forEach(([x, y, theta], i) => {
      const id = i + 1;
      if (!builder.isPoseDefined(id)) builder.createPose(id);
      const pose = builder.getPose(id);
      // Through the pose's own setter, so the front and back points it derives
      // are recomputed the way a drag on the canvas would.
      const Coord = Object.getPrototypeOf(pose.position).constructor;
      pose.position = new Coord(x * spread, y * spread);
      builder.setPoseTheta(pose, theta);
    });
  }, spread);

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const before = await model();
record('a four-bar is on the grid to start with', before.mechanisms.length === 1, before);

await page.locator('.tabButton', { hasText: 'Synthesis' }).click();
await page.waitForTimeout(900);
await drawPoses(60);
await page.waitForTimeout(1500);
const after = await model();

record(
  'the drawing the user already had is still there',
  before.joints.every((id) => after.joints.includes(id)),
  { before, after }
);
record('and the synthesised linkage is a second mechanism', after.mechanisms.length === 2, after);
record(
  'with no two joints sharing an id',
  new Set(after.joints).size === after.joints.length,
  after
);
record('nor two links', new Set(after.links).size === after.links.length, after);
record('and both machines solve', after.valid.length === 2 && after.valid.every(Boolean), after);

// Re-running while still in the tab replaces this visit's answer, not adds to it.
await drawPoses(80);
await page.waitForTimeout(1500);
const again = await model();
record(
  'moving a pose revises the linkage rather than drawing another',
  again.mechanisms.length === 2 && again.joints.length === after.joints.length,
  { after, again }
);
record('still with no repeated ids', new Set(again.joints).size === again.joints.length, again);

// Leaving and coming back starts a new one.
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(900);
await page.locator('.tabButton', { hasText: 'Synthesis' }).click();
await page.waitForTimeout(900);
await drawPoses(45);
await page.waitForTimeout(1500);
const third = await model();
record(
  'a fresh visit leaves the last visit alone and adds another',
  third.mechanisms.length === 3,
  { again, third }
);
record(
  'and all three ids are still distinct',
  new Set(third.joints).size === third.joints.length,
  third
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
