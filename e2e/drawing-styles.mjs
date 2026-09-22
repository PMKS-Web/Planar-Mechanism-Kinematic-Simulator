/** Whole-drawing styles, zoom bounds, and separation from authored geometry. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { openMechanism } from './app-ready.mjs';
import { ALL_LINKAGES as payloads } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/drawing-styles';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const check = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`, ok ? '' : detail);
};
const grid = (fn, arg) =>
  page.evaluate(
    ({ source, arg }) =>
      new Function('g', 'arg', `return (${source})(g,arg)`)(
        ng.getComponent(document.querySelector('app-new-grid')),
        arg
      ),
    { source: fn.toString(), arg }
  );
const load = async (id) => {
  if (!payloads[id]) throw new Error(`Missing fixture: ${id}`);
  await openMechanism(page, `${BASE}/?${payloads[id]}`);
};
const settings = async () => {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
  await page.getByRole('button', { name: 'Standard', exact: true }).waitFor();
};
const choose = (name) => page.getByRole('button', { name, exact: true }).click();
const physical = () =>
  grid((g) =>
    JSON.stringify({
      scale: g.settings.objectScale,
      cylinders: g.settings.constructor.cylinderObjectScale,
      points: g.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]),
      links: g.mechanismSrv.links.map((l) => [
        l.id,
        l.mass,
        l.massMoI,
        l.CoM?.x,
        l.CoM?.y,
        l.d,
        l.outlineLoops?.(),
      ]),
      forces: g.mechanismSrv.forces.map((f) => [
        f.mag,
        f.angleRad,
        f.local,
        f.arrowOutward,
        f.startCoord.x,
        f.startCoord.y,
        f.endCoord.x,
        f.endCoord.y,
      ]),
      solve: g.mechanismSrv.solveRevision,
    })
  );

try {
  await load('Dev_Object_Gallery');
  await settings();
  const panel = page.locator('app-settings-panel');
  check(
    'one drawing control replaces all four size/appearance controls',
    (await panel.getByRole('button', { name: /^(Standard|Fine|Schematic)$/ }).count()) === 3 &&
      !/Custom Object Size|Auto-size Objects|Link Appearance|Compact/.test(await panel.innerText())
  );
  const original = await physical();
  const styleFilm = filmstrip(page, `${OUT}/style-switch`);
  for (const style of ['Standard', 'Fine', 'Schematic']) {
    await styleFilm.during(80, 7, style, () => choose(style));
    check(
      `${style} changes no coordinates, dimensions, force, mass, CAD outlines or solve`,
      (await physical()) === original
    );
    await page.screenshot({ path: `${OUT}/gallery-${style}.png` });
  }
  const schematic = await page.evaluate(() => {
    const ink = [
      ...document.querySelectorAll(
        '#linkHolder > path:not([stroke="transparent"]), .cylinder-barrel, .cylinder-rod'
      ),
    ];
    const blocks = [...document.querySelectorAll('.slider-block > path,.cylinder-seal')];
    const joints = [...document.querySelectorAll('#jointHolder circle[id^="joint_"]')];
    return {
      bodies: ink.length,
      outlined: ink.every((p) => getComputedStyle(p).fill === 'none'),
      blocks: blocks.length,
      hollow: blocks.every((p) => getComputedStyle(p).fill === 'rgb(255, 255, 255)'),
      jointOutlines: joints.every((p) => getComputedStyle(p).stroke !== 'none'),
      invisibleHits: [...document.querySelectorAll('#linkHolder path[stroke="transparent"]')].every(
        (p) =>
          parseFloat(p.getAttribute('stroke-width')) *
            Math.hypot(p.getScreenCTM().a, p.getScreenCTM().b) >=
          11.9
      ),
    };
  });
  check(
    'Schematic simplifies every body, cylinder and slider while preserving wide hit targets',
    schematic.bodies > 10 &&
      schematic.blocks > 0 &&
      schematic.outlined &&
      schematic.hollow &&
      schematic.jointOutlines &&
      schematic.invisibleHits,
    schematic
  );
  await choose('Close');
  const zoomFilm = filmstrip(page, `${OUT}/zoom`);
  await page.waitForTimeout(400); // Let the drawer finish changing the free canvas.
  for (const [direction, count] of [
    ['Out', 6],
    ['In', 8],
    ['In', 5],
    ['Out', 5],
  ]) {
    await zoomFilm.during(70, 10, `zoom-${direction}-${count}`, async () => {
      for (let n = 0; n < count; n++) await choose(`Zoom ${direction}`);
    });
    const dims = await page.evaluate(() => {
      const g = ng.getComponent(document.querySelector('app-new-grid'));
      const pin = document.querySelector('#jointHolder circle[id^="joint_"]');
      const m = pin.getScreenCTM();
      return {
        pixels: g.settings.drawingScale * g.svgGrid.getZoom(),
        diameter: 2 * Number(pin.getAttribute('r')) * Math.hypot(m.a, m.b),
      };
    });
    check(
      `Zoom ${direction} ${count} keeps actual rendered symbols within readable limits`,
      dims.pixels >= 19.99 &&
        dims.pixels <= 32.01 &&
        dims.diameter >= 5.99 &&
        dims.diameter <= 9.61,
      dims
    );
    check(
      `Zoom ${direction} ${count} leaves geometry and solver untouched`,
      (await physical()) === original
    );
  }

  for (const id of [
    'Hydraulic_Crosshead',
    'Offset_Mount_Hatch',
    'Slotted_Tool_Drive',
    'Flywheel_Engine',
  ]) {
    await load(id);
    check(
      `${id} inherits the locally chosen style`,
      (await grid((g) => g.settings.drawingStyle.value)) === 'schematic'
    );
    await settings();
    const before = await physical();
    const head = () =>
      page
        .locator('.cylinder-seal')
        .evaluateAll((ps) => ps.map((p) => ({ x: p.getBBox().x, width: p.getBBox().width })));
    const initialHead = await head();
    for (const name of ['Standard', 'Fine', 'Schematic']) {
      await choose(name);
      check(
        `${id}: ${name} keeps piston head length and document data unchanged`,
        (await physical()) === before &&
          JSON.stringify(await head()) === JSON.stringify(initialHead)
      );
      await page.waitForTimeout(240); // The shared segmented pill is animated.
      await page.screenshot({ path: `${OUT}/${id}-${name}.png` });
    }
    await choose('Close');
    const playback = filmstrip(page, `${OUT}/${id}-play`);
    await playback.during(90, 10, 'play', () =>
      page.getByRole('button', { name: 'Play', exact: true }).click()
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const invalid = await page
      .locator('#canvas path')
      .evaluateAll((ps) => ps.filter((p) => /NaN|Infinity/.test(p.getAttribute('d') ?? '')).length);
    check(`${id}: playback draws finite geometry`, invalid === 0, invalid);
    await contactSheet(`${OUT}/${id}-play/*.png`, `${OUT}/${id}-play-film.png`, 5, 0.3);
  }

  await load('4-Bar');
  await settings();
  for (const width of [1280, 850, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await choose('Fine');
    const fit = await panel
      .getByRole('button', { name: 'Schematic', exact: true })
      .evaluate((el) => {
        const b = el.getBoundingClientRect();
        return b.left >= 0 && b.right <= innerWidth && b.height >= 28;
      });
    check(`Drawing Style fits at ${width}px without extra gutters or clipped choices`, fit);
    await page.screenshot({ path: `${OUT}/settings-${width}.png` });
  }
  check('no browser errors', errors.length === 0, errors);
  await contactSheet(`${OUT}/style-switch/*.png`, `${OUT}/styles-film.png`, 7, 0.3);
  await contactSheet(`${OUT}/zoom/*.png`, `${OUT}/zoom-film.png`, 8, 0.25);
} catch (error) {
  check('suite completion', false, String(error));
  await page.screenshot({ path: `${OUT}/failure.png` });
} finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
if (results.some((r) => !r.ok)) process.exitCode = 1;
