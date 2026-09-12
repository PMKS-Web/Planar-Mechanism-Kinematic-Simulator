import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '..') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4317';
const out = path.resolve('artifacts/friction-visualization');
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((line) => line.startsWith(`| [${name}]`))
    .split('](')[1]
    .split(')')[0]
    .split('?')[1];
const version = readFileSync('src/app/model/whats-new.ts', 'utf8').match(
  /WHATS_NEW_VERSION = '([^']+)'/
)[1];
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript((version) => {
  localStorage.setItem('whatsNewSeen', version);
  localStorage.setItem('tutorialSeen', 'true');
}, version);
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(String(error)));
const record = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
const filmDir = path.resolve(out, 'filmstrip');
assert.ok(filmDir.startsWith(out + path.sep));
const film = filmstrip(page, filmDir);
const glyph = (id) => page.locator(`[data-friction-contact="${id}"]`);
async function select(id) {
  // The pin is selected through the same service as the canvas; all edits below use native controls.
  await page.evaluate((id) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((j) => j.id === id));
  }, id);
}
async function edit(id) {
  await select(id);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const panel = page.locator('app-edit-panel app-friction-panel');
  const field = panel.getByRole('textbox', { name: 'Kinetic Coefficient', exact: true });
  if (
    (await panel.getByRole('button', { name: /^Friction/ }).getAttribute('aria-expanded')) !==
    'true'
  )
    await panel.getByRole('button', { name: /^Friction/ }).click();
  await field.waitFor();
  await panel.locator('.panel-content.settled').waitFor();
  if (await field.isDisabled()) {
    await page.getByRole('button', { name: 'return to the start', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('app-edit-panel app-friction-panel input')?.disabled
    );
  }
  return panel;
}
async function analysis() {
  await page.getByRole('button', { name: /^Force Analysis/ }).click();
  const panel = page.locator('app-analysis-panel app-friction-panel');
  if (
    (await panel.getByRole('button', { name: /^Friction/ }).getAttribute('aria-expanded')) !==
    'true'
  )
    await panel.getByRole('button', { name: /^Friction/ }).click();
  await panel.locator('.panel-content.settled').waitFor();
  return panel;
}
async function scrub(from, to, tag) {
  const rail = page.getByRole('slider', { name: 'M1 position in its cycle' });
  const box = await rail.boundingBox();
  assert.ok(box);
  const x = (fraction) => box.x + 8 + (box.width - 16) * fraction;
  await page.mouse.move(x(from), box.y + box.height / 2);
  await film.during(60, 6, tag, async () => {
    await page.mouse.down();
    await page.mouse.move(x(to), box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
  });
}
async function matchesSolvedSample(id) {
  return page.evaluate((id) => {
    const service = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const frame =
      service.mechanisms[0].getForceAnalysis('static').frames[service.currentSampleOf(0)];
    const effort = frame.friction?.get(id)?.effort;
    const drawn = document.querySelector(`[data-friction-contact="${id}"]`);
    return (
      Number.isFinite(effort) &&
      drawn &&
      Math.abs(Number(drawn.getAttribute('data-effort')) - effort) < 1e-9 &&
      service.directionOf(0) === 1
    );
  }, id);
}
try {
  await openMechanism(page, `${base}/?${payload('Slider-crank with friction')}`);
  let panel = await edit('C');
  await panel.getByRole('button', { name: 'Disable Friction', exact: true }).click();
  record(
    'Disabled friction has an explicit Off state',
    (await panel.locator('.state-chip').innerText()) === 'Off'
  );
  record(
    'Disabled friction has no contact or actuator results',
    (await panel.locator('dl').count()) === 0
  );
  await panel.getByRole('textbox', { name: 'Static Coefficient', exact: true }).fill('0.3');
  await panel.getByRole('textbox', { name: 'Kinetic Coefficient', exact: true }).fill('0.2');
  await film.during(60, 6, 'save', () =>
    panel.getByRole('button', { name: 'Save Friction Settings' }).click()
  );
  record(
    'Saving friction visibly confirms the change',
    (await panel.innerText()).includes('Friction settings saved.')
  );
  record(
    'Enabled state persists in the section header',
    (await panel.locator('.state-chip').innerText()) === 'Enabled'
  );
  record('Edit mode does not draw calculated friction overlays', (await glyph('D').count()) === 0);
  panel = await analysis();
  await glyph('D').waitFor();
  record(
    'Guide results identify sliding and the coupled normal load',
    (await panel.innerText()).includes('Sliding') && (await panel.innerText()).includes('93.75 N')
  );
  record(
    'Guide friction is shown separately from the additional input torque',
    (await panel.locator('.contact').innerText()).includes('18.75 N') &&
      (await panel.locator('.input-comparison').innerText()).includes('50 N·cm')
  );
  record(
    'Input comparison includes without, with and additional friction',
    (await panel.locator('.input-details dt').count()) === 3 &&
      (await panel.locator('.input-comparison > dl dt').count()) === 1
  );
  record(
    'Slider glyph lies along the guide and acts on its block',
    Number(await glyph('D').getAttribute('data-fx')) > 0 &&
      Math.abs(Number(await glyph('D').getAttribute('data-fy'))) < 1e-9 &&
      (await glyph('D').getAttribute('data-body')) === 'CD'
  );
  record(
    'Calculated load uses a dashed analysis arrow and friction label',
    !!(await glyph('D').locator('.friction-vector').getAttribute('stroke-dasharray')) &&
      (await glyph('D').locator('text').textContent()).includes('Friction')
  );
  await page.screenshot({ path: path.join(out, 'slider-analysis.png') });
  await page.locator('app-analysis-panel .forceModeRow .label-help').hover();
  await page.locator('.mat-mdc-tooltip').first().waitFor();
  record(
    'Force-analysis help distinguishes omitted inertia from kinetic friction',
    (await page.locator('.mat-mdc-tooltip').first().innerText()).includes('Static omits inertia') &&
      (await page.locator('.mat-mdc-tooltip').first().innerText()).includes(
        'Moving contacts use kinetic friction'
      )
  );
  await page.mouse.move(1400, 50);
  record(
    'Default results keep secondary explanations collapsed',
    !(await panel.innerText()).includes('start the whole mechanism') &&
      (await panel
        .getByRole('button', { name: 'How Friction Is Calculated' })
        .getAttribute('aria-expanded')) === 'false'
  );
  const calculation = panel.getByRole('button', { name: 'How Friction Is Calculated' });
  await calculation.focus();
  await film.during(50, 6, 'calculation-open', () => calculation.press('Enter'));
  record(
    'Expanded calculation retains reaction, direction and static-capacity explanations',
    (await panel.locator('.calculation').innerText()).includes(
      "already included in the guide's reported reaction"
    ) && (await panel.locator('.calculation').innerText()).includes('start the whole mechanism')
  );
  await page.screenshot({ path: path.join(out, 'slider-expanded.png') });
  await film.during(50, 6, 'calculation-close', () => calculation.press('Space'));
  record(
    'Keyboard collapse removes explanation from focus and preserves contact values',
    (await calculation.getAttribute('aria-expanded')) === 'false' &&
      (await panel.locator('.calculation .panel-content').evaluate((el) => el.inert)) &&
      !(await panel.innerText()).includes('start the whole mechanism') &&
      (await matchesSolvedSample('D'))
  );
  const inputDetails = panel.getByRole('button', { name: 'Input Effort Details' });
  record(
    'Input summary stays visible while the full comparison is closed',
    !(await panel.innerText()).includes('Without Friction') &&
      (await panel.locator('.input-comparison > dl').innerText()).includes('50 N')
  );
  await inputDetails.focus();
  await film.during(50, 6, 'input-details-open', () => inputDetails.press('Enter'));
  record(
    'Keyboard expansion reveals all input values without changing physics',
    (await inputDetails.getAttribute('aria-expanded')) === 'true' &&
      (await panel.innerText()).includes('Without Friction') &&
      (await matchesSolvedSample('D'))
  );
  await page.screenshot({ path: path.join(out, 'input-expanded.png') });
  await inputDetails.press('Space');
  record(
    'Focused disclosure has a visible focus indicator',
    await inputDetails.evaluate(
      (el) =>
        getComputedStyle(el).outlineStyle !== 'none' &&
        parseFloat(getComputedStyle(el).outlineWidth) > 0
    )
  );
  const initialPath = await glyph('D').locator('.friction-vector').getAttribute('d');
  await film.during(100, 10, 'motion', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  record(
    'Current-sample friction vector updates during motion',
    initialPath !== (await glyph('D').locator('.friction-vector').getAttribute('d'))
  );
  await scrub(0.1, 0.3, 'scrub-forward');
  record('Forward timeline scrubbing reads the solved sample', await matchesSolvedSample('D'));
  await scrub(0.3, 0.1, 'scrub-backward');
  record(
    'Backward timeline scrubbing does not reverse the prescribed velocity',
    await matchesSolvedSample('D')
  );
  // Return to the same pose before reversing the prescribed drive.
  await page.locator('button.stopButton').click();
  await page.waitForFunction(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isAtStartPose()
  );
  const before = Number(await glyph('D').getAttribute('data-fx'));
  await film.during(80, 6, 'reverse-guide', () =>
    page.getByRole('button', { name: 'Reverse M1', exact: true }).click()
  );
  record(
    'Reversing relative sliding reverses the contact arrow',
    before * Number(await glyph('D').getAttribute('data-fx')) < 0
  );
  await panel.getByRole('button', { name: 'Show Friction on Drawing' }).click();
  record(
    'Visibility switch hides loads without disabling the contact',
    (await glyph('D').count()) === 0 &&
      (await panel.locator('.state-chip').innerText()) === 'Enabled'
  );
  await panel.getByRole('button', { name: 'Show Friction on Drawing' }).click();
  await glyph('D').waitFor();
  panel = await edit('C');
  await panel.getByRole('button', { name: 'Disable Friction', exact: true }).click();
  await analysis();
  record('Disabling slider friction removes its canvas arrow', (await glyph('D').count()) === 0);
  const baseline = await page.evaluate(() => {
    const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0];
    const frame = mech.getForceAnalysis('static').frames[0];
    return {
      effort: frame.inputEffort.valueSI,
      friction: !!frame.friction,
      additional: !!frame.additionalFrictionEffort,
    };
  });
  record(
    'Disabling friction restores the frictionless force solution',
    !baseline.friction && !baseline.additional && Math.abs(baseline.effort) < 1e-8
  );

  await openMechanism(page, `${base}/?${payload('Pin bearing with friction')}`);
  panel = await edit('A');
  record(
    'Bearing settings show the effective radius',
    (await panel.getByRole('textbox', { name: 'Effective Radius' }).inputValue()) === '0.5'
  );
  panel = await analysis();
  await glyph('A').waitFor();
  record(
    'Bearing has a radial load and calculated resisting torque',
    (await panel.innerText()).includes('Radial Load') &&
      (await panel.innerText()).includes('-10 N·cm')
  );
  const sweep = Number(await glyph('A').getAttribute('data-sweep'));
  record(
    'Bearing is drawn as a clockwise moment rather than a linear arrow',
    sweep < 0 && (await glyph('A').getAttribute('data-kind')) === 'torque'
  );
  await page.screenshot({ path: path.join(out, 'bearing-analysis.png') });
  const size = await glyph('A').locator('.friction-vector').boundingBox();
  record(
    'Bearing arc is restrained at normal fit and stays below a 225-degree sweep',
    size.width < 120 && size.height < 120 && Math.abs(sweep) <= 1.25 * Math.PI + 1e-9
  );
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click();
  await page.screenshot({ path: path.join(out, 'bearing-zoom-out.png') });
  record(
    'Bearing numeric torque stays readable when zoomed out',
    await glyph('A').locator('text').isVisible()
  );
  await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
  await film.during(80, 6, 'reverse-bearing', () =>
    page.getByRole('button', { name: 'Reverse M1', exact: true }).click()
  );
  record(
    'Reversing the input reverses bearing friction torque',
    sweep * Number(await glyph('A').getAttribute('data-sweep')) < 0
  );
  panel = await edit('A');
  await panel.getByRole('button', { name: 'Disable Friction', exact: true }).click();
  await analysis();
  record('Disabling bearing friction removes its moment glyph', (await glyph('A').count()) === 0);

  await openMechanism(page, `${base}/?${payload('Combined slider and bearing friction')}`);
  await edit('C');
  panel = await analysis();
  record(
    'Combined friction shows one distinct glyph for each contact',
    (await page.locator('[data-friction-contact]').count()) === 2
  );
  record(
    'Combined contact panel shows the mechanism-level input comparison once',
    (await panel.locator('.input-comparison').count()) === 1
  );
  await page.screenshot({ path: path.join(out, 'combined-analysis.png') });

  await openMechanism(page, `${base}/?${payload('Reciprocating slider-crank with friction')}`);
  await edit('C');
  panel = await analysis();
  await glyph('D').waitFor();
  record(
    'Reciprocating forward playback offers an explicit rewind action',
    await page.getByRole('button', { name: 'Rewind M1 playback', exact: true }).isVisible()
  );
  await page.evaluate(() => {
    const service = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    window.frictionCycleBeforeRewind = service.mechanisms[0];
  });
  await film.during(70, 6, 'reciprocating-rewind', async () => {
    await page.getByRole('button', { name: 'Rewind M1 playback', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(180);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  record(
    'Reciprocating rewind is labeled and withholds contact loads and input comparison',
    (await page.locator('.rowNote').innerText()) === 'Rewinding' &&
      (await panel.innerText()).includes('does not reverse the prescribed drive') &&
      (await glyph('D').count()) === 0 &&
      (await panel.locator('dl').count()) === 0
  );
  await page.screenshot({ path: path.join(out, 'reciprocating-rewind.png') });
  await scrub(0.3, 0.15, 'rewind-scrub');
  record(
    'Pausing and scrubbing a rewind do not reveal misleading friction',
    (await glyph('D').count()) === 0 && (await panel.locator('dl').count()) === 0
  );
  await page.getByRole('button', { name: 'Resume M1 prescribed playback', exact: true }).click();
  record(
    'Forward playback restores the original solved samples without a display-only sign flip',
    (await matchesSolvedSample('D')) &&
      (await page.evaluate(
        () =>
          ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0] ===
          window.frictionCycleBeforeRewind
      ))
  );
  await page.screenshot({ path: path.join(out, 'reciprocating-forward.png') });
  const period = await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0].cyclePeriod
  );
  const returnLegs = new Set();
  const cycleTimes = [];
  await film.during(period * 160, 8, 'reciprocating-cycle', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(period * 80);
      const sample = await page.evaluate(() => {
        const service = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
        const frame =
          service.mechanisms[0].getForceAnalysis('static').frames[service.currentSampleOf(0)];
        const contact = frame.friction?.get('D');
        const drawn = document.querySelector('[data-friction-contact="D"]');
        return {
          seconds: service.secondsOf(0),
          sign: contact ? Math.sign(contact.relativeRate) : 0,
          agrees:
            frame.status === 'ok' && contact?.effort
              ? !!drawn &&
                Math.abs(Number(drawn.getAttribute('data-effort')) - contact.effort) < 1e-9
              : !drawn,
        };
      });
      assert.ok(sample.agrees, 'reciprocating return leg shows its own solved force or refusal');
      if (sample.sign) returnLegs.add(sample.sign);
      cycleTimes.push(sample.seconds);
    }
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  record(
    'Forward reciprocating playback reads both solved motion directions across the cycle seam',
    returnLegs.size === 2 && cycleTimes.some((time, i) => i > 0 && time < cycleTimes[i - 1])
  );

  await openMechanism(page, `${base}/?${payload('Bearing friction with inertia safeguard')}`);
  await edit('A');
  panel = await analysis();
  await film.during(80, 6, 'in-motion-refusal', () =>
    page.getByText('In-motion', { exact: true }).click()
  );
  await panel.getByText('Friction Results Unavailable', { exact: true }).waitFor();
  record(
    'In-motion diagnostic explains withheld results and the available alternative',
    (await panel.innerText()).includes('scaling issue') &&
      (await panel.innerText()).includes('Use Static analysis')
  );
  record(
    'Refused In-motion analysis draws no friction loads or plausible numeric results',
    (await page.locator('[data-friction-contact]').count()) === 0 &&
      (await panel.locator('dl').count()) === 0
  );
  await page.screenshot({ path: path.join(out, 'in-motion-unavailable.png') });
  record('No uncaught browser errors', errors.length === 0);
} finally {
  await page.screenshot({ path: path.join(out, 'last-state.png') });
  writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
