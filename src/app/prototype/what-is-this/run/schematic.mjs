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
//
// From v5 (the manifest's `prompt`), the axes are hidden -- nobody's zero means
// anything -- and a library card's background image is put up behind the
// mechanism, as the app does when the card is opened. A mechanism PMKS+ cannot
// solve is captured once, as drawn.
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
const { cases, prompt } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const v5 = prompt === 'v5';
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
  ...(v5 ? ['[id="axes"]', '[id="axes_numbers"]'] : []),
];

const browser = await chromium.launch();
for (const entry of templates) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.addInitScript(() => localStorage.setItem('drawingStyle', 'schematic'));
  const page = await context.newPage();
  const payload = entry.appUrl.slice(entry.appUrl.indexOf('?') + 1);
  const backdrop = entry.backdrop ? `#backdrop=${encodeURIComponent(entry.backdrop)}` : '';
  await page.goto(`${base}/?${payload}${backdrop}`, { waitUntil: 'domcontentloaded' });
  // A mechanism that solves has its samples; one that does not still has its joints.
  const still = entry.film.length === 1 && entry.film[0].label.startsWith('as drawn');
  await page.waitForFunction(
    (still) => {
      const grid = document.querySelector('app-new-grid');
      const g = grid && window.ng?.getComponent(grid);
      if (!g) return false;
      return still
        ? g.mechanismSrv.joints.length > 0
        : (g.mechanismSrv.masterMechanism()?.joints.length ?? 0) > 1;
    },
    still,
    { timeout: 20000 }
  );
  if (backdrop) {
    await page
      .waitForFunction(() => !!document.querySelector('#backgroundImageHolder image'), null, {
        timeout: 10000,
      })
      .catch(() => console.warn(`${entry.template}: the background image did not appear`));
  }
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
  let box = await cycleBox(page, still, !!backdrop);
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
  box = await cycleBox(page, still, !!backdrop);
  const clip = {
    x: Math.max(0, box.x0 - PAD),
    y: Math.max(0, box.y0 - PAD),
    width: Math.min(W, box.x1 + PAD) - Math.max(0, box.x0 - PAD),
    height: Math.min(H, box.y1 + PAD) - Math.max(0, box.y0 - PAD),
  };

  const tiles = [];
  for (const [i, frame] of entry.film.entries()) {
    if (!still)
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

/**
 * Where every joint goes over the whole cycle, in window pixels -- or where it
 * stands, for a mechanism with no cycle -- and the background image with it,
 * which is context the picture should keep.
 */
function cycleBox(page, still, withBackdrop) {
  return page.evaluate(
    ({ still, withBackdrop }) => {
      const g = window.ng.getComponent(document.querySelector('app-new-grid'));
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const take = (x, y) => {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      };
      const frames = still ? [g.mechanismSrv.joints] : g.mechanismSrv.masterMechanism().joints;
      for (const frame of frames) {
        for (const joint of frame) {
          const at = g.svgGrid.modelToScreen({ x: joint.x, y: joint.y });
          take(at.x, at.y);
        }
      }
      const image = withBackdrop && document.querySelector('#backgroundImageHolder image');
      if (image) {
        const r = image.getBoundingClientRect();
        take(r.left, r.top);
        take(r.right, r.bottom);
      }
      return box;
    },
    { still, withBackdrop }
  );
}

/** The frames in a grid two wide (one frame alone), each with its number and moment above it, through Pillow. */
async function tile(tiles, out) {
  const script = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
tiles = json.loads(sys.argv[1])
ims = [Image.open(t['path']).convert('RGB') for t in tiles]
w = max(im.width for im in ims); h = max(im.height for im in ims)
scale = min(1.0, (640 if len(ims) > 1 else 960) / w)
w, h = int(w * scale), int(h * scale)
head, gap = 34, 10
cols = min(2, len(ims))
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols + 1) * gap, rows * (h + head) + (rows + 1) * gap), (214, 217, 225))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 20)
except Exception:
    font = ImageFont.load_default()
for i, (t, im) in enumerate(zip(tiles, ims)):
    r, c = divmod(i, cols)
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
