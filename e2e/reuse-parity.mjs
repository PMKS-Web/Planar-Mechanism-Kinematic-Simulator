/**
 * Pixel parity between two builds of the app.
 *
 * The reuse backlog replaces hand-rolled copies of a block with the block
 * itself. Every one of those edits is supposed to be invisible: the same
 * pixels, drawn by shared code instead of copied code. "Supposed to be" is
 * the problem — a 1px border or a 13px label that only the copy had is
 * exactly the kind of drift the copies exist to explain, and it is invisible
 * in a diff of the source.
 *
 * So this drives two servers through the same scripted states and compares
 * the screenshots. Point it at a dev server running the refactor and one
 * running the branch's base:
 *
 *   PMKS_BASE_URL=http://localhost:4300 \
 *   PMKS_PARITY_BASE_URL=http://localhost:4301 \
 *   PMKS_PLAYWRIGHT_DIR=.. node e2e/reuse-parity.mjs
 *
 * A scene names a region and the clicks that reach it. Both pages are driven
 * by the same function, so a scene that stops matching is either a real
 * change or a scene that has gone stale — the saved PNGs under
 * `artifacts/reuse-parity/` say which, and a mismatch writes the two shots
 * and a red-on-grey diff mask beside them.
 *
 * Pass `--only <substring>` to run a subset while iterating on one item.
 *
 * Comparison is exact. Both sides are the same Chromium on the same machine
 * drawing the same DOM, so anti-aliasing is not a source of noise here and a
 * tolerance would only hide the 1px drift this is looking for. Scenes avoid
 * the animated canvas for the same reason.
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { ALL_LINKAGES as payloads } from './template-payloads.mjs';
import { SCENES } from './reuse-parity-scenes.mjs';

const AFTER = process.env.PMKS_BASE_URL ?? 'http://localhost:4300';
const BEFORE = process.env.PMKS_PARITY_BASE_URL ?? 'http://localhost:4301';
const OUT = 'artifacts/reuse-parity';
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;

mkdirSync(OUT, { recursive: true });

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/**
 * Decode two PNGs and count the pixels that differ.
 *
 * Done in the browser because it already has a PNG decoder and a canvas, and
 * the alternative is a dependency the repo does not carry. Returns the count,
 * the bounding box of the damage — which is what tells you *which* control
 * moved — and a mask to look at.
 */
async function diffPngs(page, a, b) {
  return page.evaluate(
    async ([aB64, bB64]) => {
      const load = (b64) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = 'data:image/png;base64,' + b64;
        });
      const [ia, ib] = await Promise.all([load(aB64), load(bB64)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return {
          sizeMismatch: { before: [ib.width, ib.height], after: [ia.width, ia.height] },
        };
      }
      const pixels = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const out = document.createElement('canvas');
      out.width = ia.width;
      out.height = ia.height;
      const octx = out.getContext('2d');
      const mask = octx.createImageData(ia.width, ia.height);
      let differing = 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      let worst = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d =
          Math.abs(pa[i] - pb[i]) +
          Math.abs(pa[i + 1] - pb[i + 1]) +
          Math.abs(pa[i + 2] - pb[i + 2]) +
          Math.abs(pa[i + 3] - pb[i + 3]);
        const px = (i / 4) % ia.width;
        const py = Math.floor(i / 4 / ia.width);
        if (d !== 0) {
          differing++;
          if (d > worst) worst = d;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          mask.data[i] = 255;
          mask.data[i + 1] = 0;
          mask.data[i + 2] = 0;
          mask.data[i + 3] = 255;
        } else {
          // Keep the unchanged picture as a faint grey ghost, so the red marks
          // can be read against the control they are on.
          const grey = 210 + Math.round((pa[i] + pa[i + 1] + pa[i + 2]) / 3 / 12);
          mask.data[i] = grey;
          mask.data[i + 1] = grey;
          mask.data[i + 2] = grey;
          mask.data[i + 3] = 255;
        }
      }
      octx.putImageData(mask, 0, 0);
      return {
        differing,
        total: pa.length / 4,
        worst,
        box: differing ? { minX, minY, maxX, maxY } : null,
        mask: out.toDataURL('image/png').split(',')[1],
      };
    },
    [a.toString('base64'), b.toString('base64')]
  );
}

/**
 * Jump every animation to its end, then let two frames paint.
 *
 * Zeroing the CSS durations is not enough on its own: the drawer and the mode
 * card are Angular animations, which run through the Web Animations API and
 * ignore a stylesheet. Waiting for them is not enough either — the two pages
 * settle a frame apart, which leaves the drawer's card a fraction of a pixel
 * from where the other one put it. An element screenshot is taken at that box,
 * so the whole card clips on different subpixels and the diff comes back as a
 * dashed red outline around everything: a 1700-pixel mismatch, two channels
 * deep, that is entirely the harness.
 *
 * `finish()` removes the timing from the question. Finishing one animation can
 * start the next (the drawer opens, then its page fades), so this loops until
 * the list stays empty.
 */
async function settleAnimations(page, rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    const left = await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try {
          a.finish();
        } catch {
          // A running infinite animation cannot be finished; it also is not
          // something a scene should be photographing.
        }
      }
      return document.getAnimations().filter((a) => a.playState === 'running').length;
    });
    if (!left) break;
    await page.waitForTimeout(30);
  }
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
}

