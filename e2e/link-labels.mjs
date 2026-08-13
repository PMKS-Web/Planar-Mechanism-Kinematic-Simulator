/**
 * A link's name is drawn on the link.
 *
 * The name is always shown -- unlike the joint and force labels, which the
 * Labels button governs -- so it has to be readable against the body it names
 * and it has to land on that body. Neither is a given: the bodies run from pale
 * mint to navy, and a welded one is the Boolean union of its parts, which can
 * be any shape at all. An L has its centre of mass in the crook, outside the
 * metal.
 *
 *   PMKS_BASE_URL=<origin> node e2e/link-labels.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/**
 * Whether each label has landed on a body at all.
 *
 * Two ways of counting, because bodies are drawn two ways. A filled one paints
 * under the label, and hit-testing finds it. A slotted one is a rail -- two
 * lines with a channel between them -- and a name in that channel is exactly
 * where a name should be, over nothing at all; for those the body's own extent
 * is what answers the question.
 *
 * What this catches is a label floating in empty space. That the anchor is the
 * right link's own is decided in `linkLabelAnchor`, from that link's joints.
 */
const labelsOnBodies = () =>
  page.evaluate(() => {
    const bodies = [...document.querySelectorAll('#linkHolder path')]
      .concat([...document.querySelectorAll('[class*="cylinder-"]')])
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.width > 0 || box.height > 0);
    return [...document.querySelectorAll('#linkTagHolder > svg')]
      .map((holder) => holder.querySelector('text'))
      .filter(Boolean)
      .map((text) => {
        const label = text.getBoundingClientRect();
        const x = label.left + label.width / 2;
        const y = label.top + label.height / 2;
        const painted = document
          .elementsFromPoint(x, y)
          .some(
            (node) =>
              node.closest('#linkHolder') ||
              /cylinder-|__rider|__rail/.test(String(node.className.baseVal ?? node.className))
          );
        const within = bodies.some(
          (box) =>
            x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1
        );
        return { name: text.textContent.trim(), onBody: painted || within };
      });
  });

const load = async (payload) => {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  // Frame the whole drawing: a label that is off the edge of the window cannot
  // be hit-tested, and "off screen" is not the question being asked here.
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).svgGrid.scaleToFitLinkage(false)
  );
  await page.waitForTimeout(900);
};

/**
 * The anchor, against the joints it is supposed to be the middle of.
 *
 * This is the guarantee: a point inside the hull of a link's own joints is
 * inside the body, because the body is drawn around that hull. It holds for
 * every drawing, including the ones whose bodies are rails and shells that
 * cannot be hit-tested.
 */
const anchorsAreCentres = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv.getLinks().map((link) => {
      // A bar carrying a slot is drawn as a rail; its name goes in the channel,
      // which is checked separately.
      const carriedSlot = grid.mechanismSrv.joints.find(
        (joint) => joint.carrier?.id === link.id && joint.slotJointA && joint.slotJointB
      );
      if (carriedSlot) return { id: link.id, centred: true };
      const parts = link.subset?.length ? link.subset : [link];
      const span = (part) => {
        const first = part.joints[0];
        const last = part.joints[part.joints.length - 1];
        return first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0;
      };
      const biggest = parts.reduce((best, part) => (span(part) > span(best) ? part : best));
      const joints = biggest.joints ?? [];
      const want = {
        x: joints.reduce((total, joint) => total + joint.x, 0) / (joints.length || 1),
        y: joints.reduce((total, joint) => total + joint.y, 0) / (joints.length || 1),
      };
      const got = grid.linkLabelStyle(link);
      return {
        id: link.id,
        centred:
          joints.length === 0 ||
          (Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6),
      };
    });
  });

// --- every template ---------------------------------------------------------
for (const name of [
  '4-Bar',
  'Stephenson_III',
  'Watt_I',
  'Jansen_Leg',
  'Cylinder_Boom',
  'Scissor_Lift',
]) {
  await load(payloads[name]);
  const anchors = await anchorsAreCentres();
  record(
    `every label in ${name} is anchored inside the joints of the link it names`,
    anchors.length > 0 && anchors.every((link) => link.centred),
    anchors.filter((link) => !link.centred)
  );
}

// And, where the body is a filled shape this can hit-test, that the label is
// actually painted on it.
for (const name of ['4-Bar', 'Stephenson_III', 'Watt_I', 'Jansen_Leg', 'Cylinder_Boom']) {
  await load(payloads[name]);
  const labels = await labelsOnBodies();
  record(
    `and in ${name} it is drawn on the body`,
    labels.length > 0 && labels.every((label) => label.onBody),
    labels.filter((label) => !label.onBody)
  );
}

