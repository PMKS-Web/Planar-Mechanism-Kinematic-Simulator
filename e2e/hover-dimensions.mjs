/**
 * Every dimension the canvas draws while a field is pointed at, in one style.
 *
 * Pointing at a number in the Edit panel draws that number on the grid, where
 * it is measured. There are ten of them now -- a bar's length and angle, a
 * joint's distance and bearing to a neighbor, a center of mass's two offsets, a
 * cylinder member's length and the part's angle, where the rod starts, a slot's
 * angle -- and they arrived at different times. The later ones were drawn in
 * their own ink at their own model-scaled width, with a bare label wearing a
 * halo, so a reader who pointed at a cylinder's *Starts at* got a
 * different-looking thing from the one who pointed at a bar's Length, and the
 * difference said nothing.
 *
 * So this is a style check, not a geometry one: every dimension carries a chip,
 * every chip is the same size in screen pixels, every hairline is the same
 * weight, and every angle is written in the unit the reader chose. It fails on
 * the next one that is drawn a new way.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/hover-dimensions.mjs
 */

import { mkdirSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/hover-dimensions';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Whatever dimension is on the canvas right now, described. */
const drawn = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#canvas g.hoverDimension')].map((group) => {
      const text = group.querySelector('.dimensionPill text');
      return {
        chip: !!group.querySelector('.dimensionPill rect'),
        label: text ? text.textContent.trim() : null,
        font: text ? Number(text.getAttribute('font-size')) : null,
        // The thinnest hairline: one dimension draws a second, heavier segment
        // to show how far along its travel a ram has gone.
        hairline: Math.min(
          ...[...group.querySelectorAll('.hairline line, .hairline path')].map((one) =>
            Number(one.getAttribute('stroke-width'))
          )
        ),
      };
    })
  );

/** Point at every field of the open panel and collect the dimensions they raise. */
async function dimensionsOf(template, select) {
  await openMechanism(page, `${BASE}/?${payloads[template]}`);
  await page.locator('.tabButton', { hasText: 'Edit' }).first().click();
  await page.waitForTimeout(600);
  await page.evaluate(select);
  await page.waitForTimeout(800);

  const fields = page.locator('app-edit-panel .customInputForm');
  const found = [];
  for (let index = 0; index < (await fields.count()); index++) {
    const field = fields.nth(index);
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(450);
    for (const dimension of await drawn()) found.push({ ...dimension, template, index });
    // Off the panel entirely, so the next hover starts from nothing.
    await page.mouse.move(1400, 900);
    await page.waitForTimeout(200);
  }
  return found;
}

const all = [];
all.push(
  ...(await dimensionsOf('4-Bar', () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const bar = grid.mechanismSrv.links[1];
    bar.mass = 5;
    grid.mechanismSrv.updateMechanism();
    grid.activeObjService.updateSelectedObj(bar);
  }))
);
all.push(
  ...(await dimensionsOf('4-Bar', () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints[1]);
  }))
);
// A cylinder answers in two panels now: a member states its own Length and the
// part's Angle, and the slide states the Slider Angle and where the rod starts.
all.push(
  ...(await dimensionsOf('Cylinder_Boom', () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const body = grid.mechanismSrv.links.find((link) => grid.mechanismSrv.cylinderOfBar(link));
    grid.activeObjService.updateSelectedObj(body);
  }))
);
all.push(
  ...(await dimensionsOf('Cylinder_Boom', () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.sealedStructures()[0].seal);
  }))
);
all.push(
  ...(await dimensionsOf('Slider_Crank', () => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const block = grid.mechanismSrv.joints.find((joint) => joint.constructor.name === 'PrisJoint');
    grid.activeObjService.updateSelectedObj(block);
  }))
);

