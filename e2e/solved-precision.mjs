/** Full-precision samples survive playback, URL reload and real drags. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const out = resolve('artifacts/solved-precision');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [],
  checks = [];
let filming = false;
page.on('framenavigated', (frame) => {
  if (filming && frame === page.mainFrame()) errors.push('Unexpected navigation during filmstrip');
});
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('crash', () => errors.push('Page crashed'));
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};
const film = (name) => {
  const dir = resolve(out, name);
  if (!dir.startsWith(out + sep)) throw new Error('Film directory must stay inside task artifacts');
  return filmstrip(page, dir);
};
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const fixtureUrl = (name) => {
  const row = gallery.split('\n').find((line) => line.startsWith(`| [${name}](`));
  if (!row) throw new Error(`Missing published fixture ${name}`);
  return `${base}/?${row.split('](')[1].split(')')[0].split('?')[1]}`;
};
const state = () =>
  page.evaluate(() => {
    const service = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const mechanism = service.mechanisms[0];
    const first = mechanism.joints[0];
    const span = Math.hypot(first[1].x - first[0].x, first[1].y - first[0].y);
    let drift = 0,
      massChange = 0;
    for (const [i, frame] of mechanism.joints.entries()) {
      drift = Math.max(
        drift,
        Math.abs(Math.hypot(frame[1].x - frame[0].x, frame[1].y - frame[0].y) - span)
      );
      massChange = Math.max(
        massChange,
        Math.abs(mechanism.links[i][0].massMoI - mechanism.links[0][0].massMoI)
      );
    }
    return {
      samples: mechanism.joints.length,
      valid: mechanism.isMechanismValid(),
      drift,
      massChange,
      span,
      time: service.secondsOf(0),
      pose: service.joints.map((j) => [j.id, j.x, j.y]),
    };
  });

try {
  for (const name of ['Structural held crank', 'Structural dynamic eccentric crank']) {
    await openMechanism(page, fixtureUrl(name));
    const original = await state();
    check(
      `${name}: precise full cycle and authoritative inertia`,
      original.samples === 361 && original.drift < 1e-9 && original.massChange === 0,
      original
    );
    const url = await page.evaluate(() =>
      window.ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
    );
    await openMechanism(page, `${base}/?${url}`);
    const restored = await state();
    check(
      `${name}: URL reload regenerates the same drawing`,
      JSON.stringify(restored) === JSON.stringify(original),
      restored
    );
  }
  const playback = film('playback');
  const before = await state();
  filming = true;
  await playback.shot('before');
  await playback.during(90, 9, 'playing', async () => {
    await page.locator('.playButton').click();
    await page.waitForTimeout(950);
    await page.locator('.playButton').click();
  });
  await playback.shot('paused');
  const after = await state();
  filming = false;
  check(
    'playback advances and leaves precise samples intact',
    after.time > before.time &&
      JSON.stringify(after.pose) !== JSON.stringify(before.pose) &&
      after.drift < 1e-9 &&
      after.massChange === 0,
    after
  );

  for (const posed of [false, true]) {
    await openMechanism(page, `${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
    await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
    if (posed)
      await page.evaluate(() => {
        const service = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
        service.seekMechanism(0, service.mechanisms[0].cyclePeriod / 3);
      });
    await page.getByRole('button', { name: 'Fit to view' }).click();
    await page.waitForTimeout(700);
    const grab = await page.evaluate(() => {
      const joint = [...document.querySelectorAll('#jointHolder > svg')].find((el) =>
        el.querySelector('#joint_B')
      );
      if (!joint) throw new Error('Joint B missing');
      const box = joint.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    const start = await state();
    await page.mouse.click(grab.x, grab.y);
    await page.waitForTimeout(250);
    const drag = film(posed ? 'posed-drag' : 'start-drag');
    filming = true;
    await drag.shot('before');
    await drag.during(75, 10, 'dragging', async () => {
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(grab.x + i * 4, grab.y - i * 3);
        await page.waitForTimeout(60);
      }
      await page.mouse.up();
      await page.waitForTimeout(500);
    });
    await drag.shot('settled');
    const end = await state();
    filming = false;
    check(
      `${posed ? 'Paused-pose' : 'Start-pose'} drag commits a valid precise mechanism`,
      end.valid && end.drift < 1e-8 && Math.abs(end.span - start.span) > 0.01,
      { start, end }
    );
  }
  check('no browser errors or crashes', errors.length === 0, errors);
  for (const name of ['playback', 'start-drag', 'posed-drag'])
    await contactSheet(`${out}/${name}/*.png`, `${out}/${name}.png`, 3, 0.5);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2) + '\n');
  await browser.close();
}
if (checks.some((item) => !item.ok) || errors.length) process.exitCode = 1;
