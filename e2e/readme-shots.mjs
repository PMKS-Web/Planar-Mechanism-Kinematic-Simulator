/**
 * The pictures in the README, regenerated from the running app.
 *
 * A README screenshot goes stale the moment the chrome moves, and the only
 * defence is to make retaking it cheap. Every image the README embeds is
 * listed here as a template payload plus a short script of things to do
 * before the shutter, so the whole set is one command:
 *
 *   PMKS_BASE_URL=http://127.0.0.1:4200 node e2e/readme-shots.mjs
 *
 * Output goes to `docs/images/readme/` — tracked, unlike `artifacts/`, because
 * the README has to be able to reach them from GitHub.
 *
 * One picture is the exception. The library dialog offers a development-only
 * category, so `templates` must be taken against a **production** bundle or the
 * card counts in it disagree with the README:
 *
 *   npm run build && (cd dist/pmksweb && python3 -m http.server 4413)
 *   ONLY=templates PMKS_BASE_URL=http://127.0.0.1:4413 node e2e/readme-shots.mjs
 *
 * Every other picture drives the app through `window.ng`, which only a
 * development build exposes.
 */

import { readFileSync, mkdirSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'docs/images/readme';

const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [
    id,
    p.replace(/\\\\/g, '\\'),
  ])
);

/** One picture: what to open, what to do, and where to point the camera. */
const SHOTS = [
  {
    name: 'hero',
    template: 'Jansen_Leg',
    width: 1600,
    height: 950,
    steps: [
      ['tab', 'Kinematic'],
      ['traces'],
      ['play', 2200],
      ['selectJoint', 'F'],
      ['expandGraphs', 1],
      ['resetView'],
      ['park'],
    ],
  },
  {
    name: 'interface-map',
    template: '4-Bar',
    width: 1500,
    height: 950,
    steps: [
      ['tab', 'Kinematic'],
      ['selectJoint', 'B'],
      ['click', '.iconButton'],
      ['clickText', 'Settings'],
      ['wait', 1200],
      ['park'],
      ['annotate'],
    ],
  },
  {
    name: 'edit-panel',
    template: 'Loader_Bucket',
    steps: [
      ['tab', 'Edit'],
      ['selectJoint', 'B'],
    ],
  },
  {
    name: 'kinematic-analysis',
    template: 'Whitworth_Quick_Return',
    width: 1500,
    height: 1050,
    steps: [
      ['tab', 'Kinematic'],
      ['play', 1500],
      ['selectJoint', 'D'],
      ['expandGraphs', 3],
      ['resetView'],
      ['park'],
      ['wait', 1000],
    ],
  },
  {
    name: 'force-analysis',
    template: 'Toggle_Clamp',
    width: 1500,
    height: 1050,
    steps: [
      ['tab', 'Force'],
      ['play', 1400],
      ['selectJoint', 'P'],
      ['expandGraphs', 2],
      ['resetView'],
      ['park'],
      ['wait', 1000],
    ],
  },
  {
    name: 'templates',
    template: 'empty',
    width: 1500,
    height: 1050,
    steps: [
      ['click', '.iconButton'],
      ['click', '#templatesButton'],
      ['wait', 1200],
      ['clickText', 'Start Here'],
      ['park'],
      ['wait', 900],
    ],
  },
  {
    name: 'multi-machine',
    template: 'Three_Machines',
    steps: [
      ['tab', 'Kinematic'],
      ['traces'],
      ['play', 2600],
      ['click', '.syncToggle'],
      ['resetView'],
      ['park'],
    ],
  },
  {
    name: 'readiness',
    template: '4-Bar',
    steps: [['tab', 'Force'], ['park'], ['wait', 1400]],
  },
  {
    name: 'export',
    template: '4-Bar',
    steps: [['tab', 'Kinematic'], ['clickText', 'Export Data'], ['park'], ['wait', 1600]],
  },
  {
    name: 'synthesis',
    template: 'empty',
    width: 1500,
    height: 1050,
    steps: [
      ['tab', 'Synthesis'],
      ['click', '.kindCard--on'],
      ['poses'],
      ['resetView'],
      ['generate'],
      ['park'],
    ],
  },
  {
    name: 'cylinders',
    template: 'Backhoe_Bucket',
    steps: [
      ['tab', 'Kinematic'],
      ['play', 1800],
      ['selectLink', 'DGH'],
      ['expandGraphs', 1],
      ['resetView'],
      ['park'],
    ],
  },
];

