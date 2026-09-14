/**
 * The paired panel and menu gate for the native route.
 *
 * `docs/native-ui-parity-plan.md` says the native editor is a model migration
 * *under the existing UI*: the same Edit panel and the same context menus, to
 * the pixel, with one allowed exception. A native-only suite that passes is not
 * evidence of that, so this one opens the **same drawing on both routes at
 * once** — two pages of one browser, one viewport, one set of gestures — and
 * compares what the reader sees.
 *
 * Two things are compared for every state:
 *
 *   1. the **DOM** of `app-left-tabs` (or `app-context-menu`): tag names, the
 *      text a reader can see, the aria/role/title/disabled attributes, and the
 *      computed color, background, font, letter spacing, radius and shadow of
 *      every element. Framework-generated ids are scrubbed out of attribute
 *      values first — they differ between two compilations and mean nothing.
 *   2. the **pixels** of the left card's own box (or the menu's), at a maximum
 *      per-channel delta of 8.
 *
 * **The one allowed difference** is the joint-type choice that stands where the
 * public panel's Grounded / Slider / Welded toggles stand. It is named on each
 * side and replaced by the same sentinel before anything is compared: on the
 * native route by `data-native-only="joint-type"`, on the public route by the
 * consecutive run of `toggle-block`s labeled Grounded, Slider and Welded (the
 * public files may not be touched, so the public side is recognized by what it
 * is rather than by a marker). Its box is the only masked region in any
 * screenshot, it is masked nowhere but the panel, and the mask is reported with
 * its rectangle so a reader can see exactly what was not compared. **No menu
 * comparison is masked at all.**
 *
 * The fixtures are the paired ones published in `docs/native-shell-fixture-urls.md`,
 * read from `src/test-data/native-shell-fixtures.json` so the two cannot drift.
 *
 *   PMKS_PUBLIC_BASE_URL=http://localhost:4200 \
 *   PMKS_NATIVE_BASE_URL=http://localhost:4311 \
 *   PMKS_PLAYWRIGHT_DIR=.. node e2e/native-panel-parity.mjs
 *
 * `PMKS_PARITY_FIXTURES=4-Bar,Cylinder_Boom` narrows it to named fixtures.
 * `PMKS_PNG_DIR` says where `pngjs` lives when it is not beside Playwright.
 * Reports, per-state DOM dumps and side-by-side PNGs land in
 * `artifacts/native-parity/`. It exits non-zero on any difference.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';

const PLAYWRIGHT = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(PLAYWRIGHT + '/node_modules/playwright/index.mjs');
const { PNG } = await import(
  (process.env.PMKS_PNG_DIR ?? PLAYWRIGHT) + '/node_modules/pngjs/lib/png.js'
);

const publicBase =
  process.env.PMKS_PUBLIC_BASE_URL ?? process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const nativeBase = process.env.PMKS_NATIVE_BASE_URL ?? process.env.PMKS_BASE_URL ?? publicBase;
const out = process.env.PMKS_PARITY_OUT ?? 'artifacts/native-parity';
const VIEWPORT = { width: 1360, height: 900 };
/** A pixel this close on every channel is the same pixel. */
const MAX_CHANNEL_DELTA = 8;
/** How many DOM differences one state reports before it stops listing them. */
const DIFF_LIMIT = 40;
const PUBLIC = 0;
const NATIVE = 1;
const sideName = (index) => (index === NATIVE ? 'native' : 'public');

await mkdir(out, { recursive: true });

// ---- what each route calls things -------------------------------------------

/**
 * The same drawing wears different clothes on the two routes: the public canvas
 * numbers its joints `#joint_B` and its links by their letter pair, while the
 * native canvas hangs a `data-mark-id` / `data-body-id` on each and says which
 * one it is in `aria-label`. This is the whole of the translation between them;
 * everything below asks for "the joint labeled B" and gets the right element.
 */
