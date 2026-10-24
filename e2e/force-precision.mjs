/** Compare real force glyphs to designer SVGs, and guard all six palette colors. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/force-precision';
mkdirSync(OUT, { recursive: true });
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
try {
  await load(TEMPLATE_LINKAGES['4-Bar']);
  await grid((g) => {
    const m = g.mechanismSrv,
      link = m.links[0],
      [a, b] = link.joints;
    m.joints = [a, b];
    m.links = [link];
    m.forces = [];
    a.x = 72;
    a.y = -146;
    b.x = 228;
    b.y = -104;
    a.ground = false;
    a.input = false;
    b.ground = false;
    b.input = false;
    link.fill = '#c5cae9';
    link.reComputeDPath();
    g.settings.constructor._objectScale.next(90);
    m.updateMechanism(false);
    const f = m.createForce({ x: 134, y: -129 }, { x: 181.5, y: -46.7 }, link);
    f.startCoord.x = 134;
    f.startCoord.y = -129;
    f.endCoord.x = 181.5;
    f.endCoord.y = -46.7;
    f.setLocal(true);
    f.color = '#0d125a';
    f.updateInternalValues();
    g.activeObjService.updateSelectedObj(f);
    g.svgGrid.setZoom(1);
  });
  await page.mouse.move(1390, 930);
  const reference = readFileSync('e2e/reference/force/local-selected.svg', 'utf8');
  // Serialize the actual Angular-rendered glyph and its computed styles, at the
  // same model scale/zoom as the designer. Reuse reference scenery to isolate
  // the force rendering; never substitute a hand-drawn implementation glyph.
  const capture = async (color, selected, inward, hover) => {
    await grid(
      (g, state) => {
        const f = g.mechanismSrv.forces[0];
        f.color = state.color;
        if (f.arrowOutward === state.inward) f.flipForce();
        g.activeObjService.updateSelectedObj(state.selected ? f : undefined);
        f.showHighlight = state.hover;
      },
      { color, selected, inward, hover }
    );
    await page.mouse.move(1390, 929);
    await page.mouse.move(1390, 930);
    return page.evaluate((ref) => {
      const props = [
        'fill',
        'stroke',
        'stroke-width',
        'stroke-dasharray',
        'stroke-opacity',
        'fill-opacity',
        'opacity',
        'stroke-linecap',
        'stroke-linejoin',
        'paint-order',
        'font-family',
        'font-size',
        'font-weight',
        'text-anchor',
        'dominant-baseline',
      ];
      const copy = (source) => {
        const clone = source.cloneNode(true),
          originals = [source, ...source.querySelectorAll('*')],
          copies = [clone, ...clone.querySelectorAll('*')];
        originals.forEach((node, i) => {
          const style = getComputedStyle(node);
          props.forEach((p) => copies[i].style.setProperty(p, style.getPropertyValue(p)));
        });
        return clone;
      };
      const doc = new DOMParser().parseFromString(ref, 'image/svg+xml');
      const root = doc.documentElement;
      const keep = [...root.children].slice(0, 5);
      root.replaceChildren(...keep);
      const actual = copy(document.querySelector('#forcesHolder'));
      root.append(actual);
      const tags = copy(document.querySelector('#forceTagHolder'));
      root.append(tags);
      root.setAttribute('width', '600');
      root.setAttribute('height', '420');
      root.removeAttribute('style');
      const g = ng.getComponent(document.querySelector('app-new-grid')),
        f = g.mechanismSrv.forces[0];
      const datum = document.querySelector('.forceDatum'),
        square = document.querySelector('#endForceEndpoint rect');
      return {
        svg: new XMLSerializer().serializeToString(root),
        ink: getComputedStyle(document.querySelector('.forceArrow')).fill,
        datum: datum ? getComputedStyle(datum).stroke : null,
        square: square ? getComputedStyle(square).fill : null,
        frame: document.querySelector('.forceApplicationMark').getAttribute('transform'),
        shaft: Number(document.querySelector('.forceLine').getAttribute('stroke-width')),
        centerline: Number(
          document.querySelector('.forceSelectedLine')?.getAttribute('stroke-width')
        ),
        keyway: Number(document.querySelector('.forceKeyway').getAttribute('stroke-width')),
        line: f.forceLine,
        head: f.forceArrow,
      };
    }, reference);
  };
  const rows = [];
  for (const color of ['#c5cae9', '#303e9f', '#0d125a', '#B2DFDB', '#26A69A', '#00695C']) {
    const rest = await capture(color, false, false, false),
      hover = await capture(color, false, false, true),
      selected = await capture(color, true, false, true),
      entering = await capture(color, false, true, false);
    check(
      `${color}: hover preserves chosen hue`,
      hover.ink.includes('color(srgb') && hover.ink !== rest.ink,
      { rest: rest.ink, hover: hover.ink }
    );
    check(`${color}: selected force retains its original ink`, selected.ink === rest.ink, {
      selected: selected.ink,
      rest: rest.ink,
    });
    check(
      `${color}: datum uses force ink and direction handle stays cream`,
      selected.datum === rest.ink && selected.square === 'rgb(255, 248, 225)',
      selected
    );
    rows.push({ color, rest, hover, selected, entering });
  }
  const navy = rows[2];
  check(
    'selected strokes match the designer proportions',
    Math.abs(navy.selected.centerline / navy.selected.shaft - 0.3) < 1e-8 &&
      Math.abs(navy.selected.keyway / navy.selected.shaft - 3.2 / 9) < 1e-8,
    navy.selected
  );

  check(
    'keyway follows the 15° bar, not the 60° arrow',
    Math.abs(Number(navy.selected.frame.match(/rotate\(([^)]+)/)[1]) - 15.0685) < 0.01,
    navy.selected.frame
  );
  const refSelected = reference.replace('width="300" height="210"', 'width="600" height="420"');
  const refEntering = readFileSync('e2e/reference/force/local-entering.svg', 'utf8').replace(
    'width="300" height="210"',
    'width="600" height="420"'
  );
  const html = `<html><head><style>body{margin:12px;font:16px sans-serif;background:#eee} .row{display:flex;gap:16px;margin-bottom:12px}section{background:white}h3{margin:8px}svg{display:block}</style></head><body><h2>Designer / actual app SVG at the same scale</h2><div class="row"><section><h3>Designer — selected</h3>${refSelected}</section><section><h3>App — selected</h3>${navy.selected.svg}</section></div><div class="row"><section><h3>Designer — entering</h3>${refEntering}</section><section><h3>App — entering</h3>${navy.entering.svg}</section></div></body></html>`;
  writeFileSync(`${OUT}/comparison.html`, html);
  const compare = await browser.newPage({ viewport: { width: 1250, height: 1040 } });
  await compare.setContent(html);
  await compare.screenshot({ path: `${OUT}/comparison.png` });
  await compare.close();
  const matrix = await browser.newPage({ viewport: { width: 1250, height: 1600 } });
  await matrix.setContent(
    `<style>body{font:14px sans-serif}svg{width:300px;height:210px}.row{display:flex}.cell{border:1px solid #ddd}</style><div class="row"><div style="width:300px">Rest</div><div style="width:300px">Hover</div><div style="width:300px">Selected</div><div style="width:300px">Entering</div></div>${rows.map((r) => `<div class="row">${['rest', 'hover', 'selected', 'entering'].map((state) => `<div class="cell">${r.color} ${state}${r[state].svg}</div>`).join('')}</div>`).join('')}`
  );
  await matrix.screenshot({ path: `${OUT}/colors.png`, fullPage: true });
  await matrix.close();
  // Keep a real pointer gesture as well as the controlled color matrix.
  await capture('#00695C', false, false, false);
  await grid((g) => g.svgGrid.fitToLinkage(false));
  const target = await grid((g) => {
    const f = g.mechanismSrv.forces[0];
    const point = g.svgGrid.modelToScreen({
      x: (f.startCoord.x + f.endCoord.x) / 2,
      y: (f.startCoord.y + f.endCoord.y) / 2,
    });
    return { x: point.x, y: point.y };
  });
  const hoverFilm = filmstrip(page, `${OUT}/hover`);
  await hoverFilm.during(80, 8, 'pointer', async () => {
    await page.mouse.move(target.x, target.y, { steps: 12 });
  });
  check(
    'real pointer hover keeps green ink',
    await page
      .locator('.forceArrow')
      .evaluate((el) => getComputedStyle(el).fill.includes('color(srgb'))
  );
  await page.mouse.click(target.x, target.y);
  await hoverFilm.shot('selected');
  check(
    'click selects the force with original green ink',
    await page
      .locator('.forceArrow')
      .evaluate((el) => getComputedStyle(el).fill === 'rgb(0, 105, 92)')
  );
  await contactSheet(`${OUT}/hover/*.png`, `${OUT}/hover-film.png`, 3, 0.35);
  check('no runtime errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
if (results.some((ok) => !ok)) process.exitCode = 1;
