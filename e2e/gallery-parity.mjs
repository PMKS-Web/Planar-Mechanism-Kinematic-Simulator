/**
 * Every story in the gallery, drawn by two builds, compared pixel for pixel.
 *
 * `reuse-parity.mjs` compares the *app*. That is the wrong half for a change
 * that edits `mytheme.scss` or moves a stylesheet, because the gallery builds
 * its own page and prepends the global stylesheets itself -- so a rule that
 * stops reaching the gallery can leave the app untouched and still strip the
 * background off every card in the docs. A reader reported exactly that, and
 * the app suite was green at the time.
 *
 * So this enumerates the stories from Storybook's own `index.json` and
 * photographs each one's iframe on both servers. No hand-kept list: a story
 * added tomorrow is compared tomorrow.
 *
 *   npm run storybook -- --port 4320            # this branch
 *   (cd <base worktree> && npm run storybook -- --port 4321)
 *
 *   PMKS_GALLERY_URL=http://localhost:4320 \
 *   PMKS_GALLERY_BASE_URL=http://localhost:4321 \
 *   PMKS_PLAYWRIGHT_DIR=.. node e2e/gallery-parity.mjs
 *
 * `--only <substring>` narrows to matching story ids. Mismatches are saved
 * under `artifacts/gallery-parity/` as the two shots and a red-on-grey mask.
 *
 * Docs pages are skipped: they carry a "Show code" block whose content is the
 * story's own source, so every source edit would fail them for no visual
 * reason. Stories are the pixels; the docs page is the prose around them.
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';

const AFTER = process.env.PMKS_GALLERY_URL ?? 'http://localhost:4320';
const BEFORE = process.env.PMKS_GALLERY_BASE_URL ?? 'http://localhost:4321';
const OUT = 'artifacts/gallery-parity';
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;

mkdirSync(OUT, { recursive: true });

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Ask Storybook what stories it has, so this suite never holds a stale list. */
async function storyIds(page, base) {
  const index = await page.evaluate(async (origin) => {
    const answer = await fetch(`${origin}/index.json`);
    return answer.ok ? answer.json() : null;
  }, base);
  if (!index) throw new Error(`${base} served no index.json`);
  return Object.values(index.entries ?? index.stories ?? {})
    .filter((entry) => entry.type !== 'docs')
    .map((entry) => entry.id)
    .sort();
}

/** Decode two PNGs, count what differs, and draw a mask worth looking at. */
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
        return { sizeMismatch: { before: [ib.width, ib.height], after: [ia.width, ia.height] } };
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
      let worst = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d =
          Math.abs(pa[i] - pb[i]) +
          Math.abs(pa[i + 1] - pb[i + 1]) +
          Math.abs(pa[i + 2] - pb[i + 2]) +
          Math.abs(pa[i + 3] - pb[i + 3]);
        if (d !== 0) {
          differing++;
          if (d > worst) worst = d;
          mask.data[i] = 255;
          mask.data[i + 3] = 255;
        } else {
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
        mask: out.toDataURL('image/png').split(',')[1],
      };
    },
    [a.toString('base64'), b.toString('base64')]
  );
}

/** Photograph one story, once it has stopped moving. */
async function shoot(page, base, id) {
  await page.goto(`${base}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      caret-color: transparent !important;
    }`,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) {
    const left = await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try {
          a.finish();
        } catch {
          /* an infinite animation is not something a story should be photographing */
        }
      }
      return document.getAnimations().filter((a) => a.playState === 'running').length;
    });
    if (!left) break;
    await page.waitForTimeout(40);
  }
  let shot = await page.screenshot();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(150);
    const again = await page.screenshot();
    if (again.equals(shot)) return shot;
    shot = again;
  }
  return shot;
}

const browser = await chromium.launch();
const viewport = { width: 900, height: 620 };
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

// Ask the *branch* what stories exist: a story this branch added has no
// counterpart to compare and is reported as new rather than as a failure.
await after.goto(`${AFTER}/iframe.html?id=x&viewMode=story`, { waitUntil: 'domcontentloaded' });
const mine = await storyIds(after, AFTER);
await before.goto(`${BEFORE}/iframe.html?id=x&viewMode=story`, { waitUntil: 'domcontentloaded' });
const theirs = new Set(await storyIds(before, BEFORE));

const shared = mine.filter((id) => theirs.has(id)).filter((id) => !only || id.includes(only));
const added = mine.filter((id) => !theirs.has(id));
console.log(`Comparing ${shared.length} story/ies; ${added.length} new on this branch\n`);

for (const id of shared) {
  let shotA;
  let shotB;
  try {
    [shotB, shotA] = await Promise.all([shoot(before, BEFORE, id), shoot(after, AFTER, id)]);
  } catch (e) {
    record(`story ${id}`, false, { threw: String(e).slice(0, 200) });
    continue;
  }
  if (shotA.equals(shotB)) {
    record(`story ${id}`, true);
    continue;
  }
  const diff = await diffPngs(worker, shotA, shotB);
  const stem = `${OUT}/${id.replace(/[^a-z0-9]+/gi, '-')}`;
  writeFileSync(`${stem}.before.png`, shotB);
  writeFileSync(`${stem}.after.png`, shotA);
  if (diff.mask) writeFileSync(`${stem}.diff.png`, Buffer.from(diff.mask, 'base64'));
  record(`story ${id}`, false, {
    ...(diff.sizeMismatch ? { sizeMismatch: diff.sizeMismatch } : {}),
    ...(diff.differing !== undefined
      ? { differingPixels: diff.differing, of: diff.total, worstChannelSum: diff.worst }
      : {}),
    saved: `${stem}.{before,after,diff}.png`,
  });
}

if (added.length)
  console.log(`\nNew on this branch (nothing to compare):\n  ${added.join('\n  ')}`);
record('no page errors', errors.length === 0, errors.slice(0, 6));

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`Look at the saved shots in ${OUT}/ — a mismatch is drawn as a red mask.`);
  process.exit(1);
}