const VOCABULARY = [
  {
    joint: (label) => `#joint_${label}`,
    link: (label) => `#linkHolder [id="${label}"]`,
    // A public cylinder is drawn as its own barrel, not as a link.
    cylinder: () => '.cylinder-barrel',
    force: () => '#forcesHolder .forceLine',
    labels: () => ({
      joints: [...document.querySelectorAll('[id^="joint_"]')].map((e) => e.id.slice(6)),
      links: [...document.querySelectorAll('#linkHolder > [id]')].map((e) => e.id),
      cylinders: document.querySelectorAll('.cylinder-barrel').length,
      forces: document.querySelectorAll('#forcesHolder .forceLine').length,
    }),
    places: () => {
      const at = (element, name) => {
        const box = element.getBoundingClientRect();
        return {
          name,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        };
      };
      return {
        joints: [...document.querySelectorAll('[id^="joint_"]')].map((e) => at(e, e.id.slice(6))),
        links: [...document.querySelectorAll('#linkHolder > [id]')].map((e) => at(e, e.id)),
      };
    },
  },
  {
    joint: (label) => `[data-mark-id][aria-label="${label}"]`,
    link: (label) => `[data-body-id][aria-label="${label}"]`,
    // The native cylinder is a two-body assembly; its barrel is the piece a
    // reader grabs, the same piece the public route draws as `.cylinder-barrel`.
    cylinder: () => '[data-body-id][aria-label="Barrel"]',
    force: () => '#forcesHolder [data-force-id]',
    labels: () => ({
      joints: [...document.querySelectorAll('[data-mark-id][aria-label]')].map((e) =>
        e.getAttribute('aria-label')
      ),
      links: [...document.querySelectorAll('[data-body-id][aria-label]')].map((e) =>
        e.getAttribute('aria-label')
      ),
      cylinders: document.querySelectorAll('[data-body-id][aria-label="Barrel"]').length,
      forces: document.querySelectorAll('#forcesHolder [data-force-id]').length,
    }),
    places: () => {
      const at = (element) => {
        const box = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label'),
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        };
      };
      return {
        joints: [...document.querySelectorAll('[data-mark-id][aria-label]')].map(at),
        links: [...document.querySelectorAll('[data-body-id][aria-label]')].map(at),
      };
    },
  },
];

// ---- reading a region the way a reader sees it -------------------------------

/**
 * The tree, evaluated in the page. Kept as one source string because both
 * routes must be read by exactly the same code, and a helper that drifted
 * between them would be a parity bug in the gate itself.
 */
const readTree = ([selector, collapse]) =>
  (() => {
    /** Ids a compiler made up. They differ per build and mean nothing here. */
    const scrub = (value) =>
      String(value)
        .replace(/\b(?:_?ng|cdk|mat)[a-z-]*-?c?\d+\b/gi, '#generated')
        .replace(/#generated(?:[-\d]+)?/g, '#generated')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '#id')
        .replace(/\b(?:production|draft):[a-z]+:\d+\b/gi, '#id')
        .replace(/\s+/g, ' ')
        .trim();
    const STYLES = [
      'color',
      'backgroundColor',
      'fontSize',
      'fontFamily',
      'fontWeight',
      'letterSpacing',
      'borderRadius',
      'boxShadow',
      'opacity',
    ];
    /**
     * The one pair of tags that may differ. The native panel is a different
     * component by design -- that is what "a model migration under the existing
     * UI" means -- so its host element is read under the public panel's name and
     * everything inside it is compared as it stands.
     */
    const HOSTS = { 'APP-NATIVE-INSPECTOR': 'APP-EDIT-PANEL' };
    const label = (element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    /**
     * The native side of the one allowed difference.
     *
     * The attribute sits on the block itself, but the block arrives wrapped in
     * its own component host, and that host stands exactly where the public
     * panel's three toggles stand. So a host that holds the marked block and
     * nothing else beside it is the sentinel too — otherwise the wrapper alone
     * would read as a difference and the allowance would never apply.
     */
    const PANEL = 'app-left-tabs, .panel, app-edit-panel, app-native-inspector';
    const nativeOnly = (element) => {
      if (element.hasAttribute?.('data-native-only'))
        return element.getAttribute('data-native-only');
      if (element.matches?.(PANEL)) return undefined;
      const inner = element.querySelector?.('[data-native-only]');
      return inner && label(element) === label(inner)
        ? inner.getAttribute('data-native-only')
        : undefined;
    };
    /** The three toggles the joint-type block stands in for, on the public side. */
    const isStateToggle = (node) =>
      node instanceof Element &&
      node.tagName === 'TOGGLE-BLOCK' &&
      /^(Grounded|Slider|Welded)\b/.test(label(node));
    const node = (element) => {
      if (element.nodeType === Node.TEXT_NODE) {
        const text = element.textContent.replace(/\s+/g, ' ').trim();
        return text === '' ? null : text;
      }
      if (!(element instanceof Element)) return null;
      if (element.tagName === 'STYLE' || element.tagName === 'SCRIPT') return null;
      const css = getComputedStyle(element);
      // Nothing a reader cannot see takes part in a comparison about what a
      // reader sees; a hidden subtree's text is not text on screen.
      if (css.display === 'none' || css.visibility === 'hidden') return null;
      const marked = nativeOnly(element);
      if (marked) return { sentinel: marked };
      const attrs = [...element.attributes]
        .filter((a) => /^(aria-|role$|title$|disabled$|type$)/.test(a.name))
        .map((a) => [a.name, scrub(a.value)])
        .sort((a, b) => a[0].localeCompare(b[0]));
      const children = [];
      for (const child of element.childNodes) {
        if (collapse && isStateToggle(child)) {
          // One sentinel for the whole run, whatever the run's length: the
          // native block replaces all three at once.
          if (children.at(-1)?.sentinel !== 'joint-type') children.push({ sentinel: 'joint-type' });
          continue;
        }
        const built = node(child);
        if (built !== null) children.push(built);
      }
      return {
        tag: HOSTS[element.tagName] ?? element.tagName,
        attrs,
        style: STYLES.map((key) => css[key]),
        children,
      };
    };
    const root = document.querySelector(selector);
    return root ? node(root) : null;
  })();

// ---- comparing two trees -----------------------------------------------------

const summarize = (value) => {
  if (value === null || value === undefined) return '(absent)';
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 70));
  if (value.sentinel) return `«${value.sentinel}»`;
  const text = (function collect(node) {
    if (typeof node === 'string') return node;
    if (!node?.children) return '';
    return node.children.map(collect).join(' ');
  })(value)
    .replace(/\s+/g, ' ')
    .trim();
  return `<${value.tag}>${text ? ' ' + JSON.stringify(text.slice(0, 50)) : ''}`;
};

