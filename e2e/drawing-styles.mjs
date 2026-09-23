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
  const forceMarks = [];
  const forceHandles = [];
  await grid((g) => g.activeObjService.updateSelectedObj(g.mechanismSrv.forces[1]));
  for (const style of ['Standard', 'Fine', 'Schematic']) {
    await styleFilm.during(80, 7, style, () => choose(style));
    check(
      `${style} changes no coordinates, dimensions, force, mass, CAD outlines or solve`,
      (await physical()) === original
    );
    const size = (selector) =>
      page.evaluate(
        (selector) =>
          [...document.querySelectorAll(selector)].map((el) => {
            const b = el.getBoundingClientRect();
            return +Math.max(b.width, b.height).toFixed(1);
          }),
        selector
      );
    forceMarks.push({ lines: await size('.forceLine'), discs: await size('.forceDisc') });
    forceHandles.push(
      await size('.forceEndpointHandle, #endForceEndpoint circle, #startForceEndpoint circle')
    );
    await page.screenshot({ path: `${OUT}/gallery-${style}.png` });
  }
  await grid((g) => g.activeObjService.updateSelectedObj(null));
  const same = (list) => list.every((one) => JSON.stringify(one) === JSON.stringify(list[0]));
  check(
    'every style draws a force at one size, Schematic narrowing only its application point',
    forceMarks[0].lines.length > 0 &&
      same(forceMarks.map((m) => m.lines)) &&
      same(forceMarks.slice(0, 2).map((m) => m.discs)) &&
      forceMarks[2].discs.every((d, i) => d < forceMarks[0].discs[i]),
    forceMarks
  );
  check(
    "a picked force's handles are the same size in every style, each a 20px target",
    forceHandles[0].length === 3 &&
      same(forceHandles) &&
      forceHandles[0].filter((w) => w >= 19.9).length === 2,
    forceHandles
  );
  const schematic = await page.evaluate(() => {
    const ink = [
      ...document.querySelectorAll(
        '#linkHolder > path:not([stroke="transparent"]), .schematicRider, .cylinder-rod'
      ),
    ];
    const barrels = [...document.querySelectorAll('.cylinder-barrel')];
    // Hollow unless driven: a driver is black (checked below).
    const blocks = [...document.querySelectorAll('.slider-block:not(.driven) > path')];
    const joints = [
      ...document.querySelectorAll(
        '#jointHolder circle[id^="joint_"], #jointHolder .slideMark, #jointHolder .weldMark'
      ),
    ];
    const gridLine = document.querySelector('.gridLineMajor, .gridLineMinor');
    const px = (el) =>
      parseFloat(getComputedStyle(el).strokeWidth) *
      (getComputedStyle(el).vectorEffect === 'non-scaling-stroke'
        ? 1
        : Math.hypot(el.getScreenCTM().a, el.getScreenCTM().b));
    // A rider's line is painted after the block it is pinned to.
    const holder = [...document.querySelectorAll('#sliderHolder > *')];
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const riderAbove = g.slotStack
      .filter((item) => item.kind === 'rider')
      .map((item) => {
        const block = document.querySelector(
          `#sliderHolder > .slider-mark[data-slider="${item.mark.id}"]`
        );
        const rider = document.getElementById(item.rider.link.id);
        return (
          !!block &&
          rider?.parentElement?.id === 'sliderHolder' &&
          holder.indexOf(rider) > holder.indexOf(block)
        );
      });
    // A plate traced in joint order crosses itself; its outside never does.
    const crosses = (d) => {
      const at = [...d.matchAll(/(-?[\d.e]+) (-?[\d.e]+)/g)].map(([, x, y]) => [+x, +y]);
      if (at.length < 4) return false;
      const side = (a, b, c) =>
        Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      const edges = at.map((p, i) => [p, at[(i + 1) % at.length]]);
      return edges.some(([a, b], i) =>
        edges.some(
          ([c, e], j) =>
            j > i + 1 &&
            (i > 0 || j < edges.length - 1) &&
            side(a, b, c) * side(a, b, e) < 0 &&
            side(c, e, a) * side(c, e, b) < 0
        )
      );
    };
    const plates = g.mechanismSrv.links.filter((l) => !l.subset?.length && l.joints.length >= 4);
    const drivers = [...document.querySelectorAll('.slider-block.driven > path')].map(
      (p) => getComputedStyle(p).fill
    );
    return {
      bodies: ink.length,
      outlined:
        barrels.every((p) => getComputedStyle(p).fill === 'none') &&
        ink.every(
          (p) =>
            getComputedStyle(p).fill === 'none' ||
            parseFloat(getComputedStyle(p).fillOpacity) <= 0.121
        ),
      // A plate's inside takes a click, so it is shaded faintly in its own color.
      shadedPlates: plates.map((l) => {
        const style = getComputedStyle(document.getElementById(l.id));
        return style.fill !== 'none' && Math.abs(parseFloat(style.fillOpacity) - 0.12) < 1e-3;
      }),
      lineWidths: [...new Set(ink.map(px))],
      barrelWidths: [...new Set(barrels.map(px))],
      plates: plates.length,
      platesCross: plates.filter((l) => crosses(g.objectDisplay.skeleton(l))).map((l) => l.id),
      drivers,
      comRadius: g.objectDisplay.comRadius() * g.svgGrid.getZoom(),
      comHit: g.objectDisplay.comHitRadius() * g.svgGrid.getZoom(),
      gridWidth: gridLine ? px(gridLine) : null,
      blocks: blocks.length,
      heads: document.querySelectorAll('.cylinder-seal').length,
      hollow: blocks.every((p) => getComputedStyle(p).fill === 'rgb(255, 255, 255)'),
      jointOutlines: joints.every((p) => getComputedStyle(p).stroke !== 'none' && px(p) <= 1.01),
      creamJoints: joints.every((p) => getComputedStyle(p).fill === 'rgb(255, 248, 225)'),
      riders: riderAbove.length,
      ridersAbove: riderAbove.every(Boolean),
      invisibleHits: [
        ...document.querySelectorAll(
          '#linkHolder path[stroke="transparent"], #sliderHolder path[stroke="transparent"]'
        ),
      ].every(
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
      schematic.heads === 0 &&
      schematic.outlined &&
      schematic.hollow &&
      schematic.invisibleHits,
    schematic
  );
  check(
    'Schematic lines are 3px, well clear of the grid lines under them',
    schematic.lineWidths.length === 1 &&
      schematic.lineWidths[0] >= 2.99 &&
      schematic.gridWidth !== null &&
      schematic.lineWidths[0] >= 2 * schematic.gridWidth,
    schematic
  );
  check(
    'Schematic draws a barrel heavier than the rod that slides in it',
    schematic.barrelWidths.length === 1 && schematic.barrelWidths[0] >= 4.49,
    schematic
  );
  check(
    'Schematic traces a four-joint plate round its outside, never as a bow tie',
    schematic.plates > 0 && schematic.platesCross.length === 0,
    schematic
  );
  check(
    'Schematic shades the clickable inside of a plate, faintly, in its own color',
    schematic.shadedPlates.length > 0 && schematic.shadedPlates.every(Boolean),
    schematic
  );
  check(
    'Schematic draws a driven slider black, like a driven pin',
    schematic.drivers.length > 0 && schematic.drivers.every((fill) => fill === 'rgb(38, 50, 56)'),
    schematic
  );
  // A picked bar keeps its own color, so a recolor shows while it is picked.
  const picked = await grid((g) => {
    const link = g.mechanismSrv.links.find((l) => !l.subset?.length && l.joints.length === 2);
    g.activeObjService.updateSelectedObj(link);
    return link.id;
  });
  await page.waitForTimeout(200);
  const recolor = async (fill) => {
    await grid(
      (g, [id, fill]) => {
        g.mechanismSrv.links.find((l) => l.id === id).fill = fill;
        ng.applyChanges(document.querySelector('app-new-grid'));
      },
      [picked, fill]
    );
    await page.waitForTimeout(150);
    return page.evaluate((id) => {
      const el = document.getElementById(id);
      return {
        stroke: getComputedStyle(el).stroke,
        bands: document.querySelectorAll('.selection-halo.picked').length,
      };
    }, picked);
  };
  const recolored = [await recolor('#0d125a'), await recolor('#26A69A')];
  check(
    'a picked schematic bar shows its new color at once, over its amber band',
    recolored[0].stroke === 'rgb(13, 18, 90)' &&
      recolored[1].stroke === 'rgb(38, 166, 154)' &&
      recolored.every((r) => r.bands === 1),
    recolored
  );
  await grid((g) => g.activeObjService.updateSelectedObj(null));
  check(
    'Schematic keeps the center-of-mass mark at least 6px, with a 12px target',
    schematic.comRadius >= 5.99 && schematic.comHit >= 11.99,
    schematic
  );
  check(
    'Schematic draws pins, slides and welds alike: cream inside a hairline outline',
    schematic.jointOutlines && schematic.creamJoints,
    schematic
  );
  check(
    'Schematic paints each rider line above the block it is pinned to',
    schematic.riders > 0 && schematic.ridersAbove,
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
      const welds = [...document.querySelectorAll('#jointHolder .weldMark')].map((weld) => {
        const ctm = weld.getScreenCTM();
        const zoom = Math.hypot(ctm.a, ctm.b);
        const style = getComputedStyle(weld);
        const stroke = style.stroke === 'none' ? 0 : parseFloat(style.strokeWidth);
        return (
          weld.getBBox().width * zoom +
          stroke * (style.vectorEffect === 'non-scaling-stroke' ? 1 : zoom)
        );
      });
      return {
        welds,
        pixels: g.settings.drawingScale * g.svgGrid.getZoom(),
        diameter: 2 * Number(pin.getAttribute('r')) * Math.hypot(m.a, m.b),
      };
    });
    check(
      `Zoom ${direction} ${count} keeps actual rendered symbols within readable limits`,
      dims.pixels >= 23.99 &&
        dims.pixels <= 38.01 &&
        dims.diameter >= 7.19 &&
        dims.diameter <= 11.41 &&
        dims.welds.length > 0 &&
        dims.welds.every((width) => width >= 4.4 && width <= 18),
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
    let initialHead;
    for (const name of ['Standard', 'Fine', 'Schematic']) {
      await choose(name);
      // Schematic draws no head at all: the part is two lines meeting at S.
      const drawn = await head();
      initialHead ??= drawn;
      check(
        `${id}: ${name} keeps piston head length and document data unchanged`,
        (await physical()) === before &&
          (name === 'Schematic'
            ? drawn.length === 0
            : JSON.stringify(drawn) === JSON.stringify(initialHead))
      );
      await page.waitForTimeout(240); // The shared segmented pill is animated.
      await page.screenshot({ path: `${OUT}/${id}-${name}.png` });
    }
    await choose('Close');
    await page.waitForTimeout(400);
    if (id === 'Hydraulic_Crosshead') {
      const clickBarrel = async () => {
        const p = await grid((g) => {
          const c = g.mechanismSrv.sealedStructures()[0];
          const at = g.svgGrid.modelToScreen({
            x: c.mountA.x + (c.seal.x - c.mountA.x) * 0.35,
            y: c.mountA.y + (c.seal.y - c.mountA.y) * 0.35,
          });
          return { x: at.x, y: at.y };
        });
        await page.mouse.click(p.x, p.y);
      };
      await clickBarrel();
      check(
        'Schematic first click selects and outlines the whole welded barrel body',
        (await grid(
          (g) => g.activeObjService.selectedLink === g.mechanismSrv.sealedStructures()[0].barrelRoot
        )) &&
          (await page.locator('.selection-halo.picked').count()) === 1 &&
          (await page.locator('.selection-halo.context').count()) === 0
      );
      await clickBarrel();
      check(
        'Schematic second click bands just the barrel, over a dashed band along its body',
        (await grid(
          (g) => g.activeObjService.selectedLink === g.mechanismSrv.sealedStructures()[0].barrel
        )) &&
          (await page.locator('.selection-halo.picked').count()) === 1 &&
          (await page.locator('.selection-halo.context').count()) === 1 &&
          (await grid((g) => {
            const c = g.mechanismSrv.sealedStructures()[0];
            const d = document.querySelector('.selection-halo.picked').getAttribute('d');
            return d === `M ${c.mountA.x} ${c.mountA.y} L ${c.seal.x} ${c.seal.y}`;
          }))
      );
      const leaf = await grid((g) => {
        const c = g.mechanismSrv.sealedStructures()[0];
        const l = c.barrelRoot.subset.find((l) => l.id !== c.barrel.id);
        const a = l.joints[0],
          b = l.joints[1];
        const at = g.svgGrid.modelToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return { id: l.id, p: { x: at.x, y: at.y } };
      });
      // Five pixels beside the line is still inside its 12px pointer target.
      await page.mouse.click(leaf.p.x + 5, leaf.p.y);
      check(
        'the thin connection still selects its ordinary primitive inside a compound',
        (await grid((g) => g.activeObjService.selectedLink?.id)) === leaf.id &&
          (await page.locator('.cylinder-barrel-selected.link-selected').count()) === 0
      );
      check(
        'a picked schematic bar keeps its own color, over an amber band a halo draws',
        await grid((g) => {
          const band = document.querySelector('.selection-halo.picked');
          // The part is drawn as one of its compound's lines.
          const line = document.getElementById(g.mechanismSrv.sealedStructures()[0].barrelRoot.id);
          const width = band && parseFloat(band.getAttribute('stroke-width')) * g.svgGrid.getZoom();
          return (
            !!band &&
            !!line &&
            getComputedStyle(band).stroke === 'rgb(255, 202, 40)' &&
            getComputedStyle(line).stroke !== 'rgb(255, 202, 40)' &&
            width > 10
          );
        })
      );
      // Schematic draws no head, so the seal is grabbed only near its own mark:
      // a click on the barrel's line just past it picks the barrel.
      await grid((g) => g.activeObjService.updateSelectedObj(null));
      const nearSeal = await grid((g) => {
        const c = g.mechanismSrv.sealedStructures()[0];
        const s = g.svgGrid.modelToScreen({ x: c.seal.x, y: c.seal.y });
        const a = g.svgGrid.modelToScreen({ x: c.mountA.x, y: c.mountA.y });
        const d = Math.hypot(a.x - s.x, a.y - s.y);
        return { x: s.x + ((a.x - s.x) * 30) / d, y: s.y + ((a.y - s.y) * 30) / d };
      });
      await page.mouse.click(nearSeal.x, nearSeal.y);
      check(
        'a click on the barrel 30px from the seal picks the barrel, not the seal',
        await grid((g) => {
          const c = g.mechanismSrv.sealedStructures()[0];
          const picked = g.activeObjService.selectedLink;
          return g.activeObjService.objType === 'Link' && [c.barrel, c.barrelRoot].includes(picked);
        })
      );
      const members = await grid((g) => {
        const mark = g.cylinderList[0];
        const zoom = g.svgGrid.getZoom();
        const r = 0.15 * g.settings.drawingScale;
        return {
          barrel: mark.barrelLine,
          rod: mark.rodLine,
          block: [...document.querySelectorAll('.schematic-drive-block')].map(
            (p) => getComputedStyle(p).fill
          ),
          heads: [
            ...document.querySelectorAll(
              '.cylinder-arrows.schematic-heads path:not(.schematic-drive-block)'
            ),
          ].map((p) => ({
            fill: getComputedStyle(p).fill,
            // Screen length along the slot, against the pin's diameter.
            along: p.getBBox().width * zoom,
            pin: 2 * r * zoom,
          })),
        };
      });
      check(
        'Schematic draws the cylinder as a line A to S and a line S to B',
        /^M -[\d.e-]+ 0 H 0$/.test(members.barrel) && /^M 0 0 H [\d.e-]+$/.test(members.rod),
        members
      );
      check(
        'a driven cylinder is a black block with two white heads, each shorter than a pin is wide',
        members.block.length === 1 &&
          members.block[0] === 'rgb(38, 50, 56)' &&
          members.heads.length === 2 &&
          members.heads.every(
            (h) => h.fill === 'rgb(255, 255, 255)' && h.along > 2 && h.along <= h.pin * 1.1
          ),
        members
      );
      await page.screenshot({ path: `${OUT}/schematic-selection.png` });
      for (const style of ['Standard', 'Fine']) {
        await settings();
        await choose(style);
        await choose('Close');
        await page.waitForTimeout(400);
        await grid((g) => g.activeObjService.updateSelectedObj(null));
        const p = await grid((g) => {
          const c = g.mechanismSrv.sealedStructures()[0];
          const l = c.barrelRoot.subset.find((l) => l.id !== c.barrel.id);
          const a = l.joints[0],
            b = l.joints[1];
          const at = g.svgGrid.modelToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          return { x: at.x, y: at.y };
        });
        await page.mouse.click(p.x, p.y);
        await page.mouse.click(p.x, p.y);
        check(
          `${style} also picks the ordinary primitive from its displayed body`,
          (await grid((g) => g.activeObjService.selectedLink?.id)) === leaf.id
        );
        check(
          `${style} outlines the part solid and its whole body dashed`,
          (await page.locator('#primitiveSelection .link-selected').count()) === 1 &&
            (await page
              .locator('#primitiveSelection .compound-context[stroke-dasharray]')
              .count()) === 1
        );
      }
      await settings();
      await choose('Schematic');
      await choose('Close');
      await page.waitForTimeout(400);
      await grid((g) => g.activeObjService.updateSelectedObj(null));
    }
    const playback = filmstrip(page, `${OUT}/${id}-play`);
    await playback.during(90, 10, 'play', () =>
      page.getByRole('button', { name: 'Play', exact: true }).click()
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const ghost = await page.evaluate(() =>
      [...document.querySelectorAll('.startGhost .ghostBody')].map(
        (p) => getComputedStyle(p).stroke
      )
    );
    check(
      `${id}: the paused start ghost is drawn, lines and all, in Schematic`,
      ghost.length > 0 && ghost.every((stroke) => stroke !== 'none'),
      ghost
    );
    const invalid = await page
      .locator('#canvas path')
      .evaluateAll((ps) => ps.filter((p) => /NaN|Infinity/.test(p.getAttribute('d') ?? '')).length);
    check(`${id}: playback draws finite geometry`, invalid === 0, invalid);
    await contactSheet(`${OUT}/${id}-play/*.png`, `${OUT}/${id}-play-film.png`, 5, 0.3);
  }

  await load('Cylinder_Boom');
  const tagsOf = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#linkTagHolder text')].map((t) => t.textContent.trim())
    );
  const renamed = await grid((g) => {
    const c = g.mechanismSrv.sealedStructures()[0];
    c.barrel.name = 'Ram barrel';
    c.rod.name = 'Ram rod';
    c.rod.mass = 5;
    g.settings.isShowCOM.next(true);
    g.mechanismSrv.updateMechanism();
    g.activeObjService.updateSelectedObj(c.rod);
    return true;
  });
  await page.waitForTimeout(300);
  const tags = await tagsOf();
  check(
    'a renamed barrel and rod each show their own name on the grid',
    renamed && tags.includes('Ram barrel') && tags.includes('Ram rod'),
    tags
  );
  const rodCoM = await grid((g) => {
    const c = g.mechanismSrv.sealedStructures()[0];
    const at = g.svgGrid.modelToScreen({ x: c.rod.CoM.x, y: c.rod.CoM.y });
    return { x: at.x, y: at.y, pose: JSON.stringify(c.rod.joints.map((j) => [j.x, j.y])) };
  });
  await page.mouse.move(rodCoM.x, rodCoM.y);
  await page.mouse.down();
  await page.mouse.move(rodCoM.x + 40, rodCoM.y + 30, { steps: 5 });
  await page.mouse.up();
  const refusal = page.getByText(
    'center of mass is computed from its shape, so it cannot be moved'
  );
  check(
    "dragging a rod's center of mass says why it cannot move, and moves nothing",
    (await refusal.count()) > 0 &&
      (await grid((g) =>
        JSON.stringify(g.mechanismSrv.sealedStructures()[0].rod.joints.map((j) => [j.x, j.y]))
      )) === rodCoM.pose
  );

  await load('4-Bar');
  // A cylinder being drawn in Schematic is what the click will place.
  const mount = await page.evaluate(() => {
    const b = document.querySelector('#joint_D').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(mount.x, mount.y);
  await page.mouse.click(mount.x, mount.y, { button: 'right' });
  await page.waitForTimeout(600);
  await page.evaluate(() =>
    [...document.querySelectorAll('#contextMenu .cm-row')]
      .find((row) => row.querySelector('.cm-row__label')?.textContent?.trim() === 'Cylinder')
      ?.click()
  );
  await page.waitForTimeout(300);
  await page.mouse.move(mount.x - 260, mount.y - 120, { steps: 10 });
  await page.waitForTimeout(250);
  const preview = await grid((g) => ({
    ...g.cylinderPreview,
    heads: document.querySelectorAll('.cylinder-preview .cylinder-seal').length,
    joints: document.querySelectorAll('.cylinder-preview .preview-joint').length,
  }));
  await page.mouse.click(mount.x - 260, mount.y - 120);
  await page.waitForTimeout(1200);
  const placed = await grid((g) => {
    const c = g.mechanismSrv.sealedStructures().at(-1);
    return {
      x: c.seal.x,
      y: c.seal.y,
      back: Math.hypot(c.mountA.x - c.seal.x, c.mountA.y - c.seal.y),
      out: Math.hypot(c.mountB.x - c.seal.x, c.mountB.y - c.seal.y),
    };
  });
  // A placed joint is rounded to six decimals, as the URL stores it.
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  check(
    'a cylinder previewed in Schematic is two lines, a seal and two pins, where it lands',
    preview.heads === 0 &&
      preview.joints === 3 &&
      near(preview.x, placed.x) &&
      near(preview.y, placed.y) &&
      near(-preview.anchor, placed.back) &&
      near(preview.reach, placed.out),
    { preview, placed }
  );
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const beforeKeyboard = await physical();
  const schematicButton = panel.getByRole('button', { name: 'Schematic', exact: true });
  await schematicButton.focus();
  await page.keyboard.press('Space');
  check(
    'keyboard activation with reduced motion changes only the view',
    (await schematicButton.getAttribute('aria-pressed')) === 'true' &&
      (await schematicButton.evaluate((b) => b === document.activeElement)) &&
      (await physical()) === beforeKeyboard
  );
  const transitions = await panel
    .locator('radio-block')
    .last()
    .evaluate((block) =>
      [...block.querySelectorAll('*')].map((el) =>
        parseFloat(getComputedStyle(el).transitionDuration)
      )
    );
  check(
    'reduced motion suppresses the style control transition',
    transitions.every((duration) => duration <= 0.00001)
  );
  await page.screenshot({ path: `${OUT}/settings-keyboard-reduced-motion.png` });
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
