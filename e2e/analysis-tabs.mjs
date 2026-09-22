/** Panel tabs: keyboard navigation, independent graphs, CoM preview, and compact layout. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/analysis-tabs';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}
const tab = (name) => page.getByRole('tab', { name, exact: true });
const rows = page.locator('app-analysis-panel .graphHeader');
const panel = page.locator('#analysis-panel #normalPanel');
const shot = (name) => panel.screenshot({ path: `${OUT}/${name}.png` });
const geometry = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv.joints.map(({ id, x, y }) => ({ id, x, y }));
  });
const jointPoint = (id) =>
  page
    .locator('#jointHolder > svg')
    .filter({ has: page.locator(`#joint_${id}`) })
    .evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
const expansion = () =>
  rows.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-expanded')));
const names = () => page.locator('app-analysis-panel .graphTitle').allTextContents();
const cleanNames = async () =>
  (await names()).map((name) => name.replace('help_outline', '').trim());

try {
  await openMechanism(page, `${BASE}/?${payloads['4-Bar']}`);
  await page.locator('#linkHolder path').nth(1).click({ force: true });
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page.locator('.apexcharts-canvas').waitFor();
  check(
    'Rotation is the default and opens Angle only',
    (await tab('Rotation').getAttribute('aria-selected')) === 'true' &&
      JSON.stringify(await expansion()) === '["true","false","false"]',
    await expansion()
  );
  check(
    'Rotation has three ordinary graph rows and no drawing chips',
    (await cleanNames()).join('|') === 'Angle|Angular velocity|Angular acceleration' &&
      (await page.locator('.drawingChips').count()) === 0
  );
  await shot('rotation');
  const before = await geometry();
  await tab('Rotation').press('ArrowRight');
  check(
    'Right selects and focuses Center of mass without nudging the drawing',
    (await tab('Center of mass').evaluate(
      (node) => node === document.activeElement && node.getAttribute('aria-selected') === 'true'
    )) && JSON.stringify(await geometry()) === JSON.stringify(before)
  );
  check(
    'Center of mass opens Position and names its three quantities',
    (await cleanNames()).join('|') === 'Position|Velocity|Acceleration' &&
      JSON.stringify(await expansion()) === '["true","false","false"]'
  );
  check(
    'CoM drawing controls offer only Path, Velocity and Acceleration',
    (await page.locator('.drawingChips .viewButtonLabel').allTextContents())
      .map((name) => name.trim())
      .join('|') === 'Path|Velocity|Acceleration'
  );
  // Read the same mark predicate the SVG uses, including a massless authored link.
  const preview = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const link = grid.activeObjService.graphLink;
    return { mass: link.mass, shown: grid.showsCoM(link), id: link.id };
  });
  check(
    'the active CoM tab shows its mark even at zero mass',
    preview.mass === 0 && preview.shown,
    preview
  );
  await rows.nth(0).click();
  await rows.nth(1).click();
  await tab('Center of mass').press('Home');
  check('Home returns to Rotation and preserves its open graph', (await expansion())[0] === 'true');
  await rows.nth(0).click();
  const film = filmstrip(page, `${OUT}/switch-film`, { x: 0, y: 40, width: 445, height: 720 });
  await film.during(75, 8, 'tabs', async () => {
    await tab('Rotation').press('End');
    await page.waitForTimeout(180);
    await tab('Center of mass').press('ArrowRight');
    await page.waitForTimeout(180);
    await tab('Rotation').press('ArrowLeft');
  });
  check(
    'CoM remembers its expanded Velocity and collapsed Position',
    JSON.stringify(await expansion()) === '["false","true","false"]',
    await expansion()
  );
  await tab('Center of mass').press('Home');
  check('Rotation remembers its collapsed Angle', (await expansion())[0] === 'false');
  await tab('Rotation').press('End');
  await shot('center-of-mass');
  await contactSheet(`${OUT}/switch-film/*-tabs.png`, `${OUT}/switch-film.png`, 4);
  const layout = await panel.evaluate((host) => {
    const rect = host.getBoundingClientRect();
    const edges = [
      ...host.querySelectorAll('.panelTitleText, .graphTitle, .drawingSwitchesHead, .drawingChips'),
    ].map((node) => node.getBoundingClientRect().left - rect.left);
    const sections = [...host.querySelectorAll('.graphSection')];
    return {
      edges,
      fonts: [...host.querySelectorAll('.graphHeader')].map(
        (node) => getComputedStyle(node).fontSize
      ),
      borders: sections.map((node) => getComputedStyle(node).borderTopWidth),
      tabHeight: host.querySelector('[role=tab]').getBoundingClientRect().height,
      tabEdge: host.querySelector('[role=tablist]').getBoundingClientRect().left - rect.left,
      subtitle: !!host.querySelector('.panelSub'),
    };
  });
  check(
    'content aligns at 15px and the tab rule at 9px',
    layout.edges.every((edge) => Math.abs(edge - 15) < 1) && Math.abs(layout.tabEdge - 9) < 1,
    layout
  );
  check(
    'graph rows keep the shared typography and rules between rows',
    layout.fonts.every((size) => size === '13.5px') &&
      layout.borders.join('|') === '0px|1px|1px' &&
      layout.tabHeight === 40 &&
      !layout.subtitle,
    layout
  );
  const semantics = await panel.evaluate((host) =>
    [...host.querySelectorAll('[role=tab]')].every((node) => {
      const target = document.getElementById(node.getAttribute('aria-controls'));
      return (
        target?.getAttribute('aria-labelledby') === node.id &&
        target.hidden === (node.getAttribute('aria-selected') !== 'true')
      );
    })
  );
  check('every tab labels an existing panel with the matching visibility', semantics);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#linkHolder path').nth(0).click({ force: true });
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  check(
    'selected kinematics tab survives changing the selected link and mode',
    (await tab('Center of mass').getAttribute('aria-selected')) === 'true'
  );
  await tab('Center of mass').press('Home');
  await page.mouse.move(600, 100);
  const cleared = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return !grid.showsCoM(grid.activeObjService.graphLink);
  });
  check('CoM preview clears on leaving its tab', cleared);
  await tab('Rotation').press('End');
  const at = await jointPoint('B');
  const dragFilm = filmstrip(page, `${OUT}/tuning-film`, { x: 0, y: 40, width: 600, height: 720 });
  let during;
  await dragFilm.during(65, 10, 'drag', async () => {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 25, at.y - 20, { steps: 6 });
    during = await page.locator('app-analysis-panel').evaluate((host) => {
      const p = ng.getComponent(host);
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      return {
        title: p.panelTitle,
        tuning: p.tuning,
        mark: g.showsCoM(p.shownLink),
        chip: host.querySelector('.tuningChip')?.textContent,
      };
    });
    await page.mouse.up();
  });
  check(
    'tuning another part keeps the CoM mark and title on the graphed link',
    during.title === 'Kinematics for Link AB' &&
      during.tuning &&
      during.mark &&
      during.chip.includes('Joint B'),
    during
  );
  check(
    'comparison is available in the compact title row after tuning',
    await page.locator('.panelTitle .compareToggle').isVisible()
  );
  await shot('comparison');
  await contactSheet(`${OUT}/tuning-film/*-drag.png`, `${OUT}/tuning-film.png`, 5);

  await page.setViewportSize({ width: 390, height: 844 });
  const expand = page.getByRole('button', { name: 'Expand the panel', exact: true });
  await expand.waitFor({ state: 'visible' });
  await expand.click();
  await tab('Center of mass').click();
  await page.locator('.drawingChips').scrollIntoViewIfNeeded();
  const narrow = await panel.evaluate((host) => {
    const head = host.querySelector('.panelHead').getBoundingClientRect();
    const strip = host.querySelector('[role=tablist]').getBoundingClientRect();
    return {
      overflow: host.scrollWidth > host.clientWidth + 1,
      pinned:
        Math.abs(
          head.top -
            host.getBoundingClientRect().top -
            parseFloat(getComputedStyle(host).borderTopWidth)
        ) < 2,
      tabsVisible: strip.bottom <= host.getBoundingClientRect().bottom,
      labelsFit: [...host.querySelectorAll('.viewButtonLabel')].every(
        (node) => node.clientWidth >= node.scrollWidth
      ),
    };
  });
  check(
    'narrow panel keeps its title/tabs pinned and all chip labels readable',
    !narrow.overflow && narrow.pinned && narrow.tabsVisible && narrow.labelsFit,
    narrow
  );
  await shot('narrow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tab('Center of mass').press('Home');
  check(
    'reduced motion still switches immediately',
    (await tab('Rotation').getAttribute('aria-selected')) === 'true'
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  await openMechanism(page, `${BASE}/?${payloads['Punch_Press']}`);
  await page.locator('#linkHolder path#AB').click({ force: true });
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await tab('Static').waitFor();
  await page.locator('.apexcharts-canvas').waitFor();
  const staticReadout = await page.locator('app-analysis-panel .graphValue').allTextContents();
  await rows.first().click();
  await tab('In-motion').click();
  await page.locator('.apexcharts-canvas').waitFor();
  check(
    'force tabs switch the solver mode and retain separate expansion choices',
    (await page
      .locator('app-analysis-panel')
      .evaluate((host) => ng.getComponent(host).forceAnalysisMode() === 'dynamic')) &&
      (await expansion())[0] === 'true'
  );
  check(
    'In-motion updates the displayed force data',
    JSON.stringify(await page.locator('app-analysis-panel .graphValue').allTextContents()) !==
      JSON.stringify(staticReadout)
  );
  await shot('forces');
  await tab('Static').click();
  check('Static restores its collapsed graph', (await expansion())[0] === 'false');
  check(
    'force panels retain four drawing controls',
    (await page.locator('.drawingChips app-view-button').count()) === 4
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const pin = await jointPoint('B');
  await page.mouse.move(pin.x, pin.y);
  await page.mouse.click(pin.x, pin.y);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  check(
    'joint Forces use the same shared Static/In-motion tabs',
    (await tab('Static').isVisible()) && (await tab('In-motion').isVisible())
  );
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  check(
    'joint kinematics remain one group, with no tab strip',
    (await page.locator('app-analysis-panel [role=tablist]').count()) === 0 &&
      (await rows.count()) === 3
  );
  check('no browser exceptions', errors.length === 0, errors);
} finally {
  await context.close();
  await browser.close();
}
console.log(`${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