const STYLE_NAMES = [
  'color',
  'background',
  'font-size',
  'font-family',
  'font-weight',
  'letter-spacing',
  'border-radius',
  'box-shadow',
  'opacity',
];

/** Walk both trees together and say, in reader's terms, where they part. */
function diffTrees(expected, actual, path, found) {
  if (found.length >= DIFF_LIMIT) return found;
  const differ = (what, a, b) => found.push({ path, what, expected: a, actual: b });
  if (typeof expected === 'string' || typeof actual === 'string') {
    if (expected !== actual) differ('text', summarize(expected), summarize(actual));
    return found;
  }
  if (!expected || !actual) {
    if (expected !== actual) differ('element', summarize(expected), summarize(actual));
    return found;
  }
  if (expected.sentinel || actual.sentinel) {
    if (expected.sentinel !== actual.sentinel)
      differ('the one allowed block', summarize(expected), summarize(actual));
    return found;
  }
  // A tag difference is reported and then walked past. The two panels are
  // served by two components, so a wrapper that differs would otherwise hide
  // every difference inside it -- and the list of what is inside is the whole
  // value of this gate while the two are still converging.
  if (expected.tag !== actual.tag) differ('tag', summarize(expected), summarize(actual));
  const attrsOf = (node) => Object.fromEntries(node.attrs);
  const [ea, aa] = [attrsOf(expected), attrsOf(actual)];
  for (const name of new Set([...Object.keys(ea), ...Object.keys(aa)]))
    if (ea[name] !== aa[name])
      differ(`@${name} on <${expected.tag}>`, ea[name] ?? '(absent)', aa[name] ?? '(absent)');
  expected.style.forEach((value, index) => {
    if (value !== actual.style[index])
      differ(`${STYLE_NAMES[index]} on <${expected.tag}>`, value, actual.style[index]);
  });
  if (expected.children.length !== actual.children.length)
    differ(
      `children of <${expected.tag}>`,
      `${expected.children.length}: ${expected.children.map(summarize).join(' · ').slice(0, 160)}`,
      `${actual.children.length}: ${actual.children.map(summarize).join(' · ').slice(0, 160)}`
    );
  const count = Math.max(expected.children.length, actual.children.length);
  for (let i = 0; i < count && found.length < DIFF_LIMIT; i++)
    diffTrees(
      expected.children[i],
      actual.children[i],
      `${path} > ${expected.tag}[${i}]`.replace(/^ > /, ''),
      found
    );
  return found;
}

// ---- pictures ----------------------------------------------------------------

const clamp = (box) => ({
  x: Math.max(0, Math.floor(box.x)),
  y: Math.max(0, Math.floor(box.y)),
  width: Math.min(VIEWPORT.width - Math.max(0, Math.floor(box.x)), Math.ceil(box.width)),
  height: Math.min(VIEWPORT.height - Math.max(0, Math.floor(box.y)), Math.ceil(box.height)),
});

const unionBox = (boxes) => {
  const present = boxes.filter(Boolean);
  if (!present.length) return null;
  const x = Math.min(...present.map((b) => b.x));
  const y = Math.min(...present.map((b) => b.y));
  return clamp({
    x,
    y,
    width: Math.max(...present.map((b) => b.x + b.width)) - x,
    height: Math.max(...present.map((b) => b.y + b.height)) - y,
  });
};

/** Public, native and their difference in one strip, for a person to look at. */
function strip(images) {
  const gap = 12;
  const height = Math.max(...images.map((i) => i.height));
  const width = images.reduce((sum, i) => sum + i.width, 0) + gap * (images.length - 1);
  const sheet = new PNG({ width, height });
  sheet.data.fill(24);
  for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] = 255;
  let left = 0;
  for (const image of images) {
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const from = (y * image.width + x) * 4;
        const to = (y * width + left + x) * 4;
        for (let c = 0; c < 4; c++) sheet.data[to + c] = image.data[from + c];
      }
    left += image.width + gap;
  }
  return sheet;
}

