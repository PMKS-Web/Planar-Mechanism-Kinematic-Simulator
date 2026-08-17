/**
 * The background image, exercised the way a hand would: right-click the grid,
 * pick a picture, watch it land behind the linkage, move and resize and fade it
 * from the panel, prove it cannot be clicked or dragged, prove it rides the
 * grid's own zoom, and delete it.
 *
 *   PMKS_BASE_URL=<origin> node e2e/background-image.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4710';
const SHOTS = new URL('../artifacts/background-image/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const closeTour = async () => {
  const skip = page.locator('.introjs-skipbutton').first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ force: true });
    await page.waitForTimeout(300);
  }
};

const image = () =>
  page.evaluate(() => {
    const el = document.querySelector('#backgroundImageHolder image');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Number(el.getAttribute('x')),
      y: Number(el.getAttribute('y')),
      width: Number(el.getAttribute('width')),
      height: Number(el.getAttribute('height')),
      opacity: Number(el.getAttribute('opacity')),
      screen: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });

const menuLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#contextMenu #menu-item')].map((item) => item.innerText.trim())
  );

const closeMenu = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};

/** Type into one of the panel's fields and blur, which is when it commits. */
const typeField = async (label, value) => {
  const field = page
    .locator('input-block, dual-input-block')
    .filter({ hasText: label })
    .locator('input')
    .first();
  await field.click();
  await field.fill(value);
  await field.blur();
  await page.waitForTimeout(350);
};

/**
 * A picture with a shape and a handedness: 2:1, red on the left half, blue on
 * the right. Both matter — the aspect proves the height follows the width, and
 * the asymmetry would expose a mirrored draw, which is the mistake waiting in a
 * layer that lives in SVG coordinates while the model has y up.
 */
const pngBuffer = async () => {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(200, 0, 200, 200);
    // A stripe along the top edge only, so an up/down flip is visible too.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 400, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
};

await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForReady(page);
await closeTour();
await page.waitForTimeout(400);

const emptyGrid = { x: 1150, y: 720 };

// --- The menu offers the picture before there is one ------------------------

await page.mouse.click(emptyGrid.x, emptyGrid.y, { button: 'right' });
await page.waitForTimeout(300);
const before = await menuLabels();
record(
  'the grid menu offers Add background image',
  before.some((label) => label === 'Add background image'),
  before
);
await closeMenu();

// --- Picking a file places it and opens its panel ---------------------------

const buffer = await pngBuffer();
const filePath = SHOTS + 'rig.png';
writeFileSync(filePath, buffer);

await page.setInputFiles('input.offscreenFileInput', {
  name: 'rig.png',
  mimeType: 'image/png',
  buffer,
});
await page.waitForTimeout(600);

const placed = await image();
record('the picture is drawn behind the grid', placed !== null, placed);
record(
  'it keeps the file’s own proportions',
  placed && Math.abs(placed.height / placed.width - 0.5) < 1e-6,
  placed
);
record(
  'the panel opens on it',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return (
      c.activeObjService.objType === 'BackgroundImage' &&
      !!document.querySelector('app-edit-panel .bgTitle')
    );
  })
);
record(
  'the panel names the file it came from',
  (await page.locator('app-edit-panel .bgFileName').innerText()).trim() === 'rig.png'
);
record(
  'the panel says the picture is not in the share link',
  (await page.locator('app-edit-panel .bgNote').innerText()).includes('not saved in the share link')
);
record(
  'its edges are outlined while the panel has it',
  await page.evaluate(() => !!document.querySelector('.bgImageOutline'))
);
await page.screenshot({ path: SHOTS + '01-placed.png' });

// --- It is behind the linkage and cannot be touched -------------------------

record(
  'it is drawn under every part of the mechanism',
  // svg-pan-zoom moves every layer into a viewport group of its own, so the
  // layer order lives one level down from the canvas.
  await page.evaluate(() => {
    const layers = document.querySelector('#backgroundImageHolder').parentElement;
    const order = [...layers.children].map((node) => node.id);
    const bg = order.indexOf('backgroundImageHolder');
    return bg > -1 && bg < order.indexOf('linkHolder') && bg < order.indexOf('jointHolder');
  }),
  await page.evaluate(() =>
    [...document.querySelector('#backgroundImageHolder').parentElement.children].map((n) => n.id)
  )
);
record(
  'the whole layer is deaf to the pointer',
  await page.evaluate(() => {
    const holder = document.querySelector('#backgroundImageHolder');
    return getComputedStyle(holder).pointerEvents === 'none';
  })
);

// A click that lands on the picture but on no part: the grid answers, not the
// picture, and dragging there pans as it always did rather than moving it.
const overPicture = await page.evaluate(() => {
  const rect = document.querySelector('#backgroundImageHolder image').getBoundingClientRect();
  return { x: rect.x + 24, y: rect.y + 24 };
});
await page.mouse.click(overPicture.x, overPicture.y);
await page.waitForTimeout(400);
record(
  'clicking the picture selects the grid, not the picture',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType === 'Grid'
  )
);

