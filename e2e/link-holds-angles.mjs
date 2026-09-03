/**
 * The name, the chip and the center-of-mass mark on a locked bar, at eight
 * angles of the bar: none of the three may overlap another. Writes a contact
 * sheet to look at as well, which is the check that matters -- the boxes say
 * nothing about whether the arrangement reads.
 *
 *   PMKS_BASE_URL=<origin> node e2e/link-holds-angles.mjs
 */
import { chromium } from '/tmp/pmks-playwright/node_modules/playwright/index.mjs';
import { waitForReady } from './app-ready.mjs';
import { contactSheet } from './filmstrip.mjs';
import { mkdirSync, rmSync } from 'node:fs';
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4340';
const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';
const OUT = 'artifacts/link-holds-angles';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 950 },
  deviceScaleFactor: 2,
});
await page.goto(`${base}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(400);
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.settings.isShowCOM.next(true);
  c.mechanismSrv.setHold(
    c.mechanismSrv.links.find((l) => l.id === 'AB'),
    'length'
  );
  c.activeObjService.updateSelectedObj(undefined);
});
await page.waitForTimeout(400);
const overlaps = (a, b) =>
  !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
let bad = 0;
for (let step = 0; step < 8; step++) {
  const angle = step * 45;
  await page.evaluate((deg) => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const m = c.mechanismSrv;
    const a = m.joints.find((j) => j.id === 'A');
    const b = m.joints.find((j) => j.id === 'B');
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    c.gridUtils.dragJoint(b, {
      x: a.x + r * Math.cos((deg * Math.PI) / 180),
      y: a.y + r * Math.sin((deg * Math.PI) / 180),
    });
    c.activeObjService.updateSelectedObj(undefined);
  }, angle);
  await page.waitForTimeout(350);
  const boxes = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    };
    const chip = document.querySelector('[data-hold-chip="AB"]');
    const label = [...document.querySelectorAll('#linkTagHolder text')].find(
      (t) => t.textContent.trim() === 'AB'
    );
    const com = [...document.querySelectorAll('#comTagHolder svg')].find((s) =>
      s.querySelector('path')
    );
    const jr = (id) => rect(document.querySelector(`#joint_${id}`).closest('svg[x]'));
    return {
      chip: rect(chip),
      label: rect(label),
      com: com ? rect(com.querySelector('g') ?? com) : null,
      a: jr('A'),
      b: jr('B'),
    };
  });
  // Distance of a point from the bar's center line, in screen px.
  const ax = boxes.a.cx,
    ay = boxes.a.cy,
    bx = boxes.b.cx,
    by = boxes.b.cy;
  const len = Math.hypot(bx - ax, by - ay);
  const offLine = (p) => Math.abs((bx - ax) * (p.cy - ay) - (by - ay) * (p.cx - ax)) / len;
  const along = (p) => ((bx - ax) * (p.cx - ax) + (by - ay) * (p.cy - ay)) / len;
  const chipLabel = overlaps(boxes.chip, boxes.label);
  const chipCom = boxes.com ? overlaps(boxes.chip, boxes.com) : false;
  const labelCom = boxes.com ? overlaps(boxes.label, boxes.com) : false;
  // Both between the joints, along the bar. Distance off the bar's line is
  // reported but not judged: a name is anchored on its baseline, so its box
  // sits half a glyph above the line it is written on.
  const between = (p) => along(p) > 0 && along(p) < len;
  const ok = !chipLabel && !chipCom && !labelCom && between(boxes.chip) && between(boxes.label);
  if (!ok) bad++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${String(angle).padStart(3)} deg  chip/label ${chipLabel} chip/com ${chipCom} label/com ${labelCom} (chip off line ${offLine(boxes.chip).toFixed(1)} px, label ${offLine(boxes.label).toFixed(1)} px)`
  );
  const mx = (ax + bx) / 2,
    my = (ay + by) / 2;
  await page.screenshot({
    path: `${OUT}/${String(step).padStart(2, '0')}-${angle}.png`,
    clip: { x: mx - 150, y: my - 150, width: 300, height: 300 },
  });
}
await contactSheet(`${OUT}/*.png`, `${OUT}/sheet.png`, 4);
await browser.close();
console.log(bad === 0 ? 'all eight angles clean' : `${bad} angles with a problem`);
process.exit(bad === 0 ? 0 : 1);
