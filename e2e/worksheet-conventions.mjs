import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL || 'http://localhost:4200/';
const out = path.resolve('artifacts/worksheet-conventions');
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((l) => l.startsWith(`| [${name}]`))
    .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PMKS_CHROME_CHANNEL || 'chrome',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [],
  report = {};
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const open = async (name, force = false) => {
  await openMechanism(page, `${base}?${payload(name)}`);
  await page.getByRole('button', { name: force ? /Force Analysis/ : /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.evaluate(() => document.fonts.ready);
  return dialog;
};
const snapshot = (dialog) =>
  dialog.locator('app-solver-explanation').evaluate((host) => {
    const c = window.ng.getComponent(host),
      v = c.view;
    return {
      force: v.forceWork?.system,
      choices: v.forceWork?.choices,
      references: v.bodies.map((b) => b.reference),
      loads: v.bodies.map((b) =>
        b.loads.map((l) => ({ vector: l.vector, couple: l.couple, sign: l.sign }))
      ),
      velocity: v.kine?.velocity,
      acceleration: v.kine?.acceleration,
      loops: v.loops?.map((l) => ({ id: l.id, coefficients: l.coefficients })),
    };
  });
const clean = async () => assert.equal(await page.locator('.katex-error').count(), 0);
try {
  let dialog = await open('TeachingLab four-bar', true);
  const before = await snapshot(dialog);
  await dialog.locator('.conventions > summary').click();
  const joint = dialog.locator('[data-force-choice="Joint B"]');
  await joint.locator(':scope > summary').click();
  await joint.scrollIntoViewIfNeeded();
  const framesDir = `${out}/sign-change`;
  const film = filmstrip(page, framesDir, await joint.boundingBox());
  await film.shot('before');
  await film.during(30, 8, 'flip', () =>
    joint.getByRole('button', { name: '−X ←', exact: true }).click()
  );
  const flipped = await snapshot(dialog);
  const choice = before.choices.find((c) => c.label === 'Joint B');
  before.force.x.forEach((x, i) =>
    assert.equal(flipped.force.x[i], choice.columns[0] === i ? -x : x)
  );
  flipped.loads.forEach((loads, i) =>
    loads.forEach((load, j) => assert.deepEqual(load.vector, before.loads[i][j].vector))
  );
  await joint.screenshot({ path: `${out}/force-choices.png` });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  dialog = page.getByRole('dialog');
  assert.deepEqual((await snapshot(dialog)).force.x, flipped.force.x);
  await dialog.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  const body = dialog.locator('.bodyCard').first();
  await body.locator(':scope > summary').click();
  const reference = body.getByRole('combobox', { name: 'Moment Reference Point for ABH' });
  await reference.selectOption({ label: 'H' });
  assert.equal((await snapshot(dialog)).references[0].id, 'H');
  assert.deepEqual((await snapshot(dialog)).force.x, flipped.force.x);
  assert(await body.locator('svg .axisX').getAttribute('marker-end'));
  assert(await body.locator('svg .positiveMoment').getAttribute('marker-end'));
  assert((await body.innerText()).includes('Moments about H'));
  assert((await body.innerText()).includes('CoM'));
  assert((await body.locator('.crossProduct').count()) > 0);
  await page.setViewportSize({ width: 1440, height: 2200 });
  await body.screenshot({ path: `${out}/reversed-free-body.png` });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await clean();
  report.force = {
    columns: choice.columns,
    original: before.force.x,
    chosen: flipped.force.x,
    retainedAfterClose: true,
  };

  dialog = await open('Rocker with an offset load', true);
  await dialog.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  const loadedBody = dialog.locator('.bodyCard[data-body="CDL"]');
  await loadedBody.locator(':scope > summary').click();
  await loadedBody.getByRole('combobox').selectOption({ label: 'P1 (Applied Force)' });
  const applied = await snapshot(dialog);
  assert(applied.references.some((p) => p.id === 'P1'));
  const throughReference = loadedBody.locator('.crossProduct').filter({ hasText: 'Force at P1' });
  if (!(await throughReference.evaluate((details) => details.open)))
    await throughReference.locator('summary').click();
  assert((await throughReference.innerText()).includes('moment arm is zero'));
  await page.setViewportSize({ width: 1440, height: 2400 });
  await loadedBody.screenshot({ path: `${out}/applied-point.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await loadedBody.getByRole('combobox').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/force-phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await clean();
  await page.setViewportSize({ width: 1440, height: 1100 });

  dialog = await open('TeachingLab four-bar');
  await dialog.getByRole('button', { name: 'Velocity', exact: true }).click();
  const original = await snapshot(dialog);
  let editor = dialog.locator('app-worksheet-loop-editor').first();
  await editor.getByRole('button', { name: 'Reverse Loop', exact: true }).click();
  const reverse = await snapshot(dialog);
  assert.deepEqual(reverse.velocity.x, original.velocity.x);
  reverse.velocity.A.forEach((row, i) =>
    row.forEach((a, j) => assert(Math.abs(a + original.velocity.A[i][j]) < 1e-9))
  );
  await dialog
    .locator('.loopCard')
    .first()
    .screenshot({ path: `${out}/reversed-loop.png` });
  assert.equal(await editor.getByRole('textbox').count(), 0);
  await editor
    .getByRole('combobox', { name: 'Loop Path' })
    .selectOption({ label: original.loops[0].id });
  assert.equal((await snapshot(dialog)).loops[0].id, original.loops[0].id);
  await dialog.locator('.conventions > summary').click();
  await dialog.getByRole('button', { name: 'Clockwise', exact: true }).click();
  const clockwise = await snapshot(dialog);
  clockwise.velocity.x.forEach((x, i) => assert(Math.abs(x + original.velocity.x[i]) < 1e-9));
  clockwise.acceleration.x.forEach((x, i) =>
    assert(Math.abs(x + original.acceleration.x[i]) < 1e-9)
  );
  await dialog.getByRole('button', { name: 'Acceleration', exact: true }).click();
  await clean();
  report.kinematics = {
    originalLoop: original.loops[0].id,
    reversedLoop: reverse.loops[0].id,
    clockwiseValues: clockwise.velocity.x,
  };
  await dialog.getByText('Choose Angular Directions per Link', { exact: true }).click();
  await dialog
    .locator('[data-convention="Link CDEI"]')
    .getByRole('button', { name: 'Counterclockwise', exact: true })
    .click();
  const mixed = await snapshot(dialog);
  mixed.velocity.unknowns.forEach((u, i) =>
    assert.equal(
      mixed.velocity.x[i],
      u.label.endsWith('_CDEI') ? original.velocity.x[i] : -original.velocity.x[i]
    )
  );
  await dialog.locator('.conventions').screenshot({ path: `${out}/mixed-angular-directions.png` });
  await dialog.getByRole('button', { name: 'Reset Worksheet Conventions', exact: true }).click();
  assert.deepEqual((await snapshot(dialog)).loops, original.loops);
  assert.deepEqual((await snapshot(dialog)).velocity.x, original.velocity.x);

  dialog = await open('Jansen leg');
  await dialog.getByRole('button', { name: 'Velocity', exact: true }).click();
  const jansen = await snapshot(dialog);
  editor = dialog.locator('app-worksheet-loop-editor').nth(1);
  await editor
    .getByRole('combobox', { name: 'Loop Path' })
    .selectOption({ label: 'A → B → C → E → D → A' });
  const alternative = await snapshot(dialog);
  assert.equal(alternative.loops[1].id, 'A → B → C → E → D → A');
  assert.equal(
    await editor.locator('select').evaluate((s) => s.selectedOptions[0].textContent.trim()),
    alternative.loops[1].id
  );
  assert.deepEqual(alternative.velocity.x, jansen.velocity.x);
  assert.notDeepEqual(alternative.velocity.A, jansen.velocity.A);
  await dialog
    .locator('.loopCard')
    .nth(1)
    .screenshot({ path: `${out}/alternative-loop.png` });
  assert(
    await editor
      .locator('option')
      .filter({ hasText: jansen.loops[0].id })
      .evaluate((o) => o.disabled),
    JSON.stringify(
      await editor
        .locator('option')
        .evaluateAll((options) =>
          options.map((o) => ({ label: o.textContent, disabled: o.disabled }))
        )
    )
  );
  await editor.screenshot({ path: `${out}/dependent-path.png` });
  assert.deepEqual((await snapshot(dialog)).loops, alternative.loops);
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await clean();
  report.alternative = alternative.loops;
  assert.deepEqual(errors, []);
  const sheet = await context.newPage();
  await sheet.setViewportSize({ width: 1200, height: 380 });
  await sheet.setContent(
    `<style>body{margin:6px;display:grid;grid-template-columns:repeat(3,380px);gap:8px;background:#ddd}img{width:380px}</style>${readdirSync(
      framesDir
    )
      .sort()
      .map(
        (f) =>
          `<img src="data:image/png;base64,${readFileSync(path.join(framesDir, f)).toString('base64')}">`
      )
      .join('')}`
  );
  await sheet.screenshot({ path: `${out}/sign-change-sheet.png`, fullPage: true });
  if (process.env.PMKS_STORYBOOK_URL) {
    const galleryUrl = process.env.PMKS_STORYBOOK_URL;
    const index = await (await fetch(`${galleryUrl}/index.json`)).json();
    const stories = Object.values(index.entries).filter(
      (entry) =>
        entry.type === 'story' &&
        (/^analysis-(equation-conventions|loop-path)--/.test(entry.id) ||
          /^choices-segmented--dropdown/.test(entry.id))
    );
    assert.equal(stories.length, 11);
    const storyPage = await context.newPage();
    storyPage.on('pageerror', (e) => errors.push(e.message));
    await storyPage.setViewportSize({ width: 600, height: 500 });
    for (const entry of stories) {
      await storyPage.goto(`${galleryUrl}/iframe.html?id=${entry.id}&viewMode=story`);
      await storyPage
        .locator('app-worksheet-choices, app-worksheet-loop-editor, segmented-block')
        .first()
        .waitFor();
      await storyPage.evaluate(() => document.fonts.ready);
      await storyPage.screenshot({ path: `${out}/story-${entry.id}.png` });
    }
    await storyPage.goto(
      `${galleryUrl}/iframe.html?id=analysis-equation-conventions--default&viewMode=story`
    );
    await storyPage.getByRole('button', { name: '−X ←', exact: true }).click();
    assert.equal(
      await storyPage
        .getByRole('button', { name: '−X ←', exact: true })
        .getAttribute('aria-pressed'),
      'true'
    );
    await storyPage.goto(`${galleryUrl}/iframe.html?id=analysis-loop-path--default&viewMode=story`);
    await storyPage.getByRole('combobox', { name: 'Loop Path' }).selectOption('1');
    await storyPage.getByRole('button', { name: 'Reverse Loop' }).click();
    assert.equal(await storyPage.getByRole('combobox', { name: 'Loop Path' }).inputValue(), '0');
    assert.deepEqual(errors, []);
    report.stories = stories.length;
  }
  console.log(
    'PASS: independent force signs, visual references, cross products, reaction balance, dialog persistence, loop dropdown, angular signs, independent basis, disabled dependent paths, reset, phone layout, typesetting.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
