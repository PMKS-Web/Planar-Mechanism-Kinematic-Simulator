import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const out = 'artifacts/kinematic-visuals';
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((l) => l.startsWith(`| [${name}]`))
    .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [],
  report = {};
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url}`);
});
const open = async (name) => {
  await openMechanism(
    page,
    `${process.env.PMKS_BASE_URL || 'http://localhost:4200/'}?${payload(name)}`
  );
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  return page.getByRole('dialog');
};
const geometry = (part) =>
  part.locator('app-solver-diagram > svg').evaluateAll((s) =>
    s.map((svg) => ({
      outlines: [...svg.querySelectorAll('polygon')].map((p) => p.getAttribute('points')),
      points: [...svg.querySelectorAll('circle[r="4"]')].map((p) => [
        p.getAttribute('cx'),
        p.getAttribute('cy'),
      ]),
    }))
  );
const references = (part) =>
  part.locator('.angularReference').evaluateAll((nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-link'),
      direction: n.getAttribute('data-direction'),
      arc: n.querySelector('path').getAttribute('d'),
    }))
  );
const state = (d) =>
  d.locator('app-solver-explanation').evaluate((h) => {
    const v = window.ng.getComponent(h).view;
    return {
      velocity: v.kine.velocity,
      loops: v.loops.map((l) => l.id),
      points: v.mechanismSketch.points.length,
    };
  });
try {
  let d = await open('TeachingLab four-bar');
  await d.getByRole('button', { name: 'Velocity', exact: true }).click();
  await d.locator('.conventions > summary').click();
  const overview = d.locator('.angularOverview'),
    initial = await references(overview),
    fixed = await geometry(overview),
    before = await state(d);
  assert.equal(initial.length, 3);
  assert(initial.every((r) => r.direction === 'CCW'));
  await page.evaluate(() => document.fonts.ready);
  await overview.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const previewBox = await overview.boundingBox();
  const film = filmstrip(page, `${out}/angular-change`, await overview.boundingBox());
  await film.shot('before');
  await film.during(30, 8, 'clockwise', () =>
    d.getByRole('button', { name: 'Clockwise', exact: true }).click()
  );
  const clockwise = await references(overview);
  assert(clockwise.every((r, i) => r.direction === 'CW' && r.arc !== initial[i].arc));
  assert.deepEqual(await geometry(overview), fixed);
  assert.deepEqual(await overview.boundingBox(), previewBox);
  const changed = await state(d);
  changed.velocity.x.forEach((x, i) => assert(Math.abs(x + before.velocity.x[i]) < 1e-8));
  assert((await references(d.locator('.overviewDetails'))).every((r) => r.direction === 'CW'));
  await d.getByText('Choose Angular Directions per Link', { exact: true }).click();
  const link = d.locator('[data-angular-link="CDEI"]');
  await link.locator(':scope > summary').click();
  const linkFixed = await geometry(link);
  await link.getByRole('button', { name: 'Counterclockwise', exact: true }).click();
  assert.deepEqual(await geometry(link), linkFixed);
  assert.equal((await references(link))[0].direction, 'CCW');
  assert(
    (await references(overview)).every((r) => r.direction === (r.id === 'CDEI' ? 'CCW' : 'CW'))
  );
  await link.screenshot({ path: `${out}/per-link.png` });
  await overview.screenshot({ path: `${out}/mixed-directions.png` });
  await d.locator('.conventions > summary').click();
  const card = d.locator('.loopCard').first(),
    visual = card.locator('app-worksheet-loop-visual');
  assert.equal(await visual.locator('.mechanismContext polygon').count(), 3);
  assert.equal(await visual.locator('svg > circle[r="4"]').count(), before.points);
  const loopFixed = await geometry(visual);
  for (let i = 1; i <= 4; i++) {
    await visual.getByRole('button', { name: 'Follow Next Vector' }).click();
    assert.equal(
      await visual.getByRole('combobox', { name: 'Trace the Loop' }).inputValue(),
      String(i)
    );
    assert.deepEqual(await geometry(visual), loopFixed);
  }
  assert((await visual.innerText()).includes('Back at A: the vectors sum to zero.'));
  await visual.screenshot({ path: `${out}/closed-loop.png` });
  await card.getByRole('button', { name: 'Reverse Loop' }).click();
  assert.equal(await visual.getByRole('combobox', { name: 'Trace the Loop' }).inputValue(), '0');
  assert.deepEqual(await geometry(visual), loopFixed);
  await visual.getByRole('button', { name: 'Follow Next Vector' }).click();
  assert((await visual.innerText()).includes('Step 1: go from A to D.'));
  assert.deepEqual(
    (await state(d)).velocity.x,
    changed.velocity.x.map((x, i) =>
      changed.velocity.unknowns[i].label.endsWith('_CDEI') ? -x : x
    )
  );
  d = await open('Jansen leg');
  await d.getByRole('button', { name: 'Velocity', exact: true }).click();
  const jansen = d.locator('.loopCard').nth(1),
    jv = jansen.locator('app-worksheet-loop-visual');
  const full = await geometry(jv),
    rates = (await state(d)).velocity.x;
  await jansen
    .getByRole('combobox', { name: 'Loop Path' })
    .selectOption({ label: 'A → B → C → E → D → A' });
  assert.deepEqual(await geometry(jv), full);
  assert.deepEqual((await state(d)).velocity.x, rates);
  await jv.getByRole('combobox', { name: 'Trace the Loop' }).selectOption('3');
  assert((await jv.innerText()).includes('Step 3: go from C to E.'));
  await jv.screenshot({ path: `${out}/internal-loop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await jv.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await d.locator('.katex-error').count(), 0);
  assert.deepEqual(errors, []);
  if (process.env.PMKS_STORYBOOK_URL) {
    // Python's static Storybook server has no favicon; it is not a story asset.
    await page.route(`${process.env.PMKS_STORYBOOK_URL}/favicon.ico`, (route) =>
      route.fulfill({ status: 204 })
    );
    await page.setViewportSize({ width: 600, height: 1050 });
    const stories = [
      'analysis-angular-reference--counterclockwise',
      'analysis-angular-reference--clockwise',
      'analysis-trace-a-loop--whole-mechanism',
      'analysis-trace-a-loop--reversed',
    ];
    for (const id of stories) {
      await page.goto(`${process.env.PMKS_STORYBOOK_URL}/iframe.html?id=${id}&viewMode=story`);
      await page.locator('app-solver-diagram').waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (id.includes('trace-a-loop')) {
        await page.getByRole('button', { name: 'Follow Next Vector' }).click();
        assert.equal(
          await page.getByRole('combobox', { name: 'Trace the Loop' }).inputValue(),
          '1'
        );
      }
      await page.screenshot({ path: `${out}/story-${id}.png` });
    }
    report.stories = stories.length;
    assert.deepEqual(errors, []);
  }
  Object.assign(report, { initial, clockwise, fixedGeometry: true, independentLoop: true });
  console.log(
    'PASS: visual angular conventions, per-link overrides, stable geometry, full-mechanism loop tracing, closure, reverse/alternative paths, equations, phone layout.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