/**
 * Label the app's regions on top of a live screenshot.
 *
 * The positions are *measured*, never written down: each region is found by the
 * selector it already carries, and the pill is placed against the edge named
 * here. A card that moves therefore takes its label with it, which is the whole
 * reason the map is generated rather than drawn once in an image editor.
 */
const REGIONS = [
  { n: 1, name: 'Top strip', selector: '.topStrip', side: 'below', nudge: [620, 16] },
  { n: 2, name: 'Mode panel', selector: 'app-left-tabs .panel', side: 'right', nudge: [16, 0] },
  { n: 3, name: 'Canvas', selector: 'app-new-grid svg', side: 'center', nudge: [-190, 250] },
  { n: 4, name: 'Playback', selector: '.transportCard,.scrubCard', side: 'above', nudge: [0, -14] },
  {
    n: 5,
    name: 'View controls',
    selector: 'app-view-controls .viewControls',
    side: 'above',
    nudge: [0, -14],
  },
  { n: 6, name: 'Status strip', selector: '#bottomBar', side: 'above-left', nudge: [12, -14] },
  { n: 7, name: 'Right drawer', selector: '#rightPanel', side: 'left', nudge: [-18, -250] },
];

async function annotate(page) {
  await page.evaluate((regions) => {
    const INK = '#c2410c';
    const layer = document.createElement('div');
    layer.style.cssText =
      'position:fixed;inset:0;z-index:99999;pointer-events:none;' +
      "font:600 15px/1 -apple-system,'Segoe UI',system-ui,sans-serif";
    document.body.appendChild(layer);
    const placed = [];

    for (const region of regions) {
      // A region can be two cards side by side (the transport and the scrubber);
      // outline what they occupy together rather than boxing each one.
      const nodes = [...document.querySelectorAll(region.selector)].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 4 && box.height > 4;
      });
      if (!nodes.length) continue;
      const boxes = nodes.map((node) => node.getBoundingClientRect());
      const rect = {
        left: Math.min(...boxes.map((b) => b.left)),
        top: Math.min(...boxes.map((b) => b.top)),
        right: Math.max(...boxes.map((b) => b.right)),
        bottom: Math.max(...boxes.map((b) => b.bottom)),
      };
      // The canvas is the whole window; outlining it would draw a box round
      // everything else as well, so it gets a label and no outline.
      if (region.side !== 'center') {
        const outline = document.createElement('div');
        outline.style.cssText =
          `position:fixed;left:${rect.left - 3}px;top:${rect.top - 3}px;` +
          `width:${rect.right - rect.left + 6}px;height:${rect.bottom - rect.top + 6}px;` +
          `border:2px dashed ${INK};border-radius:14px;box-shadow:0 0 0 3px rgba(255,255,255,.55)`;
        layer.appendChild(outline);
      }

      const pill = document.createElement('div');
      pill.style.cssText =
        'position:fixed;display:flex;align-items:center;gap:7px;padding:5px 11px 5px 5px;' +
        `background:${INK};color:#fff;border-radius:999px;white-space:nowrap;` +
        'box-shadow:0 2px 8px rgba(0,0,0,.28)';
      pill.innerHTML =
        `<span style="display:inline-flex;align-items:center;justify-content:center;` +
        `width:21px;height:21px;border-radius:50%;background:#fff;color:${INK};font-size:13px">` +
        `${region.n}</span>${region.name}`;
      layer.appendChild(pill);

      const size = pill.getBoundingClientRect();
      const midX = (rect.left + rect.right) / 2 - size.width / 2;
      const midY = (rect.top + rect.bottom) / 2 - size.height / 2;
      const place = {
        below: [rect.left, rect.bottom],
        above: [midX, rect.top - size.height],
        'above-left': [rect.left, rect.top - size.height],
        left: [rect.left - size.width, midY],
        right: [rect.right, midY],
        center: [midX, midY],
      }[region.side];
      let x = place[0] + region.nudge[0];
      let y = place[1] + region.nudge[1];
      // Nudges are chosen by eye against today's layout; this is the safety net
      // for the day one of them stops being clear of its neighbour.
      const hits = (a, b) =>
        a.x < b.x + b.w + 6 &&
        a.x + size.width + 6 > b.x &&
        a.y < b.y + b.h + 6 &&
        a.y + size.height + 6 > b.y;
      while (placed.some((other) => hits({ x, y }, other))) y += size.height + 8;
      placed.push({ x, y, w: size.width, h: size.height });
      pill.style.left = `${x}px`;
      pill.style.top = `${y}px`;
    }
  }, REGIONS);
  await page.waitForTimeout(300);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];