/**
 * Compare two shots of the same box, ignoring the masked rectangles — which is
 * only ever the one joint-type block, and only ever in a panel.
 */
function comparePixels(a, b, masks) {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  let changed = 0;
  let largest = 0;
  const masked = (x, y) =>
    masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const from = { a: (y * a.width + x) * 4, b: (y * b.width + x) * 4 };
      let delta = 0;
      for (let c = 0; c < 3; c++) {
        const value = Math.abs(a.data[from.a + c] - b.data[from.b + c]);
        diff.data[offset + c] = masked(x, y) ? 40 : value;
        delta = Math.max(delta, value);
      }
      diff.data[offset + 3] = 255;
      if (masked(x, y)) continue;
      largest = Math.max(largest, delta);
      if (delta > MAX_CHANNEL_DELTA) changed++;
    }
  return {
    diff,
    changed,
    largest,
    sameSize: a.width === b.width && a.height === b.height,
    width: [a.width, b.width],
    height: [a.height, b.height],
  };
}

// ---- driving the two routes --------------------------------------------------

const browser = await chromium.launch({ headless: !process.env.PMKS_HEADED });
const pages = [];
const errors = [[], []];
const states = [];
const fixtures = JSON.parse(await readFile('src/test-data/native-shell-fixtures.json', 'utf8'));
const wanted = process.env.PMKS_PARITY_FIXTURES?.split(',').map((name) => name.trim());

const both = async (action) => {
  const results = [];
  for (const [index, page] of pages.entries()) results.push(await action(page, index));
  return results;
};

/** Hold still: the canvas is fitted after the decode, and the joints land last. */
async function settle(page, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let last = null;
  let since = null;
  while (Date.now() < deadline) {
    const frame = await page.evaluate(() =>
      [...document.querySelectorAll('[id^="joint_"], [data-mark-id]')]
        .map((node) => {
          const box = node.getBoundingClientRect();
          return `${Math.round(box.x)},${Math.round(box.y)}`;
        })
        .join(' ')
    );
    if (frame === last) {
      since ??= Date.now();
      if (Date.now() - since >= 200) return;
    } else since = null;
    last = frame;
    await page.waitForTimeout(40);
  }
}