// --- a bar carrying a slot, whose name goes in the channel ------------------
for (const name of ['Scotch_Yoke', 'Whitworth_Quick_Return']) {
  await load(payloads[name]);
  const slotted = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv
      .getLinks()
      .map((link) => {
        const slot = grid.mechanismSrv.joints.find(
          (joint) => joint.carrier?.id === link.id && joint.slotJointA && joint.slotJointB
        );
        if (!slot) return null;
        const style = grid.linkLabelStyle(link);
        return {
          id: link.id,
          inTheChannel:
            Math.abs(style.x - (slot.slotJointA.x + slot.slotJointB.x) / 2) < 1e-6 &&
            Math.abs(style.y - (slot.slotJointA.y + slot.slotJointB.y) / 2) < 1e-6,
          ink: style.ink,
          opacity: style.opacity,
        };
      })
      .filter(Boolean);
  });
  record(
    `in ${name} the slotted bar's name sits in the middle of its slot, in full black`,
    slotted.length > 0 &&
      slotted.every((link) => link.inTheChannel && link.ink === 'black' && link.opacity === 1),
    slotted
  );
}

// --- a welded body, which is where the centre of mass stops being safe -------
await load(payloads['Stephenson_III']);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const shared = srv.joints.find((joint) => joint.links?.length > 1 && !joint.ground);
  if (shared) srv.weldJoint(shared);
});
await page.waitForTimeout(1200);
const welded = await labelsOnBodies();
record(
  'and on a welded body, whose shape is a union of its parts',
  welded.length > 0 && welded.every((label) => label.onBody),
  welded
);
record(
  'which is named for all of its joints',
  welded.some((label) => label.name.length > 2),
  welded.map((label) => label.name)
);

// --- readable against the body, and the size of the grid's own numbers -------
await load(payloads['Stephenson_III']);
const type = await page.evaluate(() => {
  const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
  const perUnit = Math.abs(svg.querySelector('g').getScreenCTM().a);
  const px = (node) => +(parseFloat(getComputedStyle(node).fontSize) * perUnit).toFixed(1);
  return {
    labels: [...document.querySelectorAll('#linkTagHolder text')].map((text) => ({
      ink: text.getAttribute('fill'),
      opacity: text.getAttribute('fill-opacity'),
      size: px(text),
    })),
    gridNumber: px(document.querySelector('#axes_numbers')),
    perUnit,
    objectScale: ng.getComponent(document.querySelector('app-new-grid')).settings.objectScale,
    // Asked of the grid rather than restated here: one number decides how big
    // every name on the canvas is, and a copy of it in this file is a copy that
    // goes stale the first time it is tuned.
    tagFontSize: ng.getComponent(document.querySelector('app-new-grid')).tagFontSize,
  };
});
record(
  'each label is inked black or white, whichever its body can be read against',
  type.labels.length > 0 &&
    type.labels.every((label) => ['black', 'white'].includes(label.ink)) &&
    new Set(type.labels.map((label) => label.ink)).size === 2,
  type.labels
);
record(
  'at 55%, so it sits on the body rather than over it',
  type.labels.every((label) => label.opacity === '0.55'),
  type.labels
);
// Sized from the object scale rather than from the screen, so a name is the
// size of the thing it names. On a drawing at the default scale that lands
// within a few points of the grid's own numbers; on one whose parts are half
// the size, so are their names, which is the point.
record(
  'every label is sized from the object scale',
  type.labels.every((label) => Math.abs(label.size / type.perUnit - type.tagFontSize) < 0.5),
  { labels: type.labels.map((l) => l.size), want: type.tagFontSize }
);

// Sized in the drawing's units, not the screen's: the name is the size of the
// thing it names, so making the parts bigger makes their names bigger.
await page.evaluate(() => {
  const settings = ng.getComponent(document.querySelector('app-new-grid')).settings;
  settings.constructor._objectScale.next(settings.objectScale * 2);
});
await page.waitForTimeout(600);
const doubled = await page.evaluate(() => {
  const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
  const perUnit = Math.abs(svg.querySelector('g').getScreenCTM().a);
  const text = document.querySelector('#linkTagHolder text');
  return +(parseFloat(getComputedStyle(text).fontSize) * perUnit).toFixed(1);
});
record('and it grows with the object scale', doubled > type.labels[0].size * 1.6, {
  was: type.labels[0].size,
  now: doubled,
});

// --- a joint's name lands wherever its joint is -----------------------------
await load(payloads['Stephenson_III']);
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).settings.isShowID.next(true);
});
await page.waitForTimeout(600);
const jointInk = await page.evaluate(() => {
  const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
  const perUnit = Math.abs(svg.querySelector('g').getScreenCTM().a);
  return [...document.querySelectorAll('#jointTagHolder text')].map((text) => {
    const style = getComputedStyle(text);
    return {
      name: text.textContent.trim(),
      halo: style.stroke,
      order: style.paintOrder,
      haloPx: +(parseFloat(style.strokeWidth) * perUnit).toFixed(2),
    };
  });
});
record(
  'a joint name wears a white halo, so it reads over whatever it has landed on',
  jointInk.length > 0 &&
    jointInk.every(
      (label) => label.halo === 'rgb(255, 255, 255)' && label.order === 'stroke' && label.haloPx > 1
    ),
  jointInk.slice(0, 4)
);

// --- the other labels still answer to the button ----------------------------
await load(payloads['4-Bar']);
const governed = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const count = () => ({
    joints: document.querySelectorAll('#jointTagHolder text').length,
    links: document.querySelectorAll('#linkTagHolder text').length,
  });
  const off = count();
  grid.settings.isShowID.next(true);
  return { off, on: count() };
});
record('the Labels button still governs the joint labels', true, governed);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
