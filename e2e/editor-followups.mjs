/** PR32 follow-up regressions, using the reader's shared reproductions. */
import { mkdirSync, readFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/editor-followups';
mkdirSync(OUT, { recursive: true });
const payloads = {
  luffing:
    '2v.Ay,1E8.A,1V.1011.4O,O,0,0,0.0C,C,Qv,cP,0.0T,T,rn,1Co,0.6G,G,YO,09O,0.1K,K,Fs,Me,0,OCT,O,T..ARGK,Luffing%20crank,mr0,1T,P7,6e,303e9f,G,K,,.MROCT,Boom,4a_0,S7,LX,Uk,0d125a,O,C,T,,..1F1,OCT,F1,rn,1Co,sg,1X7,d4..N_P*2IoWB5',
  orphan:
    '2v.EK,1E8.A,0.1011.6G,G,YO,09O,0.9H,H,1C4,0F2,0.0I,I,1TR,051,0..ARHI,HI,0,0,1Km,0A2,303e9f,H,I,,...N_d*1yshxG',
  lone: '2v.Ay,1E8.A,0.1011.6A,A,0d1,8J,0,,,,02SG....N_k*418cfy',
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('tutorialSeen', '1');
  localStorage.setItem('whatsNewSeen', '2026.09');
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
function check(label, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' ' + JSON.stringify(detail)}`);
}
const grid = (fn, arg) =>
  page.evaluate(
    ({ source, arg }) =>
      new Function('g', 'arg', `return (${source})(g, arg)`)(
        ng.getComponent(document.querySelector('app-new-grid')),
        arg
      ),
    { source: fn.toString(), arg }
  );
const load = (payload) => openMechanism(page, `${BASE}/?${payload}`);
const menuRow = (label) =>
  page
    .locator('.cm-row')
    .filter({ has: page.locator('.cm-row__label', { hasText: new RegExp(`^${label}$`) }) });
const fixture = (name) =>
  readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .find((line) => line.includes(`[${name}](`))
    .match(/\]\(https?:\/\/[^?]+\?([^)]*)/)[1];
try {
  await load(payloads.orphan);
  const hi = await grid((g) => {
    const p = g.svgGrid.modelToScreen(g.mechanismSrv.links.find((l) => l.id === 'HI').CoM);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(hi.x, hi.y, { button: 'right' });
  await menuRow('Delete Link').click();
  check(
    'deleting HI preserves unrelated orphan G',
    await grid((g) => g.mechanismSrv.joints.map((j) => j.id).join() === 'G')
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check(
    'undo restores HI and retains G',
    await grid(
      (g) =>
        g.mechanismSrv.links.some((l) => l.id === 'HI') &&
        g.mechanismSrv.joints.some((j) => j.id === 'G')
    )
  );

  await load(payloads.lone);
  await page.locator('#joint_A').click();
  const warningGap = await page
    .locator('.nowhereToSlide')
    .evaluate(
      (el) =>
        el.getBoundingClientRect().top - el.previousElementSibling.getBoundingClientRect().bottom
    );
  check(
    'orphan warning sits directly below the type control',
    warningGap >= 0 && warningGap <= 5,
    warningGap
  );
  await page.locator('#joint_A').click({ button: 'right' });
  check(
    'orphan input A permits attaching its first link',
    !(await menuRow('Link').getAttribute('class')).includes('cm-row--off')
  );
  await page.screenshot({ path: `${OUT}/orphan-menu.png` });
  await menuRow('Link').click();
  const anchor = await grid((g) => {
    const p = g.svgGrid.modelToScreen(g.mechanismSrv.joints[0]);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(anchor.x + 140, anchor.y - 90);
  check(
    'attaching at A creates the first link',
    await grid((g) => g.mechanismSrv.links.length === 1 && g.mechanismSrv.joints.length === 2)
  );

  await load(TEMPLATE_LINKAGES['4-Bar']);
  for (const mode of ['Kinematic Analysis', 'Force Analysis']) {
    await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click();
    await page.mouse.click(1200, 350, { button: 'right' });
    for (const label of ['Link', 'Cylinder'])
      check(
        `${mode} disables grid ${label}`,
        (await menuRow(label).getAttribute('class')).includes('cm-row--off')
      );
    await page.keyboard.press('Escape');
    check(
      `${mode} also guards direct creation handlers`,
      await grid((g) => {
        g.startCreatingLink();
        g.startCreatingCylinder();
        return !g.dragState.isCreatingLink && g.dragState.grid === 0;
      })
    );
  }

  await load(fixture('Bell crank'));
  const at = await grid((g) => {
    const leaf = g.mechanismSrv.links.find((l) => l.id === 'CDE').subset.find((l) => l.id === 'CD');
    const p = g.svgGrid.modelToScreen(leaf.CoM);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  // The part's own solid edge, not the dashed one round the body it belongs to.
  const outline = await page.locator('#primitiveSelection .link-selected').evaluate((el) => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const hex = getComputedStyle(el).getPropertyValue('--canvas-selection').trim();
    const [r, gr, b] = hex.match(/[\da-f]{2}/gi).map((h) => parseInt(h, 16));
    return {
      d: el.getAttribute('d'),
      part: g.objectDisplay.path(g.activeObjService.selectedLink),
      stroke: getComputedStyle(el).stroke,
      selection: `rgb(${r}, ${gr}, ${b})`,
    };
  });
  check(
    'selected primitive has a visible yellow outline',
    outline.d.length > 10 && outline.d === outline.part && outline.stroke === outline.selection,
    outline
  );
  await page.screenshot({ path: `${OUT}/primitive-selection.png` });
  await page.locator('#joint_C').click({ button: 'right' });
  await page.locator('#contextMenu.show').waitFor({ state: 'visible' });
  await page.waitForTimeout(200);
  const compact = await page.locator('#contextMenu').evaluate((el) => {
    const key = [...el.querySelectorAll('.cm-row')]
      .find((r) => r.querySelector('.cm-row__label')?.textContent.trim() === 'Delete Joint')
      ?.querySelector('kbd');
    const a = el.getBoundingClientRect(),
      b = key?.getBoundingClientRect();
    return {
      width: a.width,
      keyRight: b?.right,
      right: a.right,
      overflow: el.scrollWidth > el.clientWidth,
    };
  });
  check(
    'compact menu keeps Delete shortcut inside',
    compact.width <= 321 && compact.keyRight < compact.right && !compact.overflow,
    compact
  );
  await page.screenshot({ path: `${OUT}/compact-delete.png` });
  await page.keyboard.press('Escape');

  await load(payloads.luffing);
  await grid((g) => {
    window.labelSides = [];
    window.labelTimer = setInterval(() => {
      const l = g.mechanismSrv.links.find((l) => l.name === 'Luffing crank');
      const a = g.linkLabelStyle(l),
        [p, q] = l.joints;
      window.labelSides.push(
        (a.x - (p.x + q.x) / 2) * (q.x - p.x) + (a.y - (p.y + q.y) / 2) * (q.y - p.y)
      );
    }, 20);
  });
  const film = filmstrip(page, `${OUT}/luffing`);
  await film.shot('paused');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await film.during(120, 18, 'playing', () => page.waitForTimeout(2300));
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await film.shot('paused-again');
  const sides = await page.evaluate(() => {
    clearInterval(window.labelTimer);
    return window.labelSides;
  });
  check(
    'animated label stays attached to the same end',
    sides.length > 20 && (sides.every((x) => x > 0) || sides.every((x) => x < 0)),
    { min: Math.min(...sides), max: Math.max(...sides) }
  );
  await contactSheet(`${OUT}/luffing/*.png`, `${OUT}/luffing.png`, 5, 0.3);

  await page.setViewportSize({ width: 850, height: 600 });
  await load(fixture('Bell crank'));
  await page.locator('#joint_C').click();
  await page.getByRole('button', { name: 'Visual Settings', exact: true }).click();
  await page.waitForTimeout(400);
  const panelGeometry = () =>
    page.evaluate(() => {
      const p = document.querySelector('app-left-tabs .panel').getBoundingClientRect(),
        cards = [...document.querySelectorAll('.transportCard,.scrubCard')].map((e) =>
          e.getBoundingClientRect()
        );
      return {
        bottom: p.bottom,
        right: p.right,
        top: Math.min(...cards.map((c) => c.top)),
        left: Math.min(...cards.map((c) => c.left)),
      };
    });
  const narrow = await panelGeometry();
  check(
    'narrow edit panel clears the playback controls',
    narrow.right > narrow.left && narrow.bottom <= narrow.top,
    narrow
  );
  await page.screenshot({ path: `${OUT}/narrow-panel.png` });
  const resizeFilm = filmstrip(page, `${OUT}/panel-resize`);
  await resizeFilm.shot('narrow');
  await resizeFilm.during(50, 8, 'widen', async () => {
    await page.setViewportSize({ width: 1800, height: 600 });
    await page.waitForTimeout(400);
  });
  await contactSheet(`${OUT}/panel-resize/*.png`, `${OUT}/panel-resize.png`, 3, 0.4);
  const wide = await panelGeometry();
  check(
    'wide edit panel keeps its full height',
    wide.right < wide.left && wide.bottom > wide.top,
    wide
  );
  check('no runtime errors', errors.length === 0, errors);
} catch (e) {
  check('suite completed', false, String(e));
  await page.screenshot({ path: `${OUT}/failure.png` });
} finally {
  await browser.close();
}
process.exitCode = results.every(Boolean) ? 0 : 1;