async function open(fixture) {
  await both(async (page, index) => {
    const url =
      index === NATIVE
        ? `${nativeBase}/?editor=native&document=${encodeURIComponent(fixture.native)}`
        : `${publicBase}/?${fixture.legacy}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (index === NATIVE) {
      await page.locator('app-native-grid').waitFor({ state: 'attached' });
      await page.locator('#bootSplash').waitFor({ state: 'detached' });
    } else {
      await waitForReady(page);
    }
    await settle(page);
    await page.evaluate(() => document.fonts.ready);
  });
}

const centerOf = async (page, selector, timeout = 8000) => {
  const target = page.locator(selector).first();
  await target.waitFor({ state: 'attached', timeout });
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  });
};

/** What the panel says it is editing, which is how a click is known to have landed. */
const panelTitle = (page) =>
  page
    .locator('app-left-tabs')
    .innerText({ timeout: 3000 })
    .then((text) => text.split('\n')[0].trim())
    .catch(() => '');

/** A point that is bare canvas on both routes, so one right-click means one thing. */
async function emptyPoint() {
  const occupied = ([x, y]) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return true;
    return !!element.closest(
      '[data-mark-id],[data-body-id],[id^="joint_"],#linkHolder,#forcesHolder,#jointHolder,' +
        'app-left-tabs,app-top-bar,app-playback-bar,app-view-controls,app-bottombar,' +
        'app-right-panel,app-context-menu,.material,.joint-mark,.hit-target'
    );
  };
  for (let y = 720; y >= 220; y -= 40)
    for (let x = 1160; x >= 400; x -= 40) {
      const free = await both((page) => page.evaluate(occupied, [x, y]).then((hit) => !hit));
      if (free.every(Boolean)) return { x, y };
    }
  throw new Error('no point on the grid is bare on both routes');
}

let neutral = { x: 700, y: 700 };

/**
 * One comparison: the region as a tree and as pixels, the difference written
 * down, and a strip a person can look at.
 */
/**
 * The dev server draws a compile error over the whole page and dims what is
 * under it. Two agents are converging on these files, so a run can easily catch
 * one mid-edit -- and a state photographed through that overlay says nothing
 * about parity. It is recorded rather than waited out: the run goes on, and the
 * report says which states were taken through an overlay.
 */
const overlaid = (page) =>
  page.evaluate(
    () =>
      !!document.querySelector(
        'vite-error-overlay,[id*="error-overlay" i],[class*="error-overlay" i]'
      )
  );

async function compare(name, region) {
  const isPanel = region === 'app-left-tabs';
  const overlays = await both(overlaid);
  if (overlays.some(Boolean))
    console.log(
      `NOTE ${name}: a dev-server error overlay is on screen ` +
        `(${overlays
          .map((on, i) => (on ? sideName(i) : null))
          .filter(Boolean)
          .join(', ')})` +
        ' — this state is not evidence'
    );
  const boxes = await both((page) =>
    page
      .locator(isPanel ? 'app-left-tabs .panel' : region)
      .first()
      .boundingBox()
      .catch(() => null)
  );
  const box = unionBox(boxes);
  const trees = await both((page, index) =>
    page.evaluate(readTree, [region, isPanel && index === PUBLIC])
  );
  const masks = [];
  let slotHeights = null;
  if (isPanel && box) {
    // The same rule the tree uses: the block, widened to the host that holds it
    // and nothing else, so the mask is that one block's box and not a pixel more.
    // On the public side the same slot is the run of state toggles the block
    // stands in for — masked there too, or the allowance would only be half
    // applied and the toggles would read as a difference in the picture.
    const rects = await both((page) =>
      page
        .evaluate(() => {
          const text = (node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
          let block = document.querySelector('[data-native-only="joint-type"]');
          if (!block) {
            const toggles = [...document.querySelectorAll('app-left-tabs toggle-block')].filter(
              (node) => /^(Grounded|Slider|Welded)\b/.test(text(node))
            );
            if (!toggles.length) return null;
            const boxes = toggles.map((node) => node.getBoundingClientRect());
            const x = Math.min(...boxes.map((b) => b.x));
            const y = Math.min(...boxes.map((b) => b.y));
            return {
              x,
              y,
              width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
              height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
              stoodInFor: 'the Grounded / Slider / Welded toggles',
            };
          }
          const stop = 'app-left-tabs, .panel, app-edit-panel, app-native-inspector';
          while (
            block.parentElement &&
            !block.parentElement.matches(stop) &&
            text(block.parentElement) === text(block)
          )
            block = block.parentElement;
          const box = block.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })
        .catch(() => null)
    );
    for (const rect of rects.filter(Boolean))
      masks.push({
        x: Math.max(0, Math.floor(rect.x - box.x)),
        y: Math.max(0, Math.floor(rect.y - box.y)),
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      });
    // A block that is not the height of the one it replaces moves everything
    // under it, and then a panel that is otherwise identical differs in pixels
    // all the way down. That is worth saying as a number rather than leaving
    // the reader to find it in a diff.
    if (rects[PUBLIC] && rects[NATIVE])
      slotHeights = {
        public: Math.round(rects[PUBLIC].height),
        native: Math.round(rects[NATIVE].height),
        shift: Math.round(rects[NATIVE].height - rects[PUBLIC].height),
      };
  }
  const shots = box
    ? await both(async (page) => {
        await page.evaluate(() => document.fonts.ready);
        return PNG.sync.read(await page.screenshot({ clip: box, animations: 'disabled' }));
      })
    : [];
  const state = {
    name,
    region,
    box,
    boxes,
    mask: {
      // The gate's one allowance. When the native panel does not yet carry the
      // attribute there is nothing to mask, and nothing is excused.
      declared: masks.length > 0,
      rects: masks,
      // How tall the one allowed block is on each side, and by how much it
      // therefore pushes everything below it out of line.
      slotHeights,
    },
    devOverlay: overlays.map((on, index) => (on ? sideName(index) : null)).filter(Boolean),
    dom: { differences: [] },
    pixels: null,
    files: {},
  };
  if (!trees[PUBLIC] || !trees[NATIVE]) {
    state.dom.differences.push({
      path: region,
      what: 'region present',
      expected: trees[PUBLIC] ? 'present' : '(absent)',
      actual: trees[NATIVE] ? 'present' : '(absent)',
    });
  } else {
    diffTrees(trees[PUBLIC], trees[NATIVE], region, state.dom.differences);
  }
  state.dom.equal = state.dom.differences.length === 0;
  state.dom.truncated = state.dom.differences.length >= DIFF_LIMIT;
  await writeFile(
    `${out}/${name}-dom.json`,
    JSON.stringify({ public: trees[PUBLIC], native: trees[NATIVE] }, null, 1)
  );
  state.files.dom = `${name}-dom.json`;
  if (shots.length === 2) {
    const result = comparePixels(shots[PUBLIC], shots[NATIVE], masks);
    const boxesMatch =
      boxes.every(Boolean) &&
      ['x', 'y', 'width', 'height'].every(
        (key) => Math.round(boxes[PUBLIC][key]) === Math.round(boxes[NATIVE][key])
      );
    state.pixels = {
      changed: result.changed,
      largestDelta: result.largest,
      // The two cards must also be the same size and in the same place. They are
      // photographed through one box so the pixels can be subtracted at all, so
      // that has to be said separately rather than read off the images.
      boxesMatch,
      publicBox: boxes[PUBLIC],
      nativeBox: boxes[NATIVE],
      total: result.diff.width * result.diff.height,
    };
    await writeFile(
      `${out}/${name}.png`,
      PNG.sync.write(strip([shots[PUBLIC], shots[NATIVE], result.diff]))
    );
    state.files.strip = `${name}.png`;
  }
  state.identical =
    state.dom.equal && !!state.pixels && state.pixels.changed === 0 && state.pixels.boxesMatch;
  states.push(state);
  const pixelNote = state.pixels
    ? `${state.pixels.changed} px differ (peak ${state.pixels.largestDelta})` +
      (state.pixels.boxesMatch ? '' : ', and the two cards are not the same box') +
      (state.mask?.slotHeights?.shift
        ? ` — the joint-type block is ${state.mask.slotHeights.shift} px taller than the toggles it replaces, which moves everything under it`
        : '')
    : 'no box to photograph';
  console.log(
    `${state.identical ? 'PASS' : 'FAIL'} ${name}: ` +
      `${state.dom.differences.length}${state.dom.truncated ? '+' : ''} DOM differences · ${pixelNote}`
  );
  for (const difference of state.dom.differences.slice(0, 8))
    console.log(
      `        ${difference.path} — ${difference.what}\n` +
        `          public: ${difference.expected}\n          native: ${difference.actual}`
    );
  if (state.dom.differences.length > 8)
    console.log(`        … ${state.dom.differences.length - 8} more in ${name}-dom.json`);
}

/**
 * One state, however it goes. A gesture that cannot be made on one route is a
 * difference to write down, not a reason to abandon the other twenty states:
 * the whole point of the first run of this gate is the complete list.
 */
async function guarded(name, region, run) {
  let failure = null;
  try {
    await run();
    return;
  } catch (error) {
    failure = error;
  }
  // The dev server live-reloads while two other agents edit the native editor,
  // and the app strips its own query string once it has decoded it -- so a
  // reload comes back to an empty grid and every mark a gesture wanted is gone.
  // That is the server's doing, not the route's, so the drawing is put back and
  // the state is tried once more before it is written down as a difference.
  try {
    if (currentFixture) {
      console.log(`  (re-opening ${currentFixture.key}: the drawing went away mid-state)`);
      await open(currentFixture);
      await run();
      return;
    }
  } catch (second) {
    failure = second;
  }
  {
    const error = failure;
    states.push({
      name,
      region,
      identical: false,
      dom: {
        equal: false,
        differences: [
          {
            path: name,
            what: 'the gesture could not be made',
            expected: 'both routes answer it',
            actual: String(error.message).replace(/\s+/g, ' ').slice(0, 220),
          },
        ],
      },
      pixels: null,
      files: {},
    });
    console.log(`FAIL ${name}: ${String(error.message).replace(/\s+/g, ' ').slice(0, 180)}`);
    await both((page) => page.keyboard.press('Escape').catch(() => {}));
  }
}

/** Which pair is open, so a state that loses the drawing can put it back. */
let currentFixture = null;

/** Left-click a thing on both routes, then compare the Edit panel it opened. */
const panelFor = (name, selectors) =>
  guarded(name, 'app-left-tabs', async () => {
    await both(async (page, index) => {
      const before = await panelTitle(page);
      for (let attempt = 0; attempt < 2; attempt++) {
        const at = await centerOf(page, selectors[index]);
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(700);
        if ((await panelTitle(page)) !== before) break;
      }
      await page.mouse.move(neutral.x, neutral.y);
      await page.waitForTimeout(250);
    });
    await compare(name, 'app-left-tabs');
  });

/** Right-click a thing on both routes, then compare the menu it opened. */
const menuFor = (name, selectors) =>
  guarded(name, 'app-context-menu', async () => {
    await both(async (page, index) => {
      const at = selectors[index]
        ? await centerOf(page, selectors[index])
        : { x: neutral.x, y: neutral.y };
      await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForTimeout(600);
    });
    await compare(name, 'app-context-menu');
    await both(async (page) => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    });
  });

const selectorsFor = (kind, label) => VOCABULARY.map((route) => route[kind](label));
const countOn = (page, index) => page.evaluate(VOCABULARY[index].labels);

/**
 * The same part on both routes.
 *
 * Usually the two call it the same thing and there is nothing to decide. Some
 * paired fixtures do not: `Three_Machines` names its native bodies "Crank" and
 * "Rocker coupler" where the public route calls the same bars AB and IJ. That
 * disagreement is itself worth reporting — a reader sees a different name in
 * the panel's title — but it must not cost the fixture every one of its states,
 * so the part is then taken to be **the one in the same place on screen**, and
 * the naming is written down as a difference of its own.
 */
async function pairPart(kind, fixtureKey) {
  const places = await both((page, index) => page.evaluate(VOCABULARY[index].places));
  const [ours, theirs] = places.map((side) => side[kind]);
  if (!ours.length || !theirs.length) return null;
  const shared = ours
    .map((part) => part.name)
    .filter((name) => theirs.some((part) => part.name === name))
    .sort();
  if (shared.length) {
    // The second where there is one: the first joint in these drawings is the
    // grounded input, whose panel is the least of what a reader ever opens.
    const name = kind === 'joints' ? shared[Math.min(1, shared.length - 1)] : shared[0];
    const single = kind === 'joints' ? 'joint' : 'link';
    return { name, label: name, selectors: selectorsFor(single, name), matchedBy: 'name' };
  }
  let best = null;
  for (const mine of ours)
    for (const other of theirs) {
      const distance = Math.hypot(mine.x - other.x, mine.y - other.y);
      if (!best || distance < best.distance) best = { distance, mine, other };
    }
  const single = kind === 'joints' ? 'joint' : 'link';
  console.log(
    `  ${fixtureKey}: no ${single} is named the same on both routes — pairing by position, ` +
      `public "${best.mine.name}" with native "${best.other.name}" (${Math.round(best.distance)} px apart)`
  );
  states.push({
    name: `${fixtureKey}-${single}-naming`,
    region: 'naming',
    identical: false,
    dom: {
      equal: false,
      differences: [
        {
          path: `the ${single} at (${best.mine.x}, ${best.mine.y})`,
          what: 'what the two routes call the same part',
          expected: best.mine.name,
          actual: best.other.name,
        },
      ],
    },
    pixels: null,
    files: {},
  });
  return {
    name: `${best.mine.name}-as-${best.other.name}`,
    label: best.mine.name,
    selectors: [
      VOCABULARY[PUBLIC][single](best.mine.name),
      VOCABULARY[NATIVE][single](best.other.name),
    ],
    matchedBy: 'position',
  };
}

/**
 * Give both routes a force to talk about. No paired fixture ships one, and the
 * plan's acceptance names a force, so one is drawn through the menu the reader
 * would use. How many gestures each route needs is itself worth writing down.
 */
async function drawForce(selectors) {
  const gestures = await both(async (page, index) => {
    try {
      return await draw(page, index);
    } catch (error) {
      return 'refused: ' + String(error.message).replace(/\s+/g, ' ').slice(0, 90);
    }
  });
  return gestures;

  async function draw(page, index) {
    const at = await centerOf(page, selectors[index]);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.waitForTimeout(500);
    const row = page.locator('app-context-menu').getByText('Force', { exact: true }).first();
    if (!(await row.count())) return 'no Force row in the menu';
    await row.click();
    await page.waitForTimeout(600);
    if ((await countOn(page, index)).forces > 0) return 'one click';
    // The public route arms a placement and waits for where to put it.
    await page.mouse.click(at.x + 40, at.y + 40);
    await page.waitForTimeout(700);
    return (await countOn(page, index)).forces > 0 ? 'click then place' : 'no force appeared';
  }
}

try {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await startQuiet(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors[index].push(String(error).slice(0, 300)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors[index].push(message.text().slice(0, 300));
    });
    pages.push(page);
  }

  for (const fixture of fixtures.filter((f) => !wanted || wanted.includes(f.key))) {
    console.log(`\n=== ${fixture.key} ===`);
    try {
      await runFixture(fixture);
    } catch (error) {
      console.log(
        `FAIL ${fixture.key}: the pair could not be walked — ` +
          String(error.message).replace(/\s+/g, ' ').slice(0, 200)
      );
      states.push({
        name: `${fixture.key}-pair`,
        region: 'fixture',
        identical: false,
        dom: {
          equal: false,
          differences: [
            {
              path: fixture.key,
              what: 'the paired drawing could not be walked',
              expected: 'both routes open it and answer gestures',
              actual: String(error.message).replace(/\s+/g, ' ').slice(0, 220),
            },
          ],
        },
        pixels: null,
        files: {},
      });
    }
  }

  async function runFixture(fixture) {
    currentFixture = fixture;
    await open(fixture);
    const inventory = await both((page, index) => countOn(page, index));
    const joint = await pairPart('joints', fixture.key);
    const link = await pairPart('links', fixture.key);
    if (!joint || !link) {
      console.log(
        `SKIP ${fixture.key}: one route drew no joint or no link ` +
          `(public ${JSON.stringify(inventory[PUBLIC])}, native ${JSON.stringify(inventory[NATIVE])})`
      );
      return;
    }
    neutral = await emptyPoint();

    await panelFor(`${fixture.key}-panel-joint-${joint.name}`, joint.selectors);
    await panelFor(`${fixture.key}-panel-link-${link.name}`, link.selectors);
    const cylinders = Math.min(inventory[PUBLIC].cylinders, inventory[NATIVE].cylinders);
    if (cylinders > 0) await panelFor(`${fixture.key}-panel-cylinder`, selectorsFor('cylinder'));

    await menuFor(`${fixture.key}-menu-grid`, [null, null]);
    await menuFor(`${fixture.key}-menu-joint-${joint.name}`, joint.selectors);
    await menuFor(`${fixture.key}-menu-link-${link.name}`, link.selectors);
    if (cylinders > 0) await menuFor(`${fixture.key}-menu-cylinder`, selectorsFor('cylinder'));

    // Forces last: drawing one changes the drawing everything above compared.
    const gestures = await drawForce(link.selectors);
    const forces = await both((page, index) => countOn(page, index).then((c) => c.forces));
    console.log(
      `  force: public took ${gestures[PUBLIC]} (${forces[PUBLIC]} on the canvas), ` +
        `native took ${gestures[NATIVE]} (${forces[NATIVE]} on the canvas)`
    );
    states.push({
      name: `${fixture.key}-force-creation`,
      region: 'gesture',
      identical: gestures[PUBLIC] === gestures[NATIVE] && forces[PUBLIC] > 0 && forces[NATIVE] > 0,
      dom: {
        equal: gestures[PUBLIC] === gestures[NATIVE],
        differences:
          gestures[PUBLIC] === gestures[NATIVE]
            ? []
            : [
                {
                  path: 'context menu > Force',
                  what: 'gestures a reader needs to draw a force',
                  expected: gestures[PUBLIC],
                  actual: gestures[NATIVE],
                },
              ],
      },
      pixels: null,
      files: {},
    });
    if (forces[PUBLIC] > 0 && forces[NATIVE] > 0) {
      await panelFor(`${fixture.key}-panel-force`, selectorsFor('force'));
      await menuFor(`${fixture.key}-menu-force`, selectorsFor('force'));
    } else {
      console.log('  (no force on one of the routes — its panel and menu were not compared)');
    }
  }
} finally {
  const differing = states.filter((state) => !state.identical);
  /**
   * The same wrong color on forty rows is one thing to fix, not forty. The
   * differences are therefore also grouped by what they are and counted, so
   * whoever picks this report up reads a list of jobs rather than a transcript.
   */
  const commonest = (region) => {
    const tally = new Map();
    for (const state of states.filter((s) => s.region === region))
      for (const difference of state.dom.differences) {
        const key = `${difference.what} — public ${difference.expected} · native ${difference.actual}`;
        const seen = tally.get(key) ?? { what: key, count: 0, states: new Set() };
        seen.count += 1;
        seen.states.add(state.name);
        tally.set(key, seen);
      }
    return [...tally.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((entry) => ({ ...entry, states: [...entry.states] }));
  };
  const top = { panel: commonest('app-left-tabs'), menu: commonest('app-context-menu') };
  const report = {
    at: new Date().toISOString(),
    publicBase,
    nativeBase,
    viewport: VIEWPORT,
    maxChannelDelta: MAX_CHANNEL_DELTA,
    summary: {
      states: states.length,
      identical: states.length - differing.length,
      differing: differing.length,
      panelsDiffering: differing.filter((s) => s.region === 'app-left-tabs').length,
      menusDiffering: differing.filter((s) => s.region === 'app-context-menu').length,
      maskDeclared: states.some((s) => s.mask?.declared),
      takenThroughADevOverlay: states.filter((s) => s.devOverlay?.length).map((s) => s.name),
    },
    commonestDifferences: top,
    states,
    errors: { public: errors[PUBLIC], native: errors[NATIVE] },
  };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1));
  console.log(
    `\n${report.summary.identical}/${report.summary.states} states match · ` +
      `${report.summary.panelsDiffering} panels and ${report.summary.menusDiffering} menus differ`
  );
  for (const [region, entries] of Object.entries(top)) {
    if (!entries.length) continue;
    console.log(`\nWhat the ${region}s differ about most:`);
    for (const entry of entries)
      console.log(`  ${String(entry.count).padStart(3)} × ${entry.what.slice(0, 200)}`);
  }
  if (!report.summary.maskDeclared)
    console.log(
      'No element carried data-native-only="joint-type", so nothing was masked and ' +
        'nothing was excused.'
    );
  for (const side of [PUBLIC, NATIVE])
    if (errors[side].length)
      console.log(
        `${sideName(side)} browser errors (${errors[side].length}): ` +
          [...new Set(errors[side])].slice(0, 5).join(' | ')
      );
  console.log(`report and strips in ${out}/`);
  await browser.close();
  process.exitCode = differing.length ? 1 : 0;
}
