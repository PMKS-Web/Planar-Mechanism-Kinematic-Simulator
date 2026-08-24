// Hover animations for the mechanism library, taken from the running app.
//
// A card shows a still at rest and fades a loop in under the pointer. The five
// original templates always had that pair; every mechanism added since had only
// a still, so hovering them did nothing. This captures the loop the same way
// template-thumbnails.mjs captures the still — open the template's own URL, let
// the app fit the view, hide the chrome, and clip the canvas — except that it
// steps the mechanism through its own cycle and writes the frames as a GIF.
//
// The clip is the union of every frame's bounding box rather than the first
// frame's, or a mechanism with a long stroke would walk out of its own picture.
//
// Frames come from `animate(sample, false)`, which is a seek: the loop is
// therefore the solved cycle at even intervals, and closes exactly. Capturing
// in real time instead would land wherever the wall clock happened to be.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/template-animations.mjs
//   ONLY=Jansen_Leg,Pantograph node e2e/template-animations.mjs

import { readFileSync, mkdtempSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLAYWRIGHT = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(PLAYWRIGHT + '/node_modules/playwright/index.mjs');
const { default: GIFEncoder } = await import(PLAYWRIGHT + '/node_modules/gif-encoder/lib/GIFEncoder.js');
const { PNG } = await import(PLAYWRIGHT + '/node_modules/pngjs/lib/png.js');
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const SOURCE = 'src/app/component/MODALS/templates/template-linkages.ts';
const CATALOG = 'src/app/component/MODALS/templates/template-catalog.ts';
const ASSETS = 'src/assets/gifs';

/** The card's own size, matching the stills and the original GIFs. */
const WIDTH = 828;
const HEIGHT = 520;
/** Enough for the motion to read; every frame is a full-size image in the file. */
const FRAMES = 14;
/** One cycle in about two seconds, whatever the template's own playback speed is. */
const FRAME_DELAY_MS = 140;

/** id -> asset basename, from the catalog's own rows: one list, not two. */
function wanted() {
  // Split into row objects first: the category list above the cards also has
  // `id:` fields, and one regex swept across the file pairs an id from one row
  // with a thumbnail from another.
  const source = readFileSync(CATALOG, 'utf8');
  const only = process.env.ONLY?.split(',').map((one) => one.trim());
  return source
    .split('\n  {\n')
    .map((row) => {
      const id = row.match(/^\s*id: '([\w-]+)',/m)?.[1];
      const name = row.match(/thumbnail: 'assets\/gifs\/([\w-]+)\.png'/)?.[1];
      return id && name ? { id, name } : undefined;
    })
    .filter((row) => row !== undefined)
    .filter(({ id }) => !only || only.includes(id));
}

/** The generated block of template-linkages.ts, read as id/payload pairs. */
function payloads() {
  const source = readFileSync(SOURCE, 'utf8');
  return Object.fromEntries(
    [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, payload]) => [
      id,
      payload,
    ])
  );
}

