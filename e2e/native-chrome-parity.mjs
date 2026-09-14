/** Same S0 drawing, shared chrome, two providers. Pose samples may differ; navigation and styling may not. */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const { PNG } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/pngjs/lib/png.js'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4347';
const out = 'artifacts/bodies-and-joints/S5-rework/parity';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const comparisons = [],
  errors = [],
  pages = [];
const fixtures = JSON.parse(await readFile('src/test-data/native-shell-fixtures.json', 'utf8'));
async function both(action) {
  for (const [index, page] of pages.entries()) await action(page, index);
}
async function open(fixture) {
  await both(async (page, native) => {
    await page.goto(
      `${base}/?${native ? 'editor=native&document=' + encodeURIComponent(fixture.native) : fixture.legacy}`
    );
    await page.locator('#bootSplash').waitFor({ state: 'detached' });
    await page.locator('app-playback-bar').waitFor({ state: 'attached' });
    await page.waitForTimeout(1200);
    assert.equal(
      await page.evaluate((native) => {
        const c = ng.getComponent(
          document.querySelector(native ? 'app-native-grid' : 'app-new-grid')
        );
        return native
          ? c.editor.document().bodies.filter((body) => body.kind === 'material').length
          : c.mechanismSrv.links.length;
      }, !!native),
      native ? fixture.materials : fixture.legacyMaterials,
      `${fixture.key} loads every material on route ${native}`
    );
    await page.mouse.move(1355, 895);
  });
}
async function snapshot(name, emptyPanel = true) {
  const trees = [],
    pixels = [];
  const panelBoxes = emptyPanel
    ? []
    : await Promise.all(pages.map((page) => page.locator('app-left-tabs .panel').boundingBox()));
  const panelMask = panelBoxes.length
    ? {
        left: Math.min(...panelBoxes.map((box) => box.x)) - 10,
        top: Math.min(...panelBoxes.map((box) => box.y)) - 10,
        right: Math.max(...panelBoxes.map((box) => box.x + box.width)) + 10,
        bottom: Math.max(...panelBoxes.map((box) => box.y + box.height)) + 10,
      }
    : undefined;
  const movingSample = name.includes('-pose-') || name.startsWith('Cylinder_Boom-');
  const samples = await Promise.all(
    pages.map((page) =>
      page.evaluate(() => {
        const mechanism = ng.getComponent(document.querySelector('app-playback-bar')).mechanism;
        return mechanism.mechanisms.map((_, index) => {
          const profile = mechanism.driveProfileOf(index);
          if (!profile) return 0;
          return Math.max(
            ...profile.along.slice(1).map((value, i) => Math.abs(value - profile.along[i]))
          );
        });
      })
    )
  );
  assert.ok(
    samples[1].every((value) => value > 0 && value <= 0.012),
    `${name}: native sampling became visibly coarse`
  );
  const spacing = samples[1].map((step, i) => step + samples[0][i] + 0.001);
  if (movingSample) {
    const values = await Promise.all(
      pages.map((page) =>
        page
          .getByRole('slider')
          .evaluateAll((inputs) => inputs.map((input) => Number(input.value) / Number(input.max)))
      )
    );
    values[0].forEach((value, index) =>
      assert.ok(
        Math.abs(value - values[1][index]) <= spacing[index],
        `${name}: scrub handles disagree by more than a sample`
      )
    );
  }
  const seats = await Promise.all(
    pages.map((page) =>
      page
        .locator('.anchorSeat')
        .evaluateAll((elements) =>
          elements.map((element) => Number(element.style.getPropertyValue('--at')))
        )
    )
  );
  assert.equal(seats[0].length, seats[1].length);
  seats[0].forEach((value, i) =>
    assert.ok(
      Math.abs(value - seats[1][i]) <= 100 * Math.max(...spacing),
      `${name}: anchor seats disagree by more than a sample`
    )
  );
  const offsetTolerance = await pages[0].evaluate(
    (spacing) => {
      const profile = ng
        .getComponent(document.querySelector('app-playback-bar'))
        .mechanism.driveProfileOf(0);
      if (!profile) return 0.011;
      return profile.linear
        ? (profile.span / 200) * spacing + 0.010001
        : ((profile.span * 180) / Math.PI) * spacing + 1;
    },
    Math.max(...spacing)
  );
  const offsets = await Promise.all(
    pages.map((page) => page.locator('.startChipLabel').allTextContents())
  );
  assert.equal(offsets[0].length, offsets[1].length, `${name}: start offset controls differ`);
  offsets[0].forEach((text, index) => {
    const other = offsets[1][index];
    assert.equal(text.replace(/[\d.]+/g, '#'), other.replace(/[\d.]+/g, '#'));
    assert.ok(
      Math.abs(
        parseFloat(text.replace(/^[^\d.-]*/, '')) - parseFloat(other.replace(/^[^\d.-]*/, ''))
      ) <= offsetTolerance,
      `${name}: start offsets differ beyond one sample plus display rounding (${text} / ${other})`
    );
  });
  await both(async (page, native) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${name}-${native ? 'native' : 'legacy'}.png` });
    const originalOffset = await page.locator('.startChipLabel').evaluateAll((elements) =>
      elements.map((element) => {
        const nodes = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
        const text = nodes.map((node) => node.textContent);
        nodes.forEach((node) => (node.textContent = node.textContent.replace(/[\d.]+/g, '0.00')));
        return text;
      })
    );
    // Numerical sample spacing is allowed to change the readout by a last digit. Its box is still compared.
    // The inspector has new entity fields; its enclosing real panel is compared, and its content is filmed.
    const style = await page.addStyleTag({
      content:
        '#canvas { visibility:hidden !important; } #bottomBar .cursor { display:none !important; } .rowReadout { color:transparent !important; } .rowReadout * { color:transparent !important; } .startChipLabel { color:transparent !important; }' +
        (movingSample
          ? ' input[type=range] { opacity:0 !important; } .anchorSeat { --at:50 !important; }'
          : ''),
    });
    trees.push(
      await page.evaluate((empty) => {
        const tree = (element) => {
          if (element.nodeType === Node.TEXT_NODE)
            return element.textContent.replace(/\s+/g, ' ').trim();
          if (!(element instanceof Element) || element.matches('.cursor')) return null;
          const css = getComputedStyle(element),
            box = element.getBoundingClientRect();
          const attrs = [...element.attributes]
            .filter((a) => /^(aria-|role$|title$|disabled$|hidden$|type$)/.test(a.name))
            .filter(
              (a) => !/^aria-(describedby|controls|labelledby|valuenow|valuetext)$/.test(a.name)
            )
            .map((a) => [a.name, a.value]);
          return {
            tag: element.tagName,
            attrs,
            box: [
              box.x,
              box.y,
              box.width,
              !empty && element.matches('app-left-tabs .panel') ? 0 : box.height,
            ].map((n) => Math.round(n * 100) / 100),
            style: [
              'color',
              'backgroundColor',
              'boxShadow',
              'borderRadius',
              'fontSize',
              'fontFamily',
              'opacity',
              'display',
            ].map((key) => css[key]),
            children: element.matches(
              '.cursor, .rowReadout, .rowPosition, .rowTime, .startChipLabel, app-left-tabs .panel'
            )
              ? []
              : [...element.childNodes].map(tree).filter((value) => value !== null && value !== ''),
          };
        };
        const selectors = [
          'app-top-bar',
          'app-left-tabs',
          'app-playback-bar',
          'app-bottombar',
          'app-right-panel',
        ];
        if (empty) selectors.push('app-empty-selection');
        return selectors.map((selector) => ({
          selector,
          nodes: [...document.querySelectorAll(selector)].map(tree),
        }));
      }, emptyPanel)
    );
    pixels.push(
      PNG.sync.read(
        await page.screenshot({
          animations: 'disabled',
          mask: emptyPanel ? [] : [page.locator('app-left-tabs .panel')],
        })
      )
    );
    await style.evaluate((element) => element.remove());
    await page.locator('.startChipLabel').evaluateAll(
      (elements, originals) =>
        elements.forEach((element, index) => {
          [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .forEach((node, n) => (node.textContent = originals[index][n]));
        }),
      originalOffset
    );
  });
  await writeFile(`${out}/${name}-dom.json`, JSON.stringify(trees, null, 2));
  assert.deepEqual(trees[1], trees[0], `${name}: shared chrome DOM, geometry or styles differ`);
  const [a, b] = pixels,
    diff = new PNG({ width: a.width, height: a.height });
  let changed = 0,
    largestDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const x = (i / 4) % a.width,
      y = Math.floor(i / 4 / a.width);
    const inspectorContent =
      panelMask &&
      x >= panelMask.left &&
      x <= panelMask.right &&
      y >= panelMask.top &&
      y <= panelMask.bottom;
    let delta = 0;
    for (let c = 0; c < 3; c++) {
      diff.data[i + c] = Math.abs(a.data[i + c] - b.data[i + c]);
      delta = Math.max(delta, diff.data[i + c]);
    }
    diff.data[i + 3] = 255;
    if (!inspectorContent) {
      largestDelta = Math.max(largestDelta, delta);
      if (delta > 12) changed++;
    }
  }
  await writeFile(`${out}/${name}-chrome-diff.png`, PNG.sync.write(diff));
  // Separate compositor surfaces can round the scaled Material switch edge differently.
  // Permit at most four low-contrast edge pixels; DOM, boxes and styles still match exactly.
  assert.ok(
    changed <= 4 && largestDelta <= 32,
    `${name}: ${changed} chrome pixels differ (peak ${largestDelta})`
  );
  comparisons.push({ name, changed, largestDelta });
  console.log(`PASS ${name}: matching chrome DOM and pixels`);
}
async function film(name, action, clip) {
  await both(async (page, native) => {
    const dir = `${out}/${name}-${native ? 'native' : 'legacy'}-frames`;
    await filmstrip(page, dir, clip).during(25, 12, name, () => action(page, native));
    await contactSheet(
      `${dir}/*.png`,
      `${out}/${name}-${native ? 'native' : 'legacy'}-sheet.png`,
      4,
      0.4
    );
  });
}
try {
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await startQuiet(page);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    pages.push(page);
  }
  for (const fixture of fixtures.filter(
    (fixture) =>
      !process.env.PMKS_PARITY_FIXTURES ||
      process.env.PMKS_PARITY_FIXTURES.split(',').includes(fixture.key)
  )) {
    await open(fixture);
    await snapshot(`${fixture.key}-design`);
    await both(async (page) => {
      await page.getByRole('button', { name: 'Fit full motion', exact: true }).click();
      await page.waitForTimeout(650);
    });
    for (let step = 0; step < 9; step++) {
      await both(async (page) => {
        await page
          .getByRole('slider')
          .first()
          .fill(String(step * 100));
        await page.waitForTimeout(80);
      });
      await snapshot(`${fixture.key}-pose-${step}`);
    }
    for (const side of ['legacy', 'native'])
      await contactSheet(
        `${out}/${fixture.key}-pose-*-${side}.png`,
        `${out}/${fixture.key}-${side}-sheet.png`,
        3,
        0.4
      );
    await film(`${fixture.key}-playing`, (page) =>
      page.getByRole('button', { name: 'Play', exact: true }).click()
    );
    await both((page) => page.getByRole('button', { name: 'Pause', exact: true }).click());
  }
  await open(fixtures.find((f) => f.key === '4-Bar'));
  // The S0 editing flow selects joint B and edits its shared X/Y block.
  await both(async (page, native) => {
    if (native) await page.locator('[data-mark-id][aria-label="B"]').click();
    else await page.locator('#joint_B').click();
    await page.locator('app-left-tabs dual-input-block input').first().focus();
  });
  await snapshot('desktop-focus', false);
  await film(
    'subsection-collapse',
    (page) => page.getByRole('button', { name: 'Basic Settings', exact: true }).click(),
    { x: 0, y: 60, width: 275, height: 700 }
  );
  await film(
    'subsection-expand',
    (page) => page.getByRole('button', { name: 'Basic Settings', exact: true }).click(),
    { x: 0, y: 60, width: 275, height: 700 }
  );
  await film('coordinate-edit', async (page) => {
    const field = page.locator('app-left-tabs dual-input-block input').first();
    const before = parseFloat(await field.inputValue());
    await field.fill(String(before + 0.1));
    await field.press('Enter');
    await page.waitForTimeout(250);
    assert.ok(
      Math.abs(parseFloat(await field.inputValue()) - before - 0.1) < 0.011,
      'The displayed coordinate commits the typed edit'
    );
  });
  await film('coordinate-undo', (page) =>
    page.getByRole('button', { name: 'Undo', exact: true }).click()
  );
  await both(async (page) => {
    await page.getByRole('button', { name: 'Project menu', exact: true }).click();
    (await page.getByRole('menuitem', { name: /^Settings/ }).count())
      ? await page.getByRole('menuitem', { name: /^Settings/ }).click()
      : await page.getByRole('button', { name: /^Settings/ }).click();
    await page.waitForTimeout(500);
  });
  await snapshot('settings-drawer', false);
  await both((page) => page.keyboard.press('Escape'));
  await both(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    // Fit animations can cross the zoom-warning threshold at different intermediate samples.
    // Dismiss those transient notices before comparing the settled phone shell.
    for (const close of await page.getByRole('button', { name: 'Dismiss', exact: true }).all())
      await close.click();
    await page.locator('app-top-bar .tabButton').nth(1).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.mouse.move(385, 400);
    await page.waitForTimeout(300);
  });
  await snapshot('phone-collapsed', false);
  await film('phone-opening', (page) => page.locator('.sheetHandle').click());
  await both((page) => page.emulateMedia({ reducedMotion: 'reduce' }));
  await film('phone-reduced-close', (page) => page.locator('.sheetHandle').click());
  await film('phone-reduced-open', (page) => page.locator('.sheetHandle').click());
  await both((page) => page.setViewportSize({ width: 1360, height: 900 }));
  await open(fixtures.find((f) => f.key === '4-Bar'));
  await film('joint-menu', async (page, native) => {
    await page
      .locator(native ? '[data-mark-id][aria-label="B"]' : '#joint_B')
      .click({ button: 'right' });
    assert.ok(await page.getByRole('menu').isVisible(), 'The selection has a context menu');
  });
  await both((page) => page.keyboard.press('Escape'));
  assert.deepEqual(errors, [], 'No browser errors');
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ base, comparisons, errors }, null, 2));
  await browser.close();
}
