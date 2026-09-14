/**
 * The provider seam must preserve staging's shell. Run both builds on the same browser, fixtures,
 * viewport and commanded pose; compare the DOM and pixels rather than accepting
 * two independent "it works" checks. S0 flows remain the comparison subjects.
 *
 * PMKS_BASELINE_URL=http://localhost:4337 PMKS_BASE_URL=http://localhost:4327 \
 *   node e2e/chrome-provider-parity.mjs
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ALL_LINKAGES } from './template-payloads.mjs';
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const playwrightDir = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwrightDir + '/node_modules/playwright/index.mjs');
const { PNG } = await import(playwrightDir + '/node_modules/pngjs/lib/png.js');
const baseline = process.env.PMKS_BASELINE_URL;
assert(baseline, 'A separate untouched staging server is required');
const candidate = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
assert.notEqual(candidate, baseline, 'Comparing a build to itself is not evidence');
const out = process.env.PMKS_PARITY_OUT ?? 'artifacts/chrome-seam/parity';
mkdirSync(out, { recursive: true });
const regions = [
  'app-top-bar',
  'app-left-tabs',
  'app-playback-bar',
  'app-view-controls',
  'app-bottombar',
  'app-right-panel',
];
const browser = await chromium.launch();
const errors = [],
  comparisons = [];
const pages = [];

async function open(id, fitMotion = true) {
  for (const [index, page] of pages.entries()) {
    await page.goto(`${index ? candidate : baseline}/?${ALL_LINKAGES[id]}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForReady(page);
    if (fitMotion)
      await page.evaluate(() =>
        ng.getComponent(document.querySelector('app-view-controls')).onFitFullMotionPressed()
      );
    await page.waitForTimeout(700);
    await page.mouse.move(1355, 895);
  }
}

async function snapshot(name) {
  const trees = [];
  for (const [index, page] of pages.entries()) {
    await page.evaluate(() => document.fonts.ready);
    trees.push(
      await page.evaluate((regions) => {
        const tree = (element) => {
          if (element.nodeType === Node.TEXT_NODE)
            return element.textContent.replace(/\s+/g, ' ').trim();
          if (!(element instanceof Element)) return null;
          // Extracting the shared empty state adds a transparent host, not a shell region.
          if (element.matches('app-empty-selection')) return [...element.childNodes].map(tree);
          // Framework-generated IDs vary with compilation; user-facing attributes,
          // text, geometry and computed presentation must not.
          const attrs = [...element.attributes]
            .filter((a) => /^(aria-|role$|title$|disabled$|hidden$|type$)/.test(a.name))
            .filter((a) => !/^(aria-describedby|aria-controls|aria-labelledby)$/.test(a.name))
            .filter((a) => a.name !== 'title' || a.value !== '')
            .map((a) => [a.name, a.value]);
          const style = getComputedStyle(element),
            box = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            attrs,
            box: [box.x, box.y, box.width, box.height].map((n) => Math.round(n * 100) / 100),
            style: [
              'color',
              'backgroundColor',
              'boxShadow',
              'borderRadius',
              'fontSize',
              'fontFamily',
              'opacity',
              'display',
            ].map((key) => style[key]),
            children: [...element.childNodes]
              .map(tree)
              .flat(Infinity)
              .filter((value) => value !== null && value !== ''),
          };
        };
        return regions.map((selector) => ({
          selector,
          nodes: [...document.querySelectorAll(selector)].map(tree),
        }));
      }, regions)
    );
    await page.screenshot({ path: `${out}/${name}-${index ? 'seam' : 'staging'}.png` });
  }
  writeFileSync(`${out}/${name}-dom.json`, JSON.stringify(trees, null, 2));
  assert.deepEqual(trees[1], trees[0], `${name}: chrome DOM or geometry differs`);
  const [left, right] = ['staging', 'seam'].map((side) =>
    PNG.sync.read(readFileSync(`${out}/${name}-${side}.png`))
  );
  assert.deepEqual([left.width, left.height], [right.width, right.height]);
  const diff = new PNG({ width: left.width, height: left.height });
  let changedPixels = 0,
    maxChannelDelta = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    let delta = 0;
    for (let channel = 0; channel < 3; channel++) {
      diff.data[offset + channel] = Math.abs(
        left.data[offset + channel] - right.data[offset + channel]
      );
      delta = Math.max(delta, diff.data[offset + channel]);
    }
    diff.data[offset + 3] = 255;
    if (delta > 8) changedPixels++;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  writeFileSync(`${out}/${name}-diff.png`, PNG.sync.write(diff));
  assert.equal(changedPixels, 0, `${name}: screenshot differs (${changedPixels} pixels)`);
  comparisons.push({ name, changedPixels, maxChannelDelta, totalPixels: left.width * left.height });
  console.log(`PASS ${name}: identical chrome and screenshot`);
}

async function both(action) {
  for (const page of pages) await action(page);
}
async function film(name, action, clip) {
  for (const [index, page] of pages.entries()) {
    const dir = `${out}/${name}-${index ? 'seam' : 'staging'}-frames`;
    await filmstrip(page, dir, clip).during(20, 10, name, () => action(page));
    await contactSheet(
      `${dir}/*.png`,
      `${out}/${name}-${index ? 'seam' : 'staging'}-sheet.png`,
      5,
      0.45
    );
  }
}
try {
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await startQuiet(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(String(error)));
    pages.push(page);
  }
  for (const id of ['4-Bar', 'Cylinder_Boom', 'Scotch_Yoke', 'Three_Machines']) {
    assert(ALL_LINKAGES[id], `Missing S0 fixture ${id}`);
    await open(id);
    await snapshot(`${id}-design`);
    // Command identical samples for the paired motion sheets. Real elapsed-time
    // play/pause is also exercised below and by the existing two-mechanisms gate.
    for (let frame = 0; frame < 9; frame++) {
      await both((page) =>
        page.evaluate((fraction) => {
          const service = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
          service.seekAllAlong(service.masterMechanismIndex(), fraction);
        }, frame / 8)
      );
      await both((page) => page.waitForTimeout(40));
      await snapshot(`${id}-pose-${frame}`);
    }
    for (const side of ['staging', 'seam'])
      await contactSheet(
        `${out}/${id}-pose-*-${side}.png`,
        `${out}/${id}-${side}-sheet.png`,
        3,
        0.4
      );
  }
  await open('4-Bar', false);
  await both((page) => page.locator('#joint_B').click());
  await both((page) => page.locator('#editWrapper #dual-input-block input').first().focus());
  await snapshot('desktop-focus');
  await film(
    'subsection-collapse',
    (page) => page.getByRole('button', { name: 'Basic Settings', exact: true }).click(),
    { x: 0, y: 60, width: 275, height: 700 }
  );
  await both((page) => page.waitForTimeout(250));
  await snapshot('subsection-collapsed');
  await film(
    'subsection-expand',
    (page) => page.getByRole('button', { name: 'Basic Settings', exact: true }).click(),
    { x: 0, y: 60, width: 275, height: 700 }
  );
  await both((page) => page.waitForTimeout(250));
  await snapshot('subsection-expanded');
  await both(async (page) => {
    const field = page.locator('#editWrapper #dual-input-block input').first();
    const before = await field.inputValue();
    await field.fill(String(parseFloat(before) + 0.1));
    await field.press('Enter');
    await page.waitForTimeout(300);
  });
  await snapshot('coordinate-edit');
  await both((page) => page.getByRole('button', { name: 'Undo', exact: true }).click());
  await both((page) => page.waitForTimeout(500));
  await snapshot('coordinate-undo');
  await both((page) => page.locator('#joint_B').click({ button: 'right' }));
  await both((page) => page.waitForTimeout(250));
  await snapshot('context-menu');
  await both((page) => page.keyboard.press('Escape'));
  await film('playback-start', (page) =>
    page.getByRole('button', { name: 'Play', exact: true }).click()
  );
  await both((page) => page.getByRole('button', { name: 'Pause', exact: true }).click());
  await open('4-Bar', false);
  await both((page) => page.locator('#joint_B').click());
  await both((page) => page.setViewportSize({ width: 390, height: 844 }));
  await both((page) => page.waitForTimeout(700));
  await snapshot('phone-collapsed');
  await film('phone-opening', (page) => page.locator('.sheetHandle').click());
  await both((page) => page.waitForTimeout(300));
  await snapshot('phone-expanded');
  await both((page) => page.emulateMedia({ reducedMotion: 'reduce' }));
  await both((page) => page.locator('.sheetHandle').click());
  await both((page) => page.waitForTimeout(150));
  await snapshot('phone-reduced-closed');
  await both((page) => page.locator('.sheetHandle').click());
  await both((page) => page.waitForTimeout(150));
  await snapshot('phone-reduced-open');
  assert.deepEqual(errors, [], 'Browser errors');
} finally {
  writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ baseline, candidate, comparisons, errors }, null, 2)
  );
  await browser.close();
}