// `ONLY=templates,hero` retakes part of the set -- the library card counts
// differ between a development and a production build, so that one picture is
// taken against a production bundle while the rest need the dev build's
// `window.ng`.
const only = process.env.ONLY?.split(',').map((name) => name.trim());

for (const shot of SHOTS) {
  if (only && !only.includes(shot.name)) continue;
  const context = await browser.newContext({
    viewport: { width: shot.width ?? 1500, height: shot.height ?? 950 },
    // Enough for a retina reader without a multi-megabyte file in the repo.
    deviceScaleFactor: 1.2,
  });
  // The tutorial card is offered to a first-time reader and would otherwise sit
  // over the panel in every picture.
  await context.addInitScript(() => localStorage.setItem('tutorialSeen', 'true'));
  const page = await context.newPage();
  const payload = payloads[shot.template] ?? (shot.template === 'empty' ? '' : shot.template);
  if (shot.template !== 'empty' && !payloads[shot.template] && !payload) {
    failures.push(`${shot.name}: no payload named ${shot.template}`);
  }
  await page.goto(`${BASE}/${payload ? '?' + payload : ''}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(700);

  try {
    for (const [verb, argument] of shot.steps) {
      if (verb === 'tab')
        await page.locator('.tabButton', { hasText: argument }).first().click({ force: true });
      else if (verb === 'click') await page.locator(argument).first().click({ force: true });
      else if (verb === 'clickText')
        await page.getByText(argument, { exact: false }).first().click({ force: true });
      else if (verb === 'wait') await page.waitForTimeout(Number(argument));
      else if (verb === 'traces')
        await page.evaluate(() => {
          const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
          grid.mechanismSrv.joints.forEach((joint) => (joint.showCurve = true));
        });
      else if (verb === 'park') await page.mouse.move(10, 700);
      else if (verb === 'annotate') await annotate(page);
      else if (verb === 'generate') {
        await page.locator('#synthesisPanel .cta').click({ force: true });
        await page.waitForFunction(
          () =>
            !window.ng.getComponent(document.querySelector('app-synthesis-panel')).solution
              .generating,
          null,
          { timeout: 30000 }
        );
        await page.waitForTimeout(800);
      } else if (verb === 'poses')
        await page.evaluate(() => {
          const panel = window.ng.getComponent(document.querySelector('app-synthesis-panel'));
          panel.design.applyDecoded({
            length: 1000,
            reference: 'CENTER',
            endsOnly: true,
            allowDefect: false,
            constrain: false,
            stage: 'working',
            poses: [
              { at: { x: 0, y: 0 }, thetaDegrees: 0 },
              { at: { x: 800, y: 400 }, thetaDegrees: 25 },
              { at: { x: 1400, y: 1400 }, thetaDegrees: 50 },
            ],
          });
        });
      else if (verb === 'expandGraphs') {
        const headers = page.locator('.graphHeader');
        const count = Math.min(await headers.count(), Number(argument) || 3);
        for (let index = 0; index < count; index += 1)
          await headers.nth(index).click({ force: true });
      } else if (verb === 'resetView')
        await page.locator('app-view-controls button').last().click({ force: true });
      else if (verb === 'scrub')
        await page.evaluate((fraction) => {
          const host = document.querySelector('app-new-grid');
          const grid = window.ng.getComponent(host);
          grid.mechanismSrv.animate(Number(fraction), false);
        }, argument);
      else if (verb === 'selectLink')
        await page.evaluate((id) => {
          const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
          const link = grid.mechanismSrv.links.find((candidate) => candidate.id === id);
          if (link) grid.activeObjService.updateSelectedObj(link);
        }, argument);
      else if (verb === 'selectJoint')
        await page.evaluate((id) => {
          const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
          const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === id);
          if (joint) grid.activeObjService.updateSelectedObj(joint);
        }, argument);
      else if (verb === 'play') {
        await page.locator('.playButton').first().click({ force: true });
        await page.waitForTimeout(Number(argument));
        await page.locator('.playButton').first().click({ force: true });
      } else if (verb === 'drawPartial')
        await page.evaluate(() => {
          const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
          grid.mechanismSrv.createRealLink?.();
        });
      await page.waitForTimeout(400);
    }
  } catch (error) {
    failures.push(`${shot.name}: ${String(error).split('\n')[0]}`);
  }

  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`${OUT}/${shot.name}.png`);
  await context.close();
}

await browser.close();
if (failures.length) {
  console.log('\nsteps that did not run:');
  for (const failure of failures) console.log('  ' + failure);
}
