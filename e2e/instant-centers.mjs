import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4301';
const dir = 'artifacts/instant-centers';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(() => {
  localStorage.setItem('tutorialSeen', 'true');
  localStorage.setItem('whatsNewSeen', '999999');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(detail)}`}`);
};
const mode = () => page.getByRole('button', { name: /^Kinematic Analysis/ });
async function expandDetails() {
  for (const name of ['Center Selection', 'IC Velocity Analysis']) {
    const control = page.getByRole('button', { name, exact: true });
    if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
  }
}
async function open(id) {
  await page.goto(`${base}/?${TEMPLATE_LINKAGES[id]}`);
  await waitForReady(page);
  const welcome = page.getByRole('button', { name: 'Start using it', exact: true });
  if (await welcome.isVisible()) await welcome.click();
  await mode().click();
  await mode().click();
  await page.getByRole('button', { name: 'Instant Centers' }).waitFor();
}
try {
  await open('4-Bar');
  check(
    'preview starts collapsed and canvas overlay is off',
    (await page.locator('.icMarker').count()) === 0 &&
      (await page.getByRole('table', { name: 'Instant center locations' }).count()) === 0
  );
  const fold = page.getByRole('button', { name: 'Instant Centers' });
  await fold.focus();
  const opening = filmstrip(page, `${dir}/opening`);
  await opening.during(35, 8, 'open', () => page.keyboard.press('Enter'));
  check(
    'selection and velocity sections start collapsed',
    (await page
      .getByRole('button', { name: 'Center Selection', exact: true })
      .getAttribute('aria-expanded')) === 'false' &&
      (await page
        .getByRole('button', { name: 'IC Velocity Analysis', exact: true })
        .getAttribute('aria-expanded')) === 'false'
  );
  await expandDetails();
  await page.getByRole('table', { name: 'Instant center locations' }).waitFor();
  check(
    'six four-bar centers are listed',
    (await page.locator('table[aria-label="Instant center locations"] tbody tr').count()) === 6
  );
  await page.getByRole('switch', { name: 'Show Instant Centers' }).click();
  check('all six finite centers appear', (await page.locator('.icMarker').count()) === 6);
  const construction = () => page.getByRole('switch', { name: 'Show Construction Lines' });
  check('construction lines start off', (await page.locator('.icConstruction').count()) === 0);
  await construction().focus();
  await page.keyboard.press('Space');
  check('four Kennedy lines appear', (await page.locator('.icConstruction').count()) === 4);
  const linePaths = () =>
    page
      .locator('.icConstruction')
      .evaluateAll((nodes) =>
        nodes.map((n) => ['x1', 'y1', 'x2', 'y2'].map((attr) => Number(n.getAttribute(attr))))
      );
  const linesBefore = await linePaths();
  const comparison = await page
    .getByRole('table', { name: 'Velocity method comparison', exact: true })
    .innerText();
  check(
    'independent velocity comparison is available',
    !comparison.includes('Unavailable') && comparison.includes('Instant centers'),
    comparison
  );
  await page.getByRole('button', { name: 'Center Selection', exact: true }).click();
  const calculation = page.getByRole('button', {
    name: 'M1 Body BC · IC Calculation',
    exact: true,
  });
  const workedFilm = filmstrip(page, `${dir}/worked-opening`);
  await workedFilm.during(50, 8, 'worked', () => calculation.click());
  await page.locator('app-instant-center-body .apexcharts-svg').waitFor();
  check(
    'worked calculation shows the numeric velocity equations',
    (await page.locator('app-instant-center-body').innerText()).includes('vₓ = −ω rᵧ')
  );
  const curves = await page
    .locator('app-instant-center-body')
    .evaluate((host) => ng.getComponent(host).plot());
  check(
    'independent angular velocity curves agree for the four-bar',
    curves.length === 2 &&
      curves[0].data.every(
        (point, i) =>
          point.y === null ||
          curves[1].data[i].y === null ||
          Math.abs(point.y - curves[1].data[i].y) < 1e-5
      )
  );
  await page.getByRole('button', { name: 'CoM Speed', exact: true }).click();
  const comCurves = await page
    .locator('app-instant-center-body')
    .evaluate((host) => ng.getComponent(host).plot());
  check(
    'CoM speed is plotted by both methods',
    comCurves[1].data.some((point) => point.y > 0) &&
      comCurves[0].data.every(
        (point, i) =>
          point.y === null ||
          comCurves[1].data[i].y === null ||
          Math.abs(point.y - comCurves[1].data[i].y) < 1e-5
      )
  );
  await page.screenshot({ path: `${dir}/worked-velocity.png` });
  await calculation.click();
  check(
    'closing the calculation removes its chart',
    (await page.locator('app-instant-center-body').count()) === 0
  );
  await page.getByRole('button', { name: 'M1 Joint Velocities', exact: true }).click();
  check(
    'joint velocity comparison is available',
    await page.getByRole('table', { name: 'Joint velocity method comparison' }).isVisible()
  );
  await page.getByRole('button', { name: 'M1 Joint Velocities', exact: true }).click();
  await expandDetails();
  const before = await page
    .locator('.icMarker')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('transform')));
  const motion = filmstrip(page, `${dir}/motion`);
  await motion.during(100, 10, 'playing', () =>
    page.getByRole('button', { name: 'Play', exact: true }).click()
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await waitForReady(page);
  const after = await page
    .locator('.icMarker')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('transform')));
  const linesAfter = await linePaths();
  check(
    'construction lines follow playback',
    JSON.stringify(linesBefore) !== JSON.stringify(linesAfter)
  );
  check('line endpoints stay finite', linesAfter.flat().every(Number.isFinite));
  const incidence = await page.evaluate(() => {
    const overlay = ng.getComponent(document.querySelector('[appInstantCenterOverlay]'));
    const geometry = overlay.ic.displayed()[0].geometry;
    const centers = new Map(geometry.centers.map((c) => [c.id, c]));
    return [...document.querySelectorAll('.icConstruction')].flatMap((line) => {
      const x = (Number(line.getAttribute('x1')) - geometry.origin[0]) / geometry.scale;
      const y = (Number(line.getAttribute('y1')) - geometry.origin[1]) / geometry.scale;
      const dx =
        (Number(line.getAttribute('x2')) - Number(line.getAttribute('x1'))) / geometry.scale;
      const dy =
        (Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'))) / geometry.scale;
      const sources = JSON.parse(line.getAttribute('data-sources'));
      const targets = geometry.centers.filter((c) =>
        c.construction?.some((pair) => pair.every((id) => sources.includes(id)))
      );
      return [...sources.map((id) => centers.get(id)), ...targets].map((center) => {
        const [px, py, w] = center.point;
        return Math.abs(dy * (px - x * w) - dx * (py - y * w)) / Math.hypot(dx, dy);
      });
    });
  });
  check(
    'drawn lines pass through their source and constructed centers',
    incidence.length > 0 && incidence.every((error) => error < 1e-7),
    incidence
  );
  check('centers follow playback', JSON.stringify(before) !== JSON.stringify(after));
  check(
    'no invalid SVG coordinates',
    after.every((value) => value && !/NaN|Infinity/.test(value)),
    after
  );
  await page.screenshot({ path: `${dir}/desktop.png` });
  const choose = (name) => page.getByRole('button', { name, exact: true });
  await choose('Clear Selection').click();
  check(
    'clearing selection hides markers and construction lines',
    (await page.locator('.icMarker, .icConstruction').count()) === 0
  );
  await choose('Show M1 I(0, AB)').click();
  check(
    'a primary center can be shown alone without construction lines',
    (await page.locator('.icMarker').count()) === 1 &&
      (await page.locator('.icConstruction').count()) === 0
  );
  await choose('Clear Selection').click();
  const secondary = choose('Show M1 I(0, BC)');
  await secondary.focus();
  await page.keyboard.press('Space');
  check(
    'a secondary center brings only its two construction lines',
    (await page.locator('.icMarker').count()) === 1 &&
      (await page.locator('.icConstruction').count()) === 2
  );
  const selectionFilm = filmstrip(page, `${dir}/selection-motion`);
  await selectionFilm.during(100, 6, 'selected', () => choose('Play').click());
  await choose('Pause').click();
  await waitForReady(page);
  check(
    'selection survives animation with hidden source markers',
    (await page.locator('.icMarker').count()) === 1 &&
      (await secondary.getAttribute('aria-pressed')) === 'true'
  );
  await page.screenshot({ path: `${dir}/selected.png` });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  check('overlay stays out of Edit mode', (await page.locator('.icMarker').count()) === 0);
  check(
    'construction stays out of Edit mode',
    (await page.locator('.icConstruction').count()) === 0
  );
  await mode().click();
  await mode().click();
  await page.getByRole('button', { name: 'Instant Centers' }).click();
  await expandDetails();
  check(
    'per-center selection survives reopening the setup',
    (await page.locator('.icMarker').count()) === 1 &&
      (await secondary.getAttribute('aria-pressed')) === 'true'
  );
  await choose('Select All').click();
  check(
    'Select All restores the complete overlay',
    (await page.locator('.icMarker').count()) === 6
  );
  check(
    'overlay preference survives reopening setup',
    await page.getByRole('switch', { name: 'Show Instant Centers' }).isChecked()
  );
  await page.getByRole('switch', { name: 'Show Instant Centers' }).click();
  check('overlay can be removed', (await page.locator('.icMarker').count()) === 0);
  check(
    'construction toggle survives reopening and is independent of points',
    (await construction().isChecked()) && (await page.locator('.icConstruction').count()) > 0
  );
  await construction().click();
  check('construction lines can be removed', (await page.locator('.icConstruction').count()) === 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitForReady(page);
  await page.screenshot({ path: `${dir}/phone.png` });
  check(
    'phone layout has no page overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  );
  check(
    'phone switch remains usable',
    await page.getByRole('switch', { name: 'Show Instant Centers' }).isVisible()
  );
  await page.getByRole('switch', { name: 'Show Instant Centers' }).click();
  await construction().click();
  check('construction toggle works on phone', (await page.locator('.icConstruction').count()) > 0);
  check('overlay works with reduced motion', (await page.locator('.icMarker').count()) > 0);
  await choose('Clear Selection').click();
  await choose('Show M1 I(0, AB)').click();
  check('phone selection keeps one center', (await page.locator('.icMarker').count()) === 1);
  await page.screenshot({ path: `${dir}/phone-selected.png` });
  await page.getByRole('button', { name: 'Center Selection', exact: true }).click();
  await calculation.click();
  await page.locator('app-instant-center-body .apexcharts-svg').waitFor();
  await page.getByRole('button', { name: 'CoM Speed', exact: true }).click();
  const phoneChart = await page.locator('app-instant-center-body .apexcharts-svg').boundingBox();
  check(
    'phone velocity graph fits the window',
    phoneChart && phoneChart.x >= 0 && phoneChart.x + phoneChart.width <= 390
  );
  await page.screenshot({ path: `${dir}/phone-worked.png` });
  await calculation.click();

  await page.setViewportSize({ width: 1500, height: 950 });
  await open('Slider_Crank');
  await page.getByRole('button', { name: 'Instant Centers' }).click();
  await expandDetails();
  await construction().click();
  check(
    'slider construction lines remain finite',
    (await linePaths()).length > 0 && (await linePaths()).flat().every(Number.isFinite)
  );
  check(
    'slider centers at infinity are explicit',
    (await page.locator('app-instant-centers').innerText()).includes('At infinity')
  );
  await page.screenshot({ path: `${dir}/slider.png` });
  await open('Three_Machines');
  await page.getByRole('button', { name: 'Instant Centers' }).click();
  await expandDetails();
  check(
    'each machine has its own comparison',
    (await page.getByRole('table', { name: 'Velocity method comparison', exact: true }).count()) ===
      3
  );
  await page.getByRole('switch', { name: 'Show Instant Centers' }).click();
  const firstMachineCount = await page.locator('.icMarker[data-machine="M1"]').count();
  const secondMachineCount = await page.locator('.icMarker[data-machine="M2"]').count();
  await page
    .getByRole('button', { name: /^Show M2 I\(/ })
    .first()
    .click();
  check(
    'hiding a center affects only its own machine',
    (await page.locator('.icMarker[data-machine="M1"]').count()) === firstMachineCount &&
      (await page.locator('.icMarker[data-machine="M2"]').count()) === secondMachineCount - 1
  );
  const independent = await page.evaluate(() => {
    const service = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    service.setSyncMechanisms(false);
    service.seekMechanism(1, service.mechanisms[1].timeNum[20]);
    const panel = ng.getComponent(document.querySelector('app-instant-centers'));
    return panel.comparisons().map((comparison) => comparison.step);
  });
  check(
    'comparison follows each machine clock',
    independent[0] === 0 && independent[1] === 20 && independent[2] === 0,
    independent
  );
  await page.screenshot({ path: `${dir}/multiple.png` });
  check('no runtime errors', errors.length === 0, errors);
} catch (error) {
  check('UI workflow completes', false, String(error));
  await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
} finally {
  writeFileSync(`${dir}/report.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
await contactSheet(`${dir}/opening/*.png`, `${dir}/opening-sheet.png`, 4);
await contactSheet(`${dir}/motion/*.png`, `${dir}/motion-sheet.png`, 4);
if (results.some((result) => !result.ok)) process.exitCode = 1;
