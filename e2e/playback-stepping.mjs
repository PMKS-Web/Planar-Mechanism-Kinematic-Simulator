/**
 * The arrow keys, held down until the cycle comes round.
 *
 * A step used to be asked for in units of the input's *travel* -- the thing a
 * machine's own handle measures -- and travel stops changing at each end of a
 * ram's stroke. So a step of one frame's worth of it asked for a place past the
 * end of the stroke, got the end of the stroke back, and the key stopped
 * working: `Cylinder_Boom` and `Backhoe_Bucket` would not move at all, and
 * `Cylinder_Gripper` and `Chebyshev_Straight_Line` managed a couple of frames
 * first. A crank, whose travel never turns round, walked its whole cycle and
 * then stuck against the end because the position was clamped rather than
 * wrapped.
 *
 * A frame is a unit of time, so that is what a step is measured in now, and the
 * cycle is a loop, so it wraps. Both directions, every template.
 *
 * The keys are pressed for real once, to prove the binding; the sweep dispatches
 * the same event from inside the page, which is worth the note -- it is the
 * difference between a test that takes a minute and one that takes twenty. The
 * two were checked against each other on `4-Bar` and `Cylinder_Boom` and give
 * identical step sequences.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/playback-stepping.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { readFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const SRC = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const idList = (name) =>
  [
    ...(SRC.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(
      /'([^']+)'/g
    ),
  ].map((m) => m[1]);
const TEMPLATE_IDS = [...idList('BUILT_IN_TEMPLATE_IDS'), ...idList('LIBRARY_TEMPLATE_IDS')];
const payloads = Object.fromEntries(
  [...SRC.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);
if (!TEMPLATE_IDS.length) {
  console.error('Could not parse templates from source.');
  process.exit(2);
}

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const step = () =>
  page.evaluate(
    () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanismTimeStep
  );

/** Open a template and stand in Kinematic, where the transport lives. */
const openInKinematic = async (id) => {
  await page.goto(`${BASE}/?${payloads[id]}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(400);
  await page.keyboard.press('3');
  await page.waitForTimeout(800);
};

/** Press an arrow `count` times from inside the page, reading the step each time. */
const sweep = (key, count) =>
  page.evaluate(
    ([k, n]) => {
      const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const steps = [mech.mechanismTimeStep];
      for (let i = 0; i < n; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        steps.push(mech.mechanismTimeStep);
      }
      return { steps, samples: mech.mechanisms[0]?.joints.length ?? 0 };
    },
    [key, count]
  );

// --- The binding, pressed for real ------------------------------------------
await openInKinematic('Cylinder_Boom');
const before = await step();
const walked = [];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('ArrowRight');
  walked.push(await step());
}
record(
  'a real Right press moves a ram one frame at a time',
  walked.every((value, index) => value === before + index + 1),
  { before, walked }
);
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
record('and a real Left press brings it back', (await step()) === before, {
  before,
  now: await step(),
});

await page.keyboard.press('ArrowLeft');
const wrapped = await step();
record('stepping back off the start wraps round to the end', wrapped > 300, {
  from: before,
  wrapped,
});

// --- Every template, both directions ----------------------------------------
for (const id of TEMPLATE_IDS) {
  if (!payloads[id]) continue;
  await openInKinematic(id);
  const { samples } = await sweep('ArrowRight', 0);
  if (samples <= 1) continue;

  // One press per frame of the cycle: a full lap. Three things have to hold --
  // no press leaves the mechanism where it was, every frame is reached, and the
  // walk goes round the end rather than stopping against it.
  //
  // Not "ends exactly where it began": the frame count the transport steps by
  // belongs to the master machine, and a drawing holding two machines of
  // different lengths is a frame out over a lap. That is an off-by-one about
  // whose cycle is being counted, not about whether the key works.
  const lap = (steps, forwards) => {
    const stalled = steps.findIndex((value, index) => index > 0 && value === steps[index - 1]);
    const wrapped = steps.some((value, index) =>
      index === 0 ? false : forwards ? value < steps[index - 1] : value > steps[index - 1]
    );
    return {
      ok: stalled === -1 && new Set(steps).size === samples && wrapped,
      detail: { samples, reached: new Set(steps).size, stalledAtPress: stalled, wrapped },
    };
  };

  const forward = lap((await sweep('ArrowRight', samples)).steps, true);
  record(
    `${id}: Right walks all ${samples} frames and comes back round`,
    forward.ok,
    forward.detail
  );

  const backward = lap((await sweep('ArrowLeft', samples)).steps, false);
  record(`${id}: Left walks them the other way`, backward.ok, backward.detail);
}

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