const scratch = mkdtempSync(join(tmpdir(), 'pmks-anim-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const all = payloads();
const written = [];

for (const { id, name } of wanted()) {
  const payload = all[id];
  if (!payload) {
    console.log(`${id}: no payload, skipped`);
    continue;
  }
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  // Grid, ruling and axes off, exactly as template-thumbnails.mjs shoots the
  // still. Without it the loop carries the grid while the still does not, so
  // hovering a card swapped a clean white picture for one with a ruled panel
  // and two blue axes in it — a border appearing out of nowhere around the
  // thing the pointer had just landed on.
  await page.evaluate(() => {
    ng.getComponent(document.querySelector('app-new-grid')).settings.tempGridDisable = true;
  });
  // Two real pointer events: the first schedules the change detection a value
  // set from outside Angular would not, the second parks the cursor somewhere
  // no link will light up and print its own name onto the picture.
  await page.mouse.move(750, 500);
  await page.mouse.move(4, 4);
  await page.addStyleTag({
    content:
      'app-top-bar, app-bottombar, app-left-tabs, app-right-panel, app-playback-bar,' +
      ' app-view-controls { display: none !important }',
  });
  await page.waitForTimeout(700);

  const samples = await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return Math.max(...srv.mechanisms.map((one) => one.joints.length), 0);
  });
  if (samples < 2) {
    console.log(`${id}: nothing solved, skipped`);
    continue;
  }
  // The last sample of a closed cycle is the first pose again, so it is left
  // out: a GIF that repeats a frame stutters once every loop.
  const steps = Array.from({ length: FRAMES }, (_, index) =>
    Math.round((index * (samples - 1)) / FRAMES)
  );

  /** The box the mechanism needs over the whole cycle, not just at rest. */
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const step of steps) {
    await page.evaluate((at) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      grid.mechanismSrv.animate(at, false);
    }, step);
    await page.waitForTimeout(60);
    const frame = await page.evaluate(() => {
      const rects = [
        '#linkHolder',
        '#jointHolder',
        '#sliderHolder',
        '#railHolder',
        '#motorHolder',
        '#motorArrowHolder',
        '#pathsHolder',
      ]
        .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
        .filter((rect) => rect && rect.width > 0 && rect.height > 0);
      return {
        left: Math.min(...rects.map((r) => r.left)),
        top: Math.min(...rects.map((r) => r.top)),
        right: Math.max(...rects.map((r) => r.right)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      };
    });
    box.left = Math.min(box.left, frame.left);
    box.top = Math.min(box.top, frame.top);
    box.right = Math.max(box.right, frame.right);
    box.bottom = Math.max(box.bottom, frame.bottom);
  }

  const pad = 0.1 * Math.max(box.right - box.left, box.bottom - box.top);
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  let width = box.right - box.left + 2 * pad;
  let height = box.bottom - box.top + 2 * pad;
  if (width / height < WIDTH / HEIGHT) width = (height * WIDTH) / HEIGHT;
  else height = (width * HEIGHT) / WIDTH;
  const view = page.viewportSize();
  const clip = {
    x: Math.max(0, Math.min(cx - width / 2, view.width - width)),
    y: Math.max(0, Math.min(cy - height / 2, view.height - height)),
    width: Math.min(width, view.width),
    height: Math.min(height, view.height),
  };

  const shots = [];
  for (const [index, step] of steps.entries()) {
    await page.evaluate((at) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      grid.mechanismSrv.animate(at, false);
    }, step);
    await page.waitForTimeout(60);
    const raw = join(scratch, `${name}-${String(index).padStart(2, '0')}.png`);
    await page.screenshot({ path: raw, animations: 'disabled', clip });
    // To card size here rather than in the encoder: sips is what the stills are
    // scaled with, so the loop and the still land on exactly the same grid.
    const sized = join(scratch, `${name}-${String(index).padStart(2, '0')}-fit.png`);
    execFileSync('sips', [
      '-s', 'format', 'png',
      '-z', String(HEIGHT), String(WIDTH),
      raw, '--out', sized,
    ]);
    shots.push(sized);
  }

  // A frame is 828 x 520 x 4 bytes, and the encoder buffers what it has not
  // been read from yet; the default watermark is a fraction of one frame.
  const encoder = new GIFEncoder(WIDTH, HEIGHT, { highWaterMark: 96 * 1024 * 1024 });
  const out = createWriteStream(join(scratch, `${name}.gif`));
  encoder.pipe(out);
  encoder.setRepeat(0);
  encoder.setDelay(FRAME_DELAY_MS);
  encoder.setQuality(12);
  encoder.writeHeader();
  for (const shot of shots) {
    const png = PNG.sync.read(readFileSync(shot));
    encoder.addFrame(png.data);
  }
  encoder.finish();
  await new Promise((resolve) => out.on('close', resolve));
  written.push({ name, from: join(scratch, `${name}.gif`) });
  console.log(`${id}: ${FRAMES} frames over ${samples} samples`);
}

await browser.close();

// Only now: anything written under src/ makes the dev server reload the page
// mid-run, which lands on the query-stripped URL and decodes an empty grid.
for (const { name, from } of written) {
  writeFileSync(join(ASSETS, `${name}.gif`), readFileSync(from));
  console.log(`wrote ${ASSETS}/${name}.gif`);
}
rmSync(scratch, { recursive: true, force: true });
