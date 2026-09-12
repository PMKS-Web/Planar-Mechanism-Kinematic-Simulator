/** Explanatory domains stay ephemeral; gallery examples make the physical model visible. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { waitForReady } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const galleryBase = process.env.SB_URL ?? 'http://localhost:6006';
const out = 'artifacts/mass-geometry-explanation';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const button = (root, name) => root.getByRole('button', { name, exact: true });
const noBrokenMath = async (root) => {
  assert.deepEqual(await root.locator('.katex-error').allTextContents(), []);
  for (const tex of await root.locator('annotation').allTextContents())
    assert.doesNotMatch(tex, /[\x00-\x1f\ufffd]|\?|Ã|â€/, 'Copied TeX must be intact');
  assert.deepEqual(
    await root
      .locator('.equation')
      .evaluateAll((els) =>
        els
          .filter((el) => el.clientWidth && el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent)
      ),
    []
  );
};
try {
  // Check actual UTF-8 sources too, not just a terminal's rendering of them.
  const folder = 'src/app/component/inertia-explanation';
  for (const file of [
    ...readdirSync(folder)
      .filter((p) => /\.(html|ts)$/.test(p))
      .map((p) => `${folder}/${p}`),
    'docs/inertia-calculation.md',
    'docs/mass-geometry-design.md',
    'src/stories/shared/inertia-explanation.stories.ts',
    'src/stories/support/mass-geometry-example.component.ts',
  ])
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /\ufffd|span\?|L\?\s*\/|Newton\?Euler|â€|Ã/,
      file
    );

  await page.goto(`${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await waitForReady(page);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const link = grid.mechanismSrv.links[0];
    link.mass = 12;
    link.moiIsCustom = false;
    link.comIsCustom = false;
    grid.mechanismSrv.updateMechanism(true);
    grid.activeObjService.updateSelectedObj(link);
    ng.applyChanges(grid);
  });
  await button(page, 'Edit').click();
  const working = page.locator('app-edit-panel app-inertia-explanation');
  await button(working, 'How Inertia Is Calculated').click();
  await working.locator('.mass-model-summary').waitFor({ state: 'visible' });
  assert.match(await working.innerText(), /Automatic model: Uniform slender rod/);
  assert.equal(await page.locator('app-new-grid [app-mass-geometry]').count(), 0);
  const snapshot = () =>
    page.evaluate(() => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const top = ng.getComponent(document.querySelector('app-top-bar'));
      const link = grid.activeObjService.selectedLink;
      return {
        url: location.href,
        history: [...top.history.history],
        index: top.history.index,
        selected: link.id,
        mass: link.mass,
        moi: link.massMoI,
        com: [link.CoM.x, link.CoM.y],
        joints: grid.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]),
      };
    });
  const before = await snapshot();
  const opening = filmstrip(page, `${out}/opening`, { x: 0, y: 0, width: 280, height: 950 });
  await opening.during(25, 10, 'mass-model', () =>
    button(working, 'Mass Model Being Used').click()
  );
  await button(working, 'Show Mass Geometry').click();
  const domain = page.locator('app-new-grid [app-mass-geometry] .domain-edge');
  await domain.waitFor();
  assert.deepEqual(
    await snapshot(),
    before,
    'Opening the overlay must not edit any model/history/URL state'
  );
  await page.screenshot({ path: `${out}/rod-outline-comparison.png` });
  await button(working, 'Mass Model Being Used').click();
  await domain.waitFor({ state: 'detached' });
  assert.equal(await domain.count(), 0);
  await button(working, 'Mass Model Being Used').click();
  assert.equal(await domain.count(), 0, 'Reopening starts with optional geometry hidden');
  await button(working, 'Show Mass Geometry').click();
  const firstPath = await domain.getAttribute('d');
  const motion = filmstrip(page, `${out}/motion`, { x: 270, y: 100, width: 950, height: 700 });
  await motion.during(45, 12, 'seek', async () => {
    for (const pose of [20, 40, 60, 80, 100]) {
      await page.evaluate((value) => {
        const grid = ng.getComponent(document.querySelector('app-new-grid'));
        grid.mechanismSrv.animate(value, false);
        ng.applyChanges(grid);
      }, pose);
      await page.waitForTimeout(65);
    }
  });
  assert.notEqual(await domain.getAttribute('d'), firstPath);
  const expectedPath = await page.evaluate(() => {
    const link = ng.getComponent(document.querySelector('app-new-grid')).activeObjService
      .selectedLink;
    return link.joints.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  });
  assert.equal(await domain.getAttribute('d'), expectedPath);
  await button(working, 'How Inertia Is Calculated').click();
  await domain.waitFor({ state: 'detached' });
  assert.equal(await domain.count(), 0, 'Closing the outer explanation destroys its preview');

  const gallery = await browser.newPage({ viewport: { width: 500, height: 1900 } });
  gallery.on('pageerror', (e) => errors.push(String(e)));
  for (const story of [
    'slender-rod-endpoint',
    'interior-joint',
    'visible-outline',
    'member-decomposition',
    'coincident-geometry',
  ]) {
    await gallery.goto(
      `${galleryBase}/iframe.html?id=feedback-inertia-explanation--${story}&viewMode=story`
    );
    const example = gallery.locator('app-mass-geometry-example');
    await example.waitFor();
    await noBrokenMath(example);
    if (story === 'slender-rod-endpoint') {
      await button(example, '4. Shift to an Endpoint').click();
      assert.ok(
        (await example.locator('annotation').allTextContents()).includes(
          String.raw`I_{\mathrm{end}}=100\,\mathrm{g}\cdot\mathrm{cm}^{2}`
        )
      );
    }
    if (story === 'interior-joint') {
      const hull = example.locator('.domain-edge');
      const previous = await hull.getAttribute('d');
      const value = await example.locator('.result').first().innerText();
      const frames = filmstrip(gallery, `${out}/interior-motion`, {
        x: 0,
        y: 0,
        width: 280,
        height: 650,
      });
      await frames.during(30, 8, 'interior', () => button(example, 'Move Interior Joint').click());
      assert.match(await example.innerText(), /\(4, 1.5\)/);
      assert.equal(await hull.getAttribute('d'), previous);
      assert.equal(await example.locator('.result').first().innerText(), value);
      assert.match(value, /40 g·cm²/);
    }
    if (story === 'member-decomposition') {
      assert.equal(await example.locator('.mass-domain').count(), 2);
      assert.match(await example.innerText(), /3\. Add BC/);
    }
    if (story === 'coincident-geometry') {
      assert.equal(await example.locator('.domain-point').count(), 1);
      assert.equal(
        await example.locator('.joint').count(),
        1,
        'Coincident joint labels share one marker'
      );
    }
    await noBrokenMath(example);
    await example.screenshot({ path: `${out}/gallery-${story}.png` });
  }
  await gallery.close();
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ passed: true, errors }, null, 2));
  console.log(
    'PASS mass geometry: model labels, domain overlays, ephemeral state, pose filmstrip, interior joint, rod endpoint, compound, point, intact equations'
  );
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