const beforeDrag = await image();
await page.mouse.move(overPicture.x, overPicture.y);
await page.mouse.down();
for (let step = 1; step <= 8; step++) {
  await page.mouse.move(overPicture.x + step * 12, overPicture.y + step * 8);
  await page.waitForTimeout(15);
}
await page.mouse.up();
await page.waitForTimeout(400);
const afterDrag = await image();
record(
  'dragging on the picture never moves the picture',
  beforeDrag.x === afterDrag.x && beforeDrag.y === afterDrag.y,
  { beforeDrag, afterDrag }
);

// --- The menu's second half: edit the one already there ---------------------

await page.mouse.click(overPicture.x, overPicture.y, { button: 'right' });
await page.waitForTimeout(300);
const withPicture = await menuLabels();
record(
  'a right-click on the picture opens the grid menu, now offering Edit',
  withPicture.some((label) => label === 'Edit background image') &&
    !withPicture.some((label) => label === 'Add background image'),
  withPicture
);
await page.locator('#contextMenu #menu-item', { hasText: 'Edit background image' }).first().click();
await page.waitForTimeout(400);
record(
  'that item opens the panel again',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType ===
      'BackgroundImage'
  )
);

// --- The placement fields -------------------------------------------------

const atOpen = await image();
await typeField('Image Center', '3');
const movedX = await image();
record(
  'typing an X slides the picture across the grid',
  Math.abs(movedX.x - atOpen.x - 3 * 200) < 1,
  { atOpen, movedX }
);

await typeField('Image Width', '8');
const resized = await image();
record('typing a width resizes the picture', Math.abs(resized.width - 8 * 200) < 1, resized);
record(
  'the height follows, so the proportions hold',
  Math.abs(resized.height / resized.width - 0.5) < 1e-6,
  resized
);

await typeField('Opacity', '25');
const faded = await image();
record('the opacity field fades the picture', Math.abs(faded.opacity - 0.25) < 1e-6, faded);
await page.screenshot({ path: SHOTS + '02-placed-and-faded.png' });

await typeField('Opacity', '400');
record(
  'an out-of-range opacity is held at solid rather than refused',
  (await image()).opacity === 1
);
await typeField('Opacity', '55');

// --- It rides the grid ------------------------------------------------------

const jointSpan = () =>
  page.evaluate(() => {
    const box = (id) =>
      document.querySelector(`#joint_${id}`).closest('svg[x]').getBoundingClientRect();
    return Math.abs(box('B').x - box('C').x);
  });

const spanBefore = await jointSpan();
const screenBefore = (await image()).screen.width;
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.svgGrid.zoomIn();
});
await page.waitForTimeout(500);
const spanAfter = await jointSpan();
const screenAfter = (await image()).screen.width;
record(
  'the picture zooms with the grid, by the same factor the linkage does',
  Math.abs(screenAfter / screenBefore - spanAfter / spanBefore) < 0.02,
  { screenBefore, screenAfter, spanBefore, spanAfter }
);

// --- Nothing about it reaches the URL or the undo history -------------------

record(
  'the picture is nowhere in the share URL',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const url = c.saveHistoryService.urlGenerationService.generateUrlQuery();
    return !url.includes('data:image') && url.length < 4000;
  })
);

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.saveHistoryService.undo();
});
await page.waitForTimeout(600);
record('an undo of the mechanism leaves the picture where it is', (await image()) !== null);

// --- Save closes the editor, Delete removes the picture ---------------------

await page.mouse.click(overPicture.x, overPicture.y, { button: 'right' });
await page.waitForTimeout(300);
await page.locator('#contextMenu #menu-item', { hasText: 'Edit background image' }).first().click();
await page.waitForTimeout(400);
await page.locator('app-edit-panel button-block', { hasText: 'Save' }).locator('button').click();
await page.waitForTimeout(500);
record(
  'Save closes the editor and takes the outline with it',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType !==
        'BackgroundImage' && !document.querySelector('.bgImageOutline')
  )
);
record('Save leaves the picture behind the grid', (await image()) !== null);
await page.screenshot({ path: SHOTS + '03-saved.png' });

// --- Scenery in the analysis modes too --------------------------------------

await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(2); // ANALYZE
});
await page.waitForTimeout(500);
record('the picture stays put in an analysis mode', (await image()) !== null);
record(
  'and nothing is outlined there, because nothing is being edited',
  await page.evaluate(() => !document.querySelector('.bgImageOutline'))
);
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(1); // EDIT
});
await page.waitForTimeout(400);

// --- Delete -----------------------------------------------------------------

await page.mouse.click(overPicture.x, overPicture.y, { button: 'right' });
await page.waitForTimeout(300);
await page.locator('#contextMenu #menu-item', { hasText: 'Edit background image' }).first().click();
await page.waitForTimeout(400);
await page.locator('app-edit-panel button-block', { hasText: 'Delete' }).locator('button').click();
await page.waitForTimeout(500);
record('Delete takes the picture off the canvas', (await image()) === null);

await page.mouse.click(emptyGrid.x, emptyGrid.y, { button: 'right' });
await page.waitForTimeout(300);
const after = await menuLabels();
record(
  'and the menu goes back to offering Add',
  after.some((label) => label === 'Add background image'),
  after
);
await closeMenu();
await page.screenshot({ path: SHOTS + '04-deleted.png' });

record('no page errors the whole way through', errors.length === 0, errors);

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${SHOTS}`);
await browser.close();
process.exit(failed.length ? 1 : 0);