record('pointing at fields draws dimensions on the canvas at all', all.length >= 8, all.length);
record(
  'every one of them carries a chip',
  all.every((one) => one.chip && one.label),
  all.filter((one) => !one.chip || !one.label)
);
// Screen pixels, so the ratio of type to line is fixed even though the absolute
// numbers move with the zoom each drawing opens at.
const ratios = all.map((one) => Math.round((one.font / one.hairline) * 10) / 10);
record('at one size relative to its hairline, whatever the zoom', new Set(ratios).size === 1, {
  ratios: [...new Set(ratios)],
});
record(
  'and no dimension is drawn in a model-scaled weight',
  all.every((one) => one.hairline > 0 && one.hairline < 10),
  all.map((one) => one.hairline)
);

// Angles used to be spelled three ways: "12 deg" from the shared formatter and
// a hand-written "45°" on the slot guide, which also went on saying degrees to
// a reader who had asked for radians.
const angles = all.filter((one) => /deg|rad|°/.test(one.label ?? ''));
record(
  'every angle is spelled the way the app spells angles',
  angles.length >= 3 && angles.every((one) => / (deg|rad)$/.test(one.label)),
  angles.map((one) => one.label)
);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.settings.angleUnit.next(11); // AngleUnit.RADIAN
});
const inRadians = await dimensionsOf('Slider_Crank', () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.settings.angleUnit.next(11);
  const block = grid.mechanismSrv.joints.find((joint) => joint.constructor.name === 'PrisJoint');
  grid.activeObjService.updateSelectedObj(block);
});
const radianAngles = inRadians.filter((one) => /deg|rad/.test(one.label ?? ''));
record(
  'and follows the reader into radians, the slot guide with the rest',
  radianAngles.length > 0 && radianAngles.every((one) => / rad$/.test(one.label)),
  radianAngles.map((one) => one.label)
);

// A member's Length is the member's own span, and its Angle is the part's one
// bearing (decision D10). Both used to be drawn end joint to end joint, which
// is what the whole cylinder measures: the rod's field read 0.89 cm and
// hovering it drew 1.97 cm across the part. So the chip has to read what the
// field reads, exactly, character for character.
async function memberChipVersusField(which) {
  await openMechanism(page, `${BASE}/?${payloads['Cylinder_Boom']}`);
  await page.locator('.tabButton', { hasText: 'Edit' }).first().click();
  await page.waitForTimeout(600);
  await page.evaluate((part) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const one = grid.mechanismSrv.sealedStructures()[0];
    grid.activeObjService.updateSelectedObj(part === 'barrel' ? one.barrel : one.rod);
  }, which);
  await page.waitForTimeout(700);

  const seen = {};
  for (const row of ['length', 'angle']) {
    const field = page.locator(`[data-hold-field="${row}"]`).first();
    await field.hover({ force: true });
    await page.waitForTimeout(450);
    const [drawnNow] = await drawn();
    seen[row] = {
      field: (await field.inputValue()).trim(),
      chip: drawnNow ? drawnNow.label : null,
    };
    await page.mouse.move(1400, 900);
    await page.waitForTimeout(200);
  }
  // What the part measures end to end, for the length to be shown *not* to be.
  seen.span = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const one = grid.mechanismSrv.sealedStructures()[0];
    return grid.nup.formatModelLength(
      Math.hypot(one.mountB.x - one.mountA.x, one.mountB.y - one.mountA.y),
      grid.settings.lengthUnit.getValue()
    );
  });
  return seen;
}

for (const which of ['barrel', 'rod']) {
  const seen = await memberChipVersusField(which);
  record(
    `the ${which}'s length chip reads exactly what its Length field reads`,
    seen.length.chip === seen.length.field,
    seen.length
  );
  record(
    `and measures the ${which} rather than the whole cylinder`,
    seen.length.chip !== seen.span || seen.length.field === seen.span,
    { ...seen.length, span: seen.span }
  );
  record(
    `the ${which}'s angle chip reads exactly what its Angle field reads`,
    seen.angle.chip === seen.angle.field,
    seen.angle
  );
}

await page.screenshot({ path: `${OUT}/last.png` });
record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
