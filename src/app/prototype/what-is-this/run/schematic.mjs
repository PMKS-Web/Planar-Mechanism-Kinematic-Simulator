// PROTOTYPE: the picture the model is sent, captured from the app itself -- the
// Schematic drawing style, at the four moments the fact sheet lists -- and tiled
// into one 2x2 filmstrip per case.
//   SHEET=v4 PMKS_SCHEMATIC_URL=http://localhost:4311 node src/app/prototype/what-is-this/run/schematic.mjs
// Needs a development build (it reaches the app through window.ng) of a branch
// that has drawing styles, which is feature/drawing-styles until it merges.
//
// Why the app's own drawing: the prototype's plain SVG drew every joint as the
// same circle, so a slider, a pin in a slot and a cylinder all looked alike, and
// one still pose hid which way anything moved. The Schematic style draws each
// joint type as its symbol, and four moments show the motion.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const root = new URL(
  `../../../../../artifacts/what-is-this/${process.env.SHEET ?? 'v4'}/`,
  import.meta.url
).pathname;
const base = process.env.PMKS_SCHEMATIC_URL ?? 'http://localhost:4311';
const { cases } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const wanted = cases.filter((c) => c.image && c.film?.length);
const templates = [...new Map(wanted.map((c) => [c.template, c])).values()];
const run = promisify(execFile);
// A small window, so the app's fixed-size letters and symbols come out large
// once the frames are tiled; the whole cycle is zoomed to fill it.
const W = 960;
const H = 700;
const PAD = 44;

/** Everything but the canvas: the picture should hold the mechanism and nothing else. */
const CHROME = [
  'app-top-bar',
  'app-left-tabs',
  'app-playback-bar',
  'app-view-controls',
  'app-bottombar',
  'app-right-panel',
  'app-notification-stack',
  'app-linkage-table',
  'app-templates-popup',
  '.cdk-overlay-container',
  // Link names are whatever the author typed ("Wiper arm", "Hood"): the answer,
  // in the picture. Joint letters already name every link.
  '#linkTagHolder',
  // The faint start pose drawn away from the start reads as a second mechanism.
  '#startGhostHolder',
];

const browser = await chromium.launch();
for (const entry of templates) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.addInitScript(() => localStorage.setItem('drawingStyle', 'schematic'));
  const page = await context.newPage();
  const payload = entry.appUrl.slice(entry.appUrl.indexOf('?') + 1);
  await page.goto(`${base}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const grid = document.querySelector('app-new-grid');
      const g = grid && window.ng?.getComponent(grid);
      return (g?.mechanismSrv.masterMechanism()?.joints.length ?? 0) > 1;
    },
    null,
    { timeout: 20000 }
  );
  await page.evaluate(() => {
    const g = window.ng.getComponent(document.querySelector('app-new-grid'));
    g.settings.isShowMajorGrid.next(false);
    g.settings.isShowMinorGrid.next(false);
    g.settings.isShowCOM.next(false);
    g.settings.isShowID.next(true);
    g.settings.isShowTraces.next(true);
  });
  await page.addStyleTag({
    content: `${CHROME.join(', ')} { visibility: hidden !important; }`,
  });
  // The canvas re-frames itself once what it is fitting has been drawn.
  await page.waitForTimeout(900);

  // The app frames the start pose; a part that swings further leaves the view.
  // So the whole cycle's extent is measured, zoomed to fill the window and
  // centred, and measured again for one crop that all four frames share.
  let box = await cycleBox(page);
  const fit = Math.min(
    (W - 2 * PAD) / Math.max(box.x1 - box.x0, 1),
    (H - 2 * PAD) / Math.max(box.y1 - box.y0, 1)
  );
  await page.evaluate(
    ({ fit, box, W, H }) => {
      const g = window.ng.getComponent(document.querySelector('app-new-grid'));
      const zoom = g.svgGrid.panZoomObject;
      const cx = (box.x0 + box.x1) / 2;
      const cy = (box.y0 + box.y1) / 2;
      g.svgGrid.ourOwnMove(() => {
        zoom.zoomAtPointBy(fit, { x: cx, y: cy });
        zoom.panBy({ x: W / 2 - cx, y: H / 2 - cy });
      });
    },
    { fit, box, W, H }
  );
  await page.waitForTimeout(500);
  box = await cycleBox(page);
  const clip = {
    x: Math.max(0, box.x0 - PAD),
    y: Math.max(0, box.y0 - PAD),
    width: Math.min(W, box.x1 + PAD) - Math.max(0, box.x0 - PAD),
    height: Math.min(H, box.y1 + PAD) - Math.max(0, box.y0 - PAD),
  };

  const tiles = [];
  for (const [i, frame] of entry.film.entries()) {
    await page.evaluate((time) => {
      const g = window.ng.getComponent(document.querySelector('app-new-grid'));
      const times = g.mechanismSrv.masterMechanism().timeNum;
      let best = 0;
      times.forEach((t, k) => {
        if (Math.abs(t - time) < Math.abs(times[best] - time)) best = k;
      });
      g.mechanismSrv.animate(best, false);
    }, frame.time);
    await page.waitForTimeout(250);
    const path = join(root, 'cases', `${entry.template}.film-${i + 1}.png`);
    await page.screenshot({ path, clip });
    tiles.push({ path, label: `${i + 1}   ${frame.label}` });
  }
  await context.close();

  const out = join(root, entry.image);
  await tile(tiles, out);
  console.log(`${entry.template}: ${out}`);
}
await browser.close();

/** Where every joint goes over the whole cycle, in window pixels. */
function cycleBox(page) {
  return page.evaluate(() => {
    const g = window.ng.getComponent(document.querySelector('app-new-grid'));
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const frame of g.mechanismSrv.masterMechanism().joints) {
      for (const joint of frame) {
        const at = g.svgGrid.modelToScreen({ x: joint.x, y: joint.y });
        box.x0 = Math.min(box.x0, at.x);
        box.y0 = Math.min(box.y0, at.y);
        box.x1 = Math.max(box.x1, at.x);
        box.y1 = Math.max(box.y1, at.y);
      }
    }
    return box;
  });
}

/** Four frames in a 2x2 grid, each with its number and moment above it, through Pillow. */
async function tile(tiles, out) {
  const script = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
tiles = json.loads(sys.argv[1])
ims = [Image.open(t['path']).convert('RGB') for t in tiles]
w = max(im.width for im in ims); h = max(im.height for im in ims)
scale = min(1.0, 640 / w)
w, h = int(w * scale), int(h * scale)
head, gap = 34, 10
sheet = Image.new('RGB', (2 * w + 3 * gap, 2 * (h + head) + 3 * gap), (214, 217, 225))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 20)
except Exception:
    font = ImageFont.load_default()
for i, (t, im) in enumerate(zip(tiles, ims)):
    r, c = divmod(i, 2)
    x, y = gap + c * (w + gap), gap + r * (h + head + gap)
    draw.rectangle([x, y, x + w - 1, y + head - 1], fill=(255, 255, 255))
    draw.text((x + 10, y + 6), t['label'], fill=(30, 30, 30), font=font)
    sheet.paste(im.resize((w, h)), (x, y + head))
sheet.save(sys.argv[2])
`;
  for (const python of ['python3', '/usr/bin/python3', '/opt/homebrew/bin/python3']) {
    try {
      await run(python, ['-c', script, JSON.stringify(tiles), out]);
      return;
    } catch (error) {
      if (!/No module named 'PIL'|ENOENT/.test(String(error?.stderr ?? error))) throw error;
    }
  }
  throw new Error('No Python with Pillow found to tile the filmstrip');
}
