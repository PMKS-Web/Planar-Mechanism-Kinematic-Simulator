/** Regression coverage for the interaction audit, findings 1–26. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/bug-fixes-2';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const results = [];
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
page.on('console', async (m) => {
  if (m.type() === 'error') errors.push(m.text());
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
  await openMechanism(page, `${BASE}/?${payloads[id] ?? id}`);
};
const field = (name) => page.getByRole('textbox', { name, exact: true });
const enter = async (name, value) => {
  await field(name).fill(value);
  await field(name).press('Tab');
};
const settings = async () => {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
};
try {
  await load('4-Bar');
  await settings();
  await page.getByRole('button', { name: 'Radian', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
  await page.getByRole('button', { name: /Motion — 3 positions/ }).click();
  for (const [n, v] of [
    ['Position 1 X', '2'],
    ['Position 1 Y', '1'],
    ['Position 1 angle', '1.57 rad'],
  ])
    await enter(n, v);
  const angle = await grid((g) => g.synthesisBuilder.getAllPoses()[0]?.thetaDegrees).catch(() =>
    page.evaluate(
      () =>
        ng.getComponent(document.querySelector('app-synthesis-panel')).design.getAllPoses()[0]
          ?.thetaDegrees
    )
  );
  check(
    'synthesis converts radian input to the intended pose',
    Math.abs(angle - 89.954) < 0.1,
    angle
  );
  check(
    'synthesis Undo is enabled',
    await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled()
  );
  await page.getByRole('switch', { name: 'Ground pins inside a region', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await settings();
  const unitsFilm = filmstrip(page, `${OUT}/units`);
  await unitsFilm.during(80, 10, 'si', () =>
    page.getByRole('button', { name: 'SI (m)', exact: true }).click()
  );
  const scale = await grid((g) => g.settings.objectScale);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
  await enter('Region X', '-0.02');
  check(
    'region edits preserve sub-unit dimensions',
    parseFloat(await field('Region width').inputValue()) < 0.1,
    await field('Region width').inputValue()
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check(
    'Undo preserves converted Object Size',
    Math.abs((await grid((g) => g.settings.objectScale)) - scale) < 1e-6,
    { scale, after: await grid((g) => g.settings.objectScale) }
  );
  await page.screenshot({ path: `${OUT}/synthesis-si.png` });
  await load('4-Bar');
  errors.length = 0;
  // Actual context-menu action, including Angular's subsequent verification pass.
  await grid((g) => {
    const j = g.mechanismSrv.joints.find((j) => j.id === 'B');
    g.mechanismSrv.toggleVectorTrace(j, 'velocity');
    g.setLastRightClick(j);
    g.updateContextMenuItems();
    const row = g.cMenu.groups.flatMap((x) => x.rows).find((x) => x.label === 'Delete Joint');
    row.action();
  });
  await page.waitForTimeout(300);
  check(
    'deleting a joint raises no Angular change-detection error',
    !errors.some((e) => e?.includes('NG0100')),
    errors
  );
  // Physical cylinder dimensions and solved samples survive every display-only route.
  const geometry = () =>
    grid((g) => ({
      cylinders: g.mechanismSrv.sealedStructures().map((c) => ({
        barrel: Math.hypot(c.inner.x - c.mountA.x, c.inner.y - c.mountA.y),
        rod: Math.hypot(c.mountB.x - c.seal.x, c.mountB.y - c.seal.y),
        start: c.start,
      })),
      points: g.mechanismSrv.joints.map((j) => [j.x, j.y]),
      physical: g.settings.constructor.cylinderObjectScale,
      visual: g.settings.objectScale,
      frames: g.mechanismSrv.mechanisms.map((m) => m.joints.length),
      samples: g.mechanismSrv.mechanisms.map((m) =>
        m.joints.filter((_, i) => i % 25 === 0).map((js) => js.map((j) => [j.x, j.y]))
      ),
      masses: g.mechanismSrv.links.map((l) => [l.mass, l.massMoI]),
    }));
  const same = (a, b, scale = 1) => {
    const near = (x, y) => Math.abs(x * scale - y) < 0.015;
    return (
      a.cylinders.every(
        (c, i) =>
          near(c.barrel, b.cylinders[i].barrel) &&
          near(c.rod, b.cylinders[i].rod) &&
          Math.abs(c.start - b.cylinders[i].start) < 0.002
      ) &&
      a.points.every((p, i) => p.every((v, j) => near(v, b.points[i][j]))) &&
      near(a.physical, b.physical)
    );
  };
  for (const id of ['Hydraulic_Crosshead', 'Offset_Mount_Hatch', 'Cylinder_Boom']) {
    await load(id);
    await grid((g) =>
      g.activeObjService.updateSelectedObj(g.mechanismSrv.sealedStructures()[0].barrel)
    );
    const beforeType = await geometry();
    await page
      .locator('[data-hold-field="length"]')
      .fill(String((beforeType.cylinders[0].barrel - 10) / 200));
    await page.locator('[data-hold-field="length"]').press('Enter');
    const typed = await geometry();
    check(
      `${id}: explicit Barrel Length is accepted`,
      Math.abs(typed.cylinders[0].barrel - beforeType.cylinders[0].barrel + 10) < 0.1,
      { before: beforeType.cylinders, after: typed.cylinders }
    );
    await grid((g) =>
      g.activeObjService.updateSelectedObj(g.mechanismSrv.sealedStructures()[0].rod)
    );
    await page
      .locator('[data-hold-field="length"]')
      .fill(String((typed.cylinders[0].rod + 10) / 200));
    await page.locator('[data-hold-field="length"]').press('Enter');
    const authored = await geometry();
    check(
      `${id}: explicit Rod Length is accepted`,
      Math.abs(authored.cylinders[0].rod - typed.cylinders[0].rod - 10) < 0.1
    );
    await settings();
    const sizeFilm = filmstrip(page, `${OUT}/${id}-sizes`);
    for (const preset of ['Compact', 'Normal', 'Large']) {
      await sizeFilm.during(70, 7, preset, () =>
        page.getByRole('button', { name: preset, exact: true }).click()
      );
      const now = await geometry();
      check(
        `${id}: ${preset} changes display only`,
        same(authored, now) && JSON.stringify(authored.samples) === JSON.stringify(now.samples),
        { before: authored.cylinders, after: now.cylinders, physical: now.physical }
      );
    }
    const large = await geometry();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    check(`${id}: Undo size keeps authored lengths`, same(authored, await geometry()));
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    check(`${id}: Redo size keeps authored lengths`, same(authored, await geometry()));
    const beforeZoom = await geometry();
    await grid((g) => g.svgGrid.panZoomObject.zoomBy(2));
    await grid((g) => g.svgGrid.panZoomObject.zoomBy(0.25));
    check(
      `${id}: zoom cannot change physical or visual sizes`,
      same(authored, await geometry()) && (await geometry()).visual === beforeZoom.visual
    );
    const query = await grid((g) => g.saveHistoryService.urlGenerationService.generateUrlQuery());
    await load(query);
    const restored = await geometry();
    check(
      `${id}: save/reload retains lengths, travel and motion`,
      same(authored, restored) &&
        JSON.stringify(authored.frames) === JSON.stringify(restored.frames),
      {
        authored: authored.cylinders,
        restored: restored.cylinders,
        frames: [authored.frames, restored.frames],
      }
    );
    await settings();
    await page.getByRole('button', { name: 'SI (m)', exact: true }).click();
    check(
      `${id}: unit conversion preserves physical dimensions`,
      same(restored, await geometry(), 0.01),
      { before: restored.cylinders, after: (await geometry()).cylinders }
    );
    await page.getByRole('button', { name: 'Metric (cm)', exact: true }).click();
    check(`${id}: unit conversion round-trip`, same(restored, await geometry()));
    await page.getByRole('button', { name: 'Lines', exact: true }).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${OUT}/${id}-lines.png` });
    await page.getByRole('button', { name: 'Filled', exact: true }).click();
    await contactSheet(`${OUT}/${id}-sizes/*.png`, `${OUT}/${id}-size-film.png`, 7, 0.25);
  }
  await load('4-Bar');
  await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
  await page.getByRole('button', { name: /Motion — 3 positions/ }).click();
  const length = field('End-effector Link length');
  const validLength = await length.inputValue();
  for (const bad of ['-2', '0']) {
    await length.fill(bad);
    await length.press('Tab');
    check(`synthesis rejects length ${bad}`, (await length.inputValue()) === validLength);
  }
  await load('4-Bar');
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  const center = await grid((g) => {
    const b = g.mechanismSrv.joints.find((j) => j.id === 'B'),
      c = g.mechanismSrv.joints.find((j) => j.id === 'C');
    const p = g.svgGrid.modelToScreen({ x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 });
    return { x: p.x, y: p.y };
  });
  const dragFilm = filmstrip(page, `${OUT}/drag`);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  check(
    'holding a selection click does not flash drag traces',
    (await page.locator('#dragTraceHolder path').count()) === 0
  );
  await dragFilm.during(50, 10, 'drag', async () => {
    await page.mouse.move(center.x + 35, center.y + 20, { steps: 12 });
  });
  check(
    'actual drag shows temporary motion traces',
    (await page.locator('#dragTraceHolder path').count()) > 0
  );
  await page.mouse.up();
  check(
    'release removes temporary drag traces',
    (await page.locator('#dragTraceHolder path').count()) === 0
  );
  await page.getByRole('button', { name: 'Path', exact: true }).click();
  check(
    'link Path chip agrees with its visible trace',
    (await page.getByRole('button', { name: 'Path', exact: true }).getAttribute('aria-pressed')) ===
      'true'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  const expand = page.getByRole('button', { name: 'Expand the panel', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.waitForTimeout(450);
  await page.locator('.drawingChips').scrollIntoViewIfNeeded();
  const chips = await page.locator('.drawingChips .viewButtonLabel').evaluateAll((nodes) =>
    nodes.map((n) => ({
      text: n.textContent.trim(),
      width: n.clientWidth,
      content: n.scrollWidth,
    }))
  );
  check(
    'phone drawing chips retain their complete labels',
    chips.length === 4 && chips.every((c) => c.width >= c.content),
    chips
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/phone-chips.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Export Data', exact: true }).click();
  const exportPanel = page.locator('app-export-panel');
  await exportPanel.getByRole('button', { name: 'Next', exact: true }).click();
  await exportPanel.getByRole('button', { name: 'Select None', exact: true }).click();
  check(
    'empty export quantities stay on the explained quantity step',
    (await exportPanel.getByRole('button', { name: 'Next', exact: true }).isDisabled()) &&
      (await exportPanel.locator('.quantityHint').isVisible())
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await grid((g) => {
    const link = g.mechanismSrv.links.find((l) => l.id === 'BC');
    link.name = 'Luffing crank';
    g.activeObjService.updateSelectedObj(link);
  });
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check('existing multiword names can be saved unchanged', (await field('Name').count()) === 0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(getComputedStyle(document.querySelector('editable-title-block .row')).opacity) < 0.7
  );
  const frozen = await page
    .locator('editable-title-block .row')
    .evaluate((n) => getComputedStyle(n).opacity);
  check('animation visibly fades inactive header actions', Number(frozen) < 0.7, frozen);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.stopButton').click();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('button', { name: 'CAD Export', exact: true }).click();
  await page.getByRole('button', { name: /^Geometry / }).click();
  const pin = page.getByRole('spinbutton', { name: 'Pin diameter' });
  await pin.fill('');
  await pin.pressSequentially('-1');
  await pin.press('Tab');
  check(
    'negative CAD diameter stays negative and is refused',
    Number(await pin.inputValue()) === -1 &&
      (await page.locator('.drawingExport button[mat-flat-button]').isDisabled())
  );
  await page.getByRole('button', { name: 'Close CAD Export' }).click();
  await load('4-Bar');
  await grid((g) =>
    g.activeObjService.updateSelectedObj(g.mechanismSrv.joints.find((j) => j.input))
  );
  const speed = page.getByRole('textbox', { name: 'Input Speed', exact: true });
  await speed.fill('0');
  await speed.press('Tab');
  check(
    'zero Input Speed explains its refusal',
    await page
      .getByText('Input Speed must be a nonzero number. Use Pause to stop the animation.', {
        exact: true,
      })
      .isVisible()
  );
  await page.setViewportSize({ width: 760, height: 680 });
  await page.waitForTimeout(450);
  const gap = await page.evaluate(() => {
    const panel = document.querySelector('app-left-tabs .panel'),
      card = panel.querySelector('#normalPanel');
    const bottom = Math.min(
      card.getBoundingClientRect().bottom,
      panel.getBoundingClientRect().bottom - parseFloat(getComputedStyle(panel).paddingBottom)
    );
    const controls = [...document.querySelectorAll('.transportCard,.scrubCard')]
      .map((x) => x.getBoundingClientRect())
      .filter((r) => r.width > 0);
    return Math.min(...controls.map((r) => r.top)) - bottom;
  });
  check('narrow desktop panel keeps the standard 12px card gap', Math.abs(gap - 12) < 2, gap);
  await page.screenshot({ path: `${OUT}/narrow-panel-gap.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await load('Slotted_Tool_Drive');
  await grid((g) => g.activeObjService.updateSelectedObj(g.mechanismSrv.forces[0]));
  const forcePanelText = await page.locator('app-edit-panel').innerText();
  check(
    'force reference frame precedes global components',
    forcePanelText.indexOf('Reference Frame') < forcePanelText.indexOf('Force Components')
  );
  await page.screenshot({ path: `${OUT}/force-frame-order.png` });

  await contactSheet(`${OUT}/drag/*.png`, `${OUT}/drag-film.png`, 5, 0.3);
} catch (e) {
  console.error(e);
  results.push({ label: 'suite completion', ok: false, detail: String(e) });
} finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
await contactSheet(`${OUT}/units/*.png`, `${OUT}/unit-film.png`, 5, 0.3);
if (results.some((x) => !x.ok)) process.exitCode = 1;