/** Drive one page to one scene and photograph the region the scene names. */
async function shoot(page, base, scene) {
  const linkage = scene.linkage ?? '4-Bar';
  const query = scene.query ?? (linkage ? `?${payloads[linkage]}` : '');
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  // Freeze anything that could still be easing, so a scene is a pose and not
  // a moment. Both sides get the same treatment, but a shot taken mid-slide
  // compares one transition against another and fails at random.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      caret-color: transparent !important;
    }
    /* The drawing is not what these scenes are about, and it is the one thing
       on screen that does not land identically twice: the fit-to-view settles
       a fraction of a unit apart between two loads. Every card here floats
       over it with a rounded corner or a transparent margin, so that fraction
       came back as a dashed red outline around all of them. The suites that
       own the canvas compare the canvas. */
    app-new-grid { visibility: hidden !important; }
    body { background: #8a8a8a !important; }`,
  });
  // The mode strip's highlight is placed from a measurement of the tab under
  // it, so it has to be measured after the webfont has replaced the fallback
  // — otherwise the highlight lands a fraction of a pixel out and the strip
  // comes back differing by twenty pixels, four channel-units deep.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  if (scene.setup) await scene.setup(page);
  await page.waitForTimeout(scene.settle ?? 400);
  await settleAnimations(page);

  const target = scene.clip ? page.locator(scene.clip).first() : null;
  if (target) await target.waitFor({ state: 'visible', timeout: 8000 });
  const capture = () =>
    target
      ? target.screenshot({ animations: 'disabled' })
      : page.screenshot({ animations: 'disabled', clip: scene.region });

  // Photograph only once the picture has stopped changing. Waiting a fixed
  // time instead is what produced this suite's first, entirely false, run:
  // identical code on both ports, and a dashed red outline around every card,
  // because one side had finished a fade the other was still a frame into.
  let shot = await capture();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(180);
    const again = await capture();
    if (again.equals(shot)) return shot;
    shot = again;
  }
  throw new Error(`scene "${scene.name}" never held still`);
}

const browser = await chromium.launch();
const viewport = { width: 1500, height: 950 };
const before = await browser.newPage({ viewport });
const after = await browser.newPage({ viewport });
const worker = await browser.newPage({ viewport: { width: 200, height: 200 } });
const errors = [];
for (const [label, page] of [
  ['before', before],
  ['after', after],
]) {
  page.on('pageerror', (e) => errors.push(`${label}: ${e}`));
}

const scenes = SCENES.filter((s) => !only || s.name.includes(only));
console.log(`Comparing ${scenes.length} scene(s): after=${AFTER} before=${BEFORE}\n`);

/**
 * A mismatch is only believed when it happens twice.
 *
 * What is left after settling and hiding the drawing is the compositor: a card
 * whose shadow rasterizes a shade differently depending on whether the layer
 * it sits on was promoted, which happens when an animation has just run on it.
 * Measured over three full runs of identical code, that surfaced once, on one
 * scene, as a ring around the card's edge.
 *
 * Re-shooting costs a few seconds and does not blunt the check: a real change
 * — a border, a size, an ink — is in every shot of that scene, so it survives
 * the second look. Noise does not.
 */
for (const scene of scenes) {
  const stem = `${OUT}/${scene.name.replace(/[^a-z0-9]+/gi, '-')}`;
  let attempt = 0;
  let verdict = null;

  while (attempt < 2) {
    attempt++;
    let shotA;
    let shotB;
    try {
      [shotB, shotA] = await Promise.all([
        shoot(before, BEFORE, scene),
        shoot(after, AFTER, scene),
      ]);
    } catch (e) {
      verdict = { ok: false, detail: { threw: String(e).slice(0, 300) } };
      break;
    }

    if (shotA.equals(shotB)) {
      verdict = { ok: true, detail: attempt > 1 ? { settledOnRetry: true } : undefined };
      break;
    }

    const diff = await diffPngs(worker, shotA, shotB);
    verdict = {
      ok: false,
      detail: {
        ...(diff.sizeMismatch ? { sizeMismatch: diff.sizeMismatch } : {}),
        ...(diff.differing !== undefined
          ? {
              differingPixels: diff.differing,
              of: diff.total,
              worstChannelSum: diff.worst,
              box: diff.box,
            }
          : {}),
        saved: `${stem}.{before,after,diff}.png`,
        confirmedBy: attempt,
      },
      write: () => {
        writeFileSync(`${stem}.before.png`, shotB);
        writeFileSync(`${stem}.after.png`, shotA);
        if (diff.mask) writeFileSync(`${stem}.diff.png`, Buffer.from(diff.mask, 'base64'));
      },
    };
  }

  if (verdict.ok) {
    record(`scene ${scene.name}`, true, verdict.detail);
  } else {
    verdict.write?.();
    record(`scene ${scene.name}`, false, verdict.detail);
  }
}

record('no page errors', errors.length === 0, errors.slice(0, 6));

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`Look at the saved shots in ${OUT}/ — a mismatch is drawn as a red mask.`);
  process.exit(1);
}
